import {
  ChallengeMilestone,
  ChallengeQueueItem,
  ComicMetadataSnapshot,
  MilestoneCategory,
  MilestoneKind,
  MilestoneScope,
  TBRHighlight,
  TBRHighlightCategory,
  TBRMilestonesSummary,
  TBRQueueItemHighlights,
} from '../types/readingChallenge.types';
import { ComicBook } from '../types';
import { getNormalizedReleaseDate, isComicEligibleForChallenge } from './challengeCriteriaEngine';
import { splitCreatorNames } from './creatorParser';

interface ItemEntry {
  challengeItemId: number;
  comicId: string;
  sequenceNumber: number;
  status: 'Unread' | 'Read' | 'Skipped';
  metadata: ComicMetadataSnapshot;
}

interface MilestoneCandidate {
  item: ItemEntry;
  dateStr: string | null;
  sortValue: number;
}

/**
 * Computes milestones for both 'WholeChallenge' and 'ReadItems' scopes.
 * Evaluates candidate comics against the whole collection baseline so only true
 * collection-wide firsts and lasts are surfaced.
 */
export function computeChallengeMilestones(
  items: ItemEntry[],
  collection?: ComicBook[]
): ChallengeMilestone[] {
  const milestones: ChallengeMilestone[] = [];

  // Build baselines from the entire collection (or fallback to items if collection is omitted)
  const baselines = collection && collection.length > 0
    ? buildCollectionBaselines(collection)
    : buildCollectionBaselines(items.map((it) => it.metadata as unknown as ComicBook));

  // 1. Whole Challenge Candidates vs. Read Items Candidates
  const wholeChallengeCandidates: MilestoneCandidate[] = items.map((item) => {
    const { dateStr, sortValue } = getNormalizedReleaseDate(item.metadata as unknown as Partial<ComicBook>);
    return { item, dateStr, sortValue };
  });

  const readCandidates = wholeChallengeCandidates.filter((c) => c.item.status === 'Read');

  const categoryPriority: Record<MilestoneCategory, number> = {
    Collection: 1,
    Character: 2,
    Creator: 3,
    StoryArc: 4,
    Series: 5,
    Publisher: 6,
  };

  function calculateForScope(candidates: MilestoneCandidate[], scope: MilestoneScope) {
    if (candidates.length === 0) return;

    // Filter to candidates with valid dates and sortValues
    const datedCandidates = candidates.filter(
      (c) => c.dateStr !== null && c.sortValue !== Number.MAX_SAFE_INTEGER
    );
    if (datedCandidates.length === 0) return;

    const seenMilestoneKeys = new Set<string>();

    function addMilestone(
      cand: MilestoneCandidate,
      category: MilestoneCategory,
      entityName: string,
      kind: MilestoneKind,
      label: string,
      description: string,
      entityId?: string,
      role?: string,
      collectionCount?: number
    ) {
      const key = `${scope}__${category}__${entityName.toLowerCase()}__${role || ''}__${kind}`;
      if (seenMilestoneKeys.has(key)) return;
      seenMilestoneKeys.add(key);

      milestones.push({
        category,
        entityId,
        entityName,
        role,
        kind,
        scope,
        challengeItemId: cand.item.challengeItemId,
        comicId: cand.item.comicId,
        title: cand.item.metadata.title,
        fullTitle: cand.item.metadata.fullTitle,
        seriesName: cand.item.metadata.seriesName,
        issueNumber: cand.item.metadata.issueNumber,
        releaseDate: cand.dateStr || undefined,
        dateKnown: cand.dateStr !== null,
        coverImage: cand.item.metadata.coverImage || cand.item.metadata.coverImageFull,
        sequenceNumber: cand.item.sequenceNumber,
        isRead: cand.item.status === 'Read',
        label,
        description,
        collectionCount,
      });
    }

    // A. Collection Overall Oldest / Newest
    if (baselines.overallEarliest) {
      const earliestCand = [...datedCandidates].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      if (earliestCand && earliestCand.sortValue <= baselines.overallEarliest.minSortValue) {
        addMilestone(
          earliestCand,
          'Collection',
          'Entire Collection',
          'Earliest',
          'Oldest Comic in Collection',
          `The earliest published comic in your entire collection (${earliestCand.dateStr})`
        );
      }
    }

    if (baselines.overallLatest && baselines.overallEarliest && baselines.overallLatest.maxSortValue > baselines.overallEarliest.minSortValue) {
      const latestCand = [...datedCandidates].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return b.sortValue - a.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      if (latestCand && latestCand.sortValue >= baselines.overallLatest.maxSortValue) {
        addMilestone(
          latestCand,
          'Collection',
          'Entire Collection',
          'Latest',
          'Newest Comic in Collection',
          `The most recently published comic in your entire collection (${latestCand.dateStr})`
        );
      }
    }

    // B. Group by Publisher
    baselines.publishers.forEach((base, pubKey) => {
      const matching = datedCandidates.filter((c) => {
        const pub = (c.item.metadata.publisher || '').trim().toLowerCase();
        return pub === pubKey;
      });
      if (matching.length === 0) return;

      const earliest = [...matching].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      const latest = [...matching].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return b.sortValue - a.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      if (earliest && earliest.sortValue <= base.minSortValue) {
        addMilestone(
          earliest,
          'Publisher',
          base.name,
          'Earliest',
          `Earliest ${base.name} Issue`,
          `The earliest published ${base.name} comic in your collection (${base.count} owned)`,
          undefined,
          undefined,
          base.count
        );
      }

      if (base.count >= 2 && latest && latest.sortValue >= base.maxSortValue) {
        if (latest.item.challengeItemId !== earliest.item.challengeItemId || earliest.sortValue > base.minSortValue) {
          addMilestone(
            latest,
            'Publisher',
            base.name,
            'Latest',
            `Latest ${base.name} Issue`,
            `The most recently published ${base.name} comic in your collection (${base.count} owned)`,
            undefined,
            undefined,
            base.count
          );
        }
      }
    });

    // C. Group by Series (at least 2 owned in collection to be notable)
    baselines.series.forEach((base, serKey) => {
      if (base.count < 2) return;

      const matching = datedCandidates.filter((c) => {
        const ser = (c.item.metadata.seriesName || c.item.metadata.title || '').trim().toLowerCase();
        return ser === serKey;
      });
      if (matching.length === 0) return;

      const earliest = [...matching].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      const latest = [...matching].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return b.sortValue - a.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      if (earliest && earliest.sortValue <= base.minSortValue) {
        addMilestone(
          earliest,
          'Series',
          base.name,
          'Earliest',
          `Earliest ${base.name} in Collection`,
          `The earliest owned issue of ${base.name} in your collection (1 of ${base.count} owned)`,
          undefined,
          undefined,
          base.count
        );
      }

      if (latest && latest.sortValue >= base.maxSortValue) {
        if (latest.item.challengeItemId !== earliest.item.challengeItemId || earliest.sortValue > base.minSortValue) {
          addMilestone(
            latest,
            'Series',
            base.name,
            'Latest',
            `Latest ${base.name} in Collection`,
            `The latest owned issue of ${base.name} in your collection (${base.count} owned)`,
            undefined,
            undefined,
            base.count
          );
        }
      }
    });

    // D. Group by Story Arc / Event
    baselines.events.forEach((base, evKey) => {
      const matching = datedCandidates.filter((c) => {
        const ev = (c.item.metadata.event || '').trim().toLowerCase();
        return ev === evKey;
      });
      if (matching.length === 0) return;

      const earliest = [...matching].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      const latest = [...matching].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return b.sortValue - a.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      if (earliest && earliest.sortValue <= base.minSortValue) {
        addMilestone(
          earliest,
          'StoryArc',
          base.name,
          'Earliest',
          `Earliest ${base.name} Issue`,
          `The earliest chronological issue of the ${base.name} storyline in your collection (${base.count} owned)`,
          undefined,
          undefined,
          base.count
        );
      }

      if (base.count >= 2 && latest && latest.sortValue >= base.maxSortValue) {
        if (latest.item.challengeItemId !== earliest.item.challengeItemId || earliest.sortValue > base.minSortValue) {
          addMilestone(
            latest,
            'StoryArc',
            base.name,
            'Latest',
            `Latest ${base.name} Issue`,
            `The concluding chronological issue of the ${base.name} storyline in your collection (${base.count} owned)`,
            undefined,
            undefined,
            base.count
          );
        }
      }
    });

    // E. Group by Creator & Creator Roles
    const candidateHasCreator = (c: MilestoneCandidate, creatorKey: string, role?: string) => {
      const m = c.item.metadata;
      if (role) {
        const targetRole = role.toLowerCase();
        if (m.creatorContributions && Array.isArray(m.creatorContributions)) {
          if (m.creatorContributions.some((cb) => cb.creatorName && splitCreatorNames(cb.creatorName).some(n => n.toLowerCase() === creatorKey) && (cb.roleName || 'Creator').toLowerCase() === targetRole)) {
            return true;
          }
        }
        if (targetRole === 'writer' && m.writer && splitCreatorNames(m.writer).some(n => n.toLowerCase() === creatorKey)) return true;
        if (targetRole === 'artist' && m.artist && splitCreatorNames(m.artist).some(n => n.toLowerCase() === creatorKey)) return true;
        if (targetRole === 'cover artist' && m.coverArtist && splitCreatorNames(m.coverArtist).some(n => n.toLowerCase() === creatorKey)) return true;
        return false;
      }

      // Any role
      if (m.writer && splitCreatorNames(m.writer).some(n => n.toLowerCase() === creatorKey)) return true;
      if (m.artist && splitCreatorNames(m.artist).some(n => n.toLowerCase() === creatorKey)) return true;
      if (m.coverArtist && splitCreatorNames(m.coverArtist).some(n => n.toLowerCase() === creatorKey)) return true;
      if (m.creatorContributions && Array.isArray(m.creatorContributions)) {
        if (m.creatorContributions.some((cb) => cb.creatorName && splitCreatorNames(cb.creatorName).some(n => n.toLowerCase() === creatorKey))) {
          return true;
        }
      }
      return false;
    };

    baselines.creators.forEach((base, creatorKey) => {
      const matching = datedCandidates.filter((c) => candidateHasCreator(c, creatorKey));
      if (matching.length === 0) return;

      const earliest = [...matching].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      const latest = [...matching].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return b.sortValue - a.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      if (earliest && earliest.sortValue <= base.minSortValue) {
        addMilestone(
          earliest,
          'Creator',
          base.name,
          'Earliest',
          `Earliest ${base.name} Contribution`,
          `First comic in your collection featuring ${base.name} (${base.count} owned)`,
          undefined,
          undefined,
          base.count
        );
      }

      if (base.count >= 2 && latest && latest.sortValue >= base.maxSortValue) {
        if (latest.item.challengeItemId !== earliest.item.challengeItemId || earliest.sortValue > base.minSortValue) {
          addMilestone(
            latest,
            'Creator',
            base.name,
            'Latest',
            `Latest ${base.name} Contribution`,
            `Most recent comic in your collection featuring ${base.name} (${base.count} owned)`,
            undefined,
            undefined,
            base.count
          );
        }
      }
    });

    // Also check creator specific roles if count >= 2
    baselines.creatorRoles.forEach((roleBase, roleKey) => {
      if (roleBase.count < 2) return;
      const [creatorKey] = roleKey.split('__');
      if (!creatorKey || !roleBase.role) return;

      const matching = datedCandidates.filter((c) => candidateHasCreator(c, creatorKey, roleBase.role));
      if (matching.length === 0) return;

      const earliest = [...matching].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      const latest = [...matching].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return b.sortValue - a.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      if (earliest && earliest.sortValue <= roleBase.minSortValue) {
        addMilestone(
          earliest,
          'Creator',
          roleBase.name,
          'Earliest',
          `Earliest ${roleBase.name} (${roleBase.role})`,
          `Earliest comic in your collection where ${roleBase.name} contributed as ${roleBase.role} (${roleBase.count} owned)`,
          undefined,
          roleBase.role,
          roleBase.count
        );
      }

      if (latest && latest.sortValue >= roleBase.maxSortValue) {
        if (latest.item.challengeItemId !== earliest.item.challengeItemId || earliest.sortValue > roleBase.minSortValue) {
          addMilestone(
            latest,
            'Creator',
            roleBase.name,
            'Latest',
            `Latest ${roleBase.name} (${roleBase.role})`,
            `Most recent comic in your collection where ${roleBase.name} contributed as ${roleBase.role} (${roleBase.count} owned)`,
            undefined,
            roleBase.role,
            roleBase.count
          );
        }
      }
    });

    // F. Group by Character
    baselines.characters.forEach((base, charKey) => {
      const matching = datedCandidates.filter((c) => {
        const apps = c.item.metadata.characterAppearances;
        if (!apps || !Array.isArray(apps)) return false;
        return apps.some((app) => app.characterName && app.characterName.trim().toLowerCase() === charKey);
      });
      if (matching.length === 0) return;

      const earliest = [...matching].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      const latest = [...matching].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return b.sortValue - a.sortValue;
        return a.item.sequenceNumber - b.item.sequenceNumber;
      })[0];

      if (earliest && earliest.sortValue <= base.minSortValue) {
        addMilestone(
          earliest,
          'Character',
          base.name,
          'Earliest',
          `First Appearance of ${base.name}`,
          `The earliest appearance of ${base.name} in your entire collection (${base.count} owned)`,
          undefined,
          undefined,
          base.count
        );
      }

      if (base.count >= 2 && latest && latest.sortValue >= base.maxSortValue) {
        if (latest.item.challengeItemId !== earliest.item.challengeItemId || earliest.sortValue > base.minSortValue) {
          addMilestone(
            latest,
            'Character',
            base.name,
            'Latest',
            `Latest Appearance of ${base.name}`,
            `The most recent appearance of ${base.name} in your entire collection (${base.count} owned)`,
            undefined,
            undefined,
            base.count
          );
        }
      }
    });
  }

  calculateForScope(wholeChallengeCandidates, 'WholeChallenge');
  calculateForScope(readCandidates, 'ReadItems');

  milestones.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
    if (a.sequenceNumber !== b.sequenceNumber) return a.sequenceNumber - b.sequenceNumber;
    return categoryPriority[a.category] - categoryPriority[b.category];
  });

  return milestones;
}

