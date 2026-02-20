import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Send, ChevronDown, ChevronUp, MessageSquare, Loader2, Trash2 } from "lucide-react";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatPanelProps = {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  onClear?: () => void;
  loading: boolean;
  disabled?: boolean;
};

export function ChatPanel({ messages, onSend, onClear, loading, disabled }: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, expanded]);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || loading || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-panel">
      {/* Toggle bar */}
      <div className="chat-panel__toggle-row">
        <button
          className="chat-panel__toggle"
          onClick={() => setExpanded(!expanded)}
        >
          <MessageSquare size={16} />
          <span className="chat-panel__toggle-text">
            {expanded ? "Hide AI Chat" : "Describe a flow in plain English..."}
          </span>
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        {expanded && messages.length > 0 && onClear && (
          <button
            className="chat-panel__clear"
            onClick={onClear}
            title="Clear chat"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="chat-panel__body">
          {/* Message history */}
          <div className="chat-panel__messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="chat-panel__empty">
                <p>Describe what flow you'd like to create.</p>
                <p className="chat-panel__hint">
                  Example: "Post-purchase flow with 2 emails for everyone, then split by purchase count into 3 branches with 2 emails each, then merge and send final email plus SMS"
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`chat-panel__msg chat-panel__msg--${msg.role}`}>
                {msg.role === "assistant" && (
                  <div className="chat-panel__avatar">AI</div>
                )}
                <div className="chat-panel__bubble">
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="chat-panel__msg chat-panel__msg--assistant">
                <div className="chat-panel__avatar">AI</div>
                <div className="chat-panel__bubble chat-panel__bubble--loading">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="chat-panel__input-row">
            <textarea
              ref={inputRef}
              className="chat-panel__input"
              placeholder={'Edit this flow... e.g. "Add a split after email 2 based on engagement"'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading || disabled}
            />
            <button
              className="chat-panel__send"
              onClick={handleSend}
              disabled={!input.trim() || loading || disabled}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
