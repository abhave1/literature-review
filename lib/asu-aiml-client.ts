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
}

/**
 * Client for interacting with ASU AIML Platform API
 */
export class AsuAimlClient {
  private token: string;
  private projectToken?: string;
  private baseUrl: string;
  private wsBaseUrl: string;

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
    }
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
    const payload = {
      action: 'query',
      query,
      ...options,
    };

    const response = await fetch(`${this.baseUrl}/query`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Query request failed: ${response.status} ${response.statusText}`);
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
