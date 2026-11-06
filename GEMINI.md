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

2b. **Navbar Top-Bar Icon Density & Brand Protection**:
   - Quick action buttons in the top navigation bar (`Market Values`, `Drive Covers`, `Cover Scanner`, `Add Comic`, `Style Studio`, `Dark/Light Mode`, `Manage Data`, `Server Settings`) must remain icon-only across all screen widths (`p-2 rounded-lg` with `w-4 h-4` icons). Do not add responsive text labels at `lg:` or `xl:` breakpoints that consume horizontal space.
   - All icon buttons must retain explicit `title` tooltips, `aria-label`, and `<span className="sr-only">` text to maintain full screen-reader accessibility and Playwright `getByRole('button', { name: ... })` locator compatibility.
   - App branding (`Comic Archive Pro`) and subtitles must include `shrink-0` and `whitespace-nowrap` to prevent truncation.

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

## Market Valuation & Scraper Comp Invariants (`server/services/valuationEngine.ts`)
11. **Multi-Source Scraping & Grade-Tier Resolution**:
   - Price regexes targeting external price guide tables (e.g., PriceCharting) must account for nested HTML elements (such as `<span class="js-price">...</span>`) rather than assuming immediate text nodes.
   - Scraper candidate ranking must defensively filter common comic filler stop-words (`comic`, `comics`, `title`, `series`, `book`, `issue`, `vol`, `volume`) and enforce a minimum keyword match threshold so unrelated popular `#1` recommendations are never falsely selected.
   - When a search result candidate is selected, follow its product URL to extract exact grade-tier breakdown tables (`gradeTable`) and authoritative Near Mint values (`box_only_price` / 9.2 NM-).
   - Low-confidence fallback estimates (`confidence === 'low'`) must NEVER be stored in long-lived memory caches (`quoteCache`). When refreshing or updating an individual comic, always allow bypassing cache (`bypassCache: true`).

## E2E Testing, Debounce Transitions & Spring Animation Invariants
12. **Playwright Interactions with Debounced Inputs & Spring Physics**:
   - When Playwright tests type into search bars or filters with debounced state transitions (250–300ms), they must submit `await searchInput.press('Enter')` or wait for transition counters (e.g. `Showing X of Y`) before taking element counts to prevent race conditions during list re-rendering.
   - Bounding-box or geometry assertions on modals with spring-physics entrance animations (`comic-modal-spring-full` which peaks at `scale(1.038)`) must allow the entrance keyframe to complete settling before measuring bounding box dimensions.

## Storage Box Partitioning & Wishlist Architecture
13. **Storage Box Hierarchy & Wishlist Box Partitioning (`Box 0` vs `Box -1`)**:
   - `Box 0` is strictly reserved for *owned* unallocated / staging comics (e.g., newly acquired comics or issues temporarily removed from a box). Never assign wishlisted comics to Box 0.
   - Wishlisted comics must always be assigned to Box ID `-1` behind the scenes across all creation, editing, and import pathways (`AddAndScanModal`, `ComicDetailModal`, `GenerateSeriesWishlistModal`, `GoogleSheetsImporter`, `seriesDateProjection`).
   - PostgreSQL requires an initialized container record `id = -1` in `storage_boxes` (`Box -1: Wishlist`) to satisfy foreign key constraints (`REFERENCES storage_boxes(id)`).
   - In physical storage box dropdowns, Box 0 must be formatted consistently with physical boxes using `#` and `:` (`Box #0: Unallocated / Staging Queue` matching `Box #1: ...`), while Box `-1` must be excluded from physical storage box selectors.

## Catalog Filtering & Reading Status Invariants
14. **Catalog View Reading Status & Dedicated Wishlist Scope Filter**:
   - "Wishlist" is NOT a reading status. The `Reading Status` filter dropdown must strictly filter actual reading states (`Read`, `Reading`, `Unread`, `All Statuses`) and must never include a `Wishlist` option.
   - Catalog View searches and default browsing must always exclude Wishlisted comics (`Exclude Wishlist` by default).
   - Wishlist inclusion must be controlled via the dedicated 3-state filter (`Exclude Wishlist`, `Include Wishlist`, `Wishlist Only`) persisted in `CatalogFilters`.

## E2E Testing & Playwright Server Invariants
15. **Playwright Production Bundle Freshness & Server Port Lifecycle**:
   - `playwright.config.ts` launches or connects to `node dist-server/server.cjs` serving pre-built assets in `dist/` with `reuseExistingServer: true`.
   - When modifying frontend components or server routes before running Playwright tests, always execute `npm run build` and ensure any stale running process on port 3000 is terminated so tests evaluate the latest code rather than stale cached bundles.



