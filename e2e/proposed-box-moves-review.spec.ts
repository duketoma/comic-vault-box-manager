import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: ['.env.local', '.env'] });

test.describe('Storage Boxes - Proposed Moves Review', () => {
  let targetIds: string[] = [];

  const setupDb = async () => {
    if (process.env.DATABASE_URL) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        await pool.query(`
          UPDATE comic_books 
          SET proposed_box_id = current_box_id 
          WHERE proposed_box_id IS NOT NULL AND proposed_box_id != current_box_id;
        `);
        const selectRes = await pool.query(`
          SELECT id FROM comic_books 
          WHERE id IN ('imported-1790007670336-1218', 'imported-1790007670339-1681')
             OR (title ILIKE '%Silver Surfer%' AND issue_number = '1')
             OR (title ILIKE '%The New Mutants Annual%' AND issue_number = '1')
          ORDER BY CASE WHEN id IN ('imported-1790007670336-1218', 'imported-1790007670339-1681') THEN 0 ELSE 1 END
          LIMIT 2;
        `);
        targetIds = selectRes.rows.map((r: { id: string }) => r.id);
        if (targetIds.length > 0) {
          await pool.query(`
            UPDATE comic_books 
            SET current_box_id = 1, proposed_box_id = 0, reading_status = 'Unread'
            WHERE id = ANY($1);
          `, [targetIds]);
        }
      } catch (e) {
        console.error('Failed to setup test data:', e);
      } finally {
        await pool.end();
      }
    }
  };

  const cleanupDb = async () => {
    if (process.env.DATABASE_URL) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        if (targetIds.length > 0) {
          await pool.query(`
            UPDATE comic_books 
            SET proposed_box_id = 1, reading_status = 'Wishlist'
            WHERE id = ANY($1);
          `, [targetIds]);
        }
        await pool.query(`
          UPDATE comic_books 
          SET proposed_box_id = current_box_id 
          WHERE proposed_box_id IS NOT NULL AND proposed_box_id != current_box_id;
        `);
      } catch (e) {
        console.error('Failed to cleanup test data:', e);
      } finally {
        await pool.end();
      }
    }
  };

  test.beforeEach(async () => {
    await setupDb();
  });

  test.afterAll(async () => {
    await cleanupDb();
  });

  test('displays proposed moves banner and allows viewing, adjusting, and committing moves', async ({ page }) => {
    await page.goto('/');

    // Wait for the app and collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Showing').first()).toBeVisible({ timeout: 15000 });

    // Navigate to Storage Boxes tab
    const storageBoxesTab = page.getByRole('button', { name: /Storage Boxes/i });
    await expect(storageBoxesTab).toBeVisible();
    await storageBoxesTab.click();

    // Verify Rebalancing Proposal Active banner is visible
    const banner = page.locator('text=Rebalancing Proposal Active');
    await expect(banner).toBeVisible({ timeout: 10000 });

    // Verify View Proposed Moves button is visible in both banner and toolbar
    const bannerViewBtn = page.getByRole('button', { name: /View Proposed Moves/i });
    await expect(bannerViewBtn).toBeVisible();

    const toolbarViewBtn = page.getByRole('button', { name: /View Moves \(\d+\)/i });
    await expect(toolbarViewBtn).toBeVisible();

    // Click "View Proposed Moves" to open the review modal
    await bannerViewBtn.click();

    // Verify ProposedMovesModal is opened
    const modalHeading = page.getByRole('heading', { name: 'Proposed Storage Box Moves' });
    await expect(modalHeading).toBeVisible();

    // Verify summary flow chips and comic items inside the modal
    const modal = page.locator('div.fixed.inset-0').filter({ has: modalHeading });
    await expect(modal).toBeVisible();

    // Verify at least one known proposed comic is displayed (e.g. Silver Surfer or The New Mutants Annual)
    const proposedItem = modal.locator('h4').filter({ hasText: /(Silver Surfer|The New Mutants Annual)/i }).first();
    await expect(proposedItem).toBeVisible();

    // Verify origin box and target box are visible for the item
    await expect(modal.locator('text=Box #1').first()).toBeVisible();

    // Verify destination box select exists
    const destinationSelect = modal.locator('select').first();
    await expect(destinationSelect).toBeVisible();

    // Verify item action buttons: "Keep in Box #1" and "Move"
    const keepInBoxBtn = modal.getByRole('button', { name: /Keep in Box/i }).first();
    await expect(keepInBoxBtn).toBeVisible();

    const singleMoveBtn = modal.getByRole('button', { name: /^Move$/i }).first();
    await expect(singleMoveBtn).toBeVisible();

    // Verify footer batch action buttons
    await expect(modal.getByRole('button', { name: /Discard All/i })).toBeVisible();
    await expect(modal.getByRole('button', { name: /Commit All \d+ Moves/i })).toBeVisible();

    // Test reverting a single item to keep in current box
    const savePromise = page.waitForResponse((res) => res.url().includes('/api/comics') && res.request().method() === 'PUT');
    await keepInBoxBtn.click();
    await savePromise;

    // After reverting 1 of the 2 items, modal badge should show "1 Item"
    await expect(modal.locator('text=1 Item').first()).toBeVisible();

    // Close the modal by clicking "Done"
    const doneBtn = modal.getByRole('button', { name: 'Done' });
    await doneBtn.click();
    await expect(modalHeading).not.toBeVisible();

    // Verify banner now reflects 1 comic item proposed
    await expect(page.locator('text=1 comic item').first()).toBeVisible();

    // Re-open via top toolbar button
    const updatedToolbarBtn = page.getByRole('button', { name: /View Moves \(1\)/i });
    await expect(updatedToolbarBtn).toBeVisible();
    await updatedToolbarBtn.click();
    await expect(modalHeading).toBeVisible();

    // Close via close (X) button
    const closeBtn = modal.getByRole('button', { name: 'Close modal' });
    await closeBtn.click();
    await expect(modalHeading).not.toBeVisible();
  });
});
