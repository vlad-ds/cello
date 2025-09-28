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

export interface SheetTableRow {
  row_number: number;
  [key: string]: string | number | null | undefined;
}

export interface SheetTableData {
  data: SheetTableRow[];
}

export interface ToolCallRecord {
  name: string;
  sheetId?: string;
  sheetName?: string;
  sql?: string;
  status?: 'ok' | 'error';
  rowCount?: number;
  truncated?: boolean;
  columns?: string[];
  error?: string;
  kind?: 'read' | 'write';
  operation?: 'select' | 'update' | 'insert' | 'alter';
  changes?: number;
  lastInsertRowid?: number | string;
  addedColumns?: {
    header: string;
    sqlName: string;
    columnIndex: number;
  }[];
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

export interface DataClient {
  listSpreadsheets(): Promise<SpreadsheetRecord[]>;
  createSpreadsheet(name: string): Promise<SpreadsheetRecord>;
  getSpreadsheet(id: string): Promise<SpreadsheetRecord | null>;
  listSheets(spreadsheetId: string): Promise<SheetRecord[]>;
  createSheet(spreadsheetId: string, name: string): Promise<SheetRecord>;
  updateSheetName(sheetId: string, name: string): Promise<void>;
  deleteSheet(sheetId: string): Promise<void>;
  createDynamicTable(sheetId: string, columnCount: number): Promise<void>;
  syncCell(sheetId: string, row: number, col: number, value: string): Promise<void>;
  loadSheetData(sheetId: string): Promise<SheetTableData>;
  getChatMessages(spreadsheetId: string): Promise<ChatMessage[]>;
  sendChatMessage(
    spreadsheetId: string,
    payload: { query: string; selectedCells?: Record<string, string> }
  ): Promise<{ response: string; assistantMessage: ChatMessage; messages: ChatMessage[] }>;
  clearChat(spreadsheetId: string): Promise<void>;
  deleteColumn(sheetId: string, columnIndex: number): Promise<void>;
}
