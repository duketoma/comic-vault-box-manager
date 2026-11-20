import assert from 'node:assert/strict';
import {
  normalizeComicSearchParts,
  parseVolumeNumber,
  selectBestPriceChartingCandidate,
  PriceChartingCandidate,
} from '../services/valuationEngine.ts';

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    throw err;
  }
}

console.log('Running Valuation Engine volume & year matching unit tests...');

runTest('parseVolumeNumber extracts volume from explicit volume field and series/title strings', () => {
  assert.equal(parseVolumeNumber({ title: 'Silver Surfer', volume: '3' }), 3);
  assert.equal(parseVolumeNumber({ title: 'Silver Surfer', volume: 'Vol. 3' }), 3);
  assert.equal(parseVolumeNumber({ title: 'Silver Surfer', volume: 'Volume 3' }), 3);
  assert.equal(parseVolumeNumber({ title: 'Silver Surfer', volume: 'v3' }), 3);
  assert.equal(parseVolumeNumber({ title: 'Silver Surfer', seriesName: 'Silver Surfer (Vol. 3)' }), 3);
  assert.equal(parseVolumeNumber({ title: 'Silver Surfer, Vol. 3' }), 3);
  assert.equal(parseVolumeNumber({ title: 'Silver Surfer', volume: '1987' }), undefined);
  assert.equal(parseVolumeNumber({ title: 'Silver Surfer' }), undefined);
});

runTest('normalizeComicSearchParts cleans parenthesized/comma volume tags and separates cache keys by volume', () => {
  const v3 = normalizeComicSearchParts({
    title: 'Silver Surfer',
    seriesName: 'Silver Surfer (Vol. 3)',
    issueNumber: '1',
    volume: 'Vol. 3',
  });
  assert.equal(v3.cleanTitle, 'Silver Surfer');
  assert.equal(v3.cleanIssue, '1');
  assert.equal(v3.volumeNumber, 3);

  const v3Comma = normalizeComicSearchParts({
    title: 'Silver Surfer, Vol. 3',
    issueNumber: '1',
  });
  assert.equal(v3Comma.cleanTitle, 'Silver Surfer');
  assert.equal(v3Comma.volumeNumber, 3);

  const v1 = normalizeComicSearchParts({
    title: 'Silver Surfer',
    seriesName: 'Silver Surfer (Vol. 1)',
    issueNumber: '1',
    volume: 'Vol. 1',
  });
  assert.notEqual(v1.cacheKey, v3.cacheKey, 'Vol. 1 and Vol. 3 must not collide in quote cache');
});

runTest('normalizeComicSearchParts derives seriesStartYear for issue #1 when year is missing or current-year placeholder', () => {
  const noYear = normalizeComicSearchParts({
    title: 'Silver Surfer',
    seriesName: 'Silver Surfer (1987 - 1998)',
    issueNumber: '1',
    volume: '3',
  });
  assert.equal(noYear.cleanTitle, 'Silver Surfer');
  assert.equal(noYear.seriesStartYear, 1987);
  assert.equal(noYear.seriesEndYear, 1998);
  assert.equal(noYear.year, 1987);

  const placeholderYear = normalizeComicSearchParts({
    title: 'Silver Surfer',
    seriesName: 'Silver Surfer (1987 - 1998)',
    issueNumber: '1',
    volume: '3',
    publicationYear: new Date().getFullYear(),
  });
  assert.equal(placeholderYear.year, 1987);
});

const silverSurferSearchCandidates: PriceChartingCandidate[] = [
  {
    title: 'Silver Surfer #1 (1968)',
    url: 'https://www.pricecharting.com/game/comic-books-silver-surfer/silver-surfer-1-1968',
    rowYear: 1968,
    isVariant: false,
    exactSeriesMatch: true,
    wordScore: 22,
    ungraded: 294.31,
  },
  {
    title: 'Silver Surfer #1 (1987)',
    url: 'https://www.pricecharting.com/game/comic-books-silver-surfer/silver-surfer-1-1987',
    rowYear: 1987,
    isVariant: false,
    exactSeriesMatch: true,
    wordScore: 22,
    ungraded: 8.2,
  },
  {
    title: 'Silver Surfer #1 (1988)',
    url: 'https://www.pricecharting.com/game/comic-books-silver-surfer/silver-surfer-1-1988',
    rowYear: 1988,
    isVariant: false,
    exactSeriesMatch: true,
    wordScore: 22,
    ungraded: 12.14,
  },
  {
    title: 'Silver Surfer #1 (1978)',
    url: 'https://www.pricecharting.com/game/comic-books-silver-surfer/silver-surfer-1-1978',
    rowYear: 1978,
    isVariant: false,
    exactSeriesMatch: true,
    wordScore: 22,
    ungraded: 39.99,
  },
  {
    title: 'Silver Surfer #1 (2016)',
    url: 'https://www.pricecharting.com/game/comic-books-silver-surfer/silver-surfer-1-2016',
    rowYear: 2016,
    isVariant: false,
    exactSeriesMatch: true,
    wordScore: 22,
    ungraded: 9.98,
  },
  {
    title: 'Silver Surfer #1 (2007)',
    url: 'https://www.pricecharting.com/game/comic-books-silver-surfer/silver-surfer-1-2007',
    rowYear: 2007,
    isVariant: false,
    exactSeriesMatch: true,
    wordScore: 22,
    ungraded: 81.76,
  },
];

