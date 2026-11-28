/**
 * Three.js Scene and Rendering Utilities
 * 
 * Handles scene setup, lighting, controls, and basic rendering infrastructure
 * for the comic box 3D visualizer.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VaultLightingMood } from './three-room';

export type CameraPreset = 'table' | 'dig' | 'room';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  lights: {
    ambient: THREE.AmbientLight;
    hemisphere: THREE.HemisphereLight;
    directional: THREE.DirectionalLight;
    spot: THREE.SpotLight;
    fill: THREE.DirectionalLight;
    back: THREE.DirectionalLight;
  };
  cameraTransition: {
    active: boolean;
    targetPos: THREE.Vector3;
    targetLookAt: THREE.Vector3;
  };
  canvasSize: {
    width: number;
    height: number;
  };
  pixelRatio: number;
  isMobile: boolean;
}

/**
 * Initialize a Three.js scene for the 3D Collector's Vault Room
 */
export function initializeScene(
  canvas: HTMLCanvasElement,
  initialMood: VaultLightingMood = 'warm'
): SceneContext {
  const width = Math.max(canvas.clientWidth, 100);
  const height = Math.max(canvas.clientHeight, 100);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
  const shadowMapSize = isMobile ? 1024 : 2048;

  // Scene setup with atmospheric depth fog
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e16);
  scene.fog = new THREE.FogExp2(0x0b0e16, 0.018);

  // Camera setup
  const camera = new THREE.PerspectiveCamera(
    45,
    width / height,
    0.1,
    180
  );
  camera.position.set(5, 7, 12);
  camera.lookAt(0, 0, 0);

  // Renderer setup
  const renderer = new THREE.WebGLRenderer({ 
    canvas, 
    alpha: false,
    antialias: !isMobile,
    powerPreference: 'high-performance', 
  });

  renderer.setSize(width, height, false);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  // OrbitControls setup
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.minDistance = 2.5;
  controls.maxDistance = 32.0;
  // Prevent camera from orbiting below the tabletop
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.target.set(0, 0, 0);

  const cameraTransition = {
    active: false,
    targetPos: new THREE.Vector3(),
    targetLookAt: new THREE.Vector3(),
  };

  // Cancel scripted camera lerp immediately when the user grabs OrbitControls
  controls.addEventListener('start', () => {
    cameraTransition.active = false;
  });

  // Lighting Rig
  const ambientLight = new THREE.AmbientLight(0xfff4e6, 0.45);
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(0xffe8cc, 0x1e293b, 0.55);
  scene.add(hemisphereLight);

  // Main key directional light (casts crisp soft shadows)
  const directionalLight = new THREE.DirectionalLight(0xfff5e4, 0.9);
  directionalLight.position.set(9, 14, 11);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = shadowMapSize;
  directionalLight.shadow.mapSize.height = shadowMapSize;
  directionalLight.shadow.camera.near = 1;
  directionalLight.shadow.camera.far = 48;
  directionalLight.shadow.camera.left = -16;
  directionalLight.shadow.camera.right = 16;
  directionalLight.shadow.camera.top = 16;
  directionalLight.shadow.camera.bottom = -16;
  directionalLight.shadow.bias = -0.0005;
  scene.add(directionalLight);

  // Warm overhead pendant spotlight focused onto the inspection table
  const spotLight = new THREE.SpotLight(0xffdca8, 28, 36, Math.PI / 4, 0.55, 1.3);
  spotLight.position.set(0, 12.5, 2.5);
  spotLight.target.position.set(0, -1, 0);
  scene.add(spotLight);
  scene.add(spotLight.target);

  // Soft cool fill light from left
  const fillLight = new THREE.DirectionalLight(0xc7d2fe, 0.38);
  fillLight.position.set(-10, 8, 8);
  scene.add(fillLight);

  // Warm rim/back light separating box & comics from the shelves
  const backLight = new THREE.DirectionalLight(0xffedd5, 0.42);
  backLight.position.set(0, 10, -10);
  scene.add(backLight);

  const ctx: SceneContext = {
    scene,
    camera,
    renderer,
    controls,
    lights: {
      ambient: ambientLight,
      hemisphere: hemisphereLight,
      directional: directionalLight,
      spot: spotLight,
      fill: fillLight,
      back: backLight,
    },
    cameraTransition,
    canvasSize: { width, height },
    pixelRatio,
    isMobile,
  };

  applySceneLightingMood(ctx, initialMood);
  return ctx;
}

