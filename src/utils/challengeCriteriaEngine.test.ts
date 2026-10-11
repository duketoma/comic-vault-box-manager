import { ComicBook } from '../types';
import {
  ReadingChallengeCriteria,
  CriterionLeaf,
  CriterionGroup,
} from '../types/readingChallenge.types';
import {
  evaluateCriterionNode,
  filterComicsByCriteria,
  isComicEligibleForChallenge,
  sortChallengeComics,
  formatCriteriaSummary,
  validateCriteria,
} from './challengeCriteriaEngine';
import { computeChallengeMilestones } from './challengeMilestones';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log('Running Reading Challenge unit tests...');

const testComics: ComicBook[] = [
  {
    id: 'c-1',
    title: 'Batman',
    seriesName: 'Batman',
    issueNumber: '404',
    publisher: 'DC Comics',
    publicationYear: 1987,
    publicationDate: '1987-02-01',
    writer: 'Frank Miller',
    artist: 'David Mazzucchelli',
    event: 'Year One',
    creatorContributions: [
      { creatorName: 'Frank Miller', roleName: 'Writer' },
      { creatorName: 'David Mazzucchelli', roleName: 'Artist' },
    ],
    characterAppearances: [
      { characterName: 'Batman', appearanceType: 'Main' },
      { characterName: 'James Gordon', appearanceType: 'Supporting' },
    ],
    format: 'Single Issue',
    sizeThickness: 1.0,
    currentBoxId: 1,
    readingStatus: 'Read',
    readCount: 1,
  },
  {
    id: 'c-2',
    title: 'Batman',
    seriesName: 'Batman',
    issueNumber: '405',
    publisher: 'DC Comics',
    publicationYear: 1987,
    publicationDate: '1987-03-01',
    writer: 'Frank Miller',
    artist: 'David Mazzucchelli',
    event: 'Year One',
    creatorContributions: [
      { creatorName: 'Frank Miller', roleName: 'Writer' },
      { creatorName: 'David Mazzucchelli', roleName: 'Artist' },
    ],
    characterAppearances: [
      { characterName: 'Batman', appearanceType: 'Main' },
    ],
    format: 'Single Issue',
    sizeThickness: 1.0,
    currentBoxId: 1,
    readingStatus: 'Unread',
    readCount: 0,
  },
  {
    id: 'c-3',
    title: 'The Amazing Spider-Man',
    seriesName: 'The Amazing Spider-Man',
    issueNumber: '300',
    publisher: 'Marvel Comics',
    publicationYear: 1988,
    publicationDate: '1988-05-01',
    writer: 'David Michelinie',
    artist: 'Todd McFarlane',
    creatorContributions: [
      { creatorName: 'David Michelinie', roleName: 'Writer' },
      { creatorName: 'Todd McFarlane', roleName: 'Artist' },
    ],
    characterAppearances: [
      { characterName: 'Spider-Man', appearanceType: 'Main' },
      { characterName: 'Venom', appearanceType: 'Supporting' },
    ],
    format: 'Single Issue',
    sizeThickness: 1.0,
    currentBoxId: 2,
    readingStatus: 'Unread',
    readCount: 0,
  },
  {
    id: 'c-4',
    title: 'Daredevil',
    seriesName: 'Daredevil',
    issueNumber: '181',
    publisher: 'Marvel Comics',
    publicationYear: 1982,
    publicationDate: '1982-04-01',
    writer: 'Frank Miller',
    artist: 'Frank Miller',
    creatorContributions: [
      { creatorName: 'Frank Miller', roleName: 'Writer' },
      { creatorName: 'Frank Miller', roleName: 'Artist' },
    ],
    characterAppearances: [
      { characterName: 'Daredevil', appearanceType: 'Main' },
      { characterName: 'Elektra', appearanceType: 'Supporting' },
      { characterName: 'Bullseye', appearanceType: 'Supporting' },
    ],
    format: 'Single Issue',
    sizeThickness: 1.0,
    currentBoxId: 2,
    readingStatus: 'Read',
    readCount: 1,
  },
  {
    id: 'c-5',
    title: 'Unknown Comic Without Date',
    seriesName: 'Indie Series',
    issueNumber: '1',
    publisher: 'Image Comics',
    format: 'Single Issue',
    sizeThickness: 1.0,
    currentBoxId: 2,
    readingStatus: 'Unread',
    readCount: 0,
  },
] as unknown as ComicBook[];

