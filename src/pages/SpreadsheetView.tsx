import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Undo, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpreadsheetGrid } from "@/components/SpreadsheetGrid";
import { SheetTabs } from "@/components/SheetTabs";
import { CoordinateDisplay } from "@/components/CoordinateDisplay";
import { ChatPanel } from "@/components/ChatPanel";
import { FileImport } from "@/components/FileImport";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { FillConfirmationDialog } from "@/components/FillConfirmationDialog";
import { AIPromptDialog } from "@/components/AIPromptDialog";
import {
  dataClient,
  isSupabaseBackend,
  type SpreadsheetRecord,
  type ToolCall,
  type SheetTableData,
  type CellHighlight,
  type FilterCondition,
  type SelectionSnapshot,
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
  const storageKey = spreadsheetId ? `activeSheet-${spreadsheetId}` : null;
  const [activeSheetId, setActiveSheetIdState] = useState<string>(() => {
    if (!storageKey) return "";
    try {
      return localStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  });

  const setActiveSheetId = useCallback((sheetId: string) => {
    setActiveSheetIdState(sheetId);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, sheetId);
    } catch {
      // ignore storage failures
    }
  }, [storageKey]);
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
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const gridContainerRef = useRef<HTMLDivElement>(null);
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
  // Otherwise, calculate actual row count from cells
  const visibleRowCount = activeSheet ? activeSheet.rowOrder.length : 0;
  const effectiveRowCount = activeSheet?.hasActiveFilters
    ? visibleRowCount
    : Math.max(visibleRowCount + 10, rowCount);

  const toCellString = (value: unknown) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
      return String(value);
    } catch {
      return '';
    }
  };

  // Calculate actual data row count (excluding empty rows)
  const dataRowCount = activeSheet ? (() => {
    return activeSheet.rowOrder.length;
  })() : 0;

  useEffect(() => {
    if (spreadsheetId) {
      loadSpreadsheet();
    }
  }, [spreadsheetId]);

  // Handle pending import from SpreadsheetsList
  useEffect(() => {
    const checkPendingImport = async () => {
      const pendingImportStr = sessionStorage.getItem('pendingImport');
      if (!pendingImportStr) return;

      try {
        const pendingImport = JSON.parse(pendingImportStr);
        if (pendingImport.spreadsheetId === spreadsheetId && pendingImport.sheetId && pendingImport.data) {
          // Clear the pending import
          sessionStorage.removeItem('pendingImport');

          // Import the data
          const { data, sheetId } = pendingImport;

          // Use bulk import for efficiency (will create columns from headers)
          await dataClient.importBulkData(sheetId, data.headers, data.rows);

          // Reload to show the imported data
          await loadSpreadsheet();

          toast(`Imported ${data.rows.length} rows successfully`);
        }
      } catch (error) {
        console.error('Error processing pending import:', error);
        sessionStorage.removeItem('pendingImport');
      }
    };

    checkPendingImport();
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
          
          const { cells, columnHeaders, columnMeta, rowOrder, hasActiveFilters, view } = transformTableDataToSheetState(sheetData);

          loadedSheets.push({
            id: sheet.id,
            name: sheet.name,
            cells,
            columnHeaders,
            hasActiveFilters,
            rowOrder,
            columnMeta,
            view
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
              columnHeaders: ["COLUMN_1", "COLUMN_2", "COLUMN_3", "COLUMN_4", "COLUMN_5"],
              rowOrder: [],
              columnMeta: [],
              view: undefined
            });
          } catch (createError) {
            console.error(`Failed to create dynamic table for sheet ${sheet.id}:`, createError);
            // Create empty sheet as last resort
            loadedSheets.push({
              id: sheet.id,
              name: sheet.name,
              cells: {},
              columnHeaders: ["COLUMN_1", "COLUMN_2", "COLUMN_3", "COLUMN_4", "COLUMN_5"],
              rowOrder: [],
              columnMeta: [],
              view: undefined
            });
          }
        }
      }

      setSheets(loadedSheets);
      if (loadedSheets.length > 0) {
        const currentActive = activeSheetId && loadedSheets.some(sheet => sheet.id === activeSheetId)
          ? activeSheetId
          : loadedSheets[0].id;

        setActiveSheetId(currentActive);
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

    const totalRows = activeSheet.hasActiveFilters ? activeSheet.rowOrder.length : effectiveRowCount;

    for (let row = 0; row < totalRows; row++) {
      gridData[row] = [];
      for (let col = 0; col < activeSheet.columnHeaders.length; col++) {
        const cellKey = `${row}-${col}`;
        gridData[row][col] = {
          value: activeSheet.cells[cellKey] || ""
        };
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
        rowId: activeSheet.rowOrder[row] ?? null,
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
      const rowId = activeSheet.rowOrder[row] ?? null;
      const response = await syncCell(activeSheet.id, {
        rowId,
        displayIndex: row,
        columnIndex: col,
        value: normalizedValue,
        viewHash: activeSheet.view?.hash,
      });

      if (response) {
        setSheets(prevSheets =>
          prevSheets.map(sheet => {
            if (sheet.id !== activeSheet.id) return sheet;

            const nextRowOrder = [...sheet.rowOrder];

            if (response.rowId && typeof response.displayIndex === 'number') {
              while (nextRowOrder.length <= response.displayIndex) {
                nextRowOrder.push(null);
              }

              // Remove duplicates of the same row id
              for (let idx = 0; idx < nextRowOrder.length; idx++) {
                if (nextRowOrder[idx] === response.rowId && idx !== response.displayIndex) {
                  nextRowOrder[idx] = null;
                }
              }

              nextRowOrder[response.displayIndex] = response.rowId;
            } else if (response.rowId) {
              // Row removed from view
              const filtered = nextRowOrder.filter(id => id !== response.rowId);
              nextRowOrder.length = 0;
              filtered.forEach(id => nextRowOrder.push(id));
            }

            return {
              ...sheet,
              rowOrder: nextRowOrder,
              view: response.view,
            };
          })
        );
      }
    } catch (error) {
      console.error('Error syncing cell to database:', error);
      await refreshActiveSheetFromServer();
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
      await syncCell(activeSheet.id, {
        columnIndex: colIndex,
        value: normalizedHeader,
        isHeader: true,
        viewHash: activeSheet.view?.hash,
      });
    } catch (error) {
      console.error('Error syncing column header to database:', error);
      await refreshActiveSheetFromServer();
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

      const freshData = await loadSheetData(newSheet.id);
      const { cells, columnHeaders, columnMeta, rowOrder, hasActiveFilters, view } = transformTableDataToSheetState(freshData);

      const newSheetData: SheetData = {
        id: newSheet.id,
        name: newSheet.name,
        cells,
        columnHeaders,
        hasActiveFilters,
        rowOrder,
        columnMeta,
        view,
      };

      setSheets(prev => [...prev, newSheetData]);
      setActiveSheetId(newSheet.id);
    } catch (error) {
      console.error('Error creating new sheet:', error);
    }
  };

  const handleFileImport = async (data: { sheetName: string; headers: string[]; rows: string[][] }) => {
    if (!spreadsheetId) return;

    try {
      // Create new sheet with imported name
      const newSheet = await dataClient.createSheet(spreadsheetId, data.sheetName);

      // Create table with correct number of columns
      await createDynamicTable(newSheet.id, data.headers.length);

      // Use bulk import for efficiency
      await dataClient.importBulkData(newSheet.id, data.headers, data.rows);

      // Reload spreadsheet to show the new sheet
      await loadSpreadsheet();

      // Switch to the newly imported sheet
      setActiveSheetId(newSheet.id);

      toast(`Imported ${data.rows.length} rows successfully`);
    } catch (error) {
      console.error('Error importing file:', error);
      toast("Failed to import file data.");
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

  const handleTitleClick = () => {
    if (spreadsheet) {
      setEditedTitle(spreadsheet.name);
      setIsEditingTitle(true);
    }
  };

  const handleTitleSave = async () => {
    if (!spreadsheetId || !editedTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }

    try {
      await dataClient.updateSpreadsheet(spreadsheetId, { name: editedTitle.trim() });
      setSpreadsheet(prev => prev ? { ...prev, name: editedTitle.trim() } : null);
      setIsEditingTitle(false);
    } catch (error) {
      console.error('Error renaming spreadsheet:', error);
      setIsEditingTitle(false);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
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
      const { sheetId, row, col, oldValue, rowId } = action.data;
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
      
      syncCell(sheetId, {
        rowId: rowId ?? activeSheet.rowOrder[row] ?? null,
        displayIndex: row,
        columnIndex: col,
        value: oldValue || "",
        viewHash: activeSheet.view?.hash,
      }).catch(console.error);
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
      syncCell(sheetId, {
        columnIndex: col,
        value: oldValue || "",
        isHeader: true,
        viewHash: activeSheet.view?.hash,
      }).catch(console.error);
    }
    
    setHistoryIndex(historyIndex - 1);
  };

  const colToLetter = (colIndex: number): string => {
    let label = '';
    let num = colIndex + 1;
    while (num > 0) {
      num -= 1;
      label = String.fromCharCode(65 + (num % 26)) + label;
      num = Math.floor(num / 26);
    }
    return label;
  };

  const getSelectionSnapshot = () => {
    if (!activeSheet) return null;

    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);

    const cells: SelectionSnapshot['cells'] = [];
    const rowIdsSet = new Set<string>();
    const columnIdsSet = new Set<string>();

    for (let row = minRow; row <= maxRow; row++) {
      const rowId = activeSheet.rowOrder[row] ?? null;
      if (rowId) {
        rowIdsSet.add(rowId);
      }

      for (let col = minCol; col <= maxCol; col++) {
        const columnMeta = activeSheet.columnMeta?.[col];
        if (columnMeta?.column_id) {
          columnIdsSet.add(columnMeta.column_id);
        }

        const cellKey = `${row}-${col}`;
        const rawValue = activeSheet.cells[cellKey];
        const cellValue = rawValue === undefined || rawValue === null ? '' : String(rawValue);

        if (cellValue.trim()) {
          const coord = `${colToLetter(col)}${row + 1}`;
          cells.push({
            coord,
            value: cellValue,
            rowId,
            columnId: columnMeta?.column_id ?? null,
            rowIndex: row,
            columnIndex: col,
          });
        }
      }
    }

    if (cells.length === 0 && rowIdsSet.size === 0 && columnIdsSet.size === 0) {
      return null;
    }

    const startCoord = `${colToLetter(minCol)}${minRow + 1}`;
    const endCoord = `${colToLetter(maxCol)}${maxRow + 1}`;
    const coords = minRow === maxRow && minCol === maxCol ? startCoord : `${startCoord}:${endCoord}`;

    return {
      sheetId: activeSheet.id,
      sheetName: activeSheet.name,
      view: activeSheet.view,
      coords,
      rowIds: Array.from(rowIdsSet),
      columnIds: Array.from(columnIdsSet),
      anchor: 'ids' as const,
      cells,
    } satisfies SelectionSnapshot;
  };

  const transformTableDataToSheetState = (tableData: SheetTableData | null | undefined) => {
    const cells: { [key: string]: string } = {};
    const columnHeaders: string[] = [];
    const columnMeta = tableData?.columns ?? [];
    const rowOrder: (string | null)[] = [];
    const hasActiveFilters = Boolean(tableData?.filters && tableData.filters.length > 0);

    if (columnMeta.length > 0) {
      columnMeta.forEach((column, index) => {
        columnHeaders[index] = column.header || column.sql_name || `COLUMN_${index + 1}`;
      });
    }

    if (tableData?.rows && tableData.rows.length > 0) {
      tableData.rows.forEach((row) => {
        if (!row || typeof row.display_index !== 'number') {
          return;
        }

        const zeroBasedRow = Math.max(0, row.display_index - 1);
        rowOrder[zeroBasedRow] = row.row_id;

        columnMeta.forEach((column, colIndex) => {
          const rawValue = row.values?.[column.column_id] ?? null;
          if (rawValue !== null && rawValue !== undefined && String(rawValue).length > 0) {
            cells[`${zeroBasedRow}-${colIndex}`] = String(rawValue);
          }
        });
      });
    }

    if (columnHeaders.length === 0) {
      columnHeaders.push('COLUMN_1', 'COLUMN_2', 'COLUMN_3', 'COLUMN_4', 'COLUMN_5');
    }

    return { cells, columnHeaders, columnMeta, rowOrder, hasActiveFilters, view: tableData?.view };
  };

  const refreshActiveSheetFromServer = async () => {
    if (!activeSheet) return;

    try {
      const tableData = await loadSheetData(activeSheet.id);
      const { cells, columnHeaders, columnMeta, rowOrder, hasActiveFilters, view } = transformTableDataToSheetState(tableData);

      setSheets(prevSheets =>
        prevSheets.map(sheet =>
          sheet.id === activeSheet.id
            ? {
                ...sheet,
                cells,
                columnHeaders,
                hasActiveFilters,
                rowOrder,
                columnMeta,
                view,
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
        .filter(call => call.sheetId && (call.range || call.condition || (call.rowIds && call.rowIds.length > 0)))
        .map(call => ({
          sheetId: call.sheetId!,
          range: call.range,
          condition: call.condition,
          rowIds: call.rowIds ?? [],
          color: call.color || 'yellow',
          message: call.message || null,
        }));

      // If clear was called, replace all highlights; otherwise append
      setActiveHighlights(hasClear ? newHighlights : prev => [...prev, ...newHighlights]);

      // Scroll to first new highlight for the active sheet
      if (newHighlights.length > 0 && activeSheet) {
        const firstHighlight = newHighlights.find(h => h.sheetId === activeSheet.id);
        if (firstHighlight) {
          // Use setTimeout to ensure the highlights are rendered first
          setTimeout(() => scrollToHighlight(firstHighlight), 100);
        }
      }
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

  const scrollToHighlight = (highlight: CellHighlight) => {
    if (!gridContainerRef.current || !activeSheet) return;

    let targetRow: number | undefined;
    let targetCol: number | undefined;

    // Determine target cell from highlight
    if (highlight.range) {
      // Parse range like "A1:B5" to get first cell
      const match = highlight.range.match(/^([A-Z]+)(\d+)/);
      if (match) {
        targetCol = match[1].charCodeAt(0) - 65; // Convert A->0, B->1, etc
        targetRow = parseInt(match[2]) - 1; // Convert 1-based to 0-based
      }
    } else if (highlight.rowIds && highlight.rowIds.length > 0) {
      const rowIndex = activeSheet.rowOrder.findIndex(id => id === highlight.rowIds![0]);
      if (rowIndex >= 0) {
        targetRow = rowIndex;
        targetCol = 0;
      }
    }

    if (targetRow !== undefined && targetCol !== undefined) {
      // Estimate row height and column width
      const rowHeight = getRowHeight(targetRow);
      const headerHeight = 40; // Approximate header height
      const scrollTop = targetRow * rowHeight;

      // Scroll to the target row
      gridContainerRef.current.scrollTop = Math.max(0, scrollTop - headerHeight);

      // Update selection to highlight the cell
      setSelection({
        start: { row: targetRow, col: targetCol },
        end: { row: targetRow, col: targetCol },
        type: 'cell'
      });
    }
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

  const [fillRequestMessage, setFillRequestMessage] = useState<string | null>(null);
  const [fillConfirmDialog, setFillConfirmDialog] = useState<{
    sourceRange: string;
    targetRange: string;
    sourceData: string[][];
  } | null>(null);
  const [aiPromptDialog, setAiPromptDialog] = useState<{
    targetCell: string;
    prompt: string;
    selectedRange?: string;
  } | null>(null);

  const handleFillRequest = (sourceRange: string, targetRange: string, sourceData: string[][], skipConfirmation: boolean) => {
    if (skipConfirmation) {
      // Skip dialog and send directly to AI
      handleFillConfirm(undefined, sourceRange, targetRange, sourceData);
    } else {
      // Show confirmation dialog
      setFillConfirmDialog({ sourceRange, targetRange, sourceData });
    }
  };

  const handleAIPromptRequest = (targetCell: string, prompt: string, selectedRange?: string) => {
    setAiPromptDialog({ targetCell, prompt, selectedRange });
  };

  const handleAIPromptConfirm = (prompt: string) => {
    if (!aiPromptDialog) return;

    let message = `I need help filling cell ${aiPromptDialog.targetCell}.\n\nPrompt: ${prompt}`;

    if (aiPromptDialog.selectedRange) {
      message += `\n\nSelected range: ${aiPromptDialog.selectedRange}`;
    }

    // Set the message to be sent to the chat panel
    setFillRequestMessage(message);

    // Clear dialog and message after a brief delay
    setAiPromptDialog(null);
    setTimeout(() => setFillRequestMessage(null), 100);
  };

  const handleAIPromptCancel = () => {
    setAiPromptDialog(null);
  };

  const handleFillConfirm = (
    additionalInstructions?: string,
    overrideSourceRange?: string,
    overrideTargetRange?: string,
    overrideSourceData?: string[][]
  ) => {
    // Allow direct calling with override parameters (for skip confirmation)
    const sourceRange = overrideSourceRange || fillConfirmDialog?.sourceRange;
    const targetRange = overrideTargetRange || fillConfirmDialog?.targetRange;
    const sourceData = overrideSourceData || fillConfirmDialog?.sourceData;

    if (!sourceRange || !targetRange || !sourceData) return;

    // Parse source range to get cell references
    const [startCell] = sourceRange.split(':');
    const startColMatch = startCell.match(/^([A-Z]+)(\d+)$/);
    const startCol = startColMatch ? startColMatch[1] : 'A';
    const startRow = startColMatch ? parseInt(startColMatch[2]) : 1;

    // Helper to convert column index to letter
    const colToLetter = (col: number): string => {
      let letter = '';
      let num = col;
      while (num >= 0) {
        letter = String.fromCharCode((num % 26) + 65) + letter;
        num = Math.floor(num / 26) - 1;
      }
      return letter;
    };

    // Helper to convert column letter to index
    const letterToCol = (letter: string): number => {
      let col = 0;
      for (let i = 0; i < letter.length; i++) {
        col = col * 26 + (letter.charCodeAt(i) - 64);
      }
      return col - 1;
    };

    const startColIndex = letterToCol(startCol);

    // Format the data in a more readable way
    let dataPreview = '';

    if (sourceData.length === 1 && sourceData[0].length === 1) {
      // Single cell
      dataPreview = `• ${startCell}: ${sourceData[0][0]}`;
    } else if (sourceData.length === 1) {
      // Single row, multiple columns
      dataPreview = sourceData[0].map((cell, idx) => {
        const cellRef = `${colToLetter(startColIndex + idx)}${startRow}`;
        return `• ${cellRef}: ${cell}`;
      }).join('\n');
    } else if (sourceData[0].length === 1) {
      // Multiple rows, single column
      dataPreview = sourceData.map((row, idx) => {
        const cellRef = `${startCol}${startRow + idx}`;
        return `• ${cellRef}: ${row[0]}`;
      }).join('\n');
    } else {
      // Multiple rows and columns
      dataPreview = sourceData.map((row, rowIdx) => {
        return row.map((cell, colIdx) => {
          const cellRef = `${colToLetter(startColIndex + colIdx)}${startRow + rowIdx}`;
          return `• ${cellRef}: ${cell}`;
        }).join('\n');
      }).join('\n');
    }

    let message = `I'm using the fill handle to extend data from ${sourceRange} to ${targetRange}.\n\nSource range (${sourceRange}):\n${dataPreview}\n\nPlease analyze the pattern and fill the target range (${targetRange}) appropriately.`;

    // Append additional instructions if provided
    if (additionalInstructions) {
      message += `\n\nAdditional instructions: ${additionalInstructions}`;
    }

    // Set the message to be sent to the chat panel
    setFillRequestMessage(message);

    // Clear dialog and message after a brief delay
    setFillConfirmDialog(null);
    setTimeout(() => setFillRequestMessage(null), 100);
  };

  const handleFillCancel = () => {
    setFillConfirmDialog(null);
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
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background">
        <div className="flex items-center gap-4">
          <Button onClick={() => navigate('/')} variant="ghost" size="sm" className="rounded-lg">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          {isEditingTitle ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="text-xl font-medium text-foreground bg-transparent border-b-2 border-primary outline-none px-2 py-1"
              autoFocus
              onFocus={(e) => e.target.select()}
            />
          ) : (
            <h1
              className="text-xl font-medium text-foreground cursor-pointer hover:text-primary transition-colors px-2 py-1"
              onClick={handleTitleClick}
              title="Click to rename"
            >
              {spreadsheet.name}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          <KeyboardShortcuts />
          <FileImport onImport={handleFileImport} />
          <Button
            onClick={undo}
            variant="outline"
            size="sm"
            disabled={historyIndex < 0}
            className="rounded-lg"
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
            <div className="border-b border-border/50 bg-background px-6 py-3 flex items-center justify-between">
              <CoordinateDisplay
                selection={selection}
                cellContent={
                  activeSheet && selection.start.row === selection.end.row && selection.start.col === selection.end.col
                    ? activeSheet.cells[`${selection.start.row}-${selection.start.col}`]
                    : undefined
                }
                selectionSnapshot={getSelectionSnapshot()}
              />
              <div className="text-sm text-muted-foreground">
                {dataRowCount.toLocaleString()} rows
              </div>
            </div>

            {/* Spreadsheet grid */}
            <div ref={gridContainerRef} className="flex-1 relative">
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
                  rowOrder={activeSheet.rowOrder}
                  columnWidths={columnWidths}
                  rowHeights={rowHeights}
                  onColumnResize={updateColumnWidth}
                  onRowResize={updateRowHeight}
                  getColumnWidth={getColumnWidth}
                  getRowHeight={getRowHeight}
                  highlights={activeHighlights.filter(h => h.sheetId === activeSheet.id)}
                  onFillRequest={handleFillRequest}
                  onAIPromptRequest={handleAIPromptRequest}
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
            className="w-1 bg-border/50 hover:bg-primary/20 cursor-col-resize transition-colors"
            onMouseDown={handleMouseDown}
          />

          {/* Chat panel */}
          <div
            className="bg-background border-l border-border/50 flex flex-col"
            style={{ width: `${chatPanelWidth}px` }}
          >
            <ChatPanel
              selection={getSelectionSnapshot()}
              spreadsheetId={spreadsheetId}
              activeSheetId={activeSheet?.id}
              onCommand={handleChatCommand}
              onAssistantToolCalls={handleAssistantToolCalls}
              highlights={activeHighlights}
              onClearHighlights={clearHighlights}
              onScrollToHighlight={scrollToHighlight}
              filters={activeFilters.find(item => item.sheetId === activeSheet?.id)?.filters || []}
              onClearFilters={() => activeSheet && clearFilters(activeSheet.id)}
              programmaticMessage={fillRequestMessage}
            />
          </div>
        </div>

        {/* Sheet tabs at bottom */}
        <div className="h-12 border-t border-border/50 bg-background">
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

      {/* Fill Confirmation Dialog */}
      {fillConfirmDialog && (
        <FillConfirmationDialog
          open={!!fillConfirmDialog}
          sourceRange={fillConfirmDialog.sourceRange}
          targetRange={fillConfirmDialog.targetRange}
          sourceData={fillConfirmDialog.sourceData}
          onConfirm={handleFillConfirm}
          onCancel={handleFillCancel}
        />
      )}

      {/* AI Prompt Dialog */}
      {aiPromptDialog && (
        <AIPromptDialog
          open={!!aiPromptDialog}
          targetCell={aiPromptDialog.targetCell}
          prompt={aiPromptDialog.prompt}
          selectedRange={aiPromptDialog.selectedRange}
          onConfirm={handleAIPromptConfirm}
          onCancel={handleAIPromptCancel}
        />
      )}
    </div>
  );
};

export default SpreadsheetView;
