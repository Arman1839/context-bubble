"use client";

import React, { useState } from "react";
import { signInWithGoogle, signInWithName, type AppUser } from "@/lib/auth";

interface Props {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: (user: AppUser) => void;
  title?: string;
  subtitle?: string;
  isInline?: boolean;
}

export function AuthModal({
  isOpen = true,
  onClose,
  onSuccess,
  title = "Sign In to Context Bubble",
  subtitle = "Choose your identity beforehand to enter the workspace.",
  isInline = false,
}: Props) {
  const [name, setName] = useState("");
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingName, setLoadingName] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewAvatar = name.trim()
    ? `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name.trim())}&backgroundColor=b6e3f4`
    : `https://api.dicebear.com/9.x/notionists/svg?seed=guest&backgroundColor=b6e3f4`;

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoadingGoogle(true);
    try {
      const user = await signInWithGoogle();
      setLoadingGoogle(false);
      onSuccess?.(user);
      onClose?.();
    } catch (err: any) {
      console.warn("Google sign in notice:", err);
      setError(err?.message || "Google sign in was unsuccessful.");
      setLoadingGoogle(false);
    }
  };

  const handleNameSignIn = async (e?: React.FormEvent, customName?: string) => {
    if (e) e.preventDefault();
    const finalName = (customName || name).trim();
    if (!finalName) {
      setError("Please enter your display name to continue.");
      return;
    }
    setError(null);
    setLoadingName(true);
    try {
      const user = await signInWithName(finalName);
      setLoadingName(false);
      onSuccess?.(user);
      onClose?.();
    } catch (err: any) {
      setError(err?.message || "Sign in failed.");
      setLoadingName(false);
    }
  };

  const content = (
    <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 sm:p-7 shadow-2xl flex flex-col gap-5 max-w-md w-full relative">
      {/* Close button if modal */}
      {!isInline && onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          title="Close"
        >
          ✕
        </button>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
            C
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{subtitle}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs text-amber-200 flex items-start gap-2.5 leading-relaxed">
          <span className="text-base leading-none shrink-0">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Primary Option: Instant Name Sign-In */}
      <form onSubmit={(e) => handleNameSignIn(e)} className="flex flex-col gap-3.5">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Enter Your Display Name
        </label>
        <div className="flex items-center gap-3 bg-[#161d2e] border border-white/10 rounded-xl p-2.5 focus-within:border-violet-500/50 transition-colors">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewAvatar}
            alt="Avatar"
            className="w-10 h-10 rounded-full border border-white/10 bg-slate-800 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Alex Rivera, Host, etc."
              className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              autoFocus={!isInline}
            />
          </div>
        </div>

        {/* Quick Persona Chips for Testing */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-slate-400">Quick fill:</span>
          <button
            type="button"
            onClick={() => {
              setName("Priya (Host)");
              setError(null);
            }}
            className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-300 transition-colors"
          >
            ⚡ Priya (Host)
          </button>
          <button
            type="button"
            onClick={() => {
              setName("Arjun (Participant)");
              setError(null);
            }}
            className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 transition-colors"
          >
            ⚡ Arjun (Participant)
          </button>
        </div>

        <button
          type="submit"
          disabled={!name.trim() || loadingName || loadingGoogle}
          className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm shadow-lg shadow-violet-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
        >
          {loadingName ? (
            <>
              <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Authenticating...</span>
            </>
          ) : (
            <span>Continue as {name.trim() || "Yourself"} &rarr;</span>
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-1">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Or use Google</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Secondary Option: Google Sign In */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loadingGoogle || loadingName}
        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-white/10 bg-[#161d2e] hover:bg-[#1c263c] text-slate-200 text-xs font-medium shadow-sm transition-all disabled:opacity-50"
      >
        {loadingGoogle ? (
          <svg className="w-4 h-4 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
        )}
        <span>Sign in with Google</span>
      </button>
    </div>
  );

  if (isInline) {
    return content;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      {content}
    </div>
  );
}
