/**
 * Three.js Geometry Utilities for Comic Box Visualizer
 * 
 * Handles 3D model generation for comic books and their storage boxes.
 * Comics are modeled as vertical books stacked front-to-back inside an open storage box.
 */

import * as THREE from 'three';
import { ComicBook, StorageBox } from '../types';
import { createComicFaceMaterials } from './three-textures';
import { createCorrugatedCardboardTexture } from './three-room';

/**
 * Physical dimensions for standard American comic books (normalized)
 * Standard comic: 6.75" W x 10.25" H x ~0.15" D (bagged & boarded)
 * Aspect ratio 10.25 / 6.75 = ~1.518
 */
export const COMIC_DIMENSIONS = {
  WIDTH: 2.4,           // Normalized width
  HEIGHT: 3.65,         // Normalized height (portrait aspect ratio)
  UNIT_THICKNESS: 0.06, // Thickness per 1.0 sizeThickness unit
  MIN_THICKNESS: 0.04,  // Clamped minimum thickness for rendering
};

/**
 * Storage box proportions
 */
export const BOX_DIMENSIONS = {
  PADDING: 0.25,        // Breathing room inside box walls
  WALL_THICKNESS: 0.08, // Cardboard wall thickness
};

/**
 * ComicGeometry describes a single comic's 3D properties
 */
export interface ComicGeometry {
  id: string;
  title: string;
  comic: ComicBook;
  position: THREE.Vector3;
  thickness: number;
  geometry: THREE.BoxGeometry;
  material: THREE.Material | THREE.Material[];
  mesh?: THREE.Mesh;
  coverUrl?: string;
  highlighted: boolean;
}

/**
 * BoxStack represents all geometry for a storage box's contents
 */
export interface BoxStack {
  boxId: number;
  boxName: string;
  innerDimensions: {
    width: number;
    depth: number;
    height: number;
  };
  comics: ComicGeometry[];
  totalThickness: number;
  isOverCapacity: boolean;
}

/**
 * Calculate the thickness value for a comic, with safeguards
 */
export function normalizeThickness(thickness: number | undefined): number {
  if (!thickness || thickness <= 0) return 1.0;
  return Math.max(0.2, Math.min(thickness, 8.0));
}

/**
 * Calculate inner dimensions of a storage box based on capacity
 */
export function calculateBoxInnerDimensions(boxCapacityUnits: number): {
  width: number;
  depth: number;
  height: number;
} {
  const capacity = Math.max(boxCapacityUnits || 150, 20);
  const width = COMIC_DIMENSIONS.WIDTH + BOX_DIMENSIONS.PADDING * 2;
  // Box height slightly lower than comic tops so bags/boards peek out
  const height = COMIC_DIMENSIONS.HEIGHT * 0.88;
  const depth = Math.max(capacity * COMIC_DIMENSIONS.UNIT_THICKNESS + BOX_DIMENSIONS.PADDING * 2, 4.0);

  return { width, depth, height };
}

/**
 * Create BoxGeometry for a single comic book
 */
export function createComicGeometry(thickness: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(
    COMIC_DIMENSIONS.WIDTH,
    COMIC_DIMENSIONS.HEIGHT,
    thickness
  );
}

/**
 * Create a front box label texture with box name and capacity
 */
