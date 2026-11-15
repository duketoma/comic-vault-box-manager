import express from 'express';
import { ComicBook } from '../../src/types';
import {
  filterComicsByCriteria,
  sortChallengeComics,
  formatCriteriaSummary,
  validateCriteria,
} from '../../src/utils/challengeCriteriaEngine';
import { computeChallengeMilestones, computeTBRMilestones } from '../../src/utils/challengeMilestones';
import {
  ComicMetadataSnapshot,
  ChallengeQueueItem,
  ReadingChallengeSummary,
  ChallengeStatus,
} from '../../src/types/readingChallenge.types';
import { getFirestoreDb } from '../firebaseAdmin.ts';
import { optionalAuth } from '../middleware/auth.ts';
import { quotaMiddleware } from '../middleware/quota.ts';

export const challengesRouter = express.Router();

challengesRouter.use(optionalAuth);
challengesRouter.use(quotaMiddleware);

function parseOptionalNumber(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return Number.isFinite(num) ? num : undefined;
}

function docToComic(data: Record<string, any>): ComicBook {
  const isWishlist = data.readingStatus === 'Wishlist' || data.reading_status === 'Wishlist';
  const currentBoxId = isWishlist
    ? -1
    : data.currentBoxId !== undefined && data.currentBoxId !== null
      ? Number(data.currentBoxId)
      : data.current_box_id !== undefined && data.current_box_id !== null
        ? Number(data.current_box_id)
        : 0;

  const copiesOwned = isWishlist
    ? 0
    : Math.max(1, Number(data.copiesOwned ?? data.copies_owned ?? 1) || 1);

  return {
    id: String(data.id),
    title: String(data.title || 'Untitled Comic'),
    issueNumber: String(data.issueNumber ?? data.issue_number ?? '1'),
    volume: data.volume ? String(data.volume) : undefined,
    seriesName: data.seriesName || data.series_name || undefined,
    fullTitle: data.fullTitle || data.full_title || undefined,
    event: data.event || undefined,
    copiesOwned,
    publisher: String(data.publisher || 'Unknown Publisher'),
    publicationYear:
      data.publicationYear ?? data.publication_year ? Number(data.publicationYear ?? data.publication_year) : undefined,
    publicationMonth:
      data.publicationMonth ?? data.publication_month ? String(data.publicationMonth ?? data.publication_month) : undefined,
    publicationDate: data.publicationDate || data.publication_date || undefined,
    genre: data.genre || '',
    writer: data.writer || '',
    artist: data.artist || '',
    coverArtist: data.coverArtist || data.cover_artist || undefined,
    creatorContributions: Array.isArray(data.creatorContributions ?? data.creator_contributions)
      ? (data.creatorContributions ?? data.creator_contributions)
      : [],
    characterAppearances: Array.isArray(data.characterAppearances ?? data.character_appearances)
      ? (data.characterAppearances ?? data.character_appearances)
      : [],
    coverImage: data.coverImageOverride || data.masterCoverImage || data.coverImage || 'NoImage.webp',
    coverImageFull: data.coverImageFullOverride || data.masterCoverImageFull || data.coverImageFull || undefined,
    format: data.format || 'Single Issue',
    sizeThickness: data.sizeThickness ? Number(data.sizeThickness) : 1,
    currentBoxId,
    readingStatus: isWishlist ? 'Wishlist' : (data.readingStatus || data.reading_status || 'Unread'),
    readCount: Math.max(0, parseOptionalNumber(data.readCount ?? data.read_count) || 0),
    userRating: parseOptionalNumber(data.userRating ?? data.user_rating),
    condition: data.condition || 'Near Mint',
    purchasePrice: parseOptionalNumber(data.purchasePrice ?? data.purchase_price),
    estimatedValue: parseOptionalNumber(data.estimatedValue ?? data.estimated_value),
    notes: data.notes || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    createdAt: data.createdAt || data.created_at || new Date().toISOString(),
    updatedAt: data.updatedAt || data.updated_at || new Date().toISOString(),
  };
}

async function loadUserComics(uid: string): Promise<ComicBook[]> {
  const db = getFirestoreDb();
  const snap = await db.collection('users').doc(uid).collection('comics').get();
  return snap.docs.map((d) => docToComic(d.data()));
}

