import React, { useState } from 'react';
import { ComicBook, StorageBox, CREATOR_ROLES, CreatorContribution, CharacterAppearance } from '../types';
import { getComicCoverUrl, handleImageError, extractDriveFileId } from '../utils/imageUtils';
import { sortBoxes } from '../utils/boxUtils';
import { formatPublicationDate, MONTH_NAMES } from '../utils/dateUtils';
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
  ShieldAlert
} from 'lucide-react';

interface ComicDetailModalProps {
  comic: ComicBook | null;
  onClose: () => void;
  boxes: StorageBox[];
  onUpdateComic: (updated: ComicBook) => void;
  onDeleteComic: (comicId: string) => void;
}

export const ComicDetailModal: React.FC<ComicDetailModalProps> = ({
  comic,
  onClose,
  boxes,
  onUpdateComic,
  onDeleteComic,
}) => {
  if (!comic) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [readingStatus, setReadingStatus] = useState(comic.readingStatus);
  const [userRating, setUserRating] = useState(comic.userRating || 0);
  const [boxId, setBoxId] = useState(comic.currentBoxId);
  const [notes, setNotes] = useState(comic.notes || '');
  const [thickness, setThickness] = useState(comic.sizeThickness);
  const [coverImage, setCoverImage] = useState(comic.coverImage || '');
  const [volume, setVolume] = useState(comic.volume || '');
  const [event, setEvent] = useState(comic.event || '');
  const [publicationYear, setPublicationYear] = useState<number>(comic.publicationYear);
  const [publicationMonth, setPublicationMonth] = useState<string>(comic.publicationMonth || '');
  const initialCopies = comic.readingStatus === 'Wishlist' ? 0 : (comic.copiesOwned !== undefined ? comic.copiesOwned : 1);
  const [copiesOwned, setCopiesOwned] = useState(initialCopies);

  // Creator Contributions State
  const [contributions, setContributions] = useState<CreatorContribution[]>(
    comic.creatorContributions && comic.creatorContributions.length > 0
      ? comic.creatorContributions
      : [
          ...(comic.writer ? [{ creatorName: comic.writer, roleName: 'Writer' }] : []),
          ...(comic.artist ? [{ creatorName: comic.artist, roleName: 'Penciler' }] : []),
          ...(comic.coverArtist ? [{ creatorName: comic.coverArtist, roleName: 'Cover Penciler' }] : []),
        ]
  );
  const [newCreatorName, setNewCreatorName] = useState('');
  const [newRoleName, setNewRoleName] = useState<string>('Writer');

  // Character Appearances State
  const [characters, setCharacters] = useState<CharacterAppearance[]>(comic.characterAppearances || []);
  const [newCharName, setNewCharName] = useState('');
  const [newCharType, setNewCharType] = useState('Main');

  const currentBox = boxes.find((b) => b.id === comic.currentBoxId);

  const handleAddContribution = () => {
    if (!newCreatorName.trim()) return;
    const updated = [
      ...contributions,
      {
        id: `contrib-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        creatorName: newCreatorName.trim(),
        roleName: newRoleName,
      },
    ];
    setContributions(updated);
    setNewCreatorName('');
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

  const handleRemoveCharacter = (index: number) => {
    setCharacters(characters.filter((_, i) => i !== index));
  };

  const handleSaveQuickEdits = () => {
    // Derive primary writer and artist for backwards compatibility
    const writerContrib = contributions.find((c) => c.roleName.toLowerCase() === 'writer');
    const artistContrib = contributions.find((c) => ['penciler', 'artist'].includes(c.roleName.toLowerCase()));

    onUpdateComic({
      ...comic,
      readingStatus,
      userRating: userRating || undefined,
      currentBoxId: Number(boxId),
      notes,
      sizeThickness: Number(thickness),
      coverImage: coverImage.trim() || 'NoImage.png',
      volume: volume.trim() || undefined,
      event: event.trim() || undefined,
      publicationYear: Number(publicationYear) || comic.publicationYear,
      publicationMonth: publicationMonth.trim() || undefined,
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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Top Image & Hero Overlay */}
        <div className="relative bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 p-6 flex flex-col sm:flex-row gap-6 items-center sm:items-start">
          <img
            src={getComicCoverUrl(coverImage || comic.coverImage)}
            alt={comic.title}
            onError={handleImageError}
            referrerPolicy="no-referrer"
            className="w-40 h-60 object-cover rounded-xl shadow-md border border-slate-200 dark:border-slate-700 shrink-0"
          />

          <div className="flex-1 space-y-2 text-center sm:text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[11px] font-bold">
                {comic.publisher} • {formatPublicationDate(publicationYear, publicationMonth)}
              </span>

              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-tight">
              {comic.title || comic.fullTitle || comic.seriesName || 'Untitled Comic'} <span className="text-slate-600 dark:text-slate-400">#{comic.issueNumber}</span>
            </h2>

            {comic.seriesName && (
              <p className="text-xs text-indigo-700 dark:text-indigo-400 font-semibold">{comic.seriesName}</p>
            )}

            {comic.volume && !comic.seriesName && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">{comic.volume}</p>
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
                {comic.sizeThickness.toFixed(1)}x Thickness Units
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
                {comic.format}
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
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-1 font-semibold cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                {isEditing ? 'Cancel Edit' : 'Edit Values'}
              </button>
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

            {/* Extended Edit Controls: Volume, Event, Year, Month, Copies Owned */}
            {isEditing && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              </div>

              {/* Contributions Badges List */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {contributions.map((item, idx) => (
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
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
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
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-medium"
                  >
                    {CREATOR_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
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
              </div>

              {/* Character Badges List */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {characters.length === 0 ? (
                  <span className="text-xs text-slate-400 dark:text-slate-500 italic">No character appearances tracked for this issue yet.</span>
                ) : (
                  characters.map((char, idx) => (
                    <div
                      key={char.id || idx}
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
                          onClick={() => handleRemoveCharacter(idx)}
                          className="text-slate-400 hover:text-rose-600 ml-1 font-bold cursor-pointer"
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
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                    Cover Image URL or Google Drive Share Link
                  </span>
                  <button
                    type="button"
                    onClick={() => setCoverImage('NoImage.png')}
                    className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 underline font-semibold cursor-pointer"
                  >
                    Reset to NoImage.png
                  </button>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Condition</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{comic.condition}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Format</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{comic.format}</span>
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

          {/* Tags */}
          {comic.tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Tags:</span>
              {comic.tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] border border-slate-200 dark:border-slate-700"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button
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

            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold rounded-xl text-xs cursor-pointer"
            >
              Close
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
