import { test, expect } from '@playwright/test';
import { ComicBook, StorageBox } from '../src/types';

test.describe('Reading Challenge Feature', () => {
  const sampleBoxes: StorageBox[] = [
    {
      id: 1,
      name: 'Box Alpha',
      location: 'Top Shelf Left',
      maxCapacity: 150,
      colorTag: '#3B82F6',
      notes: 'Main Marvel box',
    },
    {
      id: 2,
      name: 'Box Beta',
      location: 'Bottom Shelf Right',
      maxCapacity: 150,
      colorTag: '#10B981',
      notes: 'DC & Indies',
    },
  ];

  const sampleComics: ComicBook[] = [
    {
      id: 'rc-c1',
      title: 'Batman: Year One',
      seriesName: 'Batman',
      issueNumber: '404',
      publisher: 'DC Comics',
      publicationYear: 1987,
      publicationDate: '1987-02-01',
      genre: 'Superhero',
      writer: 'Frank Miller',
      artist: 'David Mazzucchelli',
      coverImage: 'NoImage.png',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 2,
      readingStatus: 'Unread',
      readCount: 0,
      condition: 'Near Mint',
      tags: ['Classic', 'Origin'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'rc-c2',
      title: 'Batman: Year One',
      seriesName: 'Batman',
      issueNumber: '405',
      publisher: 'DC Comics',
      publicationYear: 1987,
      publicationDate: '1987-03-01',
      genre: 'Superhero',
      writer: 'Frank Miller',
      artist: 'David Mazzucchelli',
      coverImage: 'NoImage.png',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 2,
      readingStatus: 'Unread',
      readCount: 0,
      condition: 'Near Mint',
      tags: ['Classic', 'Origin'],
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    },
    {
      id: 'rc-c3',
      title: 'The Amazing Spider-Man',
      seriesName: 'The Amazing Spider-Man',
      issueNumber: '300',
      publisher: 'Marvel Comics',
      publicationYear: 1988,
      publicationDate: '1988-05-01',
      genre: 'Superhero',
      writer: 'David Michelinie',
      artist: 'Todd McFarlane',
      coverImage: 'NoImage.png',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 1,
      readingStatus: 'Unread',
      readCount: 0,
      condition: 'Near Mint',
      tags: ['Venom'],
      createdAt: '2025-01-03T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z',
    },
    {
      id: 'rc-c4',
      title: 'Uncanny X-Men',
      seriesName: 'Uncanny X-Men',
      issueNumber: '141',
      publisher: 'Marvel Comics',
      publicationYear: 1981,
      publicationDate: '1981-01-01',
      genre: 'Superhero',
      writer: 'Chris Claremont, John Byrne',
      artist: 'John Byrne, Terry Austin',
      coverImage: 'NoImage.png',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 1,
      readingStatus: 'Unread',
      readCount: 0,
      condition: 'Near Mint',
      tags: ['Days of Future Past'],
      createdAt: '2025-01-04T00:00:00.000Z',
      updatedAt: '2025-01-04T00:00:00.000Z',
    },
    {
      id: 'rc-c5',
      title: 'Thor',
      seriesName: 'Thor',
      issueNumber: '469',
      publisher: 'Marvel Comics',
      publicationYear: 1993,
      publicationDate: '1993-12-01',
      genre: 'Superhero',
      writer: 'Jim Starlin',
      artist: 'Angel Medina',
      event: 'Blood and Thunder',
      coverImage: 'NoImage.png',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 1,
      readingStatus: 'Unread',
      copiesOwned: 1,
      readCount: 0,
      condition: 'Near Mint',
      tags: ['Crossover'],
      createdAt: '2025-01-05T00:00:00.000Z',
      updatedAt: '2025-01-05T00:00:00.000Z',
    },
    {
      id: 'rc-c6',
      title: 'Warlock Chronicles',
      seriesName: 'Warlock Chronicles',
      issueNumber: '6',
      publisher: 'Marvel Comics',
      publicationYear: 1993,
      publicationDate: '1993-12-01',
      genre: 'Superhero',
      writer: 'Jim Starlin',
      artist: 'Tom Raney',
      event: 'Blood and Thunder',
      coverImage: 'NoImage.png',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 0,
      readingStatus: 'Wishlist',
      copiesOwned: 0,
      readCount: 0,
      condition: 'Near Mint',
      tags: ['Crossover'],
      createdAt: '2025-01-06T00:00:00.000Z',
      updatedAt: '2025-01-06T00:00:00.000Z',
    },
  ];

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/collection', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: sampleComics,
          boxes: sampleBoxes,
          seriesTotals: [],
          creatorTypes: [],
        }),
      });
    });

    await page.addInitScript(({ boxes, comics }) => {
      window.localStorage.setItem('comic_vault_boxes', JSON.stringify(boxes));
      window.localStorage.setItem('comic_vault_comics', JSON.stringify(comics));
    }, { boxes: sampleBoxes, comics: sampleComics });
  });

  test('Reading Challenge tab exists and navigates correctly', async ({ page }) => {
    await page.goto('/');

    const challengeTab = page.getByRole('button', { name: /Reading Challenge/i });
    await expect(challengeTab).toBeVisible();
    await challengeTab.click();

    await expect(page.getByRole('heading', { name: 'Reading Challenge', exact: true })).toBeVisible();
    await expect(
      page.getByText(/Curate focused reading goals|Define Reading Challenge Criteria/i).first()
    ).toBeVisible();
  });

  test('Shows criteria configuration form and preview count', async ({ page }) => {
    // Ensure clean initial active challenge state
    await page.route('**/api/reading-challenges/active', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ challenge: null }) });
    });

    await page.goto('/');

    const challengeTab = page.getByRole('button', { name: /Reading Challenge/i });
    await challengeTab.click();

    // Challenge Name input should be visible with placeholder
    const nameInput = page.getByPlaceholder(/Claremont X-Men/i);
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Frank Miller Batman Run');

    // Default criteria includes Collection scope
    await expect(page.getByText('Entire Collection').first()).toBeVisible();

    // Preview header reflecting matching count
    await expect(page.getByText('Collection Match Preview')).toBeVisible();
    await expect(page.getByText('Eligible Comics:')).toBeVisible();
  });

  test('Can add series criteria and filter preview', async ({ page }) => {
    await page.route('**/api/reading-challenges/active', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ challenge: null }) });
    });

    await page.goto('/');

    const challengeTab = page.getByRole('button', { name: /Reading Challenge/i });
    await challengeTab.click();

    // Click "Series" button in "+ Add Condition:" bar to add a series criterion leaf
    const addSeriesBtn = page.getByRole('button', { name: /^Series$/i });
    await expect(addSeriesBtn).toBeVisible();
    await addSeriesBtn.click();

    // Verify series dropdown appears
    const selects = page.locator('select');
    await expect(selects.first()).toBeVisible();
  });

  test('Mobile view shows Reading Challenge tab button in bottom navigation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Wait for the app shell to mount
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Find and click Challenge button in mobile bottom nav
    const mobileBottom = page.locator('.safe-bottom');
    await expect(mobileBottom).toBeVisible();

    const mobileChallengeBtn = mobileBottom.getByRole('button', { name: /Challenge/i });
    await expect(mobileChallengeBtn).toBeVisible();
    await mobileChallengeBtn.click();

    // Verify Reading Challenge header is displayed
    await expect(page.getByRole('heading', { name: 'Reading Challenge', exact: true })).toBeVisible();
  });

  test('Active challenge displays Reading Queue, storage box pills, and actions', async ({ page }) => {
    const activeMock = {
      challengeId: 42,
      name: 'Batman 1987 Run',
      status: 'Active',
      criteriaSnapshot: { version: 1, root: { type: 'series', ids: ['Batman'] } },
      criteriaSummary: 'Series is Batman',
      readingOrder: 'PublicationDate',
      sortDirection: 'Ascending',
      batchSize: 10,
      createdAt: '2026-10-10T00:00:00.000Z',
      startedAt: '2026-10-10T00:00:00.000Z',
      totalEligible: 2,
      readCount: 0,
      skippedCount: 0,
      resolvedCount: 0,
      remainingCount: 2,
      progressPercent: 0,
      queue: [
        {
          challengeItemId: 101,
          challengeId: 42,
          comicId: 'rc-c1',
          sequenceNumber: 1,
          status: 'Unread',
          addedAt: '2026-10-10T00:00:00.000Z',
          metadata: sampleComics[0],
          currentBoxId: 2,
          boxName: 'Box Beta',
          boxLocation: 'Bottom Shelf Right',
          boxColorTag: '#10B981',
        },
        {
          challengeItemId: 102,
          challengeId: 42,
          comicId: 'rc-c2',
          sequenceNumber: 2,
          status: 'Unread',
          addedAt: '2026-10-10T00:00:00.000Z',
          metadata: sampleComics[1],
          currentBoxId: 2,
          boxName: 'Box Beta',
          boxLocation: 'Bottom Shelf Right',
          boxColorTag: '#10B981',
        },
      ],
    };

    await page.route('**/api/reading-challenges/active', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ challenge: activeMock }) });
    });

    await page.goto('/');

    const challengeTab = page.getByRole('button', { name: /Reading Challenge/i });
    await challengeTab.click();

    // Header and active badge
    await expect(page.getByText('Active Challenge').first()).toBeVisible();
    await expect(page.getByText('Batman 1987 Run')).toBeVisible();

    // Verify queue displays items with box location tags
    await expect(page.getByText('Batman: Year One #404')).toBeVisible();
    await expect(page.getByText('Box Beta').first()).toBeVisible();
    await expect(page.getByText('Bottom Shelf Right').first()).toBeVisible();

    // Verify Mark as Read and Skip buttons
    await expect(page.getByRole('button', { name: /Mark as Read/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Skip/i }).first()).toBeVisible();
  });

  test('Creator dropdown lists only individual creator names and splits compound creator fields', async ({ page }) => {
    await page.route('**/api/reading-challenges/active', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ challenge: null }) });
    });

    await page.goto('/');

    const challengeTab = page.getByRole('button', { name: /Reading Challenge/i });
    await challengeTab.click();

    // Click "Creator / Role" button in "+ Add Condition:" bar to add a creator criterion leaf
    const addCreatorBtn = page.getByRole('button', { name: /Creator \/ Role/i });
    await expect(addCreatorBtn).toBeVisible();
    await addCreatorBtn.click();

    // Find the creator select element containing creator names
    const creatorSelect = page.locator('select').filter({ hasText: 'Chris Claremont' });
    await expect(creatorSelect).toBeVisible();

    // Get all option texts
    const options = await creatorSelect.locator('option').allTextContents();

    // Check that individual names exist
    expect(options).toContain('Chris Claremont');
    expect(options).toContain('John Byrne');
    expect(options).toContain('Terry Austin');
    expect(options).toContain('Frank Miller');
    expect(options).toContain('David Mazzucchelli');
    expect(options).toContain('David Michelinie');
    expect(options).toContain('Todd McFarlane');

    // Check that compound strings are NOT present
    expect(options).not.toContain('Chris Claremont, John Byrne');
    expect(options).not.toContain('John Byrne, Terry Austin');
  });

  test('Excludes wishlist comics from reading challenge setup and preview', async ({ page }) => {
    await page.route('**/api/reading-challenges/active', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ challenge: null }) });
    });

    await page.goto('/');

    const challengeTab = page.getByRole('button', { name: /Reading Challenge/i });
    await challengeTab.click();

    // Click "Story Arc / Event" button to add an event condition leaf
    const addEventBtn = page.getByRole('button', { name: /Story Arc \/ Event/i });
    await expect(addEventBtn).toBeVisible();
    await addEventBtn.click();

    // Select the "Blood and Thunder" event
    const eventSelect = page.locator('select').filter({ hasText: 'Blood and Thunder' });
    await expect(eventSelect).toBeVisible();
    await eventSelect.selectOption('Blood and Thunder');

    // Verify eligible count reflects only the 1 owned comic (Thor #469), not wishlisted Warlock Chronicles #6
    await expect(page.getByText('1 comics', { exact: true })).toBeVisible();

    // Verify preview card shows Thor
    await expect(page.getByText('Thor', { exact: true })).toBeVisible();

    // Verify preview card does NOT show Warlock Chronicles
    await expect(page.getByText('Warlock Chronicles', { exact: true })).not.toBeVisible();
  });
});


