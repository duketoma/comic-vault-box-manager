import { test, expect } from '@playwright/test';
import { ComicBook } from '../src/types';

test.describe('Google Drive Comic Covers Sync & Matching', () => {
  const testComics: ComicBook[] = [
    {
      id: 'test-comic-spiderman-300',
      title: 'The Amazing Spider-Man',
      issueNumber: '300',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1988,
      genre: 'Superhero',
      writer: 'David Michelinie',
      artist: 'Todd McFarlane',
      coverImage: 'NoImage.png',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Near Mint',
      tags: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'test-comic-xmen-266',
      title: 'Uncanny X-Men',
      issueNumber: '266',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1990,
      genre: 'Superhero',
      writer: 'Chris Claremont',
      artist: 'Jim Lee',
      coverImage: 'NoImage.png',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Near Mint',
      tags: [],
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    },
  ];

  test('Scans Drive covers, stages matches, and clicking Link & Done updates the comics in collection', async ({ page }) => {
    // Mock backend database routes so test is completely deterministic
    await page.route('**/api/collection', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: testComics,
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

    // Intercept Google Drive API calls
    await page.route('**/drive/v3/files*', async (route) => {
      const url = route.request().url();
      if (url.includes('Comic%20Covers') || url.includes('Comic Covers')) {
        // Folder search
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            files: [{ id: 'mock-folder-id', name: 'Comic Covers' }],
          }),
        });
      } else {
        // Files in folder search
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            files: [
              {
                id: 'gdrive-file-spiderman-300-id',
                name: 'The Amazing Spider-Man 300.jpg',
                mimeType: 'image/jpeg',
                thumbnailLink: 'https://lh3.googleusercontent.com/thumbnail-spiderman=s220',
              },
              {
                id: 'gdrive-file-xmen-266-id',
                name: 'Uncanny X-Men 266.jpg',
                mimeType: 'image/jpeg',
                thumbnailLink: 'https://lh3.googleusercontent.com/thumbnail-xmen=s220',
              },
            ],
          }),
        });
      }
    });

    // Seed mock auth and initial comics
    await page.addInitScript((comics) => {
      (window as any).__MOCK_AUTH__ = {
        user: { displayName: 'Vault Collector', email: 'collector@vault.com', photoURL: '' },
        token: 'mock-valid-google-access-token',
      };
      window.localStorage.setItem('comic_vault_comics', JSON.stringify(comics));
    }, testComics);

    await page.goto('/');

    // Verify app loaded
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Verify initial comics have NoImage cover before linking
    const spidermanImg = page.locator('img[alt*="The Amazing Spider-Man"]').first();
    await expect(spidermanImg).toBeVisible();

    // Click "Drive Covers" in the Navbar
    const driveCoversBtn = page.getByRole('button', { name: /Drive Covers/i });
    await expect(driveCoversBtn).toBeVisible();
    await driveCoversBtn.click();

    // Modal should be open
    await expect(page.getByRole('heading', { name: /Google Drive "Comic Covers" Integration/i })).toBeVisible();

    // Verify folder is found
    await expect(page.getByText('Folder: "Comic Covers"')).toBeVisible();

    // Verify 2 matches are ready to link
    await expect(page.getByText('2 Ready to Link')).toBeVisible();

    // Verify the footer has "Link 2 Covers & Done"
    const linkAndDoneBtn = page.getByRole('button', { name: /Link 2 Covers & Done/i });
    await expect(linkAndDoneBtn).toBeVisible();

    // Click "Link 2 Covers & Done"
    await linkAndDoneBtn.click();

    // Modal should close
    await expect(page.getByRole('heading', { name: /Google Drive "Comic Covers" Integration/i })).not.toBeVisible();

    // Verify both comics in the catalog view now have updated Google Drive cover URLs
    const spidermanCardImg = page.locator('img[alt="The Amazing Spider-Man"]').first();
    await expect(spidermanCardImg).toHaveAttribute(
      'src',
      'https://lh3.googleusercontent.com/d/gdrive-file-spiderman-300-id=s800'
    );

    const xmenCardImg = page.locator('img[alt="Uncanny X-Men"]').first();
    await expect(xmenCardImg).toHaveAttribute(
      'src',
      'https://lh3.googleusercontent.com/d/gdrive-file-xmen-266-id=s800'
    );
  });

  test('Annuals are not falsely matched with baseline regular comics with the same name and issue number', async ({ page }) => {
    const silverSurferComics: ComicBook[] = [
      {
        id: 'test-comic-ss-2',
        title: 'Silver Surfer',
        issueNumber: '2',
        seriesName: 'Silver Surfer (Vol. 3) (1987 - 1998)',
        fullTitle: 'Silver Surfer #2',
        publisher: 'Marvel Comics',
        publicationYear: 1987,
        genre: 'Superhero',
        writer: 'Steve Englehart',
        artist: 'Marshall Rogers',
        coverImage: 'NoImage.png',
        format: 'Single Issue',
        sizeThickness: 1.0,
        currentBoxId: 1,
        readingStatus: 'Read',
        readCount: 1,
        condition: 'Near Mint',
        tags: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'test-comic-ss-ann-2',
        title: 'Silver Surfer Annual',
        issueNumber: '2',
        seriesName: 'Silver Surfer (Vol. 3) (1987 - 1998)',
        fullTitle: 'Silver Surfer Annual #2',
        publisher: 'Marvel Comics',
        publicationYear: 1989,
        genre: 'Superhero',
        writer: 'Steve Englehart',
        artist: 'Ron Lim',
        coverImage: 'NoImage.png',
        format: 'Single Issue',
        sizeThickness: 1.0,
        currentBoxId: 1,
        readingStatus: 'Read',
        readCount: 1,
        condition: 'Near Mint',
        tags: [],
        createdAt: '2025-01-02T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      },
    ];

    await page.route('**/api/collection', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: silverSurferComics,
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

    await page.route('**/drive/v3/files*', async (route) => {
      const url = route.request().url();
      if (url.includes('Comic%20Covers') || url.includes('Comic Covers')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            files: [{ id: 'mock-folder-id', name: 'Comic Covers' }],
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            files: [
              {
                id: 'gdrive-file-ss-ann-2-id',
                name: 'Silver Surfer Annual #2.jpg',
                mimeType: 'image/jpeg',
                thumbnailLink: 'https://lh3.googleusercontent.com/thumbnail-ss-ann-2=s220',
              },
              {
                id: 'gdrive-file-ss-2-id',
                name: 'Silver Surfer #2.jpg',
                mimeType: 'image/jpeg',
                thumbnailLink: 'https://lh3.googleusercontent.com/thumbnail-ss-2=s220',
              },
            ],
          }),
        });
      }
    });

    await page.addInitScript((comics) => {
      (window as any).__MOCK_AUTH__ = {
        user: { displayName: 'Vault Collector', email: 'collector@vault.com', photoURL: '' },
        token: 'mock-valid-google-access-token',
      };
      window.localStorage.setItem('comic_vault_comics', JSON.stringify(comics));
    }, silverSurferComics);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    const driveCoversBtn = page.getByRole('button', { name: /Drive Covers/i });
    await expect(driveCoversBtn).toBeVisible();
    await driveCoversBtn.click();

    await expect(page.getByRole('heading', { name: /Google Drive "Comic Covers" Integration/i })).toBeVisible();
    await expect(page.getByText('2 Ready to Link')).toBeVisible();

    // Verify file cards have the correct comic selected in their dropdowns
    // Card 1: Silver Surfer Annual #2.jpg should have Silver Surfer Annual selected
    const annCard = page.locator('div', { hasText: 'Silver Surfer Annual #2.jpg' }).last();
    const annSelect = annCard.locator('select');
    await expect(annSelect).toHaveValue('test-comic-ss-ann-2');

    // Card 2: Silver Surfer #2.jpg should have Silver Surfer selected
    const regCard = page.locator('div', { hasText: 'Silver Surfer #2.jpg' }).last();
    const regSelect = regCard.locator('select');
    await expect(regSelect).toHaveValue('test-comic-ss-2');
  });
});
