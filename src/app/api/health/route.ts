import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    app: 'omestr',
    description: 'A Nostr-based chat application'
  });
} 