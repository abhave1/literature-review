'use client';

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';

// The app's one modal. Native <dialog> gives focus trapping, Escape, and the backdrop;
// mount it to open, unmount it to close. Pass onSubmit to make the body a form.
export default function Modal({ title, description, icon, tone = 'default', busy = false, onClose, onSubmit, footer, children }: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onClose: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  const body = <>
    <header className="flex items-start gap-3.5 px-6 pb-5 pt-6">
      {icon && <span aria-hidden="true" className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg border ${tone === 'danger' ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-900 bg-gray-900 text-lime'}`}>{icon}</span>}
      <div className="min-w-0 flex-1">
        <h2 id={`${id}-title`} className="text-xl font-semibold tracking-[-0.02em] text-gray-900">{title}</h2>
        {description && <p id={`${id}-description`} className="mt-1 break-words text-[13px] text-gray-500">{description}</p>}
      </div>
      <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="-mr-1.5 -mt-1 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </header>
    {children && <div className="space-y-5 px-6 pb-6">{children}</div>}
    {footer && <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-gray-200 bg-gray-50 px-6 py-4">{footer}</footer>}
  </>;
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto w-[min(480px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-gray-900/40 backdrop:backdrop-blur-[2px]">
    {onSubmit ? <form onSubmit={onSubmit}>{body}</form> : body}
  </dialog>;
}

// Bordered key/value rows for summarizing what a modal will act on.
export function ModalFacts({ label, rows, note }: { label?: string; rows: [ReactNode, ReactNode][]; note?: ReactNode }) {
  return <div className="overflow-hidden rounded-lg border border-gray-200">
    {label && <p className="border-b border-gray-200 bg-gray-50 px-3.5 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-gray-500">{label}</p>}
    <dl className="divide-y divide-gray-100 px-3.5">
      {rows.map(([key, value], index) => <div key={index} className="flex justify-between gap-3 py-2 text-[13px]"><dt className="text-gray-500">{key}</dt><dd className="min-w-0 truncate text-right font-medium text-gray-900">{value}</dd></div>)}
    </dl>
    {note && <p className="border-t border-gray-200 px-3.5 py-2.5 text-xs leading-relaxed text-gray-500">{note}</p>}
  </div>;
}