function createBoxLabelTexture(boxName: string, boxId: number, capacity: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // White label plate with subtle border
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 256);

    ctx.lineWidth = 12;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeRect(10, 10, 492, 236);

    // Header bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(10, 10, 492, 54);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`BOX #${boxId}`, 256, 48);

    // Box Name
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 36px system-ui, sans-serif';
    
    // Truncate name if long
    let displayName = boxName;
    if (displayName.length > 22) {
      displayName = displayName.substring(0, 20) + '...';
    }
    ctx.fillText(displayName, 256, 130);

    // Capacity subtitle
    ctx.fillStyle = '#64748b';
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText(`CAPACITY: ${capacity} COMICS`, 256, 185);

    // Decorative barcode
    ctx.fillStyle = '#94a3b8';
    for (let x = 60; x < 452; x += 12) {
      const barW = (x % 24 === 0) ? 6 : 3;
      ctx.fillRect(x, 210, barW, 20);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Build 3D mesh representation of the storage box (bottom and 4 walls)
 */
export function buildStorageBoxMesh(
  box: StorageBox,
  innerDimensions: { width: number; depth: number; height: number }
): THREE.Group {
  const boxGroup = new THREE.Group();
  const { width: iw, depth: id, height: ih } = innerDimensions;
  const wt = BOX_DIMENSIONS.WALL_THICKNESS;

  const colorHex = box.colorTag || '#3b82f6';
  const cardboardTex = createCorrugatedCardboardTexture(colorHex);

  // Corrugated cardboard outer material tinted by box.colorTag
  const outerMaterial = new THREE.MeshStandardMaterial({
    map: cardboardTex,
    roughness: 0.78,
    metalness: 0.06,
  });

  const wallMat = outerMaterial;

  // 1. Bottom Floor
  const floorGeo = new THREE.BoxGeometry(iw + wt * 2, wt, id + wt * 2);
  const floorMesh = new THREE.Mesh(floorGeo, wallMat);
  floorMesh.position.set(0, -ih / 2 - wt / 2, 0);
  floorMesh.receiveShadow = true;
  boxGroup.add(floorMesh);

  // 2. Left Wall (-X)
  const leftGeo = new THREE.BoxGeometry(wt, ih, id + wt * 2);
  const leftMesh = new THREE.Mesh(leftGeo, wallMat);
  leftMesh.position.set(-iw / 2 - wt / 2, 0, 0);
  leftMesh.castShadow = true;
  leftMesh.receiveShadow = true;
  boxGroup.add(leftMesh);

  // 3. Right Wall (+X)
  const rightGeo = new THREE.BoxGeometry(wt, ih, id + wt * 2);
  const rightMesh = new THREE.Mesh(rightGeo, wallMat);
  rightMesh.position.set(iw / 2 + wt / 2, 0, 0);
  rightMesh.castShadow = true;
  rightMesh.receiveShadow = true;
  boxGroup.add(rightMesh);

  // 4. Back Wall (-Z)
  const backGeo = new THREE.BoxGeometry(iw, ih, wt);
  const backMesh = new THREE.Mesh(backGeo, wallMat);
  backMesh.position.set(0, 0, -id / 2 - wt / 2);
  backMesh.castShadow = true;
  backMesh.receiveShadow = true;
  boxGroup.add(backMesh);

  // 5. Front Wall (+Z)
  const frontGeo = new THREE.BoxGeometry(iw, ih, wt);
  const frontMesh = new THREE.Mesh(frontGeo, wallMat);
  frontMesh.position.set(0, 0, id / 2 + wt / 2);
  frontMesh.castShadow = true;
  frontMesh.receiveShadow = true;
  boxGroup.add(frontMesh);

  // 6. Front Label Plate
  const labelWidth = Math.min(iw * 0.75, 2.0);
  const labelHeight = labelWidth * 0.5;
  const labelGeo = new THREE.PlaneGeometry(labelWidth, labelHeight);
  const labelTexture = createBoxLabelTexture(box.name, box.id, box.maxCapacity);
  const labelMat = new THREE.MeshStandardMaterial({
    map: labelTexture,
    roughness: 0.6,
    metalness: 0.1,
  });
  const labelMesh = new THREE.Mesh(labelGeo, labelMat);
  labelMesh.position.set(0, -0.18, id / 2 + wt + 0.012);
  boxGroup.add(labelMesh);

  // 7. Recessed Oval Hand-Grip Cutouts on Front & Back Walls
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x0a0d14,
    roughness: 0.95,
    metalness: 0.05,
  });
  const handleGeo = new THREE.BoxGeometry(0.95, 0.28, 0.03);
  const frontHandle = new THREE.Mesh(handleGeo, handleMat);
  frontHandle.position.set(0, ih / 2 - 0.42, id / 2 + wt + 0.005);
  boxGroup.add(frontHandle);

  const backHandle = new THREE.Mesh(handleGeo, handleMat);
  backHandle.position.set(0, ih / 2 - 0.42, -id / 2 - wt - 0.005);
  boxGroup.add(backHandle);

  return boxGroup;
}

/**
 * Create a crisp archival white plastic series divider tab texture
 */
function createDividerTabTexture(seriesLabel: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 252, 60);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const upper = seriesLabel.toUpperCase();
    const trimmed = upper.length > 16 ? `${upper.slice(0, 15)}…` : upper;
    ctx.fillText(trimmed, 128, 40);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build a BoxStack from a storage box and its ordered comics
 */
