import { test, expect } from '@playwright/test';

test.describe('Comic Detail Modal - Comprehensive Creator Role Types Dropdown', () => {
  test('Role dropdown displays all database and standard creator types and supports custom roles', async ({ page }) => {
    await page.goto('/');

    // Wait for the app and collection to load
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 15000 });

    // Ensure we are on Catalog View
    const catalogTab = page.getByRole('button', { name: /Catalog/i });
    await catalogTab.click();

    // Click on the first comic card to open ComicDetailModal
    // Click on the first comic card to open modal
    const comicCard = page.locator('div.cursor-pointer.group').first();
    await expect(comicCard).toBeVisible({ timeout: 10000 });
    await comicCard.click();

    // Click "Edit Values" button in modal
    const editBtn = page.getByRole('button', { name: /Edit Values/i });
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();

    // Verify Edit Mode is active (button says "Cancel")
    await expect(page.getByRole('button', { name: 'Cancel' }).first()).toBeVisible();

    // Locate the Creator Contributions section Role dropdown
    const roleSelect = page.locator('select').filter({ hasText: '+ Custom Role Type...' });
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
    await roleSelect.selectOption('Artist');
    const creatorInput = page.locator('input[placeholder*="Creator Name"]');
    await creatorInput.fill('Jack Kirby Test');

    const addRoleBtn = page.locator('button:has-text("Add Role")');
    await expect(addRoleBtn).toBeVisible();
    await addRoleBtn.click();

    // Verify the newly added badge is displayed
    const artistBadge = page.locator('.inline-flex').filter({ hasText: 'Jack Kirby Test' });
    await expect(artistBadge).toBeVisible();
    await expect(artistBadge).toContainText('Artist');

    // Now test custom role type
    await roleSelect.selectOption('__custom__');
    const customRoleInput = page.locator('input[placeholder*="custom role"]');
    await expect(customRoleInput).toBeVisible();
    await customRoleInput.fill('Storyboard Artist');

    await creatorInput.fill('Alex Toth Test');
    await addRoleBtn.click();

    // Verify custom role badge is displayed
    const customBadge = page.locator('.inline-flex').filter({ hasText: 'Alex Toth Test' });
    await expect(customBadge).toBeVisible();
    await expect(customBadge).toContainText('Storyboard Artist');

    // Save changes
    const saveBtn = page.getByRole('button', { name: /^Save$/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify edit mode exited (button says "Edit Values" again)
    await expect(page.getByRole('button', { name: /Edit Values/i })).toBeVisible({ timeout: 5000 });

    // Verify badges remain on the comic after saving
    await expect(page.locator('.inline-flex').filter({ hasText: 'Jack Kirby Test' })).toBeVisible();
    await expect(page.locator('.inline-flex').filter({ hasText: 'Alex Toth Test' })).toBeVisible();
  });
});
