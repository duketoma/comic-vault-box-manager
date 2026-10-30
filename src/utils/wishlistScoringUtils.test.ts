import { ComicBook, SeriesIssueTotal } from '../types';
import { scoreWishlistComics } from './wishlistScoringUtils';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function createMockComic(partial: Partial<ComicBook> & { id: string; issueNumber: string }): ComicBook {
  return {
    title: 'Comic',
    format: 'Single Issue',
    sizeThickness: 1.0,
    currentBoxId: 1,
    genre: 'Superhero',
    writer: 'Writer',
    artist: 'Artist',
    coverImage: 'NoImage.webp',
    publicationYear: 2000,
    publisher: 'Marvel Comics',
    readingStatus: 'Wishlist',
    ...partial,
  } as ComicBook;
}

console.log('Running Wishlist Gap Filler Priority Scoring unit tests...');

// -----------------------------------------------------------------------------
// Test 1: First issue (#1) with #2 owned -> Maxed out as Full Bridge (score 100)
// -----------------------------------------------------------------------------
{
  const comics: ComicBook[] = [
    createMockComic({
      id: 'c1',
      title: 'Amazing Spider-Man',
      seriesName: 'The Amazing Spider-Man',
      issueNumber: '1',
      readingStatus: 'Wishlist',
      publisher: 'Marvel Comics',
      publicationYear: 1963,
    }),
    createMockComic({
      id: 'c2',
      title: 'Amazing Spider-Man',
      seriesName: 'The Amazing Spider-Man',
      issueNumber: '2',
      readingStatus: 'Read',
      publisher: 'Marvel Comics',
      publicationYear: 1963,
    }),
  ];

  const seriesTotals: SeriesIssueTotal[] = [
    { publisher: 'Marvel Comics', seriesName: 'The Amazing Spider-Man', issueCount: 441 },
  ];

  const results = scoreWishlistComics(comics, seriesTotals);
  assert(results.length === 1, 'Should return 1 scored wishlist comic');
  const scored = results[0];

  assert(scored.gapScore === 100, `Expected gapScore 100, got ${scored.gapScore}`);
  assert(scored.gapType === 'full', `Expected gapType 'full', got ${scored.gapType}`);
  assert(
    scored.gapDetail.includes('First issue of series'),
    `Expected gapDetail to mention First issue of series, got "${scored.gapDetail}"`
  );
  assert(
    scored.gapDetail.includes('bridges to #2'),
    `Expected gapDetail to mention bridges to #2, got "${scored.gapDetail}"`
  );
  console.log('✓ Test 1: First issue (#1) with #2 owned gets Full Bridge (100)');
}

// -----------------------------------------------------------------------------
// Test 2: First issue (#1) with NO adjacent issues owned -> Gap score 0
// -----------------------------------------------------------------------------
{
  const comics: ComicBook[] = [
    createMockComic({
      id: 'c1',
      title: 'Amazing Spider-Man',
      seriesName: 'The Amazing Spider-Man',
      issueNumber: '1',
      readingStatus: 'Wishlist',
      publisher: 'Marvel Comics',
      publicationYear: 1963,
    }),
    createMockComic({
      id: 'c15',
      title: 'Amazing Spider-Man',
      seriesName: 'The Amazing Spider-Man',
      issueNumber: '15',
      readingStatus: 'Read',
      publisher: 'Marvel Comics',
      publicationYear: 1964,
    }),
  ];

  const seriesTotals: SeriesIssueTotal[] = [
    { publisher: 'Marvel Comics', seriesName: 'The Amazing Spider-Man', issueCount: 441 },
  ];

  const results = scoreWishlistComics(comics, seriesTotals);
  const scored = results[0];
  assert(scored.gapScore === 0, `Expected gapScore 0, got ${scored.gapScore}`);
  assert(scored.gapType === 'none', `Expected gapType 'none', got ${scored.gapType}`);
  console.log('✓ Test 2: First issue (#1) without #2 owned gets gapScore 0');
}

