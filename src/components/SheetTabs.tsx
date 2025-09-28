import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetData } from "@/pages/Index";
import { cn } from "@/lib/utils";

interface SheetTabsProps {
  sheets: SheetData[];
  activeSheetId: string;
  onSheetSelect: (sheetId: string) => void;
  onAddSheet: () => void;
}

export const SheetTabs = ({
  sheets,
  activeSheetId,
  onSheetSelect,
  onAddSheet,
}: SheetTabsProps) => {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-medium text-foreground">Sheets</h2>
      </div>

      {/* Sheet Tabs */}
      <div className="flex-1 p-2 space-y-1">
        {sheets.map((sheet) => (
          <button
            key={sheet.id}
            onClick={() => onSheetSelect(sheet.id)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              activeSheetId === sheet.id
                ? "bg-tab-active text-tab-active-foreground"
                : "text-foreground"
            )}
          >
            {sheet.name}
          </button>
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