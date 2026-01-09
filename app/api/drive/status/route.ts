import { NextRequest, NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import { cookies } from 'next/headers';
import { GoogleDriveClient } from '@/lib/google-drive-client';
import { tokenStorage } from '../auth/route';
import { syncStateStorage } from '../sync/route';

export const runtime = 'nodejs';

interface StatusResponse {
  authenticated: boolean;
  authMethod?: 'oauth' | 'service_account' | 'token';
  blob: {
    configured: boolean;
    fileCount?: number;
    totalSize?: number;
  };
  sync: {
    currentSync?: {
      id: string;
      status: string;
      progress: number;
      totalFiles: number;
      syncedFiles: number;
      skippedFiles: number;
      errorFiles: number;
      currentFile?: string;
      startedAt: number;
      duration: number;
    };
    recentSyncs: Array<{
      id: string;
      status: string;
      totalFiles: number;
      syncedFiles: number;
      startedAt: number;
      completedAt?: number;
    }>;
  };
  drive?: {
    connected: boolean;
    testFolderId?: string;
    fileCount?: number;
  };
}

/**
 * GET /api/drive/status
 * Returns comprehensive status of Drive sync system
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const testFolderId = searchParams.get('folderId');
  const includeFileCount = searchParams.get('includeFileCount') === 'true';

  try {
    const status: StatusResponse = {
      authenticated: false,
      blob: {
        configured: !!process.env.BLOB_READ_WRITE_TOKEN,
      },
      sync: {
        recentSyncs: [],
      },
    };

    // Check authentication status
    const authInfo = await checkAuthentication(request);
    status.authenticated = authInfo.authenticated;
    status.authMethod = authInfo.method;

    // Get blob status
    if (status.blob.configured && includeFileCount) {
      try {
        const { blobs } = await list({
          prefix: 'mxml-pdfs/',
          limit: 1000,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });

        status.blob.fileCount = blobs.length;
        status.blob.totalSize = blobs.reduce((sum, blob) => sum + (blob.size || 0), 0);
      } catch (error) {
        console.error('Error listing blobs:', error);
      }
    }

    // Get sync status
    const syncStates = Array.from(syncStateStorage.values());

    // Find current running sync
    const runningSync = syncStates.find((s) => s.status === 'running');
    if (runningSync) {
      status.sync.currentSync = {
        id: runningSync.id,
        status: runningSync.status,
        progress: runningSync.totalFiles > 0
          ? Math.round(
              ((runningSync.syncedFiles + runningSync.skippedFiles + runningSync.errorFiles) /
                runningSync.totalFiles) *
                100
            )
          : 0,
        totalFiles: runningSync.totalFiles,
        syncedFiles: runningSync.syncedFiles,
        skippedFiles: runningSync.skippedFiles,
        errorFiles: runningSync.errorFiles,
        currentFile: runningSync.currentFile,
        startedAt: runningSync.startedAt,
        duration: Date.now() - runningSync.startedAt,
      };
    }

    // Get recent syncs (last 10)
    status.sync.recentSyncs = syncStates
      .filter((s) => s.status !== 'running')
      .sort((a, b) => (b.completedAt || b.startedAt) - (a.completedAt || a.startedAt))
      .slice(0, 10)
      .map((s) => ({
        id: s.id,
        status: s.status,
        totalFiles: s.totalFiles,
        syncedFiles: s.syncedFiles,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      }));

    // Test Drive connection if authenticated and folder ID provided
    if (status.authenticated && testFolderId) {
      try {
        const driveClient = await getAuthenticatedClient(request);
        if (driveClient) {
          status.drive = {
            connected: true,
            testFolderId,
          };

          if (includeFileCount) {
            const files = await driveClient.listPdfFiles(testFolderId);
            status.drive.fileCount = files.length;
          }
        }
      } catch (error: any) {
        status.drive = {
          connected: false,
          testFolderId,
        };
      }
    }

    return NextResponse.json(status);
  } catch (error) {
    console.error('Status error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Check authentication status
 */
async function checkAuthentication(
  request: NextRequest
): Promise<{ authenticated: boolean; method?: 'oauth' | 'service_account' | 'token' }> {
  // Check service account
  const serviceAccountCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  if (serviceAccountCredentials) {
    try {
      const client = new GoogleDriveClient({ serviceAccountCredentials });
      const connected = await client.testConnection();
      if (connected) {
        return { authenticated: true, method: 'service_account' };
      }
    } catch {
      // Fall through to other methods
    }
  }

  // Check OAuth session
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('drive_session')?.value;

  if (sessionId) {
    const storedTokens = tokenStorage.get(sessionId);
    if (storedTokens) {
      const isExpired = Date.now() >= storedTokens.expiresAt;
      if (!isExpired || storedTokens.refreshToken) {
        return { authenticated: true, method: 'oauth' };
      }
    }
  }

  // Check direct access token
  const accessToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (accessToken) {
    try {
      const client = new GoogleDriveClient({ accessToken });
      const connected = await client.testConnection();
      if (connected) {
        return { authenticated: true, method: 'token' };
      }
    } catch {
      // Token invalid
    }
  }

  return { authenticated: false };
}

/**
 * Helper to get authenticated Drive client
 */
async function getAuthenticatedClient(
  request: NextRequest
): Promise<GoogleDriveClient | null> {
  // Try service account first
  const serviceAccountCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  if (serviceAccountCredentials) {
    return new GoogleDriveClient({ serviceAccountCredentials });
  }

  // Try OAuth tokens
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('drive_session')?.value;

  if (sessionId) {
    const storedTokens = tokenStorage.get(sessionId);
    if (storedTokens) {
      const client = new GoogleDriveClient({
        accessToken: storedTokens.accessToken,
        refreshToken: storedTokens.refreshToken,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      });

      return client;
    }
  }

  // Try direct environment tokens
  const accessToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (accessToken) {
    return new GoogleDriveClient({
      accessToken,
      refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    });
  }

  return null;
}
