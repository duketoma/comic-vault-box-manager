/**
 * Three.js Scene and Rendering Utilities
 * 
 * Handles scene setup, lighting, controls, and basic rendering infrastructure
 * for the comic box 3D visualizer.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  lights: {
    ambient: THREE.AmbientLight;
    directional: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
    back: THREE.DirectionalLight;
  };
  canvasSize: {
    width: number;
    height: number;
  };
  pixelRatio: number;
}

/**
 * Initialize a Three.js scene for the comic box visualizer
 */
export function initializeScene(canvas: HTMLCanvasElement): SceneContext {
  const width = Math.max(canvas.clientWidth, 100);
  const height = Math.max(canvas.clientHeight, 100);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  // Scene setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f5f9); // Light slate neutral background

  // Camera setup
  const camera = new THREE.PerspectiveCamera(
    45, // Comfortable FOV for inspection
    width / height,
    0.1,
    200
  );
  camera.position.set(5, 7, 12);
  camera.lookAt(0, 0, 0);

  // Renderer setup
  const renderer = new THREE.WebGLRenderer({ 
    canvas, 
    alpha: false,
    antialias: true,
    powerPreference: 'high-performance', 
  });

  renderer.setSize(width, height, false);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // OrbitControls setup
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.minDistance = 2.0;
  controls.maxDistance = 40.0;
  // Prevent camera from orbiting under the floor
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.target.set(0, 0, 0);

  // Ground plane to receive realistic soft shadow under the box
  const groundGeo = new THREE.PlaneGeometry(60, 60);
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
  const groundPlane = new THREE.Mesh(groundGeo, groundMat);
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -2.2; // Under the box
  groundPlane.receiveShadow = true;
  scene.add(groundPlane);

  // Lighting
  // 1. Soft ambient light for base visibility
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  // 2. Main key light (casts soft shadows)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.95);
  directionalLight.position.set(10, 15, 12);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 45;
  directionalLight.shadow.camera.left = -15;
  directionalLight.shadow.camera.right = 15;
  directionalLight.shadow.camera.top = 15;
  directionalLight.shadow.camera.bottom = -15;
  directionalLight.shadow.bias = -0.0005;
  scene.add(directionalLight);

  // 3. Fill light (soft cool tone from left)
  const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.4);
  fillLight.position.set(-10, 8, 8);
  scene.add(fillLight);

  // 4. Back light for rim lighting (separates comics from background)
  const backLight = new THREE.DirectionalLight(0xfff7ed, 0.35);
  backLight.position.set(0, 10, -12);
  scene.add(backLight);

  return {
    scene,
    camera,
    renderer,
    controls,
    lights: {
      ambient: ambientLight,
      directional: directionalLight,
      fill: fillLight,
      back: backLight,
    },
    canvasSize: { width, height },
    pixelRatio,
  };
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

  controls.dispose();

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((mat) => mat?.dispose());
      } else if (object.material) {
        object.material.dispose();
      }
    }
  });

  scene.clear();
  renderer.dispose();
}