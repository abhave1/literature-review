'use client';

import React from 'react';
import type { ScreeningResult, ScreeningDecision } from '@/lib/screening/response-parser';

interface ScreeningProgressProps {
  total: number;
  completed: number;
  currentArticle?: string;
  results: ScreeningResult[];
  isProcessing: boolean;
}

const DECISION_STYLES: Record<ScreeningDecision, { bg: string; text: string; icon: string }> = {
  Include: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    icon: 'M5 13l4 4L19 7',
  },
  Exclude: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    icon: 'M6 18L18 6M6 6l12 12',
  },
  NoAbstract: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  },
};

export default function ScreeningProgress({
  total,
  completed,
  currentArticle,
  results,
  isProcessing,
}: ScreeningProgressProps) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Count by decision
  const counts = {
    Include: results.filter((r) => r.decision === 'Include').length,
    Exclude: results.filter((r) => r.decision === 'Exclude').length,
    NoAbstract: results.filter((r) => r.decision === 'NoAbstract').length,
  };

  return (
    <div className="space-y-4">
      {/* Progress Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-black">
          {isProcessing ? 'Screening articles...' : 'Screening progress'}
        </span>
        <span className="text-sm font-medium text-blue-600">
          {completed} / {total} complete
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Decision Summary */}
      {results.length > 0 && (
        <div className="flex items-center gap-4">
          {(Object.keys(counts) as ScreeningDecision[]).map((decision) => {
            const { bg, text } = DECISION_STYLES[decision];
            const count = counts[decision];
            if (count === 0) return null;

            return (
              <div
                key={decision}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${bg} ${text}`}
              >
                <span>{decision}</span>
                <span className="font-bold">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Current Article */}
      {isProcessing && currentArticle && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-600 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm text-blue-700 truncate">
              Processing: {currentArticle}
            </span>
          </div>
        </div>
      )}

    </div>
  );
}
