import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetData } from "@/pages/Index";
import { cn } from "@/lib/utils";

interface SheetTabsProps {
  sheets: SheetData[];
  activeSheetId: string;
  onSheetSelect: (sheetId: string) => void;
  onAddSheet: () => void;
  onSheetRename: (sheetId: string, newName: string) => void;
  onSheetDelete: (sheetId: string) => void;
}

export const SheetTabs = ({
  sheets,
  activeSheetId,
  onSheetSelect,
  onAddSheet,
  onSheetRename,
  onSheetDelete,
}: SheetTabsProps) => {
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleSheetDoubleClick = (sheet: SheetData) => {
    setEditingSheetId(sheet.id);
    setEditValue(sheet.name);
  };

  const handleSheetRename = (sheetId: string) => {
    if (editValue.trim()) {
      onSheetRename(sheetId, editValue.trim());
    }
    setEditingSheetId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, sheetId: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSheetRename(sheetId);
    } else if (e.key === "Escape") {
      setEditingSheetId(null);
    }
  };

  return (
    <div className="flex items-center h-full gap-2 pl-6 pr-2 overflow-x-auto">
      {/* Sheet Tabs */}
      {sheets.map((sheet) => (
        <div
          key={sheet.id}
          className={cn(
            "flex items-center rounded-t-md border-b-2 transition-colors whitespace-nowrap",
            activeSheetId === sheet.id
              ? "bg-background border-primary text-foreground"
              : "bg-card/50 border-transparent hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {editingSheetId === sheet.id ? (
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => handleSheetRename(sheet.id)}
              onKeyDown={(e) => handleKeyDown(e, sheet.id)}
              className="px-3 py-2 bg-transparent text-sm font-medium outline-none border border-grid-selected-border rounded-md min-w-[100px]"
              autoFocus
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center group">
              <button
                onClick={() => onSheetSelect(sheet.id)}
                onDoubleClick={() => handleSheetDoubleClick(sheet)}
                className="px-3 py-2 text-sm font-medium"
              >
                {sheet.name}
              </button>
              {sheets.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSheetDelete(sheet.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 mr-1 hover:bg-destructive/10 hover:text-destructive rounded transition-all duration-200"
                  title="Delete sheet"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add Sheet Button */}
      <Button
        onClick={onAddSheet}
        variant="ghost"
        size="sm"
        className="shrink-0"
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
};