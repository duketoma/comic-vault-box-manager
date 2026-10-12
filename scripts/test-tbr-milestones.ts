import { computeTBRMilestones, computeChallengeMilestones, buildCollectionBaselines } from '../src/utils/challengeMilestones';
import { ComicBook } from '../src/types';
import { ChallengeQueueItem } from '../src/types/readingChallenge.types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log('--- Running TBR Milestones & Baseline Unit Tests ---');

// Setup mock collection
const mockCollection: ComicBook[] = [
  // Oldest comic in collection (1962)
  {
    id: 'c-oldest',
    title: 'Amazing Fantasy',
    seriesName: 'Amazing Fantasy',
    issueNumber: '15',
    publisher: 'Marvel Comics',
    publicationYear: 1962,
    publicationDate: '1962-08-10',
    writer: 'Stan Lee',
    artist: 'Steve Ditko',
    characterAppearances: [{ characterName: 'Spider-Man' }],
    readingStatus: 'Read',
    copiesOwned: 1,
  } as ComicBook,

  // Jim Starlin debut in collection (1973 Iron Man #55)
  {
    id: 'c-starlin-debut',
    title: 'Iron Man',
    seriesName: 'Iron Man',
    issueNumber: '55',
    publisher: 'Marvel Comics',
    publicationYear: 1973,
    publicationDate: '1973-02-01',
    writer: 'Jim Starlin, Mike Friedrich',
    artist: 'Jim Starlin',
    characterAppearances: [{ characterName: 'Thanos' }, { characterName: 'Drax' }],
    readingStatus: 'Unread',
    copiesOwned: 1,
  } as ComicBook,

  // Later Jim Starlin comic (1991 Infinity Gauntlet #1)
  {
    id: 'c-gauntlet-1',
    title: 'The Infinity Gauntlet',
    seriesName: 'The Infinity Gauntlet',
    issueNumber: '1',
    publisher: 'Marvel Comics',
    publicationYear: 1991,
    publicationDate: '1991-07-01',
    writer: 'Jim Starlin',
    artist: 'George Perez',
    event: 'Infinity Gauntlet',
    characterAppearances: [{ characterName: 'Thanos' }, { characterName: 'Silver Surfer' }],
    readingStatus: 'Unread',
    copiesOwned: 1,
  } as ComicBook,

  // Later Infinity Gauntlet comic (1991 Infinity Gauntlet #2)
  {
    id: 'c-gauntlet-2',
    title: 'The Infinity Gauntlet',
    seriesName: 'The Infinity Gauntlet',
    issueNumber: '2',
    publisher: 'Marvel Comics',
    publicationYear: 1991,
    publicationDate: '1991-08-01',
    writer: 'Jim Starlin',
    artist: 'George Perez',
    event: 'Infinity Gauntlet',
    characterAppearances: [{ characterName: 'Thanos' }],
    readingStatus: 'Unread',
    copiesOwned: 1,
  } as ComicBook,

  // DC Comics publisher debut (1986 Dark Knight Returns #1)
  {
    id: 'c-dc-earliest',
    title: 'Batman: The Dark Knight Returns',
    seriesName: 'Batman: The Dark Knight Returns',
    issueNumber: '1',
    publisher: 'DC Comics',
    publicationYear: 1986,
    publicationDate: '1986-02-01',
    writer: 'Frank Miller',
    artist: 'Frank Miller, Klaus Janson',
    readingStatus: 'Read',
    copiesOwned: 1,
  } as ComicBook,

  // Later DC comic
  {
    id: 'c-dc-later',
    title: 'Batman',
    seriesName: 'Batman',
    issueNumber: '404',
    publisher: 'DC Comics',
    publicationYear: 1987,
    publicationDate: '1987-02-01',
    writer: 'Frank Miller',
    artist: 'David Mazzucchelli',
    readingStatus: 'Unread',
    copiesOwned: 1,
  } as ComicBook,

  // Wishlist comic (Should be IGNORED by baselines even if older!)
  {
    id: 'c-wishlist-old',
    title: 'Action Comics',
    seriesName: 'Action Comics',
    issueNumber: '1',
    publisher: 'DC Comics',
    publicationYear: 1938,
    publicationDate: '1938-06-01',
    writer: 'Jerry Siegel',
    artist: 'Joe Shuster',
    characterAppearances: [{ characterName: 'Superman' }],
    readingStatus: 'Wishlist',
    copiesOwned: 0,
  } as ComicBook,
];

