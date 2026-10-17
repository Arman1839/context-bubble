"use client";

import React, { useState, useEffect } from "react";
import type { Contribution } from "@/types";

interface Props {
  contribution: Contribution;
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

export function ContributionCard({ contribution }: Props) {
  const isAnon = contribution.isAnonymous;

  // Compute relative timestamp dynamically on client
  const [timeAgo, setTimeAgo] = useState<string>("");

  useEffect(() => {
    setTimeAgo(computeTimeAgo(contribution.timestamp));
    const timer = setInterval(() => setTimeAgo(computeTimeAgo(contribution.timestamp)), 5000);
    return () => clearInterval(timer);
  }, [contribution.timestamp]);

  return (
    <div
      className={`rounded-xl p-3.5 flex gap-3 border transition-colors ${
        isAnon
          ? "bg-[#1a1f2e] border-slate-600/40"
          : "bg-[#161d2e] border-white/5 hover:border-white/10"
      }`}
    >
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        {isAnon ? (
          <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-400">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>
        ) : (
          <img
            src={contribution.authorAvatar}
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
                isAnon ? "text-slate-400" : "text-violet-300"
              }`}
            >
              {contribution.authorName}
            </span>
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
        {contribution.attachments && contribution.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {contribution.attachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d1117] border border-white/10 text-slate-300 text-xs"
              >
                {att.type === "link" && (
                  <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
                    </svg>
                  </div>
                )}
                {att.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
