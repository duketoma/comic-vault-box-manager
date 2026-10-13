import { test, expect } from '@playwright/test';
import { ComicBook } from '../src/types';

test.describe('Comic Issue Ordering within Title', () => {
  const testComics: ComicBook[] = [
    {
      id: 'test-sm-300',
      title: 'The Amazing Spider-Man',
      issueNumber: '300',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1988,
      genre: 'Superhero',
      writer: 'David Michelinie',
      artist: 'Todd McFarlane',
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Near Mint',
      tags: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    },
    {
      id: 'test-sm-10',
      title: 'The Amazing Spider-Man',
      issueNumber: '10',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1964,
      genre: 'Superhero',
      writer: 'Stan Lee',
      artist: 'Steve Ditko',
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Near Mint',
      tags: [],
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z'
    },
    {
      id: 'test-sm-2',
      title: 'The Amazing Spider-Man',
      issueNumber: '2',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1963,
      genre: 'Superhero',
      writer: 'Stan Lee',
      artist: 'Steve Ditko',
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Near Mint',
      tags: [],
      createdAt: '2025-01-03T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z'
    },
    {
      id: 'test-sm-1',
      title: 'The Amazing Spider-Man',
      issueNumber: '1',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1963,
      genre: 'Superhero',
      writer: 'Stan Lee',
      artist: 'Steve Ditko',
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Near Mint',
      tags: [],
      createdAt: '2025-01-04T00:00:00.000Z',
      updatedAt: '2025-01-04T00:00:00.000Z'
    },
  ];

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/collection*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: testComics,
          boxes: [
            { id: 1, name: 'Box 1', capacity: 300, currentCount: 4, boxNumber: 1 },
          ],
          seriesTotals: [],
          creatorTypes: [],
        }),
      });
    });
  });

  test('Catalog View orders comics of the same title by issue number', async ({ page }) => {
    // Seed localStorage with test comics
    await page.addInitScript((comics) => {
      window.localStorage.setItem('comic_vault_comics', JSON.stringify(comics));
    }, testComics);

    await page.goto('/');

    // Wait for the app and catalog to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Ensure we are on Catalog View
    const catalogTab = page.getByRole('button', { name: /Catalog/i });
    await catalogTab.click();

    // Filter to The Amazing Spider-Man using navbar search input
    const searchInput = page.getByPlaceholder(/Search title, writer/i);
    await searchInput.fill('Amazing Spider-Man');

    // Wait for comics to be rendered
    const comicHeadings = page.locator('h3').filter({ hasText: /The Amazing Spider-Man/i });
    await expect(comicHeadings.first()).toBeVisible({ timeout: 10000 });

    // Collect all issue badge texts in order (e.g. '#1', '#2', '#10', '#300')
    const issueBadges = page.locator('span.font-extrabold').filter({ hasText: /^#\d+/ });
    const issueTexts = await issueBadges.allTextContents();
    console.log('Catalog View Order:', issueTexts);

    expect(issueTexts).toEqual(['#1', '#2', '#10', '#300']);
  });

  test('Storage Boxes screen orders comics inside a box by title and issue number', async ({ page }) => {
    // Seed localStorage with test comics inside Box 1
    await page.addInitScript((comics) => {
      window.localStorage.setItem('comic_vault_comics', JSON.stringify(comics));
    }, testComics);

    await page.goto('/');

    // Navigate to Storage Boxes tab
    const boxesTab = page.getByRole('button', { name: /Boxes/i }).or(page.getByRole('button', { name: /Storage/i }));
    await boxesTab.click();

    // Wait for Box 1 to be active or click Box 1
    const box1Card = page.locator('text=Box #1').first();
    await expect(box1Card).toBeVisible({ timeout: 10000 });
    await box1Card.click();

    // Verify the comic items inside Box 1
    const comicItems = page.locator('h5').filter({ hasText: /The Amazing Spider-Man/i });
    await expect(comicItems.first()).toBeVisible({ timeout: 10000 });

    const itemTexts = await comicItems.allTextContents();
    console.log('Storage Boxes inside items order:', itemTexts);

    // Verify ordering inside Box 1: #1, #2, #10, #300
    const idx1 = itemTexts.findIndex((t) => t.includes('#1') && !t.includes('#10'));
    const idx2 = itemTexts.findIndex((t) => t.includes('#2'));
    const idx10 = itemTexts.findIndex((t) => t.includes('#10'));
    const idx300 = itemTexts.findIndex((t) => t.includes('#300'));

    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThan(idx1);
    expect(idx10).toBeGreaterThan(idx2);
    expect(idx300).toBeGreaterThan(idx10);
  });
});
