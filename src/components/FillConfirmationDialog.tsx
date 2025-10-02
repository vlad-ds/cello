import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface FillConfirmationDialogProps {
  open: boolean;
  sourceRange: string;
  targetRange: string;
  sourceData: string[][];
  onConfirm: (additionalInstructions?: string) => void;
  onCancel: () => void;
}

export const FillConfirmationDialog = ({
  open,
  sourceRange,
  targetRange,
  sourceData,
  onConfirm,
  onCancel,
}: FillConfirmationDialogProps) => {
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  // Reset instructions when dialog closes
  useEffect(() => {
    if (!open) {
      setAdditionalInstructions("");
    }
  }, [open]);

  // Estimate token count (rough approximation: ~4 chars per token)
  const estimateTokens = () => {
    const dataString = sourceData.flat().join(" ");
    const basePrompt = `I'm using the fill handle to extend data from ${sourceRange} to ${targetRange}.`;
    const totalChars = basePrompt.length + dataString.length + additionalInstructions.length;
    return Math.ceil(totalChars / 4);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onConfirm(additionalInstructions.trim() || undefined);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const getCellCount = () => {
    // Parse target range to calculate cell count
    const match = targetRange.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
    if (!match) return 0;

    const colToNumber = (col: string) => {
      let num = 0;
      for (let i = 0; i < col.length; i++) {
        num = num * 26 + (col.charCodeAt(i) - 64);
      }
      return num;
    };

    const startCol = colToNumber(match[1]);
    const startRow = parseInt(match[2]);
    const endCol = colToNumber(match[3]);
    const endRow = parseInt(match[4]);

    const cols = Math.abs(endCol - startCol) + 1;
    const rows = Math.abs(endRow - startRow) + 1;

    // Subtract source cells
    const sourceMatch = sourceRange.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
    if (!sourceMatch) return cols * rows;

    const sourceStartCol = colToNumber(sourceMatch[1]);
    const sourceStartRow = parseInt(sourceMatch[2]);
    const sourceEndCol = colToNumber(sourceMatch[3]);
    const sourceEndRow = parseInt(sourceMatch[4]);

    const sourceCols = Math.abs(sourceEndCol - sourceStartCol) + 1;
    const sourceRows = Math.abs(sourceEndRow - sourceStartRow) + 1;

    return (cols * rows) - (sourceCols * sourceRows);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>AI Fill Preview</DialogTitle>
          <DialogDescription>
            The AI will analyze the pattern in {sourceRange} and fill {targetRange}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Operation Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Source range:</span>
              <span className="font-mono font-medium">{sourceRange}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Target range:</span>
              <span className="font-mono font-medium">{targetRange}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Cells to fill:</span>
              <span className="font-medium">{getCellCount()}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Estimated tokens:</span>
              <span className="font-medium">~{estimateTokens()}</span>
            </div>
          </div>

          {/* Source Data Preview */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Source data:</label>
            <div className="bg-muted/30 rounded-lg p-3 max-h-32 overflow-auto">
              <div className="font-mono text-xs space-y-1">
                {sourceData.slice(0, 5).map((row, idx) => (
                  <div key={idx} className="text-muted-foreground">
                    {row.join(", ")}
                  </div>
                ))}
                {sourceData.length > 5 && (
                  <div className="text-muted-foreground/60 italic">
                    ... and {sourceData.length - 5} more row(s)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Optional Instructions */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Additional instructions{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              placeholder="e.g., 'Continue the sequence', 'Use exponential growth', etc.&#10;&#10;The AI can understand the pattern automatically, but you can provide hints if needed."
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[80px] resize-none"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Press <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs">Enter</kbd> to fill, or{" "}
              <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs">Shift+Enter</kbd> for new line
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={() => onConfirm(additionalInstructions.trim() || undefined)}>
              Fill with AI
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
