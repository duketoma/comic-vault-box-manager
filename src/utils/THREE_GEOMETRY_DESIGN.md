# 3D Comic Box Visualizer - Geometry Design Document

## Overview

This document outlines the geometric and rendering approach for the 3D comic box visualizer in Comic Vault Box Manager.

**Scope**: How comics are modeled in 3D space, positioned in a box, and rendered with Three.js.

---

## 1. Coordinate System & Box Model

### Storage Box as Reference Frame
- Origin (0, 0, 0) is at the **center** of the box interior
- **X-axis** (left-right): Width of the box
- **Y-axis** (up-down): Height of the box
- **Z-axis** (front-back): Depth of the box (negative = toward back)

### Comic Stacking Order
Comics stack along the **Z-axis** (depth), from front to back:
- **Index 0** (first in array) = **Frontmost** comic (closest to viewer)
- **Index N** (last in array) = **Backmost** comic (farthest from viewer)
- Each comic is positioned with its center at a calculated Z-coordinate based on the sum of thicknesses of all comics in front

### Visual Metaphor
Think of it like pulling comics from the front of a physical box:
- You see the front face of the first comic
- Pull it out → next comic becomes visible
- Repeat until you reach the back

---

## 2. Comic Dimensions

### Physical Reference
Real American comic book: 6.75" (H) × 10.25" (W) × ~0.1" (D)

### Normalized Dimensions
In the 3D space, one "unit" of `sizeThickness` = one standard comic thickness.

```typescript
COMIC_DIMENSIONS = {
  WIDTH: 2.5,           // Face width (how comics face viewer)
  DEPTH: 3.5,           // How deep the box is
  HEIGHT: ~2.27,        // Aspect-correct height (6.75/10.25 * 3.5)
  MIN_THICKNESS: 0.05,  // Minimum thickness for rendering (prevents invisible comics)
}
```

For a comic with `sizeThickness = 1.0`:
- Actual 3D thickness = 1.0 × 0.05 = 0.05 units (visible but thin)
- For `sizeThickness = 2.0` (thick trade paperback):
- Actual 3D thickness = 2.0 × 0.05 = 0.1 units (twice as thick)

### Why This Matters
- **Sizeability**: Users can immediately see which comics are thicker
- **Stacking**: Thick books visibly displace others, affecting reaching depth
- **Realism**: Visual representation matches the physical box experience

---

## 3. Box Dimensions

### Dynamic Sizing
Box inner dimensions are calculated based on `StorageBox.maxCapacity`:

```
Available Depth = (maxCapacity × MIN_THICKNESS) + (PADDING × 2)
Available Width = COMIC_DIMENSIONS.WIDTH + (PADDING × 2)
Available Height = COMIC_DIMENSIONS.HEIGHT + (PADDING × 2)
```

**Example**: Box with 150-unit capacity
- Depth = (150 × 0.05) + 0.4 = **7.9 units** (visualizes ~7.9 inches deep in 3D space)
- Width = 2.5 + 0.4 = **2.9 units**
- Height = 2.27 + 0.4 = **2.67 units**

### Padding & Wall Thickness
- `PADDING`: 0.2 units of empty space inside the box (for visual breathing room)
- `WALL_THICKNESS`: 0.05 units (future: render actual box walls)

---

## 4. Comic Positioning Algorithm

### For Comic at Index `i`:

```
accumulatedThickness = sum(thickness of comics 0 to i-1)

position.x = 0                    // Centered horizontally
position.y = 0                    // Centered vertically
position.z = -depth/2 + PADDING + accumulatedThickness/2

// Example with depth=7.9, comics at indices 0,1,2:
// Comic 0 (thickness=1.0): z = -3.95 + 0.2 + 0.025 = -3.725
// Comic 1 (thickness=1.5): z = -3.95 + 0.2 + 0.05 + 0.0375 = -3.6625
// Comic 2 (thickness=2.0): z = -3.95 + 0.2 + 0.125 + 0.05 = -3.575
```

### Result
Comics sit slightly offset from each other, creating a visible stack. When you look at the box from the front (positive Z), you see the front-facing surface of the first comic, with subsequent comics hidden behind it.

---

## 5. Highlight & Selection Interaction

### Visual Feedback
When a comic is selected for pulling:
1. **Scale increase**: Slightly enlarge (1.05×) for emphasis
2. **Emissive color**: Add subtle glow (emissive = 0x444444, dark glow)
3. **Shadow effect**: Enhance shadow for depth (future enhancement)

### Raycasting for Picking
- When user clicks/taps the canvas, a Three.js `Raycaster` fires a ray from the camera through the mouse position
- Ray intersects with comic meshes; closest one is selected
- Works naturally with the stacked geometry: only the frontmost unobstructed comic can be picked

---

## 6. Capacity & Overflow Handling

