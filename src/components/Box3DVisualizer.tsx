/**
 * Box3DVisualizer Component
 * 
 * Main React component for rendering a 3D visualization of comics in a storage box.
 * Manages Three.js lifecycle, OrbitControls, state, and event handling.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { ComicBook, StorageBox } from '../types';
import { sortComicsByBoxOrder } from '../utils/comicSortUtils';
import {
  BOX_DIMENSIONS,
  createBoxStack,
  buildBoxStackMeshes,
  calculateCameraPosition,
  updateComicHighlight,
  pickComicFromRay,
  setShortboxFlipTargets,
  stepShortboxFlipParting,
  BoxStack,
} from '../utils/three-geometry';
import {
  initializeScene,
  addBoxStackToScene,
  setupAnimationLoop,
  handleWindowResize,
  disposeScene,
  createRaycaster,
  getNormalizedCoordinates,
  applySceneLightingMood,
  animateCameraTo,
  CameraPreset,
  SceneContext,
} from '../utils/three-scene';
import {
  buildVaultRoomEnvironment,
  applyRoomMood,
  VaultLightingMood,
  VaultRoomHandles,
} from '../utils/three-room';
import { 
  ChevronLeft, 
  RotateCcw, 
  Zap, 
  ArrowDownToLine, 
  ChevronRight, 
  HelpCircle,
  Sparkles,
  Camera,
  Sun,
  Boxes,
} from 'lucide-react';
import { createComicPuller, ComicPuller } from '../utils/comic-puller';
import { preloadComicTextures, clearTextureCache } from '../utils/three-textures';

export interface Box3DVisualizerProps {
  box: StorageBox;
  allBoxes?: StorageBox[];
  comics: ComicBook[];
  grailComics?: ComicBook[];
  onSwitchBox?: (box: StorageBox) => void;
  onSelectComic?: (comic: ComicBook) => void;
  onViewFullArt?: (comic: ComicBook) => void;
  onClose?: () => void;
  highlightedComicId?: string;
  isFullscreen?: boolean;
}

export const Box3DVisualizer: React.FC<Box3DVisualizerProps> = ({
  box,
  allBoxes = [],
  comics: rawComics,
  grailComics = [],
  onSwitchBox,
  onSelectComic,
  onViewFullArt,
  onClose,
  highlightedComicId,
  isFullscreen = false,
}) => {
  const comics = useMemo(() => sortComicsByBoxOrder(rawComics), [rawComics]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneContextRef = useRef<SceneContext | null>(null);
  const roomHandlesRef = useRef<VaultRoomHandles | null>(null);
  const activeBoxGroupRef = useRef<THREE.Group | null>(null);
  const boxStackRef = useRef<BoxStack | null>(null);
  const comicMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const dividerGroupsRef = useRef<THREE.Group[]>([]);
  const hoveredShelfMeshRef = useRef<THREE.Mesh | null>(null);
  const previousHighlightRef = useRef<string | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const cleanupRef = useRef<(() => void) | null>(null);

  // Drag vs Click detection
  const isDraggingRef = useRef(false);
  const pointerDownPosRef = useRef({ x: 0, y: 0 });

  // Local state for UI
  const [selectedComicId, setSelectedComicId] = useState<string | null>(null);
  const [isComicPulled, setIsComicPulled] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightingMood, setLightingMood] = useState<VaultLightingMood>('warm');
  const [activePreset, setActivePreset] = useState<CameraPreset>('table');
  const [flipMode, setFlipMode] = useState<'peek' | 'lift'>('peek');
  const [hoveredShelfBox, setHoveredShelfBox] = useState<StorageBox | null>(null);

  // Animation controller for pulling comics
  const pullerRef = useRef<ComicPuller>(createComicPuller());

  /**
   * Initialize Three.js scene and build box geometry
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      setIsLoading(true);
      setError(null);

      // Preload comic textures asynchronously in background
      preloadComicTextures(comics);

      // Initialize scene context (camera, renderer, controls, lights, fog)
      const sceneContext = initializeScene(canvas, lightingMood);
      sceneContextRef.current = sceneContext;
      raycasterRef.current = createRaycaster();

      // Build box stack geometry from comics
      const boxStack = createBoxStack(box, comics, highlightedComicId);
      boxStackRef.current = boxStack;

      // Build 3D Collector's Vault Room environment (table, lid, LED shelving rack, framed wall Grails)
      const resolvedGrails =
        grailComics.length > 0
          ? grailComics
          : [...comics]
              .sort((a, b) => (Number(b.estimatedValue) || 0) - (Number(a.estimatedValue) || 0))
              .slice(0, 2);

      const roomHandles = buildVaultRoomEnvironment({
        activeBox: box,
        allBoxes: allBoxes.length > 0 ? allBoxes : [box],
        boxInnerDimensions: boxStack.innerDimensions,
        boxWallThickness: BOX_DIMENSIONS.WALL_THICKNESS,
        grailComics: resolvedGrails,
        mood: lightingMood,
      });
      roomHandlesRef.current = roomHandles;
      sceneContext.scene.add(roomHandles.group);

      // Generate Three.js meshes (storage box container + divider tabs + comics)
      const meshGroup = buildBoxStackMeshes(boxStack, box);
      activeBoxGroupRef.current = meshGroup;

      // Store comic meshes & divider groups for interaction & stack leaning
      comicMeshesRef.current.clear();
      dividerGroupsRef.current = [];
      meshGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && (child.userData as any).comicId) {
          const comicId = (child.userData as any).comicId;
          comicMeshesRef.current.set(comicId, child);
        } else if (child instanceof THREE.Group && (child.userData as any).isDivider) {
          dividerGroupsRef.current.push(child);
        }
      });

      // Add to scene
      addBoxStackToScene(sceneContext, meshGroup);

      // Position camera at optimal 3/4 elevated angle framing box on table & shelves behind
      const cameraPos = calculateCameraPosition(boxStack);
      sceneContext.camera.position.copy(cameraPos);
      sceneContext.camera.lookAt(0, 0.3, -1.0);
      sceneContext.controls.target.set(0, 0.3, -1.0);
      sceneContext.controls.update();

      // Setup animation loop (comic puller + shortbox finger-flip parting for comics & dividers)
      const stopAnimation = setupAnimationLoop(sceneContext, (delta: number) => {
        pullerRef.current?.update(delta);
        stepShortboxFlipParting(comicMeshesRef.current, dividerGroupsRef.current, delta);
      });
      cleanupRef.current = stopAnimation;

      setSelectedComicId(null);
      setIsComicPulled(false);
      setHoveredShelfBox(null);
      setActivePreset('table');
      setIsLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize 3D viewer';
      setError(message);
      console.error('Box3DVisualizer init error:', err);
      setIsLoading(false);
    }

    // Cleanup on unmount
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
      if (sceneContextRef.current) {
        disposeScene(sceneContextRef.current);
      }
      clearTextureCache();
    };
  }, [box, comics]);

  /**
   * Handle canvas resize (observe outer flex container + react immediately to Full Screen toggle)
   */
  useEffect(() => {
    const container = canvasContainerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const syncSize = () => {
      const sceneContext = sceneContextRef.current;
      if (!sceneContext) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      sceneContext.camera.aspect = w / h;
      sceneContext.camera.updateProjectionMatrix();
      sceneContext.renderer.setSize(w, h, false);
      sceneContext.canvasSize = { width: w, height: h };
    };

    const resizeObserver = new ResizeObserver(() => {
      syncSize();
    });
    resizeObserver.observe(container);
    window.addEventListener('resize', syncSize);

    // Trigger after layout settles (e.g. Full Screen CSS transition)
    const raf = requestAnimationFrame(syncSize);
    const timer = setTimeout(syncSize, 180);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncSize);
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [box, comics, isFullscreen]);

  /**
   * Pointer down: record start coordinate to differentiate drags from clicks
   */
  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointerDownPosRef.current = { x: event.clientX, y: event.clientY };
    isDraggingRef.current = false;
  };

  /**
   * Raycast background shelf boxes with full depth/occlusion checking against the
   * walnut table, lid, and active storage box so hidden shelf boxes are never picked.
   */
  const pickUnoccludedShelfBox = useCallback(
    (raycaster: THREE.Raycaster): { box: StorageBox; mesh: THREE.Mesh } | null => {
      const roomHandles = roomHandlesRef.current;
      if (!roomHandles || roomHandles.shelfBoxMeshes.length === 0) return null;

      const testObjects: THREE.Object3D[] = [
        ...roomHandles.shelfBoxMeshes,
        ...roomHandles.occluderMeshes,
      ];
      if (activeBoxGroupRef.current) {
        testObjects.push(activeBoxGroupRef.current);
      }

      const hits = raycaster.intersectObjects(testObjects, true);
      if (hits.length === 0) return null;

      // Only accept if the CLOSEST hit along the ray belongs to a background shelf box
      let hitObj: THREE.Object3D | null = hits[0].object;
      while (hitObj && !(hitObj.userData as any)?.shelfBox) {
        hitObj = hitObj.parent;
      }
      const shelfBox = (hitObj?.userData as any)?.shelfBox as StorageBox | undefined;
      if (!shelfBox) return null;

      const rootMesh =
        roomHandles.shelfBoxMeshes.find((m) => (m.userData as any)?.shelfBoxId === shelfBox.id) || null;
      return rootMesh ? { box: shelfBox, mesh: rootMesh } : null;
    },
    []
  );

  /**
   * Pointer move: if moved more than 5px, it's an OrbitControls drag.
   * Also raycast for hover cursor feedback.
   */
  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const dx = event.clientX - pointerDownPosRef.current.x;
    const dy = event.clientY - pointerDownPosRef.current.y;
    if (dx * dx + dy * dy > 25) {
      isDraggingRef.current = true;
    }

    const canvas = canvasRef.current;
    const sceneContext = sceneContextRef.current;
    const raycaster = raycasterRef.current;
    if (!canvas || !sceneContext || !raycaster || isDraggingRef.current) return;

    const coords = getNormalizedCoordinates(event.nativeEvent, canvas);
    raycaster.setFromCamera(coords, sceneContext.camera);

    const meshArray = Array.from(comicMeshesRef.current.values());
    const pickedComic = pickComicFromRay(raycaster, meshArray);
    if (pickedComic) {
      if (hoveredShelfMeshRef.current) {
        const mat = hoveredShelfMeshRef.current.material as THREE.MeshStandardMaterial;
        mat.emissive?.setHex(0x000000);
        hoveredShelfMeshRef.current = null;
        setHoveredShelfBox(null);
      }
      canvas.style.cursor = 'pointer';
      return;
    }

    // Depth-checked raycast for unoccluded background shelf boxes
    if (onSwitchBox) {
      const shelfHit = pickUnoccludedShelfBox(raycaster);
      if (shelfHit) {
        if (hoveredShelfMeshRef.current && hoveredShelfMeshRef.current !== shelfHit.mesh) {
          (hoveredShelfMeshRef.current.material as THREE.MeshStandardMaterial).emissive?.setHex(0x000000);
        }
        (shelfHit.mesh.material as THREE.MeshStandardMaterial).emissive?.setHex(0x1e3a8a);
        hoveredShelfMeshRef.current = shelfHit.mesh;
        setHoveredShelfBox(shelfHit.box);
        canvas.style.cursor = 'pointer';
        return;
      }
    }

    if (hoveredShelfMeshRef.current) {
      (hoveredShelfMeshRef.current.material as THREE.MeshStandardMaterial).emissive?.setHex(0x000000);
      hoveredShelfMeshRef.current = null;
      setHoveredShelfBox(null);
    }
    canvas.style.cursor = 'grab';
  };

  /**
   * Handle comic selection via raycasting on click
   */
  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      // Ignore click if the user was orbiting/dragging
      if (isDraggingRef.current) return;

      const canvas = canvasRef.current;
      const sceneContext = sceneContextRef.current;
      const raycaster = raycasterRef.current;

      if (!canvas || !sceneContext || !raycaster) return;

      const coords = getNormalizedCoordinates(event.nativeEvent, canvas);
      mouseRef.current.copy(coords);

      raycaster.setFromCamera(mouseRef.current, sceneContext.camera);

      const meshArray = Array.from(comicMeshesRef.current.values());
      const picked = pickComicFromRay(raycaster, meshArray);

      if (picked) {
        const comicId = (picked.userData as any).comicId;
        setSelectedComicId(comicId);

        const comic = comics.find((c) => c.id === comicId);
        if (comic && onSelectComic) {
          onSelectComic(comic);
        }

        // Check if double-click: toggle pulling the comic
        if (event.detail === 2) {
          pullerRef.current?.pullComic(comicId, picked);
          setIsComicPulled(pullerRef.current?.isSettled(comicId) || false);
        }
        return;
      }

      // Check if user clicked an unoccluded box on the background 3D shelf to swap onto the table
      if (onSwitchBox) {
        const shelfHit = pickUnoccludedShelfBox(raycaster);
        if (shelfHit && shelfHit.box.id !== box.id) {
          onSwitchBox(shelfHit.box);
        }
      }
    },
    [comics, onSelectComic, onSwitchBox, box.id, pickUnoccludedShelfBox]
  );

  /**
   * Update highlight when selectedComicId or highlightedComicId changes
   */
  useEffect(() => {
    const highlightId = highlightedComicId || selectedComicId;

    // Remove previous highlight
    if (previousHighlightRef.current && previousHighlightRef.current !== highlightId) {
      const previousMesh = comicMeshesRef.current.get(previousHighlightRef.current);
      if (previousMesh) {
        updateComicHighlight(previousMesh, false);
      }
    }

    // Apply new highlight & zero-clipping V-parting lean
    const innerDepth = boxStackRef.current?.innerDimensions.depth;
    if (highlightId) {
      const mesh = comicMeshesRef.current.get(highlightId);
      if (mesh) {
        updateComicHighlight(mesh, true);
        setIsComicPulled(pullerRef.current?.isSettled(highlightId) || false);
      }
      const focusedIdx = comics.findIndex((c) => c.id === highlightId);
      setShortboxFlipTargets(comicMeshesRef.current, dividerGroupsRef.current, comics, focusedIdx, innerDepth);
    } else {
      setIsComicPulled(false);
      setShortboxFlipTargets(comicMeshesRef.current, dividerGroupsRef.current, comics, -1, innerDepth);
    }

    previousHighlightRef.current = highlightId || null;
  }, [highlightedComicId, selectedComicId, comics]);

  // Live-update 3D lighting mood & room LED strips without rebuilding WebGL scene
  useEffect(() => {
    if (sceneContextRef.current) {
      applySceneLightingMood(sceneContextRef.current, lightingMood);
    }
    if (roomHandlesRef.current) {
      applyRoomMood(roomHandlesRef.current, lightingMood);
    }
  }, [lightingMood]);

  /**
   * Smoothly transition camera to a named Vault Room preset
   */
  const handleSelectCameraPreset = (preset: CameraPreset) => {
    const sceneContext = sceneContextRef.current;
    const boxStack = boxStackRef.current;
    if (!sceneContext || !boxStack) return;

    setActivePreset(preset);
    const { innerDimensions } = boxStack;

    if (preset === 'table') {
      const pos = calculateCameraPosition(boxStack);
      animateCameraTo(sceneContext, pos, new THREE.Vector3(0, 0.3, -1.0));
    } else if (preset === 'dig') {
      // Close-up elevated front view peering straight into the parted comic covers
      const selectedIdx = comics.findIndex((c) => c.id === selectedComicId);
      const mesh = selectedComicId ? comicMeshesRef.current.get(selectedComicId) : null;
      const focusZ = mesh ? mesh.position.z : innerDimensions.depth * 0.25;
      animateCameraTo(
        sceneContext,
        new THREE.Vector3(0.45, innerDimensions.height * 0.95, focusZ + 5.2),
        new THREE.Vector3(0, 0.35, focusZ - 0.5)
      );
      if (selectedIdx === -1 && comics.length > 0) {
        setSelectedComicId(comics[0].id);
        onSelectComic?.(comics[0]);
      }
    } else {
      // 'room' — wide cinematic shot showcasing the walnut table, lid, shelves, and framed wall Grails
      animateCameraTo(
        sceneContext,
        new THREE.Vector3(8.5, 6.8, innerDimensions.depth / 2 + 12.5),
        new THREE.Vector3(0, 0.8, -5.5)
      );
    }
  };

  /**
   * Toggle pull/return for the currently selected comic
   */
  const handleTogglePull = () => {
    if (!selectedComicId) return;
    const mesh = comicMeshesRef.current.get(selectedComicId);
    if (mesh) {
      pullerRef.current?.pullComic(selectedComicId, mesh);
      // Update state after animation starts
      setTimeout(() => {
        setIsComicPulled(pullerRef.current?.isSettled(selectedComicId) || false);
      }, 50);
    }
  };

  /**
   * Focus a comic by index honoring active Flip Mode ('peek' stays low & leans neighbors, 'lift' pulls comic out)
   */
  const focusComicByIndex = (targetIndex: number, modeOverride?: 'peek' | 'lift') => {
    const target = comics[targetIndex];
    if (!target) return;
    const activeMode = modeOverride ?? flipMode;

    setSelectedComicId(target.id);
    if (onSelectComic) onSelectComic(target);

    const mesh = comicMeshesRef.current.get(target.id);
    if (!mesh) return;

    if (activeMode === 'lift') {
      if (!pullerRef.current?.isSettled(target.id)) {
        pullerRef.current?.pullComic(target.id, mesh);
      }
      setIsComicPulled(true);
    } else {
      // Peek & Lean mode: ensure any previously pulled comic slides smoothly back down
      comicMeshesRef.current.forEach((m, id) => {
        if (pullerRef.current?.isSettled(id)) {
          pullerRef.current.pullComic(id, m);
        }
      });
      setIsComicPulled(false);
    }
  };

  /**
   * Navigate to previous comic in box
   */
  const handlePrevComic = () => {
    if (comics.length === 0) return;
    const currentIndex = comics.findIndex((c) => c.id === selectedComicId);
    const prevIndex = currentIndex <= 0 ? comics.length - 1 : currentIndex - 1;
    focusComicByIndex(prevIndex);
  };

  /**
   * Navigate to next comic in box
   */
  const handleNextComic = () => {
    if (comics.length === 0) return;
    const currentIndex = comics.findIndex((c) => c.id === selectedComicId);
    const nextIndex = currentIndex === -1 || currentIndex >= comics.length - 1 ? 0 : currentIndex + 1;
    focusComicByIndex(nextIndex);
  };

  /**
   * Reset camera to optimal 3/4 default view
   */
  const handleResetCamera = () => {
    handleSelectCameraPreset('table');
  };

  // Keyboard arrow keys for flipping through comics
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevComic();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextComic();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [comics, selectedComicId]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
        <div className="text-center max-w-md">
          <p className="text-red-600 dark:text-red-400 font-semibold mb-2 text-lg">Failed to initialize 3D view</p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-md text-sm cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-slate-100 dark:bg-slate-950 flex flex-col select-none">
      {/* Top Controls Header */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 py-2 z-10 shadow-xs shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer touch-manipulation active:scale-95 shrink-0"
              title="Close 3D View"
              aria-label="Close 3D View"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h2 className="font-bold text-slate-900 dark:text-slate-100 truncate text-xs sm:text-base max-w-[120px] sm:max-w-[200px]">
                {box.name}
              </h2>
              {boxStackRef.current?.isOverCapacity ? (
                <span className="text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-semibold shrink-0">
                  Over Capacity
                </span>
              ) : (
                <span className="text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium shrink-0">
                  {comics.length} / {box.maxCapacity} comics
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Previous / Next Comic Buttons */}
          {comics.length > 0 && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={handlePrevComic}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-all touch-manipulation active:scale-95 cursor-pointer"
                title="Previous Comic in Box"
                aria-label="Previous Comic in Box"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                type="button"
                onClick={handleNextComic}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-all touch-manipulation active:scale-95 cursor-pointer"
                title="Next Comic in Box"
                aria-label="Next Comic in Box"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          )}

          {/* Pull / Return Toggle Button - fixed width to prevent layout shifts */}
          <button
            type="button"
            disabled={!selectedComicId}
            onClick={handleTogglePull}
            className={`min-h-[40px] min-w-[40px] sm:min-w-[105px] justify-center flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold transition-all touch-manipulation shrink-0 ${
              !selectedComicId
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700/60 cursor-not-allowed opacity-60'
                : isComicPulled
                ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs active:scale-95 cursor-pointer'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs active:scale-95 cursor-pointer'
            }`}
            title={
              !selectedComicId
                ? 'Select a comic to pull'
                : isComicPulled
                ? 'Slide back into box'
                : 'Lift comic out of box to inspect'
            }
            aria-label={
              !selectedComicId
                ? 'Select a comic to pull'
                : isComicPulled
                ? 'Return comic into box'
                : 'Lift comic out of box to inspect'
            }
          >
            {isComicPulled ? (
              <>
                <ArrowDownToLine className="w-4 h-4" />
                <span className="hidden sm:inline">Return</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span className="hidden sm:inline">Pull Comic</span>
              </>
            )}
          </button>

          {/* Full Art Button - always rendered with fixed width, disabled when comic lacks full art */}
          {onViewFullArt && (() => {
            const sc = selectedComicId ? comics.find((c) => c.id === selectedComicId) : null;
            const hasFullArt = Boolean(sc?.coverImageFull);
            return hasFullArt ? (
              <button
                type="button"
                onClick={() => sc && onViewFullArt(sc)}
                className="min-h-[40px] min-w-[40px] sm:min-w-[88px] justify-center flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-all touch-manipulation active:scale-95 cursor-pointer shrink-0"
                title="View Full Wraparound Cover Art"
                aria-label="View Full Wraparound Cover Art"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span className="hidden sm:inline">Full Art</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="min-h-[40px] min-w-[40px] sm:min-w-[88px] justify-center flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700/60 transition-none shrink-0 cursor-not-allowed opacity-50"
                title="No full wraparound cover art for this comic"
                aria-label="No full wraparound cover art for this comic"
              >
                <Sparkles className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                <span className="hidden sm:inline">Full Art</span>
              </button>
            );
          })()}

          {/* Reset Camera Button */}
          <button
            type="button"
            onClick={handleResetCamera}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors touch-manipulation active:scale-95 cursor-pointer shrink-0"
            title="Reset 3D Camera to Default Angle"
            aria-label="Reset 3D Camera to Default Angle"
          >
            <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* 3D Canvas Area */}
      <div ref={canvasContainerRef} className="flex-1 relative overflow-hidden bg-slate-100 dark:bg-slate-950">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70 z-20 backdrop-blur-xs">
            <div className="text-center">
              <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-blue-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Loading 3D box view...</p>
            </div>
          </div>
        )}

        {comics.length === 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs px-4 py-2 rounded-full shadow-md z-10 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            This box is empty. Assign comics to see them in 3D!
          </div>
        )}

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onClick={handleCanvasClick}
          className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
        />

        {/* Floating Hover Tooltip for Background 3D Shelf Boxes */}
        {hoveredShelfBox && (
          <div
            data-testid="shelf-box-hover-tooltip"
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-slate-900/92 text-white backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-xl border border-indigo-400/50 text-xs font-bold flex items-center gap-2"
          >
            <Boxes className="w-3.5 h-3.5 text-indigo-300" />
            <span>
              Box #{hoveredShelfBox.id}: {hoveredShelfBox.name}
            </span>
            <span className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider">
              • Click to Swap
            </span>
          </div>
        )}

        {/* Vault Room Floating Controls HUD (Camera Presets, Lighting Moods & Flip Scrubber) */}
        <div
          data-testid="vault-room-hud"
          className="absolute bottom-3 inset-x-3 z-10 flex flex-col gap-2 pointer-events-none"
        >
          {/* Flip-Through Scrubber Bar with Peek & Lean vs Lift & Inspect Mode Toggle */}
          {comics.length > 1 && (
            <div className="pointer-events-auto mx-auto w-full max-w-xl bg-slate-950/85 backdrop-blur-md border border-white/12 rounded-xl px-2.5 py-1.5 shadow-lg flex flex-wrap sm:flex-nowrap items-center gap-2 text-[10px] text-slate-300">
              {/* Flip Mode Segmented Toggle */}
              <div className="flex items-center bg-white/8 rounded-lg p-0.5 border border-white/10 shrink-0">
                <button
                  type="button"
                  data-testid="flip-mode-peek"
                  onClick={() => {
                    setFlipMode('peek');
                    const idx = comics.findIndex((c) => c.id === selectedComicId);
                    if (idx >= 0) focusComicByIndex(idx, 'peek');
                  }}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    flipMode === 'peek'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Keep comics low in box and lean neighboring comics away"
                >
                  Peek &amp; Lean
                </button>
                <button
                  type="button"
                  data-testid="flip-mode-lift"
                  onClick={() => {
                    setFlipMode('lift');
                    const idx = comics.findIndex((c) => c.id === selectedComicId);
                    if (idx >= 0) focusComicByIndex(idx, 'lift');
                  }}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    flipMode === 'lift'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Lift each focused comic out of the box as you flip"
                >
                  Lift &amp; Inspect
                </button>
              </div>

              <input
                type="range"
                data-testid="box3d-flip-scrubber"
                min={0}
                max={comics.length - 1}
                value={Math.max(0, comics.findIndex((c) => c.id === selectedComicId))}
                onChange={(e) => {
                  focusComicByIndex(Number(e.target.value));
                }}
                aria-label="Flip through comics in box"
                className="flex-1 min-w-[120px] accent-indigo-500 h-1.5 bg-white/15 rounded-lg cursor-pointer"
              />
              <span className="font-mono font-bold text-slate-200 shrink-0">
                {Math.max(1, comics.findIndex((c) => c.id === selectedComicId) + 1)}/{comics.length}
              </span>
            </div>
          )}

          {/* Bottom Row: Camera Presets + Lighting Moods + Hint */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Camera Presets */}
            <div className="pointer-events-auto flex items-center gap-1 bg-slate-950/80 backdrop-blur-md border border-white/12 rounded-xl p-1 shadow-lg">
              <Camera className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-0.5 hidden sm:block" />
              {([
                { id: 'table', label: 'Table View' },
                { id: 'dig', label: 'Dig View' },
                { id: 'room', label: 'Vault Room' },
              ] as const).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`camera-preset-${preset.id}`}
                  onClick={() => handleSelectCameraPreset(preset.id)}
                  className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer ${
                    activePreset === preset.id
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Lighting Mood Switcher */}
            <div className="pointer-events-auto flex items-center gap-1 bg-slate-950/80 backdrop-blur-md border border-white/12 rounded-xl p-1 shadow-lg">
              <Sun className="w-3.5 h-3.5 text-amber-400 ml-1.5 mr-0.5 hidden sm:block" />
              {([
                { id: 'warm', label: 'Warm Den' },
                { id: 'museum', label: 'Museum' },
                { id: 'cyber', label: 'Cyber' },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  data-testid={`lighting-mood-${m.id}`}
                  onClick={() => setLightingMood(m.id)}
                  className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer ${
                    lightingMood === m.id
                      ? m.id === 'warm'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : m.id === 'cyber'
                        ? 'bg-fuchsia-600 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-950 shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Compact Controls Hint */}
            <div className="hidden xl:flex bg-slate-950/75 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/10 text-[10px] text-slate-300 items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>
                <strong>Drag</strong> orbit • <strong>Click shelf box</strong> swap • <strong>Double-click</strong> lift
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Status / Selection Bar */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-2 text-xs flex items-center justify-between">
        {selectedComicId ? (
          (() => {
            const comic = comics.find((c) => c.id === selectedComicId);
            return comic ? (
              <div className="flex items-center gap-2 truncate">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{comic.title || comic.fullTitle || comic.seriesName || 'Untitled Comic'}</span>
                <span className="text-slate-500 dark:text-slate-400">#{comic.issueNumber} ({comic.publicationYear})</span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                  • {isComicPulled ? 'Currently pulled out for inspection' : 'Sitting in box'}
                </span>
                {comic.coverImageFull && onViewFullArt && (
                  <button
                    type="button"
                    onClick={() => onViewFullArt(comic)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 ml-2 cursor-pointer transition-colors"
                    title="View Full Wraparound Cover Art"
                  >
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>View Full Art Spread</span>
                  </button>
                )}
              </div>
            ) : null;
          })()
        ) : (
          <div className="text-slate-500 dark:text-slate-400 text-[11px]">
            Click on any comic in the box to inspect details in 3D
          </div>
        )}

        <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium shrink-0 ml-4">
          Orbit 3D View
        </div>
      </div>
    </div>
  );
};

export default Box3DVisualizer;

