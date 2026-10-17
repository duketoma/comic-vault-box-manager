import { createWorker, Worker } from 'tesseract.js';
import { ComicBook, SeriesIssueTotal } from '../types';

export interface CoverOcrResult {
  title?: string;
  issueNumber?: string;
  publisher?: string;
  volume?: string;
  matchedExistingSeries?: boolean;
  candidateTitles: string[];
  candidateIssues: string[];
  rawText: string;
}

const KNOWN_PUBLISHERS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\bmarvel\b/i, name: 'Marvel Comics' },
  { pattern: /\bdc\s+comics\b|\bdetective\s+comics\b/i, name: 'DC Comics' },
  { pattern: /\bimage\s+comics\b/i, name: 'Image Comics' },
  { pattern: /\bdark\s+horse\b/i, name: 'Dark Horse Comics' },
  { pattern: /\bidw\b/i, name: 'IDW Publishing' },
  { pattern: /\bboom!?\s*studios\b/i, name: 'BOOM! Studios' },
  { pattern: /\bdynamite\b/i, name: 'Dynamite Entertainment' },
  { pattern: /\bvaliant\b/i, name: 'Valiant Comics' },
  { pattern: /\barchie\b/i, name: 'Archie Comics' },
  { pattern: /\boni\s+press\b/i, name: 'Oni Press' },
  { pattern: /\baftershock\b/i, name: 'AfterShock Comics' },
  { pattern: /\bmalibu\b/i, name: 'Malibu Comics' },
];

const NOISE_LINE_PATTERNS: RegExp[] = [
  /^\s*approved\s+by\s+the\s+comics?\s+code\b/i,
  /^\s*comics?\s+code\s+authority\b/i,
  /^\s*direct\s+(edition|sales)\b/i,
  /^\s*marvel\s+comics(\s+group)?\s*$/i,
  /^\s*dc\s+comics\s*$/i,
  /^\s*image\s+comics\s*$/i,
  /^\s*dark\s+horse\s+comics\s*$/i,
  /^\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\s*$/i,
  /^\s*[\$\£\€]?\d+(\.\d{2})?\s*(can|uk|us|¢|cents?)?\s*$/i,
  /^\s*rated\s+[tmea]\+?\s*$/i,
  /^\s*still\s+only\b/i,
];

let sharedWorkerPromise: Promise<Worker> | null = null;

async function getOcrWorker(
  onProgress?: (pct: number, statusText: string) => void
): Promise<Worker> {
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = createWorker('eng', 1, {
      logger: (m) => {
        if (onProgress && typeof m.progress === 'number') {
          const pct = Math.round(m.progress * 100);
          const status =
            m.status === 'recognizing text'
              ? `Recognizing cover text (${pct}%)...`
              : `Initializing OCR engine (${pct}%)...`;
          onProgress(pct, status);
        }
      },
    }).catch((err) => {
      sharedWorkerPromise = null;
      throw err;
    });
  }
  return sharedWorkerPromise;
}

/**
 * Creates a contrast-enhanced version of the top 45% of the cover (where masthead + corner box live)
 * stacked above the full cover, or enhances the canvas for higher OCR accuracy on stylized fonts.
 */
function createOcrPreprocessedCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return sourceCanvas;

  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // Mild contrast stretch in luminance to sharpen text outlines against colored backgrounds
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // S-curve contrast boost
    const norm = lum / 255;
    const boosted = Math.max(0, Math.min(1, (norm - 0.5) * 1.35 + 0.5)) * 255;
    d[i] = boosted;
    d[i + 1] = boosted;
    d[i + 2] = boosted;
  }

  ctx.putImageData(imgData, 0, 0);
  return out;
}

