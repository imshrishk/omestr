export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="flex flex-col items-center">
        <div className="relative w-24 h-24">
          <div className="absolute top-0 left-0 right-0 bottom-0 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500 w-full h-full">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div className="absolute top-0 left-0 right-0 bottom-0 animate-spin">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-300 w-full h-full opacity-30">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v6l4 2"></path>
            </svg>
          </div>
        </div>
        <h2 className="mt-4 text-xl font-semibold">Loading Omestr...</h2>
        <p className="mt-2 text-gray-400 text-center">
          Connecting to Nostr network
          <span className="animate-pulse">.</span>
          <span className="animate-pulse delay-150">.</span>
          <span className="animate-pulse delay-300">.</span>
        </p>
      </div>
    </div>
  );
} 