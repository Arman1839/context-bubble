"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useFirebaseAuth } from "@/lib/auth";
import { AuthModal } from "@/components/auth/AuthModal";

export default function LandingPage() {
  const { user, signOut } = useFirebaseAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d0f1a] text-slate-100 flex flex-col selection:bg-violet-500/30">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <span className="ambient-bubble ambient-bubble--1">🐼</span>
        <span className="ambient-bubble ambient-bubble--2">🦊</span>
        <span className="ambient-bubble ambient-bubble--3">🐸</span>
        <span className="ambient-bubble ambient-bubble--4">🐱</span>
        <span className="ambient-bubble ambient-bubble--5">🦉</span>
        <span className="ambient-bubble ambient-bubble--6">🐧</span>
        <span className="ambient-bubble ambient-bubble--7">🐶</span>
        <span className="ambient-bubble ambient-bubble--8">🦄</span>
        <span className="ambient-bubble ambient-bubble--9">🐨</span>
        <span className="ambient-bubble ambient-bubble--10">🐰</span>
        <span className="ambient-bubble ambient-bubble--11">🦁</span>
        <span className="ambient-bubble ambient-bubble--12">🐯</span>
        <span className="ambient-bubble ambient-bubble--13">🐻</span>
        <span className="ambient-bubble ambient-bubble--14">🐹</span>
      </div>
      {/* Navigation Header */}
      <header className="relative z-20 border-b border-white/10 bg-[#111827]/80 backdrop-blur-md sticky top-0">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-105 transition-transform">
              C
            </div>
            <span className="font-semibold text-white text-base tracking-wide">Context Bubble</span>
          </Link>

          <nav className="flex items-center gap-3">
            {/* Authenticated User Pill or Sign In Button */}
            {user && user.displayName ? (
              <div className="flex items-center gap-2 bg-[#1a2236] border border-white/10 rounded-full pl-2 pr-3 py-1">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-violet-600 text-xs font-semibold text-white" aria-hidden="true">{user.displayName.trim().charAt(0).toUpperCase()}</span>
                <span className="text-xs text-slate-200 font-medium max-w-[120px] truncate">
                  {user.displayName}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="text-[11px] text-slate-400 hover:text-rose-400 ml-1 transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="text-xs font-medium text-slate-200 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-[#1a2236] transition-colors"
              >
                Sign In
              </button>
            )}

            <Link
              href="/join"
              className="text-xs font-medium text-slate-200 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-[#1a2236] transition-colors"
            >
              Join Bubble
            </Link>
            {user && <Link href="/history" className="text-xs font-medium text-slate-200 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-[#1a2236] transition-colors">My Bubbles</Link>}
            <Link
              href="/bubble/create"
              className="text-xs font-semibold text-white px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 shadow-md shadow-violet-900/30 transition-colors"
            >
              Create Bubble
            </Link>
          </nav>
        </div>
      </header>

      {/* Upfront Auth Modal */}
      {isAuthOpen && (
        <AuthModal
          isOpen={true}
          onClose={() => setIsAuthOpen(false)}
          onSuccess={() => setIsAuthOpen(false)}
          title="Sign In to Context Bubble"
          subtitle="Sign in with email and password before creating or joining rooms."
        />
      )}

      {/* Hero Section */}
      <main className="relative z-10 flex-1 max-w-6xl mx-auto px-5 py-16 sm:py-24 flex flex-col items-center text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium mb-6">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          Real-Time Collaborative Deliberation &amp; Synthesis
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.15]">
          Make high-stakes team decisions{" "}
          <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
            without losing context
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
          Context Bubble is an ephemeral, high-velocity deliberation workspace. Drop thoughts, files, and voice notes while live AI synthesizes consensus, isolates disagreements, and generates verified executive briefings.
        </p>

        {/* Call to Actions */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full max-w-md">
          <Link
            href="/bubble/create"
            className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm shadow-lg shadow-violet-900/40 hover:shadow-violet-800/50 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Create a Bubble
          </Link>
          <Link
            href="/join"
            className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#161d2e] hover:bg-[#1f2942] border border-white/10 text-slate-200 font-medium text-sm transition-all"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Join as Participant
          </Link>
        </div>

        {/* Feature Highlights Section */}
        <section className="mt-20 w-full">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Designed for high-velocity alignment</h2>
            <p className="text-slate-400 text-sm mt-2 max-w-xl mx-auto">
              Everything teams need to collaborate quickly without fragmented chat threads and endless meetings.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-white/10 bg-[#0f1525] p-6 hover:border-white/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-lg mb-4">
                ✨
              </div>
              <h3 className="text-white font-semibold text-base mb-2">Live Evolving Intelligence</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                As messages, files, and voice notes arrive, backend debounced synthesis automatically clusters topics, maps stances, and streams real-time takeaways.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-white/10 bg-[#0f1525] p-6 hover:border-white/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400 text-lg mb-4">
                ⚖️
              </div>
              <h3 className="text-white font-semibold text-base mb-2">Tension &amp; Disagreement Detection</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Automatically identifies conflicting viewpoints, isolates root disagreements, and prompts participants for missing pieces of evidence.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-white/10 bg-[#0f1525] p-6 hover:border-white/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg mb-4">
                💥
              </div>
              <h3 className="text-white font-semibold text-base mb-2">Pop &amp; Crypto-Shredding</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Auto-expires on timer or host pop. Generates executive briefings, dispatches exports to Slack, Notion, and Linear, and shreds raw deliberation transcripts.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

