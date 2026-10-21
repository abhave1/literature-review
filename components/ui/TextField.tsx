import type { InputHTMLAttributes, ReactNode } from 'react';

export default function TextField({ label, valid = false, className = '', ...props }:
  InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; valid?: boolean }) {
  return <label className={`block text-[13px] font-medium text-gray-900 ${className}`}>
    {label}
    <span className="relative mt-2 block">
      <input className={`block w-full rounded-lg border bg-white px-3 py-2.5 text-sm font-normal text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 disabled:bg-gray-50 ${valid ? 'border-lime-ink pr-9 ring-2 ring-lime/40' : 'border-gray-300'}`} {...props} />
      {valid && <svg aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-lime-ink" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>}
    </span>
  </label>;
}