export function createBoxStack(
  box: StorageBox,
  comics: ComicBook[],
  highlightedComicId?: string
): BoxStack {
  const innerDimensions = calculateBoxInnerDimensions(box.maxCapacity);

  const comicGeometries: ComicGeometry[] = [];
  let totalThickness = 0;

  // Comic Y-position: comics stand on the bottom floor of the box
  const floorY = -innerDimensions.height / 2;
  const comicCenterY = floorY + COMIC_DIMENSIONS.HEIGHT / 2;

  // Comics stack from FRONT (+Z) towards BACK (-Z)
  let currentFrontZ = innerDimensions.depth / 2 - BOX_DIMENSIONS.PADDING;

  for (let i = 0; i < comics.length; i++) {
    const comic = comics[i];
    const thicknessMultiplier = normalizeThickness(comic.sizeThickness);
    totalThickness += thicknessMultiplier;

    const thickness = Math.max(
      thicknessMultiplier * COMIC_DIMENSIONS.UNIT_THICKNESS,
      COMIC_DIMENSIONS.MIN_THICKNESS
    );

    // Comic center Z is offset backward by half its thickness
    const comicZ = currentFrontZ - thickness / 2;
    const position = new THREE.Vector3(0, comicCenterY, comicZ);

    const geometry = createComicGeometry(thickness);
    // Materials for all 6 faces (face 4 is front cover art with async image loader)
    const material = createComicFaceMaterials(comic);

    const highlighted = comic.id === highlightedComicId;

    const comicGeo: ComicGeometry = {
      id: comic.id,
      title: comic.title,
      comic,
      position,
      thickness,
      geometry,
      material,
      coverUrl: comic.coverImage,
      highlighted,
    };

    comicGeometries.push(comicGeo);

    // Move next comic position backward, plus a tiny separation gap
    currentFrontZ -= (thickness + 0.004);
  }

  const isOverCapacity = totalThickness > box.maxCapacity;

  return {
    boxId: box.id,
    boxName: box.name,
    innerDimensions,
    comics: comicGeometries,
    totalThickness,
    isOverCapacity,
  };
}

/**
 * Create Three.js meshes from a BoxStack (including storage box body and comics)
 */
export function buildBoxStackMeshes(stack: BoxStack, box?: StorageBox): THREE.Group {
  const group = new THREE.Group();

  // 1. Build the physical storage box model
  if (box) {
    const boxMesh = buildStorageBoxMesh(box, stack.innerDimensions);
    group.add(boxMesh);
  }

  // 2. Build comic meshes & automatic Series Divider Tabs
  const dividerMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.45,
    metalness: 0.05,
  });
  const dividerBodyGeo = new THREE.BoxGeometry(COMIC_DIMENSIONS.WIDTH + 0.06, COMIC_DIMENSIONS.HEIGHT + 0.04, 0.015);
  const dividerTabGeo = new THREE.BoxGeometry(0.92, 0.28, 0.018);

  let lastSeriesKey = '';
  let dividerCount = 0;
  const MAX_DIVIDERS = 24;

  for (let i = 0; i < stack.comics.length; i++) {
    const comicGeo = stack.comics[i];
    const seriesLabel = (comicGeo.comic.seriesName || comicGeo.comic.title || '').trim();
    const seriesKey = seriesLabel.toLowerCase();

    // Insert archival series divider tab whenever the series changes (grouped so it leans with the stack)
    if (seriesKey && seriesKey !== lastSeriesKey && dividerCount < MAX_DIVIDERS) {
      lastSeriesKey = seriesKey;
      const tabSlot = dividerCount % 3; // stagger left (-0.7), center (0), right (+0.7)
      const tabOffsetX = (tabSlot - 1) * 0.72;
      const dividerZ = comicGeo.position.z + comicGeo.thickness / 2 + 0.012;

      const dividerGroup = new THREE.Group();
      dividerGroup.position.set(0, comicGeo.position.y + 0.02, dividerZ);
      dividerGroup.userData = {
        isDivider: true,
        stackIndex: i,
        basePosition: dividerGroup.position.clone(),
        targetFlipRotX: 0,
        targetFlipOffsetZ: 0,
      };

      const divMesh = new THREE.Mesh(dividerBodyGeo, dividerMat);
      divMesh.position.set(0, 0, 0);
      dividerGroup.add(divMesh);

      const tabTex = createDividerTabTexture(seriesLabel);
      const tabFaceMat = new THREE.MeshStandardMaterial({
        map: tabTex,
        roughness: 0.4,
        metalness: 0.05,
      });
      const tabMesh = new THREE.Mesh(dividerTabGeo, [
        dividerMat,
        dividerMat,
        dividerMat,
        dividerMat,
        tabFaceMat,
        tabFaceMat,
      ]);
      tabMesh.position.set(tabOffsetX, COMIC_DIMENSIONS.HEIGHT / 2 + 0.12, 0);
      dividerGroup.add(tabMesh);

      group.add(dividerGroup);
      dividerCount++;
    }

    const mesh = new THREE.Mesh(comicGeo.geometry, comicGeo.material);
    mesh.position.copy(comicGeo.position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Attach metadata for interaction & animations
    (mesh.userData as any).comicId = comicGeo.id;
    (mesh.userData as any).comicTitle = comicGeo.title;
    (mesh.userData as any).comic = comicGeo.comic;
    (mesh.userData as any).stackIndex = i;
    (mesh.userData as any).basePosition = comicGeo.position.clone();
    (mesh.userData as any).baseRotation = new THREE.Euler(0, 0, 0);
    (mesh.userData as any).targetFlipRotX = 0;
    (mesh.userData as any).targetFlipOffsetZ = 0;

    if (comicGeo.highlighted) {
      updateComicHighlight(mesh, true);
    }

    group.add(mesh);
  }

  return group;
}

