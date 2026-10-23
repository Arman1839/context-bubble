"use client";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description" className="w-full max-w-md rounded-2xl border border-rose-500/25 bg-[#111827] p-6 shadow-2xl">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300" aria-hidden="true">!</div>
        <h2 id="confirm-dialog-title" className="mt-4 text-lg font-bold text-white">{title}</h2>
        <p id="confirm-dialog-description" className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
        {error && <p role="alert" className="mt-3 rounded-lg border border-rose-500/20 bg-rose-950/30 p-2.5 text-xs text-rose-200">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="cursor-pointer rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">{cancelLabel}</button>
          <button type="button" onClick={() => void onConfirm()} disabled={busy} className="cursor-pointer rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Please wait…" : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
