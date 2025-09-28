import { useState } from "react";
import { SpreadsheetGrid } from "@/components/SpreadsheetGrid";
import { SheetTabs } from "@/components/SheetTabs";
import { CoordinateDisplay } from "@/components/CoordinateDisplay";

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
        <div className="flex-1 flex flex-col">
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
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;