async function loadUserBoxesMap(uid: string): Promise<Map<number, Record<string, any>>> {
  const db = getFirestoreDb();
  const snap = await db.collection('users').doc(uid).collection('storage_boxes').get();
  const map = new Map<number, Record<string, any>>();
  for (const doc of snap.docs) {
    const data = doc.data();
    map.set(Number(data.id), data);
  }
  return map;
}

function buildChallengeSummary(
  challenge: Record<string, any>,
  boxesMap?: Map<number, Record<string, any>>,
  liveComicsMap?: Map<string, ComicBook>
): ReadingChallengeSummary {
  const challengeId = Number(challenge.challengeId || challenge.id);
  const items: any[] = Array.isArray(challenge.items) ? challenge.items : [];

  const totalEligible = Number(challenge.totalEligibleCount ?? challenge.total_eligible_count ?? items.length);
  const readCount = items.filter((i) => i.status === 'Read').length;
  const skippedCount = items.filter((i) => i.status === 'Skipped').length;
  const remainingCount = items.filter((i) => i.status === 'Unread').length;
  const resolvedCount = readCount + skippedCount;
  const progressPercent = totalEligible > 0 ? Math.round((resolvedCount / totalEligible) * 100) : 0;

  const batchSize = Number(challenge.batchSize || challenge.batch_size || 10);
  const unreadItems = items.filter((i) => i.status === 'Unread').slice(0, batchSize);

  const queue: ChallengeQueueItem[] = unreadItems.map((item) => {
    const comicId = String(item.comicId || item.comic_id);
    const liveComic = liveComicsMap?.get(comicId);
    const currentBoxId = liveComic ? liveComic.currentBoxId : (item.currentBoxId ?? item.metadataSnapshot?.currentBoxId);
    const box = currentBoxId !== undefined && boxesMap ? boxesMap.get(Number(currentBoxId)) : undefined;

    return {
      challengeItemId: Number(item.challengeItemId || item.id),
      challengeId,
      comicId,
      sequenceNumber: Number(item.sequenceNumber || item.sequence_number || 0),
      status: item.status || 'Unread',
      addedAt: item.addedAt || item.added_at || challenge.createdAt,
      readAt: item.readAt || item.read_at || null,
      skippedAt: item.skippedAt || item.skipped_at || null,
      metadata: item.metadataSnapshot || item.metadata || {},
      currentBoxId,
      boxName: box?.name,
      boxLocation: box?.location,
      boxColorTag: box?.colorTag || box?.color_tag,
    };
  });

  return {
    challengeId,
    name: challenge.name,
    status: challenge.status as ChallengeStatus,
    criteriaSnapshot: challenge.criteriaSnapshot || challenge.criteria_snapshot,
    criteriaSummary: challenge.criteriaSummary || challenge.criteria_summary || '',
    readingOrder: challenge.readingOrder || challenge.reading_order || 'PublicationDate',
    sortDirection: challenge.sortDirection || challenge.sort_direction || 'Ascending',
    batchSize,
    createdAt: challenge.createdAt || challenge.created_at,
    startedAt: challenge.startedAt || challenge.started_at,
    completedAt: challenge.completedAt || challenge.completed_at || null,
    endedAt: challenge.endedAt || challenge.ended_at || null,
    totalEligible,
    readCount,
    skippedCount,
    resolvedCount,
    remainingCount,
    progressPercent,
    queue,
  };
}

// 1. Preview Challenge
challengesRouter.post('/api/reading-challenges/preview', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const { criteria, sortDirection = 'Ascending', limit = 20 } = req.body;
    const valResult = validateCriteria(criteria);
    if (!valResult.valid) {
      return res.status(400).json({ error: valResult.error || 'Invalid criteria' });
    }

    const allComics = await loadUserComics(uid);
    const eligibleComics = allComics.filter(
      (c) => c.readingStatus !== 'Wishlist' && (c.copiesOwned ?? 1) > 0
    );

    const matching = filterComicsByCriteria(eligibleComics, criteria);
    const sorted = sortChallengeComics(matching, sortDirection);
    const summaryText = formatCriteriaSummary(criteria.root);

    res.json({
      eligibleCount: sorted.length,
      previewItems: sorted.slice(0, Math.min(limit, 50)),
      criteriaSummary: summaryText,
      warnings: sorted.length === 0 ? ['No comics currently in your collection match this criteria.'] : [],
    });
  } catch (error: any) {
    console.error('Preview reading challenge failed:', error.message);
    res.status(500).json({ error: `Unable to preview reading challenge: ${error.message}` });
  }
});

