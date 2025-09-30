import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Undo, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpreadsheetGrid } from "@/components/SpreadsheetGrid";
import { SheetTabs } from "@/components/SheetTabs";
import { CoordinateDisplay } from "@/components/CoordinateDisplay";
import { ChatPanel } from "@/components/ChatPanel";
import {
  dataClient,
  isSupabaseBackend,
  type SpreadsheetRecord,
  type ToolCall,
  type SheetTableData,
  type CellHighlight,
  type FilterCondition,
} from "@/integrations/database";
import { useSpreadsheetSync } from "@/hooks/useSpreadsheetSync";
import { CellData, SheetData, CellSelection, Action } from "./Index";
import { toast } from "@/components/ui/sonner";

const SpreadsheetView = () => {
  const { spreadsheetId } = useParams();
  const navigate = useNavigate();
  const { createDynamicTable, syncCell, loadSheetData, isLoading: syncLoading } = useSpreadsheetSync();
  
  const [spreadsheet, setSpreadsheet] = useState<SpreadsheetRecord | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string>("");
  const [selection, setSelection] = useState<CellSelection>({
    start: { row: 0, col: 0 },
    end: { row: 0, col: 0 },
    type: 'cell'
  });
  
  const [chatPanelWidth, setChatPanelWidth] = useState(480);
  const [isResizing, setIsResizing] = useState(false);
  const [rowCount, setRowCount] = useState(20);
  const [columnWidths, setColumnWidths] = useState<{[key: string]: number}>(() => {
    try {
      const saved = localStorage.getItem('columnWidths');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [rowHeights, setRowHeights] = useState<{[key: string]: number}>(() => {
    try {
      const saved = localStorage.getItem('rowHeights');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [history, setHistory] = useState<Action[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [activeHighlights, setActiveHighlights] = useState<CellHighlight[]>(() => {
    try {
      const saved = localStorage.getItem(`highlights-${spreadsheetId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeFilters, setActiveFilters] = useState<{ sheetId: string; filters: FilterCondition[] }[]>([]);

  const activeSheet = sheets.find(sheet => sheet.id === activeSheetId);

  // Calculate effective row count: when filters are active, only render rows with data
  const effectiveRowCount = activeSheet?.hasActiveFilters
    ? (() => {
        const rowsWithData = new Set<number>();
        Object.keys(activeSheet.cells).forEach(key => {
          const row = parseInt(key.split('-')[0]);
          if (!isNaN(row)) rowsWithData.add(row);
        });
        return rowsWithData.size;
      })()
    : rowCount;

  useEffect(() => {
    if (spreadsheetId) {
      loadSpreadsheet();
    }
  }, [spreadsheetId]);

  // Persist highlights to localStorage
  useEffect(() => {
    if (spreadsheetId) {
      localStorage.setItem(`highlights-${spreadsheetId}`, JSON.stringify(activeHighlights));
    }
  }, [activeHighlights, spreadsheetId]);

  const loadSpreadsheet = async () => {
    if (!spreadsheetId) return;

    try {
      // Load spreadsheet metadata
      const spreadsheetData = await dataClient.getSpreadsheet(spreadsheetId);
      if (!spreadsheetData) {
        throw new Error('Spreadsheet not found');
      }
      setSpreadsheet(spreadsheetData);

      const sheetsData = await dataClient.listSheets(spreadsheetId);

      // Load each sheet's data from its dynamic table
      const loadedSheets: SheetData[] = [];
      
      for (const sheet of sheetsData) {
        try {
          // First, try to load the sheet data
          let sheetData = await loadSheetData(sheet.id);
          
          // If no data returned, the table might not exist, so create it
          if (!sheetData || !sheetData.data) {
            console.log(`Creating dynamic table for sheet ${sheet.id}`);
            await createDynamicTable(sheet.id, 5); // Create with 5 columns
            sheetData = await loadSheetData(sheet.id); // Try loading again
          }
          
          const { cells, columnHeaders, hasActiveFilters, displayRowNumbers } = transformTableDataToSheetState(sheetData);

          loadedSheets.push({
            id: sheet.id,
            name: sheet.name,
            cells,
            columnHeaders,
            hasActiveFilters,
            displayRowNumbers
          });

          // Track filters from server
          if (sheetData?.filters && sheetData.filters.length > 0) {
            setActiveFilters(prev => {
              const without = prev.filter(item => item.sheetId !== sheet.id);
              return [...without, { sheetId: sheet.id, filters: sheetData.filters }];
            });
          }
          
        } catch (error) {
          console.error(`Error loading data for sheet ${sheet.id}:`, error);
          
          // Try to create the dynamic table as a fallback
          try {
            await createDynamicTable(sheet.id, 5);
            loadedSheets.push({
              id: sheet.id,
              name: sheet.name,
              cells: {},
              columnHeaders: ["COLUMN_1", "COLUMN_2", "COLUMN_3", "COLUMN_4", "COLUMN_5"]
            });
          } catch (createError) {
            console.error(`Failed to create dynamic table for sheet ${sheet.id}:`, createError);
            // Create empty sheet as last resort
            loadedSheets.push({
              id: sheet.id,
              name: sheet.name,
              cells: {},
              columnHeaders: ["COLUMN_1", "COLUMN_2", "COLUMN_3", "COLUMN_4", "COLUMN_5"]
            });
          }
        }
      }

      setSheets(loadedSheets);
      if (loadedSheets.length > 0) {
        setActiveSheetId(loadedSheets[0].id);
      }
    } catch (error) {
      console.error('Error loading spreadsheet:', error);
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  // Generate data from activeSheet.cells for the grid
  const generateGridData = (): CellData[][] => {
    if (!activeSheet) return [];

    const gridData: CellData[][] = [];

    if (activeSheet.hasActiveFilters) {
      // When filters are active, only show rows that have data (already sequential from transform)
      const rowsWithData = new Set<number>();
      Object.keys(activeSheet.cells).forEach(key => {
        const row = parseInt(key.split('-')[0]);
        if (!isNaN(row)) {
          rowsWithData.add(row);
        }
      });

      const sortedRows = Array.from(rowsWithData).sort((a, b) => a - b);

      sortedRows.forEach(row => {
        const rowData: CellData[] = [];
        for (let col = 0; col < activeSheet.columnHeaders.length; col++) {
          const cellKey = `${row}-${col}`;
          rowData[col] = {
            value: activeSheet.cells[cellKey] || ""
          };
        }
        gridData.push(rowData);
      });
    } else {
      // No filters: show all rows up to rowCount
      for (let row = 0; row < rowCount; row++) {
        gridData[row] = [];
        for (let col = 0; col < activeSheet.columnHeaders.length; col++) {
          const cellKey = `${row}-${col}`;
          gridData[row][col] = {
            value: activeSheet.cells[cellKey] || ""
          };
        }
      }
    }

    return gridData;
  };

  const addToHistory = (action: Action) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(action);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const updateCell = async (row: number, col: number, value: string) => {
    if (!activeSheet) return;
    
    const normalizedValue = value == null ? '' : String(value);

    const action: Action = {
      type: 'cell_update',
      data: {
        sheetId: activeSheet.id,
        row,
        col,
        oldValue: activeSheet.cells[`${row}-${col}`] || "",
        newValue: normalizedValue
      },
      timestamp: Date.now()
    };
    
    addToHistory(action);
    
    // Update local state
    setSheets(prevSheets => 
      prevSheets.map(sheet => {
        if (sheet.id === activeSheet.id) {
          const newCells = { ...sheet.cells };
          if (normalizedValue.trim() === "") {
            delete newCells[`${row}-${col}`];
          } else {
            newCells[`${row}-${col}`] = normalizedValue;
          }
          return { ...sheet, cells: newCells };
        }
        return sheet;
      })
    );

    // Sync to database (headers use row 0; data rows follow same zero-based index)
    try {
      await syncCell(activeSheet.id, row + 1, col, normalizedValue);
    } catch (error) {
      console.error('Error syncing cell to database:', error);
    }
  };

  const updateColumnHeader = async (colIndex: number, newHeader: string) => {
    if (!activeSheet) return;

    const normalizedHeader = newHeader == null ? '' : String(newHeader);
    
    const action: Action = {
      type: 'column_header_update',
      data: {
        sheetId: activeSheet.id,
        col: colIndex,
        oldValue: activeSheet.columnHeaders[colIndex],
        newValue: normalizedHeader
      },
      timestamp: Date.now()
    };
    
    addToHistory(action);
    
    // Update local state
    setSheets(prevSheets => 
      prevSheets.map(sheet => {
        if (sheet.id === activeSheet.id) {
          const newHeaders = [...sheet.columnHeaders];
          newHeaders[colIndex] = normalizedHeader;
          return { ...sheet, columnHeaders: newHeaders };
        }
        return sheet;
      })
    );
    
    // Sync header to database by updating the first row (row 0)
    try {
      await syncCell(activeSheet.id, 0, colIndex, normalizedHeader); // Use row 0 for headers
    } catch (error) {
      console.error('Error syncing column header to database:', error);
    }
  };

  const addNewColumn = async () => {
    if (!activeSheet) return;
    
    const newColumnIndex = activeSheet.columnHeaders.length;
    const newHeader = `COLUMN_${newColumnIndex + 1}`;
    
    const action: Action = {
      type: 'add_column',
      data: {
        sheetId: activeSheet.id,
        col: newColumnIndex,
        value: newHeader
      },
      timestamp: Date.now()
    };
    
    addToHistory(action);

    try {
      await createDynamicTable(activeSheet.id, newColumnIndex + 1);
    } catch (error) {
      console.error('Error ensuring columns:', error);
    }
    
    // Update local state
    setSheets(prevSheets => 
      prevSheets.map(sheet => {
        if (sheet.id === activeSheet.id) {
          return { 
            ...sheet, 
            columnHeaders: [...sheet.columnHeaders, newHeader] 
          };
        }
        return sheet;
      })
    );
  };

  const removeColumn = async (colIndex: number) => {
    if (!activeSheet) return;

    if (activeSheet.columnHeaders.length <= 1) {
      toast("You need at least one column in a sheet.");
      return;
    }

    if (isSupabaseBackend) {
      toast('Removing columns is only supported while using the local SQLite backend.');
      return;
    }

    const targetHeader = activeSheet.columnHeaders[colIndex];
    const newColumnCount = activeSheet.columnHeaders.length - 1;

    try {
      await dataClient.deleteColumn(activeSheet.id, colIndex);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove column.';
      toast(message);
      return;
    }

    setSheets(prevSheets =>
      prevSheets.map(sheet => {
        if (sheet.id !== activeSheet.id) return sheet;

        const newHeaders = sheet.columnHeaders.filter((_, index) => index !== colIndex);
        const newCells: { [key: string]: string } = {};

        Object.entries(sheet.cells).forEach(([key, value]) => {
          const [rowStr, colStr] = key.split('-');
          const rowIdx = Number(rowStr);
          const columnIdx = Number(colStr);

          if (Number.isNaN(rowIdx) || Number.isNaN(columnIdx)) return;

          if (columnIdx < colIndex) {
            newCells[key] = value;
          } else if (columnIdx > colIndex) {
            newCells[`${rowIdx}-${columnIdx - 1}`] = value;
          }
        });

        return {
          ...sheet,
          columnHeaders: newHeaders,
          cells: newCells,
        };
      })
    );

    setColumnWidths(prev => {
      const next: { [key: string]: number } = {};
      Object.entries(prev).forEach(([key, width]) => {
        const [sheetId, colStr] = key.split('-');
        if (sheetId !== activeSheet.id) {
          next[key] = width;
          return;
        }

        const columnIdx = Number(colStr);
        if (Number.isNaN(columnIdx)) return;

        if (columnIdx < colIndex) {
          next[key] = width;
        } else if (columnIdx > colIndex) {
          next[`${sheetId}-${columnIdx - 1}`] = width;
        }
      });
      return next;
    });

    setSelection(prev => {
      const adjustColumn = (col: number) => {
        if (col > colIndex) return Math.max(0, col - 1);
        if (col >= newColumnCount) return Math.max(0, newColumnCount - 1);
        return Math.max(0, col);
      };

      return {
        start: { row: prev.start.row, col: adjustColumn(prev.start.col) },
        end: { row: prev.end.row, col: adjustColumn(prev.end.col) },
        type: prev.type === 'column' ? 'column' : prev.type,
      };
    });

    toast(`${targetHeader || 'Column'} removed.`);
  };

  const addNewRow = () => {
    setRowCount(prev => prev + 1);
  };

  const addNewSheet = async () => {
    if (!spreadsheetId) return;
    
    try {
      const newSheet = await dataClient.createSheet(spreadsheetId, `Sheet ${sheets.length + 1}`);
      
      await createDynamicTable(newSheet.id, 5); // Start with 5 columns
      
      const newSheetData: SheetData = {
        id: newSheet.id,
        name: newSheet.name,
        cells: {},
        columnHeaders: ["COLUMN_1", "COLUMN_2", "COLUMN_3", "COLUMN_4", "COLUMN_5"]
      };
      
      setSheets(prev => [...prev, newSheetData]);
      setActiveSheetId(newSheet.id);
    } catch (error) {
      console.error('Error creating new sheet:', error);
    }
  };

  const renameSheet = async (sheetId: string, newName: string) => {
    try {
      await dataClient.updateSheetName(sheetId, newName);
      
      setSheets(prevSheets => 
        prevSheets.map(sheet => 
          sheet.id === sheetId 
            ? { ...sheet, name: newName }
            : sheet
        )
      );
    } catch (error) {
      console.error('Error renaming sheet:', error);
    }
  };

  const deleteSheet = async (sheetId: string) => {
    if (sheets.length <= 1) return; // Don't delete the last sheet
    
    try {
      await dataClient.deleteSheet(sheetId);
      
      const remainingSheets = sheets.filter(sheet => sheet.id !== sheetId);
      setSheets(remainingSheets);
      
      if (activeSheetId === sheetId && remainingSheets.length > 0) {
        setActiveSheetId(remainingSheets[0].id);
      }
    } catch (error) {
      console.error('Error deleting sheet:', error);
    }
  };

  const clearSelectedCells = () => {
    if (!activeSheet) return;
    
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        updateCell(row, col, "");
      }
    }
  };

  const undo = () => {
    if (historyIndex < 0 || !activeSheet) return;
    
    const action = history[historyIndex];
    
    if (action.type === 'cell_update') {
      // Revert cell change
      const { sheetId, row, col, oldValue } = action.data;
      setSheets(prevSheets => 
        prevSheets.map(sheet => {
          if (sheet.id === sheetId) {
            const newCells = { ...sheet.cells };
            if (oldValue === "") {
              delete newCells[`${row}-${col}`];
            } else {
              newCells[`${row}-${col}`] = oldValue;
            }
            return { ...sheet, cells: newCells };
          }
          return sheet;
        })
      );
      
      // Sync to database using zero-based row index
      syncCell(sheetId, row + 1, col, oldValue || "").catch(console.error);
    } else if (action.type === 'column_header_update') {
      const { sheetId, col, oldValue } = action.data;
      setSheets(prevSheets => 
        prevSheets.map(sheet => {
          if (sheet.id === sheetId) {
            const newHeaders = [...sheet.columnHeaders];
            newHeaders[col] = oldValue || "";
            return { ...sheet, columnHeaders: newHeaders };
          }
          return sheet;
        })
      );
      
      // Sync header to database
      syncCell(sheetId, 0, col, oldValue || "").catch(console.error); // Use row 0 for headers
    }
    
    setHistoryIndex(historyIndex - 1);
  };

  const getSelectedCellsContent = () => {
    if (!activeSheet) return {};
    
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    
    const selectedCells: { [key: string]: string } = {};
    
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cellKey = `${row}-${col}`;
        const rawValue = activeSheet.cells[cellKey];
        const cellValue = rawValue === undefined || rawValue === null ? '' : String(rawValue);
        if (cellValue.trim()) {
          const columnLetter = String.fromCharCode(65 + col);
          const readableKey = `${columnLetter}${row + 1}`;
          selectedCells[readableKey] = cellValue;
        }
      }
    }
    
    return selectedCells;
  };

  const transformTableDataToSheetState = (tableData: SheetTableData | null | undefined) => {
    const cells: { [key: string]: string } = {};
    const columnHeaders: string[] = [];
    const hasActiveFilters = tableData?.filters && tableData.filters.length > 0;

    if (tableData?.data && tableData.data.length > 0) {
      const columnNames = Object.keys(tableData.data[0] ?? {})
        .filter(key => key.startsWith('column_'))
        .sort();

      const headerRowNumber = tableData.data.reduce((min: number, row: any) => {
        const value = typeof row.row_number === 'number' ? row.row_number : Number(row.row_number ?? 0);
        return Number.isFinite(value) ? Math.min(min, value) : min;
      }, Number.POSITIVE_INFINITY);

      const effectiveHeaderRow = Number.isFinite(headerRowNumber) ? headerRowNumber : 0;

      tableData.data.forEach((row: any) => {
        const rawRowNumber = typeof row.row_number === 'number' ? row.row_number : Number(row.row_number ?? 0);
        const rowNumber = Number.isFinite(rawRowNumber) ? rawRowNumber : 0;

        columnNames.forEach((colName, colIndex) => {
          const cellValue = row[colName];

          if (rowNumber === effectiveHeaderRow) {
            if (typeof cellValue === 'string' && cellValue.trim() !== '') {
              columnHeaders[colIndex] = cellValue;
            }
          } else if (rowNumber > effectiveHeaderRow) {
            const zeroBasedRow = rowNumber - effectiveHeaderRow - 1;
            if (zeroBasedRow >= 0 && cellValue !== null && cellValue !== undefined && cellValue !== '') {
              cells[`${zeroBasedRow}-${colIndex}`] = cellValue;
            }
          }
        });
      });
    }

    if (columnHeaders.length === 0) {
      columnHeaders.push('COLUMN_1', 'COLUMN_2', 'COLUMN_3', 'COLUMN_4', 'COLUMN_5');
    }

    // Extract the actual row numbers from data for display (handles filters and deleted rows)
    const actualRowNumbers = Array.from(new Set(Object.keys(cells).map(key => parseInt(key.split('-')[0])))).sort((a, b) => a - b);
    const hasGaps = actualRowNumbers.length > 0 && actualRowNumbers.some((num, idx) => idx > 0 && num !== actualRowNumbers[idx - 1] + 1);
    const displayRowNumbers = (hasActiveFilters || hasGaps) ? actualRowNumbers : undefined;

    return { cells, columnHeaders, hasActiveFilters, displayRowNumbers };
  };

  const refreshActiveSheetFromServer = async () => {
    if (!activeSheet) return;

    try {
      const tableData = await loadSheetData(activeSheet.id);
      const { cells, columnHeaders, hasActiveFilters, displayRowNumbers } = transformTableDataToSheetState(tableData);

      setSheets(prevSheets =>
        prevSheets.map(sheet =>
          sheet.id === activeSheet.id
            ? {
                ...sheet,
                cells,
                columnHeaders,
                hasActiveFilters,
                displayRowNumbers,
              }
            : sheet
        )
      );

      // Sync filter state from server
      if (tableData?.filters && tableData.filters.length > 0) {
        setActiveFilters(prev => {
          const without = prev.filter(item => item.sheetId !== activeSheet.id);
          return [...without, { sheetId: activeSheet.id, filters: tableData.filters }];
        });
      } else {
        // No filters - remove from state
        setActiveFilters(prev => prev.filter(item => item.sheetId !== activeSheet.id));
      }
    } catch (error) {
      console.error('Failed to refresh sheet after assistant update', error);
    }
  };

  const handleAssistantToolCalls = (toolCalls: ToolCall[] | null | undefined) => {
    if (!toolCalls || toolCalls.length === 0) return;

    // Handle new sheet creation - reload entire spreadsheet to pick up new sheets
    const hasNewSheet = toolCalls.some(call => (call?.kind === 'create_sheet' || call?.kind === 'create_table_as') && call.status === 'ok');
    if (hasNewSheet) {
      loadSpreadsheet();
      return; // Full reload will handle everything
    }

    // Handle data mutations - refresh the sheet
    const hasMutation = toolCalls.some(call => (call?.kind === 'write' || call?.kind === 'delete') && call.status === 'ok');
    if (hasMutation) {
      refreshActiveSheetFromServer();
    }

    // Handle highlight clear - if present, start fresh instead of appending
    const hasClear = toolCalls.some(call => call?.kind === 'highlight_clear' && call.status === 'ok');

    // Handle cell highlights - collect all highlight calls
    const highlightCalls = toolCalls.filter(call => call?.kind === 'highlight' && call.status === 'ok');
    if (hasClear || highlightCalls.length > 0) {
      const newHighlights = highlightCalls
        .filter(call => call.sheetId && (call.range || (call.condition && call.rowNumbers)))
        .map(call => ({
          sheetId: call.sheetId!,
          range: call.range,
          condition: call.condition,
          // Convert 1-based row_numbers from backend to 0-based row indices for frontend
          rowNumbers: call.rowNumbers?.map(n => n - 1),
          color: call.color || 'yellow',
          message: call.message || null,
        }));

      // If clear was called, replace all highlights; otherwise append
      setActiveHighlights(hasClear ? newHighlights : prev => [...prev, ...newHighlights]);
    }

    // Handle filter clear
    const hasFilterClear = toolCalls.some(call => call?.kind === 'filter_clear' && call.status === 'ok');

    // Handle filters - collect all filter_add calls
    const filterCalls = toolCalls.filter(call => call?.kind === 'filter' && call.status === 'ok');
    if (hasFilterClear || filterCalls.length > 0) {
      // Group filters by sheet
      const filtersBySheet = new Map<string, FilterCondition[]>();

      filterCalls.forEach(call => {
        if (call.sheetId && call.condition) {
          const existing = filtersBySheet.get(call.sheetId) || [];
          existing.push({ condition: call.condition });
          filtersBySheet.set(call.sheetId, existing);
        }
      });

      // Convert to array format
      const newFilters = Array.from(filtersBySheet.entries()).map(([sheetId, filters]) => ({
        sheetId,
        filters,
      }));

      // If filter_clear was called, replace all filters for affected sheets
      if (hasFilterClear) {
        const clearedSheetIds = new Set(
          toolCalls
            .filter(call => call?.kind === 'filter_clear' && call.status === 'ok')
            .map(call => call.sheetId)
            .filter(Boolean) as string[]
        );

        setActiveFilters(prev => {
          // Remove filters for cleared sheets
          const remaining = prev.filter(item => !clearedSheetIds.has(item.sheetId));
          // Add new filters
          return [...remaining, ...newFilters];
        });
      } else if (newFilters.length > 0) {
        // Append new filters
        setActiveFilters(prev => {
          const updated = [...prev];
          newFilters.forEach(newItem => {
            const existingIndex = updated.findIndex(item => item.sheetId === newItem.sheetId);
            if (existingIndex >= 0) {
              updated[existingIndex] = {
                ...updated[existingIndex],
                filters: [...updated[existingIndex].filters, ...newItem.filters],
              };
            } else {
              updated.push(newItem);
            }
          });
          return updated;
        });
      }

      // Refresh the sheet to apply filters
      refreshActiveSheetFromServer();
    }
  };

  const handleChatCommand = (command: string) => {
    console.log("Chat command:", command);
  };

  const clearHighlights = () => {
    setActiveHighlights([]);
  };

  const clearFilters = async (sheetId?: string) => {
    if (sheetId) {
      // Clear filters on backend
      try {
        await dataClient.clearFilters(sheetId);
      } catch (error) {
        console.error('Failed to clear filters on backend:', error);
      }

      // Clear from local state
      setActiveFilters(prev => prev.filter(item => item.sheetId !== sheetId));

      // Refresh the sheet to show unfiltered data
      refreshActiveSheetFromServer();
    } else {
      setActiveFilters([]);
    }
  };

  const updateColumnWidth = (colIndex: number, width: number) => {
    setColumnWidths(prev => {
      const updated = {
        ...prev,
        [`${activeSheetId}-${colIndex}`]: Math.max(60, width)
      };
      localStorage.setItem('columnWidths', JSON.stringify(updated));
      return updated;
    });
  };

  const updateRowHeight = (rowIndex: number, height: number) => {
    setRowHeights(prev => {
      const updated = {
        ...prev,
        [`${activeSheetId}-${rowIndex}`]: Math.max(24, height)
      };
      localStorage.setItem('rowHeights', JSON.stringify(updated));
      return updated;
    });
  };

  const getColumnWidth = (colIndex: number) => {
    return columnWidths[`${activeSheetId}-${colIndex}`] || 200;
  };

  const getRowHeight = (rowIndex: number) => {
    return rowHeights[`${activeSheetId}-${rowIndex}`] || 40;
  };

  // Resize functionality
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const newWidth = window.innerWidth - e.clientX;
    const minWidth = 300;
    const maxWidth = 800;
    
    setChatPanelWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-muted-foreground">Loading spreadsheet...</div>
      </div>
    );
  }

  if (!spreadsheet || !activeSheet) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="text-muted-foreground">Spreadsheet not found</div>
          <Button onClick={() => navigate('/')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <Button onClick={() => navigate('/')} variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-xl font-semibold text-foreground">
            {spreadsheet.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={undo} 
            variant="outline" 
            size="sm"
            disabled={historyIndex < 0}
          >
            <Undo className="w-4 h-4 mr-2" />
            Undo
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top section with spreadsheet and chat */}
        <div className="flex-1 flex overflow-hidden">
          {/* Spreadsheet area */}
          <div
            className="flex-1 flex flex-col"
            style={{ width: `calc(100% - ${chatPanelWidth}px)` }}
          >
            {/* Coordinate display */}
            <div className="border-b border-border bg-card/30 px-4 py-2">
              <CoordinateDisplay
                selection={selection}
                cellContent={
                  activeSheet && selection.start.row === selection.end.row && selection.start.col === selection.end.col
                    ? activeSheet.cells[`${selection.start.row}-${selection.start.col}`]
                    : undefined
                }
              />
            </div>

            {/* Spreadsheet grid */}
            <div className="flex-1 overflow-auto">
              {activeSheet ? (
                <SpreadsheetGrid
                  sheet={activeSheet}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onCellUpdate={updateCell}
                  onColumnHeaderUpdate={updateColumnHeader}
                  onAddColumn={addNewColumn}
                  onRemoveColumn={removeColumn}
                  onAddRow={addNewRow}
                  onClearSelectedCells={clearSelectedCells}
                  rowCount={effectiveRowCount}
                  displayRowNumbers={activeSheet.displayRowNumbers}
                  columnWidths={columnWidths}
                  rowHeights={rowHeights}
                  onColumnResize={updateColumnWidth}
                  onRowResize={updateRowHeight}
                  getColumnWidth={getColumnWidth}
                  getRowHeight={getRowHeight}
                  highlights={activeHighlights.filter(h => h.sheetId === activeSheet.id)}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Loading sheet data...
                </div>
              )}
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="w-1 bg-border hover:bg-border/80 cursor-col-resize transition-colors"
            onMouseDown={handleMouseDown}
          />

          {/* Chat panel */}
          <div
            className="bg-card border-l border-border flex flex-col"
            style={{ width: `${chatPanelWidth}px` }}
          >
            <ChatPanel
              selectedCells={getSelectedCellsContent()}
              spreadsheetId={spreadsheetId}
              activeSheetId={activeSheet?.id}
              onCommand={handleChatCommand}
              onAssistantToolCalls={handleAssistantToolCalls}
              highlights={activeHighlights}
              onClearHighlights={clearHighlights}
              filters={activeFilters.find(item => item.sheetId === activeSheet?.id)?.filters || []}
              onClearFilters={() => activeSheet && clearFilters(activeSheet.id)}
            />
          </div>
        </div>

        {/* Sheet tabs at bottom */}
        <div className="h-12 border-t border-border bg-card">
          <SheetTabs
            sheets={sheets}
            activeSheetId={activeSheetId}
            onSheetSelect={setActiveSheetId}
            onAddSheet={addNewSheet}
            onSheetRename={renameSheet}
            onSheetDelete={deleteSheet}
          />
        </div>
      </div>
    </div>
  );
};

export default SpreadsheetView;
