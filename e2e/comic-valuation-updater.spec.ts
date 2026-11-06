import { test, expect } from '@playwright/test';

test.describe('Comic Collection Market Valuation & Periodic Updater', () => {
  test('Backend /api/valuation/lookup applies Condition multipliers and Graded Slab tiers', async ({ request }) => {
    // 1. Raw Near Mint lookup
    const nmRes = await request.post('/api/valuation/lookup', {
      data: {
        title: 'The Amazing Spider-Man',
        issueNumber: '300',
        publicationYear: 1988,
        format: 'Single Issue',
        condition: 'Near Mint',
        tags: [],
      },
    });
    expect(nmRes.ok()).toBeTruthy();
    const nmBody = await nmRes.json();
    expect(nmBody.valuation).toBeDefined();
    expect(nmBody.valuation.conditionApplied).toBe('Near Mint');
    expect(nmBody.valuation.conditionMultiplier).toBe(1);
    expect(nmBody.valuation.isGradedApplied).toBe(false);
    expect(nmBody.valuation.estimatedValue).toBeGreaterThan(0);

    // 2. Raw Fine condition lookup (0.50x multiplier of Near Mint base)
    const fnRes = await request.post('/api/valuation/lookup', {
      data: {
        title: 'The Amazing Spider-Man',
        issueNumber: '300',
        publicationYear: 1988,
        format: 'Single Issue',
        condition: 'Fine',
        tags: [],
      },
    });
    expect(fnRes.ok()).toBeTruthy();
    const fnBody = await fnRes.json();
    expect(fnBody.valuation.conditionApplied).toBe('Fine');
    expect(fnBody.valuation.conditionMultiplier).toBe(0.5);
    expect(fnBody.valuation.estimatedValue).toBeCloseTo(
      Number((nmBody.valuation.baseNearMintValue * 0.5).toFixed(2)),
      1
    );

    // 3. Slabbed / Graded CGC 9.8 lookup
    const cgcRes = await request.post('/api/valuation/lookup', {
      data: {
        title: 'The Amazing Spider-Man',
        issueNumber: '300',
        publicationYear: 1988,
        format: 'Single Issue',
        condition: 'Gem Mint',
        tags: ['CGC 9.8', 'Key Issue'],
      },
    });
    expect(cgcRes.ok()).toBeTruthy();
    const cgcBody = await cgcRes.json();
    expect(cgcBody.valuation.isGradedApplied).toBe(true);
    expect(cgcBody.valuation.estimatedValue).toBeGreaterThan(nmBody.valuation.estimatedValue);

    // 4. Verification for X-Men #48 (1996) resolving live PriceCharting quote instead of fallback
    const xmenRes = await request.post('/api/valuation/lookup', {
      data: {
        title: 'X-Men',
        issueNumber: '48',
        publicationYear: 1996,
        format: 'Single Issue',
        condition: 'Near Mint',
      },
    });
    expect(xmenRes.ok()).toBeTruthy();
    const xmenBody = await xmenRes.json();
    expect(xmenBody.valuation.source).toBe('PriceCharting');
    expect(xmenBody.valuation.sourceUrl).toContain('/game/comic-books-x-men/x-men-48-1996');
    expect(xmenBody.valuation.estimatedValue).toBeGreaterThan(15);
    expect(xmenBody.valuation.confidence).toBe('high');
  });

  test('ComicDetailModal supports single-comic Value Lookup, Condition scaling, and Value Lock', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Open the first comic card in the catalog
    const firstComicCard = page.locator('[data-testid="comic-card"], .group.bg-white, .group.relative').first();
    await expect(firstComicCard).toBeVisible({ timeout: 15000 });
    await firstComicCard.click();

    // Enter Edit mode in ComicDetailModal
    const editBtn = page.getByRole('button', { name: /Edit Details|Edit/i }).first();
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Click Lookup Value button
    const lookupBtn = page.getByRole('button', { name: 'Lookup Value' });
    await expect(lookupBtn).toBeVisible();
    await lookupBtn.click();

    // Wait for provenance footer (Source: PriceCharting or eBay Market) to appear
    await expect(page.getByText(/Raw NM Base|Graded Tier Applied/i)).toBeVisible({ timeout: 15000 });

    // Toggle Lock Value pin
    const lockBtn = page.getByRole('button', { name: 'Lock Value' });
    await lockBtn.click();
    await expect(page.getByText('Value Locked')).toBeVisible();
  });

  test('ValuationManagerModal opens from Navbar, shows coverage metrics, and runs Batch Update', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Click Market Values button in Navbar
    const marketValuesBtn = page.getByRole('button', { name: 'Market Values' });
    await expect(marketValuesBtn).toBeVisible();
    await marketValuesBtn.click();

    // Verify modal header and coverage summary cards
    await expect(
      page.getByRole('heading', { name: /Market Valuation & Periodic Price Updater/i })
    ).toBeVisible();
    await expect(page.getByText('Portfolio Value')).toBeVisible();
    await expect(page.getByText('Needs Update (Owned)')).toBeVisible();
    await expect(page.getByText('Periodic Rolling Auto-Refresh Schedule')).toBeVisible();

    // Select "Up to 10 comics" for a fast batch run
    const limitSelect = page.getByLabel('Max Comics This Run');
    await limitSelect.selectOption('10');

    // Start batch update if eligible comics exist
    const startBtn = page.getByRole('button', { name: /Start Batch Update/i });
    if (await startBtn.isEnabled()) {
      await startBtn.click();
      await expect(page.getByText(/Recent Valuation Updates/i)).toBeVisible({ timeout: 25000 });
    }
  });
});
