import { useState, useCallback, useEffect } from "react";
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
    end: { row: 0, col: 0 }
  });
  
  const [chatPanelWidth, setChatPanelWidth] = useState(480); // Default 480px (wider)
  const [isResizing, setIsResizing] = useState(false);

  const activeSheet = sheets.find(sheet => sheet.id === activeSheetId)!;

  const updateCell = (row: number, col: number, value: string) => {
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
    // For now, just show feedback - could extend to increase ROWS constant or add dynamic row management
    console.log("Add new row functionality - can be extended for dynamic rows");
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

  const renameSheet = (sheetId: string, newName: string) => {
    setSheets(prev => prev.map(sheet => 
      sheet.id === sheetId 
        ? { ...sheet, name: newName }
        : sheet
    ));
  };

  const handleChatCommand = (command: string) => {
    // This will be implemented when AI backend is connected
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

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Title Header */}
      <header className="border-b border-border bg-card px-6 py-4">
        <h1 className="text-2xl font-semibold text-foreground">Interactive Spreadsheet</h1>
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
            <ChatPanel onCommand={handleChatCommand} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;