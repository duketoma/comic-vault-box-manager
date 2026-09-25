import React, { useState, useEffect } from 'react';
import { ComicBook, StorageBox, ReadingStatus } from '../types';
import { getAccessToken } from '../services/auth';
import { parseTitleAndIssue } from '../utils/titleParser';
import { parseYearAndMonth } from '../utils/dateUtils';
import { fetchGoogleSubsheets, importSubsheetsData } from '../services/postgresService';
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
  Info,
  UserCheck,
  Tag,
  Palette,
  Users,
  ShieldCheck,
  Check,
  ExternalLink,
  ChevronRight,
  Database
} from 'lucide-react';

interface GoogleSheetsImporterProps {
  boxes: StorageBox[];
  onImportComics: (importedComics: ComicBook[], mode?: 'append' | 'replace', navigate?: boolean) => Promise<void> | void;
  onRefreshCollection?: () => Promise<void>;
  onNavigateToTab?: (tab: 'catalog' | 'boxes' | 'stats' | 'sheets' | 'database') => void;
  onOpenDataManagementModal?: () => void;
  comicsCount?: number;
}

type SubsheetKey = 'comics' | 'creators' | 'creatorTypes' | 'contributors' | 'characterAppearances' | 'seriesTotals';

interface SubsheetData {
  sheetName: string;
  headers: string[];
  rows: any[][];
  isLoaded: boolean;
  error?: string;
}

