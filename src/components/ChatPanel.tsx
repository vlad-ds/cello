import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, Info, Database, ChevronDown, Hammer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { backendConfig } from "@/config/backend";
import { dataClient, isSupabaseBackend, type CellHighlight } from "@/integrations/database";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  contextRange?: string | null;
  toolCalls?: ToolCall[] | null;
}

interface ToolCall {
  name?: string;
  sheetId?: string;
  sheetName?: string;
  reference?: string | null;
  sql?: string;
  status?: "ok" | "error";
  rowCount?: number;
  truncated?: boolean;
  columns?: string[];
  error?: string;
  kind?: "read" | "write" | "highlight" | "highlight_clear";
  operation?: "select" | "update" | "insert" | "alter";
  changes?: number;
  lastInsertRowid?: number | string;
  addedColumns?: {
    header: string;
    sqlName: string;
    columnIndex: number;
  }[];
  range?: string;
  column?: string;
  values?: (string | number | boolean | null)[];
  color?: string;
  message?: string | null;
}

interface ChatPanelProps {
  onCommand?: (command: string) => void;
  onAssistantToolCalls?: (toolCalls: ToolCall[] | null | undefined) => void;
  selectedCells?: { [key: string]: string };
  spreadsheetId?: string;
  highlights?: CellHighlight[];
  onClearHighlights?: () => void;
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

const welcomeMessage: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I'm your spreadsheet AI assistant. I can help you work with your data, create formulas, analyze trends, and more. Try asking me something like 'Sum column A' or 'What's the average of row 1'?",
  timestamp: new Date(),
  contextRange: null,
  toolCalls: null,
};

