import { test, expect } from '@playwright/test';
import { parseTitleAndIssue } from '../src/utils/titleParser';
import { parseIssueNumber, compareIssueNumbers } from '../src/utils/comicSortUtils';

test.describe('Negative Comic Issue Numbers Handling (e.g. #-1)', () => {
  test('titleParser correctly extracts negative issue numbers', () => {
    // 1. Explicit hash with negative number
    const p1 = parseTitleAndIssue('X-Factor #-1');
    expect(p1.cleanTitle).toBe('X-Factor');
    expect(p1.issueNumber).toBe('-1');

    // 2. Explicit hash with negative number and year
    const p2 = parseTitleAndIssue('Excalibur #-1 (1997)');
    expect(p2.cleanTitle).toBe('Excalibur');
    expect(p2.issueNumber).toBe('-1');
    expect(p2.publicationYear).toBe(1997);

    // 3. Trailing negative number without hash
    const p3 = parseTitleAndIssue('Silver Surfer -1');
    expect(p3.cleanTitle).toBe('Silver Surfer');
    expect(p3.issueNumber).toBe('-1');
  });

  test('comicSortUtils correctly parses and sorts negative issue numbers', () => {
    const pNeg1 = parseIssueNumber('-1');
    expect(pNeg1.major).toBe(-1);
    expect(pNeg1.isText).toBe(false);

    const pHashNeg1 = parseIssueNumber('#-1');
    expect(pHashNeg1.major).toBe(-1);
    expect(pHashNeg1.isText).toBe(false);

    // #-1 comes before #0
    expect(compareIssueNumbers('-1', '0')).toBeLessThan(0);

    // #-1 comes before #1
    expect(compareIssueNumbers('-1', '1')).toBeLessThan(0);

    // #-1 comes before #1/2 (0.5)
    expect(compareIssueNumbers('-1', '1/2')).toBeLessThan(0);

    // #-1 comes before #-1A
    expect(compareIssueNumbers('-1', '-1A')).toBeLessThan(0);

    // #-2 comes before #-1
    expect(compareIssueNumbers('-2', '-1')).toBeLessThan(0);
  });

  test('Catalog library displays X-Factor #-1 with correct #-1 badge and not #1', async ({ page }) => {
    await page.goto('/');

    // Wait for the app and collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Search for X-Factor in catalog
    const searchInput = page.getByPlaceholder(/Search title/i);
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await searchInput.fill('X-Factor');

    // Verify X-Factor #-1 is visible with #-1 badge
    const negOneBadge = page.getByText('#-1', { exact: true }).first();
    await expect(negOneBadge).toBeVisible();

    // Verify both X-Factor #1 and X-Factor #-1 exist and are distinct
    const issue1Badge = page.getByText('#1', { exact: true }).first();
    await expect(issue1Badge).toBeVisible();
  });

  test('ComicDetailModal allows editing Issue # to a negative issue number and saves', async ({ page }) => {
    // Intercept PUT /api/comics/:id
    let savedComic: any = null;
    await page.route(/.*\/api\/comics\/.*/, async (route) => {
      if (route.request().method() === 'PUT') {
        savedComic = route.request().postDataJSON();
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible();

    // Click on the first comic card to open modal
    const comicCard = page.locator('div.cursor-pointer.group').first();
    await expect(comicCard).toBeVisible({ timeout: 10000 });
    await comicCard.click();

    // Verify modal opened and click Edit Values
    const editBtn = page.getByRole('button', { name: /Edit Values/i });
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Verify Issue # input exists and change value to -1
    const issueInput = page.getByPlaceholder('e.g. 1, -1, 300, 1A');
    await expect(issueInput).toBeVisible();
    await issueInput.fill('-1');

    // Click Save in header
    const saveBtn = page.getByRole('button', { name: /^Save$/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify saved payload has issueNumber = '-1' and fullTitle contains '#-1'
    expect(savedComic).not.toBeNull();
    expect(savedComic.issueNumber).toBe('-1');
    expect(savedComic.fullTitle).toContain('#-1');
  });
});