/**
 * Switch the 3D Vault Room lighting & atmospheric fog live between Warm Den, Museum, and Cyber moods
 */
export function applySceneLightingMood(
  ctx: SceneContext,
  mood: VaultLightingMood
): void {
  if (mood === 'warm') {
    ctx.scene.background = new THREE.Color(0x0d0c12);
    ctx.scene.fog = new THREE.FogExp2(0x0d0c12, 0.017);
    ctx.lights.ambient.color.setHex(0xfff1de);
    ctx.lights.ambient.intensity = 0.5;
    ctx.lights.hemisphere.color.setHex(0xffe6c7);
    ctx.lights.hemisphere.groundColor.setHex(0x1f1918);
    ctx.lights.hemisphere.intensity = 0.55;
    ctx.lights.directional.color.setHex(0xfff4e0);
    ctx.lights.directional.intensity = 0.92;
    ctx.lights.spot.color.setHex(0xffd79e);
    ctx.lights.spot.intensity = 30;
    ctx.lights.fill.color.setHex(0xc7d2fe);
    ctx.lights.fill.intensity = 0.35;
    ctx.lights.back.color.setHex(0xfde68a);
    ctx.lights.back.intensity = 0.45;
  } else if (mood === 'museum') {
    ctx.scene.background = new THREE.Color(0x1b2433);
    ctx.scene.fog = new THREE.FogExp2(0x1b2433, 0.013);
    ctx.lights.ambient.color.setHex(0xffffff);
    ctx.lights.ambient.intensity = 0.68;
    ctx.lights.hemisphere.color.setHex(0xf8fafc);
    ctx.lights.hemisphere.groundColor.setHex(0x334155);
    ctx.lights.hemisphere.intensity = 0.65;
    ctx.lights.directional.color.setHex(0xffffff);
    ctx.lights.directional.intensity = 1.05;
    ctx.lights.spot.color.setHex(0xf8fafc);
    ctx.lights.spot.intensity = 22;
    ctx.lights.fill.color.setHex(0xe0f2fe);
    ctx.lights.fill.intensity = 0.45;
    ctx.lights.back.color.setHex(0xf1f5f9);
    ctx.lights.back.intensity = 0.4;
  } else {
    // 'cyber'
    ctx.scene.background = new THREE.Color(0x060813);
    ctx.scene.fog = new THREE.FogExp2(0x060813, 0.02);
    ctx.lights.ambient.color.setHex(0xc4b5fd);
    ctx.lights.ambient.intensity = 0.42;
    ctx.lights.hemisphere.color.setHex(0x38bdf8);
    ctx.lights.hemisphere.groundColor.setHex(0x1e1b4b);
    ctx.lights.hemisphere.intensity = 0.55;
    ctx.lights.directional.color.setHex(0xe0f2fe);
    ctx.lights.directional.intensity = 0.85;
    ctx.lights.spot.color.setHex(0x818cf8);
    ctx.lights.spot.intensity = 34;
    ctx.lights.fill.color.setHex(0x22d3ee);
    ctx.lights.fill.intensity = 0.55;
    ctx.lights.back.color.setHex(0xe879f9);
    ctx.lights.back.intensity = 0.6;
  }
}

/**
 * Trigger a smooth camera lerp to a target position & lookAt point
 */