/**
 * Helper to compute clamped lean angle & Z offset for an item at stackIndex
 * so the entire front stack leans forward and entire back stack leans backward
 * without ever clipping through the front or back box walls.
 */
function computeClampedStackLean(
  itemIndex: number,
  focusedIndex: number,
  baseZ: number,
  halfThickness: number,
  maxFrontZ: number,
  minBackZ: number,
  isDivider: boolean
): { rotX: number; offsetZ: number } {
  if (focusedIndex < 0) return { rotX: 0, offsetZ: 0 };

  const halfHeight = COMIC_DIMENSIONS.HEIGHT / 2 + (isDivider ? 0.14 : 0);

  // Entire front stack (items in front of focusedIndex) leans forward (+rotateX)
  // Note: a divider at stackIndex === focusedIndex sits right in front of the focused comic, so it leans forward too!
  const isFrontSide = isDivider ? itemIndex <= focusedIndex : itemIndex < focusedIndex;
  const isBackSide = itemIndex > focusedIndex;

  if (isFrontSide) {
    const dist = Math.max(1, focusedIndex - itemIndex);
    // Gentle broad taper across the whole front stack (keeps strong lean across ~25+ issues)
    const weight = Math.max(0.28, 1 / (1 + (dist - 1) * 0.06));
    const desiredRotX = 0.22 * weight;
    const desiredOffZ = 0.16 * weight;
    const availFront = Math.max(0, maxFrontZ - (baseZ + halfThickness));

    const maxAllowedSin = Math.min(1, Math.max(0, (availFront * 0.78) / halfHeight));
    const clampedRotX = Math.min(desiredRotX, Math.asin(maxAllowedSin));
    const usedByRot = halfHeight * Math.sin(clampedRotX);
    const clampedOffZ = Math.min(desiredOffZ, Math.max(0, availFront - usedByRot));

    return { rotX: clampedRotX, offsetZ: clampedOffZ };
  }

  if (isBackSide) {
    const dist = itemIndex - focusedIndex;
    const weight = Math.max(0.28, 1 / (1 + (dist - 1) * 0.06));
    const desiredRotX = 0.2 * weight;
    const desiredOffZ = 0.14 * weight;
    const availBack = Math.max(0, (baseZ - halfThickness) - minBackZ);

    const maxAllowedSin = Math.min(1, Math.max(0, (availBack * 0.78) / halfHeight));
    const clampedRotX = Math.min(desiredRotX, Math.asin(maxAllowedSin));
    const usedByRot = halfHeight * Math.sin(clampedRotX);
    const clampedOffZ = Math.min(desiredOffZ, Math.max(0, availBack - usedByRot));

    return { rotX: -clampedRotX, offsetZ: -clampedOffZ };
  }

  return { rotX: 0, offsetZ: 0 };
}

/**
 * Sets target parting lean across the ENTIRE front and back comic stacks + series divider tabs,
 * mathematically clamped against the inner front/back walls of the box so nothing clips!
 */
