const { test, expect } = require('@playwright/test');

test('smoke test - login page title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Momentra/);
});
