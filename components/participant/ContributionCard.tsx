"use client";

import React, { useState, useEffect } from "react";
import type { Contribution } from "@/types";
import { DocumentPreview } from "./DocumentPreview";

interface Props {
  contribution: Contribution;
  hideAttachments?: boolean;
}

function computeTimeAgo(date: Date): string {
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export function ContributionCard({ contribution, hideAttachments = false }: Props) {
  const isAnon = contribution.isAnonymous;
  const isAI = contribution.authorId === "bubble-ai" || contribution.authorName === "Bubble AI";
  const [previewAttachment, setPreviewAttachment] = useState<NonNullable<Contribution["attachments"]>[number] | null>(null);

  // Compute relative timestamp dynamically on client
  const [timeAgo, setTimeAgo] = useState<string>(() => computeTimeAgo(contribution.timestamp));
  const [prevTimestamp, setPrevTimestamp] = useState(contribution.timestamp);
  if (contribution.timestamp !== prevTimestamp) {
    setPrevTimestamp(contribution.timestamp);
    setTimeAgo(computeTimeAgo(contribution.timestamp));
  }

  useEffect(() => {
    const timer = setInterval(() => setTimeAgo(computeTimeAgo(contribution.timestamp)), 5000);
    return () => clearInterval(timer);
  }, [contribution.timestamp]);

  return (
    <div
      className={`rounded-xl p-3.5 flex gap-3 border transition-colors ${
        isAI
          ? "bg-gradient-to-br from-violet-950/35 via-[#181a2e] to-[#141829] border-violet-500/35 shadow-[0_0_20px_rgba(139,92,246,0.08)]"
          : isAnon
          ? "bg-[#1a1f2e] border-slate-600/40"
          : "bg-[#161d2e] border-white/5 hover:border-white/10"
      }`}
    >
      {/* Avatar */}
      <div className="relative shrink-0 mt-0.5">
        {isAI ? (
          <div className="w-10 h-10 rounded-full bg-violet-600/20 border border-violet-400/40 flex items-center justify-center text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.3)]">
            <svg className="w-5 h-5 text-violet-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7H11V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5 2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0-2.5-2.5" />
            </svg>
          </div>
        ) : isAnon ? (
          <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-400">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>
        ) : contribution.authorAnimal ? (
          <div className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-slate-800 text-2xl" role="img" aria-label={`${contribution.authorName}'s animal avatar`}>
            {contribution.authorAnimal}
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={contribution.authorAvatar || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(contribution.authorId || contribution.authorName)}`}
            alt={contribution.authorName}
            className="w-10 h-10 rounded-full bg-slate-700 object-cover"
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm font-semibold ${
                isAI ? "text-violet-300 font-bold" : isAnon ? "text-slate-400" : "text-violet-200"
              }`}
            >
              {contribution.authorName}
            </span>
            {isAI && (
              <span className="flex items-center gap-1 text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded px-1.5 py-0.2 font-medium">
                <svg className="w-2.5 h-2.5 text-violet-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L9.5 8.5L3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5L12 2z" />
                </svg>
                AI Participant
              </span>
            )}
            {timeAgo && (
              <span className="text-slate-500 text-xs">• {timeAgo}</span>
            )}
          </div>
          {isAnon && (
            <span className="flex items-center gap-1 text-slate-500 text-[10px] bg-slate-800 rounded px-1.5 py-0.5 border border-slate-700">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
              Anonymous
            </span>
          )}
        </div>

        {/* Text */}
        <p className="text-slate-200 text-sm leading-relaxed">{contribution.text}</p>

        {/* Attachments */}
        {!hideAttachments && contribution.attachments && contribution.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {contribution.attachments.map((att, i) => (
              att.type === "link" ? <a key={i} href={att.url || undefined} target={att.url ? "_blank" : undefined} rel={att.url ? "noopener noreferrer" : undefined} className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-300 hover:border-violet-400/50 hover:text-white" aria-label={att.label}>
                {att.type === "link" && (
                  <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
                    </svg>
                  </div>
                )}
                {att.label}
              </a> : <button key={i} type="button" onClick={() => setPreviewAttachment(att)} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-300 hover:border-violet-400/50 hover:text-white" aria-label={`Preview uploaded file ${att.label}`}>
                {att.type === "image" && att.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={att.url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                ) : <span aria-hidden="true">{att.type === "audio" ? "🎙️" : "📄"}</span>}
                <span>{att.label}</span>
                <span className="text-[10px] text-violet-300">Preview</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {previewAttachment && <DocumentPreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />}
    </div>
  );
}