// Test 1: Baselines correctly built and ignore wishlist
const baselines = buildCollectionBaselines(mockCollection);
assert(baselines.overallEarliest?.earliestComicId === 'c-oldest', 'Overall earliest comic is Amazing Fantasy #15 (1962), ignoring wishlist Action Comics #1 (1938)');
assert(baselines.publishers.get('dc comics')?.earliestComicId === 'c-dc-earliest', 'Earliest DC comic is Dark Knight Returns #1 (1986), ignoring wishlist');
assert(baselines.characters.get('thanos')?.earliestComicId === 'c-starlin-debut', 'First appearance of Thanos is Iron Man #55 (1973)');
assert(baselines.creators.get('jim starlin')?.earliestComicId === 'c-starlin-debut', 'Earliest Jim Starlin comic is Iron Man #55 (1973)');
assert(baselines.creators.get('mike friedrich')?.earliestComicId === 'c-starlin-debut', 'Compound creator Mike Friedrich parsed and tracked');
assert(!baselines.characters.has('superman'), 'Wishlisted character Superman not in owned baselines');

// Test 2: Compute TBR Milestones for a queue containing Iron Man #55
const queueItemIronMan: ChallengeQueueItem = {
  challengeItemId: 101,
  challengeId: 1,
  comicId: 'c-starlin-debut',
  sequenceNumber: 1,
  status: 'Unread',
  addedAt: '2026-01-01',
  metadata: {
    id: 'c-starlin-debut',
    title: 'Iron Man',
    seriesName: 'Iron Man',
    issueNumber: '55',
    publisher: 'Marvel Comics',
    publicationYear: 1973,
    publicationDate: '1973-02-01',
    writer: 'Jim Starlin, Mike Friedrich',
    artist: 'Jim Starlin',
    characterAppearances: [{ characterName: 'Thanos' }, { characterName: 'Drax' }],
  },
};

const queueItemGauntlet2: ChallengeQueueItem = {
  challengeItemId: 102,
  challengeId: 1,
  comicId: 'c-gauntlet-2',
  sequenceNumber: 2,
  status: 'Unread',
  addedAt: '2026-01-01',
  metadata: {
    id: 'c-gauntlet-2',
    title: 'The Infinity Gauntlet',
    seriesName: 'The Infinity Gauntlet',
    issueNumber: '2',
    publisher: 'Marvel Comics',
    publicationYear: 1991,
    publicationDate: '1991-08-01',
    writer: 'Jim Starlin',
    artist: 'George Perez',
    event: 'Infinity Gauntlet',
    characterAppearances: [{ characterName: 'Thanos' }],
  },
};

const tbrResult = computeTBRMilestones([queueItemIronMan, queueItemGauntlet2], mockCollection);
assert(tbrResult.totalTBRComics === 2, 'Evaluated 2 TBR comics');
assert(tbrResult.comicsWithMilestonesCount >= 1, 'Found milestones in TBR pile');

const ironManHighlights = tbrResult.itemsWithHighlights.find(i => i.challengeItemId === 101)?.highlights || [];
const hasThanosFirstApp = ironManHighlights.some(h => h.category === 'Character' && h.entityName === 'Thanos');
const hasStarlinEarliest = ironManHighlights.some(h => h.category === 'Creator' && h.entityName.toLowerCase() === 'jim starlin');

assert(hasThanosFirstApp, 'Iron Man #55 highlighted for First Appearance of Thanos');
assert(hasStarlinEarliest, 'Iron Man #55 highlighted for Earliest Jim Starlin Contribution');

// Gauntlet #2 is later than Gauntlet #1 and Iron Man #55, so it should not have Starlin earliest or Event earliest
const gauntlet2Highlights = tbrResult.itemsWithHighlights.find(i => i.challengeItemId === 102)?.highlights || [];
const gauntlet2HasStarlin = gauntlet2Highlights.some(h => h.category === 'Creator' && h.entityName.toLowerCase() === 'jim starlin');
assert(!gauntlet2HasStarlin, 'Later issue Gauntlet #2 does not receive false earliest creator milestone');

// Test 4: Compute Whole Challenge Milestones against collection
// Reset statuses
queueItemIronMan.status = 'Unread';
queueItemGauntlet2.status = 'Unread';

