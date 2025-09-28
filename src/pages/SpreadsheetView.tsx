import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Undo, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpreadsheetGrid } from "@/components/SpreadsheetGrid";
import { SheetTabs } from "@/components/SheetTabs";
import { CoordinateDisplay } from "@/components/CoordinateDisplay";
import { ChatPanel } from "@/components/ChatPanel";
import { supabase } from "@/integrations/supabase/client";
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

      const formattedSheets: SheetData[] = (sheetsData || []).map(sheet => ({
        id: sheet.id,
        name: sheet.name,
        cells: {},
        columnHeaders: ["COLUMN_1", "COLUMN_2", "COLUMN_3", "COLUMN_4", "COLUMN_5"]
      }));

      setSheets(formattedSheets);
      if (formattedSheets.length > 0) {
        setActiveSheetId(formattedSheets[0].id);
      }
    } catch (error) {
      console.error('Error loading spreadsheet:', error);
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  const [data, setData] = useState<CellData[][]>([
    [
      { value: "Header 1" },
      { value: "Header 2" },
      { value: "Header 3" },
      { value: "Header 4" },
      { value: "Header 5" },
    ],
    [
      { value: "Row 1, Cell 1" },
      { value: "Row 1, Cell 2" },
      { value: "Row 1, Cell 3" },
      { value: "Row 1, Cell 4" },
      { value: "Row 1, Cell 5" },
    ],
    [
      { value: "Row 2, Cell 1" },
      { value: "Row 2, Cell 2" },
      { value: "Row 2, Cell 3" },
      { value: "Row 2, Cell 4" },
      { value: "Row 2, Cell 5" },
    ],
  ]);

  const handleCellChange = (row: number, col: number, value: string) => {
    const newData = [...data];
    if (!newData[row]) {
      newData[row] = [];
    }
    if (!newData[row][col]) {
      newData[row][col] = { value: "" };
    }
    newData[row][col].value = value;
    setData(newData);
  };

  const handleHeaderChange = (col: number, value: string) => {
    const newData = [...data];
    if (!newData[0]) {
      newData[0] = [];
    }
    if (!newData[0][col]) {
      newData[0][col] = { value: "" };
    }
    newData[0][col].value = value;
    setData(newData);
  };

  const addColumn = () => {
    const newData = data.map((row) => {
      return [...row, { value: "" }];
    });
    setData(newData);
  };

  const addRow = () => {
    const newRow = Array(data[0].length).fill({ value: "" });
    setData([...data, newRow]);
  };

  const clearSelected = () => {
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);

    const newData = data.map((row, rowIndex) => {
      if (rowIndex >= minRow && rowIndex <= maxRow) {
        return row.map((cell, colIndex) => {
          if (colIndex >= minCol && colIndex <= maxCol) {
            return { value: "" };
          }
          return cell;
        });
      }
      return row;
    });

    setData(newData);
  };
  const addToHistory = (action: Action) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(action);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    
    if (newHistory.length > 100) {
      setHistory(newHistory.slice(-100));
      setHistoryIndex(99);
    }
  };

  const undo = () => {
    if (historyIndex < 0 || !activeSheet) return;
    
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
    }
    
    setHistoryIndex(prev => prev - 1);
  };

  const updateCell = (row: number, col: number, value: string) => {
    if (!activeSheet) return;
    
    const previousValue = activeSheet.cells[`${row}-${col}`] || "";
    
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

    // TODO: Sync with database
    syncCellToDatabase(row, col, value);
  };

  const syncCellToDatabase = async (row: number, col: number, value: string) => {
    // This will create/update the dynamic table for this sheet
    console.log('Syncing cell to database:', { row, col, value, sheetId: activeSheetId });
  };

  const updateColumnHeader = (colIndex: number, newName: string) => {
    if (!activeSheet) return;
    
    const previousName = activeSheet.columnHeaders[colIndex];
    
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
    if (!activeSheet) return;
    
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

  const addNewSheet = async () => {
    if (!spreadsheetId) return;

    try {
      const { data: newSheet, error } = await supabase
        .from('sheets')
        .insert([{ 
          spreadsheet_id: spreadsheetId, 
          name: `Sheet ${sheets.length + 1}` 
        }])
        .select()
        .single();

      if (error) throw error;

      const formattedSheet: SheetData = {
        id: newSheet.id,
        name: newSheet.name,
        cells: {},
        columnHeaders: ["COLUMN_1", "COLUMN_2", "COLUMN_3", "COLUMN_4", "COLUMN_5"]
      };

      setSheets(prev => [...prev, formattedSheet]);
      setActiveSheetId(newSheet.id);
    } catch (error) {
      console.error('Error creating sheet:', error);
    }
  };

  const clearSelectedCells = () => {
    if (!activeSheet) return;
    
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    
    const cellUpdates = [];
    const newCells = { ...activeSheet.cells };
    
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cellKey = `${row}-${col}`;
        const previousValue = activeSheet.cells[cellKey] || "";
        
        if (previousValue !== "") {
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
    
    if (cellUpdates.length > 0) {
      addToHistory({
        type: 'bulk_cell_update',
        data: { cellUpdates },
        timestamp: Date.now()
      });
    }
    
    setSheets(prev => prev.map(sheet => 
      sheet.id === activeSheetId 
        ? { ...sheet, cells: newCells }
        : sheet
    ));
  };

  const renameSheet = (sheetId: string, newName: string) => {
    setSheets(prev => prev.map(sheet => 
      sheet.id === sheetId 
        ? { ...sheet, name: newName }
        : sheet
    ));
    // TODO: Sync with database
  };

  const deleteSheet = (sheetId: string) => {
    if (sheets.length <= 1) return;
    
    setSheets(prev => prev.filter(sheet => sheet.id !== sheetId));
    
    if (activeSheetId === sheetId) {
      const remainingSheets = sheets.filter(sheet => sheet.id !== sheetId);
      if (remainingSheets.length > 0) {
        setActiveSheetId(remainingSheets[0].id);
      }
    }
    // TODO: Sync with database
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
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Spreadsheet not found</h2>
          <Button onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Spreadsheets
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Title Header */}
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{spreadsheet.name}</h1>
              <p className="text-sm text-muted-foreground font-mono">ID: {spreadsheet.id}</p>
            </div>
          </div>
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

export default SpreadsheetView;
