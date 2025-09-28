import { useState, useRef, useEffect } from "react";
import { Cell } from "./Cell";
import { SheetData, CellSelection } from "@/pages/Index";

interface SpreadsheetGridProps {
  sheet: SheetData;
  selection: CellSelection;
  onSelectionChange: (selection: CellSelection) => void;
  onCellUpdate: (row: number, col: number, value: string) => void;
  onColumnHeaderUpdate: (colIndex: number, newName: string) => void;
}

export const SpreadsheetGrid = ({
  sheet,
  selection,
  onSelectionChange,
  onCellUpdate,
  onColumnHeaderUpdate,
}: SpreadsheetGridProps) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const ROWS = 20;
  const COLS = sheet.columnHeaders.length;

  const handleCellMouseDown = (row: number, col: number) => {
    setIsSelecting(true);
    onSelectionChange({ start: { row, col }, end: { row, col } });
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (isSelecting) {
      onSelectionChange({ ...selection, end: { row, col } });
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const handleCellDoubleClick = (row: number, col: number) => {
    setEditingCell({ row, col });
  };

  const handleCellEdit = (row: number, col: number, value: string) => {
    onCellUpdate(row, col, value);
    setEditingCell(null);
  };

  const isCellSelected = (row: number, col: number) => {
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    
    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
  };

  useEffect(() => {
    const handleDocumentMouseUp = () => setIsSelecting(false);
    document.addEventListener("mouseup", handleDocumentMouseUp);
    return () => document.removeEventListener("mouseup", handleDocumentMouseUp);
  }, []);

  return (
    <div 
      ref={gridRef}
      className="relative bg-grid border-l border-t border-grid-border"
      onMouseUp={handleMouseUp}
    >
      {/* Grid Container */}
      <div className="inline-block min-w-full">
        {/* Header Row */}
        <div className="flex">
          {/* Empty corner cell */}
          <div className="w-16 h-8 bg-grid-header border-r border-b border-grid-border flex items-center justify-center text-xs font-medium text-grid-header-foreground">
            #
          </div>
          
          {/* Column Headers */}
          {sheet.columnHeaders.map((header, colIndex) => (
            <Cell
              key={`header-${colIndex}`}
              value={header}
              isHeader
              isSelected={false}
              isEditing={false}
              className="w-24 h-8"
              onEdit={(value) => onColumnHeaderUpdate(colIndex, value)}
            />
          ))}
        </div>

        {/* Data Rows */}
        {Array.from({ length: ROWS }, (_, rowIndex) => (
          <div key={rowIndex} className="flex">
            {/* Row Number */}
            <div className="w-16 h-8 bg-grid-header border-r border-b border-grid-border flex items-center justify-center text-xs font-medium text-grid-header-foreground">
              {rowIndex + 1}
            </div>
            
            {/* Data Cells */}
            {Array.from({ length: COLS }, (_, colIndex) => (
              <Cell
                key={`${rowIndex}-${colIndex}`}
                value={sheet.cells[`${rowIndex}-${colIndex}`] || ""}
                isHeader={false}
                isSelected={isCellSelected(rowIndex, colIndex)}
                isEditing={editingCell?.row === rowIndex && editingCell?.col === colIndex}
                className="w-24 h-8"
                onMouseDown={() => handleCellMouseDown(rowIndex, colIndex)}
                onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
                onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                onEdit={(value) => handleCellEdit(rowIndex, colIndex, value)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};