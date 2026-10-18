"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function JoinBubbleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const codeParam = searchParams.get("code") || searchParams.get("id") || "";
  const [code, setCode] = useState(codeParam);
  const [prevCodeParam, setPrevCodeParam] = useState(codeParam);
  if (codeParam !== prevCodeParam) {
    setPrevCodeParam(codeParam);
    if (codeParam) {
      setCode(codeParam);
    }
  }

  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedCode = code.trim();
    const trimmedName = displayName.trim();

    if (!trimmedCode) {
      setError("Please enter a Bubble ID or invitation code.");
      return;
    }

    if (!trimmedName) {
      setError("Please provide your display name.");
      return;
    }

    // Clean up code if user pasted a full URL or path
    let cleanedId = trimmedCode;
    if (cleanedId.includes("/bubble/")) {
      cleanedId = cleanedId.split("/bubble/")[1].split("?")[0];
    } else if (cleanedId.includes("code=")) {
      cleanedId = cleanedId.split("code=")[1].split("&")[0];
    }

    // Validation for demo: allow "demo", any "cb-*" generated code, or standard alphanumeric IDs.
    // Explicitly reject clearly invalid inputs like "invalid", "unknown", "error", or non-alphanumeric.
    const invalidKeywords = ["invalid", "unknown", "error", "null", "undefined", "nonexistent"];
    const isExplicitlyInvalid = invalidKeywords.includes(cleanedId.toLowerCase());
    const isValidFormat = /^[a-zA-Z0-9_-]{3,50}$/.test(cleanedId);

    if (isExplicitlyInvalid || !isValidFormat) {
      setError(`Bubble "${trimmedCode}" was not found or the code is invalid. Check the invitation link or join the demo session below.`);
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const sp = new URLSearchParams({
        user: trimmedName,
      });
      router.push(`/bubble/${cleanedId}?${sp.toString()}`);
    }, 350);
  }

  function handleQuickJoinDemo() {
    setCode("demo");
    if (!displayName) {
      setDisplayName("Participant");
    }
    setError(null);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f1525] p-6 sm:p-8 shadow-2xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium mb-3">
          Participant Access
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Join a Context Bubble</h1>
        <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">
          Enter an invite code or room ID to enter an active decision session as a collaborator.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-900/20 p-4 text-xs flex flex-col gap-2.5">
          <div className="flex items-start gap-2 text-rose-300">
            <svg className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="leading-relaxed">{error}</span>
          </div>
          <button
            type="button"
            onClick={handleQuickJoinDemo}
            className="self-start text-[11px] font-medium text-violet-300 hover:text-white underline underline-offset-2 ml-6"
          >
            Load &ldquo;demo&rdquo; room code instead
          </button>
        </div>
      )}

      <form onSubmit={handleJoin} className="flex flex-col gap-5">
        {/* Bubble Code / ID */}
        <div className="flex flex-col gap-2">
          <label htmlFor="bubble-code" className="text-xs font-semibold text-slate-200 flex items-center justify-between">
            <span>Bubble ID or Invite Code <span className="text-rose-400">*</span></span>
            <span className="text-[11px] font-normal text-slate-500">e.g., demo or cb-7x9q2m</span>
          </label>
          <input
            id="bubble-code"
            type="text"
            required
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Paste code or link (e.g. demo)"
            className="rounded-xl border border-white/10 bg-[#161d2e] px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
          />
        </div>

        {/* Display Name */}
        <div className="flex flex-col gap-2">
          <label htmlFor="display-name" className="text-xs font-semibold text-slate-200 flex items-center justify-between">
            <span>Your Name <span className="text-rose-400">*</span></span>
            <span className="text-[11px] font-normal text-slate-500">Visible to team unless anonymous</span>
          </label>
          <input
            id="display-name"
            type="text"
            required
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g., Samantha"
            className="rounded-xl border border-white/10 bg-[#161d2e] px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        {/* Quick Demo Fill Helper */}
        <div className="rounded-xl border border-white/5 bg-[#161d2e] p-3 flex items-center justify-between text-xs">
          <span className="text-slate-400">Testing the prototype?</span>
          <button
            type="button"
            onClick={handleQuickJoinDemo}
            className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
          >
            Fill Demo Room (&ldquo;demo&rdquo;)
          </button>
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting || !code.trim() || !displayName.trim()}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-lg shadow-violet-900/30 transition-all"
          >
            {isSubmitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Connecting to Bubble...</span>
              </>
            ) : (
              <span>Join Bubble</span>
            )}
          </button>
        </div>
      </form>

      {/* Local Prototype Notice */}
      <div className="mt-6 pt-5 border-t border-white/5 text-[11px] text-slate-500 leading-relaxed text-center">
        Demo Mode: This frontend prototype runs simulated collaboration locally in your browser. Real-time multi-device collaboration will be connected via Cloud Firestore.
      </div>
    </div>
  );
}

export default function JoinBubblePage() {
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
      <main className="flex-1 max-w-lg w-full mx-auto px-5 py-12 sm:py-16">
        <Suspense fallback={<div className="rounded-2xl border border-white/10 bg-[#0f1525] p-8 h-80 animate-pulse" />}>
          <JoinBubbleForm />
        </Suspense>
      </main>
    </div>
  );
}
