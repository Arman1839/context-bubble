"use client";

import React from "react";
import type { Attachment } from "@/types";

export function DocumentPreview({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const mime = attachment.mime_type || "";
  const isImage = attachment.type === "image" || mime.startsWith("image/");
  const isAudio = attachment.type === "audio" || mime.startsWith("audio/");
  const isVideo = mime.startsWith("video/");
  const isInlineDocument = mime === "application/pdf" || mime.startsWith("text/");

  return (
    <div role="presentation" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`Preview ${attachment.label}`} className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111827] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{attachment.label}</h2>
          {attachment.url && <a href={attachment.url} download className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:text-white">Download</a>}
          <button type="button" onClick={onClose} aria-label="Close preview" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white">✕</button>
        </header>
        <div className="min-h-[280px] flex-1 overflow-auto bg-[#0d0f1a] p-3">
          {isImage && attachment.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachment.url} alt={attachment.label} className="mx-auto max-h-[75vh] max-w-full object-contain" />
          ) : isAudio && attachment.url ? (
            <div className="grid min-h-[280px] place-items-center"><audio controls src={attachment.url} className="w-full max-w-xl" /></div>
          ) : isVideo && attachment.url ? (
            <video controls src={attachment.url} className="mx-auto max-h-[75vh] max-w-full" />
          ) : attachment.url && mime === "application/pdf" ? (
            <iframe title={attachment.label} src={attachment.url} className="h-[72vh] w-full rounded-lg bg-white" />
          ) : attachment.preview_text ? (
            <pre className="mx-auto max-w-3xl whitespace-pre-wrap break-words p-5 font-mono text-xs leading-relaxed text-slate-200">{attachment.preview_text}</pre>
          ) : attachment.url && isInlineDocument ? (
            <iframe title={attachment.label} src={attachment.url} className="h-[72vh] w-full rounded-lg bg-white" />
          ) : (
            <div className="grid min-h-[280px] place-items-center text-center text-sm text-slate-400">
              <p>This format can’t be previewed in the browser. The file is still available to download here.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
