# Tabulate My Cells - Complete Feature List

## Core Spreadsheet Features

### Cell Operations
- Editable grid cells with inline editing (double-click to edit)
- Cell selection (single cell, ranges, entire rows/columns, select all)
- Click and drag to select cell ranges
- Copy cells to clipboard (Cmd/Ctrl+C)
- Paste data from clipboard
- Delete cell contents (Delete or Backspace)
- Auto-clear empty rows when all cells are cleared
- Cell navigation with arrow keys, Tab, and Enter
- Auto-scroll to keep active cell visible

### Grid Interaction
- Column and row headers with labels (A, B, C... and 1, 2, 3...)
- Click column/row headers to select entire column/row
- Drag across headers to select multiple columns/rows
- Click corner cell (#) to select entire sheet
- Visual selection highlighting with blue borders
- Hover effects on headers and cells

### Resizing
- Manual column width adjustment (drag resize handle)
- Manual row height adjustment (drag resize handle)
- Auto-fit column width to content (double-click resize handle)
- Auto-fit row height to content (double-click resize handle)
- Per-sheet column widths and row heights persisted to database
- Virtual scrolling for large datasets (>100 rows)

### Fill Handle
- Excel-style fill handle (small square at bottom-right of selection)
- Drag fill handle to replicate values vertically or horizontally
- Smart pattern detection:
  - Simple uniform fills (single value replication)
  - Complex pattern fills with AI assistance
- Fill direction detection (locks to horizontal or vertical)
- Visual preview while dragging
- Hold Cmd/Ctrl to skip confirmation dialog
- Fill hint overlay shows keyboard shortcut

### Column & Row Management
- Add columns with + button in header
- Remove columns with - button (hover on header)
- Minimum 1 column requirement
- Add rows with + button at bottom of last row
- Dynamic row expansion
- Row numbers preserved even after deletion
- Column headers editable (double-click)
- Sanitized SQL column names from headers
- ALTER TABLE operations when renaming columns

## Multi-Sheet Support

- Multiple sheets per spreadsheet (tabs at bottom)
- Create new sheets
- Rename sheets (double-click tab)
- Delete sheets
- Switch between sheets with tab clicks
- Each sheet has independent:
  - Column headers
  - Cell data
  - Dimensions (rows/columns)
  - Column widths and row heights
  - Physical SQLite table (`sheet_<id>`)

## File Import/Export

### Import
- Multi-format support: CSV, Excel (.xlsx, .xls), ODS, TSV
- Multi-sheet Excel import (creates separate sheets)
- Automatic header detection (first row)
- Empty sheet skipping
- Batch import with toast notification
- File drag-and-drop support

### Export
- CSV export (current sheet)
- Excel export with multiple sheets
- Column headers included
- Downloads with filename pattern: `{spreadsheet-name}-{sheet-name}.{ext}`

## AI Assistant (Cello)

### Chat Interface
- Named character "Cello" with animated eyes that follow cursor
- Persistent chat history per spreadsheet (SQLite only)
- Real-time streaming responses (when using local backend)
- Markdown rendering in assistant messages
- Code syntax highlighting in chat
- Conversation timestamps
- Clear conversation history
- Context-aware responses based on selected cells
- Selection snapshot saved with user messages
- Tool call visualization in chat (shows SQL queries, highlights, filters)

### AI Providers
- **Claude Sonnet 4.5** (default, recommended)
  - More reliable tool calling
  - Better autonomous error recovery
  - 10 iteration limit
  - Automatic highlight layering
- **Gemini Flash** (alternative)
  - 4 iteration limit
  - Requires retry logic for malformed calls

### AI Tools (7 available)
1. **executeSheetSql** - Read-only SELECT queries
2. **mutateSheetSql** - Data mutations (UPDATE, INSERT, ALTER TABLE ADD COLUMN)
3. **deleteRows** - Delete by row numbers or SQL condition
4. **highlights_add** - Highlight cells with colors (supports layering)
5. **highlights_clear** - Remove all highlights
6. **filter_add** - Hide rows not matching SQL condition
7. **filter_clear** - Remove all filters

### AI() SQL Function
- In-query AI processing using OpenAI GPT-4o-mini (default) or Gemini Flash
- Use cases:
  - Sentiment analysis: `SELECT AI('Classify sentiment: ' || review) FROM reviews`
  - Boolean classification: `SELECT AI('Is this spam?', 'boolean') FROM messages`
  - Enum categorization: `SELECT AI('Categorize: ' || text, '["urgent","normal","low"]') FROM tasks`
- Structured outputs with schema support
- Retry logic and rate limiting
- Comprehensive logging to `data/logs/`

### Smart Sheet References
- AI uses simple references that get rewritten server-side:
  - `context.spreadsheet.sheets["Sheet Name"]` → actual table name
  - `context.spreadsheet.sheets["sheet_slug"]` → actual table name
- Automatic substitution of complex table identifiers
- Prevents UUID-based naming errors

## Cell Highlighting

- Multi-color support: yellow, red, green, blue, orange, purple
- Two highlight modes:
  - **Range-based**: A1 notation (e.g., "B2:D5")
  - **Value-based**: Column + values array for scattered highlights
- Layering support (multiple colors simultaneously)
- First-match wins for overlapping highlights
- Active highlights banner in chat panel
- Click highlight to scroll into view
- Clear all highlights button
- Client-side only (not persisted, clears on refresh)
- Row ID-based tracking for stable highlighting

## Filtering

- SQL-based row filtering
- Hide rows that don't match condition
- Active filters banner in chat panel
- Shows SQL condition in banner
- Clear all filters button
- Client-side filter management

## In-Cell AI Prompts

- Type `=` to enter AI prompt mode
- Visual indicator (purple border) on prompt cell
- Select range while in prompt mode (orange border shows range)
- Press Enter to execute prompt
- AI processes selected range and writes result to target cell
- Escape to cancel prompt mode
- Auto-focus on prompt input
- Keyboard input routing to prompt field

## Backend Architecture

### Local SQLite (Default)
- Single-file Express server (`server/index.mjs`)
- better-sqlite3 database
- Data stored in `data/app.db`
- Schema:
  - `spreadsheets` - Top-level metadata
  - `sheets` - Sheet metadata
  - `sheet_columns` - Column headers + SQL identifiers
  - `sheet_<sheet_id>` - Physical data tables with `row_number` column
  - `chat_messages` - Persisted chat history with tool calls
- Row 0 reserved for headers
- Data rows start at row 1
- Column operations alter actual SQL schema
- nodemon auto-reload on file changes

### Supabase Backend (Legacy)
- Optional cloud backend
- Enable with `VITE_USE_SUPABASE=true`
- Limited feature set (no column removal, no chat persistence)
- Uses Supabase edge function for AI chat
- Most new features don't work in this mode

## Data Persistence & Sync

- Auto-save on every cell edit
- Debounced updates to prevent excessive saves
- Timestamp tracking (`updated_at`) on spreadsheets and sheets
- React Query for caching and optimistic updates
- Real-time UI updates
- SQLite database file can be deleted to reset state

## UI Components & Design

### Tech Stack
- React 18 with TypeScript
- Vite for build/dev
- Tailwind CSS for styling
- shadcn/ui component library
- Radix UI primitives
- React Router for navigation

### Theming
- Dark/light mode support (next-themes)
- Custom color palette
- Responsive design
- Gradient accents

### Key Components
- `SpreadsheetGrid` - Main editable grid
- `Cell` - Individual cell with edit state
- `ChatPanel` - AI assistant interface
- `SheetTabs` - Sheet switcher
- `FileImport` - Import dialog
- `FollowEyesCharacter` - Animated Cello character
- `CoordinateDisplay` - Shows current cell position
- `KeyboardShortcuts` - Shortcut reference

## Performance Optimizations

- Virtual scrolling for datasets >100 rows (@tanstack/react-virtual)
- Memoized selection bounds calculations
- Pre-calculated highlight maps for O(1) lookup
- Row height signature tracking for efficient re-renders
- Coordinate-based selection for virtualized mode
- Auto-scroll with boundary detection
- Debounced cell updates
- Lazy loading of chat history

## Developer Features

### Logging
- Request/response logging per AI provider
- Separate log files: `anthropic-*.log`, `gemini-*.log`, `ai-function-*.log`
- Tool call execution logs
- Iteration tracking
- Error logging with full payloads

### Development Tools
- Hot module replacement
- ESLint configuration
- TypeScript strict mode
- Path aliases (`@/` → `src/`)
- Component tagging in dev mode (lovable-tagger)
- Source maps

### Environment Configuration
- `.env` file for configuration
- Variables:
  - `VITE_USE_SUPABASE` - Backend selection
  - `VITE_SQLITE_API_URL` - Local API URL
  - `AI_PROVIDER` - Chat AI (anthropic/gemini)
  - `ANTHROPIC_API_KEY` - Claude API key
  - `GEMINI_API_KEY` - Gemini API key
  - `AI_FUNCTION_PROVIDER` - AI() function provider
  - `AI_FUNCTION_MODEL` - Model override
  - `OPENAI_API_KEY` - OpenAI API key

## Keyboard Shortcuts

- Arrow keys: Navigate cells
- Tab: Move right
- Enter: Edit cell / move down
- Delete/Backspace: Clear cell contents
- Escape: Cancel edit / clear selection
- Cmd/Ctrl+C: Copy selection
- Shift+Arrow: Extend selection (when dragging)

## URL Routing

- `/` - Spreadsheet list (home)
- `/spreadsheet/:spreadsheetId` - Active spreadsheet editor
- `/demo` - Static demo page

## Quality of Life

- Toast notifications for user feedback
- Loading states during operations
- Error messages with helpful context
- Confirmation dialogs for destructive actions
- Tooltips on hover
- Disabled states when no spreadsheet open
- Welcome message from Cello
- Usage hints in chat input
- Auto-focus on input fields
- Smooth animations and transitions
- Bundle size: ~500+ kB (acceptable for dev)

## Data Formats

- UTF-8 text support
- Multi-line cell content
- Number formatting preserved on import
- Empty cell handling
- Null/undefined safety
- String conversion for all cell values

## Limitations & Notes

- No undo/redo
- No cell formulas (except AI prompts with `=`)
- No cell formatting (bold, italic, colors) - only highlighting
- No charts/graphs
- No collaborative editing
- No version history
- Chat history only works with local SQLite backend
- Highlights cleared on page refresh
- Filters are temporary
- No authentication/user management
- Single-user application

---

**Summary**: This is a comprehensive AI-powered spreadsheet application with advanced features like streaming chat, intelligent data manipulation via natural language, multi-sheet support, and flexible import/export capabilities - all backed by a local SQLite database for privacy and speed.
