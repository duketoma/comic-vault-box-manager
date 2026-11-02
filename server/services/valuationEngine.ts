import { Pool } from 'pg';
import {
  BatchValuationStatus,
  BatchValuationUpdateEntry,
  ComicCondition,
  ComicValuationResult,
  ValuationCoverageStats,
  ValuationScope,
} from '../../src/types';

export const CONDITION_MULTIPLIERS: Record<ComicCondition, number> = {
  'Gem Mint': 1.35,
  'Mint': 1.15,
  'Near Mint': 1.0,
  'Very Fine': 0.75,
  'Fine': 0.5,
  'Very Good': 0.3,
  'Good': 0.18,
  'Fair': 0.1,
  'Poor': 0.05,
};

export interface ComicValuationInput {
  id?: string;
  title: string;
  seriesName?: string;
  issueNumber: string;
  volume?: string;
  publicationYear?: number;
  publisher?: string;
  format?: string;
  condition?: ComicCondition | string;
  purchasePrice?: number;
  estimatedValue?: number;
  tags?: string[];
  notes?: string;
}

interface RawMarketQuote {
  matchedTitle: string;
  source: 'PriceCharting' | 'eBay Market' | 'Era Guide (Estimate)';
  sourceUrl: string;
  baseNearMintValue: number;
  ungradedValue?: number;
  gradeTable?: Record<string, number>;
  graded80Value?: number;
  graded92Value?: number;
  graded98Value?: number;
  confidence: 'high' | 'medium' | 'low';
  fetchedAt: number;
}

const QUOTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const quoteCache = new Map<string, RawMarketQuote>();

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Strips volume years, issue suffixes, and extra punctuation to build a clean series search query.
 */
