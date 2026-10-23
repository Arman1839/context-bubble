"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getBubble, popBubble, startBubblePop } from "@/lib/api";
import { useFirebaseAuth } from "@/lib/auth";
import { AmbientBubbles } from "@/components/layout/AmbientBubbles";
import type { RetentionPolicy } from "@/types";

interface Props { bubbleId: string; }

function extractBubbleIdFromUrl(pathname?: string | null, fallbackId?: string): string {
  if (typeof window !== "undefined" && window.location.pathname) {
    const match = window.location.pathname.match(/^\/bubble\/([^/?#]+)/);
    if (match && match[1] && match[1] !== "create") {
      return decodeURIComponent(match[1]);
    }
  }
  if (pathname) {
    const match = pathname.match(/^\/bubble\/([^/?#]+)/);
    if (match && match[1] && match[1] !== "create") {
      return decodeURIComponent(match[1]);
    }
  }
  return fallbackId || "demo";
}

export function EndBubblePage({ bubbleId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const effectiveBubbleId = extractBubbleIdFromUrl(pathname, bubbleId);
  const { user, loading: authLoading } = useFirebaseAuth();
  const [title, setTitle] = useState("Context Bubble");
  const [loading, setLoading] = useState(true);
  const [retention, setRetention] = useState<"ephemeral" | "view-only">("ephemeral");
  const [days, setDays] = useState(3);
  const [shareRecord, setShareRecord] = useState(true);
  const [creationRetention, setCreationRetention] = useState<RetentionPolicy>("temporary-plus-record");
  const [showChanges, setShowChanges] = useState(false);
  const [focus, setFocus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getBubble(effectiveBubbleId)
      .then((bubble) => {
        if (!active) return;
        setTitle(bubble.title);
        setCreationRetention(bubble.retention_policy);
        setShareRecord(bubble.retention_policy !== "temporary");
        setRetention(bubble.retention_policy === "view-only" ? "view-only" : "ephemeral");
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load this bubble."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [effectiveBubbleId]);

  const finishBubble = async (forceShred = false, direct = false) => {
    setSubmitting(true);
    setError("");
    const retentionPolicy: RetentionPolicy = direct ? creationRetention : retention === "view-only"
      ? "view-only"
      : shareRecord ? "temporary-plus-record" : "temporary";
    try {
      if (direct) {
        await startBubblePop(effectiveBubbleId, {
          retention_policy: retentionPolicy,
          share_decision_record: retentionPolicy !== "temporary",
          view_retention_days: 3,
        });
        router.replace("/");
        return;
      }
      const result = await popBubble(effectiveBubbleId, {
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
    <main className="relative isolate min-h-screen overflow-hidden bg-[#0d0f1a] text-slate-100 px-4 py-10">
      <AmbientBubbles />
      <section className="relative z-10 mx-auto max-w-2xl rounded-3xl border border-white/10 bg-[#111827]/90 p-6 shadow-2xl backdrop-blur-md sm:p-8">
        <div className="mb-7 flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-2xl">⏹</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">End bubble</p>
            <h1 className="mt-1 text-2xl font-bold">{title}</h1>
            <p className="mt-2 text-sm text-slate-400">End using the retention mode chosen when this bubble was created, or adjust the wrap-up settings first.</p>
          </div>
        </div>

        {error && !showChanges && <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-sm text-amber-200">{error}</div>}

        {!showChanges && <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => router.replace(`/bubble/${effectiveBubbleId}`)} disabled={submitting} className="cursor-pointer rounded-xl border border-white/10 px-5 py-3 text-sm text-slate-300 disabled:opacity-50">Back to bubble</button>
          <button type="button" onClick={() => finishBubble(false, true)} disabled={submitting} className="cursor-pointer rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-950/30 disabled:opacity-50">{submitting ? "Ending…" : "End bubble"}</button>
          <button type="button" onClick={() => setShowChanges(true)} disabled={submitting} className="cursor-pointer rounded-xl border border-violet-400/30 bg-violet-500/10 px-5 py-3 text-sm font-semibold text-violet-200 disabled:opacity-50">End bubble with changes</button>
        </div>}

        {showChanges && <>
        <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-[#161d2e] p-4">
          <input type="checkbox" checked={shareRecord} onChange={(e) => setShareRecord(e.target.checked)} className="mt-1 accent-violet-500" />
          <span>
            <span className="block text-sm font-semibold">Share the decision record with everyone who attended</span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-400">Attendees will find the generated summary and decisions in My Bubbles.</span>
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
          <button type="button" onClick={() => router.replace(`/bubble/${effectiveBubbleId}`)} disabled={submitting} className="cursor-pointer rounded-xl border border-white/10 px-5 py-3 text-sm text-slate-300 disabled:opacity-50">Back to bubble</button>
          <button type="button" onClick={() => finishBubble()} disabled={submitting} className="cursor-pointer rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-950/30 disabled:opacity-50">{submitting ? "Ending bubble…" : "Confirm and end bubble"}</button>
        </div>
        </>}
      </section>
    </main>
  );
}
