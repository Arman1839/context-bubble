"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RetentionPolicy } from "@/types";

export default function CreateBubblePage() {
  const router = useRouter();

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPolicy>("temporary-plus-record");
  const [longTermDuration, setLongTermDuration] = useState("30-days");
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please provide a name for your Context Bubble.");
      return;
    }

    if (trimmedName.length < 3) {
      setError("Bubble name must be at least 3 characters long.");
      return;
    }

    setIsSubmitting(true);

    // Simulate creation latency
    setTimeout(() => {
      // Generate a mock unique bubble id
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const generatedId = `cb-${randomSuffix}`;

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const inviteUrl = `${origin}/join?code=${generatedId}`;

      setCreatedBubble({
        id: generatedId,
        title: trimmedName,
        retention: retentionPolicy,
        inviteUrl,
      });

      setIsSubmitting(false);
    }, 450);
  }

  function handleCopyInviteLink() {
    if (!createdBubble) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(createdBubble.inviteUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
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
    });
    router.push(`/bubble/${createdBubble.id}?${searchParams.toString()}`);
  }

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
          <Link
            href="/"
            className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-[#1a2236] transition-colors"
          >
            &larr; Back to Home
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-5 py-10 sm:py-14">
        {createdBubble ? (
          /* Success Card */
          <div className="rounded-2xl border border-violet-500/30 bg-[#0f1525] p-6 sm:p-8 shadow-2xl relative">
            <div className="w-12 h-12 rounded-2xl bg-green-500/20 border border-green-500/40 flex items-center justify-center text-green-400 text-2xl mb-4">
              ✓
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              Bubble Created Successfully!
            </h1>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              Your decision workspace <strong className="text-white">&ldquo;{createdBubble.title}&rdquo;</strong> is ready. You are the host for this session.
            </p>

            {/* Bubble Code & Invite Box */}
            <div className="rounded-xl border border-white/10 bg-[#161d2e] p-4 mb-6 flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Bubble ID</span>
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

            {/* Local Prototype Notice */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-900/10 p-3.5 text-xs text-amber-300/90 leading-relaxed mb-6 flex items-start gap-2.5">
              <span className="text-base shrink-0">⚠️</span>
              <p>
                <strong>Frontend Prototype:</strong> This bubble and invite code operate locally in your browser. Real-time multi-device cloud synchronization will be available in future releases.
              </p>
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
        ) : (
          /* Form Card */
          <div className="rounded-2xl border border-white/10 bg-[#0f1525] p-6 sm:p-8 shadow-2xl">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium mb-3">
                New Workspace
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Create a Context Bubble</h1>
              <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">
                Set up a focused collaborative room. AI will track consensus, highlight gaps, and synthesize key takeaways.
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
                  <span className="text-[11px] font-normal text-slate-500">e.g., Q4 Pivot Debate</span>
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
                  <span>Objective / Context <span className="text-slate-500 font-normal">(Optional)</span></span>
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

              {/* Retention Policy Options */}
              <div className="flex flex-col gap-2.5">
                <label className="text-xs font-semibold text-slate-200">
                  Retention Policy <span className="text-rose-400">*</span>
                </label>
                <p className="text-[11px] text-slate-400 -mt-1 mb-1">
                  Controls how discussion data and summaries persist after the session.
                </p>

                <div className="flex flex-col gap-2.5">
                  {/* Option 1 */}
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
                        Discussion automatically auto-expires (default 2 hours). No record is retained.
                      </p>
                    </div>
                  </label>

                  {/* Option 2 */}
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
                        Discussion expires, but the host-approved AI synthesis &amp; Decision Record is permanently saved.
                      </p>
                    </div>
                  </label>

                  {/* Option 3 */}
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
                        Full discussion stream and intelligence remain accessible for a configurable duration.
                      </p>

                      {retentionPolicy === "permanent" && (
                        <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-2">
                          <span className="text-xs text-slate-300">Retention Duration:</span>
                          <select
                            value={longTermDuration}
                            onChange={(e) => setLongTermDuration(e.target.value)}
                            className="text-xs rounded-lg border border-white/10 bg-[#111827] px-2.5 py-1 text-slate-200 focus:outline-none focus:border-violet-500"
                          >
                            <option value="7-days">7 Days</option>
                            <option value="30-days">30 Days</option>
                            <option value="90-days">90 Days</option>
                            <option value="indefinite">Indefinite</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Creating Bubble...</span>
                    </>
                  ) : (
                    <span>Create &amp; Launch Bubble</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
