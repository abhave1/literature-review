import { DEFAULT_SCREENING_PROMPT_TEMPLATE } from '@/lib/screening/prompts';
import { loadScreeningConfig } from '@/lib/screening/store';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAccess, requireApiFeature, getAccount, canUseFeature } from '@/lib/auth/server';
import { put, list, del } from '@vercel/blob';
import {
  DEFAULT_RUBRICS,
  type ScreeningRubrics,
} from '@/lib/screening/default-rubrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Blob path for storing the screening rubric config
const RUBRIC_BLOB_PATH = 'config/screening-rubrics.json';
const RUBRIC_TOKEN = process.env.BLOB_MXML_READ_WRITE_TOKEN;

export interface SavedRubrics {
  rubrics: ScreeningRubrics;
  promptTemplate?: string;
  updatedAt: string;
}

/**
 * GET /api/screening-rubric
 * Retrieves the saved screening rubrics from Vercel Blob
 * Returns defaults if not found
 */
export async function GET(request: NextRequest) {
  const denied = await requireApiAccess(request, ['screening']);
  if (denied) return denied;
  try {
    const account = await getAccount();
    const { promptTemplate, ...safeConfig } = await loadScreeningConfig();
    const canManagePrompts = !!account && canUseFeature(account, ['screening'], 'prompt_access');
    return NextResponse.json({ ...safeConfig, ...(canManagePrompts ? { promptTemplate, defaultPromptTemplate: DEFAULT_SCREENING_PROMPT_TEMPLATE } : {}) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Screening configuration unavailable' }, { status: 503 });
  }
}

/**
 * POST /api/screening-rubric
 * Saves the screening rubrics to Vercel Blob
 */
export async function POST(request: NextRequest) {
  const denied = await requireApiFeature(request, ['screening'], 'prompt_access');
  if (denied) return denied;
  try {
    const body = await request.json();
    const { rubrics, promptTemplate } = body as { rubrics: ScreeningRubrics; promptTemplate?: string };

    if (!rubrics || typeof rubrics !== 'object') {
      return NextResponse.json(
        { error: 'rubrics must be an object' },
        { status: 400 }
      );
    }

    // Validate required fields
    const requiredFields = [
      'inclusionRules',
      'exclusionRules',
      'specialRules',
      'definitions',
    ];
    for (const field of requiredFields) {
      if (typeof rubrics[field as keyof ScreeningRubrics] !== 'string') {
        return NextResponse.json(
          { error: `rubrics.${field} must be a string` },
          { status: 400 }
        );
      }
    }

    // Delete any existing rubric blobs first
    const { blobs } = await list({ prefix: 'config/', token: RUBRIC_TOKEN });
    const existing = blobs.filter(
      (b) =>
        b.pathname === RUBRIC_BLOB_PATH ||
        b.pathname.endsWith('screening-rubrics.json')
    );
    if (existing.length > 0) {
      await del(existing.map((b) => b.url), { token: RUBRIC_TOKEN });
    }

    // Write fresh
    const configData: SavedRubrics = {
      rubrics,
      ...(promptTemplate !== undefined && { promptTemplate }),
      updatedAt: new Date().toISOString(),
    };

    const result = await put(
      RUBRIC_BLOB_PATH,
      JSON.stringify(configData, null, 2),
      {
        access: 'public',
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
        token: RUBRIC_TOKEN,
      }
    );

    return NextResponse.json({
      success: true,
      updatedAt: configData.updatedAt,
      blobUrl: result.url,
    });
  } catch (error) {
    console.error('Failed to save rubrics to Blob:', error);
    return NextResponse.json(
      { error: 'Failed to save rubrics', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/screening-rubric
 * Resets the rubrics to defaults by deleting from Blob
 */
export async function DELETE(request: NextRequest) {
  const denied = await requireApiFeature(request, ['screening'], 'prompt_access');
  if (denied) return denied;
  try {
    // List and find the rubrics blob
    const { blobs } = await list({ prefix: 'config/', token: RUBRIC_TOKEN });
    const rubricBlobs = blobs.filter(
      (b) =>
        b.pathname === RUBRIC_BLOB_PATH ||
        b.pathname.endsWith('screening-rubrics.json')
    );

    if (rubricBlobs.length > 0) {
      await del(rubricBlobs.map((b) => b.url), { token: RUBRIC_TOKEN });
    }

    return NextResponse.json({
      success: true,
      message: 'Rubrics reset to defaults',
    });
  } catch (error) {
    console.error('Failed to reset rubrics:', error);
    return NextResponse.json(
      { error: 'Failed to reset rubrics', details: String(error) },
      { status: 500 }
    );
  }
}
