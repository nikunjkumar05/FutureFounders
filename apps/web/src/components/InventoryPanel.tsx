import { useEffect, useState } from "react";
import type { InventoryItem } from "../types";
import { getInventory } from "../api";

interface Props {
  refresh: number;
}

/* fake max for bar visual — figures per item */
function barWidth(qty: number, max: number) {
  return Math.min((qty / max) * 100, 100);
}

export default function InventoryPanel({ refresh }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    getInventory().then(setItems);
  }, [refresh]);

  return (
    <div>
      <h2 className="font-syne text-lg text-white tracking-wide mb-4">Inventory</h2>
      <div className="space-y-4">
        {items.map((item, idx) => {
          const qty = parseFloat(item.quantity);
          const threshold = parseFloat(item.min_threshold);
          const low = qty < threshold;
          const max = qty * 2; // just a visual scale

          return (
            <div
              key={item.id}
              className={`glass rounded-xl p-4 ${low ? "low-glow" : ""}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-plus text-sm text-gray-200">{item.name}</span>
                <span className="font-dm-mono text-sm" style={{ color: low ? "#ef4444" : "#14b8a6" }}>
                  {item.quantity}
                  <span className="text-xs text-gray-600 ml-1">{item.unit}</span>
                </span>
              </div>
              <div className="h-2 bg-navy-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bar-animate"
                  style={{
                    width: `${barWidth(qty, Math.max(qty + threshold, 1))}%`,
                    animationDelay: `${idx * 0.1}s`,
                    background: low
                      ? "linear-gradient(90deg, #ef4444, #f97316)"
                      : "linear-gradient(90deg, #4F8EF7, #14b8a6)",
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
