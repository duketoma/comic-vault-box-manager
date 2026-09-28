import { test, expect } from '@playwright/test';
import { ComicBook } from '../src/types';

test.describe('Catalog View Multi-Sort and Annuals Separation', () => {
  const sampleComics: ComicBook[] = [
    {
      id: 'dc-bm-1',
      title: 'Batman',
      seriesName: 'Batman (Vol. 1)',
      issueNumber: '1',
      volume: 'Vol. 1',
      publisher: 'DC Comics',
      publicationYear: 1940,
      genre: 'Superhero',
      writer: 'Bill Finger',
      artist: 'Bob Kane',
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 3,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Fine',
      tags: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'marvel-ff-20',
      title: 'Fantastic Four',
      seriesName: 'Fantastic Four (Vol. 1)',
      issueNumber: '20',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1963,
      genre: 'Superhero',
      writer: 'Stan Lee',
      artist: 'Jack Kirby',
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Very Fine',
      tags: [],
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    },
    {
      id: 'marvel-ff-ann-20',
      title: 'Fantastic Four Annual',
      fullTitle: 'Fantastic Four Annual #20',
      seriesName: 'Fantastic Four (Vol. 1)',
      issueNumber: '20',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1987,
      genre: 'Superhero',
      writer: 'Steve Englehart',
      artist: 'John Buscema',
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
      format: 'Single Issue',
      sizeThickness: 1.2,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Near Mint',
      tags: ['Annual'],
      createdAt: '2025-01-03T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z',
    },
    {
      id: 'marvel-ff-1',
      title: 'Fantastic Four',
      seriesName: 'Fantastic Four (Vol. 1)',
      issueNumber: '1',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1961,
      genre: 'Superhero',
      writer: 'Stan Lee',
      artist: 'Jack Kirby',
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Good',
      tags: ['Key Issue'],
      createdAt: '2025-01-04T00:00:00.000Z',
      updatedAt: '2025-01-04T00:00:00.000Z',
    },
    {
      id: 'marvel-ff-ann-1',
      title: 'Fantastic Four Annual',
      fullTitle: 'Fantastic Four Annual #1',
      seriesName: 'Fantastic Four (Vol. 1)',
      issueNumber: '1',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1963,
      genre: 'Superhero',
      writer: 'Stan Lee',
      artist: 'Jack Kirby',
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
      format: 'Single Issue',
      sizeThickness: 1.5,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Fine',
      tags: ['Annual'],
      createdAt: '2025-01-05T00:00:00.000Z',
      updatedAt: '2025-01-05T00:00:00.000Z',
    },
    {
      id: 'marvel-event-cw',
      title: 'The Amazing Spider-Man',
      seriesName: 'The Amazing Spider-Man',
      issueNumber: '532',
      event: 'Civil War',
      publisher: 'Marvel Comics',
      publicationYear: 2006,
      genre: 'Superhero',
      writer: 'J. Michael Straczynski',
      artist: 'Ron Garney',
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
      format: 'Single Issue',
      sizeThickness: 1.0,
      currentBoxId: 9,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Near Mint',
      tags: ['Civil War'],
      createdAt: '2025-01-06T00:00:00.000Z',
      updatedAt: '2025-01-06T00:00:00.000Z',
    },
    {
      id: 'marvel-event-atlantis',
      title: 'Fantastic Four Annual',
      fullTitle: 'Fantastic Four Annual #22',
      seriesName: 'Fantastic Four (Vol. 1)',
      issueNumber: '22',
      event: 'Atlantis Attacks',
      publisher: 'Marvel Comics',
      publicationYear: 1989,
      genre: 'Superhero',
      writer: 'Roy Thomas',
      artist: 'Rich Buckler',
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
      format: 'Single Issue',
      sizeThickness: 1.2,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 1,
      condition: 'Near Mint',
      tags: ['Atlantis Attacks', 'Annual'],
      createdAt: '2025-01-07T00:00:00.000Z',
      updatedAt: '2025-01-07T00:00:00.000Z',
    },
  ];

  test('Catalog View renders multi-sort UI and separates Annuals from normal titles', async ({ page }) => {
    await page.addInitScript((comics) => {
      window.localStorage.setItem('comic_vault_comics', JSON.stringify(comics));
      window.localStorage.removeItem('comic_vault_catalog_sort_v1');
    }, sampleComics);

    await page.goto('/');

    // Verify main app loaded
    await expect(page.getByRole('heading', { name: 'Comic Archive Pro' })).toBeVisible({ timeout: 10000 });

    // Navigate to Catalog
    const catalogTab = page.getByRole('button', { name: /Catalog/i });
    await catalogTab.click();

    // Check that the Multi-Sort Breadcrumb / Hierarchy bar is visible
    await expect(page.locator('text=Sort Hierarchy:')).toBeVisible();
    await expect(page.locator('text=Annuals: Separate ✓')).toBeVisible();

    // Verify the preset button or tag exists in the sort chain
    await expect(page.getByRole('button', { name: /Publisher/i }).first()).toBeVisible();

    // Filter to Fantastic Four to verify Annuals separation within a series
    const searchInput = page.getByPlaceholder(/Search title, writer/i);
    await searchInput.fill('Fantastic Four');

    // Collect all card elements in order
    const cardLocators = page.locator('div.group.bg-white');
    await expect(cardLocators.first()).toBeVisible();

    const cardCount = await cardLocators.count();
    const renderedItems: { title: string; issue: string }[] = [];

    for (let i = 0; i < cardCount; i++) {
      const card = cardLocators.nth(i);
      const title = (await card.locator('h3').first().textContent()) || '';
      const issue = (await card.locator('span.font-extrabold').first().textContent()) || '';
      renderedItems.push({ title: title.trim(), issue: issue.trim() });
    }

    console.log('Rendered Fantastic Four Items:', renderedItems);

    // Regular issues should be grouped in numerical order (#1, #20)
    // Followed by Annuals (#1, #20, #22)
    const ff1Idx = renderedItems.findIndex(
      (item) => item.title.includes('Fantastic Four') && !item.title.includes('Annual') && item.issue === '#1'
    );
    const ff20Idx = renderedItems.findIndex(
      (item) => item.title.includes('Fantastic Four') && !item.title.includes('Annual') && item.issue === '#20'
    );
    const ffAnn1Idx = renderedItems.findIndex(
      (item) => item.title.includes('Fantastic Four Annual') && item.issue === '#1'
    );
    const ffAnn20Idx = renderedItems.findIndex(
      (item) => item.title.includes('Fantastic Four Annual') && item.issue === '#20'
    );

    expect(ff1Idx).toBeGreaterThanOrEqual(0);
    expect(ff20Idx).toBeGreaterThan(ff1Idx); // #1 before #20
    expect(ffAnn1Idx).toBeGreaterThan(ff20Idx); // Annuals after all regular issues!
    expect(ffAnn20Idx).toBeGreaterThan(ffAnn1Idx); // Annual #1 before Annual #20!
  });

  test('Customize Multi-Sort modal allows reordering and changing criteria', async ({ page }) => {
    await page.addInitScript((comics) => {
      window.localStorage.setItem('comic_vault_comics', JSON.stringify(comics));
    }, sampleComics);

    await page.goto('/');

    const catalogTab = page.getByRole('button', { name: /Catalog/i });
    await catalogTab.click();

    // Click Customize Multi-Sort button
    const customizeBtn = page.getByRole('button', { name: /Customize Multi-Sort/i });
    await customizeBtn.click();

    // Verify modal is open
    await expect(page.getByRole('heading', { name: 'Catalog Sort Order' })).toBeVisible();

    // Verify preset buttons are displayed inside modal
    const boxOrganizerBtn = page.getByRole('button', { name: /Box Organizer/i });
    await expect(boxOrganizerBtn.first()).toBeVisible();

    const seriesIssueBtn = page.getByRole('button', { name: /Series & Issue/i });
    await expect(seriesIssueBtn.first()).toBeVisible();

    // Click "Chronological Release Date" preset button
    const chronoBtn = page.getByRole('button', { name: /Chronological Release Date/i });
    await chronoBtn.click();

    // Close the modal
    const closeBtn = page.getByRole('button', { name: 'Apply & Close' });
    await closeBtn.click();

    // Verify the breadcrumb bar updated
    await expect(page.locator('text=Release Date').first()).toBeVisible();
  });
});
