import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  matchLocalCoverFilesToComics,
  compressCoverBufferToWebp,
  buildMasterAndAdminCoverUpdatePayloads,
  buildFirebaseStoragePublicUrl,
  FRONT_COVER_MAX_WIDTH,
  FULL_COVER_MAX_WIDTH,
} from '../services/webpMasterUploadPipeline';
import { ComicBook } from '../../src/types';

async function runTests() {
  console.log('Running Phase 2 Compressed WebP Master Upload Pipeline Tests...\n');

  // Test 1: WebP compression downscales & compresses large images well below storage rules limits
  {
    // Create a synthetic 1200x1800 high-res front cover image buffer
    const rawFrontBuffer = await sharp({
      create: {
        width: 1200,
        height: 1800,
        channels: 3,
        background: { r: 220, g: 50, b: 47 },
      },
    })
      .png()
      .toBuffer();

    const compressedFront = await compressCoverBufferToWebp(rawFrontBuffer, 'front');
    const frontMeta = await sharp(compressedFront).metadata();

    assert.equal(frontMeta.format, 'webp');
    assert.equal(frontMeta.width, FRONT_COVER_MAX_WIDTH, 'Standard cover should resize to max width 400px');
    assert.ok(
      compressedFront.byteLength < 250 * 1024,
      `Standard cover (${compressedFront.byteLength}B) must be under 250KB storage.rules limit`
    );

    // Create a synthetic 2400x1800 full wraparound cover image buffer
    const rawFullBuffer = await sharp({
      create: {
        width: 2400,
        height: 1800,
        channels: 3,
        background: { r: 38, g: 139, b: 210 },
      },
    })
      .png()
      .toBuffer();

    const compressedFull = await compressCoverBufferToWebp(rawFullBuffer, 'full');
    const fullMeta = await sharp(compressedFull).metadata();

    assert.equal(fullMeta.format, 'webp');
    assert.equal(fullMeta.width, FULL_COVER_MAX_WIDTH, 'Full wraparound cover should resize to max width 900px');
    assert.ok(
      compressedFull.byteLength < 500 * 1024,
      `Full cover (${compressedFull.byteLength}B) must be under 500KB storage.rules limit`
    );

    console.log(
      `✓ Test 1 Passed: sharp WebP compression verified (front=${frontMeta.width}x${frontMeta.height} ${compressedFront.byteLength}B, full=${fullMeta.width}x${fullMeta.height} ${compressedFull.byteLength}B).`
    );
  }

  // Test 2: Multi-pass local filename matching (Standard Front Covers, Full Wraparound Covers, Annuals, and NoImage placeholder filtering)
  {
    const sampleComics = [
      {
        id: 'csv-asm-300',
        title: 'The Amazing Spider-Man',
        issueNumber: '300',
        seriesName: 'The Amazing Spider-Man',
        fullTitle: 'The Amazing Spider-Man #300',
        publisher: 'Marvel Comics',
        coverImage: 'NoImage.webp',
        format: 'Single Issue',
        sizeThickness: 1,
        currentBoxId: 1,
        readingStatus: 'Read',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'csv-xmen-annual-96',
        title: "X-Men Annual '96",
        issueNumber: '1996',
        seriesName: 'X-Men',
        fullTitle: "X-Men Annual '96",
        publicationYear: 1996,
        publisher: 'Marvel Comics',
        coverImage: 'NoImage.webp',
        format: 'Annual',
        sizeThickness: 1.5,
        currentBoxId: 2,
        readingStatus: 'Unread',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const localFiles = [
      { filePath: '/covers/NoImage.webp', fileName: 'NoImage.webp', sizeBytes: 12000 },
      {
        filePath: '/covers/The Amazing Spider-Man #300.webp',
        fileName: 'The Amazing Spider-Man #300.webp',
        sizeBytes: 950000,
      },
      {
        filePath: '/covers/The Amazing Spider-Man Full #300.webp',
        fileName: 'The Amazing Spider-Man Full #300.webp',
        sizeBytes: 1850000,
      },
      {
        filePath: "/covers/X-Men Annual Full '96.webp",
        fileName: "X-Men Annual Full '96.webp",
        sizeBytes: 1920000,
      },
      {
        filePath: '/covers/Unrelated Comic #999.webp',
        fileName: 'Unrelated Comic #999.webp',
        sizeBytes: 500000,
      },
    ];

    const result = matchLocalCoverFilesToComics(
      localFiles,
      sampleComics,
      'gen-lang-client-0874195230.firebasestorage.app'
    );

    assert.equal(result.ignoredPlaceholderFiles.length, 1, 'NoImage.webp should be ignored');
    assert.equal(result.matchedFrontCovers.length, 1, 'Should match 1 standard front cover');
    assert.equal(result.matchedFrontCovers[0].comicId, 'csv-asm-300');
    assert.equal(result.matchedFrontCovers[0].storagePath, 'covers/master/csv-asm-300.webp');

    assert.equal(result.matchedFullCovers.length, 2, 'Should match 2 full wraparound covers');
    const fullIds = result.matchedFullCovers.map((m) => m.comicId).sort();
    assert.deepEqual(fullIds, ['csv-asm-300', 'csv-xmen-annual-96']);

    assert.equal(result.unmatchedFiles.length, 1, 'Unrelated Comic #999.webp should remain unmatched');
    console.log('✓ Test 2 Passed: Multi-pass local filename matcher accurately pairs front & full wraparound covers.');
  }

  // Test 2b: Windows-sanitized filenames (missing colons ':', question marks '?', slashes '/') match punctuated comic titles with Score 100
  {
    const punctuatedComics = [
      {
        id: 'csv-torment-1',
        title: 'Spider-Man: Torment',
        issueNumber: '1',
        seriesName: 'Spider-Man: Torment',
        fullTitle: 'Spider-Man: Torment #1',
        publisher: 'Marvel Comics',
      },
      {
        id: 'csv-whatif-1',
        title: 'What If...?',
        issueNumber: '1',
        seriesName: 'What If...?',
        fullTitle: 'What If...? #1',
        publisher: 'Marvel Comics',
      },
      {
        id: 'csv-lotdk-1',
        title: 'Batman: Legends of the Dark Knight',
        issueNumber: '1',
        seriesName: 'Batman: Legends of the Dark Knight',
        fullTitle: 'Batman: Legends of the Dark Knight #1',
        publisher: 'DC Comics',
      },
    ];

    const windowsLocalFiles = [
      // Missing colon (space only)
      { filePath: '/win/Spider-Man Torment #1.webp', fileName: 'Spider-Man Torment #1.webp' },
      // Missing ellipsis and question mark
      { filePath: '/win/What If #1.webp', fileName: 'What If #1.webp' },
      // Hyphen substituted for colon on a Full wraparound cover
      {
        filePath: '/win/Batman - Legends of the Dark Knight Full #1.webp',
        fileName: 'Batman - Legends of the Dark Knight Full #1.webp',
      },
    ];

    const winResult = matchLocalCoverFilesToComics(windowsLocalFiles, punctuatedComics);
    assert.equal(winResult.matchedFrontCovers.length, 2, 'Both Windows front covers without : or ? should match');
    assert.equal(winResult.matchedFullCovers.length, 1, 'Windows full cover with - instead of : should match');
    assert.equal(winResult.unmatchedFiles.length, 0);
    console.log('✓ Test 2b Passed: Windows filenames missing colons (:), question marks (?), or using hyphens (-) match at 100%.');
  }

  // Test 2c: Exactly matches all 14 previously unmatched files
  {
    const problemComics = [
      {
        id: 'imported-1790007670341-2194',
        title: 'Uncanny X-Men Omnibus Vol. 5 HC',
        issueNumber: '1',
        volume: '1',
        seriesName: 'Uncanny X-Men Omnibus (2006 - 2026)',
        fullTitle: 'Uncanny X-Men Omnibus Vol. 5 HC #1',
      },
      {
        id: 'imported-1790007670326-17',
        title: 'Action Comics',
        issueNumber: '1',
        volume: '1',
        seriesName: 'Action Comics #1, 50th Anniversary Reprint (1988)',
        fullTitle: 'Action Comics #1 (50th Anniversary 50 cent White Box Edition)',
      },
      {
        id: 'imported-1790007670326-0',
        title: 'JLX',
        issueNumber: '-1',
        volume: '1',
        seriesName: 'JLX (1996)',
        fullTitle: 'JLX #-1',
      },
      {
        id: 'c-1793923754181',
        title: 'Bravura',
        issueNumber: '1/2',
        volume: 'Vol. 1',
        seriesName: 'Bravura (1994)',
        fullTitle: 'Bravura #1/2',
      },
      {
        id: 'imported-1790007670327-88',
        title: 'Wetworks',
        issueNumber: '2',
        volume: '1',
        seriesName: 'Wetworks (Vol. 1) (1994 - 1998)',
        fullTitle: 'Wetworks #2 Whilce Portacio WildStorm Universe Connecting Variant',
      },
      {
        id: 'imported-1790007670345-2870',
        title: 'Power Records: The Amazing Spider-Man - Invasion of the Dragon Men [Book and Record Set]',
        issueNumber: '1',
        volume: '1',
        seriesName: 'Power Records (1974 - 1981)',
        fullTitle: 'Power Records: The Amazing Spider-Man - Invasion of the Dragon Men [Book and Record Set]',
      },
      {
        id: 'imported-1790007670345-2871',
        title: 'Power Records: The Amazing Spider-Man - The Mark of the Man-Wolf [Book and Record Set]',
        issueNumber: '1',
        volume: '1',
        seriesName: 'Power Records (1974 - 1981)',
        fullTitle: 'Power Records: The Amazing Spider-Man - The Mark of the Man-Wolf [Book and Record Set]',
      },
      {
        id: 'imported-1790007670345-2872',
        title: 'Power Records: Batman - Robin Meets Man-Bat! [Book and Record Set]',
        issueNumber: '1',
        volume: '1',
        seriesName: 'Power Records (1974 - 1981)',
        fullTitle: 'Power Records: Batman - Robin Meets Man-Bat! [Book and Record Set] #1',
      },
    ];

    const fourteenFiles = [
      { filePath: '/win/Uncanny X-Men Omnibus Vol. 5 HC.webp', fileName: 'Uncanny X-Men Omnibus Vol. 5 HC.webp' },
      { filePath: '/win/Uncanny X-Men Omnibus Vol. 5 HC Full.webp', fileName: 'Uncanny X-Men Omnibus Vol. 5 HC Full.webp' },
      { filePath: '/win/Action Comics #1 (50th Anniversary 50 cent White Box Edition).webp', fileName: 'Action Comics #1 (50th Anniversary 50 cent White Box Edition).webp' },
      { filePath: '/win/Action Comics Full #1 (50th Anniversary 50 cent White Box Edition).webp', fileName: 'Action Comics Full #1 (50th Anniversary 50 cent White Box Edition).webp' },
      { filePath: '/win/JLX #1.webp', fileName: 'JLX #1.webp' },
      { filePath: '/win/Bravura #1 2.webp', fileName: 'Bravura #1 2.webp' },
      { filePath: '/win/Bravura Full #1 2.webp', fileName: 'Bravura Full #1 2.webp' },
      { filePath: '/win/WetWorks #2 Whilce Portacio WildStorm Universe Connecting Variant.webp', fileName: 'WetWorks #2 Whilce Portacio WildStorm Universe Connecting Variant.webp' },
      { filePath: '/win/Power Records  The Amazing Spider-Man - The Mark of the Man-Wolf [Book and Record Set].webp', fileName: 'Power Records  The Amazing Spider-Man - The Mark of the Man-Wolf [Book and Record Set].webp' },
      { filePath: '/win/Power Records  The Amazing Spider-Man - The Mark of the Man-Wolf [Book and Record Set] Full.webp', fileName: 'Power Records  The Amazing Spider-Man - The Mark of the Man-Wolf [Book and Record Set] Full.webp' },
      { filePath: '/win/Power Records  The Amazing Spider-Man - Invasion of the Dragon Men [Book and Record Set].webp', fileName: 'Power Records  The Amazing Spider-Man - Invasion of the Dragon Men [Book and Record Set].webp' },
      { filePath: '/win/Power Records  The Amazing Spider-Man - Invasion of the Dragon Men [Book and Record Set] Full.webp', fileName: 'Power Records  The Amazing Spider-Man - Invasion of the Dragon Men [Book and Record Set] Full.webp' },
      { filePath: '/win/Power Records  Batman - Robin Meets Man-Bat! [Book and Record Set].webp', fileName: 'Power Records  Batman - Robin Meets Man-Bat! [Book and Record Set].webp' },
      { filePath: '/win/Power Records  Batman - Robin Meets Man-Bat! [Book and Record Set] Full.webp', fileName: 'Power Records  Batman - Robin Meets Man-Bat! [Book and Record Set] Full.webp' },
    ];

    const res = matchLocalCoverFilesToComics(fourteenFiles, problemComics);
    assert.equal(res.unmatchedFiles.length, 0, `All 14 files must be matched! Unmatched: ${res.unmatchedFiles.map(f => f.fileName).join(', ')}`);
    assert.equal(res.matchedFrontCovers.length, 8, '8 front covers must be matched');
    assert.equal(res.matchedFullCovers.length, 6, '6 full covers must be matched');
    console.log('✓ Test 2c Passed: All 14 previously unmatched files matched with 100% accuracy!');
  }

  // Test 3: Two-Tier Firestore update payload preserves Admin's high-quality Google Drive override
  {
    const fbFrontUrl = buildFirebaseStoragePublicUrl('covers/master/csv-asm-300.webp');
    const fbFullUrl = buildFirebaseStoragePublicUrl('covers/master-full/csv-asm-300.webp');
    const adminHighResDriveFront = 'https://lh3.googleusercontent.com/d/1HighResAdminDriveId=s800';

    const { masterUpdate, adminComicUpdate } = buildMasterAndAdminCoverUpdatePayloads(
      {
        coverImageOverride: adminHighResDriveFront,
        coverImageFullOverride: null,
      },
      {
        frontPublicUrl: fbFrontUrl,
        fullPublicUrl: fbFullUrl,
      },
      '2026-11-10T20:00:00.000Z'
    );

    // Master catalog gets the compressed Firebase Storage URLs
    assert.equal(masterUpdate.coverImage, fbFrontUrl);
    assert.equal(masterUpdate.coverImageFull, fbFullUrl);

    // Admin's userComic updates masterCoverImage, but effective `coverImage` stays on Admin's high-res Drive override!
    assert.equal(adminComicUpdate.masterCoverImage, fbFrontUrl);
    assert.equal(
      adminComicUpdate.coverImage,
      adminHighResDriveFront,
      'Admin effective coverImage must remain on their high-res Google Drive override'
    );
    // Since Admin had no full-cover override on this comic, effective coverImageFull falls back to new Firebase Storage full cover
    assert.equal(adminComicUpdate.masterCoverImageFull, fbFullUrl);
    assert.equal(adminComicUpdate.coverImageFull, fbFullUrl);

    console.log('✓ Test 3 Passed: Master catalog receives compressed Firebase .webp while Admin retains high-res override.');
  }

  console.log('\nAll Phase 2 Compressed WebP Upload Pipeline tests passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