function normalizeAlnum(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function denseAlnum(str: string): string {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Computes character bigram Dice coefficient (0..1) between two strings.
 * Fast and resilient to 1-2 OCR character substitutions on comic logos.
 */
function diceSimilarity(a: string, b: string): number {
  const s1 = denseAlnum(a);
  const s2 = denseAlnum(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return s1 === s2 ? 1 : 0;

  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams1.get(bg) || 0;
    if (count > 0) {
      bigrams1.set(bg, count - 1);
      intersection++;
    }
  }

  return (2 * intersection) / (s1.length - 1 + (s2.length - 1));
}

function toTitleCase(raw: string): string {
  const smallWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', ' the', 'to', 'up', 'yet']);
  return raw
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Parses raw OCR text and cross-references against existing comics and seriesTotals
 * to identify Title, Issue #, Publisher, and Volume.
 */
export function parseComicOcrText(
  rawText: string,
  existingComics: ComicBook[] = [],
  seriesTotals: SeriesIssueTotal[] = []
): CoverOcrResult {
  const cleanRaw = (rawText || '').trim();
  if (!cleanRaw) {
    return {
      candidateTitles: [],
      candidateIssues: [],
      rawText: '',
    };
  }

  const rawLines = cleanRaw
    .split(/\r?\n/)
    .map((l) => l.replace(/[|_~`^]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 2);

  // 1. Detect Publisher from raw text
  let detectedPublisher: string | undefined;
  for (const pub of KNOWN_PUBLISHERS) {
    if (pub.pattern.test(cleanRaw)) {
      detectedPublisher = pub.name;
      break;
    }
  }

  // 2. Extract Candidate Issue Numbers
  const issueCandidates = new Set<string>();

  // Priority A: Explicit `#123`, `NO. 123`, `ISSUE #12`, `ANNUAL #3`
  const explicitIssueRegex = /(?:#|\bno\.?\s*|\bissue\s*#?\s*)(-?\d+[a-zA-Z]?)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = explicitIssueRegex.exec(cleanRaw)) !== null) {
    const val = match[1];
    const num = parseInt(val, 10);
    // Exclude 4-digit years (1940-2035) unless preceded by #
    if (match[0].startsWith('#') || isNaN(num) || num < 1940 || num > 2035) {
      issueCandidates.add(val);
    }
  }

  // Priority B: Standalone small numbers (1-999) in the top lines of the cover (excluding prices, dates, years, cents)
  const priceOrYearRegex = /(?:[\$\£\€]\s*\d+|\d+\.\d{2}|\d+\s*(?:¢|cents?|can|uk|us|pts)|\b(?:19\d\d|20\d\d)\b)/gi;
  const textWithoutPrices = cleanRaw.replace(priceOrYearRegex, ' ');
  const standaloneNumRegex = /\b(\d{1,3})\b/g;
  while ((match = standaloneNumRegex.exec(textWithoutPrices)) !== null) {
    const val = String(parseInt(match[1], 10));
    const n = Number(val);
    // Avoid 0 or common comic code numbers unless no other candidates
    if (n >= 1 && n <= 950) {
      issueCandidates.add(val);
    }
  }

  const candidateIssues = Array.from(issueCandidates).slice(0, 6);

  // 3. Build Catalog Series Dictionary from `existingComics` and `seriesTotals`
  const catalogSeriesMap = new Map<
    string,
    { title: string; publisher?: string; volume?: string }
  >();

  for (const st of seriesTotals) {
    const name = (st.seriesName || '').trim();
    if (!name) continue;
    const cleanName = name.replace(/\s*\(\d{4}.*?\)\s*$/, '').trim();
    const key = cleanName.toLowerCase();
    if (!catalogSeriesMap.has(key)) {
      catalogSeriesMap.set(key, {
        title: cleanName,
        publisher: st.publisher || undefined,
        volume: st.volume ? String(st.volume) : undefined,
      });
    }
  }

  for (const c of existingComics) {
    const name = (c.title || c.seriesName || '').trim();
    if (!name) continue;
    const cleanName = name.replace(/\s*\(\d{4}.*?\)\s*$/, '').trim();
    const key = cleanName.toLowerCase();
    if (!catalogSeriesMap.has(key)) {
      catalogSeriesMap.set(key, {
        title: cleanName,
        publisher: c.publisher || undefined,
        volume: c.volume ? String(c.volume) : undefined,
      });
    }
  }

  // 4. Filter OCR lines for plausible title text
  const cleanOcrLines: string[] = [];
  for (const line of rawLines) {
    const stripped = line
      .replace(/(?:#|\bno\.?\s*|\bissue\s*)\d+[a-zA-Z]?\b/gi, ' ')
      .replace(priceOrYearRegex, ' ')
      .replace(/[^a-zA-Z0-9\s'’:&-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (stripped.length < 3) continue;
    const alphaCount = (stripped.match(/[a-zA-Z]/g) || []).length;
    if (alphaCount < 3) continue;
    if (NOISE_LINE_PATTERNS.some((rx) => rx.test(stripped))) continue;
    cleanOcrLines.push(stripped);
  }

  // Also create combined 2-line pairs from adjacent top lines (for multi-line mastheads like "THE AMAZING" + "SPIDER-MAN")
  const ocrPhrases: string[] = [...cleanOcrLines];
  for (let i = 0; i < Math.min(cleanOcrLines.length - 1, 6); i++) {
    ocrPhrases.push(`${cleanOcrLines[i]} ${cleanOcrLines[i + 1]}`);
  }

  // 5. Score Catalog Series against OCR phrases & full text
  const normFullOcr = normalizeAlnum(cleanRaw);
  const scoredCatalogMatches: Array<{
    title: string;
    publisher?: string;
    volume?: string;
    score: number;
  }> = [];

  for (const entry of catalogSeriesMap.values()) {
    const normTitle = normalizeAlnum(entry.title);
    const noTheTitle = normTitle.replace(/^the\s+/, '');
    if (noTheTitle.length < 3) continue;

    let bestEntryScore = 0;

    // Check direct substring presence in normalized OCR text
    if (normFullOcr.includes(normTitle) || (noTheTitle.length >= 4 && normFullOcr.includes(noTheTitle))) {
      // Longer title matches get a slight specificity bonus
      bestEntryScore = Math.min(0.99, 0.88 + Math.min(noTheTitle.length, 25) * 0.004);
    }

    // Check fuzzy similarity against individual and paired OCR lines
    for (const phrase of ocrPhrases) {
      const normPhrase = normalizeAlnum(phrase);
      const noThePhrase = normPhrase.replace(/^the\s+/, '');
      const sim = Math.max(
        diceSimilarity(normTitle, normPhrase),
        diceSimilarity(noTheTitle, noThePhrase)
      );
      if (sim > bestEntryScore) {
        bestEntryScore = sim;
      }
    }

    if (bestEntryScore >= 0.66) {
      scoredCatalogMatches.push({
        ...entry,
        score: bestEntryScore,
      });
    }
  }

  scoredCatalogMatches.sort((a, b) => b.score - a.score);

  const candidateTitleSet = new Set<string>();
  for (const m of scoredCatalogMatches.slice(0, 4)) {
    candidateTitleSet.add(m.title);
  }
  for (const line of cleanOcrLines.slice(0, 4)) {
    const formatted = line === line.toUpperCase() ? toTitleCase(line) : line;
    if (formatted.length >= 3 && formatted.length <= 50) {
      candidateTitleSet.add(formatted);
    }
  }

  const candidateTitles = Array.from(candidateTitleSet).slice(0, 6);
  const bestCatalog = scoredCatalogMatches[0];

  const finalTitle =
    bestCatalog && bestCatalog.score >= 0.68
      ? bestCatalog.title
      : candidateTitles[0] || undefined;

  const finalPublisher =
    detectedPublisher || (bestCatalog && bestCatalog.score >= 0.68 ? bestCatalog.publisher : undefined);

  const finalVolume =
    bestCatalog && bestCatalog.score >= 0.68 ? bestCatalog.volume : undefined;

  return {
    title: finalTitle,
    issueNumber: candidateIssues[0],
    publisher: finalPublisher,
    volume: finalVolume,
    matchedExistingSeries: Boolean(bestCatalog && bestCatalog.score >= 0.68),
    candidateTitles,
    candidateIssues,
    rawText: cleanRaw,
  };
}

/**
 * Runs client-side Tesseract.js OCR on a warped comic cover canvas and resolves
 * Title & Issue # using catalog cross-referencing + cover heuristics.
 */
export async function recognizeComicCoverCanvas(
  warpedCanvas: HTMLCanvasElement,
  existingComics: ComicBook[] = [],
  seriesTotals: SeriesIssueTotal[] = [],
  onProgress?: (pct: number, statusText: string) => void
): Promise<CoverOcrResult> {
  const preprocessed = createOcrPreprocessedCanvas(warpedCanvas);
  const worker = await getOcrWorker(onProgress);
  const { data } = await worker.recognize(preprocessed);
  return parseComicOcrText(data.text || '', existingComics, seriesTotals);
}