export function animateCameraTo(
  ctx: SceneContext,
  targetPos: THREE.Vector3,
  targetLookAt: THREE.Vector3
): void {
  ctx.cameraTransition.targetPos.copy(targetPos);
  ctx.cameraTransition.targetLookAt.copy(targetLookAt);
  ctx.cameraTransition.active = true;
}

/**
 * Add a box stack to the scene
 */
export function addBoxStackToScene(
  sceneContext: SceneContext,
  stackMeshGroup: THREE.Group
): void {
  sceneContext.scene.add(stackMeshGroup);
}

/**
 * Clear the scene of all objects (except lights and ground)
 */
export function clearScene(sceneContext: SceneContext): void {
  const objectsToRemove: THREE.Object3D[] = [];
  sceneContext.scene.traverse((child) => {
    if (
      !(child instanceof THREE.Light) && 
      !(child instanceof THREE.ShadowMaterial) &&
      child !== sceneContext.scene
    ) {
      objectsToRemove.push(child);
    }
  });
  
  objectsToRemove.forEach((obj) => {
    sceneContext.scene.remove(obj);
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m?.dispose());
      } else if (obj.material) {
        obj.material.dispose();
      }
    }
  });
}

/**
 * Handle window resize and update camera/renderer
 */
export function handleWindowResize(
  sceneContext: SceneContext,
  canvas: HTMLCanvasElement
): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;

  sceneContext.camera.aspect = width / height;
  sceneContext.camera.updateProjectionMatrix();

  sceneContext.renderer.setSize(width, height, false);
  sceneContext.canvasSize = { width, height };
}

/**
 * Set up animation loop
 */
export function setupAnimationLoop(
  sceneContext: SceneContext,
  onFrame: (delta: number) => void
): () => void {
  let frameId: number;
  let lastTime = performance.now();

  const animate = () => {
    frameId = requestAnimationFrame(animate);

    const currentTime = performance.now();
    const delta = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // Smoothly interpolate camera presets when active
    if (sceneContext.cameraTransition.active) {
      const alpha = Math.min(1, delta * 5.5);
      sceneContext.camera.position.lerp(sceneContext.cameraTransition.targetPos, alpha);
      sceneContext.controls.target.lerp(sceneContext.cameraTransition.targetLookAt, alpha);
      if (
        sceneContext.camera.position.distanceTo(sceneContext.cameraTransition.targetPos) < 0.05 &&
        sceneContext.controls.target.distanceTo(sceneContext.cameraTransition.targetLookAt) < 0.05
      ) {
        sceneContext.cameraTransition.active = false;
      }
    }

    // Update OrbitControls smooth damping
    sceneContext.controls.update();

    onFrame(delta);

    sceneContext.renderer.render(sceneContext.scene, sceneContext.camera);
  };

  frameId = requestAnimationFrame(animate);

  return () => cancelAnimationFrame(frameId);
}

/**
 * Create a raycaster for picking
 */
export function createRaycaster(): THREE.Raycaster {
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 0.1 };
  return raycaster;
}

/**
 * Convert mouse/touch coordinates to normalized device coordinates
 */
export function getNormalizedCoordinates(
  event: MouseEvent | TouchEvent,
  canvas: HTMLCanvasElement
): THREE.Vector2 {
  const rect = canvas.getBoundingClientRect();
  
  let clientX: number;
  let clientY: number;

  if (event instanceof TouchEvent) {
    if (event.touches.length === 0) return new THREE.Vector2(0, 0);
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }

  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;

  return new THREE.Vector2(x, y);
}

/**
 * Dispose of all renderer resources
 */
export function disposeScene(context: SceneContext) {
  const { renderer, scene, controls } = context;
  const disposeMaterial = (m: THREE.Material) => {
    if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose();
    m.dispose();
  };
  controls.dispose();

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
      else if (object.material) disposeMaterial(object.material);
    }
  });

  scene.clear();
  renderer.dispose();
}