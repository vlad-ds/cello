import { useState, useEffect, useRef } from "react";
import { CellSelection } from "@/pages/Index";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Maximize2, Zap } from "lucide-react";

interface CoordinateDisplayProps {
  selection: CellSelection;
  cellContent?: string;
  selectedCells?: { [key: string]: string };
  rowNumberResolver?: (rowIndex: number) => number;
}

const getColumnLabel = (colIndex: number): string => {
  let label = "";
  let num = colIndex + 1;
  
  while (num > 0) {
    num--;
    label = String.fromCharCode(65 + (num % 26)) + label;
    num = Math.floor(num / 26);
  }
  
  return label;
};

const formatCellReference = (
  row: number,
  col: number,
  resolveRow?: (rowIndex: number) => number
): string => {
  const actualRow = resolveRow ? resolveRow(row) : row;
  return `${getColumnLabel(col)}${actualRow + 1}`;
};

const formatSelectionReference = (
  selection: CellSelection,
  resolveRow?: (rowIndex: number) => number
): string => {
  const { start, end, type } = selection;
  const resolve = (rowIndex: number) => (resolveRow ? resolveRow(rowIndex) : rowIndex);
  
  if (type === 'all') {
    return 'ALL';
  }
  
  if (type === 'row') {
    if (start.row === end.row) {
      const actual = resolve(start.row);
      return `${actual + 1}:${actual + 1}`;
    }
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const actualMin = resolve(minRow);
    const actualMax = resolve(maxRow);
    return `${actualMin + 1}:${actualMax + 1}`;
  }
  
  if (type === 'column') {
    if (start.col === end.col) {
      return `${getColumnLabel(start.col)}:${getColumnLabel(start.col)}`;
    }
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    return `${getColumnLabel(minCol)}:${getColumnLabel(maxCol)}`;
  }
  
  // Regular cell selection
  if (start.row === end.row && start.col === end.col) {
    return formatCellReference(start.row, start.col, resolveRow);
  }
  
  return `${formatCellReference(start.row, start.col, resolveRow)}:${formatCellReference(end.row, end.col, resolveRow)}`;
};

