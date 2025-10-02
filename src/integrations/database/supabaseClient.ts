import { supabase } from '@/integrations/supabase/client';
import type {
  ChatMessage,
  DataClient,
  SheetRecord,
  SheetTableData,
  SheetViewState,
  SpreadsheetRecord,
} from './types';

const handleError = (error: unknown) => {
  if (error instanceof Error) {
    throw error;
  }
  throw new Error(String(error));
};

export const supabaseDataClient: DataClient = {
  async listSpreadsheets(): Promise<SpreadsheetRecord[]> {
    const { data, error } = await supabase
      .from('spreadsheets')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) handleError(error);
    return data ?? [];
  },

  async createSpreadsheet(name: string): Promise<SpreadsheetRecord> {
    const { data, error } = await supabase
      .from('spreadsheets')
      .insert([{ name }])
      .select()
      .single();

    if (error) handleError(error);
    if (!data) throw new Error('Unable to create spreadsheet.');
    return data as SpreadsheetRecord;
  },

  async getSpreadsheet(id: string): Promise<SpreadsheetRecord | null> {
    const { data, error } = await supabase
      .from('spreadsheets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) handleError(error);
    return (data as SpreadsheetRecord | null) ?? null;
  },

  async updateSpreadsheet(id: string, updates: { name: string }): Promise<void> {
    const { error } = await supabase
      .from('spreadsheets')
      .update(updates)
      .eq('id', id);

    if (error) handleError(error);
  },

  async deleteSpreadsheet(id: string): Promise<void> {
    const { error } = await supabase
      .from('spreadsheets')
      .delete()
      .eq('id', id);

    if (error) handleError(error);
  },

  async listSheets(spreadsheetId: string): Promise<SheetRecord[]> {
    const { data, error } = await supabase
      .from('sheets')
      .select('*')
      .eq('spreadsheet_id', spreadsheetId)
      .order('created_at');

    if (error) handleError(error);
    return (data as SheetRecord[] | null) ?? [];
  },

  async createSheet(spreadsheetId: string, name: string): Promise<SheetRecord> {
    const { data, error } = await supabase
      .from('sheets')
      .insert([{ spreadsheet_id: spreadsheetId, name }])
      .select()
      .single();

    if (error) handleError(error);
    if (!data) throw new Error('Unable to create sheet.');
    return data as SheetRecord;
  },

  async updateSheetName(sheetId: string, name: string): Promise<void> {
    const { error } = await supabase
      .from('sheets')
      .update({ name })
      .eq('id', sheetId);

    if (error) handleError(error);
  },

  async deleteSheet(sheetId: string): Promise<void> {
    const { error } = await supabase
      .from('sheets')
      .delete()
      .eq('id', sheetId);

    if (error) handleError(error);
  },

  async createDynamicTable(sheetId: string, columnCount: number): Promise<void> {
    const { error } = await supabase.functions.invoke('manage-sheet-data', {
      body: {
        action: 'create_table',
        sheetId,
        columnCount,
      },
    });

    if (error) handleError(error);
  },

  async syncCell(
    sheetId: string,
    payload: {
      rowId?: string | null;
      displayIndex?: number | null;
      columnIndex: number;
      value: string;
      isHeader?: boolean;
      viewHash?: string;
    }
  ): Promise<{ rowId: string | null; displayIndex: number | null; view: SheetViewState }> {
    const { error } = await supabase.functions.invoke('manage-sheet-data', {
      body: {
        action: 'update_cell',
        sheetId,
        row: payload.isHeader ? 0 : (Number(payload.displayIndex) ?? 0) + 1,
        col: payload.columnIndex,
        value: payload.value,
      },
    });

    if (error) handleError(error);

    return {
      rowId: payload.rowId ?? null,
      displayIndex: payload.displayIndex ?? null,
      view: {
        spec: { filters: [], sort: [], hiddenCols: [] },
        hash: 'supabase',
        revision: new Date().toISOString(),
      },
    };
  },

  async importBulkData(sheetId: string, headers: string[], rows: string[][]): Promise<void> {
    // Bulk import not supported in Supabase mode - fall back to individual syncs
    for (let col = 0; col < headers.length; col++) {
      await this.syncCell(sheetId, {
        columnIndex: col,
        value: headers[col],
        isHeader: true,
      });
    }
    for (let row = 0; row < rows.length; row++) {
      for (let col = 0; col < rows[row].length; col++) {
        const value = rows[row][col];
        if (value) {
          await this.syncCell(sheetId, {
            displayIndex: row,
            columnIndex: col,
            value,
          });
        }
      }
    }
  },

  async loadSheetData(sheetId: string): Promise<SheetTableData> {
    const { data, error } = await supabase.functions.invoke('manage-sheet-data', {
      body: {
        action: 'load_data',
        sheetId,
      },
    });

    if (error) handleError(error);
    return (data as SheetTableData) ?? { data: [] };
  },

  async getChatMessages(_spreadsheetId: string): Promise<ChatMessage[]> {
    throw new Error('Chat history is only supported with the local SQLite backend for now.');
  },

  async sendChatMessage(
    _spreadsheetId: string,
    _payload: { query: string; selectedCells?: Record<string, string>; activeSheetId?: string }
  ): Promise<{ response: string; assistantMessage: ChatMessage; messages: ChatMessage[] }> {
    throw new Error('Chat persistence is only supported with the local SQLite backend for now.');
  },

  async clearChat(_spreadsheetId: string): Promise<void> {
    throw new Error('Clearing conversations is only supported with the local SQLite backend for now.');
  },

  async deleteColumn(_sheetId: string, _columnIndex: number): Promise<void> {
    throw new Error('Removing columns is currently supported only when using the local SQLite backend.');
  },

  async clearFilters(_sheetId: string): Promise<void> {
    throw new Error('Filters are currently supported only when using the local SQLite backend.');
  },
};
