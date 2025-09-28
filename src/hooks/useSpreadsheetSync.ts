import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useSpreadsheetSync = () => {
  const [isLoading, setIsLoading] = useState(false);

  const createDynamicTable = useCallback(async (sheetId: string, columnCount: number) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-sheet-data', {
        body: {
          action: 'create_table',
          sheetId,
          columnCount
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating dynamic table:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncCell = useCallback(async (sheetId: string, row: number, col: number, value: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-sheet-data', {
        body: {
          action: 'update_cell',
          sheetId,
          row,
          col,
          value
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error syncing cell:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSheetData = useCallback(async (sheetId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-sheet-data', {
        body: {
          action: 'load_data',
          sheetId
        }
      });

      if (error) throw error;
      return data;
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