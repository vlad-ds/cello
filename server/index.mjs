import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '..', 'data');
const logsDir = path.join(dataDir, 'logs');
const dbPath = path.join(dataDir, 'app.db');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });

// Logger utility
const logToFile = (category, data) => {
  const timestamp = new Date().toISOString();
  const logFile = path.join(logsDir, `${category}.log`);
  const logEntry = `\n========== ${timestamp} ==========\n${
    typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  }\n`;

  try {
    fs.appendFileSync(logFile, logEntry);
  } catch (error) {
    console.error('Failed to write log:', error);
  }
};

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const readOnlyDb = new Database(dbPath, { readonly: true, fileMustExist: true });
readOnlyDb.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS spreadsheets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sheets (
    id TEXT PRIMARY KEY,
    spreadsheet_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (spreadsheet_id) REFERENCES spreadsheets(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS sheet_columns (
    sheet_id TEXT NOT NULL,
    column_index INTEGER NOT NULL,
    header TEXT NOT NULL,
    sql_name TEXT NOT NULL,
    PRIMARY KEY (sheet_id, column_index),
    UNIQUE (sheet_id, sql_name),
    FOREIGN KEY (sheet_id) REFERENCES sheets(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    spreadsheet_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    context_range TEXT,
    tool_calls TEXT,
    FOREIGN KEY (spreadsheet_id) REFERENCES spreadsheets(id) ON DELETE CASCADE
  );
`);

try {
  db.prepare('ALTER TABLE chat_messages ADD COLUMN context_range TEXT').run();
} catch (_error) {
  // Column already exists
}

try {
  db.prepare('ALTER TABLE chat_messages ADD COLUMN tool_calls TEXT').run();
} catch (_error) {
  // Column already exists
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));

const PORT = Number(process.env.PORT || 4000);
const AI_PROVIDER = process.env.AI_PROVIDER || 'anthropic'; // 'gemini' or 'anthropic'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// In-memory storage for active filters (per sheet)
// Structure: { [sheetId]: [{ condition: string }] }
// Each condition is a SQL boolean expression defining which rows to SHOW
const activeFilters = new Map();

const now = () => new Date().toISOString();
const defaultHeader = (index) => `COLUMN_${index + 1}`;
const defaultSqlName = (index) => `column_${index + 1}`;

const sanitizeSqlIdentifier = (value, fallback) => {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '') // strip accents
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  let candidate = normalized || fallback;
  if (/^\d/.test(candidate)) {
    candidate = `col_${candidate}`;
  }
  return candidate;
};

const tableNameForSheet = (sheetId) => `sheet_${sheetId.replace(/[^a-zA-Z0-9]/g, '_')}`;

const touchSpreadsheet = (spreadsheetId) => {
  const timestamp = now();
  db.prepare('UPDATE spreadsheets SET updated_at = ? WHERE id = ?').run(timestamp, spreadsheetId);
};

const touchSheet = (sheetId) => {
  const sheet = db.prepare('SELECT spreadsheet_id FROM sheets WHERE id = ?').get(sheetId);
  if (!sheet) return;
  const timestamp = now();
  db.prepare('UPDATE sheets SET updated_at = ? WHERE id = ?').run(timestamp, sheetId);
  touchSpreadsheet(sheet.spreadsheet_id);
};

const ensureSheetTable = (sheetId) => {
  const tableName = tableNameForSheet(sheetId);
  db.prepare(`CREATE TABLE IF NOT EXISTS "${tableName}" (row_number INTEGER PRIMARY KEY)`).run();
  return tableName;
};

const listChatMessages = (spreadsheetId) => {
  const rows = db
    .prepare(
      'SELECT id, spreadsheet_id, role, content, created_at, context_range, tool_calls FROM chat_messages WHERE spreadsheet_id = ? ORDER BY datetime(created_at)'
    )
    .all(spreadsheetId);

  return rows.map((row) => {
    let parsedToolCalls = null;
    if (row.tool_calls) {
      try {
        parsedToolCalls = JSON.parse(row.tool_calls);
      } catch (_error) {
        parsedToolCalls = null;
      }
    }
    return {
      ...row,
      tool_calls: parsedToolCalls,
    };
  });
};

const addChatMessage = (spreadsheetId, role, content, contextRange = null, toolCalls = null) => {
  const id = randomUUID();
  const timestamp = now();
  let toolCallsJson = null;
  if (toolCalls) {
    try {
      toolCallsJson = JSON.stringify(toolCalls);
    } catch (_error) {
      toolCallsJson = null;
    }
  }
  db.prepare(
    'INSERT INTO chat_messages (id, spreadsheet_id, role, content, created_at, context_range, tool_calls) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, spreadsheetId, role, content, timestamp, contextRange, toolCallsJson);
  touchSpreadsheet(spreadsheetId);
  return {
    id,
    spreadsheet_id: spreadsheetId,
    role,
    content,
    created_at: timestamp,
    context_range: contextRange,
    tool_calls: toolCalls,
  };
};

const deleteChatMessage = (messageId) => {
  db.prepare('DELETE FROM chat_messages WHERE id = ?').run(messageId);
};

const clearConversation = (spreadsheetId) => {
  db.prepare('DELETE FROM chat_messages WHERE spreadsheet_id = ?').run(spreadsheetId);
};

const computeRangeLabel = (selectedCells = {}) => {
  const keys = Object.keys(selectedCells);
  if (!keys || keys.length === 0) return null;
  const sorted = keys.map((key) => key.toUpperCase()).sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last ? first : `${first}:${last}`;
};

const getSheetColumns = (sheetId) => {
  return db
    .prepare('SELECT column_index, header, sql_name FROM sheet_columns WHERE sheet_id = ? ORDER BY column_index')
    .all(sheetId);
};

const getSheetById = (sheetId) => {
  return db.prepare('SELECT id, spreadsheet_id, name FROM sheets WHERE id = ?').get(sheetId);
};

const slugifySheetName = (name) => {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'sheet';
};

const listSheetsForSpreadsheet = (spreadsheetId) => {
  return db
    .prepare('SELECT id, name FROM sheets WHERE spreadsheet_id = ? ORDER BY datetime(created_at)')
    .all(spreadsheetId)
    .map((sheet) => ({
      ...sheet,
      slug: slugifySheetName(sheet.name),
      columns: getSheetColumns(sheet.id),
    }));
};

const escapeForRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSheetMetadataSummary = (spreadsheetId) => {
  const sheets = listSheetsForSpreadsheet(spreadsheetId);
  const lines = sheets.map((sheet) => {
    const tableName = tableNameForSheet(sheet.id);
    const columnSummaries = sheet.columns?.length
      ? sheet.columns
          .slice(0, 20)
          .map((column) => `${column.header} → "${column.sql_name}"`)
          .join(', ')
      : 'No headers yet. Default SQL names: "column_1", "column_2", ...';
    return `${sheet.name} (sheetId: ${sheet.id}, ref: context.spreadsheet.sheets["${sheet.name}"], alias: context.spreadsheet.sheets["${sheet.slug}"] → table "${tableName}") columns: ${columnSummaries}`;
  });
  return {
    sheets,
    summaryText: lines.join('\n'),
  };
};

const resolveSheetReference = (sheetMetas, rawValue) => {
  if (!rawValue || typeof rawValue !== 'string') {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const direct = sheetMetas.find((sheet) => sheet.id === trimmed);
  if (direct) {
    return { sheet: direct, reference: trimmed };
  }

  const contextMatch = trimmed.match(/context\.spreadsheet\.sheets\[\s*['"](.+?)['"]\s*\]/i);
  const extracted = contextMatch ? contextMatch[1] : trimmed.replace(/^['"]|['"]$/g, '');
  const candidate = extracted.trim();

  if (!candidate) {
    return null;
  }

  const normalized = candidate.toLowerCase();

  const byName = sheetMetas.find((sheet) => sheet.name.toLowerCase() === normalized);
  if (byName) {
    return { sheet: byName, reference: trimmed };
  }

  const bySlug = sheetMetas.find((sheet) => sheet.slug === normalized || sheet.slug === slugifySheetName(candidate));
  if (bySlug) {
    return { sheet: bySlug, reference: trimmed };
  }

  return null;
};

const createHeaderFromSqlName = (sqlName, fallbackIndex) => {
  if (!sqlName || typeof sqlName !== 'string') {
    return defaultHeader(fallbackIndex);
  }

  const raw = sqlName.trim();
  if (!raw) {
    return defaultHeader(fallbackIndex);
  }

  if (/^[a-z0-9_]+$/.test(raw)) {
    return raw;
  }

  const normalized = raw
    .replace(/^col_/, '')
    .replace(/[_\s]+/g, ' ')
    .trim();

  if (!normalized) {
    return defaultHeader(fallbackIndex);
  }

  return normalized
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const syncNewSheetColumns = (sheetId, tableName) => {
  const existingColumns = getSheetColumns(sheetId);
  const knownSqlNames = new Set(existingColumns.map((column) => column.sql_name));
  const tableInfo = db.prepare(`PRAGMA table_info("${tableName}")`).all();

  let nextIndex = existingColumns.length;
  const added = [];

  for (const column of tableInfo) {
    if (!column || !column.name || column.name === 'row_number' || knownSqlNames.has(column.name)) {
      continue;
    }

    const header = createHeaderFromSqlName(column.name, nextIndex);
    db.prepare(
      'INSERT INTO sheet_columns (sheet_id, column_index, header, sql_name) VALUES (?, ?, ?, ?)'
    ).run(sheetId, nextIndex, header, column.name);

    added.push({
      header,
      sqlName: column.name,
      columnIndex: nextIndex,
    });

    knownSqlNames.add(column.name);
    nextIndex += 1;
  }

  return added;
};

const normalizeRowForJson = (row) => {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (typeof value === 'bigint') {
        return [key, value.toString()];
      }
      if (value instanceof Buffer) {
        return [key, value.toString('base64')];
      }
      return [key, value];
    })
  );
};

const MAX_PREVIEW_ROWS = 100;
const MAX_ROW_COUNT = 2000;

const executeSheetSql = (spreadsheetId, sheetId, rawSql) => {
  if (!rawSql || typeof rawSql !== 'string' || !rawSql.trim()) {
    throw new Error('SQL query is required.');
  }

  const sheet = getSheetById(sheetId);
  if (!sheet || sheet.spreadsheet_id !== spreadsheetId) {
    throw new Error('Invalid sheetId provided for this spreadsheet.');
  }

  let sql = rawSql.trim();

  // Replace sheet references with actual table name
  const tableName = tableNameForSheet(sheetId);
  const refPattern = /context\.spreadsheet\.sheets\[['"]([^'"]+)['"]\]/gi;
  sql = sql.replace(refPattern, `"${tableName}"`);

  if (!/^\s*(with|select)\b/i.test(sql)) {
    throw new Error('Only SELECT queries (optionally starting with WITH) are supported.');
  }

  const disallowedPattern = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|vacuum|pragma|reindex|analyze|begin|commit|rollback|savepoint|release|truncate|merge)\b/i;
  if (disallowedPattern.test(sql)) {
    throw new Error('Write or schema-altering statements are not allowed.');
  }

  const statements = sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  if (statements.length > 1) {
    throw new Error('Please provide a single SQL statement at a time.');
  }

  const tableRegex = new RegExp(`\"?${escapeForRegex(tableName)}\"?`, 'i');
  if (!tableRegex.test(sql)) {
    throw new Error(`Reference the sheet table name "${tableName}" in your query.`);
  }

  const sheetTableMatches = sql.match(/"?sheet_[a-zA-Z0-9_]+"?/g) || [];
  const allowedTable = tableName.toLowerCase();
  const hasInvalidTable = sheetTableMatches.some((match) => match.replace(/"/g, '').toLowerCase() !== allowedTable);
  if (hasInvalidTable) {
    throw new Error('Queries may target only one sheet at a time.');
  }

  const stmt = readOnlyDb.prepare(sql);
  const columnMeta = stmt.columns?.() ?? [];
  const columnNames = columnMeta.map((column) => column.name);

  const rows = [];
  let rowCount = 0;
  let truncated = false;

  for (const row of stmt.iterate()) {
    rowCount += 1;
    if (rowCount <= MAX_PREVIEW_ROWS) {
      rows.push(normalizeRowForJson(row));
    }
    if (rowCount >= MAX_ROW_COUNT) {
      truncated = true;
      break;
    }
  }

  if (!truncated && rowCount > MAX_PREVIEW_ROWS) {
    truncated = true;
  }

  return {
    sheet,
    tableName,
    columns: columnNames,
    rows,
    rowCount,
    truncated,
  };
};

const executeSheetSqlMutation = (spreadsheetId, sheetId, rawSql) => {
  if (!rawSql || typeof rawSql !== 'string' || !rawSql.trim()) {
    throw new Error('SQL statement is required.');
  }

  const sheet = getSheetById(sheetId);
  if (!sheet || sheet.spreadsheet_id !== spreadsheetId) {
    throw new Error('Invalid sheetId provided for this spreadsheet.');
  }

  let sql = rawSql.trim();

  // Replace sheet references with actual table name
  const tableName = tableNameForSheet(sheetId);
  const refPattern = /context\.spreadsheet\.sheets\[['"]([^'"]+)['"]\]/gi;
  sql = sql.replace(refPattern, `"${tableName}"`);

  const statements = sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  if (statements.length !== 1) {
    throw new Error('Provide exactly one SQL statement.');
  }

  const tableRegex = new RegExp(`\"?${escapeForRegex(tableName)}\"?`, 'i');
  if (!tableRegex.test(sql)) {
    throw new Error(`Reference the sheet table name "${tableName}" in your statement.`);
  }

  const sheetTableMatches = sql.match(/"?sheet_[a-zA-Z0-9_]+"?/g) || [];
  const allowedTable = tableName.toLowerCase();
  const hasInvalidTable = sheetTableMatches.some((match) => match.replace(/"/g, '').toLowerCase() !== allowedTable);
  if (hasInvalidTable) {
    throw new Error('Statements may target only the specified sheet.');
  }

  const lowered = sql.toLowerCase();
  let operation = null;

  if (lowered.startsWith('update')) {
    operation = 'update';
  } else if (lowered.startsWith('insert')) {
    operation = 'insert';
  } else if (lowered.startsWith('alter')) {
    if (!/add\s+column/i.test(sql)) {
      throw new Error('Only ALTER TABLE ... ADD COLUMN statements are allowed.');
    }
    operation = 'alter';
  } else {
    throw new Error('Only UPDATE, INSERT, or ALTER TABLE ADD COLUMN statements are allowed.');
  }

  const disallowedPattern = /\b(delete|drop|truncate|replace|attach|detach|vacuum|pragma|reindex|analyze|begin|commit|rollback|savepoint|release|merge)\b/i;
  if (disallowedPattern.test(sql)) {
    throw new Error('Destructive statements are not allowed.');
  }

  const stmt = db.prepare(sql);
  const runResult = stmt.run();

  let changes = 0;
  if (typeof runResult?.changes === 'number' && Number.isFinite(runResult.changes)) {
    changes = runResult.changes;
  }

  let lastInsertRowid = runResult?.lastInsertRowid ?? null;
  if (typeof lastInsertRowid === 'bigint') {
    lastInsertRowid = lastInsertRowid.toString();
  }

  let addedColumns = [];
  if (operation === 'alter') {
    addedColumns = syncNewSheetColumns(sheetId, tableName);
  }

  touchSheet(sheetId);

  return {
    sheet,
    tableName,
    operation,
    changes,
    lastInsertRowid,
    addedColumns,
  };
};

const ensureUniqueSqlName = (sheetId, desiredName, columnIndexToIgnore) => {
  let candidate = desiredName;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = db
      .prepare(
        'SELECT column_index FROM sheet_columns WHERE sheet_id = ? AND sql_name = ?'
      )
      .get(sheetId, candidate);
    if (!existing || existing.column_index === columnIndexToIgnore) {
      return candidate;
    }
    suffix += 1;
    candidate = `${desiredName}_${suffix}`;
  }
};

const ensureColumnCount = (sheetId, targetCount) => {
  const tableName = ensureSheetTable(sheetId);
  const columns = getSheetColumns(sheetId);
  if (columns.length >= targetCount) {
    return { tableName, columns };
  }

  const existingSqlNames = new Set(columns.map((column) => column.sql_name));
  let columnIndex = columns.length;
  while (columnIndex < targetCount) {
    const header = defaultHeader(columnIndex);
    const baseSqlName = defaultSqlName(columnIndex);
    let sqlName = baseSqlName;
    let suffix = 1;
    while (existingSqlNames.has(sqlName)) {
      sqlName = `${baseSqlName}_${++suffix}`;
    }
    db.prepare(`ALTER TABLE "${tableName}" ADD COLUMN "${sqlName}" TEXT`).run();
    db.prepare(
      'INSERT INTO sheet_columns (sheet_id, column_index, header, sql_name) VALUES (?, ?, ?, ?)' 
    ).run(sheetId, columnIndex, header, sqlName);
    existingSqlNames.add(sqlName);
    columnIndex += 1;
  }

  return { tableName, columns: getSheetColumns(sheetId) };
};

const renameColumn = (sheetId, columnIndex, newHeaderRaw) => {
  const columns = getSheetColumns(sheetId);
  const column = columns[columnIndex];
  if (!column) {
    throw new Error('Column does not exist');
  }

  const tableName = ensureSheetTable(sheetId);
  const fallback = defaultSqlName(columnIndex);
  const desiredSql = sanitizeSqlIdentifier(newHeaderRaw, fallback);
  const uniqueSql = ensureUniqueSqlName(sheetId, desiredSql, columnIndex);
  const finalHeader = newHeaderRaw?.trim() ? newHeaderRaw.trim() : defaultHeader(columnIndex);

  if (column.sql_name !== uniqueSql) {
    db.prepare(`ALTER TABLE "${tableName}" RENAME COLUMN "${column.sql_name}" TO "${uniqueSql}"`).run();
  }

  db.prepare('UPDATE sheet_columns SET header = ?, sql_name = ? WHERE sheet_id = ? AND column_index = ?')
    .run(finalHeader, uniqueSql, sheetId, columnIndex);
};

const setCellValue = (sheetId, rowNumber, columnIndex, value) => {
  if (rowNumber <= 0) {
    throw new Error('Row numbers must be positive for cell values.');
  }

  const { tableName } = ensureColumnCount(sheetId, columnIndex + 1);
  const columns = getSheetColumns(sheetId);
  const column = columns[columnIndex];
  if (!column) {
    throw new Error('Column does not exist');
  }

  const storedRow = rowNumber;

  if (typeof value !== 'string' || value.length === 0) {
    db.prepare(`UPDATE "${tableName}" SET "${column.sql_name}" = NULL WHERE row_number = ?`).run(storedRow);

    if (columns.length === 0) {
      db.prepare(`DELETE FROM "${tableName}" WHERE row_number = ?`).run(storedRow);
      return;
    }

    const selectColumns = columns.map((col) => `"${col.sql_name}"`).join(', ');
    const rowData = db
      .prepare(
        `SELECT ${selectColumns} FROM "${tableName}" WHERE row_number = ?`
      )
      .get(storedRow);

    const hasValues = rowData
      ? columns.some((col) => {
          const cell = rowData[col.sql_name];
          return cell !== null && cell !== undefined && String(cell).trim().length > 0;
        })
      : false;

    if (!hasValues) {
      db.prepare(`DELETE FROM "${tableName}" WHERE row_number = ?`).run(storedRow);
    }
  } else {
    db.prepare(
      `INSERT INTO "${tableName}" (row_number, "${column.sql_name}") VALUES (?, ?)
       ON CONFLICT(row_number) DO UPDATE SET "${column.sql_name}" = excluded."${column.sql_name}"`
    ).run(storedRow, value);
  }
};

const loadSheetTable = (sheetId) => {
  const tableName = ensureSheetTable(sheetId);
  const columns = getSheetColumns(sheetId);

  if (columns.length === 0) {
    return { data: [], filters: [] };
  }

  const selectColumns = columns.map((column) => `"${column.sql_name}" AS "${column.sql_name}"`).join(', ');

  // Apply active filters (conditions define which rows to SHOW)
  const filters = activeFilters.get(sheetId) || [];
  let whereClause = '';
  if (filters.length > 0) {
    const conditions = filters.map((filter) => `(${filter.condition})`);
    whereClause = ` WHERE ${conditions.join(' AND ')}`;
  }

  const rows = db
    .prepare(
      `SELECT row_number${selectColumns ? `, ${selectColumns}` : ''} FROM "${tableName}"${whereClause} ORDER BY row_number`
    )
    .all();

  const headerRow = { row_number: 0 };
  columns.forEach((column, index) => {
    headerRow[`column_${index + 1}`] = column.header;
  });

  const dataRows = rows.map((row) => {
    const record = { row_number: row.row_number };
    columns.forEach((column, index) => {
      record[`column_${index + 1}`] = row[column.sql_name] ?? null;
    });
    return record;
  });

  return {
    data: columns.length > 0 ? [headerRow, ...dataRows] : [],
    filters: filters
  };
};

const removeColumn = (sheetId, columnIndex) => {
  const columns = getSheetColumns(sheetId);
  const column = columns[columnIndex];
  if (!column) {
    throw new Error('Column does not exist');
  }

  const tableName = ensureSheetTable(sheetId);

  db.prepare(`ALTER TABLE "${tableName}" DROP COLUMN "${column.sql_name}"`).run();
  db.prepare('DELETE FROM sheet_columns WHERE sheet_id = ? AND column_index = ?').run(sheetId, columnIndex);
  db.prepare('UPDATE sheet_columns SET column_index = column_index - 1 WHERE sheet_id = ? AND column_index > ?')
    .run(sheetId, columnIndex);
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', gemini: Boolean(GEMINI_API_KEY) });
});

app.get('/spreadsheets', (_req, res) => {
  const rows = db.prepare('SELECT * FROM spreadsheets ORDER BY datetime(updated_at) DESC').all();
  res.json(rows);
});

app.post('/spreadsheets', (req, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required.' });
  }

  const id = randomUUID();
  const timestamp = now();
  db.prepare('INSERT INTO spreadsheets (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(id, name.trim(), timestamp, timestamp);

  const record = db.prepare('SELECT * FROM spreadsheets WHERE id = ?').get(id);
  res.status(201).json(record);
});

app.get('/spreadsheets/:id', (req, res) => {
  const spreadsheet = db.prepare('SELECT * FROM spreadsheets WHERE id = ?').get(req.params.id);
  if (!spreadsheet) {
    return res.status(404).json({ error: 'Spreadsheet not found.' });
  }
  res.json(spreadsheet);
});

app.get('/spreadsheets/:id/sheets', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM sheets WHERE spreadsheet_id = ? ORDER BY datetime(created_at)'
  ).all(req.params.id);
  res.json(rows);
});

app.post('/spreadsheets/:id/sheets', (req, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required.' });
  }

  const spreadsheet = db.prepare('SELECT id FROM spreadsheets WHERE id = ?').get(req.params.id);
  if (!spreadsheet) {
    return res.status(404).json({ error: 'Spreadsheet not found.' });
  }

  const existing = db
    .prepare('SELECT id FROM sheets WHERE spreadsheet_id = ? AND lower(name) = lower(?)')
    .get(req.params.id, name.trim());
  if (existing) {
    return res.status(409).json({ error: 'A sheet with that name already exists in this spreadsheet.' });
  }

  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    'INSERT INTO sheets (id, spreadsheet_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.params.id, name.trim(), timestamp, timestamp);

  touchSpreadsheet(req.params.id);

  const record = db.prepare('SELECT * FROM sheets WHERE id = ?').get(id);
  res.status(201).json(record);
});

app.patch('/sheets/:id', (req, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required.' });
  }

  const sheet = db.prepare('SELECT spreadsheet_id FROM sheets WHERE id = ?').get(req.params.id);
  if (!sheet) {
    return res.status(404).json({ error: 'Sheet not found.' });
  }

  const existing = db
    .prepare('SELECT id FROM sheets WHERE spreadsheet_id = ? AND lower(name) = lower(?) AND id != ?')
    .get(sheet.spreadsheet_id, name.trim(), req.params.id);
  if (existing) {
    return res.status(409).json({ error: 'A sheet with that name already exists in this spreadsheet.' });
  }

  db.prepare('UPDATE sheets SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  touchSheet(req.params.id);
  res.status(204).end();
});

app.delete('/sheets/:id', (req, res) => {
  const sheet = db.prepare('SELECT spreadsheet_id FROM sheets WHERE id = ?').get(req.params.id);
  if (!sheet) {
    return res.status(404).json({ error: 'Sheet not found.' });
  }

  const tableName = tableNameForSheet(req.params.id);
  db.prepare(`DROP TABLE IF EXISTS "${tableName}"`).run();
  db.prepare('DELETE FROM sheets WHERE id = ?').run(req.params.id);
  touchSpreadsheet(sheet.spreadsheet_id);
  res.status(204).end();
});

app.post('/sheets/:id/table', (req, res) => {
  const { columnCount } = req.body ?? {};
  const count = Number(columnCount ?? 0);
  if (!Number.isInteger(count) || count <= 0) {
    return res.status(400).json({ error: 'columnCount must be a positive integer.' });
  }

  const sheet = db.prepare('SELECT spreadsheet_id FROM sheets WHERE id = ?').get(req.params.id);
  if (!sheet) {
    return res.status(404).json({ error: 'Sheet not found.' });
  }

  ensureColumnCount(req.params.id, count);
  touchSheet(req.params.id);
  res.status(204).end();
});

app.post('/sheets/:id/cells', (req, res) => {
  const { row, col, value } = req.body ?? {};
  const rowNumber = Number(row);
  const colNumber = Number(col);
  if (!Number.isInteger(rowNumber) || rowNumber < 0 || !Number.isInteger(colNumber) || colNumber < 0) {
    return res.status(400).json({ error: 'row and col must be non-negative integers.' });
  }

  const sheet = db.prepare('SELECT spreadsheet_id FROM sheets WHERE id = ?').get(req.params.id);
  if (!sheet) {
    return res.status(404).json({ error: 'Sheet not found.' });
  }

  ensureColumnCount(req.params.id, colNumber + 1);

  if (rowNumber === 0) {
    renameColumn(req.params.id, colNumber, typeof value === 'string' ? value : '');
  } else {
    setCellValue(req.params.id, rowNumber, colNumber, typeof value === 'string' ? value : '');
  }

  touchSheet(req.params.id);
  res.status(204).end();
});

app.get('/sheets/:id/table', (req, res) => {
  const sheet = db.prepare('SELECT id FROM sheets WHERE id = ?').get(req.params.id);
  if (!sheet) {
    return res.status(404).json({ error: 'Sheet not found.' });
  }

  const payload = loadSheetTable(req.params.id);
  res.json(payload);
});

app.get('/spreadsheets/:id/chat', (req, res) => {
  const spreadsheet = db.prepare('SELECT id FROM spreadsheets WHERE id = ?').get(req.params.id);
  if (!spreadsheet) {
    return res.status(404).json({ error: 'Spreadsheet not found.' });
  }

  const messages = listChatMessages(req.params.id);
  res.json({ messages });
});

app.delete('/sheets/:id/columns/:index', (req, res) => {
  const columnIndex = Number(req.params.index);
  if (!Number.isInteger(columnIndex) || columnIndex < 0) {
    return res.status(400).json({ error: 'columnIndex must be a non-negative integer.' });
  }

  const sheet = db.prepare('SELECT spreadsheet_id FROM sheets WHERE id = ?').get(req.params.id);
  if (!sheet) {
    return res.status(404).json({ error: 'Sheet not found.' });
  }

  const columns = getSheetColumns(req.params.id);
  if (columns.length <= 1) {
    return res.status(400).json({ error: 'A sheet must contain at least one column.' });
  }

  if (!columns[columnIndex]) {
    return res.status(404).json({ error: 'Column not found.' });
  }

  try {
    removeColumn(req.params.id, columnIndex);
    touchSheet(req.params.id);
    res.status(204).end();
  } catch (error) {
    console.error('Failed to remove column', error);
    res.status(500).json({ error: 'Failed to remove column.' });
  }
});

// Anthropic Chat Handler
const handleAnthropicChat = async (req, res, context) => {
  const { trimmedQuery, selectedCells, userMessage, sheetMetas, sheetSummary, sheetReferenceList } = context;

  const systemInstructionText = [
    'You are an assistant helping users work with spreadsheet data.',
    'You have access to six tools: executeSheetSql (for reading data), mutateSheetSql (for changing data), highlights_add (for visual emphasis), highlights_clear (to remove highlights), filter_add (to hide rows), and filter_clear (to remove filters).',
    'Use `executeSheetSql` to query spreadsheet data. Use the sheet ref (like context.spreadsheet.sheets["term1"]) directly in your SQL queries as the table name. The system automatically substitutes the correct table. Example: SELECT "grade" FROM context.spreadsheet.sheets["term1"] WHERE "name" = \'Julia\'. Never construct table names manually.',
    'Use `mutateSheetSql` only when the user explicitly asks to change spreadsheet data (for example, updating column values, adding rows, or creating a new column). Mutations are limited to UPDATE, INSERT, or ALTER TABLE ... ADD COLUMN statements.',
    'Use `highlights_add` to visually mark important cells or ranges when the user asks to highlight, mark, emphasize, or draw attention to specific data. Two approaches: (1) Use "range" for specific cell locations in A1 notation (e.g., "B2", "A1:C5"). (2) Use "condition" with a SQL boolean expression to highlight cells matching criteria (e.g., condition: \'"grade" > 20\', condition: \'"status" = \\\'active\\\'\').',
    'Multiple highlights can be layered! To highlight different values in different colors, call highlights_add multiple times with different colors. Example: highlights_add(condition: \'"grade" > 25\', color: "green") then highlights_add(condition: \'"grade" < 10\', color: "red").',
    'For data-based highlighting: Query with executeSheetSql to analyze data, then use highlights_add with a condition. Example: To highlight highest and lowest grades in different colors, query for thresholds, then call highlights_add twice with different conditions and colors.',
    'Use `highlights_clear` to remove all active highlights from the spreadsheet.',
    'Use `filter_add` to show only rows that match a SQL boolean condition (other rows are hidden). Provide a WHERE clause expression. Filters persist and can be layered (multiple filters create AND conditions). Examples: filter_add(sheet: context.spreadsheet.sheets["Sales"], condition: \'"revenue" > 1000\'), or filter_add(condition: \'"status" = \\\'active\\\' AND "revenue" > 5000\').',
    'Use `filter_clear` to remove all active filters from a sheet and show all rows again.',
    'Use `filters_get` to check what filters are currently active on a sheet. Returns the list of active filter conditions. Use this to verify filter state before adding or removing filters.',
    'If a tool call fails, analyze the error and retry with a different approach (e.g., try CAST for numeric comparisons, use LOWER() for case-insensitive text matching). Make 2-3 attempts before giving up.',
    'When calling a tool, provide the `sheet` argument using the relative reference syntax (for example, sheet: context.spreadsheet.sheets["Term 1"]) or the sheet id when necessary.',
    'Each sheet table contains a `row_number` column that corresponds to the spreadsheet row number. Always SELECT row_number when you need to highlight cells based on query results. Summarize tool results for the user instead of pasting large tables verbatim.',
  ].join('\n\n');

  // Build messages array from chat history
  const messages = listChatMessages(req.params.id).map((message) => {
    let text = message.content;

    if (message.id === userMessage.id) {
      const contextEntries =
        selectedCells && typeof selectedCells === 'object'
          ? Object.entries(selectedCells)
          : [];
      if (contextEntries.length > 0) {
        const cellText = contextEntries.map(([key, value]) => `${key}: ${value}`).join('\n');
        text = `${text}\n\nSelected cell context:\n${cellText}`;
      }

      if (sheetSummary) {
        text = `${text}\n\nAvailable sheets and SQL columns:\n${sheetSummary}`;
      }
    }

    return {
      role: message.role, // 'user' or 'assistant'
      content: text,
    };
  });

  // Define tools in Anthropic format
  const tools = [
    {
      name: 'executeSheetSql',
      description: 'Run a read-only SQL query against the specified sheet table and return the result rows.',
      input_schema: {
        type: 'object',
        properties: {
          sheet: {
            type: 'string',
            description: sheetReferenceList
              ? `Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id). Sheets: ${sheetReferenceList}.`
              : 'Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id).',
          },
          sql: {
            type: 'string',
            description:
              'A single SELECT SQL statement targeting the sheet table. Use the sheet reference directly in the FROM clause.',
          },
        },
        required: ['sheet', 'sql'],
      },
    },
    {
      name: 'mutateSheetSql',
      description:
        'Modify spreadsheet data by running an UPDATE, INSERT, or ALTER TABLE ... ADD COLUMN statement against the specified sheet table.',
      input_schema: {
        type: 'object',
        properties: {
          sheet: {
            type: 'string',
            description: sheetReferenceList
              ? `Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id). Sheets: ${sheetReferenceList}.`
              : 'Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id).',
          },
          sql: {
            type: 'string',
            description:
              'A single UPDATE, INSERT, or ALTER TABLE ... ADD COLUMN statement. Use the sheet reference directly.',
          },
        },
        required: ['sheet', 'sql'],
      },
    },
    {
      name: 'highlights_add',
      description:
        'Draw visual attention to specific cells or ranges by applying a colored overlay. Use this to help the user see results of an analysis or locate important data. Multiple highlights can be layered.',
      input_schema: {
        type: 'object',
        properties: {
          sheet: {
            type: 'string',
            description: sheetReferenceList
              ? `Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id). Sheets: ${sheetReferenceList}.`
              : 'Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id).',
          },
          range: {
            type: 'string',
            description:
              'Cell range to highlight in A1 notation (e.g., "A1", "B2:D5", "A1:A10"). Use this for specific cell locations. Mutually exclusive with condition.',
          },
          condition: {
            type: 'string',
            description:
              'SQL boolean expression defining which cells to highlight. Use double quotes for column names. Examples: \'"grade" > 20\', \'"status" = \\\'active\\\'\', \'"revenue" BETWEEN 1000 AND 5000\'. Mutually exclusive with range.',
          },
          color: {
            type: 'string',
            enum: ['yellow', 'red', 'green', 'blue', 'orange', 'purple'],
            description: 'Highlight color (defaults to yellow if not specified).',
          },
          message: {
            type: 'string',
            description:
              'Optional message explaining why these cells are highlighted (shown to user).',
          },
        },
        required: ['sheet'],
      },
    },
    {
      name: 'highlights_clear',
      description:
        'Clear all active highlights from the spreadsheet.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'filter_add',
      description:
        'Show only rows matching a SQL boolean condition (other rows are hidden). Provide a WHERE clause expression that defines which rows to SHOW. Filters persist until cleared and multiple filters create AND conditions. Use this when the user wants to focus on specific data.',
      input_schema: {
        type: 'object',
        properties: {
          sheet: {
            type: 'string',
            description: sheetReferenceList
              ? `Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id). Sheets: ${sheetReferenceList}.`
              : 'Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id).',
          },
          condition: {
            type: 'string',
            description:
              'SQL boolean expression defining which rows to SHOW. Use double quotes for column names. Examples: \'"revenue" > 1000\', \'"status" = \\\'active\\\'\', \'"grade" BETWEEN 80 AND 100\', \'LOWER("name") LIKE \\\'%smith%\\\'\'.',
          },
        },
        required: ['sheet', 'condition'],
      },
    },
    {
      name: 'filter_clear',
      description:
        'Remove all active filters from the specified sheet to show all rows again.',
      input_schema: {
        type: 'object',
        properties: {
          sheet: {
            type: 'string',
            description: sheetReferenceList
              ? `Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id). Sheets: ${sheetReferenceList}.`
              : 'Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id).',
          },
        },
        required: ['sheet'],
      },
    },
    {
      name: 'filters_get',
      description:
        'Get the list of currently active filters on a sheet. Returns the filter conditions that are currently hiding rows.',
      input_schema: {
        type: 'object',
        properties: {
          sheet: {
            type: 'string',
            description: sheetReferenceList
              ? `Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id). Sheets: ${sheetReferenceList}.`
              : 'Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id).',
          },
        },
        required: ['sheet'],
      },
    },
  ];

  try {
    let conversation = [...messages];
    const toolCalls = [];
    let assistantText = '';
    const maxIterations = 10;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration += 1;

      const payload = {
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        system: systemInstructionText,
        messages: conversation,
        tools,
      };

      logToFile('anthropic-request', {
        iteration,
        spreadsheetId: req.params.id,
        userQuery: trimmedQuery,
        payload,
      });

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message = errorBody?.error?.message || 'Anthropic API request failed.';
        logToFile('anthropic-error', { iteration, error: message, errorBody });
        return res.status(response.status).json({ error: message });
      }

      const data = await response.json();
      logToFile('anthropic-response', {
        iteration,
        spreadsheetId: req.params.id,
        response: data,
      });

      const stopReason = data.stop_reason;
      const content = data.content || [];

      // Extract text and tool uses
      const textBlocks = content.filter((block) => block.type === 'text');
      const toolUseBlocks = content.filter((block) => block.type === 'tool_use');

      if (textBlocks.length > 0) {
        assistantText = textBlocks.map((block) => block.text).join('\n');
      }

      // If no tool use, we're done
      if (toolUseBlocks.length === 0) {
        break;
      }

      // Add assistant's message to conversation (with tool use)
      conversation.push({
        role: 'assistant',
        content: data.content,
      });

      // Process each tool use
      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        const toolName = toolUse.name;
        const toolInput = toolUse.input || {};
        const toolUseId = toolUse.id;

        logToFile('anthropic-tool-call', {
          iteration,
          toolName,
          toolInput,
          toolUseId,
        });

        const sheetArg = toolInput.sheet;
        const sql = toolInput.sql || '';
        const trimmedSql = typeof sql === 'string' ? sql : '';
        const resolvedSheet = resolveSheetReference(sheetMetas, sheetArg);
        const sheetId = resolvedSheet?.sheet?.id || toolInput.sheetId;
        const sheetMeta = sheetMetas.find((sheet) => sheet.id === sheetId) || resolvedSheet?.sheet;
        const sheetReferenceLabel = resolvedSheet?.reference ?? sheetArg ?? sheetId;

        let toolResultContent = null;
        let toolCallRecord = null;

        try {
          const isNonSqlTool = toolName === 'highlights_add' || toolName === 'highlights_clear' || toolName === 'filter_add' || toolName === 'filter_clear';
          const isSqlTool = toolName === 'executeSheetSql' || toolName === 'mutateSheetSql';

          if (isSqlTool && (!sheetMeta || !sheetMeta.id || !trimmedSql.trim())) {
            throw new Error('Both sheet reference and sql are required for this tool call.');
          }

          const targetSheetId = sheetMeta?.id;

          if (toolName === 'mutateSheetSql') {
            const execution = executeSheetSqlMutation(req.params.id, targetSheetId, trimmedSql);
            toolResultContent = JSON.stringify({
              ok: true,
              sheetId: targetSheetId,
              sheetName: execution.sheet?.name,
              operation: execution.operation,
              changes: execution.changes,
              lastInsertRowid: execution.lastInsertRowid,
              addedColumns: execution.addedColumns,
            });

            toolCallRecord = {
              name: toolName,
              kind: 'write',
              sheetId: targetSheetId,
              sheetName: execution.sheet?.name,
              sql: trimmedSql,
              status: 'ok',
              operation: execution.operation,
              changes: execution.changes,
              lastInsertRowid: execution.lastInsertRowid,
              addedColumns: execution.addedColumns,
              reference: sheetReferenceLabel,
            };

            if (execution.addedColumns?.length && sheetMeta) {
              sheetMeta.columns = [
                ...(sheetMeta.columns ?? []),
                ...execution.addedColumns.map((column) => ({
                  header: column.header,
                  sql_name: column.sqlName,
                  column_index: column.columnIndex,
                })),
              ];
            }
          } else if (toolName === 'executeSheetSql') {
            const execution = executeSheetSql(req.params.id, targetSheetId, trimmedSql);
            toolResultContent = JSON.stringify({
              ok: true,
              sheetId: targetSheetId,
              sheetName: execution.sheet?.name,
              rowCount: execution.rowCount,
              truncated: execution.truncated,
              columns: execution.columns,
              rows: execution.rows,
            });

            toolCallRecord = {
              name: toolName,
              kind: 'read',
              sheetId: targetSheetId,
              sheetName: execution.sheet?.name,
              sql: trimmedSql,
              status: 'ok',
              operation: 'select',
              rowCount: execution.rowCount,
              truncated: execution.truncated,
              columns: execution.columns,
              reference: sheetReferenceLabel,
            };
          } else if (toolName === 'highlights_add') {
            if (!sheetMeta || !sheetMeta.id) {
              throw new Error('Valid sheet reference is required for highlights_add.');
            }

            const range = toolInput.range;
            const condition = toolInput.condition;

            if (!range && !condition) {
              throw new Error('Either "range" or "condition" is required for highlights_add.');
            }
            if (range && condition) {
              throw new Error('Cannot specify both "range" and "condition".');
            }

            let rowNumbers = undefined;
            // Execute condition to get matching row numbers
            if (condition) {
              const tableName = tableNameForSheet(sheetMeta.id);
              const querySql = `SELECT row_number FROM "${tableName}" WHERE ${condition}`;
              try {
                const rows = readOnlyDb.prepare(querySql).all();
                rowNumbers = rows.map(row => row.row_number);
              } catch (sqlError) {
                throw new Error(`Invalid highlight condition: ${sqlError instanceof Error ? sqlError.message : String(sqlError)}`);
              }
            }

            const color = toolInput.color || 'yellow';
            const message = toolInput.message || null;

            const validColors = ['yellow', 'red', 'green', 'blue', 'orange', 'purple'];
            const finalColor = validColors.includes(color.toLowerCase()) ? color.toLowerCase() : 'yellow';

            toolResultContent = JSON.stringify({
              ok: true,
              sheetId: sheetMeta.id,
              sheetName: sheetMeta.name,
              range: range ? range.trim() : undefined,
              condition: condition ? condition.trim() : undefined,
              rowNumbers: rowNumbers,
              color: finalColor,
              message: message,
            });

            toolCallRecord = {
              name: toolName,
              kind: 'highlight',
              sheetId: sheetMeta.id,
              sheetName: sheetMeta.name,
              range: range ? range.trim() : undefined,
              condition: condition ? condition.trim() : undefined,
              rowNumbers: rowNumbers,
              color: finalColor,
              message: message,
              status: 'ok',
              reference: sheetReferenceLabel,
            };
          } else if (toolName === 'highlights_clear') {
            toolResultContent = JSON.stringify({
              ok: true,
              cleared: true,
            });

            toolCallRecord = {
              name: toolName,
              kind: 'highlight_clear',
              status: 'ok',
            };
          } else if (toolName === 'filter_add') {
            if (!sheetMeta || !sheetMeta.id) {
              throw new Error('Valid sheet reference is required for filter_add.');
            }

            const condition = toolInput.condition;

            if (!condition || typeof condition !== 'string' || !condition.trim()) {
              throw new Error('A SQL boolean condition is required for filter_add.');
            }

            // Validate the condition by attempting a test query
            const tableName = tableNameForSheet(sheetMeta.id);
            const testSql = `SELECT 1 FROM "${tableName}" WHERE ${condition} LIMIT 1`;
            try {
              readOnlyDb.prepare(testSql).get();
            } catch (sqlError) {
              throw new Error(`Invalid filter condition: ${sqlError instanceof Error ? sqlError.message : String(sqlError)}`);
            }

            // Add filter to active filters
            const currentFilters = activeFilters.get(sheetMeta.id) || [];
            currentFilters.push({ condition: condition.trim() });
            activeFilters.set(sheetMeta.id, currentFilters);

            toolResultContent = JSON.stringify({
              ok: true,
              sheetId: sheetMeta.id,
              sheetName: sheetMeta.name,
              condition: condition.trim(),
              totalFilters: currentFilters.length,
            });

            toolCallRecord = {
              name: toolName,
              kind: 'filter',
              sheetId: sheetMeta.id,
              sheetName: sheetMeta.name,
              condition: condition.trim(),
              status: 'ok',
              reference: sheetReferenceLabel,
            };
          } else if (toolName === 'filter_clear') {
            if (!sheetMeta || !sheetMeta.id) {
              throw new Error('Valid sheet reference is required for filter_clear.');
            }

            const previousCount = (activeFilters.get(sheetMeta.id) || []).length;
            activeFilters.delete(sheetMeta.id);

            toolResultContent = JSON.stringify({
              ok: true,
              sheetId: sheetMeta.id,
              sheetName: sheetMeta.name,
              clearedCount: previousCount,
            });

            toolCallRecord = {
              name: toolName,
              kind: 'filter_clear',
              sheetId: sheetMeta.id,
              sheetName: sheetMeta.name,
              status: 'ok',
              clearedCount: previousCount,
              reference: sheetReferenceLabel,
            };
          } else if (toolName === 'filters_get') {
            if (!sheetMeta || !sheetMeta.id) {
              throw new Error('Valid sheet reference is required for filters_get.');
            }

            const currentFilters = activeFilters.get(sheetMeta.id) || [];

            toolResultContent = JSON.stringify({
              ok: true,
              sheetId: sheetMeta.id,
              sheetName: sheetMeta.name,
              filters: currentFilters,
              filterCount: currentFilters.length,
            });

            toolCallRecord = {
              name: toolName,
              kind: 'filters_get',
              sheetId: sheetMeta.id,
              sheetName: sheetMeta.name,
              status: 'ok',
              filterCount: currentFilters.length,
              reference: sheetReferenceLabel,
            };
          } else {
            throw new Error(`Unsupported tool: ${toolName}`);
          }

          logToFile('anthropic-tool-success', {
            iteration,
            toolName,
            result: toolResultContent,
          });
        } catch (toolError) {
          logToFile('anthropic-tool-error', {
            iteration,
            toolName,
            error: toolError instanceof Error ? toolError.message : String(toolError),
            stack: toolError instanceof Error ? toolError.stack : undefined,
          });

          const isMutation = toolName === 'mutateSheetSql';
          const isHighlight = toolName === 'highlights_add';
          const isHighlightClear = toolName === 'highlights_clear';
          const isFilter = toolName === 'filter_add';
          const isFilterClear = toolName === 'filter_clear';
          const isNonSqlTool = isHighlight || isHighlightClear || isFilter || isFilterClear;

          toolResultContent = JSON.stringify({
            ok: false,
            sheetId: sheetMeta?.id,
            sheetName: sheetMeta?.name,
            error: toolError instanceof Error ? toolError.message : (isNonSqlTool ? 'Operation failed.' : 'SQL execution failed.'),
          });

          let kind = 'read';
          if (isHighlightClear) kind = 'highlight_clear';
          else if (isHighlight) kind = 'highlight';
          else if (isFilterClear) kind = 'filter_clear';
          else if (isFilter) kind = 'filter';
          else if (isMutation) kind = 'write';

          toolCallRecord = {
            name: toolName,
            kind,
            sheetId: sheetMeta?.id,
            sheetName: sheetMeta?.name,
            sql: isNonSqlTool ? undefined : trimmedSql,
            range: isHighlight ? toolInput.range : undefined,
            condition: isFilter ? toolInput.condition : undefined,
            status: 'error',
            operation: isNonSqlTool ? undefined : (isMutation ? undefined : 'select'),
            error: toolError instanceof Error ? toolError.message : String(toolError),
            reference: sheetReferenceLabel,
          };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: toolResultContent,
        });

        if (toolCallRecord) {
          toolCalls.push(toolCallRecord);
        }
      }

      // Add tool results to conversation
      conversation.push({
        role: 'user',
        content: toolResults,
      });

      // If stop reason is end_turn, we're done
      if (stopReason === 'end_turn') {
        break;
      }
    }

    // Save assistant response
    const assistantMessage = addChatMessage(
      req.params.id,
      'assistant',
      assistantText || 'I processed your request.',
      null,
      toolCalls.length > 0 ? toolCalls : null
    );

    logToFile('anthropic-final', {
      spreadsheetId: req.params.id,
      userQuery: trimmedQuery,
      assistantText,
      toolCalls,
      iterations: iteration,
    });

    const allMessages = listChatMessages(req.params.id);
    res.json({
      response: assistantMessage.content,
      assistantMessage,
      messages: allMessages,
    });
  } catch (error) {
    logToFile('anthropic-error', {
      spreadsheetId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ error: 'Failed to generate response.' });
  }
};

