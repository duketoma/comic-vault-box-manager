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

