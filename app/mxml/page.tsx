'use client';

import { useState, useEffect } from 'react';
import AccessKeyPrompt from '@/components/AccessKeyPrompt';
import AnalysisResults from '@/components/AnalysisResults';

interface BlobFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
  name: string;
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

const DEFAULT_ASPECTS = `(1) Automatic text or speech scoring
Automatically assigning scores or labels to open-ended responses (e.g., essays, speech) as an alternative to grading by humans.

(2) Discrete or continuous trait scoring
Assigning scores or estimates of continuous traits (e.g., proficiency, personality) or discrete classes (e.g., cluster labels, skill mastery).

(3) Standard setting
Establishing specific criteria and cut scores for different levels of proficiency in a particular domain.

(4) Item/instrument development
Generation of questions, tasks, or instruments. Excludes shortening existing tests.

(5) Short form construction
Selecting a subset of items for a short form to meet specific constraints and/or to optimize some objective.

(6) Item review and analysis
Statistical evaluation of a task/question's reliability, validity, and other characteristics (e.g., relevant behavioral evidence). Excludes differential item/rater functioning analysis.

(7) Differential item/rater functioning detection
Flagging subsets of items/raters that function differently across subgroups.

(8) Aberrant response detection
Flagging subsets of examinees whose observed data deviates from normal test-taking (e.g., insufficient effort responding or cheating).

(9) Process data analysis
Analysis of computer-logged, time-stamped sequence of actions performed by an examinee (e.g., clickstreams and keystrokes) in pursuit of solving an item.

(10) Model selection
Choosing among candidate models, including the use of regularization to adjust model capacity, or performing variable selection, often based on model-data fit, predictive performance, and simplicity.

(11) Psychometric model extension
Extension to existing measurement models with statistical/machine learning.

(12) Measurement model parameter estimation
Computational methods for estimating measurement model parameters.

(13) Validity based on internal structure
Examining validity evidence based on to what extent the relationships among test items and test components conform to the construct being measured. (See more detail in the 2014 Standards for Educational and Psychological Testing, Chapter 1.)

(14) Validity based on test content
Examining validity evidence based on the relationship between the content of a test (e.g., the themes, wording, and format) and the construct being measured. (See more detail in the 2014 Standards for Educational and Psychological Testing, Chapter 1.)

(15) Validity based on relations to other variables
Examining validity evidence based on the relationship of test scores to variables external to the test (e.g., predictive validity, concurrent validity, convergent validity, divergent validity). (See more detail in the 2014 Standards for Educational and Psychological Testing, Chapter 1.)

(16) Conceptual discussion of ML in measurement
Reviews and non-technical discussions on the role of ML in measurement.

(17) ML overview and tutorials
These articles do not reference a specific measurement context, but they are published on core measurement journals that measurement professionals typically read, and introduce ML methods to measurement professionals.`;

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

  // Prompt Inputs
  const [ratedAspects, setRatedAspects] = useState<string>(DEFAULT_ASPECTS);

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

  const handleAnalyze = async () => {
    if (selectedFiles.size === 0) {
      setError('Please select at least one file.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResults([]);
    setProcessingStatus('Starting analysis...');

    try {
      const filesToProcess = files.filter(f => selectedFiles.has(f.url));

      // Import client-side parser
      const { extractTextFromPDFs } = await import('@/lib/client-pdf-parser');

      // Step 1: Convert blob URLs to File objects
      setProcessingStatus('Loading PDFs from storage...');
      const pdfFiles: File[] = [];
      for (const file of filesToProcess) {
        try {
          const blobRes = await fetch(file.url);
          if (!blobRes.ok) {
            throw new Error(`Failed to fetch: ${blobRes.status}`);
          }
          const blobData = await blobRes.blob();
          const pdfFile = new File([blobData], file.name, { type: 'application/pdf' });
          pdfFiles.push(pdfFile);
        } catch (err) {
          console.error(`Error loading ${file.name}:`, err);
        }
      }

      // Step 2: Extract text from ALL files using the same method as the original page
      setProcessingStatus('Extracting text from PDFs...');
      const extractions = await extractTextFromPDFs(pdfFiles, (fileName, current, total) => {
        setProcessingStatus(`Extracting text from ${fileName} (${current}/${total})...`);
      });

      // Step 3: Send ALL files in ONE batch to API (processes in parallel)
      setProcessingStatus('Sending to AI for analysis...');
      const apiRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: extractions.map((extraction) => ({
            fileName: extraction.fileName,
            text: extraction.text || '',
            metadata: extraction.metadata,
            extractionSuccess: extraction.success,
            extractionError: extraction.error,
          })),
          ratedAspects: ratedAspects.trim() || undefined,
          useMxmlPrompt: true
        })
      });

      if (!apiRes.ok) {
        const errorData = await apiRes.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const apiData = await apiRes.json();
      setResults(apiData.results || []);
      setProcessingStatus('Analysis Complete.');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setProcessingStatus('');
    } finally {
      setIsProcessing(false);
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
          
          {processingStatus && (
            <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium animate-pulse border border-blue-100">
              {processingStatus}
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
            />
          </div>
        )}
      </div>
    </main>
  );
}
