import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Play, 
  Calendar, 
  Layers, 
  BookOpen, 
  User, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  Search, 
  ChevronRight, 
  Boxes 
} from 'lucide-react';
import { ComicBook, CREATOR_ROLES } from '../../types';
import { 
  CriterionLeaf, 
  CriterionNode, 
  ReadingChallengeCriteria, 
  PreviewChallengeResponse 
} from '../../types/readingChallenge.types';
import { 
  evaluateCriterionNode, 
  filterComicsByCriteria, 
  formatCriteriaSummary, 
  isComicEligibleForChallenge, 
  sortChallengeComics, 
  validateCriteria 
} from '../../utils/challengeCriteriaEngine';
import { previewChallenge, createChallenge } from '../../services/readingChallengeService';
import { getComicCoverUrl, handleImageError } from '../../utils/imageUtils';
import { splitCreatorNames } from '../../utils/creatorParser';

interface ChallengeSetupFormProps {
  comics: ComicBook[];
  onChallengeStarted: (challenge: any) => void;
  hasActiveChallenge?: boolean;
}

export const ChallengeSetupForm: React.FC<ChallengeSetupFormProps> = ({
  comics,
  onChallengeStarted,
  hasActiveChallenge = false,
}) => {
  const [challengeName, setChallengeName] = useState('');
  const [operator, setOperator] = useState<'AND' | 'OR'>('AND');
  const [criteriaLeaves, setCriteriaLeaves] = useState<CriterionLeaf[]>([
    { type: 'collection' }
  ]);
  const [readingOrder, setReadingOrder] = useState<'PublicationDate'>('PublicationDate');
  const [sortDirection, setSortDirection] = useState<'Ascending' | 'Descending'>('Ascending');
  const [batchSize, setBatchSize] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abandonExisting, setAbandonExisting] = useState(false);

  // Only include owned collection comics; wishlist and unowned items are excluded from reading challenges
  const eligibleComics = useMemo(() => {
    return comics.filter(isComicEligibleForChallenge);
  }, [comics]);

  // Extract catalog autocomplete options from owned comics only
  const catalogOptions = useMemo(() => {
    const publishers = new Set<string>();
    const series = new Set<string>();
    const events = new Set<string>();
    const creators = new Set<string>();
    const characters = new Set<string>();

    eligibleComics.forEach((c) => {
      if (c.publisher) publishers.add(c.publisher.trim());
      if (c.seriesName) series.add(c.seriesName.trim());
      else if (c.title) series.add(c.title.trim());
      if (c.event) events.add(c.event.trim());
      if (c.writer) {
        splitCreatorNames(c.writer).forEach((name) => creators.add(name));
      }
      if (c.artist) {
        splitCreatorNames(c.artist).forEach((name) => creators.add(name));
      }
      if (c.coverArtist) {
        splitCreatorNames(c.coverArtist).forEach((name) => creators.add(name));
      }
      if (c.creatorContributions && Array.isArray(c.creatorContributions)) {
        c.creatorContributions.forEach((contrib) => {
          if (contrib.creatorName) {
            splitCreatorNames(contrib.creatorName).forEach((name) => creators.add(name));
          }
        });
      }
      if (c.characterAppearances && Array.isArray(c.characterAppearances)) {
        c.characterAppearances.forEach((char) => {
          if (char.characterName) characters.add(char.characterName.trim());
        });
      }
    });

    return {
      publishers: Array.from(publishers).sort(),
      series: Array.from(series).sort(),
      events: Array.from(events).sort(),
      creators: Array.from(creators).sort(),
      characters: Array.from(characters).sort(),
    };
  }, [eligibleComics]);

  // Construct current Criteria AST
  const currentCriteria: ReadingChallengeCriteria = useMemo(() => {
    if (criteriaLeaves.length === 1) {
      return { version: 1, root: criteriaLeaves[0] };
    }
    return {
      version: 1,
      root: {
        type: 'group',
        operator,
        children: criteriaLeaves,
      },
    };
  }, [criteriaLeaves, operator]);

  // Local instant calculation of matching comics and summary
  const matchingComics = useMemo(() => {
    const filtered = filterComicsByCriteria(eligibleComics, currentCriteria);
    return sortChallengeComics(filtered, sortDirection);
  }, [eligibleComics, currentCriteria, sortDirection]);

  const criteriaSummary = useMemo(() => {
    return formatCriteriaSummary(currentCriteria.root);
  }, [currentCriteria]);

  // Default suggested challenge name based on criteria
  useEffect(() => {
    if (!challengeName || challengeName.startsWith('Challenge:')) {
      const suggested = `Challenge: ${criteriaSummary.substring(0, 45)}`;
      setChallengeName(suggested);
    }
  }, [criteriaSummary]);

  // Add a new criterion leaf
  const handleAddCriterion = (type: CriterionLeaf['type']) => {
    if (criteriaLeaves.length === 1 && criteriaLeaves[0].type === 'collection') {
      // Replace generic collection with specific criterion
      switch (type) {
        case 'publisher':
          setCriteriaLeaves([{ type: 'publisher', ids: catalogOptions.publishers[0] ? [catalogOptions.publishers[0]] : ['Marvel'] }]);
          break;
        case 'series':
          setCriteriaLeaves([{ type: 'series', ids: catalogOptions.series[0] ? [catalogOptions.series[0]] : [] }]);
          break;
        case 'storyArc':
          setCriteriaLeaves([{ type: 'storyArc', ids: catalogOptions.events[0] ? [catalogOptions.events[0]] : [] }]);
          break;
        case 'creator':
          setCriteriaLeaves([{ type: 'creator', ids: catalogOptions.creators[0] ? [catalogOptions.creators[0]] : [], roles: ['Writer'] }]);
          break;
        case 'character':
          setCriteriaLeaves([{ type: 'character', ids: catalogOptions.characters[0] ? [catalogOptions.characters[0]] : [] }]);
          break;
        case 'releaseDateRange':
          setCriteriaLeaves([{ type: 'releaseDateRange', from: '1980', through: '1989' }]);
          break;
        default:
          setCriteriaLeaves([{ type: 'collection' }]);
      }
      return;
    }

    let newLeaf: CriterionLeaf;
    switch (type) {
      case 'publisher':
        newLeaf = { type: 'publisher', ids: catalogOptions.publishers[0] ? [catalogOptions.publishers[0]] : ['Marvel'] };
        break;
      case 'series':
        newLeaf = { type: 'series', ids: catalogOptions.series[0] ? [catalogOptions.series[0]] : [] };
        break;
      case 'storyArc':
        newLeaf = { type: 'storyArc', ids: catalogOptions.events[0] ? [catalogOptions.events[0]] : [] };
        break;
      case 'creator':
        newLeaf = { type: 'creator', ids: catalogOptions.creators[0] ? [catalogOptions.creators[0]] : [], roles: ['Writer'] };
        break;
      case 'character':
        newLeaf = { type: 'character', ids: catalogOptions.characters[0] ? [catalogOptions.characters[0]] : [] };
        break;
      case 'releaseDateRange':
        newLeaf = { type: 'releaseDateRange', from: '1980', through: '1989' };
        break;
      default:
        newLeaf = { type: 'collection' };
    }
    setCriteriaLeaves([...criteriaLeaves, newLeaf]);
  };

  const handleRemoveCriterion = (index: number) => {
    if (criteriaLeaves.length <= 1) {
      setCriteriaLeaves([{ type: 'collection' }]);
      return;
    }
    setCriteriaLeaves(criteriaLeaves.filter((_, i) => i !== index));
  };

  const handleUpdateCriterion = (index: number, updated: CriterionLeaf) => {
    const next = [...criteriaLeaves];
    next[index] = updated;
    setCriteriaLeaves(next);
  };

  // Submit and create challenge
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!challengeName.trim()) {
      setError('Please provide a name for this reading challenge.');
      return;
    }

    const val = validateCriteria(currentCriteria);
    if (!val.valid) {
      setError(val.error || 'Criteria definition is invalid.');
      return;
    }

    if (matchingComics.length === 0) {
      setError('No comics in your collection match this criteria. Please broaden your selection.');
      return;
    }

    setIsSubmitting(true);
    try {
      const challenge = await createChallenge({
        name: challengeName.trim(),
        criteria: currentCriteria,
        readingOrder,
        sortDirection,
        batchSize,
        abandonCurrentActive: hasActiveChallenge ? abandonExisting : false,
      });
      onChallengeStarted(challenge);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to start challenge.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header Info */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Create a New Reading Challenge</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select criteria to snapshot an ordered chronological queue of comics.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Combine conditions using:</span>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setOperator('AND')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  operator === 'AND'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                AND (Must match all)
              </button>
              <button
                type="button"
                onClick={() => setOperator('OR')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  operator === 'OR'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                OR (Matches any)
              </button>
            </div>
          </div>
        </div>

        {/* Challenge Name Input */}
        <div className="mt-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
            Challenge Name
          </label>
          <input
            type="text"
            value={challengeName}
            onChange={(e) => setChallengeName(e.target.value)}
            placeholder="e.g. Marvel Silver Age 60s, Claremont X-Men, Spider-Man Complete..."
            className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            required
          />
        </div>
      </div>

      {/* Criteria Leaf Editor List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs">
            Filter Conditions ({criteriaLeaves.length})
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {criteriaSummary}
          </span>
        </div>

        <div className="space-y-3">
          {criteriaLeaves.map((leaf, index) => (
            <div
              key={index}
              className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0">
                  {index + 1}
                </span>

                {/* Leaf Type Select */}
                <select
                  value={leaf.type}
                  onChange={(e) => handleAddCriterion(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  <option value="collection">Entire Collection</option>
                  <option value="publisher">Publisher</option>
                  <option value="series">Series</option>
                  <option value="storyArc">Story Arc / Event</option>
                  <option value="creator">Creator & Role</option>
                  <option value="character">Character</option>
                  <option value="releaseDateRange">Release Date Range</option>
                </select>

                {/* Specific Editor based on type */}
                {leaf.type === 'collection' && (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 italic">
                    Includes all eligible comics in your storage boxes.
                  </span>
                )}

                {leaf.type === 'publisher' && (
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <select
                      value={leaf.ids[0] || ''}
                      onChange={(e) => handleUpdateCriterion(index, { type: 'publisher', ids: [e.target.value] })}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 flex-1"
                    >
                      {catalogOptions.publishers.map((pub) => (
                        <option key={pub} value={pub}>{pub}</option>
                      ))}
                    </select>
                  </div>
                )}

                {leaf.type === 'series' && (
                  <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                    <select
                      value={leaf.ids[0] || ''}
                      onChange={(e) => handleUpdateCriterion(index, { type: 'series', ids: [e.target.value] })}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 flex-1"
                    >
                      {catalogOptions.series.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                {leaf.type === 'storyArc' && (
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <select
                      value={leaf.ids[0] || ''}
                      onChange={(e) => handleUpdateCriterion(index, { type: 'storyArc', ids: [e.target.value] })}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 flex-1"
                    >
                      {catalogOptions.events.map((ev) => (
                        <option key={ev} value={ev}>{ev}</option>
                      ))}
                    </select>
                  </div>
                )}

                {leaf.type === 'creator' && (
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <select
                      value={leaf.ids[0] || ''}
                      onChange={(e) => handleUpdateCriterion(index, { ...leaf, ids: [e.target.value] })}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 min-w-[160px]"
                    >
                      {catalogOptions.creators.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-semibold">as</span>
                      <select
                        value={leaf.roles[0] || 'Writer'}
                        onChange={(e) => handleUpdateCriterion(index, { ...leaf, roles: [e.target.value] })}
                        className="px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
                      >
                        <option value="Writer">Writer</option>
                        <option value="Artist">Penciller / Artist</option>
                        <option value="Cover Artist">Cover Artist</option>
                        <option value="Inker">Inker</option>
                        <option value="Colorist">Colorist</option>
                      </select>
                    </div>
                  </div>
                )}

                {leaf.type === 'character' && (
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <select
                      value={leaf.ids[0] || ''}
                      onChange={(e) => handleUpdateCriterion(index, { type: 'character', ids: [e.target.value] })}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 flex-1"
                    >
                      {catalogOptions.characters.map((char) => (
                        <option key={char} value={char}>{char}</option>
                      ))}
                    </select>
                  </div>
                )}

                {leaf.type === 'releaseDateRange' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">From</span>
                    <input
                      type="text"
                      placeholder="e.g. 1980 or 1980-01-01"
                      value={leaf.from || ''}
                      onChange={(e) => handleUpdateCriterion(index, { ...leaf, from: e.target.value })}
                      className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs w-28 text-slate-800 dark:text-slate-200 font-medium"
                    />
                    <span className="text-xs text-slate-500">Through</span>
                    <input
                      type="text"
                      placeholder="e.g. 1989 or 1989-12-31"
                      value={leaf.through || ''}
                      onChange={(e) => handleUpdateCriterion(index, { ...leaf, through: e.target.value })}
                      className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs w-28 text-slate-800 dark:text-slate-200 font-medium"
                    />
                  </div>
                )}
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => handleRemoveCriterion(index)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer self-end md:self-center"
                title="Remove condition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add condition buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">+ Add Condition:</span>
          <button
            type="button"
            onClick={() => handleAddCriterion('publisher')}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Publisher
          </button>
          <button
            type="button"
            onClick={() => handleAddCriterion('series')}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Series
          </button>
          <button
            type="button"
            onClick={() => handleAddCriterion('creator')}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Creator / Role
          </button>
          <button
            type="button"
            onClick={() => handleAddCriterion('character')}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Character
          </button>
          <button
            type="button"
            onClick={() => handleAddCriterion('storyArc')}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Story Arc / Event
          </button>
          <button
            type="button"
            onClick={() => handleAddCriterion('releaseDateRange')}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Year Range
          </button>
        </div>
      </div>

      {/* Live Preview Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs">
              Collection Match Preview
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ordered oldest release date first (deterministic tie-breaking).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Eligible Comics:</span>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {matchingComics.length} comics
            </span>
          </div>
        </div>

        {matchingComics.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs font-medium">
            No comics currently match these conditions. Adjust or add criteria above.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3 pt-2">
            {matchingComics.slice(0, 6).map((c, idx) => (
              <div
                key={c.id}
                className="group relative bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-2xs hover:shadow-sm transition-all"
              >
                <div className="aspect-2/3 bg-slate-200 dark:bg-slate-700 relative overflow-hidden">
                  <img
                    src={getComicCoverUrl(c.coverImage || c.coverImageFull)}
                    alt={c.title}
                    onError={handleImageError}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-slate-900/80 backdrop-blur-xs text-white rounded text-[10px] font-bold">
                    #{idx + 1}
                  </div>
                </div>
                <div className="p-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate" title={c.fullTitle || c.title}>
                    {c.title}
                  </h4>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    <span>#{c.issueNumber}</span>
                    <span>{c.publicationYear || 'N/A'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {matchingComics.length > 6 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center font-medium">
            + {matchingComics.length - 6} more comics queued in sequence
          </p>
        )}
      </div>

      {/* Active Challenge Warning & Abandon Confirmation */}
      {hasActiveChallenge && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-300 flex-1">
            <strong className="font-bold">You currently have an active challenge in progress.</strong>
            <p className="mt-0.5">
              Starting a new challenge will mark your current challenge as Abandoned, but all of its history, milestones, and reading records will be safely preserved.
            </p>
            <label className="flex items-center gap-2 mt-2 font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={abandonExisting}
                onChange={(e) => setAbandonExisting(e.target.checked)}
                className="rounded border-amber-400 text-indigo-600 focus:ring-indigo-500"
              />
              <span>I understand, abandon my current challenge and start this new one.</span>
            </label>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Start Button */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || matchingComics.length === 0 || (hasActiveChallenge && !abandonExisting)}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-bold rounded-xl text-sm shadow-md transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>{isSubmitting ? 'Creating Challenge Snapshot...' : `Start Challenge (${matchingComics.length} Comics)`}</span>
        </button>
      </div>
    </form>
  );
};
