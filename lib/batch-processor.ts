/**
 * Batch Processor
 *
 * A flexible batch processing system that supports both parallel and sequential
 * processing modes with configurable concurrency, retries, and progress tracking.
 */

import {
  ProcessingConfig,
  DEFAULT_PROCESSING_CONFIG,
} from './processing-config';

export interface BatchItem<T> {
  id: string;
  data: T;
}

export interface ProcessingResult<T, R> {
  id: string;
  item: T;
  success: boolean;
  result?: R;
  error?: string;
  attempts: number;
}

export interface BatchProgress<T, R> {
  total: number;
  completed: number;
  successful: number;
  failed: number;
  currentItem?: BatchItem<T>;
  results: ProcessingResult<T, R>[];
}

export type ProgressCallback<T, R> = (progress: BatchProgress<T, R>) => void;
export type ProcessFunction<T, R> = (item: T, index: number) => Promise<R>;

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Process a single item with retry logic
 */
async function processWithRetry<T, R>(
  item: T,
  index: number,
  processFn: ProcessFunction<T, R>,
  config: ProcessingConfig
): Promise<{ success: boolean; result?: R; error?: string; attempts: number }> {
  let lastError: Error | null = null;
  let attempts = 0;

  for (let i = 0; i < config.retry.maxAttempts; i++) {
    attempts++;
    try {
      const result = await processFn(item, index);
      return { success: true, result, attempts };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `Attempt ${attempts}/${config.retry.maxAttempts} failed for item ${index}:`,
        lastError.message
      );

      // Don't wait after the last attempt
      if (i < config.retry.maxAttempts - 1) {
        const delay = calculateBackoffDelay(
          i,
          config.retry.baseDelay,
          config.retry.maxDelay
        );
        await sleep(delay);
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    attempts,
  };
}

/**
 * Process items sequentially (one at a time)
 */
async function processSequential<T, R>(
  items: BatchItem<T>[],
  processFn: ProcessFunction<T, R>,
  config: ProcessingConfig,
  onProgress?: ProgressCallback<T, R>
): Promise<ProcessingResult<T, R>[]> {
  const results: ProcessingResult<T, R>[] = [];
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Notify progress - starting item
    onProgress?.({
      total: items.length,
      completed: results.length,
      successful,
      failed,
      currentItem: item,
      results,
    });

    // Process the item
    const { success, result, error, attempts } = await processWithRetry(
      item.data,
      i,
      processFn,
      config
    );

    if (success) {
      successful++;
    } else {
      failed++;
      if (config.stopOnError) {
        results.push({
          id: item.id,
          item: item.data,
          success: false,
          error,
          attempts,
        });
        break;
      }
    }

    results.push({
      id: item.id,
      item: item.data,
      success,
      result,
      error,
      attempts,
    });

    // Notify progress - item completed
    onProgress?.({
      total: items.length,
      completed: results.length,
      successful,
      failed,
      currentItem: undefined,
      results,
    });

    // Add delay between requests if configured
    if (config.delayBetweenRequests > 0 && i < items.length - 1) {
      await sleep(config.delayBetweenRequests);
    }
  }

  return results;
}

/**
 * Process items in parallel with concurrency control
 */
async function processParallel<T, R>(
  items: BatchItem<T>[],
  processFn: ProcessFunction<T, R>,
  config: ProcessingConfig,
  onProgress?: ProgressCallback<T, R>
): Promise<ProcessingResult<T, R>[]> {
  const results: ProcessingResult<T, R>[] = new Array(items.length);
  let completed = 0;
  let successful = 0;
  let failed = 0;
  let shouldStop = false;

  // Queue of items to process
  const queue = items.map((item, index) => ({ item, index }));
  let queueIndex = 0;

  // Get next item from queue
  const getNext = (): { item: BatchItem<T>; index: number } | null => {
    if (shouldStop || queueIndex >= queue.length) return null;
    return queue[queueIndex++];
  };

  // Worker function
  const worker = async (): Promise<void> => {
    while (true) {
      const next = getNext();
      if (!next) break;

      const { item, index } = next;

      // Notify progress - starting item (concurrent, so this is less meaningful)
      onProgress?.({
        total: items.length,
        completed,
        successful,
        failed,
        currentItem: item,
        results: results.filter(Boolean),
      });

      // Process the item
      const { success, result, error, attempts } = await processWithRetry(
        item.data,
        index,
        processFn,
        config
      );

      if (success) {
        successful++;
      } else {
        failed++;
        if (config.stopOnError) {
          shouldStop = true;
        }
      }

      completed++;

      results[index] = {
        id: item.id,
        item: item.data,
        success,
        result,
        error,
        attempts,
      };

      // Notify progress - item completed
      onProgress?.({
        total: items.length,
        completed,
        successful,
        failed,
        currentItem: undefined,
        results: results.filter(Boolean),
      });

      // Add delay between requests if configured
      if (config.delayBetweenRequests > 0) {
        await sleep(config.delayBetweenRequests);
      }
    }
  };

  // Create workers
  const concurrency = Math.min(config.concurrency, items.length);
  const workers = Array(concurrency)
    .fill(null)
    .map(() => worker());

  // Wait for all workers to complete
  await Promise.all(workers);

  return results.filter(Boolean);
}

/**
 * Main batch processor function
 *
 * Processes a batch of items either sequentially or in parallel based on configuration.
 *
 * @param items - Array of items to process
 * @param processFn - Function to process each item
 * @param config - Processing configuration (optional, uses defaults if not provided)
 * @param onProgress - Progress callback (optional)
 * @returns Array of processing results
 *
 * @example
 * ```typescript
 * const items = files.map((file, i) => ({ id: `file-${i}`, data: file }));
 *
 * const results = await processBatch(
 *   items,
 *   async (file, index) => {
 *     const response = await fetch('/api/analyze', {
 *       method: 'POST',
 *       body: JSON.stringify({ file }),
 *     });
 *     return response.json();
 *   },
 *   { mode: 'parallel', concurrency: 5 },
 *   (progress) => {
 *     console.log(`${progress.completed}/${progress.total} complete`);
 *   }
 * );
 * ```
 */
export async function processBatch<T, R>(
  items: BatchItem<T>[],
  processFn: ProcessFunction<T, R>,
  config: Partial<ProcessingConfig> = {},
  onProgress?: ProgressCallback<T, R>
): Promise<ProcessingResult<T, R>[]> {
  const finalConfig: ProcessingConfig = {
    ...DEFAULT_PROCESSING_CONFIG,
    ...config,
    retry: {
      ...DEFAULT_PROCESSING_CONFIG.retry,
      ...config.retry,
    },
  };

  if (items.length === 0) {
    return [];
  }

  // Initial progress notification
  onProgress?.({
    total: items.length,
    completed: 0,
    successful: 0,
    failed: 0,
    currentItem: undefined,
    results: [],
  });

  if (finalConfig.mode === 'parallel') {
    return processParallel(items, processFn, finalConfig, onProgress);
  } else {
    return processSequential(items, processFn, finalConfig, onProgress);
  }
}

/**
 * Utility to create batch items from an array
 */
export function createBatchItems<T>(
  items: T[],
  idPrefix: string = 'item'
): BatchItem<T>[] {
  return items.map((data, index) => ({
    id: `${idPrefix}-${index}`,
    data,
  }));
}
