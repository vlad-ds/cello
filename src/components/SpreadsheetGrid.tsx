import { useState, useRef, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Cell } from "./Cell";
import { SheetData, CellSelection } from "@/pages/Index";

interface SpreadsheetGridProps {
  sheet: SheetData;
  selection: CellSelection;
  onSelectionChange: (selection: CellSelection) => void;
  onCellUpdate: (row: number, col: number, value: string) => void;
  onColumnHeaderUpdate: (colIndex: number, newName: string) => void;
  onAddColumn: () => void;
  onAddRow: () => void;
}

export const SpreadsheetGrid = ({
  sheet,
  selection,
  onSelectionChange,
  onCellUpdate,
  onColumnHeaderUpdate,
  onAddColumn,
  onAddRow,
}: SpreadsheetGridProps) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editingHeader, setEditingHeader] = useState<number | null>(null);
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

  const handleHeaderEdit = (colIndex: number, value: string) => {
    console.log("Header edit:", colIndex, value);
    onColumnHeaderUpdate(colIndex, value);
    setEditingHeader(null);
  };

  const handleHeaderDoubleClick = (colIndex: number) => {
    console.log("Header double click:", colIndex);
    setEditingHeader(colIndex);
  };

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't interfere if someone is editing a sheet name
    if (editingHeader || document.querySelector('input:focus')) return;
    
    if (editingCell) return;

    const { start } = selection;
    let newRow = start.row;
    let newCol = start.col;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        newRow = Math.max(0, start.row - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        newRow = Math.min(ROWS - 1, start.row + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        newCol = Math.max(0, start.col - 1);
        break;
      case "ArrowRight":
      case "Tab":
        e.preventDefault();
        newCol = Math.min(COLS - 1, start.col + 1);
        break;
      case "Enter":
        e.preventDefault();
        setEditingCell({ row: start.row, col: start.col });
        return;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        onCellUpdate(start.row, start.col, "");
        return;
      case "Escape":
        // Clear selection or exit edit mode
        return;
      default:
        // Start editing if a printable character is pressed
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          setEditingCell({ row: start.row, col: start.col });
          // The character will be handled by the input field
          return;
        }
        return;
    }

    onSelectionChange({ start: { row: newRow, col: newCol }, end: { row: newRow, col: newCol } });
  }, [selection, editingCell, editingHeader, onSelectionChange, onCellUpdate, ROWS, COLS]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

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
              isEditing={editingHeader === colIndex}
              className="w-24 h-8"
              onDoubleClick={() => handleHeaderDoubleClick(colIndex)}
              onEdit={(value) => handleHeaderEdit(colIndex, value)}
            />
          ))}
          
          {/* Add Column Button */}
          <div className="w-12 h-8 bg-grid-header border-r border-b border-grid-border flex items-center justify-center">
            <Button
              onClick={onAddColumn}
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 hover:bg-grid-selected/50 rounded-sm"
            >
              <Plus className="w-3 h-3 text-muted-foreground hover:text-primary" />
            </Button>
          </div>
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

        {/* Add Row Button Row */}
        <div className="flex">
          <div className="w-16 h-8 bg-grid-header border-r border-b border-grid-border flex items-center justify-center">
            <Button
              onClick={onAddRow}
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 hover:bg-grid-selected/50 rounded-sm"
            >
              <Plus className="w-3 h-3 text-muted-foreground hover:text-primary" />
            </Button>
          </div>
          {/* Empty cells for alignment */}
          {Array.from({ length: COLS }, (_, colIndex) => (
            <div key={`add-row-${colIndex}`} className="w-24 h-8 border-r border-b border-grid-border bg-grid-hover/30" />
          ))}
          <div className="w-12 h-8 border-r border-b border-grid-border bg-grid-hover/30" />
        </div>
      </div>
    </div>
  );
};