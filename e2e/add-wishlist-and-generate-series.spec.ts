import { test, expect } from '@playwright/test';

test.describe('Add Wishlist Comic and Auto-Generate Missing Series Wishlist', () => {
  test('Add Comic modal allows 0 copies and Box 0 for Wishlist comics', async ({ page }) => {
    await page.goto('/');

    // Wait for the app and collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    // Open Add Comic modal
    await page.getByRole('button', { name: 'Add Comic' }).click();

    // Verify modal opened and scope to modal
    const modal = page.locator('.fixed.inset-0').filter({ hasText: 'Add New Comic to Vault' });
    await expect(modal).toBeVisible();

    // Switch to Manual Entry Form
    await modal.getByRole('button', { name: 'Manual Entry Form' }).click();

    // Check reading status dropdown and select 'Wishlist'
    const statusSelect = modal.locator('label:has-text("Reading Status") + select');
    await statusSelect.selectOption('Wishlist');

    // Verify Copies Owned input allows 0 and displays "(0 for Wishlist)" note
    const copiesLabel = modal.locator('label:has-text("Copies Owned (Qty)")');
    await expect(copiesLabel).toContainText('(0 for Wishlist)');

    const copiesInput = modal.locator('label:has-text("Copies Owned (Qty)") + input');
    await expect(copiesInput).toHaveValue('0');

    // Verify Target Storage Box defaults to Box 0
    const boxSelect = modal.locator('label:has-text("Target Storage Box") + select');
    await expect(boxSelect).toHaveValue('0');

    // Fill in required title and issue number
    const uniqueTitle = `Wishlist Hero ${Date.now()}`;
    const titleInput = modal.locator('label:has-text("Comic Title *") + input');
    await titleInput.fill(uniqueTitle);

    const issueInput = modal.locator('label:has-text("Issue # *") + input');
    await issueInput.fill('77');

    // Submit form
    const submitBtn = modal.getByRole('button', { name: /Save Comic to Wishlist/i });
    await submitBtn.click();

    // Modal should close
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Navigate to Catalog View and filter by Wishlist status
    const catalogTab = page.getByRole('button', { name: /Catalog/i });
    await catalogTab.click();

    const catalogStatusSelect = page.locator('label:has-text("Reading Status") + select');
    await catalogStatusSelect.selectOption('Wishlist');

    // Search for the newly added wishlist comic
    const searchInput = page.locator('input[placeholder*="Search title"]');
    await searchInput.fill(uniqueTitle);

    // Verify card is rendered
    const card = page.locator('.grid div.group').first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toContainText(uniqueTitle);
    await expect(card).toContainText('#77');

    // Verify top-right red Wishlist badge with Bookmark icon
    const topRightBadge = card.locator('.absolute.top-2.right-2');
    await expect(topRightBadge).toContainText('Wishlist');
    await expect(topRightBadge).toHaveClass(/bg-rose-900/);
    await expect(topRightBadge.locator('svg.lucide-bookmark')).toBeVisible();

    // Verify no bottom-left status pill exists
    const bottomBar = card.locator('.absolute.bottom-2.left-2.right-2');
    await expect(bottomBar.locator('text=Wishlist')).toHaveCount(0);
  });

  test('Series Run Tracker provides Add Missing to Wishlist button and generates wishlist comics', async ({ page }) => {
    await page.goto('/');

    // Wait for the app and collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    // Navigate to Catalog
    const catalogTab = page.getByRole('button', { name: /Catalog/i });
    await catalogTab.click();

    // Select Captain America (Vol. 1) in the Series Run dropdown
    const seriesSelect = page.locator('label:has-text("Series Run") + select');
    await expect(seriesSelect).toBeVisible();

    const capOption = seriesSelect.locator('option').filter({ hasText: 'Captain America (Vol. 1)' }).first();
    const capValue = await capOption.getAttribute('value');
    if (capValue) {
      await seriesSelect.selectOption(capValue);
    }

    // Verify Series Run Tracker banner is rendered
    const trackerBanner = page.locator('text=Series Run Tracker');
    await expect(trackerBanner).toBeVisible({ timeout: 10000 });

    // Verify "Add Missing to Wishlist" button is visible
    const addMissingBtn = page.getByRole('button', { name: /Add Missing to Wishlist/i });
    await expect(addMissingBtn).toBeVisible();

    // Click "Add Missing to Wishlist" to open GenerateSeriesWishlistModal
    await addMissingBtn.click();

    // Verify Generate Series Wishlist modal opened
    const modalHeader = page.getByRole('heading', { name: 'Generate Series Wishlist' });
    await expect(modalHeader).toBeVisible();

    // Verify projected dates checkbox is present and checked
    const projectDatesCheckbox = page.locator('input[type="checkbox"]');
    await expect(projectDatesCheckbox).toBeChecked();

    // Verify projected dates preview exists
    await expect(page.locator('text=Projected Dates Preview:')).toBeVisible();

    // Verify generate button shows count
    const generateBtn = page.getByRole('button', { name: /Generate \d+ Wishlist Comics/i });
    await expect(generateBtn).toBeVisible();

    // Click generate button
    await generateBtn.click();

    // Verify success banner appears
    await expect(page.locator('text=Successfully generated')).toBeVisible({ timeout: 10000 });

    // Verify modal closes automatically
    await expect(modalHeader).not.toBeVisible({ timeout: 5000 });
  });

  test('Add Comic modal has quick action button to open Auto-Generate Series Wishlist modal', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    // Open Add Comic modal
    await page.getByRole('button', { name: 'Add Comic' }).click();

    // Verify "Auto-Generate Wishlist" button is in the mode switcher
    const autoGenBtn = page.getByRole('button', { name: /Auto-Generate.*Wishlist/i });
    await expect(autoGenBtn).toBeVisible();

    // Click Auto-Generate Wishlist button
    await autoGenBtn.click();

    // Verify GenerateSeriesWishlistModal opened
    await expect(page.getByRole('heading', { name: 'Generate Series Wishlist' })).toBeVisible();

    // Cancel modal
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Generate Series Wishlist' })).not.toBeVisible();
  });
});
