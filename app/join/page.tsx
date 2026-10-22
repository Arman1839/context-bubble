"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { joinBubble, getBubble } from "@/lib/api";
import { useFirebaseAuth } from "@/lib/auth";
import { AuthModal } from "@/components/auth/AuthModal";
import { AvatarPicker } from "@/components/participant/AvatarPicker";
import { getAvatarUrl, getSavedAvatarProfile } from "@/lib/avatar-profile";
import { AmbientBubbles } from "@/components/layout/AmbientBubbles";

function JoinBubbleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useFirebaseAuth();

  const codeParam = searchParams.get("code") || searchParams.get("id") || "";
  const [code, setCode] = useState(codeParam);
  const [prevCodeParam, setPrevCodeParam] = useState(codeParam);
  // localUser bridges the gap between onSuccess callback and useFirebaseAuth state update
  const [localUser, setLocalUser] = useState<typeof user | null>(null);
  const [joinName, setJoinName] = useState("");
  const [joinNameEdited, setJoinNameEdited] = useState(false);

  if (codeParam !== prevCodeParam) {
    setPrevCodeParam(codeParam);
    if (codeParam) setCode(codeParam);
  }

  // Effective user: whichever is available first
  const effectiveUser = user || localUser;

  useEffect(() => {
    if (!joinNameEdited && effectiveUser?.displayName) setJoinName(effectiveUser.displayName);
  }, [effectiveUser?.displayName, joinNameEdited]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isUserAuthenticated = Boolean(effectiveUser && effectiveUser.displayName);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("Please enter a Bubble ID or invitation link.");
      return;
    }

    // Clean up code if user pasted a full URL or path
    let cleanedId = trimmedCode;
    if (cleanedId.includes("/bubble/")) {
      cleanedId = cleanedId.split("/bubble/")[1].split("?")[0];
    } else if (cleanedId.includes("code=")) {
      cleanedId = cleanedId.split("code=")[1].split("&")[0];
    }

    setIsSubmitting(true);

    try {
      // 1. Verify bubble exists on the backend API
      const bubbleData = await getBubble(cleanedId);
      const bubbleTitle = bubbleData.title;
      const actualBubbleId = bubbleData.id;

      // 2. Join the bubble transactionally on the backend. A rejected join must
      // stay on this page so removal and stale invite messages are visible.
      await joinBubble(actualBubbleId, {
        display_name: joinName.trim() || effectiveUser?.displayName || "Participant",
        join_code: cleanedId,
        avatar_url: effectiveUser && getSavedAvatarProfile(effectiveUser.uid).kind === "human"
          ? getAvatarUrl(effectiveUser.uid, joinName.trim() || effectiveUser.displayName || "Participant", getSavedAvatarProfile(effectiveUser.uid).style)
          : undefined,
        avatar_animal: effectiveUser && getSavedAvatarProfile(effectiveUser.uid).kind === "animal"
          ? getSavedAvatarProfile(effectiveUser.uid).animal
          : undefined,
      });

      const sp = new URLSearchParams({
        user: joinName.trim() || effectiveUser?.displayName || "Participant",
        join_code: cleanedId,
        ...(bubbleTitle ? { title: bubbleTitle } : {}),
      });

      router.push(`/bubble/${actualBubbleId}?${sp.toString()}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join bubble.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0f1525] p-8 flex items-center justify-center">
        <svg className="w-6 h-6 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  // Step 1: Upfront Auth Gate if not signed in
  if (!effectiveUser || !effectiveUser.displayName) {
    return (
      <div className="flex flex-col items-center">
        <AuthModal
          isInline={true}
          title="Step 1 of 2: Sign In as Participant"
          subtitle="Please sign in to enter the deliberation session."
          onSuccess={(signedInUser) => {
            // Store locally for immediate re-render — useFirebaseAuth will sync shortly after
            setLocalUser(signedInUser);
          }}
        />
      </div>
    );
  }

  // Step 2: Enter Room Code Form
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f1525] p-6 sm:p-8 shadow-2xl">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium">
            Participant Access
          </div>
          <span className="text-xs text-slate-400">Step 2 of 2</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Join a Context Bubble</h1>
        <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">
          Enter an invite code or room ID to enter an active decision session as a collaborator.
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-2 rounded-xl border border-white/10 bg-[#161d2e] p-4">
        <label htmlFor="join-display-name" className="text-xs font-semibold text-slate-200">Name in this Bubble</label>
        <input id="join-display-name" type="text" required maxLength={50} value={joinName} onChange={(e) => { setJoinName(e.target.value); setJoinNameEdited(true); }} placeholder="Your name in this Bubble" className="rounded-xl border border-white/10 bg-[#0f1525] px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:outline-none" />
        <p className="text-[11px] text-slate-500">Defaults to your account name. You can change it for this Bubble.</p>
      </div>

      <div className="mb-5">
        <AvatarPicker uid={effectiveUser?.uid} name={effectiveUser?.displayName || "Participant"} />
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-900/20 p-4 text-xs flex items-start gap-2.5 text-rose-300 leading-relaxed">
          <svg className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleJoin} className="flex flex-col gap-5">
        {/* Bubble Code / ID */}
        <div className="flex flex-col gap-2">
          <label htmlFor="bubble-code" className="text-xs font-semibold text-slate-200 flex items-center justify-between">
            <span>Bubble ID or Invite Link <span className="text-rose-400">*</span></span>
            <span className="text-[11px] font-normal text-slate-500">e.g., 8-character ID or full link</span>
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
            placeholder="Paste room code (e.g., cb-7x9q or full URL)"
            className="rounded-xl border border-white/10 bg-[#161d2e] px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
            autoFocus
          />
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting || !code.trim()}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-lg shadow-violet-900/30 transition-all"
          >
            {isSubmitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Joining Workspace...</span>
              </>
            ) : (
              <span>Join Bubble as Participant &rarr;</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function JoinBubblePage() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#0d0f1a] text-slate-100 flex flex-col selection:bg-violet-500/30">
      <AmbientBubbles />
      {/* Header */}
      <header className="relative z-10 border-b border-white/10 bg-[#111827]/80 backdrop-blur-md px-5 py-3.5">
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
      <main className="relative z-10 flex-1 max-w-lg w-full mx-auto px-5 py-12 sm:py-16">
        <Suspense fallback={<div className="rounded-2xl border border-white/10 bg-[#0f1525] p-8 h-80 animate-pulse" />}>
          <JoinBubbleForm />
        </Suspense>
      </main>
    </div>
  );
}
