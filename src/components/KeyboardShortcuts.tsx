import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

interface Shortcut {
  key: string;
  description: string;
  category?: string;
}

const shortcuts: Shortcut[] = [
  {
    key: "Space (tap)",
    description: "Toggle quick look at cell content",
    category: "Cell Navigation",
  },
  {
    key: "Space (hold)",
    description: "Quick look while holding spacebar",
    category: "Cell Navigation",
  },
  {
    key: "Esc",
    description: "Close quick look preview",
    category: "Cell Navigation",
  },
  {
    key: "Arrow Keys",
    description: "Navigate between cells",
    category: "Cell Navigation",
  },
  {
    key: "Enter",
    description: "Edit selected cell",
    category: "Editing",
  },
  {
    key: "Delete / Backspace",
    description: "Clear selected cells",
    category: "Editing",
  },
  {
    key: "⌘C / Ctrl+C",
    description: "Copy selected cells",
    category: "Editing",
  },
  // More shortcuts will be added here
];

const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
  const category = shortcut.category || "General";
  if (!acc[category]) {
    acc[category] = [];
  }
  acc[category].push(shortcut);
  return acc;
}, {} as Record<string, Shortcut[]>);

export const KeyboardShortcuts = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          title="Keyboard shortcuts"
        >
          <Keyboard className="w-4 h-4" />
          <span className="text-xs hidden sm:inline">Shortcuts</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-6">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {categoryShortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <kbd className="px-3 py-1 text-xs font-mono font-medium bg-muted border border-border rounded-lg shadow-sm">
                      {shortcut.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            More shortcuts coming soon! ✨
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
