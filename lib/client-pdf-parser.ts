'use client';

/**
 * Client-side PDF text extraction using pdf-parse web build from CDN
 * This runs in the browser, avoiding all server-side dependency issues
 *
 * PARALLEL PROCESSING APPROACH:
 * - Uses a configurable concurrency pool to process multiple PDFs simultaneously
 * - Memory-aware batching prevents loading all PDFs at once
 * - Individual file failures don't crash the entire batch
 * - Progress callback shows both overall and per-file status
 */

// Global reference to PDFParse loaded from CDN
declare global {
  interface Window {
    PDFParse: any;
  }
}

let isInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Configuration options for parallel PDF extraction
 */
export interface ParallelExtractionConfig {
  /** Maximum number of PDFs to process concurrently (default: 3) */
  maxConcurrent: number;
  /** Number of files to process before forcing garbage collection hint (default: 10) */
  chunkSize: number;
  /** Whether to abort all remaining extractions on first error (default: false) */
  abortOnError: boolean;
}

const DEFAULT_CONFIG: ParallelExtractionConfig = {
  maxConcurrent: 3,
  chunkSize: 10,
  abortOnError: false,
};

/**
 * Enhanced progress callback with detailed status
 */
export interface ParallelProgressInfo {
  /** Name of the file that triggered this update */
  fileName: string;
  /** Current file number (1-indexed) */
  current: number;
  /** Total number of files */
  total: number;
  /** Files currently being processed */
  inProgress: string[];
  /** Number of files completed */
  completed: number;
  /** Number of files that failed */
  failed: number;
  /** Status of this specific file: 'started' | 'completed' | 'failed' */
  status: 'started' | 'completed' | 'failed';
}

/**
 * Initialize PDF parser by loading script from CDN
 * This only needs to be called once
 */
export async function initPDFParser(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Check if already loaded
      if (typeof window !== 'undefined' && window.PDFParse) {
        isInitialized = true;
        console.log('PDF parser already loaded');
        return;
      }

      // Dynamically create and load the script
      const script = document.createElement('script');
      script.type = 'module';
      script.textContent = `
        import { PDFParse } from 'https://cdn.jsdelivr.net/npm/pdf-parse@2.4.5/dist/pdf-parse/web/pdf-parse.es.js';

        // Set worker
        PDFParse.setWorker('https://cdn.jsdelivr.net/npm/pdf-parse@2.4.5/dist/pdf-parse/web/pdf.worker.mjs');

        // Expose globally
        window.PDFParse = PDFParse;

        // Dispatch event when ready
        window.dispatchEvent(new Event('pdfparse-ready'));
      `;

      // Wait for the script to signal it's ready
      const readyPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('PDF parser initialization timeout'));
        }, 10000);

        window.addEventListener('pdfparse-ready', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
      });

      document.head.appendChild(script);
      await readyPromise;

      isInitialized = true;
      console.log('PDF parser initialized successfully');
    } catch (error) {
      console.error('Failed to initialize PDF parser:', error);
      initPromise = null;
      throw new Error('Failed to initialize PDF parser. Please refresh and try again.');
    }
  })();

  return initPromise;
}

/**
 * Extract text from a PDF file in the browser
 * @param file - The PDF File object
 * @returns Extracted text and metadata
 */