// 2. Create and Start Challenge
challengesRouter.post('/api/reading-challenges', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const {
      name,
      criteria,
      readingOrder = 'PublicationDate',
      sortDirection = 'Ascending',
      batchSize = 10,
      abandonCurrentActive = false,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Challenge name cannot be empty.' });
    }

    const valResult = validateCriteria(criteria);
    if (!valResult.valid) {
      return res.status(400).json({ error: valResult.error || 'Invalid criteria' });
    }

    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const challengesCol = userRef.collection('reading_challenges');

    // Check for existing active challenge
    const activeSnap = await challengesCol.where('status', '==', 'Active').limit(1).get();
    if (!activeSnap.empty) {
      if (abandonCurrentActive) {
        const activeDoc = activeSnap.docs[0];
        await activeDoc.ref.set(
          {
            status: 'Abandoned',
            endedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        return res.status(409).json({
          error: 'An active reading challenge is already in progress.',
          activeChallenge: activeSnap.docs[0].data(),
        });
      }
    }

    const [allComics, boxesMap] = await Promise.all([loadUserComics(uid), loadUserBoxesMap(uid)]);
    const eligibleComics = allComics.filter(
      (c) => c.readingStatus !== 'Wishlist' && (c.copiesOwned ?? 1) > 0
    );

    const matching = filterComicsByCriteria(eligibleComics, criteria);
    const sorted = sortChallengeComics(matching, sortDirection);

    if (sorted.length === 0) {
      return res.status(400).json({
        error: 'No comics in your collection match this challenge criteria. Cannot start an empty challenge.',
      });
    }

    const nowIso = new Date().toISOString();
    const challengeId = Date.now();
    const summaryText = formatCriteriaSummary(criteria.root);

    const items = sorted.map((comic, idx) => {
      const snapshot: ComicMetadataSnapshot = {
        id: comic.id,
        title: comic.title,
        fullTitle: comic.fullTitle,
        seriesName: comic.seriesName,
        issueNumber: comic.issueNumber,
        volume: comic.volume,
        publisher: comic.publisher,
        publicationYear: comic.publicationYear,
        publicationMonth: comic.publicationMonth,
        publicationDate: comic.publicationDate,
        genre: comic.genre,
        event: comic.event,
        writer: comic.writer,
        artist: comic.artist,
        coverArtist: comic.coverArtist,
        creatorContributions: comic.creatorContributions,
        characterAppearances: comic.characterAppearances,
        coverImage: comic.coverImage,
        coverImageFull: comic.coverImageFull,
        format: comic.format,
        sizeThickness: comic.sizeThickness,
        currentBoxId: comic.currentBoxId,
      };

      return {
        challengeItemId: challengeId + idx + 1,
        challengeId,
        comicId: comic.id,
        sequenceNumber: idx + 1,
        status: 'Unread',
        addedAt: nowIso,
        readAt: null,
        skippedAt: null,
        metadataSnapshot: snapshot,
      };
    });

    const newChallengeDoc = {
      id: String(challengeId),
      challengeId,
      userId: uid,
      name: name.trim(),
      status: 'Active',
      criteriaSnapshot: criteria,
      criteriaVersion: criteria.version || 1,
      criteriaSummary: summaryText,
      readingOrder,
      sortDirection,
      batchSize: Number(batchSize),
      totalEligibleCount: sorted.length,
      createdAt: nowIso,
      startedAt: nowIso,
      completedAt: null,
      endedAt: null,
      items,
    };

    await challengesCol.doc(String(challengeId)).set(newChallengeDoc);

    const comicsMap = new Map<string, ComicBook>(allComics.map((c) => [c.id, c]));
    const summary = buildChallengeSummary(newChallengeDoc, boxesMap, comicsMap);
    res.json(summary);
  } catch (error: any) {
    console.error('Create reading challenge failed:', error.message);
    res.status(500).json({ error: `Unable to create reading challenge: ${error.message}` });
  }
});

// 3. Get Active Challenge
challengesRouter.get('/api/reading-challenges/active', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('reading_challenges')
      .where('status', '==', 'Active')
      .limit(1)
      .get();

    if (snap.empty) {
      return res.json({ challenge: null });
    }

    const [boxesMap, allComics] = await Promise.all([loadUserBoxesMap(uid), loadUserComics(uid)]);
    const comicsMap = new Map<string, ComicBook>(allComics.map((c) => [c.id, c]));

    const summary = buildChallengeSummary(snap.docs[0].data(), boxesMap, comicsMap);
    res.json({ challenge: summary });
  } catch (error: any) {
    console.error('Get active challenge failed:', error.message);
    res.status(500).json({ error: `Unable to retrieve active reading challenge: ${error.message}` });
  }
});

