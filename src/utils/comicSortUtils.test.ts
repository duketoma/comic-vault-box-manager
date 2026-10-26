import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ComicBook } from '../types';
import {
  compareComicsMultiSort,
  compareComicsByTitleAndIssue,
  sortComicsMultiSort,
} from './comicSortUtils';
import {
  getMonthIndex,
  parseDayFromDate,
  getNormalizedComicDate,
  compareComicDates,
  formatIsoComicDate,
} from './dateUtils';

function createMockComic(overrides: Partial<ComicBook>): ComicBook {
  return {
    id: `comic-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Silver Surfer',
    issueNumber: '1',
    publisher: 'Marvel Comics',
    publicationYear: 1996,
    format: 'Single Issue',
    sizeThickness: 1.0,
    currentBoxId: 1,
    readingStatus: 'Read',
    readCount: 1,
    condition: 'Near Mint',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    genre: 'Superhero',
    writer: 'Ron Marz',
    artist: 'Ron Lim',
    coverImage: 'NoImage.png',
    ...overrides,
  };
}

console.log('Running Comic Sorting & Date Resolution unit tests...');

// -------------------------------------------------------------
// Test 1: getMonthIndex robustness
// -------------------------------------------------------------
assert.strictEqual(getMonthIndex('January'), 1);
assert.strictEqual(getMonthIndex('feb'), 2);
assert.strictEqual(getMonthIndex('August'), 8);
assert.strictEqual(getMonthIndex('aug'), 8);
assert.strictEqual(getMonthIndex('8'), 8);
assert.strictEqual(getMonthIndex('08'), 8);
assert.strictEqual(getMonthIndex(8), 8);
assert.strictEqual(getMonthIndex('October'), 10);
assert.strictEqual(getMonthIndex('nov'), 11);
assert.strictEqual(getMonthIndex('December'), 12);
assert.strictEqual(getMonthIndex(''), 0);
assert.strictEqual(getMonthIndex(undefined), 0);
console.log('✓ getMonthIndex parses full names, abbreviations, and numeric months');

// -------------------------------------------------------------
// Test 2: parseDayFromDate
// -------------------------------------------------------------
assert.strictEqual(parseDayFromDate('7/26/1994'), 26);
assert.strictEqual(parseDayFromDate('8/1/1996'), 1);
assert.strictEqual(parseDayFromDate('1996-08-15'), 15);
assert.strictEqual(parseDayFromDate('August 20, 1996'), 20);
assert.strictEqual(parseDayFromDate('1996-10'), 0);
assert.strictEqual(parseDayFromDate('October 1996'), 0);
assert.strictEqual(parseDayFromDate(undefined), 0);
console.log('✓ parseDayFromDate correctly extracts day or returns 0');

// -------------------------------------------------------------
// Test 3: getNormalizedComicDate handles mixed sources & stale publicationDate
// -------------------------------------------------------------
const comicWithStalePubDate = createMockComic({
  publicationYear: 1996,
  publicationMonth: 'August',
  publicationDate: '9/1/1996', // Stale from CSV
});
const normStale = getNormalizedComicDate(comicWithStalePubDate);
assert.strictEqual(normStale.year, 1996);
assert.strictEqual(normStale.month, 8); // August wins over stale September
assert.strictEqual(normStale.sortKey, 19960801);
assert.strictEqual(normStale.isoDate, '1996-08-01');
console.log('✓ getNormalizedComicDate prioritizes user publicationMonth over stale publicationDate');

// -------------------------------------------------------------
// Test 4: Chronological date comparison across years and months
// Resolves: Silver Surfer #123 and #124 sorting between #96 and #114
// -------------------------------------------------------------
const c96 = createMockComic({
  issueNumber: '96',
  publicationYear: 1994,
  publicationDate: '7/26/1994',
});
const c114 = createMockComic({
  issueNumber: '114',
  publicationYear: 1996,
  publicationMonth: 'February',
  publicationDate: '2/1/1996',
});
const c120 = createMockComic({
  issueNumber: '120',
  publicationYear: 1996,
  publicationMonth: 'August',
  publicationDate: '8/1/1996',
});
const c121 = createMockComic({
  issueNumber: '121',
  publicationYear: 1996,
  publicationMonth: 'August',
  publicationDate: '8/1/1996',
});
const c122 = createMockComic({
  issueNumber: '122',
  publicationYear: 1996,
  publicationMonth: 'September',
  publicationDate: '9/1/1996',
});
const c123 = createMockComic({
  issueNumber: '123',
  publicationYear: 1996,
  publicationMonth: 'October',
  publicationDate: '10/1/1996',
});
const c124 = createMockComic({
  issueNumber: '124',
  publicationYear: 1996,
  publicationMonth: 'November',
  publicationDate: '11/1/1996',
});

// Shuffled collection
const collection = [c124, c120, c96, c123, c121, c114, c122];

const sortedByDateAndIssue = sortComicsMultiSort(collection, {
  criteria: [
    { id: 'crit-date', field: 'publicationYear', direction: 'asc' },
    { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
  ],
  separateAnnuals: true,
});

const sortedIssues = sortedByDateAndIssue.map((c) => c.issueNumber);
assert.deepStrictEqual(
  sortedIssues,
  ['96', '114', '120', '121', '122', '123', '124'],
  `Expected ['96', '114', '120', '121', '122', '123', '124'] but got ${JSON.stringify(sortedIssues)}`
);
console.log('✓ Silver Surfer #123 (Oct 1996) & #124 (Nov 1996) sort AFTER #114-#122 (Feb-Sept 1996)');

// -------------------------------------------------------------
// Test 5: Sort by Issue Number after Date when issues share the same month
// Resolves: Silver Surfer #120 and #121 both August 1996, but 121 sorting before 120
// -------------------------------------------------------------
// Even if #120 had a stale publicationDate from original CSV (9/1/1996) and #121 has 8/1/1996
const c120WithStale = createMockComic({
  issueNumber: '120',
  publicationYear: 1996,
  publicationMonth: 'August',
  publicationDate: '9/1/1996',
});
const c121WithPubDate = createMockComic({
  issueNumber: '121',
  publicationYear: 1996,
  publicationMonth: 'August',
  publicationDate: '8/1/1996',
});

const sameMonthPair = [c121WithPubDate, c120WithStale];
const sortedPair = sortComicsMultiSort(sameMonthPair, {
  criteria: [
    { id: 'crit-date', field: 'publicationYear', direction: 'asc' },
    { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
  ],
  separateAnnuals: true,
});

assert.strictEqual(sortedPair[0].issueNumber, '120');
assert.strictEqual(sortedPair[1].issueNumber, '121');
console.log('✓ Silver Surfer #120 sorts BEFORE #121 when both are August 1996');

// -------------------------------------------------------------
// Test 6: Fallback tie-breaker when user only sorts by Date (without Issue Number)
// -------------------------------------------------------------
const sortedPairDateOnly = sortComicsMultiSort(sameMonthPair, {
  criteria: [
    { id: 'crit-date', field: 'publicationYear', direction: 'asc' },
  ],
  separateAnnuals: true,
});

assert.strictEqual(sortedPairDateOnly[0].issueNumber, '120');
assert.strictEqual(sortedPairDateOnly[1].issueNumber, '121');
console.log('✓ Natural tie-breaker places #120 before #121 even without explicit secondary issue sort');

// -------------------------------------------------------------
// Test 7: Descending Date Sort
// -------------------------------------------------------------
const sortedDesc = sortComicsMultiSort(collection, {
  criteria: [
    { id: 'crit-date', field: 'publicationYear', direction: 'desc' },
    { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
  ],
  separateAnnuals: true,
});

const descIssues = sortedDesc.map((c) => c.issueNumber);
assert.deepStrictEqual(
  descIssues,
  ['124', '123', '122', '120', '121', '114', '96'],
  `Expected descending date order but got ${JSON.stringify(descIssues)}`
);
console.log('✓ Descending date order sorts newest issues first (#124 down to #96)');

// -------------------------------------------------------------
// Test 8: formatIsoComicDate output consistency
// -------------------------------------------------------------
assert.strictEqual(formatIsoComicDate(1996, 'August', '8/15/1996'), '1996-08-15');
assert.strictEqual(formatIsoComicDate(1996, 'October'), '1996-10-01');
assert.strictEqual(formatIsoComicDate(1994, undefined), '1994');
assert.strictEqual(formatIsoComicDate(undefined, undefined), undefined);
console.log('✓ formatIsoComicDate formats clean ISO dates');

console.log('\nALL COMIC SORTING & DATE TESTS PASSED SUCCESSFULLY! 🚀');
