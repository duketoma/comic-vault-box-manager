# Box3DVisualizer - Quick Usage Guide

## Basic Usage

### Display in a Modal
```typescript
import Box3DVisualizerModal from '../components/Box3DVisualizerModal';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);
  const box = boxes[0];
  const comicsInBox = comics.filter(c => c.currentBoxId === box.id);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>View 3D</button>
      
      <Box3DVisualizerModal
        isOpen={isOpen}
        box={box}
        comics={comicsInBox}
        onClose={() => setIsOpen(false)}
        onUpdateComic={handleUpdateComic}
        onDeleteComic={handleDeleteComic}
      />
    </>
  );
}
```

### Use Standalone Component
```typescript
import Box3DVisualizer from '../components/Box3DVisualizer';

function Visualizer() {
  const [selectedComic, setSelectedComic] = useState<ComicBook | null>(null);

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <Box3DVisualizer
        box={box}
        comics={comics}
        onSelectComic={setSelectedComic}
        highlightedComicId={selectedComic?.id}
      />
    </div>
  );
}
```

---

## User Interactions

| Action | Result |
|--------|--------|
| **Click** on comic | Highlights comic, shows details |
| **Double-click** on comic | Highlights + pulls out smoothly |
| **Click ⚡ button** (pull) | Pulls selected comic (if any) |
| **Click ↻ button** (reset) | Camera returns to default view |
| **Click ⬜ button** (zoom) | Toggle orbit mode (Phase 3) |

---

## Customization

### Adjust Pull Animation
```typescript
// In Box3DVisualizer component
useEffect(() => {
  pullerRef.current?.configure({
    pullDistance: 3.0,    // How far to pull (default: 2.5)
    pullDuration: 800,    // Animation length in ms (default: 600)
  });
}, []);
```

### Change Camera Position
```typescript
// In Box3DVisualizer (after sceneContext init)
const newCameraPos = new THREE.Vector3(0, 2, 15);
sceneContext.camera.position.copy(newCameraPos);
```

### Use Different Easing
```typescript
// In comic-puller.ts, modify EASING object
// or create custom easing function and pass to animation creation
```

---

## Troubleshooting

### 3D Viewer Shows Blank Canvas
1. Check browser console for errors
2. Verify `comics` array is not empty
3. Ensure WebGL is supported (check `webglcontextlost` events)
4. Check that Three.js is properly installed: `npm list three`

### Comics Not Clickable
1. Verify raycaster is initialized in scene context
2. Check that meshes have `userData.comicId` set
3. Ensure canvas is receiving click events (check DevTools)

### Animation Stuttering
1. Check browser frame rate (DevTools Performance tab)
2. Reduce number of comics in view (>100 may be slow)
3. Check for other heavy processes running
4. Try mobile device - may have lower specs

### Cover Images Not Showing
- Phase 2 does not include texture mapping
- This is added in Phase 4
- Currently comics render as solid colors

---

## Performance Tips

### For Large Collections
- Filter comics before rendering (show top 30-50)
- Use LOD (Level of Detail) on backend
- Consider pagination

### Mobile Optimization (Phase 3)
- Reduce canvas resolution on mobile
- Simplify lighting model
- Use requestAnimationFrame with frame skipping
- Disable orbit controls animations

---

## Integration with BoxManager

Add button to existing BoxManager component:

```typescript
// In BoxManager.tsx
const [isBox3DOpen, setIsBox3DOpen] = useState(false);
const [selected3DBox, setSelected3DBox] = useState<StorageBox | null>(null);

// In JSX:
<button 
  onClick={() => {
    setSelected3DBox(box);
    setIsBox3DOpen(true);
  }}
  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
>
  View in 3D
</button>

{isBox3DOpen && selected3DBox && (
  <Box3DVisualizerModal
    isOpen={true}
    box={selected3DBox}
    comics={comics.filter(c => c.currentBoxId === selected3DBox.id)}
    onClose={() => setIsBox3DOpen(false)}
    onUpdateComic={onUpdateComic}
    onDeleteComic={onDeleteComic}
  />
)}
```

---

## Data Requirements

### Box
- `id`: Unique identifier
- `name`: Display name
- `maxCapacity`: Maximum thickness units (used for depth calculation)

### Comics (sorted by display order)
- `id`: Unique per comic
- `sizeThickness`: Relative thickness (1.0 = standard)
- `title`: Display name
- `issueNumber`: Issue identifier
- `coverImage`: URL or base64 (used in Phase 4)
- `publicationYear`: For info display

---

## Next Phase Preview (Phase 3)

- **Orbit Controls**: Right-click drag to rotate, scroll to zoom
- **Touch Gestures**: Two-finger pinch to zoom, swipe to rotate
- **Mobile Optimization**: Touch-friendly UI and simplified rendering
- **Backend API**: Fetch ordered comics from server

---

## Support

For issues or questions:
1. Check browser console for errors
2. Review PHASE_2_COMPLETION.md for architecture details
3. Check THREE_GEOMETRY_DESIGN.md for coordinate system explanation
4. Verify Three.js version: `npm list three` (should be ^r173 or similar)
