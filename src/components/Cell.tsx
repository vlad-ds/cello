import { useState, useRef, useEffect, memo } from "react";
import { cn } from "@/lib/utils";

interface CellProps {
  value: string;
  rowIndex?: number;
  colIndex?: number;
  isHeader?: boolean;
  isSelected?: boolean;
  isEditing?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onMouseDown?: (row: number, col: number, event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseEnter?: (row: number, col: number, event: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (row: number, col: number, event: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: (row: number, col: number, event: React.MouseEvent<HTMLDivElement>) => void;
  onEdit?: (row: number, col: number, value: string) => void;
  onSelectionChange?: (selection: any) => void;
  selection?: any;
  ROWS?: number;
  isHighlighted?: boolean;
  highlightColor?: string;
}

const CellComponent = ({
  value,
  rowIndex,
  colIndex,
  isHeader = false,
  isSelected = false,
  isEditing = false,
  className,
  style,
  onMouseDown,
  onMouseEnter,
  onDoubleClick,
  onClick,
  onEdit,
  onSelectionChange,
  selection,
  ROWS,
  isHighlighted = false,
  highlightColor = 'yellow',
}: CellProps) => {
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSubmit = () => {
    onEdit?.(rowIndex ?? -1, colIndex ?? -1, editValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
      // Move to next row after editing if we have access to selection
      if (!isHeader && onSelectionChange && selection && ROWS) {
        setTimeout(() => {
          const currentRow = selection.start.row;
          const currentCol = selection.start.col;
          const newRow = Math.min(ROWS - 1, currentRow + 1);
          onSelectionChange({ 
            start: { row: newRow, col: currentCol }, 
            end: { row: newRow, col: currentCol }, 
            type: 'cell' 
          });
        }, 0);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      setEditValue(value);
      onEdit?.(rowIndex ?? -1, colIndex ?? -1, value);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Exit editing mode when arrow keys are pressed
      e.preventDefault();
      handleSubmit();
    }
  };

  // Map highlight colors to Tailwind classes
  const getHighlightClasses = () => {
    if (!isHighlighted) return '';

    const colorMap: Record<string, string> = {
      yellow: 'bg-yellow-200/70 hover:bg-yellow-200/80',
      red: 'bg-red-200/70 hover:bg-red-200/80',
      green: 'bg-green-200/70 hover:bg-green-200/80',
      blue: 'bg-blue-200/70 hover:bg-blue-200/80',
      orange: 'bg-orange-200/70 hover:bg-orange-200/80',
      purple: 'bg-purple-200/70 hover:bg-purple-200/80',
    };

    return colorMap[highlightColor] || colorMap.yellow;
  };

  const cellClassName = cn(
    "border-r border-b border-grid-border flex items-start px-2 py-1 text-sm select-none cursor-cell overflow-hidden relative pointer-events-auto",
    isHeader && "bg-grid-header text-grid-header-foreground font-medium cursor-text items-center",
    !isHeader && !isHighlighted && "bg-grid hover:bg-grid-hover",
    !isHeader && isHighlighted && getHighlightClasses(),
    isSelected && !isHeader && "bg-grid-selected z-10",
    className
  );

  if (isEditing) {
    return (
      <div className={cellClassName} style={style}>
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={handleKeyDown}
          className="w-full h-full bg-transparent outline-none border-none text-sm resize-none leading-tight py-0"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <div
      className={cellClassName}
      style={style}
      data-row-index={rowIndex}
      data-col-index={colIndex}
      onMouseDown={(event) => onMouseDown?.(rowIndex ?? -1, colIndex ?? -1, event)}
      onMouseEnter={(event) => onMouseEnter?.(rowIndex ?? -1, colIndex ?? -1, event)}
      onDoubleClick={(event) => onDoubleClick?.(rowIndex ?? -1, colIndex ?? -1, event)}
      onClick={(event) => onClick?.(rowIndex ?? -1, colIndex ?? -1, event)}
    >
      <span className={cn(
        "w-full leading-tight overflow-hidden",
        isHeader ? "truncate" : "break-words whitespace-pre-wrap"
      )}>
        {value || (isHeader ? "" : "")}
      </span>
    </div>
  );
};

export const Cell = memo(CellComponent, (prevProps, nextProps) => {
  const styleEqual =
    prevProps.style === nextProps.style ||
    (!!prevProps.style &&
      !!nextProps.style &&
      prevProps.style.width === nextProps.style.width &&
      prevProps.style.height === nextProps.style.height);

  return (
    prevProps.value === nextProps.value &&
    prevProps.rowIndex === nextProps.rowIndex &&
    prevProps.colIndex === nextProps.colIndex &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isEditing === nextProps.isEditing &&
    prevProps.isHeader === nextProps.isHeader &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.highlightColor === nextProps.highlightColor &&
    prevProps.className === nextProps.className &&
    prevProps.onMouseDown === nextProps.onMouseDown &&
    prevProps.onMouseEnter === nextProps.onMouseEnter &&
    prevProps.onDoubleClick === nextProps.onDoubleClick &&
    prevProps.onClick === nextProps.onClick &&
    prevProps.onEdit === nextProps.onEdit &&
    styleEqual
  );
});
