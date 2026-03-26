'use client';

import { useState, useEffect } from 'react';
import AccessKeyPrompt from '@/components/AccessKeyPrompt';
import AnalysisResults from '@/components/AnalysisResults';
import FileUpload from '@/components/FileUpload';
import { useBatchProcessor } from '@/lib/hooks/use-batch-processor';
import Link from 'next/link';
import { DEFAULT_MXML_SYSTEM_PROMPT, DEFAULT_ASPECTS } from '@/lib/prompts/default-mxml-prompt';

interface BlobFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
  name: string;
  journalType?: string;
}

interface QueueItem {
  blobFile: BlobFile;
  fileName: string;
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

// --- Public props interface ---

export interface FileCategory {
  key: string;
  label: string;
  folderKey: string;
  blobPrefix: string;
}

export interface MxmlAnalyzerProps {
  title: string;
  promptMode: string;
  fileCategories: FileCategory[];
  showUpload?: boolean;
  showJournalType?: boolean;
}

export default function MxmlAnalyzer({
  title,
  promptMode,
  fileCategories,
  showUpload = false,
  showJournalType = false,
}: MxmlAnalyzerProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [filesByCategory, setFilesByCategory] = useState<Record<string, BlobFile[]>>({});
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Analysis state
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Batch processor hook for parallel processing (5 concurrent requests)
  const processor = useBatchProcessor<QueueItem, AnalysisResult>({
    defaultMode: 'parallel',
    defaultConcurrency: 5,
    persistConfig: false,
  });

  // Prompt Inputs
  const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_MXML_SYSTEM_PROMPT);
  const [ratedAspects, setRatedAspects] = useState<string>(DEFAULT_ASPECTS);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(true);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [promptSaveStatus, setPromptSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [promptIsDefault, setPromptIsDefault] = useState(true);

  // Local upload state (keyed by category for multi-category support)
  const [showLocalUpload, setShowLocalUpload] = useState<Record<string, boolean>>({});
  const [uploadFilesByCategory, setUploadFilesByCategory] = useState<Record<string, File[]>>({});
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadError, setUploadError] = useState<string>('');

