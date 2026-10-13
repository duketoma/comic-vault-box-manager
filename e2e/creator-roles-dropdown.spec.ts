import { test, expect } from '@playwright/test';

test.describe('Comic Detail Modal - Comprehensive Creator Role Types Dropdown', () => {
  test('Role dropdown displays all database and standard creator types and supports custom roles', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');

    // Wait for the app and collection to load from database
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Showing').first()).toContainText(/\b\d{3,}\b/, { timeout: 15000 });

    // Click on the first comic card to open ComicDetailModal
    const comicCard = page.locator('div.cursor-pointer.group').first();
    await expect(comicCard).toBeVisible({ timeout: 10000 });
    await comicCard.click();

    // Scope locators to the modal for fast lookup avoiding the 2800+ card grid
    const modal = page.locator('.fixed.inset-0').filter({ has: page.locator('button[title="Close (Esc)"]') });
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Click "Edit Values" button in modal
    const editBtn = modal.getByRole('button', { name: /Edit Values/i });
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();

    // Verify Edit Mode is active (button says "Cancel")
    await expect(modal.getByRole('button', { name: 'Cancel' }).first()).toBeVisible();

    // Locate the Creator Contributions section Role dropdown
    const roleSelect = modal.locator('select').filter({ hasText: '+ Custom Role Type...' });
    await expect(roleSelect).toBeVisible();

    // Verify all types are present in the options:
    const options = await roleSelect.locator('option').allTextContents();

    // 1. Generic Artist
    expect(options).toContain('Artist');

    // 2. Preserved 'None' and 'Other'
    expect(options).toContain('None');
    expect(options).toContain('Other');

    // 3. Database types from spreadsheet
    expect(options).toContain('Cover Artist');
    expect(options).toContain('Variant Cover Artist');
    expect(options).toContain('Penciller');
    expect(options).toContain('Penciler');
    expect(options).toContain('Designer');
    expect(options).toContain('Associate Editor');
    expect(options).toContain('Executive Editor');

    // 4. Custom role option
    expect(options).toContain('+ Custom Role Type...');

    // Select "Artist" and add a test creator
    const testArtistName = `Jack Kirby Test ${Date.now()}`;
    const testCustomName = `Alex Toth Test ${Date.now()}`;

    await roleSelect.selectOption('Artist');
    const creatorInput = modal.locator('input[placeholder*="Creator Name"]');
    await creatorInput.fill(testArtistName);

    const addRoleBtn = modal.locator('button:has-text("Add Role")');
    await expect(addRoleBtn).toBeVisible();
    await addRoleBtn.dispatchEvent('click');

    // Verify the newly added badge is displayed
    const artistBadge = modal.locator('.inline-flex').filter({ hasText: testArtistName }).first();
    await expect(artistBadge).toBeVisible();
    await expect(artistBadge).toContainText('Artist');

    // Now test custom role type
    await roleSelect.selectOption('__custom__');
    const customRoleInput = modal.locator('input[placeholder*="custom role"]');
    await expect(customRoleInput).toBeVisible();
    await customRoleInput.fill('Storyboard Artist');

    await creatorInput.fill(testCustomName);
    await addRoleBtn.dispatchEvent('click');

    // Verify custom role badge is displayed
    const customBadge = modal.locator('.inline-flex').filter({ hasText: testCustomName }).first();
    await expect(customBadge).toBeVisible();
    await expect(customBadge).toContainText('Storyboard Artist');

    // Save changes
    const saveBtn = modal.getByRole('button', { name: /^Save$/i }).first();
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify edit mode exited (button says "Edit Values" again)
    await expect(modal.getByRole('button', { name: /Edit Values/i })).toBeVisible({ timeout: 5000 });

    // Verify badges remain on the comic after saving
    await expect(modal.locator('.inline-flex').filter({ hasText: testArtistName }).first()).toBeVisible();
    await expect(modal.locator('.inline-flex').filter({ hasText: testCustomName }).first()).toBeVisible();
  });
});
