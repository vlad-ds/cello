import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CellProps {
  value: string;
  isHeader?: boolean;
  isSelected?: boolean;
  isEditing?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onMouseDown?: () => void;
  onMouseEnter?: () => void;
  onDoubleClick?: () => void;
  onClick?: () => void;
  onEdit?: (value: string) => void;
}

export const Cell = ({
  value,
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
    onEdit?.(editValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      setEditValue(value);
      onEdit?.(value);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Exit editing mode when arrow keys are pressed
      e.preventDefault();
      handleSubmit();
    }
  };

  const cellClassName = cn(
    "border-r border-b border-grid-border flex items-start px-2 py-1 text-sm select-none cursor-cell",
    isHeader && "bg-grid-header text-grid-header-foreground font-medium cursor-text items-center",
    !isHeader && "bg-grid hover:bg-grid-hover",
    isSelected && !isHeader && "bg-grid-selected border-grid-selected-border border-2 z-10",
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
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
    >
      <span className={cn(
        "w-full leading-tight",
        isHeader ? "truncate" : "break-words"
      )}>
        {value || (isHeader ? "" : "")}
      </span>
    </div>
  );
};