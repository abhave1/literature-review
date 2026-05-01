'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import AccessKeyPrompt from '@/components/AccessKeyPrompt';
import CsvUpload from '@/components/screening/CsvUpload';
import ScreeningProgress from '@/components/screening/ScreeningProgress';
import ScreeningResults from '@/components/screening/ScreeningResults';
import ResumeDialog from '@/components/screening/ResumeDialog';

import { parseCSV, mapToArticleRows, validateColumnMapping, type ArticleRow, type ParsedCSV } from '@/lib/screening/csv-parser';
import { detectFormat, type ColumnMapping } from '@/lib/screening/column-detector';
import { type ScreeningRubrics } from '@/lib/screening/default-rubrics';
import { type ScreeningResult } from '@/lib/screening/response-parser';
import { getCheckpointManager, type CheckpointInfo } from '@/lib/screening/checkpoint-manager';

// CSCL prototype defaults: only inclusion rules, exclusion rules, and definitions
const DEFAULT_CSCL_RUBRICS: ScreeningRubrics = {
  inclusionRules: '- RI1: [Enter your first inclusion rule]\n- RI2: [Enter your second inclusion rule]',
  exclusionRules: '- RE1: [Enter your first exclusion rule]\n- RE2: [Enter your second exclusion rule]',
  definitions: '[Enter operational definitions of key terms used in your inclusion/exclusion rules]',
  specialRules: '',
  mlTerms: '',
  psychometricianJobs: '',
};

const CSCL_SCREENING_PROMPT_TEMPLATE = `You are a systematic review expert. You will screen multiple studies based on their Title, Abstract, Year, and Journal.

For EACH study, follow these steps:
- Step 1: Label as "NoAbstract" if abstract is missing/empty. Otherwise, continue.
- Step 2: Include if it meets ANY Inclusion Rule. Record ALL matching rules.
- Step 3: For included studies, further check the Exclusion Rules - exclude if any applies.
- Step 4: For excluded studies (excluded in Step 2 because no Inclusion Rule applied, or excluded in Step 3), identify which Exclusion Rule(s) were applied, and replace "Rules Used" with all identified Exclusion Rule(s).

{{DEFINITIONS}}

=== INCLUSION RULES ===
{{INCLUSION_RULES}}

=== EXCLUSION RULES ===
{{EXCLUSION_RULES}}

=== OUTPUT FORMAT ===
You MUST respond with valid JSON only. No markdown, no explanation outside JSON.
Return an array of screening results, one for each article in the exact order provided.

{
  "results": [
    {
      "index": 0,
      "decision": "Include|Exclude|NoAbstract",
      "rules_used": "RI1, RI3 or RE2, RE4 or NoAbstract or No RI applied",
      "explanation": "Brief 1-2 sentence rationale"
    }
  ]
}

CRITICAL RULES:
1. Return EXACTLY one result per article, in the same order as input
2. "decision" must be exactly "Include", "Exclude", or "NoAbstract"
3. "rules_used" should list rule prefixes (RI1, RE2, etc.) or "No RI applied" or "NoAbstract"
4. Keep explanations brief but informative
5. Output ONLY valid JSON, nothing else`;

// Rubric section configs for the CSCL prototype (only 3 sections)
interface SectionConfig {
  key: keyof ScreeningRubrics;
  label: string;
  description: string;
  rows: number;
}

const CSCL_RUBRIC_SECTIONS: SectionConfig[] = [
  {
    key: 'inclusionRules',
    label: 'Inclusion Rules (RI)',
    description: 'Rules that, if met, include the article for review. Each rule must be listed on a separate line, led by e.g., "- RI1:"',
    rows: 10,
  },
  {
    key: 'exclusionRules',
    label: 'Exclusion Rules (RE)',
    description: 'Rules that exclude articles from the review. Each rule must be listed on a separate line, led by e.g., "- RE1:"',
    rows: 10,
  },
  {
    key: 'definitions',
    label: 'Definitions',
    description: 'Operational definitions of key terms used in your inclusion/exclusion rules',
    rows: 6,
  },
];