export const ChatPanel = ({ onCommand, onAssistantToolCalls, selectedCells, spreadsheetId, highlights = [], onClearHighlights }: ChatPanelProps) => {
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
          setMessages(
            history.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              timestamp: new Date(message.created_at),
              contextRange: message.context_range ?? null,
              toolCalls: message.tool_calls ?? null,
            }))
          );
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
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
      contextRange: rangeValue,
      toolCalls: null,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    if (!isSupabaseBackend) {
      if (!spreadsheetId) {
        const warningMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Open a spreadsheet to start a saved conversation.',
          timestamp: new Date(),
          contextRange: null,
          toolCalls: null,
        };
        setMessages(prev => [...prev, warningMessage]);
      } else {
        try {
          const response = await dataClient.sendChatMessage(spreadsheetId, {
            query: trimmed,
            selectedCells: selectedCells || {},
          });

          const updatedMessages = response.messages ?? [];
          if (updatedMessages.length === 0) {
            setMessages([welcomeMessage]);
          } else {
            setMessages(
              updatedMessages.map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
                timestamp: new Date(message.created_at),
                contextRange: message.context_range ?? null,
                toolCalls: message.tool_calls ?? null,
              }))
            );
          }

          const lastAssistant = [...updatedMessages]
            .reverse()
            .find((message) => message.role === 'assistant');
          if (lastAssistant) {
            onAssistantToolCalls?.(lastAssistant.tool_calls ?? null);
          }
        } catch (error) {
          console.error('Error saving Gemini conversation:', error);
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content:
              error instanceof Error
                ? error.message
                : 'Sorry, I encountered an error processing your request.',
            timestamp: new Date(),
            contextRange: null,
            toolCalls: null,
          };
          setMessages(prev => [...prev, errorMessage]);
          onAssistantToolCalls?.(null);
        }
      }
    } else {
      // Call Gemini AI through Supabase edge function
      try {
        const { data, error } = await supabase.functions.invoke('gemini-chat', {
          body: { 
            query: trimmed,
            selectedCells: selectedCells || {}
          }
        });

        if (error) {
          throw error;
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response || "I'm sorry, I couldn't process your request.",
          timestamp: new Date(),
          contextRange: rangeValue,
          toolCalls: null,
        };

        setMessages(prev => [...prev, assistantMessage]);
        onAssistantToolCalls?.(null);
      } catch (error) {
        console.error('Error calling Gemini AI:', error);
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I encountered an error processing your request. Please try again.",
          timestamp: new Date(),
          contextRange: null,
          toolCalls: null,
        };
        setMessages(prev => [...prev, errorMessage]);
        onAssistantToolCalls?.(null);
      }
    }
    
    setIsTyping(false);

    // Trigger command callback if provided
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
                <div key={idx} className="flex items-center gap-2">
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
                    {highlight.range || `${highlight.column}: ${highlight.values?.join(', ')}`}
                    {highlight.message && ` - ${highlight.message}`}
                  </span>
                </div>
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
                    {message.role === 'assistant' ? (
                      <div
                        className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                      />
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                    )}
                    {message.contextRange && message.role === 'assistant' && (
                      <p className="text-xs italic text-muted-foreground mt-2 flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        {formatRangeDisplay(message.contextRange)}
                      </p>
                    )}
                    {message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && (
                      <div className="mt-3 space-y-3">
                        {message.toolCalls.map((toolCall, index) => {
                          // Handle highlight clear tool calls
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

                          // Handle highlight tool calls separately
                          if (toolCall.kind === 'highlight') {
                            return (
                              <div
                                key={`highlight-${index}`}
                                className="rounded-md border border-border/70 p-3 text-sm bg-muted/30"
                              >
                                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                                  <Sparkles className="h-4 w-4" />
                                  <span>
                                    Highlighted cells {toolCall.range || `${toolCall.column}: ${toolCall.values?.join(', ')}`}
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

                          // Handle SQL tool calls (read/write)
                          const sqlMarkdown = toolCall.sql
                            ? '```sql\n' + toolCall.sql.trim() + '\n```'
                            : '_No SQL provided._';
                          const isMutation = toolCall.kind === 'write';
                          const hasRowInfo = !isMutation && (typeof toolCall.rowCount === 'number' || toolCall.truncated);
                          const displayedColumns = toolCall.columns ? toolCall.columns.slice(0, 6) : [];
                          const remainingColumns = toolCall.columns && toolCall.columns.length > displayedColumns.length
                            ? toolCall.columns.length - displayedColumns.length
                            : 0;
                          const Icon = isMutation ? Hammer : Database;
                          const badgeVariant = toolCall.status === 'error' ? 'destructive' : isMutation ? 'default' : 'secondary';
                          const badgeLabel = toolCall.status === 'error' ? 'Error' : isMutation ? 'Mutation' : 'Query';
                          const statusLabel = toolCall.status === 'error'
                            ? isMutation
                              ? 'SQL mutation error'
                              : 'SQL tool error'
                            : isMutation
                            ? 'SQL mutation executed'
                            : 'SQL query executed';
                          const addedColumns = toolCall.addedColumns ?? [];
                          const referenceLabel = toolCall.reference ?? toolCall.sheetId;

                          return (
                            <div
                              key={`${toolCall.name ?? 'sql-tool'}-${index}`}
                              className={`rounded-md border border-border/70 p-3 text-sm ${
                                isMutation ? 'bg-primary/5' : 'bg-background/70'
                              }`}
                            >
                              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                                <Icon className="h-4 w-4" />
                                <span>
                                  {statusLabel}
                                  {toolCall.sheetName
                                    ? ` on ${toolCall.sheetName}`
                                    : toolCall.sheetId
                                    ? ` on ${toolCall.sheetId}`
                                    : ''}
                                </span>
                                <Badge variant={badgeVariant}>{badgeLabel}</Badge>
                              </div>

                              {referenceLabel && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Reference: {referenceLabel}
                                </p>
                              )}

                              {hasRowInfo && toolCall.status !== 'error' && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Rows returned: {toolCall.rowCount ?? 0}
                                  {toolCall.truncated ? '+' : ''}
                                  {displayedColumns.length > 0 && (
                                    <span>
                                      {' '}
                                      • Columns: {displayedColumns.join(', ')}
                                      {remainingColumns > 0 ? `, +${remainingColumns} more` : ''}
                                    </span>
                                  )}
                                </p>
                              )}

                              {isMutation && toolCall.status !== 'error' && (
                                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                  {typeof toolCall.operation === 'string' && toolCall.operation.length > 0 && (
                                    <p>
                                      Operation: {toolCall.operation.charAt(0).toUpperCase() + toolCall.operation.slice(1)}
                                    </p>
                                  )}
                                  {typeof toolCall.changes === 'number' && (
                                    <p>Rows affected: {toolCall.changes}</p>
                                  )}
                                  {toolCall.lastInsertRowid !== undefined && toolCall.lastInsertRowid !== null && (
                                    <p>Last inserted row id: {toolCall.lastInsertRowid}</p>
                                  )}
                                  {addedColumns.length > 0 && (
                                    <p>
                                      Added columns: {addedColumns.map((col) => col.header || col.sqlName).join(', ')}
                                    </p>
                                  )}
                                </div>
                              )}

                              {toolCall.error && (
                                <p className="mt-2 text-xs text-destructive">
                                  {toolCall.error}
                                </p>
                              )}

                              {toolCall.sql && (
                                <Collapsible className="mt-3">
                                  <CollapsibleTrigger className="group flex items-center gap-2 text-xs font-medium text-primary hover:text-primary/90">
                                    <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                    View SQL
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="mt-2">
                                    <div
                                      className="prose prose-xs max-w-none rounded-md bg-muted/40 p-3 font-mono text-xs dark:prose-invert"
                                      dangerouslySetInnerHTML={{ __html: renderMarkdown(sqlMarkdown) }}
                                    />
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                            </div>
                          );
                        })}
                      </div>
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
  );
};