### Capacity Flag
`BoxStack.isOverCapacity` is set to `true` if:
```
totalThickness > box.maxCapacity
```

### Visual Indication
- Over-capacity box is flagged for the UI (UI layer shows warning, not 3D layer)
- Comics still render correctly; they just overlap the back wall

### Migration Path
Future: Add visual cue in 3D (change material color, add warning indicator) if desired.

---

## 7. Three.js Implementation Layers

### Layer 1: Geometry Utilities (`three-geometry.ts`)
- **Purpose**: Pure data-driven geometry calculations
- **Exports**: 
  - `createBoxStack()` - Build data structure from box + comics
  - `createComicGeometry()` - Generate BoxGeometry for single comic
  - `buildBoxStackMeshes()` - Convert geometry to Three.js meshes
  - `calculateCameraPosition()` - Frame the view
  - Helper functions for position, thickness, raycasting

### Layer 2: Scene & Rendering (`three-scene.ts`)
- **Purpose**: Three.js runtime (scene, camera, renderer, lights)
- **Exports**:
  - `initializeScene()` - Create scene, camera, renderer, lights
  - `addBoxStackToScene()` - Add meshes to scene
  - `setupAnimationLoop()` - Start render loop
  - `handleWindowResize()` - Responsive canvas
  - `disposeScene()` - Cleanup resources

### Layer 3: React Component (`Box3DVisualizer.tsx` - *next phase*)
- **Purpose**: Integrate Three.js with React lifecycle
- **Will handle**: 
  - Mount/unmount lifecycle
  - State management for selected comic
  - Event listeners (click, drag, keyboard)
  - Animation state (pulling motion)

---

## 8. Performance Considerations

### Mesh Pooling (Future Optimization)
For large boxes (150+ comics), consider:
- Instancing or level-of-detail (LOD) to reduce draw calls
- Only render top 20-30 visible comics in high-capacity boxes
- Background comics as a merged mesh

### Current Approach (Phase 2)
For MVP, render all comics as individual meshes:
- Simpler implementation
- Sufficient for typical box sizes (20-50 comics)
- Can optimize if performance becomes an issue

---

## 9. Texture & Cover Art (Phase 4)

### Texture Mapping Plan
- Load comic cover image from `ComicBook.coverImage`
- Create `THREE.CanvasTexture` or `THREE.Texture` from image
- Apply to front face of comic mesh using UV mapping
- Back face: solid color (book spine often uninteresting)
- Side faces: minimal detail or solid color

### Fallback Handling
- Missing image: use placeholder color (e.g., neutral gray)
- Large image URLs: show loading spinner while texture loads
- Texture errors: fall back to base color

---

## 10. Camera & View Framing

### Default View
- Camera positioned at calculated distance to see entire box
- Slight angle downward (not pure front-on) for 3D depth perception
- Lookups target box center

### User Adjustments (Phase 3)
- Orbit controls: rotate around box
- Zoom: mouse wheel or pinch
- Reset: button to return to default view

---

## 11. Lighting Strategy

### Three Lights
1. **Ambient Light** (0xffffff, 0.6 intensity)
   - Provides base illumination, no harsh shadows
   
2. **Directional Light** (0xffffff, 0.8 intensity)
   - Positioned at (5, 5, 10) = front-upper-right
   - Main light, casts shadows
   - Shadow map 2048×2048 for detail
   
3. **Back Light** (0xffffff, 0.3 intensity)
   - Positioned at (-5, 2, -10) = back-upper-left
   - Rim lighting to separate stack from background

### Result
- Clear shadow under comics
- Subtle rim lighting shows depth and separation
- No harsh self-shadowing within stack

---

## 12. Next Steps

### Phase 2: Component Scaffolding
- Create `Box3DVisualizer.tsx` React component
- Wire Three.js lifecycle to React
- Add event handlers for comic selection
- Basic animation framework for pulling motion

### Phase 3: Interaction & Animation
- Drag/touch controls to pull comics
- Smooth slide-out animation
- Camera reframe when comic is pulled out
- Show/hide details panel

### Phase 4: Polish
- Texture mapping for cover art
- Advanced animations (parallax, bouncing)
- Mobile optimization
- Performance tuning

---

## Appendix: Math Reference

### Thickness Accumulation
```
position[i].z = -boxDepth/2 + PADDING + sum(thicknesses[0..i-1]) + thickness[i]/2
```

### Box Capacity to Depth Conversion
```
boxDepth = capacity × MIN_THICKNESS + PADDING × 2
         = capacity × 0.05 + 0.4
```

### Camera Distance for Framing
```
distance = max(boxWidth × 1.5, boxHeight × 1.5)
```

---

**Status**: ✅ Phase 1 Complete
**Next**: Begin Phase 2 (Component Scaffolding)
