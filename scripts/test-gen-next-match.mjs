function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[_\-#:.,/\\\(\)\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function denseText(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stripYear(str) {
  return String(str || '')
    .replace(/\s*[\(\[]?\b(19\d\d|20\d\d)(?:\s*[-–]\s*(?:19\d\d|20\d\d|present))?\b[\)\]]?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildIssueRegex(issueStr) {
  const clean = String(issueStr || '').replace(/^#/, '').trim();
  if (!clean) return null;

  const numMatch = clean.match(/^(\d+)(.*)$/);
  if (numMatch) {
    const digits = numMatch[1];
    const suffix = numMatch[2].trim();
    if (!suffix) {
      if (digits === '0') {
        return /(?<![0-9a-zA-Z])#?0+(?![0-9a-zA-Z])/i;
      }
      const val = parseInt(digits, 10);
      return new RegExp(`(?<![0-9a-zA-Z])#?0*${val}(?![0-9a-zA-Z])`, 'i');
    } else {
      const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const val = parseInt(digits, 10);
      return new RegExp(`(?<![0-9a-zA-Z])#?0*${val}[\\s\\-_.]*${escapedSuffix}(?![0-9a-zA-Z])`, 'i');
    }
  }

  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![0-9a-zA-Z])#?${escaped}(?![0-9a-zA-Z])`, 'i');
}

export function doesFileNameMatchComic(
  driveFileName,
  comicTitle,
  issueNumber,
  volume,
  seriesName,
  fullTitle,
  publicationYear
) {
  if (!driveFileName || !comicTitle) return false;

  // 1. Strip file extension
  let baseFileName = driveFileName.replace(/\.[^/.]+$/, '').trim();
  if (!baseFileName) return false;

  // Normalize "X of Y" (e.g. "Generation Next 2 of 4" -> "Generation Next 2")
  baseFileName = baseFileName.replace(/\b(\d+)\s+of\s+\d+\b/gi, '$1');

  const issueStr = String(issueNumber ?? '').trim();
  const cleanIssueNumber = issueStr.replace(/^#/, '').trim();

  // 2. Check year conflict if file contains a 4-digit year and comic has a year
  const fileYearMatch = baseFileName.match(/\b(19\d\d|20\d\d)\b/);
  if (fileYearMatch) {
    const fileYear = parseInt(fileYearMatch[1], 10);
    let comicYear = publicationYear ? Number(publicationYear) : undefined;
    if (!comicYear) {
      const seriesYearMatch = String(seriesName || '').match(/\b(19\d\d|20\d\d)\b/);
      if (seriesYearMatch) comicYear = parseInt(seriesYearMatch[1], 10);
    }
    // If comic has a known year and file has a known year, but they differ by more than 1 year (publishing lag), reject
    if (comicYear && Math.abs(comicYear - fileYear) > 1) {
      return false;
    }
  }

  // 3. Issue Number Matching
  if (cleanIssueNumber) {
    const issueRegex = buildIssueRegex(cleanIssueNumber);
    if (!issueRegex || !issueRegex.test(baseFileName)) {
      return false;
    }
  }

  // 4. Title Matching
  // Prepare title candidates from comicTitle, seriesName, and fullTitle
  const cleanVol = volume ? String(volume).replace(/[^0-9]/g, '') : '';
  const rawCandidates = [
    comicTitle,
    seriesName,
    fullTitle ? fullTitle.replace(/#\s*\S+.*$/, '') : undefined,
    cleanVol ? `${comicTitle} v${cleanVol}` : undefined,
    cleanVol ? `${comicTitle} vol ${cleanVol}` : undefined,
    cleanVol ? `${comicTitle} volume ${cleanVol}` : undefined,
  ].filter(Boolean);

  const titleVariants = new Set();
  for (const cand of rawCandidates) {
    const n = normalizeText(cand);
    const s = normalizeText(stripYear(cand));
    const noTheN = n.replace(/^the\s+/, '');
    const noTheS = s.replace(/^the\s+/, '');

    if (n) titleVariants.add(n);
    if (s) titleVariants.add(s);
    if (noTheN) titleVariants.add(noTheN);
    if (noTheS) titleVariants.add(noTheS);
  }

  // Prepare file representations
  const normFile = normalizeText(baseFileName);
  const normFileNoYear = normalizeText(stripYear(baseFileName));
  const denseFile = denseText(baseFileName);
  const denseFileNoYear = denseText(stripYear(baseFileName));

  // If issue is present, also strip the issue from the file to isolate the title portion
  let normFileNoIssue = normFile;
  if (cleanIssueNumber) {
    const issueRegex = buildIssueRegex(cleanIssueNumber);
    if (issueRegex) {
      normFileNoIssue = normalizeText(normFile.replace(issueRegex, ' '));
    }
  }
  const normFileNoIssueNoYear = normalizeText(stripYear(normFileNoIssue));

  for (const t of titleVariants) {
    if (!t) continue;
    const denseT = denseText(t);

    // Exact matches
    if (
      normFile === t ||
      normFileNoYear === t ||
      normFileNoIssue === t ||
      normFileNoIssueNoYear === t ||
      denseFile === denseT ||
      denseFileNoYear === denseT
    ) {
      return true;
    }

    // Title contained in file name
    if (
      normFile.includes(t) ||
      normFileNoYear.includes(t) ||
      normFileNoIssue.includes(t) ||
      denseFile.includes(denseT) ||
      denseFileNoYear.includes(denseT)
    ) {
      return true;
    }
  }

  return false;
}

// Tests
const testCases = [
  // Positive Generation Next #2 cases
  { fn: 'Generation Next #2.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation Next #2', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation Next 2.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation Next 02.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation Next #02.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation Next 002.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation Next # 2.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation-Next-2.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation_Next_02.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation Next (1995) #2.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation Next (1995) 02.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation Next #2 (1995).jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation Next 2 of 4.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation Next #2 of 4.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'Generation Next #2 of 4 (1995).jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: true },
  { fn: 'The Amazing Spider-Man 300.jpg', title: 'The Amazing Spider-Man', issue: '300', vol: '1', series: 'The Amazing Spider-Man (1963)', expected: true },
  { fn: 'Amazing Spider-Man #300.jpg', title: 'The Amazing Spider-Man', issue: '300', vol: '1', series: 'The Amazing Spider-Man (1963)', expected: true },
  { fn: 'Uncanny X-Men 266.jpg', title: 'Uncanny X-Men', issue: '266', vol: '1', series: 'Uncanny X-Men (1963)', expected: true },

  // Negative cases
  { fn: 'Generation Next 20.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: false },
  { fn: 'Generation Next 12.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: false },
  { fn: 'Generation Next #3.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: false },
  { fn: 'Generation Next 2 of 4.jpg', title: 'Generation Next', issue: '4', vol: '1', series: 'Generation Next (1995)', expected: false },
  { fn: 'X-Men #2.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: false },
  { fn: 'Generation X #2.jpg', title: 'Generation Next', issue: '2', vol: '1', series: 'Generation Next (1995)', expected: false },
  // Year mismatch (Generation X 1994 vs 2017)
  { fn: 'Generation X (1994) #2.jpg', title: 'Generation X', issue: '2', vol: '2', series: 'Generation X (2017)', year: 2017, expected: false },
  { fn: 'Generation X (2017) #2.jpg', title: 'Generation X', issue: '2', vol: '2', series: 'Generation X (2017)', year: 2017, expected: true },

  // Volume and variant cases
  { fn: 'Batman Vol 2 #1.jpg', title: 'Batman', issue: '1', vol: '2', expected: true },
  { fn: 'Batman v2 #1.jpg', title: 'Batman', issue: '1', vol: '2', expected: true },
  { fn: 'Batman Vol. 2 #1.jpg', title: 'Batman', issue: '1', vol: '2', expected: true },
  { fn: 'Batman #1 (Variant).jpg', title: 'Batman', issue: '1', expected: true },
  { fn: 'Generation Next #1/2.jpg', title: 'Generation Next', issue: '1/2', expected: true },
  { fn: 'Generation Next #0.jpg', title: 'Generation Next', issue: '0', expected: true },
];

let failed = 0;
for (const tc of testCases) {
  const result = doesFileNameMatchComic(tc.fn, tc.title, tc.issue, tc.vol, tc.series, undefined, tc.year);
  const pass = result === tc.expected;
  if (!pass) {
    console.error(`FAIL: "${tc.fn}" -> got ${result}, expected ${tc.expected}`);
    failed++;
  } else {
    console.log(`PASS: "${tc.fn}" -> ${result}`);
  }
}

if (failed === 0) {
  console.log('\nAll test cases PASSED perfectly!');
} else {
  console.error(`\n${failed} test case(s) FAILED!`);
  process.exit(1);
}
