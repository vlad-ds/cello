import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CellProps {
  value: string;
  isHeader?: boolean;
  isSelected?: boolean;
  isEditing?: boolean;
  className?: string;
  onMouseDown?: () => void;
  onMouseEnter?: () => void;
  onDoubleClick?: () => void;
  onEdit?: (value: string) => void;
}

export const Cell = ({
  value,
  isHeader = false,
  isSelected = false,
  isEditing = false,
  className,
  onMouseDown,
  onMouseEnter,
  onDoubleClick,
  onEdit,
}: CellProps) => {
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

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
    }
  };

  const cellClassName = cn(
    "border-r border-b border-grid-border flex items-center px-2 text-sm select-none cursor-cell",
    isHeader && "bg-grid-header text-grid-header-foreground font-medium cursor-text",
    !isHeader && "bg-grid hover:bg-grid-hover",
    isSelected && !isHeader && "bg-grid-selected border-grid-selected-border border-2 z-10",
    className
  );

  if (isEditing) {
    return (
      <div className={cellClassName}>
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={handleKeyDown}
          className="w-full h-full bg-transparent outline-none border-none text-sm"
        />
      </div>
    );
  }

  return (
    <div
      className={cellClassName}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onDoubleClick={onDoubleClick}
    >
      <span className="truncate w-full">
        {value || (isHeader ? "" : "")}
      </span>
    </div>
  );
};