export default function MetadataScreeningCSCLPage() {
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
  const [rubrics, setRubrics] = useState<ScreeningRubrics>(DEFAULT_CSCL_RUBRICS);
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['inclusionRules', 'exclusionRules']));

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

  // Check for pending batch when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      checkForPendingBatch();
    }
  }, [isAuthenticated]);

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

  const toggleSection = (key: string) => {
    const next = new Set(expandedSections);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedSections(next);
  };

  const handleRubricChange = (key: keyof ScreeningRubrics, value: string) => {
    setRubrics(prev => ({ ...prev, [key]: value }));
  };

  // Batch configuration
  const BATCH_SIZE = 12;
  const CONCURRENCY = 5;

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
        promptTemplate: CSCL_SCREENING_PROMPT_TEMPLATE,
      }),
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Batch screening failed');
    }

    return data.results;
  };

  const createBatches = (items: ArticleRow[], batchSize: number): ArticleRow[][] => {
    const batches: ArticleRow[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  };

  // Start screening
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
      const manager = getCheckpointManager();
      await manager.createBatch(newBatchId, csvFile?.name || 'unknown', articles, rubrics, columnMapping);

      const batches = createBatches(articles, BATCH_SIZE);
      const totalBatches = batches.length;
      const processedResults: ScreeningResult[] = new Array(articles.length);
      let completedCount = 0;

      setCurrentArticle(`Processing ${totalBatches} batches (${CONCURRENCY} concurrent)...`);

      const processBatchWithIndex = async (batchIndex: number): Promise<void> => {
        if (cancelledRef.current) return;

        const batch = batches[batchIndex];
        const startIdx = batchIndex * BATCH_SIZE;

        try {
          const batchResults = await screenBatch(batch);

          batchResults.forEach((result, i) => {
            processedResults[startIdx + i] = result;
          });

          for (const result of batchResults) {
            await manager.saveResult(newBatchId, result.articleId, result);
          }

          completedCount += batch.length;
          setResults([...processedResults.filter(Boolean)]);
          setCurrentArticle(`Batch ${batchIndex + 1}/${totalBatches} complete (${completedCount}/${articles.length} articles)`);
        } catch (err) {
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

      setResults([...processedResults.filter(Boolean)]);
    } catch (err) {
      setError(`Screening failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      setCurrentArticle('');
      processingRef.current = false;
    }
  };

  // Resume screening
  const handleResume = async () => {
    if (!pendingCheckpoint) return;

    setIsLoadingCheckpoint(true);
    try {
      const manager = getCheckpointManager();
      const { batchInfo, articles: savedArticles, results: savedResults } = await manager.loadBatch(pendingCheckpoint.batchId);

      setRubrics(batchInfo.rubrics);
      setColumnMapping(batchInfo.columnMapping);
      setArticles(savedArticles);
      setResults(savedResults);
      setBatchId(pendingCheckpoint.batchId);

      const unprocessed = await manager.getUnprocessedArticles(pendingCheckpoint.batchId);
      const checkpointBatchId = pendingCheckpoint.batchId;

      setPendingCheckpoint(null);

      if (unprocessed.length > 0) {
        processingRef.current = true;
        cancelledRef.current = false;
        setIsProcessing(true);

        const batches = createBatches(unprocessed, BATCH_SIZE);
        const totalBatches = batches.length;
        const newResults: ScreeningResult[] = [];
        let completedCount = savedResults.length;

        setCurrentArticle(`Resuming: ${totalBatches} batches remaining...`);

        const processBatchWithIndex = async (batchIndex: number): Promise<void> => {
          if (cancelledRef.current) return;

          const batch = batches[batchIndex];

          try {
            const batchResults = await screenBatch(batch);
            newResults.push(...batchResults);

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
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm backdrop-blur-sm bg-opacity-90">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center max-w-7xl">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                AI-Assisted Literature Review Toolset
              </h1>
              <p className="text-sm text-gray-600">Step 1: Article Metadata Screening</p>
            </div>
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">Beta</span>
          </div>
          <div className="flex items-center gap-6">
            <Link
              href="/fulltext-analysis-close-ended-cscl-prototype"
              className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
            >
              Step 2: Close-Ended &rarr;
            </Link>
            <Link
              href="/fulltext-analysis-open-ended-cscl-prototype"
              className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
            >
              Step 2: Open-Ended &rarr;
            </Link>
            <div className="text-sm font-medium text-gray-500">
              {csvFile && <>{articles.length} articles</>}
              {results.length > 0 && (
                <>
                  {' \u2022 '}
                  <span className="text-green-600">{results.filter((r) => r.decision === 'Include').length} included</span>
                  {' \u2022 '}
                  <span className="text-red-600">{results.filter((r) => r.decision === 'Exclude').length} excluded</span>
                </>
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

        {/* Section 1: Screening Rubrics (only RI, RE, Definitions) */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div
            className="px-6 py-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setShowRubricEditor(!showRubricEditor)}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-black">Screening Rubrics</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Configure inclusion/exclusion rules for screening. Each rule must be listed on a separate line, with inclusion rules led by e.g., &quot;- RI1:&quot; and exclusion rules led by e.g., &quot;- RE1:&quot;
                </p>
              </div>
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
          {showRubricEditor && (
            <div className="p-6 space-y-4">
              {/* Inline rubric editor with only 3 sections */}
              <div className="space-y-2">
                {CSCL_RUBRIC_SECTIONS.map(({ key, label, description, rows }) => {
                  const isExpanded = expandedSections.has(key);
                  const value = rubrics[key] || '';

                  return (
                    <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleSection(key)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="text-left">
                          <span className="font-medium text-black">{label}</span>
                          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                        </div>
                        <svg
                          className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isExpanded && (
                        <div className="p-4 border-t border-gray-200">
                          <textarea
                            value={value}
                            onChange={(e) => handleRubricChange(key, e.target.value)}
                            disabled={isProcessing}
                            rows={rows}
                            className={`
                              w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-black
                              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                              ${isProcessing ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
                            `}
                            placeholder={`Enter ${label.toLowerCase()}...`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Section 2: CSV Upload */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-black">Upload CSV</h2>
            <p className="text-sm text-gray-600 mt-1">
              Upload a CSV file that includes columns named &quot;Title&quot;, &quot;Abstract&quot;, &quot;Year&quot; (or &quot;Publication Year&quot;), and &quot;Source title&quot; (or &quot;Journal&quot;). Scopus and Web of Science export formats are auto-detected.
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
