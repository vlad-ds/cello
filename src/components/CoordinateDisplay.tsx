import { CellSelection } from "@/pages/Index";

interface CoordinateDisplayProps {
  selection: CellSelection;
}

const getColumnLabel = (colIndex: number): string => {
  let label = "";
  let num = colIndex + 1;
  
  while (num > 0) {
    num--;
    label = String.fromCharCode(65 + (num % 26)) + label;
    num = Math.floor(num / 26);
  }
  
  return label;
};

const formatCellReference = (row: number, col: number): string => {
  return `${getColumnLabel(col)}${row + 1}`;
};

const formatSelectionReference = (selection: CellSelection): string => {
  const { start, end, type } = selection;
  
  if (type === 'all') {
    return 'ALL';
  }
  
  if (type === 'row') {
    if (start.row === end.row) {
      return `${start.row + 1}:${start.row + 1}`;
    }
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    return `${minRow + 1}:${maxRow + 1}`;
  }
  
  if (type === 'column') {
    if (start.col === end.col) {
      return `${getColumnLabel(start.col)}:${getColumnLabel(start.col)}`;
    }
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    return `${getColumnLabel(minCol)}:${getColumnLabel(maxCol)}`;
  }
  
  // Regular cell selection
  if (start.row === end.row && start.col === end.col) {
    return formatCellReference(start.row, start.col);
  }
  
  return `${formatCellReference(start.row, start.col)}:${formatCellReference(end.row, end.col)}`;
};

export const CoordinateDisplay = ({ selection }: CoordinateDisplayProps) => {
  const displayText = formatSelectionReference(selection);

  return (
    <div className="bg-coordinate-background border-b border-border px-4 py-2">
      <div className="flex items-center gap-4">
        <div className="text-sm text-muted-foreground">
          Selected:
        </div>
        <div className="text-sm font-mono font-medium bg-card border border-border rounded px-2 py-1">
          {displayText}
        </div>
      </div>
    </div>
  );
};