export function normalizeComicSearchParts(input: ComicValuationInput): {
  cleanTitle: string;
  cleanIssue: string;
  year?: number;
  cacheKey: string;
} {
  const rawSeries = (input.seriesName || input.title || '').trim();
  const cleanTitle = rawSeries
    .replace(/\(\s*\d{4}\s*(?:-\s*(?:\d{4}|present))?\s*\)/gi, '')
    .replace(/\bvol(?:ume)?\.?\s*\d+\b/gi, '')
    .replace(/#\s*[a-zA-Z0-9.-]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const rawIssue = String(input.issueNumber || '1')
    .replace(/^#/, '')
    .trim();
  const cleanIssue = rawIssue || '1';

  const year =
    input.publicationYear && input.publicationYear >= 1930 && input.publicationYear <= 2035
      ? Number(input.publicationYear)
      : undefined;

  const cacheKey = `${cleanTitle.toLowerCase()}|${cleanIssue.toLowerCase()}|${year || ''}|${(
    input.format || 'Single Issue'
  ).toLowerCase()}`;

  return { cleanTitle, cleanIssue, year, cacheKey };
}

/**
 * Detects whether a comic is graded/slabbed based on its tags or notes,
 * and extracts an explicit numeric grade (e.g., 9.8, 9.6, 9.0, 8.0) if present.
 */
export function detectGradedStatus(input: ComicValuationInput): {
  isGraded: boolean;
  numericGrade?: number;
} {
  const combinedText = [...(input.tags || []), input.notes || ''].join(' ');
  const isGraded = /\b(cgc|cbcs|pgx|slab|slabbed|graded)\b/i.test(combinedText);
  if (!isGraded) {
    return { isGraded: false };
  }

  const gradeMatch = combinedText.match(/\b(10\.0|9\.[02468]|8\.[05]|7\.[05]|6\.[05]|5\.[05])\b/);
  const numericGrade = gradeMatch ? parseFloat(gradeMatch[1]) : undefined;
  return { isGraded: true, numericGrade };
}

function parseDollarString(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  return Number.isFinite(val) && val > 0 ? val : 0;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/['"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parses a PriceCharting comic product page HTML into a RawMarketQuote with complete grade tiers.
 */
function parsePriceChartingProductPage(html: string, url: string): RawMarketQuote | null {
  const pageTitleMatch = html.match(/<h1[^>]*id="product_name"[^>]*>([\s\S]*?)<\/h1>/i);
  const matchedTitle = pageTitleMatch
    ? pageTitleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : 'Comic Book';

  const usedMatch = html.match(/id="used_price"[^>]*>[\s\S]*?\$([0-9,.]+)/i);
  const cibMatch = html.match(/id="complete_price"[^>]*>[\s\S]*?\$([0-9,.]+)/i);
  const newMatch = html.match(/id="new_price"[^>]*>[\s\S]*?\$([0-9,.]+)/i);
  const gradedMatch = html.match(/id="graded_price"[^>]*>[\s\S]*?\$([0-9,.]+)/i);
  const boxMatch = html.match(/id="box_only_price"[^>]*>[\s\S]*?\$([0-9,.]+)/i);
  const manualMatch = html.match(/id="manual_only_price"[^>]*>[\s\S]*?\$([0-9,.]+)/i);

  const ungraded = usedMatch ? parseDollarString(usedMatch[1]) : 0;
  const vg = cibMatch ? parseDollarString(cibMatch[1]) : 0;
  const fine = newMatch ? parseDollarString(newMatch[1]) : 0;
  const vf = gradedMatch ? parseDollarString(gradedMatch[1]) : 0;
  const nm = boxMatch ? parseDollarString(boxMatch[1]) : 0;
  const mint98 = manualMatch ? parseDollarString(manualMatch[1]) : 0;

  const gradeTable: Record<string, number> = {};
  if (ungraded > 0) gradeTable['Ungraded'] = ungraded;
  if (vg > 0) gradeTable['4.0'] = vg;
  if (fine > 0) gradeTable['6.0'] = fine;
  if (vf > 0) gradeTable['8.0'] = vf;
  if (nm > 0) gradeTable['9.2'] = nm;
  if (mint98 > 0) gradeTable['9.8'] = mint98;

  const tableRegex = /<table>\s*(<tr>\s*<td>(?:Ungraded|\d+(?:\.\d+)?)\s*<\/td>[\s\S]*?)<\/table>/i;
  const tableMatch = html.match(tableRegex);
  if (tableMatch) {
    const rowMatches = tableMatch[1].matchAll(/<tr>\s*<td>([^<]+)<\/td>\s*<td[^>]*>[\s\S]*?\$([0-9,.]+)/gi);
    for (const rm of rowMatches) {
      const gradeLabel = rm[1].trim();
      const val = parseDollarString(rm[2]);
      if (val > 0) {
        gradeTable[gradeLabel] = val;
      }
    }
  }

  // Base Near Mint value: PriceCharting maps NM- / Near Mint baseline to 9.2 (or box_only_price)
  const baseNearMintValue = gradeTable['9.2'] || nm || gradeTable['9.4'] || ungraded;
  if (baseNearMintValue <= 0) return null;

  return {
    matchedTitle,
    source: 'PriceCharting',
    sourceUrl: url,
    baseNearMintValue,
    ungradedValue: ungraded || baseNearMintValue,
    gradeTable,
    graded80Value: gradeTable['8.0'] || vf || Number((baseNearMintValue * 0.75).toFixed(2)),
    graded92Value: gradeTable['9.2'] || nm || baseNearMintValue,
    graded98Value: gradeTable['9.8'] || mint98 || Number((baseNearMintValue * 3.5).toFixed(2)),
    confidence: 'high',
    fetchedAt: Date.now(),
  };
}

/**
 * Primary Free Source: PriceCharting Public Comic Book Guide
 * Employs direct canonical slug resolution and series console directory scanning
 * to reliably fetch verified live prices past Cloudflare search walls.
 */
async function lookupPriceCharting(
  cleanTitle: string,
  cleanIssue: string,
  year?: number
): Promise<RawMarketQuote | null> {
  const titleWithoutThe = cleanTitle.replace(/^the\s+/i, '');
  const titleSlug = toSlug(titleWithoutThe);
  const fullTitleSlug = toSlug(cleanTitle);

  const consoleSlugs = Array.from(
    new Set([
      `comic-books-${titleSlug}`,
      `comic-books-${fullTitleSlug}`,
    ])
  );

  const candidateUrls: string[] = [];
  const yearsToTry = year ? [year, year - 1, year + 1] : [];

  for (const cSlug of consoleSlugs) {
    for (const y of yearsToTry) {
      candidateUrls.push(
        `https://www.pricecharting.com/game/${cSlug}/${titleSlug}-${cleanIssue}-${y}`
      );
      if (fullTitleSlug !== titleSlug) {
        candidateUrls.push(
          `https://www.pricecharting.com/game/${cSlug}/${fullTitleSlug}-${cleanIssue}-${y}`
        );
      }
    }
    candidateUrls.push(
      `https://www.pricecharting.com/game/${cSlug}/${titleSlug}-${cleanIssue}`
    );
    if (fullTitleSlug !== titleSlug) {
      candidateUrls.push(
        `https://www.pricecharting.com/game/${cSlug}/${fullTitleSlug}-${cleanIssue}`
      );
    }
  }

  // Phase 1: Direct canonical product URL checks (fastest, authoritative)
  for (const url of candidateUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeout);

      if (res.ok && !res.url.includes('/search-products')) {
        const html = await res.text();
        const quote = parsePriceChartingProductPage(html, res.url);
        if (quote) {
          return quote;
        }
      }
    } catch {
      // Continue to next candidate
    }
  }

  // Phase 2: Console series directory page scan (handles subtitle variations)
  for (const cSlug of consoleSlugs) {
    const consoleUrl = `https://www.pricecharting.com/console/${cSlug}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(consoleUrl, {
        headers: BROWSER_HEADERS,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const html = await res.text();
        const rowRegex = /<tr[^>]*id="product-\d+"[^>]*>([\s\S]*?)<\/tr>/gi;
        const issueRegex = new RegExp(`(?:#|\\bissue\\s*)0*${escapeRegExp(cleanIssue)}(?!\\d)`, 'i');
        let m: RegExpExecArray | null;
        while ((m = rowRegex.exec(html)) !== null) {
          const rowHtml = m[1];
          const titleMatch = rowHtml.match(
            /<td class="title"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
          );
          if (titleMatch) {
            const rawRowTitle = titleMatch[2].replace(/<[^>]+>/g, '').trim();
            if (issueRegex.test(rawRowTitle)) {
              if (
                !year ||
                rawRowTitle.includes(String(year)) ||
                rawRowTitle.includes(String(year - 1)) ||
                rawRowTitle.includes(String(year + 1))
              ) {
                const prodUrl = titleMatch[1].startsWith('http')
                  ? titleMatch[1]
                  : `https://www.pricecharting.com${titleMatch[1]}`;
                const prodController = new AbortController();
                const prodTimeout = setTimeout(() => prodController.abort(), 4000);
                const prodRes = await fetch(prodUrl, {
                  headers: BROWSER_HEADERS,
                  signal: prodController.signal,
                });
                clearTimeout(prodTimeout);

                if (prodRes.ok) {
                  const prodHtml = await prodRes.text();
                  const quote = parsePriceChartingProductPage(prodHtml, prodUrl);
                  if (quote) return quote;
                }
              }
            }
          }
        }
      }
    } catch {
      // Continue
    }
  }

  // Phase 3: Search results fallback
  const searchQuery = `${cleanTitle} #${cleanIssue}${year ? ` ${year}` : ''}`;
  const searchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(
    searchQuery
  )}&type=prices`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(searchUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });

    if (response.ok) {
      const html = await response.text();
      const finalUrl = response.url || searchUrl;

      // Case 1: PriceCharting redirected directly to a single comic product page
      if (finalUrl.includes('/game/comic-books-') || finalUrl.includes('/game/')) {
        const directQuote = parsePriceChartingProductPage(html, finalUrl);
        if (directQuote) {
          return directQuote;
        }
      }

      // Case 2: Search results table with <tr id="product-..."> rows
      const rowRegex = /<tr[^>]*id="product-\d+"[^>]*>([\s\S]*?)<\/tr>/gi;
      const issuePattern = new RegExp(`(?:#|\\bissue\\s*)0*${escapeRegExp(cleanIssue)}(?!\\d)`, 'i');
      const STOP_WORDS = new Set([
        'the',
        'and',
        'for',
        'comic',
        'comics',
        'book',
        'books',
        'issue',
        'title',
        'series',
        'vol',
        'volume',
        'with',
        'from',
      ]);
      const titleWords = cleanTitle
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

      let bestCandidate: {
        score: number;
        matchedTitle: string;
        productUrl: string;
        ungraded: number;
        gradedMid?: number;
        gradedHigh?: number;
      } | null = null;

      let match: RegExpExecArray | null;
      while ((match = rowRegex.exec(html)) !== null) {
        const rowHtml = match[1];
        const isComicRow =
          /comic-books/i.test(rowHtml) || /Comic Books/i.test(rowHtml);
        if (!isComicRow) continue;

        const titleMatch = rowHtml.match(/<td class="title"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!titleMatch) continue;

        const href = titleMatch[1].startsWith('http')
          ? titleMatch[1]
          : `https://www.pricecharting.com${titleMatch[1]}`;
        const rowTitle = titleMatch[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        if (!issuePattern.test(rowTitle)) continue;

        const usedMatch = rowHtml.match(/class="[^"]*used_price[^"]*"[^>]*>[\s\S]*?\$([0-9,.]+)/i);
        const cibMatch = rowHtml.match(/class="[^"]*cib_price[^"]*"[^>]*>[\s\S]*?\$([0-9,.]+)/i);
        const newMatch = rowHtml.match(/class="[^"]*new_price[^"]*"[^>]*>[\s\S]*?\$([0-9,.]+)/i);

        const ungraded = usedMatch ? parseDollarString(usedMatch[1]) : 0;
        if (ungraded <= 0) continue;

        let wordMatches = 0;
        const lowerRowTitle = rowTitle.toLowerCase();
        for (const word of titleWords) {
          if (lowerRowTitle.includes(word)) wordMatches++;
        }
        const requiredMatches = titleWords.length >= 2 ? Math.ceil(titleWords.length * 0.5) : titleWords.length;
        if (wordMatches < requiredMatches) continue;

        let score = 10 + wordMatches * 6;
        if (year && rowHtml.includes(String(year))) {
          score += 8;
        }
        // Penalize variants unless the user's title mentions variant
        if (
          /\b(variant|incentive|sketch|virgin|facsimile|reprint|2nd print|second print)\b/i.test(rowTitle) &&
          !/\b(variant|incentive|sketch|virgin|facsimile)\b/i.test(cleanTitle)
        ) {
          score -= 6;
        }

        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = {
            score,
            matchedTitle: rowTitle,
            productUrl: href,
            ungraded,
            gradedMid: cibMatch ? parseDollarString(cibMatch[1]) : undefined,
            gradedHigh: newMatch ? parseDollarString(newMatch[1]) : undefined,
          };
        }
      }

      if (bestCandidate && bestCandidate.productUrl) {
        // Fetch the product page to get the exact Near Mint price and full grade table
        try {
          const prodController = new AbortController();
          const prodTimeout = setTimeout(() => prodController.abort(), 4000);
          const prodResponse = await fetch(bestCandidate.productUrl, {
            headers: BROWSER_HEADERS,
            signal: prodController.signal,
          });
          clearTimeout(prodTimeout);
          if (prodResponse.ok) {
            const prodHtml = await prodResponse.text();
            const parsedQuote = parsePriceChartingProductPage(prodHtml, bestCandidate.productUrl);
            if (parsedQuote) {
              parsedQuote.confidence = bestCandidate.score >= 20 ? 'high' : 'medium';
              return parsedQuote;
            }
          }
        } catch {
          // Fall back gracefully to candidate search summary
        }

        return {
          matchedTitle: bestCandidate.matchedTitle,
          source: 'PriceCharting',
          sourceUrl: bestCandidate.productUrl,
          baseNearMintValue: bestCandidate.ungraded,
          graded80Value: bestCandidate.gradedMid,
          graded92Value: bestCandidate.gradedHigh,
          graded98Value: bestCandidate.gradedHigh
            ? Number((bestCandidate.gradedHigh * 1.45).toFixed(2))
            : undefined,
          confidence: bestCandidate.score >= 20 ? 'high' : 'medium',
          fetchedAt: Date.now(),
        };
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Secondary Free Source: eBay Comics (#259104) Sold / Active Market Comp Aggregator
 */
async function lookupEbayMarket(
  cleanTitle: string,
  cleanIssue: string,
  year?: number
): Promise<RawMarketQuote | null> {
  const query = `"${cleanTitle}" #${cleanIssue}${year ? ` ${year}` : ''} -lot -set -run -facsimile -reprint`;
  const ebaySoldUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(
    query
  )}&_sacat=259104&LH_Sold=1&LH_Complete=1&_ipg=60`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(ebaySoldUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const html = await response.text();
    const itemRegex = /<li[^>]*class="[^"]*s-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    const issuePattern = new RegExp(`(?:#|\\bissue\\s*|\\bno\\.?\\s*)0*${escapeRegExp(cleanIssue)}(?!\\d)`, 'i');

    const rawPrices: number[] = [];
    const gradedPrices: number[] = [];

    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(html)) !== null) {
      const block = itemMatch[1];
      const titleMatch = block.match(/class="s-item__title"[^>]*>([\s\S]*?)<\/div>/i);
      const priceMatch = block.match(/class="s-item__price"[^>]*>[\s\S]*?\$([0-9,]+\.[0-9]{2})/i);
      if (!titleMatch || !priceMatch) continue;

      const itemTitle = titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (/shop on ebay/i.test(itemTitle)) continue;
      if (!issuePattern.test(itemTitle)) continue;
      if (/\b(lot|set of|full run|complete run|facsimile|reprint|poster|print only|digital)\b/i.test(itemTitle)) {
        continue;
      }

      const price = parseDollarString(priceMatch[1]);
      if (price <= 0.99 || price > 25000) continue;

      if (/\b(cgc|cbcs|pgx|9\.8|9\.6|9\.4|9\.2|9\.0|graded|slab)\b/i.test(itemTitle)) {
        gradedPrices.push(price);
      } else {
        rawPrices.push(price);
      }
    }

    if (rawPrices.length === 0 && gradedPrices.length === 0) {
      return null;
    }

    rawPrices.sort((a, b) => a - b);
    gradedPrices.sort((a, b) => a - b);

    // Use 40th percentile of raw comps to avoid inflated asking/outlier prices
    let baseNearMintValue = 0;
    if (rawPrices.length > 0) {
      const idx = Math.max(0, Math.min(rawPrices.length - 1, Math.floor(rawPrices.length * 0.4)));
      baseNearMintValue = rawPrices[idx];
    } else if (gradedPrices.length > 0) {
      const midGraded = gradedPrices[Math.floor(gradedPrices.length * 0.4)];
      baseNearMintValue = Number((midGraded * 0.35).toFixed(2));
    }

    const gradedMedian =
      gradedPrices.length > 0
        ? gradedPrices[Math.floor(gradedPrices.length * 0.5)]
        : undefined;

    return {
      matchedTitle: `${cleanTitle} #${cleanIssue}${year ? ` (${year})` : ''}`,
      source: 'eBay Market',
      sourceUrl: ebaySoldUrl,
      baseNearMintValue: Number(baseNearMintValue.toFixed(2)),
      graded92Value: gradedMedian,
      graded98Value: gradedMedian ? Number((gradedMedian * 1.35).toFixed(2)) : undefined,
      confidence: rawPrices.length >= 3 ? 'high' : 'medium',
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fallback Era & Format Price Guide Estimator when external sites are unreachable
 * or an obscure issue has no indexed active listings.
 */
function buildEraGuideFallbackQuote(
  input: ComicValuationInput,
  cleanTitle: string,
  cleanIssue: string,
  year?: number
): RawMarketQuote {
  const pubYear = year || 2015;
  const format = input.format || 'Single Issue';
  const issueNum = parseFloat(cleanIssue);

  let baseNm = 4.5;

  if (format === 'Omnibus' || format === "Artist's Edition") {
    baseNm = 85.0;
  } else if (format === 'Oversized Hardcover' || format === 'Compendium') {
    baseNm = 42.0;
  } else if (format === 'Standard Hardcover' || format === 'Hardcover' || format === 'Epic Collection') {
    baseNm = 26.0;
  } else if (format === 'Trade Paperback' || format === 'Graphic Novel') {
    baseNm = 15.0;
  } else {
    // Single Issue / Annual / One-Shot era curve
    if (pubYear < 1956) {
      baseNm = 240.0; // Golden Age
    } else if (pubYear < 1970) {
      baseNm = 68.0; // Silver Age
    } else if (pubYear < 1985) {
      baseNm = 22.0; // Bronze Age
    } else if (pubYear < 1992) {
      baseNm = 9.5; // Copper Age
    } else if (pubYear < 2005) {
      baseNm = 5.5;
    } else {
      baseNm = 4.5;
    }

    // Issue #1 or milestone issue premium
    if (issueNum === 1) {
      baseNm *= pubYear < 1985 ? 2.5 : 1.65;
    } else if (issueNum === 100 || issueNum === 200 || issueNum === 300 || issueNum === 400 || issueNum === 500) {
      baseNm *= 1.5;
    } else if (format === 'Annual' || format === 'Giant-Size/Double-Sized') {
      baseNm *= 1.25;
    }
  }

  // Incorporate purchasePrice as a soft anchor if present and higher than generic cover floor
  if (input.purchasePrice && input.purchasePrice > baseNm) {
    baseNm = Number(((baseNm + input.purchasePrice * 1.15) / 2).toFixed(2));
  } else {
    baseNm = Number(baseNm.toFixed(2));
  }

  const searchQuery = `${cleanTitle} #${cleanIssue}${year ? ` ${year}` : ''}`;
  const sourceUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(
    searchQuery
  )}&type=prices`;

  return {
    matchedTitle: `${cleanTitle} #${cleanIssue}${year ? ` (${year})` : ''}`,
    source: 'Era Guide (Estimate)',
    sourceUrl,
    baseNearMintValue: baseNm,
    graded80Value: Number((baseNm * 1.8).toFixed(2)),
    graded92Value: Number((baseNm * 2.4).toFixed(2)),
    graded98Value: Number((baseNm * 3.8).toFixed(2)),
    confidence: 'low',
    fetchedAt: Date.now(),
  };
}

/**
 * Clears the in-memory quote cache (useful for testing or forced collection refresh).
 */
export function clearQuoteCache(): void {
  quoteCache.clear();
}

/**
 * Applies the Condition Multiplier Curve (or Graded Slab Tier) to a RawMarketQuote.
 */
export function calculateConditionAdjustedValuation(
  input: ComicValuationInput,
  quote: RawMarketQuote
): ComicValuationResult {
  const condition: ComicCondition =
    input.condition && input.condition in CONDITION_MULTIPLIERS
      ? (input.condition as ComicCondition)
      : 'Near Mint';

  const conditionMultiplier = CONDITION_MULTIPLIERS[condition] ?? 1.0;
  const { isGraded, numericGrade } = detectGradedStatus(input);

  let finalValue = quote.baseNearMintValue * conditionMultiplier;
  let gradedValue: number | undefined;

  if (isGraded) {
    if (numericGrade && quote.gradeTable) {
      const exactKey = numericGrade.toFixed(1);
      const intKey = String(Math.round(numericGrade));
      if (quote.gradeTable[exactKey] && quote.gradeTable[exactKey] > 0) {
        gradedValue = quote.gradeTable[exactKey];
      } else if (quote.gradeTable[intKey] && quote.gradeTable[intKey] > 0) {
        gradedValue = quote.gradeTable[intKey];
      }
    }

    if (!gradedValue) {
      if (
        (numericGrade && numericGrade >= 9.6) ||
        condition === 'Gem Mint' ||
        condition === 'Mint'
      ) {
        gradedValue = quote.graded98Value || Number((quote.baseNearMintValue * 3.5).toFixed(2));
      } else if (
        (numericGrade && numericGrade >= 9.0) ||
        condition === 'Near Mint'
      ) {
        gradedValue = quote.graded92Value || Number((quote.baseNearMintValue * 2.3).toFixed(2));
      } else {
        gradedValue =
          quote.graded80Value ||
          Number((quote.baseNearMintValue * Math.max(conditionMultiplier * 1.85, 1.1)).toFixed(2));
      }
    }
    finalValue = gradedValue;
  }

  const roundedFinal = Math.max(0.5, Number(finalValue.toFixed(2)));

  return {
    comicId: input.id,
    matchedTitle: quote.matchedTitle,
    source: quote.source,
    sourceUrl: quote.sourceUrl,
    baseNearMintValue: Number(quote.baseNearMintValue.toFixed(2)),
    gradedValue,
    isGradedApplied: isGraded,
    conditionApplied: condition,
    conditionMultiplier: isGraded ? Number((roundedFinal / Math.max(0.5, quote.baseNearMintValue)).toFixed(2)) : conditionMultiplier,
    estimatedValue: roundedFinal,
    confidence: quote.confidence,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Main Multi-Source Free Cascade Lookup:
 * 1. Checks 6-hour in-memory quote cache (unless bypassCache is set)
 * 2. Queries PriceCharting public comic book guide
 * 3. Falls back to eBay Comics (#259104) sold/completed market comps
 * 4. Falls back to Era/Format Guide baseline so batch jobs never hard-fail offline
 */
export async function lookupComicMarketValue(
  input: ComicValuationInput,
  options?: { bypassCache?: boolean }
): Promise<ComicValuationResult> {
  const { cleanTitle, cleanIssue, year, cacheKey } = normalizeComicSearchParts(input);

  if (!options?.bypassCache) {
    const cached = quoteCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < QUOTE_CACHE_TTL_MS) {
      return calculateConditionAdjustedValuation(input, cached);
    }
  }

  let quote = await lookupPriceCharting(cleanTitle, cleanIssue, year);
  if (!quote) {
    quote = await lookupEbayMarket(cleanTitle, cleanIssue, year);
  }
  if (!quote) {
    quote = buildEraGuideFallbackQuote(input, cleanTitle, cleanIssue, year);
  }

  // Only cache high- or medium-confidence real quotes; never cache low-confidence fallback guesses
  if (quote.confidence !== 'low') {
    quoteCache.set(cacheKey, quote);
  } else {
    quoteCache.delete(cacheKey);
  }

  return calculateConditionAdjustedValuation(input, quote);
}

/**
 * Computes collection-wide valuation coverage metrics from PostgreSQL.
 */
export async function getCollectionValuationCoverage(
  pool: Pool,
  staleThresholdDays: number
): Promise<ValuationCoverageStats> {
  const res = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE reading_status != 'Wishlist') AS total_owned,
       COUNT(*) FILTER (WHERE reading_status = 'Wishlist') AS total_wishlist,
       COUNT(*) FILTER (WHERE reading_status != 'Wishlist' AND estimated_value IS NOT NULL AND estimated_value > 0) AS priced_owned,
       COUNT(*) FILTER (WHERE reading_status != 'Wishlist' AND (estimated_value IS NULL OR estimated_value <= 0)) AS missing_owned,
       COUNT(*) FILTER (
         WHERE reading_status != 'Wishlist'
           AND COALESCE(lock_estimated_value, FALSE) = FALSE
           AND (
             estimated_value IS NULL
             OR estimated_value <= 0
             OR value_updated_at IS NULL
             OR value_updated_at < NOW() - ($1::int * INTERVAL '1 day')
           )
       ) AS stale_owned,
       COUNT(*) FILTER (WHERE COALESCE(lock_estimated_value, FALSE) = TRUE) AS locked_count,
       COUNT(*) FILTER (WHERE reading_status = 'Wishlist' AND estimated_value IS NOT NULL AND estimated_value > 0) AS priced_wishlist,
       COUNT(*) FILTER (WHERE reading_status = 'Wishlist' AND (estimated_value IS NULL OR estimated_value <= 0)) AS missing_wishlist,
       COALESCE(SUM(CASE WHEN reading_status != 'Wishlist' THEN COALESCE(estimated_value, 0) * GREATEST(COALESCE(copies_owned, 1), 1) ELSE 0 END), 0) AS total_portfolio_value
     FROM comic_books`,
    [staleThresholdDays]
  );

  const row = res.rows[0] || {};
  return {
    totalOwned: Number(row.total_owned || 0),
    totalWishlist: Number(row.total_wishlist || 0),
    pricedOwned: Number(row.priced_owned || 0),
    missingOwned: Number(row.missing_owned || 0),
    staleOwned: Number(row.stale_owned || 0),
    lockedCount: Number(row.locked_count || 0),
    pricedWishlist: Number(row.priced_wishlist || 0),
    missingWishlist: Number(row.missing_wishlist || 0),
    totalPortfolioValue: Number(Number(row.total_portfolio_value || 0).toFixed(2)),
  };
}

/**
 * Rolling Background Batch Valuation Queue & Periodic Scheduler
 */
class ValuationBatchManager {
  private isRunning = false;
  private isPaused = false;
  private stopRequested = false;
  private scope: ValuationScope = 'all_stale';
  private totalQueued = 0;
  private processedCount = 0;
  private updatedCount = 0;
  private skippedCount = 0;
  private failedCount = 0;
  private currentComicTitle?: string;
  private startedAt?: string;
  private completedAt?: string;
  private recentUpdates: BatchValuationUpdateEntry[] = [];

  private schedulerEnabled = true;
  private staleThresholdDays = 30;
  private dailyBatchLimit = 150;
  private stepDelayMs = 1200;
  private schedulerTimer: NodeJS.Timeout | null = null;

  public initScheduler(pool: Pool | null) {
    if (!pool || this.schedulerTimer) return;
    // Check every 6 hours for stale comics when schedulerEnabled is true
    this.schedulerTimer = setInterval(() => {
      if (this.schedulerEnabled && !this.isRunning && pool) {
        this.startBatch(pool, {
          scope: 'all_stale',
          limit: this.dailyBatchLimit,
        }).catch((err) => console.warn('Scheduled valuation refresh warning:', err));
      }
    }, 6 * 60 * 60 * 1000);
  }

  public configureScheduler(settings: {
    schedulerEnabled?: boolean;
    staleThresholdDays?: number;
    dailyBatchLimit?: number;
  }) {
    if (typeof settings.schedulerEnabled === 'boolean') {
      this.schedulerEnabled = settings.schedulerEnabled;
    }
    if (typeof settings.staleThresholdDays === 'number' && settings.staleThresholdDays >= 1) {
      this.staleThresholdDays = Math.min(365, Math.max(1, Math.round(settings.staleThresholdDays)));
    }
    if (typeof settings.dailyBatchLimit === 'number' && settings.dailyBatchLimit >= 5) {
      this.dailyBatchLimit = Math.min(2000, Math.max(5, Math.round(settings.dailyBatchLimit)));
    }
  }

  public async getStatus(pool: Pool | null): Promise<BatchValuationStatus> {
    const coverage = pool
      ? await getCollectionValuationCoverage(pool, this.staleThresholdDays).catch(() => undefined)
      : undefined;

    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      scope: this.scope,
      totalQueued: this.totalQueued,
      processedCount: this.processedCount,
      updatedCount: this.updatedCount,
      skippedCount: this.skippedCount,
      failedCount: this.failedCount,
      currentComicTitle: this.currentComicTitle,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      recentUpdates: this.recentUpdates.slice(0, 30),
      schedulerEnabled: this.schedulerEnabled,
      staleThresholdDays: this.staleThresholdDays,
      dailyBatchLimit: this.dailyBatchLimit,
      coverage,
    };
  }

  public stopBatch() {
    if (this.isRunning) {
      this.stopRequested = true;
      this.isPaused = false;
    }
  }

  public async startBatch(
    pool: Pool,
    options?: {
      scope?: ValuationScope;
      limit?: number;
      stepDelayMs?: number;
    }
  ): Promise<BatchValuationStatus> {
    if (this.isRunning) {
      return this.getStatus(pool);
    }

    const scope = options?.scope || 'all_stale';
    const limit = Math.min(1000, Math.max(1, options?.limit || this.dailyBatchLimit));
    if (typeof options?.stepDelayMs === 'number' && options.stepDelayMs >= 50) {
      this.stepDelayMs = options.stepDelayMs;
    } else {
      this.stepDelayMs = 800;
    }

    this.scope = scope;
    this.isRunning = true;
    this.isPaused = false;
    this.stopRequested = false;
    this.processedCount = 0;
    this.updatedCount = 0;
    this.skippedCount = 0;
    this.failedCount = 0;
    this.startedAt = new Date().toISOString();
    this.completedAt = undefined;
    this.currentComicTitle = 'Selecting comics to price...';

    // Build SQL filter based on scope, always respecting lock_estimated_value = FALSE
    // and prioritizing Owned comics first, then missing values first, then oldest value_updated_at
    let whereClause = `COALESCE(lock_estimated_value, FALSE) = FALSE`;
    const params: unknown[] = [];

    if (scope === 'missing_only') {
      whereClause += ` AND (estimated_value IS NULL OR estimated_value <= 0)`;
    } else if (scope === 'owned_only') {
      params.push(this.staleThresholdDays);
      whereClause += ` AND reading_status != 'Wishlist' AND (
        estimated_value IS NULL
        OR estimated_value <= 0
        OR value_updated_at IS NULL
        OR value_updated_at < NOW() - ($1::int * INTERVAL '1 day')
      )`;
    } else if (scope === 'wishlist_only') {
      params.push(this.staleThresholdDays);
      whereClause += ` AND reading_status = 'Wishlist' AND (
        estimated_value IS NULL
        OR estimated_value <= 0
        OR value_updated_at IS NULL
        OR value_updated_at < NOW() - ($1::int * INTERVAL '1 day')
      )`;
    } else {
      // all_stale: Owned first, then Wishlist, missing or older than staleThresholdDays
      params.push(this.staleThresholdDays);
      whereClause += ` AND (
        estimated_value IS NULL
        OR estimated_value <= 0
        OR value_updated_at IS NULL
        OR value_updated_at < NOW() - ($1::int * INTERVAL '1 day')
      )`;
    }

    params.push(limit);
    const limitParamIdx = params.length;

    const querySql = `
      SELECT id, title, series_name, full_title, issue_number, volume, publication_year,
             publisher, format, condition, purchase_price, estimated_value, tags, notes
      FROM comic_books
      WHERE ${whereClause}
      ORDER BY
        CASE WHEN reading_status != 'Wishlist' THEN 0 ELSE 1 END ASC,
        CASE WHEN estimated_value IS NULL OR estimated_value <= 0 THEN 0 ELSE 1 END ASC,
        value_updated_at ASC NULLS FIRST,
        title ASC
      LIMIT $${limitParamIdx}
    `;

    try {
      const candidateRes = await pool.query(querySql, params);
      const candidates = candidateRes.rows;
      this.totalQueued = candidates.length;

      if (candidates.length === 0) {
        this.isRunning = false;
        this.currentComicTitle = undefined;
        this.completedAt = new Date().toISOString();
        return this.getStatus(pool);
      }

      // Run the queue asynchronously in the background
      void this.processQueue(pool, candidates);
      return this.getStatus(pool);
    } catch (err) {
      this.isRunning = false;
      this.currentComicTitle = undefined;
      throw err;
    }
  }

  private async processQueue(pool: Pool, candidates: Record<string, unknown>[]) {
    try {
      for (const row of candidates) {
        if (this.stopRequested) break;

        const id = String(row.id);
        const title = String(row.title || 'Untitled');
        const issueNumber = String(row.issue_number || '1');
        const fullTitle =
          row.full_title
            ? String(row.full_title)
            : issueNumber
            ? `${title} #${issueNumber}`
            : title;

        this.currentComicTitle = fullTitle;

        try {
          const tags: string[] = Array.isArray(row.tags)
            ? (row.tags as string[])
            : typeof row.tags === 'string'
            ? JSON.parse(row.tags || '[]')
            : [];

          const input: ComicValuationInput = {
            id,
            title,
            seriesName: row.series_name ? String(row.series_name) : undefined,
            issueNumber,
            volume: row.volume ? String(row.volume) : undefined,
            publicationYear: row.publication_year ? Number(row.publication_year) : undefined,
            publisher: row.publisher ? String(row.publisher) : undefined,
            format: row.format ? String(row.format) : 'Single Issue',
            condition: (row.condition as ComicCondition) || 'Near Mint',
            purchasePrice: row.purchase_price !== null && row.purchase_price !== undefined ? Number(row.purchase_price) : undefined,
            estimatedValue: row.estimated_value !== null && row.estimated_value !== undefined ? Number(row.estimated_value) : undefined,
            tags,
            notes: row.notes ? String(row.notes) : undefined,
          };

          const { cacheKey } = normalizeComicSearchParts(input);
          const wasCached = quoteCache.has(cacheKey);

          const valuation = await lookupComicMarketValue(input);
          const oldVal =
            row.estimated_value !== null && row.estimated_value !== undefined
              ? Number(row.estimated_value)
              : undefined;

          await pool.query(
            `UPDATE comic_books
             SET previous_estimated_value = COALESCE(estimated_value, previous_estimated_value),
                 estimated_value = $1,
                 value_updated_at = $2,
                 value_source = $3,
                 updated_at = NOW()
             WHERE id = $4 AND COALESCE(lock_estimated_value, FALSE) = FALSE`,
            [valuation.estimatedValue, valuation.updatedAt, valuation.source, id]
          );

          this.updatedCount++;
          this.recentUpdates.unshift({
            comicId: id,
            fullTitle,
            oldValue: oldVal,
            newValue: valuation.estimatedValue,
            source: valuation.source,
            sourceUrl: valuation.sourceUrl,
            condition: valuation.conditionApplied,
            isGraded: valuation.isGradedApplied,
            updatedAt: valuation.updatedAt,
          });
          if (this.recentUpdates.length > 50) {
            this.recentUpdates.length = 50;
          }

          // Polite delay only when an external network lookup occurred
          if (!wasCached && !this.stopRequested) {
            await new Promise((resolve) => setTimeout(resolve, this.stepDelayMs));
          }
        } catch (itemErr) {
          console.warn(`Valuation lookup failed for comic ${id}:`, itemErr);
          this.failedCount++;
        } finally {
          this.processedCount++;
        }
      }
    } finally {
      this.isRunning = false;
      this.stopRequested = false;
      this.currentComicTitle = undefined;
      this.completedAt = new Date().toISOString();
    }
  }
}

export const valuationBatchManager = new ValuationBatchManager();
