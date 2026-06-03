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
    { from: "bot", text: "Hi! I'm AquaBot. Ask me about pricing, scheduling, chemicals, or emergencies." },
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

    // Add user message
    const userMsg = { from: "user" as const, text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    // Build conversation history for API
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
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid #1a1d27" }}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#3b82f6" }} />
          <span className="font-plus text-sm font-medium text-gray-200">AquaBot</span>
          {thinking && (
            <div className="flex items-center gap-1 ml-1">
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
            </div>
          )}
        </div>
        <span className="font-dm-mono text-[10px] text-gray-600">AI</span>
      </div>

      <div className="h-44 overflow-y-auto p-3 space-y-2.5" style={{ background: "rgba(0,0,0,0.25)" }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="font-plus text-xs max-w-[85%] rounded-xl px-3 py-2 leading-relaxed"
              style={{
                background: msg.from === "user" ? "rgba(20,184,166,0.15)" : "rgba(255,255,255,0.04)",
                color: msg.from === "user" ? "#e5e7eb" : "#9ca3af",
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="font-plus text-xs rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", color: "#6b7280" }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 p-3" style={{ borderTop: "1px solid #1a1d27" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask AquaBot..."
          className="flex-1 font-plus text-xs rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1a1d27" }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || thinking}
          className="font-dm-mono text-[11px] font-medium px-3 py-2 rounded-md transition-all duration-200 disabled:opacity-30 cursor-pointer"
          style={{ background: "rgba(20,184,166,0.12)", color: "#14b8a6" }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
