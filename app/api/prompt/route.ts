import { NextRequest, NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';
import { requireApiAccess, requireApiFeature, getAccount, canUseFeature } from '@/lib/auth/server';
import { promptReaders, promptWriters } from '@/lib/auth/access';
import { getConfigForMode, loadPrompt, type SavedPrompt } from '@/lib/prompts/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/prompt
 * Retrieves the saved system prompt and rated aspects from Vercel Blob
 * Returns defaults if not found
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') || 'mxml';
  const bots = promptReaders(mode);
  const denied = await requireApiAccess(request, bots);
  if (denied) return denied;
  try {
    const account = await getAccount();
    const config = await loadPrompt(mode);
    const { systemPrompt, ...safeConfig } = config;
    const canManagePrompts = !!account && canUseFeature(account, bots, 'prompt_access');
    return NextResponse.json({ ...safeConfig, ...(canManagePrompts ? { systemPrompt } : {}) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Prompt configuration unavailable' }, { status: 503 });
  }
}

/**
 * POST /api/prompt
 * Saves the system prompt and rated aspects to Vercel Blob
 * Delete old blob first, then write new one (clean overwrite)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { systemPrompt, ratedAspects, mode } = body;
    const denied = await requireApiFeature(request, promptWriters(mode || 'mxml'), 'prompt_access');
    if (denied) return denied;
    const { blobPath, token } = getConfigForMode(mode || 'mxml');
    const blobFilename = blobPath.split('/').pop()!;

    if (typeof systemPrompt !== 'string' || typeof ratedAspects !== 'string') {
      return NextResponse.json(
        { error: 'systemPrompt and ratedAspects must be strings' },
        { status: 400 }
      );
    }

    // Delete any existing prompt blobs for this mode first
    const { blobs } = await list({ prefix: 'config/', token });
    const existing = blobs.filter(b =>
      b.pathname === blobPath ||
      b.pathname.endsWith(blobFilename)
    );
    if (existing.length > 0) {
      await del(existing.map(b => b.url), { token });
    }

    // Write fresh
    const configData: SavedPrompt = {
      systemPrompt,
      ratedAspects,
      updatedAt: new Date().toISOString(),
    };

    const result = await put(blobPath, JSON.stringify(configData, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      cacheControlMaxAge: 0,
      token,
    });

    return NextResponse.json({
      success: true,
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
export async function DELETE(request: NextRequest) {
  const denied = await requireApiFeature(request, promptWriters(request.nextUrl.searchParams.get('mode') || 'mxml'), 'prompt_access');
  if (denied) return denied;
  try {
    const mode = request.nextUrl.searchParams.get('mode') || 'mxml';
    const { blobPath, token } = getConfigForMode(mode);
    const blobFilename = blobPath.split('/').pop()!;

    // List and find the config blob for this mode
    const { blobs } = await list({ prefix: 'config/', token });
    const configBlob = blobs.find(b =>
      b.pathname === blobPath ||
      b.pathname.endsWith(blobFilename)
    );

    if (configBlob) {
      await del(configBlob.url, { token });
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