export interface EntityBaseline {
  name: string;
  minSortValue: number;
  earliestDateStr: string | null;
  earliestComicId: string;
  maxSortValue: number;
  latestDateStr: string | null;
  latestComicId: string;
  count: number;
  role?: string;
}

export interface CollectionBaselines {
  overallEarliest: { minSortValue: number; earliestDateStr: string | null; earliestComicId: string } | null;
  overallLatest: { maxSortValue: number; latestDateStr: string | null; latestComicId: string } | null;
  publishers: Map<string, EntityBaseline>;
  series: Map<string, EntityBaseline>;
  events: Map<string, EntityBaseline>;
  creators: Map<string, EntityBaseline>;
  creatorRoles: Map<string, EntityBaseline>;
  characters: Map<string, EntityBaseline>;
}

/**
 * Computes baseline earliest and latest dates and item counts across the entire owned collection (excluding wishlists).
 */
export function buildCollectionBaselines(collection: ComicBook[]): CollectionBaselines {
  let overallEarliest: { minSortValue: number; earliestDateStr: string | null; earliestComicId: string } | null = null;
  let overallLatest: { maxSortValue: number; latestDateStr: string | null; latestComicId: string } | null = null;
  const publishers = new Map<string, EntityBaseline>();
  const series = new Map<string, EntityBaseline>();
  const events = new Map<string, EntityBaseline>();
  const creators = new Map<string, EntityBaseline>();
  const creatorRoles = new Map<string, EntityBaseline>();
  const characters = new Map<string, EntityBaseline>();

  const recordEntity = (
    map: Map<string, EntityBaseline>,
    key: string,
    name: string,
    sortValue: number,
    dateStr: string,
    comicId: string,
    role?: string
  ) => {
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        name,
        minSortValue: sortValue,
        earliestDateStr: dateStr,
        earliestComicId: comicId,
        maxSortValue: sortValue,
        latestDateStr: dateStr,
        latestComicId: comicId,
        count: 1,
        role,
      });
    } else {
      existing.count += 1;
      if (sortValue < existing.minSortValue) {
        existing.minSortValue = sortValue;
        existing.earliestDateStr = dateStr;
        existing.earliestComicId = comicId;
      }
      if (sortValue > existing.maxSortValue) {
        existing.maxSortValue = sortValue;
        existing.latestDateStr = dateStr;
        existing.latestComicId = comicId;
      }
    }
  };

  for (const comic of collection) {
    if (!isComicEligibleForChallenge(comic)) continue;

    const { dateStr, sortValue } = getNormalizedReleaseDate(comic);
    if (!dateStr || sortValue === Number.MAX_SAFE_INTEGER) continue;

    // 1. Overall Collection
    if (!overallEarliest || sortValue < overallEarliest.minSortValue) {
      overallEarliest = { minSortValue: sortValue, earliestDateStr: dateStr, earliestComicId: comic.id };
    }
    if (!overallLatest || sortValue > overallLatest.maxSortValue) {
      overallLatest = { maxSortValue: sortValue, latestDateStr: dateStr, latestComicId: comic.id };
    }

    // 2. Publisher
    if (comic.publisher && comic.publisher.trim()) {
      const pubName = comic.publisher.trim();
      recordEntity(publishers, pubName.toLowerCase(), pubName, sortValue, dateStr, comic.id);
    }

    // 3. Series
    const seriesName = (comic.seriesName || comic.title || '').trim();
    if (seriesName) {
      recordEntity(series, seriesName.toLowerCase(), seriesName, sortValue, dateStr, comic.id);
    }

    // 4. Story Arc / Event
    if (comic.event && comic.event.trim()) {
      const evName = comic.event.trim();
      recordEntity(events, evName.toLowerCase(), evName, sortValue, dateStr, comic.id);
    }

    // 5. Creators
    const seenCreatorsForComic = new Set<string>();
    const registerCreator = (rawName: string | undefined | null, role?: string) => {
      if (!rawName) return;
      const names = splitCreatorNames(rawName);
      names.forEach((name) => {
        const creatorKey = name.toLowerCase();
        if (!creatorKey) return;

        // Overall creator
        if (!seenCreatorsForComic.has(creatorKey)) {
          seenCreatorsForComic.add(creatorKey);
          recordEntity(creators, creatorKey, name, sortValue, dateStr, comic.id);
        }

        // Creator by specific role
        if (role) {
          const roleKey = `${creatorKey}__${role.toLowerCase()}`;
          if (!seenCreatorsForComic.has(roleKey)) {
            seenCreatorsForComic.add(roleKey);
            recordEntity(creatorRoles, roleKey, name, sortValue, dateStr, comic.id, role);
          }
        }
      });
    };

    if (comic.writer) registerCreator(comic.writer, 'Writer');
    if (comic.artist) registerCreator(comic.artist, 'Artist');
    if (comic.coverArtist) registerCreator(comic.coverArtist, 'Cover Artist');
    if (comic.creatorContributions && Array.isArray(comic.creatorContributions)) {
      comic.creatorContributions.forEach((c) => {
        if (c.creatorName) registerCreator(c.creatorName, c.roleName || 'Creator');
      });
    }

    // 6. Characters
    if (comic.characterAppearances && Array.isArray(comic.characterAppearances)) {
      const seenCharsForComic = new Set<string>();
      comic.characterAppearances.forEach((app) => {
        if (!app.characterName || !app.characterName.trim()) return;
        const charName = app.characterName.trim();
        const charKey = charName.toLowerCase();
        if (seenCharsForComic.has(charKey)) return;
        seenCharsForComic.add(charKey);
        recordEntity(characters, charKey, charName, sortValue, dateStr, comic.id);
      });
    }
  }

  return {
    overallEarliest,
    overallLatest,
    publishers,
    series,
    events,
    creators,
    creatorRoles,
    characters,
  };
}

