import React, { useState } from 'react';
import { ComicBook, StorageBox, SeriesIssueTotal } from '../types';
import { 
  Database, 
  Download, 
  Terminal, 
  Copy, 
  Check, 
  Server, 
  Smartphone, 
  Monitor, 
  Layers, 
  Code2, 
  FileCode 
} from 'lucide-react';

interface DatabasePlannerProps {
  comics: ComicBook[];
  boxes: StorageBox[];
  seriesTotals?: SeriesIssueTotal[];
}

export const DatabasePlanner: React.FC<DatabasePlannerProps> = ({ comics, boxes, seriesTotals = [] }) => {
  const [selectedDialect, setSelectedDialect] = useState<'sqlite' | 'postgres'>('sqlite');
  const [generatedSql, setGeneratedSql] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'schema' | 'sql' | 'python_script' | 'desktop_tech'>('desktop_tech');

  // Fetch or generate SQL from server
  const handleGenerateSql = async (dialect: 'sqlite' | 'postgres') => {
    setSelectedDialect(dialect);
    setIsExporting(true);

    try {
      const response = await fetch('/api/export-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comics,
          boxes,
          seriesTotals,
          dialect,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setGeneratedSql(data.sql);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(generatedSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSqlFile = () => {
    const blob = new Blob([generatedSql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comic_vault_${selectedDialect}_schema.sql`;
    a.click();
  };

  const pythonImportScript = `import sqlite3
import pandas as pd

# Python script to import 'Comic Book Collection' Google Sheet into local SQLite/PostgreSQL Database
# Setup SQLite connection
conn = sqlite3.connect('comic_vault.db')
cursor = conn.cursor()

# 1. Storage Boxes Table
cursor.execute('''
CREATE TABLE IF NOT EXISTS storage_boxes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    max_capacity REAL NOT NULL
)
''')

# 2. Comic Books Table
cursor.execute('''
CREATE TABLE IF NOT EXISTS comic_books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    issue_number TEXT NOT NULL,
    volume TEXT,
    event TEXT,
    copies_owned INTEGER DEFAULT 1,
    publisher TEXT NOT NULL,
    publication_year INTEGER,
    publication_month TEXT,
    publication_date TEXT,
    genre TEXT,
    writer TEXT,
    artist TEXT,
    format TEXT NOT NULL,
    size_thickness REAL DEFAULT 1.0,
    current_box_id INTEGER,
    reading_status TEXT DEFAULT 'Unread',
    estimated_value REAL,
    purchase_price REAL
)
''')

# 3. Creators Table (for storing creator names and bios)
cursor.execute('''
CREATE TABLE IF NOT EXISTS creators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
''')

# 4. Creator Types Table (roles: writer, penciler, inker, letterer, colorist, assistant editor, editor, editor-in-chief, cover penciler, cover inker, cover letterer, cover colorer)
cursor.execute('''
CREATE TABLE IF NOT EXISTS creator_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_name TEXT NOT NULL UNIQUE
)
''')

roles = [
    'writer', 'penciler', 'inker', 'letterer', 'colorist', 
    'assistant editor', 'editor', 'editor-in-chief', 
    'cover penciler', 'cover inker', 'cover letterer', 'cover colorer'
]
for role in roles:
    cursor.execute("INSERT OR IGNORE INTO creator_types (role_name) VALUES (?)", (role,))

# 5. Comic Creator Contributions Table (Title, Creator, Creator Type mapping)
cursor.execute('''
CREATE TABLE IF NOT EXISTS comic_creator_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comic_id TEXT REFERENCES comic_books(id),
    title TEXT NOT NULL,
    creator_id INTEGER REFERENCES creators(id),
    creator_name TEXT NOT NULL,
    creator_type_id INTEGER REFERENCES creator_types(id),
    role_name TEXT NOT NULL
)
''')

# 6. Series Issue Totals Table (Series Run Completion Tracker)
cursor.execute('''
CREATE TABLE IF NOT EXISTS series_issue_totals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publisher TEXT,
    series_name TEXT NOT NULL,
    volume TEXT,
    issue_count INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (series_name, volume)
)
''')

print("Comic Vault Database Schema created successfully in comic_vault.db with Creators, Characters & Series Totals!")
conn.commit()
conn.close()
`;

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
          <div className="p-3 bg-amber-950 border border-amber-800 text-amber-400 rounded-xl">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-extrabold text-slate-100 text-lg">
              Database Schema & Desktop/Mobile Architecture Planner
            </h2>
            <p className="text-xs text-slate-400">
              Relational DDL schema, Google Sheets Python import script, and local Desktop + Android sync recommendations.
            </p>
          </div>
        </div>

        {/* Sub Navigation */}
        <div className="flex items-center gap-2 pt-4 border-b border-slate-800 overflow-x-auto">
          <button
            onClick={() => setActiveTab('desktop_tech')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'desktop_tech'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Recommended Tech Stack
          </button>

          <button
            onClick={() => {
              setActiveTab('sql');
              if (!generatedSql) handleGenerateSql('sqlite');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'sql'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Export SQL DDL & Data Script
          </button>

          <button
            onClick={() => setActiveTab('python_script')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'python_script'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Python Import Script
          </button>
        </div>
      </div>

      {/* Tab 1: Recommended Tech Stack */}
      {activeTab === 'desktop_tech' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center">
              <Monitor className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-slate-100 text-base">Desktop App Architecture</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>Tauri v2 / Electron + React 19:</strong> Lightweight desktop wrapper that bundles this Web UI as a standalone <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-300">.exe</code> (Windows) or <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-300">.app</code> (Mac) using under 50MB RAM.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-slate-100 text-base">Android Mobile Sync</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>Capacitor / Progressive Web App (PWA):</strong> Package the React frontend into an Android <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-300">.apk</code> file with full camera access for cover scanning and offline local database sync!
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-purple-950 text-purple-400 border border-purple-800 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-slate-100 text-base">Relational Database Engine</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>SQLite / PostgreSQL:</strong> Use zero-configuration SQLite for local desktop single file storage (<code className="bg-slate-950 px-1 py-0.5 rounded text-amber-300">comics.db</code>), or Cloud SQL / PostgreSQL for instant multi-device sync across Desktop & Android phone.
            </p>
          </div>

        </div>
      )}

      {/* Tab 2: SQL Export */}
      {activeTab === 'sql' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">Target Database Dialect:</span>
              <button
                onClick={() => handleGenerateSql('sqlite')}
                className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                  selectedDialect === 'sqlite'
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                SQLite
              </button>
              <button
                onClick={() => handleGenerateSql('postgres')}
                className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                  selectedDialect === 'postgres'
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                PostgreSQL
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopySql}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-700"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied SQL!' : 'Copy SQL'}</span>
              </button>

              <button
                onClick={handleDownloadSqlFile}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .SQL File</span>
              </button>
            </div>
          </div>

          <pre className="bg-slate-950 p-4 rounded-xl text-xs font-mono text-emerald-400 max-h-96 overflow-y-auto border border-slate-800/80 leading-relaxed scrollbar-thin">
            {generatedSql || '-- Click generate above to build SQL DDL script'}
          </pre>
        </div>
      )}

      {/* Tab 3: Python Script */}
      {activeTab === 'python_script' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Python Desktop Google Sheets Import Script</span>
            </h3>
            <button
              onClick={() => {
                navigator.clipboard.writeText(pythonImportScript);
                alert('Copied Python Script!');
              }}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" /> Copy Script
            </button>
          </div>

          <p className="text-xs text-slate-400">
            Run this Python script on your local computer to convert your Google Sheet directly into a local <code className="text-amber-300">comic_vault.db</code> SQLite database file.
          </p>

          <pre className="bg-slate-950 p-4 rounded-xl text-xs font-mono text-slate-200 max-h-80 overflow-y-auto border border-slate-800/80 leading-relaxed">
            {pythonImportScript}
          </pre>
        </div>
      )}

    </div>
  );
};
