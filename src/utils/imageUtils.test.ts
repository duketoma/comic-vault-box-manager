import { 
  doesFileNameMatchComic, 
  isAnnualFileName, 
  scoreFileNameMatch, 
  findBestMatchingComic 
} from './imageUtils';
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
  coverImage: 'NoImage.png',
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
  coverImage: 'NoImage.png',
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
  coverImage: 'NoImage.png',
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
  coverImage: 'NoImage.png',
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
  coverImage: 'NoImage.png',
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
  coverImage: 'NoImage.png',
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
  coverImage: 'NoImage.png',
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

console.log('All imageUtils test assertions passed!');
