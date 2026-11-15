import assert from 'node:assert/strict';
import {
  canCreateProposal,
  canVote,
  applyVoteChange,
  approvalRatio,
  hasReachedQuorum,
  evaluateQuorum,
  sanitizeMasterChanges,
  validateNewComicChanges,
  computeRollbackPatch,
  promotedCoverPath,
  proposalStagingPath,
  ProposalActor,
} from '../services/proposalEngine.ts';
import {
  ProposalDeps,
  createProposal,
  castVote,
  adminProposalAction,
  listProposals,
} from '../services/proposalService.ts';

// ---------------------------------------------------------------------------
// In-Memory Fake Firestore & Firebase Storage for Isolated Testing
// ---------------------------------------------------------------------------

class FakeStorageFile {
  public content: Buffer | null = null;
  public metadata: Record<string, any> = {};

  constructor(public path: string, private storage: FakeStorageBucket) {}

  async exists(): Promise<[boolean]> {
    return [this.storage.files.has(this.path)];
  }

  async save(buffer: Buffer, opts?: any): Promise<void> {
    this.content = buffer;
    this.metadata = opts?.metadata || {};
    this.storage.files.set(this.path, this);
  }

  async delete(_opts?: any): Promise<void> {
    this.storage.files.delete(this.path);
  }

  async copy(destFile: FakeStorageFile): Promise<void> {
    if (!this.storage.files.has(this.path)) {
      throw new Error(`File ${this.path} not found`);
    }
    await destFile.save(this.content || Buffer.from('fake-webp'), { metadata: this.metadata });
  }

  async setMetadata(meta: Record<string, any>): Promise<void> {
    this.metadata = { ...this.metadata, ...meta };
  }
}

class FakeStorageBucket {
  public name = 'test-bucket.firebasestorage.app';
  public files = new Map<string, FakeStorageFile>();

  file(path: string): FakeStorageFile {
    if (!this.files.has(path)) {
      return new FakeStorageFile(path, this);
    }
    return this.files.get(path)!;
  }
}

class FakeDocRef {
  constructor(
    public id: string,
    public collectionName: string,
    private db: FakeFirestore
  ) {}

  async get(): Promise<{ exists: boolean; data: () => any }> {
    const col = this.db.collections.get(this.collectionName);
    const data = col?.get(this.id);
    return {
      exists: Boolean(data),
      data: () => (data ? structuredClone(data) : undefined),
    };
  }

  async set(data: any, opts?: { merge?: boolean }): Promise<void> {
    let col = this.db.collections.get(this.collectionName);
    if (!col) {
      col = new Map();
      this.db.collections.set(this.collectionName, col);
    }
    if (opts?.merge && col.has(this.id)) {
      col.set(this.id, { ...col.get(this.id), ...structuredClone(data) });
    } else {
      col.set(this.id, structuredClone(data));
    }
  }

  async update(patch: any): Promise<void> {
    const col = this.db.collections.get(this.collectionName);
    if (!col || !col.has(this.id)) throw new Error('Document not found');
    col.set(this.id, { ...col.get(this.id), ...structuredClone(patch) });
  }

  async delete(): Promise<void> {
    const col = this.db.collections.get(this.collectionName);
    col?.delete(this.id);
  }

  collection(subName: string): FakeCollectionRef {
    return new FakeCollectionRef(`${this.collectionName}/${this.id}/${subName}`, this.db);
  }
}

class FakeCollectionRef {
  constructor(public name: string, private db: FakeFirestore) {}

  doc(id?: string): FakeDocRef {
    const docId = id || `doc-${Math.random().toString(36).slice(2, 10)}`;
    return new FakeDocRef(docId, this.name, this.db);
  }

  where(field: string, op: string, val: any): FakeQuery {
    return new FakeQuery(this.name, this.db).where(field, op, val);
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): FakeQuery {
    return new FakeQuery(this.name, this.db).orderBy(field, dir);
  }

  limit(count: number): FakeQuery {
    return new FakeQuery(this.name, this.db).limit(count);
  }

