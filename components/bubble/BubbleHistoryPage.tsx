"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBriefing, getBubbleHistory, type BubbleHistoryEntry } from "@/lib/api";
import { useFirebaseAuth } from "@/lib/auth";
import type { ExecutiveBriefing } from "@/types";

export function BubbleHistoryPage() {
  const { user, loading: authLoading } = useFirebaseAuth();
  const [entries, setEntries] = useState<BubbleHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [briefing, setBriefing] = useState<ExecutiveBriefing | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    let active = true;
    getBubbleHistory()
      .then((rows) => { if (active) setEntries(rows); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load history."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, user?.uid]);

  const openBriefing = async (bubbleId: string) => {
    const record = await getBriefing(bubbleId);
    setBriefing(record);
  };

  return (
    <main className="min-h-screen bg-[#0d0f1a] px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Your workspace</p>
            <h1 className="mt-1 text-3xl font-bold">Previous Bubbles</h1>
            <p className="mt-2 text-sm text-slate-400">Bubbles you attended, their retained conversations, and shared decision records.</p>
          </div>
          <Link href="/" className="cursor-pointer rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Home</Link>
        </header>

        {loading || authLoading ? <p className="text-sm text-slate-400">Loading your history…</p> : !user ? <p className="rounded-2xl border border-white/10 bg-[#111827] p-5 text-sm text-slate-300">Sign in with the account you used to attend bubbles to see your history.</p> : null}
        {error && <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}

        {!loading && user && entries.length === 0 && <div className="rounded-2xl border border-white/10 bg-[#111827] p-8 text-center text-slate-400">No previous bubbles yet.</div>}

        <div className="grid gap-4">
          {entries.map((entry) => (
            <article key={entry.bubble_id} className="rounded-2xl border border-white/10 bg-[#111827] p-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-white">{entry.title || "Ended bubble"}</h2>
                <p className="mt-1 text-xs text-slate-500">Ended {new Date(entry.popped_at).toLocaleString()}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full border border-white/10 bg-[#161d2e] px-2.5 py-1 text-slate-300">{entry.retention_policy === "view-only" ? `Read-only${entry.view_until ? ` until ${new Date(entry.view_until).toLocaleDateString()}` : ""}` : "Ephemeral"}</span>
                  {entry.decision_record_shared && <span className="rounded-full border border-emerald-500/20 bg-emerald-950/30 px-2.5 py-1 text-emerald-200">Decision record shared</span>}
                </div>
              </div>
              <div className="mt-4 flex shrink-0 flex-wrap gap-2 sm:mt-0">
                {entry.is_viewable && <Link href={`/bubble/${entry.bubble_id}?mode=view`} className="cursor-pointer rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-violet-500">View bubble</Link>}
                {entry.decision_record_shared && <button type="button" onClick={() => void openBriefing(entry.bubble_id)} className="cursor-pointer rounded-xl border border-white/10 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5">View decision record</button>}
                {!entry.is_viewable && !entry.decision_record_shared && <span className="self-center text-xs text-slate-500">Session content was removed</span>}
              </div>
            </article>
          ))}
        </div>
      </div>

      {briefing && <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" onClick={() => setBriefing(null)}>
        <section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-violet-500/20 bg-[#111827] p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-violet-300">Shared decision record</p><h2 className="mt-1 text-xl font-bold">{briefing.bubble_title}</h2></div><button type="button" onClick={() => setBriefing(null)} className="cursor-pointer text-slate-400 hover:text-white">Close</button></div>
          <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{briefing.executive_summary}</p>
          {briefing.decisions?.length > 0 && <div className="mt-5"><h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Decisions</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">{briefing.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></div>}
          {briefing.action_items?.length > 0 && <div className="mt-5"><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Action items</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">{briefing.action_items.map((a, i) => <li key={i}>{a.task}{a.owner ? ` — ${a.owner}` : ""}</li>)}</ul></div>}
        </section>
      </div>}
    </main>
  );
}
