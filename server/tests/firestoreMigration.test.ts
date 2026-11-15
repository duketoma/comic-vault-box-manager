import assert from 'node:assert/strict';
import {
  splitComicIntoMasterAndUserInstance,
  buildCanonicalSeriesTotalKey,
  normalizeBoxForFirestore,
  isPlaceholderCover,
  isFirebaseStorageUrl,
} from '../services/firestoreMigrationTransform';

async function runTests() {
  console.log('Running Phase 1 Firestore Migration Transformation Tests...\n');

  // Test 1: Admin's High-Quality Google Drive Cover is preserved in userComic.coverImageOverride
  // and NEVER leaked into masterComic.coverImage
  {
    const adminUid = 'admin-uid-001';
    const rawPgRow = {
      id: 'csv-1234567890abcdef',
      title: 'Uncanny X-Men',
      issue_number: '266',
      volume: '1',
      series_name: 'Uncanny X-Men',
      full_title: 'Uncanny X-Men #266',
      publisher: 'Marvel Comics',
      publication_year: 1990,
      publication_month: '8',
      publication_date: '1990-08-01',
      cover_image: 'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz=s800',
      cover_image_full: 'https://drive.google.com/file/d/1FullWraparoundCoverId999/view?usp=sharing',
      reading_status: 'Read',
      read_count: 2,
      copies_owned: 1,
      current_box_id: 4,
      condition: 'Near Mint',
      purchase_price: 45.0,
      estimated_value: 180.0,
      creator_contributions: JSON.stringify([{ creatorName: 'Chris Claremont', roleName: 'Writer' }]),
      character_appearances: JSON.stringify([{ characterName: 'Gambit', appearanceType: 'First Appearance' }]),
      tags: JSON.stringify(['Key Issue', 'First Appearance']),
      created_at: '2026-01-15T12:00:00.000Z',
      updated_at: '2026-10-01T12:00:00.000Z',
    };

    const { masterComic, userComic } = splitComicIntoMasterAndUserInstance(rawPgRow, adminUid);

    // Master catalog MUST NOT expose the Admin's Google Drive links
    assert.equal(
      masterComic.coverImage,
      'NoImage.webp',
      'masterComic.coverImage should default to NoImage.webp until compressed Firebase Storage .webp is uploaded'
    );
    assert.equal(
      masterComic.coverImageFull,
      null,
      'masterComic.coverImageFull should not expose Admin Google Drive link'
    );

    // Admin userComic MUST preserve the high-quality Google Drive URLs as personal overrides
    assert.equal(
      userComic.coverImageOverride,
      'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz=s800'
    );
    assert.equal(
      userComic.coverImageFullOverride,
      'https://drive.google.com/file/d/1FullWraparoundCoverId999/view?usp=sharing'
    );
    // Effective coverImage on userComic resolves to the high-quality override
    assert.equal(
      userComic.coverImage,
      'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz=s800'
    );
    assert.equal(
      userComic.coverImageFull,
      'https://drive.google.com/file/d/1FullWraparoundCoverId999/view?usp=sharing'
    );
    assert.equal(userComic.currentBoxId, 4);
    assert.equal(userComic.copiesOwned, 1);
    assert.equal(userComic.readCount, 2);
    assert.equal(masterComic.creatorContributions.length, 1);
    assert.equal(masterComic.characterAppearances.length, 1);
    console.log('✓ Test 1 Passed: High-quality Google Drive covers preserved in Admin override and excluded from master_comics.');
  }

  // Test 2: Already-migrated Firebase Cloud Storage compressed .webp URL is kept on masterComic
  {
    const fbUrl =
      'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0874195230.firebasestorage.app/o/covers%2Fmaster%2Fcsv-111.webp?alt=media';
    const { masterComic, userComic } = splitComicIntoMasterAndUserInstance(
      {
        id: 'csv-111',
        title: 'Batman',
        issue_number: '404',
        publisher: 'DC Comics',
        cover_image: fbUrl,
        reading_status: 'Unread',
        current_box_id: 2,
      },
      'admin-uid-001'
    );

    assert.equal(masterComic.coverImage, fbUrl);
    assert.equal(userComic.masterCoverImage, fbUrl);
    assert.equal(userComic.coverImageOverride, null);
    assert.equal(userComic.coverImage, fbUrl);
    console.log('✓ Test 2 Passed: Firebase Storage compressed .webp URLs populate masterComic.coverImage.');
  }

  // Test 3: Rule 13 & Rule 10 Invariants — Wishlist comics forced to Box -1 and copiesOwned = 0;
  // Owned comics with null/negative box forced to Box 0 and copiesOwned >= 1
  {
    const { userComic: wishlistComic } = splitComicIntoMasterAndUserInstance(
      {
        id: 'wish-001',
        title: 'Spawn',
        issue_number: '1',
        publisher: 'Image Comics',
        cover_image: 'NoImage.webp',
        reading_status: 'Wishlist',
        current_box_id: 0, // Even if erroneously 0 in raw row, must become -1
        copies_owned: 2,
      },
      'admin-uid-001'
    );

    assert.equal(wishlistComic.currentBoxId, -1, 'Wishlist comic must be assigned to Box -1');
    assert.equal(wishlistComic.copiesOwned, 0, 'Wishlist comic must have copiesOwned = 0');

    const { userComic: ownedUnboxed } = splitComicIntoMasterAndUserInstance(
      {
        id: 'owned-001',
        title: 'Spawn',
        issue_number: '2',
        publisher: 'Image Comics',
        cover_image: 'https://drive.google.com/file/d/1h-E8ndmQeDajXJaZKqRW9JU9PjXZH0jX/view?usp=sharing', // CSV default placeholder
        reading_status: 'Unread',
        current_box_id: -1, // Owned comic must not stay in -1
        copies_owned: 0,
      },
      'admin-uid-001'
    );

    assert.equal(ownedUnboxed.currentBoxId, 0, 'Owned unallocated comic must be assigned to Box 0');
    assert.equal(ownedUnboxed.copiesOwned, 1, 'Owned comic must have copiesOwned >= 1');
    assert.equal(ownedUnboxed.coverImageOverride, null, 'Default CSV placeholder Drive ID should be treated as placeholder');
    console.log('✓ Test 3 Passed: Box -1 (Wishlist) and Box 0 (Staging) invariants enforced.');
  }

  // Test 4: Series totals key normalization & Box normalization
  {
    const key1 = buildCanonicalSeriesTotalKey('The Amazing Spider-Man', '1');
    assert.equal(key1, 'the-amazing-spider-man__vol_1');

    const box = normalizeBoxForFirestore({ id: -1, name: 'Box -1: Wishlist', location: 'Unassigned', max_capacity: 9999, color_tag: '#f43f5e' }, 'admin-uid-001');
    assert.equal(box.id, -1);
    assert.equal(box.userId, 'admin-uid-001');
    assert.equal(isPlaceholderCover('NoImage.webp'), true);
    assert.equal(isFirebaseStorageUrl('https://firebasestorage.googleapis.com/v0/b/test/o/a.webp'), true);
    console.log('✓ Test 4 Passed: Series total deterministic keys and storage box normalization verified.');
  }

  console.log('\nAll Phase 1 Firestore Migration tests passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
