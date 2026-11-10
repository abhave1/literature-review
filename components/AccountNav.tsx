'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BOTS, botForPath, canonicalBotId, isInternalRoute, projectForBot } from '@/lib/auth/access';

// Where you are, as a path back to the workspace: Research Bot / Project / Bot.
function trail(path: string): { label: string; tag?: string }[] {
  if (path === '/admin') return [{ label: 'Admin' }];
  const route = botForPath(path);
  if (!route) return [];
  const bot = canonicalBotId(route);
  const project = projectForBot(bot);
  return [
    { label: project },
    { label: BOTS.find(item => item.id === bot)?.name ?? bot, tag: isInternalRoute(route) ? 'Internal' : undefined },
  ];
}

export default function AccountNav() {
  const path = usePathname();
  if (path === '/login' || path === '/home') return null;
  const crumbs = trail(path);
  return <nav aria-label="Account" className="flex items-center justify-between gap-4 border-b border-[#e1e4de] bg-white px-6 py-3 text-sm text-[#5d636c]">
    <ol aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
      <li><Link href="/bots" className="flex items-center gap-2.5 font-semibold tracking-tight text-[#0e1013]">
        <span aria-hidden="true" className="h-2 w-2 bg-[#b6ea3c]" />Research Bot
      </Link></li>
      {crumbs.map((crumb, index) => <li key={crumb.label} className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="text-[#cdd2c9]">/</span>
        <span aria-current={index === crumbs.length - 1 ? 'page' : undefined} className={index === crumbs.length - 1 ? 'truncate font-medium text-[#0e1013]' : 'whitespace-nowrap'}>{crumb.label}</span>
        {crumb.tag && <span className="rounded border border-[#d9eca3] bg-[#f5f9e8] px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-[#3f5f06]">{crumb.tag}</span>}
      </li>)}
    </ol>
    <form action="/auth/signout" method="post" className="flex-shrink-0"><button className="rounded px-3 py-1 font-mono text-xs uppercase tracking-widest transition-colors hover:bg-[#f3f4f1] hover:text-[#0e1013]">Sign out</button></form>
  </nav>;
}
