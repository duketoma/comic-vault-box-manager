import { test, expect } from '@playwright/test';

test.describe('Storage Boxes - Proposed Moves Review', () => {
  const mockComics = [
    {
      id: 'imported-1790007670336-1218',
      title: 'Silver Surfer',
      issueNumber: '1',
      publisher: 'Marvel Comics',
      currentBoxId: 1,
      proposedBoxId: 0,
      readingStatus: 'Unread',
      copiesOwned: 1,
      coverImage: 'NoImage.webp',
      publicationYear: 1968,
      format: 'Single Issue',
      sizeThickness: 1.0,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'imported-1790007670339-1681',
      title: 'The New Mutants Annual',
      issueNumber: '1',
      publisher: 'Marvel Comics',
      currentBoxId: 1,
      proposedBoxId: 0,
      readingStatus: 'Unread',
      copiesOwned: 1,
      coverImage: 'NoImage.webp',
      publicationYear: 1984,
      format: 'Annual',
      sizeThickness: 1.0,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ];

  const mockBoxes = [
    { id: 0, name: 'Unallocated', maxCapacity: 150 },
    { id: 1, name: 'Box 01', maxCapacity: 150 },
  ];

  test('displays proposed moves banner and allows viewing, adjusting, and committing moves', async ({ page }) => {
    // Intercept collection and comics API routes for reliable deterministic testing
    await page.route('**/api/collection*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: mockComics,
          boxes: mockBoxes,
          seriesTotals: [],
        }),
      });
    });

    await page.route(/.*\/api\/comics.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route('**/api/sync', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() || {};
        const mutations = Array.isArray(body.mutations) ? body.mutations : [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            serverTimestamp: new Date().toISOString(),
            isFullSync: false,
            pushedCount: mutations.length,
            comics: [],
            boxes: [],
            seriesTotals: [],
            creatorTypes: [],
            deletedComicIds: [],
            deletedBoxIds: [],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');

    // Wait for the app and collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Showing').first()).toBeVisible({ timeout: 15000 });

    // Navigate to Storage Boxes tab
    const storageBoxesTab = page.getByRole('button', { name: /Storage Boxes/i });
    await expect(storageBoxesTab).toBeVisible();
    await storageBoxesTab.click();

    // Verify Rebalancing Proposal Active banner is visible
    const banner = page.locator('text=Rebalancing Proposal Active');
    await expect(banner).toBeVisible({ timeout: 10000 });

    // Verify View Proposed Moves button is visible in banner
    const bannerViewBtn = page.getByRole('button', { name: /View Proposed Moves/i });
    await expect(bannerViewBtn).toBeVisible();

    // Click "View Proposed Moves" to open the review modal
    await bannerViewBtn.click();

    // Verify ProposedMovesModal is opened
    const modalHeading = page.getByRole('heading', { name: 'Proposed Storage Box Moves' });
    await expect(modalHeading).toBeVisible();

    // Verify summary flow chips and comic items inside the modal
    const modal = page.locator('div.fixed.inset-0').filter({ has: modalHeading });
    await expect(modal).toBeVisible();

    // Verify at least one known proposed comic is displayed (e.g. Silver Surfer or The New Mutants Annual)
    const proposedItem = modal.locator('h4').filter({ hasText: /(Silver Surfer|The New Mutants Annual)/i }).first();
    await expect(proposedItem).toBeVisible();

    // Verify origin box and target box are visible for the item
    await expect(modal.locator('text=Box #1').first()).toBeVisible();

    // Verify destination box select exists
    const destinationSelect = modal.locator('select').first();
    await expect(destinationSelect).toBeVisible();

    // Verify item action buttons: "Keep in Box #1" and "Move"
    const keepInBoxBtn = modal.getByRole('button', { name: /Keep in Box/i }).first();
    await expect(keepInBoxBtn).toBeVisible();

    const singleMoveBtn = modal.getByRole('button', { name: /^Move$/i }).first();
    await expect(singleMoveBtn).toBeVisible();

    // Verify footer batch action buttons
    await expect(modal.getByRole('button', { name: /Discard All/i })).toBeVisible();
    await expect(modal.getByRole('button', { name: /Commit All \d+ Moves/i })).toBeVisible();

    // Test reverting a single item to keep in current box
    const savePromise = page.waitForResponse((res) => res.url().includes('/api/comics') && res.request().method() === 'PUT');
    await keepInBoxBtn.click();
    await savePromise;

    // After reverting 1 of the 2 items, modal badge should show "1 Item"
    await expect(modal.locator('text=1 Item').first()).toBeVisible();

    // Close the modal by clicking "Done"
    const doneBtn = modal.getByRole('button', { name: 'Done' });
    await doneBtn.click();
    await expect(modalHeading).not.toBeVisible();

    // Verify banner now reflects 1 comic item proposed
    await expect(page.locator('text=1 comic item').first()).toBeVisible();

    // Re-open via banner button
    await bannerViewBtn.click();
    await expect(modalHeading).toBeVisible();

    // Close via close (X) button
    const closeBtn = modal.getByRole('button', { name: 'Close modal' });
    await closeBtn.click();
    await expect(modalHeading).not.toBeVisible();
  });
});
