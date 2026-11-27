import { test, expect } from '@playwright/test';

const ARTIFACT_DIR = 'C:/Users/brian/.gemini/antigravity-cli/brain/3f927c00-7624-4978-a7de-0ec32f076259';

const MOCK_BOXES = [
  { id: 1, name: 'Spider-Man & Symbiotes', location: 'Closet Shelf A', maxCapacity: 150, colorTag: '#EF4444' },
  { id: 2, name: 'X-Men Classics', location: 'Closet Shelf B', maxCapacity: 150, colorTag: '#3B82F6' },
  { id: 3, name: 'Cosmic & Events', location: 'Office Cabinet', maxCapacity: 150, colorTag: '#8B5CF6' },
];

const MOCK_COMICS = [
  {
    id: 'test-ui-1',
    title: 'Amazing Spider-Man',
    seriesName: 'Amazing Spider-Man',
    issueNumber: '300',
    publisher: 'Marvel Comics',
    publicationYear: 1988,
    publicationMonth: 'May',
    genre: 'Superhero',
    format: 'Single Issue',
    condition: 'Mint',
    readingStatus: 'Read',
    currentBoxId: 1,
    copiesOwned: 1,
    sizeThickness: 1.0,
    estimatedValue: 420.0,
    previousEstimatedValue: 385.0,
    userRating: 5,
    tags: ['Key Issue', 'First Appearance Venom', 'CGC'],
    coverImage: 'NoImage.webp',
  },
  {
    id: 'test-ui-2',
    title: 'Uncanny X-Men',
    seriesName: 'Uncanny X-Men',
    issueNumber: '141',
    publisher: 'Marvel Comics',
    publicationYear: 1981,
    publicationMonth: 'Jan',
    genre: 'Superhero',
    format: 'Single Issue',
    condition: 'Near Mint',
    readingStatus: 'Read',
    currentBoxId: 2,
    copiesOwned: 1,
    sizeThickness: 1.0,
    estimatedValue: 185.0,
    previousEstimatedValue: 165.0,
    userRating: 5,
    tags: ['Key Issue', 'Days of Future Past'],
    coverImage: 'NoImage.webp',
  },
  {
    id: 'test-ui-3',
    title: 'Infinity Gauntlet',
    seriesName: 'Infinity Gauntlet',
    issueNumber: '1',
    publisher: 'Marvel Comics',
    publicationYear: 1991,
    publicationMonth: 'Jul',
    genre: 'Cosmic',
    format: 'Single Issue',
    condition: 'Gem Mint',
    readingStatus: 'Unread',
    currentBoxId: 3,
    copiesOwned: 1,
    sizeThickness: 1.0,
    estimatedValue: 95.0,
    previousEstimatedValue: 90.0,
    userRating: 4,
    tags: ['Event'],
    coverImage: 'NoImage.webp',
  },
];

test.describe('Standout UI Overhaul Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/collection*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: MOCK_COMICS,
          boxes: MOCK_BOXES,
          seriesTotals: [
            { seriesName: 'Infinity Gauntlet', issueCount: 6, publisher: 'Marvel Comics' },
          ],
          creatorTypes: ['Writer', 'Penciller'],
        }),
      });
    });

    await page.route('**/api/sync*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ synced: true, comics: [], boxes: [], deletedComicIds: [], deletedBoxIds: [] }),
      });
    });

    await page.route('**/api/comics*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
  });

  test('verifies Vault Spotlight, Filter Drawer, Dossier Hero, Shortbox Shelf, Longbox Flip, and Ctrl+K Palette', async ({ page }) => {
    await page.goto('/');

    // 1. Proposal 1: Vault Spotlight Banner defaults to expanded & collapses/expands cleanly
    const spotlight = page.getByTestId('vault-spotlight-banner');
    await expect(spotlight).toBeVisible();
    await expect(spotlight).toContainText('$700.00');
    await expect(spotlight).toContainText('Amazing Spider-Man');

    // Filter Drawer defaults to collapsed
    await expect(page.getByTestId('catalog-filter-drawer')).toHaveCount(0);
    await page.getByTestId('catalog-filter-drawer-toggle').click();
    await expect(page.getByTestId('catalog-filter-drawer')).toBeVisible();
    await page.getByTestId('catalog-filter-drawer-toggle').click();
    await expect(page.getByTestId('catalog-filter-drawer')).toHaveCount(0);

    // Capture Catalog + Spotlight screenshot
    await page.screenshot({ path: `${ARTIFACT_DIR}/live_catalog_spotlight.png` });

    // Toggle Spotlight collapsed and back
    await page.getByTestId('vault-spotlight-toggle').first().click();
    await expect(page.getByTestId('vault-spotlight-collapsed')).toBeVisible();
    await page.getByTestId('vault-spotlight-toggle').click();
    await expect(spotlight).toBeVisible();

    // 2. Proposal 4a: Longbox Cover-Flow Flip Mode
    await page.getByTestId('view-mode-flip').click();
    const flipView = page.getByTestId('longbox-flip-view');
    await expect(flipView).toBeVisible();
    await page.screenshot({ path: `${ARTIFACT_DIR}/live_longbox_flip.png` });
    await page.getByRole('button', { name: 'Next comic' }).click();
    await expect(flipView).toContainText('2 / 3');

    // 3. Proposal 2: Cinematic Ambient-Backdrop Comic Dossier Modal & Segmented Tabs
    await page.getByRole('button', { name: 'Inspect Dossier' }).click();
    const dossierHero = page.getByTestId('comic-dossier-hero');
    await expect(dossierHero).toBeVisible();
    await expect(page.getByTestId('comic-dossier-tabs')).toBeVisible();
    await page.getByTestId('dossier-tab-creators').click();
    await expect(page.getByText(/Comic Creators & Role Contributions/i)).toBeVisible();
    await page.getByTestId('dossier-tab-market').click();
    await expect(page.getByText(/Collector ROI/i)).toBeVisible();
    await page.getByTestId('dossier-tab-art').click();
    await expect(page.getByText(/Full Wraparound Art/i)).toBeVisible();
    await page.getByTestId('dossier-tab-overview').click();
    await page.waitForTimeout(550); // Allow spring entrance to settle
    await page.screenshot({ path: `${ARTIFACT_DIR}/live_comic_dossier.png` });
    await page.getByRole('button', { name: 'Close' }).first().click();

    // 4. Proposal 3: Tactile Shortbox Shelf in Box Manager
    await page.getByRole('button', { name: /Storage Boxes/i }).first().click();
    const boxCard1 = page.getByTestId('box-card-1');
    await expect(boxCard1).toBeVisible();
    await expect(boxCard1).toContainText('3D View');
    await expect(boxCard1).toContainText('Spider-Man & Symbiotes');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${ARTIFACT_DIR}/live_shortbox_shelf.png` });

    // 5. Proposal 4b: Global Ctrl+K Vault Command Palette
    await page.keyboard.press('Control+k');
    const palette = page.getByTestId('vault-command-palette');
    await expect(palette).toBeVisible();
    await palette.locator('input').fill('Spider');
    await expect(palette).toContainText('Amazing Spider-Man #300');
    await page.screenshot({ path: `${ARTIFACT_DIR}/live_command_palette.png` });
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
  });
});
