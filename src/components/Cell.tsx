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
  isInFillPreview?: boolean;
  isAIPromptMode?: boolean;
  isInAIPromptRange?: boolean;
  onAIPromptChange?: (row: number, col: number, prompt: string) => void;
  aiPromptInputRef?: React.RefObject<HTMLTextAreaElement>;
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
  isInFillPreview = false,
  isAIPromptMode = false,
  isInAIPromptRange = false,
  onAIPromptChange,
  aiPromptInputRef,
}: CellProps) => {
  const [editValue, setEditValue] = useState(value);
  const localInputRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = aiPromptInputRef && isAIPromptMode ? aiPromptInputRef : localInputRef;
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      isSubmittingRef.current = false;
    }
  }, [isEditing]);

  const handleSubmit = () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    onEdit?.(rowIndex ?? -1, colIndex ?? -1, editValue);

    // Clear selection after a brief delay to ensure it happens after state updates
    setTimeout(() => {
      window.getSelection()?.removeAllRanges();
    }, 10);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setEditValue(newValue);

    // Detect AI prompt mode when first character is '='
    if (newValue.length === 1 && newValue === '=' && !isHeader && onAIPromptChange) {
      onAIPromptChange(rowIndex ?? -1, colIndex ?? -1, newValue);
    } else if (isAIPromptMode && onAIPromptChange) {
      onAIPromptChange(rowIndex ?? -1, colIndex ?? -1, newValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // In AI prompt mode, Enter triggers the AI prompt dialog instead of submitting
    if (isAIPromptMode && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // The parent will handle showing the AI prompt dialog
      return;
    }

    // In AI prompt mode, Escape exits the mode (handled by parent grid)
    if (isAIPromptMode && e.key === "Escape") {
      // Don't preventDefault - let it bubble to parent
      return;
    }

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
      // In AI prompt mode, allow arrow keys for text navigation
      if (isAIPromptMode) {
        return;
      }
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
    !isHeader && !isHighlighted && !isInFillPreview && !isAIPromptMode && !isInAIPromptRange && "bg-grid hover:bg-grid-hover",
    !isHeader && isHighlighted && getHighlightClasses(),
    isSelected && !isHeader && !isAIPromptMode && !isInAIPromptRange && "bg-grid-selected z-10",
    isInFillPreview && !isHeader && "bg-primary/10",
    isAIPromptMode && !isHeader && "bg-purple-100/60 border-purple-400 border-2 z-10",
    isInAIPromptRange && !isHeader && "bg-orange-100/60 border-dashed border-orange-400 border-2 z-10",
    className
  );

  if (isEditing) {
    return (
      <div className={cellClassName} style={style}>
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={handleChange}
          onBlur={isAIPromptMode ? undefined : handleSubmit}
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
    prevProps.isInFillPreview === nextProps.isInFillPreview &&
    prevProps.isAIPromptMode === nextProps.isAIPromptMode &&
    prevProps.isInAIPromptRange === nextProps.isInAIPromptRange &&
    prevProps.className === nextProps.className &&
    prevProps.onMouseDown === nextProps.onMouseDown &&
    prevProps.onMouseEnter === nextProps.onMouseEnter &&
    prevProps.onDoubleClick === nextProps.onDoubleClick &&
    prevProps.onClick === nextProps.onClick &&
    prevProps.onEdit === nextProps.onEdit &&
    prevProps.onAIPromptChange === nextProps.onAIPromptChange &&
    prevProps.aiPromptInputRef === nextProps.aiPromptInputRef &&
    styleEqual
  );
});
