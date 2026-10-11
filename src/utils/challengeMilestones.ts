import {
  ChallengeMilestone,
  ChallengeQueueItem,
  ComicMetadataSnapshot,
  MilestoneCategory,
  MilestoneKind,
  MilestoneScope,
} from '../types/readingChallenge.types';
import { ComicBook } from '../types';
import { getNormalizedReleaseDate } from './challengeCriteriaEngine';
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