// -----------------------------------------------------------------------------
// Test 3: Final issue of series with known total (#12 of 12) with #11 owned -> Full Bridge (100)
// -----------------------------------------------------------------------------
{
  const comics: ComicBook[] = [
    createMockComic({
      id: 'c12',
      title: 'Secret Wars',
      seriesName: 'Marvel Super Heroes Secret Wars',
      issueNumber: '12',
      readingStatus: 'Wishlist',
      publisher: 'Marvel Comics',
      publicationYear: 1985,
    }),
    createMockComic({
      id: 'c11',
      title: 'Secret Wars',
      seriesName: 'Marvel Super Heroes Secret Wars',
      issueNumber: '11',
      readingStatus: 'Read',
      publisher: 'Marvel Comics',
      publicationYear: 1985,
    }),
  ];

  const seriesTotals: SeriesIssueTotal[] = [
    { publisher: 'Marvel Comics', seriesName: 'Marvel Super Heroes Secret Wars', issueCount: 12 },
  ];

  const results = scoreWishlistComics(comics, seriesTotals);
  const scored = results[0];
  assert(scored.gapScore === 100, `Expected gapScore 100, got ${scored.gapScore}`);
  assert(scored.gapType === 'full', `Expected gapType 'full', got ${scored.gapType}`);
  assert(
    scored.gapDetail.includes('Final issue of series'),
    `Expected gapDetail to mention Final issue of series, got "${scored.gapDetail}"`
  );
  assert(
    scored.gapDetail.includes('bridges from #11'),
    `Expected gapDetail to mention bridges from #11, got "${scored.gapDetail}"`
  );
  console.log('✓ Test 3: Final issue of series with known total (#12 of 12) gets Full Bridge (100)');
}

// -----------------------------------------------------------------------------
// Test 4: Final issue of series without known total (4-issue run, #4 wishlisted, #1-3 owned)
// -----------------------------------------------------------------------------
{
  const comics: ComicBook[] = [
    createMockComic({
      id: 'c1',
      title: 'Vision and Scarlet Witch',
      seriesName: 'The Vision and the Scarlet Witch',
      issueNumber: '1',
      readingStatus: 'Read',
      publisher: 'Marvel Comics',
      publicationYear: 1982,
    }),
    createMockComic({
      id: 'c2',
      title: 'Vision and Scarlet Witch',
      seriesName: 'The Vision and the Scarlet Witch',
      issueNumber: '2',
      readingStatus: 'Read',
      publisher: 'Marvel Comics',
      publicationYear: 1982,
    }),
    createMockComic({
      id: 'c3',
      title: 'Vision and Scarlet Witch',
      seriesName: 'The Vision and the Scarlet Witch',
      issueNumber: '3',
      readingStatus: 'Read',
      publisher: 'Marvel Comics',
      publicationYear: 1982,
    }),
    createMockComic({
      id: 'c4',
      title: 'Vision and Scarlet Witch',
      seriesName: 'The Vision and the Scarlet Witch',
      issueNumber: '4',
      readingStatus: 'Wishlist',
      publisher: 'Marvel Comics',
      publicationYear: 1982,
    }),
  ];

  // No seriesTotals passed - effective total inferred from collection + wishlist
  const results = scoreWishlistComics(comics, []);
  const scored = results[0];
  assert(scored.gapScore === 100, `Expected gapScore 100, got ${scored.gapScore}`);
  assert(scored.gapType === 'full', `Expected gapType 'full', got ${scored.gapType}`);
  assert(scored.completesSeries === true, 'Expected completesSeries to be true');
  assert(scored.primaryDriver === 'Series & Gap', `Expected primaryDriver 'Series & Gap', got ${scored.primaryDriver}`);
  console.log('✓ Test 4: Final issue of run without known total completes series with Full Bridge (100)');
}

// -----------------------------------------------------------------------------
// Test 5: Middle issue with both neighbors owned (#2 with #1 and #3 owned) -> Full Bridge (100)
// -----------------------------------------------------------------------------
{
  const comics: ComicBook[] = [
    createMockComic({
      id: 'c1',
      title: 'Batman',
      seriesName: 'Batman',
      issueNumber: '1',
      readingStatus: 'Read',
      publisher: 'DC Comics',
      publicationYear: 1940,
    }),
    createMockComic({
      id: 'c2',
      title: 'Batman',
      seriesName: 'Batman',
      issueNumber: '2',
      readingStatus: 'Wishlist',
      publisher: 'DC Comics',
      publicationYear: 1940,
    }),
    createMockComic({
      id: 'c3',
      title: 'Batman',
      seriesName: 'Batman',
      issueNumber: '3',
      readingStatus: 'Read',
      publisher: 'DC Comics',
      publicationYear: 1940,
    }),
  ];

  const seriesTotals: SeriesIssueTotal[] = [
    { publisher: 'DC Comics', seriesName: 'Batman', issueCount: 713 },
  ];

  const results = scoreWishlistComics(comics, seriesTotals);
  const scored = results[0];
  assert(scored.gapScore === 100, `Expected gapScore 100, got ${scored.gapScore}`);
  assert(scored.gapType === 'full', `Expected gapType 'full', got ${scored.gapType}`);
  assert(
    scored.gapDetail.includes('Bridges gap between #1 & #3'),
    `Expected gapDetail 'Bridges gap between #1 & #3', got "${scored.gapDetail}"`
  );
  console.log('✓ Test 5: Middle issue between two owned issues gets Full Bridge (100)');
}