export function setShortboxFlipTargets(
  comicMeshes: Map<string, THREE.Mesh>,
  dividerGroups: THREE.Group[],
  orderedComics: ComicBook[],
  focusedIndex: number,
  innerDepth?: number
): void {
  const maxFrontZ = innerDepth != null ? innerDepth / 2 - 0.06 : Infinity;
  const minBackZ = innerDepth != null ? -innerDepth / 2 + 0.06 : -Infinity;

  for (let i = 0; i < orderedComics.length; i++) {
    const mesh = comicMeshes.get(orderedComics[i].id);
    if (!mesh) continue;
    const basePos = (mesh.userData as any).basePosition as THREE.Vector3 | undefined;
    if (!basePos) continue;
    const halfThickness =
      (Number((mesh.userData as any).comic?.sizeThickness || 1) * COMIC_DIMENSIONS.UNIT_THICKNESS) / 2;

    const { rotX, offsetZ } = computeClampedStackLean(
      i,
      focusedIndex,
      basePos.z,
      halfThickness,
      maxFrontZ,
      minBackZ,
      false
    );
    (mesh.userData as any).targetFlipRotX = rotX;
    (mesh.userData as any).targetFlipOffsetZ = offsetZ;
  }

  // Lean all series divider tabs right along with the stack
  for (const divGroup of dividerGroups) {
    const basePos = (divGroup.userData as any).basePosition as THREE.Vector3 | undefined;
    const stackIndex = Number((divGroup.userData as any).stackIndex ?? -1);
    if (!basePos || stackIndex < 0) continue;

    const { rotX, offsetZ } = computeClampedStackLean(
      stackIndex,
      focusedIndex,
      basePos.z,
      0.01,
      maxFrontZ,
      minBackZ,
      true
    );
    (divGroup.userData as any).targetFlipRotX = rotX;
    (divGroup.userData as any).targetFlipOffsetZ = offsetZ;
  }
}

/**
 * Smoothly interpolates shortbox parting tilt every animation frame (comics + series dividers)
 */
export function stepShortboxFlipParting(
  comicMeshes: Map<string, THREE.Mesh>,
  dividerGroups: THREE.Group[],
  delta: number
): void {
  const lerpAlpha = Math.min(1, delta * 10);

  comicMeshes.forEach((mesh) => {
    if ((mesh.userData as any).isPulled) return;
    const basePos = (mesh.userData as any).basePosition as THREE.Vector3 | undefined;
    if (!basePos) return;
    const targetRotX = Number((mesh.userData as any).targetFlipRotX || 0);
    const targetOffZ = Number((mesh.userData as any).targetFlipOffsetZ || 0);
    mesh.rotation.x += (targetRotX - mesh.rotation.x) * lerpAlpha;
    const desiredZ = basePos.z + targetOffZ;
    mesh.position.z += (desiredZ - mesh.position.z) * lerpAlpha;
  });

  for (const divGroup of dividerGroups) {
    const basePos = (divGroup.userData as any).basePosition as THREE.Vector3 | undefined;
    if (!basePos) continue;
    const targetRotX = Number((divGroup.userData as any).targetFlipRotX || 0);
    const targetOffZ = Number((divGroup.userData as any).targetFlipOffsetZ || 0);
    divGroup.rotation.x += (targetRotX - divGroup.rotation.x) * lerpAlpha;
    const desiredZ = basePos.z + targetOffZ;
    divGroup.position.z += (desiredZ - divGroup.position.z) * lerpAlpha;
  }
}

/**
 * Calculate camera position for an elevated 3/4 perspective view into the box
 */
export function calculateCameraPosition(stack: BoxStack): THREE.Vector3 {
  const { innerDimensions } = stack;

  const cameraX = innerDimensions.width * 1.6;
  const cameraY = innerDimensions.height * 1.6;
  const cameraZ = innerDimensions.depth / 2 + 5.5;

  return new THREE.Vector3(cameraX, cameraY, cameraZ);
}

/**
 * Update a comic's highlight state
 */
export function updateComicHighlight(
  mesh: THREE.Mesh,
  shouldHighlight: boolean
): void {
  const basePos = (mesh.userData as any).basePosition as THREE.Vector3 | undefined;
  if (!basePos) return;

  if (shouldHighlight) {
    // Lift up slightly out of stack for tactile feedback
    mesh.position.y = basePos.y + 0.35;
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => {
        if ('emissive' in m) {
          (m as THREE.MeshStandardMaterial).emissive.setHex(0x222233);
        }
      });
    } else if ('emissive' in mesh.material) {
      (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x222233);
    }
  } else {
    // Return to base position if not actively pulled by ComicPuller
    if (!(mesh.userData as any).isPulled) {
      mesh.position.y = basePos.y;
    }
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => {
        if ('emissive' in m) {
          (m as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        }
      });
    } else if ('emissive' in mesh.material) {
      (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
    }
  }
}

/**
 * Raycaster helper for picking comics with mouse/touch
 */
export function pickComicFromRay(
  raycaster: THREE.Raycaster,
  meshes: THREE.Mesh[]
): THREE.Mesh | null {
  const intersects = raycaster.intersectObjects(meshes, false);
  return intersects.length > 0 ? (intersects[0].object as THREE.Mesh) : null;
}

