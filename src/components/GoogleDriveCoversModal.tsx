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
  Check
} from 'lucide-react';
import { User } from 'firebase/auth';
import { googleSignIn, initAuth, logout } from '../services/auth';
import { scanDriveComicCovers, DriveFileItem, DriveCoversSyncResult } from '../services/driveService';
import { ComicBook } from '../types';
import { getComicCoverUrl, setDriveNoImageUrl, handleImageError, isComicAlreadyLinked, doesFileNameMatchComic } from '../utils/imageUtils';

interface GoogleDriveCoversModalProps {
  isOpen: boolean;
  onClose: () => void;
  comics: ComicBook[];
  onUpdateComicCover: (comicId: string, coverUrl: string) => void;
  onApplyNoImageFallback: (noImageUrl: string) => void;
}

export const GoogleDriveCoversModal: React.FC<GoogleDriveCoversModalProps> = ({
  isOpen,
  onClose,
  comics,
  onUpdateComicCover,
  onApplyNoImageFallback,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [syncResult, setSyncResult] = useState<DriveCoversSyncResult | null>(null);
  const [linkedCount, setLinkedCount] = useState(0);

  const mkDriveViewUrl = (fileId: string) => `https://drive.google.com/uc?export=view&id=${fileId}`;

  // Compute unlinked matches: match Drive files against comics, skipping comics that are already linked
  const unlinkedMatches = useMemo(() => {
    if (!syncResult?.coverFiles || syncResult.coverFiles.length === 0) {
      return [];
    }

    const matches: Array<{ comic: ComicBook; driveFile: DriveFileItem }> = [];
    comics.forEach((comic) => {
      // Do NOT update comics that are already linked to a real cover image (NoImage.png doesn't count as linked)
      const noImgUrl = syncResult?.noImageFile ? mkDriveViewUrl(syncResult.noImageFile.id) : undefined;
      if (isComicAlreadyLinked(comic.coverImage, noImgUrl)) {
        return;
      }

      const matchedFile = syncResult.coverFiles.find((f) =>
        doesFileNameMatchComic(f.name, comic.title, comic.issueNumber, comic.volume)
      );

      if (matchedFile) {
        matches.push({ comic, driveFile: matchedFile });
      }
    });

    return matches;
  }, [comics, syncResult]);

  const alreadyLinkedCount = useMemo(() => {
    const noImgUrl = syncResult?.noImageFile ? mkDriveViewUrl(syncResult.noImageFile.id) : undefined;
    return comics.filter((c) => isComicAlreadyLinked(c.coverImage, noImgUrl)).length;
  }, [comics, syncResult]);

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

  const handleScanDrive = async (tokenToUse?: string) => {
    const tok = tokenToUse || accessToken;
    if (!tok) return;

    setIsScanning(true);
    try {
      const result = await scanDriveComicCovers(tok);
      setSyncResult(result);

      if (result.noImageFile) {
        const noUrl = mkDriveViewUrl(result.noImageFile.id);
        setDriveNoImageUrl(noUrl);
        onApplyNoImageFallback(noUrl);
      }
    } catch (err) {
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

  const handleAutoLinkAllMatches = () => {
    unlinkedMatches.forEach(({ comic, driveFile }) => {
      const url = mkDriveViewUrl(driveFile.id);
      onUpdateComicCover(comic.id, url);
    });
    setLinkedCount((prev) => prev + unlinkedMatches.length);
  };

  const handleLinkSingleCover = (comicId: string, driveFileId: string) => {
    const url = mkDriveViewUrl(driveFileId);
    onUpdateComicCover(comicId, url);
    setLinkedCount((prev) => prev + 1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-900 text-white shadow-xs">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                Google Drive "Comic Covers" Integration
              </h3>
              <p className="text-xs text-slate-500">
                Sync images & NoImage.png from your Google Drive folder directly to comic issues
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          {/* Auth State Box */}
          {!user || !accessToken ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-white rounded-full border border-slate-200 flex items-center justify-center mx-auto shadow-xs text-slate-700">
                <Cloud className="w-6 h-6 text-slate-800" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">Connect Google Drive Account</h4>
                <p className="text-xs text-slate-500">
                  Allow your comic vault to read your Google Drive <strong>"Comic Covers"</strong> folder to fetch scanned covers and <strong>NoImage.png</strong>.
                </p>
              </div>

              {/* Official Google Sign-In Button */}
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                  className="inline-flex items-center gap-3 px-5 py-2.5 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded-xl shadow-xs text-slate-700 font-bold text-xs transition-all disabled:opacity-50"
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
                <div className="mt-3 p-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded">
                  <strong className="font-bold">Sign-in error:</strong> {authError}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Connected User Bar */}
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div className="flex items-center gap-2.5">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full border border-slate-300" />
                  ) : (
                    <div className="w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-[10px]">
                      {user.displayName?.[0] || 'G'}
                    </div>
                  )}
                  <div>
                    <span className="font-bold text-slate-800">{user.displayName || user.email}</span>
                    <span className="text-slate-400 text-[10px] ml-2">Connected Drive Account</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleScanDrive()}
                    disabled={isScanning}
                    className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                    <span>Re-scan Drive</span>
                  </button>
                  <button
                    onClick={() => logout().then(() => { setUser(null); setAccessToken(null); })}
                    className="px-2.5 py-1 text-slate-500 hover:text-slate-800 font-medium"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Status & Folder Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Folder Status Card */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <FolderCheck className="w-4 h-4 text-slate-800" />
                      Google Drive Folder
                    </span>
                    {syncResult?.folder ? (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                        Folder Found
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                        Root Search
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 font-semibold">
                    {syncResult?.folder ? `Folder: "${syncResult.folder.name}"` : 'Searching Drive for "Comic Covers"...'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {syncResult?.folder
                      ? `Contains ${syncResult.coverFiles.length} comic image(s) + NoImage.png`
                      : syncResult?.error || 'Create a folder named "Comic Covers" in your Google Drive to organize your cover photos.'}
                  </p>
                </div>

                {/* NoImage.png Card */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <FileQuestion className="w-4 h-4 text-slate-800" />
                      Unscanned Placeholder
                    </span>
                    {syncResult?.noImageFile ? (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                        NoImage.png Loaded
                      </span>
                    ) : (
                      <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
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
                        className="w-10 h-14 object-cover rounded border border-slate-300 shadow-xs shrink-0"
                      />
                      <div className="flex-1 space-y-1">
                        <p className="text-xs font-bold text-slate-800">{syncResult.noImageFile.name}</p>
                        <button
                          onClick={handleApplyNoImageToAllUnscanned}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-[10px] shadow-xs"
                        >
                          Apply to Unscanned Vault Items
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      Upload an image named <strong>NoImage.png</strong> into your Drive "Comic Covers" folder to customize the unscanned placeholder.
                    </p>
                  )}
                </div>
              </div>

              {/* Cover Files Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-slate-700" />
                    Cover Images in Google Drive ({syncResult?.coverFiles.length || 0})
                  </h4>
                  <div className="flex items-center gap-2">
                    {alreadyLinkedCount > 0 && (
                      <span className="text-[11px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {alreadyLinkedCount} Already Linked
                      </span>
                    )}

                    {unlinkedMatches.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {unlinkedMatches.length} New Matches
                        </span>
                        <button
                          onClick={handleAutoLinkAllMatches}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] shadow-xs flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          Auto-Link {unlinkedMatches.length} Unlinked Matches
                        </button>
                      </div>
                    ) : syncResult?.coverFiles && syncResult.coverFiles.length > 0 ? (
                      <span className="text-xs text-slate-600 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        All Matched Comics Already Linked
                      </span>
                    ) : null}
                  </div>
                </div>

                {isScanning ? (
                  <div className="py-8 text-center text-slate-500 space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-700" />
                    <p className="text-xs font-semibold">Scanning Google Drive "Comic Covers" folder...</p>
                  </div>
                ) : syncResult?.coverFiles.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 space-y-1">
                    <p className="text-xs font-semibold">No scanned comic covers found in "Comic Covers" folder yet.</p>
                    <p className="text-[11px] text-slate-400">
                      Add images named after issue titles (e.g. "Spider-Man 300.jpg") to your Google Drive folder and click Re-scan!
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-64 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/50">
                    {syncResult?.coverFiles.map((file) => {
                      const fileUrl = mkDriveViewUrl(file.id);
                      const matchedComic = comics.find(
                        (c) => c.coverImage === fileUrl || (c.coverImage && c.coverImage.includes(file.id))
                      );

                      const suggestedComic = !matchedComic
                        ? comics.find((c) => doesFileNameMatchComic(file.name, c.title, c.issueNumber, c.volume))
                        : undefined;

                      return (
                        <div
                          key={file.id}
                          className="bg-white border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between space-y-2 shadow-xs group"
                        >
                          <div className="relative aspect-3/4 rounded-lg overflow-hidden border border-slate-200">
                            <img
                              src={mkDriveViewUrl(file.id)}
                              alt={file.name}
                              onError={handleImageError}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            {matchedComic ? (
                              <div className="absolute top-1 right-1 bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5">
                                <Check className="w-2.5 h-2.5" /> Linked
                              </div>
                            ) : suggestedComic ? (
                              <div className="absolute top-1 right-1 bg-indigo-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5" /> Match
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-1">
                            <p className="text-[11px] font-bold text-slate-800 truncate" title={file.name}>
                              {file.name}
                            </p>
                            
                            {/* Vault Comic Selector to Link */}
                            <select
                              value={matchedComic ? matchedComic.id : (suggestedComic ? suggestedComic.id : '')}
                              onChange={(e) => {
                                if (e.target.value) {
                                handleLinkSingleCover(e.target.value, file.id);
                                }
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded text-[10px] px-1.5 py-1 font-medium text-slate-700"
                            >
                              <option value="">Link to Comic...</option>
                              {suggestedComic && !matchedComic && (
                                <option value={suggestedComic.id}>
                                  ✨ Suggested: {suggestedComic.title} #{suggestedComic.issueNumber}
                                </option>
                              )}
                              {comics.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.title} #{c.issueNumber}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Google Drive OAuth API Connected</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
