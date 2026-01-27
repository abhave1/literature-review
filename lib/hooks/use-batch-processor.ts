/**
 * useBatchProcessor Hook
 *
 * A React hook for managing batch processing with support for
 * parallel and sequential modes, progress tracking, and state management.
 */

import { useState, useCallback, useRef } from 'react';
import {
  processBatch,
  createBatchItems,
  BatchItem,
  ProcessingResult,
  BatchProgress,
  ProcessFunction,
} from '../batch-processor';
import {
  ProcessingConfig,
  ProcessingMode,
  loadProcessingConfig,
  saveProcessingConfig,
  createProcessingConfig,
} from '../processing-config';

export interface UseBatchProcessorOptions {
  /** Default processing mode */
  defaultMode?: ProcessingMode;
  /** Default concurrency for parallel mode */
  defaultConcurrency?: number;
  /** Auto-save config to localStorage */
  persistConfig?: boolean;
}

export interface UseBatchProcessorState<T, R> {
  /** Whether processing is currently active */
  isProcessing: boolean;
  /** Current progress */
  progress: BatchProgress<T, R> | null;
  /** Processing results */
  results: ProcessingResult<T, R>[];
  /** Any error that occurred */
  error: string | null;
  /** Current processing config */
  config: ProcessingConfig;
}

export interface UseBatchProcessorActions<T, R> {
  /** Start processing a batch of items */
  process: (
    items: T[],
    processFn: ProcessFunction<T, R>,
    idPrefix?: string
  ) => Promise<ProcessingResult<T, R>[]>;
  /** Cancel current processing */
  cancel: () => void;
  /** Reset state */
  reset: () => void;
  /** Update processing config */
  setConfig: (updates: Partial<ProcessingConfig>) => void;
  /** Set processing mode */
  setMode: (mode: ProcessingMode) => void;
  /** Set concurrency */
  setConcurrency: (concurrency: number) => void;
}

export type UseBatchProcessorReturn<T, R> = UseBatchProcessorState<T, R> &
  UseBatchProcessorActions<T, R>;

/**
 * Hook for batch processing with parallel/sequential mode support
 *
 * @example
 * ```tsx
 * const processor = useBatchProcessor<FileData, AnalysisResult>({
 *   defaultMode: 'sequential',
 *   persistConfig: true,
 * });
 *
 * const handleAnalyze = async () => {
 *   const results = await processor.process(
 *     files,
 *     async (file) => {
 *       const response = await fetch('/api/analyze', { ... });
 *       return response.json();
 *     }
 *   );
 * };
 *
 * // Toggle between modes
 * <button onClick={() => processor.setMode(
 *   processor.config.mode === 'sequential' ? 'parallel' : 'sequential'
 * )}>
 *   Switch to {processor.config.mode === 'sequential' ? 'Parallel' : 'Sequential'}
 * </button>
 * ```
 */
export function useBatchProcessor<T, R>(
  options: UseBatchProcessorOptions = {}
): UseBatchProcessorReturn<T, R> {
  const {
    defaultMode = 'sequential',
    defaultConcurrency = 5,
    persistConfig = true,
  } = options;

  // Load persisted config or use defaults
  const getInitialConfig = (): ProcessingConfig => {
    if (persistConfig) {
      const saved = loadProcessingConfig();
      return createProcessingConfig({
        mode: saved.mode || defaultMode,
        concurrency: saved.concurrency || defaultConcurrency,
        ...saved,
      });
    }
    return createProcessingConfig({
      mode: defaultMode,
      concurrency: defaultConcurrency,
    });
  };

  const [config, setConfigState] = useState<ProcessingConfig>(getInitialConfig);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BatchProgress<T, R> | null>(null);
  const [results, setResults] = useState<ProcessingResult<T, R>[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Ref for cancellation
  const cancelledRef = useRef(false);
  const processingRef = useRef(false);

  // Update config with persistence
  const setConfig = useCallback(
    (updates: Partial<ProcessingConfig>) => {
      setConfigState((prev) => {
        const next = createProcessingConfig({ ...prev, ...updates });
        if (persistConfig) {
          saveProcessingConfig(next);
        }
        return next;
      });
    },
    [persistConfig]
  );

  // Convenience method to set mode
  const setMode = useCallback(
    (mode: ProcessingMode) => {
      setConfig({ mode });
    },
    [setConfig]
  );

  // Convenience method to set concurrency
  const setConcurrency = useCallback(
    (concurrency: number) => {
      setConfig({ concurrency: Math.max(1, Math.min(20, concurrency)) });
    },
    [setConfig]
  );

  // Reset state
  const reset = useCallback(() => {
    setProgress(null);
    setResults([]);
    setError(null);
  }, []);

  // Cancel processing
  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  // Main process function
  const process = useCallback(
    async (
      items: T[],
      processFn: ProcessFunction<T, R>,
      idPrefix: string = 'item'
    ): Promise<ProcessingResult<T, R>[]> => {
      if (processingRef.current) {
        throw new Error('Processing already in progress');
      }

      processingRef.current = true;
      cancelledRef.current = false;
      setIsProcessing(true);
      setError(null);
      setResults([]);
      setProgress(null);

      try {
        const batchItems = createBatchItems(items, idPrefix);

        // Wrap the process function to check for cancellation
        const wrappedProcessFn: ProcessFunction<T, R> = async (
          item,
          index
        ) => {
          if (cancelledRef.current) {
            throw new Error('Processing cancelled');
          }
          return processFn(item, index);
        };

        const processResults = await processBatch(
          batchItems,
          wrappedProcessFn,
          config,
          (prog) => {
            if (!cancelledRef.current) {
              setProgress(prog);
              setResults([...prog.results]);
            }
          }
        );

        setResults(processResults);
        return processResults;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Processing failed';
        setError(errorMessage);
        throw err;
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
      }
    },
    [config]
  );

  return {
    // State
    isProcessing,
    progress,
    results,
    error,
    config,
    // Actions
    process,
    cancel,
    reset,
    setConfig,
    setMode,
    setConcurrency,
  };
}
