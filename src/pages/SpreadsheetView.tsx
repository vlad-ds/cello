import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Undo, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpreadsheetGrid } from "@/components/SpreadsheetGrid";
import { SheetTabs } from "@/components/SheetTabs";
import { CoordinateDisplay } from "@/components/CoordinateDisplay";
import { ChatPanel } from "@/components/ChatPanel";
import { supabase } from "@/integrations/supabase/client";
import { useSpreadsheetSync } from "@/hooks/useSpreadsheetSync";
import { CellData, SheetData, CellSelection, Action } from "./Index";

interface DBSpreadsheet {
  id: string;
  name: string;
}

interface DBSheet {
  id: string;
  spreadsheet_id: string;
  name: string;
}

const SpreadsheetView = () => {
  const { spreadsheetId } = useParams();
  const navigate = useNavigate();
  const { createDynamicTable, syncCell, loadSheetData, isLoading: syncLoading } = useSpreadsheetSync();
  
  const [spreadsheet, setSpreadsheet] = useState<DBSpreadsheet | null>(null);
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
  const [columnWidths, setColumnWidths] = useState<{[key: string]: number}>({});
  const [rowHeights, setRowHeights] = useState<{[key: string]: number}>({});
  const [history, setHistory] = useState<Action[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);

  const activeSheet = sheets.find(sheet => sheet.id === activeSheetId);

  useEffect(() => {
    if (spreadsheetId) {
      loadSpreadsheet();
    }
  }, [spreadsheetId]);

  const loadSpreadsheet = async () => {
    if (!spreadsheetId) return;

    try {
      // Load spreadsheet metadata
      const { data: spreadsheetData, error: spreadsheetError } = await supabase
        .from('spreadsheets')
        .select('*')
        .eq('id', spreadsheetId)
        .single();

      if (spreadsheetError) throw spreadsheetError;
      setSpreadsheet(spreadsheetData);

      // Load sheets
      const { data: sheetsData, error: sheetsError } = await supabase
        .from('sheets')
        .select('*')
        .eq('spreadsheet_id', spreadsheetId)
        .order('created_at');

      if (sheetsError) throw sheetsError;

      // Load each sheet's data from its dynamic table
      const loadedSheets: SheetData[] = [];
      
      for (const sheet of sheetsData || []) {
        try {
          const sheetData = await loadSheetData(sheet.id);
          const cells: { [key: string]: string } = {};
          const columnHeaders: string[] = [];
          
          // Extract column headers from the first row of data
          if (sheetData?.data && sheetData.data.length > 0) {
            const firstRow = sheetData.data[0];
            const columnNames = Object.keys(firstRow).filter(key => key.startsWith('column_')).sort();
            
            columnNames.forEach((colName, index) => {
              columnHeaders[index] = firstRow[colName] || `COLUMN_${index + 1}`;
            });
            
            // Convert database rows to cell format
            sheetData.data.forEach((row: any) => {
              const rowNumber = row.row_number - 1; // Convert to 0-based indexing
              columnNames.forEach((colName, colIndex) => {
                if (row[colName]) {
                  cells[`${rowNumber}-${colIndex}`] = row[colName];
                }
              });
            });
          }
          
          // Default to 5 columns if no data exists
          if (columnHeaders.length === 0) {
            columnHeaders.push("COLUMN_1", "COLUMN_2", "COLUMN_3", "COLUMN_4", "COLUMN_5");
          }
          
          loadedSheets.push({
            id: sheet.id,
            name: sheet.name,
            cells,
            columnHeaders
          });
        } catch (error) {
          console.error(`Error loading data for sheet ${sheet.id}:`, error);
          // Create empty sheet if loading fails
          loadedSheets.push({
            id: sheet.id,
            name: sheet.name,
            cells: {},
            columnHeaders: ["COLUMN_1", "COLUMN_2", "COLUMN_3", "COLUMN_4", "COLUMN_5"]
          });
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
    
    for (let row = 0; row < rowCount; row++) {
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
    
    const action: Action = {
      type: 'cell_update',
      data: {
        sheetId: activeSheet.id,
        row,
        col,
        oldValue: activeSheet.cells[`${row}-${col}`] || "",
        newValue: value
      },
      timestamp: Date.now()
    };
    
    addToHistory(action);
    
    // Update local state
    setSheets(prevSheets => 
      prevSheets.map(sheet => {
        if (sheet.id === activeSheet.id) {
          const newCells = { ...sheet.cells };
          if (value.trim() === "") {
            delete newCells[`${row}-${col}`];
          } else {
            newCells[`${row}-${col}`] = value;
          }
          return { ...sheet, cells: newCells };
        }
        return sheet;
      })
    );
    
    // Sync to database
    try {
      await syncCell(activeSheet.id, row, col, value);
    } catch (error) {
      console.error('Error syncing cell to database:', error);
    }
  };

  const updateColumnHeader = async (colIndex: number, newHeader: string) => {
    if (!activeSheet) return;
    
    const action: Action = {
      type: 'column_header_update',
      data: {
        sheetId: activeSheet.id,
        col: colIndex,
        oldValue: activeSheet.columnHeaders[colIndex],
        newValue: newHeader
      },
      timestamp: Date.now()
    };
    
    addToHistory(action);
    
    // Update local state
    setSheets(prevSheets => 
      prevSheets.map(sheet => {
        if (sheet.id === activeSheet.id) {
          const newHeaders = [...sheet.columnHeaders];
          newHeaders[colIndex] = newHeader;
          return { ...sheet, columnHeaders: newHeaders };
        }
        return sheet;
      })
    );
    
    // Sync header to database by updating the first row
    try {
      await syncCell(activeSheet.id, -1, colIndex, newHeader); // Use row -1 for headers
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
    
    // No need to sync to database as empty columns are created dynamically
  };

  const addNewRow = () => {
    setRowCount(prev => prev + 1);
  };

  const addNewSheet = async () => {
    if (!spreadsheetId) return;
    
    try {
      const { data: newSheet, error } = await supabase
        .from('sheets')
        .insert([
          {
            spreadsheet_id: spreadsheetId,
            name: `Sheet ${sheets.length + 1}`
          }
        ])
        .select()
        .single();
      
      if (error) throw error;
      
      // Create dynamic table for the new sheet
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
      const { error } = await supabase
        .from('sheets')
        .update({ name: newName })
        .eq('id', sheetId);
      
      if (error) throw error;
      
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
      const { error } = await supabase
        .from('sheets')
        .delete()
        .eq('id', sheetId);
      
      if (error) throw error;
      
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
      
      // Sync to database
      syncCell(sheetId, row, col, oldValue || "").catch(console.error);
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
      syncCell(sheetId, -1, col, oldValue || "").catch(console.error);
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
        const cellValue = activeSheet.cells[cellKey] || "";
        if (cellValue.trim()) {
          const columnLetter = String.fromCharCode(65 + col);
          const readableKey = `${columnLetter}${row + 1}`;
          selectedCells[readableKey] = cellValue;
        }
      }
    }
    
    return selectedCells;
  };

  const handleChatCommand = (command: string) => {
    console.log("Chat command:", command);
  };

  const updateColumnWidth = (colIndex: number, width: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [`${activeSheetId}-${colIndex}`]: Math.max(60, width)
    }));
  };

  const updateRowHeight = (rowIndex: number, height: number) => {
    setRowHeights(prev => ({
      ...prev,
      [`${activeSheetId}-${rowIndex}`]: Math.max(24, height)
    }));
  };

  const getColumnWidth = (colIndex: number) => {
    return columnWidths[`${activeSheetId}-${colIndex}`] || 96;
  };

  const getRowHeight = (rowIndex: number) => {
    return rowHeights[`${activeSheetId}-${rowIndex}`] || 32;
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
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar with sheet tabs */}
        <div className="w-48 border-r border-border bg-card/50">
          <SheetTabs 
            sheets={sheets}
            activeSheetId={activeSheetId}
            onSheetSelect={setActiveSheetId}
            onAddSheet={addNewSheet}
            onSheetRename={renameSheet}
            onSheetDelete={deleteSheet}
          />
        </div>

        {/* Spreadsheet area */}
        <div 
          className="flex-1 flex flex-col"
          style={{ width: `calc(100% - 192px - ${chatPanelWidth}px)` }}
        >
          {/* Coordinate display */}
          <div className="border-b border-border bg-card/30 px-4 py-2">
            <CoordinateDisplay selection={selection} />
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
                onAddRow={addNewRow}
                onClearSelectedCells={clearSelectedCells}
                rowCount={rowCount}
                columnWidths={columnWidths}
                rowHeights={rowHeights}
                onColumnResize={updateColumnWidth}
                onRowResize={updateRowHeight}
                getColumnWidth={getColumnWidth}
                getRowHeight={getRowHeight}
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
            onCommand={handleChatCommand}
          />
        </div>
      </div>
    </div>
  );
};

export default SpreadsheetView;