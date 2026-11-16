import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT_DIR = process.cwd();
const DEMO_DIR = path.join(ROOT_DIR, 'demo');
const TEMP_VIDEO_DIR = path.join(DEMO_DIR, '.tmp-video');
const OUTPUT_WEBM = path.join(DEMO_DIR, 'comic-archive-pro-demo.webm');
const OUTPUT_MP4 = path.join(DEMO_DIR, 'comic-archive-pro-demo.mp4');
const DEMO_PORT = process.env.DEMO_PORT || '3099';
const BASE_URL = process.env.DEMO_BASE_URL || `http://localhost:${DEMO_PORT}`;

function findFfmpegPath() {
  const candidates = [
    'D:\\Programs\\ffmpeg\\ffmpeg-7.1.1-essentials_build\\bin\\ffmpeg.exe',
    'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fallback to Playwright's bundled ffmpeg
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const pwDir = path.join(localAppData, 'ms-playwright');
    if (fs.existsSync(pwDir)) {
      const entries = fs.readdirSync(pwDir).filter((d) => d.startsWith('ffmpeg-')).sort().reverse();
      for (const entry of entries) {
        const exe = path.join(pwDir, entry, process.platform === 'win32' ? 'ffmpeg-win64.exe' : 'ffmpeg');
        if (fs.existsSync(exe)) return exe;
      }
    }
  }

  return 'ffmpeg';
}

