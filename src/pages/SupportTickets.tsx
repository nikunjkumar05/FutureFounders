import { useState, useEffect } from 'react';
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
    let channel;

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

  const needsAttention = tickets?.filter(
    (t) => t.requires_human_intervention && t.status !== 'resolved'
  );
  const autoResolved = tickets?.filter((t) => t.status === 'auto_resolved');

  const activeTab = tab === 'attention' ? needsAttention : autoResolved;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Headphones size={24} className="text-blue-600" />
          Support Tickets
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          AI-assisted customer support with human escalation
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('attention')}
          className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
            tab === 'attention'
              ? 'bg-red-600 text-white border-red-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
        >
          <AlertCircle size={14} />
          Needs Attention
          {needsAttention && needsAttention.length > 0 && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                tab === 'attention'
                  ? 'bg-red-500 text-white'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {needsAttention.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('auto')}
          className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
            tab === 'auto'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
        >
          <Bot size={14} />
          Auto-Resolved
          {autoResolved && autoResolved.length > 0 && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                tab === 'auto'
                  ? 'bg-blue-500 text-white'
                  : 'bg-blue-100 text-blue-700'
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
          className="bg-white rounded-xl border border-red-200 p-5 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-50">
                <User size={16} className="text-red-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900 text-sm">
                  {ticket.customer_phone}
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  {ticket.message}
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  {format(new Date(ticket.created_at), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
            </div>
            <button
              onClick={() => resolveTicket.mutate({ ticketId: ticket.id })}
              disabled={resolveTicket.isPending}
              className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <CheckCircle size={14} />
              Mark Resolved
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
          className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-50">
              <Bot size={16} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900 text-sm">
                  {ticket.customer_phone}
                </p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  Auto-Resolved
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-1">
                <span className="font-medium">Q:</span> {ticket.message}
              </p>
              {ticket.ai_response && (
                <p className="text-sm text-blue-600 mt-1 bg-blue-50 rounded-lg px-3 py-2">
                  <span className="font-medium">A:</span> {ticket.ai_response}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-2">
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
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      {tab === 'attention' ? (
        <AlertCircle size={40} className="mx-auto text-slate-300 mb-3" />
      ) : (
        <Bot size={40} className="mx-auto text-slate-300 mb-3" />
      )}
      <h3 className="text-lg font-semibold text-slate-700 mb-1">
        {tab === 'attention'
          ? 'No tickets need attention'
          : 'No auto-resolved tickets yet'}
      </h3>
      <p className="text-sm text-slate-500">
        {tab === 'attention'
          ? 'All customer queries have been handled.'
          : 'AI-resolved conversations will appear here.'}
      </p>
    </div>
  );
}
