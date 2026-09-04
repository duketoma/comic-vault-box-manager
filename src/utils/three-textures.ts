/**
 * Three.js Texture & Material Management
 * 
 * Handles loading comic cover images as textures and applying them to 3D models.
 * Correctly maps the front cover to Face 4 (+Z) of Three.js BoxGeometry.
 * Uses fetch-to-Blob object URLs for 100% reliable WebGL texture loading without CORS/taint issues.
 * Safely handles Non-Power-Of-Two (NPOT) aspect ratios with LinearFilter.
 */

import * as THREE from 'three';
import { ComicBook } from '../types';
import { getComicCoverUrl, DEFAULT_COVER_IMAGE } from './imageUtils';

/**
 * Texture cache to avoid re-loading the same image multiple times
 */
const textureCache = new Map<string, THREE.Texture>();

/**
 * In-flight promise cache to avoid duplicate simultaneous downloads
 */
const texturePromiseCache = new Map<string, Promise<THREE.Texture>>();

/**
 * Resolve a displayable cover URL from a comic's coverImage property
 */
export function resolveCoverImageUrl(coverUrl?: string): string | null {
  if (!coverUrl || !coverUrl.trim()) return null;
  const clean = coverUrl.trim();
  if (
    clean === DEFAULT_COVER_IMAGE ||
    clean.toLowerCase().includes('noimage')
  ) {
    return null;
  }

  const resolved = getComicCoverUrl(clean);
  if (!resolved || resolved === DEFAULT_COVER_IMAGE || resolved.toLowerCase().includes('noimage')) {
    return null;
  }

  // Optimize Google Drive image size: use =s800 for fast download and crisp 3D rendering
  if (resolved.includes('lh3.googleusercontent.com') && resolved.includes('=s1000')) {
    return resolved.replace('=s1000', '=s800');
  }

  return resolved;
}

/**
 * Load a texture from a URL using fetch -> Blob -> createObjectURL.
 * Converting the response to a local blob URL guarantees WebGL accepts it
 * as same-origin, avoiding any browser cache CORS poisoning or canvas tainting.
 */
export async function fetchImageAsTexture(url: string): Promise<THREE.Texture> {
  // Check memory cache first
  if (textureCache.has(url)) {
    return textureCache.get(url)!;
  }

  // Reuse in-flight download promise if already downloading
  if (texturePromiseCache.has(url)) {
    return texturePromiseCache.get(url)!;
  }

  const loadPromise = (async () => {
    let blobUrl: string | null = null;
    let targetUrl = url;

    try {
      // 1. Try direct CORS fetch
      const res = await fetch(url, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
        targetUrl = blobUrl;
      } else {
        // If direct fetch returns non-200, try server proxy
        try {
          const proxyRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
          if (proxyRes.ok) {
            const contentType = proxyRes.headers.get('content-type');
            if (contentType && contentType.startsWith('image/')) {
              const blob = await proxyRes.blob();
              blobUrl = URL.createObjectURL(blob);
              targetUrl = blobUrl;
            }
          }
        } catch {
          // Keep targetUrl as url
        }
      }
    } catch {
      // Direct fetch failed (e.g. CORS restriction on external host), try server proxy
      try {
        const proxyRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
        if (proxyRes.ok) {
          const contentType = proxyRes.headers.get('content-type');
          if (contentType && contentType.startsWith('image/')) {
            const blob = await proxyRes.blob();
            blobUrl = URL.createObjectURL(blob);
            targetUrl = blobUrl;
          }
        }
      } catch {
        targetUrl = url;
      }
    }

    // 2. Load into Three.js Texture
    return new Promise<THREE.Texture>((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      if (!targetUrl.startsWith('blob:')) {
        loader.setCrossOrigin('anonymous');
      }

      loader.load(
        targetUrl,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          // Use LinearFilter without mipmaps: safe for ALL non-power-of-two (NPOT) aspect ratios
          texture.magFilter = THREE.LinearFilter;
          texture.minFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;

          if (blobUrl) {
            // Revoke after a safe delay so WebGL texture upload to GPU is complete
            setTimeout(() => {
              try {
                URL.revokeObjectURL(blobUrl!);
              } catch {}
            }, 10000);
          }

          textureCache.set(url, texture);
          texturePromiseCache.delete(url);
          resolve(texture);
        },
        undefined,
        (err) => {
          if (blobUrl) {
            try {
              URL.revokeObjectURL(blobUrl);
            } catch {}
          }
          texturePromiseCache.delete(url);
          reject(err);
        }
      );
    });
  })();

  texturePromiseCache.set(url, loadPromise);
  return loadPromise;
}

