import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  highlights?: CellHighlight[];
  displayRowNumbers?: number[];
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
  highlights = [],
  displayRowNumbers,
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const ROWS = rowCount;
  const COLS = sheet.columnHeaders.length;

  // Virtual scrolling for rows - only enable for large datasets
  const useVirtualization = ROWS > 100;

  const rowVirtualizer = useVirtualizer({
    count: ROWS,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => getRowHeight(index),
    overscan: 10,
    enabled: useVirtualization,
  });

  // Pre-calculate selection bounds for performance
  const selectionBounds = useMemo(() => {
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    return { minRow, maxRow, minCol, maxCol };
  }, [selection.start.row, selection.start.col, selection.end.row, selection.end.col]);

  // Pre-calculate highlight map for O(1) lookup
  const highlightMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const highlight of highlights) {
      // Row-based highlighting
      if (highlight.rowNumbers && highlight.rowNumbers.length > 0) {
        for (const row of highlight.rowNumbers) {
          for (let col = 0; col < COLS; col++) {
            const key = `${row}-${col}`;
            if (!map.has(key)) {
              map.set(key, highlight.color);
            }
          }
        }
      }

      // Range-based highlighting
      if (highlight.range) {
        const range = highlight.range.trim().toUpperCase();

        // Single cell (e.g., "A1")
        if (!range.includes(':')) {
          const match = range.match(/^([A-Z]+)(\d+)$/);
          if (match) {
            const [, colLetter, rowStr] = match;
            const targetRow = parseInt(rowStr, 10) - 1;
            const targetCol = letterToCol(colLetter);
            const key = `${targetRow}-${targetCol}`;
            if (!map.has(key)) {
              map.set(key, highlight.color);
            }
          }
        } else {
          // Range (e.g., "A1:B5")
          const parts = range.split(':');
          if (parts.length === 2) {
            const start = parts[0].match(/^([A-Z]+)(\d+)$/);
            const end = parts[1].match(/^([A-Z]+)(\d+)$/);
            if (start && end) {
              const startCol = letterToCol(start[1]);
              const startRow = parseInt(start[2], 10) - 1;
              const endCol = letterToCol(end[1]);
              const endRow = parseInt(end[2], 10) - 1;

              const minRow = Math.min(startRow, endRow);
              const maxRow = Math.max(startRow, endRow);
              const minCol = Math.min(startCol, endCol);
              const maxCol = Math.max(startCol, endCol);

              for (let row = minRow; row <= maxRow; row++) {
                for (let col = minCol; col <= maxCol; col++) {
                  const key = `${row}-${col}`;
                  if (!map.has(key)) {
                    map.set(key, highlight.color);
                  }
                }
              }
            }
          }
        }
      }
    }

    return map;
  }, [highlights, COLS]);

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

  // Check if a cell is highlighted using pre-calculated map
  const getCellHighlightColor = (row: number, col: number): string | null => {
    return highlightMap.get(`${row}-${col}`) || null;
  };

  const handleCellMouseDown = useCallback((row: number, col: number) => {
    setIsSelecting(true);
    onSelectionChange({ start: { row, col }, end: { row, col }, type: 'cell' });
  }, [onSelectionChange]);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    if (isSelecting && selection.type === 'cell') {
      onSelectionChange({ ...selection, end: { row, col } });
    }
  }, [isSelecting, selection, onSelectionChange]);

  const copySelectionToClipboard = useCallback(() => {
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);

    const normalizeRowIndex = (rowIndex: number) => {
      if (displayRowNumbers && displayRowNumbers[rowIndex] !== undefined) {
        return displayRowNumbers[rowIndex];
      }
      return rowIndex;
    };

    const rows: string[] = [];

    for (let row = minRow; row <= maxRow; row++) {
      const actualRow = normalizeRowIndex(row);
      const values: string[] = [];

      for (let col = minCol; col <= maxCol; col++) {
        const rawValue = sheet.cells?.[`${actualRow}-${col}`];
        values.push(rawValue === undefined || rawValue === null ? '' : String(rawValue));
      }

      rows.push(values.join('\t'));
    }

    const text = rows.join('\n');

    if (!text) {
      return;
    }

    const writeClipboard = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return;
        }
      } catch {
        // Fallback below
      }

      if (typeof document === 'undefined') {
        return;
      }

      if (!document.body) {
        return;
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Copy failed:', err);
      } finally {
        document.body.removeChild(textarea);
      }
    };

    void writeClipboard();
  }, [selection, sheet.cells, displayRowNumbers]);

  // Coordinate-based selection for virtualized mode
  useEffect(() => {
    if (!isSelecting || !useVirtualization || selection.type !== 'cell') return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!scrollContainerRef.current) return;

      const container = scrollContainerRef.current;
      const rect = container.getBoundingClientRect();

      // Calculate mouse position relative to grid
      const relativeX = e.clientX - rect.left + container.scrollLeft;
      const relativeY = e.clientY - rect.top + container.scrollTop;

      // Calculate column (account for 64px row header)
      let col = -1;
      let xOffset = 64; // row header width
      for (let c = 0; c < COLS; c++) {
        const colWidth = getColumnWidth(c);
        if (relativeX >= xOffset && relativeX < xOffset + colWidth) {
          col = c;
          break;
        }
        xOffset += colWidth;
      }

      // Calculate row (account for 32px header)
      let row = -1;
      let yOffset = 32; // header height
      for (let r = 0; r < ROWS; r++) {
        const rowHeight = getRowHeight(r);
        if (relativeY >= yOffset && relativeY < yOffset + rowHeight) {
          row = r;
          break;
        }
        yOffset += rowHeight;
      }

      // Update selection if we found a valid cell
      if (row >= 0 && col >= 0 && row < ROWS && col < COLS) {
        onSelectionChange({ ...selection, end: { row, col } });
      }

      // Auto-scroll when near edges
      const scrollMargin = 80;
      const scrollSpeed = 15;

      if (e.clientY < rect.top + scrollMargin) {
        container.scrollTop = Math.max(0, container.scrollTop - scrollSpeed);
      } else if (e.clientY > rect.bottom - scrollMargin) {
        container.scrollTop += scrollSpeed;
      }

      if (e.clientX < rect.left + scrollMargin) {
        container.scrollLeft = Math.max(0, container.scrollLeft - scrollSpeed);
      } else if (e.clientX > rect.right - scrollMargin) {
        container.scrollLeft += scrollSpeed;
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [isSelecting, useVirtualization, selection, ROWS, COLS, getColumnWidth, getRowHeight, onSelectionChange]);

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

  const handleColumnHeaderClick = useCallback((_: number, col: number) => {
    // Select entire column
    onSelectionChange({ 
      start: { row: 0, col }, 
      end: { row: ROWS - 1, col }, 
      type: 'column' 
    });
  }, [ROWS, onSelectionChange]);

  const handleColumnHeaderMouseDown = useCallback((_: number, col: number) => {
    setIsSelectingColumns(true);
    onSelectionChange({ 
      start: { row: 0, col }, 
      end: { row: ROWS - 1, col }, 
      type: 'column' 
    });
  }, [ROWS, onSelectionChange]);

  const handleColumnHeaderMouseEnter = useCallback((_: number, col: number) => {
    if (isSelectingColumns) {
      onSelectionChange({ 
        ...selection,
        end: { row: ROWS - 1, col },
        type: 'column'
      });
    }
  }, [ROWS, isSelectingColumns, onSelectionChange, selection]);

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

  const handleCellDoubleClick = useCallback((row: number, col: number) => {
    setEditingCell({ row, col });
  }, []);

  const handleCellEdit = useCallback((row: number, col: number, value: string) => {
    onCellUpdate(row, col, value);
    setEditingCell(null);
  }, [onCellUpdate]);

  const handleHeaderEdit = useCallback((_: number, colIndex: number, value: string) => {
    onColumnHeaderUpdate(colIndex, value);
    setEditingHeader(null);
  }, [onColumnHeaderUpdate]);

  const handleHeaderDoubleClick = useCallback((_: number, colIndex: number) => {
    setEditingHeader(colIndex);
  }, []);

  const isCellSelected = (row: number, col: number) => {
    return row >= selectionBounds.minRow && row <= selectionBounds.maxRow &&
           col >= selectionBounds.minCol && col <= selectionBounds.maxCol;
  };

  const getSelectionBorderClasses = (row: number, col: number) => {
    if (!isCellSelected(row, col)) return "";

    // Check if this cell is on the perimeter of the selection
    const isTopEdge = row === selectionBounds.minRow;
    const isBottomEdge = row === selectionBounds.maxRow;
    const isLeftEdge = col === selectionBounds.minCol;
    const isRightEdge = col === selectionBounds.maxCol;

    let borderClasses = "";
    if (isTopEdge) borderClasses += " border-t-2 border-t-grid-selected-border";
    if (isBottomEdge) borderClasses += " border-b-2 border-b-grid-selected-border";
    if (isLeftEdge) borderClasses += " border-l-2 border-l-grid-selected-border";
    if (isRightEdge) borderClasses += " border-r-2 border-r-grid-selected-border";

    return borderClasses;
  };

  const isRowHeaderSelected = (row: number) => {
    if (selection.type !== 'row') return false;
    return row >= selectionBounds.minRow && row <= selectionBounds.maxRow;
  };

  const isColumnHeaderSelected = (col: number) => {
    if (selection.type !== 'column') return false;
    return col >= selectionBounds.minCol && col <= selectionBounds.maxCol;
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

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      copySelectionToClipboard();
      return;
    }

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
  }, [selection, editingCell, editingHeader, onSelectionChange, onCellUpdate, ROWS, COLS, copySelectionToClipboard]);

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
      ref={scrollContainerRef}
      className="absolute inset-0 bg-grid border-l border-t border-grid-border overflow-auto"
      onMouseUp={handleMouseUp}
    >
      {/* Grid Container */}
      <div className="inline-block min-w-full">
        {/* Header Row - Fixed */}
        <div className="flex sticky top-0 z-20 bg-grid">
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
                rowIndex={-1}
                colIndex={colIndex}
                isSelected={isColumnHeaderSelected(colIndex)}
                isEditing={editingHeader === colIndex}
                className="cursor-pointer"
                style={{ width: getColumnWidth(colIndex), height: 32 }}
                onDoubleClick={handleHeaderDoubleClick}
                onMouseDown={handleColumnHeaderMouseDown}
                onMouseEnter={handleColumnHeaderMouseEnter}
                onClick={handleColumnHeaderClick}
                onEdit={handleHeaderEdit}
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

        {/* Data Rows - Virtualized for large datasets */}
        {useVirtualization ? (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowIndex = virtualRow.index;
            return (
              <div
                key={virtualRow.key}
                data-index={rowIndex}
                className="flex absolute top-0 left-0 w-full"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  pointerEvents: 'auto',
                }}
              >
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
                    {displayRowNumbers ? displayRowNumbers[rowIndex] : rowIndex + 1}
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
              {Array.from({ length: COLS }, (_, colIndex) => {
                const actualRow = displayRowNumbers ? displayRowNumbers[rowIndex] : rowIndex;
                const highlightColor = getCellHighlightColor(actualRow, colIndex);
                return (
                  <Cell
                    key={`${rowIndex}-${colIndex}`}
                    rowIndex={rowIndex}
                    colIndex={colIndex}
                    value={sheet.cells[`${actualRow}-${colIndex}`] || ""}
                    isHeader={false}
                    isSelected={isCellSelected(rowIndex, colIndex)}
                    isEditing={editingCell?.row === rowIndex && editingCell?.col === colIndex}
                    className={getSelectionBorderClasses(rowIndex, colIndex)}
                    style={{ width: getColumnWidth(colIndex), height: getRowHeight(rowIndex) }}
                    onMouseDown={handleCellMouseDown}
                    onMouseEnter={handleCellMouseEnter}
                    onDoubleClick={handleCellDoubleClick}
                    onEdit={handleCellEdit}
                    onSelectionChange={onSelectionChange}
                    selection={selection}
                    ROWS={ROWS}
                    isHighlighted={!!highlightColor}
                    highlightColor={highlightColor || undefined}
                  />
                );
              })}
              </div>
            );
            })}
          </div>
        ) : (
          /* Non-virtualized rows for smaller datasets */
          Array.from({ length: ROWS }, (_, rowIndex) => (
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
                  {displayRowNumbers ? displayRowNumbers[rowIndex] : rowIndex + 1}
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
              {Array.from({ length: COLS }, (_, colIndex) => {
                const actualRow = displayRowNumbers ? displayRowNumbers[rowIndex] : rowIndex;
                const highlightColor = getCellHighlightColor(actualRow, colIndex);
                return (
                  <Cell
                    key={`${rowIndex}-${colIndex}`}
                    rowIndex={rowIndex}
                    colIndex={colIndex}
                    value={sheet.cells[`${actualRow}-${colIndex}`] || ""}
                    isHeader={false}
                    isSelected={isCellSelected(rowIndex, colIndex)}
                    isEditing={editingCell?.row === rowIndex && editingCell?.col === colIndex}
                    className={getSelectionBorderClasses(rowIndex, colIndex)}
                    style={{ width: getColumnWidth(colIndex), height: getRowHeight(rowIndex) }}
                    onMouseDown={handleCellMouseDown}
                    onMouseEnter={handleCellMouseEnter}
                    onDoubleClick={handleCellDoubleClick}
                    onEdit={handleCellEdit}
                    onSelectionChange={onSelectionChange}
                    selection={selection}
                    ROWS={ROWS}
                    isHighlighted={!!highlightColor}
                    highlightColor={highlightColor || undefined}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
