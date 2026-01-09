'use client';

import { useState, useEffect } from 'react';
import FileUpload from '@/components/FileUpload';
import AnalysisResults from '@/components/AnalysisResults';
import AccessKeyPrompt from '@/components/AccessKeyPrompt';

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

interface ApiResponse {
  success: boolean;
  totalFiles: number;
  successCount: number;
  failureCount: number;
  results: AnalysisResult[];
}

interface BlobFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
  name: string;
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [results, setResults] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ratedAspects, setRatedAspects] = useState<string>('');

  // Blob storage state
  const [blobFiles, setBlobFiles] = useState<BlobFile[]>([]);
  const [isLoadingBlob, setIsLoadingBlob] = useState(false);
  const [selectedBlobFiles, setSelectedBlobFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Check if user has a valid key on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('app_access_key');
    if (storedKey) {
      // Validate the stored key
      fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: storedKey }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.valid) {
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem('app_access_key');
          }
        })
        .catch(() => {
          localStorage.removeItem('app_access_key');
        })
        .finally(() => {
          setIsCheckingAuth(false);
        });
    } else {
      setIsCheckingAuth(false);
    }
  }, []);

  // Load blob files when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadBlobFiles();
    }
  }, [isAuthenticated]);

  const loadBlobFiles = async () => {
    setIsLoadingBlob(true);
    try {
      const res = await fetch('/api/mxml-files?folder=icap');
      const data = await res.json();
      if (data.files) {
        setBlobFiles(data.files);
      }
    } catch (err) {
      console.error('Failed to load blob files:', err);
    } finally {
      setIsLoadingBlob(false);
    }
  };

  const toggleBlobFileSelection = (url: string) => {
    const next = new Set(selectedBlobFiles);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    setSelectedBlobFiles(next);
  };

  const filteredBlobFiles = blobFiles.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectAllBlob = () => {
    if (selectedBlobFiles.size === filteredBlobFiles.length && filteredBlobFiles.length > 0) {
      const next = new Set(selectedBlobFiles);
      filteredBlobFiles.forEach(f => next.delete(f.url));
      setSelectedBlobFiles(next);
    } else {
      const next = new Set(selectedBlobFiles);
      filteredBlobFiles.forEach(f => next.add(f.url));
      setSelectedBlobFiles(next);
    }
  };

  const handleFilesSelected = (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setResults(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    // Support both local files and blob files
    const hasLocalFiles = files.length > 0;
    const hasBlobFiles = selectedBlobFiles.size > 0;

    if (!hasLocalFiles && !hasBlobFiles) {
      setError('Please select at least one PDF file');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResults(null);
    setProcessingStatus('Initializing PDF parser...');

    try {
      // Dynamically import the PDF parser only when needed (browser-only)
      const { extractTextFromPDFs } = await import('@/lib/client-pdf-parser');

      let filesToProcess: File[] = [...files];

      // If blob files are selected, fetch them first
      if (hasBlobFiles) {
        setProcessingStatus('Loading PDFs from storage...');
        const blobFilesToProcess = blobFiles.filter(f => selectedBlobFiles.has(f.url));

        for (const blobFile of blobFilesToProcess) {
          try {
            const res = await fetch(blobFile.url);
            const blob = await res.blob();
            const file = new File([blob], blobFile.name, { type: 'application/pdf' });
            filesToProcess.push(file);
          } catch (err) {
            console.error(`Failed to fetch ${blobFile.name}:`, err);
          }
        }
      }

      // Step 1: Extract text from PDFs in the browser
      setProcessingStatus('Extracting text from PDFs...');
      const extractions = await extractTextFromPDFs(filesToProcess, (fileName, current, total) => {
        setProcessingStatus(`Extracting text from ${fileName} (${current}/${total})...`);
      });

      // Check if any extractions failed
      const failedExtractions = extractions.filter((e) => !e.success);
      if (failedExtractions.length > 0) {
        console.warn('Some PDFs failed to extract:', failedExtractions);
      }

      // Step 2: Send extracted text to backend for analysis
      setProcessingStatus('Sending to AI for analysis...');
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: extractions.map((extraction) => ({
            fileName: extraction.fileName,
            text: extraction.text || '',
            metadata: extraction.metadata,
            extractionSuccess: extraction.success,
            extractionError: extraction.error,
          })),
          ratedAspects: ratedAspects.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const data: ApiResponse = await response.json();
      setResults(data);
      setProcessingStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setProcessingStatus('');
    } finally {
      setIsProcessing(false);
    }
  };

  // Show loading while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <svg
            className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4"
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
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show access key prompt if not authenticated
  if (!isAuthenticated) {
    return <AccessKeyPrompt onValidKey={() => setIsAuthenticated(true)} />;
  }

  // Show main app if authenticated
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            PDF Analysis Tool
          </h1>
          <p className="text-lg text-gray-600">
            Upload PDF files for AI-powered analysis with parallel processing
          </p>
        </div>

        {/* ICAP Papers from Storage */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">
                ICAP Papers
              </h2>
              <p className="text-sm text-gray-500">
                {blobFiles.length} files available • {selectedBlobFiles.size} selected
              </p>
            </div>
            <button
              onClick={selectAllBlob}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1 rounded transition-colors"
            >
              {selectedBlobFiles.size === filteredBlobFiles.length && filteredBlobFiles.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* File List */}
          {isLoadingBlob ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <svg className="animate-spin h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading files...
            </div>
          ) : filteredBlobFiles.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
              <p className="text-gray-500">No files found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
              {filteredBlobFiles.map(file => (
                <div
                  key={file.url}
                  onClick={() => toggleBlobFileSelection(file.url)}
                  className={`
                    p-3 rounded-lg cursor-pointer border transition-all flex items-center gap-3 select-none
                    ${selectedBlobFiles.has(file.url)
                      ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                      : 'bg-white border-gray-200 hover:border-blue-300'}
                  `}
                >
                  <div className={`
                    w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border
                    ${selectedBlobFiles.has(file.url) ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'}
                  `}>
                    {selectedBlobFiles.has(file.url) && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${selectedBlobFiles.has(file.url) ? 'text-blue-900' : 'text-gray-700'}`}>
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rated Aspects Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Rated Aspects (Optional)
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Enter your rated aspects below. This will be appended to the AI prompt as: "Here are your rated aspects: {'{your text}'}"
          </p>
          <textarea
            value={ratedAspects}
            onChange={(e) => setRatedAspects(e.target.value)}
            placeholder="Example:&#10;(1) Is it a paper about UPGRADING one or more of the ICAP modes?&#10;(2) Is it about EXTENDING the ICAP theory in a new direction?&#10;..."
            disabled={isProcessing}
            className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical font-mono text-sm text-black disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <FileUpload onFilesSelected={handleFilesSelected} isProcessing={isProcessing} />

          {(files.length > 0 || selectedBlobFiles.size > 0) && (
            <div className="mt-6 flex flex-col items-center gap-4">
              <button
                onClick={handleAnalyze}
                disabled={isProcessing}
                className={`
                  px-8 py-3 rounded-lg font-semibold text-white transition-all
                  ${
                    isProcessing
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg'
                  }
                `}
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-5 w-5"
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
                    Processing...
                  </span>
                ) : (
                  `Analyze ${files.length + selectedBlobFiles.size} File${(files.length + selectedBlobFiles.size) !== 1 ? 's' : ''}`
                )}
              </button>

              {processingStatus && (
                <p className="text-sm text-gray-600 animate-pulse">{processingStatus}</p>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-red-800 font-medium">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Results Section */}
        {results && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <AnalysisResults
              results={results.results}
              totalFiles={results.totalFiles}
              successCount={results.successCount}
              failureCount={results.failureCount}
              ratedAspects={ratedAspects}
            />
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-gray-600 text-sm">
          <p>Powered by ASU AIML Platform • Client-side PDF parsing for privacy</p>
          <p className="mt-1">Your PDFs are processed in your browser - nothing uploaded until analysis</p>
        </div>
      </div>
    </main>
  );
}