// 4. Get Past Challenge History
challengesRouter.get('/api/reading-challenges/history', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('reading_challenges')
      .where('status', 'in', ['Completed', 'Abandoned'])
      .get();

    const history = snap.docs
      .map((doc) => {
        const d = doc.data();
        const items: any[] = Array.isArray(d.items) ? d.items : [];
        const readCount = items.filter((i) => i.status === 'Read').length;
        const skippedCount = items.filter((i) => i.status === 'Skipped').length;
        const totalEligible = Number(d.totalEligibleCount ?? d.total_eligible_count ?? items.length);

        return {
          id: Number(d.challengeId || d.id),
          name: d.name,
          status: d.status,
          createdAt: d.createdAt || d.created_at,
          startedAt: d.startedAt || d.started_at,
          completedAt: d.completedAt || d.completed_at || null,
          endedAt: d.endedAt || d.ended_at || null,
          totalEligible,
          criteriaSummary: d.criteriaSummary || d.criteria_summary || '',
          readCount,
          skippedCount,
          completionPercent:
            totalEligible > 0 ? Math.round(((readCount + skippedCount) / totalEligible) * 100) : 0,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ history });
  } catch (error: any) {
    console.error('Get challenge history failed:', error.message);
    res.status(500).json({ error: `Unable to retrieve challenge history: ${error.message}` });
  }
});

// 5. Get Challenge Summary and Queue
challengesRouter.get('/api/reading-challenges/:id', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const challengeId = req.params.id;
    const db = getFirestoreDb();
    const docRef = db.collection('users').doc(uid).collection('reading_challenges').doc(challengeId);
    let docSnap = await docRef.get();

    if (!docSnap.exists) {
      // Check if document was keyed by numeric challengeId
      const byChallengeIdSnap = await db
        .collection('users')
        .doc(uid)
        .collection('reading_challenges')
        .where('challengeId', '==', Number(challengeId))
        .limit(1)
        .get();
      if (!byChallengeIdSnap.empty) {
        docSnap = byChallengeIdSnap.docs[0];
      }
    }

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const [boxesMap, allComics] = await Promise.all([loadUserBoxesMap(uid), loadUserComics(uid)]);
    const comicsMap = new Map<string, ComicBook>(allComics.map((c) => [c.id, c]));

    const summary = buildChallengeSummary(docSnap.data()!, boxesMap, comicsMap);
    res.json(summary);
  } catch (error: any) {
    console.error('Get challenge failed:', error.message);
    res.status(500).json({ error: `Unable to retrieve challenge: ${error.message}` });
  }
});

// 6. Mark item Read
challengesRouter.post('/api/reading-challenges/:id/items/:itemId/read', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const challengeId = req.params.id;
    const itemId = req.params.itemId;
    const notes = req.body?.notes || null;

    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const challengesCol = userRef.collection('reading_challenges');

    let docSnap = await challengesCol.doc(challengeId).get();
    if (!docSnap.exists) {
      const altSnap = await challengesCol.where('challengeId', '==', Number(challengeId)).limit(1).get();
      if (!altSnap.empty) docSnap = altSnap.docs[0];
    }

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challengeData = docSnap.data()!;
    const items: any[] = Array.isArray(challengeData.items) ? [...challengeData.items] : [];

    const itemIdx = items.findIndex(
      (it) => String(it.challengeItemId || it.id) === String(itemId)
    );

    if (itemIdx === -1) {
      return res.status(404).json({ error: 'Challenge item not found' });
    }

    const item = { ...items[itemIdx] };
    const nowIso = new Date().toISOString();

    if (item.status !== 'Read') {
      item.status = 'Read';
      item.readAt = nowIso;
      if (notes) item.notes = notes;
      items[itemIdx] = item;

      // Update the user's comic reading status and readCount
      if (item.comicId) {
        const comicRef = userRef.collection('comics').doc(String(item.comicId));
        const comicDoc = await comicRef.get();
        if (comicDoc.exists) {
          const currentCount = Number(comicDoc.data()?.readCount || 0);
          await comicRef.set(
            {
              readingStatus: 'Read',
              readCount: currentCount + 1,
              updatedAt: nowIso,
            },
            { merge: true }
          );
        }
      }

      // Check if all items are resolved
      const unreadCount = items.filter((it) => it.status === 'Unread').length;
      const updates: Record<string, any> = { items, updatedAt: nowIso };
      if (unreadCount === 0 && challengeData.status === 'Active') {
        updates.status = 'Completed';
        updates.completedAt = nowIso;
        challengeData.status = 'Completed';
        challengeData.completedAt = nowIso;
      }

      challengeData.items = items;
      await docSnap.ref.set(updates, { merge: true });
    }

    const [boxesMap, allComics] = await Promise.all([loadUserBoxesMap(uid), loadUserComics(uid)]);
    const comicsMap = new Map<string, ComicBook>(allComics.map((c) => [c.id, c]));

    const summary = buildChallengeSummary(challengeData, boxesMap, comicsMap);
    res.json(summary);
  } catch (error: any) {
    console.error('Mark item read failed:', error.message);
    res.status(500).json({ error: `Unable to mark item read: ${error.message}` });
  }
});

