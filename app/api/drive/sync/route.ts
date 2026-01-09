import { NextRequest, NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import { cookies } from 'next/headers';
import { GoogleDriveClient, DriveFile } from '@/lib/google-drive-client';
import { tokenStorage } from '../auth/route';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

// Sync state storage (in-memory, use database in production)
interface SyncState {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  startedAt: number;
  completedAt?: number;
  folderId: string;
  totalFiles: number;
  syncedFiles: number;
  skippedFiles: number;
  errorFiles: number;
  errors: Array<{ fileName: string; error: string }>;
  currentFile?: string;
}

const syncStateStorage = new Map<string, SyncState>();

/**
 * POST /api/drive/sync
 * Start a sync operation from Google Drive to Vercel Blob
 */
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const body = await request.json();
    const { folderId, skipExisting = true, dryRun = false } = body;

    if (!folderId) {
      return NextResponse.json(
        { error: 'folderId is required' },
        { status: 400 }
      );
    }

    // Check Blob token
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken && !dryRun) {
      return NextResponse.json(
        { error: 'BLOB_READ_WRITE_TOKEN not configured' },
        { status: 500 }
      );
    }

    // Get authenticated Drive client
    const driveClient = await getAuthenticatedClient(request);
    if (!driveClient) {
      return NextResponse.json(
        { error: 'Not authenticated with Google Drive' },
        { status: 401 }
      );
    }

    // Create sync state
    const syncId = crypto.randomUUID();
    const syncState: SyncState = {
      id: syncId,
      status: 'running',
      startedAt: Date.now(),
      folderId,
      totalFiles: 0,
      syncedFiles: 0,
      skippedFiles: 0,
      errorFiles: 0,
      errors: [],
    };
    syncStateStorage.set(syncId, syncState);

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false;

        const sendEvent = (event: string, data: any) => {
          if (isClosed) return;
          try {
            const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          } catch {
            // Controller may be closed
          }
        };

        const closeController = () => {
          if (!isClosed) {
            isClosed = true;
            try {
              controller.close();
            } catch {
              // Already closed
            }
          }
        };

        try {
          // Step 1: List all PDFs in the folder
          sendEvent('status', { message: 'Listing files in Google Drive...', phase: 'listing' });

          const driveFiles = await driveClient.listPdfFiles(folderId, (count) => {
            sendEvent('progress', { message: `Found ${count} PDF files...`, count });
          });

          syncState.totalFiles = driveFiles.length;
          sendEvent('status', {
            message: `Found ${driveFiles.length} PDF files`,
            phase: 'listing_complete',
            totalFiles: driveFiles.length,
          });

          if (driveFiles.length === 0) {
            syncState.status = 'completed';
            syncState.completedAt = Date.now();
            sendEvent('complete', {
              message: 'No PDF files found in the specified folder',
              ...getSyncSummary(syncState),
            });
            closeController();
            return;
          }

          // Step 2: Get existing files in Vercel Blob
          let existingFiles = new Set<string>();
          if (skipExisting && !dryRun) {
            sendEvent('status', { message: 'Checking existing files...', phase: 'checking' });

            const { blobs } = await list({
              prefix: 'mxml-pdfs/',
              limit: 1000,
              token: blobToken,
            });

            existingFiles = new Set(
              blobs.map((blob) => blob.pathname.replace('mxml-pdfs/', ''))
            );

            sendEvent('status', {
              message: `Found ${existingFiles.size} existing files in blob storage`,
              phase: 'checking_complete',
              existingCount: existingFiles.size,
            });
          }

          // Step 3: Sync files
          sendEvent('status', { message: 'Starting sync...', phase: 'syncing' });

          for (let i = 0; i < driveFiles.length; i++) {
            const file = driveFiles[i];
            syncState.currentFile = file.name;

            // Check if file already exists
            if (skipExisting && existingFiles.has(file.name)) {
              syncState.skippedFiles++;
              sendEvent('skip', {
                fileName: file.name,
                reason: 'Already exists in blob storage',
                progress: {
                  current: i + 1,
                  total: driveFiles.length,
                  synced: syncState.syncedFiles,
                  skipped: syncState.skippedFiles,
                  errors: syncState.errorFiles,
                },
              });
              continue;
            }

            try {
              if (dryRun) {
                // Dry run - just report what would happen
                syncState.syncedFiles++;
                sendEvent('sync', {
                  fileName: file.name,
                  fileSize: file.size,
                  dryRun: true,
                  message: 'Would sync (dry run)',
                  progress: {
                    current: i + 1,
                    total: driveFiles.length,
                    synced: syncState.syncedFiles,
                    skipped: syncState.skippedFiles,
                    errors: syncState.errorFiles,
                  },
                });
              } else {
                // Download from Drive
                sendEvent('downloading', {
                  fileName: file.name,
                  fileSize: file.size,
                  progress: { current: i + 1, total: driveFiles.length },
                });

                const fileBuffer = await driveClient.downloadFileAsBuffer(file.id);

                // Upload to Vercel Blob
                sendEvent('uploading', {
                  fileName: file.name,
                  fileSize: fileBuffer.length,
                  progress: { current: i + 1, total: driveFiles.length },
                });

                const blob = await put(`mxml-pdfs/${file.name}`, fileBuffer, {
                  access: 'public',
                  token: blobToken,
                  contentType: 'application/pdf',
                });

                syncState.syncedFiles++;
                sendEvent('sync', {
                  fileName: file.name,
                  fileSize: fileBuffer.length,
                  blobUrl: blob.url,
                  progress: {
                    current: i + 1,
                    total: driveFiles.length,
                    synced: syncState.syncedFiles,
                    skipped: syncState.skippedFiles,
                    errors: syncState.errorFiles,
                  },
                });
              }
            } catch (error: any) {
              syncState.errorFiles++;
              syncState.errors.push({
                fileName: file.name,
                error: error.message || String(error),
              });

              sendEvent('error', {
                fileName: file.name,
                error: error.message || String(error),
                progress: {
                  current: i + 1,
                  total: driveFiles.length,
                  synced: syncState.syncedFiles,
                  skipped: syncState.skippedFiles,
                  errors: syncState.errorFiles,
                },
              });

              // Continue with next file
              continue;
            }

            // Small delay between files to avoid overwhelming the APIs
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          // Sync complete
          syncState.status = 'completed';
          syncState.completedAt = Date.now();
          syncState.currentFile = undefined;

          sendEvent('complete', {
            message: 'Sync completed successfully',
            ...getSyncSummary(syncState),
          });
        } catch (error: any) {
          syncState.status = 'error';
          syncState.completedAt = Date.now();
          syncState.errors.push({
            fileName: 'SYNC_PROCESS',
            error: error.message || String(error),
          });

          sendEvent('fatal', {
            error: error.message || String(error),
            ...getSyncSummary(syncState),
          });
        } finally {
          closeController();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Sync-Id': syncId,
      },
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/drive/sync
 * Get sync status or list sync history
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const syncId = searchParams.get('id');

  if (syncId) {
    const syncState = syncStateStorage.get(syncId);
    if (!syncState) {
      return NextResponse.json(
        { error: 'Sync not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(getSyncSummary(syncState));
  }

  // Return list of all syncs
  const syncs = Array.from(syncStateStorage.values())
    .map(getSyncSummary)
    .sort((a, b) => b.startedAt - a.startedAt);

  return NextResponse.json({ syncs });
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

      // Refresh if expired
      if (Date.now() >= storedTokens.expiresAt && storedTokens.refreshToken) {
        try {
          await client.refreshAccessToken();
          const newTokens = client.getTokens();
          tokenStorage.set(sessionId, {
            accessToken: newTokens.accessToken || '',
            refreshToken: storedTokens.refreshToken,
            expiresAt: Date.now() + (3600 * 1000),
          });
        } catch {
          return null;
        }
      }

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

/**
 * Helper to format sync state for response
 */
function getSyncSummary(state: SyncState) {
  return {
    id: state.id,
    status: state.status,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    duration: state.completedAt
      ? state.completedAt - state.startedAt
      : Date.now() - state.startedAt,
    folderId: state.folderId,
    totalFiles: state.totalFiles,
    syncedFiles: state.syncedFiles,
    skippedFiles: state.skippedFiles,
    errorFiles: state.errorFiles,
    errors: state.errors.slice(0, 10), // Limit errors in response
    hasMoreErrors: state.errors.length > 10,
    currentFile: state.currentFile,
  };
}

// Export for status route
export { syncStateStorage };
