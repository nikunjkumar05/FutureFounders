import { useEffect, useState, useRef } from "react";
import type { Metrics } from "../types";
import { getMetrics } from "../api";

function SineWave({ color }: { color: string }) {
  return (
    <svg className="sine-bg w-full h-full" viewBox="0 0 300 80" preserveAspectRatio="none">
      <path
        d="M0,50 Q25,30 50,50 T100,50 T150,50 T200,50 T250,50 T300,50"
        fill="none"
        stroke={color}
        strokeWidth="1"
      />
      <path
        d="M0,50 Q25,30 50,50 T100,50 T150,50 T200,50 T250,50 T300,50 L300,80 L0,80 Z"
        fill={color}
        opacity="0.15"
      />
    </svg>
  );
}

function AnimatedValue({ value, color }: { value: number; color: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

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
    return () => cancelAnimationFrame(ref.current);
  }, [value]);

  return <span className="font-syne text-4xl tracking-tight" style={{ color }}>{display}</span>;
}

export default function MetricsBar() {
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    getMetrics().then(setM);
  }, []);

  if (!m) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 card animate-pulse" />)}
      </div>
    );
  }

  const cards = [
    {
      label: "COMPLETED TODAY",
      value: m.completed_today,
      color: "#14b8a6",
      sineColor: "#14b8a6",
    },
    {
      label: "LOW STOCK ITEMS",
      value: m.low_stock_count,
      color: m.low_stock_count > 0 ? "#f97316" : "#14b8a6",
      sineColor: m.low_stock_count > 0 ? "#f97316" : "#14b8a6",
    },
    {
      label: "REMINDERS DUE (7D)",
      value: m.reminders_due_soon,
      color: m.reminders_due_soon > 0 ? "#f97316" : "#14b8a6",
      sineColor: m.reminders_due_soon > 0 ? "#f97316" : "#14b8a6",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="card p-5 relative overflow-hidden">
          <SineWave color={c.sineColor} />
          <div className="relative z-10">
            <div className="font-dm-mono text-[10px] text-gray-500 tracking-[0.12em] mb-1.5">{c.label}</div>
            <AnimatedValue value={c.value} color={c.color} />
          </div>
        </div>
      ))}
    </div>
  );
}
