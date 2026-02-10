'use client';

import React from 'react';
import type { CheckpointInfo } from '@/lib/screening/checkpoint-manager';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-black">Resume Previous Session?</h2>
              <p className="text-sm text-gray-600">An incomplete screening batch was found</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Batch Info */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">File:</span>
              <span className="font-medium text-black truncate max-w-[200px]">
                {checkpoint.fileName}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Started:</span>
              <span className="text-black">{formatDate(checkpoint.timestamp)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Progress:</span>
              <span className="text-black">
                {checkpoint.completedItems} / {checkpoint.totalItems} articles ({progress}%)
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Remaining Info */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              <span className="font-medium">{remaining}</span> articles remaining to screen.
              Resuming will continue from where you left off.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 space-y-3">
          <button
            onClick={onResume}
            disabled={isLoading}
            className={`
              w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-colors
              ${isLoading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'}
            `}
          >
            {isLoading ? 'Loading...' : `Resume Screening (${remaining} remaining)`}
          </button>

          <div className="flex gap-3">
            <button
              onClick={onStartFresh}
              disabled={isLoading}
              className={`
                flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors
                ${isLoading
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}
              `}
            >
              Start Fresh
            </button>
            <button
              onClick={onDiscard}
              disabled={isLoading}
              className={`
                flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors
                ${isLoading
                  ? 'bg-red-100 text-red-300 cursor-not-allowed'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'}
              `}
            >
              Discard & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