app.post('/spreadsheets/:id/chat', async (req, res) => {
  // Check API key based on provider
  if (AI_PROVIDER === 'anthropic' && !ANTHROPIC_API_KEY) {
    return res.status(400).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }
  if (AI_PROVIDER === 'gemini' && !GEMINI_API_KEY) {
    return res.status(400).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const spreadsheet = db.prepare('SELECT id FROM spreadsheets WHERE id = ?').get(req.params.id);
  if (!spreadsheet) {
    return res.status(404).json({ error: 'Spreadsheet not found.' });
  }

  const { query, selectedCells } = req.body ?? {};
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query is required.' });
  }

  const trimmedQuery = query.trim();
  const rangeLabel = computeRangeLabel(selectedCells || {});
  const userMessage = addChatMessage(req.params.id, 'user', trimmedQuery, rangeLabel);

  const { sheets: sheetMetas, summaryText: sheetSummary } = buildSheetMetadataSummary(req.params.id);

  const sheetReferenceList = sheetMetas
    .map(
      (sheet) =>
        `${sheet.name}: context.spreadsheet.sheets["${sheet.name}"] | context.spreadsheet.sheets["${sheet.slug}"] (sheetId ${sheet.id})`
    )
    .join('; ');

  // Route to appropriate AI provider
  if (AI_PROVIDER === 'anthropic') {
    return handleAnthropicChat(req, res, {
      trimmedQuery,
      selectedCells,
      userMessage,
      sheetMetas,
      sheetSummary,
      sheetReferenceList,
    });
  }

  const systemInstructionText = [
    'You are an assistant helping users work with spreadsheet data.',
    'You have access to four functions: executeSheetSql (for reading data), mutateSheetSql (for changing data), highlights_add (for visual emphasis), and highlights_clear (to remove highlights).',
    'Use `executeSheetSql` to query spreadsheet data. Use the sheet ref (like context.spreadsheet.sheets["term1"]) directly in your SQL queries as the table name. The system automatically substitutes the correct table. Example: SELECT "grade" FROM context.spreadsheet.sheets["term1"] WHERE "name" = \'Julia\'. Never construct table names manually.',
    'Use `mutateSheetSql` only when the user explicitly asks to change spreadsheet data (for example, updating column values, adding rows, or creating a new column). Mutations are limited to UPDATE, INSERT, or ALTER TABLE ... ADD COLUMN statements.',
    'Use `highlights_add` to visually mark important cells or ranges when the user asks to highlight, mark, emphasize, or draw attention to specific data. Two approaches: (1) Use "range" for specific cell locations in A1 notation (e.g., "B2", "A1:C5"). (2) Use "condition" with a SQL boolean expression to highlight cells matching criteria (e.g., condition: \'"grade" > 20\', condition: \'"status" = \\\'active\\\'\').',
    'Multiple highlights can be layered! To highlight different values in different colors, call highlights_add multiple times with different colors. Example: highlights_add(condition: \'"grade" > 25\', color: "green") then highlights_add(condition: \'"grade" < 10\', color: "red").',
    'For data-based highlighting: Query with executeSheetSql to analyze data, then use highlights_add with a condition. Example: To highlight highest and lowest grades in different colors, query for thresholds, then call highlights_add twice with different conditions and colors.',
    'Use `highlights_clear` to remove all active highlights from the spreadsheet.',
    'IMPORTANT: When passing function parameters, ensure all string values are properly escaped. Do not include unescaped quotes or special characters in function parameters. Keep parameter content concise to avoid exceeding token limits.',
    'If a function call fails, analyze the error and retry with a different approach (e.g., try CAST for numeric comparisons, use LOWER() for case-insensitive text matching). Make 2-3 attempts before giving up.',
    'When calling a function, provide the `sheet` argument using the relative reference syntax (for example, sheet: context.spreadsheet.sheets["Term 1"]) or the sheet id when necessary.',
    'Each sheet table contains a `row_number` column that corresponds to the spreadsheet row number. Always SELECT row_number when you need to highlight cells based on query results. Summarize tool results for the user instead of pasting large tables verbatim.',
  ].join('\n\n');

  const contents = listChatMessages(req.params.id).map((message) => {
    let text = message.content;

    if (message.id === userMessage.id) {
      const contextEntries =
        selectedCells && typeof selectedCells === 'object'
          ? Object.entries(selectedCells)
          : [];
      if (contextEntries.length > 0) {
        const cellText = contextEntries.map(([key, value]) => `${key}: ${value}`).join('\n');
        text = `${text}\n\nSelected cell context:\n${cellText}`;
      }

      if (sheetSummary) {
        text = `${text}\n\nAvailable sheets and SQL columns:\n${sheetSummary}`;
      }
    }

    return {
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }],
    };
  });

  const toolDefinitions = [
    {
      functionDeclarations: [
        {
          name: 'executeSheetSql',
          description: 'Run a read-only SQL query against the specified sheet table and return the result rows.',
          parameters: {
            type: 'object',
            properties: {
              sheet: {
                type: 'string',
                description: sheetReferenceList
                  ? `Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id). Sheets: ${sheetReferenceList}.`
                  : 'Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id).',
              },
              sql: {
                type: 'string',
                description:
                  'A single SELECT SQL statement targeting the sheet table. Wrap identifiers in double quotes and reference the table as "sheet_<sheetId>".',
              },
            },
            required: ['sheet', 'sql'],
          },
        },
        {
          name: 'mutateSheetSql',
          description:
            'Modify spreadsheet data by running an UPDATE, INSERT, or ALTER TABLE ... ADD COLUMN statement against the specified sheet table.',
          parameters: {
            type: 'object',
            properties: {
              sheet: {
                type: 'string',
                description: sheetReferenceList
                  ? `Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id). Sheets: ${sheetReferenceList}.`
                  : 'Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id).',
              },
              sql: {
                type: 'string',
                description:
                  'An UPDATE, INSERT, or ALTER TABLE ... ADD COLUMN SQL statement targeting the sheet table ("sheet_<sheetId>"). Wrap identifiers in double quotes.',
              },
            },
            required: ['sheet', 'sql'],
          },
        },
        {
          name: 'highlights_add',
          description:
            'Draw visual attention to specific cells or ranges by applying a colored overlay. Use this to help the user see results of an analysis or locate important data. Multiple highlights can be layered.',
          parameters: {
            type: 'object',
            properties: {
              sheet: {
                type: 'string',
                description: sheetReferenceList
                  ? `Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id). Sheets: ${sheetReferenceList}.`
                  : 'Reference to the sheet (use context.spreadsheet.sheets["<Sheet Name>"] or the sheet id).',
              },
              range: {
                type: 'string',
                description:
                  'Cell range to highlight in A1 notation (e.g., "A1", "B2:D5", "A1:A10"). Use this for specific cell locations. Mutually exclusive with condition.',
              },
              condition: {
                type: 'string',
                description:
                  'SQL boolean expression defining which cells to highlight. Use double quotes for column names. Examples: \'"grade" > 20\', \'"status" = \\\'active\\\'\', \'"revenue" BETWEEN 1000 AND 5000\'. Mutually exclusive with range.',
              },
              color: {
                type: 'string',
                enum: ['yellow', 'red', 'green', 'blue', 'orange', 'purple'],
                description: 'Highlight color (defaults to yellow if not specified).',
              },
              message: {
                type: 'string',
                description:
                  'Optional message explaining why these cells are highlighted (shown to user).',
              },
            },
            required: ['sheet'],
          },
        },
        {
          name: 'highlights_clear',
          description:
            'Clear all active highlights from the spreadsheet.',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      ],
    },
  ];

  const generationConfig = {
    temperature: 0.3,
    topK: 32,
    topP: 0.95,
    maxOutputTokens: 1024,
  };

  const getTextFromParts = (parts) =>
    parts
      ?.map((part) => part?.text)
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join('\n')
      .trim();

const buildRequestPayload = (conversationContents) => ({
  systemInstruction: {
    role: 'system',
    parts: [{ text: systemInstructionText }],
  },
    contents: conversationContents,
    tools: toolDefinitions,
    toolConfig: {
      functionCallingConfig: {
        mode: 'AUTO',
      },
    },
    generationConfig,
  });

  try {
    let conversation = [...contents];
    const toolCalls = [];
    let assistantText = '';
    let pendingText = '';
    const maxIterations = 4;
    let iteration = 0;
    let lastCandidate = null;

    while (iteration < maxIterations) {
      iteration += 1;

      const payload = buildRequestPayload(conversation);
      logToFile('gemini-request', {
        iteration,
        spreadsheetId: req.params.id,
        userQuery: trimmedQuery,
        payload
      });

      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' +
          encodeURIComponent(GEMINI_API_KEY),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message = errorBody?.error?.message || 'Gemini API request failed.';
        return res.status(response.status).json({ error: message });
      }

      const data = await response.json();
      logToFile('gemini-response', {
        iteration,
        spreadsheetId: req.params.id,
        response: data
      });

      const candidate = data?.candidates?.[0];
      lastCandidate = candidate ?? lastCandidate;
      const candidateContent = candidate?.content ?? null;
      const candidateParts = candidateContent?.parts ?? [];
      const textFromParts = getTextFromParts(candidateParts);
      if (textFromParts) {
        pendingText = textFromParts;
      }

      const finishReason = candidate?.finishReason || candidate?.finish_reason;

      logToFile('gemini-parsing', {
        iteration,
        finishReason,
        candidateParts
      });

      const functionCallPart =
        candidateParts.find((part) => part?.functionCall || part?.function_call) ?? null;

      if (!functionCallPart) {
        // Check if this is a recoverable error that should be retried
        if (finishReason === 'MALFORMED_FUNCTION_CALL' && iteration < maxIterations) {
          // Add error feedback to conversation to help model recover
          // Only add candidateContent if it has a valid role
          if (candidateContent && candidateContent.role) {
            conversation = [...conversation, candidateContent];
          }
          conversation = [
            ...conversation,
            {
              role: 'user',
              parts: [
                {
                  text: 'Your function call was malformed. Do not apologize. Silently reformulate and immediately try again with properly escaped parameters.',
                },
              ],
            },
          ];
          continue; // Retry
        }

        // Otherwise, accept text response or break
        if (textFromParts) {
          assistantText = textFromParts;
        }
        break;
      }

      const rawCall = functionCallPart.functionCall || functionCallPart.function_call;
      const callName = rawCall?.name;
      const rawArgs = rawCall?.args ?? rawCall?.arguments;

      logToFile('gemini-function-call', {
        iteration,
        callName,
        rawArgs
      });

      let parsedArgs = {};
      if (rawArgs) {
        if (typeof rawArgs === 'string') {
          try {
            parsedArgs = JSON.parse(rawArgs);
          } catch (_error) {
            parsedArgs = {};
          }
        } else {
          parsedArgs = rawArgs;
        }
      }

      const sheetArg =
        parsedArgs.sheet ??
        parsedArgs.sheetRef ??
        parsedArgs.sheetReference ??
        parsedArgs.sheet_id ??
        parsedArgs.sheetId ??
        parsedArgs.target ??
        parsedArgs.sheetName;
      const sql = parsedArgs.sql || parsedArgs.query || '';
      const trimmedSql = typeof sql === 'string' ? sql : '';
      const resolvedSheet = resolveSheetReference(sheetMetas, sheetArg);
      const sheetId = resolvedSheet?.sheet?.id || parsedArgs.sheetId || parsedArgs.sheet_id;
      const sheetMeta = sheetMetas.find((sheet) => sheet.id === sheetId) || resolvedSheet?.sheet;
      const sheetReferenceLabel = resolvedSheet?.reference ?? sheetArg ?? sheetId;

      logToFile('gemini-tool-prep', {
        iteration,
        callName,
        parsedArgs,
        sheetArg,
        resolvedSheetName: sheetMeta?.name,
        resolvedSheetId: sheetMeta?.id
      });

      let toolResultPayload = null;
      let toolCallRecord = null;

      try {
        if (callName !== 'highlights_add' && callName !== 'highlights_clear' && (!sheetMeta || !sheetMeta.id || !trimmedSql.trim())) {
          throw new Error('Both sheet reference and sql are required for this tool call.');
        }

        const targetSheetId = sheetMeta?.id;

        if (callName === 'mutateSheetSql') {
          const execution = executeSheetSqlMutation(req.params.id, targetSheetId, trimmedSql);
          toolResultPayload = {
            ok: true,
            sheetId: targetSheetId,
            sheetName: execution.sheet?.name,
            operation: execution.operation,
            changes: execution.changes,
            lastInsertRowid: execution.lastInsertRowid,
            addedColumns: execution.addedColumns,
            sheetReference: sheetReferenceLabel,
          };

          toolCallRecord = {
            name: callName,
            kind: 'write',
            sheetId: targetSheetId,
            sheetName: execution.sheet?.name,
            sql: trimmedSql,
            status: 'ok',
            operation: execution.operation,
            changes: execution.changes,
            lastInsertRowid: execution.lastInsertRowid,
            addedColumns: execution.addedColumns,
            reference: sheetReferenceLabel,
          };

          if (execution.addedColumns?.length && sheetMeta) {
            sheetMeta.columns = [
              ...(sheetMeta.columns ?? []),
              ...execution.addedColumns.map((column) => ({
                header: column.header,
                sql_name: column.sqlName,
                column_index: column.columnIndex,
              })),
            ];
          }
        } else if (callName === 'executeSheetSql') {
          const execution = executeSheetSql(req.params.id, targetSheetId, trimmedSql);
          toolResultPayload = {
            ok: true,
            sheetId: targetSheetId,
            sheetName: execution.sheet?.name,
            rowCount: execution.rowCount,
            truncated: execution.truncated,
            columns: execution.columns,
            rows: execution.rows,
            sheetReference: sheetReferenceLabel,
          };

          toolCallRecord = {
            name: callName,
            kind: 'read',
            sheetId: targetSheetId,
            sheetName: execution.sheet?.name,
            sql: trimmedSql,
            status: 'ok',
            operation: 'select',
            rowCount: execution.rowCount,
            truncated: execution.truncated,
            columns: execution.columns,
            reference: sheetReferenceLabel,
          };
        } else if (callName === 'highlights_add') {
          if (!sheetMeta || !sheetMeta.id) {
            throw new Error('Valid sheet reference is required for highlights_add.');
          }

          const range = parsedArgs.range;
          const condition = parsedArgs.condition;

          if (!range && !condition) {
            throw new Error('Either "range" or "condition" is required for highlights_add.');
          }
          if (range && condition) {
            throw new Error('Cannot specify both "range" and "condition".');
          }

          let rowNumbers = undefined;
          // Execute condition to get matching row numbers
          if (condition) {
            const tableName = tableNameForSheet(sheetMeta.id);
            const querySql = `SELECT row_number FROM "${tableName}" WHERE ${condition}`;
            try {
              const rows = readOnlyDb.prepare(querySql).all();
              rowNumbers = rows.map(row => row.row_number);
            } catch (sqlError) {
              throw new Error(`Invalid highlight condition: ${sqlError instanceof Error ? sqlError.message : String(sqlError)}`);
            }
          }

          const color = parsedArgs.color || 'yellow';
          const message = parsedArgs.message || null;

          const validColors = ['yellow', 'red', 'green', 'blue', 'orange', 'purple'];
          const finalColor = validColors.includes(color.toLowerCase()) ? color.toLowerCase() : 'yellow';

          toolResultPayload = {
            ok: true,
            sheetId: sheetMeta.id,
            sheetName: sheetMeta.name,
            range: range ? range.trim() : undefined,
            condition: condition ? condition.trim() : undefined,
            rowNumbers: rowNumbers,
            color: finalColor,
            message: message,
            sheetReference: sheetReferenceLabel,
          };

          toolCallRecord = {
            name: callName,
            kind: 'highlight',
            sheetId: sheetMeta.id,
            sheetName: sheetMeta.name,
            range: range ? range.trim() : undefined,
            condition: condition ? condition.trim() : undefined,
            rowNumbers: rowNumbers,
            color: finalColor,
            message: message,
            status: 'ok',
            reference: sheetReferenceLabel,
          };
        } else if (callName === 'highlights_clear') {
          toolResultPayload = {
            ok: true,
            cleared: true,
            sheetReference: sheetReferenceLabel,
          };

          toolCallRecord = {
            name: callName,
            kind: 'highlight_clear',
            status: 'ok',
            reference: sheetReferenceLabel,
          };
        } else {
          throw new Error(`Unsupported function call: ${callName}`);
        }

        logToFile('gemini-tool-success', {
          iteration,
          callName,
          result: toolResultPayload
        });
      } catch (toolError) {
        logToFile('gemini-tool-error', {
          iteration,
          callName,
          error: toolError instanceof Error ? toolError.message : String(toolError),
          stack: toolError instanceof Error ? toolError.stack : undefined
        });
        const isMutation = callName === 'mutateSheetSql';
        const isHighlight = callName === 'highlights_add';
        const isHighlightClear = callName === 'highlights_clear';
        toolResultPayload = {
          ok: false,
          sheetId: sheetMeta?.id,
          sheetName: sheetMeta?.name,
          sheetReference: sheetReferenceLabel,
          error: toolError instanceof Error ? toolError.message : ((isHighlight || isHighlightClear) ? 'Highlight operation failed.' : 'SQL execution failed.'),
        };

        toolCallRecord = {
          name: callName,
          kind: isHighlightClear ? 'highlight_clear' : (isHighlight ? 'highlight' : (isMutation ? 'write' : 'read')),
          sheetId: sheetMeta?.id,
          sheetName: sheetMeta?.name,
          sql: (isHighlight || isHighlightClear) ? undefined : trimmedSql,
          range: isHighlight ? parsedArgs.range : undefined,
          condition: isHighlight ? parsedArgs.condition : undefined,
          status: 'error',
          operation: (isHighlight || isHighlightClear) ? undefined : (isMutation ? undefined : 'select'),
          error: toolError instanceof Error ? toolError.message : String(toolError),
          reference: sheetReferenceLabel,
        };
      }

      if (toolCallRecord) {
        toolCalls.push(toolCallRecord);
      }

      if (candidateContent) {
        conversation = [...conversation, candidateContent];
      }

      conversation = [
        ...conversation,
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: callName,
                response: toolResultPayload,
              },
            },
          ],
        },
      ];
    }

    if (!assistantText) {
      if (pendingText) {
        assistantText = pendingText;
      } else if (toolCalls.length > 0) {
        const lastCall = toolCalls[toolCalls.length - 1];
        if (lastCall.status === 'error') {
          assistantText = `I ran into an error while executing SQL: ${lastCall.error ?? 'Unknown error.'}`;
        } else if (lastCall.kind === 'write') {
          const affected =
            typeof lastCall.changes === 'number'
              ? `${lastCall.changes} row${lastCall.changes === 1 ? '' : 's'}`
              : 'the requested rows';
          assistantText = `Done. Applied the ${lastCall.operation ?? 'mutation'} affecting ${affected}.`;
        } else {
          const rows = typeof lastCall.rowCount === 'number' ? lastCall.rowCount : 0;
          assistantText = `Query complete. Returned ${rows} row${rows === 1 ? '' : 's'}.`;
        }
      } else {
        const failureDetails = [];
        if (lastCandidate?.finishReason) {
          failureDetails.push(`finish reason: ${lastCandidate.finishReason}`);
        }
        const blockedCategories = lastCandidate?.safetyRatings
          ?.filter((rating) => rating?.blocked)
          ?.map((rating) => rating.category)
          ?.filter(Boolean);
        if (blockedCategories && blockedCategories.length > 0) {
          failureDetails.push(`blocked by safety filters (${blockedCategories.join(', ')})`);
        }
        assistantText = failureDetails.length
          ? `I couldn't produce a response. ${failureDetails.join('; ')}.`
          : "I couldn't produce a response for that request.";
      }
    }

    const assistantMessage = addChatMessage(
      req.params.id,
      'assistant',
      assistantText,
      rangeLabel,
      toolCalls.length > 0 ? toolCalls : null
    );

    logToFile('gemini-final', {
      spreadsheetId: req.params.id,
      userQuery: trimmedQuery,
      assistantText,
      toolCalls,
      iterations: iteration
    });

    const messages = listChatMessages(req.params.id);
    res.json({
      response: assistantMessage.content,
      assistantMessage,
      messages,
    });
  } catch (error) {
    logToFile('gemini-error', {
      spreadsheetId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({ error: 'Failed to generate response.' });
  }
});

