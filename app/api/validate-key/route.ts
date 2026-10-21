import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ valid: false, error: 'Shared access keys have been retired. Sign in with Google.' }, { status: 410 });
}
