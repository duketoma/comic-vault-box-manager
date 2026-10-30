import React, { useState, useMemo, useEffect } from 'react';
import { 
  ComicBook, 
  SeriesIssueTotal, 
  StorageBox, 
  CREATOR_ROLES, 
  CreatorContribution, 
  CharacterAppearance,
  ComicFormat,
  ComicCondition,
  COMIC_FORMATS,
  FORMAT_DEFAULT_THICKNESS,
  COMIC_CONDITIONS
} from '../types';
import { getComicCoverUrl, formatDriveImageUrl, handleImageError, extractDriveFileId } from '../utils/imageUtils';
import { sortBoxes } from '../utils/boxUtils';
import { formatPublicationDate, formatIsoComicDate, MONTH_NAMES } from '../utils/dateUtils';
import { getComicSeriesInfo } from '../utils/seriesUtils';
import { formatComicFullTitle, isYearDesignatedAnnual } from '../utils/comicSortUtils';
import { FullArtShowcaseModal } from './FullArtShowcaseModal';
import { CoverScannerCropper } from './CoverScannerCropper';
import { 
  X, 
  Star, 
  Layers, 
  Boxes, 
  BookOpen, 
  Edit3, 
  Trash2, 
  Check, 
  DollarSign, 
  Tag, 
  Clock, 
  Calendar, 
  Image as ImageIcon, 
  UserCheck, 
  Plus, 
  Cloud, 
  ExternalLink, 
  Info, 
  ShieldAlert, 
  Target, 
  Crown,
  Search,
  Sparkles,
  Bookmark,
  Crop
} from 'lucide-react';

interface ComicDetailModalProps {
  comic: ComicBook | null;
  onClose: () => void;
  boxes: StorageBox[];
  onUpdateComic: (updated: ComicBook) => void;
  onDeleteComic: (comicId: string) => void;
  seriesTotals?: SeriesIssueTotal[];
  allComics?: ComicBook[];
  creatorTypes?: string[];
  onViewSeriesInCatalog?: (seriesName: string) => void;
  onOpenGenerateWishlist?: (seriesName?: string) => void;
}

function getInitialContributions(comic: ComicBook | null): CreatorContribution[] {
  if (!comic) return [];
  if (comic.creatorContributions && comic.creatorContributions.length > 0) {
    return comic.creatorContributions;
  }
  return [
    ...(comic.writer ? [{ creatorName: comic.writer, roleName: 'Writer' }] : []),
    ...(comic.artist ? [{ creatorName: comic.artist, roleName: 'Penciller' }] : []),
    ...(comic.coverArtist ? [{ creatorName: comic.coverArtist, roleName: 'Cover Penciller' }] : []),
  ];
}

