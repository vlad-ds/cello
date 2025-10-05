# Cello

> **⚠️ Alpha Software**: Cello is currently in early development. Expect bugs, incomplete features, and breaking changes. This is a work in progress and needs significant polishing before it's ready for production use.

An AI-powered spreadsheet application that combines the familiarity of traditional spreadsheets with the power of SQL and AI assistance.

## Features

- **Spreadsheet Interface**: Familiar grid-based UI for editing cells, managing sheets, and organizing data
- **AI Assistant**: Chat with Claude Sonnet 4.5 or Gemini Flash to query, analyze, and manipulate your data
- **SQL Powered**: Each sheet is backed by a SQLite table, enabling powerful SQL queries and data operations
- **AI() SQL Function**: Process data with AI directly in SQL queries using OpenAI or Gemini
- **Smart Highlights**: Automatically highlight cells based on conditions or values
- **Excel Import/Export**: Import multi-sheet Excel files and export to CSV or Excel
- **Persistent Chat History**: Conversations with the AI assistant are saved per spreadsheet

## Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- React Router

**Backend:**
- Express
- SQLite (better-sqlite3)
- Claude Sonnet 4.5 / Gemini Flash (chat assistant)
- OpenAI GPT-4o-mini / Gemini Flash (AI() SQL function)

## Prerequisites

- Node.js (v18 or higher)
- npm

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd cello
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

   Add your API keys to `.env`:
   ```env
   # For AI chat assistant (choose one)
   ANTHROPIC_API_KEY=your_key_here
   # or
   GEMINI_API_KEY=your_key_here

   # For AI() SQL function (choose one)
   OPENAI_API_KEY=your_key_here
   # or use Gemini with AI_FUNCTION_PROVIDER=gemini
   ```

4. **Start the development servers**

   You need to run **two servers in parallel**:

   ```bash
   # Terminal 1: Start the backend API with auto-reload
   npm run server:watch

   # Terminal 2: Start the frontend dev server
   npm run dev
   ```

   The frontend will run on `http://localhost:8080`
   The backend API will run on `http://localhost:4000`

## Usage

### Creating and Editing Spreadsheets

1. Navigate to `http://localhost:8080`
2. Click "New Spreadsheet" to create a spreadsheet
3. Edit cells by clicking on them
4. Add/remove sheets using the sheet tabs at the bottom
5. Right-click column headers to rename or delete columns

### Using the AI Assistant

The AI assistant can help you query, analyze, and manipulate your data:

1. Select cells in your spreadsheet to provide context
2. Type your request in the chat panel on the right
3. The assistant can:
   - Run SQL queries to analyze data
   - Update, insert, or delete rows
   - Add new columns
   - Highlight cells based on conditions
   - Filter data
   - Explain trends and patterns

**Example prompts:**
- "What's the average revenue by month?"
- "Highlight all cells where revenue is above 10000"
- "Add a new column called 'profit_margin' calculated as (revenue - cost) / revenue"
- "Show me only rows where the status is 'active'"
- "Delete all rows where the quantity is 0"

### Using the AI() SQL Function

Process data with AI directly in SQL queries:

```sql
-- Classify sentiment
SELECT AI('Classify sentiment: ' || review) FROM reviews

-- Boolean checks
SELECT AI('Is this spam?', 'boolean') FROM messages

-- Categorize with enums
SELECT AI('Categorize: ' || text, '["urgent","normal","low"]') FROM tasks
```

Ask the AI assistant to run these queries for you.

## Architecture

### Data Model

- **Spreadsheets**: Top-level container
- **Sheets**: Individual tabs within a spreadsheet
- **Columns**: Headers and metadata tracked in `sheet_columns`
- **Rows**: Stored in per-sheet tables (`sheet_<sheet_id>`)

Row 0 is reserved for headers. Data rows start at row 1.

### AI Integration

**Chat Assistant** (Claude Sonnet 4.5 / Gemini Flash)
- Provides conversational interface for data operations
- Can execute SQL, manipulate data, and provide insights
- Supports tools: `executeSheetSql`, `mutateSheetSql`, `deleteRows`, `highlights_add`, `highlights_clear`, `filter_add`, `filter_clear`
- Conversations are persisted per spreadsheet

**AI() Function** (OpenAI GPT-4o-mini / Gemini Flash)
- Processes data using AI within SQL queries
- Supports boolean and enum schemas for structured outputs
- Ideal for classification, sentiment analysis, and categorization tasks

### Database

All data is stored in `data/app.db` (SQLite). To reset all state, delete this file.

Schema operations (adding/removing columns) modify the actual SQL schema, not just metadata.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_SQLITE_API_URL` | Backend API URL | `http://localhost:4000` |
| `AI_PROVIDER` | Chat assistant provider (`anthropic` or `gemini`) | `anthropic` |
| `ANTHROPIC_API_KEY` | API key for Claude Sonnet 4.5 | - |
| `GEMINI_API_KEY` | API key for Gemini Flash | - |
| `AI_FUNCTION_PROVIDER` | AI() function provider (`openai` or `gemini`) | `openai` |
| `AI_FUNCTION_MODEL` | Override default model for AI() function | `gpt-4o-mini` |
| `OPENAI_API_KEY` | API key for OpenAI | - |

### Recommended Configuration

For the best experience:
- **Chat Assistant**: Use Claude Sonnet 4.5 (`AI_PROVIDER=anthropic`)
  - More reliable tool calling
  - Better autonomous error recovery
  - Automatically layers highlights

- **AI() Function**: Use OpenAI GPT-4o-mini (`AI_FUNCTION_PROVIDER=openai`)
  - Extremely cost-effective (15¢ per 1M input tokens)
  - Fast and reliable for bulk data processing

## Development

### Available Scripts

```bash
npm run dev           # Start frontend dev server
npm run server        # Run backend API once
npm run server:watch  # Run backend with auto-reload
npm run build         # Production build
npm run build:dev     # Development build
npm run lint          # Run ESLint
```

### Project Structure

```
server/
  index.mjs                    # Express API + SQLite operations

src/
  integrations/
    database/                  # Data client abstraction
      sqliteClient.ts          # API client for local backend
      types.ts                 # Type definitions
  pages/
    SpreadsheetView.tsx        # Main spreadsheet editor
    SpreadsheetsList.tsx       # Spreadsheet list page
  components/
    SpreadsheetGrid.tsx        # Cell grid component
    ChatPanel.tsx              # AI assistant UI
    SheetTabs.tsx              # Sheet switcher
  hooks/
    useSpreadsheetSync.ts      # Cell synchronization logic
```

### Adding a New API Route

1. Add route handler in `server/index.mjs`
2. Update `src/integrations/database/sqliteClient.ts` to call it
3. Add types in `src/integrations/database/types.ts`
4. Restart `npm run server:watch`

## Debugging

### Chat Assistant Logs

Logs are written to `data/logs/`:
- `anthropic-*.log` - Claude Sonnet 4.5 requests/responses
- `gemini-*.log` - Gemini Flash requests/responses

### AI() Function Logs

Logs are written to `data/logs/ai-function-*.log`

### Inspecting the Database

```bash
sqlite3 data/app.db

# List all tables
.tables

# View spreadsheets
SELECT * FROM spreadsheets;

# View a sheet's data
SELECT * FROM sheet_<sheet_id>;
```

## Known Limitations

- No undo/redo functionality
- No collaborative editing
- No cell formatting (colors, fonts, etc.)
- No formulas (use SQL queries with the AI assistant instead)
- Highlights are client-side only and cleared on page refresh
- No automated tests

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or pull request if you'd like to help improve Cello.