export const CoordinateDisplay = ({ selection, cellContent, selectedCells, rowNumberResolver }: CoordinateDisplayProps) => {
  const displayText = formatSelectionReference(selection, rowNumberResolver);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isQuickLookOpen, setIsQuickLookOpen] = useState(false);
  const spaceDownTimeRef = useRef(0);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [isApproximate, setIsApproximate] = useState(true);
  const [isLoadingExact, setIsLoadingExact] = useState(false);

  // Check if single cell is selected
  const isSingleCell = selection.start.row === selection.end.row &&
                       selection.start.col === selection.end.col &&
                       selection.type === 'cell';

  // Get combined text from all selected cells
  const selectedText = selectedCells
    ? Object.values(selectedCells).join('\n')
    : (cellContent || '');

  // Fetch approximate token count when selection changes
  useEffect(() => {
    if (!selectedText) {
      setTokenCount(null);
      setIsApproximate(true);
      return;
    }

    const fetchApproximateCount = async () => {
      try {
        const apiUrl = import.meta.env.VITE_SQLITE_API_URL || 'http://localhost:4000';
        const response = await fetch(`${apiUrl}/api/count-tokens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: selectedText }),
        });

        if (response.ok) {
          const data = await response.json();
          setTokenCount(data.tokens);
          setIsApproximate(true);
        }
      } catch (error) {
        console.error('Failed to count tokens:', error);
      }
    };

    fetchApproximateCount();
  }, [selectedText]);

  // Fetch exact token count from Anthropic API
  const fetchExactCount = async () => {
    if (!selectedText) return;

    setIsLoadingExact(true);
    try {
      const apiUrl = import.meta.env.VITE_SQLITE_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/api/count-tokens-exact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selectedText }),
      });

      if (response.ok) {
        const data = await response.json();
        setTokenCount(data.tokens);
        setIsApproximate(false);
      } else {
        const error = await response.json();
        console.error('Failed to get exact count:', error);
      }
    } catch (error) {
      console.error('Failed to get exact count:', error);
    } finally {
      setIsLoadingExact(false);
    }
  };

  // Spacebar quick look (like macOS) - using simple overlay to avoid focus issues
  useEffect(() => {
    const HOLD_THRESHOLD = 200; // ms to distinguish tap from hold

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Escape to close preview
      if (e.code === 'Escape' && isQuickLookOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsQuickLookOpen(false);
        return;
      }

      // Only trigger if spacebar and not typing in an input/textarea
      // Ignore repeated keydown events when holding the key
      if (e.code === 'Space' &&
          !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {

        // Always prevent space from being typed into cells when single cell is selected
        if (isSingleCell) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          // Only process on first keydown (not repeated)
          if (!e.repeat && spaceDownTimeRef.current === 0) {
            spaceDownTimeRef.current = Date.now();

            // Toggle if already open (tap to close)
            setIsQuickLookOpen(prev => !prev);
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceDownTimeRef.current > 0) {
        // Prevent default and stop propagation for keyup too
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const holdDuration = Date.now() - spaceDownTimeRef.current;
        spaceDownTimeRef.current = 0;

        // If held for longer than threshold, close overlay (hold mode)
        if (holdDuration >= HOLD_THRESHOLD) {
          setIsQuickLookOpen(false);
        }
        // else: tap mode - state was already toggled in keydown
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [isSingleCell, cellContent, isQuickLookOpen]);

  // Truncate cell content if it's too long
  const maxLength = 100;
  const shouldTruncate = cellContent && cellContent.length > maxLength;
  const truncatedContent = shouldTruncate
    ? cellContent.substring(0, maxLength) + "..."
    : cellContent;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="bg-coordinate-background border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground flex-shrink-0">
            Selected:
          </div>
          <div className="text-sm font-mono font-medium bg-card border border-border rounded-lg px-2 py-1 flex-shrink-0">
            {displayText}
          </div>
          {tokenCount !== null && (
            <>
              <div className="text-sm text-muted-foreground flex-shrink-0">
                Tokens:
              </div>
              <div className="flex items-center gap-0 text-sm font-mono font-medium bg-card border border-border rounded-lg overflow-hidden flex-shrink-0">
                <div className="px-2 py-1 flex items-center gap-1">
                  <span>{tokenCount.toLocaleString()}</span>
                  {isApproximate && (
                    <span className="text-xs text-muted-foreground" title="Approximate count using GPT-2 tokenizer">
                      ~
                    </span>
                  )}
                </div>
                {isApproximate && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="px-2 py-1 border-l border-border hover:bg-accent transition-colors disabled:opacity-50"
                        onClick={fetchExactCount}
                        disabled={isLoadingExact}
                      >
                        <Zap className={`w-3 h-3 ${isLoadingExact ? 'animate-pulse' : ''}`} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Get exact token count from Anthropic API</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </>
          )}
          {cellContent && (
            <>
              <div className="text-sm bg-card border border-border rounded-lg px-3 py-1 flex-1 min-w-0 overflow-hidden">
                <div className="truncate">
                  {truncatedContent}
                </div>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-shrink-0 h-8 px-2"
                    title="View full content"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Cell Content - {displayText}</DialogTitle>
                  </DialogHeader>
                  <div className="mt-4 max-h-96 overflow-y-auto">
                    <div className="text-sm bg-muted/50 rounded-lg p-4 font-mono whitespace-pre-wrap break-words">
                      {cellContent}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Quick Look Overlay - doesn't steal focus */}
      {isQuickLookOpen && isSingleCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full mx-4 pointer-events-auto">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="font-medium text-foreground">Cell Content - {displayText}</h3>
            </div>
            <div className="px-6 py-4 max-h-96 overflow-y-auto">
              <div className="text-sm bg-muted/50 rounded-lg p-4 font-mono whitespace-pre-wrap break-words">
                {cellContent || <span className="text-muted-foreground italic">Empty cell</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </TooltipProvider>
  );
};