// 7. Undo Read (Unread)
challengesRouter.post('/api/reading-challenges/:id/items/:itemId/unread', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const challengeId = req.params.id;
    const itemId = req.params.itemId;

    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const challengesCol = userRef.collection('reading_challenges');

    let docSnap = await challengesCol.doc(challengeId).get();
    if (!docSnap.exists) {
      const altSnap = await challengesCol.where('challengeId', '==', Number(challengeId)).limit(1).get();
      if (!altSnap.empty) docSnap = altSnap.docs[0];
    }

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challengeData = docSnap.data()!;
    const items: any[] = Array.isArray(challengeData.items) ? [...challengeData.items] : [];

    const itemIdx = items.findIndex(
      (it) => String(it.challengeItemId || it.id) === String(itemId)
    );

    if (itemIdx === -1) {
      return res.status(404).json({ error: 'Challenge item not found' });
    }

    const item = { ...items[itemIdx] };
    const wasRead = item.status === 'Read';
    const nowIso = new Date().toISOString();

    if (item.status === 'Read' || item.status === 'Skipped') {
      item.status = 'Unread';
      item.readAt = null;
      item.skippedAt = null;
      items[itemIdx] = item;

      if (wasRead && item.comicId) {
        const comicRef = userRef.collection('comics').doc(String(item.comicId));
        const comicDoc = await comicRef.get();
        if (comicDoc.exists) {
          const currentCount = Number(comicDoc.data()?.readCount || 1);
          const nextCount = Math.max(0, currentCount - 1);
          await comicRef.set(
            {
              readingStatus: nextCount <= 0 ? 'Unread' : 'Read',
              readCount: nextCount,
              updatedAt: nowIso,
            },
            { merge: true }
          );
        }
      }

      const updates: Record<string, any> = { items, updatedAt: nowIso };
      if (challengeData.status === 'Completed') {
        updates.status = 'Active';
        updates.completedAt = null;
        challengeData.status = 'Active';
        challengeData.completedAt = null;
      }

      challengeData.items = items;
      await docSnap.ref.set(updates, { merge: true });
    }

    const [boxesMap, allComics] = await Promise.all([loadUserBoxesMap(uid), loadUserComics(uid)]);
    const comicsMap = new Map<string, ComicBook>(allComics.map((c) => [c.id, c]));

    const summary = buildChallengeSummary(challengeData, boxesMap, comicsMap);
    res.json(summary);
  } catch (error: any) {
    console.error('Undo read failed:', error.message);
    res.status(500).json({ error: `Unable to undo read: ${error.message}` });
  }
});

