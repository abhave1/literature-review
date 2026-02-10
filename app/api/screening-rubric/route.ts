import { NextRequest, NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';
import {
  DEFAULT_RUBRICS,
  type ScreeningRubrics,
} from '@/lib/screening/default-rubrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Blob path for storing the screening rubric config
const RUBRIC_BLOB_PATH = 'config/screening-rubrics.json';

export interface SavedRubrics {
  rubrics: ScreeningRubrics;
  updatedAt: string;
}

/**
 * GET /api/screening-rubric
 * Retrieves the saved screening rubrics from Vercel Blob
 * Returns defaults if not found
 */
export async function GET() {
  try {
    // List blobs to find the config file
    const { blobs } = await list({ prefix: 'config/' });

    // Find the rubrics blob
    const rubricBlob = blobs.find(
      (b) =>
        b.pathname === RUBRIC_BLOB_PATH ||
        b.pathname.endsWith('screening-rubrics.json')
    );

    if (!rubricBlob) {
      // No saved config, return defaults
      return NextResponse.json(
        {
          rubrics: DEFAULT_RUBRICS,
          isDefault: true,
        },
        {
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        }
      );
    }

    // Fetch the config from blob (with cache bust)
    const response = await fetch(`${rubricBlob.url}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    const savedConfig: SavedRubrics = await response.json();

    return NextResponse.json(
      {
        rubrics: savedConfig.rubrics || DEFAULT_RUBRICS,
        isDefault: false,
        updatedAt: savedConfig.updatedAt,
      },
      {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (error) {
    console.error('Failed to load rubrics from Blob:', error);
    // Return defaults on error
    return NextResponse.json({
      rubrics: DEFAULT_RUBRICS,
      isDefault: true,
      error: 'Failed to load from storage, using defaults',
    });
  }
}

/**
 * POST /api/screening-rubric
 * Saves the screening rubrics to Vercel Blob
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rubrics } = body as { rubrics: ScreeningRubrics };

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
    const { blobs } = await list({ prefix: 'config/' });
    const existing = blobs.filter(
      (b) =>
        b.pathname === RUBRIC_BLOB_PATH ||
        b.pathname.endsWith('screening-rubrics.json')
    );
    if (existing.length > 0) {
      await del(existing.map((b) => b.url));
    }

    // Write fresh
    const configData: SavedRubrics = {
      rubrics,
      updatedAt: new Date().toISOString(),
    };

    const result = await put(
      RUBRIC_BLOB_PATH,
      JSON.stringify(configData, null, 2),
      {
        access: 'public',
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
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
export async function DELETE() {
  try {
    // List and find the rubrics blob
    const { blobs } = await list({ prefix: 'config/' });
    const rubricBlobs = blobs.filter(
      (b) =>
        b.pathname === RUBRIC_BLOB_PATH ||
        b.pathname.endsWith('screening-rubrics.json')
    );

    if (rubricBlobs.length > 0) {
      await del(rubricBlobs.map((b) => b.url));
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
