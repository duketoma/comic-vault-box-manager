import { 
  parseIssueNumber, 
  compareIssueNumbers, 
  parseVolumeNumber, 
  getComicTitle, 
  compareComicsByTitleAndIssue, 
  sortComicsByTitleAndIssue,
  parseIntegerIssueNumber 
} from '../src/utils/comicSortUtils';
import { ComicBook } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

// 1. Natural integer order (not alphabetical "1", "10", "2")
const issues = ['10', '2', '1', '100', '25', '3'];
issues.sort(compareIssueNumbers);
assert(JSON.stringify(issues) === JSON.stringify(['1', '2', '3', '10', '25', '100']), 
  `Integer issue sorting: ${JSON.stringify(issues)}`);

// 2. Strips leading '#' properly
const hashIssues = ['#10', '#2', '#1', '3'];
hashIssues.sort(compareIssueNumbers);
assert(JSON.stringify(hashIssues) === JSON.stringify(['#1', '#2', '3', '#10']),
  `Hash prefix sorting: ${JSON.stringify(hashIssues)}`);

// 3. Fractions like 1/2
const fracIssues = ['1', '1/2', '0', '2'];
fracIssues.sort(compareIssueNumbers);
assert(JSON.stringify(fracIssues) === JSON.stringify(['0', '1/2', '1', '2']),
  `Fractions sorting: ${JSON.stringify(fracIssues)}`);

// 4. Suffixes (1 before 1A before 1B before 2)
const suffixIssues = ['2', '1B', '1', '1A'];
suffixIssues.sort(compareIssueNumbers);
assert(JSON.stringify(suffixIssues) === JSON.stringify(['1', '1A', '1B', '2']),
  `Suffix sorting: ${JSON.stringify(suffixIssues)}`);

// 5. Decimals
const decimalIssues = ['2', '1.5', '1', '10.1', '10'];
decimalIssues.sort(compareIssueNumbers);
assert(JSON.stringify(decimalIssues) === JSON.stringify(['1', '1.5', '2', '10', '10.1']),
  `Decimal sorting: ${JSON.stringify(decimalIssues)}`);

// 6. Annuals, TPBs, Text
const mixedIssues = ['TPB 1', 'Annual 1', '1', 'Deluxe HC', '2'];
mixedIssues.sort(compareIssueNumbers);
assert(JSON.stringify(mixedIssues) === JSON.stringify(['1', '2', 'Annual 1', 'TPB 1', 'Deluxe HC']),
  `Mixed types sorting: ${JSON.stringify(mixedIssues)}`);

// 7. parseVolumeNumber
assert(parseVolumeNumber('Vol. 1') === 1, 'parseVolumeNumber Vol. 1');
assert(parseVolumeNumber('Volume 2') === 2, 'parseVolumeNumber Volume 2');
assert(parseVolumeNumber('v3') === 3, 'parseVolumeNumber v3');
assert(parseVolumeNumber(4) === 4, 'parseVolumeNumber numeric 4');
assert(parseVolumeNumber(undefined) === null, 'parseVolumeNumber undefined');

// 8. parseIntegerIssueNumber
assert(parseIntegerIssueNumber('300') === 300, 'parseIntegerIssueNumber 300');
assert(parseIntegerIssueNumber('#300') === 300, 'parseIntegerIssueNumber #300');
assert(parseIntegerIssueNumber('  # 25 ') === 25, 'parseIntegerIssueNumber # 25');

// 9. compareComicsByTitleAndIssue
const makeComic = (id: string, title: string, issueNumber: string, volume?: string): ComicBook => ({
  id,
  title,
  issueNumber,
  volume,
  publisher: 'Marvel Comics',
  publicationYear: 1990,
  genre: 'Superhero',
  writer: 'Writer',
  artist: 'Artist',
  coverImage: 'img.jpg',
  format: 'Single Issue',
  sizeThickness: 1.0,
  currentBoxId: 1,
  readingStatus: 'Read',
  readCount: 1,
  condition: 'Near Mint',
  tags: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z'
});

const sampleComics: ComicBook[] = [
  makeComic('1', 'The Amazing Spider-Man', '300'),
  makeComic('2', 'The Amazing Spider-Man', '2'),
  makeComic('3', 'The Amazing Spider-Man', '10'),
  makeComic('4', 'The Amazing Spider-Man', '1'),
  makeComic('5', 'Batman', '50'),
  makeComic('6', 'Batman', '5'),
];

const sorted = sortComicsByTitleAndIssue(sampleComics);
const sortedDisplay = sorted.map(c => `${c.title} #${c.issueNumber}`);
assert(JSON.stringify(sortedDisplay) === JSON.stringify([
  'Batman #5',
  'Batman #50',
  'The Amazing Spider-Man #1',
  'The Amazing Spider-Man #2',
  'The Amazing Spider-Man #10',
  'The Amazing Spider-Man #300'
]), `Comics sorted by title and issue: ${JSON.stringify(sortedDisplay)}`);

console.log('ALL UNIT TESTS PASSED!');
