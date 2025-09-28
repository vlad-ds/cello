import { useState, useCallback, useEffect } from "react";
import { Undo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpreadsheetGrid } from "@/components/SpreadsheetGrid";
import { SheetTabs } from "@/components/SheetTabs";
import { CoordinateDisplay } from "@/components/CoordinateDisplay";
import { ChatPanel } from "@/components/ChatPanel";

export interface CellData {
  [key: string]: string;
}

export interface SheetData {
  id: string;
  name: string;
  cells: CellData;
  columnHeaders: string[];
}

export interface CellSelection {
  start: { row: number; col: number };
  end: { row: number; col: number };
  type?: 'cell' | 'row' | 'column' | 'all'; // Track selection type
}

export interface Action {
  type: 'cell_update' | 'bulk_cell_update' | 'column_header_update' | 'add_column' | 'add_row';
  data: any;
  timestamp: number;
}

const Index = () => {
  const [sheets, setSheets] = useState<SheetData[]>([
    {
      id: "sheet1",
      name: "Sheet 1",
      cells: {},
      columnHeaders: ["COLUMN_1", "COLUMN_2", "COLUMN_3", "COLUMN_4", "COLUMN_5"]
    }
  ]);
  
  const [activeSheetId, setActiveSheetId] = useState("sheet1");
  const [selection, setSelection] = useState<CellSelection>({
    start: { row: 0, col: 0 },
    end: { row: 0, col: 0 },
    type: 'cell'
  });
  
  const [chatPanelWidth, setChatPanelWidth] = useState(480); // Default 480px (wider)
  const [isResizing, setIsResizing] = useState(false);
  const [rowCount, setRowCount] = useState(20); // Dynamic row management
  const [columnWidths, setColumnWidths] = useState<{[key: string]: number}>({});
  const [rowHeights, setRowHeights] = useState<{[key: string]: number}>({});
  const [history, setHistory] = useState<Action[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const activeSheet = sheets.find(sheet => sheet.id === activeSheetId)!;

  const addToHistory = (action: Action) => {
    // Remove any future history if we're not at the end
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(action);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    
    // Limit history to 100 actions to prevent memory issues
    if (newHistory.length > 100) {
      setHistory(newHistory.slice(-100));
      setHistoryIndex(99);
    }
  };

  const undo = () => {
    if (historyIndex < 0) return;
    
    const action = history[historyIndex];
    
    switch (action.type) {
      case 'cell_update':
        const { row, col, previousValue } = action.data;
        setSheets(prev => prev.map(sheet => 
          sheet.id === activeSheetId 
            ? {
                ...sheet,
                cells: {
                  ...sheet.cells,
                  [`${row}-${col}`]: previousValue
                }
              }
            : sheet
        ));
        break;
        
      case 'bulk_cell_update':
        const { cellUpdates } = action.data;
        setSheets(prev => prev.map(sheet => 
          sheet.id === activeSheetId 
            ? {
                ...sheet,
                cells: {
                  ...sheet.cells,
                  ...cellUpdates.reduce((acc: any, update: any) => {
                    acc[`${update.row}-${update.col}`] = update.previousValue;
                    return acc;
                  }, {})
                }
              }
            : sheet
        ));
        break;
        
      case 'column_header_update':
        const { colIndex, previousName } = action.data;
        setSheets(prev => prev.map(sheet => 
          sheet.id === activeSheetId 
            ? {
                ...sheet,
                columnHeaders: sheet.columnHeaders.map((header, index) => 
                  index === colIndex ? previousName : header
                )
              }
            : sheet
        ));
        break;
        
      case 'add_column':
        setSheets(prev => prev.map(sheet => 
          sheet.id === activeSheetId 
            ? {
                ...sheet,
                columnHeaders: sheet.columnHeaders.slice(0, -1)
              }
            : sheet
        ));
        break;
        
      case 'add_row':
        setRowCount(prev => prev - 1);
        break;
    }
    
    setHistoryIndex(prev => prev - 1);
  };

  const clearSelectedCells = () => {
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    
    const cellUpdates = [];
    const newCells = { ...activeSheet.cells };
    
    // Collect all affected cells and their previous values
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cellKey = `${row}-${col}`;
        const previousValue = activeSheet.cells[cellKey] || "";
        
        if (previousValue !== "") { // Only track cells that actually had content
          cellUpdates.push({
            row,
            col,
            previousValue,
            newValue: ""
          });
        }
        
        newCells[cellKey] = "";
      }
    }
    
    // Only add to history if there were actual changes
    if (cellUpdates.length > 0) {
      addToHistory({
        type: 'bulk_cell_update',
        data: { cellUpdates },
        timestamp: Date.now()
      });
    }
    
    // Update the sheets
    setSheets(prev => prev.map(sheet => 
      sheet.id === activeSheetId 
        ? { ...sheet, cells: newCells }
        : sheet
    ));
  };

  const updateCell = (row: number, col: number, value: string) => {
    const previousValue = activeSheet.cells[`${row}-${col}`] || "";
    
    // Only add to history if the value actually changed
    if (previousValue !== value) {
      addToHistory({
        type: 'cell_update',
        data: { row, col, previousValue, newValue: value },
        timestamp: Date.now()
      });
    }
    
    setSheets(prev => prev.map(sheet => 
      sheet.id === activeSheetId 
        ? {
            ...sheet,
            cells: {
              ...sheet.cells,
              [`${row}-${col}`]: value
            }
          }
        : sheet
    ));
  };

  const updateColumnHeader = (colIndex: number, newName: string) => {
    const previousName = activeSheet.columnHeaders[colIndex];
    
    // Only add to history if the name actually changed
    if (previousName !== newName) {
      addToHistory({
        type: 'column_header_update',
        data: { colIndex, previousName, newName },
        timestamp: Date.now()
      });
    }
    
    setSheets(prev => prev.map(sheet => 
      sheet.id === activeSheetId 
        ? {
            ...sheet,
            columnHeaders: sheet.columnHeaders.map((header, index) => 
              index === colIndex ? newName : header
            )
          }
        : sheet
    ));
  };

  const addNewColumn = () => {
    addToHistory({
      type: 'add_column',
      data: { columnCount: activeSheet.columnHeaders.length },
      timestamp: Date.now()
    });
    
    setSheets(prev => prev.map(sheet => 
      sheet.id === activeSheetId 
        ? {
            ...sheet,
            columnHeaders: [...sheet.columnHeaders, `COLUMN_${sheet.columnHeaders.length + 1}`]
          }
        : sheet
    ));
  };

  const addNewRow = () => {
    addToHistory({
      type: 'add_row',
      data: { previousRowCount: rowCount },
      timestamp: Date.now()
    });
    
    setRowCount(prev => prev + 1);
  };

  const addNewSheet = () => {
    const newId = `sheet${sheets.length + 1}`;
    const newSheet: SheetData = {
      id: newId,
      name: `Sheet ${sheets.length + 1}`,
      cells: {},
      columnHeaders: ["COLUMN_1", "COLUMN_2", "COLUMN_3", "COLUMN_4", "COLUMN_5"]
    };
    setSheets(prev => [...prev, newSheet]);
    setActiveSheetId(newId);
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
    return columnWidths[`${activeSheetId}-${colIndex}`] || 96; // Default 96px (w-24)
  };

  const getRowHeight = (rowIndex: number) => {
    return rowHeights[`${activeSheetId}-${rowIndex}`] || 32; // Default 32px (h-8)
  };

  const renameSheet = (sheetId: string, newName: string) => {
    setSheets(prev => prev.map(sheet => 
      sheet.id === sheetId 
        ? { ...sheet, name: newName }
        : sheet
    ));
  };

  const deleteSheet = (sheetId: string) => {
    if (sheets.length <= 1) return; // Don't allow deleting the last sheet
    
    setSheets(prev => prev.filter(sheet => sheet.id !== sheetId));
    
    // If we're deleting the active sheet, switch to the first remaining sheet
    if (activeSheetId === sheetId) {
      const remainingSheets = sheets.filter(sheet => sheet.id !== sheetId);
      if (remainingSheets.length > 0) {
        setActiveSheetId(remainingSheets[0].id);
      }
    }
  };

  const getSelectedCellsContent = () => {
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
          // Convert to readable format like A1, B2, etc.
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

  // Add global mouse event listeners
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

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if Ctrl+Z (Windows) or Cmd+Z (Mac) is pressed
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Title Header */}
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Interactive Spreadsheet</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={undo}
              disabled={historyIndex < 0}
              className="flex items-center gap-2"
            >
              <Undo className="w-4 h-4" />
              Undo
            </Button>
            <span className="text-xs text-muted-foreground">
              Ctrl+Z / ⌘+Z
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Sheet Tabs */}
        <div className="w-48 border-r border-border bg-tab-background">
          <SheetTabs 
            sheets={sheets}
            activeSheetId={activeSheetId}
            onSheetSelect={setActiveSheetId}
            onAddSheet={addNewSheet}
            onSheetRename={renameSheet}
            onSheetDelete={deleteSheet}
          />
        </div>

        {/* Main Spreadsheet Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Coordinate Display */}
          <CoordinateDisplay selection={selection} />
          
          {/* Spreadsheet Grid */}
          <div className="flex-1 overflow-auto">
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
          </div>
        </div>

        {/* Right Sidebar - AI Chat */}
        <div className="flex-shrink-0 flex">
          {/* Resize Handle */}
          <div
            className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors flex-shrink-0 group"
            onMouseDown={handleMouseDown}
          >
            <div className="w-full h-full group-hover:bg-primary/20" />
          </div>
          
          {/* Chat Panel */}
          <div 
            className="flex-shrink-0 bg-card"
            style={{ width: chatPanelWidth }}
          >
            <ChatPanel 
              onCommand={handleChatCommand} 
              selectedCells={getSelectedCellsContent()} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;