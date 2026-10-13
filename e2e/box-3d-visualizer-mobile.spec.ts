import { test, expect } from '@playwright/test';

test.describe('3D Box Visualizer Mobile & Touch Accessibility', () => {
  const viewports = [
    { name: 'Pixel 7 Portrait', width: 412, height: 915 },
    { name: 'Pixel 7 Landscape', width: 915, height: 412 },
    { name: 'iPhone SE Portrait', width: 375, height: 667 },
  ];

  for (const vp of viewports) {
    test(`Visualizer controls and touch targets are accessible on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      await page.route('**/api/collection', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            comics: [
              {
                id: 'c1',
                title: 'Batman',
                issueNumber: '404',
                publisher: 'DC',
                publicationYear: 1987,
                genre: 'Superhero',
                writer: 'Frank Miller',
                artist: 'David Mazzucchelli',
                coverImage: 'NoImage.png',
                format: 'Single Issue',
                sizeThickness: 1.0,
                currentBoxId: 1,
                readingStatus: 'Unread',
                condition: 'Near Mint',
                tags: [],
              },
            ],
            boxes: [
              { id: 1, name: 'Box 01', location: 'Shelf', maxCapacity: 150, colorTag: '#4f46e5' },
            ],
            seriesTotals: [],
            creatorTypes: [],
          }),
        });
      });

      await page.route('**/api/boxes/*/comics', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            box: { id: 1, name: 'Box 01' },
            comics: [
              {
                id: 'c1',
                title: 'Batman',
                issueNumber: '404',
                publisher: 'DC',
                publicationYear: 1987,
                genre: 'Superhero',
                writer: 'Frank Miller',
                artist: 'David Mazzucchelli',
                coverImage: 'NoImage.png',
                format: 'Single Issue',
                sizeThickness: 1.0,
                currentBoxId: 1,
                readingStatus: 'Unread',
                condition: 'Near Mint',
                tags: [],
              },
            ],
            count: 1,
          }),
        });
      });

      await page.goto('/');

      // Navigate to Storage Boxes
      const boxTab = page.getByRole('button', { name: /Boxes/i }).first();
      await boxTab.click();

      // Open 3D Visualizer
      const view3DBtn = page.getByTitle('View in 3D').first();
      await expect(view3DBtn).toBeVisible();
      await view3DBtn.scrollIntoViewIfNeeded();
      await view3DBtn.click();

      // Verify modal is open
      await expect(page.getByRole('heading', { name: '3D Box Visualizer' })).toBeVisible();

      // Check Close (X) button dimensions (must be >= 40px for mobile touch)
      const closeBtn = page.getByRole('button', { name: 'Close 3D Visualizer' });
      await expect(closeBtn).toBeVisible();
      const closeBox = await closeBtn.boundingBox();
      expect(closeBox).not.toBeNull();
      if (closeBox) {
        expect(closeBox.width).toBeGreaterThanOrEqual(40);
        expect(closeBox.height).toBeGreaterThanOrEqual(40);
      }

      // Check Previous & Next Comic buttons dimensions
      const prevBtn = page.getByTitle('Previous Comic in Box');
      await expect(prevBtn).toBeVisible();
      const prevBox = await prevBtn.boundingBox();
      expect(prevBox).not.toBeNull();
      if (prevBox) {
        expect(prevBox.width).toBeGreaterThanOrEqual(38);
        expect(prevBox.height).toBeGreaterThanOrEqual(38);
      }

      const nextBtn = page.getByTitle('Next Comic in Box');
      await expect(nextBtn).toBeVisible();
      const nextBox = await nextBtn.boundingBox();
      expect(nextBox).not.toBeNull();
      if (nextBox) {
        expect(nextBox.width).toBeGreaterThanOrEqual(38);
        expect(nextBox.height).toBeGreaterThanOrEqual(38);
      }

      // Check Reset Camera button dimensions
      const resetBtn = page.getByTitle('Reset 3D Camera to Default Angle');
      await expect(resetBtn).toBeVisible();
      const resetBox = await resetBtn.boundingBox();
      expect(resetBox).not.toBeNull();
      if (resetBox) {
        expect(resetBox.width).toBeGreaterThanOrEqual(38);
        expect(resetBox.height).toBeGreaterThanOrEqual(38);
      }

      // Test dismissing via close button
      await closeBtn.click();
      await expect(page.getByRole('heading', { name: '3D Box Visualizer' })).not.toBeVisible();

      // Reopen and test dismissing via Escape key
      await view3DBtn.click();
      await expect(page.getByRole('heading', { name: '3D Box Visualizer' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { name: '3D Box Visualizer' })).not.toBeVisible();
    });
  }
});
