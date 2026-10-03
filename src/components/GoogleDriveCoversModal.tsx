import React, { useState, useEffect, useMemo } from 'react';
import { 
  FolderCheck, 
  Image as ImageIcon, 
  RefreshCw, 
  X, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Link as LinkIcon, 
  ExternalLink,
  Layers,
  FileQuestion,
  Cloud,
  Check,
  Search
} from 'lucide-react';
import { User } from 'firebase/auth';
import { googleSignIn, initAuth, logout } from '../services/auth';
import { scanDriveComicCovers, DriveFileItem, DriveCoversSyncResult } from '../services/driveService';
import { ComicBook } from '../types';
import { 
  getComicCoverUrl, 
  formatDriveImageUrl, 
  getDriveNoImageUrl, 
  setDriveNoImageUrl, 
  handleImageError, 
  isComicAlreadyLinked, 
  isComicFullCoverLinked,
  doesFileNameMatchComic, 
  extractDriveFileId,
  hasFullCoverWord,
  parseStrictFullCoverFileName,
  doesFullCoverMatchComic
} from '../utils/imageUtils';

interface GoogleDriveCoversModalProps {
  isOpen: boolean;
  onClose: () => void;
  comics: ComicBook[];
  onUpdateComicCover: (comicId: string, coverUrl: string) => void;
  onUpdateComicFullCover?: (comicId: string, coverFullUrl: string) => void;
  onUpdateComicCoversBatch?: (updates: Array<{ comicId: string; coverUrl?: string; coverImageFullUrl?: string }>) => void;
  onApplyNoImageFallback: (noImageUrl: string) => void;
}

