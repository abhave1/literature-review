'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AccessKeyPrompt from '@/components/AccessKeyPrompt';
import AnalysisResults from '@/components/AnalysisResults';
import FileUpload from '@/components/FileUpload';
import DriveFolderPicker, { ConnectionStatus } from '@/components/DriveFolderPicker';
import DriveSyncButton, { SyncStatus } from '@/components/DriveSyncButton';

interface BlobFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
  name: string;
}

interface SyncProgress {
  current: number;
  total: number;
  currentFileName?: string;
}

interface AnalysisResult {
  fileName: string;
  success: boolean;
  data?: {
    extractedText: string;
    metadata: any;
    analysis: any;
  };
  error?: string;
}

const DEFAULT_ASPECTS = `(1) Does this paper study machine learning methods in the context of automatic text or speech scoring, that is, automatically assigning scores or labels to open-ended responses (e.g., essays, speech) as an alternative to grading by humans?

(2) Does this paper study machine learning methods in the context of discrete or continuous trait scoring, that is, assigning scores or estimates of continuous traits (e.g., proficiency, personality) or discrete classes (e.g., cluster labels, skill mastery)?

(3) Does this paper study machine learning methods in the context of standard setting, that is, establishing specific criteria and cut scores for different levels of proficiency in a particular domain?

(4) Does this paper study machine learning methods in the context of item or instrument development, that is, generation of questions, tasks, or instruments? Exclude applications in the context of shortening existing tests.

(5) Does this paper study machine learning methods in the context of short form construction, that is, selecting a subset of items for a short form to meet specific constraints and/or to optimize some objective?

(6) Does this paper study machine learning methods in the context of item review and analysis, that is, statistical evaluation of a task/question's reliability, validity, and other characteristics (e.g., relevant behavioral evidence)? Exclude applications in the context of differential item functioning or differential rater functioning analyses.

(7) Does this paper study machine learning methods in the context of differential item functioning detection or differential rater functioning detection, that is, flagging subsets of items or raters that function differently across subgroups?

(8) Does this paper study machine learning methods in the context of aberrant response detection, that is, flagging subsets of examinees whose observed data deviates from normal test-taking (e.g., insufficient effort responding or cheating)?

(9) Does this paper study machine learning methods in the context of process data analysis, that is, analysis of computer-logged, time-stamped sequence of actions performed by an examinee (e.g., clickstreams and keystrokes) in pursuit of solving an item?

(10) Does this paper study the application of machine learning methods to choosing among candidate models, including the use of regularization to adjust model capacity, or performing variable selection, often based on model-data fit, predictive performance, and simplicity?

(11) Does this paper study the extension to existing measurement or psychometric models with machine learning methods?

(12) Does this paper study the application of machine learning methods to estimating measurement or psychometric model parameters?

(13) Does this paper study machine learning methods in the context of examining measurement validity based on internal structure, that is, to what extent the relationships among test items and test components conform to the construct being measured?

(14) Does this paper study machine learning methods in the context of examining measurement validity based on test content, that is, relationship between the content of a test (e.g., the themes, wording, and format) and the construct being measured?

(15) Does this paper study machine learning methods in the context of examining measurement validity based on relations to other variables, that is, the relationship of test scores to variables external to the test (e.g., predictive validity, concurrent validity, convergent validity, divergent validity)?

(16) Is the main focus of this paper a CONCEPTUAL discussion of the applications of machine learning methods in measurement practice, that is, reviews and non-technical discussions on the role of machine learning in measurement?

(17) Is the main focus of this paper an overview and tutorials of machine learning without referencing specific measurement contexts?`;

