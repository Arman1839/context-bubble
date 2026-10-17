"use client";

import React, { useState } from "react";
import type { Contribution } from "@/types";
import { ContributionCard } from "./ContributionCard";
import { InputBar } from "./InputBar";

interface Props {
  contributions: Contribution[];
  isAnonymous: boolean;
  onToggleAnonymous?: () => void;
  newCount?: number;
  onNewContribution: (text: string) => void;
}

export function ContributionFeed({
  contributions,
  isAnonymous,
  onToggleAnonymous,
  newCount = 0,
  onNewContribution,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_COUNT = 5;

  const visible = expanded ? contributions : contributions.slice(0, PREVIEW_COUNT);
  const hasMore = contributions.length > PREVIEW_COUNT;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Feed header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h2 className="text-white font-semibold text-base">Live Contributions</h2>
        </div>
        {newCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-[#1e293b] border border-white/10 text-slate-300 text-xs font-medium">
            {newCount} new
          </span>
        )}
      </div>

      {/* Scrollable cards */}
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto min-h-0 pr-0.5">
        {visible.map((c) => (
          <ContributionCard key={c.id} contribution={c} />
        ))}

        {/* Show more */}
        {hasMore && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center justify-center gap-1.5 py-2 text-slate-400 text-xs hover:text-slate-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
            Scroll for more
          </button>
        )}
      </div>

      {/* Input bar */}
      <div className="shrink-0">
        <InputBar
          isAnonymous={isAnonymous}
          onToggleAnonymous={onToggleAnonymous}
          onSubmit={onNewContribution}
        />
      </div>
    </div>
  );
}