export const GoogleDriveCoversModal: React.FC<GoogleDriveCoversModalProps> = ({
  isOpen,
  onClose,
  comics,
  onUpdateComicCover,
  onUpdateComicFullCover,
  onUpdateComicCoversBatch,
  onApplyNoImageFallback,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgressCount, setScanProgressCount] = useState(0);
  const [syncResult, setSyncResult] = useState<DriveCoversSyncResult | null>(null);
  const [linkedCount, setLinkedCount] = useState(0);
  const [stagedAssignments, setStagedAssignments] = useState<Record<string, string>>({});
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [visibleCardCount, setVisibleCardCount] = useState(48);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  const [fileTypeFilter, setFileTypeFilter] = useState<'all' | 'standard' | 'full'>('all');

  // Reset pagination when search query changes
  useEffect(() => {
    setVisibleCardCount(48);
  }, [fileSearchQuery, fileTypeFilter]);

  const mkDriveViewUrl = (fileId: string) => {
    if (!fileId) return getDriveNoImageUrl();
    if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
      return formatDriveImageUrl(fileId);
    }
    return `https://lh3.googleusercontent.com/d/${fileId}=s800`;
  };

  const isFileLinkedToComic = (file: DriveFileItem, comic?: ComicBook | null): boolean => {
    if (!comic) return false;
    const isFull = hasFullCoverWord(file.name);
    if (isFull) {
      return isComicFullCoverLinked(comic.coverImageFull, file.id);
    }
    if (!comic.coverImage) return false;
    if (comic.coverImage.includes(file.id)) return true;
    const currentId = extractDriveFileId(comic.coverImage);
    return currentId !== null && currentId === file.id;
  };

  // Populate or update stagedAssignments whenever syncResult or comics change
  // Uses indexed issue lookup and Set for O(1) matching performance
  useEffect(() => {
    if (!syncResult?.coverFiles || syncResult.coverFiles.length === 0) return;

    setStagedAssignments((prev) => {
      const updated = { ...prev };
      const assignedSet = new Set(Object.values(updated));

      // Pre-index comics by numeric/clean issue number for fast candidate lookup
      const comicsByIssue = new Map<string, ComicBook[]>();
      for (const c of comics) {
        const clean = String(c.issueNumber ?? '').replace(/^#/, '').trim();
        const num = clean.match(/^\d+$/) ? String(parseInt(clean, 10)) : clean.toLowerCase();
        if (!comicsByIssue.has(num)) comicsByIssue.set(num, []);
        comicsByIssue.get(num)!.push(c);
      }

      syncResult.coverFiles.forEach((file) => {
        // If already assigned and matches an existing comic in vault, keep it
        const currentAssignedId = updated[file.id];
        if (currentAssignedId && comics.some((c) => c.id === currentAssignedId)) {
          return;
        }

        // Check if already linked to a comic in the vault
        const alreadyLinked = comics.find((c) => isFileLinkedToComic(file, c));
        if (alreadyLinked) {
          updated[file.id] = alreadyLinked.id;
          assignedSet.add(alreadyLinked.id);
          return;
        }

        const isFull = hasFullCoverWord(file.name);

        if (isFull) {
          // Strictly parse full cover filename
          const parsed = parseStrictFullCoverFileName(file.name);
          if (!parsed.isStrictFullCover) {
            // Does not follow strict placement (<Title> Full #<Issue> or <Title> Annual Full <Year/Issue>) -> Do not auto-match
            return;
          }

          const suggested =
            comics.find((c) => !assignedSet.has(c.id) && doesFullCoverMatchComic(parsed, c)) ||
            comics.find((c) => doesFullCoverMatchComic(parsed, c));

          if (suggested) {
            updated[file.id] = suggested.id;
            assignedSet.add(suggested.id);
          }
          return;
        }

        // Standard covers
        // Extract candidate numbers from filename
        const base = file.name.replace(/\.[^/.]+$/, '').trim();
        const numMatches = base.match(/(?:#|\b)(\d+)\b/g) || [];
        let candidateComics: ComicBook[] = [];
        for (const m of numMatches) {
          const cleanM = String(parseInt(m.replace(/^#/, ''), 10));
          if (comicsByIssue.has(cleanM)) {
            candidateComics.push(...comicsByIssue.get(cleanM)!);
          }
        }
        if (candidateComics.length === 0) {
          candidateComics = comics;
        }

        // Otherwise find a matching comic by filename prioritizing unassigned
        const suggested =
          candidateComics.find(
            (c) =>
              !assignedSet.has(c.id) &&
              doesFileNameMatchComic(
                file.name,
                c.title,
                c.issueNumber,
                c.volume,
                c.seriesName,
                c.fullTitle,
                c.publicationYear
              )
          ) ||
          candidateComics.find((c) =>
            doesFileNameMatchComic(
              file.name,
              c.title,
              c.issueNumber,
              c.volume,
              c.seriesName,
              c.fullTitle,
              c.publicationYear
            )
          );

        if (suggested) {
          updated[file.id] = suggested.id;
          assignedSet.add(suggested.id);
        }
      });
      return updated;
    });
  }, [syncResult, comics]);

  // Counts for standard vs full covers
  const standardCoverFilesCount = useMemo(() => {
    return (syncResult?.coverFiles || []).filter((f) => !hasFullCoverWord(f.name)).length;
  }, [syncResult?.coverFiles]);

  const fullCoverFilesCount = useMemo(() => {
    return (syncResult?.coverFiles || []).filter((f) => hasFullCoverWord(f.name)).length;
  }, [syncResult?.coverFiles]);

  // Pending matches: files that have an assigned comic that is not yet linked to this file
  const pendingMatches = useMemo(() => {
    if (!syncResult?.coverFiles || syncResult.coverFiles.length === 0) return [];
    const list: Array<{ comic: ComicBook; file: DriveFileItem }> = [];
    syncResult.coverFiles.forEach((file) => {
      const comicId = stagedAssignments[file.id];
      if (!comicId) return;
      const comic = comics.find((c) => c.id === comicId);
      if (comic && !isFileLinkedToComic(file, comic)) {
        list.push({ comic, file });
      }
    });
    return list;
  }, [syncResult, stagedAssignments, comics]);

  // Already linked count across all files in Drive
  const alreadyLinkedCount = useMemo(() => {
    if (!syncResult?.coverFiles || syncResult.coverFiles.length === 0) return 0;
    return syncResult.coverFiles.filter((file) =>
      comics.some((c) => isFileLinkedToComic(file, c))
    ).length;
  }, [syncResult, comics]);

  // Sorted and filtered cover files list (pending matches first, then unassigned, then linked, filtered by search and filter type)
  const sortedAndFilteredCoverFiles = useMemo(() => {
    if (!syncResult?.coverFiles || syncResult.coverFiles.length === 0) return [];

    let list = syncResult.coverFiles;

    if (fileTypeFilter === 'standard') {
      list = list.filter((f) => !hasFullCoverWord(f.name));
    } else if (fileTypeFilter === 'full') {
      list = list.filter((f) => hasFullCoverWord(f.name));
    }

    if (fileSearchQuery.trim()) {
      const q = fileSearchQuery.toLowerCase().trim();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      const aAssignedId = stagedAssignments[a.id];
      const bAssignedId = stagedAssignments[b.id];
      const aComic = aAssignedId ? comics.find((c) => c.id === aAssignedId) : null;
      const bComic = bAssignedId ? comics.find((c) => c.id === bAssignedId) : null;
      const aLinked = isFileLinkedToComic(a, aComic);
      const bLinked = isFileLinkedToComic(b, bComic);
      const aPending = !!aComic && !aLinked;
      const bPending = !!bComic && !bLinked;

      // 1. Pending (Ready to Link) first
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;

      // 2. Unassigned next
      const aUnassigned = !aComic;
      const bUnassigned = !bComic;
      if (aUnassigned && !bUnassigned && !aPending && !bPending) return -1;
      if (!aUnassigned && bUnassigned && !aPending && !bPending) return 1;

      // 3. Natural alphanumeric sort by filename
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [syncResult?.coverFiles, stagedAssignments, comics, fileSearchQuery, fileTypeFilter]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (u, token) => {
        setUser(u);
        setAccessToken(token);
        setIsLoadingAuth(false);
        setAuthError(null);
        // Automatically scan drive once token is available
        handleScanDrive(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setIsLoadingAuth(false);
        // Leave authError as-is (set by explicit sign-in failure) or clear
        // setAuthError('Not connected to Google Drive');
      }
    );
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        setAuthError(null);
        handleScanDrive(res.accessToken);
      }
    } catch (err: any) {
      console.error('Sign in failed:', err);
      setAuthError(err?.message || String(err));
    } finally {
      setIsSigningIn(false);
    }
  };

  // Memoize comic options so React doesn't allocate thousands of option elements per card
  const comicOptions = useMemo(() => {
    return comics.map((c) => (
      <option key={c.id} value={c.id}>
        {c.title} #{c.issueNumber}
      </option>
    ));
  }, [comics]);

  const handleScanDrive = async (tokenToUse?: string) => {
    const tok = tokenToUse || accessToken;
    if (!tok) return;

    setIsScanning(true);
    setScanProgressCount(0);
    try {
      const result = await scanDriveComicCovers(tok, (count) => {
        setScanProgressCount(count);
      });
      setSyncResult(result);

      if (result.noImageFile) {
        const noUrl = mkDriveViewUrl(result.noImageFile.id);
        setDriveNoImageUrl(noUrl);
        onApplyNoImageFallback(noUrl);
      }
    } catch (err: any) {
      console.error('Failed to scan Drive:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleApplyNoImageToAllUnscanned = () => {
    if (!syncResult?.noImageFile) return;
    const url = mkDriveViewUrl(syncResult.noImageFile.id);
    setDriveNoImageUrl(url);
    onApplyNoImageFallback(url);
    setLinkedCount((prev) => prev + 1);
  };

  const executeLinking = (items: Array<{ comic: ComicBook; file: DriveFileItem }>) => {
    if (items.length === 0) return;
    setIsLinking(true);
    try {
      const updates = items.map(({ comic, file }) => {
        const isFull = hasFullCoverWord(file.name);
        const url = mkDriveViewUrl(file.id);
        return {
          comicId: comic.id,
          coverUrl: isFull ? undefined : url,
          coverImageFullUrl: isFull ? url : undefined,
        };
      });

      if (onUpdateComicCoversBatch) {
        onUpdateComicCoversBatch(updates);
      } else {
        updates.forEach((u) => {
          if (u.coverUrl) onUpdateComicCover(u.comicId, u.coverUrl);
          if (u.coverImageFullUrl && onUpdateComicFullCover) {
            onUpdateComicFullCover(u.comicId, u.coverImageFullUrl);
          }
        });
      }

      setLinkedCount((prev) => prev + updates.length);
      setSuccessMessage(`✓ Successfully linked ${updates.length} comic cover${updates.length === 1 ? '' : 's'}!`);
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err) {
      console.error('Failed to link comic covers:', err);
    } finally {
      setIsLinking(false);
    }
  };

  const handleLinkAllMatchesNow = () => {
    executeLinking(pendingMatches);
  };

  const handleLinkSingleCover = (fileId: string, explicitComicId?: string) => {
    const comicId = explicitComicId || stagedAssignments[fileId];
    if (!comicId) return;
    const comic = comics.find((c) => c.id === comicId);
    const file = syncResult?.coverFiles.find((f) => f.id === fileId);
    if (comic && file) {
      executeLinking([{ comic, file }]);
    }
  };

  const handleDone = () => {
    if (pendingMatches.length > 0) {
      executeLinking(pendingMatches);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden my-8 text-slate-900 dark:text-slate-100">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-900 dark:bg-indigo-600 text-white shadow-xs">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                Google Drive "Comic Covers" Integration
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sync images & NoImage.png from your Google Drive folder directly to comic issues
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          {/* Auth State Box */}
          {!user || !accessToken ? (
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center mx-auto shadow-xs text-slate-700">
                <Cloud className="w-6 h-6 text-slate-800 dark:text-slate-200" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Connect Google Drive Account</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Allow your comic vault to read your Google Drive <strong>"Comic Covers"</strong> folder to fetch scanned covers and <strong>NoImage.png</strong>.
                </p>
              </div>

              {/* Official Google Sign-In Button */}
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                  className="inline-flex items-center gap-3 px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl shadow-xs text-slate-700 dark:text-slate-200 font-bold text-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>{isSigningIn ? 'Connecting to Google Drive...' : 'Sign in with Google'}</span>
                </button>
              </div>
              {authError && (
                <div className="mt-3 p-2 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs rounded">
                  <strong className="font-bold">Sign-in error:</strong> {authError}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Connected User Bar */}
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
                <div className="flex items-center gap-2.5">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-6 h-6 rounded-full border border-slate-300 dark:border-slate-600" />
                  ) : (
                    <div className="w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-[10px]">
                      {user.displayName?.[0] || 'G'}
                    </div>
                  )}
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{user.displayName || user.email}</span>
                    <span className="text-slate-400 dark:text-slate-500 text-[10px] ml-2">Connected Drive Account</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleScanDrive()}
                    disabled={isScanning}
                    className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                    <span>Re-scan Drive</span>
                  </button>
                  <button
                    onClick={() => logout().then(() => { setUser(null); setAccessToken(null); })}
                    className="px-2.5 py-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Status & Folder Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Folder Status Card */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FolderCheck className="w-4 h-4 text-slate-800 dark:text-slate-200" />
                      Google Drive Folder
                    </span>
                    {syncResult?.folder ? (
                      <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                        Folder Found
                      </span>
                    ) : (
                      <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                        Root Search
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                    {syncResult?.folder ? `Folder: "${syncResult.folder.name}"` : 'Searching Drive for "Comic Covers"...'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {syncResult?.folder
                      ? `Contains ${syncResult.coverFiles.length} comic image(s) + NoImage.png`
                      : syncResult?.error || 'Create a folder named "Comic Covers" in your Google Drive to organize your cover photos.'}
                  </p>
                </div>

                {/* NoImage.png Card */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileQuestion className="w-4 h-4 text-slate-800 dark:text-slate-200" />
                      Unscanned Placeholder
                    </span>
                    {syncResult?.noImageFile ? (
                      <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                        NoImage.png Loaded
                      </span>
                    ) : (
                      <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        SVG Fallback
                      </span>
                    )}
                  </div>

                  {syncResult?.noImageFile ? (
                    <div className="flex items-center gap-3 pt-1">
                      <img
                        src={mkDriveViewUrl(syncResult.noImageFile.id)}
                        alt="NoImage.png"
                        onError={handleImageError}
                        referrerPolicy="no-referrer"
                        className="w-10 h-14 object-cover rounded border border-slate-300 dark:border-slate-600 shadow-xs shrink-0"
                      />
                      <div className="flex-1 space-y-1">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{syncResult.noImageFile.name}</p>
                        <button
                          onClick={handleApplyNoImageToAllUnscanned}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold rounded-lg text-[10px] shadow-xs cursor-pointer"
                        >
                          Apply to Unscanned Vault Items
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Upload an image named <strong>NoImage.png</strong> into your Drive "Comic Covers" folder to customize the unscanned placeholder.
                    </p>
                  )}
                </div>
              </div>

              {/* Cover Files Section */}
              <div className="space-y-3">
                {successMessage && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>{successMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSuccessMessage(null)}
                      className="text-xs text-emerald-600 hover:text-emerald-800 font-bold cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                    Cover Images in Google Drive ({syncResult?.coverFiles.length || 0})
                  </h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    {alreadyLinkedCount > 0 && (
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" />
                        {alreadyLinkedCount} Already Linked
                      </span>
                    )}

                    {pendingMatches.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-indigo-700 dark:text-indigo-300 font-bold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {pendingMatches.length} Ready to Link
                        </span>
                        <button
                          type="button"
                          onClick={handleLinkAllMatchesNow}
                          disabled={isLinking}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Link All ({pendingMatches.length})</span>
                        </button>
                      </div>
                    ) : syncResult?.coverFiles && syncResult.coverFiles.length > 0 ? (
                      <span className="text-xs text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        All Matched Covers Linked!
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Search / Filter Input */}
                {syncResult?.coverFiles && syncResult.coverFiles.length > 0 && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={fileSearchQuery}
                        onChange={(e) => setFileSearchQuery(e.target.value)}
                        placeholder="Search cover files by name..."
                        className="w-full pl-8 pr-8 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                      />
                      {fileSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setFileSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Filter Segmented Control */}
                    <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setFileTypeFilter('all')}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          fileTypeFilter === 'all'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        All Images ({syncResult.coverFiles.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFileTypeFilter('standard')}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          fileTypeFilter === 'standard'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Front Covers ({standardCoverFilesCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFileTypeFilter('full')}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                          fileTypeFilter === 'full'
                            ? 'bg-white dark:bg-slate-700 text-purple-700 dark:text-purple-300 shadow-xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5 text-purple-500" />
                        <span>Full Wraparound Art ({fullCoverFilesCount})</span>
                      </button>
                    </div>
                  </div>
                )}

                {syncResult?.error && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200 text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{syncResult.error}</span>
                  </div>
                )}

                {isScanning ? (
                  <div className="py-8 text-center text-slate-500 dark:text-slate-400 space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-700 dark:text-slate-300" />
                    <p className="text-xs font-semibold">Scanning Google Drive &ldquo;Comic Covers&rdquo; folder...</p>
                    {scanProgressCount > 0 ? (
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                        Found {scanProgressCount} cover files so far...
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        Connecting to Google Drive...
                      </p>
                    )}
                  </div>
                ) : syncResult?.coverFiles.length === 0 ? (
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl text-center text-slate-500 dark:text-slate-400 space-y-1">
                    <p className="text-xs font-semibold">No scanned comic covers found in &ldquo;Comic Covers&rdquo; folder.</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Add images named after issue titles (e.g. &ldquo;Spider-Man 300.jpg&rdquo;) to your Google Drive folder and click Re-scan!
                    </p>
                  </div>
                ) : sortedAndFilteredCoverFiles.length === 0 ? (
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl text-center text-slate-500 dark:text-slate-400 space-y-1">
                    <p className="text-xs font-semibold">No cover files match &ldquo;{fileSearchQuery}&rdquo;</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-80 overflow-y-auto p-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
                      {sortedAndFilteredCoverFiles.slice(0, visibleCardCount).map((file) => {
                        const isFull = hasFullCoverWord(file.name);
                        const parsedFull = isFull ? parseStrictFullCoverFileName(file.name) : null;
                        const isStrictFull = isFull && !!parsedFull?.isStrictFullCover;
                        const isInvalidFullFormat = isFull && !isStrictFull;

                        const assignedComicId = stagedAssignments[file.id] || '';
                        const assignedComic = comics.find((c) => c.id === assignedComicId);
                        const isLinked = isFileLinkedToComic(file, assignedComic);
                        const isPending = !!assignedComic && !isLinked;

                        return (
                          <div
                            key={file.id}
                            className={`bg-white dark:bg-slate-900 border rounded-xl p-2.5 flex flex-col justify-between space-y-2 shadow-xs group transition-all ${
                              isLinked
                                ? 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/20 dark:bg-emerald-950/10'
                                : isPending
                                ? isFull
                                  ? 'border-purple-300 dark:border-purple-800/80 bg-purple-50/20 dark:bg-purple-950/10'
                                  : 'border-indigo-300 dark:border-indigo-800/80 bg-indigo-50/20 dark:bg-indigo-950/10'
                                : isInvalidFullFormat
                                ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10'
                                : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className={`relative ${isFull ? 'aspect-4/3' : 'aspect-3/4'} rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800`}>
                              <img
                                src={mkDriveViewUrl(file.id)}
                                alt={file.name}
                                onError={handleImageError}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />

                              {/* Type Badge on Top Left */}
                              {isFull && isStrictFull && (
                                <div className="absolute top-1 left-1 bg-purple-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5">
                                  <Layers className="w-2.5 h-2.5" /> Full Art
                                </div>
                              )}
                              {isInvalidFullFormat && (
                                <div className="absolute top-1 left-1 bg-amber-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5" title="Strict format required: Title Full #Issue or Title Annual Full Year">
                                  <AlertCircle className="w-2.5 h-2.5" /> Format Error
                                </div>
                              )}

                              {/* Status Badge on Top Right */}
                              {isLinked ? (
                                <div className="absolute top-1 right-1 bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> {isFull ? 'Linked' : 'Linked'}
                                </div>
                              ) : isPending ? (
                                <div className={`absolute top-1 right-1 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5 ${isFull ? 'bg-purple-600' : 'bg-indigo-600'}`}>
                                  <Sparkles className="w-2.5 h-2.5" /> Ready to Link
                                </div>
                              ) : null}
                            </div>

                            <div className="space-y-1.5">
                              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate" title={file.name}>
                                {file.name}
                              </p>
                              
                              {/* Vault Comic Selector */}
                              <select
                                value={assignedComicId}
                                onChange={(e) => {
                                  const newComicId = e.target.value;
                                  setStagedAssignments((prev) => ({ ...prev, [file.id]: newComicId }));
                                }}
                                className={`w-full border rounded text-[10px] px-1.5 py-1 font-medium transition-colors ${
                                  isLinked
                                    ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-bold'
                                    : isPending
                                    ? isFull
                                      ? 'bg-purple-50/60 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700 text-purple-900 dark:text-purple-200 font-bold'
                                      : 'bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200 font-bold'
                                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <option value="">(No comic assigned)</option>
                                {comicOptions}
                              </select>

                              {isInvalidFullFormat && (
                                <div className="text-[9px] text-amber-700 dark:text-amber-300 font-semibold bg-amber-100/70 dark:bg-amber-950/60 p-1 rounded border border-amber-300 dark:border-amber-800 leading-tight">
                                  Format: <em>Title Full #Issue</em> or <em>Title Annual Full Year</em>
                                </div>
                              )}

                              {/* Action Button / Status per card */}
                              {isPending ? (
                                <button
                                  type="button"
                                  onClick={() => handleLinkSingleCover(file.id)}
                                  disabled={isLinking}
                                  className={`w-full py-1 px-2 text-white font-bold rounded-lg text-[10px] flex items-center justify-center gap-1 shadow-xs cursor-pointer transition-colors ${
                                    isFull ? 'bg-purple-600 hover:bg-purple-700' : 'bg-emerald-600 hover:bg-emerald-700'
                                  }`}
                                >
                                  <Check className="w-3 h-3" />
                                  <span>{isFull ? 'Link as Full Art' : 'Link Front Cover'}</span>
                                </button>
                              ) : isLinked ? (
                                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center gap-1 py-0.5">
                                  <Check className="w-3 h-3" />
                                  <span>{isFull ? 'Linked as Full Art' : 'Linked to Vault'}</span>
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400 dark:text-slate-500 italic text-center py-0.5">
                                  {isInvalidFullFormat ? 'Rename file or select comic' : 'Select a comic above'}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {sortedAndFilteredCoverFiles.length > visibleCardCount && (
                      <div className="text-center pt-1 pb-1">
                        <button
                          type="button"
                          onClick={() => setVisibleCardCount((prev) => prev + 48)}
                          className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                        >
                          Show More Covers ({Math.min(visibleCardCount, sortedAndFilteredCoverFiles.length)} of {sortedAndFilteredCoverFiles.length})
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span>Google Drive Connected</span>
            {pendingMatches.length > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                • {pendingMatches.length} cover{pendingMatches.length === 1 ? '' : 's'} waiting to be linked
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {pendingMatches.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Close without Linking
                </button>
                <button
                  type="button"
                  onClick={handleDone}
                  disabled={isLinking}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>Link {pendingMatches.length} Cover{pendingMatches.length === 1 ? '' : 's'} & Done</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold rounded-xl shadow-xs text-xs cursor-pointer"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
