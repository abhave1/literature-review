'use client';

/**
 * Client-side PDF text extraction using pdf-parse web build from CDN
 * This runs in the browser, avoiding all server-side dependency issues
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
 * Extract text from multiple PDF files in parallel
 * @param files - Array of PDF File objects
 * @param onProgress - Optional callback for progress updates
 * @returns Array of extraction results
 */
export async function extractTextFromPDFs(
  files: File[],
  onProgress?: (fileName: string, current: number, total: number) => void
): Promise<
  Array<{
    fileName: string;
    success: boolean;
    text?: string;
    metadata?: {
      pageCount: number;
      title?: string;
      author?: string;
    };
    error?: string;
  }>
> {
  // Ensure parser is initialized
  if (!isInitialized) {
    await initPDFParser();
  }

  const results = [];

  // Process files sequentially to avoid overwhelming the browser
  // (parallel processing can cause memory issues with large PDFs)
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (onProgress) {
      onProgress(file.name, i + 1, files.length);
    }

    try {
      const extraction = await extractTextFromPDF(file);

      results.push({
        fileName: file.name,
        success: true,
        text: extraction.text,
        metadata: extraction.metadata,
      });
    } catch (error) {
      results.push({
        fileName: file.name,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse PDF',
      });
    }
  }

  return results;
}
