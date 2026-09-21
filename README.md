# 📦 Comic Vault Box Manager

> **A modern, collector-grade comic book cataloging, physical storage logistics, and interactive 3D box management system.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-AI_Scanner-8E75B2?logo=google&logoColor=white)](https://ai.google.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-E2E_Tested-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)

---

## 📖 Overview

**Comic Vault Box Manager** bridges the gap between digital cataloging and physical storage logistics. Designed specifically for comic book collectors, it tracks not just issue metadata, condition, and market value, but physical box allocations: which short or long box an issue is located in, capacity limits, shelf locations, spine thicknesses, divider organization, and reading progress.

Featuring an **interactive 3D box visualizer**, a **multi-subsheet Google Sheets relational importer**, **Google Drive cover integration**, **Gemini AI cover recognition**, and a complete **Dark / Light mode** theme, Comic Vault Box Manager provides an end-to-end command center for your collection.

---

## ✨ Key Features

### 📦 Physical Box & Shelf Logistics
- **Box Types**: Organize short boxes, long boxes, and magazine boxes with custom dimension and capacity thresholds.
- **Capacity Tracking**: Real-time progress bars with warning states for approaching or exceeded capacity.
- **Storage Location Tagging**: Group boxes by room, shelf, closet, or storage unit.
- **Box Inspector & Reallocations**: Inspect every comic in a box, reallocate individual issues or entire runs, and adjust box sorting orders.

### 🕹️ Interactive 3D Box Visualizer
- **WebGL 3D Rendering**: Built with Three.js and OrbitControls for full 360° rotation, pan, and zoom.
- **Realistic Spine Thicknesses**: Comics render with realistic relative thicknesses, backboards, and divider tabs.
- **Dynamic Lighting & Theme Adaptation**: Adapts scene background and lighting dynamically between Light (`0xf1f5f9`) and Dark (`0x0f172a`) modes.
- **Camera Presets**: Quick camera snapping (Top-Down, Front, Isometric, and Reset).
- **Interactive Drawer**: Click any comic in the 3D box to inspect its metadata, cover art, and creator details.

### 📚 Catalog & Collection Management
- **Dual View Modes**:
  - **Cover Grid View**: Visual cover wall with condition tags, reading status badges, and storage box indicators.
  - **Table View**: High-density tabular view with sortable columns and quick-action menus.
- **Multi-Facet Filtering**: Filter instantly by Publisher, Era, Box #, Reading Status (Unread, Reading, Read, Wishlist), and Condition.
- **Multi-Criteria Sorting**: Sort by Title, Issue #, Box ID, Market Value, or Publication Date.
- **Detailed Comic Inspector**: Cover zoom, quick-edit panel, creator contribution tags, character appearance badges, valuation, and notes.

### 📊 Reading Analytics & Milestone Achievements
- **Overview Metrics**: Total issues, total boxes, reading completion percentage, and estimated collection value.
- **Storyline & Event Tracker**: Track progress across major crossover events (e.g., *Secret Wars*, *Infinity Gauntlet*, *Civil War*).
- **Series Completion Progress**: Monitor completion bars across ongoing and limited series.
- **Creators & Characters Spotlight**: Deep breakdowns of top writers, pencilers, inkers, colorists, and character appearances with interactive detail drawers.
- **100% Achievements & Badges**: Unlock badges for milestone achievements (e.g., century milestones, full runs, pristine preservation).

### 🔄 Multi-Subsheet Google Sheets Importer
- **Multi-Sheet Relational Sync**: Imports and links 5 distinct spreadsheet tabs into PostgreSQL:
  1. **Comics**: Main issue catalog (`comic_books`)
  2. **Creators**: Master creator roster (`creators`)
  3. **Creator Types**: Roles such as Writer, Penciller, Inker, Colorist, Editor (`creator_types`)
  4. **Title Contributors**: Comic-to-creator mappings with role attribution (`title_contributors`)
  5. **Character Appearances**: Character appearances categorized as Main, Supporting, or Cameo (`title_character_appearances`)
- **Interactive Column Mappers**: Visual dropdown mappers with 5-row live previews before executing imports.
- **Intelligent Title Parser**: Automatically detects and extracts issue numbers from composite title strings.
- **Import Modes**: Choose between *Replace Collection* (clean sync) or *Append to Existing*.
- **Data Cleanup & Deduplication**: Built-in duplicate detection and collection reset tools.

### 🤖 AI Cover Scanner & Google Drive Integration
- **Gemini AI Cover Scanner**: Upload a photo or scan of a comic cover to automatically extract Title, Issue #, Publisher, and Year using Google Gemini.
- **Barcode / UPC Lookup**: Rapid barcode entry for automated issue discovery.
- **Google Drive Cover Sync**: Connect your Google Drive to sync high-resolution cover scans directly into your catalog without manual uploads.

### 🌓 Dark Mode / Light Mode Theming
- **Accessible & Instant**: Toggle between Dark Mode and Light Mode via the Navbar button.
- **Persistent**: Remembers your preference in `localStorage` with fallback to system `prefers-color-scheme`.
- **Comprehensive Coverage**: 100% coverage across every card, modal, chart, table, and 3D WebGL scene.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| **Build & Tooling** | [Vite 6](https://vitejs.dev/) + [esbuild](https://esbuild.github.io/) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) + [Lucide React](https://lucide.dev/) |
| **3D Graphics** | [Three.js](https://threejs.org/) (WebGL, OrbitControls) |
| **Charts & Analytics** | [Recharts](https://recharts.org/) |
| **Backend Server** | [Express.js](https://expressjs.com/) (Node.js) |
| **Database** | [PostgreSQL](https://www.postgresql.org/) (`pg` connection pool) |
| **AI Vision** | [Google GenAI SDK](https://ai.google.dev/) (Gemini API) |
| **Cloud APIs** | [Google Drive API](https://developers.google.com/drive) via `googleapis` |
| **E2E Testing** | [Playwright](https://playwright.dev/) |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **PostgreSQL**: v14.x or higher (local or hosted, e.g., Supabase, Neon)

---

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/duketoma/comic-vault-box-manager.git
   cd comic-vault-box-manager
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up PostgreSQL Database:**
   Create a local database named `comic_vault` and run the migrations in order:

   ```bash
   createdb comic_vault
   psql -d comic_vault -f db/migrations/001_initial_schema.sql
   psql -d comic_vault -f db/migrations/002_creators_and_characters.sql
   ```

4. **Configure Environment Variables:**
   Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and set your credentials:
   ```env
   # PostgreSQL connection string
   DATABASE_URL=postgres://postgres:password@localhost:5432/comic_vault

   # Optional: set to true if using TLS connection
   # DATABASE_SSL=true

   # Required only for Gemini AI cover scanning
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

5. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🗄️ Database Schema Overview

The application utilizes a normalized relational schema in PostgreSQL:

```mermaid
erDiagram
    boxes ||--o{ comic_books : "stores"
    comic_books ||--o{ title_contributors : "has"
    creators ||--o{ title_contributors : "contributes"
    creator_types ||--o{ title_contributors : "classifies"
    comic_books ||--o{ title_character_appearances : "features"

    boxes {
        int id PK
        string name
        string box_number
        int capacity
        string location
        string notes
    }

    comic_books {
        int id PK
        string title
        string issue_number
        string series_name
        string full_title
        string publisher
        int publication_year
        int current_box_id FK
        int proposed_box_id
        string reading_status
        decimal estimated_value
        decimal purchase_price
        string cover_image
    }

    creators {
        int id PK
        string first_name
        string last_name
        string full_name
    }

    creator_types {
        int id PK
        string type_name
    }

    title_contributors {
        int id PK
        int comic_id FK
        int creator_id FK
        int creator_type_id FK
    }

    title_character_appearances {
        int id PK
        int comic_id FK
        string character_name
        string appearance_type
    }
```

---

## 🧪 Testing

End-to-end tests are implemented using [Playwright](https://playwright.dev/):

```bash
# Run all E2E tests headlessly
npm run test:e2e

# Run tests in headed browser mode
npm run test:e2e:headed

# View the test report
npm run test:e2e:report
```

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Runs the Express backend and Vite frontend with hot reload (`tsx watch server.ts`) |
| `npm run build` | Compiles frontend assets with Vite and bundles the server with esbuild |
| `npm run start` | Runs the production server (`node dist/server.cjs`) |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) |
| `npm run test:e2e` | Executes Playwright end-to-end test suite |
| `npm run import:collection` | Runs the standalone CSV collection import utility |

---

## 📁 Project Structure

```
comic-vault-box-manager/
├── db/
│   └── migrations/
│       ├── 001_initial_schema.sql           # Core tables (boxes, comic_books)
│       └── 002_creators_and_characters.sql   # Relational tables (creators, roles, characters)
├── e2e/
│   └── example.spec.ts                     # Playwright E2E test specs
├── scripts/
│   └── import-comic-csv.mjs                # Standalone CSV import script
├── src/
│   ├── components/
│   │   ├── AddAndScanModal.tsx             # AI cover scanner & manual entry modal
│   │   ├── Box3DVisualizer.tsx             # Three.js 3D WebGL comic box component
│   │   ├── Box3DVisualizerModal.tsx        # Fullscreen 3D visualizer modal wrapper
│   │   ├── BoxManager.tsx                  # Box shelf grid, capacity meters, box drawer
│   │   ├── CollectionCatalog.tsx           # Grid/Table catalog, filters, search
│   │   ├── ComicDetailModal.tsx            # Comic issue inspector and editor
│   │   ├── ComicDetailPanel.tsx            # 3D visualizer side-drawer detail inspector
│   │   ├── DataManagementModal.tsx         # Data cleanup & deduplication tools
│   │   ├── GoogleDriveCoversModal.tsx      # Google Drive OAuth & cover file sync
│   │   ├── GoogleSheetsImporter.tsx        # Multi-tab spreadsheet mapping & sync
│   │   ├── Navbar.tsx                      # Top nav bar with Dark Mode toggle
│   │   └── ReadingStats.tsx                # Analytics, events, creators spotlight
│   ├── utils/
│   │   ├── three-scene.ts                  # Three.js scene lifecycle & theme lighting
│   │   ├── three-textures.ts               # Texture generation for spines and covers
│   │   └── titleParser.ts                  # Intelligent title & issue number parsing
│   ├── App.tsx                             # Main application controller & theme provider
│   ├── index.css                           # Tailwind CSS v4 custom variant & styles
│   └── main.tsx                            # React root entry point
├── server.ts                               # Express backend API & Vite SSR handler
├── package.json                            # Node.js project manifest & scripts
└── .env.example                            # Template for environment variables
```

---

## 📄 License

This project is private and maintained for personal comic book collection management.