/**
 * Evaluates the current active TBR queue (up to 10 unread items) against the entire collection baseline
 * to discover exciting collection-wide chronological milestones.
 */
export function computeTBRMilestones(
  queue: ChallengeQueueItem[],
  collection: ComicBook[]
): TBRMilestonesSummary {
  // Only evaluate unread items in the active queue
  const unreadItems = (queue || []).filter((item) => item.status === 'Unread');
  const baselines = buildCollectionBaselines(collection);

  const itemsWithHighlights: TBRQueueItemHighlights[] = [];
  const allHighlights: TBRHighlight[] = [];

  const categoryPriority: Record<TBRHighlightCategory, number> = {
    Collection: 1,
    Character: 2,
    Creator: 3,
    StoryArc: 4,
    Series: 5,
    Publisher: 6,
  };

  unreadItems.forEach((item) => {
    const meta = item.metadata;
    const { dateStr, sortValue } = getNormalizedReleaseDate(meta as unknown as Partial<ComicBook>);
    if (!dateStr || sortValue === Number.MAX_SAFE_INTEGER) return;

    const itemHighlights: TBRHighlight[] = [];
    const seenHighlightKeys = new Set<string>();

    const addHighlight = (
      category: TBRHighlightCategory,
      entityName: string,
      label: string,
      description: string,
      role?: string,
      collectionCount?: number
    ) => {
      const key = `${category}__${entityName.toLowerCase()}__${role || ''}`;
      if (seenHighlightKeys.has(key)) return;
      seenHighlightKeys.add(key);

      const highlight: TBRHighlight = {
        id: `${item.challengeItemId}-${category}-${entityName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        comicId: item.comicId,
        challengeItemId: item.challengeItemId,
        sequenceNumber: item.sequenceNumber,
        category,
        entityName,
        role,
        label,
        description,
        releaseDate: dateStr,
        collectionCount,
      };
      itemHighlights.push(highlight);
      allHighlights.push(highlight);
    };

    // 1. Overall Collection Oldest
    if (baselines.overallEarliest && sortValue <= baselines.overallEarliest.minSortValue) {
      addHighlight(
        'Collection',
        'Entire Collection',
        'Oldest Comic in Collection',
        `The earliest published comic in your entire collection (${dateStr})`
      );
    }

    // 2. Character First Appearance
    if (meta.characterAppearances && Array.isArray(meta.characterAppearances)) {
      meta.characterAppearances.forEach((app) => {
        if (!app.characterName || !app.characterName.trim()) return;
        const charName = app.characterName.trim();
        const base = baselines.characters.get(charName.toLowerCase());
        if (base && sortValue <= base.minSortValue) {
          addHighlight(
            'Character',
            base.name,
            `First Appearance of ${base.name}`,
            `The earliest appearance of ${base.name} in your entire collection (${base.count} owned)`,
            undefined,
            base.count
          );
        }
      });
    }

    // 3. Creator Earliest Contribution
    const inspectCreator = (rawName: string | undefined | null, role?: string) => {
      if (!rawName) return;
      const names = splitCreatorNames(rawName);
      names.forEach((name) => {
        const creatorKey = name.toLowerCase();
        const overallBase = baselines.creators.get(creatorKey);
        if (overallBase && sortValue <= overallBase.minSortValue) {
          addHighlight(
            'Creator',
            overallBase.name,
            `Earliest ${overallBase.name} Contribution${role ? ` (${role})` : ''}`,
            `First comic in your collection featuring ${overallBase.name}${role ? ` as ${role}` : ''} (${overallBase.count} owned)`,
            role,
            overallBase.count
          );
        } else if (role) {
          const roleBase = baselines.creatorRoles.get(`${creatorKey}__${role.toLowerCase()}`);
          if (roleBase && sortValue <= roleBase.minSortValue && roleBase.count >= 2) {
            addHighlight(
              'Creator',
              roleBase.name,
              `Earliest ${roleBase.name} (${roleBase.role})`,
              `Earliest comic in your collection where ${roleBase.name} contributed as ${roleBase.role} (${roleBase.count} owned)`,
              roleBase.role,
              roleBase.count
            );
          }
        }
      });
    };

    if (meta.writer) inspectCreator(meta.writer, 'Writer');
    if (meta.artist) inspectCreator(meta.artist, 'Artist');
    if (meta.coverArtist) inspectCreator(meta.coverArtist, 'Cover Artist');
    if (meta.creatorContributions && Array.isArray(meta.creatorContributions)) {
      meta.creatorContributions.forEach((contrib) => {
        if (contrib.creatorName) {
          inspectCreator(contrib.creatorName, contrib.roleName || 'Creator');
        }
      });
    }

    // 4. Story Arc / Event Earliest Issue
    if (meta.event && meta.event.trim()) {
      const evName = meta.event.trim();
      const base = baselines.events.get(evName.toLowerCase());
      if (base && sortValue <= base.minSortValue) {
        addHighlight(
          'StoryArc',
          base.name,
          `Earliest ${base.name} Issue`,
          `The earliest chronological issue of the ${base.name} storyline in your collection (${base.count} owned)`,
          undefined,
          base.count
        );
      }
    }

    // 5. Series Earliest Issue (at least 2 owned in collection to be notable)
    const seriesName = (meta.seriesName || meta.title || '').trim();
    if (seriesName) {
      const base = baselines.series.get(seriesName.toLowerCase());
      if (base && sortValue <= base.minSortValue && base.count >= 2) {
        addHighlight(
          'Series',
          base.name,
          `Earliest ${base.name} in Collection`,
          `The earliest owned issue of ${base.name} in your collection (1 of ${base.count} owned)`,
          undefined,
          base.count
        );
      }
    }

    // 6. Publisher Earliest Issue
    if (meta.publisher && meta.publisher.trim()) {
      const pubName = meta.publisher.trim();
      const base = baselines.publishers.get(pubName.toLowerCase());
      if (base && sortValue <= base.minSortValue) {
        addHighlight(
          'Publisher',
          base.name,
          `Earliest ${base.name} Issue`,
          `The earliest published ${base.name} comic in your collection (${base.count} owned)`,
          undefined,
          base.count
        );
      }
    }

    if (itemHighlights.length > 0) {
      // Sort highlights by priority
      itemHighlights.sort((a, b) => categoryPriority[a.category] - categoryPriority[b.category]);

      itemsWithHighlights.push({
        challengeItemId: item.challengeItemId,
        comicId: item.comicId,
        sequenceNumber: item.sequenceNumber,
        title: meta.title,
        issueNumber: meta.issueNumber,
        seriesName: meta.seriesName,
        publisher: meta.publisher,
        coverImage: meta.coverImage || meta.coverImageFull,
        releaseDate: dateStr,
        highlights: itemHighlights,
      });
    }
  });

  return {
    totalTBRComics: unreadItems.length,
    comicsWithMilestonesCount: itemsWithHighlights.length,
    totalMilestonesCount: allHighlights.length,
    itemsWithHighlights,
    allHighlights,
  };
}
