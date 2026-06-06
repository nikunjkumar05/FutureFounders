import { useEffect, useState } from "react";
import type { InventoryItem } from "../types";
import { getInventory } from "../api";

interface Props {
  refresh: number;
}

export default function InventoryPanel({ refresh }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    getInventory().then(setItems);
  }, [refresh]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full bg-orange shadow-[0_0_6px_rgba(249,115,22,0.5)]" />
        <h2 className="font-syne text-lg tracking-wide text-white">Inventory</h2>
      </div>
      <div className="space-y-3">
        {items.map((item, idx) => {
          const qty = parseFloat(item.quantity);
          const threshold = parseFloat(item.min_threshold);
          const low = qty < threshold;
          const pct = Math.min((qty / Math.max(qty + threshold, 1)) * 100, 100);

          return (
            <div key={item.id} className={`card px-4 py-3.5 ${low ? "low-glow" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: low ? "#ef4444" : "#14b8a6" }} />
                  <span className="font-plus text-sm text-gray-200">{item.name}</span>
                </div>
                <span className="font-dm-mono text-sm" style={{ color: low ? "#ef4444" : "#14b8a6" }}>
                  {item.quantity}
                  <span className="text-[11px] text-gray-600 ml-1">{item.unit}</span>
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div
                  className="h-full rounded-full bar-animate"
                  style={{
                    width: `${pct}%`,
                    animationDelay: `${idx * 0.1}s`,
                    background: low
                      ? "linear-gradient(90deg, #ef4444, #f97316)"
                      : "linear-gradient(90deg, #14b8a6, #0d9488)",
                    boxShadow: low ? "0 0 8px rgba(239,68,68,0.3)" : "0 0 8px rgba(20,184,166,0.2)",
                  }}
                />
              </div>
              {low && (
                <div className="font-dm-mono text-[10px] text-red-400/80 mt-2 tracking-wider flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="#ef4444">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  Low stock &mdash; min {item.min_threshold} {item.unit}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
