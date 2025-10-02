export interface SpreadsheetRecord {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface SheetRecord {
  id: string;
  spreadsheet_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface SheetColumn {
  column_index: number;
  column_id: string;
  header: string;
  sql_name: string;
}

export interface SheetTableRow {
  row_id: string;
  display_index: number;
  order_key: number;
  created_at: string;
  updated_at: string;
  values: Record<string, string | null>;
}

export interface FilterCondition {
  condition: string;
}

export interface SheetViewSpecSort {
  column: string;
  dir: 'asc' | 'desc';
}

export interface SheetViewSpec {
  filters: FilterCondition[];
  sort: SheetViewSpecSort[];
  hiddenCols: string[];
}

export interface SheetViewState {
  spec: SheetViewSpec;
  hash: string;
  revision: string;
}

export interface SheetTableData {
  columns: SheetColumn[];
  rows: SheetTableRow[];
  view: SheetViewState;
  filters?: FilterCondition[];
}

export interface ToolCallRecord {
  name: string;
  sheetId?: string;
  sheetName?: string;
  reference?: string | null;
  sql?: string;
  status?: 'ok' | 'error';
  rowCount?: number;
  truncated?: boolean;
  columns?: string[];
  error?: string;
  kind?: 'read' | 'write' | 'highlight' | 'highlight_clear' | 'filter' | 'filter_clear';
  operation?: 'select' | 'update' | 'insert' | 'alter';
  changes?: number;
  lastInsertRowid?: number | string;
  addedColumns?: {
    header: string;
    sqlName: string;
    columnIndex: number;
  }[];
  range?: string;
  column?: string;
  values?: (string | number | boolean | null)[];
  color?: string;
  message?: string | null;
  condition?: string;
  clearedCount?: number;
  totalFilters?: number;
}

export interface ChatMessage {
  id: string;
  spreadsheet_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  context_range?: string | null;
  tool_calls?: ToolCallRecord[] | null;
}

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; toolCall: ToolCallRecord }
  | { type: 'done'; assistantMessage: ChatMessage; messages: ChatMessage[] }
  | { type: 'error'; error: string };

export interface CellHighlight {
  sheetId: string;
  range?: string;
  condition?: string;
  rowIds?: string[];
  color: string;
  message?: string | null;
}

export interface SelectionCellSnapshot {
  coord: string;
  value: string;
  rowId?: string | null;
  columnId?: string | null;
  rowIndex: number;
  columnIndex: number;
}

export interface SelectionSnapshot {
  sheetId: string;
  sheetName?: string;
  view?: SheetViewState;
  coords?: string | null;
  rowIds: string[];
  columnIds: string[];
  anchor: 'ids' | 'coords';
  cells: SelectionCellSnapshot[];
}

export interface DataClient {
  listSpreadsheets(): Promise<SpreadsheetRecord[]>;
  createSpreadsheet(name: string): Promise<SpreadsheetRecord>;
  getSpreadsheet(id: string): Promise<SpreadsheetRecord | null>;
  updateSpreadsheet(id: string, updates: { name: string }): Promise<void>;
  deleteSpreadsheet(id: string): Promise<void>;
  listSheets(spreadsheetId: string): Promise<SheetRecord[]>;
  createSheet(spreadsheetId: string, name: string): Promise<SheetRecord>;
  updateSheetName(sheetId: string, name: string): Promise<void>;
  deleteSheet(sheetId: string): Promise<void>;
  createDynamicTable(sheetId: string, columnCount: number): Promise<void>;
  syncCell(
    sheetId: string,
    payload: {
      rowId?: string | null;
      displayIndex?: number | null;
      columnIndex: number;
      value: string;
      isHeader?: boolean;
      viewHash?: string;
    }
  ): Promise<{ rowId: string | null; displayIndex: number | null; view: SheetViewState }>;
  importBulkData(sheetId: string, headers: string[], rows: string[][]): Promise<void>;
  loadSheetData(sheetId: string): Promise<SheetTableData>;
  getChatMessages(spreadsheetId: string): Promise<ChatMessage[]>;
  sendChatMessage(
    spreadsheetId: string,
    payload: { query: string; selection?: SelectionSnapshot | null; activeSheetId?: string }
  ): Promise<{ response: string; assistantMessage: ChatMessage; messages: ChatMessage[] }>;
  sendChatMessageStream?: (
    spreadsheetId: string,
    payload: { query: string; selection?: SelectionSnapshot | null; activeSheetId?: string }
  ) => AsyncGenerator<ChatStreamEvent>;
  clearChat(spreadsheetId: string): Promise<void>;
  deleteColumn(sheetId: string, columnIndex: number): Promise<void>;
  clearFilters(sheetId: string): Promise<void>;
}