export const GoogleSheetsImporter: React.FC<GoogleSheetsImporterProps> = ({
  boxes,
  onImportComics,
  onRefreshCollection,
  onNavigateToTab,
  onOpenDataManagementModal,
  comicsCount = 0,
}) => {
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [activeSubsheet, setActiveSubsheet] = useState<'overview' | SubsheetKey>('overview');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  const [isImportingComicsOnly, setIsImportingComicsOnly] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tab names configuration
  const [tabNames, setTabNames] = useState<Record<SubsheetKey, string>>({
    comics: 'Comics',
    creators: 'Creators',
    creatorTypes: 'Creator Types',
    contributors: 'Title Contributors',
    characterAppearances: 'Title Character Appearances',
    seriesTotals: 'Series Issue Total',
  });

  // Loaded data for each subsheet
  const [subsheets, setSubsheets] = useState<Record<SubsheetKey, SubsheetData>>({
    comics: { sheetName: 'Comics', headers: [], rows: [], isLoaded: false },
    creators: { sheetName: 'Creators', headers: [], rows: [], isLoaded: false },
    creatorTypes: { sheetName: 'Creator Types', headers: [], rows: [], isLoaded: false },
    contributors: { sheetName: 'Title Contributors', headers: [], rows: [], isLoaded: false },
    characterAppearances: { sheetName: 'Title Character Appearances', headers: [], rows: [], isLoaded: false },
    seriesTotals: { sheetName: 'Series Issue Total', headers: [], rows: [], isLoaded: false },
  });

  // Comics Column Mapping State
  const [comicMappings, setComicMappings] = useState({
    titleCol: '',
    issueCol: '',
    volumeCol: '',
    seriesNameCol: '',
    fullTitleCol: '',
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
    wishlistCol: '',
    purchasePriceCol: '',
    valueCol: '',
    imageCol: '',
  });

  // Creators Column Mapping
  const [creatorsMappings, setCreatorsMappings] = useState({
    firstNameCol: '',
    lastNameCol: '',
    fullNameCol: '',
  });

  // Creator Types Column Mapping
  const [creatorTypesMappings, setCreatorTypesMappings] = useState({
    typeNameCol: '',
  });

  // Title Contributors Column Mapping
  const [contributorsMappings, setContributorsMappings] = useState({
    seriesNameCol: '',
    fullTitleCol: '',
    creatorFullNameCol: '',
    creatorTypeCol: '',
  });

  // Character Appearances Column Mapping
  const [characterMappings, setCharacterMappings] = useState({
    seriesNameCol: '',
    fullTitleCol: '',
    characterNameCol: '',
    appearanceTypeCol: '',
  });

  // Series Issue Totals Column Mapping
  const [seriesTotalsMappings, setSeriesTotalsMappings] = useState({
    publisherCol: '',
    seriesNameCol: '',
    volumeCol: '',
    issueCountCol: '',
  });

  const [parseTitleOption, setParseTitleOption] = useState<boolean>(true);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('replace');

  // Success state and metrics
  const [syncSuccess, setSyncSuccess] = useState<{
    creators?: number;
    creatorTypes?: number;
    contributors?: number;
    characterAppearances?: number;
    seriesTotals?: number;
    comicsUpdated?: number;
    comicsImported?: number;
  } | null>(null);

  // Helper to find header match with exact matching priority, avoiding false substring collisions
  const findHeader = (headers: string[], keywords: string[], excludedHeaders: string[] = []): string => {
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const excludedClean = new Set(excludedHeaders.map(clean));
    const available = headers.filter(h => !excludedClean.has(clean(h)));

    // Exact normalized string match across keywords in priority order
    for (const kw of keywords) {
      const kwClean = clean(kw);
      const match = available.find(h => clean(h) === kwClean);
      if (match) return match;
    }

    return '';
  };

  // Auto-guess column mappings for all subsheets using STRICT exact matching
  const autoMapSubsheetColumns = (key: SubsheetKey, hList: string[]) => {
    if (key === 'comics') {
      const sNameCol = findHeader(hList, ['Series Name', 'Comic Series']);
      const fTitleCol = findHeader(hList, ['Full Title'], [sNameCol]);
      const tCol = findHeader(hList, ['Title', 'Comic Title'], [sNameCol, fTitleCol]);
      const issueCol = findHeader(hList, ['Issue Number', 'Issue #', 'Issue']);
      const volCol = findHeader(hList, ['Volume', 'Vol']);
      const evtCol = findHeader(hList, ['Event', 'Story Arc']);
      const copiesCol = findHeader(hList, ['Copies Owned', 'Copies', 'Quantity']);
      const pubCol = findHeader(hList, ['Publisher Name', 'Publisher']);
      const yearCol = findHeader(hList, ['Release Year', 'Year']);
      const pubDateCol = findHeader(hList, ['Release Date', 'Publication Date', 'Pub Date'], [yearCol]);
      const genreCol = findHeader(hList, ['Genre']);
      const writerCol = findHeader(hList, ['Writer']);
      const artistCol = findHeader(hList, ['Artist']);
      // Box must match strictly 'Box' and never 'Storage Box' or 'Proposed Box'
      const boxCol = findHeader(hList, ['Box'], ['Storage Box', 'Proposed Box']);
      const proposedBoxCol = findHeader(hList, ['Proposed Box'], [boxCol]);
      const thicknessCol = findHeader(hList, ['Equivalant Comic Book Size Per Issue', 'Equivalent Comic Book Size Per Issue', 'Thickness', 'Comic Size']);
      const formatCol = findHeader(hList, ['Media Format', 'Format']);
      const statusCol = findHeader(hList, ['Marked Read', 'Read Status', 'Reading Status', 'Read']);
      const wishlistCol = findHeader(hList, ['In Wish List', 'Wish List', 'In Wishlist', 'Wishlist']);
      const valueCol = findHeader(hList, ['Estimated Value', 'Value']);
      const purchasePriceCol = findHeader(hList, ['Price Paid', 'Purchase Price'], [valueCol]);
      const imageCol = findHeader(hList, ['Image Link', 'Cover Image Link', 'Cover Link', 'Cover Image']);

      setComicMappings({
        titleCol: tCol,
        issueCol,
        volumeCol: volCol,
        seriesNameCol: sNameCol,
        fullTitleCol: fTitleCol,
        eventCol: evtCol,
        copiesCol,
        publisherCol: pubCol,
        yearCol,
        publicationDateCol: pubDateCol,
        genreCol,
        writerCol,
        artistCol,
        boxCol,
        proposedBoxCol,
        thicknessCol,
        formatCol,
        statusCol,
        wishlistCol,
        valueCol,
        purchasePriceCol,
        imageCol,
      });
    } else if (key === 'creators') {
      const fnCol = findHeader(hList, ['First Name']);
      const lnCol = findHeader(hList, ['Last Name'], [fnCol]);
      const fullCol = findHeader(hList, ['Full Name', 'Creator Full Name', 'Creator Name'], [fnCol, lnCol]);
      setCreatorsMappings({
        firstNameCol: fnCol,
        lastNameCol: lnCol,
        fullNameCol: fullCol,
      });
    } else if (key === 'creatorTypes') {
      setCreatorTypesMappings({
        typeNameCol: findHeader(hList, ['Creator Type', 'Type']),
      });
    } else if (key === 'contributors') {
      const sCol = findHeader(hList, ['Series Name']);
      const fCol = findHeader(hList, ['Full Title'], [sCol]);
      const cCol = findHeader(hList, ['Creator Full Name', 'Creator Name'], [sCol, fCol]);
      const tCol = findHeader(hList, ['Creator Type', 'Type'], [sCol, fCol, cCol]);
      setContributorsMappings({
        seriesNameCol: sCol,
        fullTitleCol: fCol,
        creatorFullNameCol: cCol,
        creatorTypeCol: tCol,
      });
    } else if (key === 'characterAppearances') {
      const sCol = findHeader(hList, ['Series Name']);
      const fCol = findHeader(hList, ['Full Title'], [sCol]);
      const cCol = findHeader(hList, ['Character Name'], [sCol, fCol]);
      const aCol = findHeader(hList, ['Appearance Type'], [sCol, fCol, cCol]);
      setCharacterMappings({
        seriesNameCol: sCol,
        fullTitleCol: fCol,
        characterNameCol: cCol,
        appearanceTypeCol: aCol,
      });
    } else if (key === 'seriesTotals') {
      const pubCol = findHeader(hList, ['Publisher Name', 'Publisher']);
      const sCol = findHeader(hList, ['Series Name', 'Comic Series', 'Series']);
      const vCol = findHeader(hList, ['Volume', 'Vol']);
      const countCol = findHeader(hList, ['Issue Count', 'Total Issues', 'Total Issue Count', 'Issues']);
      setSeriesTotalsMappings({
        publisherCol: pubCol,
        seriesNameCol: sCol,
        volumeCol: vCol,
        issueCountCol: countCol,
      });
    }
  };

  // Automatically ensure mappings are up to date whenever subsheets headers change
  useEffect(() => {
    (Object.keys(subsheets) as SubsheetKey[]).forEach((key) => {
      if (subsheets[key].headers.length > 0) {
        autoMapSubsheetColumns(key, subsheets[key].headers);
      }
    });
  }, [
    subsheets.comics.headers,
    subsheets.creators.headers,
    subsheets.creatorTypes.headers,
    subsheets.contributors.headers,
    subsheets.characterAppearances.headers,
    subsheets.seriesTotals.headers,
  ]);

  // Load Demo Multi-Tab Data (Todd McFarlane, Jim Lee, Chris Claremont, Michelinie, etc.)
  const handleLoadDemoData = () => {
    // 1. Comics
    const comicHeaders = ['Series Name', 'Volume', 'Full Title', 'Title', 'Issue Number', 'Publisher Name', 'Release Date', 'Genre', 'Media Format', 'Box', 'Proposed Box', 'Equivalant Comic Book Size Per Issue', 'Marked Read', 'In Wish List', 'Price Paid', 'Estimated Value', 'Image Link'];
    const comicRows = [
      ['The Amazing Spider-Man (1963 - 1998)', '1', 'The Amazing Spider-Man #300', 'The Amazing Spider-Man', '300', 'Marvel Comics', '1988-05-01', 'Superhero', 'Single Issue', '1', '1', '1.0', '1', '0', '50.00', '650.00', 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing'],
      ['The Amazing Spider-Man (1963 - 1998)', '1', 'The Amazing Spider-Man #316', 'The Amazing Spider-Man', '316', 'Marvel Comics', '1989-06-01', 'Superhero', 'Single Issue', '1', '1', '1.0', '1', '0', '20.00', '180.00', 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing'],
      ['Spider-Man (1990 - 1998)', '1', 'Spider-Man #1', 'Spider-Man', '1', 'Marvel Comics', '1990-08-01', 'Superhero', 'Single Issue', '1', '1', '1.0', '1', '0', '1.75', '35.00', 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing'],
      ['Spawn (1992 - Present)', '1', 'Spawn #1', 'Spawn', '1', 'Image Comics', '1992-05-01', 'Superhero', 'Single Issue', '2', '2', '1.0', '1', '0', '1.95', '75.00', 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing'],
      ['Uncanny X-Men (1963 - 2011)', '1', 'Uncanny X-Men #266', 'Uncanny X-Men', '266', 'Marvel Comics', '1990-07-01', 'Superhero', 'Single Issue', '2', '2', '1.0', '1', '0', '2.50', '250.00', 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing'],
      ['Batman (1940 - 2011)', '1', 'Batman #423', 'Batman', '423', 'DC Comics', '1988-09-01', 'Crime', 'Single Issue', '3', '3', '1.0', '1', '0', '25.00', '150.00', 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing'],
    ];

    // 2. Creators
    const creatorHeaders = ['First Name', 'Last Name', 'Full Name'];
    const creatorRows = [
      ['Todd', 'McFarlane', 'Todd McFarlane'],
      ['David', 'Michelinie', 'David Michelinie'],
      ['Jim', 'Lee', 'Jim Lee'],
      ['Chris', 'Claremont', 'Chris Claremont'],
      ['Jim', 'Starlin', 'Jim Starlin'],
      ['Mike', 'Mignola', 'Mike Mignola'],
      ['Klaus', 'Janson', 'Klaus Janson'],
      ['Bob', 'McLeod', 'Bob McLeod'],
      ['Stan', 'Lee', 'Stan Lee'],
      ['Steve', 'Ditko', 'Steve Ditko'],
      ['Tom', 'DeFalco', 'Tom DeFalco'],
      ['Sal', 'Buscema', 'Sal Buscema'],
    ];

    // 3. Creator Types
    const creatorTypeHeaders = ['Creator Type'];
    const creatorTypeRows = [
      ['Writer'],
      ['Penciller'],
      ['Inker'],
      ['Colorist'],
      ['Letterer'],
      ['Editor'],
      ['Cover Artist'],
      ['Plot / Script'],
    ];

    // 4. Title Contributors (showing pencillers contributing writing & story!)
    const contributorHeaders = ['Series Name', 'Full Title', 'Creator Full Name', 'Creator Type'];
    const contributorRows = [
      // ASM #300: Michelinie wrote, McFarlane pencilled
      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #300', 'David Michelinie', 'Writer'],
      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #300', 'Todd McFarlane', 'Penciller'],
      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #300', 'Todd McFarlane', 'Inker'],
      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #300', 'Jim Salicrup', 'Editor'],

      // ASM #316: Michelinie wrote, McFarlane pencilled & cover
      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #316', 'David Michelinie', 'Writer'],
      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #316', 'Todd McFarlane', 'Penciller'],
      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #316', 'Todd McFarlane', 'Cover Artist'],

      // Spider-Man #1 (1990): Todd McFarlane BOTH wrote AND pencilled!
      ['Spider-Man (1990 - 1998)', 'Spider-Man #1', 'Todd McFarlane', 'Writer'],
      ['Spider-Man (1990 - 1998)', 'Spider-Man #1', 'Todd McFarlane', 'Penciller'],
      ['Spider-Man (1990 - 1998)', 'Spider-Man #1', 'Todd McFarlane', 'Cover Artist'],

      // Spawn #1: Todd McFarlane wrote and pencilled!
      ['Spawn (1992 - Present)', 'Spawn #1', 'Todd McFarlane', 'Writer'],
      ['Spawn (1992 - Present)', 'Spawn #1', 'Todd McFarlane', 'Penciller'],
      ['Spawn (1992 - Present)', 'Spawn #1', 'Steve Oliff', 'Colorist'],

      // Uncanny X-Men #266: Claremont wrote, Jim Lee pencilled
      ['Uncanny X-Men (1963 - 2011)', 'Uncanny X-Men #266', 'Chris Claremont', 'Writer'],
      ['Uncanny X-Men (1963 - 2011)', 'Uncanny X-Men #266', 'Jim Lee', 'Penciller'],
      ['Uncanny X-Men (1963 - 2011)', 'Uncanny X-Men #266', 'Bob Wiacek', 'Inker'],

      // Batman #423: Starlin wrote, Mignola pencilled, McFarlane cover artist!
      ['Batman (1940 - 2011)', 'Batman #423', 'Jim Starlin', 'Writer'],
      ['Batman (1940 - 2011)', 'Batman #423', 'Mike Mignola', 'Penciller'],
      ['Batman (1940 - 2011)', 'Batman #423', 'Todd McFarlane', 'Cover Artist'],
    ];

    // 5. Title Character Appearances
    const appearanceHeaders = ['Series Name', 'Full Title', 'Character Name', 'Appearance Type'];
    const appearanceRows = [
      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #300', 'Spider-Man (Peter Parker)', 'Main'],
      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #300', 'Venom (Eddie Brock)', 'Main'],
      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #300', 'Mary Jane Watson', 'Supporting'],

      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #316', 'Spider-Man (Peter Parker)', 'Main'],
      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #316', 'Venom (Eddie Brock)', 'Main'],
      ['The Amazing Spider-Man (1963 - 1998)', 'The Amazing Spider-Man #316', 'Black Cat (Felicia Hardy)', 'Supporting'],

      ['Spider-Man (1990 - 1998)', 'Spider-Man #1', 'Spider-Man (Peter Parker)', 'Main'],
      ['Spider-Man (1990 - 1998)', 'Spider-Man #1', 'Lizard (Curt Connors)', 'Main'],
      ['Spider-Man (1990 - 1998)', 'Spider-Man #1', 'Calypso', 'Supporting'],

      ['Spawn (1992 - Present)', 'Spawn #1', 'Spawn (Al Simmons)', 'Main'],
      ['Spawn (1992 - Present)', 'Spawn #1', 'Wanda Blake', 'Supporting'],
      ['Spawn (1992 - Present)', 'Spawn #1', 'Malebolgia', 'Cameo'],

      ['Uncanny X-Men (1963 - 2011)', 'Uncanny X-Men #266', 'Gambit (Remy LeBeau)', 'Main'],
      ['Uncanny X-Men (1963 - 2011)', 'Uncanny X-Men #266', 'Storm (Ororo Munroe)', 'Main'],
      ['Uncanny X-Men (1963 - 2011)', 'Uncanny X-Men #266', 'Shadow King', 'Cameo'],

      ['Batman (1940 - 2011)', 'Batman #423', 'Batman (Bruce Wayne)', 'Main'],
      ['Batman (1940 - 2011)', 'Batman #423', 'Robin (Jason Todd)', 'Supporting'],
      ['Batman (1940 - 2011)', 'Batman #423', 'James Gordon', 'Supporting'],
    ];

    // 6. Series Issue Totals
    const seriesTotalsHeaders = ['Publisher Name', 'Series Name', 'Volume', 'Issue Count'];
    const seriesTotalsRows = [
      ['Marvel Comics', 'The Amazing Spider-Man (1963 - 1998)', '1', '441'],
      ['Marvel Comics', 'Spider-Man (1990 - 1998)', '1', '98'],
      ['Image Comics', 'Spawn (1992 - Present)', '1', '350'],
      ['Marvel Comics', 'Uncanny X-Men (1963 - 2011)', '1', '544'],
      ['DC Comics', 'Batman (1940 - 2011)', '1', '713'],
    ];

    const updated: Record<SubsheetKey, SubsheetData> = {
      comics: { sheetName: 'Comics', headers: comicHeaders, rows: comicRows, isLoaded: true },
      creators: { sheetName: 'Creators', headers: creatorHeaders, rows: creatorRows, isLoaded: true },
      creatorTypes: { sheetName: 'Creator Types', headers: creatorTypeHeaders, rows: creatorTypeRows, isLoaded: true },
      contributors: { sheetName: 'Title Contributors', headers: contributorHeaders, rows: contributorRows, isLoaded: true },
      characterAppearances: { sheetName: 'Title Character Appearances', headers: appearanceHeaders, rows: appearanceRows, isLoaded: true },
      seriesTotals: { sheetName: 'Series Issue Total', headers: seriesTotalsHeaders, rows: seriesTotalsRows, isLoaded: true },
    };

    setSubsheets(updated);
    autoMapSubsheetColumns('comics', comicHeaders);
    autoMapSubsheetColumns('creators', creatorHeaders);
    autoMapSubsheetColumns('creatorTypes', creatorTypeHeaders);
    autoMapSubsheetColumns('contributors', contributorHeaders);
    autoMapSubsheetColumns('characterAppearances', appearanceHeaders);
    autoMapSubsheetColumns('seriesTotals', seriesTotalsHeaders);
    setActiveSubsheet('overview');
  };

  // Fetch all subsheets from live Google Sheets
  const handleFetchAllSubsheets = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!spreadsheetId.trim()) {
      setErrorMsg('Please enter a Google Spreadsheet ID or URL');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    let cleanId = spreadsheetId.trim();
    const urlMatch = cleanId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) cleanId = urlMatch[1];

    try {
      const accessToken = await getAccessToken();
      const res = await fetchGoogleSubsheets({
        spreadsheetId: cleanId,
        sheetNames: tabNames,
        accessToken: accessToken || undefined,
      });

      if (res.success && res.subsheets) {
        const nextSubsheets = { ...subsheets };
        let anyLoaded = false;

        (Object.keys(tabNames) as SubsheetKey[]).forEach((key) => {
          const tabResult = res.subsheets[key];
          if (tabResult && tabResult.rows.length > 0) {
            nextSubsheets[key] = {
              sheetName: tabResult.sheetName,
              headers: tabResult.headers,
              rows: tabResult.rows,
              isLoaded: true,
            };
            autoMapSubsheetColumns(key, tabResult.headers);
            anyLoaded = true;
          } else if (tabResult && tabResult.error) {
            nextSubsheets[key] = {
              sheetName: tabResult.sheetName,
              headers: [],
              rows: [],
              isLoaded: false,
              error: tabResult.error,
            };
          }
        });

        setSubsheets(nextSubsheets);

        if (!anyLoaded) {
          setErrorMsg('Could not fetch any subsheets. Check tab names and verify sheet is shared with "Anyone with the link can view".');
        }
      }
    } catch (err: any) {
      console.error('Fetch subsheets error:', err);
      setErrorMsg(err.message || 'Failed to fetch Google Sheet subsheets');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to build a ComicBook object from a spreadsheet row
  const buildComicFromRow = (row: any[], idx: number, headers: string[]): ComicBook => {
    const getIdx = (colName: string) => (colName ? headers.indexOf(colName) : -1);

    const titleIdx = getIdx(comicMappings.titleCol);
    const issueIdx = getIdx(comicMappings.issueCol);
    const volumeIdx = getIdx(comicMappings.volumeCol);
    const seriesIdx = getIdx(comicMappings.seriesNameCol);
    const fullTitleIdx = getIdx(comicMappings.fullTitleCol);
    const eventIdx = getIdx(comicMappings.eventCol);
    const copiesIdx = getIdx(comicMappings.copiesCol);
    const pubIdx = getIdx(comicMappings.publisherCol);
    const yearIdx = getIdx(comicMappings.yearCol);
    const pubDateIdx = getIdx(comicMappings.publicationDateCol);
    const genreIdx = getIdx(comicMappings.genreCol);
    const writerIdx = getIdx(comicMappings.writerCol);
    const artistIdx = getIdx(comicMappings.artistCol);
    const boxIdx = getIdx(comicMappings.boxCol);
    const proposedBoxIdx = getIdx(comicMappings.proposedBoxCol);
    const thicknessIdx = getIdx(comicMappings.thicknessCol);
    const formatIdx = getIdx(comicMappings.formatCol);
    const statusIdx = getIdx(comicMappings.statusCol);
    const wishlistIdx = getIdx(comicMappings.wishlistCol);
    const valIdx = getIdx(comicMappings.valueCol);
    const priceIdx = getIdx(comicMappings.purchasePriceCol);
    const imgIdx = getIdx(comicMappings.imageCol);

    const rawTitle = titleIdx >= 0 ? String(row[titleIdx] || '').trim() : '';
    const rawIssue = issueIdx >= 0 ? String(row[issueIdx] || '').trim() : '';
    const rawVolume = volumeIdx >= 0 ? String(row[volumeIdx] || '').trim() : '';
    const rawSeries = seriesIdx >= 0 ? String(row[seriesIdx] || '').trim() : '';
    const rawFullTitle = fullTitleIdx >= 0 ? String(row[fullTitleIdx] || '').trim() : '';
    const rawEvent = eventIdx >= 0 ? String(row[eventIdx] || '').trim() : '';
    const rawCopies = copiesIdx >= 0 ? parseInt(String(row[copiesIdx]), 10) : 1;
    const rawPrice = priceIdx >= 0 ? parseFloat(String(row[priceIdx])) : undefined;

    let titleVal = rawTitle;
    let issueVal = rawIssue;
    let volumeVal = rawVolume || undefined;
    let eventVal = rawEvent || undefined;

    const rawDateCell = pubDateIdx >= 0 && row[pubDateIdx] ? row[pubDateIdx] : (yearIdx >= 0 ? row[yearIdx] : undefined);
    const parsedDate = parseYearAndMonth(rawDateCell, rawTitle || rawFullTitle || rawSeries);
    let yearVal = parsedDate.year;
    let monthVal = parsedDate.month;

    // If titleVal is empty or parsing is requested, resolve title and issue from title, full title, or series
    const sourceForParsing = rawTitle || rawFullTitle || rawSeries;
    if (sourceForParsing && (parseTitleOption || !titleVal || !issueVal || issueIdx < 0 || comicMappings.issueCol === comicMappings.titleCol)) {
      const parsed = parseTitleAndIssue(sourceForParsing, rawIssue);
      if (parsed.cleanTitle && (!titleVal || parseTitleOption)) {
        titleVal = parsed.cleanTitle;
      }
      if (parsed.issueNumber && (!issueVal || !rawIssue)) {
        issueVal = parsed.issueNumber;
      }
      if (!volumeVal && parsed.volume) volumeVal = parsed.volume;
      if (!yearVal && parsed.publicationYear) yearVal = parsed.publicationYear;
    }

    // Extract volume from series name if still not found (e.g. "Iron Man (Vol. 1) (1968 - 1996)")
    if (!volumeVal && rawSeries) {
      const volMatch = rawSeries.match(/\b(vol|volume|v)\.?\s*(\d+)\b/i);
      if (volMatch) volumeVal = volMatch[2];
    }

    // Ultimate fallbacks
    if (!titleVal) {
      titleVal = rawFullTitle || rawSeries || `Comic #${idx + 1}`;
    }
    if (!issueVal) issueVal = '1';
    if (!yearVal) yearVal = 2020;

    const pubVal = pubIdx >= 0 ? String(row[pubIdx] || '').trim() : 'Independent';
    const genreVal = genreIdx >= 0 ? String(row[genreIdx] || '').trim() : 'Superhero';
    const writerVal = writerIdx >= 0 ? String(row[writerIdx] || '').trim() : '';
    const artistVal = artistIdx >= 0 ? String(row[artistIdx] || '').trim() : '';

    // Strict Box parsing: only non-negative integers
    let boxVal = 0;
    if (boxIdx >= 0 && row[boxIdx] !== undefined && row[boxIdx] !== null && String(row[boxIdx]).trim() !== '') {
      const parsed = parseInt(String(row[boxIdx]).trim(), 10);
      if (!isNaN(parsed) && parsed >= 0) boxVal = parsed;
    }

    let proposedBoxVal = 0;
    if (proposedBoxIdx >= 0 && row[proposedBoxIdx] !== undefined && row[proposedBoxIdx] !== null && String(row[proposedBoxIdx]).trim() !== '') {
      const parsed = parseInt(String(row[proposedBoxIdx]).trim(), 10);
      if (!isNaN(parsed) && parsed >= 0) proposedBoxVal = parsed;
    }

    const thicknessVal = thicknessIdx >= 0 ? parseFloat(row[thicknessIdx]) || 1.0 : 1.0;
    const formatVal = formatIdx >= 0 ? (String(row[formatIdx] || '').trim() as any) : 'Single Issue';
    const rawWishlistStr = wishlistIdx >= 0 ? String(row[wishlistIdx] || '').trim().toLowerCase() : '';
    const rawStatusStr = statusIdx >= 0 ? String(row[statusIdx] || '').trim().toLowerCase() : '';
    const valNumber = valIdx >= 0 ? parseFloat(row[valIdx]) || undefined : undefined;

    let readingStatusVal: ReadingStatus = 'Unread';
    const isWishlist = rawWishlistStr === '1' || rawWishlistStr === 'true' || rawWishlistStr === 'yes' || rawWishlistStr.includes('wish');

    if (isWishlist) {
      readingStatusVal = 'Wishlist';
      boxVal = 0; // Wishlist items are always unallocated in Box 0
    } else if (rawStatusStr === '1' || rawStatusStr === 'read' || rawStatusStr === 'yes' || rawStatusStr === 'true') {
      readingStatusVal = 'Read';
    } else if (rawStatusStr.includes('progress') || rawStatusStr === 'reading') {
      readingStatusVal = 'Reading';
    }

    const copiesOwnedVal = readingStatusVal === 'Wishlist' ? 0 : (!isNaN(rawCopies) && rawCopies > 0 ? rawCopies : 1);
    const computedFullTitle = rawFullTitle || `${titleVal} #${issueVal}`;

    return {
      id: `imported-${Date.now()}-${idx}`,
      title: titleVal,
      issueNumber: issueVal,
      volume: volumeVal,
      seriesName: rawSeries || undefined,
      fullTitle: computedFullTitle,
      event: eventVal,
      copiesOwned: copiesOwnedVal,
      publisher: pubVal,
      publicationYear: yearVal,
      publicationMonth: monthVal,
      publicationDate: pubDateIdx >= 0 && row[pubDateIdx] ? String(row[pubDateIdx]).trim() : undefined,
      genre: genreVal,
      writer: writerVal,
      artist: artistVal,
      creatorContributions: [],
      characterAppearances: [],
      coverImage: imgIdx >= 0 && row[imgIdx] ? String(row[imgIdx]).trim() : 'https://drive.google.com/file/d/1xOiGBhYCrQZAacDNobEYqa1Ra2ZbwETE/view?usp=sharing',
      format: ['Single Issue', 'Trade Paperback', 'Hardcover', 'Omnibus', 'Graphic Novel'].includes(formatVal) ? formatVal : 'Single Issue',
      sizeThickness: thicknessVal > 0 ? thicknessVal : 1.0,
      currentBoxId: boxVal >= 0 ? boxVal : 0,
      proposedBoxId: proposedBoxVal >= 0 ? proposedBoxVal : 0,
      readingStatus: readingStatusVal,
      readCount: readingStatusVal === 'Read' ? 1 : 0,
      condition: 'Near Mint',
      estimatedValue: valNumber,
      purchasePrice: rawPrice,
      tags: ['Google Sheets Import', ...(eventVal ? [eventVal] : [])],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  // Import Comics tab only
  const handleImportComicsOnly = async () => {
    if (!subsheets.comics.isLoaded || subsheets.comics.rows.length === 0 || !comicMappings.titleCol) {
      setErrorMsg('Please ensure the Comics sheet is loaded and the Title column is mapped.');
      return;
    }
    setIsImportingComicsOnly(true);
    setErrorMsg(null);
    try {
      const headers = subsheets.comics.headers;
      const newComics = subsheets.comics.rows.map((row, idx) => buildComicFromRow(row, idx, headers));
      await onImportComics(newComics, importMode, true);
      if (onRefreshCollection) {
        await onRefreshCollection();
      }
    } catch (err: any) {
      console.error('Import comics error:', err);
      setErrorMsg(err.message || 'Failed to import comics');
    } finally {
      setIsImportingComicsOnly(false);
    }
  };

  // Execute Full Multi-Subsheet Sync to Database
  const handleSyncAllToDatabase = async () => {
    setIsSyncingAll(true);
    setErrorMsg(null);
    setSyncSuccess(null);

    try {
      // 1. Prepare creators
      const creatorsList = subsheets.creators.rows.map((row) => {
        const fnIdx = subsheets.creators.headers.indexOf(creatorsMappings.firstNameCol);
        const lnIdx = subsheets.creators.headers.indexOf(creatorsMappings.lastNameCol);
        const fullIdx = subsheets.creators.headers.indexOf(creatorsMappings.fullNameCol);

        const fullName = fullIdx >= 0 ? String(row[fullIdx] || '').trim() : '';
        const firstName = fnIdx >= 0 ? String(row[fnIdx] || '').trim() : '';
        const lastName = lnIdx >= 0 ? String(row[lnIdx] || '').trim() : '';

        return {
          firstName,
          lastName,
          fullName: fullName || (firstName && lastName ? `${firstName} ${lastName}` : ''),
        };
      }).filter(c => c.fullName);

      // 2. Prepare creator types
      const typesList = subsheets.creatorTypes.rows.map((row) => {
        const typeIdx = subsheets.creatorTypes.headers.indexOf(creatorTypesMappings.typeNameCol);
        return {
          typeName: typeIdx >= 0 ? String(row[typeIdx] || '').trim() : '',
        };
      }).filter(t => t.typeName);

      // 3. Prepare title contributors
      const contributorsList = subsheets.contributors.rows.map((row) => {
        const sIdx = subsheets.contributors.headers.indexOf(contributorsMappings.seriesNameCol);
        const fIdx = subsheets.contributors.headers.indexOf(contributorsMappings.fullTitleCol);
        const cIdx = subsheets.contributors.headers.indexOf(contributorsMappings.creatorFullNameCol);
        const tIdx = subsheets.contributors.headers.indexOf(contributorsMappings.creatorTypeCol);

        return {
          seriesName: sIdx >= 0 ? String(row[sIdx] || '').trim() : undefined,
          fullTitle: fIdx >= 0 ? String(row[fIdx] || '').trim() : '',
          creatorFullName: cIdx >= 0 ? String(row[cIdx] || '').trim() : '',
          creatorType: tIdx >= 0 ? String(row[tIdx] || '').trim() : 'Contributor',
        };
      }).filter(c => c.fullTitle && c.creatorFullName);

      // 4. Prepare character appearances
      const charactersList = subsheets.characterAppearances.rows.map((row) => {
        const sIdx = subsheets.characterAppearances.headers.indexOf(characterMappings.seriesNameCol);
        const fIdx = subsheets.characterAppearances.headers.indexOf(characterMappings.fullTitleCol);
        const cIdx = subsheets.characterAppearances.headers.indexOf(characterMappings.characterNameCol);
        const tIdx = subsheets.characterAppearances.headers.indexOf(characterMappings.appearanceTypeCol);

        return {
          seriesName: sIdx >= 0 ? String(row[sIdx] || '').trim() : undefined,
          fullTitle: fIdx >= 0 ? String(row[fIdx] || '').trim() : '',
          characterName: cIdx >= 0 ? String(row[cIdx] || '').trim() : '',
          appearanceType: tIdx >= 0 ? String(row[tIdx] || '').trim() : 'Supporting',
        };
      }).filter(a => a.fullTitle && a.characterName);

      // 5. Prepare series totals
      const seriesTotalsList = subsheets.seriesTotals.rows.map((row) => {
        const pIdx = subsheets.seriesTotals.headers.indexOf(seriesTotalsMappings.publisherCol);
        const sIdx = subsheets.seriesTotals.headers.indexOf(seriesTotalsMappings.seriesNameCol);
        const vIdx = subsheets.seriesTotals.headers.indexOf(seriesTotalsMappings.volumeCol);
        const cIdx = subsheets.seriesTotals.headers.indexOf(seriesTotalsMappings.issueCountCol);

        const seriesName = sIdx >= 0 ? String(row[sIdx] || '').trim() : '';
        const publisher = pIdx >= 0 ? String(row[pIdx] || '').trim() : undefined;
        const volume = vIdx >= 0 ? String(row[vIdx] || '').trim() : undefined;
        const issueCount = cIdx >= 0 ? parseInt(String(row[cIdx]).replace(/[^0-9]/g, ''), 10) || 0 : 0;

        return {
          publisher,
          seriesName,
          volume,
          issueCount,
        };
      }).filter(st => st.seriesName && st.issueCount > 0);

      // 6. If comics tab has data, import comics first and wait for Postgres commit
      let comicsImportedCount = 0;
      if (subsheets.comics.isLoaded && subsheets.comics.rows.length > 0 && comicMappings.titleCol) {
        const headers = subsheets.comics.headers;
        const newComics = subsheets.comics.rows.map((row, idx) => buildComicFromRow(row, idx, headers));

        // Await comics replacement in PostgreSQL so subsheets link can resolve comic_id
        await onImportComics(newComics, importMode, false);
        comicsImportedCount = newComics.length;
      }

      // 7. Send subsheets data to backend PostgreSQL endpoint (which links with comic_books in PostgreSQL!)
      const result = await importSubsheetsData({
        creators: creatorsList,
        creatorTypes: typesList,
        contributors: contributorsList,
        characterAppearances: charactersList,
        seriesTotals: seriesTotalsList,
        syncWithComics: true,
      });

      if (result.success) {
        // Refresh collection from PostgreSQL to load the newly linked creator_contributions and character_appearances
        if (onRefreshCollection) {
          await onRefreshCollection();
        }

        setSyncSuccess({
          creators: result.counts.creators,
          creatorTypes: result.counts.creatorTypes,
          contributors: result.counts.contributors,
          characterAppearances: result.counts.characterAppearances,
          seriesTotals: result.counts.seriesTotals,
          comicsUpdated: result.counts.comicsUpdated,
          comicsImported: comicsImportedCount,
        });
      }
    } catch (err: any) {
      console.error('Sync subsheets failed:', err);
      setErrorMsg(err.message || 'Database sync failed');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const hasAnyDataLoaded = Object.values(subsheets).some(s => s.isLoaded);

  return (
    <div className="space-y-6">
      
      {/* Top Banner Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-xl">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-slate-100 text-lg">Google Sheets Collection & Subsheets Sync</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Import and store Creators, Creator Types, Title Contributors, and Character Appearances directly into your PostgreSQL database.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadDemoData}
              className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Load Comprehensive Demo Subsheets</span>
            </button>
          </div>
        </div>

        {/* Input Form for Google Sheet ID / Tab Names */}
        <form onSubmit={handleFetchAllSubsheets} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Google Spreadsheet ID or Full URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500 shadow-xs placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 shrink-0 transition-colors cursor-pointer"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                <span>Fetch All Subsheets</span>
              </button>
            </div>
          </div>

          {/* Subsheet Tab Name Customizer */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Subsheets in your Google Spreadsheet:</span>
              </span>
              <span className="text-[11px] text-slate-400">Match the exact tab names in your Google Sheet</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">📚 Comics</label>
                <input
                  type="text"
                  value={tabNames.comics}
                  onChange={(e) => setTabNames({ ...tabNames, comics: e.target.value })}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">✍️ Creators</label>
                <input
                  type="text"
                  value={tabNames.creators}
                  onChange={(e) => setTabNames({ ...tabNames, creators: e.target.value })}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">🏷️ Creator Types</label>
                <input
                  type="text"
                  value={tabNames.creatorTypes}
                  onChange={(e) => setTabNames({ ...tabNames, creatorTypes: e.target.value })}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">🎨 Title Contributors</label>
                <input
                  type="text"
                  value={tabNames.contributors}
                  onChange={(e) => setTabNames({ ...tabNames, contributors: e.target.value })}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">🦸 Character Appearances</label>
                <input
                  type="text"
                  value={tabNames.characterAppearances}
                  onChange={(e) => setTabNames({ ...tabNames, characterAppearances: e.target.value })}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">📊 Series Issue Totals</label>
                <input
                  type="text"
                  value={tabNames.seriesTotals}
                  onChange={(e) => setTabNames({ ...tabNames, seriesTotals: e.target.value })}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}
        </form>

        {/* Sync Success Banner */}
        {syncSuccess && (
          <div className="mt-5 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">Successfully Synced & Linked Subsheets into PostgreSQL!</h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    All creators, creator types, title contributors, character appearances, and series issue totals are stored and linked to your collection.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSyncSuccess(null)}
                className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 font-bold cursor-pointer"
              >
                Dismiss
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60 text-xs">
              <div className="bg-white/80 dark:bg-slate-900/80 rounded-lg p-2 border border-emerald-200 dark:border-emerald-800">
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase">Creators</div>
                <div className="text-lg font-bold text-emerald-900 dark:text-emerald-100">{syncSuccess.creators ?? 0}</div>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/80 rounded-lg p-2 border border-emerald-200 dark:border-emerald-800">
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase">Creator Types</div>
                <div className="text-lg font-bold text-emerald-900 dark:text-emerald-100">{syncSuccess.creatorTypes ?? 0}</div>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/80 rounded-lg p-2 border border-emerald-200 dark:border-emerald-800">
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase">Title Contributors</div>
                <div className="text-lg font-bold text-emerald-900 dark:text-emerald-100">{syncSuccess.contributors ?? 0}</div>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/80 rounded-lg p-2 border border-emerald-200 dark:border-emerald-800">
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase">Character Appearances</div>
                <div className="text-lg font-bold text-emerald-900 dark:text-emerald-100">{syncSuccess.characterAppearances ?? 0}</div>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/80 rounded-lg p-2 border border-emerald-200 dark:border-emerald-800">
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase">Series Totals</div>
                <div className="text-lg font-bold text-emerald-900 dark:text-emerald-100">{syncSuccess.seriesTotals ?? 0}</div>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/80 rounded-lg p-2 border border-emerald-200 dark:border-emerald-800">
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase">Comics Linked</div>
                <div className="text-lg font-bold text-emerald-900 dark:text-emerald-100">{syncSuccess.comicsUpdated ?? 0}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              {onNavigateToTab && (
                <>
                  <button
                    onClick={() => onNavigateToTab('catalog')}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <span>View in Catalog</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onNavigateToTab('stats')}
                    className="px-3.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-slate-700 text-emerald-900 dark:text-emerald-300 text-xs font-bold rounded-lg border border-emerald-300 dark:border-emerald-700 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>View Creator Reports</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs & Action Bar */}
      {hasAnyDataLoaded && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() => setActiveSubsheet('overview')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubsheet === 'overview'
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Multi-Sheet Overview</span>
              </button>

              <button
                onClick={() => setActiveSubsheet('comics')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubsheet === 'comics'
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>📚 Comics ({subsheets.comics.rows.length})</span>
              </button>

              <button
                onClick={() => setActiveSubsheet('creators')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubsheet === 'creators'
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>✍️ Creators ({subsheets.creators.rows.length})</span>
              </button>

              <button
                onClick={() => setActiveSubsheet('creatorTypes')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubsheet === 'creatorTypes'
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>🏷️ Creator Types ({subsheets.creatorTypes.rows.length})</span>
              </button>

              <button
                onClick={() => setActiveSubsheet('contributors')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubsheet === 'contributors'
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>🎨 Contributors ({subsheets.contributors.rows.length})</span>
              </button>

              <button
                onClick={() => setActiveSubsheet('characterAppearances')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubsheet === 'characterAppearances'
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>🦸 Characters ({subsheets.characterAppearances.rows.length})</span>
              </button>

              <button
                onClick={() => setActiveSubsheet('seriesTotals')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubsheet === 'seriesTotals'
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>📊 Series Totals ({subsheets.seriesTotals.rows.length})</span>
              </button>
            </div>

            <button
              onClick={handleSyncAllToDatabase}
              disabled={isSyncingAll}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 shrink-0 transition-colors cursor-pointer"
            >
              {isSyncingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>Sync All Subsheets to Database</span>
            </button>
          </div>

          {/* TAB: Overview */}
          {activeSubsheet === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {/* Card 1: Comics */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span>📚</span> Comics Subsheet
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${subsheets.comics.isLoaded ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                      {subsheets.comics.isLoaded ? `${subsheets.comics.rows.length} rows` : 'Not loaded'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Main collection catalog with titles, issues, boxes, ratings, and values.
                  </p>
                  <button
                    onClick={() => setActiveSubsheet('comics')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 pt-1 cursor-pointer"
                  >
                    <span>View & Map Columns</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Card 2: Creators */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span>✍️</span> Creators Subsheet
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${subsheets.creators.isLoaded ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                      {subsheets.creators.isLoaded ? `${subsheets.creators.rows.length} creators` : 'Not loaded'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    First Name, Last Name, and Full Name of comic book creators.
                  </p>
                  <button
                    onClick={() => setActiveSubsheet('creators')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 pt-1 cursor-pointer"
                  >
                    <span>View & Map Columns</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Card 3: Creator Types */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span>🏷️</span> Creator Types Subsheet
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${subsheets.creatorTypes.isLoaded ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                      {subsheets.creatorTypes.isLoaded ? `${subsheets.creatorTypes.rows.length} types` : 'Not loaded'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Roles and types (Penciller, Inker, Editor, Writer, Cover Artist, etc.)
                  </p>
                  <button
                    onClick={() => setActiveSubsheet('creatorTypes')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 pt-1 cursor-pointer"
                  >
                    <span>View & Map Columns</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Card 4: Title Contributors */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span>🎨</span> Title Contributors Subsheet
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${subsheets.contributors.isLoaded ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                      {subsheets.contributors.isLoaded ? `${subsheets.contributors.rows.length} credits` : 'Not loaded'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Series Name, Full Title, Creator Full Name, and Creator Type.
                  </p>
                  <button
                    onClick={() => setActiveSubsheet('contributors')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 pt-1 cursor-pointer"
                  >
                    <span>View & Map Columns</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Card 5: Character Appearances */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span>🦸</span> Character Appearances Subsheet
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${subsheets.characterAppearances.isLoaded ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                      {subsheets.characterAppearances.isLoaded ? `${subsheets.characterAppearances.rows.length} appearances` : 'Not loaded'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Series Name, Full Title, Character Name, and Appearance Type.
                  </p>
                  <button
                    onClick={() => setActiveSubsheet('characterAppearances')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 pt-1 cursor-pointer"
                  >
                    <span>View & Map Columns</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Card 6: Series Issue Totals */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span>📊</span> Series Issue Totals
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${subsheets.seriesTotals.isLoaded ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                      {subsheets.seriesTotals.isLoaded ? `${subsheets.seriesTotals.rows.length} series` : 'Not loaded'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Publisher Name, Series Name, Volume, and total published Issue Count for Run Completion tracking.
                  </p>
                  <button
                    onClick={() => setActiveSubsheet('seriesTotals')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 pt-1 cursor-pointer"
                  >
                    <span>View & Map Columns</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>

              {/* Central Sync Callout */}
              <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-sm">Ready to save all subsheets into your PostgreSQL database?</h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    This writes to <code className="text-amber-300">creators</code>, <code className="text-amber-300">creator_types</code>, <code className="text-amber-300">title_contributors</code>, <code className="text-amber-300">title_character_appearances</code>, and <code className="text-amber-300">series_issue_totals</code>, and links every comic to its creators, characters, and run statistics!
                  </p>
                </div>
                <button
                  onClick={handleSyncAllToDatabase}
                  disabled={isSyncingAll}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-md flex items-center gap-2 shrink-0 transition-colors"
                >
                  {isSyncingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Save All to Database Now</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB: Creators Column Mapper & Preview */}
          {activeSubsheet === 'creators' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Map Creators Subsheet Columns</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">First Name, Last Name, and Full Name of comic book creators.</p>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">{subsheets.creators.rows.length} rows loaded</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">First Name Column</label>
                  <select
                    value={creatorsMappings.firstNameCol}
                    onChange={(e) => setCreatorsMappings({ ...creatorsMappings, firstNameCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / Not in sheet --</option>
                    {subsheets.creators.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Last Name Column</label>
                  <select
                    value={creatorsMappings.lastNameCol}
                    onChange={(e) => setCreatorsMappings({ ...creatorsMappings, lastNameCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / Not in sheet --</option>
                    {subsheets.creators.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Full Name Column *</label>
                  <select
                    value={creatorsMappings.fullNameCol}
                    onChange={(e) => setCreatorsMappings({ ...creatorsMappings, fullNameCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.creators.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Creators Preview Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span>Creators Preview (First 5 Rows)</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">Destination table: <code className="text-slate-800 dark:text-indigo-300">creators</code></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">First Name</th>
                        <th className="px-3 py-2">Last Name</th>
                        <th className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">Full Name</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {subsheets.creators.rows.slice(0, 5).map((row, idx) => {
                        const fnIdx = subsheets.creators.headers.indexOf(creatorsMappings.firstNameCol);
                        const lnIdx = subsheets.creators.headers.indexOf(creatorsMappings.lastNameCol);
                        const fullIdx = subsheets.creators.headers.indexOf(creatorsMappings.fullNameCol);
                        return (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-3 py-2 text-slate-400 dark:text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{fnIdx >= 0 ? row[fnIdx] : '-'}</td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{lnIdx >= 0 ? row[lnIdx] : '-'}</td>
                            <td className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">{fullIdx >= 0 ? row[fullIdx] : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Creator Types Column Mapper & Preview */}
          {activeSubsheet === 'creatorTypes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Map Creator Types Subsheet Columns</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Types and roles of Creators (Penciller, Inker, Editor, Writer, etc.)</p>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">{subsheets.creatorTypes.rows.length} rows loaded</span>
              </div>

              <div className="max-w-md">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Creator Type / Role Name Column *</label>
                <select
                  value={creatorTypesMappings.typeNameCol}
                  onChange={(e) => setCreatorTypesMappings({ typeNameCol: e.target.value })}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 font-bold"
                >
                  <option value="">-- Select Column --</option>
                  {subsheets.creatorTypes.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Creator Types Preview */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-w-lg">
                <div className="bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span>Creator Types Preview</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">Destination table: <code className="text-slate-800 dark:text-indigo-300">creator_types</code></span>
                </div>
                <div className="p-3 flex flex-wrap gap-2">
                  {subsheets.creatorTypes.rows.map((row, idx) => {
                    const idxCol = subsheets.creatorTypes.headers.indexOf(creatorTypesMappings.typeNameCol);
                    const val = idxCol >= 0 ? row[idxCol] : row[0];
                    return (
                      <span key={idx} className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-300 font-semibold text-xs">
                        {val}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB: Title Contributors Column Mapper & Preview */}
          {activeSubsheet === 'contributors' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Map Title Contributors Subsheet Columns</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Series Name, Full Title, Creator Full Name, and Creator Type.</p>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">{subsheets.contributors.rows.length} rows loaded</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Series Name Column</label>
                  <select
                    value={contributorsMappings.seriesNameCol}
                    onChange={(e) => setContributorsMappings({ ...contributorsMappings, seriesNameCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.contributors.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Full Title Column *</label>
                  <select
                    value={contributorsMappings.fullTitleCol}
                    onChange={(e) => setContributorsMappings({ ...contributorsMappings, fullTitleCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.contributors.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Creator Full Name Column *</label>
                  <select
                    value={contributorsMappings.creatorFullNameCol}
                    onChange={(e) => setContributorsMappings({ ...contributorsMappings, creatorFullNameCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.contributors.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Creator Type Column *</label>
                  <select
                    value={contributorsMappings.creatorTypeCol}
                    onChange={(e) => setContributorsMappings({ ...contributorsMappings, creatorTypeCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.contributors.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Title Contributors Preview Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span>Title Contributors Preview (First 5 Rows)</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">Destination table: <code className="text-slate-800 dark:text-indigo-300">title_contributors</code></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Series Name</th>
                        <th className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">Full Title</th>
                        <th className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">Creator Full Name</th>
                        <th className="px-3 py-2 font-bold text-indigo-700 dark:text-indigo-400">Creator Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {subsheets.contributors.rows.slice(0, 5).map((row, idx) => {
                        const sIdx = subsheets.contributors.headers.indexOf(contributorsMappings.seriesNameCol);
                        const fIdx = subsheets.contributors.headers.indexOf(contributorsMappings.fullTitleCol);
                        const cIdx = subsheets.contributors.headers.indexOf(contributorsMappings.creatorFullNameCol);
                        const tIdx = subsheets.contributors.headers.indexOf(contributorsMappings.creatorTypeCol);
                        return (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-3 py-2 text-slate-400 dark:text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{sIdx >= 0 ? row[sIdx] : '-'}</td>
                            <td className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">{fIdx >= 0 ? row[fIdx] : '-'}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-200">{cIdx >= 0 ? row[cIdx] : '-'}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 text-[11px]">
                                {tIdx >= 0 ? row[tIdx] : '-'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Character Appearances Column Mapper & Preview */}
          {activeSubsheet === 'characterAppearances' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Map Character Appearances Subsheet Columns</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Series Name, Full Title, Character Name, and Appearance Type (Main, Supporting, Cameo, etc.)</p>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">{subsheets.characterAppearances.rows.length} rows loaded</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Series Name Column</label>
                  <select
                    value={characterMappings.seriesNameCol}
                    onChange={(e) => setCharacterMappings({ ...characterMappings, seriesNameCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.characterAppearances.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Full Title Column *</label>
                  <select
                    value={characterMappings.fullTitleCol}
                    onChange={(e) => setCharacterMappings({ ...characterMappings, fullTitleCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.characterAppearances.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Character Name Column *</label>
                  <select
                    value={characterMappings.characterNameCol}
                    onChange={(e) => setCharacterMappings({ ...characterMappings, characterNameCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.characterAppearances.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Appearance Type Column *</label>
                  <select
                    value={characterMappings.appearanceTypeCol}
                    onChange={(e) => setCharacterMappings({ ...characterMappings, appearanceTypeCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.characterAppearances.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Character Appearances Preview Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span>Character Appearances Preview (First 5 Rows)</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">Destination table: <code className="text-slate-800 dark:text-indigo-300">title_character_appearances</code></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Series Name</th>
                        <th className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">Full Title</th>
                        <th className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">Character Name</th>
                        <th className="px-3 py-2 font-bold text-emerald-700 dark:text-emerald-400">Appearance Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {subsheets.characterAppearances.rows.slice(0, 5).map((row, idx) => {
                        const sIdx = subsheets.characterAppearances.headers.indexOf(characterMappings.seriesNameCol);
                        const fIdx = subsheets.characterAppearances.headers.indexOf(characterMappings.fullTitleCol);
                        const cIdx = subsheets.characterAppearances.headers.indexOf(characterMappings.characterNameCol);
                        const tIdx = subsheets.characterAppearances.headers.indexOf(characterMappings.appearanceTypeCol);
                        return (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-3 py-2 text-slate-400 dark:text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{sIdx >= 0 ? row[sIdx] : '-'}</td>
                            <td className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">{fIdx >= 0 ? row[fIdx] : '-'}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-200">{cIdx >= 0 ? row[cIdx] : '-'}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800 text-[11px]">
                                {tIdx >= 0 ? row[tIdx] : '-'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Series Issue Totals Column Mapper & Preview */}
          {activeSubsheet === 'seriesTotals' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Map Series Issue Totals Subsheet Columns</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Used for tracking Series Run Completion (% of total published issues owned)</p>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">{subsheets.seriesTotals.rows.length} rows loaded</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Publisher Name Column</label>
                  <select
                    value={seriesTotalsMappings.publisherCol}
                    onChange={(e) => setSeriesTotalsMappings({ ...seriesTotalsMappings, publisherCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.seriesTotals.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Series Name Column *</label>
                  <select
                    value={seriesTotalsMappings.seriesNameCol}
                    onChange={(e) => setSeriesTotalsMappings({ ...seriesTotalsMappings, seriesNameCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.seriesTotals.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Volume Column</label>
                  <select
                    value={seriesTotalsMappings.volumeCol}
                    onChange={(e) => setSeriesTotalsMappings({ ...seriesTotalsMappings, volumeCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.seriesTotals.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Issue Count Column *</label>
                  <select
                    value={seriesTotalsMappings.issueCountCol}
                    onChange={(e) => setSeriesTotalsMappings({ ...seriesTotalsMappings, issueCountCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.seriesTotals.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Series Issue Totals Preview Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span>Series Issue Totals Preview (First 5 Rows)</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">Destination table: <code className="text-slate-800 dark:text-indigo-300">series_issue_totals</code></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Publisher</th>
                        <th className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">Series Name</th>
                        <th className="px-3 py-2">Volume</th>
                        <th className="px-3 py-2 font-bold text-indigo-700 dark:text-indigo-400">Total Issue Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {subsheets.seriesTotals.rows.slice(0, 5).map((row, idx) => {
                        const pIdx = subsheets.seriesTotals.headers.indexOf(seriesTotalsMappings.publisherCol);
                        const sIdx = subsheets.seriesTotals.headers.indexOf(seriesTotalsMappings.seriesNameCol);
                        const vIdx = subsheets.seriesTotals.headers.indexOf(seriesTotalsMappings.volumeCol);
                        const cIdx = subsheets.seriesTotals.headers.indexOf(seriesTotalsMappings.issueCountCol);
                        return (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-3 py-2 text-slate-400 dark:text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{pIdx >= 0 ? row[pIdx] : '-'}</td>
                            <td className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">{sIdx >= 0 ? row[sIdx] : '-'}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{vIdx >= 0 ? row[vIdx] : '-'}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 text-[11px]">
                                {cIdx >= 0 ? `${row[cIdx]} issues` : '-'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Comics Collection Column Mapper */}
          {activeSubsheet === 'comics' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Map Comics Collection Columns</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Found {subsheets.comics.rows.length} comic entries in spreadsheet.</p>
                </div>
              </div>

              {/* Title Parsing Option */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="parseTitleOption"
                  checked={parseTitleOption}
                  onChange={(e) => setParseTitleOption(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-slate-800 cursor-pointer"
                />
                <label htmlFor="parseTitleOption" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <strong className="text-slate-900 dark:text-slate-100 font-bold">Automatically parse Issue # from "Full Title" column if unmapped</strong>
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 mb-1">Comic Title *</label>
                  <select
                    value={comicMappings.titleCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, titleCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Issue #</label>
                  <select
                    value={comicMappings.issueCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, issueCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Full Title</label>
                  <select
                    value={comicMappings.fullTitleCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, fullTitleCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / Auto-Built --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Series Name</label>
                  <select
                    value={comicMappings.seriesNameCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, seriesNameCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1">Storage Box # (Box) *</label>
                  <select
                    value={comicMappings.boxCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, boxCol: e.target.value })}
                    className="w-full bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-300 dark:border-indigo-700 rounded-lg px-2.5 py-1.5 text-xs text-indigo-950 dark:text-indigo-200 font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Proposed Box #</label>
                  <select
                    value={comicMappings.proposedBoxCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, proposedBoxCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Publisher</label>
                  <select
                    value={comicMappings.publisherCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, publisherCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Select Column --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Release Date</label>
                  <select
                    value={comicMappings.publicationDateCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, publicationDateCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">In Wish List Column</label>
                  <select
                    value={comicMappings.wishlistCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, wishlistCol: e.target.value })}
                    className="w-full bg-amber-50/50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">Marked Read Column</label>
                  <select
                    value={comicMappings.statusCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, statusCol: e.target.value })}
                    className="w-full bg-emerald-50/50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Copies Owned</label>
                  <select
                    value={comicMappings.copiesCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, copiesCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Media Format</label>
                  <select
                    value={comicMappings.formatCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, formatCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Price Paid</label>
                  <select
                    value={comicMappings.purchasePriceCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, purchasePriceCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Estimated Value</label>
                  <select
                    value={comicMappings.valueCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, valueCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Equivalent Size / Thickness</label>
                  <select
                    value={comicMappings.thicknessCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, thicknessCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Cover Image Link</label>
                  <select
                    value={comicMappings.imageCol}
                    onChange={(e) => setComicMappings({ ...comicMappings, imageCol: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Optional / None --</option>
                    {subsheets.comics.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Comics Preview Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span>Comics Preview (First 5 Rows with current column mapping)</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">Destination table: <code className="text-slate-800 dark:text-indigo-300">comic_books</code></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">Title</th>
                        <th className="px-3 py-2">Issue #</th>
                        <th className="px-3 py-2">Full Title</th>
                        <th className="px-3 py-2 font-bold text-indigo-700 dark:text-indigo-400">Box #</th>
                        <th className="px-3 py-2">Proposed Box</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Copies</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {subsheets.comics.rows.slice(0, 5).map((row, idx) => {
                        const comic = buildComicFromRow(row, idx, subsheets.comics.headers);
                        return (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-3 py-2 text-slate-400 dark:text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">{comic.title}</td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{comic.issueNumber}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{comic.fullTitle}</td>
                            <td className="px-3 py-2 font-bold">
                              {comic.currentBoxId > 0 ? (
                                <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-[11px]">
                                  Box {comic.currentBoxId}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[11px]">
                                  Unallocated (Box 0)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                              {comic.proposedBoxId > 0 ? `Box ${comic.proposedBoxId}` : '-'}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                comic.readingStatus === 'Wishlist'
                                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                                  : comic.readingStatus === 'Read'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}>
                                {comic.readingStatus}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{comic.copiesOwned}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Import Mode selection and Import Button */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Collection Import Mode:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-800 dark:text-slate-200">
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                    />
                    <span>Replace collection (Recommended on fresh sync)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-600 dark:text-slate-400">
                    <input
                      type="radio"
                      name="importMode"
                      value="append"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                    />
                    <span>Append to existing ({comicsCount} comics)</span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleImportComicsOnly}
                  disabled={isImportingComicsOnly || isSyncingAll}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 dark:disabled:text-slate-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 shrink-0 transition-colors cursor-pointer"
                >
                  {isImportingComicsOnly ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>Import Comics Only ({subsheets.comics.rows.length} rows)</span>
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Data Cleanup & Reset Card */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 rounded-xl shrink-0">
            <CopyX className="w-5 h-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Collection Data Cleanup & Duplicate Removal</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Remove exact duplicates from double-importing, manage box allocations, or reset back to the default collection.
            </p>
          </div>
        </div>

        {onOpenDataManagementModal && (
          <button
            onClick={onOpenDataManagementModal}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs rounded-xl shadow-xs shrink-0 flex items-center gap-2 border border-transparent dark:border-slate-700 cursor-pointer transition-colors"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Manage & Clean Collection Data</span>
          </button>
        )}
      </div>

    </div>
  );
};
