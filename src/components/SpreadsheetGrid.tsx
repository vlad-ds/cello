import { useState, useRef, useEffect, useCallback } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Cell } from "./Cell";
import { SheetData, CellSelection } from "@/pages/Index";
import { CellHighlight } from "@/integrations/database";

interface SpreadsheetGridProps {
  sheet: SheetData;
  selection: CellSelection;
  onSelectionChange: (selection: CellSelection) => void;
  onCellUpdate: (row: number, col: number, value: string) => void;
  onColumnHeaderUpdate: (colIndex: number, newName: string) => void;
  onAddColumn: () => void;
  onRemoveColumn: (colIndex: number) => void;
  onAddRow: () => void;
  onClearSelectedCells: () => void;
  rowCount: number;
  columnWidths: {[key: string]: number};
  rowHeights: {[key: string]: number};
  onColumnResize: (colIndex: number, width: number) => void;
  onRowResize: (rowIndex: number, height: number) => void;
  getColumnWidth: (colIndex: number) => number;
  getRowHeight: (rowIndex: number) => number;
  highlight?: CellHighlight | null;
}

export const SpreadsheetGrid = ({
  sheet,
  selection,
  onSelectionChange,
  onCellUpdate,
  onColumnHeaderUpdate,
  onAddColumn,
  onRemoveColumn,
  onAddRow,
  onClearSelectedCells,
  rowCount,
  columnWidths,
  rowHeights,
  onColumnResize,
  onRowResize,
  getColumnWidth,
  getRowHeight,
  highlight,
}: SpreadsheetGridProps) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [isSelectingColumns, setIsSelectingColumns] = useState(false);
  const [isSelectingRows, setIsSelectingRows] = useState(false);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editingHeader, setEditingHeader] = useState<number | null>(null);
  const [resizingColumn, setResizingColumn] = useState<number | null>(null);
  const [resizingRow, setResizingRow] = useState<number | null>(null);
  const [initialMouseX, setInitialMouseX] = useState(0);
  const [initialMouseY, setInitialMouseY] = useState(0);
  const [initialWidth, setInitialWidth] = useState(0);
  const [initialHeight, setInitialHeight] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const ROWS = rowCount;
  const COLS = sheet.columnHeaders.length;

  // Helper to convert column index to letter (0 -> A, 1 -> B, etc.)
  const colToLetter = (col: number): string => {
    let letter = '';
    let num = col;
    while (num >= 0) {
      letter = String.fromCharCode((num % 26) + 65) + letter;
      num = Math.floor(num / 26) - 1;
    }
    return letter;
  };

  // Helper to convert column letter to index (A -> 0, B -> 1, etc.)
  const letterToCol = (letter: string): number => {
    let col = 0;
    for (let i = 0; i < letter.length; i++) {
      col = col * 26 + (letter.charCodeAt(i) - 64);
    }
    return col - 1;
  };

  // Check if a cell is in the highlighted range
  const isCellHighlighted = (row: number, col: number): boolean => {
    if (!highlight) return false;

    // Value-based highlighting
    if (highlight.column && highlight.values) {
      // Find which column index corresponds to the SQL column name
      const columnIndex = sheet.columnHeaders.findIndex(
        header => header.toLowerCase() === highlight.column?.toLowerCase()
      );

      // Only highlight cells in the matching column
      if (columnIndex === -1 || col !== columnIndex) {
        return false;
      }

      // Get the cell value at this position
      const cellValue = sheet.cells[`${row}-${col}`] || "";
      // Compare against highlight values (need to handle type conversion)
      return highlight.values.some(v => {
        // Handle numeric comparisons
        if (typeof v === 'number') {
          const numValue = parseFloat(cellValue);
          return !isNaN(numValue) && numValue === v;
        }
        // Handle string/null/boolean comparisons
        return String(v) === cellValue;
      });
    }

    // Range-based highlighting
    if (!highlight.range) return false;
    const range = highlight.range.trim().toUpperCase();

    // Single cell (e.g., "A1")
    if (!range.includes(':')) {
      const match = range.match(/^([A-Z]+)(\d+)$/);
      if (!match) return false;
      const [, colLetter, rowStr] = match;
      const targetRow = parseInt(rowStr, 10) - 1; // A1 = rowIndex 0
      const targetCol = letterToCol(colLetter);
      return row === targetRow && col === targetCol;
    }

    // Range (e.g., "A1:B5")
    const parts = range.split(':');
    if (parts.length !== 2) return false;

    const start = parts[0].match(/^([A-Z]+)(\d+)$/);
    const end = parts[1].match(/^([A-Z]+)(\d+)$/);
    if (!start || !end) return false;

    const startCol = letterToCol(start[1]);
    const startRow = parseInt(start[2], 10) - 1; // Convert to zero-indexed
    const endCol = letterToCol(end[1]);
    const endRow = parseInt(end[2], 10) - 1; // Convert to zero-indexed

    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);

    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
  };

  const handleCellMouseDown = (row: number, col: number) => {
    setIsSelecting(true);
    onSelectionChange({ start: { row, col }, end: { row, col }, type: 'cell' });
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (isSelecting && selection.type === 'cell') {
      onSelectionChange({ ...selection, end: { row, col } });
    }
  };

  const handleRowHeaderClick = (row: number) => {
    // Select entire row
    onSelectionChange({ 
      start: { row, col: 0 }, 
      end: { row, col: COLS - 1 }, 
      type: 'row' 
    });
  };

  const handleRowHeaderMouseDown = (row: number) => {
    setIsSelectingRows(true);
    onSelectionChange({ 
      start: { row, col: 0 }, 
      end: { row, col: COLS - 1 }, 
      type: 'row' 
    });
  };

  const handleRowHeaderMouseEnter = (row: number) => {
    if (isSelectingRows) {
      onSelectionChange({ 
        ...selection,
        end: { row, col: COLS - 1 },
        type: 'row'
      });
    }
  };

  const handleColumnHeaderClick = (col: number) => {
    // Select entire column
    onSelectionChange({ 
      start: { row: 0, col }, 
      end: { row: ROWS - 1, col }, 
      type: 'column' 
    });
  };

  const handleColumnHeaderMouseDown = (col: number) => {
    setIsSelectingColumns(true);
    onSelectionChange({ 
      start: { row: 0, col }, 
      end: { row: ROWS - 1, col }, 
      type: 'column' 
    });
  };

  const handleColumnHeaderMouseEnter = (col: number) => {
    if (isSelectingColumns) {
      onSelectionChange({ 
        ...selection,
        end: { row: ROWS - 1, col },
        type: 'column'
      });
    }
  };

  const handleSelectAll = () => {
    onSelectionChange({
      start: { row: 0, col: 0 },
      end: { row: ROWS - 1, col: COLS - 1 },
      type: 'all'
    });
  };

  const handleColumnResizeStart = (colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(colIndex);
    setInitialMouseX(e.clientX);
    setInitialWidth(getColumnWidth(colIndex));
  };

  const handleRowResizeStart = (rowIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingRow(rowIndex);
    setInitialMouseY(e.clientY);
    setInitialHeight(getRowHeight(rowIndex));
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setIsSelectingColumns(false);
    setIsSelectingRows(false);
    setResizingColumn(null);
    setResizingRow(null);
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

  const isCellSelected = (row: number, col: number) => {
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    
    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
  };

  const getSelectionBorderClasses = (row: number, col: number) => {
    if (!isCellSelected(row, col)) return "";
    
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    
    // Check if this cell is on the perimeter of the selection
    const isTopEdge = row === minRow;
    const isBottomEdge = row === maxRow;
    const isLeftEdge = col === minCol;
    const isRightEdge = col === maxCol;
    
    let borderClasses = "";
    if (isTopEdge) borderClasses += " border-t-2 border-t-grid-selected-border";
    if (isBottomEdge) borderClasses += " border-b-2 border-b-grid-selected-border";
    if (isLeftEdge) borderClasses += " border-l-2 border-l-grid-selected-border";
    if (isRightEdge) borderClasses += " border-r-2 border-r-grid-selected-border";
    
    return borderClasses;
  };

  const isRowHeaderSelected = (row: number) => {
    if (selection.type !== 'row') return false;
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    return row >= minRow && row <= maxRow;
  };

  const isColumnHeaderSelected = (col: number) => {
    if (selection.type !== 'column') return false;
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    return col >= minCol && col <= maxCol;
  };

  // Resize functionality
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (resizingColumn !== null) {
      const deltaX = e.clientX - initialMouseX;
      const newWidth = initialWidth + deltaX;
      onColumnResize(resizingColumn, newWidth);
    }
    if (resizingRow !== null) {
      const deltaY = e.clientY - initialMouseY;
      const newHeight = initialHeight + deltaY;
      onRowResize(resizingRow, newHeight);
    }
  }, [resizingColumn, resizingRow, initialMouseX, initialMouseY, initialWidth, initialHeight, onColumnResize, onRowResize]);

  useEffect(() => {
    if (resizingColumn !== null || resizingRow !== null) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [resizingColumn, resizingRow, handleMouseMove]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't interfere if someone is editing a sheet name
    if (editingHeader !== null || document.querySelector('input:focus, textarea:focus')) {
      return;
    }
    
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
        onClearSelectedCells();
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

    onSelectionChange({ start: { row: newRow, col: newCol }, end: { row: newRow, col: newCol }, type: 'cell' });
  }, [selection, editingCell, editingHeader, onSelectionChange, onCellUpdate, ROWS, COLS]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const handleDocumentMouseUp = () => {
      setIsSelecting(false);
      setIsSelectingColumns(false);
      setIsSelectingRows(false);
      setResizingColumn(null);
      setResizingRow(null);
    };
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
          <div 
            className="w-16 h-8 bg-grid-header border-r border-b border-grid-border flex items-center justify-center text-xs font-medium text-grid-header-foreground cursor-pointer hover:bg-grid-selected/20"
            onClick={handleSelectAll}
          >
            #
          </div>
          
          {/* Column Headers */}
          {sheet.columnHeaders.map((header, colIndex) => (
            <div key={`header-container-${colIndex}`} className="relative flex group/col">
              <Cell
                key={`header-${colIndex}`}
                value={header}
                isHeader
                isSelected={isColumnHeaderSelected(colIndex)}
                isEditing={editingHeader === colIndex}
                className="cursor-pointer"
                style={{ width: getColumnWidth(colIndex), height: 32 }}
                onDoubleClick={() => handleHeaderDoubleClick(colIndex)}
                onMouseDown={() => handleColumnHeaderMouseDown(colIndex)}
                onMouseEnter={() => handleColumnHeaderMouseEnter(colIndex)}
                onClick={() => handleColumnHeaderClick(colIndex)}
                onEdit={(value) => handleHeaderEdit(colIndex, value)}
                onSelectionChange={onSelectionChange}
                selection={selection}
                ROWS={ROWS}
              />
              {/* Column Resize Handle */}
              <div
                className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-primary/50 transition-colors z-10"
                onMouseDown={(e) => handleColumnResizeStart(colIndex, e)}
              />
              {sheet.columnHeaders.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveColumn(colIndex);
                  }}
                  className="absolute top-1 right-2 hidden group-hover/col:flex items-center justify-center w-5 h-5 rounded-full bg-background border border-border/70 text-muted-foreground hover:text-destructive hover:border-destructive transition"
                  aria-label="Remove column"
                >
                  <Minus className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          
          {/* Add Column Button */}
          <div className="w-8 h-8 bg-grid-header border-r border-b border-grid-border flex items-center justify-center group">
            <button
              onClick={onAddColumn}
              className="w-5 h-5 rounded-full border border-muted-foreground/30 flex items-center justify-center hover:border-primary/60 hover:bg-primary/10 transition-all duration-200 group-hover:scale-110"
            >
              <Plus className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          </div>
        </div>

        {/* Data Rows */}
        {Array.from({ length: ROWS }, (_, rowIndex) => (
          <div key={rowIndex} className="flex relative">
            {/* Row Number */}
            <div className="relative flex flex-col">
              <div 
                className={`w-16 bg-grid-header border-r border-b border-grid-border flex items-center justify-center text-xs font-medium text-grid-header-foreground relative group cursor-pointer hover:bg-grid-selected/20 ${
                  isRowHeaderSelected(rowIndex) ? 'bg-grid-selected/40' : ''
                }`}
                style={{ height: getRowHeight(rowIndex) }}
                onMouseDown={() => handleRowHeaderMouseDown(rowIndex)}
                onMouseEnter={() => handleRowHeaderMouseEnter(rowIndex)}
                onClick={() => handleRowHeaderClick(rowIndex)}
              >
                {rowIndex + 1}
                {rowIndex === ROWS - 1 && (
                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddRow();
                      }}
                      className="w-4 h-4 rounded-full border border-muted-foreground/30 flex items-center justify-center hover:border-primary/60 hover:bg-primary/10 transition-all duration-200 hover:scale-110 bg-card shadow-sm"
                    >
                      <Plus className="w-2.5 h-2.5 text-muted-foreground hover:text-primary transition-colors" />
                    </button>
                  </div>
                )}
              </div>
              {/* Row Resize Handle */}
              <div
                className="absolute bottom-0 left-0 w-full h-1 cursor-row-resize hover:bg-primary/50 transition-colors z-10"
                onMouseDown={(e) => handleRowResizeStart(rowIndex, e)}
              />
            </div>
            
            {/* Data Cells */}
            {Array.from({ length: COLS }, (_, colIndex) => (
              <Cell
                key={`${rowIndex}-${colIndex}`}
                value={sheet.cells[`${rowIndex}-${colIndex}`] || ""}
                isHeader={false}
                isSelected={isCellSelected(rowIndex, colIndex)}
                isEditing={editingCell?.row === rowIndex && editingCell?.col === colIndex}
                className={getSelectionBorderClasses(rowIndex, colIndex)}
                style={{ width: getColumnWidth(colIndex), height: getRowHeight(rowIndex) }}
                onMouseDown={() => handleCellMouseDown(rowIndex, colIndex)}
                onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
                onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                onEdit={(value) => handleCellEdit(rowIndex, colIndex, value)}
                onSelectionChange={onSelectionChange}
                selection={selection}
                ROWS={ROWS}
                isHighlighted={isCellHighlighted(rowIndex, colIndex)}
                highlightColor={highlight?.color}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
