'use client';

import { useState, useEffect } from 'react';

export type SyncStatus =
  | 'idle'
  | 'connecting'
  | 'listing'
  | 'downloading'
  | 'complete'
  | 'error'
  | 'cancelled';

interface SyncProgress {
  current: number;
  total: number;
  currentFileName?: string;
}

interface DriveSyncButtonProps {
  onSyncStart?: () => void;
  onSyncComplete?: (syncedFiles: string[]) => void;
  onSyncCancel?: () => void;
  onSyncError?: (error: string) => void;
  syncStatus: SyncStatus;
  progress?: SyncProgress;
  error?: string;
  disabled?: boolean;
  onTriggerSync: () => void;
  onCancelSync: () => void;
}

export default function DriveSyncButton({
  onSyncStart,
  onSyncComplete,
  onSyncCancel,
  onSyncError,
  syncStatus,
  progress,
  error,
  disabled = false,
  onTriggerSync,
  onCancelSync,
}: DriveSyncButtonProps) {

  const isActive = ['connecting', 'listing', 'downloading'].includes(syncStatus);
  const isComplete = syncStatus === 'complete';
  const hasError = syncStatus === 'error';
  const isCancelled = syncStatus === 'cancelled';

  const getStatusText = (): string => {
    switch (syncStatus) {
      case 'idle':
        return 'Sync from Google Drive';
      case 'connecting':
        return 'Connecting to Google Drive...';
      case 'listing':
        return 'Listing files in folder...';
      case 'downloading':
        if (progress) {
          return `Downloading ${progress.current} of ${progress.total}`;
        }
        return 'Downloading files...';
      case 'complete':
        return 'Sync Complete';
      case 'error':
        return 'Sync Failed';
      case 'cancelled':
        return 'Sync Cancelled';
      default:
        return 'Sync from Google Drive';
    }
  };

  const getProgressPercentage = (): number => {
    if (!progress || progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  const handleClick = () => {
    if (disabled || isActive) return;
    onTriggerSync();
    onSyncStart?.();
  };

  const handleCancel = () => {
    onCancelSync();
    onSyncCancel?.();
  };

  // Main sync button (idle, complete, cancelled, or error states)
  if (!isActive) {
    return (
      <div className="space-y-3">
        <button
          onClick={handleClick}
          disabled={disabled}
          className={`
            w-full px-6 py-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-3
            ${disabled
              ? 'bg-gray-400 cursor-not-allowed'
              : isComplete
                ? 'bg-green-600 hover:bg-green-700 hover:shadow-lg'
                : hasError || isCancelled
                  ? 'bg-orange-600 hover:bg-orange-700 hover:shadow-lg'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl active:scale-[0.98]'
            }
          `}
        >
          {/* Icon based on state */}
          {isComplete ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : hasError || isCancelled ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.71 3.5L1.15 15l4.58 8h13.54l4.58-8L17.29 3.5H7.71zm-.53 1h10.64l5.14 9H2.04l5.14-9zm5.32 2.5L7.36 14h10.28L12.5 7z"/>
            </svg>
          )}
          <span className="text-lg">{getStatusText()}</span>
        </button>

        {/* Error message */}
        {hasError && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800">Sync Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Success message */}
        {isComplete && progress && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-green-800">Sync Completed Successfully</p>
              <p className="text-sm text-green-700 mt-1">
                {progress.total} file{progress.total !== 1 ? 's' : ''} synced from Google Drive.
              </p>
            </div>
          </div>
        )}

        {/* Cancelled message */}
        {isCancelled && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-yellow-800">Sync Cancelled</p>
              <p className="text-sm text-yellow-700 mt-1">
                {progress ? `${progress.current} of ${progress.total} files were synced before cancellation.` : 'The sync was cancelled before completion.'}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active sync state with progress
  return (
    <div className="bg-white rounded-xl shadow-sm border border-blue-200 overflow-hidden">
      <div className="p-6 space-y-4">
        {/* Status header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">{getStatusText()}</p>
              {progress?.currentFileName && (
                <p className="text-sm text-gray-500 truncate max-w-xs" title={progress.currentFileName}>
                  {progress.currentFileName}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel
          </button>
        </div>

        {/* Progress bar */}
        {syncStatus === 'downloading' && progress && progress.total > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                {progress.current} of {progress.total} files
              </span>
              <span className="font-medium text-blue-600">
                {getProgressPercentage()}%
              </span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>
          </div>
        )}

        {/* Indeterminate progress for connecting/listing */}
        {(syncStatus === 'connecting' || syncStatus === 'listing') && (
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full animate-pulse w-full opacity-60" />
          </div>
        )}
      </div>
    </div>
  );
}
