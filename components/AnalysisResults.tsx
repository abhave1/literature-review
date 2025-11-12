'use client';

import ReactMarkdown from 'react-markdown';

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
}

export default function AnalysisResults({
  results,
  totalFiles,
  successCount,
  failureCount,
}: AnalysisResultsProps) {
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

  return (
    <div className="w-full mt-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-black">Analysis Results</h2>
          <p className="text-black mt-1">
            {totalFiles} file{totalFiles !== 1 ? 's' : ''} processed •{' '}
            <span className="text-green-600">{successCount} successful</span> •{' '}
            <span className="text-red-600">{failureCount} failed</span>
          </p>
        </div>
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

      <div className="space-y-4">
        {results.map((result, index) => (
          <details
            key={index}
            className={`border rounded-lg overflow-hidden ${
              result.success ? 'border-green-200' : 'border-red-200'
            }`}
          >
            <summary className="p-3 bg-white cursor-pointer hover:bg-gray-50 transition-colors list-none">
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
                    className="w-4 h-4 text-black transition-transform [[open]>&]:rotate-90"
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