// -----------------------------------------------------------------------------
// Test 6: Middle issue with only one neighbor owned (#5 with #4 owned, #6 not owned) -> Half Gap (50)
// -----------------------------------------------------------------------------
{
  const comics: ComicBook[] = [
    createMockComic({
      id: 'c4',
      title: 'Daredevil',
      seriesName: 'Daredevil',
      issueNumber: '4',
      readingStatus: 'Read',
      publisher: 'Marvel Comics',
      publicationYear: 1964,
    }),
    createMockComic({
      id: 'c5',
      title: 'Daredevil',
      seriesName: 'Daredevil',
      issueNumber: '5',
      readingStatus: 'Wishlist',
      publisher: 'Marvel Comics',
      publicationYear: 1964,
    }),
  ];

  const seriesTotals: SeriesIssueTotal[] = [
    { publisher: 'Marvel Comics', seriesName: 'Daredevil', issueCount: 380 },
  ];

  const results = scoreWishlistComics(comics, seriesTotals);
  const scored = results[0];
  assert(scored.gapScore === 50, `Expected gapScore 50, got ${scored.gapScore}`);
  assert(scored.gapType === 'half_prev', `Expected gapType 'half_prev', got ${scored.gapType}`);
  assert(
    scored.gapDetail.includes('Extends run after #4'),
    `Expected gapDetail 'Extends run after #4', got "${scored.gapDetail}"`
  );
  console.log('✓ Test 6: Middle issue with one neighbor remains Half Gap (50)');
}

// -----------------------------------------------------------------------------
// Test 7: Sequentially numbered Annual #1 with Annual #2 owned -> Full Bridge (100)
// -----------------------------------------------------------------------------
{
  const comics: ComicBook[] = [
    createMockComic({
      id: 'a1',
      title: 'Amazing Spider-Man Annual',
      seriesName: 'The Amazing Spider-Man',
      issueNumber: 'Annual 1',
      readingStatus: 'Wishlist',
      publisher: 'Marvel Comics',
      publicationYear: 1964,
    }),
    createMockComic({
      id: 'a2',
      title: 'Amazing Spider-Man Annual',
      seriesName: 'The Amazing Spider-Man',
      issueNumber: 'Annual 2',
      readingStatus: 'Read',
      publisher: 'Marvel Comics',
      publicationYear: 1965,
    }),
  ];

  const seriesTotals: SeriesIssueTotal[] = [
    { publisher: 'Marvel Comics', seriesName: 'The Amazing Spider-Man', issueCount: 30 },
  ];

  const results = scoreWishlistComics(comics, seriesTotals);
  const scored = results[0];
  assert(scored.gapScore === 100, `Expected gapScore 100, got ${scored.gapScore}`);
  assert(scored.gapType === 'full', `Expected gapType 'full', got ${scored.gapType}`);
  assert(
    scored.gapDetail.includes('First Annual of series'),
    `Expected gapDetail to mention First Annual, got "${scored.gapDetail}"`
  );
  console.log('✓ Test 7: Sequentially numbered Annual #1 with Annual #2 owned gets Full Bridge (100)');
}

// -----------------------------------------------------------------------------
// Test 8: 100% series completion immediately sets gapScore to 100 and skips gap calculation
// -----------------------------------------------------------------------------
{
  const comics: ComicBook[] = [
    createMockComic({
      id: 'os1',
      title: 'Batman: The Killing Joke',
      seriesName: 'Batman: The Killing Joke',
      issueNumber: '1',
      readingStatus: 'Wishlist',
      publisher: 'DC Comics',
      publicationYear: 1988,
    }),
  ];

  const seriesTotals: SeriesIssueTotal[] = [
    { publisher: 'DC Comics', seriesName: 'Batman: The Killing Joke', issueCount: 1 },
  ];

  const results = scoreWishlistComics(comics, seriesTotals);
  const scored = results[0];
  assert(scored.completesSeries === true, 'Expected completesSeries to be true');
  assert(scored.seriesScore === 100, `Expected seriesScore 100, got ${scored.seriesScore}`);
  assert(scored.gapScore === 100, `Expected gapScore 100 upon 100% series completion, got ${scored.gapScore}`);
  assert(scored.gapType === 'full', `Expected gapType 'full', got ${scored.gapType}`);
  assert(
    scored.gapDetail.includes('Completes 100% of series run'),
    `Expected gapDetail to state Completes 100% of series run, got "${scored.gapDetail}"`
  );
  assert(scored.primaryDriver === 'Series & Gap', `Expected primaryDriver 'Series & Gap', got ${scored.primaryDriver}`);
  console.log('✓ Test 8: 100% series completion sets gapScore = 100 immediately');
}

console.log('\nALL WISHLIST GAP FILLER PRIORITY SCORING TESTS PASSED SUCCESSFULLY! 🎉\n');
