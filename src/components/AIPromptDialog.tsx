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

interface AIPromptDialogProps {
  open: boolean;
  targetCell: string;
  prompt: string;
  selectedRange?: string;
  onConfirm: (prompt: string) => void;
  onCancel: () => void;
}

export const AIPromptDialog = ({
  open,
  targetCell,
  prompt,
  selectedRange,
  onConfirm,
  onCancel,
}: AIPromptDialogProps) => {
  const [editedPrompt, setEditedPrompt] = useState(prompt);

  // Reset prompt when dialog opens
  useEffect(() => {
    if (open) {
      setEditedPrompt(prompt);
    }
  }, [open, prompt]);

  // Estimate token count (rough approximation: ~4 chars per token)
  const estimateTokens = () => {
    let totalChars = editedPrompt.length + targetCell.length;
    if (selectedRange) {
      totalChars += selectedRange.length + 50; // Add overhead for range reference
    }
    return Math.ceil(totalChars / 4);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onConfirm(editedPrompt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>AI Cell Prompt</DialogTitle>
          <DialogDescription>
            The AI will analyze your prompt{selectedRange ? " and selected range" : ""} to fill {targetCell}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Operation Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Target cell:</span>
              <span className="font-mono font-medium">{targetCell}</span>
            </div>
            {selectedRange && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Selected range:</span>
                <span className="font-mono font-medium">{selectedRange}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Estimated tokens:</span>
              <span className="font-medium">~{estimateTokens()}</span>
            </div>
          </div>

          {/* Prompt Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              AI Prompt
            </label>
            <Textarea
              placeholder="Describe what you want the AI to put in this cell...&#10;&#10;Example: 'Calculate the average of the selected range' or 'Summarize this data'"
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[120px] resize-none"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Press <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs">{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</kbd> to confirm
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={() => onConfirm(editedPrompt)} disabled={!editedPrompt.trim()}>
              Fill with AI
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
