import type { ReactNode } from 'react';

// Centered card used by the login, error and not-found pages.
export default function StatusCard({ code, title, children, fullHeight = false }: {
  code?: string; title: string; children: ReactNode; fullHeight?: boolean;
}) {
  return <main className={`grid-backdrop flex items-center justify-center bg-[#f3f4f1] px-4 py-12 text-gray-900 ${fullHeight ? 'min-h-dvh' : 'min-h-[calc(100dvh-53px)]'}`}>
    <section className="w-full max-w-[420px] rounded-2xl border border-gray-200 bg-white shadow-xl" aria-labelledby="status-title">
      <div className="flex items-center justify-between border-b border-gray-200 px-7 py-4">
        <span className="flex items-center gap-2.5 text-sm font-semibold tracking-tight"><span aria-hidden="true" className="h-2 w-2 bg-lime" />Research Bot</span>
        {code && <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-500">{code}</span>}
      </div>
      <div className="px-7 pb-7 pt-8">
        <h1 id="status-title" className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
        {children}
      </div>
    </section>
  </main>;
}