runTest('selectBestPriceChartingCandidate matches Silver Surfer #1 Vol. 3 (1987) with exact year', () => {
  const picked = selectBestPriceChartingCandidate(silverSurferSearchCandidates, {
    cleanTitle: 'Silver Surfer',
    year: 1987,
    volumeNumber: 3,
    queryWantsVariant: false,
  });
  assert.ok(picked);
  assert.equal(picked.candidate.rowYear, 1987);
  assert.equal(picked.candidate.title, 'Silver Surfer #1 (1987)');
});

runTest('selectBestPriceChartingCandidate matches Silver Surfer #1 (1987) even with 2-year wishlist projection drift (1985)', () => {
  const picked = selectBestPriceChartingCandidate(silverSurferSearchCandidates, {
    cleanTitle: 'Silver Surfer',
    year: 1985,
    volumeNumber: 3,
    queryWantsVariant: false,
  });
  assert.ok(picked);
  assert.equal(picked.candidate.rowYear, 1987);
});

runTest('selectBestPriceChartingCandidate NEVER matches 1968 Vol. 1 when volumeNumber=3 and year is omitted', () => {
  const picked = selectBestPriceChartingCandidate(silverSurferSearchCandidates, {
    cleanTitle: 'Silver Surfer',
    volumeNumber: 3,
    queryWantsVariant: false,
  });
  assert.ok(picked);
  assert.notEqual(picked.candidate.rowYear, 1968);
  assert.equal(picked.candidate.rowYear, 1987);
});

runTest('selectBestPriceChartingCandidate matches 1968 Vol. 1 when volumeNumber=1 and year is omitted', () => {
  const picked = selectBestPriceChartingCandidate(silverSurferSearchCandidates, {
    cleanTitle: 'Silver Surfer',
    volumeNumber: 1,
    queryWantsVariant: false,
  });
  assert.ok(picked);
  assert.equal(picked.candidate.rowYear, 1968);
});

runTest('selectBestPriceChartingCandidate returns null for Vol. 2+ when console page only contains Vol. 1', () => {
  const singleVol1Only: PriceChartingCandidate[] = [
    {
      title: 'The X-Men #1 (1963)',
      url: 'https://www.pricecharting.com/game/comic-books-x-men/the-x-men-1-1963',
      rowYear: 1963,
      isVariant: false,
      exactSeriesMatch: true,
      wordScore: 20,
      ungraded: 4272.33,
    },
  ];
  const picked = selectBestPriceChartingCandidate(singleVol1Only, {
    cleanTitle: 'X-Men',
    volumeNumber: 2,
    queryWantsVariant: false,
  });
  assert.equal(picked, null);
});

runTest('selectBestPriceChartingCandidate rejects explicit volume conflicts', () => {
  const explicitVolCandidates: PriceChartingCandidate[] = [
    {
      title: 'Example Hero Vol. 1 #1 (1970)',
      url: 'https://www.pricecharting.com/game/comic-books-example-hero/example-hero-vol-1-1-1970',
      rowYear: 1970,
      rowVolume: 1,
      isVariant: false,
      exactSeriesMatch: true,
      wordScore: 22,
      ungraded: 500,
    },
    {
      title: 'Example Hero Vol. 3 #1 (1995)',
      url: 'https://www.pricecharting.com/game/comic-books-example-hero/example-hero-vol-3-1-1995',
      rowYear: 1995,
      rowVolume: 3,
      isVariant: false,
      exactSeriesMatch: true,
      wordScore: 22,
      ungraded: 6,
    },
  ];
  const picked = selectBestPriceChartingCandidate(explicitVolCandidates, {
    cleanTitle: 'Example Hero',
    volumeNumber: 3,
    queryWantsVariant: false,
  });
  assert.ok(picked);
  assert.equal(picked.candidate.rowVolume, 3);
});

runTest('selectBestPriceChartingCandidate rejects facsimile/reprint URLs unless explicitly requested', () => {
  const facsimileOnly: PriceChartingCandidate[] = [
    {
      title: 'Silver Surfer #1 (2026)',
      url: 'https://www.pricecharting.com/game/comic-books-silver-surfer-facsimile-edition/silver-surfer-1-2026',
      rowYear: 2026,
      isVariant: true,
      exactSeriesMatch: true,
      wordScore: 22,
      ungraded: 47.2,
    },
  ];
  const picked = selectBestPriceChartingCandidate(facsimileOnly, {
    cleanTitle: 'Silver Surfer',
    year: 2026,
    volumeNumber: 3,
    queryWantsVariant: false,
  });
  assert.equal(picked, null);
});

console.log('All Valuation Engine volume & year matching unit tests passed!');
