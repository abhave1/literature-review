import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  try {
    const { blobs } = await list({
      prefix: 'mxml-pdfs/',
      limit: 200, // Adjust if more than 200 files
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    // Return just the relevant data
    const files = blobs.map(blob => ({
      url: blob.url,
      pathname: blob.pathname,
      size: blob.size,
      uploadedAt: blob.uploadedAt,
      // Extract filename from pathname (remove 'mxml-pdfs/' prefix)
      name: blob.pathname.replace('mxml-pdfs/', '')
    }));

    // Sort files in ascending alphabetical order by name
    files.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ files });
  } catch (error) {
    console.error('Error listing blobs:', error);
    return NextResponse.json(
      { error: 'Failed to list files' },
      { status: 500 }
    );
  }
}
