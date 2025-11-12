'use client';

import { useState } from 'react';
import FileUpload from '@/components/FileUpload';
import AnalysisResults from '@/components/AnalysisResults';

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

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [results, setResults] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFilesSelected = (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setResults(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (files.length === 0) {
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

      // Step 1: Extract text from PDFs in the browser
      setProcessingStatus('Extracting text from PDFs...');
      const extractions = await extractTextFromPDFs(files, (fileName, current, total) => {
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

        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <FileUpload onFilesSelected={handleFilesSelected} isProcessing={isProcessing} />

          {files.length > 0 && (
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
                    Processing {files.length} file{files.length !== 1 ? 's' : ''}...
                  </span>
                ) : (
                  `Analyze ${files.length} File${files.length !== 1 ? 's' : ''}`
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
