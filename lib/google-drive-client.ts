/**
 * Google Drive Client for syncing PDFs
 * Supports both Service Account and OAuth2 authentication
 * Includes rate limiting with exponential backoff
 */

interface GoogleDriveConfig {
  /** OAuth2 access token (for user-authenticated requests) */
  accessToken?: string;
  /** OAuth2 refresh token (for token refresh) */
  refreshToken?: string;
  /** Service account credentials JSON string */
  serviceAccountCredentials?: string;
  /** OAuth2 client ID */
  clientId?: string;
  /** OAuth2 client secret */
  clientSecret?: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
}

interface ListFilesResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 32000,
  requestsPerSecond: 5, // Google Drive API limit is 10/sec, we use 5 to be safe
};

/**
 * Simple in-memory rate limiter using token bucket algorithm
 */
class RateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms

  constructor(requestsPerSecond: number) {
    this.maxTokens = requestsPerSecond;
    this.tokens = requestsPerSecond;
    this.refillRate = requestsPerSecond / 1000;
    this.lastRefillTime = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait for a token to become available
    const waitTime = (1 - this.tokens) / this.refillRate;
    await this.sleep(waitTime);
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefillTime = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Exponential backoff helper for handling rate limit errors
 */
async function withExponentialBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = RATE_LIMIT_CONFIG.maxRetries,
  initialDelayMs: number = RATE_LIMIT_CONFIG.initialDelayMs
): Promise<T> {
  let lastError: Error | null = null;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check if it's a rate limit error (429) or server error (5xx)
      const isRetryable =
        error.status === 429 ||
        error.status === 403 ||
        (error.status >= 500 && error.status < 600) ||
        error.message?.includes('rate limit') ||
        error.message?.includes('quota');

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.3 * delayMs;
      const waitTime = Math.min(delayMs + jitter, RATE_LIMIT_CONFIG.maxDelayMs);

      console.log(`Rate limited, retrying in ${Math.round(waitTime)}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      delayMs *= 2; // Exponential backoff
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Google Drive API Client
 */
export class GoogleDriveClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;
  private clientId: string | null = null;
  private clientSecret: string | null = null;
  private serviceAccountCredentials: any = null;
  private rateLimiter: RateLimiter;

  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';
  private readonly uploadBaseUrl = 'https://www.googleapis.com/upload/drive/v3';

  constructor(config?: GoogleDriveConfig) {
    this.rateLimiter = new RateLimiter(RATE_LIMIT_CONFIG.requestsPerSecond);

    if (config?.accessToken) {
      this.accessToken = config.accessToken;
    }
    if (config?.refreshToken) {
      this.refreshToken = config.refreshToken;
    }
    if (config?.clientId) {
      this.clientId = config.clientId;
    }
    if (config?.clientSecret) {
      this.clientSecret = config.clientSecret;
    }
    if (config?.serviceAccountCredentials) {
      try {
        this.serviceAccountCredentials = JSON.parse(config.serviceAccountCredentials);
      } catch {
        throw new Error('Invalid service account credentials JSON');
      }
    }
  }

  /**
   * Load configuration from environment variables
   */
  static fromEnv(): GoogleDriveClient {
    return new GoogleDriveClient({
      accessToken: process.env.GOOGLE_DRIVE_ACCESS_TOKEN,
      refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      serviceAccountCredentials: process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS,
    });
  }

  /**
   * Set OAuth2 tokens (used after OAuth flow completes)
   */
  setTokens(accessToken: string, refreshToken?: string, expiresIn?: number): void {
    this.accessToken = accessToken;
    if (refreshToken) {
      this.refreshToken = refreshToken;
    }
    if (expiresIn) {
      this.tokenExpiry = Date.now() + (expiresIn * 1000) - 60000; // 1 minute buffer
    }
  }

  /**
   * Get OAuth2 authorization URL
   */
  getAuthUrl(redirectUri: string, state?: string): string {
    if (!this.clientId) {
      throw new Error('OAuth2 client ID not configured');
    }

    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
    ];

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });

    if (state) {
      params.set('state', state);
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('OAuth2 credentials not configured');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokens: TokenResponse = await response.json();
    this.setTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);
    return tokens;
  }

  /**
   * Refresh the access token using refresh token
   */
  async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }
    if (!this.clientId || !this.clientSecret) {
      throw new Error('OAuth2 credentials not configured');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokens: TokenResponse = await response.json();
    this.setTokens(tokens.access_token, undefined, tokens.expires_in);
  }

  /**
   * Get a valid access token (refreshing if needed)
   */
  private async getValidAccessToken(): Promise<string> {
    // Check if using service account
    if (this.serviceAccountCredentials) {
      return this.getServiceAccountToken();
    }

    // Check if token needs refresh
    if (this.accessToken && this.tokenExpiry > 0 && Date.now() >= this.tokenExpiry) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error('Access token expired and no refresh token available');
      }
    }

    if (!this.accessToken) {
      throw new Error('No access token available. Please authenticate first.');
    }

    return this.accessToken;
  }

  /**
   * Get access token for service account using JWT
   */
  private async getServiceAccountToken(): Promise<string> {
    const creds = this.serviceAccountCredentials;
    if (!creds?.client_email || !creds?.private_key) {
      throw new Error('Invalid service account credentials');
    }

    // Create JWT header
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    // Create JWT claims
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    // Sign JWT (simplified - in production use a proper crypto library)
    const jwt = await this.createJWT(header, claims, creds.private_key);

    // Exchange JWT for access token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Service account token request failed: ${error}`);
    }

    const data: TokenResponse = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    return data.access_token;
  }

  /**
   * Create a JWT for service account authentication
   */
  private async createJWT(header: object, claims: object, privateKey: string): Promise<string> {
    const encoder = new TextEncoder();

    const headerB64 = this.base64UrlEncode(JSON.stringify(header));
    const claimsB64 = this.base64UrlEncode(JSON.stringify(claims));
    const signatureInput = `${headerB64}.${claimsB64}`;

    // Import the private key
    const pemContents = privateKey
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '');

    const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );

    // Sign the JWT
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      encoder.encode(signatureInput)
    );

    const signatureB64 = this.base64UrlEncode(
      String.fromCharCode(...new Uint8Array(signature))
    );

    return `${signatureInput}.${signatureB64}`;
  }

  /**
   * Base64 URL encode a string
   */
  private base64UrlEncode(str: string): string {
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Make an authenticated request to the Drive API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isDownload = false
  ): Promise<T> {
    await this.rateLimiter.acquire();

    return withExponentialBackoff(async () => {
      const token = await this.getValidAccessToken();

      const url = isDownload
        ? endpoint
        : `${this.baseUrl}${endpoint}`;

      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const error: any = new Error(`Drive API error: ${response.status} ${response.statusText} - ${errorBody}`);
        error.status = response.status;
        throw error;
      }

      if (isDownload) {
        return response as unknown as T;
      }

      return response.json();
    });
  }

  /**
   * List files in a folder (with pagination support)
   */
  async listFiles(
    folderId: string,
    options: {
      pageToken?: string;
      pageSize?: number;
      mimeType?: string;
    } = {}
  ): Promise<ListFilesResponse> {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, parents)',
      pageSize: String(options.pageSize || 100),
    });

    if (options.pageToken) {
      params.set('pageToken', options.pageToken);
    }

    if (options.mimeType) {
      params.set('q', `'${folderId}' in parents and trashed = false and mimeType = '${options.mimeType}'`);
    }

    return this.request<ListFilesResponse>(`/files?${params.toString()}`);
  }

  /**
   * List all files in a folder (handles pagination automatically)
   */
  async listAllFiles(
    folderId: string,
    options: {
      mimeType?: string;
      onProgress?: (count: number) => void;
    } = {}
  ): Promise<DriveFile[]> {
    const allFiles: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.listFiles(folderId, {
        pageToken,
        pageSize: 100,
        mimeType: options.mimeType,
      });

      allFiles.push(...response.files);
      pageToken = response.nextPageToken;

      if (options.onProgress) {
        options.onProgress(allFiles.length);
      }
    } while (pageToken);

    return allFiles;
  }

  /**
   * List all PDF files in a folder
   */
  async listPdfFiles(
    folderId: string,
    onProgress?: (count: number) => void
  ): Promise<DriveFile[]> {
    return this.listAllFiles(folderId, {
      mimeType: 'application/pdf',
      onProgress,
    });
  }

  /**
   * Get file metadata
   */
  async getFile(fileId: string): Promise<DriveFile> {
    const params = new URLSearchParams({
      fields: 'id, name, mimeType, size, modifiedTime, parents',
    });

    return this.request<DriveFile>(`/files/${fileId}?${params.toString()}`);
  }

  /**
   * Download file content as ArrayBuffer
   */
  async downloadFile(fileId: string): Promise<ArrayBuffer> {
    const response = await this.request<Response>(
      `${this.baseUrl}/files/${fileId}?alt=media`,
      {},
      true
    );

    return response.arrayBuffer();
  }

  /**
   * Download file content as Buffer (Node.js)
   */
  async downloadFileAsBuffer(fileId: string): Promise<Buffer> {
    const arrayBuffer = await this.downloadFile(fileId);
    return Buffer.from(arrayBuffer);
  }

  /**
   * Test connection by listing files in root
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/files?pageSize=1');
      return true;
    } catch (error) {
      console.error('Drive connection test failed:', error);
      return false;
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return !!(this.accessToken || this.serviceAccountCredentials);
  }

  /**
   * Get current tokens (for storage)
   */
  getTokens(): { accessToken: string | null; refreshToken: string | null } {
    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
    };
  }
}

// Export singleton getter for lazy initialization
let _driveClient: GoogleDriveClient | null = null;

export function getGoogleDriveClient(): GoogleDriveClient {
  if (!_driveClient) {
    _driveClient = GoogleDriveClient.fromEnv();
  }
  return _driveClient;
}

// Export types
export type { DriveFile, ListFilesResponse, GoogleDriveConfig, TokenResponse };
