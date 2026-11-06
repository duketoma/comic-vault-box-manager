import { StorageBox } from '../types';

export const MAX_CATALOG_PUBLISH_YEAR = Math.max(new Date().getFullYear() + 2, 2026);
export const MIN_CATALOG_PUBLISH_YEAR = 1930;

export const CATALOG_FILTERS_STORAGE_KEY = 'comic_vault_catalog_filters_v1';

export type WishlistScope = 'exclude' | 'include' | 'only';

export interface CatalogFilters {
  selectedSeries: string;
  selectedRunProgress: 'all' | 'complete' | 'near' | 'in_progress';
  selectedGenre: string;
  selectedPublisher: string;
  selectedAuthor: string;
  selectedCharacter: string;
  selectedBoxId: string;
  selectedStatus: string;
  selectedWishlistScope: WishlistScope;
  selectedFormat: string;
  selectedEvent: string;
  startDate: string;
  endDate: string;
  yearRange: [number, number];
  onlyFullArt: boolean;
  viewMode: 'grid' | 'table';
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
  selectedSeries: 'all',
  selectedRunProgress: 'all',
  selectedGenre: 'all',
  selectedPublisher: 'all',
  selectedAuthor: 'all',
  selectedCharacter: 'all',
  selectedBoxId: 'all',
  selectedStatus: 'all',
  selectedWishlistScope: 'exclude',
  selectedFormat: 'all',
  selectedEvent: 'all',
  startDate: '',
  endDate: '',
  yearRange: [MIN_CATALOG_PUBLISH_YEAR, MAX_CATALOG_PUBLISH_YEAR],
  onlyFullArt: false,
  viewMode: 'grid',
};

/**
 * Loads saved catalog filters from localStorage with defensive validation and fallback to defaults.
 */
export function loadSavedCatalogFilters(): CatalogFilters {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_CATALOG_FILTERS };
  }

  try {
    const raw = localStorage.getItem(CATALOG_FILTERS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_CATALOG_FILTERS };
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_CATALOG_FILTERS };
    }

    const yearRange: [number, number] = Array.isArray(parsed.yearRange) && parsed.yearRange.length === 2
      ? [
          typeof parsed.yearRange[0] === 'number' && !isNaN(parsed.yearRange[0])
            ? parsed.yearRange[0]
            : MIN_CATALOG_PUBLISH_YEAR,
          typeof parsed.yearRange[1] === 'number' && !isNaN(parsed.yearRange[1])
            ? parsed.yearRange[1]
            : MAX_CATALOG_PUBLISH_YEAR,
        ]
      : [MIN_CATALOG_PUBLISH_YEAR, MAX_CATALOG_PUBLISH_YEAR];

    return {
      selectedSeries: typeof parsed.selectedSeries === 'string' ? parsed.selectedSeries : 'all',
      selectedRunProgress: ['all', 'complete', 'near', 'in_progress'].includes(parsed.selectedRunProgress)
        ? parsed.selectedRunProgress
        : 'all',
      selectedGenre: typeof parsed.selectedGenre === 'string' ? parsed.selectedGenre : 'all',
      selectedPublisher: typeof parsed.selectedPublisher === 'string' ? parsed.selectedPublisher : 'all',
      selectedAuthor: typeof parsed.selectedAuthor === 'string' ? parsed.selectedAuthor : 'all',
      selectedCharacter: typeof parsed.selectedCharacter === 'string' ? parsed.selectedCharacter : 'all',
      selectedBoxId: typeof parsed.selectedBoxId === 'string' ? parsed.selectedBoxId : 'all',
      selectedStatus: typeof parsed.selectedStatus === 'string' ? parsed.selectedStatus : 'all',
      selectedWishlistScope: ['exclude', 'include', 'only'].includes(parsed.selectedWishlistScope)
        ? parsed.selectedWishlistScope
        : 'exclude',
      selectedFormat: typeof parsed.selectedFormat === 'string' ? parsed.selectedFormat : 'all',
      selectedEvent: typeof parsed.selectedEvent === 'string' ? parsed.selectedEvent : 'all',
      startDate: typeof parsed.startDate === 'string' ? parsed.startDate : '',
      endDate: typeof parsed.endDate === 'string' ? parsed.endDate : '',
      yearRange,
      onlyFullArt: Boolean(parsed.onlyFullArt),
      viewMode: parsed.viewMode === 'table' ? 'table' : 'grid',
    };
  } catch (err) {
    console.error('Failed to load saved catalog filters:', err);
    return { ...DEFAULT_CATALOG_FILTERS };
  }
}

/**
 * Saves catalog filters to localStorage.
 */
export function saveCatalogFilters(filters: CatalogFilters): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(CATALOG_FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch (err) {
    console.warn('Failed to save catalog filters to localStorage:', err);
  }
}

/**
 * Sanitizes catalog filters against the currently existing boxes.
 * If a selected box has been deleted, falls back gracefully to 'all'.
 */
export function sanitizeCatalogFilters(filters: CatalogFilters, boxes: StorageBox[]): CatalogFilters {
  if (filters.selectedBoxId === 'all' || filters.selectedBoxId === '0') {
    return filters;
  }

  const boxExists = boxes.some((b) => b.id.toString() === filters.selectedBoxId);
  if (!boxExists) {
    return {
      ...filters,
      selectedBoxId: 'all',
    };
  }

  return filters;
}
