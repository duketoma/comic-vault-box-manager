import { test, expect } from '@playwright/test';

test.describe('Wishlist In-Store Shopping Priority Feature', () => {
  test('Navbar shows Wishlist Hunter tab with count and navigates to shopping screen', async ({ page }) => {
    await page.goto('/');

    // Wait for the app and collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Verify Wishlist Hunter tab button exists with count
    const shoppingTab = page.getByRole('button', { name: /Wishlist Hunter/i });
    await expect(shoppingTab).toBeVisible({ timeout: 15000 });
    await expect(shoppingTab).toContainText('Wishlist Hunter');

    // Click Wishlist Hunter tab
    await shoppingTab.click();

    // Verify header and banner
    await expect(page.getByRole('heading', { name: 'Top 60 Wishlist Hunt List' })).toBeVisible();
    await expect(page.getByText('In-Store Shopping Priority')).toBeVisible();
    await expect(page.getByText('Bridge Gaps', { exact: true })).toBeVisible();
    await expect(page.getByText('Series Closers', { exact: true })).toBeVisible();
  });

  test('Renders prioritized comics with composite scores, primary driver badges and metric breakdown', async ({ page }) => {
    await page.goto('/');

    // Navigate to Wishlist Hunter tab
    await page.getByRole('button', { name: /Wishlist Hunter/i }).click();
    await expect(page.getByRole('heading', { name: 'Top 60 Wishlist Hunt List' })).toBeVisible({ timeout: 15000 });

    // Verify ranking #1 comic card exists
    const firstCard = page.locator('.grid.grid-cols-1.md\\:grid-cols-2.xl\\:grid-cols-3 > div').first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard).toContainText('#1');
    await expect(firstCard).toContainText('Priority');

    // Verify metric breakdown meters
    await expect(firstCard.getByText('Series Completion:')).toBeVisible();
    await expect(firstCard.getByText('Gap Status:')).toBeVisible();

    // Verify primary reason explanation is present
    await expect(firstCard.getByText(/💡/)).toBeVisible();
  });

  test('Filters by driver (Gap Fillers, Series Closers, Event Issues) and search', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Wishlist Hunter/i }).click();
    await expect(page.getByRole('heading', { name: 'Top 60 Wishlist Hunt List' })).toBeVisible({ timeout: 15000 });

    // Filter by Gap Fillers
    const gapBtn = page.getByRole('button', { name: /Gap Fillers/i });
    await gapBtn.click();

    // Verify cards show gap status (Full Bridge or Half Gap)
    const firstGapCard = page.locator('.grid.grid-cols-1.md\\:grid-cols-2.xl\\:grid-cols-3 > div').first();
    await expect(firstGapCard).toBeVisible();
    await expect(firstGapCard.getByText(/Full Bridge|Half Gap/)).toBeVisible();

    // Search for a specific title (e.g., "Silver Surfer")
    const searchInput = page.getByPlaceholder(/Search wishlisted title/i);
    await searchInput.fill('Silver Surfer');
    await expect(page.locator('text=Silver Surfer').first()).toBeVisible();
  });

  test('Interactive selection and Mark Purchased commits to collection', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Wishlist Hunter/i }).click();
    await expect(page.getByRole('heading', { name: 'Top 60 Wishlist Hunt List' })).toBeVisible({ timeout: 15000 });

    // Check off the first comic
    const firstCard = page.locator('.grid.grid-cols-1.md\\:grid-cols-2.xl\\:grid-cols-3 > div').first();
    const markFoundBtn = firstCard.getByRole('button', { name: /Mark Found/i });
    await markFoundBtn.click();

    // Verify bottom purchase bar updates
    await expect(page.getByText('1 comic checked off')).toBeVisible();
    const purchaseBtn = page.getByRole('button', { name: /Mark Purchased \(1\)/i });
    await expect(purchaseBtn).toBeVisible();
    await expect(purchaseBtn).toBeEnabled();

    // Click Mark Purchased (1)
    await purchaseBtn.click();

    // Verify toast confirmation
    await expect(page.getByText(/Purchased 1 comic/i)).toBeVisible({ timeout: 10000 });
  });
});
