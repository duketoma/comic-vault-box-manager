import { StorageBox } from '../types';

/**
 * Extracts numeric box number from box name or box ID.
 * Handles patterns like "Box #1", "Box #10", "Box 02 - X-Men", "Box 15", "#3", etc.
 */
export function getBoxNumber(box: Partial<StorageBox>): number | null {
  if (!box) return null;

  if (box.name) {
    // Match "Box #10", "Box 10", "Box#10", "Box 01", "#10", or standalone digits
    const match = box.name.match(/(?:box\s*#?|#)\s*(\d+)/i) || box.name.match(/\b(\d+)\b/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  if (typeof box.id === 'number') {
    return box.id;
  }

  return null;
}

/**
 * Natural numerical compare helper for StorageBox objects.
 * Orders boxes numerically (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15)
 * instead of alphabetical string order ("Box #1", "Box #10", "Box #2").
 */
export function compareBoxes(a: StorageBox, b: StorageBox): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  // Box 0 (Staging/Unallocated) always comes first if present
  if (a.id === 0 && b.id !== 0) return -1;
  if (b.id === 0 && a.id !== 0) return 1;

  const numA = getBoxNumber(a);
  const numB = getBoxNumber(b);

  if (numA !== null && numB !== null && numA !== numB) {
    return numA - numB;
  }

  if (a.id !== b.id) {
    return a.id - b.id;
  }

  // Fallback to natural string compare with numeric sorting enabled
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Returns a new array of boxes sorted naturally by numerical box number.
 */
export function sortBoxes(boxes: StorageBox[]): StorageBox[] {
  if (!Array.isArray(boxes)) return [];
  return [...boxes].sort(compareBoxes);
}
