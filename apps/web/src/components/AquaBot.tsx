import { useState, useRef, useEffect, useCallback } from "react";

async function fetchReply(messages: { role: string; text: string }[]): Promise<string> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) return "Sorry, I couldn't process that. Let me connect you with the owner.";
    const data = await res.json();
    return data.reply ?? "Let me connect you with the owner.";
  } catch {
    return "Network error. Let me connect you with the owner.";
  }
}

export default function AquaBot() {
  const [messages, setMessages] = useState<{ from: "bot" | "user"; text: string }[]>([
    { from: "bot", text: "Hi! I'm the AI assistant. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking) return;

    const userMsg = { from: "user" as const, text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    const history = [...messages, userMsg].map((m) => ({
      role: m.from === "user" ? "user" : "assistant",
      text: m.text,
    }));

    const reply = await fetchReply(history);
    setMessages((prev) => [...prev, { from: "bot", text: reply }]);
    setThinking(false);
  }, [input, thinking, messages]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan shadow-[0_0_6px_rgba(20,184,166,0.5)]" />
          <span className="font-plus text-sm font-medium text-gray-200">AI Assistant</span>
          {thinking && (
            <div className="flex items-center gap-1 ml-1">
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
            </div>
          )}
        </div>
        <span className="badge badge-cyan">BETA</span>
      </div>

      <div className="h-48 overflow-y-auto p-3 space-y-3" style={{ background: "rgba(0,0,0,0.2)" }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="font-plus text-xs max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed"
              style={{
                background: msg.from === "user" ? "rgba(20,184,166,0.12)" : "rgba(255,255,255,0.04)",
                color: msg.from === "user" ? "#e5e7eb" : "#9ca3af",
                border: msg.from === "user" ? "1px solid rgba(20,184,166,0.15)" : "1px solid rgba(255,255,255,0.04)",
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="font-plus text-xs rounded-2xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,0.04)", color: "#6b7280", border: "1px solid rgba(255,255,255,0.04)" }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 p-3 border-t border-white/[0.04]">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask the assistant..."
          className="flex-1 font-plus text-xs rounded-lg px-3 py-2.5 text-gray-200 placeholder-gray-600 outline-none transition-all duration-200 focus:border-cyan/30"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || thinking}
          className="font-dm-mono text-[10px] font-medium px-3.5 py-2.5 rounded-lg btn-cyan disabled:opacity-30 tracking-wider"
        >
          Send
        </button>
      </div>
    </div>
  );
}
