/**
 * Box3DVisualizer Component
 * 
 * Main React component for rendering a 3D visualization of comics in a storage box.
 * Manages Three.js lifecycle, OrbitControls, state, and event handling.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { ComicBook, StorageBox } from '../types';
import {
  createBoxStack,
  buildBoxStackMeshes,
  calculateCameraPosition,
  updateComicHighlight,
  pickComicFromRay,
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
  SceneContext,
} from '../utils/three-scene';
import { 
  ChevronLeft, 
  RotateCcw, 
  X, 
  Zap, 
  ArrowDownToLine, 
  ChevronRight, 
  HelpCircle 
} from 'lucide-react';
import { createComicPuller, ComicPuller } from '../utils/comic-puller';
import { preloadComicTextures, clearTextureCache } from '../utils/three-textures';

export interface Box3DVisualizerProps {
  box: StorageBox;
  comics: ComicBook[];
  onSelectComic?: (comic: ComicBook) => void;
  onClose?: () => void;
  highlightedComicId?: string;
}

export const Box3DVisualizer: React.FC<Box3DVisualizerProps> = ({
  box,
  comics,
  onSelectComic,
  onClose,
  highlightedComicId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneContextRef = useRef<SceneContext | null>(null);
  const boxStackRef = useRef<BoxStack | null>(null);
  const comicMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
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

      // Initialize scene context (camera, renderer, controls, lights)
      const sceneContext = initializeScene(canvas);
      sceneContextRef.current = sceneContext;
      raycasterRef.current = createRaycaster();

      // Build box stack geometry from comics
      const boxStack = createBoxStack(box, comics, highlightedComicId);
      boxStackRef.current = boxStack;

      // Generate Three.js meshes (storage box container + comics)
      const meshGroup = buildBoxStackMeshes(boxStack, box);

      // Store comic meshes for interaction
      comicMeshesRef.current.clear();
      meshGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && (child.userData as any).comicId) {
          const comicId = (child.userData as any).comicId;
          comicMeshesRef.current.set(comicId, child);
        }
      });

      // Add to scene
      addBoxStackToScene(sceneContext, meshGroup);

      // Position camera at optimal 3/4 elevated angle looking into the box
      const cameraPos = calculateCameraPosition(boxStack);
      sceneContext.camera.position.copy(cameraPos);
      sceneContext.camera.lookAt(0, 0, 0);
      sceneContext.controls.target.set(0, 0, 0);
      sceneContext.controls.update();

      // Setup animation loop
      const stopAnimation = setupAnimationLoop(sceneContext, (delta: number) => {
        pullerRef.current?.update(delta);
      });
      cleanupRef.current = stopAnimation;

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
   * Handle canvas resize
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    const sceneContext = sceneContextRef.current;

    if (!canvas || !sceneContext) return;

    const resizeObserver = new ResizeObserver(() => {
      handleWindowResize(sceneContext, canvas);
    });

    resizeObserver.observe(canvas);

    return () => resizeObserver.disconnect();
  }, []);

  /**
   * Pointer down: record start coordinate to differentiate drags from clicks
   */
  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointerDownPosRef.current = { x: event.clientX, y: event.clientY };
    isDraggingRef.current = false;
  };

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
    const picked = pickComicFromRay(raycaster, meshArray);
    canvas.style.cursor = picked ? 'pointer' : 'grab';
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
      }
    },
    [comics, onSelectComic]
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

    // Apply new highlight
    if (highlightId) {
      const mesh = comicMeshesRef.current.get(highlightId);
      if (mesh) {
        updateComicHighlight(mesh, true);
        setIsComicPulled(pullerRef.current?.isSettled(highlightId) || false);
      }
    } else {
      setIsComicPulled(false);
    }

    previousHighlightRef.current = highlightId || null;
  }, [highlightedComicId, selectedComicId]);

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
   * Navigate to previous comic in box
   */
  const handlePrevComic = () => {
    if (comics.length === 0) return;
    const currentIndex = comics.findIndex((c) => c.id === selectedComicId);
    const prevIndex = currentIndex <= 0 ? comics.length - 1 : currentIndex - 1;
    const target = comics[prevIndex];
    if (target) {
      setSelectedComicId(target.id);
      if (onSelectComic) onSelectComic(target);

      // Auto pull newly selected comic
      const mesh = comicMeshesRef.current.get(target.id);
      if (mesh) {
        pullerRef.current?.pullComic(target.id, mesh);
        setIsComicPulled(true);
      }
    }
  };

  /**
   * Navigate to next comic in box
   */
  const handleNextComic = () => {
    if (comics.length === 0) return;
    const currentIndex = comics.findIndex((c) => c.id === selectedComicId);
    const nextIndex = currentIndex === -1 || currentIndex >= comics.length - 1 ? 0 : currentIndex + 1;
    const target = comics[nextIndex];
    if (target) {
      setSelectedComicId(target.id);
      if (onSelectComic) onSelectComic(target);

      // Auto pull newly selected comic
      const mesh = comicMeshesRef.current.get(target.id);
      if (mesh) {
        pullerRef.current?.pullComic(target.id, mesh);
        setIsComicPulled(true);
      }
    }
  };

  /**
   * Reset camera to optimal 3/4 default view
   */
  const handleResetCamera = () => {
    const sceneContext = sceneContextRef.current;
    const boxStack = boxStackRef.current;

    if (!sceneContext || !boxStack) return;

    const cameraPos = calculateCameraPosition(boxStack);
    sceneContext.camera.position.copy(cameraPos);
    sceneContext.controls.target.set(0, 0, 0);
    sceneContext.controls.update();
  };

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center max-w-md">
          <p className="text-red-600 font-semibold mb-2 text-lg">Failed to initialize 3D view</p>
          <p className="text-sm text-slate-600 mb-4">{error}</p>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm hover:bg-slate-700"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-slate-100 flex flex-col select-none">
      {/* Top Controls Header */}
      <div className="flex items-center justify-between bg-white border-b border-slate-200 px-4 py-2.5 z-10 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition-colors"
              title="Close 3D View"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 truncate text-sm sm:text-base">
                {box.name}
              </h2>
              {boxStackRef.current?.isOverCapacity ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold shrink-0">
                  Over Capacity
                </span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium shrink-0">
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
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 mr-1">
              <button
                onClick={handlePrevComic}
                className="p-1.5 hover:bg-white rounded text-slate-600 hover:text-slate-900 transition-colors"
                title="Previous Comic in Box"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextComic}
                className="p-1.5 hover:bg-white rounded text-slate-600 hover:text-slate-900 transition-colors"
                title="Next Comic in Box"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Pull / Return Toggle Button */}
          {selectedComicId && (
            <button
              onClick={handleTogglePull}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isComicPulled
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
              }`}
              title={isComicPulled ? 'Slide back into box' : 'Lift comic out of box to inspect'}
            >
              {isComicPulled ? (
                <>
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  <span>Return</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Pull Comic</span>
                </>
              )}
            </button>
          )}

          {/* Reset Camera Button */}
          <button
            onClick={handleResetCamera}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
            title="Reset 3D Camera to Default Angle"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors ml-1"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 3D Canvas Area */}
      <div className="flex-1 relative overflow-hidden bg-slate-100">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-20 backdrop-blur-xs">
            <div className="text-center">
              <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-blue-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">Loading 3D box view...</p>
            </div>
          </div>
        )}

        {comics.length === 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-xs px-4 py-2 rounded-full shadow-md z-10 text-xs font-medium text-slate-600 border border-slate-200">
            This box is empty. Assign comics to see them in 3D!
          </div>
        )}

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onClick={handleCanvasClick}
          className="w-full h-full block cursor-grab active:cursor-grabbing"
        />

        {/* Floating Hint Overlay */}
        <div className="absolute bottom-3 left-3 bg-white/85 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-xs border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2 pointer-events-none">
          <HelpCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span>
            <strong>Drag</strong> to rotate • <strong>Scroll</strong> to zoom • <strong>Click</strong> to select • <strong>Double-click</strong> to lift comic
          </span>
        </div>
      </div>

      {/* Bottom Status / Selection Bar */}
      <div className="bg-white border-t border-slate-200 px-4 py-2 text-xs flex items-center justify-between">
        {selectedComicId ? (
          (() => {
            const comic = comics.find((c) => c.id === selectedComicId);
            return comic ? (
              <div className="flex items-center gap-2 truncate">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="font-bold text-slate-900 truncate">{comic.title}</span>
                <span className="text-slate-500">#{comic.issueNumber} ({comic.publicationYear})</span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  • {isComicPulled ? 'Currently pulled out for inspection' : 'Sitting in box'}
                </span>
              </div>
            ) : null;
          })()
        ) : (
          <div className="text-slate-500 text-[11px]">
            Click on any comic in the box to inspect details in 3D
          </div>
        )}

        <div className="text-[11px] text-slate-400 font-medium shrink-0 ml-4">
          Orbit 3D View
        </div>
      </div>
    </div>
  );
};

export default Box3DVisualizer;

