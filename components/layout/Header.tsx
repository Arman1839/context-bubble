"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import type { Bubble, Role } from "@/types";
import { formatExpiry } from "@/lib/sample-data";

interface Props {
  bubble: Bubble;
  role: Role;
  onToggleRole: () => void;
  onOpenManage: () => void;
}

export function Header({ bubble, role, onToggleRole, onOpenManage }: Props) {
  // Compute expiry client-side dynamically to update while the page is open
  const [expiryLabel, setExpiryLabel] = useState<string>(() => formatExpiry(bubble.expiresAt));
  const [prevExpiresAt, setPrevExpiresAt] = useState(bubble.expiresAt);
  if (bubble.expiresAt !== prevExpiresAt) {
    setPrevExpiresAt(bubble.expiresAt);
    setExpiryLabel(formatExpiry(bubble.expiresAt));
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setExpiryLabel(formatExpiry(bubble.expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [bubble.expiresAt]);

  return (
    <header className="flex items-center gap-4 px-5 py-3 bg-[#111827] border-b border-white/10 shrink-0">
      {/* Logo + wordmark */}
      <Link
        href="/"
        className="flex items-center gap-2 min-w-[140px] group hover:opacity-90 transition-opacity"
        title="Return to Home"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-105 transition-transform">
          C
        </div>
        <span className="font-semibold text-white text-sm tracking-wide">Context Bubble</span>
      </Link>

      {/* Session title + live badge */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <h1 className="text-white font-semibold text-base truncate">{bubble.title}</h1>
        {bubble.isLive && (
          <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium shrink-0">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Members */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex -space-x-2">
          {bubble.members.slice(0, 5).map((m) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={m.id}
              src={m.avatar}
              alt={m.name}
              className="w-7 h-7 rounded-full border-2 border-[#111827] bg-slate-700"
            />
          ))}
          {bubble.memberCount > 5 && (
            <span className="w-7 h-7 rounded-full border-2 border-[#111827] bg-slate-600 flex items-center justify-center text-white text-[10px] font-bold">
              +{bubble.memberCount - 5}
            </span>
          )}
        </div>
        <span className="text-slate-400 text-xs">{bubble.memberCount} members active</span>
      </div>

      {/* Expiry — rendered after client hydration to avoid Date.now() prerender issue */}
      {expiryLabel && (
        <div className="hidden md:flex items-center gap-1.5 text-slate-400 text-xs shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6l4 2" />
          </svg>
          Auto-expires in {expiryLabel}
        </div>
      )}

      {/* Role-specific controls */}
      {role === "host" && (
        <button
          onClick={onOpenManage}
          className="ml-2 px-3 py-1.5 rounded-lg bg-[#1e293b] border border-white/10 text-white text-xs font-medium hover:bg-[#293548] transition-colors shrink-0"
        >
          Manage Bubble
        </button>
      )}

      <span
        className={`px-2 py-0.5 rounded text-xs font-bold tracking-widest shrink-0 ${
          role === "host"
            ? "bg-violet-600 text-white"
            : "bg-slate-700 text-slate-300"
        }`}
      >
        {role.toUpperCase()}
      </span>

      {/* Avatar placeholder */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shrink-0" />

      {/* Demo toggle */}
      <button
        onClick={onToggleRole}
        title="Toggle participant / host view (demo only)"
        className="ml-1 px-2 py-1 rounded border border-dashed border-slate-600 text-slate-500 text-[10px] hover:border-violet-500 hover:text-violet-400 transition-colors shrink-0"
      >
        Switch to {role === "host" ? "participant" : "host"}
      </button>
    </header>
  );
}