export async function extractTextFromPDF(
  file: File
): Promise<{
  text: string;
  metadata: {
    pageCount: number;
    title?: string;
    author?: string;
  };
}> {
  // Ensure parser is initialized
  if (!isInitialized) {
    await initPDFParser();
  }

  if (!window.PDFParse) {
    throw new Error('PDFParse not loaded. Please refresh the page.');
  }

  try {
    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Create parser instance with the PDF data
    const parser = new window.PDFParse({ data: arrayBuffer });

    // Get document info
    const info = await parser.getInfo({ parsePageInfo: true });

    // Extract all text
    const textResult = await parser.getText();

    // Clean up
    await parser.destroy();

    return {
      text: textResult.text || '',
      metadata: {
        pageCount: info.total || 0,
        title: info.info?.Title,
        author: info.info?.Author,
      },
    };
  } catch (error) {
    console.error(`Failed to extract text from ${file.name}:`, error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Result type for PDF extraction
 */
export interface PDFExtractionResult {
  fileName: string;
  success: boolean;
  text?: string;
  metadata?: {
    pageCount: number;
    title?: string;
    author?: string;
  };
  error?: string;
}

/**
 * Worker pool for managing concurrent PDF extractions
 * Uses a semaphore-like approach to limit concurrency
 */
class ConcurrencyPool {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }

    // Wait in queue until a slot is available
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

/**
 * Extract text from multiple PDF files in parallel with configurable concurrency
 *
 * PARALLEL PROCESSING STRATEGY:
 * 1. Files are processed in a worker pool with limited concurrency
 * 2. Each file is extracted independently - failures don't affect others
 * 3. Progress is reported for each file start/completion
 * 4. Memory is managed by processing in chunks with optional GC hints
 *
 * @param files - Array of PDF File objects
 * @param onProgress - Optional callback for progress updates (supports both simple and detailed formats)
 * @param config - Optional configuration for parallel processing
 * @returns Array of extraction results in the same order as input files
 */
export async function extractTextFromPDFs(
  files: File[],
  onProgress?: ((fileName: string, current: number, total: number) => void) | ((info: ParallelProgressInfo) => void),
  config?: Partial<ParallelExtractionConfig>
): Promise<PDFExtractionResult[]> {
  // Merge with default config
  const finalConfig: ParallelExtractionConfig = { ...DEFAULT_CONFIG, ...config };

  // Ensure parser is initialized before starting parallel processing
  if (!isInitialized) {
    await initPDFParser();
  }

  const total = files.length;
  if (total === 0) {
    return [];
  }

  // For single files, just process directly (no need for pool overhead)
  if (total === 1) {
    const file = files[0];
    notifyProgress(onProgress, {
      fileName: file.name,
      current: 1,
      total: 1,
      inProgress: [file.name],
      completed: 0,
      failed: 0,
      status: 'started',
    });

    try {
      const extraction = await extractTextFromPDF(file);
      notifyProgress(onProgress, {
        fileName: file.name,
        current: 1,
        total: 1,
        inProgress: [],
        completed: 1,
        failed: 0,
        status: 'completed',
      });
      return [{
        fileName: file.name,
        success: true,
        text: extraction.text,
        metadata: extraction.metadata,
      }];
    } catch (error) {
      notifyProgress(onProgress, {
        fileName: file.name,
        current: 1,
        total: 1,
        inProgress: [],
        completed: 0,
        failed: 1,
        status: 'failed',
      });
      return [{
        fileName: file.name,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse PDF',
      }];
    }
  }

  // Create concurrency pool
  const pool = new ConcurrencyPool(finalConfig.maxConcurrent);

  // Track processing state
  const inProgress = new Set<string>();
  let completedCount = 0;
  let failedCount = 0;
  let processedCount = 0;
  let aborted = false;

  // Pre-allocate results array to maintain order
  const results: PDFExtractionResult[] = new Array(total);

  /**
   * Process a single file with pool-managed concurrency
   */
  async function processFile(file: File, index: number): Promise<void> {
    // Check if we should abort
    if (aborted) {
      results[index] = {
        fileName: file.name,
        success: false,
        error: 'Processing aborted due to previous error',
      };
      return;
    }

    // Wait for an available slot in the pool
    await pool.acquire();

    try {
      // Track that we're processing this file
      inProgress.add(file.name);

      // Notify progress: file started
      notifyProgress(onProgress, {
        fileName: file.name,
        current: processedCount + 1,
        total,
        inProgress: Array.from(inProgress),
        completed: completedCount,
        failed: failedCount,
        status: 'started',
      });

      // Actually extract the PDF
      const extraction = await extractTextFromPDF(file);

      // Store successful result
      results[index] = {
        fileName: file.name,
        success: true,
        text: extraction.text,
        metadata: extraction.metadata,
      };

      completedCount++;
      processedCount++;

      // Notify progress: file completed
      inProgress.delete(file.name);
      notifyProgress(onProgress, {
        fileName: file.name,
        current: processedCount,
        total,
        inProgress: Array.from(inProgress),
        completed: completedCount,
        failed: failedCount,
        status: 'completed',
      });

    } catch (error) {
      // Store failed result
      results[index] = {
        fileName: file.name,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse PDF',
      };

      failedCount++;
      processedCount++;

      // Notify progress: file failed
      inProgress.delete(file.name);
      notifyProgress(onProgress, {
        fileName: file.name,
        current: processedCount,
        total,
        inProgress: Array.from(inProgress),
        completed: completedCount,
        failed: failedCount,
        status: 'failed',
      });

      // Check if we should abort on error
      if (finalConfig.abortOnError) {
        aborted = true;
      }

    } finally {
      // Always release the pool slot
      pool.release();
    }
  }

  // Process files in chunks to manage memory
  // This prevents loading all file promises at once while still allowing parallelism
  const { chunkSize } = finalConfig;

  for (let chunkStart = 0; chunkStart < total; chunkStart += chunkSize) {
    // Check if aborted
    if (aborted) break;

    const chunkEnd = Math.min(chunkStart + chunkSize, total);
    const chunkFiles = files.slice(chunkStart, chunkEnd);

    // Start all files in this chunk (they'll wait in pool if needed)
    const chunkPromises = chunkFiles.map((file, i) =>
      processFile(file, chunkStart + i)
    );

    // Wait for this chunk to complete
    await Promise.all(chunkPromises);

    // Hint to garbage collector between chunks (if available)
    // This helps release memory from processed PDFs before loading more
    if (chunkEnd < total && typeof window !== 'undefined') {
      // Small delay to allow GC to run
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  return results;
}

/**
 * Helper to call progress callback with either simple or detailed format
 * Maintains backward compatibility with existing code that uses simple callback
 */
function notifyProgress(
  onProgress: ((fileName: string, current: number, total: number) => void) | ((info: ParallelProgressInfo) => void) | undefined,
  info: ParallelProgressInfo
): void {
  if (!onProgress) return;

  // Detect callback type by checking if it accepts 3 arguments (simple) or 1 (detailed)
  // We call with the simple format first for backward compatibility
  try {
    // Simple callback format: (fileName, current, total)
    (onProgress as (fileName: string, current: number, total: number) => void)(
      info.fileName,
      info.current,
      info.total
    );
  } catch {
    // If that fails, try detailed format
    (onProgress as (info: ParallelProgressInfo) => void)(info);
  }
}

/**
 * Extract text from an ArrayBuffer (for use with fetched blobs)
 */
export async function extractTextFromBuffer(
  buffer: ArrayBuffer | Buffer,
  fileName: string
): Promise<{
  text: string;
  metadata: {
    pageCount: number;
    title?: string;
    author?: string;
  };
}> {
  // Ensure parser is initialized
  if (!isInitialized) {
    await initPDFParser();
  }

  if (!window.PDFParse) {
    throw new Error('PDFParse not loaded. Please refresh the page.');
  }

  try {
    // Ensure we have an ArrayBuffer
    const data = buffer instanceof Buffer ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer;

    // Create parser instance with the PDF data
    const parser = new window.PDFParse({ data });

    // Get document info
    const info = await parser.getInfo({ parsePageInfo: true });

    // Extract all text
    const textResult = await parser.getText();

    // Clean up
    await parser.destroy();

    return {
      text: textResult.text || '',
      metadata: {
        pageCount: info.total || 0,
        title: info.info?.Title,
        author: info.info?.Author,
      },
    };
  } catch (error) {
    console.error(`Failed to extract text from ${fileName}:`, error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Utility to estimate optimal concurrency based on device capabilities
 * Can be used to dynamically set maxConcurrent based on user's device
 */
export function getRecommendedConcurrency(): number {
  if (typeof navigator === 'undefined') {
    return DEFAULT_CONFIG.maxConcurrent;
  }

  // Use hardware concurrency as a hint, but cap it
  const cores = navigator.hardwareConcurrency || 4;

  // Use roughly half the cores for PDF processing
  // This leaves headroom for UI and other browser tasks
  const recommended = Math.max(2, Math.min(Math.floor(cores / 2), 6));

  return recommended;
}

/**
 * Create a configuration object with recommended settings for the current device
 */
export function getRecommendedConfig(): ParallelExtractionConfig {
  return {
    maxConcurrent: getRecommendedConcurrency(),
    chunkSize: 10,
    abortOnError: false,
  };
}
