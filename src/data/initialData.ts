import { ComicBook, StorageBox } from '../types';

export const DEFAULT_BOXES: StorageBox[] = [
  { id: 1, name: 'Box 01 - Amazing Spider-Man & Marvel Silver Age', location: 'Top Shelf - Left', maxCapacity: 150, colorTag: '#EF4444', notes: 'Silver & Bronze Age Marvel keys' },
  { id: 2, name: 'Box 02 - X-Men & Mutants (1980s-1990s)', location: 'Top Shelf - Center', maxCapacity: 150, colorTag: '#F59E0B', notes: 'Uncanny X-Men, X-Force, Wolverine' },
  { id: 3, name: 'Box 03 - Batman & Gotham Detective Run', location: 'Top Shelf - Right', maxCapacity: 150, colorTag: '#3B82F6', notes: 'Batman Vol. 1 & 2, Detective Comics' },
  { id: 4, name: 'Box 04 - Superman & Justice League', location: 'Middle Rack - Shelf 1', maxCapacity: 150, colorTag: '#10B981', notes: 'Action Comics, JLA, Flash' },
  { id: 5, name: 'Box 05 - Image Comics & Creator Owned', location: 'Middle Rack - Shelf 2', maxCapacity: 150, colorTag: '#8B5CF6', notes: 'Saga, Spawn, Invincible' },
  { id: 6, name: 'Box 06 - Vertigo & Dark Horse Favorites', location: 'Middle Rack - Shelf 3', maxCapacity: 150, colorTag: '#EC4899', notes: 'Sandman, Preacher, Hellboy' },
  { id: 7, name: 'Box 07 - Trade Paperbacks & Graphic Novels A-M', location: 'Bottom Storage - Bay A', maxCapacity: 150, colorTag: '#6366F1', notes: 'Thicker TPB volumes' },
  { id: 8, name: 'Box 08 - Trade Paperbacks & Hardcovers N-Z', location: 'Bottom Storage - Bay B', maxCapacity: 150, colorTag: '#14B8A6', notes: 'Collected hardcovers' },
  { id: 9, name: 'Box 09 - Modern Marvel Era (2000-2015)', location: 'Bottom Storage - Bay C', maxCapacity: 150, colorTag: '#F97316', notes: 'New Avengers, Civil War, Daredevil' },
  { id: 10, name: 'Box 10 - Modern DC & Black Label', location: 'Closet - Shelf 1', maxCapacity: 150, colorTag: '#06B6D4', notes: 'Batman White Knight, Watchmen, Doomsday Clock' },
  { id: 11, name: 'Box 11 - Sci-Fi & Space Opera', location: 'Closet - Shelf 2', maxCapacity: 150, colorTag: '#84CC16', notes: 'Star Wars, Guardians of the Galaxy, East of West' },
  { id: 12, name: 'Box 12 - Horror, Crime & Mystery', location: 'Closet - Shelf 3', maxCapacity: 150, colorTag: '#64748B', notes: 'Department of Truth, Criminal, Something is Killing the Children' },
  { id: 13, name: 'Box 13 - Indie Publishers & Zines', location: 'Office Desk Cabinet', maxCapacity: 150, colorTag: '#A855F7', notes: 'BOOM! Studios, IDW, AWA, Vault' },
  { id: 14, name: 'Box 14 - Oversized Omnibuses & Hardcovers', location: 'Display Stand Base', maxCapacity: 150, colorTag: '#E11D48', notes: 'Heavy omnibus volumes' },
  { id: 15, name: 'Box 15 - Overflow & Unsorted Back issues', location: 'Worktable Staging Area', maxCapacity: 150, colorTag: '#F43F5E', notes: 'Recent pick-ups waiting for cataloging' },
];

/**
 * Legacy sample comic IDs (c-001 through c-014) used only in early prototyping/e2e tests.
 * Filtered out from production localStorage and purged from PostgreSQL on startup.
 */
export function isSampleComicId(id?: string | null): boolean {
  if (!id) return false;
  return /^c-0(0[1-9]|1[0-4])$/i.test(id.trim());
}

export const INITIAL_COMICS: ComicBook[] = [];
