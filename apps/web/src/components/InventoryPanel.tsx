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
      <h2 className="font-syne text-lg tracking-wide text-white mb-4">Inventory</h2>
      <div className="space-y-3.5">
        {items.map((item, idx) => {
          const qty = parseFloat(item.quantity);
          const threshold = parseFloat(item.min_threshold);
          const low = qty < threshold;
          const pct = Math.min((qty / Math.max(qty + threshold, 1)) * 100, 100);

          return (
            <div
              key={item.id}
              className={`card px-4 py-3.5 ${low ? "low-glow" : ""}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-plus text-sm text-gray-200">{item.name}</span>
                <span className="font-dm-mono text-sm" style={{ color: low ? "#ef4444" : "#14b8a6" }}>
                  {item.quantity}
                  <span className="text-[11px] text-gray-600 ml-1">{item.unit}</span>
                </span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: "#1a1d27" }}>
                <div
                  className="h-full rounded-full bar-animate"
                  style={{
                    width: `${pct}%`,
                    animationDelay: `${idx * 0.1}s`,
                    background: low
                      ? "linear-gradient(90deg, #ef4444, #f97316)"
                      : "linear-gradient(90deg, #14b8a6, #14b8a6)",
                  }}
                />
              </div>
              {low && (
                <div className="font-dm-mono text-[10px] text-red-400/80 mt-2 tracking-wider">
                  Low stock — min {item.min_threshold} {item.unit}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
