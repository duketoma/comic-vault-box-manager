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
    roleName: i === 0 ? 'Writer' : i === 1 ? 'Penciler' : 'Inker',
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
    coverImage: 'NoImage.png',
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

    // The sticky top header should be visible with comic title & issue number
    const stickyHeader = page.locator('div').filter({ hasText: /The Avengers\s*#400/ }).first();
    await expect(stickyHeader).toBeVisible();

    // Verify the modal does not exceed viewport boundaries
    const viewportSize = page.viewportSize();
    expect(viewportSize).not.toBeNull();
    const modalBox = await page.locator('.max-h-\\[92vh\\]').boundingBox();
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
    const editValuesButton = page.getByRole('button', { name: /Edit Values/i });
    await expect(editValuesButton).toBeVisible();
    await editValuesButton.click();

    // In edit mode:
    // 1. Top sticky header should show "Cancel" and "Save"
    const topHeader = page.locator('.border-b.bg-white\\/95, .border-b.dark\\:bg-slate-900\\/95').first();
    await expect(topHeader.getByRole('button', { name: 'Save' })).toBeVisible();

    // 2. Status & Location header should show "Save Changes" and "Cancel"
    const topSaveButton = page.getByRole('button', { name: 'Save Changes' }).first();
    await expect(topSaveButton).toBeVisible();

    // 3. Top inputs (e.g. Stored Box Location, Reading Status) should be enabled & visible
    const boxSelect = page.locator('select').filter({ hasText: /Box #/ }).first();
    await expect(boxSelect).toBeEnabled();

    // 4. Character appearances section should show count and search bar
    const modal = page.locator('.max-h-\\[92vh\\]');
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
    const stickyFooter = page.locator('.border-t.bg-white\\/95, .border-t.dark\\:bg-slate-900\\/95').last();
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
});
