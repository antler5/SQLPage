import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080/';

test('Open documentation', async ({ page }) => {
  await page.goto(BASE);

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/SQLPage.*/);

  // open the submenu
  await page.getByText('Documentation', { exact: true }).first().click();
  await page.getByText('All Components').click();
  const components = ['form', 'map', 'chart', 'button'];
  for (const component of components) {
    await expect(page.getByRole('link', { name: component }).first()).toBeVisible();
  }
});

test('chart', async ({ page }) => {
  await page.goto(BASE + '/documentation.sql?component=chart#component');
  await expect(page.getByText('Loading...')).not.toBeVisible();
  await expect(page.locator('.apexcharts-canvas').first()).toBeVisible();
});

test('map', async ({ page }) => {
  await page.goto(BASE + '/documentation.sql?component=map#component');
  await expect(page.getByText('Loading...')).not.toBeVisible();
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
});

test('form example', async ({ page }) => {
  await page.goto(BASE + '/examples/multistep-form');
  // Single selection matching the value or label
  await page.getByLabel('From').selectOption('Paris');
  await page.getByText('Next').click();
  await page.getByLabel(/\bTo\b/).selectOption('Mexico');
  await page.getByText('Next').click();
  await page.getByLabel('Number of Adults').fill('1');
  await page.getByText('Next').click();
  await page.getByLabel('Passenger 1 (adult)').fill('John Doe');
  await page.getByText('Book the flight').click();
  await expect(page.getByText('John Doe').first()).toBeVisible();
});

test('File upload', async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page.getByText('File uploads').click();
  const my_svg = '<svg><text y="20">Hello World</text></svg>';
  // @ts-ignore
  const buffer = Buffer.from(my_svg);
  await page.getByLabel('Picture').setInputFiles({
    name: 'small.svg',
    mimeType: 'image/svg+xml',
    buffer,
  });
  await page.getByRole('button', { name: 'Upload picture' }).click();
  await expect(page.locator('img[src^=data]').first().getAttribute('src')).resolves.toBe('data:image/svg+xml;base64,' + buffer.toString('base64'));
});

test('Authentication example', async ({ page }) => {
  await page.goto(BASE + '/examples/authentication/login.sql');
  await expect(page.locator('h1', { hasText: 'Authentication' })).toBeVisible();

  const usernameInput = page.getByLabel('Username');
  const passwordInput = page.getByLabel('Password');
  const loginButton = page.getByRole('button', { name: 'Log in' });

  await expect(usernameInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(loginButton).toBeVisible();

  await usernameInput.fill('admin');
  await passwordInput.fill('admin');
  await loginButton.click();

  await expect(page.getByText('You are logged in as admin')).toBeVisible();
});

test('table filtering and sorting', async ({ page }) => {
  await page.goto(BASE + '/documentation.sql?component=table#component');
  await expect(page.getByText('Loading...')).not.toBeVisible();

  // Find the specific table section containing "Table" and "Chart"
  const tableSection = page.locator('.table-responsive', {
    has: page.getByRole('cell', { name: 'Chart' })
  });

  // Test search filtering
  const searchInput = tableSection.getByPlaceholder('Search…');
  await searchInput.fill('chart');
  await expect(tableSection.getByRole('cell', { name: 'Chart' })).toBeVisible();
  await expect(tableSection.getByRole('cell', { name: 'Table' })).not.toBeVisible();

  // Clear search
  await searchInput.clear();

  // Test sorting by name
  await tableSection.getByRole('button', { name: 'name' }).click();
  let names = await tableSection.locator('td.name').allInnerTexts();
  const sortedNames = [...names].sort();
  expect(names).toEqual(sortedNames);

  // Test reverse sorting
  await tableSection.getByRole('button', { name: 'name' }).click();
  names = await tableSection.locator('td.name').allInnerTexts();
  const reverseSortedNames = [...names].sort().reverse();
  expect(names).toEqual(reverseSortedNames);
});