// 8. Skip Item
challengesRouter.post('/api/reading-challenges/:id/items/:itemId/skip', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const challengeId = req.params.id;
    const itemId = req.params.itemId;

    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const challengesCol = userRef.collection('reading_challenges');

    let docSnap = await challengesCol.doc(challengeId).get();
    if (!docSnap.exists) {
      const altSnap = await challengesCol.where('challengeId', '==', Number(challengeId)).limit(1).get();
      if (!altSnap.empty) docSnap = altSnap.docs[0];
    }

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challengeData = docSnap.data()!;
    const items: any[] = Array.isArray(challengeData.items) ? [...challengeData.items] : [];

    const itemIdx = items.findIndex(
      (it) => String(it.challengeItemId || it.id) === String(itemId)
    );

    if (itemIdx === -1) {
      return res.status(404).json({ error: 'Challenge item not found' });
    }

    const item = { ...items[itemIdx] };
    const nowIso = new Date().toISOString();

    if (item.status === 'Unread') {
      item.status = 'Skipped';
      item.skippedAt = nowIso;
      items[itemIdx] = item;

      const unreadCount = items.filter((it) => it.status === 'Unread').length;
      const updates: Record<string, any> = { items, updatedAt: nowIso };
      if (unreadCount === 0 && challengeData.status === 'Active') {
        updates.status = 'Completed';
        updates.completedAt = nowIso;
        challengeData.status = 'Completed';
        challengeData.completedAt = nowIso;
      }

      challengeData.items = items;
      await docSnap.ref.set(updates, { merge: true });
    }

    const [boxesMap, allComics] = await Promise.all([loadUserBoxesMap(uid), loadUserComics(uid)]);
    const comicsMap = new Map<string, ComicBook>(allComics.map((c) => [c.id, c]));

    const summary = buildChallengeSummary(challengeData, boxesMap, comicsMap);
    res.json(summary);
  } catch (error: any) {
    console.error('Skip item failed:', error.message);
    res.status(500).json({ error: `Unable to skip item: ${error.message}` });
  }
});

// 9. Abandon / End Active Challenge
challengesRouter.post('/api/reading-challenges/:id/end', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const challengeId = req.params.id;

    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const challengesCol = userRef.collection('reading_challenges');

    let docSnap = await challengesCol.doc(challengeId).get();
    if (!docSnap.exists) {
      const altSnap = await challengesCol.where('challengeId', '==', Number(challengeId)).limit(1).get();
      if (!altSnap.empty) docSnap = altSnap.docs[0];
    }

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challengeData = docSnap.data()!;
    if (challengeData.status !== 'Active') {
      return res.status(400).json({ error: 'Only Active challenges can be ended.' });
    }

    const nowIso = new Date().toISOString();
    challengeData.status = 'Abandoned';
    challengeData.endedAt = nowIso;
    await docSnap.ref.set({ status: 'Abandoned', endedAt: nowIso, updatedAt: nowIso }, { merge: true });

    const [boxesMap, allComics] = await Promise.all([loadUserBoxesMap(uid), loadUserComics(uid)]);
    const comicsMap = new Map<string, ComicBook>(allComics.map((c) => [c.id, c]));

    const summary = buildChallengeSummary(challengeData, boxesMap, comicsMap);
    res.json(summary);
  } catch (error: any) {
    console.error('End challenge failed:', error.message);
    res.status(500).json({ error: `Unable to end challenge: ${error.message}` });
  }
});

// 10. Milestone Insights
challengesRouter.get('/api/reading-challenges/:id/insights', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const challengeId = req.params.id;

    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const challengesCol = userRef.collection('reading_challenges');

    let docSnap = await challengesCol.doc(challengeId).get();
    if (!docSnap.exists) {
      const altSnap = await challengesCol.where('challengeId', '==', Number(challengeId)).limit(1).get();
      if (!altSnap.empty) docSnap = altSnap.docs[0];
    }

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challengeData = docSnap.data()!;
    const rawItems: any[] = Array.isArray(challengeData.items) ? challengeData.items : [];
    const items = rawItems.map((r) => ({
      challengeItemId: Number(r.challengeItemId || r.id),
      comicId: String(r.comicId || r.comic_id),
      sequenceNumber: Number(r.sequenceNumber || r.sequence_number || 0),
      status: r.status,
      metadata: r.metadataSnapshot || r.metadata,
    }));

    const collectionComics = (await loadUserComics(uid)).filter(
      (c) => c.readingStatus !== 'Wishlist' && (c.copiesOwned ?? 1) > 0
    );

    const milestones = computeChallengeMilestones(items, collectionComics);
    const readCount = items.filter((it) => it.status === 'Read').length;

    const unreadQueue = items.filter((it) => it.status === 'Unread').slice(0, 10);
    const tbrMilestones = computeTBRMilestones(unreadQueue as unknown as ChallengeQueueItem[], collectionComics);

    res.json({
      challengeId: Number(challengeData.challengeId || challengeData.id),
      challengeName: challengeData.name,
      totalEligible: Number(challengeData.totalEligibleCount ?? challengeData.total_eligible_count ?? items.length),
      readCount,
      milestones,
      tbrMilestones,
    });
  } catch (error: any) {
    console.error('Get challenge insights failed:', error.message);
    res.status(500).json({ error: `Unable to compute challenge insights: ${error.message}` });
  }
});
