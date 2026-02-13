'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { exportToExcel, exportFilteredToExcel, exportToCSV, getExportStats } from '@/lib/excel-exporter';
import { MetadataMap, detectMismatches } from '@/lib/metadata-parser';

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

interface AnalysisResultsProps {
  results: AnalysisResult[];
  totalFiles: number;
  successCount: number;
  failureCount: number;
  ratedAspects?: string;
  metadata?: MetadataMap | null;
}

export default function AnalysisResults({
  results,
  totalFiles,
  successCount,
  failureCount,
  ratedAspects,
  metadata,
}: AnalysisResultsProps) {
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(new Set());

  const toggleOpen = (index: number) => {
    setOpenIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const downloadResults = () => {
    const dataStr = JSON.stringify(results, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analysis-results-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    exportToExcel(results, ratedAspects, metadata || undefined);
  };

  const handleExportFilteredExcel = () => {
    exportFilteredToExcel(results, ratedAspects, metadata || undefined);
  };

  const handleExportCSV = () => {
    exportToCSV(results, ratedAspects, metadata || undefined);
  };

  // Compute mismatch info when metadata is provided
  const mismatch = metadata
    ? detectMismatches(results.map(r => r.fileName), metadata)
    : null;

  const stats = getExportStats(results);

  return (
    <div className="w-full mt-8">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-black">Analysis Results</h2>
            <p className="text-black mt-1">
              {totalFiles} file{totalFiles !== 1 ? 's' : ''} processed •{' '}
              <span className="text-green-600">{successCount} successful</span> •{' '}
              <span className="text-red-600">{failureCount} failed</span>
            </p>
            {stats.totalAspects > 0 && (
              <p className="text-sm text-gray-600 mt-1">
                {stats.filesWithAspects} file{stats.filesWithAspects !== 1 ? 's' : ''} with aspects ({stats.totalAspects} total aspects)
              </p>
            )}
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            Export Full Analysis
          </button>

          <button
            onClick={handleExportFilteredExcel}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            Export Answers Only
          </button>

          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Export to CSV
          </button>

          <button
            onClick={downloadResults}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download JSON
          </button>
        </div>

        {/* Metadata Match Info */}
        {mismatch && (
          <div className="mt-4">
            <p className="text-sm text-green-700 font-medium">
              Metadata matched: {mismatch.matchedCount} of {results.length} files
            </p>

            {(mismatch.filesNotInMetadata.length > 0 || mismatch.metadataNotInFiles.length > 0) && (
              <details className="mt-2">
                <summary className="text-sm text-amber-700 cursor-pointer hover:text-amber-800 font-medium">
                  {mismatch.filesNotInMetadata.length + mismatch.metadataNotInFiles.length} mismatch{mismatch.filesNotInMetadata.length + mismatch.metadataNotInFiles.length !== 1 ? 'es' : ''} detected
                </summary>
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm space-y-3">
                  {mismatch.filesNotInMetadata.length > 0 && (
                    <div>
                      <p className="font-medium text-amber-800">
                        Analysis files not found in metadata ({mismatch.filesNotInMetadata.length}):
                      </p>
                      <ul className="mt-1 list-disc list-inside text-amber-700">
                        {mismatch.filesNotInMetadata.map((f, i) => (
                          <li key={i} className="truncate">{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {mismatch.metadataNotInFiles.length > 0 && (
                    <div>
                      <p className="font-medium text-amber-800">
                        Metadata rows not in analysis results ({mismatch.metadataNotInFiles.length}):
                      </p>
                      <ul className="mt-1 list-disc list-inside text-amber-700 max-h-32 overflow-y-auto">
                        {mismatch.metadataNotInFiles.map((f, i) => (
                          <li key={i} className="truncate">{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {results.map((result, index) => (
          <details
            key={index}
            open={openIndexes.has(index)}
            className={`border rounded-lg overflow-hidden ${
              result.success ? 'border-green-200' : 'border-red-200'
            }`}
          >
            <summary
              onClick={(e) => {
                e.preventDefault();
                toggleOpen(index);
              }}
              className="p-3 bg-white cursor-pointer hover:bg-gray-50 transition-colors list-none"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-black truncate" title={result.fileName}>
                    {result.fileName}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {result.success ? (
                    <svg
                      className="w-5 h-5 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  ) : (
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
                        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  )}
                  <svg
                    className={`w-4 h-4 text-black transition-transform duration-200 ${
                      openIndexes.has(index) ? 'rotate-90' : 'rotate-0'
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </summary>

            <div className="p-4 bg-gray-50 border-t">
              {result.success && result.data ? (
                <div className="space-y-4">
                  {/* Metadata */}
                  {result.data.metadata && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Document Metadata</h4>
                      <div className="bg-white p-3 rounded border border-gray-200 text-sm">
                        <div className="space-y-2">
                          {result.data.metadata.pageCount && (
                            <div className="flex gap-2">
                              <span className="text-black font-medium flex-shrink-0">Pages:</span>
                              <span className="text-black">{result.data.metadata.pageCount}</span>
                            </div>
                          )}
                          {result.data.metadata.title && (
                            <div className="flex gap-2">
                              <span className="text-black font-medium flex-shrink-0">Title:</span>
                              <span className="text-black break-all" title={result.data.metadata.title}>
                                {result.data.metadata.title}
                              </span>
                            </div>
                          )}
                          {result.data.metadata.author && (
                            <div className="flex gap-2">
                              <span className="text-black font-medium flex-shrink-0">Author:</span>
                              <span className="text-black break-words">{result.data.metadata.author}</span>
                            </div>
                          )}
                          {result.data.metadata.hasImages && (
                            <div className="flex gap-2">
                              <span className="text-black font-medium flex-shrink-0">Has Images:</span>
                              <span className="text-black">Yes</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Analysis Result */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Analysis Result</h4>
                    <div className="bg-white p-6 rounded border border-gray-200 prose prose-sm max-w-none">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-4 text-black">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-xl font-bold mt-5 mb-3 text-black">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-black">{children}</h3>,
                          p: ({ children }) => <p className="mb-3 text-black leading-relaxed">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="text-black">{children}</li>,
                          code: ({ children }) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono text-black">{children}</code>,
                          blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 pl-4 italic text-black my-3">{children}</blockquote>,
                          strong: ({ children }) => <strong className="font-bold text-black">{children}</strong>,
                          em: ({ children }) => <em className="italic text-black">{children}</em>,
                        }}
                      >
                        {typeof result.data.analysis === 'string'
                          ? result.data.analysis
                          : JSON.stringify(result.data.analysis, null, 2)}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* Extracted Text Preview */}
                  <details className="group">
                    <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
                      Extracted Text Preview ({result.data.extractedText.length} characters)
                    </summary>
                    <div className="mt-2 bg-white p-4 rounded border border-gray-200 max-h-96 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700">
                        {result.data.extractedText.substring(0, 2000)}
                        {result.data.extractedText.length > 2000 && '...'}
                      </pre>
                    </div>
                  </details>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded p-4">
                  <p className="text-red-800 font-medium">Error:</p>
                  <p className="text-red-700 text-sm mt-1">{result.error}</p>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
