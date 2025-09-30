import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, Info, Database, ChevronDown, Hammer, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { backendConfig } from "@/config/backend";
import {
  dataClient,
  isSupabaseBackend,
  type CellHighlight,
  type FilterCondition,
  type ChatMessage,
  type ToolCallRecord,
} from "@/integrations/database";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  contextRange?: string | null;
  toolCalls?: ToolCall[] | null;
  isStreaming?: boolean;
}

type ToolCall = ToolCallRecord;

interface ChatPanelProps {
  onCommand?: (command: string) => void;
  onAssistantToolCalls?: (toolCalls: ToolCall[] | null | undefined) => void;
  selectedCells?: { [key: string]: string };
  spreadsheetId?: string;
  activeSheetId?: string;
  highlights?: CellHighlight[];
  onClearHighlights?: () => void;
  onScrollToHighlight?: (highlight: CellHighlight) => void;
  filters?: FilterCondition[];
  onClearFilters?: () => void;
}

const getRangeValue = (selectedCells?: { [key: string]: string }) => {
  if (!selectedCells || Object.keys(selectedCells).length === 0) return null;
  const cells = Object.keys(selectedCells)
    .map((key) => key.toUpperCase())
    .sort();
  if (cells.length === 0) return null;

  const first = cells[0];
  const last = cells[cells.length - 1];
  if (first === last) {
    return first;
  }
  return `${first}:${last}`;
};

const formatRangeDisplay = (value?: string | null) => {
  if (!value) return null;
  if (value.includes(':')) {
    return `Agent read range ${value}`;
  }
  return `Agent read cell ${value}`;
};

const renderMarkdown = (content: string) => {
  const parsed = marked.parse(content, { breaks: true });
  const html = typeof parsed === 'string' ? parsed : '';
  return DOMPurify.sanitize(html);
};

const mapChatHistoryToMessages = (history: ChatMessage[]): Message[] =>
  history.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.created_at),
    contextRange: message.context_range ?? null,
    toolCalls: message.tool_calls ?? null,
    isStreaming: false,
  }));

const welcomeMessage: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I'm your spreadsheet AI assistant. I can help you work with your data, create formulas, analyze trends, and more. Try asking me something like 'Sum column A' or 'What's the average of row 1'?",
  timestamp: new Date(),
  contextRange: null,
  toolCalls: null,
  isStreaming: false,
};

