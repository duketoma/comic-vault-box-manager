import { ComicBook } from '../types';
import { splitCreatorNames, extractIndividualCreators } from './creatorParser';

function assertEqual(actual: any, expected: any, msg: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`Assertion failed: ${msg}. Expected ${expectedStr}, got ${actualStr}`);
  }
}

console.log('Running creatorParser unit tests...');

// 1. Single creator name
assertEqual(splitCreatorNames('Stan Lee'), ['Stan Lee'], 'Single creator name');
assertEqual(splitCreatorNames('Todd McFarlane'), ['Todd McFarlane'], 'Single creator name');
console.log('✓ Single creator name passed');

// 2. Comma separated list
assertEqual(
  splitCreatorNames('Stan Lee, Jack Kirby, Steve Ditko'),
  ['Stan Lee', 'Jack Kirby', 'Steve Ditko'],
  'Comma separated list'
);
console.log('✓ Comma separated list passed');

// 3. Ampersand separated list
assertEqual(
  splitCreatorNames('David Michelinie & Todd McFarlane'),
  ['David Michelinie', 'Todd McFarlane'],
  'Ampersand separated list'
);
console.log('✓ Ampersand separated list passed');

// 4. Semicolon separated list
assertEqual(
  splitCreatorNames('Chris Claremont; John Byrne; Terry Austin'),
  ['Chris Claremont', 'John Byrne', 'Terry Austin'],
  'Semicolon separated list'
);
console.log('✓ Semicolon separated list passed');

// 5. Generational suffix handling (Jr., Sr., III)
assertEqual(splitCreatorNames('John Romita, Jr.'), ['John Romita Jr.'], 'Suffix with comma');
assertEqual(splitCreatorNames('John Romita Jr.'), ['John Romita Jr.'], 'Suffix without comma');
assertEqual(
  splitCreatorNames('Stan Lee, John Romita, Jr., Jack Kirby'),
  ['Stan Lee', 'John Romita Jr.', 'Jack Kirby'],
  'Comma list with generational suffix'
);
assertEqual(splitCreatorNames('Walter Simonson, III'), ['Walter Simonson III'], 'Roman numeral suffix with comma');
console.log('✓ Suffix preservation passed');

// 6. Slash separated list
assertEqual(
  splitCreatorNames('Garth Ennis / Steve Dillon'),
  ['Garth Ennis', 'Steve Dillon'],
  'Slash separated list'
);
console.log('✓ Slash separated list passed');

// 7. Word conjunctions ("and", "with")
assertEqual(
  splitCreatorNames('Peter David and Dale Keown'),
  ['Peter David', 'Dale Keown'],
  'Conjunction "and"'
);
assertEqual(
  splitCreatorNames('Grant Morrison with Frank Quitely'),
  ['Grant Morrison', 'Frank Quitely'],
  'Conjunction "with"'
);
console.log('✓ Conjunction separation passed');

// 8. Parenthetical role annotations
assertEqual(
  splitCreatorNames('Frank Miller (Writer), Klaus Janson (Inks), Lynn Varley (Colors)'),
  ['Frank Miller', 'Klaus Janson', 'Lynn Varley'],
  'Parenthetical role annotations'
);
assertEqual(splitCreatorNames('Stan Lee (Script)'), ['Stan Lee'], 'Single name with script role');
console.log('✓ Role annotation removal passed');

// 9. Placeholder filtering & empty cases
assertEqual(splitCreatorNames('Various'), [], 'Filter "Various"');
assertEqual(splitCreatorNames('Various Artists'), [], 'Filter "Various Artists"');
assertEqual(splitCreatorNames('Unknown'), [], 'Filter "Unknown"');
assertEqual(splitCreatorNames('N/A'), [], 'Filter "N/A"');
assertEqual(splitCreatorNames(''), [], 'Empty string');
assertEqual(splitCreatorNames(null), [], 'Null value');
assertEqual(splitCreatorNames(undefined), [], 'Undefined value');
assertEqual(splitCreatorNames('Stan Lee, Various, Jack Kirby'), ['Stan Lee', 'Jack Kirby'], 'Filter Various in list');
console.log('✓ Placeholder filtering passed');

// 10. Deduplication & whitespace normalization
assertEqual(
  splitCreatorNames('Stan Lee, Jack Kirby, Stan Lee'),
  ['Stan Lee', 'Jack Kirby'],
  'Deduplication in splitCreatorNames'
);
assertEqual(
  splitCreatorNames('  Todd McFarlane   &   David Michelinie  '),
  ['Todd McFarlane', 'David Michelinie'],
  'Whitespace normalization'
);
console.log('✓ Deduplication & whitespace passed');

// 11. extractIndividualCreators from ComicBook[]
const sampleComics: ComicBook[] = [
  {
    id: '1',
    title: 'Spider-Man #300',
    issueNumber: '300',
    publisher: 'Marvel Comics',
    publicationYear: 1988,
    genre: 'Superhero',
    writer: 'David Michelinie',
    artist: 'Todd McFarlane',
    coverArtist: 'Todd McFarlane',
    format: 'Single Issue',
    sizeThickness: 1.0,
    currentBoxId: 1,
    readingStatus: 'Read',
    readCount: 1,
    coverImage: 'NoImage.webp',
    condition: 'Near Mint',
    tags: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    id: '2',
    title: 'Batman #404',
    issueNumber: '404',
    publisher: 'DC Comics',
    publicationYear: 1987,
    genre: 'Superhero',
    writer: 'Frank Miller, David Mazzucchelli',
    artist: 'David Mazzucchelli & Richmond Lewis',
    format: 'Single Issue',
    sizeThickness: 1.0,
    currentBoxId: 1,
    readingStatus: 'Unread',
    readCount: 0,
    coverImage: 'NoImage.webp',
    condition: 'Near Mint',
    tags: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    id: '3',
    title: 'Uncanny X-Men #141',
    issueNumber: '141',
    publisher: 'Marvel Comics',
    publicationYear: 1981,
    genre: 'Superhero',
    writer: 'Chris Claremont; John Byrne',
    artist: 'John Byrne',
    creatorContributions: [
      { creatorName: 'Terry Austin / Glynis Wein', roleName: 'Inker / Colorist' },
    ],
    format: 'Single Issue',
    sizeThickness: 1.0,
    currentBoxId: 1,
    readingStatus: 'Unread',
    readCount: 0,
    coverImage: 'NoImage.webp',
    condition: 'Near Mint',
    tags: [],
    createdAt: '',
    updatedAt: '',
  },
];

const extracted = extractIndividualCreators(sampleComics);
// Should only contain clean individual names, zero compound lists!
assertEqual(
  extracted,
  [
    'Chris Claremont',
    'David Mazzucchelli',
    'David Michelinie',
    'Frank Miller',
    'Glynis Wein',
    'John Byrne',
    'Richmond Lewis',
    'Terry Austin',
    'Todd McFarlane',
  ],
  'extractIndividualCreators extracts individual names from comics'
);
console.log('✓ extractIndividualCreators passed');

console.log('\nALL CREATOR PARSER TESTS PASSED! 🎉');
