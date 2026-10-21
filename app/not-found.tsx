import Link from 'next/link';
import StatusCard from '@/components/ui/StatusCard';

export default function NotFound() {
  return <StatusCard code="404" title="Page not found">
    <p className="mt-3 text-[15px] leading-relaxed text-gray-600">This page doesn’t exist or has moved. Your bots are all in your workspace.</p>
    <Link href="/bots" className="mt-7 inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-5 py-3 text-[15px] font-medium text-white transition-colors hover:bg-gray-700">Go to workspace</Link>
  </StatusCard>;
}
