import { useState, useCallback } from 'react';
import { dataClient } from '@/integrations/database';

export const useSpreadsheetSync = () => {
  const [isLoading, setIsLoading] = useState(false);

  const createDynamicTable = useCallback(async (sheetId: string, columnCount: number) => {
    setIsLoading(true);
    try {
      await dataClient.createDynamicTable(sheetId, columnCount);
    } catch (error) {
      console.error('Error creating dynamic table:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncCell = useCallback(
    async (
      sheetId: string,
      payload: {
        rowId?: string | null;
        displayIndex?: number | null;
        columnIndex: number;
        value: string;
        isHeader?: boolean;
        viewHash?: string;
      }
    ) => {
      setIsLoading(true);
      try {
        return await dataClient.syncCell(sheetId, payload);
      } catch (error) {
        console.error('Error syncing cell:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const loadSheetData = useCallback(async (sheetId: string) => {
    setIsLoading(true);
    try {
      return await dataClient.loadSheetData(sheetId);
    } catch (error) {
      console.error('Error loading sheet data:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    createDynamicTable,
    syncCell,
    loadSheetData,
    isLoading
  };
};