// Test 1: Collection criterion
const colCriteria: ReadingChallengeCriteria = {
  version: 1,
  root: { type: 'collection' },
};
const colMatches = filterComicsByCriteria(testComics, colCriteria);
assert(colMatches.length === 5, 'Entire collection should return all 5 comics');
console.log('✓ Collection criterion passed');

// Test 2: Publisher criterion
const pubCriteria: ReadingChallengeCriteria = {
  version: 1,
  root: { type: 'publisher', ids: ['Marvel Comics'] },
};
const pubMatches = filterComicsByCriteria(testComics, pubCriteria);
assert(pubMatches.length === 2, 'Marvel criterion should return 2 comics');
console.log('✓ Publisher criterion passed');

// Test 3: Creator criterion with role filter
const creatorCriteria: ReadingChallengeCriteria = {
  version: 1,
  root: { type: 'creator', ids: ['Frank Miller'], roles: ['Writer'] },
};
const creatorMatches = filterComicsByCriteria(testComics, creatorCriteria);
assert(creatorMatches.length === 3, 'Frank Miller as Writer should match c-1, c-2, c-4 (3 comics)');
console.log('✓ Creator criterion passed');

// Test 4: Character criterion
const charCriteria: ReadingChallengeCriteria = {
  version: 1,
  root: { type: 'character', ids: ['Batman'] },
};
const charMatches = filterComicsByCriteria(testComics, charCriteria);
assert(charMatches.length === 2, 'Batman appearance should match 2 comics');
console.log('✓ Character criterion passed');

// Test 5: Date range criterion
const dateCriteria: ReadingChallengeCriteria = {
  version: 1,
  root: { type: 'releaseDateRange', from: '1987-01-01', through: '1987-12-31' },
};
const dateMatches = filterComicsByCriteria(testComics, dateCriteria);
assert(dateMatches.length === 2, 'Date range 1987 should match 2 comics (c-1, c-2)');
console.log('✓ Release date range criterion passed');

// Test 6: AND Group criterion
const andGroupCriteria: ReadingChallengeCriteria = {
  version: 1,
  root: {
    type: 'group',
    operator: 'AND',
    children: [
      { type: 'publisher', ids: ['Marvel Comics'] },
      { type: 'creator', ids: ['Frank Miller'], roles: [] },
    ],
  },
};
const andMatches = filterComicsByCriteria(testComics, andGroupCriteria);
assert(andMatches.length === 1 && andMatches[0].id === 'c-4', 'Marvel AND Frank Miller should match Daredevil #181 only');
console.log('✓ AND group criterion passed');

// Test 7: OR Group criterion
const orGroupCriteria: ReadingChallengeCriteria = {
  version: 1,
  root: {
    type: 'group',
    operator: 'OR',
    children: [
      { type: 'series', ids: ['The Amazing Spider-Man'] },
      { type: 'character', ids: ['Elektra'] },
    ],
  },
};
const orMatches = filterComicsByCriteria(testComics, orGroupCriteria);
assert(orMatches.length === 2, 'Spider-Man OR Elektra should match 2 comics');
console.log('✓ OR group criterion passed');

// Test 8: Deterministic sorting
const sorted = sortChallengeComics(testComics);
assert(sorted[0].id === 'c-4', 'Daredevil 1982 should be first');
assert(sorted[1].id === 'c-1', 'Batman #404 1987-02 should be second');
assert(sorted[2].id === 'c-2', 'Batman #405 1987-03 should be third');
assert(sorted[3].id === 'c-3', 'Spider-Man 1988 should be fourth');
assert(sorted[4].id === 'c-5', 'Unknown date comic should be placed last');
console.log('✓ Deterministic sorting passed');

// Test 9: Summary generation
const summary = formatCriteriaSummary(andGroupCriteria.root);
assert(summary.includes('Marvel Comics') && summary.includes('Frank Miller') && summary.includes('AND'), 'Summary includes criteria descriptions');
console.log('✓ Criteria summary generation passed');

// Test 10: Milestones computation
const mockItems = sorted.map((comic, idx) => ({
  challengeItemId: idx + 1,
  comicId: comic.id,
  sequenceNumber: idx + 1,
  status: (comic.readingStatus === 'Read' ? 'Read' : 'Unread') as any,
  metadata: {
    id: comic.id,
    title: comic.title,
    seriesName: comic.seriesName,
    issueNumber: comic.issueNumber,
    publisher: comic.publisher,
    publicationDate: comic.publicationDate,
    event: comic.event,
    creatorContributions: comic.creatorContributions,
    characterAppearances: comic.characterAppearances,
  },
}));

