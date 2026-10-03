import React, { useState, useMemo, useEffect } from 'react';
import { ComicBook, SeriesIssueTotal } from '../types';
import { Bookmark, Sparkles, Check, X, Calendar, AlertCircle, CheckCircle2, ChevronRight, Layers, Target, Info, Loader2, PlusCircle } from 'lucide-react';
import { parseIntegerIssueNumber, isAnnualComic } from '../utils/comicSortUtils';
import { projectSeriesIssueDate, buildMissingWishlistComic } from '../utils/seriesDateProjection';

interface GenerateSeriesWishlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  comics: ComicBook[];
  seriesTotals?: SeriesIssueTotal[];
  initialSeriesName?: string;
  onBatchAddComics: (newComics: ComicBook[]) => Promise<void> | void;
}

export const GenerateSeriesWishlistModal: React.FC<GenerateSeriesWishlistModalProps> = ({
  isOpen,
  onClose,
  comics,
  seriesTotals = [],
  initialSeriesName = '',
  onBatchAddComics,
}) => {
  // Collect all unique series names from collection and seriesTotals
  const allSeriesNames = useMemo(() => {
    const set = new Set<string>();
    comics.forEach((c) => {
      const name = (c.seriesName || c.title || '').trim();
      if (name) set.add(name);
    });
    seriesTotals.forEach((st) => {
      if (st.seriesName && st.seriesName.trim()) set.add(st.seriesName.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [comics, seriesTotals]);

  const [selectedSeries, setSelectedSeries] = useState<string>('');
  const [customTotalIssues, setCustomTotalIssues] = useState<number | ''>('');
  const [projectDates, setProjectDates] = useState<boolean>(true);
  const [selectedIssueNumbers, setSelectedIssueNumbers] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize selected series when modal opens
  useEffect(() => {
    if (isOpen) {
      setSuccessMessage(null);
      setIsSubmitting(false);
      if (initialSeriesName && allSeriesNames.includes(initialSeriesName)) {
        setSelectedSeries(initialSeriesName);
      } else if (initialSeriesName) {
        // Case-insensitive match fallback
        const match = allSeriesNames.find(s => s.toLowerCase() === initialSeriesName.toLowerCase());
        setSelectedSeries(match || allSeriesNames[0] || '');
      } else if (!selectedSeries && allSeriesNames.length > 0) {
        setSelectedSeries(allSeriesNames[0]);
      }
    }
  }, [isOpen, initialSeriesName, allSeriesNames]);

  // Existing comics for the selected series
  const seriesComics = useMemo(() => {
    if (!selectedSeries) return [];
    const sKey = selectedSeries.toLowerCase().trim();
    return comics.filter((c) => (c.seriesName || c.title || '').trim().toLowerCase() === sKey);
  }, [comics, selectedSeries]);

  // Matching SeriesIssueTotal entry
  const matchedSeriesTotal = useMemo(() => {
    if (!selectedSeries) return null;
    const sKey = selectedSeries.toLowerCase().trim();
    return seriesTotals.find((st) => st.seriesName.trim().toLowerCase() === sKey) || null;
  }, [seriesTotals, selectedSeries]);

  // Derive series metadata (publisher, volume, clean title)
  const seriesMetadata = useMemo(() => {
    const publisher = matchedSeriesTotal?.publisher || seriesComics.find((c) => c.publisher)?.publisher || 'Marvel Comics';
    const volume = matchedSeriesTotal?.volume || seriesComics.find((c) => c.volume)?.volume || '';
    const cleanTitle = (
      seriesComics.find((c) => c.title)?.title ||
      selectedSeries.replace(/\s*\(Vol\.\s*\d+\)/i, '').replace(/\s*\(\d{4}(?:\s*-\s*\d{4})?\)/i, '')
    ).trim();
    const genre = seriesComics.find((c) => c.genre)?.genre || 'Superhero';

    return { publisher, volume, cleanTitle, genre };
  }, [selectedSeries, seriesComics, matchedSeriesTotal]);

  // Known total issues
  const verifiedTotal = matchedSeriesTotal?.issueCount || 0;

  // Sync customTotalIssues when series changes
  useEffect(() => {
    if (verifiedTotal > 0) {
      setCustomTotalIssues(verifiedTotal);
    } else {
      // Find highest issue number in existing series
      let highest = 0;
      seriesComics.forEach((c) => {
        const num = parseIntegerIssueNumber(c.issueNumber);
        if (!isNaN(num) && num > highest) highest = num;
      });
      setCustomTotalIssues(highest > 0 ? highest : 10);
    }
  }, [selectedSeries, verifiedTotal, seriesComics]);

  const effectiveTotal = typeof customTotalIssues === 'number' && customTotalIssues > 0 ? customTotalIssues : verifiedTotal;

  // Analyze owned, wishlist, and missing issue numbers
  const analysis = useMemo(() => {
    const ownedSet = new Set<number>();
    const wishlistSet = new Set<number>();

    seriesComics.forEach((c) => {
      if (isAnnualComic(c)) return;
      const num = parseIntegerIssueNumber(c.issueNumber);
      if (!isNaN(num)) {
        if (c.readingStatus === 'Wishlist') {
          wishlistSet.add(num);
        } else {
          ownedSet.add(num);
        }
      }
    });

    const missing: number[] = [];
    if (effectiveTotal > 0) {
      for (let i = 1; i <= Math.min(effectiveTotal, 500); i++) {
        if (!ownedSet.has(i) && !wishlistSet.has(i)) {
          missing.push(i);
        }
      }
    }

    return {
      ownedNums: Array.from(ownedSet).sort((a, b) => a - b),
      wishlistNums: Array.from(wishlistSet).sort((a, b) => a - b),
      missingNums: missing,
    };
  }, [seriesComics, effectiveTotal]);

  // Pre-select all missing issues when series or total issues change
  useEffect(() => {
    setSelectedIssueNumbers(analysis.missingNums);
  }, [analysis.missingNums]);

  // Live date projection preview samples for the first 3 missing issues
  const projectionPreview = useMemo(() => {
    if (!projectDates || analysis.missingNums.length === 0 || seriesComics.length === 0) {
      return null;
    }
    const samples = analysis.missingNums.slice(0, 4).map((num) => {
      const proj = projectSeriesIssueDate(num, seriesComics);
      return {
        issue: num,
        dateStr: proj.publicationMonth ? `${proj.publicationMonth} ${proj.publicationYear}` : `${proj.publicationYear}`,
        reference: proj.referenceComic ? `#${proj.referenceComic.issueNumber}` : null,
      };
    });
    return samples;
  }, [projectDates, analysis.missingNums, seriesComics]);

  const toggleIssueSelection = (issueNum: number) => {
    setSelectedIssueNumbers((prev) =>
      prev.includes(issueNum) ? prev.filter((n) => n !== issueNum) : [...prev, issueNum].sort((a, b) => a - b)
    );
  };

  const handleSelectAll = () => {
    setSelectedIssueNumbers(analysis.missingNums);
  };

  const handleDeselectAll = () => {
    setSelectedIssueNumbers([]);
  };

  const handleGenerate = async () => {
    if (selectedIssueNumbers.length === 0) return;
    setIsSubmitting(true);
    setSuccessMessage(null);

    try {
      const newWishlistComics: ComicBook[] = selectedIssueNumbers.map((issueNum) => {
        let pubYear = new Date().getFullYear();
        let pubMonth: string | undefined = undefined;

        if (projectDates && seriesComics.length > 0) {
          const proj = projectSeriesIssueDate(issueNum, seriesComics);
          pubYear = proj.publicationYear;
          pubMonth = proj.publicationMonth;
        } else if (seriesComics.length > 0) {
          const firstWithYear = seriesComics.find((c) => c.publicationYear);
          if (firstWithYear?.publicationYear) pubYear = firstWithYear.publicationYear;
        }

        return buildMissingWishlistComic({
          seriesName: selectedSeries,
          issueNumber: issueNum,
          publisher: seriesMetadata.publisher,
          volume: seriesMetadata.volume,
          title: seriesMetadata.cleanTitle,
          genre: seriesMetadata.genre,
          publicationYear: pubYear,
          publicationMonth: pubMonth,
        });
      });

      await onBatchAddComics(newWishlistComics);
      setSuccessMessage(`Successfully generated ${newWishlistComics.length} wishlist issues for ${selectedSeries}!`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Failed to generate series wishlist comics:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-8 text-slate-900 dark:text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <span>Generate Series Wishlist</span>
                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                  Missing Run Issues
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatically create unallocated Wishlist items (Box 0, 0 Copies) for missing series comics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Series Selection and Total Issues */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Select Comic Series Run
              </label>
              <select
                value={selectedSeries}
                onChange={(e) => setSelectedSeries(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500"
              >
                {allSeriesNames.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span>Total Published</span>
                {verifiedTotal > 0 && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">Verified Total ✓</span>
                )}
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={customTotalIssues}
                onChange={(e) => setCustomTotalIssues(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:border-indigo-500"
                placeholder="e.g. 156"
              />
            </div>
          </div>

          {/* Series Summary Pill Bar */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/70 rounded-xl p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 dark:text-slate-200">{seriesMetadata.publisher}</span>
                {seriesMetadata.volume && (
                  <span className="text-slate-500 dark:text-slate-400">({seriesMetadata.volume})</span>
                )}
              </div>
              <div className="flex items-center gap-3 font-semibold text-[11px]">
                <span className="text-indigo-600 dark:text-indigo-400">
                  Owned: <strong>{analysis.ownedNums.length}</strong>
                </span>
                <span className="text-rose-600 dark:text-rose-400">
                  Wishlist: <strong>{analysis.wishlistNums.length}</strong>
                </span>
                <span className="text-amber-600 dark:text-amber-400">
                  Missing: <strong>{analysis.missingNums.length}</strong>
                </span>
              </div>
            </div>

            {/* Run Progress Bar */}
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${effectiveTotal > 0 ? (analysis.ownedNums.length / effectiveTotal) * 100 : 0}%` }}
                className="bg-indigo-600 h-full transition-all"
                title={`Owned: ${analysis.ownedNums.length}`}
              />
              <div
                style={{ width: `${effectiveTotal > 0 ? (analysis.wishlistNums.length / effectiveTotal) * 100 : 0}%` }}
                className="bg-rose-500 h-full transition-all"
                title={`Wishlist: ${analysis.wishlistNums.length}`}
              />
            </div>
          </div>

          {/* Missing Issues Selection Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>
                  Missing Issues to Generate as Wishlist ({selectedIssueNumbers.length} of {analysis.missingNums.length} selected)
                </span>
              </label>
              {analysis.missingNums.length > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-slate-500 dark:text-slate-400 hover:underline font-semibold cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              )}
            </div>

            {analysis.missingNums.length === 0 ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center space-y-1">
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  {analysis.ownedNums.length >= effectiveTotal && effectiveTotal > 0
                    ? 'All published issues in this run are already owned! 🏆'
                    : 'All remaining missing issues in this run are already on your wishlist! 📑'}
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  There are no unrepresented issues to generate between #1 and #{effectiveTotal}.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 max-h-40 overflow-y-auto">
                {analysis.missingNums.map((num) => {
                  const isSelected = selectedIssueNumbers.includes(num);
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => toggleIssueSelection(num)}
                      className={`text-xs font-bold px-2 py-1 rounded-md border flex items-center gap-1 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-rose-900 text-white border-rose-950 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400'
                      }`}
                      title={isSelected ? `Click to exclude Issue #${num}` : `Click to include Issue #${num}`}
                    >
                      {isSelected ? <Check className="w-2.5 h-2.5" /> : <PlusCircle className="w-2.5 h-2.5" />}
                      <span>#{num}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Release Date Projection Option */}
          <div className="bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 rounded-xl p-3.5 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={projectDates}
                onChange={(e) => setProjectDates(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Prepopulate projected release year and month (1 issue / month cadence)
                </span>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Estimates release month and year anchored to closest owned issues with known publication dates.
                </p>
              </div>
            </label>

            {projectDates && projectionPreview && projectionPreview.length > 0 && (
              <div className="pt-2 border-t border-indigo-100 dark:border-indigo-900/60 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                <span className="font-semibold text-indigo-900 dark:text-indigo-300">Projected Dates Preview:</span>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {projectionPreview.map((p) => (
                    <span
                      key={p.issue}
                      className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-950 dark:text-indigo-200 px-2 py-0.5 rounded text-[10px] font-medium"
                    >
                      Issue #{p.issue} → <strong>{p.dateStr}</strong>
                    </span>
                  ))}
                  {analysis.missingNums.length > 4 && (
                    <span className="text-slate-400 dark:text-slate-500 self-center text-[10px]">
                      +{analysis.missingNums.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Generated Wishlist Record Defaults */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              Wishlist defaults: Box 0 (Wishlist), 0 Copies Owned, Single Issue, NoImage cover
            </span>
            <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">Editable anytime</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={selectedIssueNumbers.length === 0 || isSubmitting}
            onClick={handleGenerate}
            className="px-5 py-2.5 bg-rose-900 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating {selectedIssueNumbers.length} Comics...</span>
              </>
            ) : (
              <>
                <Bookmark className="w-4 h-4" />
                <span>Generate {selectedIssueNumbers.length} Wishlist Comics</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
