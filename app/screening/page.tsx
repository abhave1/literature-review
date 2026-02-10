'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import AccessKeyPrompt from '@/components/AccessKeyPrompt';
import CsvUpload from '@/components/screening/CsvUpload';
import RubricEditor from '@/components/screening/RubricEditor';
import ScreeningProgress from '@/components/screening/ScreeningProgress';
import ScreeningResults from '@/components/screening/ScreeningResults';
import ResumeDialog from '@/components/screening/ResumeDialog';

import { parseCSV, mapToArticleRows, validateColumnMapping, type ArticleRow, type ParsedCSV } from '@/lib/screening/csv-parser';
import { detectFormat, type ColumnMapping } from '@/lib/screening/column-detector';
import { DEFAULT_RUBRICS, type ScreeningRubrics } from '@/lib/screening/default-rubrics';
import { type ScreeningResult } from '@/lib/screening/response-parser';
import { getCheckpointManager, type CheckpointInfo } from '@/lib/screening/checkpoint-manager';

export default function ScreeningPage() {
  // Auth state
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // CSV state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedCSV, setParsedCSV] = useState<ParsedCSV | null>(null);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    title: '',
    abstract: '',
    year: '',
    journal: '',
    keywords: '',
  });
  const [detectedFormat, setDetectedFormat] = useState<'scopus' | 'wos' | 'custom'>('custom');

  // Rubric state
  const [rubrics, setRubrics] = useState<ScreeningRubrics>(DEFAULT_RUBRICS);
  const [rubricIsDefault, setRubricIsDefault] = useState(true);
  const [isSavingRubric, setIsSavingRubric] = useState(false);
  const [rubricSaveStatus, setRubricSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ScreeningResult[]>([]);
  const [currentArticle, setCurrentArticle] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  // Resume state
  const [pendingCheckpoint, setPendingCheckpoint] = useState<CheckpointInfo | null>(null);
  const [isLoadingCheckpoint, setIsLoadingCheckpoint] = useState(false);

  // UI state
  const [showRubricEditor, setShowRubricEditor] = useState(false);

  // Refs
  const processingRef = useRef(false);
  const cancelledRef = useRef(false);

  // Check auth on mount
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
          if (data.valid) {
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem('app_access_key');
          }
        })
        .catch(() => {
          localStorage.removeItem('app_access_key');
        })
        .finally(() => setIsCheckingAuth(false));
    } else {
      setIsCheckingAuth(false);
    }
  }, []);

  // Load rubrics when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadRubrics();
      checkForPendingBatch();
    }
  }, [isAuthenticated]);

  // Load saved rubrics from API
  const loadRubrics = async () => {
    try {
      const res = await fetch('/api/screening-rubric');
      const data = await res.json();
      if (data.rubrics) {
        setRubrics(data.rubrics);
        setRubricIsDefault(data.isDefault);
      }
    } catch (err) {
      console.error('Failed to load rubrics:', err);
    }
  };

  // Check for pending batch
  const checkForPendingBatch = async () => {
    try {
      const manager = getCheckpointManager();
      const pending = await manager.getPendingBatches();
      if (pending.length > 0) {
        setPendingCheckpoint(pending[0]);
      }
    } catch (err) {
      console.error('Failed to check pending batches:', err);
    }
  };

  // Save rubrics
  const saveRubrics = async () => {
    setIsSavingRubric(true);
    setRubricSaveStatus('idle');
    try {
      const res = await fetch('/api/screening-rubric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rubrics }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setRubricSaveStatus('saved');
      setRubricIsDefault(false);
      setTimeout(() => setRubricSaveStatus('idle'), 3000);
    } catch (err) {
      setRubricSaveStatus('error');
    } finally {
      setIsSavingRubric(false);
    }
  };

  // Reset rubrics
  const resetRubrics = async () => {
    if (!confirm('Reset rubrics to defaults? This will delete your saved customizations.')) {
      return;
    }
    try {
      await fetch('/api/screening-rubric', { method: 'DELETE' });
      setRubrics(DEFAULT_RUBRICS);
      setRubricIsDefault(true);
    } catch (err) {
      console.error('Failed to reset rubrics:', err);
    }
  };

  // Handle CSV file selection
  const handleFileSelect = useCallback(async (file: File | null) => {
    if (!file) {
      setCsvFile(null);
      setParsedCSV(null);
      setArticles([]);
      setColumnMapping({ title: '', abstract: '', year: '', journal: '', keywords: '' });
      setDetectedFormat('custom');
      return;
    }

    setCsvFile(file);
    setError(null);

    try {
      const parsed = await parseCSV(file);
      setParsedCSV(parsed);

      // Auto-detect format and columns
      const detection = detectFormat(parsed.headers);
      setColumnMapping(detection.mapping);
      setDetectedFormat(detection.format);
    } catch (err) {
      setError(`Failed to parse CSV: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, []);

  // Prepare articles when mapping changes
  useEffect(() => {
    if (parsedCSV && columnMapping.title && columnMapping.abstract) {
      const validation = validateColumnMapping(parsedCSV.headers, columnMapping);
      if (validation.valid) {
        const mapped = mapToArticleRows(parsedCSV, columnMapping);
        setArticles(mapped);
      }
    }
  }, [parsedCSV, columnMapping]);

  // Batch configuration
  const BATCH_SIZE = 12; // Articles per batch
  const CONCURRENCY = 5; // Parallel batches

  // Screen a batch of articles
  const screenBatch = async (batchArticles: ArticleRow[]): Promise<ScreeningResult[]> => {
    const res = await fetch('/api/screening', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles: batchArticles.map(a => ({
          id: a.id,
          title: a.title,
          abstract: a.abstract,
          year: a.year,
          journal: a.journal,
        })),
        rubrics,
      }),
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Batch screening failed');
    }

    return data.results;
  };

  // Split articles into batches
  const createBatches = (items: ArticleRow[], batchSize: number): ArticleRow[][] => {
    const batches: ArticleRow[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  };

  // Start screening with batch processing
  const startScreening = async () => {
    if (articles.length === 0) {
      setError('No articles to screen. Please upload a CSV file first.');
      return;
    }

    if (processingRef.current) return;
    processingRef.current = true;
    cancelledRef.current = false;

    setIsProcessing(true);
    setError(null);
    setResults([]);

    const newBatchId = `batch-${Date.now()}`;
    setBatchId(newBatchId);

    try {
      // Create checkpoint
      const manager = getCheckpointManager();
      await manager.createBatch(newBatchId, csvFile?.name || 'unknown', articles, rubrics, columnMapping);

      // Split into batches
      const batches = createBatches(articles, BATCH_SIZE);
      const totalBatches = batches.length;
      const processedResults: ScreeningResult[] = new Array(articles.length);
      let completedCount = 0;

      setCurrentArticle(`Processing ${totalBatches} batches (${CONCURRENCY} concurrent)...`);

      // Process batches with concurrency
      const processBatchWithIndex = async (batchIndex: number): Promise<void> => {
        if (cancelledRef.current) return;

        const batch = batches[batchIndex];
        const startIdx = batchIndex * BATCH_SIZE;

        try {
          const batchResults = await screenBatch(batch);

          // Store results in correct positions
          batchResults.forEach((result, i) => {
            processedResults[startIdx + i] = result;
          });

          // Save to checkpoint
          for (const result of batchResults) {
            await manager.saveResult(newBatchId, result.articleId, result);
          }

          completedCount += batch.length;
          setResults([...processedResults.filter(Boolean)]);
          setCurrentArticle(`Batch ${batchIndex + 1}/${totalBatches} complete (${completedCount}/${articles.length} articles)`);
        } catch (err) {
          // Create error results for this batch
          const now = new Date().toISOString();
          batch.forEach((article, i) => {
            processedResults[startIdx + i] = {
              articleId: article.id,
              decision: 'NoAbstract',
              rulesUsed: 'Error',
              explanation: `Batch failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
              rawResponse: '',
              processedAt: now,
              parseSuccess: false,
              parseError: String(err),
            };
          });
          completedCount += batch.length;
          setResults([...processedResults.filter(Boolean)]);
        }
      };

      // Process batches with concurrency limit
      const batchQueue = batches.map((_, i) => i);
      const workers: Promise<void>[] = [];

      const worker = async () => {
        while (batchQueue.length > 0 && !cancelledRef.current) {
          const batchIndex = batchQueue.shift();
          if (batchIndex !== undefined) {
            await processBatchWithIndex(batchIndex);
          }
        }
      };

      // Start concurrent workers
      for (let i = 0; i < Math.min(CONCURRENCY, totalBatches); i++) {
        workers.push(worker());
      }

      await Promise.all(workers);

      // Final results
      setResults([...processedResults.filter(Boolean)]);
    } catch (err) {
      setError(`Screening failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      setCurrentArticle('');
      processingRef.current = false;
    }
  };

  // Resume screening with batch processing
  const handleResume = async () => {
    if (!pendingCheckpoint) return;

    setIsLoadingCheckpoint(true);
    try {
      const manager = getCheckpointManager();
      const { batchInfo, articles: savedArticles, results: savedResults } = await manager.loadBatch(pendingCheckpoint.batchId);

      // Restore state
      setRubrics(batchInfo.rubrics);
      setColumnMapping(batchInfo.columnMapping);
      setArticles(savedArticles);
      setResults(savedResults);
      setBatchId(pendingCheckpoint.batchId);

      // Get unprocessed articles
      const unprocessed = await manager.getUnprocessedArticles(pendingCheckpoint.batchId);
      const checkpointBatchId = pendingCheckpoint.batchId;

      setPendingCheckpoint(null);

      // Continue processing with batches
      if (unprocessed.length > 0) {
        processingRef.current = true;
        cancelledRef.current = false;
        setIsProcessing(true);

        const batches = createBatches(unprocessed, BATCH_SIZE);
        const totalBatches = batches.length;
        const newResults: ScreeningResult[] = [];
        let completedCount = savedResults.length;

        setCurrentArticle(`Resuming: ${totalBatches} batches remaining...`);

        // Process batches with concurrency
        const processBatchWithIndex = async (batchIndex: number): Promise<void> => {
          if (cancelledRef.current) return;

          const batch = batches[batchIndex];

          try {
            const batchResults = await screenBatch(batch);
            newResults.push(...batchResults);

            // Save to checkpoint
            for (const result of batchResults) {
              await manager.saveResult(checkpointBatchId, result.articleId, result);
            }

            completedCount += batch.length;
            setResults([...savedResults, ...newResults]);
            setCurrentArticle(`Batch ${batchIndex + 1}/${totalBatches} complete (${completedCount}/${savedArticles.length} articles)`);
          } catch (err) {
            const now = new Date().toISOString();
            batch.forEach((article) => {
              newResults.push({
                articleId: article.id,
                decision: 'NoAbstract',
                rulesUsed: 'Error',
                explanation: `Batch failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
                rawResponse: '',
                processedAt: now,
                parseSuccess: false,
                parseError: String(err),
              });
            });
            completedCount += batch.length;
            setResults([...savedResults, ...newResults]);
          }
        };

        // Process batches with concurrency limit
        const batchQueue = batches.map((_, i) => i);
        const workers: Promise<void>[] = [];

        const worker = async () => {
          while (batchQueue.length > 0 && !cancelledRef.current) {
            const batchIndex = batchQueue.shift();
            if (batchIndex !== undefined) {
              await processBatchWithIndex(batchIndex);
            }
          }
        };

        for (let i = 0; i < Math.min(CONCURRENCY, totalBatches); i++) {
          workers.push(worker());
        }

        await Promise.all(workers);

        setResults([...savedResults, ...newResults]);
        setIsProcessing(false);
        setCurrentArticle('');
        processingRef.current = false;
      }
    } catch (err) {
      setError(`Failed to resume: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoadingCheckpoint(false);
    }
  };

  // Discard checkpoint
  const handleDiscardCheckpoint = async () => {
    if (!pendingCheckpoint) return;

    try {
      const manager = getCheckpointManager();
      await manager.deleteBatch(pendingCheckpoint.batchId);
      setPendingCheckpoint(null);
    } catch (err) {
      console.error('Failed to discard checkpoint:', err);
    }
  };

  // Cancel processing
  const cancelProcessing = () => {
    cancelledRef.current = true;
  };

  // Loading state
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Auth prompt
  if (!isAuthenticated) {
    return <AccessKeyPrompt onValidKey={() => setIsAuthenticated(true)} />;
  }

  const mappingValid = validateColumnMapping(parsedCSV?.headers || [], columnMapping).valid;

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Resume Dialog */}
      {pendingCheckpoint && (
        <ResumeDialog
          checkpoint={pendingCheckpoint}
          onResume={handleResume}
          onDiscard={handleDiscardCheckpoint}
          onStartFresh={() => setPendingCheckpoint(null)}
          isLoading={isLoadingCheckpoint}
        />
      )}

      {/* Sticky Navbar */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto max-w-6xl px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-black">Literature Screening</h1>
              {csvFile && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-sm rounded">
                  {articles.length} articles
                </span>
              )}
            </div>
            <div className="flex items-center gap-6">
              <Link
                href="/mxml"
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
              >
                ← Analysis Hub
              </Link>
              {results.length > 0 && (
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-600">
                    {results.filter((r) => r.decision === 'Include').length} included
                  </span>
                  <span className="text-red-600">
                    {results.filter((r) => r.decision === 'Exclude').length} excluded
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 text-red-700 px-6 py-4 rounded-lg border border-red-200 flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Section 1: Rubrics Configuration */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div
            className="px-6 py-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setShowRubricEditor(!showRubricEditor)}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-black">Screening Rubrics</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Configure inclusion/exclusion rules for screening
                </p>
              </div>
              <div className="flex items-center gap-3">
                {!rubricIsDefault && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                    Customized
                  </span>
                )}
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${showRubricEditor ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
          {showRubricEditor && (
            <div className="p-6">
              <RubricEditor
                rubrics={rubrics}
                onRubricsChange={setRubrics}
                isDefault={rubricIsDefault}
                onSave={saveRubrics}
                onReset={resetRubrics}
                isSaving={isSavingRubric}
                saveStatus={rubricSaveStatus}
                disabled={isProcessing}
              />
            </div>
          )}
        </section>

        {/* Section 2: CSV Upload */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-black">Upload CSV</h2>
            <p className="text-sm text-gray-600 mt-1">
              Upload a Scopus or Web of Science export file
            </p>
          </div>
          <div className="p-6">
            <CsvUpload
              onFileSelect={handleFileSelect}
              selectedFile={csvFile}
              disabled={isProcessing}
              rowCount={parsedCSV?.rowCount}
              detectedFormat={detectedFormat === 'custom' ? undefined : detectedFormat === 'scopus' ? 'Scopus' : 'Web of Science'}
            />
          </div>
        </section>

        {/* Section 3: Screening */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-black">Screen Articles</h2>
            <p className="text-sm text-gray-600 mt-1">
              Start screening articles based on the configured rubrics
            </p>
          </div>
          <div className="p-6">
            {!isProcessing && results.length === 0 ? (
              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={startScreening}
                  disabled={!csvFile || !mappingValid || articles.length === 0}
                  className={`
                    px-6 py-3 text-lg font-medium rounded-lg transition-colors
                    ${!csvFile || !mappingValid || articles.length === 0
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'}
                  `}
                >
                  Start Screening ({articles.length} articles)
                </button>
                {!mappingValid && csvFile && (
                  <p className="text-sm text-yellow-600">
                    Please complete the column mapping above before screening
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <ScreeningProgress
                  total={articles.length}
                  completed={results.length}
                  currentArticle={currentArticle}
                  results={results}
                  isProcessing={isProcessing}
                />

                {isProcessing && (
                  <div className="flex justify-center">
                    <button
                      onClick={cancelProcessing}
                      className="px-4 py-2 text-sm font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    >
                      Cancel Screening
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Results */}
        {results.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-black">Screening Results</h2>
              <p className="text-sm text-gray-600 mt-1">
                View and export screening decisions
              </p>
            </div>
            <div className="p-6">
              <ScreeningResults
                articles={articles}
                results={results}
                fileName={csvFile?.name || 'screening-results'}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
