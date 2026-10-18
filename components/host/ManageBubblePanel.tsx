"use client";

import React, { useState, useEffect } from "react";
import type { Bubble } from "@/types";
import { formatExpiry } from "@/lib/sample-data";

interface Props {
  bubble: Bubble;
  onClose: () => void;
  onToggleAnonymous: () => void;
  onExtendExpiry: () => void;
}

export function ManageBubblePanel({
  bubble,
  onClose,
  onToggleAnonymous,
  onExtendExpiry,
}: Props) {
  // Compute expiry client-side dynamically to update while the page is open
  const [expiryLabel, setExpiryLabel] = useState<string>(() => formatExpiry(bubble.expiresAt));
  const [prevExpiresAt, setPrevExpiresAt] = useState(bubble.expiresAt);
  if (bubble.expiresAt !== prevExpiresAt) {
    setPrevExpiresAt(bubble.expiresAt);
    setExpiryLabel(formatExpiry(bubble.expiresAt));
  }
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setExpiryLabel(formatExpiry(bubble.expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [bubble.expiresAt]);

  const handleCopyInviteLink = () => {
    const inviteUrl = typeof window !== "undefined"
      ? `${window.location.origin}/join?code=${bubble.id}`
      : `/join?code=${bubble.id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(inviteUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-14 right-4 z-50 w-[360px] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl bg-[#111827] border border-white/10 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔧</span>
            <h2 className="text-white font-semibold">Manage Bubble</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-6 p-5">
          {/* Anonymous Mode */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-white text-sm font-medium">
                Anonymous Mode{" "}
                <span className={`text-xs font-normal ${bubble.anonymousModeEnabled ? "text-violet-400" : "text-slate-400"}`}>
                  ({bubble.anonymousModeEnabled ? "ON" : "OFF"})
                </span>
              </span>
              {/* Toggle switch */}
              <button
                onClick={onToggleAnonymous}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  bubble.anonymousModeEnabled ? "bg-violet-600" : "bg-slate-700"
                }`}
                aria-label="Toggle anonymous mode"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    bubble.anonymousModeEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Only affects new contributions. Previously anonymous contributions will remain anonymous. Host cannot identify authors.
            </p>
          </section>

          {/* Retention Policy */}
          <section className="flex flex-col gap-2">
            <h3 className="text-white text-sm font-medium">Retention Policy</h3>
            <div className="rounded-xl border border-white/10 bg-[#1a2236] p-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
                </svg>
                <span className="text-white text-sm font-medium">Temporary Bubble + Decision Record</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
                </svg>
                <span className="text-slate-400 text-xs">Retention policy locked</span>
              </div>
              <p className="text-slate-500 text-xs mt-1">
                Selected when the Bubble was created. Locked after the first contribution.
              </p>
            </div>
          </section>

          {/* Expiry Settings */}
          <section className="flex flex-col gap-2">
            <h3 className="text-white text-sm font-medium">Expiry Settings</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-slate-300 text-sm">
                Auto-expires in:{" "}
                <span className="text-white font-medium">{expiryLabel || "…"}</span>
              </span>
              <button
                onClick={onExtendExpiry}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 bg-[#1a2236] text-slate-300 text-xs hover:bg-[#243050] transition-colors"
              >
                + 30m
              </button>
              <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 bg-[#1a2236] text-slate-300 text-xs hover:bg-[#243050] transition-colors">
                Extend ▾
              </button>
            </div>
          </section>

          {/* Members & Invitations */}
          <section className="flex flex-col gap-2">
            <h3 className="text-white text-sm font-medium">Members &amp; Invitations</h3>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {bubble.members.slice(0, 4).map((m) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={m.id}
                      src={m.avatar}
                      alt={m.name}
                      className="w-7 h-7 rounded-full border-2 border-[#111827] bg-slate-700"
                    />
                  ))}
                </div>
                <span className="text-slate-300 text-sm">{bubble.memberCount} Active Members</span>
              </div>
              <button
                onClick={handleCopyInviteLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-[#1a2236] text-slate-300 text-xs hover:bg-[#243050] transition-colors shrink-0"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-green-400 font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy Invite Link</span>
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Decision Record */}
          <section className="flex flex-col gap-2">
            <h3 className="text-white text-sm font-medium">
              Decision Record{" "}
              <span className="text-slate-400 font-normal">(New / Updated)</span>
            </h3>
            <div className="rounded-xl border border-white/10 bg-[#1a2236] p-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span>📝</span>
                  <span className="text-white text-sm font-medium">Review Record Preview</span>
                </div>
                <p className="text-slate-400 text-xs">(Contains: Conclusion, Supporting Dissenting views, Risks, Next steps)</p>
              </div>
              <button className="px-3 py-1.5 rounded-lg bg-[#0d1117] border border-white/10 text-white text-xs font-medium hover:bg-slate-800 transition-colors shrink-0">
                Preview &amp; Approve
              </button>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="flex flex-col gap-2">
            <h3 className="text-white text-sm font-medium">Danger Zone</h3>
            <button className="w-full flex flex-col items-center justify-center gap-0.5 px-4 py-3 rounded-xl border border-rose-500/50 bg-rose-900/20 text-rose-400 hover:bg-rose-900/30 transition-colors">
              <span className="flex items-center gap-2 font-medium text-sm">
                ⚠️ Close or Delete Bubble
              </span>
              <span className="text-rose-500 text-xs">Action cannot be undone.</span>
            </button>
          </section>

          {/* Demo disclaimer */}
          <p className="text-xs text-slate-600 italic border-t border-white/5 pt-3">
            ⚠️ Demo only — none of these controls affect real data.
          </p>
        </div>
      </div>
    </>
  );
}
