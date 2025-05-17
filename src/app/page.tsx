'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// Use dynamic import with SSR disabled for the ChatInterface
// This is necessary because the Nostr library uses browser APIs
const ChatInterface = dynamic(
  () => import('../components/ChatInterface'),
  { ssr: false }
);

export default function Home() {
  // Use client-side only rendering to avoid hydration issues
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  if (!isMounted) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Omestr</h1>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-900">
      <ChatInterface />
    </div>
  );
}
