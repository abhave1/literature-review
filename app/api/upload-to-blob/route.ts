import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';

/**
 * POST /api/upload-to-blob
 * Upload PDF files to Vercel Blob storage
 */
export async function POST(request: NextRequest) {
  try {
    // Use the MXML token for uploading to mxml-pdfs folder
    const token = process.env.BLOB_MXML_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: 'BLOB_MXML_READ_WRITE_TOKEN not configured' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    const results: Array<{
      fileName: string;
      success: boolean;
      url?: string;
      error?: string;
    }> = [];

    // Upload files in parallel (max 10 concurrent)
    const BATCH_SIZE = 10;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const blob = await put(`mxml-pdfs/${file.name}`, buffer, {
              access: 'public',
              token,
              contentType: 'application/pdf',
              allowOverwrite: true, // Overwrite if exists
            });

            return {
              fileName: file.name,
              success: true,
              url: blob.url,
            };
          } catch (err) {
            return {
              fileName: file.name,
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        })
      );

      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      totalFiles: files.length,
      successCount,
      failCount,
      results,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
