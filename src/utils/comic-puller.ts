/**
 * Animation Controller for Comic Pulling
 * 
 * Handles smooth animation of comics being pulled upward out of the box
 * for clear 3D inspection, and returning them back down into their slot.
 */

import * as THREE from 'three';

export interface ComicAnimationState {
  comicId: string;
  mesh: THREE.Mesh;
  startPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  startRotation: THREE.Euler;
  targetRotation: THREE.Euler;
  startTime: number;
  duration: number;
  easing: (t: number) => number;
  state: 'active' | 'complete';
  originalScale: THREE.Vector3;
}

export const EASING = {
  easeInOutCubic: (t: number) => {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  },
  easeOutCubic: (t: number) => 1 + (t - 1) ** 3,
};

export class ComicPuller {
  private activeAnimations: Map<string, ComicAnimationState> = new Map();
  private originalPositions: Map<string, THREE.Vector3> = new Map();
  private originalRotations: Map<string, THREE.Euler> = new Map();
  private settledComics: Set<string> = new Set();
  private pullHeight: number = 3.2; // How high to lift above the box
  private pullDuration: number = 450; // ms

  /**
   * Remember the home position and rotation of a comic
   */
  public registerComic(comicId: string, position: THREE.Vector3, rotation?: THREE.Euler): void {
    this.originalPositions.set(comicId, position.clone());
    this.originalRotations.set(comicId, rotation ? rotation.clone() : new THREE.Euler(0, 0, 0));
  }

  /**
   * Pull a comic upward out of the box
   */
  public pullComic(comicId: string, mesh: THREE.Mesh): void {
    // If already pulled, return it
    if (this.settledComics.has(comicId)) {
      this.returnComic(comicId, mesh);
      return;
    }

    // Return any other settled comics first so only one is out at a time
    for (const otherId of Array.from(this.settledComics)) {
      if (otherId !== comicId) {
        const parent = mesh.parent;
        if (parent) {
          parent.traverse((child) => {
            if (child instanceof THREE.Mesh && (child.userData as any).comicId === otherId) {
              this.returnComic(otherId, child);
            }
          });
        }
      }
    }

    const basePos = (mesh.userData as any).basePosition || this.originalPositions.get(comicId) || mesh.position.clone();
    this.registerComic(comicId, basePos);

    const startPosition = mesh.position.clone();
    const startRotation = mesh.rotation.clone();

    // Lift UP above box rim and tilt slightly forward toward viewer
    const targetPosition = basePos.clone();
    targetPosition.y += this.pullHeight;
    targetPosition.z += 0.4; // Bring slightly forward for prominence

    const targetRotation = new THREE.Euler(-0.12, 0, 0); // Subtle tilt forward

    (mesh.userData as any).isPulled = true;

    const animation: ComicAnimationState = {
      comicId,
      mesh,
      startPosition,
      targetPosition,
      startRotation,
      targetRotation,
      startTime: performance.now(),
      duration: this.pullDuration,
      easing: EASING.easeOutCubic,
      state: 'active',
      originalScale: new THREE.Vector3(1, 1, 1),
    };

    this.activeAnimations.set(comicId, animation);
  }

  /**
   * Return a comic back down into its slot in the box
   */
  public returnComic(comicId: string, mesh: THREE.Mesh): void {
    this.settledComics.delete(comicId);

    const basePos = (mesh.userData as any).basePosition || this.originalPositions.get(comicId) || new THREE.Vector3(0, 0, 0);
    const startPosition = mesh.position.clone();
    const startRotation = mesh.rotation.clone();

    const targetPosition = basePos.clone();
    const targetRotation = new THREE.Euler(0, 0, 0);

    const animation: ComicAnimationState = {
      comicId,
      mesh,
      startPosition,
      targetPosition,
      startRotation,
      targetRotation,
      startTime: performance.now(),
      duration: this.pullDuration,
      easing: EASING.easeInOutCubic,
      state: 'active',
      originalScale: new THREE.Vector3(1, 1, 1),
    };

    this.activeAnimations.set(comicId, animation);
  }

  /**
   * Update all active animations
   */
  public update(_deltaTime: number): boolean {
    const now = performance.now();
    let hasActive = false;

    for (const [comicId, anim] of this.activeAnimations.entries()) {
      if (anim.state === 'complete') {
        this.activeAnimations.delete(comicId);
        continue;
      }

      const elapsed = now - anim.startTime;
      const progress = Math.min(elapsed / anim.duration, 1);
      const eased = anim.easing(progress);

      // Interpolate position
      anim.mesh.position.lerpVectors(anim.startPosition, anim.targetPosition, eased);

      // Interpolate rotation
      anim.mesh.rotation.x = THREE.MathUtils.lerp(anim.startRotation.x, anim.targetRotation.x, eased);
      anim.mesh.rotation.y = THREE.MathUtils.lerp(anim.startRotation.y, anim.targetRotation.y, eased);
      anim.mesh.rotation.z = THREE.MathUtils.lerp(anim.startRotation.z, anim.targetRotation.z, eased);

      if (progress >= 1) {
        anim.state = 'complete';
        anim.mesh.position.copy(anim.targetPosition);
        anim.mesh.rotation.copy(anim.targetRotation);

        if (anim.targetPosition.y > (anim.startPosition.y + 1.0)) {
          this.settledComics.add(comicId);
          (anim.mesh.userData as any).isPulled = true;
        } else {
          (anim.mesh.userData as any).isPulled = false;
        }
      } else {
        hasActive = true;
      }
    }

    return hasActive;
  }

  public isSettled(comicId: string): boolean {
    return this.settledComics.has(comicId);
  }

  public reset(): void {
    this.activeAnimations.clear();
    this.settledComics.clear();
  }
}

export function createComicPuller(): ComicPuller {
  return new ComicPuller();
}