  async get(): Promise<{ docs: Array<{ id: string; data: () => any; ref: FakeDocRef }>; size: number }> {
    return new FakeQuery(this.name, this.db).get();
  }
}

class FakeQuery {
  private filters: Array<{ field: string; op: string; val: any }> = [];
  private orderField?: string;
  private orderDir: 'asc' | 'desc' = 'asc';
  private limitCount?: number;

  constructor(private collectionName: string, private db: FakeFirestore) {}

  where(field: string, op: string, val: any): this {
    this.filters.push({ field, op, val });
    return this;
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): this {
    this.orderField = field;
    this.orderDir = dir;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  async get(): Promise<{ docs: Array<{ id: string; data: () => any; ref: FakeDocRef }>; size: number }> {
    const col = this.db.collections.get(this.collectionName) || new Map();
    let entries = Array.from(col.entries()).map(([id, data]) => ({
      id,
      data: () => structuredClone(data),
      ref: new FakeDocRef(id, this.collectionName, this.db),
      raw: data,
    }));

    for (const f of this.filters) {
      if (f.op === '==') {
        entries = entries.filter((e) => (e.raw as any)[f.field] === f.val);
      }
    }

    if (this.orderField) {
      entries.sort((a, b) => {
        const valA = (a.raw as any)[this.orderField!];
        const valB = (b.raw as any)[this.orderField!];
        if (valA < valB) return this.orderDir === 'asc' ? -1 : 1;
        if (valA > valB) return this.orderDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    if (this.limitCount !== undefined) {
      entries = entries.slice(0, this.limitCount);
    }

    return {
      docs: entries.map((e) => ({ id: e.id, data: e.data, ref: e.ref })),
      size: entries.length,
    };
  }
}

class FakeFirestore {
  public collections = new Map<string, Map<string, any>>();

  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(name, this);
  }

  collectionGroup(_name: string): FakeQuery {
    // Return empty collection group for tests
    return new FakeQuery('__cg__', this);
  }

  batch() {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (ref: FakeDocRef, data: any, opts?: any) => {
        ops.push(async () => {
          await ref.set(data, opts);
        });
      },
      update: (ref: FakeDocRef, patch: any) => {
        ops.push(async () => {
          await ref.update(patch);
        });
      },
      delete: (ref: FakeDocRef) => {
        ops.push(async () => {
          await ref.delete();
        });
      },
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  }

  async runTransaction<T>(updateFunction: (tx: any) => Promise<T>): Promise<T> {
    const tx = {
      get: async (ref: FakeDocRef) => ref.get(),
      set: (ref: FakeDocRef, data: any, opts?: any) => ref.set(data, opts),
      update: (ref: FakeDocRef, patch: any) => ref.update(patch),
      delete: (ref: FakeDocRef) => ref.delete(),
    };
    return updateFunction(tx);
  }

  async getAll(...refs: FakeDocRef[]) {
    return Promise.all(refs.map((r) => r.get()));
  }
}

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------

async function runTests() {
  console.log('Running Community Proposals & Voting Quorum Unit Tests...\n');

  // =========================================================================
  // Section 1: Pure Proposal Engine Tests (Permissions, Math, Quorum)
  // =========================================================================
  console.log('[Test 1] Testing VIP tier permissions for proposal creation...');
  const freeUser: ProposalActor = { uid: 'u-free', role: 'user', vipTier: 'free', isBannedFromProposals: false };
  const collectorUser: ProposalActor = { uid: 'u-collector', role: 'user', vipTier: 'collector', isBannedFromProposals: false };
  const archivistUser: ProposalActor = { uid: 'u-archivist', role: 'user', vipTier: 'archivist', isBannedFromProposals: false };
  const bannedUser: ProposalActor = { uid: 'u-banned', role: 'user', vipTier: 'collector', isBannedFromProposals: true };
  const adminUser: ProposalActor = { uid: 'u-admin', role: 'admin', vipTier: 'archivist', isBannedFromProposals: false };

  // Free user checks
  assert.equal(canCreateProposal(freeUser, 'cover_image').allowed, false);
  assert.equal(canCreateProposal(freeUser, 'metadata_edit').allowed, false);

  // Collector (Tier 1) checks: Cover YES, Metadata NO
  assert.equal(canCreateProposal(collectorUser, 'cover_image').allowed, true);
  assert.equal(canCreateProposal(collectorUser, 'metadata_edit').allowed, false);

  // Archivist (Tier 2) checks: Cover YES, Metadata YES, New Comic YES
  assert.equal(canCreateProposal(archivistUser, 'cover_image').allowed, true);
  assert.equal(canCreateProposal(archivistUser, 'metadata_edit').allowed, true);
  assert.equal(canCreateProposal(archivistUser, 'new_comic').allowed, true);

  // Banned user check
  assert.equal(canCreateProposal(bannedUser, 'cover_image').allowed, false);

  // Admin checks
  assert.equal(canCreateProposal(adminUser, 'cover_image').allowed, true);
  assert.equal(canCreateProposal(adminUser, 'metadata_edit').allowed, true);
  console.log('✓ Test 1 Passed: VIP tier permissions enforced correctly.');

  // =========================================================================
  console.log('[Test 2] Testing voting permissions...');
  const sampleProposal = { proposerId: 'u-collector', status: 'pending' as const };
  // Proposer cannot vote on their own proposal
  assert.equal(canVote(collectorUser, sampleProposal).allowed, false);
  // Free user cannot vote
  assert.equal(canVote(freeUser, sampleProposal).allowed, false);
  // Tier 1 other user can vote
  const otherCollector: ProposalActor = { uid: 'u-collector-2', role: 'user', vipTier: 'collector', isBannedFromProposals: false };
  assert.equal(canVote(otherCollector, sampleProposal).allowed, true);
  // Cannot vote on closed proposal
  assert.equal(canVote(otherCollector, { proposerId: 'u-collector', status: 'approved' }).allowed, false);
  console.log('✓ Test 2 Passed: Voting eligibility rules verified.');

  // =========================================================================
  console.log('[Test 3] Testing vote tally calculations & quorum evaluation...');
  let tally = { upvotesCount: 0, downvotesCount: 0, netVotes: 0 };
  // 1 upvote
  tally = applyVoteChange(tally, 0, 1);
  assert.deepEqual(tally, { upvotesCount: 1, downvotesCount: 0, netVotes: 1 });
  // Add 1 downvote
  tally = applyVoteChange(tally, 0, -1);
  assert.deepEqual(tally, { upvotesCount: 1, downvotesCount: 1, netVotes: 0 });
  // Retract downvote
  tally = applyVoteChange(tally, -1, 0);
  assert.deepEqual(tally, { upvotesCount: 1, downvotesCount: 0, netVotes: 1 });
  // Switch upvote to downvote
  tally = applyVoteChange(tally, 1, -1);
  assert.deepEqual(tally, { upvotesCount: 0, downvotesCount: 1, netVotes: -1 });

  // Quorum verification: Quorum requires netVotes >= 5 and approvalRatio >= 70%
  assert.equal(hasReachedQuorum({ upvotesCount: 4, downvotesCount: 0, netVotes: 4 }), false);
  assert.equal(hasReachedQuorum({ upvotesCount: 5, downvotesCount: 0, netVotes: 5 }), true);
  // 5 up, 1 down = 4 net (not quorum)
  assert.equal(hasReachedQuorum({ upvotesCount: 5, downvotesCount: 1, netVotes: 4 }), false);
  // 6 up, 1 down = 5 net, 6/7 = 85.7% (quorum!)
  assert.equal(hasReachedQuorum({ upvotesCount: 6, downvotesCount: 1, netVotes: 5 }), true);
  // 7 up, 3 down = 4 net (not quorum)
  assert.equal(hasReachedQuorum({ upvotesCount: 7, downvotesCount: 3, netVotes: 4 }), false);

  const futureIso = new Date(Date.now() + 86400000).toISOString();
  const pastIso = new Date(Date.now() - 86400000).toISOString();
  assert.equal(evaluateQuorum({ upvotesCount: 5, downvotesCount: 0, netVotes: 5 }, futureIso), 'approve');
  assert.equal(evaluateQuorum({ upvotesCount: 2, downvotesCount: 0, netVotes: 2 }, futureIso), 'pending');
  assert.equal(evaluateQuorum({ upvotesCount: 2, downvotesCount: 0, netVotes: 2 }, pastIso), 'expire');
  console.log('✓ Test 3 Passed: Voting tally and quorum thresholds verified (+5 net, >=70% approval).');

  // =========================================================================
  console.log('[Test 4] Testing metadata sanitization & rollback computation...');
  const { changes, rejectedFields } = sanitizeMasterChanges({
    title: 'The Amazing Spider-Man',
    publicationYear: 1988,
    publisher: 'Marvel Comics',
    illegalSecretField: 'hack',
    coverImage: 'http://malicious.url', // Cover images cannot be set via metadata edit
  });
  assert.equal(changes.title, 'The Amazing Spider-Man');
  assert.equal(changes.publicationYear, 1988);
  assert.ok(rejectedFields.includes('illegalSecretField'));
  assert.ok(rejectedFields.includes('coverImage'));

  // Rollback patch computation
  const applied = { title: 'New Title', writer: 'New Writer' };
  const previous = { title: 'Old Title', writer: 'Old Writer' };
  const currentSame = { title: 'New Title', writer: 'New Writer' };
  const rollbackSame = computeRollbackPatch(applied, previous, currentSame);
  assert.deepEqual(rollbackSame.patch, { title: 'Old Title', writer: 'Old Writer' });
  assert.equal(rollbackSame.skippedFields.length, 0);

  // If a field was modified after this proposal, do not clobber newer edits
  const currentModified = { title: 'Newer Title After', writer: 'New Writer' };
  const rollbackPartial = computeRollbackPatch(applied, previous, currentModified);
  assert.deepEqual(rollbackPartial.patch, { writer: 'Old Writer' });
  assert.deepEqual(rollbackPartial.skippedFields, ['title']);
  console.log('✓ Test 4 Passed: Sanitization and non-clobbering rollback patches verified.');

  // =========================================================================
  // Section 2: End-to-End Proposal Lifecycle with In-Memory Storage & DB
  // =========================================================================
  console.log('\n[Test 5] Lifecycle: Community proposal auto-promotes on quorum (+5 votes)...');
  const fakeDb = new FakeFirestore();
  const fakeBucket = new FakeStorageBucket();
  const testDeps: ProposalDeps = {
    db: fakeDb,
    bucket: fakeBucket,
    compressCover: async (buf) => Buffer.from(`compressed-${buf.toString('utf8')}`),
  };

  // Seed a master comic
  const masterComicId = 'spiderman-300';
  await fakeDb.collection('master_comics').doc(masterComicId).set({
    id: masterComicId,
    title: 'The Amazing Spider-Man',
    issueNumber: '300',
    publisher: 'Marvel Comics',
    coverImage: 'https://firebasestorage.googleapis.com/.../original.webp',
  });

  // Collector user creates cover proposal
  const mockBase64 = Buffer.from('mock-cover-art').toString('base64');
  const proposal: any = await createProposal(testDeps, collectorUser, {
    proposalType: 'cover_image',
    masterComicId,
    coverTarget: 'front',
    imageBufferBase64: mockBase64,
    reason: 'Better color-corrected front cover scan',
  });

  assert.equal(proposal.status, 'pending');
  assert.equal(proposal.masterComicId, masterComicId);
  const stagingPath = proposalStagingPath(proposal.id);
  assert.equal(await fakeBucket.file(stagingPath).exists().then((r) => r[0]), true);

  // Cast 4 upvotes from 4 different VIP users (not yet quorum)
  for (let i = 1; i <= 4; i++) {
    const voter: ProposalActor = { uid: `voter-${i}`, role: 'user', vipTier: 'collector', isBannedFromProposals: false };
    const res = await castVote(testDeps, voter, proposal.id, 1);
    assert.equal(res.promoted, false);
    assert.equal(res.proposal.netVotes, i);
  }

  // 5th upvote hits quorum (+5 net votes, 100% approval) => AUTO-PROMOTES!
  const voter5: ProposalActor = { uid: 'voter-5', role: 'user', vipTier: 'collector', isBannedFromProposals: false };
  const res5 = await castVote(testDeps, voter5, proposal.id, 1);
  assert.equal(res5.promoted, true);
  assert.equal(res5.proposal.status, 'approved');

  // Verify master_comics was updated with promoted URL
  const updatedMaster = (await fakeDb.collection('master_comics').doc(masterComicId).get()).data();
  assert.ok(updatedMaster.coverImage.includes(proposal.id));

  // Verify staging object was deleted to save space
  assert.equal(await fakeBucket.file(stagingPath).exists().then((r) => r[0]), false);

  // Verify promoted storage object exists
  const destPath = promotedCoverPath(masterComicId, proposal.id, 'front');
  assert.equal(await fakeBucket.file(destPath).exists().then((r) => r[0]), true);
  console.log('✓ Test 5 Passed: Quorum reached, cover auto-promoted to master, and staging file cleaned up.');

  // =========================================================================
  console.log('\n[Test 6] Lifecycle: Admin Veto deletes staged proposal file immediately...');
  const proposal2: any = await createProposal(testDeps, collectorUser, {
    proposalType: 'cover_image',
    masterComicId,
    coverTarget: 'front',
    imageBufferBase64: mockBase64,
    reason: 'Alternate cover attempt',
  });

  const stagingPath2 = proposalStagingPath(proposal2.id);
  assert.equal(await fakeBucket.file(stagingPath2).exists().then((r) => r[0]), true);

  // Admin vetoes
  const vetoed: any = await adminProposalAction(testDeps, adminUser, proposal2.id, 'veto', 'Does not meet art standards');
  assert.equal(vetoed.status, 'vetoed');
  assert.equal(vetoed.adminNotes, 'Does not meet art standards');

  // Staged file MUST be deleted immediately upon veto
  assert.equal(await fakeBucket.file(stagingPath2).exists().then((r) => r[0]), false);
  console.log('✓ Test 6 Passed: Admin veto executed and staged cover deleted from Firebase Storage.');

  // =========================================================================
  console.log('\n[Test 7] Lifecycle: Admin Rollback restores original master metadata...');
  // Archivist creates metadata edit
  const proposal3: any = await createProposal(testDeps, archivistUser, {
    proposalType: 'metadata_edit',
    masterComicId,
    proposedChanges: { writer: 'David Michelinie', artist: 'Todd McFarlane' },
    reason: 'Add iconic creative team',
  });

  // Admin approves directly
  const approved3: any = await adminProposalAction(testDeps, adminUser, proposal3.id, 'approve');
  assert.equal(approved3.status, 'approved');
  const masterWithCreators = (await fakeDb.collection('master_comics').doc(masterComicId).get()).data();
  assert.equal(masterWithCreators.writer, 'David Michelinie');
  assert.equal(masterWithCreators.artist, 'Todd McFarlane');

  // Admin rolls back
  const rolledBack: any = await adminProposalAction(testDeps, adminUser, proposal3.id, 'rollback', 'Testing rollback');
  assert.equal(rolledBack.status, 'rolled_back');
  const restoredMaster = (await fakeDb.collection('master_comics').doc(masterComicId).get()).data();
  assert.equal(restoredMaster.writer, null); // restored to pre-proposal state
  console.log('✓ Test 7 Passed: Admin rollback safely restored previous master state.');

  console.log('\n====================================================================');
  console.log(' All Phase 5 Community Proposals & Voting Quorum Tests Passed!');
  console.log('====================================================================\n');
}

runTests().catch((err) => {
  console.error('Voting Quorum Test Failed:', err);
  process.exit(1);
});
