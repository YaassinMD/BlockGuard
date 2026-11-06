import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/blocks - Get all blockchain blocks
export async function GET() {
  try {
    const blocks = await db.block.findMany({
      orderBy: { index: 'asc' },
    });
    return NextResponse.json(blocks);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
