import React from 'react';
import {
  MultiSortOptions,
  SortCriterion,
  ComicSortField,
  SortDirection,
  SORT_PRESETS,
  SORT_FIELD_OPTIONS,
  detectActivePresetId,
  getSortDirectionLabel,
} from '../utils/comicSortUtils';
import {
  X,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Check,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';

interface CatalogSortModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: MultiSortOptions;
  onChange: (options: MultiSortOptions) => void;
}

export const CatalogSortModal: React.FC<CatalogSortModalProps> = ({
  isOpen,
  onClose,
  options,
  onChange,
}) => {
  if (!isOpen) return null;

  const activePresetId = detectActivePresetId(options);

  const handleApplyPreset = (presetId: string) => {
    const preset = SORT_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      onChange({
        criteria: preset.criteria.map((c) => ({ ...c })),
        separateAnnuals: preset.separateAnnuals,
        emptyEventPlacement: preset.emptyEventPlacement || 'last',
      });
    }
  };

  const handleFieldChange = (index: number, newField: ComicSortField) => {
    const newCriteria = [...options.criteria];
    newCriteria[index] = {
      ...newCriteria[index],
      field: newField,
    };
    onChange({
      ...options,
      criteria: newCriteria,
    });
  };

  const handleDirectionToggle = (index: number) => {
    const newCriteria = [...options.criteria];
    const current = newCriteria[index].direction;
    newCriteria[index] = {
      ...newCriteria[index],
      direction: current === 'asc' ? 'desc' : 'asc',
    };
    onChange({
      ...options,
      criteria: newCriteria,
    });
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newCriteria = [...options.criteria];
    const temp = newCriteria[index];
    newCriteria[index] = newCriteria[index - 1];
    newCriteria[index - 1] = temp;
    onChange({
      ...options,
      criteria: newCriteria,
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= options.criteria.length - 1) return;
    const newCriteria = [...options.criteria];
    const temp = newCriteria[index];
    newCriteria[index] = newCriteria[index + 1];
    newCriteria[index + 1] = temp;
    onChange({
      ...options,
      criteria: newCriteria,
    });
  };

  const handleRemoveCriterion = (index: number) => {
    if (options.criteria.length <= 1) return; // Keep at least one criterion
    const newCriteria = options.criteria.filter((_, i) => i !== index);
    onChange({
      ...options,
      criteria: newCriteria,
    });
  };

  const handleAddCriterion = () => {
    // Find first unused field or default to publicationYear
    const usedFields = new Set(options.criteria.map((c) => c.field));
    const available = SORT_FIELD_OPTIONS.find((opt) => !usedFields.has(opt.field));
    const nextField: ComicSortField = available ? available.field : 'publicationYear';

    const newCriterion: SortCriterion = {
      id: `crit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      field: nextField,
      direction: 'asc',
    };

    onChange({
      ...options,
      criteria: [...options.criteria, newCriterion],
    });
  };

  const handleToggleSeparateAnnuals = (checked: boolean) => {
    onChange({
      ...options,
      separateAnnuals: checked,
    });
  };

  const handleEmptyEventPlacement = (placement: 'first' | 'last') => {
    onChange({
      ...options,
      emptyEventPlacement: placement,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden transition-all text-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Catalog Sort Order</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {options.criteria.length} Level{options.criteria.length > 1 ? 's' : ''}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Organize by multiple criteria in priority sequence (e.g. Publisher → Event → Series → Issue)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Presets Section */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Quick Sort Presets</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SORT_PRESETS.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.id)}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-400 dark:border-indigo-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full mt-0.5 flex items-center justify-center shrink-0 border ${
                        isActive
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {isActive && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {preset.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                        {preset.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort Hierarchy (Active Criteria) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500" />
                <span>Sort Hierarchy (Primary to Secondary)</span>
              </label>
              <button
                type="button"
                onClick={handleAddCriterion}
                disabled={options.criteria.length >= SORT_FIELD_OPTIONS.length}
                className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Sort Level</span>
              </button>
            </div>

            <div className="space-y-2">
              {options.criteria.map((criterion, index) => {
                const isFirst = index === 0;
                const isLast = index === options.criteria.length - 1;
                const directionLabel = getSortDirectionLabel(criterion.field, criterion.direction);

                return (
                  <div
                    key={criterion.id}
                    className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl"
                  >
                    {/* Level index badge */}
                    <div className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center shrink-0 shadow-2xs">
                      {index + 1}
                    </div>

                    {/* Field select dropdown */}
                    <div className="flex-1 min-w-[140px]">
                      <select
                        value={criterion.field}
                        onChange={(e) => handleFieldChange(index, e.target.value as ComicSortField)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {['Organization', 'Title & Series', 'Date & Logistics', 'Collection Value', 'Status & Metadata', 'Creators'].map(
                          (group) => (
                            <optgroup key={group} label={group}>
                              {SORT_FIELD_OPTIONS.filter((o) => o.group === group).map((opt) => (
                                <option key={opt.field} value={opt.field}>
                                  {opt.label}
                                </option>
                              ))}
                            </optgroup>
                          )
                        )}
                      </select>
                    </div>

                    {/* Direction Toggle button */}
                    <button
                      type="button"
                      onClick={() => handleDirectionToggle(index)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
                        criterion.direction === 'asc'
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100'
                          : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-100'
                      }`}
                      title="Toggle Ascending / Descending"
                    >
                      {criterion.direction === 'asc' ? (
                        <ArrowUp className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5" />
                      )}
                      <span>{directionLabel}</span>
                    </button>

                    {/* Move Up / Down reorder buttons */}
                    <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveUp(index)}
                        disabled={isFirst}
                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                        title="Move Up in priority"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveDown(index)}
                        disabled={isLast}
                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                        title="Move Down in priority"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Delete criterion button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveCriterion(index)}
                      disabled={options.criteria.length <= 1}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
                      title="Remove this sort level"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Annuals & Event Options Card */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              <Info className="w-3.5 h-3.5 text-indigo-500" />
              <span>Special Collection Rules</span>
            </div>

            {/* Annuals Separation Rule */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <label
                  htmlFor="separate-annuals-toggle"
                  className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer"
                >
                  Keep Annuals sorted together separate from normal titles
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Regular numbered issues (#1, #2, #300...) are grouped in numerical order first, followed by
                  Annuals (Annual #1, Annual #2...) grouped together in order, preventing Annuals from being interleaved.
                </p>
              </div>
              <input
                id="separate-annuals-toggle"
                type="checkbox"
                checked={options.separateAnnuals}
                onChange={(e) => handleToggleSeparateAnnuals(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer shrink-0"
              />
            </div>

            {/* Non-Event Comics Placement */}
            <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <label className="text-xs font-bold text-slate-900 dark:text-white">
                  Items without a Crossover Event
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  When sorting by Event, place non-event back issues at the end or beginning.
                </p>
              </div>
              <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 text-xs font-semibold shrink-0">
                <button
                  type="button"
                  onClick={() => handleEmptyEventPlacement('last')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    (options.emptyEventPlacement || 'last') === 'last'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Place at End
                </button>
                <button
                  type="button"
                  onClick={() => handleEmptyEventPlacement('first')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    options.emptyEventPlacement === 'first'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Place at Start
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleApplyPreset('box_organizer')}
              className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Box Organizer</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('series_issue')}
              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Series & Issue
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
