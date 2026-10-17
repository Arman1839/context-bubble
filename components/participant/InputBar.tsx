"use client";

import React, { useState, useRef, useEffect } from "react";

interface Props {
  isAnonymous: boolean;
  onToggleAnonymous?: () => void;
  onSubmit: (text: string) => void;
}

export function InputBar({ isAnonymous, onToggleAnonymous, onSubmit }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text]);

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="border border-white/10 rounded-xl bg-[#161d2e] overflow-hidden">
      {/* Anonymous mode banner */}
      <div
        onClick={onToggleAnonymous}
        className={`flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#1a2236] select-none ${
          onToggleAnonymous ? "cursor-pointer hover:bg-[#202942] transition-colors" : ""
        }`}
        title={onToggleAnonymous ? "Click to toggle Anonymous Mode" : undefined}
      >
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z" />
          </svg>
          <p className="text-slate-400 text-xs">
            Anonymous mode is{" "}
            <span className={`font-bold ${isAnonymous ? "text-violet-400" : "text-white"}`}>
              {isAnonymous ? "ON" : "OFF"}
            </span>
            {" — "}
            {isAnonymous
              ? "your name will be hidden from other participants."
              : "your new contributions will show your name."}
          </p>
        </div>
        {onToggleAnonymous && (
          <span className="text-[10px] text-slate-400 font-medium px-1.5 py-0.5 rounded bg-slate-800/80 border border-white/5">
            {isAnonymous ? "Turn OFF" : "Turn ON"}
          </span>
        )}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Share a thought, concern, or piece of evidence..."
        rows={2}
        className="w-full bg-transparent px-4 py-3 text-slate-200 placeholder-slate-500 text-sm resize-none focus:outline-none min-h-[60px] max-h-[200px]"
      />

      {/* Action row */}
      <div className="flex items-center justify-end gap-2 px-3 pb-3">
        {/* Image upload (demo only) */}
        <button
          title="Attach image (coming soon)"
          className="w-9 h-9 rounded-lg border border-white/10 bg-[#0d1117] flex items-center justify-center text-slate-400 hover:text-slate-200 hover:border-white/20 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" />
            <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="2" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 15-5-5L5 21" />
          </svg>
        </button>

        {/* Voice (demo only) */}
        <button
          title="Voice note (coming soon)"
          className="w-9 h-9 rounded-lg border border-white/10 bg-[#0d1117] flex items-center justify-center text-slate-400 hover:text-slate-200 hover:border-white/20 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93H2c0 4.97 3.63 9.11 8.49 9.87V21h3v-2.2C18.37 18.11 22 13.97 22 9h-2c0 4.08-3.06 7.44-7 7.93V16z" />
          </svg>
        </button>

        {/* Send */}
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
