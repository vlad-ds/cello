# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A spreadsheet application with AI assistance built with React + TypeScript + Vite (frontend) and Express + SQLite (backend). The app supports dual backends: a local SQLite API (default) or optional Supabase (legacy).

## Development Setup

### Running the Application

**Two servers must run in parallel for default development:**

```bash
# Terminal 1: Start the local SQLite API with autoreload
npm run server:watch

# Terminal 2: Start the frontend dev server
npm run dev
```

Frontend runs on `http://localhost:8080` (Vite)
Backend API runs on `http://localhost:4000` (Express)

### Other Commands

```bash
npm install           # Install dependencies
npm run server        # Run API once (no autoreload)
npm run build         # Production build
npm run build:dev     # Development build
npm run lint          # Run ESLint
```

## Backend Configuration

The backend is controlled by environment variables (`.env` file):

- `VITE_USE_SUPABASE` – Set to `true` to use Supabase instead of local SQLite. Default is false.
- `VITE_SQLITE_API_URL` – Local API origin (defaults to `http://localhost:4000`)
- `GEMINI_API_KEY` – Required for AI assistant features when using local API

**Important:** When using the local SQLite backend (default), the API must be running for the app to work. Without it, spreadsheet operations will fail.

## Architecture

### Backend (Local SQLite)

**Location:** `server/index.mjs`

Single-file Express server using better-sqlite3. Data stored in `data/app.db` (gitignored).

**Schema:**
- `spreadsheets` – Top-level spreadsheet metadata
- `sheets` – Individual sheets within spreadsheets
- `sheet_columns` – Column metadata (headers + sanitized SQL identifiers)
- `sheet_<sheet_id>` – Physical table per sheet with `row_number` column + dynamic columns
- `chat_messages` – Persisted chat history with tool call tracking

**Key Operations:**
- Row 0 is reserved for headers (stored in `sheet_columns` table)
- Data rows start at row 1
- Column headers drive SQL column names (sanitized as `sql_name`)
- Renaming headers triggers `ALTER TABLE ... RENAME COLUMN`
- Removing columns drops the SQL column and reindexes metadata
- AI assistant uses Gemini Flash with function calling (SQL query/mutation tools)

### Frontend

**Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router

**Main Routes** (`src/main.tsx`):
- `/` – Spreadsheet list (`SpreadsheetsList`)
- `/spreadsheet/:spreadsheetId` – Active spreadsheet editor (`SpreadsheetView`)
- `/demo` – Static demo page (`Index`)

**Data Access:**
- `src/integrations/database/` – Abstraction layer that switches between SQLite and Supabase based on `VITE_USE_SUPABASE`
- `sqliteClient.ts` – Calls local API via fetch
- `supabaseClient.ts` – Calls Supabase directly (legacy support)
- `useSpreadsheetSync` hook – Manages cell editing and table creation

**Key Components:**
- `SpreadsheetView` – Main editor container with sheet tabs and chat panel
- `SpreadsheetGrid` – Editable cell grid
- `ChatPanel` – AI assistant with persisted conversation history (SQLite only), renders markdown responses
- `SheetTabs` – Sheet switcher

### AI Assistant (Gemini Integration)

When `GEMINI_API_KEY` is set:
- Chat panel sends user messages + selected cell context to local API
- API constructs prompt with sheet metadata (table names, column mappings)
- Gemini model can call two functions:
  - `executeSheetSql` – Read-only queries (SELECT)
  - `mutateSheetSql` – Data mutations (UPDATE, INSERT, ALTER TABLE ADD COLUMN)
- Tool calls are logged in `chat_messages.tool_calls` as JSON
- Assistant auto-retries on SQL errors with alternative approaches
- Conversation history persisted per spreadsheet (local API only)

**Sheet References:**
AI can reference sheets via:
- Sheet ID directly
- `context.spreadsheet.sheets["Sheet Name"]`
- `context.spreadsheet.sheets["sheet_slug"]` (normalized name)

## Important Implementation Details

### Data Persistence
- SQLite database file: `data/app.db` (delete to reset all state)
- Column operations alter actual SQL schema, not just metadata
- Empty rows are automatically deleted when all cells are cleared

### Backend vs. Supabase Mode
When `VITE_USE_SUPABASE=true`:
- Column removal, chat history, and local-only routes throw helpful errors
- AI chat uses Supabase edge function `supabase/functions/gemini-chat`
- Most new features (SQL tools, conversation persistence) won't work

### Markdown Rendering
`ChatPanel` uses `marked` + `DOMPurify` for assistant responses. Import both only once to avoid duplicate declarations.

### Path Aliases
`@/` maps to `src/` (configured in `vite.config.ts` and `tsconfig.json`)

## Common Tasks

### Adding a New API Route
1. Add route handler in `server/index.mjs`
2. Update `src/integrations/database/sqliteClient.ts` to call it
3. Add stub implementation in `src/integrations/database/supabaseClient.ts` (if applicable)
4. Update types in `src/integrations/database/types.ts`
5. Restart `npm run server:watch`

### Schema Changes
- Add migration logic in `server/index.mjs` after table creation
- Wrap schema changes in try/catch (columns may already exist)
- Touch spreadsheet/sheet timestamps when modifying data

### Testing SQL Tools Locally
1. Ensure `GEMINI_API_KEY` is in `.env`
2. Restart `npm run server:watch`
3. Select cells in the spreadsheet UI
4. Ask the assistant to query or modify data
5. Check `data/app.db` with `sqlite3 data/app.db` to verify changes

## Project Structure

```
server/
  index.mjs              # Express API + SQLite operations
src/
  integrations/
    database/            # Data client abstraction (SQLite vs Supabase)
  pages/
    SpreadsheetView.tsx  # Main editor
    SpreadsheetsList.tsx # Home page
  components/
    SpreadsheetGrid.tsx  # Cell grid
    ChatPanel.tsx        # AI assistant UI
    SheetTabs.tsx        # Sheet switcher
  hooks/
    useSpreadsheetSync.ts # Cell sync logic
```

## Notes

- Bundle size warnings (>500 kB) can be ignored for now
- No test suite present; validate changes manually via UI + network inspection
- `nodemon` watches `server/`, `.env`, and `.mjs`/`.js`/`.json` files for autoreload
- Component tagger (`lovable-tagger`) runs in development mode only