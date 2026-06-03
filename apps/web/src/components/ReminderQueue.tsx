import { useEffect, useState } from "react";
import type { Reminder } from "../types";
import { getReminders, sendReminder } from "../api";

interface Props {
  refresh: number;
  onRefresh: () => void;
}

function DueLabel(dateStr: string): { label: string; color: string } {
  const due = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: "OVERDUE", color: "#ef4444" };
  if (diffDays <= 7) return { label: "DUE SOON", color: "#f97316" };
  return { label: "UPCOMING", color: "#f59e0b" };
}

export default function ReminderQueue({ refresh, onRefresh }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    getReminders()
      .then(setReminders)
      .finally(() => setLoading(false));
  }, [refresh]);

  async function handleSend(r: Reminder) {
    setSending(r.id);
    try {
      await sendReminder(r.id);
      onRefresh();
    } finally {
      setSending(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2.5 mt-6">
        <h2 className="font-syne text-lg tracking-wide text-white mb-4">Reminder Queue</h2>
        {[1, 2, 3].map((i) => <div key={i} className="h-[68px] card animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="font-syne text-lg tracking-wide text-white mb-4">Reminder Queue</h2>
      <div className="space-y-2.5">
        {reminders.map((r) => {
          const due = DueLabel(r.due_date);

          return (
            <div key={r.id} className="card px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: due.color }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-plus text-sm font-medium text-gray-100 truncate">{r.customer}</span>
                    <span className="font-dm-mono text-[10px] uppercase tracking-wide" style={{ color: due.color }}>
                      {due.label}
                    </span>
                  </div>
                  <div className="font-dm-mono text-[11px] text-gray-600 mt-0.5">
                    Last serviced — Due {new Date(r.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                  </div>
                </div>
              </div>

              <div className="shrink-0 ml-3">
                {r.status === "pending" ? (
                  <a
                    href={`https://wa.me/${r.phone.replace(/\+/g, "")}?text=${encodeURIComponent(
                      `Hi, this is a reminder from AquaOps. It's time for your 6-month water tank cleaning service at ${r.address ?? "your property"}. Would you like to schedule a visit?`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleSend(r)}
                    className="inline-block transition-opacity cursor-pointer"
                    style={{ color: "#25d366" }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="#25d366" className="inline-block align-middle">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
                    </svg>
                  </a>
                ) : (
                  <span className="font-dm-mono text-[10px] text-gray-600 uppercase tracking-wide">Sent</span>
                )}
              </div>
            </div>
          );
        })}

        {reminders.length === 0 && (
          <div className="card py-10 text-center">
            <p className="font-plus text-sm text-gray-600">No reminders</p>
          </div>
        )}
      </div>
    </div>
  );
}
