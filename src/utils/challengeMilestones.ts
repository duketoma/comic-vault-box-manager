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
 */
export function computeChallengeMilestones(items: ItemEntry[]): ChallengeMilestone[] {
  const milestones: ChallengeMilestone[] = [];

  // 1. Whole Challenge Candidates vs. Read Items Candidates
  const wholeChallengeCandidates: MilestoneCandidate[] = items.map((item) => {
    const { dateStr, sortValue } = getNormalizedReleaseDate(item.metadata as unknown as Partial<ComicBook>);
    return { item, dateStr, sortValue };
  });

  const readCandidates = wholeChallengeCandidates.filter((c) => c.item.status === 'Read');

  function calculateForScope(candidates: MilestoneCandidate[], scope: MilestoneScope) {
    if (candidates.length === 0) return;

    // Helper to find earliest and latest from a candidate subset
    function pickMilestones(
      subset: MilestoneCandidate[],
      category: MilestoneCategory,
      entityName: string,
      entityId?: string,
      role?: string
    ) {
      if (subset.length === 0) return;

      // Filter known dates first
      const knownDates = subset.filter((c) => c.dateStr !== null);

      let earliestCandidate: MilestoneCandidate;
      let latestCandidate: MilestoneCandidate;

      if (knownDates.length > 0) {
        // Earliest: lowest sortValue, tie-breaker: lowest sequenceNumber
        earliestCandidate = [...knownDates].sort((a, b) => {
          if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
          return a.item.sequenceNumber - b.item.sequenceNumber;
        })[0];

        // Latest: highest sortValue, tie-breaker: lowest sequenceNumber
        latestCandidate = [...knownDates].sort((a, b) => {
          if (a.sortValue !== b.sortValue) return b.sortValue - a.sortValue;
          return a.item.sequenceNumber - b.item.sequenceNumber;
        })[0];
      } else {
        // All dates unknown; fallback to sequence numbers
        earliestCandidate = [...subset].sort((a, b) => a.item.sequenceNumber - b.item.sequenceNumber)[0];
        latestCandidate = [...subset].sort((a, b) => b.item.sequenceNumber - a.item.sequenceNumber)[0];
      }

      function buildMilestone(cand: MilestoneCandidate, kind: MilestoneKind): ChallengeMilestone {
        return {
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
          coverImage: cand.item.metadata.coverImage,
          sequenceNumber: cand.item.sequenceNumber,
          isRead: cand.item.status === 'Read',
        };
      }

      milestones.push(buildMilestone(earliestCandidate, 'Earliest'));

      // If more than 1 item, or if earliest and latest are different
      if (subset.length > 1 && earliestCandidate.item.challengeItemId !== latestCandidate.item.challengeItemId) {
        milestones.push(buildMilestone(latestCandidate, 'Latest'));
      } else if (subset.length === 1) {
        // Single item is both earliest and latest
        milestones.push(buildMilestone(earliestCandidate, 'Latest'));
      }
    }

    // A. Collection overall
    pickMilestones(candidates, 'Collection', 'Challenge Collection');

    // B. Group by Publisher
    const publisherMap = new Map<string, MilestoneCandidate[]>();
    candidates.forEach((c) => {
      const pub = (c.item.metadata.publisher || 'Unknown Publisher').trim();
      if (!publisherMap.has(pub)) publisherMap.set(pub, []);
      publisherMap.get(pub)!.push(c);
    });
    publisherMap.forEach((subset, pub) => {
      pickMilestones(subset, 'Publisher', pub);
    });

    // C. Group by Series
    const seriesMap = new Map<string, MilestoneCandidate[]>();
    candidates.forEach((c) => {
      const ser = (c.item.metadata.seriesName || c.item.metadata.title || '').trim();
      if (ser) {
        if (!seriesMap.has(ser)) seriesMap.set(ser, []);
        seriesMap.get(ser)!.push(c);
      }
    });
    seriesMap.forEach((subset, ser) => {
      // Show series milestones if series has at least 2 comics or significant
      if (subset.length >= 2 || candidates.length <= 5) {
        pickMilestones(subset, 'Series', ser);
      }
    });

    // D. Group by Story Arc / Event
    const eventMap = new Map<string, MilestoneCandidate[]>();
    candidates.forEach((c) => {
      const ev = (c.item.metadata.event || '').trim();
      if (ev) {
        if (!eventMap.has(ev)) eventMap.set(ev, []);
        eventMap.get(ev)!.push(c);
      }
    });
    eventMap.forEach((subset, ev) => {
      pickMilestones(subset, 'StoryArc', ev);
    });

    // E. Group by Creator + Role
    const creatorRoleMap = new Map<string, { name: string; role: string; list: MilestoneCandidate[] }>();
    const addCreatorCredit = (rawName: string | undefined | null, role: string, candidate: MilestoneCandidate) => {
      if (!rawName) return;
      const parsed = splitCreatorNames(rawName);
      parsed.forEach((singleName) => {
        const key = `${singleName.toLowerCase()}__${role.toLowerCase()}`;
        if (!creatorRoleMap.has(key)) {
          creatorRoleMap.set(key, { name: singleName, role, list: [] });
        }
        const entry = creatorRoleMap.get(key)!;
        if (!entry.list.includes(candidate)) {
          entry.list.push(candidate);
        }
      });
    };

    candidates.forEach((c) => {
      const m = c.item.metadata;
      // Detailed contributions
      if (m.creatorContributions && Array.isArray(m.creatorContributions)) {
        m.creatorContributions.forEach((contrib) => {
          if (contrib.creatorName) {
            addCreatorCredit(contrib.creatorName, contrib.roleName || 'Creator', c);
          }
        });
      }
      // Direct fields fallback
      if (m.writer) {
        addCreatorCredit(m.writer, 'Writer', c);
      }
      if (m.artist) {
        addCreatorCredit(m.artist, 'Artist', c);
      }
      if (m.coverArtist) {
        addCreatorCredit(m.coverArtist, 'Cover Artist', c);
      }
    });
    creatorRoleMap.forEach(({ name, role, list }) => {
      if (list.length >= 2 || candidates.length <= 10) {
        pickMilestones(list, 'Creator', name, undefined, role);
      }
    });

    // F. Group by Character
    const characterMap = new Map<string, MilestoneCandidate[]>();
    candidates.forEach((c) => {
      const m = c.item.metadata;
      if (m.characterAppearances && Array.isArray(m.characterAppearances)) {
        m.characterAppearances.forEach((app) => {
          if (app.characterName) {
            const char = app.characterName.trim();
            if (!characterMap.has(char)) characterMap.set(char, []);
            if (!characterMap.get(char)!.includes(c)) characterMap.get(char)!.push(c);
          }
        });
      }
    });
    characterMap.forEach((subset, char) => {
      if (subset.length >= 2 || candidates.length <= 10) {
        pickMilestones(subset, 'Character', char);
      }
    });
  }

  // Calculate Whole Challenge scope
  calculateForScope(wholeChallengeCandidates, 'WholeChallenge');

  // Calculate Read Items scope
  calculateForScope(readCandidates, 'ReadItems');

  return milestones;
}

