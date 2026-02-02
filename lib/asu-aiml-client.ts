import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Configuration interface for ASU AIML API
 */
interface AsuAimlConfig {
  /** Bearer token for API authentication */
  token: string;
  /** Project owner token for project management operations */
  projectToken?: string;
  /** Base URL for REST API (default: https://api-main-beta.aiml.asu.edu) */
  baseUrl?: string;
  /** Base URL for WebSocket API (default: wss://apiws-main-beta.aiml.asu.edu) */
  wsBaseUrl?: string;
  /** Request timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Maximum retry attempts for transient errors (default: 3) */
  maxRetries?: number;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_TIMEOUT = 300000; // 5 minutes
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 2000,  // 2 seconds
  maxDelay: 30000,  // 30 seconds
};

/**
 * Check if an error is retryable (transient)
 */
function isRetryableError(error: any): boolean {
  // Network errors
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
    return true;
  }
  // Fetch abort/timeout
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return true;
  }
  // Check cause for nested errors
  if (error.cause) {
    if (error.cause.code === 'ETIMEDOUT' || error.cause.code === 'ECONNRESET') {
      return true;
    }
  }
  // HTTP 429 (rate limit) or 5xx errors
  if (error.status === 429 || (error.status >= 500 && error.status < 600)) {
    return true;
  }
  return false;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoff(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Client for interacting with ASU AIML Platform API
 */
export class AsuAimlClient {
  private token: string;
  private projectToken?: string;
  private baseUrl: string;
  private wsBaseUrl: string;
  private timeout: number;
  private retryConfig: RetryConfig;

  /**
   * Creates a new ASU AIML API client
   * @param config - Configuration object or loads from environment variables
   */
  constructor(config?: AsuAimlConfig) {
    if (config) {
      this.token = config.token;
      this.projectToken = config.projectToken;
      this.baseUrl = config.baseUrl || 'https://api-main-beta.aiml.asu.edu';
      this.wsBaseUrl = config.wsBaseUrl || 'wss://apiws-main-beta.aiml.asu.edu';
      this.timeout = config.timeout || DEFAULT_TIMEOUT;
      this.retryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: config.maxRetries || DEFAULT_RETRY_CONFIG.maxAttempts,
      };
    } else {
      // Load from environment variables
      const token = process.env.ASU_AIML_TOKEN;
      if (!token) {
        throw new Error('ASU_AIML_TOKEN environment variable is required');
      }
      this.token = token;
      this.projectToken = process.env.ASU_AIML_PROJECT_TOKEN;
      this.baseUrl = process.env.ASU_AIML_BASE_URL || 'https://api-main-beta.aiml.asu.edu';
      this.wsBaseUrl = process.env.ASU_AIML_WS_BASE_URL || 'wss://apiws-main-beta.aiml.asu.edu';
      this.timeout = DEFAULT_TIMEOUT;
      this.retryConfig = DEFAULT_RETRY_CONFIG;
    }
  }

  /**
   * Fetch with timeout and automatic retry for transient errors
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    operationName: string
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryConfig.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        if (attempt > 0) {
          console.log(`[ASU AIML] Retry attempt ${attempt + 1}/${this.retryConfig.maxAttempts} for ${operationName}`);
        }

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Check for retryable HTTP errors
        if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
          let body = '';
          try { body = await response.text(); } catch {}
          const error: any = new Error(`HTTP ${response.status}: ${response.statusText} — ${body}`);
          error.status = response.status;
          throw error;
        }

        return response;
      } catch (error: any) {
        clearTimeout(timeoutId);
        lastError = error;

        // Check if this is an abort due to timeout
        if (error.name === 'AbortError') {
          console.warn(`[ASU AIML] Request timeout after ${this.timeout}ms for ${operationName}`);
          error.code = 'ETIMEDOUT';
        }

        // Check if error is retryable
        if (isRetryableError(error) && attempt < this.retryConfig.maxAttempts - 1) {
          const delay = calculateBackoff(attempt, this.retryConfig);
          console.warn(`[ASU AIML] ${operationName} failed with ${error.code || error.message}, retrying in ${Math.round(delay)}ms...`);
          await sleep(delay);
          continue;
        }

        // Not retryable or last attempt
        throw error;
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error(`${operationName} failed after ${this.retryConfig.maxAttempts} attempts`);
  }

  /**
   * Get authorization headers for API requests
   */
  private getHeaders(useProjectToken: boolean = false): HeadersInit {
    const token = useProjectToken && this.projectToken ? this.projectToken : this.token;
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  /**
   * Perform a search operation
   * @param query - Search query string
   * @param searchParams - Optional search parameters
   */
  async search(query: string, searchParams?: any): Promise<any> {
    const payload = {
      query,
      search_params: searchParams,
    };

    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Execute a query with specific parameters
   * @param query - Query string
   * @param options - Query options including model parameters, search params, etc.
   */
  async query(query: string, options?: any): Promise<any> {
    const payload: any = {
      action: 'query',
      query,
      ...options,
    };

    // Handle system prompt override logic
    if (options?.systemPrompt) {
      payload.request_source = "override_params";
      // Ensure model_params exists
      payload.model_params = payload.model_params || {};
      // Set the system prompt
      payload.model_params.system_prompt = options.systemPrompt;
      // Remove systemPrompt from top-level to clean up
      delete payload.systemPrompt;
    }

    const response = await this.fetchWithRetry(
      `${this.baseUrl}/query`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      },
      'query'
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('ASU AIML API error body:', errorBody);
      throw new Error(`Query request failed: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    return response.json();
  }

  /**
   * Execute a queryV2 with endpoint specification
   * @param query - Query string
   * @param endpoint - Endpoint type: "speech", "image", "vision", or "audio"
   * @param options - Additional query options
   */
  async queryV2(query: string, endpoint: 'speech' | 'image' | 'vision' | 'audio', options?: any): Promise<any> {
    const payload = {
      action: 'queryV2',
      endpoint,
      query,
      ...options,
    };

    const response = await fetch(`${this.baseUrl}/queryV2`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`QueryV2 request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get embeddings for a query
   * @param query - Query string
   * @param options - Embeddings options
   */
  async embeddings(query: string, options?: any): Promise<any> {
    const payload = {
      query,
      ...options,
    };

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Embeddings request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Upload a file to the knowledge base (requires project owner token)
   * @param projectId - Project ID
   * @param files - Array of file configurations
   */
  async uploadFile(projectId: string, files: any[]): Promise<any> {
    if (!this.projectToken) {
      throw new Error('Project owner token is required for file upload operations');
    }

    const payload = {
      resource: 'data',
      method: 'upload',
      details: {
        project_id: projectId,
        db_type: 'opensearch',
        files,
      },
    };

    const response = await fetch(`${this.baseUrl}/project`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`File upload request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Check upload status of files (requires project owner token)
   * @param projectId - Project ID
   */
  async checkUploadStatus(projectId: string): Promise<any> {
    if (!this.projectToken) {
      throw new Error('Project owner token is required for checking upload status');
    }

    const payload = {
      resource: 'data',
      method: 'list',
      details: {
        project_id: projectId,
        db_type: 'opensearch',
      },
    };

    const response = await fetch(`${this.baseUrl}/project`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Check upload status request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get chunks and tokens for a text
   * @param text - Text to chunk and tokenize
   * @param options - Chunking and tokenization options
   */
  async chunks(text: string, options?: any): Promise<any> {
    const payload = {
      text,
      enable_chunks: true,
      enable_tokenizer: true,
      ...options,
    };

    const response = await fetch(`${this.baseUrl}/chunk`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Chunks request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get WebSocket URL with access token
   */
  getWebSocketUrl(): string {
    return `${this.wsBaseUrl}/?access_token=${this.token}`;
  }
}

// Export a function to get singleton instance (lazy initialization for Next.js)
let _asuAimlClient: AsuAimlClient | null = null;

export function getAsuAimlClient(): AsuAimlClient {
  if (!_asuAimlClient) {
    _asuAimlClient = new AsuAimlClient();
  }
  return _asuAimlClient;
}

// For backwards compatibility
export const asuAimlClient = {
  get query() { return getAsuAimlClient().query.bind(getAsuAimlClient()); },
  get search() { return getAsuAimlClient().search.bind(getAsuAimlClient()); },
  get queryV2() { return getAsuAimlClient().queryV2.bind(getAsuAimlClient()); },
  get embeddings() { return getAsuAimlClient().embeddings.bind(getAsuAimlClient()); },
  get uploadFile() { return getAsuAimlClient().uploadFile.bind(getAsuAimlClient()); },
  get checkUploadStatus() { return getAsuAimlClient().checkUploadStatus.bind(getAsuAimlClient()); },
  get chunks() { return getAsuAimlClient().chunks.bind(getAsuAimlClient()); },
  getWebSocketUrl() { return getAsuAimlClient().getWebSocketUrl(); },
};
