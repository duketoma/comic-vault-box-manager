export type ComicFormat = 'Single Issue' | 'Trade Paperback' | 'Hardcover' | 'Omnibus' | 'Graphic Novel';

export type ReadingStatus = 'Unread' | 'Reading' | 'Read' | 'Wishlist';

export type ComicCondition = 'Gem Mint' | 'Near Mint' | 'Very Fine' | 'Fine' | 'Very Good' | 'Good' | 'Fair' | 'Poor';

export const CREATOR_ROLES = [
  'Writer',
  'Penciler',
  'Inker',
  'Letterer',
  'Colorist',
  'Assistant Editor',
  'Editor',
  'Editor-in-Chief',
  'Cover Penciler',
  'Cover Inker',
  'Cover Letterer',
  'Cover Colorer',
] as const;

export type CreatorRole = typeof CREATOR_ROLES[number] | string;

export interface CreatorContribution {
  id?: string;
  creatorName: string;
  roleName: CreatorRole;
  creatorType?: string;
  isMultiRole?: boolean;
  allRoles?: string[];
  bio?: string;
}

export interface CharacterAppearance {
  id?: string;
  characterName: string;
  appearanceType: string; // 'Main' | 'Supporting' | 'Cameo' | 'Cover Only' | string
}

export interface CreatorRecord {
  id?: number;
  firstName?: string;
  lastName?: string;
  fullName: string;
  issueCount?: number;
  roles?: { roleName: string; count: number }[];
  isMultiRole?: boolean;
  series?: string[];
}

export interface CreatorTypeRecord {
  id?: number;
  typeName: string;
}

export interface TitleContributorRecord {
  id?: number;
  seriesName?: string;
  fullTitle: string;
  creatorFullName: string;
  creatorType: string;
  comicId?: string;
}

export interface TitleCharacterAppearanceRecord {
  id?: number;
  seriesName?: string;
  fullTitle: string;
  characterName: string;
  appearanceType: string;
  comicId?: string;
}

export interface SeriesIssueTotal {
  id?: number;
  publisher: string;
  seriesName: string;
  volume?: string;
  issueCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SeriesCollectionProgress {
  seriesName: string;
  publisher: string;
  volume?: string;
  totalIssues: number;
  ownedCount: number;
  readCount: number;
  unreadCount: number;
  wishlistCount: number;
  collectionPct: number;
  remainingIssues: number;
  isRunComplete: boolean;
  totalValue: number;
}

export interface ComicBook {
  id: string;
  title: string;
  issueNumber: string;
  volume?: string;
  seriesName?: string; // name of comic series including Volume and years (e.g. "The Amazing Spider-Man (1963 - 1998)")
  seriesTotalIssues?: number; // Total published issues in this series (from series_issue_totals)
  fullTitle?: string; // name of title including issue number (e.g. "The Amazing Spider-Man #300")
  event?: string; // Cross-title crossover event (e.g., "Civil War", "Secret Wars")
  copiesOwned?: number; // Physical copies owned (default 1)
  publisher: string;
  publicationYear: number;
  publicationMonth?: string;
  publicationDate?: string;
  genre: string;
  writer: string;
  artist: string;
  coverArtist?: string;
  creatorContributions?: CreatorContribution[];
  characterAppearances?: CharacterAppearance[];
  coverImage: string;
  format: ComicFormat;
  sizeThickness: number; // Equivalent comic book size (1.0 = standard issue)
  currentBoxId: number;  // 1 to 15 (or custom box id)
  proposedBoxId?: number; // Optional rebalancing proposal
  readingStatus: ReadingStatus;
  readCount: number;
  lastReadDate?: string;
  userRating?: number; // 1-5
  condition: ComicCondition;
  purchasePrice?: number;
  estimatedValue?: number;
  notes?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StorageBox {
  id: number;
  name: string;
  location: string;
  maxCapacity: number; // Total capacity in equivalent issue units (e.g. 150)
  colorTag: string;
  notes?: string;
}

export interface ReadingLog {
  id: string;
  comicId: string;
  comicTitle: string;
  issueNumber: string;
  readDate: string;
  rating?: number;
  notes?: string;
}

export interface GoogleSheetColumnMapping {
  titleCol: string;
  issueCol: string;
  volumeCol?: string;
  eventCol?: string;
  copiesCol?: string;
  publisherCol: string;
  yearCol: string;
  genreCol: string;
  writerCol: string;
  artistCol: string;
  boxCol: string;
  thicknessCol: string;
  statusCol: string;
  valueCol: string;
}

export interface BoxCapacityAnalysis {
  boxId: number;
  boxName: string;
  maxCapacity: number;
  currentUsed: number;
  currentCount: number;
  currentPercent: number;
  proposedUsed: number;
  proposedCount: number;
  proposedPercent: number;
  isOverCapacity: boolean;
  isProposedOverCapacity: boolean;
}