const milestones = computeChallengeMilestones(mockItems);
assert(milestones.length > 0, 'Should generate milestone records');

const earliestWhole = milestones.find((m) => m.category === 'Collection' && m.kind === 'Earliest' && m.scope === 'WholeChallenge');
assert(earliestWhole?.comicId === 'c-4', 'Earliest comic in whole challenge is c-4 (1982)');

const latestWhole = milestones.find((m) => m.category === 'Collection' && m.kind === 'Latest' && m.scope === 'WholeChallenge');
assert(latestWhole?.comicId === 'c-3', 'Latest comic with known date in whole challenge is c-3 (1988)');

const earliestRead = milestones.find((m) => m.category === 'Collection' && m.kind === 'Earliest' && m.scope === 'ReadItems');
assert(earliestRead?.comicId === 'c-4', 'Earliest read item is c-4');

console.log('✓ Milestones computation passed');

// Test 11: Wishlist comic eligibility
assert(isComicEligibleForChallenge({ readingStatus: 'Unread', copiesOwned: 1 }) === true, 'Unread comic should be eligible');
assert(isComicEligibleForChallenge({ readingStatus: 'Read', copiesOwned: 1 }) === true, 'Read comic should be eligible');
assert(isComicEligibleForChallenge({ readingStatus: 'Reading' }) === true, 'Reading comic with undefined copiesOwned should be eligible');
assert(isComicEligibleForChallenge({ readingStatus: 'Wishlist', copiesOwned: 0 }) === false, 'Wishlist comic must be ineligible');
assert(isComicEligibleForChallenge({ readingStatus: 'Unread', copiesOwned: 0 }) === false, 'Comic with 0 copies owned must be ineligible');

// Test 12: Wishlist comics excluded from event and collection criteria
const wishlistWarlock: ComicBook = {
  id: 'warlock-6',
  title: 'Warlock Chronicles',
  seriesName: 'Warlock Chronicles',
  issueNumber: '6',
  publisher: 'Marvel Comics',
  publicationYear: 1993,
  genre: 'Superhero',
  writer: 'Jim Starlin',
  artist: 'Tom Raney',
  coverImage: 'NoImage.png',
  condition: 'Near Mint',
  tags: ['Crossover'],
  createdAt: '2025-01-06T00:00:00.000Z',
  updatedAt: '2025-01-06T00:00:00.000Z',
  event: 'Blood and Thunder',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 0,
  readingStatus: 'Wishlist',
  copiesOwned: 0,
  readCount: 0,
};

const ownedThor: ComicBook = {
  id: 'thor-469',
  title: 'Thor',
  seriesName: 'Thor',
  issueNumber: '469',
  publisher: 'Marvel Comics',
  publicationYear: 1993,
  genre: 'Superhero',
  writer: 'Jim Starlin',
  artist: 'Angel Medina',
  coverImage: 'NoImage.png',
  condition: 'Near Mint',
  tags: ['Crossover'],
  createdAt: '2025-01-05T00:00:00.000Z',
  updatedAt: '2025-01-05T00:00:00.000Z',
  event: 'Blood and Thunder',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Unread',
  copiesOwned: 1,
  readCount: 0,
};

const eventCriterion: ReadingChallengeCriteria = {
  version: 1,
  root: { type: 'storyArc', ids: ['Blood and Thunder'] },
};

const collectionCriterion: ReadingChallengeCriteria = {
  version: 1,
  root: { type: 'collection' },
};

// Wishlist comic should evaluate to false on node evaluation
assert(evaluateCriterionNode(wishlistWarlock, eventCriterion.root) === false, 'Wishlist comic should not match event criterion');
assert(evaluateCriterionNode(wishlistWarlock, collectionCriterion.root) === false, 'Wishlist comic should not match collection criterion');

// Owned comic should evaluate to true
assert(evaluateCriterionNode(ownedThor, eventCriterion.root) === true, 'Owned comic should match event criterion');

// Filter on collection containing both should only return owned comic
const matchedComics = filterComicsByCriteria([wishlistWarlock, ownedThor], eventCriterion);
assert(matchedComics.length === 1, 'Only 1 comic should match');
assert(matchedComics[0].id === 'thor-469', 'Matched comic must be owned Thor #469');
assert(!matchedComics.some((c) => c.id === 'warlock-6'), 'Wishlisted Warlock Chronicles #6 must be excluded');

console.log('✓ Wishlist comic exclusion passed');
console.log('\nALL 12 TESTS PASSED SUCCESSFULLY! 🎉');
