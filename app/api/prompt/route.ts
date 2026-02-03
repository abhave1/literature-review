import { NextRequest, NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';
import { DEFAULT_MXML_SYSTEM_PROMPT, DEFAULT_ASPECTS } from '@/lib/prompts/default-mxml-prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Blob path for storing the prompt config
const PROMPT_BLOB_PATH = 'config/mxml-prompt.json';

export interface SavedPrompt {
  systemPrompt: string;
  ratedAspects: string;
  updatedAt: string;
}

/**
 * GET /api/prompt
 * Retrieves the saved system prompt and rated aspects from Vercel Blob
 * Returns defaults if not found
 */
export async function GET() {
  try {
    // List blobs to find the config file
    const { blobs } = await list({ prefix: 'config/' });
    console.log('Found blobs:', blobs.map(b => ({ pathname: b.pathname, url: b.url })));

    // Find the config blob - check both exact match and ends-with
    const configBlob = blobs.find(b =>
      b.pathname === PROMPT_BLOB_PATH ||
      b.pathname.endsWith('mxml-prompt.json')
    );

    console.log('Config blob found:', configBlob ? 'yes' : 'no');

    if (!configBlob) {
      // No saved config, return defaults
      return NextResponse.json({
        systemPrompt: DEFAULT_MXML_SYSTEM_PROMPT,
        ratedAspects: DEFAULT_ASPECTS,
        isDefault: true,
      }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    }

    // Fetch the config from blob (with cache bust)
    const response = await fetch(configBlob.url, { cache: 'no-store' });
    const savedConfig: SavedPrompt = await response.json();
    console.log('Loaded config:', savedConfig.updatedAt);

    return NextResponse.json({
      systemPrompt: savedConfig.systemPrompt || DEFAULT_MXML_SYSTEM_PROMPT,
      ratedAspects: savedConfig.ratedAspects || DEFAULT_ASPECTS,
      isDefault: false,
      updatedAt: savedConfig.updatedAt,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Failed to load prompt from Blob:', error);
    // Return defaults on error
    return NextResponse.json({
      systemPrompt: DEFAULT_MXML_SYSTEM_PROMPT,
      ratedAspects: DEFAULT_ASPECTS,
      isDefault: true,
      error: 'Failed to load from storage, using defaults',
    });
  }
}

/**
 * POST /api/prompt
 * Saves the system prompt and rated aspects to Vercel Blob
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { systemPrompt, ratedAspects } = body;

    if (typeof systemPrompt !== 'string' || typeof ratedAspects !== 'string') {
      return NextResponse.json(
        { error: 'systemPrompt and ratedAspects must be strings' },
        { status: 400 }
      );
    }

    const configData: SavedPrompt = {
      systemPrompt,
      ratedAspects,
      updatedAt: new Date().toISOString(),
    };

    // Save to Blob (overwrites existing)
    const result = await put(PROMPT_BLOB_PATH, JSON.stringify(configData, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    console.log('Saved prompt to blob:', result.pathname, result.url);

    return NextResponse.json({
      success: true,
      message: 'Prompt saved successfully',
      updatedAt: configData.updatedAt,
      blobUrl: result.url,
    });
  } catch (error) {
    console.error('Failed to save prompt to Blob:', error);
    return NextResponse.json(
      { error: 'Failed to save prompt', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/prompt
 * Resets the prompt to defaults by deleting from Blob
 */
export async function DELETE() {
  try {
    // List and find the config blob
    const { blobs } = await list({ prefix: 'config/' });
    const configBlob = blobs.find(b => b.pathname === PROMPT_BLOB_PATH);

    if (configBlob) {
      await del(configBlob.url);
    }

    return NextResponse.json({
      success: true,
      message: 'Prompt reset to defaults',
    });
  } catch (error) {
    console.error('Failed to reset prompt:', error);
    return NextResponse.json(
      { error: 'Failed to reset prompt', details: String(error) },
      { status: 500 }
    );
  }
}
