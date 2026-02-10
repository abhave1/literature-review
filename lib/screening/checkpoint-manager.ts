/**
 * Checkpoint Manager for Literature Screening
 * Uses IndexedDB to persist batch progress for resume capability
 */

import type { ArticleRow } from './csv-parser';
import type { ScreeningResult } from './response-parser';
import type { ScreeningRubrics } from './default-rubrics';
import type { ColumnMapping } from './column-detector';

const DB_NAME = 'screening-checkpoints';
const DB_VERSION = 1;

// Store names
const BATCHES_STORE = 'batches';
const ARTICLES_STORE = 'articles';
const RESULTS_STORE = 'results';

export interface BatchInfo {
  batchId: string;
  fileName: string;
  totalItems: number;
  createdAt: string;
  rubrics: ScreeningRubrics;
  columnMapping: ColumnMapping;
}

export interface CheckpointInfo {
  batchId: string;
  fileName: string;
  totalItems: number;
  completedItems: number;
  timestamp: string;
}

/**
 * Open IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create batches store
      if (!db.objectStoreNames.contains(BATCHES_STORE)) {
        db.createObjectStore(BATCHES_STORE, { keyPath: 'batchId' });
      }

      // Create articles store with index on batchId
      if (!db.objectStoreNames.contains(ARTICLES_STORE)) {
        const articlesStore = db.createObjectStore(ARTICLES_STORE, {
          keyPath: ['batchId', 'articleId'],
        });
        articlesStore.createIndex('batchId', 'batchId', { unique: false });
      }

      // Create results store with index on batchId
      if (!db.objectStoreNames.contains(RESULTS_STORE)) {
        const resultsStore = db.createObjectStore(RESULTS_STORE, {
          keyPath: ['batchId', 'articleId'],
        });
        resultsStore.createIndex('batchId', 'batchId', { unique: false });
      }
    };
  });
}

/**
 * Checkpoint Manager class
 */
