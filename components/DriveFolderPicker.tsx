'use client';

import { useState } from 'react';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface DriveFolderPickerProps {
  onFolderSelected: (folderId: string, folderName: string) => void;
  onDisconnect?: () => void;
  connectionStatus: ConnectionStatus;
  connectedFolderName?: string;
  error?: string;
}

export default function DriveFolderPicker({
  onFolderSelected,
  onDisconnect,
  connectionStatus,
  connectedFolderName,
  error,
}: DriveFolderPickerProps) {
  const [folderInput, setFolderInput] = useState('');
  const [inputError, setInputError] = useState('');

  // Extract folder ID from URL or use raw ID
  const extractFolderId = (input: string): string | null => {
    const trimmed = input.trim();

    // Direct folder ID (alphanumeric with underscores/dashes)
    if (/^[a-zA-Z0-9_-]+$/.test(trimmed) && trimmed.length > 10) {
      return trimmed;
    }

    // Google Drive folder URL patterns
    // https://drive.google.com/drive/folders/FOLDER_ID
    // https://drive.google.com/drive/u/0/folders/FOLDER_ID
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) {
      return folderMatch[1];
    }

    return null;
  };

  const handleConnect = () => {
    setInputError('');

    if (!folderInput.trim()) {
      setInputError('Please enter a folder ID or URL');
      return;
    }

    const folderId = extractFolderId(folderInput);
    if (!folderId) {
      setInputError('Invalid folder ID or URL. Please enter a valid Google Drive folder link or ID.');
      return;
    }

    // Pass the folder ID - the parent component handles OAuth flow
    onFolderSelected(folderId, '');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && connectionStatus !== 'connecting') {
      handleConnect();
    }
  };

  // Connected state
  if (connectionStatus === 'connected' && connectedFolderName) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Google Drive Connected
          </h2>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Google Drive folder icon */}
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.71 3.5L1.15 15l4.58 8h13.54l4.58-8L17.29 3.5H7.71zm-.53 1h10.64l5.14 9H2.04l5.14-9zm5.32 2.5L7.36 14h10.28L12.5 7z"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate" title={connectedFolderName}>
                  {connectedFolderName}
                </p>
                <p className="text-xs text-green-600">Connected and ready to sync</p>
              </div>
            </div>
            {onDisconnect && (
              <button
                onClick={onDisconnect}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Change Folder
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Input/connecting state
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.71 3.5L1.15 15l4.58 8h13.54l4.58-8L17.29 3.5H7.71zm-.53 1h10.64l5.14 9H2.04l5.14-9zm5.32 2.5L7.36 14h10.28L12.5 7z"/>
          </svg>
          Connect Google Drive Folder
        </h2>
        <p className="text-sm text-gray-500 mt-1">Enter a Google Drive folder URL or ID to sync files.</p>
      </div>

      <div className="p-6 space-y-4">
        <div>
          <label htmlFor="folderInput" className="block text-sm font-medium text-gray-700 mb-2">
            Folder URL or ID
          </label>
          <div className="flex gap-3">
            <input
              id="folderInput"
              type="text"
              value={folderInput}
              onChange={(e) => {
                setFolderInput(e.target.value);
                setInputError('');
              }}
              onKeyDown={handleKeyDown}
              placeholder="https://drive.google.com/drive/folders/... or folder ID"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
              disabled={connectionStatus === 'connecting'}
            />
            <button
              onClick={handleConnect}
              disabled={connectionStatus === 'connecting'}
              className={`
                px-6 py-3 rounded-lg font-semibold text-white transition-all flex items-center gap-2
                ${connectionStatus === 'connecting'
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:scale-95'
                }
              `}
            >
              {connectionStatus === 'connecting' ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Connect
                </>
              )}
            </button>
          </div>
        </div>

        {/* Input error */}
        {inputError && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-yellow-800">{inputError}</p>
          </div>
        )}

        {/* Connection error */}
        {(connectionStatus === 'error' || error) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800">Connection Failed</p>
              <p className="text-sm text-red-700 mt-1">{error || 'Unable to connect to Google Drive. Please check the folder ID and try again.'}</p>
            </div>
          </div>
        )}

        {/* Help text */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
          <p className="text-sm text-gray-600 font-medium mb-2">How to find your folder ID:</p>
          <ol className="text-sm text-gray-500 space-y-1 list-decimal list-inside">
            <li>Open your Google Drive folder in a browser</li>
            <li>Copy the URL from the address bar</li>
            <li>Paste it above, or use just the folder ID from the URL</li>
          </ol>
          <p className="text-xs text-gray-400 mt-3">
            Example: https://drive.google.com/drive/folders/<span className="font-mono bg-gray-200 px-1 rounded">1ABC123xyz</span>
          </p>
        </div>
      </div>
    </div>
  );
}