/**
 * Generate a high-resolution, stylized procedural comic book cover canvas texture.
 * Displays title, issue #, year, publisher banner, and comic aesthetics immediately.
 */
export function createProceduralCoverTexture(comic: Partial<ComicBook>): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768; // Standard comic portrait aspect ratio
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    const blank = new THREE.CanvasTexture(canvas);
    blank.colorSpace = THREE.SRGBColorSpace;
    return blank;
  }

  const pub = (comic.publisher || '').toLowerCase();
  let primaryColor = '#1e293b';
  let accentColor = '#3b82f6';
  let bannerText = comic.publisher || 'COMIC VAULT';

  if (pub.includes('marvel')) {
    primaryColor = '#7f1d1d'; // Deep Marvel red
    accentColor = '#e11d48';  // Bright red
  } else if (pub.includes('dc')) {
    primaryColor = '#1e3a8a'; // Deep DC blue
    accentColor = '#2563eb';  // Bright blue
  } else if (pub.includes('image')) {
    primaryColor = '#18181b'; // Dark black/zinc
    accentColor = '#f97316';  // Vibrant orange
  } else if (pub.includes('dark horse')) {
    primaryColor = '#1c1917'; // Rich dark brown
    accentColor = '#d97706';  // Amber
  } else if (pub.includes('boom')) {
    primaryColor = '#4c1d95'; // Purple
    accentColor = '#9333ea';
  }

  // Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 768);
  bgGrad.addColorStop(0, primaryColor);
  bgGrad.addColorStop(0.65, '#0f172a');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 512, 768);

  // Halftone / dot pattern texture for authentic comic book feel
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let y = 30; y < 740; y += 16) {
    for (let x = 30; x < 490; x += 16) {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Vintage comic border frame
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 12;
  ctx.strokeRect(16, 16, 480, 736);

  // Inner thin border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(26, 26, 460, 716);

  // Top Publisher Header Bar
  ctx.fillStyle = accentColor;
  ctx.fillRect(23, 23, 466, 68);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(bannerText.toUpperCase(), 256, 64);

  // Corner Badge (Issue # & Year)
  ctx.fillStyle = '#fbbf24'; // Classic yellow badge
  ctx.fillRect(36, 102, 94, 90);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 102, 94, 90);

  ctx.fillStyle = '#000000';
  ctx.font = '900 32px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`#${comic.issueNumber || '1'}`, 83, 145);

  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`${comic.publicationYear || ''}`, 83, 175);

  // Comic Title in Bold Block Letters
  const titleText = (comic.title || 'COMIC BOOK').toUpperCase();
  const words = titleText.split(' ');
  let lines: string[] = [];
  let currentLine = words[0] || '';
  for (let i = 1; i < words.length; i++) {
    if ((currentLine + ' ' + words[i]).length < 16) {
      currentLine += ' ' + words[i];
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);
  if (lines.length > 3) lines = lines.slice(0, 3);

  const startY = 225;
  lines.forEach((line, idx) => {
    ctx.fillStyle = '#000000';
    ctx.font = '900 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(line, 260, startY + idx * 44 + 4);

    ctx.fillStyle = '#fef08a';
    ctx.fillText(line, 256, startY + idx * 44);
  });

  // Center Graphic Frame
  const artY = startY + lines.length * 44 + 20;
  const artHeight = Math.max(590 - artY, 120);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(45, artY, 422, artHeight);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(45, artY, 422, artHeight);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'italic 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(comic.format || 'Collector Edition', 256, artY + artHeight / 2 - 8);

  if (comic.event) {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(`“${comic.event}”`, 256, artY + artHeight / 2 + 24);
  }

  // Creator Credits Bar
  if (comic.writer || comic.artist) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(35, 608, 442, 38);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const credits = [
      comic.writer && `WRITER: ${comic.writer}`,
      comic.artist && `ART: ${comic.artist}`,
    ].filter(Boolean).join(' • ');
    ctx.fillText(credits.substring(0, 48), 256, 633);
  }

  // Bottom Barcode Box
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(46, 658, 120, 62);
  ctx.fillStyle = '#000000';
  for (let x = 56; x < 156; x += 5) {
    const bw = (x % 10 === 0) ? 3 : 1.5;
    ctx.fillRect(x, 666, bw, 34);
  }
  ctx.font = '9px monospace';
  ctx.fillText('0 71486 02453 7', 106, 712);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * Create materials for all faces of a comic book mesh
 * 
 * Three.js BoxGeometry face mapping:
 * Index 0: +X (Right side - open pages edge)
 * Index 1: -X (Left side - spine edge)
 * Index 2: +Y (Top side - open pages edge)
 * Index 3: -Y (Bottom side - open pages edge)
 * Index 4: +Z (Front face - COVER ART)
 * Index 5: -Z (Back face - backing board / comic back)
 */
