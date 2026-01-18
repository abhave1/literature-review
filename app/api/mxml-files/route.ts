import { list } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// Allowed folder prefixes and their tokens
const FOLDERS: Record<string, { prefix: string; tokenEnv: string }> = {
  'mxml': { prefix: 'mxml-pdfs/', tokenEnv: 'BLOB_READ_WRITE_TOKEN_MXML' },
  'icap': { prefix: 'icap-papers/', tokenEnv: 'BLOB_READ_WRITE_TOKEN' },
};

export async function GET(request: NextRequest) {
  try {
    // Get folder from query param, default to 'mxml'
    const searchParams = request.nextUrl.searchParams;
    const folderKey = searchParams.get('folder') || 'mxml';
    const folderConfig = FOLDERS[folderKey] || FOLDERS['mxml'];
    const prefix = folderConfig.prefix;
    const token = process.env[folderConfig.tokenEnv];

    if (!token) {
      return NextResponse.json(
        { error: `Token not configured for ${folderKey}` },
        { status: 500 }
      );
    }

    // Fetch ALL files using pagination
    const allBlobs: any[] = [];
    let cursor: string | undefined;

    do {
      const response = await list({
        prefix,
        limit: 1000, // Max per request
        cursor,
        token,
      });

      allBlobs.push(...response.blobs);
      cursor = response.cursor;
    } while (cursor);

    // Return just the relevant data
    const files = allBlobs.map(blob => ({
      url: blob.url,
      pathname: blob.pathname,
      size: blob.size,
      uploadedAt: blob.uploadedAt,
      // Extract filename from pathname (remove prefix)
      name: blob.pathname.replace(prefix, '')
    }));

    // Sort files in ascending alphabetical order by name
    files.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ files, total: files.length, folder: folderKey, prefix });
  } catch (error) {
    console.error('Error listing blobs:', error);
    return NextResponse.json(
      { error: 'Failed to list files' },
      { status: 500 }
    );
  }
}
