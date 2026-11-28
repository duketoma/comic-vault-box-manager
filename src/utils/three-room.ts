/**
 * Three.js 3D Collector's Vault Room Environment
 *
 * Builds the procedural 3D room around the active storage box:
 * - Walnut wood collector's inspection table with archival cutting mat
 * - Removable matching cardboard box lid resting beside the box
 * - Steel-and-wood LED-lit background shelving rack holding all user StorageBoxes (clickable to swap)
 * - Vault backdrop wall, floor, and framed Grail comic posters using real high-value cover art
 */

import * as THREE from 'three';
import { ComicBook, StorageBox } from '../types';
import {
  createProceduralCoverTexture,
  fetchImageAsTexture,
  resolveCoverImageUrl,
} from './three-textures';

export type VaultLightingMood = 'warm' | 'museum' | 'cyber';

export interface VaultRoomHandles {
  group: THREE.Group;
  shelfBoxMeshes: THREE.Mesh[];
  occluderMeshes: THREE.Object3D[];
  ledStripMaterials: THREE.MeshStandardMaterial[];
  grailSpotLights: THREE.SpotLight[];
  wallMaterial: THREE.MeshStandardMaterial;
  floorMaterial: THREE.MeshStandardMaterial;
  activeSlotGlowMat: THREE.MeshBasicMaterial | null;
}

/**
 * Procedural dark walnut wood grain texture for inspection table & shelf planks
 */
export function createWalnutWoodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Rich dark walnut base
    ctx.fillStyle = '#3b2416';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle horizontal wood grain fibers
    for (let y = 0; y < 512; y += 2) {
      const wave = Math.sin(y * 0.045) * 14 + Math.cos(y * 0.13) * 6;
      const shade = 44 + Math.round((Math.sin(y * 0.09 + wave * 0.1) + 1) * 14);
      const r = Math.min(92, shade + 18);
      const g = Math.min(62, Math.round(shade * 0.66));
      const b = Math.min(44, Math.round(shade * 0.42));
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(0, y, 512, 2);
    }

    // Subtle plank seams
    ctx.fillStyle = 'rgba(18, 9, 4, 0.32)';
    for (const seamY of [128, 256, 384]) {
      ctx.fillRect(0, seamY, 512, 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

/**
 * Procedural matte archival cutting mat texture with subtle collector grid
 */
export function createArchivalMatTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#18202c';
    ctx.fillRect(0, 0, 512, 512);

    // Fine archival grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    for (let i = 32; i < 512; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 16);
      ctx.lineTo(i, 496);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(16, i);
      ctx.lineTo(496, i);
      ctx.stroke();
    }

    // Outer border rule
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 16, 480, 480);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Procedural corrugated cardboard texture tinted with box.colorTag
 */
