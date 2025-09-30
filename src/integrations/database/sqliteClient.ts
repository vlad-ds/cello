import { backendConfig } from '@/config/backend';
import type { ChatMessage, DataClient, SheetRecord, SheetTableData, SpreadsheetRecord } from './types';

const BASE_URL = backendConfig.sqliteApiBaseUrl.replace(/\/$/, '');

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T = unknown>(path: string, options: { method?: HttpMethod; body?: any } = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let parsedBody: unknown;
    const text = await response.text();
    if (text) {
      try {
        parsedBody = JSON.parse(text);
        if (parsedBody && typeof parsedBody === 'object' && 'error' in parsedBody) {
          message = String((parsedBody as { error: unknown }).error);
        } else {
          message = text;
        }
      } catch {
        message = text;
      }
    }

    const error = new Error(message) as Error & { status?: number; details?: unknown };
    error.status = response.status;
    error.details = parsedBody;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

const normalizeChatMessage = (message: ChatMessage): ChatMessage => ({
  ...message,
  tool_calls: message.tool_calls ?? null,
});

export const sqliteDataClient: DataClient = {
  async listSpreadsheets(): Promise<SpreadsheetRecord[]> {
    const data = await request<SpreadsheetRecord[]>('/spreadsheets');
    return data;
  },

  async createSpreadsheet(name: string): Promise<SpreadsheetRecord> {
    const data = await request<SpreadsheetRecord>('/spreadsheets', {
      method: 'POST',
      body: { name },
    });
    return data;
  },

  async getSpreadsheet(id: string): Promise<SpreadsheetRecord | null> {
    const data = await request<SpreadsheetRecord>(`/spreadsheets/${id}`).catch((error: unknown) => {
      if (error && typeof error === 'object' && 'status' in error && (error as { status?: number }).status === 404) {
        return null;
      }
      throw error;
    });
    return data;
  },

  async listSheets(spreadsheetId: string): Promise<SheetRecord[]> {
    const data = await request<SheetRecord[]>(`/spreadsheets/${spreadsheetId}/sheets`);
    return data;
  },

  async createSheet(spreadsheetId: string, name: string): Promise<SheetRecord> {
    const data = await request<SheetRecord>(`/spreadsheets/${spreadsheetId}/sheets`, {
      method: 'POST',
      body: { name },
    });
    return data;
  },

  async updateSheetName(sheetId: string, name: string): Promise<void> {
    await request(`/sheets/${sheetId}`, {
      method: 'PATCH',
      body: { name },
    });
  },

  async deleteSheet(sheetId: string): Promise<void> {
    await request(`/sheets/${sheetId}`, {
      method: 'DELETE',
    });
  },

  async createDynamicTable(sheetId: string, columnCount: number): Promise<void> {
    await request(`/sheets/${sheetId}/table`, {
      method: 'POST',
      body: { columnCount },
    });
  },

  async syncCell(sheetId: string, row: number, col: number, value: string): Promise<void> {
    await request(`/sheets/${sheetId}/cells`, {
      method: 'POST',
      body: { row, col, value },
    });
  },

  async loadSheetData(sheetId: string): Promise<SheetTableData> {
    const data = await request<SheetTableData>(`/sheets/${sheetId}/table`);
    return data;
  },

  async getChatMessages(spreadsheetId: string): Promise<ChatMessage[]> {
    const data = await request<{ messages: ChatMessage[] }>(`/spreadsheets/${spreadsheetId}/chat`);
    return (data.messages ?? []).map(normalizeChatMessage);
  },

  async sendChatMessage(
    spreadsheetId: string,
    payload: { query: string; selectedCells?: Record<string, string>; activeSheetId?: string }
  ): Promise<{ response: string; assistantMessage: ChatMessage; messages: ChatMessage[] }> {
    const data = await request<{ response: string; assistantMessage: ChatMessage; messages: ChatMessage[] }>(
      `/spreadsheets/${spreadsheetId}/chat`,
      {
        method: 'POST',
        body: payload,
      }
    );
    return {
      response: data.response,
      assistantMessage: normalizeChatMessage(data.assistantMessage),
      messages: (data.messages ?? []).map(normalizeChatMessage),
    };
  },

  async clearChat(spreadsheetId: string): Promise<void> {
    await request(`/spreadsheets/${spreadsheetId}/chat`, {
      method: 'DELETE',
    });
  },

  async deleteColumn(sheetId: string, columnIndex: number): Promise<void> {
    await request(`/sheets/${sheetId}/columns/${columnIndex}`, {
      method: 'DELETE',
    });
  },

  async clearFilters(sheetId: string): Promise<void> {
    await request(`/sheets/${sheetId}/filters`, {
      method: 'DELETE',
    });
  },
};
