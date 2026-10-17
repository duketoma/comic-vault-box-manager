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
