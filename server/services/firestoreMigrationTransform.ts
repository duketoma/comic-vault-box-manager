import { parseTitleAndIssue } from '../../src/utils/titleParser';

export interface MasterComicDoc {
  id: string;
  title: string;
  issueNumber: string;
  volume: string | null;
  seriesName: string | null;
  fullTitle: string;
  publisher: string;
  publicationYear: number | null;
  publicationMonth: string | null;
  publicationDate: string | null;
  genre: string | null;
  writer: string | null;
  artist: string | null;
  coverArtist: string | null;
  creatorContributions: Array<{ creatorName: string; roleName: string }>;
  characterAppearances: Array<{ characterName: string; appearanceType: string }>;
  /**
   * Canonical compressed .webp cover hosted in Firebase Cloud Storage.
   * Never stores the Admin's personal Google Drive links.
   */
  coverImage: string;
  coverImageFull: string | null;
  format: string;
  sizeThickness: number;
  event: string | null;
  estimatedValue: number | null;
  previousEstimatedValue: number | null;
  valueUpdatedAt: string | null;
  valueSource: string | null;
  verified: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserComicDoc {
  id: string;
  userId: string;
  masterComicId: string;
  // Denormalized bibliographic metadata to avoid N+1 Firestore reads on collection load / delta sync
  title: string;
  issueNumber: string;
  volume: string | null;
  seriesName: string | null;
  fullTitle: string;
  publisher: string;
  publicationYear: number | null;
  publicationMonth: string | null;
  publicationDate: string | null;
  genre: string | null;
  writer: string | null;
  artist: string | null;
  coverArtist: string | null;
  creatorContributions: Array<{ creatorName: string; roleName: string }>;
  characterAppearances: Array<{ characterName: string; appearanceType: string }>;
  format: string;
  sizeThickness: number;
  event: string | null;
  // User-specific storage & reading state (Rule 13 & Rule 10 invariants)
  currentBoxId: number;
  proposedBoxId: number | null;
  readingStatus: 'Read' | 'Reading' | 'Unread' | 'Wishlist';
  copiesOwned: number;
  readCount: number;
  userRating: number | null;
  condition: string | null;
  purchasePrice: number | null;
  estimatedValue: number | null;
  previousEstimatedValue: number | null;
  valueUpdatedAt: string | null;
  valueSource: string | null;
  lockEstimatedValue: boolean;
  // Two-Tier Cover Image Resolution
  masterCoverImage: string;
  masterCoverImageFull: string | null;
  coverImageOverride: string | null;
  coverImageFullOverride: string | null;
  coverImage: string;
  coverImageFull: string | null;
  notes: string | null;
  tags: string[];
  inCollection: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreStorageBoxDoc {
  id: number;
  userId: string;
  boxNumber: number;
  name: string;
  location: string;
  maxCapacity: number;
  colorTag: string;
  notes: string | null;
  updatedAt: string;
}

export function isPlaceholderCover(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return true;
  const clean = url.trim();
  if (!clean) return true;
  if (clean.toLowerCase() === 'noimage.webp' || clean.toLowerCase().includes('noimage')) {
    return true;
  }
  // Default CSV import placeholder Drive file ID in scripts/import-comic-csv.mjs
  if (clean.includes('1h-E8ndmQeDajXJaZKqRW9JU9PjXZH0jX')) {
    return true;
  }
  return false;
}

export function isFirebaseStorageUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  return (
    clean.includes('firebasestorage.googleapis.com') ||
    clean.includes('.firebasestorage.app') ||
    clean.startsWith('gs://')
  );
}

function parseJsonArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toIsoTimestamp(val: unknown, fallbackIso: string): string {
  if (!val) return fallbackIso;
  if (val instanceof Date) return val.toISOString();
  const str = String(val).trim();
  if (!str) return fallbackIso;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? str : parsed.toISOString();
}

function toNullableNumber(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Splits a PostgreSQL `comic_books` row into:
 *  1. `masterComic`: Shared canonical metadata for `master_comics/{comicId}`.
 *     - Never exposes the Admin's personal Google Drive / external cloud cover URLs.
 *     - Uses Firebase Storage compressed `.webp` URL if already present, otherwise `'NoImage.webp'`.
 *  2. `userComic`: Personal collection instance for `users/{adminUid}/comics/{comicId}`.
 *     - Preserves the Admin's high-quality Google Drive / cloud cover URLs in `coverImageOverride`
 *       and `coverImageFullOverride` so the Admin continues seeing their full-quality covers.
 *     - Enforces Rule 13 (`Box -1` for Wishlist, `Box >= 0` for Owned) and Rule 10 (`copiesOwned` bounds).
 */
export function splitComicIntoMasterAndUserInstance(
  row: Record<string, unknown>,
  adminUid: string,
  nowIso = new Date().toISOString()
): { masterComic: MasterComicDoc; userComic: UserComicDoc } {
  const id = String(row.id ?? '').trim();
  if (!id) {
    throw new Error('Cannot migrate comic row with missing id');
  }

  let title = String(row.title ?? '').trim() || 'Untitled Comic';
  let issueNumber = String(row.issue_number ?? row.issueNumber ?? '').trim() || 'Unknown';
  const parsedTitle = parseTitleAndIssue(title, issueNumber);
  title = parsedTitle.cleanTitle || title;
  issueNumber = parsedTitle.issueNumber || issueNumber;

  const seriesNameRaw = String(row.series_name ?? row.seriesName ?? '').trim();
  const seriesName = seriesNameRaw || null;
  const fullTitleRaw = String(row.full_title ?? row.fullTitle ?? '').trim();
  const fullTitle =
    fullTitleRaw ||
    (issueNumber && issueNumber !== 'Unknown' ? `${title} #${issueNumber}` : title);

  const publisher = String(row.publisher ?? '').trim() || 'Unknown Publisher';
  const volumeRaw = String(row.volume ?? '').trim();
  const volume = volumeRaw || null;

  const rawCover = String(row.cover_image ?? row.coverImage ?? '').trim();
  const rawCoverFull = String(row.cover_image_full ?? row.coverImageFull ?? '').trim();

  // Determine Two-Tier Cover URLs:
  // Only Firebase Storage URLs belong on master_comics; Admin's Google Drive / high-res links
  // are preserved exclusively on userComic.coverImageOverride & coverImageFullOverride.
  let masterCoverImage = 'NoImage.webp';
  let coverImageOverride: string | null = null;

  if (!isPlaceholderCover(rawCover)) {
    if (isFirebaseStorageUrl(rawCover)) {
      masterCoverImage = rawCover;
    } else {
      coverImageOverride = rawCover;
    }
  }

  let masterCoverImageFull: string | null = null;
  let coverImageFullOverride: string | null = null;

  if (!isPlaceholderCover(rawCoverFull)) {
    if (isFirebaseStorageUrl(rawCoverFull)) {
      masterCoverImageFull = rawCoverFull;
    } else {
      coverImageFullOverride = rawCoverFull;
    }
  }

  const effectiveCoverImage = coverImageOverride || masterCoverImage || 'NoImage.webp';
  const effectiveCoverImageFull = coverImageFullOverride || masterCoverImageFull || null;

  const rawStatus = String(row.reading_status ?? row.readingStatus ?? 'Unread').trim();
  const readingStatus: 'Read' | 'Reading' | 'Unread' | 'Wishlist' =
    rawStatus === 'Read' || rawStatus === 'Reading' || rawStatus === 'Wishlist'
      ? rawStatus
      : 'Unread';

  const isWishlist = readingStatus === 'Wishlist';

  // Rule 13: Wishlisted comics must always be assigned to Box ID -1; owned comics >= 0
  const rawBoxId = toNullableNumber(row.current_box_id ?? row.currentBoxId);
  const currentBoxId = isWishlist
    ? -1
    : rawBoxId !== null && rawBoxId >= 0
      ? rawBoxId
      : 0;

  // Rule 10: copiesOwned is 0 for wishlist, >= 1 for owned
  const rawCopies = toNullableNumber(row.copies_owned ?? row.copiesOwned);
  const copiesOwned = isWishlist ? 0 : Math.max(1, Math.round(rawCopies ?? 1));

  const rawReadCount = toNullableNumber(row.read_count ?? row.readCount) ?? 0;
  const readCount = readingStatus === 'Read' && rawReadCount <= 0 ? 1 : Math.max(0, Math.round(rawReadCount));

  const creatorContributions = parseJsonArray<{ creatorName: string; roleName: string }>(
    row.creator_contributions ?? row.creatorContributions
  );
  const characterAppearances = parseJsonArray<{ characterName: string; appearanceType: string }>(
    row.character_appearances ?? row.characterAppearances
  );
  const tags = parseJsonArray<string>(row.tags).map((t) => String(t).trim()).filter(Boolean);

  const createdAt = toIsoTimestamp(row.created_at ?? row.createdAt, nowIso);
  const updatedAt = toIsoTimestamp(row.updated_at ?? row.updatedAt, nowIso);
  const valueUpdatedAt =
    row.value_updated_at || row.valueUpdatedAt
      ? toIsoTimestamp(row.value_updated_at ?? row.valueUpdatedAt, nowIso)
      : null;

  const format = String(row.format ?? 'Single Issue').trim() || 'Single Issue';
  const sizeThickness = Math.max(0.1, toNullableNumber(row.size_thickness ?? row.sizeThickness) ?? 1.0);
  const publicationYear = toNullableNumber(row.publication_year ?? row.publicationYear);
  const publicationMonth = row.publication_month ?? row.publicationMonth
    ? String(row.publication_month ?? row.publicationMonth).trim()
    : null;
  const publicationDate = row.publication_date ?? row.publicationDate
    ? String(row.publication_date ?? row.publicationDate).trim()
    : null;
  const genre = row.genre ? String(row.genre).trim() : null;
  const writer = row.writer ? String(row.writer).trim() : null;
  const artist = row.artist ? String(row.artist).trim() : null;
  const coverArtist = row.cover_artist ?? row.coverArtist
    ? String(row.cover_artist ?? row.coverArtist).trim()
    : null;
  const event = row.event ? String(row.event).trim() : null;
  const estimatedValue = toNullableNumber(row.estimated_value ?? row.estimatedValue);
  const previousEstimatedValue = toNullableNumber(
    row.previous_estimated_value ?? row.previousEstimatedValue
  );
  const valueSource = row.value_source ?? row.valueSource
    ? String(row.value_source ?? row.valueSource).trim()
    : null;

  const masterComic: MasterComicDoc = {
    id,
    title,
    issueNumber,
    volume,
    seriesName,
    fullTitle,
    publisher,
    publicationYear,
    publicationMonth,
    publicationDate,
    genre,
    writer,
    artist,
    coverArtist,
    creatorContributions,
    characterAppearances,
    coverImage: masterCoverImage,
    coverImageFull: masterCoverImageFull,
    format,
    sizeThickness,
    event,
    estimatedValue,
    previousEstimatedValue,
    valueUpdatedAt,
    valueSource,
    verified: true,
    createdByUserId: adminUid,
    createdAt,
    updatedAt,
  };

  const userComic: UserComicDoc = {
    id,
    userId: adminUid,
    masterComicId: id,
    title,
    issueNumber,
    volume,
    seriesName,
    fullTitle,
    publisher,
    publicationYear,
    publicationMonth,
    publicationDate,
    genre,
    writer,
    artist,
    coverArtist,
    creatorContributions,
    characterAppearances,
    format,
    sizeThickness,
    event,
    currentBoxId,
    proposedBoxId: toNullableNumber(row.proposed_box_id ?? row.proposedBoxId),
    readingStatus,
    copiesOwned,
    readCount,
    userRating: toNullableNumber(row.user_rating ?? row.userRating),
    condition: row.condition ? String(row.condition).trim() : isWishlist ? 'Near Mint' : 'Good',
    purchasePrice: toNullableNumber(row.purchase_price ?? row.purchasePrice),
    estimatedValue,
    previousEstimatedValue,
    valueUpdatedAt,
    valueSource,
    lockEstimatedValue: Boolean(row.lock_estimated_value ?? row.lockEstimatedValue),
    masterCoverImage,
    masterCoverImageFull,
    coverImageOverride,
    coverImageFullOverride,
    coverImage: effectiveCoverImage,
    coverImageFull: effectiveCoverImageFull,
    notes: row.notes ? String(row.notes) : null,
    tags,
    inCollection: row.in_collection !== undefined ? Boolean(row.in_collection) : true,
    createdAt,
    updatedAt,
  };

  return { masterComic, userComic };
}

export function buildCanonicalSeriesTotalKey(seriesName: string, volume?: string | null): string {
  const cleanSeries = String(seriesName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cleanVol = String(volume ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return `${cleanSeries || 'unknown-series'}__vol_${cleanVol || 'default'}`;
}

export function normalizeBoxForFirestore(
  row: Record<string, unknown>,
  userId: string,
  nowIso = new Date().toISOString()
): FirestoreStorageBoxDoc {
  const id = Number(row.id ?? 0);
  return {
    id,
    userId,
    boxNumber: id,
    name: String(row.name ?? `Box #${id}`).trim(),
    location: String(row.location ?? 'Unassigned').trim(),
    maxCapacity: Math.max(1, Number(row.max_capacity ?? row.maxCapacity ?? 150) || 150),
    colorTag: String(row.color_tag ?? row.colorTag ?? '#6366f1').trim(),
    notes: row.notes ? String(row.notes) : null,
    updatedAt: toIsoTimestamp(row.updated_at ?? row.updatedAt, nowIso),
  };
}
