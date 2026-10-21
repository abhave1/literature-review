'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AccountNav() {
  const path = usePathname();
  if (path === '/login') return null;
  return <nav aria-label="Account" className="flex items-center justify-between border-b border-[#e1e4de] bg-white px-6 py-3 text-sm text-[#5d636c]">
    <Link href="/bots" className="flex items-center gap-2.5 font-semibold tracking-tight text-[#0e1013]">
      <span aria-hidden="true" className="h-2 w-2 bg-[#b6ea3c]" />Research Bot
    </Link>
    <form action="/auth/signout" method="post"><button className="rounded px-3 py-1 font-mono text-xs uppercase tracking-widest transition-colors hover:bg-[#f3f4f1] hover:text-[#0e1013]">Sign out</button></form>
  </nav>;
}
