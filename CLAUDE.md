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
- `AI_PROVIDER` – AI model for chat assistant: `anthropic` (default) or `gemini`
- `ANTHROPIC_API_KEY` – Required for AI chat assistant when using Claude Sonnet 4.5 (default chat provider)
- `GEMINI_API_KEY` – Required for AI chat assistant when using Gemini Flash
- `AI_FUNCTION_PROVIDER` – AI model for AI() SQL function: `openai` (default) or `gemini`
- `AI_FUNCTION_MODEL` – Optional model override (defaults: `gpt-4o-mini` for OpenAI, `gemini-2.0-flash-exp` for Gemini)
- `OPENAI_API_KEY` – Required for AI() SQL function when using OpenAI (default)

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
- AI assistant uses Claude Sonnet 4.5 (default) or Gemini Flash with function/tool calling
- Highlights support layering (multiple colors for different values simultaneously)

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

### AI Integration

**Chat Assistant (Claude Sonnet 4.5 / Gemini Flash)**

When `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` is set:
- Chat panel sends user messages + selected cell context to local API
- API constructs prompt with sheet metadata (table names, column mappings)
- AI model can call seven tools:
  - `executeSheetSql` – Read-only queries (SELECT)
  - `mutateSheetSql` – Data mutations (UPDATE, INSERT, ALTER TABLE ADD COLUMN)
  - `deleteRows` – Delete rows by row numbers or SQL condition (row numbers stay consistent)
  - `highlights_add` – Highlight cells/ranges with colored overlays (supports layering)
  - `highlights_clear` – Remove all active highlights
  - `filter_add` – Hide rows that don't match SQL condition
  - `filter_clear` – Remove all active filters
- Tool calls are logged in `chat_messages.tool_calls` as JSON
- Assistant auto-retries on SQL errors with alternative approaches
- Conversation history persisted per spreadsheet (local API only)
- Highlights are client-side only (not persisted), cleared on page refresh
- Row deletion preserves row numbers (e.g., deleting row 7 shows 5, 6, 8)

**Sheet References:**
AI uses simple relative pointers in SQL that get automatically rewritten:
- `context.spreadsheet.sheets["Sheet Name"]` → actual table name
- `context.spreadsheet.sheets["sheet_slug"]` → actual table name
- Backend automatically substitutes complex table names (e.g., `sheet_<uuid>`)
- This avoids errors from manually typing complex identifiers

**Highlight Layering:**
Multiple highlights can coexist with different colors:
- Range-based: `highlights_add(range: "A1:B5", color: "yellow")`
- Value-based: `highlights_add(column: "grade", values: [28, 4], color: "green")`
- Claude automatically calls `highlights_add` multiple times for different colors
- Example: Green for highest grade, red for lowest grade in same view

**AI() SQL Function (OpenAI GPT-4o-mini / Gemini Flash)**

The `AI()` function enables AI-powered data processing directly in SQL queries:
- Default provider: OpenAI with `gpt-4o-mini` model (fast and cost-effective)
- Alternative: Gemini Flash via `AI_FUNCTION_PROVIDER=gemini`
- Supports structured outputs with boolean and enum schemas
- Usage examples:
  - `SELECT AI('Classify sentiment: ' || review) FROM reviews`
  - `SELECT AI('Is this spam?', 'boolean') FROM messages` (returns true/false)
  - `SELECT AI('Categorize: ' || text, '["urgent","normal","low"]') FROM tasks`
- Configured via environment variables:
  - `AI_FUNCTION_PROVIDER` – Provider selection (default: `openai`)
  - `AI_FUNCTION_MODEL` – Model override (default: `gpt-4o-mini` for OpenAI)
  - `OPENAI_API_KEY` – Required for OpenAI provider
  - `GEMINI_API_KEY` – Required for Gemini provider
- Includes retry logic, rate limiting, and comprehensive logging to `data/logs/`

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

### Testing AI Features Locally

**Chat Assistant:**
1. Ensure `ANTHROPIC_API_KEY` (recommended) or `GEMINI_API_KEY` is in `.env`
2. Optionally set `AI_PROVIDER=anthropic` or `AI_PROVIDER=gemini`
3. Restart `npm run server:watch`
4. Select cells in the spreadsheet UI
5. Ask the assistant to query, modify, or highlight data
6. Check `data/app.db` with `sqlite3 data/app.db` to verify changes
7. Logs are written to `data/logs/anthropic-*.log` or `data/logs/gemini-*.log`

**AI() SQL Function:**
1. Ensure `OPENAI_API_KEY` is in `.env` (or `GEMINI_API_KEY` with `AI_FUNCTION_PROVIDER=gemini`)
2. Optionally set `AI_FUNCTION_MODEL` to override default model
3. Restart `npm run server:watch`
4. Use the chat assistant to run queries with `AI()` function:
   - Example: "Run this query: SELECT AI('Summarize: ' || description) FROM products"
5. Function calls are logged to `data/logs/ai-function-*.log`

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

## Lessons Learned

### Chat Assistant: Claude Sonnet 4.5 vs Gemini Flash
- **Claude Sonnet 4.5** (default, recommended):
  - More reliable tool calling with fewer malformed calls
  - Better at autonomous error recovery (analyzes errors and adjusts strategy)
  - Automatically layers highlights without prompting (e.g., green + red for highest/lowest)
  - No special thinking budget needed for spreadsheet tasks
  - Cleaner conversation flow (10 iteration limit vs 4)

- **Gemini Flash**:
  - Requires MALFORMED_FUNCTION_CALL retry logic
  - More prone to table name construction errors (hyphens vs underscores)
  - Needs explicit escaping instructions in system prompt
  - Lower token limit can cause issues with complex parameters

### AI() Function: OpenAI vs Gemini
- **OpenAI GPT-4o-mini** (default, recommended for AI() function):
  - Extremely cost-effective: 15¢ per 1M input tokens, 60¢ per 1M output
  - Fast response times suitable for bulk data processing
  - Native JSON schema support for structured outputs (boolean, enum)
  - Reliable and consistent results
  - Simple API with straightforward error messages

- **Gemini Flash** (alternative for AI() function):
  - Free tier available for development/testing
  - Faster for some tasks but less predictable
  - More verbose responses require additional post-processing
  - JSON schema support via `responseMimeType` and `responseSchema`

### Tool Design Patterns
1. **Prefix consistency**: All related tools share a prefix (`highlights_add`, `highlights_clear`)
2. **Clear vs append**: When clear + add appear together, replace state instead of early return
3. **Validation order**: Check tool name before validating required params (avoid false errors)
4. **SQL rewriting**: Let AI use simple refs, rewrite complex identifiers server-side
5. **Layering support**: Array-based state enables multiple simultaneous operations

### Frontend State Management
- Use arrays for multi-item features (highlights, selections) to enable layering
- Process all tool calls in a batch before returning (avoid early exits)
- Check for "clear" operations but continue processing subsequent "add" operations
- Filter by sheetId when passing highlights to grid components

### Debugging AI Tools
- Log all requests/responses to separate files per provider
- Include iteration count, tool name, and full payloads
- Log both success and error cases for tool execution
- Use descriptive file names: `anthropic-request.log`, `anthropic-tool-call.log`, etc.

## Notes

- Bundle size warnings (>500 kB) can be ignored for now
- No test suite present; validate changes manually via UI + network inspection
- `nodemon` watches `server/`, `.env`, and `.mjs`/`.js`/`.json` files for autoreload
- Component tagger (`lovable-tagger`) runs in development mode only