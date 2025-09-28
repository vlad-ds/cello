# AGENTS GUIDE

This repository runs a Vite + React + TypeScript frontend against two possible backends:

- **Default/local:** an Express + better-sqlite3 API located in `server/index.mjs`.
- **Optional remote:** Supabase services accessed through `src/integrations/supabase` (disabled unless `VITE_USE_SUPABASE=true`).

All Gemini/assistant features should work even when Supabase is disabled; the local API proxies calls to Gemini Flash and persists chat state in SQLite.

---

## Environment & Tooling

- Node 18+ (works with 22.x in this workspace).
- NPM is used as the package manager; `package-lock.json` is present.
- Frontend: Vite, React 18, TypeScript, Tailwind, shadcn/ui.
- Backend: Express 5 (`server/index.mjs`), better-sqlite3, nodemon for autoreload.
- AI helper uses Gemini API via `GEMINI_API_KEY`.

### Key Scripts

```bash
# install dependencies
npm install

# run frontend dev server (Vite)
npm run dev

# run local API once
npm run server

# run local API with autoreload (preferred)
npm run server:watch

# production build
npm run build
```

The API listens on `http://localhost:4000` by default. The UI expects that origin when `VITE_USE_SUPABASE` is false.

---

## Environment Variables

Sample values are in `.env.example`. Important keys:

- `VITE_SQLITE_API_URL` – origin of the local API (defaults to `http://localhost:4000`).
- `VITE_USE_SUPABASE` – set to `true` to bypass the local API and talk to Supabase directly.
- `GEMINI_API_KEY` – required for Gemini requests when using the local API. Place it in `.env` so `npm run server:watch` can read it.

When Supabase is enabled, the frontend falls back to existing Supabase edge functions (Gemini chat uses `supabase/functions/gemini-chat`).

---

## Backend Details (Local API)

**Location:** `server/index.mjs`

Schema (better-sqlite3, stored in `data/app.db` – ignored by git):

- `spreadsheets` – metadata (`id`, `name`, `created_at`, `updated_at`).
- `sheets` – sheet list tied to spreadsheets.
- `sheet_columns` – stores column metadata (headers + sanitized SQL identifiers).
- Each sheet has its own physical table (`sheet_<sheet_id>`) with columns `row_number` and one column per header.
- `chat_messages` – persisted chat history per spreadsheet, with `context_range` to track cell/range context used when prompting.

Key routes:

- `GET /spreadsheets` / `POST /spreadsheets`
- `GET /spreadsheets/:id` / `GET /spreadsheets/:id/sheets`
- `POST /spreadsheets/:id/sheets`
- `POST /sheets/:id/table` – ensure columns exist
- `POST /sheets/:id/cells` – edit headers/cells (row 0 = headers)
- `DELETE /sheets/:id/columns/:index` – drop a column (reindexes metadata)
- `GET /sheets/:id/table` – returns data rows + header row (row_number 0)
- `GET /spreadsheets/:id/chat` – list conversation history
- `POST /spreadsheets/:id/chat` – append a chat turn, call Gemini Flash (`gemini-flash-latest`), store assistant reply
- `DELETE /spreadsheets/:id/chat` – clear conversation for spreadsheet

Gemini requests append selected cell context and conversation history to each prompt. Failures roll back user entries where possible.

---

## Frontend Highlights

- Main routes in `src/main.tsx`:
  - `/` – `SpreadsheetsList`
  - `/spreadsheet/:spreadsheetId` – `SpreadsheetView`
  - `/demo` – static demo (`Index`)

- Data access goes through `src/integrations/database` which picks the correct client (SQLite vs Supabase) based on `VITE_USE_SUPABASE`.
- Spreadsheet editing uses `src/hooks/useSpreadsheetSync` for cell sync calls to the backend.
- Chat panel (`src/components/ChatPanel.tsx`):
  - Loads persisted history when the local API is active.
  - Renders assistant replies as sanitized Markdown (marked + DOMPurify).
  - Shows a “Clear Chat” button (local API only).
  - Displays “Agent read …” metadata when a request included selected cell context.

---

## Implementation Notes / Gotchas

- **Run server & UI in parallel** for default development (`npm run server:watch` + `npm run dev`). Without the API running you’ll see fetch failures for spreadsheets, chat, etc.
- SQLite data file lives at `data/app.db`. Delete it to reset state; it will be recreated automatically.
- Column operations:
  - Headers stored in `sheet_columns`; renaming a header alters the SQL column via `ALTER TABLE`.
  - Removing a column drops the column from the sheet table and reindexes metadata/selection.
- Row indexing:
  - Row `0` is reserved for headers.
  - UI displays rows starting at 1; backend stores data rows starting at 1 as well (after the header row).
- Supabase mode is legacy support:
  - Column removal, chat history, and local-only routes will throw helpful errors when `VITE_USE_SUPABASE=true`.
- Markdown rendering uses `marked` + `dompurify`; ensure both are imported only once in `ChatPanel.tsx` to avoid duplicate declaration errors.
- `npm run build` may warn about bundle size >500 kB; no action currently needed.

---

## Testing & Validation

- `npm run build` to ensure TypeScript + Vite compilation passes.
- No dedicated test suite present (no jest/cypress). Manual validation through UI + network requests.
- For backend changes, restart `npm run server:watch` after modifying `server/index.mjs` so nodemon restarts with new schema/routes.

---

## Common Tasks Cheat Sheet

- **Add new API route:** update `server/index.mjs`, restart `npm run server:watch`. Update data client (SQLite + Supabase stubs) and types.
- **Persist new spreadsheet data:** change schema; make sure to handle existing DB (add `ALTER TABLE` try/catch).
- **Access selected cell info in chat:** `selectedCells` object maps cell addresses (e.g., `A1`) to values. `getRangeValue` computes range label.
- **Clear chat history:** use the new button in `ChatPanel` or send `DELETE /spreadsheets/:id/chat` manually.

Keep AGENTS.md updated if workflow or commands change.