export interface EntityBaseline {
  name: string;
  minSortValue: number;
  earliestDateStr: string | null;
  earliestComicId: string;
  count: number;
  role?: string;
}

export interface CollectionBaselines {
  overallEarliest: { minSortValue: number; earliestDateStr: string | null; earliestComicId: string } | null;
  publishers: Map<string, EntityBaseline>;
  series: Map<string, EntityBaseline>;
  events: Map<string, EntityBaseline>;
  creators: Map<string, EntityBaseline>;
  creatorRoles: Map<string, EntityBaseline>;
  characters: Map<string, EntityBaseline>;
}

/**
 * Computes baseline earliest dates and item counts across the entire owned collection (excluding wishlists).
 */
export function buildCollectionBaselines(collection: ComicBook[]): CollectionBaselines {
  let overallEarliest: { minSortValue: number; earliestDateStr: string | null; earliestComicId: string } | null = null;
  const publishers = new Map<string, EntityBaseline>();
  const series = new Map<string, EntityBaseline>();
  const events = new Map<string, EntityBaseline>();
  const creators = new Map<string, EntityBaseline>();
  const creatorRoles = new Map<string, EntityBaseline>();
  const characters = new Map<string, EntityBaseline>();

  for (const comic of collection) {
    if (!isComicEligibleForChallenge(comic)) continue;

    const { dateStr, sortValue } = getNormalizedReleaseDate(comic);
    if (!dateStr || sortValue === Number.MAX_SAFE_INTEGER) continue;

    // 1. Overall Collection
    if (!overallEarliest || sortValue < overallEarliest.minSortValue) {
      overallEarliest = { minSortValue: sortValue, earliestDateStr: dateStr, earliestComicId: comic.id };
    }

    // 2. Publisher
    if (comic.publisher && comic.publisher.trim()) {
      const pubName = comic.publisher.trim();
      const key = pubName.toLowerCase();
      const existing = publishers.get(key);
      if (!existing) {
        publishers.set(key, { name: pubName, minSortValue: sortValue, earliestDateStr: dateStr, earliestComicId: comic.id, count: 1 });
      } else {
        existing.count += 1;
        if (sortValue < existing.minSortValue) {
          existing.minSortValue = sortValue;
          existing.earliestDateStr = dateStr;
          existing.earliestComicId = comic.id;
        }
      }
    }

    // 3. Series
    const seriesName = (comic.seriesName || comic.title || '').trim();
    if (seriesName) {
      const key = seriesName.toLowerCase();
      const existing = series.get(key);
      if (!existing) {
        series.set(key, { name: seriesName, minSortValue: sortValue, earliestDateStr: dateStr, earliestComicId: comic.id, count: 1 });
      } else {
        existing.count += 1;
        if (sortValue < existing.minSortValue) {
          existing.minSortValue = sortValue;
          existing.earliestDateStr = dateStr;
          existing.earliestComicId = comic.id;
        }
      }
    }

    // 4. Story Arc / Event
    if (comic.event && comic.event.trim()) {
      const evName = comic.event.trim();
      const key = evName.toLowerCase();
      const existing = events.get(key);
      if (!existing) {
        events.set(key, { name: evName, minSortValue: sortValue, earliestDateStr: dateStr, earliestComicId: comic.id, count: 1 });
      } else {
        existing.count += 1;
        if (sortValue < existing.minSortValue) {
          existing.minSortValue = sortValue;
          existing.earliestDateStr = dateStr;
          existing.earliestComicId = comic.id;
        }
      }
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
          const existing = creators.get(creatorKey);
          if (!existing) {
            creators.set(creatorKey, { name, minSortValue: sortValue, earliestDateStr: dateStr, earliestComicId: comic.id, count: 1 });
          } else {
            existing.count += 1;
            if (sortValue < existing.minSortValue) {
              existing.minSortValue = sortValue;
              existing.earliestDateStr = dateStr;
              existing.earliestComicId = comic.id;
            }
          }
        }

        // Creator by specific role
        if (role) {
          const roleKey = `${creatorKey}__${role.toLowerCase()}`;
          if (!seenCreatorsForComic.has(roleKey)) {
            seenCreatorsForComic.add(roleKey);
            const existingRole = creatorRoles.get(roleKey);
            if (!existingRole) {
              creatorRoles.set(roleKey, { name, role, minSortValue: sortValue, earliestDateStr: dateStr, earliestComicId: comic.id, count: 1 });
            } else {
              existingRole.count += 1;
              if (sortValue < existingRole.minSortValue) {
                existingRole.minSortValue = sortValue;
                existingRole.earliestDateStr = dateStr;
                existingRole.earliestComicId = comic.id;
              }
            }
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

        const existing = characters.get(charKey);
        if (!existing) {
          characters.set(charKey, { name: charName, minSortValue: sortValue, earliestDateStr: dateStr, earliestComicId: comic.id, count: 1 });
        } else {
          existing.count += 1;
          if (sortValue < existing.minSortValue) {
            existing.minSortValue = sortValue;
            existing.earliestDateStr = dateStr;
            existing.earliestComicId = comic.id;
          }
        }
      });
    }
  }

  return {
    overallEarliest,
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
