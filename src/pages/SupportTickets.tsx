import { useState, useEffect, useMemo } from 'react';
import { Headphones, CheckCircle, Bot, User, AlertCircle } from 'lucide-react';
import { useSupportTickets, useResolveTicket } from '../lib/queries';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { TableSkeleton } from '../components/LoadingSkeleton';
import type { SupportTicket } from '../lib/types';

export default function SupportTickets() {
  const { data: tickets, isLoading } = useSupportTickets();
  const [tab, setTab] = useState<'attention' | 'auto'>('attention');
  const qc = useQueryClient();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel('support-tickets-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'support_tickets' },
          () => qc.invalidateQueries({ queryKey: ['support_tickets'] })
        )
        .subscribe();
    } catch {}

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, [qc]);

  const needsAttention = useMemo(
    () => tickets?.filter((t) => t.requires_human_intervention && t.status !== 'resolved'),
    [tickets]
  );
  const autoResolved = useMemo(
    () => tickets?.filter((t) => t.status === 'auto_resolved'),
    [tickets]
  );

  const activeTab = tab === 'attention' ? needsAttention : autoResolved;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-lg font-display text-surface-900 dark:text-surface-100 flex items-center gap-2">
          <Headphones size={24} className="text-cyan-500" />
          Customer messages
        </h1>
        <p className="text-body-sm text-surface-500 dark:text-surface-400 mt-1">
          AI-assisted customer support with human escalation
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('attention')}
          className={`flex items-center gap-2 text-sm font-display font-medium px-4 py-2.5 rounded-xl border transition-colors ${
            tab === 'attention'
              ? 'bg-red-600 text-white border-red-600'
              : 'card-base border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'
          }`}
        >
          <AlertCircle size={14} />
          Needs attention
          {needsAttention && needsAttention.length > 0 && (
            <span
              className={`badge ${
                tab === 'attention'
                  ? 'bg-amber-500 text-white'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-amber-400'
              }`}
            >
              {needsAttention.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('auto')}
          className={`flex items-center gap-2 text-sm font-display font-medium px-4 py-2.5 rounded-xl border transition-colors ${
            tab === 'auto'
              ? 'bg-cyan-600 text-white border-cyan-600'
              : 'card-base border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'
          }`}
        >
          <Bot size={14} />
          Auto-resolved
          {autoResolved && autoResolved.length > 0 && (
            <span
              className={`badge ${
                tab === 'auto'
                  ? 'bg-cyan-500 text-white'
                  : 'badge-ok'
              }`}
            >
              {autoResolved.length}
            </span>
          )}
        </button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : !activeTab?.length ? (
        <EmptyState tab={tab} />
      ) : tab === 'attention' ? (
        <AttentionList tickets={needsAttention!} />
      ) : (
        <AutoResolvedList tickets={autoResolved!} />
      )}
    </div>
  );
}

function AttentionList({ tickets }: { tickets: SupportTicket[] }) {
  const resolveTicket = useResolveTicket();

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className="card-base p-5 border-red-200 dark:border-red-800"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/50">
                <User size={16} className="text-red-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-display font-medium text-surface-900 dark:text-surface-100 text-sm">
                  {ticket.customer_phone}
                </p>
                <p className="text-body-sm text-surface-600 dark:text-surface-300 mt-1">
                  {ticket.message}
                </p>
                <p className="text-body-xs text-surface-500 dark:text-surface-400 mt-2">
                  {format(new Date(ticket.created_at), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
            </div>
            <button
              onClick={() => resolveTicket.mutate({ ticketId: ticket.id })}
              disabled={resolveTicket.isPending}
              className="btn-primary !bg-cyan-600 hover:!bg-cyan-700 disabled:opacity-50"
            >
              <CheckCircle size={14} />
              Mark resolved
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AutoResolvedList({ tickets }: { tickets: SupportTicket[] }) {
  return (
    <div className="space-y-3">
      {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className="card-base p-5"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-cyan-100 dark:bg-cyan-900/50">
              <Bot size={16} className="text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="font-display font-medium text-surface-900 dark:text-surface-100 text-sm">
                  {ticket.customer_phone}
                </p>
                <span className="badge-ok">
                  Auto-resolved
                </span>
              </div>
              <p className="text-body-sm text-surface-600 dark:text-surface-300 mt-1">
                <span className="font-display font-medium">Q:</span> {ticket.message}
              </p>
              {ticket.ai_response && (
                <p className="text-body-sm text-cyan-600 dark:text-cyan-400 mt-1 bg-cyan-50 dark:bg-cyan-950/50 rounded-xl px-3 py-2">
                  <span className="font-display font-medium">A:</span> {ticket.ai_response}
                </p>
              )}
              <p className="text-body-xs text-surface-500 dark:text-surface-400 mt-2">
                {format(new Date(ticket.created_at), 'dd MMM yyyy, HH:mm')}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ tab }: { tab: 'attention' | 'auto' }) {
  return (
    <div className="card-base p-12 text-center">
      {tab === 'attention' ? (
        <AlertCircle size={40} className="mx-auto text-surface-300 dark:text-surface-600 mb-3" />
      ) : (
        <Bot size={40} className="mx-auto text-surface-300 dark:text-surface-600 mb-3" />
      )}
      <h3 className="text-display-sm font-display text-surface-700 dark:text-surface-200 mb-1">
        {tab === 'attention'
          ? 'No messages need attention'
          : 'No auto-resolved messages yet'}
      </h3>
      <p className="text-body-sm text-surface-500 dark:text-surface-400">
        {tab === 'attention'
          ? 'All customer queries have been handled.'
          : 'AI-resolved conversations will appear here.'}
      </p>
    </div>
  );
}