export const ChatPanel = ({ onCommand, onAssistantToolCalls, selectedCells, spreadsheetId, activeSheetId, highlights = [], onClearHighlights, onScrollToHighlight, filters = [], onClearFilters }: ChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSupabaseBackend) {
      setMessages([welcomeMessage]);
      return;
    }

    if (!spreadsheetId) {
      setMessages([welcomeMessage]);
      return;
    }

    let isMounted = true;
    setIsLoadingHistory(true);
    dataClient
      .getChatMessages(spreadsheetId)
      .then((history) => {
        if (!isMounted) return;
        if (history.length === 0) {
          setMessages([welcomeMessage]);
        } else {
          setMessages(mapChatHistoryToMessages(history));
        }
      })
      .catch((error) => {
        console.error('Failed to load chat history', error);
        if (isMounted) {
          setMessages([welcomeMessage]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingHistory(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [spreadsheetId, isSupabaseBackend]);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const trimmed = input.trim();
    const rangeValue = getRangeValue(selectedCells);
    const timestamp = new Date();
    const userMessage: Message = {
      id: `${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp,
      contextRange: rangeValue,
      toolCalls: null,
      isStreaming: false,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    const streamChat = (!isSupabaseBackend && typeof dataClient.sendChatMessageStream === 'function')
      ? dataClient.sendChatMessageStream.bind(dataClient)
      : undefined;

    try {
      if (!isSupabaseBackend && streamChat) {
        if (!spreadsheetId) {
          const warningMessage: Message = {
            id: `${Date.now() + 1}`,
            role: 'assistant',
            content: 'Open a spreadsheet to start a saved conversation.',
            timestamp: new Date(),
            contextRange: null,
            toolCalls: null,
            isStreaming: false,
          };
          setMessages((prev) => [...prev, warningMessage]);
        } else {
          const assistantId = `assistant-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              role: 'assistant',
              content: '',
              timestamp: new Date(),
              contextRange: rangeValue,
              toolCalls: [],
              isStreaming: true,
            },
          ]);

          let aggregatedText = '';
          let currentToolCalls: ToolCall[] = [];
          let ackSnapshot: string | null = null;
          let toolCallsSeen = false;

          for await (const event of streamChat(spreadsheetId, {
            query: trimmed,
            selectedCells: selectedCells || {},
            activeSheetId,
          })) {
            if (event.type === 'delta') {
              aggregatedText += event.text;
              if (!toolCallsSeen && ackSnapshot === null) {
                const text = aggregatedText;
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === assistantId
                      ? { ...message, content: text }
                      : message
                  )
                );
              }
            } else if (event.type === 'tool_call') {
              toolCallsSeen = true;
              if (ackSnapshot === null) {
                ackSnapshot = (aggregatedText || '').trim() || aggregatedText;
              }
              currentToolCalls = [...currentToolCalls, event.toolCall];
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        content: ackSnapshot || message.content,
                        toolCalls: currentToolCalls,
                      }
                    : message
                )
              );
              onAssistantToolCalls?.(currentToolCalls);
            } else if (event.type === 'error') {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        content: event.error,
                        toolCalls: null,
                        isStreaming: false,
                      }
                    : message
                )
              );
              onAssistantToolCalls?.(null);
              break;
            } else if (event.type === 'done') {
              const finalAssistant = event.assistantMessage;
              const finalToolCalls = finalAssistant.tool_calls ?? (currentToolCalls.length > 0 ? currentToolCalls : null);
              const finalContent = finalAssistant.content ?? '';
              const finalTimestamp = finalAssistant.created_at ? new Date(finalAssistant.created_at) : new Date();

              if (!toolCallsSeen) {
                const resolvedContent = finalContent.trim().length > 0 ? finalContent : aggregatedText || '';
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === assistantId
                      ? {
                          ...message,
                          id: finalAssistant.id ?? message.id,
                          content: resolvedContent,
                          toolCalls: finalToolCalls,
                          isStreaming: false,
                          contextRange: finalAssistant.context_range ?? null,
                          timestamp: finalTimestamp,
                        }
                      : message
                  )
                );
              } else {
                const ackContent = ackSnapshot || (aggregatedText || '').trim() || aggregatedText;

                setMessages((prev) => {
                  const withoutStreaming = prev.map((message) => {
                    if (message.id !== assistantId) {
                      return message;
                    }

                    return {
                      ...message,
                      content: ackContent || message.content,
                      toolCalls: finalToolCalls ?? message.toolCalls,
                      isStreaming: false,
                      timestamp: message.timestamp,
                    };
                  });

                  if (finalContent && finalContent.trim().length > 0) {
                    const finalMessage: Message = {
                      id: finalAssistant.id ?? `${assistantId}-final`,
                      role: 'assistant',
                      content: finalContent,
                      timestamp: finalTimestamp,
                      contextRange: finalAssistant.context_range ?? null,
                      toolCalls: null,
                      isStreaming: false,
                    };

                    return [...withoutStreaming, finalMessage];
                  }

                  return withoutStreaming;
                });
              }

              onAssistantToolCalls?.(finalToolCalls ?? null);
              break;
            }
          }
        }
      } else if (!isSupabaseBackend) {
        if (!spreadsheetId) {
          const warningMessage: Message = {
            id: `${Date.now() + 1}`,
            role: 'assistant',
            content: 'Open a spreadsheet to start a saved conversation.',
            timestamp: new Date(),
            contextRange: null,
            toolCalls: null,
            isStreaming: false,
          };
          setMessages((prev) => [...prev, warningMessage]);
        } else {
          const response = await dataClient.sendChatMessage(spreadsheetId, {
            query: trimmed,
            selectedCells: selectedCells || {},
            activeSheetId,
          });

          const updatedMessages = response.messages ?? [];
          if (updatedMessages.length === 0) {
            setMessages([welcomeMessage]);
          } else {
            setMessages(mapChatHistoryToMessages(updatedMessages));
          }

          const lastAssistant = [...updatedMessages]
            .reverse()
            .find((message) => message.role === 'assistant');
          if (lastAssistant) {
            onAssistantToolCalls?.(lastAssistant.tool_calls ?? null);
          }
        }
      } else {
        const { data, error } = await supabase.functions.invoke('gemini-chat', {
          body: {
            query: trimmed,
            selectedCells: selectedCells || {},
          },
        });

        if (error) {
          throw error;
        }

        const assistantMessage: Message = {
          id: `${Date.now() + 1}`,
          role: 'assistant',
          content: data.response || "I'm sorry, I couldn't process your request.",
          timestamp: new Date(),
          contextRange: rangeValue,
          toolCalls: null,
          isStreaming: false,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        onAssistantToolCalls?.(null);
      }
    } catch (error) {
      console.error('Error processing conversation:', error);
      const errorMessage: Message = {
        id: `${Date.now() + 1}`,
        role: 'assistant',
        content:
          error instanceof Error
            ? error.message
            : 'Sorry, I encountered an error processing your request.',
        timestamp: new Date(),
        contextRange: null,
        toolCalls: null,
        isStreaming: false,
      };
      setMessages((prev) => [...prev, errorMessage]);
      onAssistantToolCalls?.(null);
    } finally {
      setIsTyping(false);
    }

    onCommand?.(trimmed);
  };

  const handleClearConversation = async () => {
    if (isSupabaseBackend) {
      toast('Clearing conversations is only available when using the local SQLite backend.');
      return;
    }

    if (!spreadsheetId) {
      toast('Open a spreadsheet to clear its conversation.');
      return;
    }

    const confirmed = window.confirm('Clear the assistant conversation for this spreadsheet?');
    if (!confirmed) return;

    setIsClearing(true);
    try {
      await dataClient.clearChat(spreadsheetId);
      setMessages([welcomeMessage]);
      toast('Conversation cleared.');
    } catch (error) {
      console.error('Failed to clear conversation', error);
      toast(
        error instanceof Error
          ? error.message
          : 'Unable to clear the conversation. Please try again.'
      );
    } finally {
      setIsClearing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border bg-gradient-to-r from-primary/5 to-accent/5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">AI Assistant</h3>
              <p className="text-sm text-muted-foreground">Spreadsheet helper</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearConversation}
            disabled={isTyping || isClearing || (!spreadsheetId && !isSupabaseBackend) || isLoadingHistory}
          >
            Clear Chat
          </Button>
        </div>
      </div>

      {/* Active Highlights Banner */}
      {highlights.length > 0 && (
        <div className="p-3 border-b border-border bg-muted/50 flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">
                {highlights.length} active highlight{highlights.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-1">
              {highlights.map((highlight, idx) => (
                <button
                  key={idx}
                  onClick={() => onScrollToHighlight?.(highlight)}
                  className="flex items-center gap-2 w-full text-left hover:bg-muted/70 rounded px-2 py-1 -mx-2 transition-colors cursor-pointer"
                  title="Click to scroll to highlight"
                >
                  <div className={`w-3 h-3 rounded-sm flex-shrink-0 ${
                    highlight.color === 'yellow' ? 'bg-yellow-400' :
                    highlight.color === 'red' ? 'bg-red-400' :
                    highlight.color === 'green' ? 'bg-green-400' :
                    highlight.color === 'blue' ? 'bg-blue-400' :
                    highlight.color === 'orange' ? 'bg-orange-400' :
                    highlight.color === 'purple' ? 'bg-purple-400' :
                    'bg-yellow-400'
                  }`} />
                  <span className="text-xs text-muted-foreground">
                    {highlight.range || (highlight.condition ? `condition: ${highlight.condition}` : 'unknown')}
                    {highlight.rowNumbers && ` (${highlight.rowNumbers.length} row${highlight.rowNumbers.length !== 1 ? 's' : ''})`}
                    {highlight.message && ` - ${highlight.message}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={onClearHighlights}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Active Filters Banner */}
      {filters.length > 0 && (
        <div className="p-3 border-b border-border bg-blue-50/50 dark:bg-blue-950/20 flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {filters.length} active filter{filters.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-1">
              {filters.map((filter, idx) => (
                <div key={idx} className="text-xs text-blue-700 dark:text-blue-300 font-mono bg-blue-100/50 dark:bg-blue-900/30 px-2 py-1 rounded">
                  {filter.condition}
                </div>
              ))}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={onClearFilters}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`flex gap-3 max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === "user" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground"
                }`}>
                  {message.role === "user" ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>

                {/* Message Content */}
                <div className={`space-y-1 ${message.role === "user" ? "text-right" : ""}`}>
                  <div className={`p-3 rounded-lg ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}>
                    {message.role === 'assistant'
                      ? (() => {
                          const hasToolCalls = !!(message.toolCalls && message.toolCalls.length > 0);

                          const renderAssistantContent = () => (
                            message.content ? (
                              <div
                                className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                              />
                            ) : null
                          );

                          const renderContextRange = () => (
                            message.contextRange ? (
                              <p className="text-xs italic text-muted-foreground mt-2 flex items-center gap-1">
                                <Info className="w-3 h-3" />
                                {formatRangeDisplay(message.contextRange)}
                              </p>
                            ) : null
                          );

                          const renderStreamingIndicator = () => (
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 animate-spin" />
                              Streaming response...
                            </p>
                          );

                          const renderToolCalls = () => (
                            <div className="mt-3 space-y-3">
                              {message.toolCalls!.map((toolCall, index) => {
                                // existing rendering (unchanged) ...
                                if (toolCall.kind === 'highlight_clear') {
                                  return (
                                    <div
                                      key={`highlight-clear-${index}`}
                                      className="rounded-md border border-border/70 p-3 text-sm bg-muted/30"
                                    >
                                      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                                        <X className="h-4 w-4" />
                                        <span>Cleared all highlights</span>
                                        <Badge variant={toolCall.status === 'error' ? 'destructive' : 'secondary'}>
                                          {toolCall.status === 'error' ? 'Error' : 'Clear'}
                                        </Badge>
                                      </div>
                                      {toolCall.error && (
                                        <p className="mt-2 text-xs text-destructive">
                                          {toolCall.error}
                                        </p>
                                      )}
                                    </div>
                                  );
                                }

                                if (toolCall.kind === 'highlight') {
                                  return (
                                    <div
                                      key={`highlight-${index}`}
                                      className="rounded-md border border-border/70 p-3 text-sm bg-muted/30"
                                    >
                                      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                                        <Sparkles className="h-4 w-4" />
                                        <span>
                                          Highlighted cells {toolCall.range || (toolCall.condition ? `where ${toolCall.condition}` : 'unknown')}
                                          {toolCall.rowNumbers && ` (${toolCall.rowNumbers.length} row${toolCall.rowNumbers.length !== 1 ? 's' : ''})`}
                                          {toolCall.sheetName
                                            ? ` in ${toolCall.sheetName}`
                                            : toolCall.sheetId
                                            ? ` in sheet ${toolCall.sheetId}`
                                            : ''}
                                        </span>
                                        <Badge variant={toolCall.status === 'error' ? 'destructive' : 'secondary'}>
                                          {toolCall.status === 'error' ? 'Error' : 'Highlight'}
                                        </Badge>
                                      </div>
                                      {toolCall.color && (
                                        <div className="mt-2 flex items-center gap-2">
                                          <div className={`w-4 h-4 rounded-sm ${
                                            toolCall.color === 'yellow' ? 'bg-yellow-400' :
                                            toolCall.color === 'red' ? 'bg-red-400' :
                                            toolCall.color === 'green' ? 'bg-green-400' :
                                            toolCall.color === 'blue' ? 'bg-blue-400' :
                                            toolCall.color === 'orange' ? 'bg-orange-400' :
                                            toolCall.color === 'purple' ? 'bg-purple-400' :
                                            'bg-yellow-400'
                                          }`} />
                                          <span className="text-xs text-muted-foreground capitalize">{toolCall.color}</span>
                                        </div>
                                      )}
                                      {toolCall.message && (
                                        <p className="mt-2 text-xs text-muted-foreground italic">
                                          {toolCall.message}
                                        </p>
                                      )}
                                      {toolCall.error && (
                                        <p className="mt-2 text-xs text-destructive">
                                          {toolCall.error}
                                        </p>
                                      )}
                                    </div>
                                  );
                                }

                                const sqlMarkdown = toolCall.sql
                                  ? '```sql\n' + toolCall.sql.trim() + '\n```'
                                  : '_No SQL provided._';
                                const isMutation = toolCall.kind === 'write';
                                const hasRowInfo = !isMutation && (typeof toolCall.rowCount === 'number' || toolCall.truncated);
                                const displayedColumns = toolCall.columns ? toolCall.columns.slice(0, 6) : [];

                                return (
                                  <div
                                    key={`tool-${index}`}
                                    className="rounded-md border border-border/70 p-3 text-sm bg-muted/30"
                                  >
                                    <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                                      <Hammer className="h-4 w-4" />
                                      <span className="font-medium">
                                        {toolCall.kind === 'write'
                                          ? 'Data mutation'
                                          : toolCall.kind === 'read'
                                          ? 'Data query'
                                          : toolCall.kind === 'temp_sql'
                                          ? 'Temporary SQL execution'
                                          : 'Tool call'}
                                      </span>
                                      <Badge variant={toolCall.status === 'error' ? 'destructive' : 'secondary'}>
                                        {toolCall.status === 'error' ? 'Error' : toolCall.kind === 'write' ? 'Write' : 'Read'}
                                      </Badge>
                                    </div>
                                    <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                                      {(toolCall.sheetName || toolCall.sheetId) && (
                                        <p>
                                          Target sheet:{' '}
                                          <span className="font-medium text-foreground">
                                            {toolCall.sheetName || toolCall.sheetId}
                                          </span>
                                        </p>
                                      )}
                                      {hasRowInfo && (
                                        <p>
                                          Rows: {typeof toolCall.rowCount === 'number' ? toolCall.rowCount : 'unknown'}
                                          {toolCall.truncated ? ' (truncated)' : ''}
                                        </p>
                                      )}
                                      {toolCall.columns && toolCall.columns.length > 0 && (
                                        <p>
                                          Columns: {displayedColumns.join(', ')}
                                          {toolCall.columns.length > displayedColumns.length ? '…' : ''}
                                        </p>
                                      )}
                                      {typeof toolCall.changes === 'number' && (
                                        <p>Changes: {toolCall.changes}</p>
                                      )}
                                      {toolCall.error && (
                                        <p className="text-destructive">{toolCall.error}</p>
                                      )}
                                    </div>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="mt-3 bg-background/80 border border-border rounded p-2 text-xs font-mono text-left max-h-48 overflow-auto">
                                          <pre className="whitespace-pre-wrap break-words text-foreground/90">
                                            {toolCall.sql?.trim() || 'No SQL provided.'}
                                          </pre>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xl">
                                        <div className="space-y-2">
                                          <p className="text-xs text-muted-foreground">SQL</p>
                                          <SyntaxHighlighter
                                            language="sql"
                                            style={oneDark}
                                            customStyle={{
                                              fontSize: '0.75rem',
                                              borderRadius: '0.375rem',
                                              padding: '0.75rem',
                                              backgroundColor: 'var(--background)',
                                              wordBreak: 'break-word',
                                            }}
                                            codeTagProps={{
                                              style: {
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                              }
                                            }}
                                          >
                                            {toolCall.sql || ''}
                                          </SyntaxHighlighter>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                );
                              })}
                            </div>
                          );

                          if (!hasToolCalls) {
                            return (
                              <>
                                {renderAssistantContent()}
                                {renderContextRange()}
                                {message.isStreaming && renderStreamingIndicator()}
                              </>
                            );
                          }

                          return (
                            <>
                              {message.isStreaming && renderAssistantContent()}
                              {message.isStreaming && renderContextRange()}
                              {message.isStreaming && renderStreamingIndicator()}
                              {renderToolCalls()}
                              {!message.isStreaming && renderAssistantContent()}
                              {!message.isStreaming && renderContextRange()}
                            </>
                          );
                        })()
                      : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                      )}
                  </div>
                  <p className="text-xs text-muted-foreground px-1">
                    {formatTime(message.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: "0.2s" }}></div>
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: "0.4s" }}></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Input Area */}
      <div className="p-4 bg-background">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me about your spreadsheet..."
            className="flex-1"
            disabled={isTyping || isClearing || (!spreadsheetId && !isSupabaseBackend) || isLoadingHistory}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!input.trim() || isTyping || isClearing || (!spreadsheetId && !isSupabaseBackend) || isLoadingHistory}
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Try: "Sum column A", "Average of row 1", "Create chart from data"
        </p>
        {!spreadsheetId && !isSupabaseBackend && (
          <p className="text-xs text-muted-foreground mt-2">
            Open a spreadsheet to store your chat history.
          </p>
        )}
      </div>
    </div>
    </TooltipProvider>
  );
};