function checkHealth(url) {
  return new Promise((resolve) => {
    const req = http.get(`${url}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServerRunning() {
  const alreadyUp = await checkHealth(BASE_URL);
  if (alreadyUp) {
    console.log(`[demo] Using existing server at ${BASE_URL}`);
    return null;
  }

  const serverEntry = path.join(ROOT_DIR, 'dist-server', 'server.cjs');
  if (!fs.existsSync(serverEntry)) {
    throw new Error('dist-server/server.cjs not found. Run `npm run build` first.');
  }

  console.log(`[demo] Starting fresh production server on port ${DEMO_PORT}...`);
  const child = spawn(process.execPath, [serverEntry], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(DEMO_PORT),
      ALLOWED_ORIGINS: BASE_URL,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (d) => {
    const text = d.toString().trim();
    if (text) console.log(`[server] ${text}`);
  });
  child.stderr?.on('data', (d) => {
    const text = d.toString().trim();
    if (text) console.warn(`[server:err] ${text}`);
  });

  for (let i = 0; i < 40; i++) {
    if (await checkHealth(BASE_URL)) {
      console.log(`[demo] Server is healthy at ${BASE_URL}.`);
      return child;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  child.kill();
  throw new Error('Timed out waiting for production server on http://localhost:3000');
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildCoverArtMotif(motif, accent, secondary) {
  switch (motif) {
    case 'symbiote':
      return `
        <g transform="translate(300, 500)">
          <ellipse cx="0" cy="0" rx="190" ry="230" fill="#090d16" opacity="0.72"/>
          <path d="M0,-130 C35,-130 55,-95 45,-60 C80,-80 125,-125 160,-150 C140,-95 95,-45 65,-25 C115,-25 165,-40 195,-60 C160,-10 110,12 70,18 C115,40 155,85 180,145 C125,115 80,68 55,40 C65,85 50,140 0,175 C-50,140 -65,85 -55,40 C-80,68 -125,115 -180,145 C-155,85 -115,40 -70,18 C-110,12 -160,-10 -195,-60 C-165,-40 -115,-25 -65,-25 C-95,-45 -140,-95 -160,-150 C-125,-125 -80,-80 -45,-60 C-55,-95 -35,-130 0,-130 Z" fill="#ffffff" stroke="${accent}" stroke-width="6"/>
          <path d="M-42,-165 Q-15,-145 -8,-122 Q-35,-126 -42,-165 Z" fill="#ffffff"/>
          <path d="M42,-165 Q15,-145 8,-122 Q35,-126 42,-165 Z" fill="#ffffff"/>
        </g>`;
    case 'spider':
      return `
        <g transform="translate(300, 490)">
          <circle cx="0" cy="0" r="185" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.28"/>
          <circle cx="0" cy="0" r="130" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.28"/>
          <circle cx="0" cy="0" r="75" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.28"/>
          <path d="M-210,0 L210,0 M0,-210 L0,210 M-150,-150 L150,150 M-150,150 L150,-150" stroke="#ffffff" stroke-width="2" opacity="0.25"/>
          <ellipse cx="0" cy="10" rx="44" ry="56" fill="#0f172a" stroke="${secondary}" stroke-width="6"/>
          <circle cx="0" cy="-58" r="28" fill="#0f172a" stroke="${secondary}" stroke-width="5"/>
          <path d="M-38,-20 L-120,-85 M-42,5 L-135,0 M-38,30 L-115,95 M38,-20 L120,-85 M42,5 L135,0 M38,30 L115,95" stroke="#0f172a" stroke-width="11" stroke-linecap="round"/>
        </g>`;
    case 'claws':
      return `
        <g transform="translate(300, 500)">
          <circle cx="0" cy="0" r="175" fill="${secondary}" opacity="0.18"/>
          <path d="M-135,-175 L-45,175 L-25,175 L-100,-175 Z" fill="#e2e8f0" stroke="#0f172a" stroke-width="5"/>
          <path d="M-15,-190 L40,185 L62,185 L22,-190 Z" fill="#f8fafc" stroke="#0f172a" stroke-width="5"/>
          <path d="M95,-165 L125,170 L145,170 L130,-165 Z" fill="#cbd5e1" stroke="#0f172a" stroke-width="5"/>
          <path d="M-165,30 L165,-40" stroke="${accent}" stroke-width="12" stroke-linecap="round" opacity="0.85"/>
        </g>`;
    case 'bat':
      return `
        <g transform="translate(300, 490)">
          <circle cx="0" cy="-20" r="165" fill="${accent}" opacity="0.88" stroke="#0f172a" stroke-width="10"/>
          <path d="M-145,-15 C-110,-65 -60,-70 -35,-40 L-18,-85 L0,-55 L18,-85 L35,-40 C60,-70 110,-65 145,-15 C110,10 95,45 100,70 C70,40 35,45 0,95 C-35,45 -70,40 -100,70 C-95,45 -110,10 -145,-15 Z" fill="#090d16"/>
          <rect x="-240" y="135" width="480" height="145" fill="#090d16" opacity="0.75"/>
          <rect x="-200" y="100" width="55" height="175" fill="#0f172a"/>
          <rect x="-110" y="80" width="70" height="195" fill="#111827"/>
          <rect x="65" y="95" width="60" height="180" fill="#0f172a"/>
          <rect x="145" y="115" width="50" height="160" fill="#1e293b"/>
        </g>`;
    case 'gauntlet':
      return `
        <g transform="translate(300, 495)">
          <polygon points="0,-195 160,-50 100,175 -100,175 -160,-50" fill="${secondary}" opacity="0.22" stroke="${accent}" stroke-width="6"/>
          <circle cx="0" cy="-20" r="42" fill="#facc15" stroke="#ffffff" stroke-width="5"/>
          <circle cx="-85" cy="-70" r="24" fill="#ef4444" stroke="#ffffff" stroke-width="4"/>
          <circle cx="-35" cy="-115" r="24" fill="#3b82f6" stroke="#ffffff" stroke-width="4"/>
          <circle cx="35" cy="-115" r="24" fill="#a855f7" stroke="#ffffff" stroke-width="4"/>
          <circle cx="85" cy="-70" r="24" fill="#22c55e" stroke="#ffffff" stroke-width="4"/>
          <circle cx="0" cy="85" r="28" fill="#f97316" stroke="#ffffff" stroke-width="4"/>
        </g>`;
    case 'spawn':
      return `
        <g transform="translate(300, 505)">
          <path d="M-190,210 C-150,-80 -90,-180 0,-210 C90,-180 150,-80 190,210 C110,160 55,190 0,145 C-55,190 -110,160 -190,210 Z" fill="#b91c1c" stroke="#090d16" stroke-width="7"/>
          <ellipse cx="0" cy="-65" rx="68" ry="82" fill="#0f172a" stroke="#e2e8f0" stroke-width="4"/>
          <path d="M-42,-78 L-10,-62 L-38,-48 Z M42,-78 L10,-62 L38,-48 Z" fill="#22c55e"/>
          <path d="M-180,35 Q-60,-20 0,30 T180,15" fill="none" stroke="#94a3b8" stroke-width="12" stroke-dasharray="18 10"/>
        </g>`;
    case 'cosmic':
    default:
      return `
        <g transform="translate(300, 495)">
          <circle cx="0" cy="0" r="170" fill="${accent}" opacity="0.24"/>
          <circle cx="0" cy="0" r="115" fill="none" stroke="${secondary}" stroke-width="6" stroke-dasharray="22 12"/>
          <polygon points="0,-165 38,-45 165,-45 62,28 100,150 0,76 -100,150 -62,28 -165,-45 -38,-45" fill="${accent}" stroke="#ffffff" stroke-width="5"/>
          <circle cx="-130" cy="-130" r="14" fill="#ffffff" opacity="0.8"/>
          <circle cx="145" cy="-105" r="10" fill="#ffffff" opacity="0.7"/>
          <circle cx="120" cy="130" r="16" fill="#ffffff" opacity="0.75"/>
        </g>`;
  }
}

function generateComicCoverSvg(comic, isFullSpread = false) {
  const palette = comic._palette || {
    bg1: '#0f172a',
    bg2: '#1e1b4b',
    accent: '#ef4444',
    secondary: '#facc15',
    motif: 'spider',
  };

  const titleText = escapeXml((comic.title || 'COMIC ARCHIVE').toUpperCase());
  const issueText = escapeXml(`#${comic.issueNumber || '1'}`);
  const pubText = escapeXml((comic.publisher || 'COMICS').split(' ')[0].toUpperCase());
  const yearText = escapeXml(String(comic.publicationYear || 1990));
  const creatorsText = escapeXml(
    [comic.writer, comic.artist].filter(Boolean).join(' • ') || 'COLLECTOR EDITION'
  );
  const eventBadge = comic.event
    ? `<g transform="translate(300, 224)">
         <rect x="-155" y="-18" width="310" height="34" rx="17" fill="${palette.secondary}" stroke="#0f172a" stroke-width="3"/>
         <text x="0" y="5" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="16" font-weight="900" fill="#0f172a">${escapeXml(
           comic.event.toUpperCase()
         )}</text>
       </g>`
    : '';

  const frontSvgInner = `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.bg1}"/>
        <stop offset="100%" stop-color="${palette.bg2}"/>
      </linearGradient>
      <pattern id="halftone" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="4" cy="4" r="2.2" fill="#ffffff" opacity="0.09"/>
        <circle cx="12" cy="12" r="1.6" fill="#ffffff" opacity="0.06"/>
      </pattern>
      <radialGradient id="spot" cx="50%" cy="55%" r="55%">
        <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${palette.bg2}" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <rect width="600" height="900" fill="url(#bgGrad)"/>
    <rect width="600" height="900" fill="url(#halftone)"/>
    <rect width="600" height="900" fill="url(#spot)"/>

    <!-- Comic Action Rays -->
    <g opacity="0.16" stroke="#ffffff" stroke-width="4">
      <line x1="300" y1="500" x2="0" y2="150"/>
      <line x1="300" y1="500" x2="600" y2="160"/>
      <line x1="300" y1="500" x2="0" y2="820"/>
      <line x1="300" y1="500" x2="600" y2="840"/>
      <line x1="300" y1="500" x2="300" y2="900"/>
    </g>

    <!-- Masthead Banner -->
    <rect x="20" y="20" width="560" height="186" rx="14" fill="rgba(15, 23, 42, 0.72)" stroke="#ffffff" stroke-width="4" stroke-opacity="0.22"/>

    <!-- Publisher Corner Box -->
    <g transform="translate(32, 32)">
      <rect width="98" height="160" rx="8" fill="${palette.accent}" stroke="#ffffff" stroke-width="3.5"/>
      <rect x="0" y="0" width="98" height="36" rx="6" fill="#0f172a"/>
      <text x="49" y="24" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="14" font-weight="900" fill="#ffffff">${pubText}</text>
      <text x="49" y="84" text-anchor="middle" font-family="Impact, Arial Black, sans-serif" font-size="34" font-weight="900" fill="#ffffff">${issueText}</text>
      <text x="49" y="114" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#fef08a">${yearText}</text>
      <rect x="14" y="128" width="70" height="20" rx="4" fill="#ffffff"/>
      <text x="49" y="142" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="11" font-weight="900" fill="#0f172a">9.6 NM+</text>
    </g>

    <!-- Masthead Title -->
    <text x="352" y="96" text-anchor="middle" font-family="Impact, Arial Black, sans-serif" font-size="${
      titleText.length > 18 ? 34 : titleText.length > 13 ? 42 : 52
    }" font-weight="900" fill="#090d16" transform="translate(4,4)">${titleText}</text>
    <text x="352" y="96" text-anchor="middle" font-family="Impact, Arial Black, sans-serif" font-size="${
      titleText.length > 18 ? 34 : titleText.length > 13 ? 42 : 52
    }" font-weight="900" fill="${palette.secondary}" stroke="#090d16" stroke-width="2.5">${titleText}</text>

    <text x="352" y="142" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#e2e8f0" letter-spacing="1.2">COLLECTOR&apos;S ARCHIVE EDITION</text>
    <text x="352" y="172" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="600" fill="#cbd5e1">${creatorsText.slice(
      0,
      36
    )}</text>

    ${eventBadge}
    ${buildCoverArtMotif(palette.motif, palette.accent, palette.secondary)}

    <!-- Barcode Box -->
    <g transform="translate(34, 772)">
      <rect width="126" height="92" rx="6" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
      <g fill="#0f172a" transform="translate(12, 14)">
        <rect x="0" y="0" width="4" height="52"/>
        <rect x="8" y="0" width="2" height="52"/>
        <rect x="14" y="0" width="6" height="52"/>
        <rect x="24" y="0" width="3" height="52"/>
        <rect x="31" y="0" width="7" height="52"/>
        <rect x="42" y="0" width="2" height="52"/>
        <rect x="48" y="0" width="5" height="52"/>
        <rect x="57" y="0" width="3" height="52"/>
        <rect x="64" y="0" width="8" height="52"/>
        <rect x="76" y="0" width="3" height="52"/>
        <rect x="83" y="0" width="6" height="52"/>
        <rect x="93" y="0" width="4" height="52"/>
      </g>
      <text x="63" y="81" text-anchor="middle" font-family="monospace" font-size="11" font-weight="700" fill="#0f172a">DIRECT EDITION</text>
    </g>

    <!-- Footer Issue Tag -->
    <rect x="372" y="808" width="194" height="54" rx="10" fill="rgba(15,23,42,0.85)" stroke="${palette.secondary}" stroke-width="2.5"/>
    <text x="469" y="842" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="20" font-weight="900" fill="#ffffff">ISSUE ${issueText}</text>

    <!-- Outer Cover Border -->
    <rect x="6" y="6" width="588" height="888" fill="none" stroke="#ffffff" stroke-width="4" stroke-opacity="0.28" rx="10"/>
  `;

  if (!isFullSpread) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">${frontSvgInner}</svg>`;
  }

  // 1200x900 Wraparound Full Spread (Back Cover + Spine + Front Cover)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
    <defs>
      <linearGradient id="backBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.bg2}"/>
        <stop offset="100%" stop-color="${palette.bg1}"/>
      </linearGradient>
    </defs>
    <!-- Back Cover (Left 580px) -->
    <rect x="0" y="0" width="580" height="900" fill="url(#backBg)"/>
    <g opacity="0.24" transform="translate(-30, 0)">
      ${buildCoverArtMotif(palette.motif, palette.secondary, palette.accent)}
    </g>
    <rect x="44" y="64" width="492" height="190" rx="16" fill="rgba(15,23,42,0.78)" stroke="${palette.accent}" stroke-width="3"/>
    <text x="290" y="114" text-anchor="middle" font-family="Impact, Arial Black, sans-serif" font-size="28" fill="${palette.secondary}">WRAPAROUND ARCHIVAL SPREAD</text>
    <text x="290" y="156" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#e2e8f0">${titleText} ${issueText}</text>
    <text x="290" y="192" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#94a3b8">Gatefold Back-to-Front Illustration Showcase</text>
    <text x="290" y="224" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#cbd5e1">${creatorsText}</text>

    <rect x="44" y="720" width="492" height="120" rx="14" fill="rgba(15,23,42,0.82)" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
    <text x="290" y="768" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="20" fill="#ffffff">VERIFIED FIRST PRINTING</text>
    <text x="290" y="802" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#cbd5e1">Preserved in Comic Archive Pro Digital Vault</text>

    <!-- Spine (580px - 620px) -->
    <rect x="580" y="0" width="40" height="900" fill="#090d16"/>
    <text x="600" y="450" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="18" fill="${palette.secondary}" transform="rotate(-90 600 450)">${titleText} ${issueText} • ${yearText}</text>

    <!-- Front Cover (Right 600px) -->
    <g transform="translate(600, 0)">
      ${frontSvgInner}
    </g>
  </svg>`;
}

function createDemoDataset() {
  const now = '2026-11-16T10:00:00.000Z';
  const staleDate = '2026-08-15T10:00:00.000Z';

  const boxes = [
    {
      id: 1,
      name: 'Box 01 - Amazing Spider-Man & Marvel Keys',
      location: 'Top Shelf - Left',
      maxCapacity: 150,
      colorTag: '#EF4444',
      notes: 'Key Spider-Man & cosmic crossover runs',
      updatedAt: now,
    },
    {
      id: 2,
      name: 'Box 02 - X-Men & Mutants (1980s-1990s)',
      location: 'Top Shelf - Center',
      maxCapacity: 150,
      colorTag: '#F59E0B',
      notes: 'Claremont & Lee era issues',
      updatedAt: now,
    },
    {
      id: 3,
      name: 'Box 03 - Batman & Gotham Detective Run',
      location: 'Top Shelf - Right',
      maxCapacity: 150,
      colorTag: '#3B82F6',
      notes: 'Year One, Knightfall & Gotham classics',
      updatedAt: now,
    },
    {
      id: 4,
      name: 'Box 04 - Image, Vertigo & Creator Owned',
      location: 'Middle Rack - Shelf 1',
      maxCapacity: 150,
      colorTag: '#8B5CF6',
      notes: 'Spawn, Saga & Sandman',
      updatedAt: now,
    },
  ];

  const asm300Characters = [
    { id: 'ch-1', characterName: 'Spider-Man (Peter Parker)', appearanceType: 'Main' },
    { id: 'ch-2', characterName: 'Venom (Eddie Brock)', appearanceType: 'Main' },
    { id: 'ch-3', characterName: 'Mary Jane Watson', appearanceType: 'Main' },
    { id: 'ch-4', characterName: 'Aunt May', appearanceType: 'Supporting' },
    { id: 'ch-5', characterName: 'J. Jonah Jameson', appearanceType: 'Supporting' },
    { id: 'ch-6', characterName: 'Robbie Robertson', appearanceType: 'Supporting' },
    { id: 'ch-7', characterName: 'Reed Richards (Mr. Fantastic)', appearanceType: 'Cameo' },
    { id: 'ch-8', characterName: 'Flash Thompson', appearanceType: 'Supporting' },
    { id: 'ch-9', characterName: 'Betty Brant', appearanceType: 'Cameo' },
    { id: 'ch-10', characterName: 'Liz Allan', appearanceType: 'Cameo' },
  ];

  const comics = [
    {
      id: 'demo-asm-300',
      title: 'The Amazing Spider-Man',
      seriesName: 'The Amazing Spider-Man (1963 - 1998)',
      issueNumber: '300',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1988,
      publicationMonth: 'May',
      publicationDate: '1988-05-01',
      genre: 'Superhero',
      writer: 'David Michelinie',
      artist: 'Todd McFarlane',
      coverArtist: 'Todd McFarlane',
      event: 'Symbiote Saga',
      coverImage: '/demo-covers/demo-asm-300.svg',
      coverImageFull: '/demo-covers/demo-asm-300-full.svg',
      masterCoverImage: '/demo-covers/demo-asm-300.svg',
      masterCoverImageFull: '/demo-covers/demo-asm-300-full.svg',
      format: 'Single Issue',
      sizeThickness: 1.5,
      copiesOwned: 1,
      currentBoxId: 1,
      readingStatus: 'Reading',
      readCount: 1,
      rating: 5,
      condition: 'Near Mint',
      estimatedValue: 485.0,
      previousEstimatedValue: 450.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['First Appearance', 'Venom', 'Key Issue', '30th Anniversary'],
      notes: 'First full appearance of Venom (Eddie Brock). Iconic Todd McFarlane cover art.',
      creatorContributions: [
        { id: 'cr-1', creatorName: 'David Michelinie', roleName: 'Writer' },
        { id: 'cr-2', creatorName: 'Todd McFarlane', roleName: 'Penciller' },
        { id: 'cr-3', creatorName: 'Todd McFarlane', roleName: 'Cover Artist' },
        { id: 'cr-4', creatorName: 'Bob Sharen', roleName: 'Colorist' },
        { id: 'cr-5', creatorName: 'Rick Parker', roleName: 'Letterer' },
      ],
      characterAppearances: asm300Characters,
      createdAt: '2025-01-10T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#090d16', bg2: '#1e293b', accent: '#ef4444', secondary: '#ffffff', motif: 'symbiote' },
    },
    {
      id: 'demo-asm-298',
      title: 'The Amazing Spider-Man',
      seriesName: 'The Amazing Spider-Man (1963 - 1998)',
      issueNumber: '298',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1988,
      publicationMonth: 'March',
      publicationDate: '1988-03-01',
      genre: 'Superhero',
      writer: 'David Michelinie',
      artist: 'Todd McFarlane',
      event: 'Symbiote Saga',
      coverImage: '/demo-covers/demo-asm-298.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 1,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 2,
      rating: 5,
      condition: 'Near Mint',
      estimatedValue: 165.0,
      previousEstimatedValue: 150.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Todd McFarlane', 'Cameo Venom'],
      creatorContributions: [
        { id: 'cr-6', creatorName: 'David Michelinie', roleName: 'Writer' },
        { id: 'cr-7', creatorName: 'Todd McFarlane', roleName: 'Penciller' },
      ],
      characterAppearances: [
        { id: 'ch-11', characterName: 'Spider-Man (Peter Parker)', appearanceType: 'Main' },
        { id: 'ch-12', characterName: 'Venom (Eddie Brock)', appearanceType: 'Cameo' },
      ],
      createdAt: '2025-01-09T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#1d4ed8', bg2: '#7f1d1d', accent: '#ef4444', secondary: '#facc15', motif: 'spider' },
    },
    {
      id: 'demo-asm-299',
      title: 'The Amazing Spider-Man',
      seriesName: 'The Amazing Spider-Man (1963 - 1998)',
      issueNumber: '299',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1988,
      publicationMonth: 'April',
      publicationDate: '1988-04-01',
      genre: 'Superhero',
      writer: 'David Michelinie',
      artist: 'Todd McFarlane',
      event: 'Symbiote Saga',
      coverImage: '/demo-covers/demo-asm-299.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 0,
      currentBoxId: -1,
      readingStatus: 'Wishlist',
      condition: 'Near Mint',
      estimatedValue: 118.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Gap Filler', 'Symbiote'],
      creatorContributions: [
        { id: 'cr-8', creatorName: 'David Michelinie', roleName: 'Writer' },
        { id: 'cr-9', creatorName: 'Todd McFarlane', roleName: 'Penciller' },
      ],
      characterAppearances: [
        { id: 'ch-13', characterName: 'Spider-Man (Peter Parker)', appearanceType: 'Main' },
        { id: 'ch-14', characterName: 'Venom (Eddie Brock)', appearanceType: 'Cameo' },
      ],
      createdAt: '2025-01-09T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#0f172a', bg2: '#991b1b', accent: '#dc2626', secondary: '#fde047', motif: 'spider' },
    },
    {
      id: 'demo-asm-301',
      title: 'The Amazing Spider-Man',
      seriesName: 'The Amazing Spider-Man (1963 - 1998)',
      issueNumber: '301',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1988,
      publicationMonth: 'June',
      publicationDate: '1988-06-01',
      genre: 'Superhero',
      writer: 'David Michelinie',
      artist: 'Todd McFarlane',
      event: 'Symbiote Saga',
      coverImage: '/demo-covers/demo-asm-301.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 1,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 1,
      rating: 4,
      condition: 'Near Mint',
      estimatedValue: 74.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Red & Blue Return'],
      creatorContributions: [
        { id: 'cr-10', creatorName: 'David Michelinie', roleName: 'Writer' },
        { id: 'cr-11', creatorName: 'Todd McFarlane', roleName: 'Penciller' },
      ],
      characterAppearances: [{ id: 'ch-15', characterName: 'Spider-Man (Peter Parker)', appearanceType: 'Main' }],
      createdAt: '2025-01-11T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#991b1b', bg2: '#1e3a8a', accent: '#3b82f6', secondary: '#ffffff', motif: 'spider' },
    },
    {
      id: 'demo-uxm-141',
      title: 'Uncanny X-Men',
      seriesName: 'Uncanny X-Men (1963 - 2011)',
      issueNumber: '141',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1981,
      publicationMonth: 'January',
      publicationDate: '1981-01-01',
      genre: 'Superhero',
      writer: 'Chris Claremont',
      artist: 'John Byrne',
      event: 'Days of Future Past',
      coverImage: '/demo-covers/demo-uxm-141.svg',
      coverImageFull: '/demo-covers/demo-uxm-141-full.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 1,
      currentBoxId: 2,
      readingStatus: 'Read',
      readCount: 3,
      rating: 5,
      condition: 'Very Fine',
      estimatedValue: 225.0,
      previousEstimatedValue: 210.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Classic', 'Wolverine', 'Time Travel'],
      creatorContributions: [
        { id: 'cr-12', creatorName: 'Chris Claremont', roleName: 'Writer' },
        { id: 'cr-13', creatorName: 'John Byrne', roleName: 'Penciller' },
        { id: 'cr-14', creatorName: 'Terry Austin', roleName: 'Inker' },
      ],
      characterAppearances: [
        { id: 'ch-16', characterName: 'Wolverine', appearanceType: 'Main' },
        { id: 'ch-17', characterName: 'Kitty Pryde', appearanceType: 'Main' },
        { id: 'ch-18', characterName: 'Storm', appearanceType: 'Supporting' },
      ],
      createdAt: '2025-01-08T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#78350f', bg2: '#1e293b', accent: '#f59e0b', secondary: '#fde047', motif: 'claws' },
    },
    {
      id: 'demo-uxm-142',
      title: 'Uncanny X-Men',
      seriesName: 'Uncanny X-Men (1963 - 2011)',
      issueNumber: '142',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1981,
      publicationMonth: 'February',
      publicationDate: '1981-02-01',
      genre: 'Superhero',
      writer: 'Chris Claremont',
      artist: 'John Byrne',
      event: 'Days of Future Past',
      coverImage: '/demo-covers/demo-uxm-142.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 1,
      currentBoxId: 2,
      readingStatus: 'Read',
      readCount: 2,
      rating: 5,
      condition: 'Near Mint',
      estimatedValue: 135.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Classic', 'Sentinels'],
      creatorContributions: [
        { id: 'cr-15', creatorName: 'Chris Claremont', roleName: 'Writer' },
        { id: 'cr-16', creatorName: 'John Byrne', roleName: 'Penciller' },
      ],
      characterAppearances: [
        { id: 'ch-19', characterName: 'Wolverine', appearanceType: 'Main' },
        { id: 'ch-20', characterName: 'Colossus', appearanceType: 'Supporting' },
      ],
      createdAt: '2025-01-08T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#991b1b', bg2: '#312e81', accent: '#f59e0b', secondary: '#fef08a', motif: 'claws' },
    },
    {
      id: 'demo-xmen-1',
      title: 'X-Men',
      seriesName: 'X-Men (1991 - 2001)',
      issueNumber: '1',
      volume: 'Vol. 2',
      publisher: 'Marvel Comics',
      publicationYear: 1991,
      publicationMonth: 'October',
      publicationDate: '1991-10-01',
      genre: 'Superhero',
      writer: 'Chris Claremont',
      artist: 'Jim Lee',
      coverImage: '/demo-covers/demo-xmen-1.svg',
      coverImageFull: '/demo-covers/demo-xmen-1-full.svg',
      format: 'Single Issue',
      sizeThickness: 1.5,
      copiesOwned: 1,
      currentBoxId: 2,
      readingStatus: 'Unread',
      readCount: 0,
      rating: 5,
      condition: 'Gem Mint',
      estimatedValue: 48.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Gatefold Cover', 'Jim Lee'],
      creatorContributions: [
        { id: 'cr-17', creatorName: 'Chris Claremont', roleName: 'Writer' },
        { id: 'cr-18', creatorName: 'Jim Lee', roleName: 'Penciller' },
      ],
      characterAppearances: [
        { id: 'ch-21', characterName: 'Wolverine', appearanceType: 'Main' },
        { id: 'ch-22', characterName: 'Cyclops', appearanceType: 'Main' },
        { id: 'ch-23', characterName: 'Magneto', appearanceType: 'Main' },
      ],
      createdAt: '2025-01-12T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#0f172a', bg2: '#064e3b', accent: '#eab308', secondary: '#38bdf8', motif: 'claws' },
    },
    {
      id: 'demo-ig-1',
      title: 'The Infinity Gauntlet',
      seriesName: 'The Infinity Gauntlet (1991)',
      issueNumber: '1',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1991,
      publicationMonth: 'July',
      publicationDate: '1991-07-01',
      genre: 'Sci-Fi',
      writer: 'Jim Starlin',
      artist: 'George Pérez',
      event: 'Infinity Gauntlet',
      coverImage: '/demo-covers/demo-ig-1.svg',
      format: 'Single Issue',
      sizeThickness: 1.2,
      copiesOwned: 1,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 2,
      rating: 5,
      condition: 'Near Mint',
      estimatedValue: 82.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Thanos', 'Cosmic'],
      creatorContributions: [
        { id: 'cr-19', creatorName: 'Jim Starlin', roleName: 'Writer' },
        { id: 'cr-20', creatorName: 'George Pérez', roleName: 'Penciller' },
      ],
      characterAppearances: [
        { id: 'ch-24', characterName: 'Thanos', appearanceType: 'Main' },
        { id: 'ch-25', characterName: 'Silver Surfer', appearanceType: 'Supporting' },
      ],
      createdAt: '2025-01-07T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#312e81', bg2: '#581c87', accent: '#f59e0b', secondary: '#c084fc', motif: 'gauntlet' },
    },
    {
      id: 'demo-ig-2',
      title: 'The Infinity Gauntlet',
      seriesName: 'The Infinity Gauntlet (1991)',
      issueNumber: '2',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1991,
      publicationMonth: 'August',
      publicationDate: '1991-08-01',
      genre: 'Sci-Fi',
      writer: 'Jim Starlin',
      artist: 'George Pérez',
      event: 'Infinity Gauntlet',
      coverImage: '/demo-covers/demo-ig-2.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 1,
      currentBoxId: 1,
      readingStatus: 'Unread',
      readCount: 0,
      rating: 4,
      condition: 'Near Mint',
      estimatedValue: 38.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Thanos'],
      creatorContributions: [
        { id: 'cr-21', creatorName: 'Jim Starlin', roleName: 'Writer' },
        { id: 'cr-22', creatorName: 'George Pérez', roleName: 'Penciller' },
      ],
      characterAppearances: [{ id: 'ch-26', characterName: 'Thanos', appearanceType: 'Main' }],
      createdAt: '2025-01-07T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#4c1d95', bg2: '#0f172a', accent: '#fbbf24', secondary: '#f472b6', motif: 'gauntlet' },
    },
    {
      id: 'demo-ig-3',
      title: 'The Infinity Gauntlet',
      seriesName: 'The Infinity Gauntlet (1991)',
      issueNumber: '3',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1991,
      publicationMonth: 'September',
      publicationDate: '1991-09-01',
      genre: 'Sci-Fi',
      writer: 'Jim Starlin',
      artist: 'George Pérez',
      event: 'Infinity Gauntlet',
      coverImage: '/demo-covers/demo-ig-3.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 0,
      currentBoxId: -1,
      readingStatus: 'Wishlist',
      condition: 'Near Mint',
      estimatedValue: 34.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Gap Filler', 'Infinity Gauntlet'],
      creatorContributions: [
        { id: 'cr-23', creatorName: 'Jim Starlin', roleName: 'Writer' },
        { id: 'cr-24', creatorName: 'George Pérez', roleName: 'Penciller' },
      ],
      characterAppearances: [{ id: 'ch-27', characterName: 'Thanos', appearanceType: 'Main' }],
      createdAt: '2025-01-07T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#1e1b4b', bg2: '#701a75', accent: '#f59e0b', secondary: '#38bdf8', motif: 'gauntlet' },
    },
    {
      id: 'demo-bat-404',
      title: 'Batman',
      seriesName: 'Batman (1940 - 2011)',
      issueNumber: '404',
      volume: 'Vol. 1',
      publisher: 'DC Comics',
      publicationYear: 1987,
      publicationMonth: 'February',
      publicationDate: '1987-02-01',
      genre: 'Crime',
      writer: 'Frank Miller',
      artist: 'David Mazzucchelli',
      event: 'Batman: Year One',
      coverImage: '/demo-covers/demo-bat-404.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 1,
      currentBoxId: 3,
      readingStatus: 'Read',
      readCount: 2,
      rating: 5,
      condition: 'Near Mint',
      estimatedValue: 95.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Year One', 'Origin'],
      creatorContributions: [
        { id: 'cr-25', creatorName: 'Frank Miller', roleName: 'Writer' },
        { id: 'cr-26', creatorName: 'David Mazzucchelli', roleName: 'Penciller' },
      ],
      characterAppearances: [
        { id: 'ch-28', characterName: 'Batman (Bruce Wayne)', appearanceType: 'Main' },
        { id: 'ch-29', characterName: 'James Gordon', appearanceType: 'Main' },
      ],
      createdAt: '2025-01-06T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#090d16', bg2: '#1e293b', accent: '#facc15', secondary: '#94a3b8', motif: 'bat' },
    },
    {
      id: 'demo-bat-405',
      title: 'Batman',
      seriesName: 'Batman (1940 - 2011)',
      issueNumber: '405',
      volume: 'Vol. 1',
      publisher: 'DC Comics',
      publicationYear: 1987,
      publicationMonth: 'March',
      publicationDate: '1987-03-01',
      genre: 'Crime',
      writer: 'Frank Miller',
      artist: 'David Mazzucchelli',
      event: 'Batman: Year One',
      coverImage: '/demo-covers/demo-bat-405.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 1,
      currentBoxId: 3,
      readingStatus: 'Unread',
      readCount: 0,
      rating: 5,
      condition: 'Near Mint',
      estimatedValue: 44.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Year One'],
      creatorContributions: [
        { id: 'cr-27', creatorName: 'Frank Miller', roleName: 'Writer' },
        { id: 'cr-28', creatorName: 'David Mazzucchelli', roleName: 'Penciller' },
      ],
      characterAppearances: [{ id: 'ch-30', characterName: 'Batman (Bruce Wayne)', appearanceType: 'Main' }],
      createdAt: '2025-01-06T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#111827', bg2: '#334155', accent: '#eab308', secondary: '#e2e8f0', motif: 'bat' },
    },
    {
      id: 'demo-bat-497',
      title: 'Batman',
      seriesName: 'Batman (1940 - 2011)',
      issueNumber: '497',
      volume: 'Vol. 1',
      publisher: 'DC Comics',
      publicationYear: 1993,
      publicationMonth: 'July',
      publicationDate: '1993-07-01',
      genre: 'Superhero',
      writer: 'Doug Moench',
      artist: 'Jim Aparo',
      event: 'Knightfall',
      coverImage: '/demo-covers/demo-bat-497.svg',
      format: 'Single Issue',
      sizeThickness: 1.2,
      copiesOwned: 1,
      currentBoxId: 3,
      readingStatus: 'Unread',
      readCount: 0,
      rating: 4,
      condition: 'Very Fine',
      estimatedValue: 52.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Bane', 'Knightfall'],
      creatorContributions: [
        { id: 'cr-29', creatorName: 'Doug Moench', roleName: 'Writer' },
        { id: 'cr-30', creatorName: 'Jim Aparo', roleName: 'Penciller' },
      ],
      characterAppearances: [
        { id: 'ch-31', characterName: 'Batman (Bruce Wayne)', appearanceType: 'Main' },
        { id: 'ch-32', characterName: 'Bane', appearanceType: 'Main' },
      ],
      createdAt: '2025-01-05T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#1e293b', bg2: '#0f172a', accent: '#38bdf8', secondary: '#facc15', motif: 'bat' },
    },
    {
      id: 'demo-watchmen-1',
      title: 'Watchmen',
      seriesName: 'Watchmen (1986 - 1987)',
      issueNumber: '1',
      volume: 'Vol. 1',
      publisher: 'DC Comics',
      publicationYear: 1986,
      publicationMonth: 'September',
      publicationDate: '1986-09-01',
      genre: 'Mystery',
      writer: 'Alan Moore',
      artist: 'Dave Gibbons',
      coverImage: '/demo-covers/demo-watchmen-1.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 1,
      currentBoxId: 3,
      readingStatus: 'Read',
      readCount: 2,
      rating: 5,
      condition: 'Near Mint',
      estimatedValue: 112.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Graphic Classic', 'Alan Moore'],
      creatorContributions: [
        { id: 'cr-31', creatorName: 'Alan Moore', roleName: 'Writer' },
        { id: 'cr-32', creatorName: 'Dave Gibbons', roleName: 'Penciller' },
      ],
      characterAppearances: [{ id: 'ch-33', characterName: 'Rorschach', appearanceType: 'Main' }],
      createdAt: '2025-01-05T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#ca8a04', bg2: '#713f12', accent: '#ef4444', secondary: '#facc15', motif: 'cosmic' },
    },
    {
      id: 'demo-spawn-1',
      title: 'Spawn',
      seriesName: 'Spawn (1992 - Present)',
      issueNumber: '1',
      volume: 'Vol. 1',
      publisher: 'Image Comics',
      publicationYear: 1992,
      publicationMonth: 'May',
      publicationDate: '1992-05-01',
      genre: 'Horror',
      writer: 'Todd McFarlane',
      artist: 'Todd McFarlane',
      coverImage: '/demo-covers/demo-spawn-1.svg',
      coverImageFull: '/demo-covers/demo-spawn-1-full.svg',
      format: 'Single Issue',
      sizeThickness: 1.2,
      copiesOwned: 1,
      currentBoxId: 4,
      readingStatus: 'Read',
      readCount: 1,
      rating: 5,
      condition: 'Gem Mint',
      estimatedValue: 64.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Image Launch', 'Todd McFarlane'],
      creatorContributions: [
        { id: 'cr-33', creatorName: 'Todd McFarlane', roleName: 'Writer' },
        { id: 'cr-34', creatorName: 'Todd McFarlane', roleName: 'Penciller' },
      ],
      characterAppearances: [{ id: 'ch-34', characterName: 'Spawn (Al Simmons)', appearanceType: 'Main' }],
      createdAt: '2025-01-04T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#090d16', bg2: '#450a0a', accent: '#22c55e', secondary: '#ef4444', motif: 'spawn' },
    },
    {
      id: 'demo-saga-1',
      title: 'Saga',
      seriesName: 'Saga (2012 - Present)',
      issueNumber: '1',
      volume: 'Vol. 1',
      publisher: 'Image Comics',
      publicationYear: 2012,
      publicationMonth: 'March',
      publicationDate: '2012-03-01',
      genre: 'Sci-Fi',
      writer: 'Brian K. Vaughan',
      artist: 'Fiona Staples',
      coverImage: '/demo-covers/demo-saga-1.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 1,
      currentBoxId: 4,
      readingStatus: 'Read',
      readCount: 2,
      rating: 5,
      condition: 'Near Mint',
      estimatedValue: 145.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['First Print', 'Modern Classic'],
      creatorContributions: [
        { id: 'cr-35', creatorName: 'Brian K. Vaughan', roleName: 'Writer' },
        { id: 'cr-36', creatorName: 'Fiona Staples', roleName: 'Penciller' },
      ],
      characterAppearances: [
        { id: 'ch-35', characterName: 'Alana', appearanceType: 'Main' },
        { id: 'ch-36', characterName: 'Marko', appearanceType: 'Main' },
      ],
      createdAt: '2025-01-03T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#0f766e', bg2: '#1e1b4b', accent: '#f43f5e', secondary: '#fde047', motif: 'cosmic' },
    },
    {
      id: 'demo-sandman-1',
      title: 'The Sandman',
      seriesName: 'The Sandman (1989 - 1996)',
      issueNumber: '1',
      volume: 'Vol. 2',
      publisher: 'Vertigo',
      publicationYear: 1989,
      publicationMonth: 'January',
      publicationDate: '1989-01-01',
      genre: 'Fantasy',
      writer: 'Neil Gaiman',
      artist: 'Sam Kieth',
      coverImage: '/demo-covers/demo-sandman-1.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 0,
      currentBoxId: -1,
      readingStatus: 'Wishlist',
      condition: 'Near Mint',
      estimatedValue: 115.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['Vertigo', 'First Morpheus'],
      creatorContributions: [
        { id: 'cr-37', creatorName: 'Neil Gaiman', roleName: 'Writer' },
        { id: 'cr-38', creatorName: 'Sam Kieth', roleName: 'Penciller' },
      ],
      characterAppearances: [{ id: 'ch-37', characterName: 'Dream (Morpheus)', appearanceType: 'Main' }],
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#1e1b4b', bg2: '#090d16', accent: '#a855f7', secondary: '#e2e8f0', motif: 'cosmic' },
    },
    {
      id: 'demo-asm-252',
      title: 'The Amazing Spider-Man',
      seriesName: 'The Amazing Spider-Man (1963 - 1998)',
      issueNumber: '252',
      volume: 'Vol. 1',
      publisher: 'Marvel Comics',
      publicationYear: 1984,
      publicationMonth: 'May',
      publicationDate: '1984-05-01',
      genre: 'Superhero',
      writer: 'Tom DeFalco',
      artist: 'Ron Frenz',
      event: 'Secret Wars',
      coverImage: '/demo-covers/demo-asm-252.svg',
      format: 'Single Issue',
      sizeThickness: 1.0,
      copiesOwned: 1,
      currentBoxId: 1,
      readingStatus: 'Read',
      readCount: 2,
      rating: 5,
      condition: 'Near Mint',
      estimatedValue: 310.0,
      valueUpdatedAt: staleDate,
      valueSource: 'PriceCharting',
      tags: ['First Black Suit', 'Key Issue'],
      creatorContributions: [
        { id: 'cr-39', creatorName: 'Tom DeFalco', roleName: 'Writer' },
        { id: 'cr-40', creatorName: 'Ron Frenz', roleName: 'Penciller' },
      ],
      characterAppearances: [{ id: 'ch-38', characterName: 'Spider-Man (Peter Parker)', appearanceType: 'Main' }],
      createdAt: '2025-01-11T00:00:00.000Z',
      updatedAt: now,
      _palette: { bg1: '#090d16', bg2: '#3b0764', accent: '#e11d48', secondary: '#ffffff', motif: 'symbiote' },
    },
  ];

  const seriesTotals = [
    { seriesName: 'The Amazing Spider-Man (1963 - 1998)', publisher: 'Marvel Comics', issueCount: 5, volume: 'Vol. 1' },
    { seriesName: 'Uncanny X-Men (1963 - 2011)', publisher: 'Marvel Comics', issueCount: 2, volume: 'Vol. 1' },
    { seriesName: 'The Infinity Gauntlet (1991)', publisher: 'Marvel Comics', issueCount: 3, volume: 'Vol. 1' },
    { seriesName: 'Batman (1940 - 2011)', publisher: 'DC Comics', issueCount: 3, volume: 'Vol. 1' },
    { seriesName: 'Watchmen (1986 - 1987)', publisher: 'DC Comics', issueCount: 1, volume: 'Vol. 1' },
    { seriesName: 'Spawn (1992 - Present)', publisher: 'Image Comics', issueCount: 1, volume: 'Vol. 1' },
  ];

  const creatorTypes = ['Writer', 'Penciller', 'Inker', 'Colorist', 'Letterer', 'Cover Artist'];

  return { boxes, comics, seriesTotals, creatorTypes };
}

async function installOverlayScript(page) {
  await page.addInitScript(() => {
    function mountDemoOverlay() {
      if (document.getElementById('demo-overlay-root')) return;

      const style = document.createElement('style');
      style.id = 'demo-overlay-styles';
      style.textContent = `
        #demo-overlay-root {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 2147483647;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
        }
        #demo-cursor {
          position: fixed;
          left: -100px;
          top: -100px;
          width: 28px;
          height: 28px;
          transform: translate(-3px, -3px);
          transition: left 240ms cubic-bezier(0.22, 1, 0.36, 1), top 240ms cubic-bezier(0.22, 1, 0.36, 1), transform 90ms ease-out;
          filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.45));
        }
        #demo-cursor.no-glide {
          transition: transform 90ms ease-out;
        }
        #demo-cursor.clicking {
          transform: translate(-3px, -3px) scale(0.84);
        }
        .demo-ripple {
          position: fixed;
          width: 22px;
          height: 22px;
          margin-left: -11px;
          margin-top: -11px;
          border-radius: 9999px;
          border: 3px solid #6366f1;
          background: rgba(99, 102, 241, 0.25);
          animation: demoRippleAnim 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes demoRippleAnim {
          0% { transform: scale(0.4); opacity: 1; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        #demo-caption-bar {
          position: fixed;
          left: 24px;
          bottom: 20px;
          max-width: 610px;
          background: rgba(15, 23, 42, 0.88);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          color: #f8fafc;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-left: 5px solid #6366f1;
          border-radius: 14px;
          padding: 10px 18px;
          box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.45);
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 260ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        #demo-caption-bar.visible {
          opacity: 1;
          transform: translateY(0);
        }
        #demo-caption-chapter {
          display: inline-block;
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #a5b4fc;
          margin-bottom: 2px;
        }
        #demo-caption-title {
          font-size: 16.5px;
          font-weight: 800;
          line-height: 1.2;
          color: #ffffff;
          margin-bottom: 2px;
        }
        #demo-caption-sub {
          font-size: 12.5px;
          font-weight: 500;
          line-height: 1.35;
          color: #cbd5e1;
        }
        #demo-title-card {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 48px;
          background: radial-gradient(circle at 50% 35%, rgba(49, 46, 129, 0.94), rgba(9, 13, 22, 0.97));
          color: #ffffff;
          opacity: 0;
          transition: opacity 420ms ease;
        }
        #demo-title-card.visible {
          opacity: 1;
        }
        #demo-title-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          border-radius: 9999px;
          background: rgba(99, 102, 241, 0.25);
          border: 1px solid rgba(165, 180, 252, 0.45);
          color: #c7d2fe;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 20px;
        }
        #demo-title-main {
          font-size: 62px;
          font-weight: 900;
          letter-spacing: -0.025em;
          line-height: 1.05;
          margin-bottom: 16px;
          background: linear-gradient(135deg, #ffffff 0%, #e0e7ff 55%, #f59e0b 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        #demo-title-sub {
          font-size: 22px;
          font-weight: 500;
          color: #cbd5e1;
          max-width: 820px;
          line-height: 1.45;
          margin-bottom: 28px;
        }
        #demo-title-tags {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px;
          max-width: 900px;
        }
        .demo-tag {
          padding: 8px 16px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.16);
          font-size: 14px;
          font-weight: 700;
          color: #f1f5f9;
        }
      `;
      document.head.appendChild(style);

      const root = document.createElement('div');
      root.id = 'demo-overlay-root';
      root.innerHTML = `
        <div id="demo-title-card">
          <div id="demo-title-pill">Comic Archive Pro • Product Walkthrough</div>
          <div id="demo-title-main">Comic Archive Pro</div>
          <div id="demo-title-sub">Configurable Storage Box, 3D Visualizer, Market Valuation &amp; Collection Analytics Platform</div>
          <div id="demo-title-tags"></div>
        </div>
        <div id="demo-caption-bar">
          <div id="demo-caption-chapter"></div>
          <div id="demo-caption-title"></div>
          <div id="demo-caption-sub"></div>
        </div>
        <svg id="demo-cursor" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3.5 2.5L23.5 13.5L14.2 15.8L10.2 24.5L3.5 2.5Z" fill="#ffffff" stroke="#0f172a" stroke-width="2.2" stroke-linejoin="round"/>
        </svg>
      `;
      document.body.appendChild(root);

      const cursorEl = document.getElementById('demo-cursor');
      const captionEl = document.getElementById('demo-caption-bar');
      const capChapterEl = document.getElementById('demo-caption-chapter');
      const capTitleEl = document.getElementById('demo-caption-title');
      const capSubEl = document.getElementById('demo-caption-sub');
      const titleCardEl = document.getElementById('demo-title-card');
      const titlePillEl = document.getElementById('demo-title-pill');
      const titleMainEl = document.getElementById('demo-title-main');
      const titleSubEl = document.getElementById('demo-title-sub');
      const titleTagsEl = document.getElementById('demo-title-tags');

      window.__demoOverlay = {
        moveCursor(x, y, instant = false) {
          if (instant) cursorEl.classList.add('no-glide');
          else cursorEl.classList.remove('no-glide');
          cursorEl.style.left = `${x}px`;
          cursorEl.style.top = `${y}px`;
        },
        clickRipple(x, y) {
          cursorEl.style.left = `${x}px`;
          cursorEl.style.top = `${y}px`;
          cursorEl.classList.add('clicking');
          setTimeout(() => cursorEl.classList.remove('clicking'), 160);

          const ripple = document.createElement('div');
          ripple.className = 'demo-ripple';
          ripple.style.left = `${x}px`;
          ripple.style.top = `${y}px`;
          root.appendChild(ripple);
          setTimeout(() => ripple.remove(), 550);
        },
        setCaption(chapter, title, subtitle) {
          capChapterEl.textContent = chapter || '';
          capTitleEl.textContent = title || '';
          capSubEl.textContent = subtitle || '';
          captionEl.classList.add('visible');
        },
        hideCaption() {
          captionEl.classList.remove('visible');
        },
        showTitleCard(pill, mainTitle, subtitle, tags = []) {
          titlePillEl.textContent = pill;
          titleMainEl.textContent = mainTitle;
          titleSubEl.textContent = subtitle;
          titleTagsEl.innerHTML = tags.map((t) => `<span class="demo-tag">${t}</span>`).join('');
          titleCardEl.classList.add('visible');
        },
        hideTitleCard() {
          titleCardEl.classList.remove('visible');
        },
      };
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountDemoOverlay);
    } else {
      mountDemoOverlay();
    }
  });
}

let cursorPos = { x: 960, y: 540 };

async function smoothMoveTo(page, targetX, targetY, durationMs = 150) {
  await page.evaluate(([cx, cy]) => window.__demoOverlay?.moveCursor(cx, cy, false), [targetX, targetY]);
  await page.mouse.move(targetX, targetY);
  if (durationMs > 0) await page.waitForTimeout(durationMs);
  cursorPos = { x: targetX, y: targetY };
}

async function moveAndClick(page, locator, options = {}) {
  const { dwellMs = 30, postWaitMs = 280 } = options;
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Target locator has no bounding box for demo click.');
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await smoothMoveTo(page, cx, cy, 140);
  if (dwellMs > 0) await page.waitForTimeout(dwellMs);
  await page.evaluate(([x, y]) => window.__demoOverlay?.clickRipple(x, y), [cx, cy]);
  await page.mouse.click(cx, cy);
  if (postWaitMs > 0) await page.waitForTimeout(postWaitMs);
}

async function moveAndSelectOption(page, locator, value, postWaitMs = 450) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await smoothMoveTo(page, cx, cy, 220);
    await page.evaluate(([x, y]) => window.__demoOverlay?.clickRipple(x, y), [cx, cy]);
  }
  await locator.selectOption(value);
  await page.waitForTimeout(postWaitMs);
}

async function moveAndType(page, locator, text, { pressEnter = false, postWaitMs = 600 } = {}) {
  await moveAndClick(page, locator, { dwellMs: 60, postWaitMs: 80 });
  await locator.fill('');
  await page.keyboard.type(text, { delay: 32 });
  if (pressEnter) {
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(postWaitMs);
}

async function setCaption(page, chapter, title, subtitle) {
  await page.evaluate(
    ([ch, ti, su]) => window.__demoOverlay?.setCaption(ch, ti, su),
    [chapter, title, subtitle]
  );
}

async function setupDemoRoutes(page, dataset) {
  const { boxes, comics, seriesTotals, creatorTypes } = dataset;
  const comicMap = new Map(comics.map((c) => [c.id, c]));

  let activeChallenge = {
    challengeId: 101,
    name: 'Symbiote & Gotham Classics Sprint',
    status: 'Active',
    criteriaSnapshot: { version: 1, root: { type: 'collection' } },
    criteriaSummary: 'Entire Collection (Chronological TBR)',
    readingOrder: 'PublicationDate',
    sortDirection: 'Ascending',
    batchSize: 10,
    createdAt: '2026-11-01T12:00:00.000Z',
    startedAt: '2026-11-01T12:00:00.000Z',
    totalEligible: 4,
    readCount: 1,
    skippedCount: 0,
    resolvedCount: 1,
    remainingCount: 3,
    progressPercent: 25,
    queue: [
      {
        challengeItemId: 501,
        challengeId: 101,
        comicId: 'demo-bat-405',
        sequenceNumber: 1,
        status: 'Unread',
        addedAt: '2026-11-01T12:00:00.000Z',
        metadata: comicMap.get('demo-bat-405'),
        currentBoxId: 3,
        boxName: boxes[2].name,
        boxLocation: boxes[2].location,
        boxColorTag: boxes[2].colorTag,
      },
      {
        challengeItemId: 502,
        challengeId: 101,
        comicId: 'demo-ig-2',
        sequenceNumber: 2,
        status: 'Unread',
        addedAt: '2026-11-01T12:00:00.000Z',
        metadata: comicMap.get('demo-ig-2'),
        currentBoxId: 1,
        boxName: boxes[0].name,
        boxLocation: boxes[0].location,
        boxColorTag: boxes[0].colorTag,
      },
      {
        challengeItemId: 503,
        challengeId: 101,
        comicId: 'demo-xmen-1',
        sequenceNumber: 3,
        status: 'Unread',
        addedAt: '2026-11-01T12:00:00.000Z',
        metadata: comicMap.get('demo-xmen-1'),
        currentBoxId: 2,
        boxName: boxes[1].name,
        boxLocation: boxes[1].location,
        boxColorTag: boxes[1].colorTag,
      },
    ],
  };

  // Serve high-detail comic SVG covers cleanly for both <img> and Three.js TextureLoader
  await page.route('**/demo-covers/**', async (route) => {
    const urlPath = new URL(route.request().url()).pathname;
    const filename = path.basename(urlPath, '.svg');
    const isFull = filename.endsWith('-full');
    const id = isFull ? filename.slice(0, -5) : filename;
    const targetComic = comicMap.get(id) || comics[0];
    const svg = generateComicCoverSvg(targetComic, isFull);
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
      body: svg,
    });
  });

  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/api/collection', async (route) => {
    const stripPalette = ({ _palette, ...rest }) => rest;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        comics: comics.map(stripPalette),
        boxes,
        seriesTotals,
        creatorTypes,
      }),
    });
  });

  await page.route('**/api/sync', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        serverTime: new Date().toISOString(),
        isFullSync: false,
        pushedCount: 0,
        comics: [],
        boxes: [],
        seriesTotals: [],
        creatorTypes: [],
        deletedComicIds: [],
        deletedBoxIds: [],
      }),
    });
  });

  await page.route(/.*\/api\/comics.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route(/.*\/api\/boxes\/(-?\d+)\/comics.*/, async (route) => {
    const match = route.request().url().match(/\/api\/boxes\/(-?\d+)\/comics/);
    const boxId = match ? parseInt(match[1], 10) : 1;
    const boxObj = boxes.find((b) => b.id === boxId) || boxes[0];
    const boxComics = comics
      .filter((c) => c.readingStatus !== 'Wishlist' && (c.currentBoxId ?? 0) === boxId)
      .map(({ _palette, ...rest }) => rest);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        box: boxObj,
        comics: boxComics,
        count: boxComics.length,
      }),
    });
  });

  await page.route('**/api/reading-challenges/active', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ challenge: activeChallenge }),
    });
  });

  await page.route('**/api/reading-challenges/history', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        history: [
          {
            id: 99,
            name: '1980s Marvel Cosmic Saga',
            status: 'Completed',
            createdAt: '2026-09-10T00:00:00.000Z',
            startedAt: '2026-09-10T00:00:00.000Z',
            completedAt: '2026-10-05T00:00:00.000Z',
            totalEligible: 12,
            criteriaSummary: 'Story Arc: Secret Wars & Cosmic Events',
            readCount: 12,
            skippedCount: 0,
            completionPercent: 100,
          },
        ],
      }),
    });
  });

  await page.route(/.*\/api\/reading-challenges\/\d+\/items\/\d+\/read/, async (route) => {
    const match = route.request().url().match(/\/items\/(\d+)\/read/);
    const itemId = match ? parseInt(match[1], 10) : 501;
    activeChallenge = {
      ...activeChallenge,
      readCount: activeChallenge.readCount + 1,
      resolvedCount: activeChallenge.resolvedCount + 1,
      remainingCount: Math.max(0, activeChallenge.remainingCount - 1),
      progressPercent: 50,
      queue: activeChallenge.queue.filter((q) => q.challengeItemId !== itemId),
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(activeChallenge),
    });
  });

  await page.route(/.*\/api\/reading-challenges\/\d+\/insights/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        challengeId: 101,
        challengeName: activeChallenge.name,
        totalEligible: 4,
        readCount: activeChallenge.readCount,
        milestones: [],
      }),
    });
  });

  await page.route('**/api/valuation/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        isRunning: false,
        schedulerEnabled: true,
        staleThresholdDays: 30,
        dailyBatchLimit: 150,
        recentUpdates: [],
      }),
    });
  });

  await page.route('**/api/valuation/scheduler', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/api/valuation/lookup', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const base = Number(body.estimatedValue || 45);
    const updatedVal = Number((base * 1.07 + 2.5).toFixed(2));
    // Slight realistic delay so progress bar animates nicely on screen
    await new Promise((r) => setTimeout(r, 110));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        valuation: {
          estimatedValue: updatedVal,
          baseNearMintValue: updatedVal,
          conditionMultiplier: 1.0,
          conditionApplied: body.condition || 'Near Mint',
          isGradedApplied: false,
          source: 'PriceCharting + eBay Comps',
          sourceUrl: 'https://www.pricecharting.com',
          confidence: 'high',
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });

  // Seed clean localStorage state before first navigation
  await page.addInitScript(({ boxesData, comicsData, seriesData }) => {
    window.localStorage.clear();
    window.localStorage.setItem('comic_vault_theme', 'dark');
    window.localStorage.setItem('comic_vault_boxes', JSON.stringify(boxesData));
    window.localStorage.setItem('comic_vault_comics', JSON.stringify(comicsData));
    window.localStorage.setItem('comic_vault_series_totals', JSON.stringify(seriesData));
  }, {
    boxesData: boxes,
    comicsData: comics.map(({ _palette, ...rest }) => rest),
    seriesData: seriesTotals,
  });
}

async function runDemoTour() {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  fs.rmSync(TEMP_VIDEO_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEMP_VIDEO_DIR, { recursive: true });

  const serverChild = await ensureServerRunning();
  const dataset = createDemoDataset();

  let browser;
  let videoPath;
  const pageErrors = [];

  try {
    console.log('[demo] Launching headless Chromium at 1920x1080...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--no-sandbox',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: TEMP_VIDEO_DIR,
        size: { width: 1920, height: 1080 },
      },
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();
    page.on('pageerror', (err) => {
      console.warn('[pageerror]', err.message);
      pageErrors.push(err.message);
    });

    await installOverlayScript(page);
    await setupDemoRoutes(page, dataset);

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Comic Archive Pro' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(500);

    // =========================================================================
    // OPENING TITLE CARD (~1.5s)
    // =========================================================================
    await page.evaluate(() => {
      window.__demoOverlay?.showTitleCard(
        'Comic Archive Pro • Product Tour',
        'Comic Archive Pro',
        'High-Speed Catalog, Interactive 3D Storage Boxes, Live Valuations & Collection Analytics',
        ['1920×1080 Full HD', '3D Box Visualizer', 'Swappable UI Themes', 'Wishlist Hunter', 'Market Valuation']
      );
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__demoOverlay?.hideTitleCard());
    await page.waitForTimeout(200);

    // =========================================================================
    // CHAPTER 1: COLLECTION CATALOG & LIVE SEARCH
    // =========================================================================
    await setCaption(
      page,
      'Chapter 1 of 6 • Collection Catalog',
      'Progressive Catalog, Live Search & Multi-Level Sorting',
      'Browse illustrated issues with instant debounced search, reading-status stamps, and custom sort chains.'
    );
    await page.waitForTimeout(350);

    // Quick status cycle on a comic card -> triggers READ! ★ stamp
    const firstStatusBtn = page.getByTestId('grid-quick-status-btn').first();
    await moveAndClick(page, firstStatusBtn, { postWaitMs: 600 });

    // Open Multi-Sort modal briefly
    await moveAndClick(page, page.getByRole('button', { name: /Customize Multi-Sort/i }), {
      postWaitMs: 650,
    });
    await moveAndClick(page, page.getByRole('button', { name: 'Apply & Close' }), {
      postWaitMs: 250,
    });

    // Live Search for "Spider-Man"
    const searchInput = page.getByPlaceholder(/Search title, writer, artist/i);
    await moveAndType(page, searchInput, 'Spider-Man', { pressEnter: true, postWaitMs: 600 });
    await moveAndClick(page, page.getByRole('button', { name: 'Clear search' }), {
      postWaitMs: 300,
    });

    // =========================================================================
    // CHAPTER 2: DEEP ISSUE INSPECTION & WRAPAROUND ART
    // =========================================================================
    await setCaption(
      page,
      'Chapter 2 of 6 • Issue Inspector & Full Art Showcase',
      'Detailed Metadata, Character Search & Wraparound Spreads',
      'Inspect series run progress, condition-adjusted market values, creator roles, and full-spread cover art.'
    );

    const asm300Card = page.getByTestId('comic-card').filter({ hasText: '300' }).first();
    await moveAndClick(page, asm300Card, { postWaitMs: 600 });

    // Scroll slightly inside modal to show Creators & Character Appearances
    const detailModal = page.locator('.max-h-\\[92vh\\]').first();
    const modalBody = detailModal.locator('.overflow-y-auto').first();
    await modalBody.evaluate((el) => el.scrollBy({ top: 430, behavior: 'smooth' }));
    await page.waitForTimeout(600);

    // Filter characters inside ComicDetailModal
    const charFilterInput = detailModal.getByPlaceholder(/Filter \d+ characters/i);
    await moveAndType(page, charFilterInput, 'Venom', { postWaitMs: 500 });
    await charFilterInput.fill('');
    await modalBody.evaluate((el) => el.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(600);

    // Switch to Full Art & launch FullArtShowcaseModal
    await moveAndClick(page, detailModal.getByRole('button', { name: 'Full Art', exact: true }), {
      postWaitMs: 400,
    });
    await moveAndClick(page, detailModal.getByTitle('Open Full Art Showcase'), {
      postWaitMs: 700,
    });
    await moveAndClick(page, page.getByRole('button', { name: /Compare \(Front vs Full\)/i }), {
      postWaitMs: 650,
    });
    await moveAndClick(page, page.locator('button[title="Close (Esc)"]').last(), {
      postWaitMs: 250,
    });
    await moveAndClick(page, page.locator('button[title="Close (Esc)"]').last(), {
      postWaitMs: 250,
    });

    // =========================================================================
    // CHAPTER 3: SWAPPABLE UI THEMES & MOTION FX STUDIO
    // =========================================================================
    await setCaption(
      page,
      'Chapter 3 of 6 • Style & Motion FX Studio',
      'Swappable Comic Skins, 3D Tilt, Holofoil & Action Stamps',
      'Transform the entire interface between Modern Vault, Four-Color Pulp, Graded Slab Museum & Neon 2099.'
    );

    await moveAndClick(page, page.getByRole('button', { name: 'Style Studio' }), {
      postWaitMs: 450,
    });

    // Preview Four-Color Pulp, Neon Cyber-Noir, and Graded Slab Museum
    await moveAndClick(page, page.getByRole('button', { name: /Four-Color Pulp/i }), {
      postWaitMs: 450,
    });
    await moveAndClick(page, page.getByRole('button', { name: /Neon Cyber-Noir/i }), {
      postWaitMs: 450,
    });
    await moveAndClick(page, page.getByRole('button', { name: /Graded Slab Museum/i }), {
      postWaitMs: 450,
    });
    // Trigger POW! action stamp
    await moveAndClick(page, page.getByRole('button', { name: /POW!/i }), {
      postWaitMs: 600,
    });

    // Close Style Studio to admire Graded Slab headers across the live catalog
    await moveAndClick(page, page.getByRole('button', { name: 'Close Style Studio Modal' }), {
      postWaitMs: 700,
    });

    // Reopen and reset back to Modern Vault cleanly via UI
    await moveAndClick(page, page.getByRole('button', { name: 'Style Studio' }), {
      postWaitMs: 350,
    });
    await moveAndClick(page, page.getByRole('button', { name: /Reset Default/i }), {
      postWaitMs: 350,
    });
    await moveAndClick(page, page.getByRole('button', { name: 'Close Style Studio Modal' }), {
      postWaitMs: 350,
    });

    // =========================================================================
    // CHAPTER 4: PHYSICAL STORAGE BOXES & 3D BOX VISUALIZER
    // =========================================================================
    await setCaption(
      page,
      'Chapter 4 of 6 • Storage Boxes & 3D Box Visualizer',
      'Interactive Three.js WebGL Storage Box Inspection',
      'Track shelf locations and capacity units, then flip through physical boxes in full 3D space.'
    );

    await moveAndClick(page, page.getByRole('button', { name: /Storage Boxes/i }).first(), {
      postWaitMs: 750,
    });

    // Click Box 2 briefly, then open 3D Visualizer on Box 1
    await moveAndClick(page, page.getByTestId('box-card-2'), { postWaitMs: 450 });
    await moveAndClick(page, page.getByTestId('box-card-1').getByTitle('View in 3D'), {
      postWaitMs: 850,
    });

    // Step to next comic inside 3D box & pull it out for inspection
    await moveAndClick(page, page.getByTitle('Next Comic in Box'), { postWaitMs: 450 });
    await moveAndClick(page, page.getByRole('button', { name: /Lift comic out of box/i }), {
      postWaitMs: 650,
    });

    // Smooth orbital camera drag on the 3D canvas
    const canvas = page.locator('canvas').first();
    const canvasBox = await canvas.boundingBox();
    if (canvasBox) {
      const startX = canvasBox.x + canvasBox.width * 0.48;
      const startY = canvasBox.y + canvasBox.height * 0.52;
      await smoothMoveTo(page, startX, startY, 130);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) {
        const nx = startX + i * 20;
        const ny = startY - Math.sin((i / 8) * Math.PI) * 32;
        await page.mouse.move(nx, ny);
        await page.evaluate(([x, y]) => window.__demoOverlay?.moveCursor(x, y, true), [nx, ny]);
        await page.waitForTimeout(18);
      }
      await page.mouse.up();
      cursorPos = { x: startX + 160, y: startY };
      await page.waitForTimeout(450);
    }

    await moveAndClick(page, page.getByRole('button', { name: 'Close 3D Visualizer' }), {
      postWaitMs: 300,
    });

    // =========================================================================
    // CHAPTER 5: WISHLIST HUNTER & READING CHALLENGE
    // =========================================================================
    await setCaption(
      page,
      'Chapter 5 of 6 • Wishlist Hunter & Reading Challenge',
      'Smart Store Priority Scoring & Chronological TBR Queues',
      'Prioritize gap-fillers and 100% run closers at the comic shop, then track reading milestones.'
    );

    await moveAndClick(page, page.getByRole('button', { name: /Wishlist Hunter/i }).first(), {
      postWaitMs: 600,
    });

    // Select first wishlist item & mark purchased
    const checkBtn = page.getByTitle('Check off as found in store').first();
    await moveAndClick(page, checkBtn, { postWaitMs: 300 });
    await moveAndClick(page, page.getByRole('button', { name: /Mark Purchased \(1\)/i }), {
      postWaitMs: 750,
    });

    // Switch to Reading Challenge tab
    await moveAndClick(page, page.getByRole('button', { name: /Reading Challenge/i }).first(), {
      postWaitMs: 600,
    });

    await moveAndClick(page, page.getByRole('button', { name: /Mark as Read/i }).first(), {
      postWaitMs: 600,
    });

    // =========================================================================
    // CHAPTER 6: ANALYTICS & MARKET VALUATIONS
    // =========================================================================
    await setCaption(
      page,
      'Chapter 6 of 6 • Analytics & Automated Market Valuations',
      'Event Progress, Creator Credits, Trophies & Live Price Comps',
      'Analyze crossover completions, achievements, and run multi-source market value refreshes.'
    );

    await moveAndClick(page, page.getByRole('button', { name: /Box Stats/i }).first(), {
      postWaitMs: 600,
    });
    await moveAndClick(page, page.getByRole('button', { name: /Creators & Roles/i }).first(), {
      postWaitMs: 550,
    });
    await moveAndClick(page, page.getByRole('button', { name: /Achievements/i }).first(), {
      postWaitMs: 550,
    });
    await moveAndClick(page, page.getByRole('button', { name: /Box Capacity/i }).first(), {
      postWaitMs: 550,
    });

    // Open Market Values modal and run a live batch price refresh
    await moveAndClick(page, page.getByRole('button', { name: 'Market Values' }), {
      postWaitMs: 500,
    });
    await moveAndClick(page, page.getByRole('button', { name: /Start Batch Update/i }), {
      postWaitMs: 1400,
    });
    await moveAndClick(page, page.getByRole('button', { name: 'Close Market Valuation Modal' }), {
      postWaitMs: 300,
    });

    // =========================================================================
    // OUTRO SUMMARY CARD (~1.6s)
    // =========================================================================
    await page.evaluate(() => {
      window.__demoOverlay?.hideCaption();
      window.__demoOverlay?.showTitleCard(
        'Comic Archive Pro • Ready for Your Vault',
        'Collect Smarter. Track Everything.',
        'Cross-Platform Desktop, Web & Android Companion • Offline-First IndexedDB & Cloud Sync',
        ['Catalog & Search', '3D Box Visualizer', 'Style Studio FX', 'Wishlist Hunter', 'Market Valuation']
      );
    });
    await page.waitForTimeout(1600);

    const video = page.video();
    await page.close();
    await context.close();
    if (video) {
      videoPath = await video.path();
    }
  } finally {
    if (browser) await browser.close();
    if (serverChild) {
      console.log('[demo] Stopping temporary production server...');
      serverChild.kill();
    }
  }

  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error('Playwright did not produce a recorded video file.');
  }

  const rawWebm = path.join(TEMP_VIDEO_DIR, 'raw-recording.webm');
  fs.mkdirSync(TEMP_VIDEO_DIR, { recursive: true });
  fs.copyFileSync(videoPath, rawWebm);

  const ffmpeg = findFfmpegPath();
  console.log(`[demo] Producing 1080p ~80s WebM & H.264 MP4 using ${ffmpeg}...`);
  execFileSync(
    ffmpeg,
    [
      '-y',
      '-i',
      rawWebm,
      '-vf',
      'setpts=0.75*PTS',
      '-r',
      '30',
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '24',
      '-b:v',
      '0',
      '-deadline',
      'realtime',
      '-cpu-used',
      '4',
      '-an',
      OUTPUT_WEBM,
    ],
    { stdio: 'inherit' }
  );

  execFileSync(
    ffmpeg,
    [
      '-y',
      '-i',
      rawWebm,
      '-vf',
      'setpts=0.75*PTS',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      OUTPUT_MP4,
    ],
    { stdio: 'inherit' }
  );

  fs.rmSync(TEMP_VIDEO_DIR, { recursive: true, force: true });

  const webmSizeMb = (fs.statSync(OUTPUT_WEBM).size / (1024 * 1024)).toFixed(2);
  const mp4SizeMb = (fs.statSync(OUTPUT_MP4).size / (1024 * 1024)).toFixed(2);
  console.log(`[demo] ✓ WebM saved: ${OUTPUT_WEBM} (${webmSizeMb} MB)`);
  console.log(`[demo] ✓ MP4 saved:  ${OUTPUT_MP4} (${mp4SizeMb} MB)`);
  if (pageErrors.length > 0) {
    console.warn(`[demo] Warning: ${pageErrors.length} page error(s) observed during capture.`);
  }
}

runDemoTour().catch((err) => {
  console.error('[demo] Recording failed:', err);
  process.exit(1);
});
