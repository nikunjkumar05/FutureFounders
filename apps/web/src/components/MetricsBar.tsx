import { useEffect, useState, useRef } from "react";
import type { Metrics } from "../types";
import { getMetrics } from "../api";

function Sparkline({ color }: { color: string }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.08 }} viewBox="0 0 200 60" preserveAspectRatio="none">
      <path
        d="M0,45 Q20,35 40,40 T80,25 T120,30 T160,15 T200,20"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0,45 Q20,35 40,40 T80,25 T120,30 T160,15 T200,20 L200,60 L0,60 Z"
        fill={`url(#grad-${color.replace("#", "")})`}
        opacity="0.3"
      />
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function AnimatedValue({ value, color }: { value: number; color: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const duration = 700;
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) ref.current = requestAnimationFrame(tick);
    }
    ref.current = requestAnimationFrame(tick);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value]);

  return <span className="font-syne text-5xl" style={{ color }}>{display}</span>;
}

export default function MetricsBar() {
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    getMetrics().then(setM);
  }, []);

  if (!m) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 glass rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: "Completed Today", value: m.completed_today, color: "#14b8a6", sparkColor: "#14b8a6", span: 2 },
    { label: "Low Stock Items", value: m.low_stock_count, color: m.low_stock_count > 0 ? "#ef4444" : "#22c55e", sparkColor: m.low_stock_count > 0 ? "#ef4444" : "#22c55e", span: 1 },
    { label: "Reminders Due (7d)", value: m.reminders_due_soon, color: "#f59e0b", sparkColor: "#f59e0b", span: 1 },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`glass rounded-xl p-5 relative overflow-hidden ${c.span === 2 ? "col-span-2" : ""}`}
        >
          <Sparkline color={c.sparkColor} />
          <div className="relative z-10">
            <div className="font-plus text-xs text-gray-500 tracking-wider uppercase mb-1">{c.label}</div>
            <AnimatedValue value={c.value} color={c.color} />
          </div>
        </div>
      ))}
    </div>
  );
}