export function createCorrugatedCardboardTexture(colorHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle vertical corrugated fluting ribs
    for (let x = 0; x < 256; x += 4) {
      ctx.fillStyle = x % 8 === 0 ? 'rgba(255, 255, 255, 0.055)' : 'rgba(0, 0, 0, 0.055)';
      ctx.fillRect(x, 0, 2, 256);
    }

    // Subtle matte fiber speckles
    for (let i = 0; i < 650; i++) {
      const rx = (i * 73) % 256;
      const ry = (i * 139) % 256;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
      ctx.fillRect(rx, ry, 2, 2);
    }

    // Soft edge shading
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(255,255,255,0.08)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Crisp miniature front label texture for boxes sitting on the background shelf rack
 */
function createShelfBoxLabelTexture(box: StorageBox): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 128);

    ctx.lineWidth = 6;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeRect(5, 5, 246, 118);

    // Color-coded top stripe
    ctx.fillStyle = box.colorTag || '#3b82f6';
    ctx.fillRect(8, 8, 240, 34);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`BOX #${box.id}`, 128, 32);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px system-ui, sans-serif';
    const cleanName = (box.name || `Box ${box.id}`).replace(/^Box\s*#?\d+\s*[-–:]?\s*/i, '').trim() || box.name;
    const displayName = cleanName.length > 18 ? `${cleanName.slice(0, 16)}…` : cleanName;
    ctx.fillText(displayName, 128, 82);

    ctx.fillStyle = '#64748b';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${box.maxCapacity || 150} UNITS`, 128, 108);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Creates a small label texture for the empty shelf slot where the active box was pulled from
 */
function createOnTableSlotTexture(boxId: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, 256, 96);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(6, 6, 244, 84);

    ctx.fillStyle = '#e0f2fe';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`BOX #${boxId}`, 128, 42);

    ctx.fillStyle = '#7dd3fc';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText('ON INSPECTION TABLE', 128, 70);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Build the complete 3D Collector's Vault Room surrounding the active storage box
 */
export function buildVaultRoomEnvironment(options: {
  activeBox: StorageBox;
  allBoxes: StorageBox[];
  boxInnerDimensions: { width: number; depth: number; height: number };
  boxWallThickness: number;
  grailComics?: ComicBook[];
  mood?: VaultLightingMood;
}): VaultRoomHandles {
  const {
    activeBox,
    allBoxes,
    boxInnerDimensions,
    boxWallThickness,
    grailComics = [],
    mood = 'warm',
  } = options;

  const group = new THREE.Group();
  group.name = 'VaultRoomEnvironment';

  const shelfBoxMeshes: THREE.Mesh[] = [];
  const occluderMeshes: THREE.Object3D[] = [];
  const ledStripMaterials: THREE.MeshStandardMaterial[] = [];
  const grailSpotLights: THREE.SpotLight[] = [];
  let activeSlotGlowMat: THREE.MeshBasicMaterial | null = null;

  // Flush Y coordinate right underneath the active box bottom floor
  const tableTopY = -boxInnerDimensions.height / 2 - boxWallThickness;
  const floorY = tableTopY - 5.6;

  // Shared procedural textures
  const walnutTex = createWalnutWoodTexture();
  const walnutMat = new THREE.MeshStandardMaterial({
    map: walnutTex,
    roughness: 0.42,
    metalness: 0.08,
  });

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x1e2430,
    roughness: 0.38,
    metalness: 0.72,
  });

  // ============================================================================
  // 1. WALNUT INSPECTION TABLE & ARCHIVAL CUTTING MAT
  // ============================================================================
  const tableWidth = Math.max(15.5, boxInnerDimensions.width + 11.0);
  const tableDepth = Math.max(11.5, boxInnerDimensions.depth + 3.4);
  const tableThickness = 0.45;

  const tableTopGeo = new THREE.BoxGeometry(tableWidth, tableThickness, tableDepth);
  const tableTopMesh = new THREE.Mesh(tableTopGeo, walnutMat);
  tableTopMesh.position.set(0, tableTopY - tableThickness / 2, 0);
  tableTopMesh.receiveShadow = true;
  tableTopMesh.castShadow = true;
  group.add(tableTopMesh);
  occluderMeshes.push(tableTopMesh);

  // Subtle dark steel table apron & 4 legs
  const legHeight = tableTopY - tableThickness - floorY;
  const legGeo = new THREE.BoxGeometry(0.32, legHeight, 0.32);
  const legOffsetX = tableWidth / 2 - 0.85;
  const legOffsetZ = tableDepth / 2 - 0.85;
  const legPositions = [
    [-legOffsetX, floorY + legHeight / 2, -legOffsetZ],
    [legOffsetX, floorY + legHeight / 2, -legOffsetZ],
    [-legOffsetX, floorY + legHeight / 2, legOffsetZ],
    [legOffsetX, floorY + legHeight / 2, legOffsetZ],
  ];
  for (const [lx, ly, lz] of legPositions) {
    const leg = new THREE.Mesh(legGeo, steelMat);
    leg.position.set(lx, ly, lz);
    leg.castShadow = true;
    leg.receiveShadow = true;
    group.add(leg);
  }

  // Archival Collector Cutting Mat right beneath the active box
  const matWidth = boxInnerDimensions.width + 2.4;
  const matDepth = boxInnerDimensions.depth + 1.8;
  const matGeo = new THREE.BoxGeometry(matWidth, 0.03, matDepth);
  const matTex = createArchivalMatTexture();
  const matMaterial = new THREE.MeshStandardMaterial({
    map: matTex,
    roughness: 0.88,
    metalness: 0.04,
  });
  const matMesh = new THREE.Mesh(matGeo, matMaterial);
  matMesh.position.set(0, tableTopY + 0.015, 0);
  matMesh.receiveShadow = true;
  group.add(matMesh);

  // ============================================================================
  // 2. REMOVABLE MATCHING CARDBOARD BOX LID ON TABLE
  // ============================================================================
  const lidWidth = boxInnerDimensions.width + boxWallThickness * 2 + 0.14;
  const lidDepth = boxInnerDimensions.depth + boxWallThickness * 2 + 0.14;
  const lidHeight = 0.55;
  const lidTex = createCorrugatedCardboardTexture(activeBox.colorTag || '#3b82f6');
  const lidMat = new THREE.MeshStandardMaterial({
    map: lidTex,
    roughness: 0.78,
    metalness: 0.06,
  });

  const lidGroup = new THREE.Group();
  const lidTopGeo = new THREE.BoxGeometry(lidWidth, 0.08, lidDepth);
  const lidTop = new THREE.Mesh(lidTopGeo, lidMat);
  lidTop.position.set(0, lidHeight - 0.04, 0);
  lidTop.castShadow = true;
  lidTop.receiveShadow = true;
  lidGroup.add(lidTop);

  // 4 lid skirt rims
  const rimThick = 0.07;
  const frontBackRimGeo = new THREE.BoxGeometry(lidWidth, lidHeight, rimThick);
  const leftRightRimGeo = new THREE.BoxGeometry(rimThick, lidHeight, lidDepth);

  const rimFront = new THREE.Mesh(frontBackRimGeo, lidMat);
  rimFront.position.set(0, lidHeight / 2, lidDepth / 2 - rimThick / 2);
  rimFront.castShadow = true;
  lidGroup.add(rimFront);

  const rimBack = new THREE.Mesh(frontBackRimGeo, lidMat);
  rimBack.position.set(0, lidHeight / 2, -lidDepth / 2 + rimThick / 2);
  rimBack.castShadow = true;
  lidGroup.add(rimBack);

  const rimLeft = new THREE.Mesh(leftRightRimGeo, lidMat);
  rimLeft.position.set(-lidWidth / 2 + rimThick / 2, lidHeight / 2, 0);
  rimLeft.castShadow = true;
  lidGroup.add(rimLeft);

  const rimRight = new THREE.Mesh(leftRightRimGeo, lidMat);
  rimRight.position.set(lidWidth / 2 - rimThick / 2, lidHeight / 2, 0);
  rimRight.castShadow = true;
  lidGroup.add(rimRight);

  lidGroup.position.set(boxInnerDimensions.width / 2 + lidWidth / 2 + 1.45, tableTopY + 0.01, -0.35);
  lidGroup.rotation.y = -0.2;
  group.add(lidGroup);
  occluderMeshes.push(lidGroup);

  // ============================================================================
  // 3. VAULT ROOM FLOOR & BACK WALL
  // ============================================================================
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x0f131c,
    roughness: 0.72,
    metalness: 0.12,
  });
  const floorGeo = new THREE.PlaneGeometry(75, 75);
  const floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = floorY;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x131926,
    roughness: 0.88,
    metalness: 0.05,
  });
  const backWallZ = -14.8;
  const backWallGeo = new THREE.PlaneGeometry(75, 28);
  const backWallMesh = new THREE.Mesh(backWallGeo, wallMaterial);
  backWallMesh.position.set(0, floorY + 14, backWallZ);
  backWallMesh.receiveShadow = true;
  group.add(backWallMesh);

  // Subtle architectural baseboard
  const baseboardGeo = new THREE.BoxGeometry(75, 0.55, 0.2);
  const baseboard = new THREE.Mesh(baseboardGeo, steelMat);
  baseboard.position.set(0, floorY + 0.275, backWallZ + 0.1);
  group.add(baseboard);

  // ============================================================================
  // 4. LED-LIT BACKGROUND SHELVING RACK WITH ALL USER STORAGE BOXES
  // ============================================================================
  const rackBoxes = allBoxes.filter((b) => b && b.id > 0);
  const boxesPerTier = Math.max(4, Math.min(6, Math.ceil(rackBoxes.length / 3) || 4));
  const numTiers = Math.max(3, Math.ceil(Math.max(rackBoxes.length, 1) / boxesPerTier));

  const rackZ = -12.2;
  const rackWidth = Math.max(15.5, boxesPerTier * 2.55 + 1.4);
  const rackDepth = 3.2;
  const tierSpacing = 3.1;
  const rackBaseY = floorY + 0.8;
  const rackHeight = numTiers * tierSpacing + 1.2;

  // 4 Steel Vertical Uprights
  const postGeo = new THREE.BoxGeometry(0.24, rackHeight, 0.24);
  const postCoords = [
    [-rackWidth / 2, rackBaseY + rackHeight / 2 - 0.8, rackZ - rackDepth / 2],
    [rackWidth / 2, rackBaseY + rackHeight / 2 - 0.8, rackZ - rackDepth / 2],
    [-rackWidth / 2, rackBaseY + rackHeight / 2 - 0.8, rackZ + rackDepth / 2],
    [rackWidth / 2, rackBaseY + rackHeight / 2 - 0.8, rackZ + rackDepth / 2],
  ];
  for (const [px, py, pz] of postCoords) {
    const post = new THREE.Mesh(postGeo, steelMat);
    post.position.set(px, py, pz);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);
  }

  // Shelf Planks + Emissive LED Under-Shelf Accent Strips
  const shelfGeo = new THREE.BoxGeometry(rackWidth + 0.2, 0.18, rackDepth);
  const ledGeo = new THREE.BoxGeometry(rackWidth - 0.6, 0.06, 0.08);

  for (let t = 0; t <= numTiers; t++) {
    const shelfY = rackBaseY + t * tierSpacing;
    const plank = new THREE.Mesh(shelfGeo, walnutMat);
    plank.position.set(0, shelfY, rackZ);
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);

    // LED strip under every shelf above the bottom tier
    if (t > 0) {
      const ledMat = new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.3,
        roughness: 0.2,
      });
      ledStripMaterials.push(ledMat);

      const ledStrip = new THREE.Mesh(ledGeo, ledMat);
      ledStrip.position.set(0, shelfY - 0.12, rackZ + rackDepth / 2 - 0.25);
      group.add(ledStrip);
    }
  }

  // Place every real StorageBox onto the shelf tiers (top-to-bottom, left-to-right)
  const shelfBoxW = Math.min(2.05, (rackWidth - 1.4) / boxesPerTier - 0.35);
  const shelfBoxH = 2.0;
  const shelfBoxD = 2.65;
  const slotStepX = (rackWidth - 1.2) / boxesPerTier;
  const startX = -(rackWidth - 1.2) / 2 + slotStepX / 2;

  const shelfBoxBodyGeo = new THREE.BoxGeometry(shelfBoxW, shelfBoxH, shelfBoxD);
  const shelfLidGeo = new THREE.BoxGeometry(shelfBoxW + 0.1, 0.32, shelfBoxD + 0.1);
  const shelfLabelGeo = new THREE.PlaneGeometry(shelfBoxW * 0.78, shelfBoxW * 0.39);

  rackBoxes.forEach((b, idx) => {
    const tierFromTop = Math.floor(idx / boxesPerTier);
    const col = idx % boxesPerTier;
    const tierIndex = Math.max(0, numTiers - 1 - tierFromTop);
    const slotX = startX + col * slotStepX;
    const slotBaseY = rackBaseY + tierIndex * tierSpacing + 0.09;

    if (b.id === activeBox.id) {
      // Render glowing empty slot indicator for the box currently on the table!
      const slotTex = createOnTableSlotTexture(b.id);
      activeSlotGlowMat = new THREE.MeshBasicMaterial({
        map: slotTex,
        transparent: true,
        opacity: 0.9,
      });
      const slotMarker = new THREE.Mesh(
        new THREE.PlaneGeometry(shelfBoxW * 0.9, shelfBoxH * 0.45),
        activeSlotGlowMat
      );
      slotMarker.position.set(slotX, slotBaseY + shelfBoxH * 0.35, rackZ + rackDepth / 2 - 0.15);
      group.add(slotMarker);
      return;
    }

    const colorHex = b.colorTag || '#3b82f6';
    const boxTex = createCorrugatedCardboardTexture(colorHex);
    const bodyMat = new THREE.MeshStandardMaterial({
      map: boxTex,
      roughness: 0.72,
      metalness: 0.08,
    });

    const boxMesh = new THREE.Mesh(shelfBoxBodyGeo, bodyMat);
    boxMesh.position.set(slotX, slotBaseY + shelfBoxH / 2, rackZ);
    boxMesh.castShadow = true;
    boxMesh.receiveShadow = true;
    boxMesh.userData = {
      shelfBoxId: b.id,
      shelfBoxName: b.name,
      shelfBox: b,
    };
    group.add(boxMesh);
    shelfBoxMeshes.push(boxMesh);

    // Matching lid cap on shelf box
    const capMesh = new THREE.Mesh(shelfLidGeo, bodyMat);
    capMesh.position.set(0, shelfBoxH / 2 - 0.06, 0);
    capMesh.userData = boxMesh.userData;
    boxMesh.add(capMesh);

    // Front BOX #N label plate
    const labelTex = createShelfBoxLabelTexture(b);
    const labelMat = new THREE.MeshStandardMaterial({
      map: labelTex,
      roughness: 0.55,
      metalness: 0.05,
    });
    const labelMesh = new THREE.Mesh(shelfLabelGeo, labelMat);
    labelMesh.position.set(0, -0.05, shelfBoxD / 2 + 0.015);
    labelMesh.userData = boxMesh.userData;
    boxMesh.add(labelMesh);
  });

  // ============================================================================
  // 5. FRAMED WALL GRAIL POSTERS (ELEVATED WITH GALLERY PICTURE SPOTLIGHTS)
  // ============================================================================
  const frameOffsetX = rackWidth / 2 + 3.4;
  const posterY = rackBaseY + rackHeight * 0.74;
  const posterSlots = [
    { x: -frameOffsetX, y: posterY },
    { x: frameOffsetX, y: posterY },
  ];

  const frameOuterGeo = new THREE.BoxGeometry(4.0, 5.8, 0.22);
  const posterGeo = new THREE.PlaneGeometry(3.45, 5.25);
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x0b0f19,
    roughness: 0.3,
    metalness: 0.6,
  });
  const sconceMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.28,
    metalness: 0.85,
  });
  const sconceBarGeo = new THREE.BoxGeometry(1.9, 0.14, 0.22);
  const sconceArmGeo = new THREE.BoxGeometry(0.1, 0.1, 0.9);

  posterSlots.forEach((slot, idx) => {
    const grail = grailComics[idx];
    if (!grail) return;

    const frameMesh = new THREE.Mesh(frameOuterGeo, frameMat);
    frameMesh.position.set(slot.x, slot.y, backWallZ + 0.14);
    frameMesh.castShadow = true;
    group.add(frameMesh);

    const fallbackTex = createProceduralCoverTexture(grail);
    const posterMat = new THREE.MeshStandardMaterial({
      map: fallbackTex,
      roughness: 0.24,
      metalness: 0.06,
      emissive: 0x1a1610,
      emissiveIntensity: 0.22,
    });

    const posterMesh = new THREE.Mesh(posterGeo, posterMat);
    posterMesh.position.set(0, 0, 0.12);
    frameMesh.add(posterMesh);

    // Gallery picture-light sconce fixture mounted above the frame
    const sconceBar = new THREE.Mesh(sconceBarGeo, sconceMat);
    sconceBar.position.set(slot.x, slot.y + 3.25, backWallZ + 1.05);
    group.add(sconceBar);

    const sconceArm = new THREE.Mesh(sconceArmGeo, sconceMat);
    sconceArm.position.set(slot.x, slot.y + 3.25, backWallZ + 0.55);
    group.add(sconceArm);

    // Dedicated gallery SpotLight illuminating the Grail comic art
    const grailSpot = new THREE.SpotLight(0xffe7ba, 26, 14, Math.PI / 3.4, 0.65, 1.1);
    grailSpot.position.set(slot.x, slot.y + 3.35, backWallZ + 2.6);
    grailSpot.target.position.set(slot.x, slot.y + 0.1, backWallZ + 0.2);
    group.add(grailSpot);
    group.add(grailSpot.target);
    grailSpotLights.push(grailSpot);

    const coverUrl = resolveCoverImageUrl(grail.coverImage);
    if (coverUrl) {
      fetchImageAsTexture(coverUrl)
        .then((realTex) => {
          posterMat.map = realTex;
          posterMat.needsUpdate = true;
        })
        .catch(() => {
          // Keep procedural fallback cover
        });
    }
  });

  const handles: VaultRoomHandles = {
    group,
    shelfBoxMeshes,
    occluderMeshes,
    ledStripMaterials,
    grailSpotLights,
    wallMaterial,
    floorMaterial,
    activeSlotGlowMat,
  };

  applyRoomMood(handles, mood);
  return handles;
}

