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

export const CoordinateDisplay = ({ selection }: CoordinateDisplayProps) => {
  const { start, end } = selection;
  
  const displayText = 
    start.row === end.row && start.col === end.col
      ? formatCellReference(start.row, start.col)
      : `${formatCellReference(start.row, start.col)}:${formatCellReference(end.row, end.col)}`;

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