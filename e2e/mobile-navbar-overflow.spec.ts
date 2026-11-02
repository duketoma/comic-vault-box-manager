import { test, expect } from '@playwright/test';

test.describe('Mobile Navbar Reorganization & Inline Search', () => {
  test('Desktop layout retains visible quick action buttons and hides three-dot menu', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Verify desktop quick action buttons are visible
    await expect(page.getByRole('button', { name: 'Market Values' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Drive Covers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cover Scanner' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Comic' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Style Studio' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Toggle dark mode' })).toBeVisible();

    // Verify three-dot menu button is hidden on desktop
    await expect(page.getByRole('button', { name: 'More options' })).toBeHidden();

    // Verify search bar is visible
    const searchInput = page.getByPlaceholder(/Search title, writer, artist/i);
    await expect(searchInput).toBeVisible();
  });

  test('Mobile layout hides top bar action icons, displays inline search, and provides all actions in three-dot menu', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Verify search bar is visible inline on mobile with mobile placeholder
    const searchInput = page.getByPlaceholder(/Search collection/i);
    await expect(searchInput).toBeVisible();

    // Verify top-bar quick action buttons are hidden on mobile
    await expect(page.getByRole('button', { name: 'Market Values' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Drive Covers' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Cover Scanner' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add Comic' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Style Studio' })).toBeHidden();

    // Verify three-dot button is visible on mobile
    const moreBtn = page.getByRole('button', { name: 'More options' });
    await expect(moreBtn).toBeVisible();

    // Open three-dot menu
    await moreBtn.click();

    // Verify all 8 menu options exist in the dropdown
    await expect(page.getByRole('button', { name: 'Add Comic' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan Covers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sync Covers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Market Values' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Style Studio' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Switch to (Dark|Light) Mode/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage Collection' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Server Settings' })).toBeVisible();

    // Test clicking Style Studio from the mobile menu
    await page.getByRole('button', { name: 'Style Studio' }).click();

    // Dropdown should close and Style Studio modal should open
    await expect(page.getByRole('heading', { name: /Comic Style & Motion FX Studio/i })).toBeVisible();
    await page.getByRole('button', { name: 'Close Style Studio Modal' }).click();

    // Re-open three-dot menu and test Dark Mode toggle
    await moreBtn.click();
    const isDarkInitial = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
    const themeBtn = page.getByRole('button', { name: /Switch to (Dark|Light) Mode/i });
    await themeBtn.click();

    // Menu should auto-close upon theme toggle
    await expect(page.getByRole('button', { name: 'Manage Collection' })).toBeHidden();
    const isDarkAfter = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
    expect(isDarkAfter).toBe(!isDarkInitial);
  });
});
