"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RetentionPolicy, AITriggerMode } from "@/types";
import { createBubble } from "@/lib/api";
import { useFirebaseAuth } from "@/lib/auth";
import { AuthModal } from "@/components/auth/AuthModal";

export default function CreateBubblePage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useFirebaseAuth();

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPolicy>("temporary-plus-record");
  const [triggerMode, setTriggerMode] = useState<AITriggerMode>("auto");
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [tokenBudget, setTokenBudget] = useState(250000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Success State
  const [createdBubble, setCreatedBubble] = useState<{
    id: string;
    title: string;
    retention: RetentionPolicy;
    inviteUrl: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please provide a name for your Context Bubble.");
      return;
    }

    if (trimmedName.length < 2) {
      setError("Bubble name must be at least 2 characters long.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Call backend API to create bubble in Firestore & schedule auto-pop timer
      const res = await createBubble({
        title: trimmedName,
        duration_minutes: durationMinutes,
        retention_policy: retentionPolicy,
        anonymous_mode_enabled: anonymousMode,
        trigger_mode: triggerMode,
        token_budget: tokenBudget,
      });

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const inviteUrl = `${origin}/join?code=${res.id}`;

      setCreatedBubble({
        id: res.id,
        title: res.title,
        retention: res.retention_policy,
        inviteUrl,
      });
    } catch (err: unknown) {
      console.warn("Backend bubble creation notice:", err);
      setError(err instanceof Error ? err.message : "Failed to create bubble on server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCopyInviteLink() {
    if (!createdBubble) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(createdBubble.inviteUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleEnterWorkspace() {
    if (!createdBubble) return;
    const searchParams = new URLSearchParams({
      role: "host",
      title: createdBubble.title,
      user: user?.displayName || "Host",
    });
    router.push(`/bubble/${createdBubble.id}?${searchParams.toString()}`);
  }

  const isUserAuthenticated = Boolean(user && user.displayName);

  return (
    <div className="min-h-screen bg-[#0d0f1a] text-slate-100 flex flex-col selection:bg-violet-500/30">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#111827]/80 backdrop-blur-md px-5 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-105 transition-transform">
              C
            </div>
            <span className="font-semibold text-white text-base tracking-wide">Context Bubble</span>
          </Link>
          <div className="flex items-center gap-3">
            {user && user.displayName && (
              <div className="flex items-center gap-2 text-xs text-slate-300 bg-[#1a2236] px-2.5 py-1 rounded-full border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    user.photoURL ||
                    `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(
                      user.displayName || "Host"
                    )}&backgroundColor=b6e3f4`
                  }
                  alt={user.displayName || "Host"}
                  className="w-5 h-5 rounded-full"
                />
                <span className="font-medium max-w-[120px] truncate">{user.displayName}</span>
                <button
                  type="button"
                  onClick={signOut}
                  className="text-[10px] text-slate-400 hover:text-rose-400 ml-1 underline"
                >
                  Switch
                </button>
              </div>
            )}
            <Link
              href="/"
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-[#1a2236] transition-colors"
            >
              &larr; Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-5 py-10 sm:py-14">
        {/* Step 1: Upfront Authentication Gate if not signed in */}
        {!authLoading && (!user || !user.displayName) && !createdBubble && (
          <div className="flex flex-col items-center">
            <AuthModal
              isInline={true}
              title="Step 1 of 2: Sign In as Host"
              subtitle="Please sign in or identify yourself beforehand so you are recognized as the session host."
              onSuccess={() => {}}
            />
          </div>
        )}

        {/* Step 2: Room Creation Form */}
        {user && user.displayName && !createdBubble && (
          <div className="rounded-2xl border border-white/10 bg-[#0f1525] p-6 sm:p-8 shadow-2xl">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium">
                  Host Workspace Setup
                </div>
                <span className="text-xs text-slate-400">Step 2 of 2</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Create a Context Bubble</h1>
              <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">
                Configure your deliberation space. You will enter as the room <strong>Host</strong> with timer and export controls.
              </p>
            </div>

            {error && (
              <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-900/20 p-3.5 text-rose-300 text-xs flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Bubble Name */}
              <div className="flex flex-col gap-2">
                <label htmlFor="bubble-name" className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                  <span>Bubble Name <span className="text-rose-400">*</span></span>
                  <span className="text-[11px] font-normal text-slate-500">e.g., Q4 Pivot &amp; Pricing Alignment</span>
                </label>
                <input
                  id="bubble-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Pricing Strategy & Churn Review"
                  className="rounded-xl border border-white/10 bg-[#161d2e] px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-2">
                <label htmlFor="bubble-desc" className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                  <span>Objective / Deliberation Goal <span className="text-slate-500 font-normal">(Optional)</span></span>
                  <span className="text-[11px] font-normal text-slate-500">Shared with participants</span>
                </label>
                <textarea
                  id="bubble-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What key question or decision needs to be answered?"
                  className="rounded-xl border border-white/10 bg-[#161d2e] px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                />
              </div>

              {/* Duration & AI Trigger Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Duration */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-200">
                    Auto-Expire Duration
                  </label>
                  <select
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="rounded-xl border border-white/10 bg-[#161d2e] px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500"
                  >
                    <option value={30}>30 Minutes</option>
                    <option value={60}>1 Hour</option>
                    <option value={120}>2 Hours (Default)</option>
                    <option value={240}>4 Hours</option>
                    <option value={720}>12 Hours</option>
                    <option value={1440}>24 Hours</option>
                  </select>
                </div>

                {/* AI Trigger Mode */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-200">
                    AI Trigger Mode
                  </label>
                  <select
                    value={triggerMode}
                    onChange={(e) => setTriggerMode(e.target.value as AITriggerMode)}
                    className="rounded-xl border border-white/10 bg-[#161d2e] px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500"
                  >
                    <option value="auto">Auto Debounce (3s pause)</option>
                    <option value="mention">Mention Only (@AI)</option>
                    <option value="always">Always Active (Every msg)</option>
                  </select>
                </div>
              </div>

              {/* Retention Policy Options */}
              <div className="flex flex-col gap-2.5">
                <label className="text-xs font-semibold text-slate-200">
                  Retention Policy <span className="text-rose-400">*</span>
                </label>
                <div className="flex flex-col gap-2.5">
                  <label
                    className={`rounded-xl border p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                      retentionPolicy === "temporary"
                        ? "border-violet-500 bg-violet-900/15"
                        : "border-white/10 bg-[#161d2e] hover:border-white/20"
                    }`}
                  >
                    <input
                      type="radio"
                      name="retention"
                      value="temporary"
                      checked={retentionPolicy === "temporary"}
                      onChange={() => setRetentionPolicy("temporary")}
                      className="mt-1 text-violet-600 focus:ring-0 focus:outline-none"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">Temporary Bubble</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          Ephemeral
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Everything is crypto-shredded when the timer expires or host pops the room.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`rounded-xl border p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                      retentionPolicy === "temporary-plus-record"
                        ? "border-violet-500 bg-violet-900/15"
                        : "border-white/10 bg-[#161d2e] hover:border-white/20"
                    }`}
                  >
                    <input
                      type="radio"
                      name="retention"
                      value="temporary-plus-record"
                      checked={retentionPolicy === "temporary-plus-record"}
                      onChange={() => setRetentionPolicy("temporary-plus-record")}
                      className="mt-1 text-violet-600 focus:ring-0 focus:outline-none"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">Temporary Bubble + Decision Record</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-violet-900/40 border border-violet-500/30 text-violet-300">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Discussion is shredded, but the executive briefing with consensus, blockers, and action items is exported.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`rounded-xl border p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                      retentionPolicy === "permanent"
                        ? "border-violet-500 bg-violet-900/15"
                        : "border-white/10 bg-[#161d2e] hover:border-white/20"
                    }`}
                  >
                    <input
                      type="radio"
                      name="retention"
                      value="permanent"
                      checked={retentionPolicy === "permanent"}
                      onChange={() => setRetentionPolicy("permanent")}
                      className="mt-1 text-violet-600 focus:ring-0 focus:outline-none"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">Long-Term Bubble</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          Extended
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Transcript, vectors, and intelligence persist for long-term project deliberation.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Anonymous Mode Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-[#161d2e]">
                <div>
                  <span className="text-xs font-semibold text-white block">Default Anonymous Participation</span>
                  <span className="text-[11px] text-slate-400">Hide participant names by default</span>
                </div>
                <input
                  type="checkbox"
                  checked={anonymousMode}
                  onChange={(e) => setAnonymousMode(e.target.checked)}
                  className="w-5 h-5 rounded text-violet-600 focus:ring-0"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-lg shadow-violet-900/30 transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Creating Bubble on Cloud Backend...</span>
                    </>
                  ) : (
                    <span>Create &amp; Launch Bubble as Host</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step 3: Success Screen */}
        {createdBubble && (
          <div className="rounded-2xl border border-violet-500/30 bg-[#0f1525] p-6 sm:p-8 shadow-2xl relative">
            <div className="w-12 h-12 rounded-2xl bg-green-500/20 border border-green-500/40 flex items-center justify-center text-green-400 text-2xl mb-4">
              ✓
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              Bubble Created Successfully!
            </h1>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              Your decision workspace <strong className="text-white">&ldquo;{createdBubble.title}&rdquo;</strong> is live. You are authenticated as <strong className="text-violet-300">{user?.displayName}</strong> (Host).
            </p>

            {/* Bubble Code & Invite Box */}
            <div className="rounded-xl border border-white/10 bg-[#161d2e] p-4 mb-6 flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Bubble ID (Share with participants)</span>
                <span className="font-mono text-violet-300 font-semibold text-sm">{createdBubble.id}</span>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                <input
                  type="text"
                  readOnly
                  value={createdBubble.inviteUrl}
                  className="flex-1 bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-medium text-slate-200 hover:text-white transition-colors flex items-center gap-1.5 shrink-0"
                >
                  {copied ? (
                    <>
                      <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-green-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleEnterWorkspace}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm shadow-lg shadow-violet-900/40 transition-colors"
              >
                <span>Enter Workspace as Host</span>
                <span>&rarr;</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatedBubble(null);
                  setName("");
                  setDescription("");
                }}
                className="px-4 py-3 rounded-xl bg-[#161d2e] hover:bg-[#1a2236] border border-white/10 text-slate-300 text-sm font-medium transition-colors"
              >
                Create Another
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
