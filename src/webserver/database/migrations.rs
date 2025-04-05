use super::error_highlighting::display_db_error;
use super::Database;
use crate::MIGRATIONS_DIR;
use anyhow;
use anyhow::Context;
use sqlx::migrate::MigrateError;
use sqlx::migrate::Migration;
use sqlx::migrate::Migrator;

pub async fn apply(config: &crate::app_config::AppConfig, db: &Database) -> anyhow::Result<()> {
    let mut dirs = Vec::with_capacity(config.extra_migration_directories.len() + 1);
    dirs.push(config.configuration_directory.join(MIGRATIONS_DIR));
    dirs.extend(config.extra_migration_directories.clone());
    let dirs: Vec<&std::path::PathBuf> = dirs.iter().rev().collect();
    let dirs_len = dirs.len();

    for dir in &dirs {
        if !dir.exists() {
            log::info!(
                "Not applying database migrations from '{}' because it does not exist",
                dir.display()
            );
        } else {
            let migrator = Migrator::new(dir.to_path_buf())
                .await
                .with_context(|| migration_err("preparing the database migration"))?;

            if migrator.migrations.is_empty() {
                if dirs_len == 1 {
                    log::debug!("No migrations found in {}. \
                    You can specify database operations to apply when the server first starts by creating files \
                    in {MIGRATIONS_DIR}/<VERSION>_<DESCRIPTION>.sql \
                    where <VERSION> is a number and <DESCRIPTION> is a short string.", dir.display());
                } else {
                    log::info!(
                        "Not applying database migrations from '{}' because it is empty",
                        dir.display()
                    );
                }
            } else {
                log::debug!("Applying database migrations from '{}'", dir.display());
                _apply(config, db, dir, migrator).await?
            }
        }
    }
    Ok(())
}

pub async fn _apply(
    config: &crate::app_config::AppConfig,
    db: &Database,
    dir: &std::path::PathBuf,
    mut migrator: Migrator,
) -> anyhow::Result<()> {
    log::info!("Found {} migrations:", migrator.migrations.len());
    for m in migrator.iter() {
        log::info!("\t{}", DisplayMigration(m));
    }
    migrator
        .set_ignore_missing(!config.extra_migration_directories.is_empty())
        .run(&db.connection)
        .await
        .map_err(|err| {
            match err {
                MigrateError::Execute(n, source) => {
                    let migration = migrator.iter().find(|&m| m.version == n).unwrap();
                    let source_file = dir.join(format!("{:04}_{}.sql", n, migration.description));
                    display_db_error(&source_file, &migration.sql, source).context(format!(
                        "Failed to apply {} migration {}",
                        db,
                        DisplayMigration(migration)
                    ))
                }
                source => anyhow::Error::new(source),
            }
            .context(format!(
                "Failed to apply database migrations from {MIGRATIONS_DIR:?}"
            ))
        })?;
    Ok(())
}

struct DisplayMigration<'a>(&'a Migration);

impl std::fmt::Display for DisplayMigration<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let Migration {
            version,
            migration_type,
            description,
            ..
        } = &self.0;
        write!(f, "[{version:04}]")?;
        if migration_type != &sqlx::migrate::MigrationType::Simple {
            write!(f, " ({migration_type:?})")?;
        }
        write!(f, " {description}")?;
        Ok(())
    }
}

fn migration_err(operation: &'static str) -> String {
    format!(
        "An error occurred while {operation}.
        The path '{MIGRATIONS_DIR}' has to point to a directory, which contains valid SQL files
        with names using the format '<VERSION>_<DESCRIPTION>.sql',
        where <VERSION> is a positive number, and <DESCRIPTION> is a string.
        The current state of migrations will be stored in a table called _sqlx_migrations."
    )
}
