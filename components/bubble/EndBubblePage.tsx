"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBubble, popBubble } from "@/lib/api";
import { useFirebaseAuth } from "@/lib/auth";
import type { RetentionPolicy } from "@/types";

interface Props { bubbleId: string; }

export function EndBubblePage({ bubbleId }: Props) {
  const router = useRouter();
  const { user, loading: authLoading } = useFirebaseAuth();
  const [title, setTitle] = useState("Context Bubble");
  const [loading, setLoading] = useState(true);
  const [retention, setRetention] = useState<"ephemeral" | "view-only">("ephemeral");
  const [days, setDays] = useState(3);
  const [shareRecord, setShareRecord] = useState(true);
  const [focus, setFocus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getBubble(bubbleId)
      .then((bubble) => { if (active) setTitle(bubble.title); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load this bubble."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bubbleId]);

  const finishBubble = async (forceShred = false) => {
    setSubmitting(true);
    setError("");
    const retentionPolicy: RetentionPolicy = retention === "view-only"
      ? "view-only"
      : shareRecord ? "temporary-plus-record" : "temporary";
    try {
      const result = await popBubble(bubbleId, {
        force_shred_on_export_failure: forceShred,
        custom_briefing_prompt: focus.trim() || undefined,
        retention_policy: retentionPolicy,
        share_decision_record: shareRecord,
        view_retention_days: days,
      });
      if (result.pop_state === "FAILED_EXPORT") {
        setError("An export failed. Your bubble data is still safe. Retry ending and shred the session data anyway, or go back and review exports.");
        setSubmitting(false);
        return;
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not end the bubble.");
      setSubmitting(false);
    }
  };

  if (authLoading || loading) return <main className="min-h-screen grid place-items-center bg-[#0d0f1a] text-slate-300">Loading end options…</main>;
  if (!user) return <main className="min-h-screen grid place-items-center bg-[#0d0f1a] text-slate-200">Sign in as the host to end this bubble.</main>;

  return (
    <main className="min-h-screen bg-[#0d0f1a] text-slate-100 px-4 py-10">
      <section className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-[#111827] p-6 shadow-2xl sm:p-8">
        <div className="mb-7 flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-2xl">⏹</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">End bubble</p>
            <h1 className="mt-1 text-2xl font-bold">{title}</h1>
            <p className="mt-2 text-sm text-slate-400">Choose what attendees can keep after this session ends.</p>
          </div>
        </div>

        <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-[#161d2e] p-4">
          <input type="checkbox" checked={shareRecord} onChange={(e) => setShareRecord(e.target.checked)} className="mt-1 accent-violet-500" />
          <span>
            <span className="block text-sm font-semibold">Share the decision record with everyone who attended</span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-400">Attendees will find the generated summary and decisions in Previous Bubbles.</span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setRetention("ephemeral")} className={`cursor-pointer rounded-2xl border p-4 text-left ${retention === "ephemeral" ? "border-violet-400 bg-violet-500/10" : "border-white/10 bg-[#161d2e]"}`}>
            <span className="block text-sm font-semibold">End ephemerally</span>
            <span className="mt-2 block text-xs leading-relaxed text-slate-400">Remove chat, uploaded documents, and live intelligence. A shared decision record remains available if selected above.</span>
          </button>
          <button type="button" onClick={() => setRetention("view-only")} className={`cursor-pointer rounded-2xl border p-4 text-left ${retention === "view-only" ? "border-violet-400 bg-violet-500/10" : "border-white/10 bg-[#161d2e]"}`}>
            <span className="block text-sm font-semibold">Keep a read-only bubble</span>
            <span className="mt-2 block text-xs leading-relaxed text-slate-400">Attendees can view chat and live intelligence. Documents and uploads are removed.</span>
          </button>
        </div>

        {retention === "view-only" && <label className="mt-4 flex items-center gap-3 text-sm text-slate-300">Keep view access for
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="cursor-pointer rounded-lg border border-white/10 bg-[#161d2e] px-3 py-2 text-slate-100">
            {[1, 3, 5, 7, 14].map((n) => <option key={n} value={n}>{n} days</option>)}
          </select>
        </label>}

        <label className="mt-6 block text-xs font-medium text-slate-300">Briefing focus (optional)
          <textarea value={focus} onChange={(e) => setFocus(e.target.value)} rows={3} placeholder="What should the decision record emphasize?" className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#161d2e] p-3 text-sm text-slate-100 placeholder:text-slate-500" />
        </label>

        {error && <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-sm text-amber-200">{error}
          {error.includes("export failed") && <button type="button" disabled={submitting} onClick={() => finishBubble(true)} className="mt-3 block cursor-pointer rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">End and shred anyway</button>}
        </div>}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => router.replace(`/bubble/${bubbleId}`)} disabled={submitting} className="cursor-pointer rounded-xl border border-white/10 px-5 py-3 text-sm text-slate-300 disabled:opacity-50">Back to bubble</button>
          <button type="button" onClick={() => finishBubble()} disabled={submitting} className="cursor-pointer rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-950/30 disabled:opacity-50">{submitting ? "Ending bubble…" : "Confirm and end bubble"}</button>
        </div>
      </section>
    </main>
  );
}