export default function MxMLPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [files, setFiles] = useState<BlobFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  
  // Selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Analysis state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const [totalFilesToProcess, setTotalFilesToProcess] = useState<number>(0);

  // Prompt Inputs
  const [ratedAspects, setRatedAspects] = useState<string>(DEFAULT_ASPECTS);

  // Google Drive Sync state
  const [driveConnectionStatus, setDriveConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectedFolderId, setConnectedFolderId] = useState<string>('');
  const [connectedFolderName, setConnectedFolderName] = useState<string>('');
  const [driveError, setDriveError] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({ current: 0, total: 0 });
  const [syncError, setSyncError] = useState<string>('');
  const [showDriveSync, setShowDriveSync] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Local upload state
  const [showLocalUpload, setShowLocalUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadError, setUploadError] = useState<string>('');

  // 1. Auth Check
  useEffect(() => {
    const storedKey = localStorage.getItem('app_access_key');
    if (storedKey) {
      fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: storedKey }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.valid) setIsAuthenticated(true);
          else localStorage.removeItem('app_access_key');
        })
        .finally(() => setIsCheckingAuth(false));
    } else {
      setIsCheckingAuth(false);
    }
  }, []);

  // 2. Fetch Files (Once Authenticated)
  useEffect(() => {
    if (isAuthenticated) {
      loadFiles();
    }
  }, [isAuthenticated]);

  const loadFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch('/api/mxml-files');
      const data = await res.json();
      if (data.files) {
        setFiles(data.files);
        // Default: Select none (safe default)
        // setSelectedFiles(new Set(data.files.map((f: BlobFile) => f.url)));
      }
    } catch (err) {
      console.error('Failed to load files', err);
      setError('Failed to load file list.');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const toggleFileSelection = (url: string) => {
    const next = new Set(selectedFiles);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    setSelectedFiles(next);
  };

  // Filter files based on search query
  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectAll = () => {
    if (selectedFiles.size === filteredFiles.length && filteredFiles.length > 0) {
      // Deselect only filtered files
      const next = new Set(selectedFiles);
      filteredFiles.forEach(f => next.delete(f.url));
      setSelectedFiles(next);
    } else {
      // Select all filtered files
      const next = new Set(selectedFiles);
      filteredFiles.forEach(f => next.add(f.url));
      setSelectedFiles(next);
    }
  };

  // Google Drive folder selection handler
  const handleFolderSelected = useCallback(async (folderId: string) => {
    setDriveConnectionStatus('connecting');
    setDriveError('');

    try {
      // Test the folder connection by checking Drive status
      const statusRes = await fetch(`/api/drive/status?folderId=${encodeURIComponent(folderId)}&includeFileCount=true`);
      const statusData = await statusRes.json();

      if (!statusRes.ok) {
        throw new Error(statusData.error || 'Failed to connect to folder');
      }

      if (!statusData.authenticated) {
        // Need to authenticate first
        const authRes = await fetch('/api/drive/auth?action=login&popup=true');
        const authData = await authRes.json();

        if (authData.authUrl) {
          // Open OAuth popup
          const popup = window.open(authData.authUrl, 'Google Drive Auth', 'width=600,height=700');

          // Listen for auth completion
          const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
              window.removeEventListener('message', handleMessage);
              // Retry folder connection after auth
              handleFolderSelected(folderId);
            }
          };
          window.addEventListener('message', handleMessage);

          // Clean up if popup is closed without auth
          const checkClosed = setInterval(() => {
            if (popup?.closed) {
              clearInterval(checkClosed);
              window.removeEventListener('message', handleMessage);
              setDriveConnectionStatus('disconnected');
            }
          }, 1000);

          return;
        }

        throw new Error('Google Drive authentication required but no auth URL returned');
      }

      // Successfully connected
      setConnectedFolderId(folderId);
      setConnectedFolderName(statusData.drive?.fileCount !== undefined
        ? `Folder with ${statusData.drive.fileCount} PDFs`
        : `Folder ${folderId.slice(0, 8)}...`
      );
      setDriveConnectionStatus('connected');
    } catch (err) {
      console.error('Drive connection error:', err);
      setDriveError(err instanceof Error ? err.message : 'Failed to connect to Google Drive folder');
      setDriveConnectionStatus('error');
    }
  }, []);

  // Google Drive disconnect handler
  const handleDriveDisconnect = useCallback(() => {
    setDriveConnectionStatus('disconnected');
    setConnectedFolderId('');
    setConnectedFolderName('');
    setDriveError('');
    setSyncStatus('idle');
    setSyncProgress({ current: 0, total: 0 });
    setSyncError('');
  }, []);

  // Google Drive sync trigger handler
  const handleTriggerSync = useCallback(async () => {
    if (!connectedFolderId) {
      setSyncError('No folder selected');
      return;
    }

    // Reset state
    setSyncStatus('connecting');
    setSyncProgress({ current: 0, total: 0 });
    setSyncError('');

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/drive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: connectedFolderId,
          skipExisting: true,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sync failed');
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            const eventType = line.replace('event:', '').trim();
            continue;
          }
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.replace('data:', '').trim());

              // Update state based on event type
              if (data.phase === 'listing') {
                setSyncStatus('listing');
              } else if (data.phase === 'syncing' || data.progress) {
                setSyncStatus('downloading');
                if (data.progress) {
                  setSyncProgress({
                    current: data.progress.synced + data.progress.skipped + data.progress.errors,
                    total: data.progress.total,
                    currentFileName: data.fileName,
                  });
                }
              }

              // Handle completion
              if (data.message === 'Sync completed successfully' || data.phase === 'listing_complete' && data.totalFiles === 0) {
                setSyncStatus('complete');
                if (data.syncedFiles !== undefined) {
                  setSyncProgress(prev => ({
                    ...prev,
                    current: data.syncedFiles + (data.skippedFiles || 0),
                    total: data.totalFiles || prev.total,
                  }));
                }
                // Refresh file list after sync
                loadFiles();
              }

              // Handle fatal errors
              if (data.error && !data.fileName) {
                setSyncError(data.error);
                setSyncStatus('error');
              }
            } catch {
              // Ignore parse errors for malformed SSE data
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setSyncStatus('cancelled');
      } else {
        console.error('Sync error:', err);
        setSyncError(err instanceof Error ? err.message : 'Sync failed');
        setSyncStatus('error');
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [connectedFolderId]);

  // Google Drive sync cancel handler
  const handleCancelSync = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Local upload handler
  const handleLocalUpload = async () => {
    if (uploadFiles.length === 0) return;

    setIsUploading(true);
    setUploadError('');
    setUploadProgress({ current: 0, total: uploadFiles.length });

    try {
      const formData = new FormData();
      uploadFiles.forEach(file => {
        formData.append('files', file);
      });

      const res = await fetch('/api/upload-to-blob', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadProgress({ current: data.successCount, total: data.totalFiles });

      if (data.failCount > 0) {
        setUploadError(`${data.failCount} file(s) failed to upload`);
      }

      // Clear files and refresh list
      setUploadFiles([]);
      loadFiles();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Helper function to analyze a single file
  const analyzeSingleFile = async (
    file: { fileName: string; text: string; metadata: any },
    aspects?: string
  ): Promise<AnalysisResult> => {
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{
            fileName: file.fileName,
            text: file.text,
            metadata: file.metadata,
            extractionSuccess: true,
          }],
          ratedAspects: aspects?.trim() || undefined,
          useMxmlPrompt: true,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Analysis failed');
        } else {
          const errorText = await response.text();
          throw new Error(`API error ${response.status}: ${errorText.substring(0, 100)}`);
        }
      }

      const data = await response.json();
      return data.results?.[0] || { fileName: file.fileName, success: false, error: 'No result returned' };
    } catch (err) {
      return {
        fileName: file.fileName,
        success: false,
        error: String(err),
      };
    }
  };

  const handleAnalyze = async () => {
    if (selectedFiles.size === 0) {
      setError('Please select at least one file.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResults([]);
    setProcessingStatus('Initializing...');
    setCurrentFileIndex(0);

    const filesToProcess = files.filter(f => selectedFiles.has(f.url));
    const totalFiles = filesToProcess.length;
    setTotalFilesToProcess(totalFiles);

    try {
      // Import client-side parser
      const { extractTextFromPDF } = await import('@/lib/client-pdf-parser');

      let successCount = 0;
      let failureCount = 0;

      // Process one file at a time, updating results as we go
      for (let i = 0; i < filesToProcess.length; i++) {
        const blobFile = filesToProcess[i];
        setCurrentFileIndex(i);

        try {
          // Step 1: Load the file
          setProcessingStatus(`Loading ${blobFile.name}...`);
          const blobRes = await fetch(blobFile.url);
          if (!blobRes.ok) {
            throw new Error(`Failed to fetch: ${blobRes.status}`);
          }
          const blobData = await blobRes.blob();
          const pdfFile = new File([blobData], blobFile.name, { type: 'application/pdf' });

          // Step 2: Parse the PDF
          setProcessingStatus(`Parsing ${blobFile.name}...`);
          const parseResult = await extractTextFromPDF(pdfFile);

          // Step 3: Send to API for analysis
          setProcessingStatus(`Analyzing ${blobFile.name}...`);
          const analysisResult = await analyzeSingleFile({
            fileName: blobFile.name,
            text: parseResult.text,
            metadata: parseResult.metadata,
          }, ratedAspects);

          // Update results immediately
          if (analysisResult.success) {
            successCount++;
          } else {
            failureCount++;
          }

          setResults(prev => [...prev, analysisResult]);

        } catch (err) {
          console.error(`Failed to process ${blobFile.name}:`, err);
          failureCount++;

          // Add failed result
          setResults(prev => [...prev, {
            fileName: blobFile.name,
            success: false,
            error: String(err),
          }]);
        }
      }

      setProcessingStatus('');
      setCurrentFileIndex(totalFiles);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setProcessingStatus('');
    } finally {
      setIsProcessing(false);
      setTotalFilesToProcess(0);
      setCurrentFileIndex(0);
    }
  };

  // Loading state
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 animate-pulse">Authenticating...</div>
      </div>
    );
  }

  // Auth prompt
  if (!isAuthenticated) {
    return <AccessKeyPrompt onValidKey={() => setIsAuthenticated(true)} />;
  }

  // Main UI
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900">
      
      {/* Navbar */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm backdrop-blur-sm bg-opacity-90">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center max-w-7xl">
          <div className="flex items-center gap-4">
             <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
               MxML Analysis Hub
             </h1>
             <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">Beta</span>
          </div>
          <div className="text-sm font-medium text-gray-500">
            {files.length} Files Available
            {searchQuery && ` • ${filteredFiles.length} Filtered`}
            {' • '}
            <span className="text-indigo-600">{selectedFiles.size} Selected</span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
        
        {/* Step 1: Configuration */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">1. Configure Rated Aspects</h2>
            <p className="text-sm text-gray-500">These topics will be extracted from each paper.</p>
          </div>
          <div className="p-6">
            <textarea
              className="w-full h-64 p-4 border border-gray-300 rounded-lg font-mono text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="Paste Appendix D (Rated Aspects definitions) here..."
              value={ratedAspects}
              onChange={(e) => setRatedAspects(e.target.value)}
              disabled={isProcessing}
            />
          </div>
        </section>

        {/* Google Drive Sync Section */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div
            className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={() => setShowDriveSync(!showDriveSync)}
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.71 3.5L1.15 15l4.58 8h13.54l4.58-8L17.29 3.5H7.71zm-.53 1h10.64l5.14 9H2.04l5.14-9zm5.32 2.5L7.36 14h10.28L12.5 7z"/>
                </svg>
                Sync from Google Drive
                {driveConnectionStatus === 'connected' && (
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Connected</span>
                )}
              </h2>
              <p className="text-sm text-gray-500">Import PDFs directly from a Google Drive folder.</p>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${showDriveSync ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {showDriveSync && (
            <div className="p-6 space-y-6">
              {/* Folder Picker */}
              <DriveFolderPicker
                onFolderSelected={handleFolderSelected}
                onDisconnect={handleDriveDisconnect}
                connectionStatus={driveConnectionStatus}
                connectedFolderName={connectedFolderName}
                error={driveError}
              />

              {/* Sync Button - only show when connected */}
              {driveConnectionStatus === 'connected' && (
                <DriveSyncButton
                  syncStatus={syncStatus}
                  progress={syncProgress}
                  error={syncError}
                  disabled={isProcessing}
                  onTriggerSync={handleTriggerSync}
                  onCancelSync={handleCancelSync}
                  onSyncComplete={() => {
                    // Refresh file list after sync completes
                    loadFiles();
                  }}
                />
              )}
            </div>
          )}
        </section>

        {/* Upload Local Files Section */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div
            className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={() => setShowLocalUpload(!showLocalUpload)}
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload Local Files
                {uploadFiles.length > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{uploadFiles.length} selected</span>
                )}
              </h2>
              <p className="text-sm text-gray-500">Upload PDFs from your computer to the storage.</p>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${showLocalUpload ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {showLocalUpload && (
            <div className="p-6 space-y-4">
              <FileUpload
                onFilesSelected={setUploadFiles}
                isProcessing={isUploading}
              />

              {uploadFiles.length > 0 && (
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleLocalUpload}
                    disabled={isUploading}
                    className={`
                      px-6 py-2 rounded-lg font-medium text-white transition-all
                      ${isUploading
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'}
                    `}
                  >
                    {isUploading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Uploading...
                      </span>
                    ) : (
                      `Upload ${uploadFiles.length} Files to Storage`
                    )}
                  </button>

                  {isUploading && uploadProgress.total > 0 && (
                    <span className="text-sm text-gray-500">
                      {uploadProgress.current} / {uploadProgress.total}
                    </span>
                  )}
                </div>
              )}

              {uploadError && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200 text-sm">
                  {uploadError}
                </div>
              )}

              {!isUploading && uploadProgress.current > 0 && !uploadError && (
                <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg border border-green-200 text-sm">
                  Successfully uploaded {uploadProgress.current} files!
                </div>
              )}
            </div>
          )}
        </section>

        {/* Step 2: File Selection */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">2. Select Files</h2>
              <p className="text-sm text-gray-500">Choose documents from the Vercel Blob storage.</p>
            </div>
            <button
              onClick={selectAll}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1 rounded transition-colors"
            >
              {selectedFiles.size === filteredFiles.length && filteredFiles.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="p-6">
            {/* Search Bar */}
            <div className="mb-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search files by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <svg
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {searchQuery && (
                <p className="text-sm text-gray-500 mt-2">
                  Showing {filteredFiles.length} of {files.length} files
                </p>
              )}
            </div>
            {isLoadingFiles ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <svg className="animate-spin h-8 w-8 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p>Loading files...</p>
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                <p className="text-gray-500 font-medium">No files found.</p>
                <p className="text-sm text-gray-400 mt-1">Run `npm run upload-mxml -- "path/to/pdfs"` to upload documents.</p>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                <p className="text-gray-500 font-medium">No files match your search.</p>
                <p className="text-sm text-gray-400 mt-1">Try a different search term.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {filteredFiles.map(file => (
                  <div 
                    key={file.url}
                    onClick={() => toggleFileSelection(file.url)}
                    className={`
                      group p-3 rounded-lg cursor-pointer border transition-all flex items-center gap-3 select-none
                      ${selectedFiles.has(file.url) 
                        ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 shadow-sm' 
                        : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'}
                    `}
                  >
                    <div className={`
                      w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-colors
                      ${selectedFiles.has(file.url) ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300 group-hover:border-blue-400'}
                    `}>
                      {selectedFiles.has(file.url) && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${selectedFiles.has(file.url) ? 'text-blue-900' : 'text-gray-700'}`}>
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Action Area */}
        <div className="flex flex-col items-center gap-6 py-4">
          <button
            onClick={handleAnalyze}
            disabled={isProcessing || selectedFiles.size === 0}
            className={`
              relative px-8 py-4 rounded-xl font-bold text-white text-lg shadow-xl transition-all transform
              ${isProcessing || selectedFiles.size === 0
                ? 'bg-gray-400 cursor-not-allowed transform-none shadow-none'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:scale-105 hover:shadow-2xl active:scale-95'}
            `}
          >
            {isProcessing ? (
              <span className="flex items-center gap-3">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              `Analyze ${selectedFiles.size} Documents`
            )}
          </button>
          
          {/* Processing Progress Indicator */}
          {isProcessing && totalFilesToProcess > 0 && (
            <div className="w-full max-w-2xl">
              {/* Progress Header */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Processing files...
                </span>
                <span className="text-sm font-medium text-blue-600">
                  {results.length} / {totalFilesToProcess} complete
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(results.length / totalFilesToProcess) * 100}%` }}
                />
              </div>

              {/* Current File Status */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <svg
                      className="animate-spin h-5 w-5 text-blue-600"
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
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-blue-900">
                      File {currentFileIndex + 1} of {totalFilesToProcess}
                    </p>
                    <p className="text-sm text-blue-700 truncate">
                      {processingStatus || 'Processing...'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Completed Files Summary */}
              {results.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Completed
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {results.map((result, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded ${
                          result.success
                            ? 'bg-green-50 text-green-800'
                            : 'bg-red-50 text-red-800'
                        }`}
                      >
                        {result.success ? (
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        <span className="truncate">{result.fileName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 px-6 py-4 rounded-lg border border-red-200 flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <AnalysisResults
              results={results}
              totalFiles={selectedFiles.size}
              successCount={results.filter(r => r.success).length}
              failureCount={results.filter(r => !r.success).length}
              ratedAspects={ratedAspects}
            />
          </div>
        )}
      </div>
    </main>
  );
}
