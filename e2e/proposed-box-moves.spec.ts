import { test, expect } from '@playwright/test';
import { isTrueProposedMove } from '../src/utils/boxUtils';
import { ComicBook } from '../src/types';

test.describe('Proposed Box Moves Logic and Storage Boxes View', () => {
  test('isTrueProposedMove unit tests', () => {
    // 1. Wishlist comic with proposedBoxId different from currentBoxId must NEVER be a proposed move
    const wishlistComic: Partial<ComicBook> = {
      id: 'w1',
      readingStatus: 'Wishlist',
      currentBoxId: 0,
      proposedBoxId: 3,
    };
    expect(isTrueProposedMove(wishlistComic)).toBe(false);

    const wishlistComicWithCurrentBox: Partial<ComicBook> = {
      id: 'w2',
      readingStatus: 'Wishlist',
      currentBoxId: 1,
      proposedBoxId: 2,
    };
    expect(isTrueProposedMove(wishlistComicWithCurrentBox)).toBe(false);

    // 2. Comic where proposedBoxId is null or undefined is NOT a proposed move
    const comicNullProposed: Partial<ComicBook> = {
      id: 'c1',
      readingStatus: 'Unread',
      currentBoxId: 1,
      proposedBoxId: undefined,
    };
    expect(isTrueProposedMove(comicNullProposed)).toBe(false);

    const comicNullVal: Partial<ComicBook> = {
      id: 'c2',
      readingStatus: 'Read',
      currentBoxId: 1,
      proposedBoxId: null as unknown as number,
    };
    expect(isTrueProposedMove(comicNullVal)).toBe(false);

    // 3. Comic where proposedBoxId equals currentBoxId is NOT a proposed move
    const comicSameBox: Partial<ComicBook> = {
      id: 'c3',
      readingStatus: 'Read',
      currentBoxId: 2,
      proposedBoxId: 2,
    };
    expect(isTrueProposedMove(comicSameBox)).toBe(false);

    // 4. Comic where proposedBoxId is different from currentBoxId and owned IS a true proposed move
    const comicTrueMove: Partial<ComicBook> = {
      id: 'c4',
      readingStatus: 'Unread',
      currentBoxId: 1,
      proposedBoxId: 2,
    };
    expect(isTrueProposedMove(comicTrueMove)).toBe(true);

    // 5. Unallocated owned comic in Box 0 moving to Box 1 IS a true proposed move
    const unallocatedMove: Partial<ComicBook> = {
      id: 'c5',
      readingStatus: 'Unread',
      currentBoxId: 0,
      proposedBoxId: 1,
    };
    expect(isTrueProposedMove(unallocatedMove)).toBe(true);
  });

  test('Storage Boxes screen does not show false pending moves on page load or refresh', async ({ page }) => {
    await page.goto('/');

    // Wait for the app and collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Navigate to Storage Boxes tab
    const storageTab = page.getByRole('button', { name: /Storage Boxes/i });
    await expect(storageTab).toBeVisible({ timeout: 15000 });
    await storageTab.click();

    // Verify Storage Boxes header is visible
    await expect(page.getByRole('heading', { name: /Storage Box Manager/i })).toBeVisible();

    // Crucial check: Ensure the spurious "Apply 2873 Moves" banner does NOT appear
    const applyMovesBtn = page.getByRole('button', { name: /Apply \d+ Moves/i });
    await expect(applyMovesBtn).not.toBeVisible();

    // Reload the page and re-verify
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();
    await page.getByRole('button', { name: /Storage Boxes/i }).click();
    await expect(page.getByRole('heading', { name: /Storage Box Manager/i })).toBeVisible();
    await expect(applyMovesBtn).not.toBeVisible();
  });
});
