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
  bio?: string;
}

export interface ComicBook {
  id: string;
  title: string;
  issueNumber: string;
  volume?: string;
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
