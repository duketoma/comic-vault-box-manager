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
      coverImage: 'NoImage.webp',
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
      coverImage: 'NoImage.webp',
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

    // Mock image requests to Google Drive content server with valid 1x1 PNG to prevent onerror image fallback
    const pixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await page.route(/.*googleusercontent\.com.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: pixelPng,
      });
    });
    await page.route('**/api/proxy-image*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: pixelPng,
      });
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
        coverImage: 'NoImage.webp',
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
        coverImage: 'NoImage.webp',
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

  test('Supports re-scanning drive and displays Scan with Google Account button', async ({ page }) => {
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

    let scanCount = 0;
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
        scanCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            files: [
              {
                id: `gdrive-file-spiderman-300-id-${scanCount}`,
                name: 'The Amazing Spider-Man 300.jpg',
                mimeType: 'image/jpeg',
                thumbnailLink: 'https://lh3.googleusercontent.com/thumbnail-spiderman=s220',
              },
            ],
          }),
        });
      }
    });

    const pixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await page.route(/.*googleusercontent\.com.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: pixelPng });
    });

    await page.addInitScript((comics) => {
      (window as any).__MOCK_AUTH__ = {
        user: { displayName: 'Vault Collector', email: 'collector@vault.com', photoURL: '' },
        token: 'mock-valid-google-access-token',
      };
      window.localStorage.setItem('comic_vault_comics', JSON.stringify(comics));
    }, testComics);

    await page.goto('/');
    const driveCoversBtn = page.getByRole('button', { name: /Drive Covers/i });
    await driveCoversBtn.click();

    // Verify modal open
    await expect(page.getByRole('heading', { name: /Google Drive "Comic Covers" Integration/i })).toBeVisible();

    // Verify Re-scan Drive button is visible
    const rescanBtn = page.getByRole('button', { name: /Re-scan Drive/i });
    await expect(rescanBtn).toBeVisible();

    // Verify Scan with Google Account button is visible
    const googleAccountBtn = page.getByRole('button', { name: /Scan with Google Account/i });
    await expect(googleAccountBtn).toBeVisible();

    // Click Re-scan Drive
    await rescanBtn.click();
    await expect(page.getByText('Folder: "Comic Covers"')).toBeVisible();
  });

  test('Matches year-designated annuals without appending #1 and prevents subseries confusion', async ({ page }) => {
    const annualComics = [
      {
        id: 'uncanny-ann-95',
        title: "Uncanny X-Men Annual '95",
        issueNumber: '1',
        seriesName: 'Uncanny X-Men (1963 - 2011)',
        fullTitle: "Uncanny X-Men Annual '95",
        publisher: 'Marvel Comics',
        publicationYear: 1995,
        genre: 'Superhero',
        writer: 'Scott Lobdell',
        artist: 'Bryan Hitch',
        coverImage: 'NoImage.webp',
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
        id: 'xmen-ann-95',
        title: "X-Men Annual '95",
        issueNumber: '1',
        seriesName: 'X-Men (Vol. 2) (1991 - 2001)',
        fullTitle: "X-Men Annual '95",
        publisher: 'Marvel Comics',
        publicationYear: 1995,
        genre: 'Superhero',
        writer: 'Fabian Nicieza',
        artist: 'Andy Kubert',
        coverImage: 'NoImage.webp',
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
    ];

    // Mock backend database routes
    await page.route('**/api/collection', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: annualComics,
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

    await page.route('**/api/collection/replace', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.route('**/drive/v3/files*', async (route) => {
      const url = route.request().url();
      if (url.includes('Comic%20Covers') || url.includes('Comic Covers')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            files: [{ id: 'mock-comic-covers-folder-id', name: 'Comic Covers', mimeType: 'application/vnd.google-apps.folder' }],
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            files: [
              {
                id: 'gdrive-file-xmen-ann-95-std',
                name: "X-Men Annual '95.jpg",
                mimeType: 'image/jpeg',
                thumbnailLink: 'https://lh3.googleusercontent.com/thumbnail-xmen95=s220',
              },
              {
                id: 'gdrive-file-xmen-ann-95-full',
                name: "X-Men Annual Full '95.jpg",
                mimeType: 'image/jpeg',
                thumbnailLink: 'https://lh3.googleusercontent.com/thumbnail-xmen95full=s220',
              },
            ],
          }),
        });
      }
    });

    const pixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await page.route(/.*googleusercontent\.com.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: pixelPng });
    });

    await page.addInitScript((comics) => {
      (window as any).__MOCK_AUTH__ = {
        user: { displayName: 'Vault Collector', email: 'collector@vault.com', photoURL: '' },
        token: 'mock-valid-google-access-token',
      };
      window.localStorage.setItem('comic_vault_comics', JSON.stringify(comics));
    }, annualComics);

    await page.goto('/');
    const driveCoversBtn = page.getByRole('button', { name: /Drive Covers/i });
    await driveCoversBtn.click();

    // Verify modal opened and scanned
    await expect(page.getByRole('heading', { name: /Google Drive "Comic Covers" Integration/i })).toBeVisible();
    await expect(page.getByText('Folder: "Comic Covers"')).toBeVisible();

    // Wait for the two files to appear
    await expect(page.getByText("X-Men Annual '95.jpg")).toBeVisible();
    await expect(page.getByText("X-Men Annual Full '95.jpg")).toBeVisible();

    // Verify 2 matches are ready to link
    await expect(page.getByText('2 Ready to Link')).toBeVisible();

    // Verify modal card dropdown does NOT contain "X-Men Annual '95 #1"
    const cardSelects = page.locator('.fixed.inset-0 select');
    await expect(cardSelects.first()).toBeVisible();
    const dropdownHtml = await cardSelects.first().innerHTML();
    expect(dropdownHtml).not.toContain("X-Men Annual '95 #1");
    expect(dropdownHtml).toContain("X-Men Annual '95");

    // Verify X-Men Annual '95 was selected, NOT Uncanny
    await expect(cardSelects.first()).toHaveValue('xmen-ann-95');
    await expect(cardSelects.nth(1)).toHaveValue('xmen-ann-95');

    // Click "Link 2 Covers & Done"
    const linkAndDoneBtn = page.getByRole('button', { name: /Link 2 Covers & Done/i });
    await expect(linkAndDoneBtn).toBeVisible();
    await linkAndDoneBtn.click();
    await expect(page.getByRole('heading', { name: /Google Drive "Comic Covers" Integration/i })).not.toBeVisible();
  });
});
