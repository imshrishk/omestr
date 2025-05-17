'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Unhandled error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
      <div className="max-w-md w-full p-6 bg-gray-800 rounded-lg shadow-lg text-center">
        <div className="text-red-500 text-5xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
        <p className="text-gray-300 mb-6">
          We&apos;ve encountered an error. This could be due to network issues or problems connecting to Nostr relays.
        </p>
        <div className="flex flex-col space-y-3">
          <button
            onClick={reset}
            className="bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 rounded-md transition-colors"
          >
            Try again
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="bg-gray-700 hover:bg-gray-600 text-white font-medium px-4 py-2 rounded-md transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
} 