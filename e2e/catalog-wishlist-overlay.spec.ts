import { test, expect } from '@playwright/test';

test.describe('Catalog View - Wishlist Card Overlay Badges', () => {
  test('Wishlist comic cards show top-right red badge with Bookmark icon and no bottom-left status pill', async ({ page }) => {
    await page.goto('/');

    // Wait for the app and collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    // Ensure we are on the Catalog tab
    const catalogTab = page.getByRole('button', { name: /Catalog/i });
    await catalogTab.click();

    // Filter by Wishlist status to isolate wishlist cards
    const statusSelect = page.locator('label:has-text("Reading Status") + select');
    await expect(statusSelect).toBeVisible();
    await statusSelect.selectOption('Wishlist');

    // Wait for grid cards to render
    const card = page.locator('.grid > div.group').first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Verify top-right badge: shows "Wishlist" with rose/red background and Bookmark icon
    const topRightBadge = card.locator('.absolute.top-2.right-2');
    await expect(topRightBadge).toBeVisible();
    await expect(topRightBadge).toContainText('Wishlist');
    await expect(topRightBadge).toHaveClass(/bg-rose-900/);
    await expect(topRightBadge.locator('svg.lucide-bookmark')).toBeVisible();

    // Verify bottom overlay bar: should NOT have any purple badge or any Wishlist pill
    const bottomBar = card.locator('.absolute.bottom-2.left-2.right-2');
    // Ensure there is no element containing "Wishlist" inside the bottom overlay bar
    await expect(bottomBar.locator('text=Wishlist')).toHaveCount(0);
    // Ensure there is no purple badge
    await expect(bottomBar.locator('.bg-purple-50, .dark\\:bg-purple-950\\/80')).toHaveCount(0);

    // Verify exactly ONE "Wishlist" overlay text exists in the entire card cover area
    const coverArea = card.locator('.relative.aspect-\\[2\\/3\\]');
    const wishlistBadgesInCover = coverArea.locator('text=Wishlist');
    await expect(wishlistBadgesInCover).toHaveCount(1);
  });

  test('Owned comic cards show box location at top-right and reading status pill at bottom-left', async ({ page }) => {
    await page.goto('/');

    // Wait for the app and collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    // Ensure we are on the Catalog tab
    const catalogTab = page.getByRole('button', { name: /Catalog/i });
    await catalogTab.click();

    // Filter by Read status
    const statusSelect = page.locator('label:has-text("Reading Status") + select');
    await expect(statusSelect).toBeVisible();
    await statusSelect.selectOption('Read');

    // Wait for grid cards to render
    const card = page.locator('.grid > div.group').first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Verify top-right badge shows Box location and Boxes icon (not Wishlist, not Bookmark)
    const topRightBadge = card.locator('.absolute.top-2.right-2');
    await expect(topRightBadge).toBeVisible();
    await expect(topRightBadge).toContainText(/Box \d+/);
    await expect(topRightBadge.locator('svg.lucide-boxes')).toBeVisible();

    // Verify bottom-left status pill shows "Read"
    const bottomBar = card.locator('.absolute.bottom-2.left-2.right-2');
    const statusPill = bottomBar.locator('span').first();
    await expect(statusPill).toBeVisible();
    await expect(statusPill).toHaveText('Read');
    await expect(statusPill).toHaveClass(/bg-emerald-50/);
  });
});
