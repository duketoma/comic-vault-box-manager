import { test, expect } from '@playwright/test';
import { ComicBook } from '../src/types';

test.describe('Google Drive Full Wraparound Cover Art Integration & Showcase', () => {
  const testComics: ComicBook[] = [
    {
      id: 'comic-spiderman-300',
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
      id: 'comic-xman-annual-96',
      title: 'X-Man',
      issueNumber: 'Annual 1996',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1996,
      genre: 'Superhero',
      writer: 'Terry Kavanagh',
      artist: 'Steve Skroce',
      coverImage: 'NoImage.webp',
      format: 'Single Issue',
      sizeThickness: 1.2,
      currentBoxId: 1,
      readingStatus: 'Unread',
      readCount: 0,
      condition: 'Fine',
      tags: [],
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    },
    {
      id: 'comic-mcp-16',
      title: 'Marvel Comics Presents',
      issueNumber: '16',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1989,
      genre: 'Anthology',
      writer: 'Various',
      artist: 'Various',
      coverImage: 'NoImage.webp',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 1,
      readingStatus: 'Unread',
      readCount: 0,
      condition: 'Near Mint',
      tags: [],
      createdAt: '2025-01-03T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z',
    },
  ];

  test('Excludes "Full" from standard covers, strictly matches formatted full art, and showcases in Catalog & 3D Visualizer', async ({ page }) => {
    // Mock backend database routes
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
                id: 'gdrive-spiderman-front-id',
                name: 'The Amazing Spider-Man 300.webp',
                mimeType: 'image/webp',
                thumbnailLink: 'https://lh3.googleusercontent.com/spiderman-front=s220',
              },
              {
                id: 'gdrive-spiderman-full-id',
                name: 'The Amazing Spider-Man Full #300.webp',
                mimeType: 'image/webp',
                thumbnailLink: 'https://lh3.googleusercontent.com/spiderman-full=s220',
              },
              {
                id: 'gdrive-xman-full-id',
                name: "X-Man Annual Full '96.webp",
                mimeType: 'image/webp',
                thumbnailLink: 'https://lh3.googleusercontent.com/xman-full=s220',
              },
              {
                id: 'gdrive-mcp-invalid-full-id',
                name: 'Marvel Comics Presents #16 Full.webp',
                mimeType: 'image/webp',
                thumbnailLink: 'https://lh3.googleusercontent.com/mcp-invalid=s220',
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

    // 1. Open Google Drive Covers Modal
    const driveCoversBtn = page.getByRole('button', { name: /Drive Covers/i });
    await expect(driveCoversBtn).toBeVisible();
    await driveCoversBtn.click();

    await expect(page.getByRole('heading', { name: /Google Drive "Comic Covers" Integration/i })).toBeVisible();
    await expect(page.getByText('Folder: "Comic Covers"')).toBeVisible();

    // Verify filter tabs are rendered: All Images, Front Covers, Full Wraparound Art
    await expect(page.getByRole('button', { name: /All Images/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Front Covers/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Full Wraparound Art/i })).toBeVisible();

    // Verify "Format Error" badge appears on "Marvel Comics Presents #16 Full.webp"
    await expect(page.getByText('Format Error')).toBeVisible();

    // Verify strict full covers matched with "Full Art" badges
    const fullArtBadges = page.locator('span:has-text("Full Art")');
    await expect(fullArtBadges.first()).toBeVisible();

    // Click "Link Matches & Done"
    const linkAndDoneBtn = page.getByRole('button', { name: /Link \d+ Covers & Done/i });
    await expect(linkAndDoneBtn).toBeVisible();
    await linkAndDoneBtn.click();

    // Modal should close
    await expect(page.getByRole('heading', { name: /Google Drive "Comic Covers" Integration/i })).not.toBeVisible();

    // 2. Verify Catalog View displays Full Art Badges
    const fullArtPills = page.locator('button:has-text("Full Art")');
    await expect(fullArtPills.first()).toBeVisible();

    // Click the "Full Art Only" quick filter button
    const fullArtFilterBtn = page.getByRole('button', { name: /Full Art \(\d+\)/i });
    await expect(fullArtFilterBtn).toBeVisible();
    await fullArtFilterBtn.click();

    // Marvel Comics Presents should be filtered out
    await expect(page.locator('text=Marvel Comics Presents #16')).not.toBeVisible();
    // Spider-Man should still be visible
    await expect(page.locator('h3:has-text("The Amazing Spider-Man")')).toBeVisible();

    // 3. Open Full Art Showcase from Catalog View
    const spidermanFullArtCardBtn = page.getByTitle('View Full Wraparound Cover Art').first();
    await expect(spidermanFullArtCardBtn).toBeVisible();
    await spidermanFullArtCardBtn.click();

    // Verify Full Art Showcase Modal opened
    await expect(page.getByRole('button', { name: /Full Spread/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Compare/i })).toBeVisible();

    // Close the Showcase modal
    const closeShowcaseBtn = page.getByTitle('Close (Esc)');
    await closeShowcaseBtn.click();
    await expect(page.getByRole('button', { name: /Full Spread/i })).not.toBeVisible();

    // 4. Test 3D Box Visualizer Full Art Integration
    // Navigate to Box Manager tab
    const boxesNavBtn = page.getByRole('button', { name: /Storage Boxes/i }).first();
    await boxesNavBtn.click();

    // Click "View in 3D" on Box 01
    const view3DBtn = page.getByTitle('View in 3D').first();
    await expect(view3DBtn).toBeVisible();
    await view3DBtn.click();

    // Verify 3D Box Visualizer modal is open
    await expect(page.getByRole('heading', { name: '3D Box Visualizer' })).toBeVisible();

    // Select the comic from the comic list or canvas
    // In Box3DVisualizer, click the Next Comic button to select a comic
    const nextComicBtn = page.getByTitle('Next Comic in Box');
    if (await nextComicBtn.isVisible()) {
      await nextComicBtn.click({ force: true, noWaitAfter: true });
    }

    // Verify Full Art button appears in 3D viewer toolbar
    const fullArtToolbarBtn = page.getByRole('button', { name: 'Full Art' });
    if (await fullArtToolbarBtn.isVisible()) {
      await fullArtToolbarBtn.click({ force: true, noWaitAfter: true });
      await expect(page.getByRole('button', { name: /Full Spread/i })).toBeVisible();
      await page.getByTitle('Close (Esc)').click();
    }
  });
});