export function createComicFaceMaterials(
  comic: ComicBook | string | undefined
): THREE.Material[] {
  const comicObj: Partial<ComicBook> = typeof comic === 'string'
    ? { coverImage: comic, title: 'Comic Book', issueNumber: '1' }
    : comic || { title: 'Comic Book', issueNumber: '1' };

  const coverUrl = resolveCoverImageUrl(comicObj.coverImage);
  const cachedTexture = coverUrl ? textureCache.get(coverUrl) : null;

  // 1. Front Cover Material (starts with cached texture if available, or procedural cover texture)
  const initialTexture = cachedTexture || createProceduralCoverTexture(comicObj);
  const frontMaterial = new THREE.MeshStandardMaterial({
    map: initialTexture,
    roughness: 0.45,
    metalness: 0.05,
  });

  // 2. Back Cover Material (clean comic backing board)
  const backMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.85,
    metalness: 0.05,
  });

  // 3. Open Page Edges Material (+X, +Y, -Y)
  const pageEdgesMaterial = new THREE.MeshStandardMaterial({
    color: 0xfbf9f5, // Off-white cream paper
    roughness: 0.95,
    metalness: 0.0,
  });

  // 4. Spine Material (-X)
  const spineMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.8,
    metalness: 0.05,
  });

  const materials: THREE.Material[] = [
    pageEdgesMaterial, // 0: +X (Right side - pages)
    spineMaterial,     // 1: -X (Left side - spine)
    pageEdgesMaterial, // 2: +Y (Top side - pages)
    pageEdgesMaterial, // 3: -Y (Bottom side - pages)
    frontMaterial,     // 4: +Z (FRONT FACE - COVER ART!)
    backMaterial,      // 5: -Z (BACK FACE - BACK COVER)
  ];

  // Load real cover image if not already cached
  if (coverUrl && !cachedTexture) {
    fetchImageAsTexture(coverUrl)
      .then((realTexture) => {
        frontMaterial.map = realTexture;
        frontMaterial.needsUpdate = true;
      })
      .catch((err) => {
        console.warn(`[Three.js] Could not load cover for comic ${comicObj.title || comicObj.id}:`, err);
      });
  }

  return materials;
}

/**
 * Apply textured materials to an existing comic mesh
 */
export function applyComicTextures(
  mesh: THREE.Mesh,
  comic: ComicBook | string | undefined
): void {
  const materials = createComicFaceMaterials(comic);
  mesh.material = materials;
}

/**
 * Preload comic textures
 */
export async function preloadComicTextures(
  comics: Array<{ id: string; coverImage?: string }>
): Promise<void> {
  const urls = comics
    .map((c) => resolveCoverImageUrl(c.coverImage))
    .filter((url): url is string => !!url);

  await Promise.allSettled(urls.map(fetchImageAsTexture));
}

/**
 * Clear texture cache on cleanup
 */
export function clearTextureCache(): void {
  textureCache.forEach((texture) => {
    texture.dispose();
  });
  textureCache.clear();
  texturePromiseCache.clear();
}


