import { test, expect } from '@playwright/test';

test.describe('Swappable Comic UI Themes & Dynamic Motion FX Studio', () => {
  test('Defaults to Modern Vault skin and swaps live between Pulp, Graded Slab Museum, and Neon 2099', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Verify default skin on <html> is 'modern'
    await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'modern');

    // Open Style Studio from Navbar
    const studioBtn = page.getByRole('button', { name: 'Style Studio' });
    await expect(studioBtn).toBeVisible();
    await studioBtn.click();

    await expect(
      page.getByRole('heading', { name: /Comic Style & Motion FX Studio/i })
    ).toBeVisible();

    // Switch to Four-Color Pulp
    await page.getByRole('button', { name: /Four-Color Pulp/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'pulp');

    // Switch to Graded Slab Museum and verify slab header appears in sandbox and catalog
    await page.getByRole('button', { name: /Graded Slab Museum/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'slab');
    await expect(page.getByTestId('sandbox-slab-header')).toBeVisible();

    // Switch to Neon Cyber-Noir
    await page.getByRole('button', { name: /Neon Cyber-Noir/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'neon');

    // Switch back to Graded Slab Museum, close modal, and verify catalog cards show slab headers
    await page.getByRole('button', { name: /Graded Slab Museum/i }).click();
    await page.getByRole('button', { name: 'Close Style Studio Modal' }).click();

    await expect(page.getByTestId('catalog-slab-header').first()).toBeVisible({ timeout: 15000 });

    // Reload page and confirm theme preference persisted in localStorage
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'slab');
  });

  test('Triggers animated Comic Action Burst stamps from Style Studio sandbox and resets to default', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Style Studio' }).click();

    // Trigger POW! stamp
    const powBtn = page.getByRole('button', { name: /POW!/i });
    await expect(powBtn).toBeVisible();
    await powBtn.click();

    const burst = page.getByTestId('comic-action-burst').first();
    await expect(burst).toBeVisible();
    await expect(burst).toContainText('POW!');

    // Reset to Default (Modern Vault)
    const resetBtn = page.getByRole('button', { name: /Reset Default/i });
    await resetBtn.click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'modern');

    // Change Motion Intensity dropdown and click Preview spring button
    const motionSelect = page.getByLabel('Motion Intensity');
    await motionSelect.selectOption('subtle');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'subtle');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('sandbox-spring-preview')).toBeVisible();

    await motionSelect.selectOption('full');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');

    // Close modal and verify tab spring container updates across tab switches
    await page.getByRole('button', { name: 'Close Style Studio Modal' }).click();
    await expect(page.getByTestId('tab-spring-container')).toHaveAttribute('data-motion-mode', 'full');
  });
});
