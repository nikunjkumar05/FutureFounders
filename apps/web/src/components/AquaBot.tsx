import { useState, useRef, useEffect } from "react";

const FAQ_REPLIES: Record<string, string> = {
  price: "Our standard water tank cleaning starts at ₹999 for residential tanks up to 1000L.",
  schedule: "You can book via WhatsApp or call. Typical slots are 8 AM – 5 PM, Mon–Sat.",
  chemical: "We use NSF-certified chlorine & anti-bacterial solutions. Safe for drinking water post-flush.",
  emergency: "For emergency leaks or contamination, call us directly at +91-99999-99991.",
};

function classifyMessage(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("price") || lower.includes("cost") || lower.includes("rate") || lower.includes("₹")) return "price";
  if (lower.includes("book") || lower.includes("schedule") || lower.includes("when") || lower.includes("slot") || lower.includes("time")) return "schedule";
  if (lower.includes("chemical") || lower.includes("safe") || lower.includes("chlorine") || lower.includes("solution")) return "chemical";
  if (lower.includes("emergency") || lower.includes("leak") || lower.includes("urgent") || lower.includes("flood")) return "emergency";
  return "other";
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

  function handleSend() {
    const text = input.trim();
    if (!text || thinking) return;
    setMessages((prev) => [...prev, { from: "user", text }]);
    setInput("");
    setThinking(true);

    setTimeout(() => {
      const category = classifyMessage(text);
      const reply = FAQ_REPLIES[category] ?? "Let me connect you to a human agent. One moment please.";
      setMessages((prev) => [...prev, { from: "bot", text: reply }]);
      setThinking(false);
    }, 1200 + Math.random() * 800);
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: "1px solid transparent",
        backgroundOrigin: "border-box",
        backgroundClip: "padding-box, border-box",
        backgroundImage:
          "linear-gradient(#0A0F1C, #0A0F1C), linear-gradient(135deg, #4F8EF7, #9B6EF3)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-aqua shadow-[0_0_6px_#4F8EF7]" />
          <span className="font-plus text-sm font-medium text-gray-200">AquaBot</span>
          {thinking && (
            <div className="flex items-center gap-1 ml-2">
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
            </div>
          )}
        </div>
        <span className="font-dm-mono text-[10px] text-gray-600">AI</span>
      </div>

      <div className="h-52 overflow-y-auto p-4 space-y-3" style={{ background: "rgba(0,0,0,0.2)" }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`font-plus text-xs max-w-[80%] rounded-xl px-3 py-2 leading-relaxed ${
                msg.from === "user"
                  ? "bg-aqua/20 text-gray-100"
                  : "bg-white/5 text-gray-300"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="font-plus text-xs bg-white/5 text-gray-500 rounded-xl px-3 py-2">
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask AquaBot..."
          className="flex-1 font-plus text-xs bg-white/5 rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 outline-none border border-white/10 focus:border-aqua/50 transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || thinking}
          className="font-plus text-xs font-medium px-4 py-2 rounded-lg transition-all duration-200 disabled:opacity-30"
          style={{ background: "rgba(79,142,247,0.2)", color: "#4F8EF7" }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
