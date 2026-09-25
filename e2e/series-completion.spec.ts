import { test, expect } from '@playwright/test';

test.describe('Series Collection Completion Tracking', () => {
  test('Navbar shows series run completion badge and navigates to stats', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app and collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Verify Run completion badge in Navbar
    const runBadge = page.locator('button[title*="Series Run Completion"]');
    await expect(runBadge).toBeVisible({ timeout: 15000 });
    await expect(runBadge).toContainText('Runs:');
    await expect(runBadge).toContainText('100%');

    // Click badge to navigate to Series Stats
    await runBadge.click();

    // Verify Reading Stats view is displayed with Series tab active
    await expect(page.getByText('Total Collection')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Series Collection & Run Progress' })).toBeVisible();
    await expect(page.getByText('Full Runs Owned')).toBeVisible();
    await expect(page.getByText('Run Collection Rate')).toBeVisible();
  });

  test('Collection Catalog displays series completion filters and tracker banner', async ({ page }) => {
    await page.goto('/');

    // Wait for comics collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Ensure we are on Collection Catalog
    const catalogTab = page.getByRole('button', { name: /Catalog/i });
    await catalogTab.click();

    // Verify Series Completion filter toolbar
    await expect(page.getByRole('button', { name: /All Runs/i })).toBeVisible({ timeout: 15000 });
    const fullRunsBtn = page.getByRole('button', { name: /100% Full Runs/i });
    await expect(fullRunsBtn).toBeVisible();
    const nearRunsBtn = page.getByRole('button', { name: /Near 100%/i });
    await expect(nearRunsBtn).toBeVisible();
    const inProgressBtn = page.getByRole('button', { name: /In-Progress/i });
    await expect(inProgressBtn).toBeVisible();

    // Click "100% Full Runs" filter
    await fullRunsBtn.click();
    
    // Series dropdown should now be filtered or available
    const seriesSelect = page.locator('select').filter({ hasText: /Series Run/i }).or(page.locator('select').nth(1));
    await expect(seriesSelect).toBeVisible();

    // Select the first complete series from the dropdown
    const options = await seriesSelect.locator('option').allTextContents();
    const completeOption = options.find(opt => opt.includes('100%') || opt.includes('🏆'));
    
    if (completeOption) {
      await seriesSelect.selectOption({ label: completeOption });

      // Verify Series Run Tracker banner is rendered
      const trackerBanner = page.locator('text=Series Run Tracker').or(page.locator('text=Full Run Complete'));
      await expect(trackerBanner.first()).toBeVisible();

      // Verify 100% badge is displayed
      await expect(page.locator('text=100% Complete').or(page.locator('text=Full Run Complete')).first()).toBeVisible();
    }
  });

  test('Reading Stats displays Run Milestones and Series Cards with Issue Matrix', async ({ page }) => {
    await page.goto('/');

    // Navigate to Stats tab
    const statsTab = page.getByRole('button', { name: /Reading & Box Stats/i });
    await statsTab.click();

    await expect(page.getByText('Total Collection')).toBeVisible({ timeout: 15000 });

    // Switch to Series Completion sub-tab
    const seriesTab = page.getByRole('button', { name: /Comic Titles \/ Series Graph/i });
    await expect(seriesTab).toBeVisible();
    await seriesTab.click();
    await expect(page.getByRole('heading', { name: 'Series Collection & Run Progress' })).toBeVisible();
    await expect(page.getByText('Full Runs Owned')).toBeVisible();

    // Verify "View in Catalog" or "Show Run Matrix" button on series cards
    const matrixToggle = page.getByRole('button', { name: /Show Run Matrix/i }).first();
    if (await matrixToggle.isVisible()) {
      await matrixToggle.click();
      await expect(page.getByText('Issue Checklist & Matrix').first()).toBeVisible();
    }

    // Click Achievements sub-tab
    const achievementsTab = page.getByRole('button', { name: /100% Completion Achievements/i });
    await expect(achievementsTab).toBeVisible();
    await achievementsTab.click();
    // Should show Full Run Complete section
    await expect(page.getByText(/Full Run Complete/i).first()).toBeVisible();
  });

  test('Closest to Completion graph only shows series that still have issues remaining', async ({ page }) => {
    await page.goto('/');

    // Navigate to Stats tab
    const statsTab = page.getByRole('button', { name: /Reading & Box Stats/i });
    await statsTab.click();

    // Switch to Series Completion sub-tab
    const seriesTab = page.getByRole('button', { name: /Comic Titles \/ Series Graph/i });
    await seriesTab.click();

    // Select "Closest to Completion (Fewest Remaining)" in the Sort dropdown
    const sortSelect = page.locator('select').filter({ hasText: /Collection Progress/i }).or(
      page.locator('label:has-text("Sort Series By:") + select')
    );
    await sortSelect.selectOption({ label: 'Closest to Completion (Fewest Remaining)' });

    // Verify chart subtitle indicates series with issues remaining
    await expect(page.getByText('Showing top 10 series with issues remaining')).toBeVisible();

    // Verify the first series card in the list has issues needed (not 100% complete)
    const firstSeriesCard = page.locator('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3 > div').first();
    await expect(firstSeriesCard).toBeVisible();
    await expect(firstSeriesCard).toContainText(/issue.*needed to complete run/i);
  });
});
