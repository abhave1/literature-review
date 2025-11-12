import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * POST /api/validate-key
 * Validates an access key provided by the user
 */
export async function POST(request: NextRequest) {
  try {
    const { key } = await request.json();

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'No key provided' },
        { status: 400 }
      );
    }

    // Get valid keys from environment variable
    // You can store multiple keys separated by commas
    const validKeys = process.env.NEXT_PUBLIC_ACCESS_KEYS?.split(',').map((k) => k.trim()) || [];

    if (validKeys.length === 0) {
      console.error('NEXT_PUBLIC_ACCESS_KEYS not configured');
      return NextResponse.json(
        { valid: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Check if the provided key matches any valid key
    const isValid = validKeys.includes(key.trim());

    return NextResponse.json({ valid: isValid });
  } catch (error) {
    console.error('Key validation error:', error);
    return NextResponse.json(
      { valid: false, error: 'Validation failed' },
      { status: 500 }
    );
  }
}
