import React, { useState } from 'react';
import { ComicBook, StorageBox, ReadingStatus } from '../types';
import { getAccessToken } from '../services/auth';
import { parseTitleAndIssue } from '../utils/titleParser';
import { parseYearAndMonth } from '../utils/dateUtils';
import { 
  FileSpreadsheet, 
  CheckCircle2, 
  ArrowRight, 
  AlertCircle, 
  Sparkles, 
  Download, 
  Terminal, 
  Layers, 
  Loader2,
  Trash2,
  CopyX,
  RefreshCw,
  Info
} from 'lucide-react';

interface GoogleSheetsImporterProps {
  boxes: StorageBox[];
  onImportComics: (importedComics: ComicBook[], mode?: 'append' | 'replace') => void;
  onOpenDataManagementModal?: () => void;
  comicsCount?: number;
}

export const GoogleSheetsImporter: React.FC<GoogleSheetsImporterProps> = ({
  boxes,
  onImportComics,
  onOpenDataManagementModal,
  comicsCount = 0,
}) => {
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [sheetName, setSheetName] = useState<string>('Sheet1');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rowsData, setRowsData] = useState<any[][]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const [parseTitleOption, setParseTitleOption] = useState<boolean>(true);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');

  // Column Mapping State
  const [mappings, setMappings] = useState({
    titleCol: '',
    issueCol: '',
    volumeCol: '',
    eventCol: '',
    copiesCol: '',
    publisherCol: '',
    yearCol: '',
    publicationDateCol: '',
    genreCol: '',
    writerCol: '',
    artistCol: '',
    boxCol: '',
    proposedBoxCol: '',
    thicknessCol: '',
    formatCol: '',
    statusCol: '',
    purchasePriceCol: '',
    valueCol: '',
    imageCol: '',
  });

  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [importedCount, setImportedCount] = useState<number>(0);

  // Load Sample Data (For demonstration or if user clicks Sample Import)
  const handleLoadSampleSheetData = () => {
    const sampleHeaders = ['Title', 'Volume', 'Issue #', 'Event', 'Copies Owned', 'Publisher', 'Year', 'Release Date', 'Genre', 'Writer', 'Artist', 'Format', 'Box #', 'Size Units', 'Reading Status', 'Price Paid', 'Est Value', 'Image Link'];
    const sampleRows = [
      ['The Amazing Spider-Man', 'Vol. 1', '300', 'Venom Saga', '1', 'Marvel Comics', '1988', '1988-01-01', 'Superhero', 'David Michelinie', 'Todd McFarlane', 'Single Issue', '1', '1.0', 'Read', '50.00', '500.00', 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing'],
      ['Batman', 'Vol. 1', '423', '', '2', 'DC Comics', '1988', '1988-01-01', 'Crime', 'Jim Starlin', 'Mike Mignola', 'Single Issue', '3', '1.0', 'Read', '25.00', '120.00', 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing'],
      ['Civil War', 'Vol. 1', '1', 'Civil War', '1', 'Marvel Comics', '2006', '2006-01-01', 'Superhero', 'Mark Millar', 'Steve McNiven', 'Single Issue', '2', '1.0', 'Read', '10.00', '45.00', 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing'],
      ['Uncanny X-Men', 'Vol. 1', '266', 'X-Tinction Agenda', '1', 'Marvel Comics', '1990', '1990-01-01', 'Superhero', 'Chris Claremont', 'Jim Lee', 'Single Issue', '2', '1.0', 'Unread', '2.50', '250.00', 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing'],
      ['Saga', 'Vol. 1', '50', '', '1', 'Image Comics', '2018', '2018-01-01', 'Sci-Fi', 'Brian K. Vaughan', 'Fiona Staples', 'Single Issue', '5', '1.0', 'Read', '1.50', '15.00', 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing'],
    ];

    setHeaders(sampleHeaders);
    setRowsData(sampleRows);
    setIsDataLoaded(true);

    // Auto map columns
    setMappings({
      titleCol: 'Title',
      issueCol: 'Issue #',
      volumeCol: 'Volume',
      eventCol: 'Event',
      copiesCol: 'Copies Owned',
      publisherCol: 'Publisher',
      yearCol: 'Year',
      publicationDateCol: 'Release Date',
      genreCol: 'Genre',
      writerCol: 'Writer',
      artistCol: 'Artist',
      boxCol: 'Box #',
      proposedBoxCol: 'Proposed Box #',
      thicknessCol: 'Size Units',
      formatCol: 'Format',
      statusCol: 'Reading Status',
      purchasePriceCol: 'Price Paid',
      valueCol: 'Est Value',
      imageCol: 'Image Link',
    });
  };

  // Fetch real Google Sheet
  const handleFetchGoogleSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spreadsheetId.trim()) {
      setErrorMsg('Please enter a Google Spreadsheet ID or URL');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    // Extract ID if full URL pasted
    let cleanId = spreadsheetId.trim();
    const urlMatch = cleanId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) {
      cleanId = urlMatch[1];
    }

    try {
      const accessToken = await getAccessToken();
      const response = await fetch('/api/google-sheets/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: cleanId,
          sheetName,
          accessToken: accessToken || undefined,
        }),
      });

      const res = await response.json();
      if (res.success) {
        setHeaders(res.headers);
        setRowsData(res.rows);
        setIsDataLoaded(true);

        // Auto-guess column mapping
        const hList = res.headers;
        const findHeader = (keywords: string[]) => {
          return hList.find((h: string) => keywords.some(k => h.toLowerCase().includes(k))) || '';
        };

        setMappings({
          titleCol: findHeader(['title', 'comic']),
          issueCol: findHeader(['issue', '#', 'num', 'number']),
          volumeCol: findHeader(['volume', 'vol']),
          eventCol: findHeader(['event', 'crossover', 'storyline', 'arc']),
          copiesCol: findHeader(['copies owned', 'copies', 'quantity', 'qty', 'owned', 'count']),
          publisherCol: findHeader(['publisher', 'pub']),
          yearCol: findHeader(['year', 'date']),
          publicationDateCol: findHeader(['publication date', 'release date', 'pub date']),
          genreCol: findHeader(['genre', 'category']),
          writerCol: findHeader(['writer', 'author']),
          artistCol: findHeader(['artist', 'penciler']),
          boxCol: findHeader(['box', 'storage', 'location']),
          proposedBoxCol: findHeader(['proposed box', 'suggested box']),
          thicknessCol: findHeader(['thickness', 'unit', 'size', 'equivalent']),
          formatCol: findHeader(['format', 'type', 'binding']),
          statusCol: findHeader(['marked read', 'marked_read', 'read status', 'reading status', 'status', 'read', 'state', 'have read', 'in wishlist', 'read?']),
          valueCol: findHeader(['value', 'price', 'worth']),
          purchasePriceCol: findHeader(['purchase price', 'price paid', 'paid']),
          imageCol: findHeader(['image link']),
        });
      } else {
        setErrorMsg(res.error || 'Failed to fetch spreadsheet data. Ensure the Google Sheet is shared with View permissions or public.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Network error fetching Google Sheet');
    } finally {
      setIsLoading(false);
    }
  };

  // Execute Import
  const handleExecuteImport = () => {
    if (!rowsData.length || !mappings.titleCol) {
      alert('Please select at least the Title column mapping');
      return;
    }

    const getColIndex = (colName?: string) => colName ? headers.indexOf(colName) : -1;

    const titleIdx = getColIndex(mappings.titleCol);
    const issueIdx = getColIndex(mappings.issueCol);
    const volumeIdx = getColIndex(mappings.volumeCol);
    const eventIdx = getColIndex(mappings.eventCol);
    const copiesIdx = getColIndex(mappings.copiesCol);
    const pubIdx = getColIndex(mappings.publisherCol);
    const yearIdx = getColIndex(mappings.yearCol);
    const publicationDateIdx = getColIndex(mappings.publicationDateCol);
    const genreIdx = getColIndex(mappings.genreCol);
    const writerIdx = getColIndex(mappings.writerCol);
    const artistIdx = getColIndex(mappings.artistCol);
    const boxIdx = getColIndex(mappings.boxCol);
    const proposedBoxIdx = getColIndex(mappings.proposedBoxCol);
    const thicknessIdx = getColIndex(mappings.thicknessCol);
    const formatIdx = getColIndex(mappings.formatCol);
    const statusIdx = getColIndex(mappings.statusCol);
    const valIdx = getColIndex(mappings.valueCol);
    const purchasePriceIdx = getColIndex(mappings.purchasePriceCol);
    const imageIdx = getColIndex(mappings.imageCol);
    const newComics: ComicBook[] = rowsData.map((row, idx) => {
      const rawTitle = titleIdx >= 0 ? String(row[titleIdx] || '').trim() : `Comic #${idx + 1}`;
      const rawIssue = issueIdx >= 0 ? String(row[issueIdx] || '').trim() : '';
      const rawVolume = volumeIdx >= 0 ? String(row[volumeIdx] || '').trim() : '';
      const rawEvent = eventIdx >= 0 ? String(row[eventIdx] || '').trim() : '';
      const rawCopies = copiesIdx >= 0 ? parseInt(String(row[copiesIdx])) : 1;
      const rawPurchasePrice = purchasePriceIdx >= 0 ? parseFloat(String(row[purchasePriceIdx])) : undefined;

      let titleVal = rawTitle;
      let issueVal = rawIssue;
      let volumeVal = rawVolume || undefined;
      let eventVal = rawEvent || undefined;
      
      const rawDateCell = yearIdx >= 0 ? row[yearIdx] : undefined;
      const parsedDate = parseYearAndMonth(rawDateCell, rawTitle);
      let yearVal = parsedDate.year;
      let monthVal = parsedDate.month;

      // Smart title & issue parser ONLY if Issue column is not mapped or user specifically opts in
      if (parseTitleOption && (issueIdx < 0 || mappings.issueCol === mappings.titleCol || !rawIssue)) {
        const parsed = parseTitleAndIssue(rawTitle, rawIssue);
        titleVal = parsed.cleanTitle;
        if (parsed.issueNumber) issueVal = parsed.issueNumber;
        if (!volumeVal && parsed.volume) volumeVal = parsed.volume;
        if (!yearVal && parsed.publicationYear) yearVal = parsed.publicationYear;
      }

      if (!issueVal) issueVal = '1';
      if (!yearVal) yearVal = 2020;

      const pubVal = pubIdx >= 0 ? String(row[pubIdx] || '').trim() : 'Independent';
      const genreVal = genreIdx >= 0 ? String(row[genreIdx] || '').trim() : 'Superhero';
      const writerVal = writerIdx >= 0 ? String(row[writerIdx] || '').trim() : '';
      const artistVal = artistIdx >= 0 ? String(row[artistIdx] || '').trim() : '';

      let boxVal = 0;
      if (boxIdx >= 0 && row[boxIdx] !== undefined && row[boxIdx] !== null) {
        const strVal = String(row[boxIdx]).trim();
        if (strVal !== '') {
          const parsed = parseInt(strVal);
          if (!isNaN(parsed) && parsed >= 0) {
            boxVal = parsed;
          }
        }
      }

      let proposedBoxVal = 0;
      if (proposedBoxIdx >= 0 && row[proposedBoxIdx] !== undefined && row[proposedBoxIdx] !== null) {
        const strVal = String(row[proposedBoxIdx]).trim();
        if (strVal !== '') {
          const parsed = parseInt(strVal);
          if (!isNaN(parsed) && parsed >= 0) {
            proposedBoxVal = parsed;
          }
        }
      }

      const thicknessVal = thicknessIdx >= 0 ? parseFloat(row[thicknessIdx]) || 1.0 : 1.0;
      const formatVal = formatIdx >= 0 ? String(row[formatIdx] || '').trim() as any : 'Single Issue';
      
      const rawStatusCell = statusIdx >= 0 ? row[statusIdx] : undefined;
      const rawStatusStr = rawStatusCell !== undefined && rawStatusCell !== null ? String(rawStatusCell).trim() : 'Unread';
      const valNumber = valIdx >= 0 ? parseFloat(row[valIdx]) || undefined : undefined;

      const rawStatusLower = rawStatusStr.toLowerCase();
      const numericStatus = parseFloat(rawStatusStr);
      let readingStatusVal: ReadingStatus = 'Unread';

      if (
        rawStatusLower.includes('wish') ||
        rawStatusLower.includes('want') ||
        rawStatusLower === 'w' ||
        rawStatusLower === 'buy' ||
        rawStatusLower.includes('seek') ||
        rawStatusLower === 'in wish list'
      ) {
        readingStatusVal = 'Wishlist';
      } else if (
        rawStatusLower.includes('progress') ||
        rawStatusLower === 'current' ||
        rawStatusLower === 'currently reading'
      ) {
        readingStatusVal = 'Reading';
      } else if (
        rawStatusLower === 'unread' ||
        rawStatusLower === 'no' ||
        rawStatusLower === 'false' ||
        rawStatusLower === 'f' ||
        rawStatusLower === 'n' ||
        rawStatusLower === 'not read' ||
        rawStatusLower === '0' ||
        rawStatusLower === '0.0'
      ) {
        readingStatusVal = 'Unread';
      } else if (
        rawStatusLower === '1' ||
        rawStatusLower === '1.0' ||
        (!isNaN(numericStatus) && numericStatus > 0) ||
        rawStatusLower === 'read' ||
        rawStatusLower === 'yes' ||
        rawStatusLower === 'true' ||
        rawStatusLower === 'completed' ||
        rawStatusLower === 'done' ||
        rawStatusLower === 'finished' ||
        rawStatusLower === 'y' ||
        rawStatusLower === 'r' ||
        rawStatusLower === 'have read' ||
        rawStatusLower === 'already read' ||
        rawStatusLower === 'marked read' ||
        rawStatusLower.includes('marked read') ||
        rawStatusLower.includes('read')
      ) {
        readingStatusVal = 'Read';
      } else if (['Read', 'Reading', 'Unread', 'Wishlist'].includes(rawStatusStr)) {
        readingStatusVal = rawStatusStr as ReadingStatus;
      }

      // Wishlist comics always have 0 copies owned
      let copiesOwnedVal = 0;
      if (readingStatusVal !== 'Wishlist') {
        copiesOwnedVal = (!isNaN(rawCopies) && rawCopies > 0) ? rawCopies : 0;
      }

      if (copiesOwnedVal === 0) {
        readingStatusVal = 'Wishlist';
      }

      const tags = ['Google Sheets Import'];
      if (eventVal) tags.push(eventVal);

      return {
        id: `imported-${Date.now()}-${idx}`,
        title: titleVal,
        issueNumber: issueVal,
        volume: volumeVal,
        event: eventVal,
        copiesOwned: copiesOwnedVal,
        publisher: pubVal,
        publicationYear: yearVal,
        publicationMonth: monthVal,
        publicationDate: publicationDateIdx >= 0 && row[publicationDateIdx] ? String(row[publicationDateIdx]).trim() : undefined,
        genre: genreVal,
        writer: writerVal,
        artist: artistVal,
        coverImage: imageIdx >= 0 && row[imageIdx] ? String(row[imageIdx]).trim() : 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing',
        format: ['Single Issue', 'Trade Paperback', 'Hardcover', 'Omnibus', 'Graphic Novel'].includes(formatVal) ? formatVal : 'Single Issue',
        sizeThickness: thicknessVal > 0 ? thicknessVal : 1.0,
        currentBoxId: boxVal >= 0 ? boxVal : 0,
        proposedBoxId: proposedBoxVal >= 0 ? proposedBoxVal : 0,
        readingStatus: readingStatusVal,
        condition: 'Near Mint',
        estimatedValue: valNumber,
        purchasePrice: rawPurchasePrice,
        tags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    onImportComics(newComics, importMode);
    setImportedCount(newComics.length);
    setIsSuccess(true);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-lg">Google Sheets Collection Sync</h2>
            <p className="text-xs text-slate-500">
              Import your existing 'Comic Book Collection' spreadsheet directly into the 15-box manager.
            </p>
          </div>
        </div>

        {/* Input Form */}
        {!isDataLoaded && (
          <form onSubmit={handleFetchGoogleSheet} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Google Spreadsheet ID or URL
                </label>
                <input
                  type="text"
                  value={spreadsheetId}
                  onChange={(e) => setSpreadsheetId(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Sheet Tab Name</label>
                <input
                  type="text"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  placeholder="Sheet1 or Comics"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleLoadSampleSheetData}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-xl border border-slate-200 flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Load Demo 'Comic Book Collection' Sheet Data</span>
              </button>

              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                <span>Fetch Google Sheet Data</span>
              </button>
            </div>
          </form>
        )}

        {/* Success Banner */}
        {isSuccess && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h4 className="font-bold text-sm">Successfully Imported {importedCount} Comics!</h4>
                <p className="text-xs text-emerald-700">All rows mapped and assigned to storage boxes.</p>
              </div>
            </div>
            <button
              onClick={() => {
                setIsDataLoaded(false);
                setIsSuccess(false);
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs"
            >
              Import Another
            </button>
          </div>
        )}
      </div>

      {/* Column Auto-Mapper */}
      {isDataLoaded && !isSuccess && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Map Spreadsheet Columns to Vault Database</h3>
              <p className="text-xs text-slate-500">Found {rowsData.length} comic entries in spreadsheet.</p>
            </div>
            <button
              onClick={() => setIsDataLoaded(false)}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              Change Spreadsheet
            </button>
          </div>

          {/* Full Title Parsing Option */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-start gap-3">
            <input
              type="checkbox"
              id="parseTitleOption"
              checked={parseTitleOption}
              onChange={(e) => setParseTitleOption(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-800 cursor-pointer"
            />
            <label htmlFor="parseTitleOption" className="text-xs text-slate-700 cursor-pointer select-none">
              <strong className="text-slate-900 font-bold">Automatically parse Issue # from "Full Title" column</strong>
              <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                If checked, titles like <span className="font-mono text-slate-800 bg-white px-1 py-0.5 rounded border border-slate-200">"The Amazing Spider-Man #300"</span> or <span className="font-mono text-slate-800 bg-white px-1 py-0.5 rounded border border-slate-200">"Batman #423 (1988)"</span> will automatically split into Title: <span className="font-semibold text-slate-900 font-mono">"The Amazing Spider-Man"</span>, Issue #: <span className="font-semibold text-slate-900 font-mono">"300"</span>, and Year: <span className="font-semibold text-slate-900 font-mono">"1988"</span>.
              </p>
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Comic Title *</label>
              <select
                value={mappings.titleCol}
                onChange={(e) => setMappings({ ...mappings, titleCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Issue #</label>
              <select
                value={mappings.issueCol}
                onChange={(e) => setMappings({ ...mappings, issueCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Volume</label>
              <select
                value={mappings.volumeCol || ''}
                onChange={(e) => setMappings({ ...mappings, volumeCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-purple-700 mb-1">Crossover Event</label>
              <select
                value={mappings.eventCol || ''}
                onChange={(e) => setMappings({ ...mappings, eventCol: e.target.value })}
                className="w-full bg-white border border-purple-300 bg-purple-50/30 rounded-lg px-2.5 py-2 text-xs text-slate-800 font-medium"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-800 mb-1">Copies Owned (Qty)</label>
              <select
                value={mappings.copiesCol || ''}
                onChange={(e) => setMappings({ ...mappings, copiesCol: e.target.value })}
                className="w-full bg-white border border-amber-300 bg-amber-50/30 rounded-lg px-2.5 py-2 text-xs text-slate-800 font-medium"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Publisher</label>
              <select
                value={mappings.publisherCol}
                onChange={(e) => setMappings({ ...mappings, publisherCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Publication Year</label>
              <select
                value={mappings.yearCol}
                onChange={(e) => setMappings({ ...mappings, yearCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Publication Date</label>
              <select
                value={mappings.publicationDateCol}
                onChange={(e) => setMappings({ ...mappings, publicationDateCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Storage Box #</label>
              <select
                value={mappings.boxCol}
                onChange={(e) => setMappings({ ...mappings, boxCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Proposed Storage Box #</label>
              <select
                value={mappings.proposedBoxCol}
                onChange={(e) => setMappings({ ...mappings, proposedBoxCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Thickness / Size Units</label>
              <select
                value={mappings.thicknessCol}
                onChange={(e) => setMappings({ ...mappings, thicknessCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Genre</label>
              <select
                value={mappings.genreCol}
                onChange={(e) => setMappings({ ...mappings, genreCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Reading Status</label>
              <select
                value={mappings.statusCol}
                onChange={(e) => setMappings({ ...mappings, statusCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Image Link</label>
              <select
                value={mappings.imageCol}
                onChange={(e) => setMappings({ ...mappings, imageCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Purchase Price</label>
              <select
                value={mappings.purchasePriceCol}
                onChange={(e) => setMappings({ ...mappings, purchasePriceCol: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="">-- Select Column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Import Mode Selection */}
          <div className="pt-4 border-t border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-800">Import Mode</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                importMode === 'append' ? 'bg-slate-900 text-white border-slate-900 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}>
                <input
                  type="radio"
                  name="importMode"
                  value="append"
                  checked={importMode === 'append'}
                  onChange={() => setImportMode('append')}
                  className="mt-0.5"
                />
                <div className="text-xs">
                  <div className="font-bold">Append to Existing Collection</div>
                  <div className={`text-[11px] mt-0.5 ${importMode === 'append' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Adds these {rowsData.length} items alongside your existing {comicsCount} comics.
                  </div>
                </div>
              </label>

              <label className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                importMode === 'replace' ? 'bg-rose-900 text-white border-rose-900 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}>
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="mt-0.5"
                />
                <div className="text-xs">
                  <div className="font-bold">Replace Entire Collection</div>
                  <div className={`text-[11px] mt-0.5 ${importMode === 'replace' ? 'text-rose-200' : 'text-slate-500'}`}>
                    Wipes existing comics and replaces them entirely with this sheet. Great for fixing double-imports!
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              onClick={handleExecuteImport}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>
                Confirm & {importMode === 'replace' ? 'Replace Collection with' : 'Import'} {rowsData.length} Entries
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Data Cleanup & Reset Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shrink-0">
            <CopyX className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Accidentally imported twice or want to start fresh?</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Remove exact duplicates from double-importing, clear out all data to start clean, or reset back to the default sample collection.
            </p>
          </div>
        </div>

        {onOpenDataManagementModal && (
          <button
            onClick={onOpenDataManagementModal}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs shrink-0 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Manage & Clean Collection Data</span>
          </button>
        )}
      </div>

    </div>
  );
};
