import { test, expect } from '@playwright/test';

test.describe('Swappable Comic UI Themes & Dynamic Motion FX Studio', () => {
  test('Defaults to Modern Vault skin and swaps live between Pulp, Graded Slab Museum, and Neon 2099', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Verify default skin on <html> is 'modern'
    await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'modern');

    // Open Style Studio from Navbar
    const studioBtn = page.getByRole('button', { name: 'Style Studio' });
    await expect(studioBtn).toBeVisible();
    await studioBtn.click();

    await expect(
      page.getByRole('heading', { name: /Comic Style & Motion FX Studio/i })
    ).toBeVisible();

    // Switch to Four-Color Pulp
    await page.getByRole('button', { name: /Four-Color Pulp/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'pulp');

    // Switch to Graded Slab Museum and verify slab header appears in sandbox and catalog
    await page.getByRole('button', { name: /Graded Slab Museum/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'slab');
    await expect(page.getByTestId('sandbox-slab-header')).toBeVisible();

    // Switch to Neon Cyber-Noir
    await page.getByRole('button', { name: /Neon Cyber-Noir/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'neon');

    // Switch back to Graded Slab Museum, close modal, and verify catalog cards show slab headers
    await page.getByRole('button', { name: /Graded Slab Museum/i }).click();
    await page.getByRole('button', { name: 'Close Style Studio Modal' }).click();

    await expect(page.getByTestId('catalog-slab-header').first()).toBeVisible({ timeout: 15000 });

    // Reload page and confirm theme preference persisted in localStorage
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'slab');
  });

  test('Triggers animated Comic Action Burst stamps from Style Studio sandbox and resets to default', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Style Studio' }).click();

    // Trigger POW! stamp
    const powBtn = page.getByRole('button', { name: /POW!/i });
    await expect(powBtn).toBeVisible();
    await powBtn.click();

    const burst = page.getByTestId('comic-action-burst').first();
    await expect(burst).toBeVisible();
    await expect(burst).toContainText('POW!');

    // Reset to Default (Modern Vault)
    const resetBtn = page.getByRole('button', { name: /Reset Default/i });
    await resetBtn.click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'modern');

    // Change Motion Intensity dropdown and click Preview spring button
    const motionSelect = page.getByLabel('Motion Intensity');
    await motionSelect.selectOption('subtle');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'subtle');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('sandbox-spring-preview')).toBeVisible();

    await motionSelect.selectOption('full');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');

    // Close modal and verify tab spring container updates across tab switches
    await page.getByRole('button', { name: 'Close Style Studio Modal' }).click();
    await expect(page.getByTestId('tab-spring-container')).toHaveAttribute('data-motion-mode', 'full');
  });

  test('Triggers READ!, COLLECTED!, and EXCELSIOR! Action Stamps on real collection workflows', async ({
    page,
  }) => {
    const testComics = [
      {
        id: 'stamp-test-1',
        title: 'Moon Knight',
        seriesName: 'Moon Knight (2021)',
        issueNumber: '1',
        publisher: 'Marvel Comics',
        publicationYear: 2021,
        genre: 'Superhero',
        writer: 'Jed MacKay',
        artist: 'Alessandro Cappuccio',
        coverImage: 'NoImage.webp',
        format: 'Single Issue',
        sizeThickness: 1.0,
        currentBoxId: 1,
        readingStatus: 'Reading',
        copiesOwned: 1,
        condition: 'Near Mint',
      },
      {
        id: 'stamp-test-2',
        title: 'Moon Knight',
        seriesName: 'Moon Knight (2021)',
        issueNumber: '2',
        publisher: 'Marvel Comics',
        publicationYear: 2021,
        genre: 'Superhero',
        writer: 'Jed MacKay',
        artist: 'Alessandro Cappuccio',
        coverImage: 'NoImage.webp',
        format: 'Single Issue',
        sizeThickness: 1.0,
        currentBoxId: -1,
        readingStatus: 'Wishlist',
        copiesOwned: 0,
        condition: 'Near Mint',
      },
      {
        id: 'stamp-test-3',
        title: 'Daredevil',
        seriesName: 'Daredevil (2022)',
        issueNumber: '1',
        publisher: 'Marvel Comics',
        publicationYear: 2022,
        genre: 'Superhero',
        writer: 'Chip Zdarsky',
        artist: 'Marco Checchetto',
        coverImage: 'NoImage.webp',
        format: 'Single Issue',
        sizeThickness: 1.0,
        currentBoxId: -1,
        readingStatus: 'Wishlist',
        copiesOwned: 0,
        condition: 'Near Mint',
      },
    ];

    const testSeriesTotals = [
      {
        seriesName: 'Moon Knight (2021)',
        publisher: 'Marvel Comics',
        issueCount: 2,
      },
      {
        seriesName: 'Daredevil (2022)',
        publisher: 'Marvel Comics',
        issueCount: 5,
      },
    ];

    await page.route('**/api/collection', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comics: testComics,
          boxes: [{ id: 1, name: 'Box 01 - Marvel', maxCapacity: 150 }],
          seriesTotals: testSeriesTotals,
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

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // 1. Trigger READ! ★ stamp by clicking the Grid View quick status button on Moon Knight #1 (Reading -> Read)
    const gridStatusBtn = page.getByTestId('grid-quick-status-btn').first();
    await expect(gridStatusBtn).toHaveText('Reading');
    await gridStatusBtn.click();

    const readBurst = page.getByTestId('comic-action-burst');
    await expect(readBurst).toBeVisible();
    await expect(readBurst).toContainText('READ!');
    await expect(readBurst).toContainText('Moon Knight #1');

    // 2. Include Wishlist in Catalog and open Daredevil #1 (1 of 5 in series) to trigger COLLECTED! 💥
    const filterDrawerToggle = page.getByTestId('catalog-filter-drawer-toggle');
    if (await filterDrawerToggle.isVisible()) {
      const expanded = await filterDrawerToggle.getAttribute('aria-expanded');
      if (expanded !== 'true') {
        await filterDrawerToggle.click();
      }
    }
    const wishlistFilterSelect = page.locator('label:has-text("Wishlist Filter") + select');
    await wishlistFilterSelect.selectOption('include');

    const daredevilCard = page.getByTestId('comic-card').filter({ hasText: 'Daredevil' }).first();
    await expect(daredevilCard).toBeVisible();
    await daredevilCard.click();

    const markOwnedBtn = page.getByTestId('detail-quick-mark-owned-btn');
    await expect(markOwnedBtn).toBeVisible();
    await markOwnedBtn.click();

    const collectedBurst = page.getByTestId('comic-action-burst');
    await expect(collectedBurst).toBeVisible();
    await expect(collectedBurst).toContainText('COLLECTED!');
    await expect(collectedBurst).toContainText('Daredevil #1');

    // Close detail modal
    await page.keyboard.press('Escape');

    // 3. Open Moon Knight #2 (the 2nd of 2 issues in Moon Knight (2021)) and click Mark Owned to trigger EXCELSIOR! 🏆
    const moonKnight2Card = page
      .getByTestId('comic-card')
      .filter({ hasText: 'Moon Knight' })
      .filter({ hasText: '#2' })
      .first();
    await expect(moonKnight2Card).toBeVisible();
    await moonKnight2Card.click();

    await expect(page.getByTestId('detail-quick-mark-owned-btn')).toBeVisible();
    await page.getByTestId('detail-quick-mark-owned-btn').click();

    const excelsiorBurst = page.getByTestId('comic-action-burst');
    await expect(excelsiorBurst).toBeVisible();
    await expect(excelsiorBurst).toContainText('EXCELSIOR!');
    await expect(excelsiorBurst).toContainText('100% Series Run • Moon Knight (2021)');

    // Close detail modal and test Reading Challenge Mark Read Action Stamp subtext
    await page.keyboard.press('Escape');

    const mockActiveChallenge = {
      challengeId: 1,
      name: 'Marvel Knights Stack',
      status: 'Active',
      criteriaSnapshot: { version: 1, root: { type: 'collection' } },
      criteriaSummary: 'Entire Collection',
      readingOrder: 'PublicationDate',
      sortDirection: 'Ascending',
      batchSize: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: '2026-01-01T00:00:00.000Z',
      totalEligible: 2,
      readCount: 0,
      skippedCount: 0,
      resolvedCount: 0,
      remainingCount: 2,
      progressPercent: 0,
      queue: [
        {
          challengeItemId: 101,
          challengeId: 1,
          comicId: 'stamp-test-3',
          sequenceNumber: 1,
          status: 'Unread',
          addedAt: '2026-01-01T00:00:00.000Z',
          metadata: {
            id: 'stamp-test-3',
            title: 'Daredevil',
            issueNumber: '1',
            publisher: 'Marvel Comics',
            publicationYear: 2022,
          },
          currentBoxId: 1,
        },
      ],
    };

    await page.route('**/api/reading-challenges/active', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ challenge: mockActiveChallenge }),
      });
    });

    await page.route('**/api/reading-challenges/history', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ history: [] }),
      });
    });

    await page.route('**/api/reading-challenges/1/items/101/read', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockActiveChallenge,
          readCount: 1,
          resolvedCount: 1,
          remainingCount: 1,
          progressPercent: 50,
          queue: [],
        }),
      });
    });

    await page.getByRole('button', { name: /Challenge/i }).first().click();
    const challengeMarkReadBtn = page.getByRole('button', { name: /Mark as Read/i }).first();
    await expect(challengeMarkReadBtn).toBeVisible();
    await challengeMarkReadBtn.click();

    const challengeBurst = page.getByTestId('comic-action-burst');
    await expect(challengeBurst).toBeVisible();
    await expect(challengeBurst).toContainText('READ!');
    await expect(challengeBurst).toContainText('Daredevil #1');
    await expect(challengeBurst).not.toContainText('undefined');
  });
});
