"use client";

import React, { useState } from "react";
import type { Intelligence, KnowledgeGraph, Insight } from "@/types";
import { KnowledgeGraphVisualizer } from "./KnowledgeGraphVisualizer";

interface Props {
  intelligence: Intelligence;
  knowledgeGraph?: KnowledgeGraph | null;
  streamingToken?: string;
  isSynthesizing?: boolean;
  aiResponse?: string;
  isAIResponding?: boolean;
  onRefreshGraph?: () => void;
}

export function LiveIntelligencePanel({
  intelligence,
  knowledgeGraph,
  streamingToken,
  isSynthesizing = false,
  aiResponse = "",
  isAIResponding = false,
  onRefreshGraph,
}: Props) {
  const [activeTab, setActiveTab] = useState<"synthesis" | "graph">("synthesis");
  const [viewingEvidence, setViewingEvidence] = useState<{
    label: string;
    sideA: { count: number; label: string };
    sideB: { count: number; label: string };
  } | null>(null);

  const rawInsights = intelligence.raw_insights || [];
  const hasContent =
    intelligence.summary ||
    (intelligence.disagreements && intelligence.disagreements.length > 0) ||
    (intelligence.missingPieces && intelligence.missingPieces.length > 0) ||
    (intelligence.nextSteps && intelligence.nextSteps.length > 0) ||
    rawInsights.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0d1117]">

      {/* ── Panel Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          {/* question-mark icon matching screenshot */}
          <svg className="w-5 h-5 text-violet-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.5 2C6.81 2 3 5.81 3 10.5S6.81 19 11.5 19h.5v3c4.86-2.34 8-7 8-11.5C20 5.81 16.19 2 11.5 2zm1 14.5h-2v-2h2v2zm0-4h-2c0-3.25 3-3 3-5 0-1.1-.9-2-2-2s-2 .9-2 2h-2c0-2.21 1.79-4 4-4s4 1.79 4 4c0 2.5-3 2.75-3 5z" />
          </svg>
          <h2 className="text-white font-semibold text-sm tracking-wide">Live Intelligence</h2>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => setActiveTab("synthesis")}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              activeTab === "synthesis"
                ? "bg-[#1e2536] text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Insights
          </button>
          <button
            onClick={() => setActiveTab("graph")}
            className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "graph"
                ? "bg-[#1e2536] text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Graph
            {knowledgeGraph && knowledgeGraph.nodes.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>
      </div>

      {/* ── Synthesizing indicator ────────────────────────────── */}
      {(isSynthesizing || streamingToken) && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-violet-950/30 border border-violet-500/20 flex items-center gap-2 shrink-0">
          <svg className="w-3 h-3 text-violet-400 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-[11px] text-violet-300">Synthesizing…</span>
        </div>
      )}

      {/* ── AI Participant response ──────────────────────────── */}
      {(aiResponse || isAIResponding) && (
        <div className="mx-4 mt-3 rounded-xl border border-violet-500/25 bg-[#13172a] p-3.5 shrink-0">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-4 h-4 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold text-violet-300">Bubble AI</span>
            {isAIResponding && (
              <span className="text-[10px] text-slate-500 animate-pulse">responding…</span>
            )}
          </div>
          <p className="text-slate-200 text-xs leading-relaxed">
            {aiResponse || <span className="text-slate-500 italic">Thinking…</span>}
            {isAIResponding && aiResponse && (
              <span className="inline-block w-0.5 h-3.5 bg-violet-400 animate-pulse ml-0.5 align-middle" />
            )}
          </p>
        </div>
      )}

      {/* ── Tab: Synthesis ───────────────────────────────────── */}
      {activeTab === "synthesis" ? (
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4 flex flex-col gap-0">

          {/* Empty state */}
          {!hasContent && !isSynthesizing && !aiResponse && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 gap-3">
              <div className="w-10 h-10 rounded-full bg-[#161d2e] border border-white/5 flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <p className="text-slate-500 text-xs max-w-[200px] leading-relaxed">
                Listening… Intelligence will surface as the discussion evolves.
              </p>
            </div>
          )}

          {/* ── ⚡ Live Summary ──────────────────────────────── */}
          {(intelligence.summary || isSynthesizing) && (
            <section className="pt-4">
              {/* Section header */}
              <div className="flex items-center gap-1.5 mb-2.5">
                <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase">Live Summary</span>
              </div>

              {/* Summary card — matches screenshot exactly */}
              <div className="rounded-xl bg-[#111827] border border-white/[0.06] px-4 py-3.5 relative">
                {/* Auto-updating badge top-right */}
                <div className="absolute top-2.5 right-3 flex items-center gap-1 text-[9px] text-slate-500">
                  <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Auto-updating
                </div>
                <p className="text-slate-300 text-xs leading-[1.65] pr-16">
                  {intelligence.summary || (
                    <span className="text-slate-600 italic">Synthesizing discussion…</span>
                  )}
                </p>
              </div>
            </section>
          )}

          {/* ── ⚠ Disagreements & Tensions ─────────────────── */}
          {intelligence.disagreements && intelligence.disagreements.length > 0 && (
            <section className="pt-5">
              <div className="flex items-center gap-1.5 mb-2.5">
                {/* Warning triangle — amber, matching screenshot */}
                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase">Disagreements &amp; Tensions</span>
              </div>

              <div className="flex flex-col gap-2">
                {intelligence.disagreements.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl bg-[#111827] border border-white/[0.06] px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <p className="text-slate-300 text-xs leading-relaxed min-w-0">
                      <span className="text-white font-semibold">{d.sideA.count} members</span>
                      {" point to "}
                      <span className="text-white">{d.sideA.label}</span>
                      {" vs "}
                      <span className="text-rose-400 font-semibold">{d.sideB.count} members</span>
                      {" suspect "}
                      <span className="text-slate-400">{d.sideB.label}</span>
                    </p>
                    <button
                      onClick={() => setViewingEvidence({ label: `${d.sideA.label} vs ${d.sideB.label}`, sideA: d.sideA, sideB: d.sideB })}
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a2236] border border-white/[0.08] text-slate-400 hover:text-slate-200 text-[11px] transition-colors"
                    >
                      {/* search/evidence icon */}
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      View evidence
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── 🔍 Missing Pieces ───────────────────────────── */}
          {intelligence.missingPieces && intelligence.missingPieces.length > 0 && (
            <section className="pt-5">
              <div className="flex items-center gap-1.5 mb-2.5">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase">Missing Pieces</span>
              </div>

              <div className="flex flex-col gap-2">
                {intelligence.missingPieces.map((mp) => (
                  <div
                    key={mp.id}
                    className="rounded-xl bg-[#111827] border border-white/[0.06] px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <p className="text-slate-300 text-xs leading-relaxed min-w-0">{mp.description}</p>
                    <button className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a2236] border border-white/[0.08] text-slate-400 hover:text-slate-200 text-[11px] transition-colors">
                      {mp.action === "request" ? (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      )}
                      {mp.actionLabel}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── 🚀 Next Steps ───────────────────────────────── */}
          {intelligence.nextSteps && intelligence.nextSteps.length > 0 && (
            <section className="pt-5">
              <div className="flex items-center gap-1.5 mb-2.5">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase">Next Steps</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {intelligence.nextSteps.map((step, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-[#111827] border border-white/[0.06] px-4 py-3 flex items-start gap-2.5"
                  >
                    <span className="w-4 h-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-[9px] font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-slate-300 text-xs leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Semantic Insights (collapsed by default) ────── */}
          {rawInsights.length > 0 && (
            <SemanticInsights insights={rawInsights} />
          )}

          {/* Footer */}
          {hasContent && (
            <div className="mt-auto pt-4 flex items-center justify-between text-[10px] text-slate-600 shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Live Intelligence Engine
              </span>
              <span>RAG + LLM</span>
            </div>
          )}
        </div>
      ) : (
        /* ── Tab: Knowledge Graph ─────────────────────────── */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-1">
          <KnowledgeGraphVisualizer
            graph={knowledgeGraph || null}
            isLoading={isSynthesizing}
            onRefresh={onRefreshGraph}
          />
        </div>
      )}

      {/* ── Evidence Modal ────────────────────────────────── */}
      {viewingEvidence && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setViewingEvidence(null)}
        >
          <div
            className="bg-[#111827] border border-white/10 rounded-2xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm">Dispute Evidence</h3>
              <button
                onClick={() => setViewingEvidence(null)}
                className="text-slate-500 hover:text-white text-xs transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">{viewingEvidence.label}</p>
            <div className="flex flex-col gap-2">
              <div className="rounded-lg bg-[#161d2e] border border-violet-500/20 px-3.5 py-3">
                <div className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider mb-1">Side A · {viewingEvidence.sideA.count} members</div>
                <p className="text-slate-200 text-xs">{viewingEvidence.sideA.label}</p>
              </div>
              <div className="rounded-lg bg-[#161d2e] border border-rose-500/20 px-3.5 py-3">
                <div className="text-[10px] text-rose-400 font-semibold uppercase tracking-wider mb-1">Side B · {viewingEvidence.sideB.count} members</div>
                <p className="text-slate-200 text-xs">{viewingEvidence.sideB.label}</p>
              </div>
            </div>
            <button
              onClick={() => setViewingEvidence(null)}
              className="w-full py-2 rounded-xl bg-[#1e2536] hover:bg-[#263050] text-slate-200 text-xs font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Semantic Insights — collapsible section ────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  consensus:   { label: "Consensus",   color: "text-emerald-400", dot: "bg-emerald-400" },
  debate:      { label: "Debate",      color: "text-amber-400",   dot: "bg-amber-400"   },
  blocker:     { label: "Blocker",     color: "text-rose-400",    dot: "bg-rose-400"    },
  decision:    { label: "Decision",    color: "text-purple-400",  dot: "bg-purple-400"  },
  action_item: { label: "Action",      color: "text-teal-400",    dot: "bg-teal-400"    },
};

function SemanticInsights({ insights }: { insights: Insight[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="pt-5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 mb-2.5 w-full text-left group"
      >
        <svg
          className={`w-3 h-3 text-slate-500 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[11px] font-bold text-slate-400 tracking-wide uppercase group-hover:text-slate-300 transition-colors">
          Semantic Insights ({insights.length})
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-1.5">
          {insights.map((ins) => {
            const cfg = TYPE_CONFIG[ins.type] || { label: ins.type, color: "text-slate-400", dot: "bg-slate-400" };
            const pct = Math.round(ins.confidence * 100);
            return (
              <div
                key={ins.insight_id}
                className="rounded-xl bg-[#111827] border border-white/[0.06] px-4 py-3 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <span className="text-[10px] text-slate-600">{pct}% conf.</span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">{ins.text}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