app.post('/ai/gemini', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(400).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const { query, selectedCells } = req.body ?? {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required.' });
  }

  const promptParts = [];
  promptParts.push(query.trim());

  if (selectedCells && typeof selectedCells === 'object' && Object.keys(selectedCells).length > 0) {
    const cellText = Object.entries(selectedCells)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    promptParts.push('\nSelected cells:\n' + cellText);
  }

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + encodeURIComponent(GEMINI_API_KEY), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: promptParts.join('\n\n') }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 32,
          topP: 0.9,
          maxOutputTokens: 512
        }
      })
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = errorBody?.error?.message || 'Gemini API request failed.';
      return res.status(response.status).json({ error: message });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n').trim();

    res.json({ response: text || 'No response generated.' });
  } catch (error) {
    console.error('Gemini request failed', error);
    res.status(500).json({ error: 'Failed to reach Gemini API.' });
  }
});

app.delete('/spreadsheets/:id/chat', (req, res) => {
  const spreadsheet = db.prepare('SELECT id FROM spreadsheets WHERE id = ?').get(req.params.id);
  if (!spreadsheet) {
    return res.status(404).json({ error: 'Spreadsheet not found.' });
  }

  clearConversation(req.params.id);
  res.status(204).end();
});

app.delete('/sheets/:id/filters', (req, res) => {
  const sheet = db.prepare('SELECT id FROM sheets WHERE id = ?').get(req.params.id);
  if (!sheet) {
    return res.status(404).json({ error: 'Sheet not found.' });
  }

  activeFilters.delete(req.params.id);
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`SQLite API listening on http://localhost:${PORT}`);
});