export class CheckpointManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB();
    }
    return this.dbPromise;
  }

  /**
   * Create a new batch checkpoint
   */
  async createBatch(
    batchId: string,
    fileName: string,
    articles: ArticleRow[],
    rubrics: ScreeningRubrics,
    columnMapping: ColumnMapping
  ): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [BATCHES_STORE, ARTICLES_STORE],
        'readwrite'
      );

      transaction.onerror = () => reject(new Error('Failed to create batch'));
      transaction.oncomplete = () => resolve();

      // Store batch info
      const batchInfo: BatchInfo = {
        batchId,
        fileName,
        totalItems: articles.length,
        createdAt: new Date().toISOString(),
        rubrics,
        columnMapping,
      };

      const batchesStore = transaction.objectStore(BATCHES_STORE);
      batchesStore.put(batchInfo);

      // Store all articles
      const articlesStore = transaction.objectStore(ARTICLES_STORE);
      for (const article of articles) {
        articlesStore.put({
          batchId,
          articleId: article.id,
          article,
        });
      }
    });
  }

  /**
   * Save a screening result for an article
   */
  async saveResult(
    batchId: string,
    articleId: string,
    result: ScreeningResult
  ): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(RESULTS_STORE, 'readwrite');

      transaction.onerror = () => reject(new Error('Failed to save result'));
      transaction.oncomplete = () => resolve();

      const store = transaction.objectStore(RESULTS_STORE);
      store.put({
        batchId,
        articleId,
        result,
      });
    });
  }

  /**
   * Get all pending (incomplete) batches
   */
  async getPendingBatches(): Promise<CheckpointInfo[]> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([BATCHES_STORE, RESULTS_STORE], 'readonly');

      transaction.onerror = () => reject(new Error('Failed to get pending batches'));

      const batchesStore = transaction.objectStore(BATCHES_STORE);
      const resultsStore = transaction.objectStore(RESULTS_STORE);

      const batchesRequest = batchesStore.getAll();

      batchesRequest.onsuccess = async () => {
        const batches = batchesRequest.result as BatchInfo[];
        const checkpoints: CheckpointInfo[] = [];

        for (const batch of batches) {
          // Count completed results for this batch
          const resultsIndex = resultsStore.index('batchId');
          const countRequest = resultsIndex.count(IDBKeyRange.only(batch.batchId));

          await new Promise<void>((resolveCount) => {
            countRequest.onsuccess = () => {
              const completedItems = countRequest.result;

              // Only include if not fully completed
              if (completedItems < batch.totalItems) {
                checkpoints.push({
                  batchId: batch.batchId,
                  fileName: batch.fileName,
                  totalItems: batch.totalItems,
                  completedItems,
                  timestamp: batch.createdAt,
                });
              }

              resolveCount();
            };
          });
        }

        resolve(checkpoints);
      };
    });
  }

  /**
   * Load a batch for resuming
   */
  async loadBatch(batchId: string): Promise<{
    batchInfo: BatchInfo;
    articles: ArticleRow[];
    results: ScreeningResult[];
  }> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [BATCHES_STORE, ARTICLES_STORE, RESULTS_STORE],
        'readonly'
      );

      transaction.onerror = () => reject(new Error('Failed to load batch'));

      const batchesStore = transaction.objectStore(BATCHES_STORE);
      const articlesStore = transaction.objectStore(ARTICLES_STORE);
      const resultsStore = transaction.objectStore(RESULTS_STORE);

      // Get batch info
      const batchRequest = batchesStore.get(batchId);

      batchRequest.onsuccess = () => {
        const batchInfo = batchRequest.result as BatchInfo;
        if (!batchInfo) {
          reject(new Error('Batch not found'));
          return;
        }

        // Get articles
        const articlesIndex = articlesStore.index('batchId');
        const articlesRequest = articlesIndex.getAll(IDBKeyRange.only(batchId));

        articlesRequest.onsuccess = () => {
          const articleRecords = articlesRequest.result as { article: ArticleRow }[];
          const articles = articleRecords.map(r => r.article);

          // Get results
          const resultsIndex = resultsStore.index('batchId');
          const resultsRequest = resultsIndex.getAll(IDBKeyRange.only(batchId));

          resultsRequest.onsuccess = () => {
            const resultRecords = resultsRequest.result as { result: ScreeningResult }[];
            const results = resultRecords.map(r => r.result);

            resolve({ batchInfo, articles, results });
          };
        };
      };
    });
  }

  /**
   * Get unprocessed articles from a batch
   */
  async getUnprocessedArticles(batchId: string): Promise<ArticleRow[]> {
    const { articles, results } = await this.loadBatch(batchId);

    const processedIds = new Set(results.map(r => r.articleId));
    return articles.filter(a => !processedIds.has(a.id));
  }

  /**
   * Delete a batch and all associated data
   */
  async deleteBatch(batchId: string): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [BATCHES_STORE, ARTICLES_STORE, RESULTS_STORE],
        'readwrite'
      );

      transaction.onerror = () => reject(new Error('Failed to delete batch'));
      transaction.oncomplete = () => resolve();

      // Delete batch info
      const batchesStore = transaction.objectStore(BATCHES_STORE);
      batchesStore.delete(batchId);

      // Delete articles
      const articlesStore = transaction.objectStore(ARTICLES_STORE);
      const articlesIndex = articlesStore.index('batchId');
      const articlesRequest = articlesIndex.openCursor(IDBKeyRange.only(batchId));

      articlesRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Delete results
      const resultsStore = transaction.objectStore(RESULTS_STORE);
      const resultsIndex = resultsStore.index('batchId');
      const resultsRequest = resultsIndex.openCursor(IDBKeyRange.only(batchId));

      resultsRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    });
  }

  /**
   * Clear all checkpoints
   */
  async clearAll(): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [BATCHES_STORE, ARTICLES_STORE, RESULTS_STORE],
        'readwrite'
      );

      transaction.onerror = () => reject(new Error('Failed to clear checkpoints'));
      transaction.oncomplete = () => resolve();

      transaction.objectStore(BATCHES_STORE).clear();
      transaction.objectStore(ARTICLES_STORE).clear();
      transaction.objectStore(RESULTS_STORE).clear();
    });
  }
}

// Singleton instance
let checkpointManagerInstance: CheckpointManager | null = null;

export function getCheckpointManager(): CheckpointManager {
  if (!checkpointManagerInstance) {
    checkpointManagerInstance = new CheckpointManager();
  }
  return checkpointManagerInstance;
}
