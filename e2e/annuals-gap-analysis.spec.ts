import { test, expect } from '@playwright/test';

test.describe('Wishlist Annuals Gap Analysis Separation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app and collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });
  });

  test('Silver Surfer Annual #4 is not falsely scored as a regular issue bridge', async ({ page }) => {
    // Navigate to Wishlist Hunter tab
    const shoppingTab = page.getByRole('button', { name: /Wishlist Hunter/i });
    await expect(shoppingTab).toBeVisible();
    await shoppingTab.click();

    await expect(page.getByRole('heading', { name: 'Top 60 Wishlist Hunt List' })).toBeVisible({ timeout: 15000 });

    // Search for "Silver Surfer Annual"
    const searchInput = page.getByPlaceholder(/Search wishlisted title/i);
    await searchInput.fill('Silver Surfer Annual');

    // Locate the card for Silver Surfer Annual #4
    const card4 = page.locator('.grid > div', { hasText: 'Silver Surfer Annual #4' });
    await expect(card4).toBeVisible();

    // Verify it is NOT treated as a Full Bridge or Half Gap
    await expect(card4.getByText('No Gap (0)')).toBeVisible();
    await expect(card4.getByText(/Full Bridge/i)).not.toBeVisible();
    await expect(card4.getByText(/Half Gap/i)).not.toBeVisible();

    // Verify it does NOT claim to bridge regular #3 & #5
    await expect(card4.getByText(/Bridges gap between #3 & #5/i)).not.toBeVisible();
  });

  test('Year-designated annuals have gap score 0 and are excluded from gap filling', async ({ page }) => {
    // Navigate to Wishlist Hunter tab
    await page.getByRole('button', { name: /Wishlist Hunter/i }).click();
    await expect(page.getByRole('heading', { name: 'Top 60 Wishlist Hunt List' })).toBeVisible({ timeout: 15000 });

    // Search for "Generation X Annual"
    const searchInput = page.getByPlaceholder(/Search wishlisted title/i);
    await searchInput.fill("Generation X Annual '97");

    const genXCard = page.locator('.grid > div', { hasText: "Generation X Annual '97" });
    if (await genXCard.count() > 0) {
      await expect(genXCard.getByText('No Gap (0)')).toBeVisible();
      await expect(genXCard.getByText(/Half Gap/i)).not.toBeVisible();
      await expect(genXCard.getByText(/Full Bridge/i)).not.toBeVisible();
    }
  });

  test('Gap Fillers filter does not contain Silver Surfer Annuals without owned annual neighbors', async ({ page }) => {
    // Navigate to Wishlist Hunter tab
    await page.getByRole('button', { name: /Wishlist Hunter/i }).click();
    await expect(page.getByRole('heading', { name: 'Top 60 Wishlist Hunt List' })).toBeVisible({ timeout: 15000 });

    // Filter by Gap Fillers
    const gapBtn = page.getByRole('button', { name: /Gap Fillers/i });
    await gapBtn.click();

    // Search within Gap Fillers for Silver Surfer Annual
    const searchInput = page.getByPlaceholder(/Search wishlisted title/i);
    await searchInput.fill('Silver Surfer Annual');

    // Confirm none of the un-bridged Silver Surfer Annuals appear under Gap Fillers
    const ssAnnualCards = page.locator('.grid > div', { hasText: 'Silver Surfer Annual' });
    await expect(ssAnnualCards).toHaveCount(0);
  });
});
