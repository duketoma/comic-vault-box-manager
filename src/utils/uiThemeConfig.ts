import { ComicBook, ComicCondition } from '../types';

export type UiThemeSkin = 'modern' | 'pulp' | 'slab' | 'neon';
export type HolofoilMode = 'keys' | 'all' | 'off';
export type MotionIntensity = 'full' | 'subtle' | 'off';

export interface UiStylePreferences {
  skin: UiThemeSkin;
  enable3DTilt: boolean;
  holofoilMode: HolofoilMode;
  enableActionStamps: boolean;
  motionIntensity: MotionIntensity;
}

export const UI_STYLE_STORAGE_KEY = 'comic_vault_ui_style_v1';

export const DEFAULT_UI_STYLE_PREFS: UiStylePreferences = {
  skin: 'modern',
  enable3DTilt: true,
  holofoilMode: 'keys',
  enableActionStamps: true,
  motionIntensity: 'full',
};

export interface ThemeSkinMetadata {
  id: UiThemeSkin;
  name: string;
  subtitle: string;
  badgeText: string;
  description: string;
  accentPreviewClass: string;
}

export const UI_THEME_SKINS: ThemeSkinMetadata[] = [
  {
    id: 'modern',
    name: 'Modern Vault',
    subtitle: 'Default Archival UI',
    badgeText: 'Default',
    description:
      'Clean, crisp archival slate & indigo layout with smooth glassmorphic badges and balanced shadows.',
    accentPreviewClass: 'from-slate-800 via-indigo-600 to-slate-900',
  },
  {
    id: 'pulp',
    name: 'Four-Color Pulp',
    subtitle: 'Silver Age Comic Print',
    badgeText: 'Halftone Ink',
    description:
      'Ben-Day halftone dot textures, bold ink panel borders, hard offset comic drop shadows, and slanted action captions.',
    accentPreviewClass: 'from-amber-400 via-rose-600 to-indigo-700',
  },
  {
    id: 'slab',
    name: 'Graded Slab Museum',
    subtitle: 'CGC / Collector Case',
    badgeText: 'Slab Labels',
    description:
      'Encases every comic card in an acrylic collector slab with a top grade-and-value header label and Mylar bevels.',
    accentPreviewClass: 'from-amber-500 via-emerald-600 to-slate-900',
  },
  {
    id: 'neon',
    name: 'Neon Cyber-Noir',
    subtitle: '2099 Graphic Novel',
    badgeText: 'Cyber Glow',
    description:
      'High-contrast obsidian panels with electric cyan, magenta, and amber neon edge glow and subtle scanlines.',
    accentPreviewClass: 'from-cyan-500 via-fuchsia-600 to-indigo-950',
  },
];

export function loadUiStylePreferences(): UiStylePreferences {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_UI_STYLE_PREFS };
  }
  try {
    const raw = localStorage.getItem(UI_STYLE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_STYLE_PREFS };
    const parsed = JSON.parse(raw);
    const validSkins: UiThemeSkin[] = ['modern', 'pulp', 'slab', 'neon'];
    const validFoil: HolofoilMode[] = ['keys', 'all', 'off'];
    const validMotion: MotionIntensity[] = ['full', 'subtle', 'off'];

    return {
      skin: validSkins.includes(parsed.skin) ? parsed.skin : 'modern',
      enable3DTilt: typeof parsed.enable3DTilt === 'boolean' ? parsed.enable3DTilt : true,
      holofoilMode: validFoil.includes(parsed.holofoilMode) ? parsed.holofoilMode : 'keys',
      enableActionStamps:
        typeof parsed.enableActionStamps === 'boolean' ? parsed.enableActionStamps : true,
      motionIntensity: validMotion.includes(parsed.motionIntensity)
        ? parsed.motionIntensity
        : 'full',
    };
  } catch {
    return { ...DEFAULT_UI_STYLE_PREFS };
  }
}

export function saveUiStylePreferences(prefs: UiStylePreferences): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(UI_STYLE_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export function applyUiStyleToDocument(prefs: UiStylePreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-ui-skin', prefs.skin);
  root.setAttribute('data-motion', prefs.motionIntensity);
}

/**
 * Determines whether a comic card should display the 90s Chromium Holofoil rainbow shimmer on hover.
 */
export function isComicHolofoilEligible(
  comic: Pick<
    ComicBook,
    'estimatedValue' | 'condition' | 'issueNumber' | 'coverImageFull' | 'tags' | 'notes'
  >,
  holofoilMode: HolofoilMode
): boolean {
  if (holofoilMode === 'off') return false;
  if (holofoilMode === 'all') return true;

  // 'keys' mode: High-value ($25+), Gem Mint / Mint, Issue #1, Full Wraparound Art, or CGC/CBCS/Key tags
  if ((comic.estimatedValue ?? 0) >= 25) return true;
  if (comic.condition === 'Gem Mint' || comic.condition === 'Mint') return true;
  if (comic.coverImageFull) return true;
  const cleanIssue = String(comic.issueNumber || '').replace(/^#/, '').trim();
  if (cleanIssue === '1') return true;

  const combinedTags = [...(comic.tags || []), comic.notes || ''].join(' ');
  return /\b(cgc|cbcs|pgx|slab|graded|key|first appearance|1st appearance|foil|chromium|variant)\b/i.test(
    combinedTags
  );
}

const CONDITION_NUMERIC_GRADES: Record<ComicCondition, { grade: string; code: string }> = {
  'Gem Mint': { grade: '9.8', code: 'GM' },
  'Mint': { grade: '9.6', code: 'MT' },
  'Near Mint': { grade: '9.4', code: 'NM' },
  'Very Fine': { grade: '8.0', code: 'VF' },
  'Fine': { grade: '6.0', code: 'FN' },
  'Very Good': { grade: '4.0', code: 'VG' },
  'Good': { grade: '2.5', code: 'GD' },
  'Fair': { grade: '1.5', code: 'FR' },
  'Poor': { grade: '0.5', code: 'PR' },
};

/**
 * Generates an authentic CGC/Collector Slab Grade badge string (e.g., "9.8 GM" or "9.4 NM")
 * for the Graded Slab Museum theme.
 */
export function getSlabNumericGradeLabel(
  condition?: ComicCondition | string,
  tags?: string[],
  notes?: string
): { grade: string; code: string; isCertified: boolean } {
  const combined = [...(tags || []), notes || ''].join(' ');
  const isCertified = /\b(cgc|cbcs|pgx|slab|graded)\b/i.test(combined);
  const explicitMatch = combined.match(/\b(10\.0|9\.[02468]|8\.[05]|7\.[05]|6\.[05])\b/);

  const mapped =
    condition && condition in CONDITION_NUMERIC_GRADES
      ? CONDITION_NUMERIC_GRADES[condition as ComicCondition]
      : CONDITION_NUMERIC_GRADES['Near Mint'];

  return {
    grade: explicitMatch ? explicitMatch[1] : mapped.grade,
    code: isCertified ? 'CGC' : mapped.code,
    isCertified,
  };
}
