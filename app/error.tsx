'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import StatusCard from '@/components/ui/StatusCard';

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const digest = error instanceof Error && 'digest' in error ? String(error.digest) : null;
  return <StatusCard code="Error" title="Something went wrong">
    <p className="mt-3 text-[15px] leading-relaxed text-gray-600">The page hit an unexpected problem. Try again, or head back to your workspace.</p>
    {digest && <p className="mt-4 font-mono text-xs text-gray-500">Reference {digest}</p>}
    <div className="mt-7 flex gap-3">
      <button onClick={() => retry()} className="flex-1 rounded-lg bg-gray-900 px-5 py-3 text-[15px] font-medium text-white transition-colors hover:bg-gray-700">Try again</button>
      <Link href="/bots" className="flex-1 rounded-lg border border-gray-300 px-5 py-3 text-center text-[15px] font-medium text-gray-900 transition-colors hover:border-gray-900">Workspace</Link>
    </div>
  </StatusCard>;
}