  // Derived: flat list of all files across categories
  const allFiles = Object.values(filesByCategory).flat();
  const totalFileCount = allFiles.length;

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
      loadPrompt();
    }
  }, [isAuthenticated]);

  // Load saved prompt from Vercel Blob
  const loadPrompt = async () => {
    setIsLoadingPrompt(true);
    try {
      const res = await fetch(`/api/prompt?mode=${promptMode}`);
      const data = await res.json();
      if (data.systemPrompt) {
        setSystemPrompt(data.systemPrompt);
      }
      if (data.ratedAspects) {
        setRatedAspects(data.ratedAspects);
      }
      setPromptIsDefault(data.isDefault ?? true);
    } catch (err) {
      console.error('Failed to load prompt:', err);
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  // Save prompt to Vercel Blob
  const savePrompt = async () => {
    setIsSavingPrompt(true);
    setPromptSaveStatus('idle');
    try {
      const res = await fetch('/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, ratedAspects, mode: promptMode }),
      });
      if (!res.ok) {
        throw new Error('Failed to save');
      }
      setPromptSaveStatus('saved');
      setPromptIsDefault(false);
      setTimeout(() => setPromptSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Failed to save prompt:', err);
      setPromptSaveStatus('error');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  // Reset prompt to defaults
  const resetPrompt = async () => {
    if (!confirm('Reset prompt to defaults? This will delete your saved customizations.')) {
      return;
    }
    setIsSavingPrompt(true);
    try {
      await fetch(`/api/prompt?mode=${promptMode}`, { method: 'DELETE' });
      setSystemPrompt(DEFAULT_MXML_SYSTEM_PROMPT);
      setRatedAspects(DEFAULT_ASPECTS);
      setPromptIsDefault(true);
      setPromptSaveStatus('saved');
      setTimeout(() => setPromptSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Failed to reset prompt:', err);
      setPromptSaveStatus('error');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const loadFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const result: Record<string, BlobFile[]> = {};
      for (const cat of fileCategories) {
        const res = await fetch(`/api/mxml-files?folder=${cat.folderKey}`);
        const data = await res.json();
        if (data.files) {
          result[cat.key] = data.files.map((f: BlobFile) => ({
            ...f,
            journalType: cat.label,
          }));
        } else {
          result[cat.key] = [];
        }
      }
      setFilesByCategory(result);
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

  // Filter files for a specific category
  const getFilteredFiles = (categoryKey: string) => {
    const catFiles = filesByCategory[categoryKey] || [];
    if (!searchQuery) return catFiles;
    return catFiles.filter(file =>
      file.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  // Filter all files (flat)
  const allFilteredFiles = allFiles.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Select all for a specific category
  const selectAllForCategory = (categoryKey: string) => {
    const filtered = getFilteredFiles(categoryKey);
    const allSelected = filtered.length > 0 && filtered.every(f => selectedFiles.has(f.url));
    const next = new Set(selectedFiles);
    if (allSelected) {
      filtered.forEach(f => next.delete(f.url));
    } else {
      filtered.forEach(f => next.add(f.url));
    }
    setSelectedFiles(next);
  };

  // Select all across all categories (for single-category mode)
  const selectAll = () => {
    const allSelected = allFilteredFiles.length > 0 && allFilteredFiles.every(f => selectedFiles.has(f.url));
    const next = new Set(selectedFiles);
    if (allSelected) {
      allFilteredFiles.forEach(f => next.delete(f.url));
    } else {
      allFilteredFiles.forEach(f => next.add(f.url));
    }
    setSelectedFiles(next);
  };

  // Local upload handler (accepts category key and blob prefix)
  const handleLocalUpload = async (categoryKey: string, blobPrefix: string) => {
    const files = uploadFilesByCategory[categoryKey] || [];
    if (files.length === 0) return;

    setUploadingCategory(categoryKey);
    setUploadError('');
    setUploadProgress({ current: 0, total: files.length });

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });
      formData.append('prefix', blobPrefix);

      const res = await fetch('/api/upload-to-blob', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const errData = await res.json();
          throw new Error(errData.error || 'Upload failed');
        }
        throw new Error(`Upload failed (${res.status})`);
      }

      const data = await res.json();

      setUploadProgress({ current: data.successCount, total: data.totalFiles });

      if (data.failCount > 0) {
        setUploadError(`${data.failCount} file(s) failed to upload`);
      }

      setUploadFilesByCategory(prev => ({ ...prev, [categoryKey]: [] }));
      loadFiles();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingCategory(null);
    }
  };

  // Helper function to analyze a single file
  const analyzeSingleFile = async (
    file: { fileName: string; text: string; metadata: any },
    aspects?: string,
    customSystemPrompt?: string
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
          customSystemPrompt: customSystemPrompt?.trim() || undefined,
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

    setError(null);
    setResults([]);
    setProcessingStatus('Initializing...');

    const filesToProcess = allFiles.filter(f => selectedFiles.has(f.url));

    const queue: QueueItem[] = filesToProcess.map(f => ({
      blobFile: f,
      fileName: f.name,
    }));

    try {
      const { extractTextFromPDF } = await import('@/lib/client-pdf-parser');

      const processFile = async (item: QueueItem): Promise<AnalysisResult> => {
        const { blobFile } = item;

        try {
          setProcessingStatus(`Loading ${blobFile.name}...`);
          const blobRes = await fetch(blobFile.url);
          if (!blobRes.ok) {
            throw new Error(`Failed to fetch: ${blobRes.status}`);
          }
          const blobData = await blobRes.blob();
          const pdfFile = new File([blobData], blobFile.name, { type: 'application/pdf' });

          setProcessingStatus(`Parsing ${blobFile.name}...`);
          const parseResult = await extractTextFromPDF(pdfFile);

          setProcessingStatus(`Analyzing ${blobFile.name}...`);
          const analysisResult = await analyzeSingleFile({
            fileName: blobFile.name,
            text: parseResult.text,
            metadata: parseResult.metadata,
          }, ratedAspects, systemPrompt);

          return analysisResult;
        } catch (err) {
          console.error(`Failed to process ${blobFile.name}:`, err);
          return {
            fileName: blobFile.name,
            success: false,
            error: String(err),
          };
        }
      };

      const processResults = await processor.process(
        queue,
        processFile,
        'mxml-file'
      );

      const analysisResults: AnalysisResult[] = processResults.map(r => r.result || {
        fileName: r.item.fileName,
        success: false,
        error: r.error || 'Unknown error',
      });

      setResults(analysisResults);
      setProcessingStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setProcessingStatus('');
    }
  };

  // Build journal type map for exports
  const journalTypeMap: Map<string, string> | undefined = showJournalType
    ? (() => {
        const map = new Map<string, string>();
        for (const file of allFiles) {
          if (file.journalType) {
            map.set(file.name, file.journalType);
          }
        }
        return map;
      })()
    : undefined;

  // --- Render helpers ---

  const renderFileGrid = (files: BlobFile[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
      {files.map(file => (
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
  );

  const isMultiCategory = fileCategories.length > 1;

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
              {title}
            </h1>
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">Beta</span>
          </div>
          <div className="flex items-center gap-6">
            <Link
              href="/screening"
              className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
            >
              Screening &rarr;
            </Link>
            <div className="text-sm font-medium text-gray-500">
              {totalFileCount} Files Available
              {searchQuery && ` \u2022 ${allFilteredFiles.length} Filtered`}
              {' \u2022 '}
              <span className="text-indigo-600">{selectedFiles.size} Selected</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">

        {/* Step 1: Configuration */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                1. Configure Prompt
                {!promptIsDefault && (
                  <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Customized</span>
                )}
              </h2>
              <p className="text-sm text-gray-500">Edit the system prompt and rated aspects for analysis.</p>
            </div>
            <div className="flex items-center gap-2">
              {promptSaveStatus === 'saved' && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved
                </span>
              )}
              {promptSaveStatus === 'error' && (
                <span className="text-sm text-red-600">Save failed</span>
              )}
              <button
                onClick={resetPrompt}
                disabled={isSavingPrompt || processor.isProcessing || promptIsDefault}
                className={`
                  px-3 py-1.5 text-sm font-medium rounded-lg transition-all
                  ${promptIsDefault
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
                `}
              >
                Reset to Default
              </button>
              <button
                onClick={savePrompt}
                disabled={isSavingPrompt || processor.isProcessing}
                className={`
                  px-4 py-1.5 text-sm font-medium rounded-lg text-white transition-all
                  ${isSavingPrompt || processor.isProcessing
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'}
                `}
              >
                {isSavingPrompt ? 'Saving...' : 'Save Prompt'}
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {isLoadingPrompt ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading saved prompt...
              </div>
            ) : (
              <>
                {/* Rated Aspects (Always Visible) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rated Aspects
                    <span className="text-gray-400 font-normal ml-2">- These questions will be evaluated for each paper</span>
                  </label>
                  <textarea
                    className="w-full h-64 p-4 border border-gray-300 rounded-lg font-mono text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Paste Appendix D (Rated Aspects definitions) here..."
                    value={ratedAspects}
                    onChange={(e) => setRatedAspects(e.target.value)}
                    disabled={processor.isProcessing}
                  />
                </div>

                {/* System Prompt (Collapsible) */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                    className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex justify-between items-center transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                      System Prompt (Advanced)
                    </span>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${showSystemPrompt ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showSystemPrompt && (
                    <div className="p-4 border-t border-gray-200">
                      <p className="text-sm text-gray-500 mb-3">
                        This is the full system prompt sent to the AI. Use <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{'{{RATED_ASPECTS}}'}</code> as a placeholder where rated aspects will be inserted.
                      </p>
                      <textarea
                        className="w-full h-96 p-4 border border-gray-300 rounded-lg font-mono text-xs bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        placeholder="Enter the full system prompt..."
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        disabled={processor.isProcessing}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Upload Local Files Section (per-category) */}
        {showUpload && fileCategories.map(cat => {
          const catFiles = uploadFilesByCategory[cat.key] || [];
          const isOpen = showLocalUpload[cat.key] || false;
          const isCatUploading = uploadingCategory === cat.key;

          return (
            <section key={`upload-${cat.key}`} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div
                className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => setShowLocalUpload(prev => ({ ...prev, [cat.key]: !prev[cat.key] }))}
              >
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload to {cat.label}
                    {catFiles.length > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{catFiles.length} selected</span>
                    )}
                  </h2>
                  <p className="text-sm text-gray-500">Upload PDFs from your computer to {cat.label.toLowerCase()}.</p>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {isOpen && (
                <div className="p-6 space-y-4">
                  <FileUpload
                    onFilesSelected={(files) => setUploadFilesByCategory(prev => ({ ...prev, [cat.key]: files }))}
                    isProcessing={isCatUploading}
                  />

                  {catFiles.length > 0 && (
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleLocalUpload(cat.key, cat.blobPrefix)}
                        disabled={uploadingCategory !== null}
                        className={`
                          px-6 py-2 rounded-lg font-medium text-white transition-all
                          ${uploadingCategory !== null
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'}
                        `}
                      >
                        {isCatUploading ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Uploading...
                          </span>
                        ) : (
                          `Upload ${catFiles.length} Files to ${cat.label}`
                        )}
                      </button>

                      {isCatUploading && uploadProgress.total > 0 && (
                        <span className="text-sm text-gray-500">
                          {uploadProgress.current} / {uploadProgress.total}
                        </span>
                      )}
                    </div>
                  )}

                  {isCatUploading && uploadError && (
                    <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200 text-sm">
                      {uploadError}
                    </div>
                  )}

                  {!isCatUploading && uploadingCategory === null && uploadProgress.current > 0 && !uploadError && (
                    <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg border border-green-200 text-sm">
                      Successfully uploaded {uploadProgress.current} files!
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {/* Step 2: File Selection */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">{showUpload ? '2' : '2'}. Select Files</h2>
              <p className="text-sm text-gray-500">Choose documents from the Vercel Blob storage.</p>
            </div>
            {!isMultiCategory && (
              <button
                onClick={selectAll}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1 rounded transition-colors"
              >
                {allFilteredFiles.length > 0 && allFilteredFiles.every(f => selectedFiles.has(f.url)) ? 'Deselect All' : 'Select All'}
              </button>
            )}
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
                  Showing {allFilteredFiles.length} of {totalFileCount} files
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
            ) : totalFileCount === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                <p className="text-gray-500 font-medium">No files found.</p>
                <p className="text-sm text-gray-400 mt-1">Run the upload script to add documents.</p>
              </div>
            ) : isMultiCategory ? (
              /* Multi-category: render sections per category */
              <div className="space-y-6">
                {fileCategories.map(cat => {
                  const filtered = getFilteredFiles(cat.key);
                  const catSelectedCount = filtered.filter(f => selectedFiles.has(f.url)).length;
                  const allCatSelected = filtered.length > 0 && filtered.every(f => selectedFiles.has(f.url));

                  return (
                    <div key={cat.key} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 flex justify-between items-center border-b border-gray-200">
                        <div className="flex items-center gap-3">
                          <h3 className="text-sm font-semibold text-gray-700">{cat.label}</h3>
                          <span className="text-xs text-gray-500">
                            {filtered.length} file{filtered.length !== 1 ? 's' : ''}
                            {catSelectedCount > 0 && (
                              <span className="text-indigo-600 ml-1">({catSelectedCount} selected)</span>
                            )}
                          </span>
                        </div>
                        <button
                          onClick={() => selectAllForCategory(cat.key)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                        >
                          {allCatSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="p-4">
                        {filtered.length === 0 ? (
                          <div className="text-center py-6 text-gray-400 text-sm">
                            {searchQuery ? 'No files match your search.' : 'No files in this category.'}
                          </div>
                        ) : (
                          renderFileGrid(filtered)
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Single category: flat grid */
              allFilteredFiles.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                  <p className="text-gray-500 font-medium">No files match your search.</p>
                  <p className="text-sm text-gray-400 mt-1">Try a different search term.</p>
                </div>
              ) : (
                renderFileGrid(allFilteredFiles)
              )
            )}
          </div>
        </section>

        {/* Action Area */}
        <div className="flex flex-col items-center gap-6 py-4">
          <button
            onClick={handleAnalyze}
            disabled={processor.isProcessing || selectedFiles.size === 0}
            className={`
              relative px-8 py-4 rounded-xl font-bold text-white text-lg shadow-xl transition-all transform
              ${processor.isProcessing || selectedFiles.size === 0
                ? 'bg-gray-400 cursor-not-allowed transform-none shadow-none'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:scale-105 hover:shadow-2xl active:scale-95'}
            `}
          >
            {processor.isProcessing ? (
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
          {processor.isProcessing && processor.progress && (
            <div className="w-full max-w-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Processing files...
                </span>
                <span className="text-sm font-medium text-blue-600">
                  {processor.progress.completed} / {processor.progress.total} complete
                </span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(processor.progress.completed / processor.progress.total) * 100}%` }}
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <svg
                      className="animate-spin h-5 w-5 text-blue-600"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-blue-900">
                      Processing {Math.min(processor.config.concurrency, processor.progress.total - processor.progress.completed)} files concurrently
                    </p>
                    <p className="text-sm text-blue-700 truncate">
                      {processingStatus || 'Processing...'}
                    </p>
                  </div>
                </div>
              </div>

              {processor.results.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Completed ({processor.progress.successful} succeeded, {processor.progress.failed} failed)
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {processor.results.map((result, idx) => (
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
                        <span className="truncate">{result.item.fileName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(error || processor.error) && (
            <div className="bg-red-50 text-red-700 px-6 py-4 rounded-lg border border-red-200 flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error || processor.error}
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
              journalTypeMap={journalTypeMap}
            />
          </div>
        )}
      </div>
    </main>
  );
}
