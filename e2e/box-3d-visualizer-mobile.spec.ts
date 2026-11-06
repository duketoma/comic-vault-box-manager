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
                coverImage: 'NoImage.webp',
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
                coverImage: 'NoImage.webp',
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

      // Wait for modal entrance spring animation (comic-modal-spring-full: 480ms) to settle
      await page.waitForTimeout(550);

      // Check Close (X) button dimensions (must be >= 40px for mobile touch)
      const closeBtn = page.getByRole('button', { name: 'Close 3D Visualizer' });
      await expect(closeBtn).toBeVisible();
      const closeBox = await closeBtn.boundingBox();
      expect(closeBox).not.toBeNull();
      if (closeBox) {
        expect(Math.round(closeBox.width)).toBeGreaterThanOrEqual(40);
        expect(Math.round(closeBox.height)).toBeGreaterThanOrEqual(40);
      }

      // Check Previous & Next Comic buttons dimensions
      const prevBtn = page.getByTitle('Previous Comic in Box');
      await expect(prevBtn).toBeVisible();
      const prevBox = await prevBtn.boundingBox();
      expect(prevBox).not.toBeNull();
      if (prevBox) {
        expect(Math.round(prevBox.width)).toBeGreaterThanOrEqual(38);
        expect(Math.round(prevBox.height)).toBeGreaterThanOrEqual(38);
      }

      const nextBtn = page.getByTitle('Next Comic in Box');
      await expect(nextBtn).toBeVisible();
      const nextBox = await nextBtn.boundingBox();
      expect(nextBox).not.toBeNull();
      if (nextBox) {
        expect(Math.round(nextBox.width)).toBeGreaterThanOrEqual(38);
        expect(Math.round(nextBox.height)).toBeGreaterThanOrEqual(38);
      }

      // Check Reset Camera button dimensions
      const resetBtn = page.getByTitle('Reset 3D Camera to Default Angle');
      await expect(resetBtn).toBeVisible();
      const resetBox = await resetBtn.boundingBox();
      expect(resetBox).not.toBeNull();
      if (resetBox) {
        expect(Math.round(resetBox.width)).toBeGreaterThanOrEqual(38);
        expect(Math.round(resetBox.height)).toBeGreaterThanOrEqual(38);
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

  test('Box #17 renders in 3D Visualizer with Event comics first (Box Organizer order)', async ({ page }) => {
    await page.route('**/api/boxes/17/comics', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          box: { id: 17, name: 'Box 17' },
          comics: [
            {
              id: 'c-air-raiders',
              title: 'Air Raiders',
              seriesName: 'Air Raiders',
              issueNumber: '3',
              publisher: 'Marvel Comics',
              publicationYear: 1988,
              coverImage: 'NoImage.webp',
              format: 'Single Issue',
              sizeThickness: 1.0,
              currentBoxId: 17,
              readingStatus: 'Read',
              condition: 'Near Mint',
            },
            {
              id: 'c-alf',
              title: 'ALF',
              seriesName: 'ALF',
              issueNumber: '12',
              publisher: 'Marvel Comics',
              publicationYear: 1988,
              coverImage: 'NoImage.webp',
              format: 'Single Issue',
              sizeThickness: 1.0,
              currentBoxId: 17,
              readingStatus: 'Read',
              condition: 'Near Mint',
            },
            {
              id: 'c-ff-ann-21',
              title: 'Fantastic Four Annual',
              seriesName: 'Fantastic Four (Vol. 1)',
              issueNumber: '21',
              publisher: 'Marvel Comics',
              event: 'Evolutionary War',
              publicationYear: 1988,
              coverImage: 'NoImage.webp',
              format: 'Annual',
              sizeThickness: 1.0,
              currentBoxId: 17,
              readingStatus: 'Read',
              condition: 'Near Mint',
            },
            {
              id: 'c-xf-ann-3',
              title: 'X-Factor Annual',
              seriesName: 'X-Factor (Vol. 1)',
              issueNumber: '3',
              publisher: 'Marvel Comics',
              event: 'Evolutionary War',
              publicationYear: 1988,
              coverImage: 'NoImage.webp',
              format: 'Annual',
              sizeThickness: 1.0,
              currentBoxId: 17,
              readingStatus: 'Read',
              condition: 'Near Mint',
            },
          ],
          count: 4,
        }),
      });
    });

    await page.goto('/');

    // Navigate to Storage Boxes
    const boxTab = page.getByRole('button', { name: /Boxes/i }).first();
    await boxTab.click();

    // Find Box #17 card and click its View in 3D button
    const box17Card = page.getByTestId('box-card-17');
    await expect(box17Card).toBeVisible({ timeout: 15000 });
    const view3DBtn = box17Card.getByTitle('View in 3D');
    await expect(view3DBtn).toBeVisible();
    await view3DBtn.scrollIntoViewIfNeeded();
    await view3DBtn.click();

    // Verify 3D Visualizer modal is open
    await expect(page.getByRole('heading', { name: '3D Box Visualizer' })).toBeVisible();

    // Wait for entrance spring animation to settle
    await page.waitForTimeout(550);

    // Click Next Comic in Box to select the very first comic
    const nextBtn = page.getByTitle('Next Comic in Box');
    await expect(nextBtn).toBeVisible({ timeout: 15000 });
    await nextBtn.click();

    // Verify the first comic in Box 17 is an Evolutionary War Event comic (Fantastic Four Annual #21)
    await expect(page.getByText('Fantastic Four Annual').first()).toBeVisible();
    await expect(page.getByText('Evolutionary War').first()).toBeVisible();
  });
});
