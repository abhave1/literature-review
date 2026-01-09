import { NextRequest, NextResponse } from 'next/server';
import { GoogleDriveClient } from '@/lib/google-drive-client';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

// In-memory token storage (use a proper database in production)
// This is a simple solution for development/demo purposes
const tokenStorage = new Map<string, {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}>();

/**
 * GET /api/drive/auth
 * Initiates OAuth2 flow or returns current auth status
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');

  try {
    // Check if we have client credentials configured
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          authenticated: false,
          error: 'Google OAuth credentials not configured',
          message: 'Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables',
        },
        { status: 500 }
      );
    }

    // Handle callback from Google OAuth
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.json(
        {
          authenticated: false,
          error: `OAuth error: ${error}`,
        },
        { status: 400 }
      );
    }

    if (code) {
      // Exchange code for tokens
      const client = new GoogleDriveClient({
        clientId,
        clientSecret,
      });

      const redirectUri = getRedirectUri(request);
      const tokens = await client.exchangeCodeForTokens(code, redirectUri);

      // Generate a session ID
      const sessionId = crypto.randomUUID();

      // Store tokens (in production, use encrypted database storage)
      tokenStorage.set(sessionId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || '',
        expiresAt: Date.now() + (tokens.expires_in * 1000),
      });

      // Set session cookie
      const cookieStore = await cookies();
      cookieStore.set('drive_session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });

      // Redirect to success page or return JSON based on state
      if (state === 'popup') {
        // For popup-based auth, return HTML that closes the popup
        return new NextResponse(
          `<!DOCTYPE html>
          <html>
            <head><title>Authentication Complete</title></head>
            <body>
              <script>
                window.opener?.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
                window.close();
              </script>
              <p>Authentication successful! You can close this window.</p>
            </body>
          </html>`,
          {
            headers: { 'Content-Type': 'text/html' },
          }
        );
      }

      // Redirect to the app
      return NextResponse.redirect(new URL('/admin/sync', request.url));
    }

    // Start OAuth flow
    if (action === 'login') {
      const client = new GoogleDriveClient({
        clientId,
        clientSecret,
      });

      const redirectUri = getRedirectUri(request);
      const popup = searchParams.get('popup') === 'true';
      const authUrl = client.getAuthUrl(redirectUri, popup ? 'popup' : undefined);

      return NextResponse.json({ authUrl });
    }

    // Check current auth status
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('drive_session')?.value;

    if (sessionId && tokenStorage.has(sessionId)) {
      const storedTokens = tokenStorage.get(sessionId)!;
      const isExpired = Date.now() >= storedTokens.expiresAt;

      if (isExpired && storedTokens.refreshToken) {
        // Try to refresh the token
        try {
          const client = new GoogleDriveClient({
            clientId,
            clientSecret,
            refreshToken: storedTokens.refreshToken,
          });

          await client.refreshAccessToken();
          const newTokens = client.getTokens();

          tokenStorage.set(sessionId, {
            accessToken: newTokens.accessToken || '',
            refreshToken: storedTokens.refreshToken,
            expiresAt: Date.now() + (3600 * 1000), // 1 hour
          });

          return NextResponse.json({
            authenticated: true,
            message: 'Token refreshed',
          });
        } catch (refreshError) {
          tokenStorage.delete(sessionId);
          cookieStore.delete('drive_session');
          return NextResponse.json({
            authenticated: false,
            error: 'Token expired and refresh failed',
          });
        }
      }

      return NextResponse.json({
        authenticated: !isExpired,
        expiresAt: storedTokens.expiresAt,
      });
    }

    // Check for service account
    const serviceAccountCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
    if (serviceAccountCredentials) {
      try {
        const client = new GoogleDriveClient({ serviceAccountCredentials });
        const connected = await client.testConnection();
        return NextResponse.json({
          authenticated: connected,
          authMethod: 'service_account',
        });
      } catch {
        return NextResponse.json({
          authenticated: false,
          authMethod: 'service_account',
          error: 'Service account authentication failed',
        });
      }
    }

    return NextResponse.json({
      authenticated: false,
      message: 'Not authenticated',
    });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      {
        authenticated: false,
        error: String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/drive/auth
 * Handle token operations (logout, manual token setting)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, accessToken, refreshToken } = body;

    if (action === 'logout') {
      const cookieStore = await cookies();
      const sessionId = cookieStore.get('drive_session')?.value;

      if (sessionId) {
        tokenStorage.delete(sessionId);
        cookieStore.delete('drive_session');
      }

      return NextResponse.json({ success: true, message: 'Logged out' });
    }

    if (action === 'setTokens' && accessToken) {
      // Allow manually setting tokens (for testing or service account flow)
      const sessionId = crypto.randomUUID();

      tokenStorage.set(sessionId, {
        accessToken,
        refreshToken: refreshToken || '',
        expiresAt: Date.now() + (3600 * 1000), // 1 hour default
      });

      const cookieStore = await cookies();
      cookieStore.set('drive_session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });

      return NextResponse.json({ success: true, message: 'Tokens set' });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Auth POST error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Helper to get the redirect URI based on the request
 */
function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}/api/drive/auth`;
}

/**
 * Export token storage access for other routes
 */
export function getStoredTokens(sessionId: string) {
  return tokenStorage.get(sessionId);
}

export { tokenStorage };
