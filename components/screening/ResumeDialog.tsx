'use client';

import React from 'react';
import type { CheckpointInfo } from '@/lib/screening/checkpoint-manager';
import Modal, { ModalFacts } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface ResumeDialogProps {
  checkpoint: CheckpointInfo;
  onResume: () => void;
  onDiscard: () => void;
  onStartFresh: () => void;
  isLoading?: boolean;
}

export default function ResumeDialog({
  checkpoint,
  onResume,
  onDiscard,
  onStartFresh,
  isLoading = false,
}: ResumeDialogProps) {
  const progress = Math.round((checkpoint.completedItems / checkpoint.totalItems) * 100);
  const remaining = checkpoint.totalItems - checkpoint.completedItems;

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return isoString;
    }
  };

  return (
    <Modal
      title="Resume previous session?"
      description="An incomplete screening batch was found."
      busy={isLoading}
      onClose={onStartFresh}
      icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v5h5M20 20v-5h-5" /><path d="M5.6 15a7 7 0 0 0 12.3 1.5M18.4 9A7 7 0 0 0 6.1 7.5" /></svg>}
      footer={<>
        <Button onClick={onDiscard} disabled={isLoading} className="mr-auto text-red-700 hover:enabled:border-red-700 hover:enabled:text-red-800">Discard</Button>
        <Button onClick={onStartFresh} disabled={isLoading}>Start fresh</Button>
        <Button variant="primary" onClick={onResume} disabled={isLoading}>{isLoading ? 'Loading…' : 'Resume'}</Button>
      </>}
    >
      <ModalFacts rows={[
        ['File', checkpoint.fileName],
        ['Started', formatDate(checkpoint.timestamp)],
        ['Progress', `${checkpoint.completedItems} / ${checkpoint.totalItems} articles`],
      ]} />
      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-lime transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2.5 text-[13px] text-gray-500"><span className="font-medium text-gray-900">{remaining} articles</span> left to screen ({progress}% done). Resuming continues where you left off.</p>
      </div>
    </Modal>
  );
}
