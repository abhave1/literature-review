/**
 * Processing Configuration
 *
 * This module defines the configuration options for file processing,
 * including the ability to switch between parallel and sequential processing modes.
 */

export type ProcessingMode = 'sequential' | 'parallel';

export interface ProcessingConfig {
  /** Processing mode: 'sequential' processes one file at a time, 'parallel' processes multiple concurrently */
  mode: ProcessingMode;

  /** Maximum number of concurrent requests when in parallel mode (default: 5) */
  concurrency: number;

  /** Delay between requests in milliseconds (useful for rate limiting) */
  delayBetweenRequests: number;

  /** Whether to stop on first error or continue processing */
  stopOnError: boolean;

  /** Retry configuration */
  retry: {
    /** Maximum number of retry attempts */
    maxAttempts: number;
    /** Base delay for exponential backoff in ms */
    baseDelay: number;
    /** Maximum delay between retries in ms */
    maxDelay: number;
  };
}

export const DEFAULT_PROCESSING_CONFIG: ProcessingConfig = {
  mode: 'parallel',
  concurrency: 5,
  delayBetweenRequests: 0,
  stopOnError: false,
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
  },
};

/**
 * Create a processing config with custom overrides
 */
export function createProcessingConfig(
  overrides: Partial<ProcessingConfig>
): ProcessingConfig {
  return {
    ...DEFAULT_PROCESSING_CONFIG,
    ...overrides,
    retry: {
      ...DEFAULT_PROCESSING_CONFIG.retry,
      ...overrides.retry,
    },
  };
}

/**
 * Storage key for persisting processing config
 */
export const PROCESSING_CONFIG_STORAGE_KEY = 'processing_config';

/**
 * Load processing config from localStorage
 */
export function loadProcessingConfig(): Partial<ProcessingConfig> {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(PROCESSING_CONFIG_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load processing config:', e);
  }
  return {};
}

/**
 * Save processing config to localStorage
 */
export function saveProcessingConfig(config: Partial<ProcessingConfig>): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(PROCESSING_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save processing config:', e);
  }
}