// Also add Gauntlet #1 as a middle comic in the challenge
const queueItemGauntlet1: ChallengeQueueItem = {
  challengeItemId: 103,
  challengeId: 1,
  comicId: 'c-gauntlet-1',
  sequenceNumber: 1.5,
  status: 'Unread',
  addedAt: '2026-01-01',
  metadata: {
    id: 'c-gauntlet-1',
    title: 'The Infinity Gauntlet',
    seriesName: 'The Infinity Gauntlet',
    issueNumber: '1',
    publisher: 'Marvel Comics',
    publicationYear: 1991,
    publicationDate: '1991-07-01',
    writer: 'Jim Starlin',
    artist: 'George Perez',
    event: 'Infinity Gauntlet',
    characterAppearances: [{ characterName: 'Thanos' }, { characterName: 'Silver Surfer' }],
  },
};

const challengeMilestones = computeChallengeMilestones(
  [queueItemIronMan, queueItemGauntlet1, queueItemGauntlet2],
  mockCollection
);

const wholeThanosMilestones = challengeMilestones.filter(
  (m) => m.scope === 'WholeChallenge' && m.category === 'Character' && m.entityName === 'Thanos'
);
assert(wholeThanosMilestones.length === 2, 'Thanos has exactly 1 Earliest and 1 Latest in Whole Challenge');
assert(wholeThanosMilestones.find((m) => m.kind === 'Earliest')?.comicId === 'c-starlin-debut', 'Thanos Earliest in Collection is Iron Man #55');
assert(wholeThanosMilestones.find((m) => m.kind === 'Latest')?.comicId === 'c-gauntlet-2', 'Thanos Latest in Collection is Gauntlet #2');

// Middle comic Gauntlet #1 should NOT have a Thanos milestone (no middle-of-run noise!)
const gauntlet1Thanos = wholeThanosMilestones.find((m) => m.comicId === 'c-gauntlet-1');
assert(!gauntlet1Thanos, 'Middle issue Gauntlet #1 receives NO Thanos milestone (noise eliminated)');

// Drax only appears in 1 comic in the collection (Iron Man #55) -> Earliest only, NO duplicate Latest!
const draxMilestones = challengeMilestones.filter(
  (m) => m.scope === 'WholeChallenge' && m.category === 'Character' && m.entityName === 'Drax'
);
assert(draxMilestones.length === 1, 'Single-appearance entity Drax has only 1 milestone (Earliest Debut)');
assert(draxMilestones[0].kind === 'Earliest', 'Drax milestone is Earliest debut in collection');
assert(!draxMilestones.some((m) => m.kind === 'Latest'), 'Drax does NOT have a duplicate redundant Latest milestone');

// Event milestone: Gauntlet #2 is the latest Infinity Gauntlet issue in collection
const eventLatest = challengeMilestones.find(
  (m) => m.scope === 'WholeChallenge' && m.category === 'StoryArc' && m.kind === 'Latest'
);
assert(eventLatest?.comicId === 'c-gauntlet-2', 'Gauntlet #2 is marked Latest Infinity Gauntlet Issue in collection');

// Test 5: Read Items scope only includes comics that are Read
const initialReadMilestones = challengeMilestones.filter((m) => m.scope === 'ReadItems');
assert(initialReadMilestones.length === 0, 'No ReadItems milestones when all items are Unread');

// Mark Iron Man as Read
queueItemIronMan.status = 'Read';
const partialReadMilestones = computeChallengeMilestones(
  [queueItemIronMan, queueItemGauntlet1, queueItemGauntlet2],
  mockCollection
);
const readScopeMilestones = partialReadMilestones.filter((m) => m.scope === 'ReadItems');
assert(readScopeMilestones.length > 0, 'ReadItems scope now populates read collection milestones');
assert(readScopeMilestones.every((m) => m.comicId === 'c-starlin-debut'), 'Only read comic Iron Man #55 appears in ReadItems scope');
assert(readScopeMilestones.some((m) => m.entityName === 'Thanos' && m.kind === 'Earliest'), 'Thanos Earliest appears in ReadItems scope');
assert(!readScopeMilestones.some((m) => m.comicId === 'c-gauntlet-2'), 'Unread Gauntlet #2 does NOT appear in ReadItems scope');

console.log('🎉 All TBR & Challenge Collection Milestones Unit Tests Passed Successfully!');
