import { test, expect } from '@playwright/test';
import { ComicBook } from '../src/types';

test.describe('Comic Detail Modal Large Character & Creator Overflow Handling', () => {
  // Generate 113 characters mimicking Avengers #400
  const manyCharacters = Array.from({ length: 113 }, (_, i) => ({
    id: `char-test-${i + 1}`,
    characterName: i === 0 ? 'Captain America' : i === 1 ? 'Iron Man' : i === 112 ? 'Thor Odinson' : `Hero Number ${i + 1}`,
    appearanceType: i < 5 ? 'Main' : i < 20 ? 'Supporting' : 'Cameo',
  }));

  const manyCreators = Array.from({ length: 12 }, (_, i) => ({
    id: `creator-test-${i + 1}`,
    creatorName: `Creator Person ${i + 1}`,
    roleName: i === 0 ? 'Writer' : i === 1 ? 'Penciller' : 'Inker',
  }));

  const testComicWithManyCharacters: ComicBook = {
    id: 'test-avengers-400',
    title: 'The Avengers',
    issueNumber: '400',
    volume: 'Vol. 1',
    publisher: 'Marvel Comics',
    publicationYear: 1996,
    publicationMonth: 'May',
    genre: 'Superhero',
    writer: 'Creator Person 1',
    artist: 'Creator Person 2',
    coverImage: 'NoImage.webp',
    format: 'Single Issue',
    sizeThickness: 1.0,
    currentBoxId: 1,
    readingStatus: 'Unread',
    readCount: 0,
    condition: 'Near Mint',
    tags: ['anniversary', 'milestone'],
    notes: 'Epic anniversary issue with 113 characters assembling together.',
    creatorContributions: manyCreators,
    characterAppearances: manyCharacters,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  test('Modal fits viewport and controls remain accessible when editing comic with 113 characters', async ({ page }) => {
    // Mock API routes so test data does not persist to local PostgreSQL database
    await page.route('**/api/collection', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: [testComicWithManyCharacters],
          boxes: [{ id: 1, name: 'Box 01', maxCapacity: 150 }],
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

    // Seed localStorage
    await page.addInitScript((comic) => {
      window.localStorage.setItem('comic_vault_comics', JSON.stringify([comic]));
    }, testComicWithManyCharacters);

    await page.goto('/');

    // Verify comic is loaded in catalog view
    const comicHeading = page.getByRole('heading', { name: /The Avengers/i });
    await expect(comicHeading).toBeVisible();

    // Click on the comic card to open ComicDetailModal
    await comicHeading.click();

    // Verify the modal does not exceed viewport boundaries
    const viewportSize = page.viewportSize();
    expect(viewportSize).not.toBeNull();
    const modal = page.locator('.max-h-\\[92vh\\]');
    await expect(modal).toBeVisible();

    // Hero displays consolidated comic title, issue number, and publisher/date pill without a duplicate top header
    await expect(modal.getByRole('heading', { name: /The Avengers\s*#400/i })).toHaveCount(1);
    await expect(modal.getByText(/Marvel Comics • 1996 May/i)).toHaveCount(1);
    await expect(modal.getByText(/Thickness Units/i)).toHaveCount(0);

    // Wait for entrance spring animation to settle before measuring bounding box
    await page.waitForTimeout(550);
    const modalBox = await modal.boundingBox();
    expect(modalBox).not.toBeNull();
    if (modalBox && viewportSize) {
      // Modal should not exceed 95% of viewport height
      expect(modalBox.height).toBeLessThanOrEqual(viewportSize.height * 0.95);
      // Top of modal should be on-screen (not negative / clipped)
      expect(modalBox.y).toBeGreaterThanOrEqual(0);
    }

    // Status & Location Management header should be visible at top
    await expect(page.getByRole('heading', { name: /Status & Location Management/i })).toBeVisible();

    // Click "Edit Values" to switch into edit mode
    const editValuesButton = modal.getByRole('button', { name: /Edit Values/i });
    await expect(editValuesButton).toBeVisible();
    await editValuesButton.click();

    // In edit mode:
    // 1. Bottom sticky footer should show "Cancel" and "Save Changes"
    await expect(modal.getByRole('button', { name: 'Save Changes' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Cancel' })).toBeVisible();

    // 3. Top inputs (e.g. Stored Box Location, Reading Status) should be enabled & visible
    const boxSelect = page.locator('select').filter({ hasText: /Box #/ }).first();
    await expect(boxSelect).toBeEnabled();

    // 4. Character appearances section should show count and search bar
    await expect(modal.getByText('Character Appearances (113)')).toBeVisible();
    const searchInput = modal.getByPlaceholder(/Filter 113 characters/i);
    await expect(searchInput).toBeVisible();

    // Filter characters by typing 'Thor'
    await searchInput.fill('Thor');
    await expect(modal.getByText('Thor Odinson')).toBeVisible();
    await expect(modal.getByText('Captain America')).not.toBeVisible();

    // Clear filter by emptying search input
    await searchInput.fill('');
    await expect(modal.getByText('Captain America')).toBeVisible();

    // 5. Expand / Collapse character appearances toggle
    const expandCharactersBtn = page.getByRole('button', { name: /Show All \(113\)/i });
    await expect(expandCharactersBtn).toBeVisible();

    // 6. Sticky bottom footer should be docked and visible on screen
    const stickyFooter = modal.locator('.border-t.bg-white\\/95, .border-t.dark\\:bg-slate-900\\/95');
    await expect(stickyFooter).toBeVisible();
    await expect(stickyFooter.getByRole('button', { name: /Delete Comic/i })).toBeVisible();
    await expect(stickyFooter.getByRole('button', { name: 'Save Changes' })).toBeVisible();
    await expect(stickyFooter.getByRole('button', { name: 'Close' })).toBeVisible();

    // Make an edit (change Reading Status to 'Read' and Volume to 'Vol. 2')
    const readingStatusSelect = modal.locator('select').filter({ hasText: /Unread/ }).first();
    await readingStatusSelect.selectOption('Read');

    const volumeInput = modal.getByPlaceholder(/e\.g\. Vol\. 1/i);
    await volumeInput.fill('Vol. 2');

    // Click "Save Changes" in the sticky footer
    await stickyFooter.getByRole('button', { name: 'Save Changes' }).click();

    // Should exit edit mode
    await expect(page.getByRole('button', { name: /Edit Values/i })).toBeVisible();

    // Press Escape to close modal
    await page.keyboard.press('Escape');
    await expect(page.locator('.max-h-\\[92vh\\]')).not.toBeVisible();
  });

  test('Comic Detail Modal cleanup: Manage Cover popover, Copies Owned metadata grid, Series Run Progress, and Creator sorting', async ({ page }) => {
    const ghostRiderComic: ComicBook = {
      id: 'test-ghost-rider-26',
      title: 'Ghost Rider',
      seriesName: 'Ghost Rider (Vol. 2) (1990 - 2007)',
      issueNumber: '26',
      volume: 'Vol. 2',
      publisher: 'Marvel Comics',
      publicationYear: 1992,
      publicationMonth: 'April',
      genre: 'Superhero',
      writer: 'Howard Mackie',
      artist: 'Javier Saltares',
      coverImage: 'NoImage.webp',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 2,
      currentBoxId: 1,
      readingStatus: 'Unread',
      readCount: 0,
      condition: 'Near Mint',
      tags: ['90s'],
      event: 'Rise of the Midnight Sons',
      creatorContributions: [
        { id: 'c-ed', creatorName: 'Bobbie Chase', roleName: 'Editor' },
        { id: 'c-col', creatorName: 'Gregory Wright', roleName: 'Colorist' },
        { id: 'c-ink', creatorName: 'Mark Texeira', roleName: 'Inker' },
        { id: 'c-pen', creatorName: 'Javier Saltares', roleName: 'Penciller' },
        { id: 'c-wri', creatorName: 'Howard Mackie', roleName: 'Writer' },
      ],
      characterAppearances: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    await page.route('**/api/collection', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: [ghostRiderComic],
          boxes: [{ id: 1, name: 'Box 01 - Marvel Heroes', maxCapacity: 150 }],
          seriesTotals: [{ seriesName: 'Ghost Rider (Vol. 2) (1990 - 2007)', issueCount: 96 }],
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

    await page.addInitScript((comic) => {
      window.localStorage.setItem('comic_vault_comics', JSON.stringify([comic]));
      window.localStorage.setItem(
        'comic_vault_series_totals',
        JSON.stringify([{ seriesName: 'Ghost Rider (Vol. 2) (1990 - 2007)', issueCount: 96 }])
      );
    }, ghostRiderComic);

    await page.goto('/');

    const card = page.getByRole('heading', { name: /Ghost Rider/i });
    await expect(card).toBeVisible();
    await card.click();

    const modal = page.locator('.max-h-\\[92vh\\]');
    await expect(modal).toBeVisible();

    // 1. Consolidated Hero identity (single title/issue heading & publisher/date pill; no Thickness Units or duplicate Box pill in Hero)
    await expect(modal.getByRole('heading', { name: /Ghost Rider\s*#26/i })).toHaveCount(1);
    await expect(modal.getByText(/Marvel Comics • 1992 April/i)).toHaveCount(1);
    await expect(modal.getByText('Ghost Rider (Vol. 2) (1990 - 2007)')).toBeVisible();
    await expect(modal.getByText(/⚡ Event: Rise of the Midnight Sons/i)).toBeVisible();
    await expect(modal.getByText(/Thickness Units/i)).toHaveCount(0);

    // 2. Series Run Progress omits redundant "% to 100%" footer text
    await expect(modal.getByText(/1 \/ 96 issues \(1%\)/i)).toBeVisible();
    await expect(modal.getByText(/% to 100%/i)).toHaveCount(0);

    // 3. Manage Cover popover toggles cover actions menu with Scan / Crop Cover
    await expect(modal.getByTestId('cover-source-badge')).toBeVisible();
    const manageCoverBtn = modal.getByTestId('manage-cover-btn');
    await expect(manageCoverBtn).toBeVisible();
    await expect(modal.getByTestId('manage-cover-menu')).toHaveCount(0);

    await manageCoverBtn.click();
    const coverMenu = modal.getByTestId('manage-cover-menu');
    await expect(coverMenu).toBeVisible();
    await expect(coverMenu.getByRole('menuitem', { name: /Scan \/ Crop Cover/i })).toBeVisible();

    // Pressing Escape closes only the Manage Cover popover, keeping the modal open
    await page.keyboard.press('Escape');
    await expect(coverMenu).toHaveCount(0);
    await expect(modal).toBeVisible();

    // 4. Creators & Role Contributions orders Writer and Penciller first
    const creatorNames = await modal
      .locator('h4:has-text("Comic Creators & Role Contributions")')
      .locator('..')
      .locator('..')
      .locator('.inline-flex > span:first-child')
      .allTextContents();
    expect(creatorNames).toEqual([
      'Howard Mackie',
      'Javier Saltares',
      'Mark Texeira',
      'Gregory Wright',
      'Bobbie Chase',
    ]);

    // 5. Copies Owned appears in the bottom Metadata Grid in both View and Edit modes
    const metadataGrid = modal.locator('div').filter({ hasText: /^Condition/ }).filter({ hasText: /Est\. Value/ }).first();
    await expect(metadataGrid).toContainText('Copies Owned');
    await expect(metadataGrid).toContainText('2');

    await modal.getByRole('button', { name: /Edit Values/i }).click();
    const copiesInput = modal.getByLabel('Copies Owned');
    await expect(copiesInput).toBeVisible();
    await expect(copiesInput).toHaveValue('2');
    await copiesInput.fill('3');

    await modal.getByRole('button', { name: 'Save Changes' }).click();
    await expect(modal.getByRole('button', { name: /Edit Values/i })).toBeVisible();
    await expect(metadataGrid).toContainText('3');
  });
});
