# Comic Vault Box Manager — Development Guidelines

## UI Performance & Large Collection Rendering
1. **Bounded Progressive Rendering (Infinite Scroll / Batching)**:
   - Views displaying the comic collection (`CollectionCatalog`, `BoxManager`, etc.) must never render the entire collection into the DOM all at once.
   - Use progressive batch rendering (e.g., initial chunks of 48 items in Grid view to align with multi-column layouts, or 50 items in Table view) with `IntersectionObserver` sentinel loading.
   - When filter parameters, search queries, sort orders, or view modes change, reset visible batch counts synchronously during render (`layoutResetKey`) to prevent DOM over-mounting and visual layout thrashing.
   - Always include lazy loading (`loading="lazy"`) on cover images and thumbnails.

2. **Search Bar & High-Frequency Input Invariants**:
   - Any global or live search input must decouple its immediate input value into local component state to guarantee zero keystroke latency (60fps typing).
   - Downstream collection filtering must be debounced by 250–300ms and wrapped in React non-blocking transitions (`React.startTransition` or `useDeferredValue`).
   - Clear (X) buttons, `Escape`, and `Enter` key presses must execute immediately with zero debounce delay.
   - Search inputs with embedded clear buttons must include sufficient right padding (e.g., `pr-16`) to prevent text from clipping behind the clear button.

3. **Defensive Metadata Access**:
   - Comic records may contain sparse or null fields. Never invoke string methods (e.g., `.toLowerCase()`, `.trim()`) or array methods on comic fields without null/undefined guards or default fallbacks (e.g., `(c.title || '').toLowerCase()`, `c.tags?.some(...)`).

4. **Single-Pass Collection Aggregations**:
   - When computing multiple collection statistics or counts in top-level state (e.g., `App.tsx`), combine them into a single-pass `useMemo` loop rather than chaining multiple full `.filter()` / `.reduce()` passes over large arrays.

## Webcam & Hardware Media Capture Invariants
5. **Explicit Camera Selection & Device Binding**:
   - In desktop/web views capturing camera feeds, never invoke `navigator.mediaDevices.getUserMedia` solely with generic constraints (`{ video: true }` or `{ video: { facingMode: 'environment' } }`) without providing an explicit device selector.
   - Virtual camera drivers (e.g., Iriun Webcam, DroidCam, OBS Virtual Camera) and multi-camera systems require explicit device targeting (`video: { deviceId: { exact: selectedId } }`) to prevent the operating system or browser from substituting the system default.
   - Persist user camera preferences using dual identifiers (both `deviceId` and device `label`) in `localStorage` so selections persist across browser sessions even if internal device IDs rotate upon reboot.
   - Attach a `devicechange` listener to `navigator.mediaDevices` to auto-detect and switch to hot-plugged cameras when external or virtual camera apps connect while the interface is already open.
   - Gracefully trap `NotReadableError` to warn the user when another application (such as the native Windows Camera app) holds an exclusive hardware lock on the device.

## Cover Processing & Imaging Invariants
6. **Zero-Cost Client-Side Imaging & OCR**:
   - Cover scanning and image enhancement must execute entirely on the client (e.g., via `tesseract.js` and HTML5 Canvas perspective homography warping/deskewing). Do not introduce third-party cloud AI vision dependencies with per-request running costs.
   - Imaging and perspective-cropping workflows must be accessible from both the new comic addition modal and existing comic details (`ComicDetailModal`), supporting both Front Cover (`coverImage`) and Full Wraparound Art (`coverImageFull`) targets.

## Shell & Environment Invariants
7. **Windows PowerShell Command Chaining**:
   - When executing commands in Windows PowerShell environments, do not use `&&` as a command separator (which causes parse errors in PowerShell 5.1). Use `;` or separate command invocations instead.

## Android / Capacitor Synchronization Invariants
8. **Automated & Manual Mobile Asset Synchronization**:
   - The Android application serves web assets packaged in `android/app/src/main/assets/public/`.
   - Native builds in Android Studio or Gradle automatically invoke the `syncWebAssets` Gradle task (defined in `android/app/build.gradle`), which detects changes to `src/`, `package.json`, or web configuration files and runs `npm run android:build` before packaging the APK.
   - When deploying or testing on an Android device via Android Studio or CLI, ensure `npm run android:build` (which executes `vite build && npx cap sync android`) has completed so the latest web bundle and Capacitor plugins are synced.
   - Never push or run native builds assuming the web code updates automatically; verify that `android/app/src/main/assets/public/` contains the latest timestamped bundles.

## Offline-First Persistence & Bidirectional Wi-Fi Sync Invariants
9. **IndexedDB Local Storage & Sync Outbox (`localDbService.ts` & `syncService.ts`)**:
   - Never persist large comic collections solely into `localStorage`, which hits a ~5 MB WebView quota limit and silently drops persistence.
   - All client-side collection reads and mutations (`ComicBook`, `StorageBox`, `SeriesIssueTotal`) must persist through `src/services/localDbService.ts` (`ComicVaultLocalDB` in IndexedDB) and enqueue mutations into the `sync_outbox` object store before triggering `performBidirectionalSync()` (`src/services/syncService.ts`).
   - Every client-side mutation must stamp a fresh ISO 8601 `updatedAt: new Date().toISOString()` on modified records. When transitioning a comic's status (especially from `'Wishlist'` to owned), always pass the prior `baseStatus` into `saveLocalComicAndEnqueue` / `saveLocalComicsBatchAndEnqueue` so `POST /api/sync` preserves offline wishlist purchases even if PC metadata changed while separated.
   - When hydrating from backend `loadCollection()`, write directly to IndexedDB via `putLocalComicsDirect(clean)` and update `lastSyncAt = now` to avoid enqueuing the entire collection into `sync_outbox` or triggering redundant full delta syncs.
   - In React top-level state (`App.tsx`), keep collection hydration callbacks stable with empty dependency arrays (`[]`) and ref pointers (`comicsRef`, `boxesRef`) to prevent infinite hydration loops and visual skeleton thrashing. Always call standard REST endpoints (`replaceComics`, `saveComic`, etc.) in tandem with local outbox enqueueing so existing REST API test intercepts remain fully functional.

10. **PostgreSQL Sync Tombstones & Transaction Client Queries (`server/db.ts` & `server/routes/collection.ts`)**:
   - Any server-side deletion of comics or storage boxes in PostgreSQL must record tombstones in the `deleted_records` table via `recordDeletionTombstones(client, entityType, ids)`, and any upsert must clear tombstones via `clearDeletionTombstones(client, entityType, ids)` so delta syncs (`POST /api/sync`) propagate deletions to mobile devices.
   - In `node-postgres` (`pg`), never run `Promise.all([client.query(...), client.query(...)])` concurrently on the same checked-out `PoolClient` instance inside a transaction (which triggers `pg` deprecation warnings and serializes over one socket anyway). Execute queries sequentially with `await client.query(...)` on a checked-out `PoolClient`, or use `pool.query(...)` only for non-transactional parallel reads.
   - Defensively ensure numeric fields with database `NOT NULL` constraints (such as `copies_owned`) are always guarded in `comicValues()` with appropriate fallbacks (`Math.max(1, Number(value) || 1)` for owned comics, `0` for wishlist items).


