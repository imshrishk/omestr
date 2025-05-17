import { NextResponse } from 'next/server';
import { DEFAULT_RELAYS } from '../../../lib/nostr/index';

export async function GET() {
  try {
    // In a real implementation, we would ping each relay 
    // to see if it's online, but for simplicity, we'll just return the list
    const relays = DEFAULT_RELAYS.map(relay => ({
      url: relay,
      status: 'unknown' // In a real implementation, we would check if the relay is online
    }));

    return NextResponse.json({ 
      success: true, 
      relays 
    });
  } catch (error) {
    console.error('Error checking relay status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check relay status' },
      { status: 500 }
    );
  }
} 