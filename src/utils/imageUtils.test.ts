import { 
  doesFileNameMatchComic, 
  isAnnualFileName, 
  scoreFileNameMatch, 
  findBestMatchingComic,
  hasFullCoverWord,
  parseStrictFullCoverFileName,
  doesFullCoverMatchComic,
  scoreFullCoverMatch
} from './imageUtils';
import { isYearDesignatedAnnual, formatComicFullTitle, formatComicOptionLabel } from './comicSortUtils';
import { ComicBook } from '../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

console.log('--- Testing Google Drive Cover Matching & Annual Disambiguation ---');

const regularSilverSurfer2: ComicBook = {
  id: 'ss-2',
  title: 'Silver Surfer',
  issueNumber: '2',
  seriesName: 'Silver Surfer (Vol. 3) (1987 - 1998)',
  fullTitle: 'Silver Surfer #2',
  publisher: 'Marvel Comics',
  publicationYear: 1987,
  genre: 'Superhero',
  writer: 'Steve Englehart',
  artist: 'Marshall Rogers',
  coverImage: 'NoImage.webp',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const annualSilverSurfer2: ComicBook = {
  id: 'ss-ann-2',
  title: 'Silver Surfer Annual',
  issueNumber: '2',
  seriesName: 'Silver Surfer (Vol. 3) (1987 - 1998)',
  fullTitle: 'Silver Surfer Annual #2',
  publisher: 'Marvel Comics',
  publicationYear: 1989,
  genre: 'Superhero',
  writer: 'Steve Englehart',
  artist: 'Ron Lim',
  coverImage: 'NoImage.webp',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const batman12: ComicBook = {
  id: 'batman-12',
  title: 'Batman',
  issueNumber: '12',
  seriesName: 'Batman (1940 - 2011)',
  fullTitle: 'Batman #12',
  publisher: 'DC Comics',
  publicationYear: 1942,
  genre: 'Superhero',
  writer: 'Bill Finger',
  artist: 'Bob Kane',
  coverImage: 'NoImage.webp',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const batmanAdventures12: ComicBook = {
  id: 'batman-adv-12',
  title: 'The Batman Adventures',
  issueNumber: '12',
  seriesName: 'The Batman Adventures (1992 - 1995)',
  fullTitle: 'The Batman Adventures #12',
  publisher: 'DC Comics',
  publicationYear: 1993,
  genre: 'Superhero',
  writer: 'Kelley Puckett',
  artist: 'Mike Parobeck',
  coverImage: 'NoImage.webp',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const genXAnnual97: ComicBook = {
  id: 'genx-ann-97',
  title: "Generation X Annual '97",
  issueNumber: "'97",
  seriesName: 'Generation X (1994 - 2001)',
  fullTitle: "Generation X Annual '97",
  publisher: 'Marvel Comics',
  publicationYear: 1997,
  genre: 'Superhero',
  writer: 'Scott Lobdell',
  artist: 'Chris Bachalo',
  coverImage: 'NoImage.webp',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const avengers1: ComicBook = {
  id: 'avengers-1',
  title: 'The Avengers',
  issueNumber: '1',
  seriesName: 'The Avengers (1963 - 1996)',
  fullTitle: 'The Avengers #1',
  publisher: 'Marvel Comics',
  publicationYear: 1963,
  genre: 'Superhero',
  writer: 'Stan Lee',
  artist: 'Jack Kirby',
  coverImage: 'NoImage.webp',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const newAvengers1: ComicBook = {
  id: 'new-avengers-1',
  title: 'New Avengers',
  issueNumber: '1',
  seriesName: 'New Avengers (2004 - 2010)',
  fullTitle: 'New Avengers #1',
  publisher: 'Marvel Comics',
  publicationYear: 2005,
  genre: 'Superhero',
  writer: 'Brian Michael Bendis',
  artist: 'David Finch',
  coverImage: 'NoImage.webp',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

// 1. isAnnualFileName tests
assert(isAnnualFileName('Silver Surfer Annual #2.jpg') === true, 'Silver Surfer Annual #2.jpg is an Annual file');
assert(isAnnualFileName('Silver Surfer Annual 2.jpg') === true, 'Silver Surfer Annual 2.jpg is an Annual file');
assert(isAnnualFileName('Silver Surfer #2.jpg') === false, 'Silver Surfer #2.jpg is NOT an Annual file');
assert(isAnnualFileName('Batman #12.png') === false, 'Batman #12.png is NOT an Annual file');

// 2. Annual vs Baseline rejection
assert(
  doesFileNameMatchComic('Silver Surfer Annual #2.jpg', regularSilverSurfer2.title, regularSilverSurfer2.issueNumber, regularSilverSurfer2.volume, regularSilverSurfer2.seriesName, regularSilverSurfer2.fullTitle, regularSilverSurfer2.publicationYear, regularSilverSurfer2) === false,
  'Silver Surfer Annual #2.jpg MUST NOT match regular Silver Surfer #2'
);

assert(
  doesFileNameMatchComic('Silver Surfer #2.jpg', annualSilverSurfer2.title, annualSilverSurfer2.issueNumber, annualSilverSurfer2.volume, annualSilverSurfer2.seriesName, annualSilverSurfer2.fullTitle, annualSilverSurfer2.publicationYear, annualSilverSurfer2) === false,
  'Silver Surfer #2.jpg MUST NOT match Silver Surfer Annual #2'
);

// 3. Exact matching
assert(
  doesFileNameMatchComic('Silver Surfer Annual #2.jpg', annualSilverSurfer2.title, annualSilverSurfer2.issueNumber, annualSilverSurfer2.volume, annualSilverSurfer2.seriesName, annualSilverSurfer2.fullTitle, annualSilverSurfer2.publicationYear, annualSilverSurfer2) === true,
  'Silver Surfer Annual #2.jpg matches Silver Surfer Annual #2'
);

assert(
  doesFileNameMatchComic('Silver Surfer #2.jpg', regularSilverSurfer2.title, regularSilverSurfer2.issueNumber, regularSilverSurfer2.volume, regularSilverSurfer2.seriesName, regularSilverSurfer2.fullTitle, regularSilverSurfer2.publicationYear, regularSilverSurfer2) === true,
  'Silver Surfer #2.jpg matches regular Silver Surfer #2'
);

// 4. Sub-series rejection (Batman Adventures should not match Batman #12; New Avengers should not match Avengers)
assert(
  doesFileNameMatchComic('Batman Adventures #12.jpg', batman12.title, batman12.issueNumber, batman12.volume, batman12.seriesName, batman12.fullTitle, batman12.publicationYear, batman12) === false,
  'Batman Adventures #12.jpg MUST NOT match Batman #12'
);

assert(
  doesFileNameMatchComic('Batman Adventures #12.jpg', batmanAdventures12.title, batmanAdventures12.issueNumber, batmanAdventures12.volume, batmanAdventures12.seriesName, batmanAdventures12.fullTitle, batmanAdventures12.publicationYear, batmanAdventures12) === true,
  'Batman Adventures #12.jpg matches The Batman Adventures #12'
);

assert(
  doesFileNameMatchComic('New Avengers #1.jpg', avengers1.title, avengers1.issueNumber, avengers1.volume, avengers1.seriesName, avengers1.fullTitle, avengers1.publicationYear, avengers1) === false,
  'New Avengers #1.jpg MUST NOT match The Avengers #1'
);

assert(
  doesFileNameMatchComic('New Avengers #1.jpg', newAvengers1.title, newAvengers1.issueNumber, newAvengers1.volume, newAvengers1.seriesName, newAvengers1.fullTitle, newAvengers1.publicationYear, newAvengers1) === true,
  'New Avengers #1.jpg matches New Avengers #1'
);

// 5. Year-designated Annuals matching
assert(
  doesFileNameMatchComic("Generation X Annual '97.jpg", genXAnnual97.title, genXAnnual97.issueNumber, genXAnnual97.volume, genXAnnual97.seriesName, genXAnnual97.fullTitle, genXAnnual97.publicationYear, genXAnnual97) === true,
  "Generation X Annual '97.jpg matches Generation X Annual '97"
);

// 6. Cover variant suffixes
assert(
  doesFileNameMatchComic('Batman #12 Cover A.jpg', batman12.title, batman12.issueNumber, batman12.volume, batman12.seriesName, batman12.fullTitle, batman12.publicationYear, batman12) === true,
  'Batman #12 Cover A.jpg matches Batman #12'
);

assert(
  doesFileNameMatchComic('Batman #12 Variant.jpg', batman12.title, batman12.issueNumber, batman12.volume, batman12.seriesName, batman12.fullTitle, batman12.publicationYear, batman12) === true,
  'Batman #12 Variant.jpg matches Batman #12'
);

// 7. findBestMatchingComic order-of-events disambiguation
const candidatesSS1 = [regularSilverSurfer2, annualSilverSurfer2];
const best1 = findBestMatchingComic('Silver Surfer Annual #2.jpg', candidatesSS1);
assert(best1?.id === 'ss-ann-2', 'When regular is first in candidate list, Annual file picks Annual comic');

const candidatesSS2 = [annualSilverSurfer2, regularSilverSurfer2];
const best2 = findBestMatchingComic('Silver Surfer Annual #2.jpg', candidatesSS2);
assert(best2?.id === 'ss-ann-2', 'When annual is first in candidate list, Annual file picks Annual comic');

const bestRegular = findBestMatchingComic('Silver Surfer #2.jpg', candidatesSS1);
assert(bestRegular?.id === 'ss-2', 'Regular issue file picks regular comic');

const candidatesAvengers = [avengers1, newAvengers1];
const bestNewAv = findBestMatchingComic('New Avengers #1.jpg', candidatesAvengers);
assert(bestNewAv?.id === 'new-avengers-1', 'New Avengers #1.jpg picks New Avengers #1, not Avengers #1');

const bestClassicAv = findBestMatchingComic('Avengers #1.jpg', candidatesAvengers);
assert(bestClassicAv?.id === 'avengers-1', 'Avengers #1.jpg picks The Avengers #1, not New Avengers #1');

// 8. Sole regular issue in vault should NOT be assigned when Annual file is scanned
const soleRegular = [regularSilverSurfer2];
const bestSole = findBestMatchingComic('Silver Surfer Annual #2.jpg', soleRegular);
assert(bestSole === null, 'When only regular issue is in vault, Annual file remains unassigned (null)');

// 9. Year-designated Annuals matching (e.g. X-Men Annual '95, '96, Full '95, Full '96)
const xmenAnn95: ComicBook = {
  id: 'xmen-ann-95',
  title: "X-Men Annual '95",
  issueNumber: '1',
  fullTitle: "X-Men Annual '95",
  seriesName: 'X-Men (Vol. 2) (1991 - 2001)',
  publisher: 'Marvel Comics',
  publicationYear: 1995,
  genre: 'Superhero',
  writer: 'Fabian Nicieza',
  artist: 'Andy Kubert',
  coverImage: 'NoImage.webp',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const xmenAnn96: ComicBook = {
  id: 'xmen-ann-96',
  title: "X-Men Annual '96",
  issueNumber: '1',
  fullTitle: "X-Men Annual '96",
  seriesName: 'X-Men (Vol. 2) (1991 - 2001)',
  publisher: 'Marvel Comics',
  publicationYear: 1996,
  genre: 'Superhero',
  writer: 'Fabian Nicieza',
  artist: 'Andy Kubert',
  coverImage: 'NoImage.webp',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const uncannyAnn95: ComicBook = {
  id: 'uncanny-ann-95',
  title: "Uncanny X-Men Annual '95",
  issueNumber: '1',
  fullTitle: "Uncanny X-Men Annual '95",
  seriesName: 'Uncanny X-Men (1963 - 2011)',
  publisher: 'Marvel Comics',
  publicationYear: 1995,
  genre: 'Superhero',
  writer: 'Scott Lobdell',
  artist: 'Bryan Hitch',
  coverImage: 'NoImage.webp',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const uncannyAnn96: ComicBook = {
  id: 'uncanny-ann-96',
  title: "Uncanny X-Men Annual '96",
  issueNumber: '1',
  fullTitle: "Uncanny X-Men Annual '96",
  seriesName: 'Uncanny X-Men (1963 - 2011)',
  publisher: 'Marvel Comics',
  publicationYear: 1996,
  genre: 'Superhero',
  writer: 'Scott Lobdell',
  artist: 'Bryan Hitch',
  coverImage: 'NoImage.webp',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const annualVaultCandidates = [uncannyAnn95, uncannyAnn96, xmenAnn95, xmenAnn96];

// Standard covers
assert(scoreFileNameMatch("X-Men Annual '95.jpg", xmenAnn95) >= 90, "X-Men Annual '95.jpg scores high for X-Men Annual '95");
assert(scoreFileNameMatch("X-Men Annual '95.jpg", uncannyAnn95) === 0, "X-Men Annual '95.jpg rejects Uncanny X-Men Annual '95");
assert(scoreFileNameMatch("X-Men Annual '96.jpg", xmenAnn96) >= 90, "X-Men Annual '96.jpg scores high for X-Men Annual '96");
assert(scoreFileNameMatch("X-Men Annual '96.jpg", uncannyAnn96) === 0, "X-Men Annual '96.jpg rejects Uncanny X-Men Annual '96");

const bestMatch95 = findBestMatchingComic("X-Men Annual '95.jpg", annualVaultCandidates);
assert(bestMatch95?.id === 'xmen-ann-95', "findBestMatchingComic selects X-Men Annual '95 even when Uncanny is first in candidates");

const bestMatch96 = findBestMatchingComic("X-Men Annual '96.jpg", annualVaultCandidates);
assert(bestMatch96?.id === 'xmen-ann-96', "findBestMatchingComic selects X-Men Annual '96 even when Uncanny is first in candidates");

// Full Wraparound covers
const parsedFull95 = parseStrictFullCoverFileName("X-Men Annual Full '95.jpg");
assert(parsedFull95.isStrictFullCover === true, "X-Men Annual Full '95.jpg parsed as strict full cover");
assert(doesFullCoverMatchComic(parsedFull95, xmenAnn95) === true, "X-Men Annual Full '95.jpg matches X-Men Annual '95");
assert(doesFullCoverMatchComic(parsedFull95, uncannyAnn95) === false, "X-Men Annual Full '95.jpg rejects Uncanny X-Men Annual '95");

const parsedFull96 = parseStrictFullCoverFileName("X-Men Annual Full '96.jpg");
assert(parsedFull96.isStrictFullCover === true, "X-Men Annual Full '96.jpg parsed as strict full cover");
assert(doesFullCoverMatchComic(parsedFull96, xmenAnn96) === true, "X-Men Annual Full '96.jpg matches X-Men Annual '96");
assert(doesFullCoverMatchComic(parsedFull96, uncannyAnn96) === false, "X-Men Annual Full '96.jpg rejects Uncanny X-Men Annual '96");

assert(scoreFullCoverMatch(parsedFull95, xmenAnn95) >= 90, "scoreFullCoverMatch scores high for X-Men Annual '95");
assert(scoreFullCoverMatch(parsedFull95, xmenAnn96) === 0, "scoreFullCoverMatch scores 0 for X-Men Annual '96 when matching Full '95");
assert(scoreFullCoverMatch(parsedFull96, xmenAnn95) === 0, "scoreFullCoverMatch scores 0 for X-Men Annual '95 when matching Full '96");
assert(scoreFullCoverMatch(parsedFull95, uncannyAnn95) === 0, "scoreFullCoverMatch scores 0 for Uncanny X-Men Annual '95");

// Batch simulation of standard and full covers together with decoupled assignment sets
const simulatedFiles = [
  { id: 'f-ann-96', name: "X-Men Annual '96.jpg" },
  { id: 'f-full-96', name: "X-Men Annual Full '96.jpg" },
  { id: 'f-full-95', name: "X-Men Annual Full '95.jpg" },
  { id: 'f-ann-95', name: "X-Men Annual '95.jpg" },
];
const assignedFrontSet = new Set<string>();
const assignedFullSet = new Set<string>();
const batchAssignments: Record<string, string> = {};

// Full covers pass
simulatedFiles.forEach((file) => {
  if (!hasFullCoverWord(file.name)) return;
  const parsed = parseStrictFullCoverFileName(file.name);
  let best: ComicBook | null = null;
  let bestScore = 0;
  for (const c of annualVaultCandidates) {
    const score = scoreFullCoverMatch(parsed, c);
    if (score < 70) continue;
    const isUnassigned = !assignedFullSet.has(c.id);
    if (score > bestScore || (score === bestScore && isUnassigned && best && assignedFullSet.has(best.id))) {
      bestScore = score;
      best = c;
    }
  }
  if (best) {
    batchAssignments[file.id] = best.id;
    assignedFullSet.add(best.id);
  }
});

// Standard covers pass
simulatedFiles.forEach((file) => {
  if (hasFullCoverWord(file.name)) return;
  const match = findBestMatchingComic(file.name, annualVaultCandidates, assignedFrontSet, 90);
  if (match) {
    batchAssignments[file.id] = match.id;
    assignedFrontSet.add(match.id);
  }
});

assert(batchAssignments['f-ann-95'] === 'xmen-ann-95', "f-ann-95 matched to xmen-ann-95");
assert(batchAssignments['f-ann-96'] === 'xmen-ann-96', "f-ann-96 matched to xmen-ann-96");
assert(batchAssignments['f-full-95'] === 'xmen-ann-95', "f-full-95 matched strictly to xmen-ann-95 (never 96)");
assert(batchAssignments['f-full-96'] === 'xmen-ann-96', "f-full-96 matched strictly to xmen-ann-96");

// 10. Title and Dropdown Option formatting for Year-designated Annuals
assert(isYearDesignatedAnnual(xmenAnn95) === true, "X-Men Annual '95 is recognized as year-designated annual");
assert(formatComicFullTitle(xmenAnn95) === "X-Men Annual '95", "formatComicFullTitle returns clean title without #1");
assert(formatComicFullTitle({ title: "X-Men Annual '95", issueNumber: "1", fullTitle: "X-Men Annual '95 #1" }) === "X-Men Annual '95", "formatComicFullTitle strips existing #1");
assert(formatComicOptionLabel(xmenAnn95) === "X-Men Annual '95", "formatComicOptionLabel does not display #1 for year-designated annual");
assert(formatComicOptionLabel(regularSilverSurfer2) === "Silver Surfer #2", "formatComicOptionLabel formats regular comic with #issue");

// 11. WebP format matching tests
assert(isAnnualFileName('Silver Surfer Annual #2.webp') === true, 'Silver Surfer Annual #2.webp is an Annual file');
assert(isAnnualFileName('Silver Surfer #2.webp') === false, 'Silver Surfer #2.webp is NOT an Annual file');
assert(doesFileNameMatchComic('Silver Surfer #2.webp', regularSilverSurfer2.title, regularSilverSurfer2.issueNumber, regularSilverSurfer2.volume, regularSilverSurfer2.seriesName, regularSilverSurfer2.fullTitle, regularSilverSurfer2.publicationYear, regularSilverSurfer2) === true, 'Silver Surfer #2.webp matches regular Silver Surfer #2');
assert(doesFileNameMatchComic('Silver Surfer Annual #2.webp', annualSilverSurfer2.title, annualSilverSurfer2.issueNumber, annualSilverSurfer2.volume, annualSilverSurfer2.seriesName, annualSilverSurfer2.fullTitle, annualSilverSurfer2.publicationYear, annualSilverSurfer2) === true, 'Silver Surfer Annual #2.webp matches Silver Surfer Annual #2');

const parsedWebpFull95 = parseStrictFullCoverFileName("X-Men Annual Full '95.webp");
assert(parsedWebpFull95.isStrictFullCover === true, "X-Men Annual Full '95.webp parsed as strict full cover");
assert(doesFullCoverMatchComic(parsedWebpFull95, xmenAnn95) === true, "X-Men Annual Full '95.webp matches X-Men Annual '95");

const bestWebpMatch = findBestMatchingComic('Batman #12.webp', [batman12, regularSilverSurfer2]);
assert(bestWebpMatch?.id === 'batman-12', 'Batman #12.webp correctly matches Batman #12');

// 12. 4-digit title numbers (e.g. 2099 A.D. Genesis) must not be rejected by publication year check
const genesis2099: ComicBook = {
  id: 'genesis-2099-1',
  title: '2099 A.D. Genesis',
  issueNumber: '1',
  seriesName: '2099 A.D. Genesis (1996)',
  fullTitle: '2099 A.D. Genesis #1',
  publisher: 'Marvel Comics',
  publicationYear: 1996,
  genre: 'Superhero',
  writer: 'Warren Ellis',
  artist: 'Mark Buckingham',
  coverImage: 'NoImage.webp',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const genesisScore = scoreFileNameMatch('2099 A.D. Genesis #1.webp', genesis2099);
assert(genesisScore >= 95, `2099 A.D. Genesis #1.webp scores high (${genesisScore}) for 2099 A.D. Genesis #1`);

const matchedGenesis = findBestMatchingComic('2099 A.D. Genesis #1.webp', [genesis2099, batman12]);
assert(matchedGenesis?.id === 'genesis-2099-1', '2099 A.D. Genesis #1.webp correctly matches 2099 A.D. Genesis #1');

console.log('All imageUtils test assertions passed!');
