import { test, expect } from '@playwright/test';
import { ComicBook } from '../src/types';

test.describe('Catalog Performance Optimizations & Progressive Loading', () => {
  // Generate 120 sample comics to test batching beyond the 48/50 initial thresholds
  const generateComics = (count: number): ComicBook[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `comic-perf-${i + 1}`,
      title: i < 60 ? `Alpha Series` : `Beta Series`,
      seriesName: i < 60 ? `Alpha Series` : `Beta Series`,
      issueNumber: String(i + 1),
      publisher: i % 2 === 0 ? 'Marvel Comics' : 'DC Comics',
      publicationYear: 2000 + (i % 25),
      genre: i % 3 === 0 ? 'Superhero' : 'Sci-Fi',
      writer: `Writer ${i % 5}`,
      artist: `Artist ${i % 5}`,
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: (i % 3) + 1,
      readingStatus: i % 10 === 0 ? 'Wishlist' : i % 2 === 0 ? 'Read' : 'Unread',
      readCount: i % 2 === 0 ? 1 : 0,
      condition: 'Near Mint',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  };

  const testComics = generateComics(120);

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/collection*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: testComics,
          boxes: [
            { id: 1, name: 'Box 01', maxCapacity: 150, currentCount: 40 },
            { id: 2, name: 'Box 02', maxCapacity: 150, currentCount: 40 },
            { id: 3, name: 'Box 03', maxCapacity: 150, currentCount: 40 },
          ],
          seriesTotals: [],
          creatorTypes: [],
        }),
      });
    });

    await page.addInitScript((comics) => {
      window.localStorage.setItem('comic_vault_comics', JSON.stringify(comics));
      window.localStorage.removeItem('comic_vault_catalog_sort_v1');
    }, testComics);
  });

  test('R1: Catalog View initially renders 48 items in Grid view and shows progress counter', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    const catalogTab = page.getByRole('button', { name: /Catalog/i });
    await catalogTab.click();

    // Verify counter shows "Showing 48 of 120 comics"
    const counter = page.locator('text=Showing').first();
    await expect(counter).toBeVisible();
    await expect(counter).toContainText('Showing 48 of 120 comics');

    // Count grid cards rendered in the DOM
    const cards = page.locator('.grid > div.group');
    await expect(cards).toHaveCount(48);

    // Verify sentinel exists because more items remain (120 > 48)
    const sentinel = page.locator('[data-testid="catalog-sentinel"]');
    await expect(sentinel).toBeVisible();
  });

  test('R1: Scrolling near the bottom dynamically appends the next chunk of 48 comics', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    const counter = page.locator('text=Showing').first();
    await expect(counter).toContainText('Showing 48 of 120 comics');

    // Scroll the sentinel into view to trigger infinite scroll
    const sentinel = page.locator('[data-testid="catalog-sentinel"]');
    await sentinel.scrollIntoViewIfNeeded();

    // Should now show 96 comics
    await expect(counter).toContainText('Showing 96 of 120 comics', { timeout: 10000 });
    const cards = page.locator('.grid > div.group');
    await expect(cards).toHaveCount(96);

    // Scroll once more to load the final chunk
    await sentinel.scrollIntoViewIfNeeded();
    await expect(counter).toContainText('Showing 120 of 120 comics', { timeout: 10000 });
    await expect(cards).toHaveCount(120);

    // After loading all, sentinel should be replaced by "All 120 comics loaded"
    await expect(page.locator('text=All 120 comics loaded')).toBeVisible();
  });

  test('R1: Table View initially renders 50 items and appends next chunk on scroll', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    // Switch to Table View
    const tableViewBtn = page.getByTitle('Table List View');
    await tableViewBtn.click();

    const counter = page.locator('text=Showing').first();
    await expect(counter).toContainText('Showing 50 of 120 comics');

    // Count table rows
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(50);

    // Scroll sentinel into view
    const sentinel = page.locator('[data-testid="catalog-sentinel"]');
    await sentinel.scrollIntoViewIfNeeded();

    // Table view appends chunk of 50 -> 100
    await expect(counter).toContainText('Showing 100 of 120 comics', { timeout: 10000 });
    await expect(rows).toHaveCount(100);
  });

  test('R1: Changing filters, sort criteria, or search query resets visible count back to initial chunk', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    const counter = page.locator('text=Showing').first();
    const sentinel = page.locator('[data-testid="catalog-sentinel"]');

    // Scroll to load 96 items
    await sentinel.scrollIntoViewIfNeeded();
    await expect(counter).toContainText('Showing 96 of 120 comics', { timeout: 10000 });

    // Filter by Publisher: DC Comics (60 items in dataset)
    const publisherSelect = page.locator('label:has-text("Publisher") + select');
    await publisherSelect.selectOption('DC Comics');

    // Visible count should reset back to initial chunk: 48 of 60 comics
    await expect(counter).toContainText('Showing 48 of 60 comics', { timeout: 10000 });
    await expect(page.locator('.grid > div.group')).toHaveCount(48);

    // Scroll again to load remaining 12 -> 60
    await sentinel.scrollIntoViewIfNeeded();
    await expect(counter).toContainText('Showing 60 of 60 comics');

    // Now change Reading Status filter to Read
    const statusSelect = page.locator('label:has-text("Reading Status") + select');
    await statusSelect.selectOption('Read');

    // Resets back to 48 (or fewer if total is less than 48)
    const cards = page.locator('.grid > div.group');
    const cardCount = await cards.count();
    expect(cardCount).toBeLessThanOrEqual(48);
  });

  test('R2: Keystroke search is immediate in input, debounced downstream, and Clear button resets instantly', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    const searchInput = page.getByPlaceholder(/Search title, writer/i);
    await expect(searchInput).toBeVisible();

    // Type query
    await searchInput.fill('Beta Series');
    // Live input should reflect immediately
    await expect(searchInput).toHaveValue('Beta Series');

    // Downstream catalog filtering executes after debounce (~275ms)
    const counter = page.locator('text=Showing').first();
    await expect(counter).toContainText('Showing 48 of 60 comics', { timeout: 10000 });

    // Click Clear button
    const clearBtn = page.getByRole('button', { name: /Clear/i });
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    // Input resets immediately
    await expect(searchInput).toHaveValue('');
    // Results reset immediately to all comics
    await expect(counter).toContainText('Showing 48 of 120 comics');
  });

  test('R3: Tab returns to Catalog View are immediate and preserve loaded state without layout thrashing', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    const counter = page.locator('text=Showing').first();
    await expect(counter).toContainText('Showing 48 of 120 comics');

    // Navigate to Storage Boxes tab
    const boxesTab = page.getByRole('button', { name: /Storage Boxes/i });
    await boxesTab.click();
    await expect(page.getByRole('heading', { name: /Storage Box Manager/i })).toBeVisible();

    // Navigate back to Catalog View tab
    const catalogTab = page.getByRole('button', { name: /Catalog/i });
    await catalogTab.click();

    // Catalog returns instantly without thrashing
    await expect(counter).toBeVisible();
    await expect(counter).toContainText('Showing 48 of 120 comics');
    await expect(page.locator('.grid > div.group')).toHaveCount(48);
  });

  test('R3: Animated skeleton placeholder grid is rendered during initial session load when database query is in-flight', async ({ page }) => {
    // Override /api/collection to delay response by 600ms
    await page.route('**/api/collection*', async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: testComics,
          boxes: [
            { id: 1, name: 'Box 01', maxCapacity: 150, currentCount: 40 },
          ],
          seriesTotals: [],
          creatorTypes: [],
        }),
      });
    });

    await page.goto('/');

    // Skeleton grid placeholder should be immediately visible while loading
    const skeleton = page.locator('[data-testid="catalog-skeleton-grid"]');
    await expect(skeleton).toBeVisible({ timeout: 2000 });

    // Wait for data to resolve and cards to render
    const counter = page.locator('text=Showing').first();
    await expect(counter).toContainText('Showing 48 of 120 comics', { timeout: 15000 });
    await expect(skeleton).toBeHidden();
    await expect(page.locator('.grid > div.group')).toHaveCount(48);
  });

  test('R1: Graceful fallback when IntersectionObserver is not available renders all comics', async ({ page }) => {
    // Remove IntersectionObserver from window
    await page.addInitScript(() => {
      // @ts-ignore
      delete window.IntersectionObserver;
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    const counter = page.locator('text=Showing').first();
    // In fallback mode where IntersectionObserver is missing, it loads all comics without crashing
    await expect(counter).toContainText('Showing 120 of 120 comics', { timeout: 10000 });
    await expect(page.locator('.grid > div.group')).toHaveCount(120);
  });

  test('R1: Multi-sort modal criteria changes reset visible count back to initial chunk', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    const counter = page.locator('text=Showing').first();
    const sentinel = page.locator('[data-testid="catalog-sentinel"]');

    // Scroll to load 96 items
    await sentinel.scrollIntoViewIfNeeded();
    await expect(counter).toContainText('Showing 96 of 120 comics', { timeout: 10000 });

    // Open multi-sort modal
    const sortBtn = page.getByTitle('Configure Multi-Sort Rules');
    await sortBtn.click();
    await expect(page.getByRole('heading', { name: /Catalog Sort Order/i })).toBeVisible();

    // Select Chronological Release Date preset
    const chronologicalPreset = page.getByRole('button', { name: /Chronological Release Date/i });
    await chronologicalPreset.click();

    // Apply sort
    const applyBtn = page.getByRole('button', { name: /Apply & Close/i });
    await applyBtn.click();

    // Verify visible count resets back to initial chunk of 48
    await expect(counter).toContainText('Showing 48 of 120 comics', { timeout: 10000 });
    await expect(page.locator('.grid > div.group')).toHaveCount(48);
  });

  test('R2: Pressing Enter in search bar immediately triggers search downstream', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    const searchInput = page.getByPlaceholder(/Search title, writer/i);
    await searchInput.focus();
    await searchInput.fill('Beta Series');
    await searchInput.press('Enter');

    // Should update search results immediately upon pressing Enter
    const counter = page.locator('text=Showing').first();
    await expect(counter).toContainText('Showing 48 of 60 comics');
  });

  test('R1: Render-time layout synchronization ensures only 48 items mount without flashing old elevated count', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    const counter = page.locator('text=Showing').first();
    const sentinel = page.locator('[data-testid="catalog-sentinel"]');

    // Scroll down to load 96 items
    await sentinel.scrollIntoViewIfNeeded();
    await expect(counter).toContainText('Showing 96 of 120 comics', { timeout: 10000 });
    await expect(page.locator('.grid > div.group')).toHaveCount(96);

    // Filter by Publisher: Marvel Comics (60 items)
    const publisherSelect = page.locator('label:has-text("Publisher") + select');
    await publisherSelect.selectOption('Marvel Comics');

    // The rendered count must be exactly 48, never 60 or 96
    await expect(counter).toContainText('Showing 48 of 60 comics');
    const cards = page.locator('.grid > div.group');
    await expect(cards).toHaveCount(48);
  });

  test('R1: Table View thumbnail images have loading="lazy" attribute', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    // Switch to Table View
    const tableViewBtn = page.getByTitle('Table List View');
    await tableViewBtn.click();

    // Verify table images have loading="lazy"
    const firstTableImg = page.locator('table tbody tr img').first();
    await expect(firstTableImg).toHaveAttribute('loading', 'lazy');
  });

  test('R2: Search input has adequate right padding to prevent text collision with Clear button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    const searchInput = page.getByPlaceholder(/Search title, writer/i);
    const className = await searchInput.getAttribute('class');
    expect(className).toContain('pr-16');
  });

  test('R2: Search and filtering defensively handle comics with sparse, null, or missing fields without crashing', async ({ page }) => {
    // Inject comics with sparse/undefined optional fields
    const sparseComics = [
      {
        id: 'sparse-comic-1',
        title: 'Minimal Comic Without Optional Fields',
        issueNumber: '',
        publisher: '',
        genre: 'Indie',
        writer: '',
        artist: '',
        coverImage: '',
        format: 'Single Issue' as const,
        sizeThickness: 1.0,
        currentBoxId: 1,
        readingStatus: 'Unread' as const,
        readCount: 0,
        condition: 'Near Mint' as const,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'sparse-comic-2',
        title: 'Graphic Novel Without Issue Number',
        publisher: 'Image Comics',
        genre: 'Sci-Fi',
        writer: 'Jane Doe',
        artist: 'John Smith',
        coverImage: '',
        format: 'Graphic Novel' as const,
        sizeThickness: 2.0,
        currentBoxId: 2,
        readingStatus: 'Read' as const,
        readCount: 1,
        condition: 'Fine' as const,
        tags: ['collected-edition'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    await page.route('**/api/collection*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: sparseComics,
          boxes: [
            { id: 1, name: 'Box 01', maxCapacity: 150, currentCount: 1 },
            { id: 2, name: 'Box 02', maxCapacity: 150, currentCount: 1 },
          ],
          seriesTotals: [],
          creatorTypes: [],
        }),
      });
    });

    await page.addInitScript((comics) => {
      window.localStorage.setItem('comic_vault_comics', JSON.stringify(comics));
    }, sparseComics);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    const searchInput = page.getByPlaceholder(/Search title, writer/i);
    await searchInput.focus();
    await searchInput.fill('Graphic');
    await searchInput.press('Enter');

    // Should find the graphic novel without throwing TypeError or blanking out
    const counter = page.locator('text=Showing').first();
    await expect(counter).toContainText('Showing 1 of 1 comics');
    await expect(page.locator('.grid > div.group')).toHaveCount(1);
  });
});


