import { ComicBook } from '../types';

export type ChallengeStatus = 'Active' | 'Completed' | 'Abandoned';
export type ChallengeItemStatus = 'Unread' | 'Read' | 'Skipped';

export type CriterionLeaf =
  | { type: 'collection' }
  | { type: 'publisher'; ids: string[] }
  | { type: 'series'; ids: string[] }
  | { type: 'storyArc'; ids: string[] }
  | { type: 'creator'; ids: string[]; roles: string[] }
  | { type: 'character'; ids: string[] }
  | { type: 'releaseDateRange'; from?: string; through?: string };

export type CriterionGroup = {
  type: 'group';
  operator: 'AND' | 'OR';
  children: CriterionNode[];
};

export type CriterionNode = CriterionLeaf | CriterionGroup;

export interface ReadingChallengeCriteria {
  version: 1;
  root: CriterionNode;
}

export interface ComicMetadataSnapshot {
  id: string;
  title: string;
  fullTitle?: string;
  seriesName?: string;
  issueNumber: string;
  volume?: string;
  publisher: string;
  publicationYear?: number;
  publicationMonth?: string;
  publicationDate?: string;
  genre?: string;
  event?: string;
  writer?: string;
  artist?: string;
  coverArtist?: string;
  creatorContributions?: Array<{ creatorName: string; roleName: string }>;
  characterAppearances?: Array<{ characterName: string; appearanceType?: string }>;
  coverImage?: string;
  coverImageFull?: string;
  format?: string;
  sizeThickness?: number;
  currentBoxId?: number;
}

export interface ReadingChallengeRecord {
  id: number;
  name: string;
  status: ChallengeStatus;
  criteriaSnapshot: ReadingChallengeCriteria;
  criteriaVersion: number;
  readingOrder: string;
  sortDirection: string;
  batchSize: number;
  createdAt: string;
  startedAt: string;
  completedAt?: string | null;
  endedAt?: string | null;
  totalEligibleCount: number;
  criteriaSummary?: string | null;
}

export interface ChallengeQueueItem {
  challengeItemId: number;
  challengeId: number;
  comicId: string;
  sequenceNumber: number;
  status: ChallengeItemStatus;
  addedAt: string;
  readAt?: string | null;
  skippedAt?: string | null;
  metadata: ComicMetadataSnapshot;
  // Current live storage box info (if available)
  currentBoxId?: number;
  boxName?: string;
  boxLocation?: string;
  boxColorTag?: string;
}

export interface ReadingChallengeSummary {
  challengeId: number;
  name: string;
  status: ChallengeStatus;
  criteriaSnapshot: ReadingChallengeCriteria;
  criteriaSummary: string;
  readingOrder: string;
  sortDirection: string;
  batchSize: number;
  createdAt: string;
  startedAt: string;
  completedAt?: string | null;
  endedAt?: string | null;
  totalEligible: number;
  readCount: number;
  skippedCount: number;
  resolvedCount: number;
  remainingCount: number;
  progressPercent: number;
  queue: ChallengeQueueItem[];
}

export interface PreviewChallengeRequest {
  criteria: ReadingChallengeCriteria;
  readingOrder?: 'PublicationDate';
  sortDirection?: 'Ascending' | 'Descending';
  limit?: number;
}

export interface PreviewChallengeResponse {
  eligibleCount: number;
  previewItems: ComicBook[];
  criteriaSummary: string;
  warnings?: string[];
}

export interface CreateReadingChallengeRequest {
  name: string;
  criteria: ReadingChallengeCriteria;
  readingOrder?: 'PublicationDate';
  sortDirection?: 'Ascending' | 'Descending';
  batchSize?: number;
  abandonCurrentActive?: boolean;
}

export type MilestoneKind = 'Earliest' | 'Latest';
export type MilestoneScope = 'WholeChallenge' | 'ReadItems';
export type MilestoneCategory =
  | 'Collection'
  | 'Publisher'
  | 'Series'
  | 'StoryArc'
  | 'Creator'
  | 'Character';

export interface ChallengeMilestone {
  category: MilestoneCategory;
  entityId?: string;
  entityName: string;
  role?: string;
  kind: MilestoneKind;
  scope: MilestoneScope;
  challengeItemId: number;
  comicId: string;
  title: string;
  fullTitle?: string;
  seriesName?: string;
  issueNumber: string;
  releaseDate?: string;
  dateKnown: boolean;
  coverImage?: string;
  sequenceNumber: number;
  isRead: boolean;
  label?: string;
  description?: string;
  collectionCount?: number;
}

export interface ChallengeInsightsResponse {
  challengeId: number;
  challengeName: string;
  totalEligible: number;
  readCount: number;
  milestones: ChallengeMilestone[];
  tbrMilestones?: TBRMilestonesSummary;
}

export type TBRHighlightCategory =
  | 'Collection'
  | 'Publisher'
  | 'Series'
  | 'StoryArc'
  | 'Creator'
  | 'Character';

export interface TBRHighlight {
  id: string;
  comicId: string;
  challengeItemId: number;
  sequenceNumber: number;
  category: TBRHighlightCategory;
  entityName: string;
  role?: string;
  label: string;
  description: string;
  releaseDate?: string;
  collectionCount?: number;
}

export interface TBRQueueItemHighlights {
  challengeItemId: number;
  comicId: string;
  sequenceNumber: number;
  title: string;
  issueNumber: string;
  seriesName?: string;
  publisher?: string;
  coverImage?: string;
  releaseDate?: string;
  highlights: TBRHighlight[];
}

export interface TBRMilestonesSummary {
  totalTBRComics: number;
  comicsWithMilestonesCount: number;
  totalMilestonesCount: number;
  itemsWithHighlights: TBRQueueItemHighlights[];
  allHighlights: TBRHighlight[];
}

export interface ReadingHistoryRecord {
  id: number;
  challengeId?: number | null;
  challengeItemId?: number | null;
  comicId?: string | null;
  comicTitle?: string | null;
  issueNumber?: string | null;
  action: 'Read' | 'Unread' | 'Skipped' | 'Unskipped';
  occurredAt: string;
  notes?: string | null;
}

export interface ChallengeHistorySummary {
  id: number;
  name: string;
  status: 'Completed' | 'Abandoned';
  createdAt: string;
  startedAt: string;
  completedAt?: string | null;
  endedAt?: string | null;
  totalEligible: number;
  criteriaSummary: string;
  readCount: number;
  skippedCount: number;
  completionPercent: number;
}