export const ComicDetailModal: React.FC<ComicDetailModalProps> = ({
  comic,
  onClose,
  boxes,
  onUpdateComic,
  onDeleteComic,
  seriesTotals = [],
  allComics = [],
  creatorTypes = [],
  onViewSeriesInCatalog,
  onOpenGenerateWishlist,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [cropperTargetField, setCropperTargetField] = useState<'front' | 'full' | null>(null);
  const [title, setTitle] = useState(comic?.title || '');
  const [issueNumber, setIssueNumber] = useState(comic?.issueNumber || '1');
  const [readingStatus, setReadingStatus] = useState(comic?.readingStatus || 'Unread');
  const [userRating, setUserRating] = useState(comic?.userRating || 0);
  const [boxId, setBoxId] = useState(comic?.currentBoxId || 0);
  const [notes, setNotes] = useState(comic?.notes || '');
  const [thickness, setThickness] = useState(comic?.sizeThickness ?? 1.0);
  const [coverImage, setCoverImage] = useState(comic?.coverImage || '');
  const [coverImageFull, setCoverImageFull] = useState(comic?.coverImageFull || '');
  const [showFullArtModal, setShowFullArtModal] = useState(false);
  const [heroViewMode, setHeroViewMode] = useState<'front' | 'full'>('front');
  const [volume, setVolume] = useState(comic?.volume || '');
  const [seriesName, setSeriesName] = useState(comic?.seriesName || '');
  const [condition, setCondition] = useState<ComicCondition>(comic?.condition || 'Near Mint');
  const [format, setFormat] = useState<ComicFormat>(comic?.format || 'Single Issue');
  const [purchasePrice, setPurchasePrice] = useState<string>(
    comic?.purchasePrice !== undefined && comic?.purchasePrice !== null ? String(comic.purchasePrice) : ''
  );
  const [estimatedValue, setEstimatedValue] = useState<string>(
    comic?.estimatedValue !== undefined && comic?.estimatedValue !== null ? String(comic.estimatedValue) : ''
  );
  const [tags, setTags] = useState<string[]>(Array.isArray(comic?.tags) ? [...comic.tags] : []);
  const [newTagInput, setNewTagInput] = useState('');
  const [event, setEvent] = useState(comic?.event || '');
  const [publicationYear, setPublicationYear] = useState<number>(comic?.publicationYear || 0);
  const [publicationMonth, setPublicationMonth] = useState<string>(comic?.publicationMonth || '');
  const initialCopies = comic?.readingStatus === 'Wishlist' ? 0 : (comic?.copiesOwned !== undefined ? comic.copiesOwned : 1);
  const [copiesOwned, setCopiesOwned] = useState(initialCopies);

  // Creator Contributions State
  const [contributions, setContributions] = useState<CreatorContribution[]>(() => getInitialContributions(comic));
  const [newCreatorName, setNewCreatorName] = useState('');
  const [newRoleName, setNewRoleName] = useState<string>('Writer');
  const [customRoleName, setCustomRoleName] = useState<string>('');

  // Character Appearances State
  const [characters, setCharacters] = useState<CharacterAppearance[]>(comic?.characterAppearances || []);
  const [newCharName, setNewCharName] = useState('');
  const [newCharType, setNewCharType] = useState('Main');
  const [charSearch, setCharSearch] = useState('');
  const [expandAllCharacters, setExpandAllCharacters] = useState(false);
  const [expandAllCreators, setExpandAllCreators] = useState(false);

  // Sync state when selected comic changes
  useEffect(() => {
    if (!comic) return;
    setTitle(comic.title || '');
    setIssueNumber(comic.issueNumber || '1');
    setReadingStatus(comic.readingStatus || 'Unread');
    setUserRating(comic.userRating || 0);
    setBoxId(comic.currentBoxId || 0);
    setNotes(comic.notes || '');
    setThickness(comic.sizeThickness ?? 1.0);
    setCoverImage(comic.coverImage || '');
    setCoverImageFull(comic.coverImageFull || '');
    setHeroViewMode('front');
    setVolume(comic.volume || '');
    setSeriesName(comic.seriesName || '');
    setCondition(comic.condition || 'Near Mint');
    setFormat(comic.format || 'Single Issue');
    setPurchasePrice(
      comic.purchasePrice !== undefined && comic.purchasePrice !== null ? String(comic.purchasePrice) : ''
    );
    setEstimatedValue(
      comic.estimatedValue !== undefined && comic.estimatedValue !== null ? String(comic.estimatedValue) : ''
    );
    setTags(Array.isArray(comic.tags) ? [...comic.tags] : []);
    setNewTagInput('');
    setEvent(comic.event || '');
    setPublicationYear(comic.publicationYear || 0);
    setPublicationMonth(comic.publicationMonth || '');
    setCopiesOwned(comic.readingStatus === 'Wishlist' ? 0 : (comic.copiesOwned !== undefined ? comic.copiesOwned : 1));
    setContributions(getInitialContributions(comic));
    setCharacters(comic.characterAppearances || []);
    setIsEditing(false);
    setCropperTargetField(null);
  }, [comic]);

  const availableRoles = useMemo(() => {
    const roleMap = new Map<string, string>();

    // 1. Add all baseline roles from CREATOR_ROLES
    CREATOR_ROLES.forEach((r) => {
      if (r && r.trim()) {
        roleMap.set(r.trim().toLowerCase(), r.trim());
      }
    });

    // 2. Add all roles from creatorTypes (loaded from database)
    if (creatorTypes && Array.isArray(creatorTypes)) {
      creatorTypes.forEach((ct) => {
        if (ct && ct.trim()) {
          const trimmed = ct.trim();
          if (!roleMap.has(trimmed.toLowerCase())) {
            roleMap.set(trimmed.toLowerCase(), trimmed);
          }
        }
      });
    }

    // 3. Add all roles from allComics
    if (allComics && Array.isArray(allComics)) {
      allComics.forEach((c) => {
        c.creatorContributions?.forEach((cc) => {
          const r = (cc.roleName || cc.creatorType || '').trim();
          if (r && !roleMap.has(r.toLowerCase())) {
            roleMap.set(r.toLowerCase(), r);
          }
        });
      });
    }

    // 4. Add all roles from current comic contributions
    if (contributions && Array.isArray(contributions)) {
      contributions.forEach((cc) => {
        const r = (cc.roleName || cc.creatorType || '').trim();
        if (r && !roleMap.has(r.toLowerCase())) {
          roleMap.set(r.toLowerCase(), r);
        }
      });
    }

    // Sort alphabetically
    return Array.from(roleMap.values()).sort((a, b) => a.localeCompare(b));
  }, [creatorTypes, allComics, contributions]);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const filteredCharacters = useMemo(() => {
    if (!charSearch.trim()) return characters;
    const q = charSearch.toLowerCase().trim();
    return characters.filter(
      (c) =>
        c.characterName.toLowerCase().includes(q) ||
        (c.appearanceType || '').toLowerCase().includes(q)
    );
  }, [characters, charSearch]);

  const seriesInfo = useMemo(
    () => getComicSeriesInfo(comic, allComics, seriesTotals),
    [comic, seriesTotals, allComics]
  );

  const availableSeriesOptions = useMemo(() => {
    const sSet = new Set<string>();
    if (seriesTotals && Array.isArray(seriesTotals)) {
      seriesTotals.forEach((st) => {
        if (st.seriesName && st.seriesName.trim()) sSet.add(st.seriesName.trim());
      });
    }
    if (allComics && Array.isArray(allComics)) {
      allComics.forEach((c) => {
        if (c.seriesName && c.seriesName.trim()) sSet.add(c.seriesName.trim());
        else if (c.title && c.title.trim()) sSet.add(c.title.trim());
      });
    }
    return Array.from(sSet).sort((a, b) => a.localeCompare(b));
  }, [seriesTotals, allComics]);

  const allExistingTags = useMemo(() => {
    const tagSet = new Set<string>();
    if (allComics && Array.isArray(allComics)) {
      allComics.forEach((c) => {
        if (Array.isArray(c.tags)) {
          c.tags.forEach((t) => {
            if (t && t.trim()) tagSet.add(t.trim());
          });
        }
      });
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [allComics]);

  const suggestedTags = useMemo(() => {
    const currentTagSet = new Set(tags.map((t) => t.toLowerCase()));
    return allExistingTags.filter((t) => !currentTagSet.has(t.toLowerCase()));
  }, [allExistingTags, tags]);

  if (!comic) return null;

  const currentBox = boxes.find((b) => b.id === comic.currentBoxId);

  const handleAddContribution = () => {
    if (!newCreatorName.trim()) return;
    const finalRole = (newRoleName === '__custom__' ? customRoleName.trim() : newRoleName.trim()) || 'Writer';

    const updated = [
      ...contributions,
      {
        id: `contrib-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        creatorName: newCreatorName.trim(),
        roleName: finalRole,
      },
    ];
    setContributions(updated);
    setNewCreatorName('');
    if (newRoleName === '__custom__') {
      setCustomRoleName('');
      setNewRoleName(finalRole);
    }
  };

  const handleRemoveContribution = (index: number) => {
    setContributions(contributions.filter((_, i) => i !== index));
  };

  const handleAddCharacter = () => {
    if (!newCharName.trim()) return;
    const updated = [
      ...characters,
      {
        id: `char-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        characterName: newCharName.trim(),
        appearanceType: newCharType,
      },
    ];
    setCharacters(updated);
    setNewCharName('');
  };

  const handleRemoveCharacter = (target: CharacterAppearance | number) => {
    if (typeof target === 'number') {
      setCharacters(characters.filter((_, i) => i !== target));
    } else {
      setCharacters(characters.filter((c) => c !== target));
    }
  };

  const handleFormatChange = (newFmt: ComicFormat) => {
    setFormat(newFmt);
    const defaultThickness = FORMAT_DEFAULT_THICKNESS[newFmt];
    if (defaultThickness !== undefined) {
      setThickness(defaultThickness);
    }
  };

  const handleAddTag = (rawTag?: string) => {
    const candidate = (rawTag !== undefined ? rawTag : newTagInput).trim().replace(/^#/, '');
    if (!candidate) return;
    const splitTags = candidate.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
    const nextTags = [...tags];
    splitTags.forEach((t) => {
      if (!nextTags.some((existing) => existing.toLowerCase() === t.toLowerCase())) {
        nextTags.push(t);
      }
    });
    setTags(nextTags);
    setNewTagInput('');
  };

  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const handleSaveQuickEdits = () => {
    // Derive primary writer and artist for backwards compatibility
    const writerContrib = contributions.find((c) => c.roleName.toLowerCase() === 'writer');
    const artistContrib = contributions.find((c) => ['penciller', 'artist'].includes(c.roleName.toLowerCase()));

    const cleanTitle = title.trim() || comic.title;
    const cleanIssue = issueNumber.trim() || comic.issueNumber;
    const cleanSeries = seriesName.trim();
    const cleanFullTitle = formatComicFullTitle({
      title: cleanTitle,
      issueNumber: cleanIssue,
      seriesName: cleanSeries,
      fullTitle: comic.fullTitle,
    });

    const parsedPurchasePrice = purchasePrice.trim() !== '' && !isNaN(Number(purchasePrice))
      ? Number(parseFloat(purchasePrice).toFixed(2))
      : undefined;
    const parsedEstimatedValue = estimatedValue.trim() !== '' && !isNaN(Number(estimatedValue))
      ? Number(parseFloat(estimatedValue).toFixed(2))
      : undefined;

    onUpdateComic({
      ...comic,
      title: cleanTitle,
      issueNumber: cleanIssue,
      fullTitle: cleanFullTitle,
      seriesName: seriesName.trim() || undefined,
      readingStatus,
      userRating: userRating || undefined,
      currentBoxId: Number(boxId),
      condition,
      format,
      purchasePrice: parsedPurchasePrice,
      estimatedValue: parsedEstimatedValue,
      tags,
      notes,
      sizeThickness: Number(thickness),
      coverImage: coverImage.trim() || 'NoImage.webp',
      coverImageFull: coverImageFull.trim() || undefined,
      volume: volume.trim() || undefined,
      event: event.trim() || undefined,
      publicationYear: Number(publicationYear) || comic.publicationYear,
      publicationMonth: publicationMonth.trim() || undefined,
      publicationDate: formatIsoComicDate(Number(publicationYear) || comic.publicationYear, publicationMonth.trim() || undefined, comic.publicationDate),
      copiesOwned: readingStatus === 'Wishlist' ? 0 : (Number(copiesOwned) >= 0 ? Number(copiesOwned) : 0),
      writer: writerContrib ? writerContrib.creatorName : comic.writer,
      artist: artistContrib ? artistContrib.creatorName : comic.artist,
      creatorContributions: contributions,
      characterAppearances: characters,
      lastReadDate: readingStatus === 'Read' ? new Date().toISOString().split('T')[0] : comic.lastReadDate,
    });
    setIsEditing(false);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden my-auto">
        
        {/* Sticky Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shrink-0 z-10">
          <div className="min-w-0 pr-2">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm truncate flex items-center gap-1.5">
              <span>{isEditing ? (title || 'Untitled Comic') : (comic.title || comic.fullTitle || comic.seriesName || 'Untitled Comic')}</span>
              <span className="text-slate-500 dark:text-slate-400 font-bold">#{isEditing ? issueNumber : comic.issueNumber}</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {comic.publisher} • {formatPublicationDate(publicationYear, publicationMonth)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isEditing && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuickEdits}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
          {/* Top Image & Hero Overlay */}
          <div className="relative bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 p-4 sm:p-6 flex flex-col sm:flex-row gap-5 sm:gap-6 items-center sm:items-start">
            <div className="flex flex-col items-center shrink-0 space-y-2">
              <div className="relative group">
                <img
                  src={
                    heroViewMode === 'full' && (coverImageFull || comic.coverImageFull)
                      ? formatDriveImageUrl(coverImageFull || comic.coverImageFull!)
                      : getComicCoverUrl(coverImage || comic.coverImage)
                  }
                  alt={comic.title}
                  onError={handleImageError}
                  referrerPolicy="no-referrer"
                  className={`${
                    heroViewMode === 'full' && (coverImageFull || comic.coverImageFull)
                      ? 'w-60 h-40 sm:w-72 sm:h-48 object-contain bg-black/40'
                      : 'w-36 h-54 sm:w-40 sm:h-60 object-cover'
                  } rounded-xl shadow-md border border-slate-200 dark:border-slate-700 transition-all cursor-pointer`}
                  onClick={() => {
                    if (comic.coverImageFull) setShowFullArtModal(true);
                  }}
                  title={comic.coverImageFull ? 'Click to open full-art showcase' : undefined}
                />

                {(coverImageFull || comic.coverImageFull) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowFullArtModal(true);
                    }}
                    className="absolute bottom-2 right-2 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-extrabold px-2 py-1 rounded-lg shadow-lg flex items-center gap-1 transition-all cursor-pointer"
                    title="Open Full Art Showcase"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Showcase</span>
                  </button>
                )}
              </div>

              {/* Toggle Front vs Full Art if Full Art is available */}
              {(coverImageFull || comic.coverImageFull) && (
                <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-700/80 p-0.5 rounded-lg text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setHeroViewMode('front')}
                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      heroViewMode === 'front'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-black'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Front Cover
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeroViewMode('full')}
                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-0.5 ${
                      heroViewMode === 'full'
                        ? 'bg-purple-600 text-white shadow-xs font-black'
                        : 'text-purple-700 dark:text-purple-300 hover:text-purple-900'
                    }`}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Full Art</span>
                  </button>
                </div>
              )}

              {/* 1-Click Launch Cover Scanner & Cropper */}
              <button
                type="button"
                onClick={() => setCropperTargetField(heroViewMode === 'full' ? 'full' : 'front')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                title="Add, replace, or perspective-crop this comic's cover image"
              >
                <Crop className="w-3.5 h-3.5 text-sky-400" />
                <span>Scan / Crop Cover</span>
              </button>
            </div>

            <div className="flex-1 space-y-2 text-center sm:text-left min-w-0 w-full">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[11px] font-bold">
                  {comic.publisher} • {formatPublicationDate(publicationYear, publicationMonth)}
                </span>
              </div>

            <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-tight">
              {comic.title || comic.fullTitle || comic.seriesName || 'Untitled Comic'}{' '}
              {!isYearDesignatedAnnual(comic) && (
                <span className="text-slate-600 dark:text-slate-400">#{comic.issueNumber}</span>
              )}
            </h2>

            {comic.seriesName && (
              <p className="text-xs text-indigo-700 dark:text-indigo-400 font-semibold">{comic.seriesName}</p>
            )}

            {comic.volume && !comic.seriesName && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">{comic.volume}</p>
            )}

            {/* Series Run Collection Progress Widget */}
            {seriesInfo && seriesInfo.totalPublished > 0 && (
              <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1.5 text-left">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Series Run Progress</span>
                  </span>
                  <span className="font-extrabold text-slate-900 dark:text-slate-100">
                    {seriesInfo.ownedInSeries} / {seriesInfo.totalPublished} issues ({seriesInfo.pct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      seriesInfo.isComplete
                        ? 'bg-gradient-to-r from-amber-400 to-amber-600'
                        : seriesInfo.pct >= 75
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        : 'bg-indigo-600'
                    }`}
                    style={{ width: `${seriesInfo.pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>
                    {seriesInfo.isComplete ? (
                      <span className="text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1">
                        <Crown className="w-3 h-3 text-amber-500" />
                        <span>Full series run collected!</span>
                      </span>
                    ) : (
                      <span>
                        <strong>{seriesInfo.remaining}</strong> {seriesInfo.remaining === 1 ? 'issue' : 'issues'} needed to complete run
                      </span>
                    )}
                  </span>
                  {seriesInfo.wishlistInSeries > 0 && (
                    <span className="text-rose-600 dark:text-rose-400 font-medium">
                      ({seriesInfo.wishlistInSeries} in wishlist)
                    </span>
                  )}
                </div>

                {(onViewSeriesInCatalog || onOpenGenerateWishlist) && (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {onViewSeriesInCatalog && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onViewSeriesInCatalog(seriesInfo.seriesName);
                          }}
                          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>View all {seriesInfo.ownedInSeries} issues in Series Run</span>
                        </button>
                      )}

                      {onOpenGenerateWishlist && !seriesInfo.isComplete && seriesInfo.remaining > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenGenerateWishlist(seriesInfo.seriesName);
                          }}
                          className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-1 cursor-pointer transition-colors"
                          title="Generate missing issues as wishlist comics"
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                          <span>Add Missing to Wishlist</span>
                        </button>
                      )}
                    </div>

                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      {seriesInfo.pct}% to 100%
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs text-slate-700 dark:text-slate-300">
              <span>W: <strong>{comic.writer || 'Unknown'}</strong></span>
              <span>•</span>
              <span>A: <strong>{comic.artist || 'Unknown'}</strong></span>
            </div>

            {/* Badges */}
            <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                <Boxes className="w-3.5 h-3.5" />
                Box #{comic.currentBoxId}: {currentBox?.name.split('-')[1] || currentBox?.name}
              </span>

              <span className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                {(comic.sizeThickness ?? 1.0).toFixed(1)}x Thickness Units
              </span>

              {comic.event && (
                <span className="bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-800 text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                  ⚡ Event: {comic.event}
                </span>
              )}

              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 ${
                comic.readingStatus === 'Wishlist' || (comic.copiesOwned !== undefined && comic.copiesOwned === 0)
                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-900 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
              }`}>
                {comic.readingStatus === 'Wishlist'
                  ? `${comic.copiesOwned ?? 0} Copies (Wishlist)`
                  : `${comic.copiesOwned ?? 0} ${(comic.copiesOwned ?? 0) === 1 ? 'Copy' : 'Copies'} Owned`}
              </span>

              <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold px-2.5 py-1 rounded-lg">
                {comic.format || 'Single Issue'}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Main Content */}
        <div className="p-6 space-y-5">
          
          {/* Quick Edit Controls */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Status & Location Management
              </h3>
              <div className="flex items-center gap-2">
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleSaveQuickEdits}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-xs cursor-pointer flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-1 font-semibold cursor-pointer px-2 py-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {isEditing ? 'Cancel' : 'Edit Values'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Box Location */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Stored Box Location</label>
                <select
                  disabled={!isEditing}
                  value={boxId}
                  onChange={(e) => setBoxId(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 disabled:opacity-80"
                >
                  <option value={0}>Box 0 - Unallocated / Staging Queue</option>
                  {sortBoxes(boxes).map((b) => (
                    <option key={b.id} value={b.id}>
                      Box #{b.id}: {b.name.split('-')[1] || b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reading Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Reading Status</label>
                <select
                  disabled={!isEditing}
                  value={readingStatus}
                  onChange={(e) => setReadingStatus(e.target.value as any)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 disabled:opacity-80"
                >
                  <option value="Unread">Unread</option>
                  <option value="Reading">Currently Reading</option>
                  <option value="Read">Read</option>
                  <option value="Wishlist">Wishlist</option>
                </select>
              </div>

              {/* Rating */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">My Rating</label>
                <div className="flex items-center gap-1 pt-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      disabled={!isEditing}
                      onClick={() => setUserRating(star)}
                      className="text-amber-500 disabled:cursor-default cursor-pointer"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          star <= userRating ? 'fill-amber-400 text-amber-500' : 'text-slate-300 dark:text-slate-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* Extended Edit Controls: Title, Issue #, Volume, Event, Year, Month, Copies Owned */}
            {/* Extended Edit Controls: Series, Title, Issue #, Volume, Event, Year, Month, Copies Owned */}
            {isEditing && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-indigo-700 dark:text-indigo-400 mb-1">Comic Series</label>
                    <input
                      type="text"
                      list="comic-series-datalist"
                      value={seriesName}
                      onChange={(e) => setSeriesName(e.target.value)}
                      placeholder="e.g. The Amazing Spider-Man (1963 - 1998)"
                      className="w-full bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-800 rounded-lg px-2.5 py-1.5 text-xs text-indigo-950 dark:text-indigo-200 font-medium"
                    />
                    <datalist id="comic-series-datalist">
                      {availableSeriesOptions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Comic Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. X-Factor"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Issue #</label>
                    <input
                      type="text"
                      value={issueNumber}
                      onChange={(e) => setIssueNumber(e.target.value)}
                      placeholder="e.g. 1, -1, 300, 1A"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Volume</label>
                    <input
                      type="text"
                      value={volume}
                      onChange={(e) => setVolume(e.target.value)}
                      placeholder="e.g. Vol. 1 or 2011"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-purple-700 dark:text-purple-400 mb-1">Crossover Event</label>
                    <input
                      type="text"
                      value={event}
                      onChange={(e) => setEvent(e.target.value)}
                      placeholder="e.g. Secret Wars, Civil War"
                      className="w-full bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-lg px-2.5 py-1.5 text-xs text-purple-900 dark:text-purple-300 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-amber-800 dark:text-amber-400 mb-1">Copies Owned</label>
                    <input
                      type="number"
                      min={0}
                      value={copiesOwned}
                      onChange={(e) => setCopiesOwned(Number(e.target.value))}
                      className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-lg px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-300 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Pub Year</label>
                    <input
                      type="number"
                      value={publicationYear}
                      onChange={(e) => setPublicationYear(Number(e.target.value))}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Release Month</label>
                    <select
                      value={publicationMonth}
                      onChange={(e) => setPublicationMonth(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                    >
                      <option value="">(None)</option>
                      {MONTH_NAMES.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Creators & Contributions Section */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Comic Creators & Role Contributions ({contributions.length})</span>
                </h4>
                {contributions.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setExpandAllCreators(!expandAllCreators)}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                  >
                    {expandAllCreators ? 'Show Less' : `Show All (${contributions.length})`}
                  </button>
                )}
              </div>

              {/* Contributions Badges List */}
              <div className={`flex flex-wrap gap-1.5 pt-1 ${!expandAllCreators && contributions.length > 8 ? 'max-h-36 overflow-y-auto pr-1' : ''}`}>
                {contributions.length === 0 ? (
                  <span className="text-xs text-slate-400 dark:text-slate-500 italic">No creators listed yet.</span>
                ) : (
                  contributions.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs px-2.5 py-1 rounded-lg font-medium"
                    >
                      <span className="font-bold text-slate-900 dark:text-slate-100">{item.creatorName}</span>
                      <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 font-bold px-1.5 py-0.2 rounded uppercase tracking-wider">
                        {item.roleName}
                      </span>
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => handleRemoveContribution(idx)}
                          className="text-slate-400 hover:text-rose-600 ml-1 font-bold cursor-pointer"
                          title="Remove creator contribution"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add New Creator Contribution in Edit Mode */}
              {isEditing && (
                <div className="flex flex-wrap items-center gap-2 pt-2 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 p-2.5 rounded-xl">
                  <input
                    type="text"
                    placeholder="Creator Name (e.g., Jim Lee)"
                    value={newCreatorName}
                    onChange={(e) => setNewCreatorName(e.target.value)}
                    className="flex-1 min-w-[140px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  />
                  <select
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-medium max-w-[210px]"
                  >
                    {availableRoles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    <option value="__custom__">+ Custom Role Type...</option>
                  </select>
                  {newRoleName === '__custom__' && (
                    <input
                      type="text"
                      placeholder="Type custom role (e.g., Flatter)"
                      value={customRoleName}
                      onChange={(e) => setCustomRoleName(e.target.value)}
                      className="min-w-[140px] bg-white dark:bg-slate-900 border border-indigo-400 dark:border-indigo-600 rounded-lg px-2.5 py-1.5 text-xs text-indigo-900 dark:text-indigo-200 font-medium"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleAddContribution}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Role</span>
                  </button>
                </div>
              )}
            </div>

            {/* Character Appearances Section */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <span className="text-sm">🦸</span>
                  <span>Character Appearances ({characters.length})</span>
                </h4>
                {characters.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setExpandAllCharacters(!expandAllCharacters)}
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                  >
                    {expandAllCharacters ? 'Show Less' : `Show All (${characters.length})`}
                  </button>
                )}
              </div>

              {/* Character Filter / Search Bar (if more than 6 characters) */}
              {characters.length > 6 && (
                <div className="relative pt-0.5">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder={`Filter ${characters.length} characters...`}
                    value={charSearch}
                    onChange={(e) => setCharSearch(e.target.value)}
                    className="w-full pl-8 pr-7 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {charSearch && (
                    <button
                      type="button"
                      onClick={() => setCharSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      ×
                    </button>
                  )}
                </div>
              )}

              {/* Character Badges List */}
              <div className={`flex flex-wrap gap-1.5 pt-1 ${!expandAllCharacters && characters.length > 8 ? 'max-h-48 overflow-y-auto pr-1' : ''}`}>
                {characters.length === 0 ? (
                  <span className="text-xs text-slate-400 dark:text-slate-500 italic">No character appearances tracked for this issue yet.</span>
                ) : filteredCharacters.length === 0 ? (
                  <span className="text-xs text-slate-400 dark:text-slate-500 italic">No characters matching "{charSearch}".</span>
                ) : (
                  filteredCharacters.map((char, idx) => (
                    <div
                      key={char.id || `${char.characterName}-${idx}`}
                      className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs px-2.5 py-1 rounded-lg font-medium"
                    >
                      <span className="font-bold text-slate-900 dark:text-slate-100">{char.characterName}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                        char.appearanceType?.toLowerCase().includes('main')
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          : char.appearanceType?.toLowerCase().includes('cameo')
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}>
                        {char.appearanceType || 'Supporting'}
                      </span>
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCharacter(char)}
                          className="text-slate-400 hover:text-rose-600 ml-1 font-bold cursor-pointer"
                          title="Remove character"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add New Character in Edit Mode */}
              {isEditing && (
                <div className="flex flex-wrap items-center gap-2 pt-2 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 p-2.5 rounded-xl">
                  <input
                    type="text"
                    placeholder="Character Name (e.g., Venom, Mary Jane)"
                    value={newCharName}
                    onChange={(e) => setNewCharName(e.target.value)}
                    className="flex-1 min-w-[140px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  />
                  <select
                    value={newCharType}
                    onChange={(e) => setNewCharType(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-medium"
                  >
                    <option value="Main">Main Character</option>
                    <option value="Supporting">Supporting</option>
                    <option value="Cameo">Cameo</option>
                    <option value="Cover Only">Cover Only</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddCharacter}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Character</span>
                  </button>
                </div>
              )}
            </div>

            {/* Cover Image URL Edit Field */}
            {isEditing && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                    Cover Image URL or Google Drive Share Link
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCropperTargetField('front')}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>Scan / Crop Front Cover</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCoverImage('NoImage.webp')}
                      className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 underline font-semibold cursor-pointer"
                    >
                      Reset to NoImage.webp
                    </button>
                  </div>
                </label>
                <input
                  type="text"
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="e.g. https://drive.google.com/file/d/1r5avbI2b1d3Ehhl2KNO9vshVynZZNT9Z/view?usp=drive_link"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-slate-800 dark:focus:ring-indigo-500"
                />

                {/* Google Drive Link Guidance */}
                {extractDriveFileId(coverImage) ? (
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl text-[11px] text-blue-900 dark:text-blue-200 space-y-1">
                    <div className="flex items-center justify-between gap-2 font-bold">
                      <span className="flex items-center gap-1.5">
                        <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        Google Drive Link Detected
                      </span>
                      <span className="text-[10px] font-mono bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                        ID: {extractDriveFileId(coverImage)}
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-snug">
                      <strong>Check Drive Permissions:</strong> Ensure this file (or its parent folder) in Google Drive is set to <strong>"Anyone with the link can view"</strong> (General Access). If set to "Restricted", Google blocks image access.
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Info className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span>Supports Google Drive share links, direct image URLs, or base64 uploads.</span>
                  </p>
                )}
              </div>
            )}

            {/* Full Wraparound Art URL Edit Field */}
            {isEditing && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block text-[11px] font-bold text-purple-700 dark:text-purple-400 mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    Full Wraparound Art URL (Front + Back Cover Spread)
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCropperTargetField('full')}
                      className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>Scan / Crop Full Spread</span>
                    </button>
                    {coverImageFull && (
                      <button
                        type="button"
                        onClick={() => setCoverImageFull('')}
                        className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-rose-600 underline font-semibold cursor-pointer"
                      >
                        Clear Full Art
                      </button>
                    )}
                  </div>
                </label>
                <input
                  type="text"
                  value={coverImageFull}
                  onChange={(e) => setCoverImageFull(e.target.value)}
                  placeholder="e.g. Google Drive link to wraparound or panoramic cover art"
                  className="w-full bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Info className="w-3 h-3 text-purple-500 shrink-0" />
                  <span>Wraparound/full-bleed back+front cover art. Shown in Full Art showcase and 3D visualizer.</span>
                </p>
              </div>
            )}

            {isEditing && (
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSaveQuickEdits}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            )}
          </div>

          {/* Issue Summary / Notes */}
          {comic.notes && (
            <div>
              <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Issue Notes & Summary</h4>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 p-3 rounded-xl">
                {comic.notes}
              </p>
            </div>
          )}

          {/* Metadata Grid */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            {isEditing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-slate-600 dark:text-slate-400 block text-[10px] font-bold mb-1">
                    Condition
                  </label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as ComicCondition)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-semibold"
                  >
                    {COMIC_CONDITIONS.map((cnd) => (
                      <option key={cnd} value={cnd}>
                        {cnd}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-600 dark:text-slate-400 block text-[10px] font-bold mb-1 flex items-center justify-between">
                    <span>Format</span>
                    <span className="text-[9px] text-slate-400 font-normal">({thickness.toFixed(1)}x)</span>
                  </label>
                  <select
                    value={format}
                    onChange={(e) => handleFormatChange(e.target.value as ComicFormat)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-semibold"
                  >
                    {COMIC_FORMATS.map((fmt) => (
                      <option key={fmt} value={fmt}>
                        {fmt} ({FORMAT_DEFAULT_THICKNESS[fmt] ?? 1.0}x)
                      </option>
                    ))}
                    {format === 'Hardcover' && (
                      <option value="Hardcover">Hardcover (Legacy 5.0x)</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-slate-600 dark:text-slate-400 block text-[10px] font-bold mb-1">
                    Purchase Price
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 text-xs pointer-events-none font-bold">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      className="w-full pl-6 pr-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-emerald-700 dark:text-emerald-400 block text-[10px] font-bold mb-1">
                    Est. Market Value
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-emerald-600 dark:text-emerald-400 text-xs pointer-events-none font-bold">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={estimatedValue}
                      onChange={(e) => setEstimatedValue(e.target.value)}
                      className="w-full pl-6 pr-2.5 py-1.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800/80 rounded-lg text-xs text-emerald-700 dark:text-emerald-400 font-bold"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Condition</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{comic.condition || 'Near Mint'}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Format</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{comic.format || 'Single Issue'}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Purchase Price</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {comic.purchasePrice ? `$${comic.purchasePrice.toFixed(2)}` : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Est. Market Value</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {comic.estimatedValue ? `$${comic.estimatedValue.toFixed(2)}` : 'N/A'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Tags Section */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-indigo-500" />
                <span>Tags {isEditing && `(${tags.length})`}</span>
              </span>
            </div>

            {isEditing ? (
              <div className="space-y-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 p-3 rounded-xl">
                <div className="flex items-center gap-2 flex-wrap">
                  {tags.map((t, idx) => (
                    <span
                      key={t + idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 text-xs border border-indigo-200 dark:border-indigo-800 font-semibold"
                    >
                      <span>#{t}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(idx)}
                        className="text-indigo-400 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
                        title={`Remove #${t}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Type tag and press Enter..."
                      className="w-full px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddTag()}
                      disabled={!newTagInput.trim()}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {suggestedTags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-[10px] text-slate-400">Suggestions:</span>
                    {suggestedTags.slice(0, 8).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleAddTag(st)}
                        className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 cursor-pointer text-[11px]"
                      >
                        +{st}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              (comic.tags || []).length > 0 ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(comic.tags || []).map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] border border-slate-200 dark:border-slate-700 font-medium"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">No tags assigned.</p>
              )
            )}
          </div>

        </div>
        {/* End of Modal Main Content */}

        </div>
        {/* End of Scrollable Content Body */}

        {/* Sticky Bottom Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shrink-0 flex items-center justify-between z-10">
          <button
            type="button"
            onClick={() => {
              if (confirm(`Remove "${comic.title} #${comic.issueNumber}" from vault?`)) {
                onDeleteComic(comic.id);
                onClose();
              }
            }}
            className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 flex items-center gap-1.5 font-semibold cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Comic</span>
          </button>

          <div className="flex items-center gap-2">
            {isEditing && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuickEdits}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold rounded-lg text-xs cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>

      {/* Perspective Cover Scanner & Cropper Modal Overlay for Existing Comic */}
      {cropperTargetField !== null && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setCropperTargetField(null);
          }}
          className="fixed inset-0 z-60 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-auto text-slate-900 dark:text-slate-100">
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400">
                  <Crop className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Scan / Perspective-Crop Cover Image
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {comic.title} #{comic.issueNumber}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Target Slot Switcher: Front Cover vs Full Wraparound Spread */}
                <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-900 p-0.5 rounded-lg text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setCropperTargetField('front')}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      cropperTargetField === 'front'
                        ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Front Cover
                  </button>
                  <button
                    type="button"
                    onClick={() => setCropperTargetField('full')}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                      cropperTargetField === 'full'
                        ? 'bg-purple-600 text-white'
                        : 'text-purple-700 dark:text-purple-300 hover:text-purple-900'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Full Spread</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setCropperTargetField(null)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 max-h-[80vh] overflow-y-auto scrollbar-thin">
              <CoverScannerCropper
                key={cropperTargetField}
                enableOcr={false}
                defaultPreset={cropperTargetField === 'full' ? 'wraparound' : 'standard'}
                initialImageUrl={
                  cropperTargetField === 'full'
                    ? coverImageFull || comic.coverImageFull
                    : coverImage || comic.coverImage
                }
                comicTitle={title || comic.title}
                comicIssueNumber={issueNumber || comic.issueNumber}
                existingComics={allComics}
                seriesTotals={seriesTotals}
                applyButtonLabel={
                  cropperTargetField === 'full'
                    ? 'Save Cropped Full Spread'
                    : 'Save Cropped Front Cover'
                }
                onCancel={() => setCropperTargetField(null)}
                onSelectOcrCandidate={(field, val) => {
                  if (field === 'title') setTitle(val);
                  else if (field === 'issueNumber') setIssueNumber(val);
                }}
                onApplyImage={(croppedDataUrl) => {
                  if (cropperTargetField === 'full') {
                    setCoverImageFull(croppedDataUrl);
                    setHeroViewMode('full');
                    onUpdateComic({
                      ...comic,
                      coverImageFull: croppedDataUrl,
                    });
                  } else {
                    setCoverImage(croppedDataUrl);
                    setHeroViewMode('front');
                    onUpdateComic({
                      ...comic,
                      coverImage: croppedDataUrl,
                    });
                  }
                  setCropperTargetField(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Full Art Showcase Modal */}
      {showFullArtModal && (
        <FullArtShowcaseModal
          isOpen={showFullArtModal}
          onClose={() => setShowFullArtModal(false)}
          comic={comic}
          allComics={allComics}
        />
      )}
    </div>
  );
};