/**
 * Updates the Vault Room's wall, floor, and LED strip tones to match the selected lighting mood
 */
export function applyRoomMood(handles: VaultRoomHandles, mood: VaultLightingMood): void {
  if (mood === 'warm') {
    handles.wallMaterial.color.setHex(0x16141a);
    handles.floorMaterial.color.setHex(0x110e10);
    handles.ledStripMaterials.forEach((m) => {
      m.color.setHex(0xfef3c7);
      m.emissive.setHex(0xf59e0b);
      m.emissiveIntensity = 1.35;
    });
    handles.grailSpotLights.forEach((l) => {
      l.color.setHex(0xffe4b5);
      l.intensity = 28;
    });
  } else if (mood === 'museum') {
    handles.wallMaterial.color.setHex(0x273244);
    handles.floorMaterial.color.setHex(0x1e2636);
    handles.ledStripMaterials.forEach((m) => {
      m.color.setHex(0xffffff);
      m.emissive.setHex(0xe2e8f0);
      m.emissiveIntensity = 1.1;
    });
    handles.grailSpotLights.forEach((l) => {
      l.color.setHex(0xffffff);
      l.intensity = 24;
    });
  } else {
    // 'cyber'
    handles.wallMaterial.color.setHex(0x090d1a);
    handles.floorMaterial.color.setHex(0x060812);
    handles.ledStripMaterials.forEach((m, idx) => {
      const isAlt = idx % 2 === 1;
      m.color.setHex(isAlt ? 0xf5d0fe : 0xcffafe);
      m.emissive.setHex(isAlt ? 0xd946ef : 0x06b6d4);
      m.emissiveIntensity = 1.65;
    });
    handles.grailSpotLights.forEach((l, idx) => {
      l.color.setHex(idx % 2 === 0 ? 0x67e8f9 : 0xf0abfc);
      l.intensity = 30;
    });
  }
}
