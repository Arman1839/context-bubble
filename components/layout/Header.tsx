"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import type { Bubble, Role } from "@/types";
import { formatExpiry } from "@/lib/sample-data";
import type { AppUser } from "@/lib/auth";

interface Props {
  bubble: Bubble;
  role: Role;
  onOpenManage: () => void;
  currentUser?: AppUser | null;
  onOpenAuthModal?: () => void;
  onSignOut?: () => void;
}

export function Header({
  bubble,
  role,
  onOpenManage,
  currentUser,
  onOpenAuthModal,
  onSignOut,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [expiryLabel, setExpiryLabel] = useState<string>("");
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);

  useEffect(() => {
    setMounted(true);

    const update = () => {
      setExpiryLabel(formatExpiry(bubble.expiresAt));
      const msLeft = bubble.expiresAt.getTime() - Date.now();
      setIsExpiringSoon(msLeft > 0 && msLeft < 5 * 60 * 1000); // warn when < 5 min
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [bubble.expiresAt]);

  const userDisplayName =
    currentUser?.displayName || (currentUser?.email ? currentUser.email.split("@")[0] : null);

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
              src={m.avatar || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(m.name)}&backgroundColor=b6e3f4`}
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
        <span className="text-slate-400 text-xs">{bubble.memberCount} active</span>
      </div>

      {/* Expiry */}
      {mounted && expiryLabel && (
        <div className={`hidden md:flex items-center gap-1.5 text-xs shrink-0 ${
          isExpiringSoon ? "text-amber-400 font-semibold animate-pulse" : "text-slate-400"
        }`}>
          <svg className={`w-3.5 h-3.5 ${isExpiringSoon ? "text-amber-400" : "text-violet-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6l4 2" />
          </svg>
          {isExpiringSoon && <span className="text-[10px] uppercase tracking-wider">Expiring soon — </span>}
          {expiryLabel}
        </div>
      )}

      {/* Role-specific Host controls */}
      {role === "host" && (
        <button
          onClick={onOpenManage}
          className="ml-2 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 border border-violet-400/30 text-white text-xs font-medium transition-colors shrink-0 shadow-sm"
        >
          Manage Room
        </button>
      )}

      {/* Real Role Badge */}
      <span
        className={`px-2.5 py-1 rounded text-[11px] font-bold tracking-wider shrink-0 ${
          role === "host"
            ? "bg-violet-900/50 border border-violet-500/40 text-violet-200"
            : "bg-slate-800 border border-white/10 text-slate-300"
        }`}
      >
        {role.toUpperCase()}
      </span>

      {/* User Authentication Pill / Sign In Button (mounted-safe to prevent SSR hydration mismatch) */}
      {mounted ? (
        currentUser && userDisplayName ? (
          <div className="flex items-center gap-2 bg-[#1e293b] border border-white/10 rounded-full pl-1.5 pr-2.5 py-1 shrink-0">
            {currentUser.photoURL ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={currentUser.photoURL}
                alt={userDisplayName}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-violet-600/40 text-violet-300 font-bold text-[10px] flex items-center justify-center">
                {userDisplayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-slate-200 text-xs font-medium max-w-[100px] truncate">
              {userDisplayName}
            </span>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="ml-1 text-[11px] text-slate-400 hover:text-rose-400 transition-colors"
                title="Sign out / Switch user"
              >
                Sign out
              </button>
            )}
          </div>
        ) : onOpenAuthModal ? (
          <button
            onClick={onOpenAuthModal}
            className="px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md shadow-violet-900/30 transition-colors shrink-0 flex items-center gap-1.5"
          >
            <span>Sign In</span>
          </button>
        ) : null
      ) : (
        <div className="w-16 h-7" />
      )}
    </header>
  );
}
