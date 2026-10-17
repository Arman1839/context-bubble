"use client";

import React from "react";
import type { Intelligence } from "@/types";

interface Props {
  intelligence: Intelligence;
}

export function LiveIntelligencePanel({ intelligence }: Props) {
  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto pr-0.5">
      {/* Panel heading */}
      <div className="flex items-center gap-2 shrink-0">
        <svg className="w-5 h-5 text-violet-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M11.5 2C6.81 2 3 5.81 3 10.5S6.81 19 11.5 19h.5v3c4.86-2.34 8-7 8-11.5C20 5.81 16.19 2 11.5 2zm1 14.5h-2v-2h2v2zm0-4h-2c0-3.25 3-3 3-5 0-1.1-.9-2-2-2s-2 .9-2 2h-2c0-2.21 1.79-4 4-4s4 1.79 4 4c0 2.5-3 2.75-3 5z" />
        </svg>
        <h2 className="text-white font-semibold text-base">Live Intelligence</h2>
      </div>

      {/* Live Summary */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h3 className="text-white text-sm font-semibold">Live Summary</h3>
        </div>
        <div className="relative rounded-xl border border-violet-500/40 bg-violet-900/10 p-4">
          <div className="absolute top-3 right-3 flex items-center gap-1 text-slate-400 text-[10px]">
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Auto-updating
          </div>
          <p className="text-slate-300 text-sm leading-relaxed pr-20">
            {intelligence.summary}
          </p>
        </div>
      </section>

      {/* Disagreements & Tensions */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-white text-sm font-semibold">Disagreements &amp; Tensions</h3>
        </div>
        <div className="flex flex-col gap-2">
          {intelligence.disagreements.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-900/10 px-4 py-3"
            >
              <p className="text-slate-300 text-sm">
                <span className="text-violet-300 font-semibold">{d.sideA.count} members</span>
                {" point to "}{d.sideA.label}
                {" vs "}
                <span className="text-rose-300 font-semibold">{d.sideB.count} members</span>
                {" suspect "}{d.sideB.label}
              </p>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-[#1a2236] text-slate-300 text-xs hover:bg-[#243050] transition-colors shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                View evidence
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Missing Pieces */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-white text-sm font-semibold">Missing Pieces</h3>
        </div>
        <div className="flex flex-col gap-2">
          {intelligence.missingPieces.map((mp) => (
            <div
              key={mp.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#161d2e] px-4 py-3"
            >
              <p className="text-slate-300 text-sm">{mp.description}</p>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-[#1a2236] text-slate-300 text-xs hover:bg-[#243050] transition-colors shrink-0">
                {mp.action === "request" ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                )}
                {mp.actionLabel}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Suggested Next Steps */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🚀</span>
          <h3 className="text-white text-sm font-semibold">Suggested Next Steps (AI Recommendations)</h3>
        </div>
        <ul className="flex flex-col gap-1.5 pl-1">
          {intelligence.nextSteps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-slate-300 text-sm">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
              {step}
            </li>
          ))}
        </ul>
      </section>

      {/* Demo disclaimer */}
      <p className="text-xs text-slate-600 italic mt-auto pt-2 border-t border-white/5 shrink-0">
        ⚠️ Demo only — AI findings and summaries are static sample data, not live inference.
      </p>
    </div>
  );
}
