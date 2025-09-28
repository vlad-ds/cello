import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetData } from "@/pages/Index";
import { cn } from "@/lib/utils";

interface SheetTabsProps {
  sheets: SheetData[];
  activeSheetId: string;
  onSheetSelect: (sheetId: string) => void;
  onAddSheet: () => void;
  onSheetRename: (sheetId: string, newName: string) => void;
}

export const SheetTabs = ({
  sheets,
  activeSheetId,
  onSheetSelect,
  onAddSheet,
  onSheetRename,
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-medium text-foreground">Sheets</h2>
      </div>

      {/* Sheet Tabs */}
      <div className="flex-1 p-2 space-y-1">
        {sheets.map((sheet) => (
          <div
            key={sheet.id}
            className={cn(
              "w-full rounded-md transition-colors",
              activeSheetId === sheet.id
                ? "bg-tab-active text-tab-active-foreground"
                : "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {editingSheetId === sheet.id ? (
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleSheetRename(sheet.id)}
                onKeyDown={(e) => handleKeyDown(e, sheet.id)}
                className="w-full px-3 py-2 bg-transparent text-sm font-medium outline-none border border-grid-selected-border rounded-md"
                autoFocus
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            ) : (
              <button
                onClick={() => onSheetSelect(sheet.id)}
                onDoubleClick={() => handleSheetDoubleClick(sheet)}
                className="w-full text-left px-3 py-2 text-sm font-medium"
              >
                {sheet.name}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Sheet Button */}
      <div className="p-2 border-t border-border">
        <Button
          onClick={onAddSheet}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Sheet
        </Button>
      </div>
    </div>
  );
};