import React, { useState, useRef, useEffect } from 'react';
import { useNostrMatchmaking } from '../lib/hooks/useNostrMatchmaking';
import { logger } from '../lib/nostr/logger';
import { dumpLocalStorage } from '../lib/nostr/index';

export default function ChatInterface() {
  const [inputMessage, setInputMessage] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [storageData, setStorageData] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { 
    status, 
    messages, 
    partner,
    error,
    startLooking, 
    sendMessage, 
    disconnect, 
    skipToNext,
    resetAll
  } = useNostrMatchmaking();

  // Start looking for a chat partner when the component mounts
  useEffect(() => {
    if (status === 'disconnected') {
      logger.info('Starting to look for chat partners');
      startLooking();
    }
  }, [status, startLooking]);

  // Scroll to bottom of messages when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    // Log message updates for debugging
    if (messages.length > 0) {
      logger.debug('Messages updated in UI', { 
        count: messages.length,
        last: {
          id: messages[messages.length - 1].id.substring(0, 8),
          content: messages[messages.length - 1].content.substring(0, 20),
          sender: messages[messages.length - 1].sender
        }
      });
    }
  }, [messages]);

  // Update logs every 2 seconds when debug panel is open
  useEffect(() => {
    if (!showDebug) return;
    
    const intervalId = setInterval(() => {
      setLogs(logger.getLogs().slice(-100));
      setStorageData(dumpLocalStorage());
    }, 2000);
    
    // Initial load
    setLogs(logger.getLogs().slice(-100));
    setStorageData(dumpLocalStorage());
    
    return () => clearInterval(intervalId);
  }, [showDebug]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim() === '') return;
    
    sendMessage(inputMessage);
    setInputMessage('');
  };

  const handleClearLogs = () => {
    logger.clear();
    setLogs([]);
  };

  const handleClearStorage = () => {
    if (window.confirm('Are you sure you want to clear all storage? This will disconnect any active chats.')) {
      resetAll();
      setStorageData(null);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-gray-900 to-gray-950 text-white">
      {/* Header */}
      <div className="bg-black/30 backdrop-blur-sm p-4 flex justify-between items-center border-b border-purple-900/30 shadow-md">
        <div className="flex items-center">
          <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
            Omestr
          </div>
          <div className="ml-3 text-xs bg-purple-900/40 text-purple-300 px-2 py-1 rounded-full">
            Nostr-powered
          </div>
        </div>
        <div className="flex space-x-4 items-center">
          <div className="flex space-x-2 items-center rounded-full bg-gray-800/50 px-3 py-1.5">
            <div className={`h-2.5 w-2.5 rounded-full ${
              status === 'connected' ? 'bg-green-500 animate-pulse' : 
              status === 'looking' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
            }`}></div>
            <div className="text-sm font-medium">
              {status === 'connected' ? 'Connected' : 
               status === 'looking' ? 'Looking for a stranger...' : 'Disconnected'}
            </div>
          </div>
          <button 
            onClick={() => setShowDebug(!showDebug)} 
            className="text-xs bg-gray-800/50 hover:bg-gray-700/70 px-3 py-1.5 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            {showDebug ? 'Hide Debug' : 'Debug'}
          </button>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="bg-black/20 backdrop-blur-sm p-4 border-b border-purple-900/30 text-xs overflow-auto max-h-96">
          <div className="flex justify-between mb-4">
            <h3 className="font-bold text-purple-400">Debug Information</h3>
            <div className="flex space-x-2">
              <button 
                onClick={handleClearLogs}
                className="bg-red-600/80 hover:bg-red-700/80 px-3 py-1 rounded-full transition-colors duration-200"
              >
                Clear Logs
              </button>
              <button 
                onClick={handleClearStorage}
                className="bg-red-600/80 hover:bg-red-700/80 px-3 py-1 rounded-full transition-colors duration-200"
              >
                Reset Storage
              </button>
            </div>
          </div>
          
          <div className="mb-4 p-3 bg-red-900/30 rounded-xl border border-red-500/20">
            <p className="font-bold text-white text-center mb-2">Not connecting with other browsers?</p>
            <p className="text-red-200 mb-2">
              Each browser needs a <span className="font-bold">unique identity</span>. Click the button below
              to reset your browser's identity, then try connecting again.
            </p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={handleClearStorage}
                className="bg-red-500/80 hover:bg-red-600/80 text-white font-bold py-2 px-4 rounded-lg animate-pulse transition-colors duration-200"
              >
                Reset All Data
              </button>
              
              <button
                onClick={() => {
                  // Force refresh the page to clean everything
                  window.location.reload();
                }}
                className="bg-blue-500/80 hover:bg-blue-600/80 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                Refresh Page
              </button>
            </div>
          </div>
          
          <div className="mb-4 p-3 bg-blue-900/30 rounded-xl border border-blue-500/20">
            <p className="font-bold text-white text-center mb-2">Connection Status</p>
            <div className="flex justify-center space-x-3 mb-2">
              <div className={`px-3 py-1 rounded-lg ${
                status === 'looking' ? 'bg-yellow-500 text-black font-bold' : 'bg-gray-700'
              }`}>Looking</div>
              <div className={`px-3 py-1 rounded-lg ${
                status === 'connecting' ? 'bg-blue-500 text-white font-bold' : 'bg-gray-700'
              }`}>Connecting</div>
              <div className={`px-3 py-1 rounded-lg ${
                status === 'connected' ? 'bg-green-500 text-white font-bold' : 'bg-gray-700'
              }`}>Connected</div>
            </div>
            {status === 'looking' && (
              <div className="flex justify-center mt-2">
                <button
                  onClick={() => {
                    // Force restart the looking process
                    resetAll();
                    setTimeout(() => startLooking(), 500);
                  }}
                  className="bg-green-500/80 hover:bg-green-600/80 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  Force Restart Matchmaking
                </button>
              </div>
            )}
          </div>
          
          <div className="mb-4">
            <h4 className="font-semibold border-b border-gray-700 pb-1 mb-2">Session Info</h4>
            <pre className="bg-gray-900/50 p-2 rounded-lg overflow-auto whitespace-pre-wrap">
              {`Status: ${status}\n`}
              {`Partner: ${partner ? 'Found - ID: ' + partner.id.substring(0, 8) + '...' : 'None'}\n`}
              {partner ? `Chat Session ID: ${partner.chatSessionId || 'None'}\n` : ''}
              {`Messages Count: ${messages.length}\n`}
              {`Error: ${error || 'None'}\n`}
              {`Browser: ${navigator.userAgent}\n`}
              {`Storage Available: ${typeof window !== 'undefined' && !!window.localStorage}\n`}
              {`StorageEvent Support: ${typeof window !== 'undefined' && 'onstorage' in window}\n`}
              {`BroadcastChannel Support: ${typeof window !== 'undefined' && 'BroadcastChannel' in window}\n`}
            </pre>
          </div>
          
          <div className="mb-4">
            <h4 className="font-semibold border-b border-gray-700 pb-1 mb-2">Messages ({messages.length})</h4>
            <div className="bg-gray-900/50 p-2 rounded-lg overflow-auto h-32 whitespace-pre-wrap">
              {messages.length > 0 ? messages.map((msg, index) => (
                <div key={msg.id} className={`mb-1 ${msg.sender === 'me' ? 'text-purple-400' : 'text-green-400'}`}>
                  <span className="text-gray-500">[{index + 1}] </span>
                  <span className="text-gray-400">{new Date(msg.timestamp).toISOString().split('T')[1].split('.')[0]} </span>
                  <span className="font-bold">{msg.sender === 'me' ? 'Me' : 'Partner'}: </span>
                  <span>{msg.content}</span>
                </div>
              )) : (
                <div className="text-gray-500">No messages yet</div>
              )}
            </div>
          </div>
          
          <div className="mb-4">
            <h4 className="font-semibold border-b border-gray-700 pb-1 mb-2">Storage Data</h4>
            <pre className="bg-gray-900/50 p-2 rounded-lg overflow-auto h-32 whitespace-pre-wrap">
              {storageData ? JSON.stringify(storageData, null, 2) : 'No data'}
            </pre>
          </div>
          
          <div>
            <h4 className="font-semibold border-b border-gray-700 pb-1 mb-2">
              Logs ({logs.length})
            </h4>
            <div className="bg-gray-900/50 p-2 rounded-lg overflow-auto h-64">
              {logs.map((log, index) => (
                <div key={index} className={`mb-1 ${
                  log.level === 'error' ? 'text-red-400' :
                  log.level === 'warn' ? 'text-yellow-400' :
                  log.level === 'info' ? 'text-blue-400' :
                  'text-gray-400'
                }`}>
                  <span className="opacity-70">
                    {new Date(log.timestamp).toISOString().split('T')[1].split('.')[0]}
                  </span>{' '}
                  <span className="font-mono">
                    {log.message}
                    {log.data && (
                      <span className="opacity-70"> {JSON.stringify(log.data)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && status === 'connected' && (
          <div className="text-center text-gray-400 mt-10">
            <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <div className="w-8 h-8 rounded-full bg-green-500 animate-pulse"></div>
            </div>
            <p className="text-lg font-semibold text-green-400">Connected!</p>
            <p className="mt-2">You are now chatting with a random stranger.</p>
            <p className="mt-1">Say hello!</p>
          </div>
        )}
        
        {messages.length === 0 && status === 'looking' && (
          <div className="text-center text-gray-400 mt-10">
            <div className="w-16 h-16 mx-auto bg-yellow-500/20 rounded-full flex items-center justify-center mb-4">
              <div className="w-8 h-8 rounded-full bg-yellow-500 animate-pulse"></div>
            </div>
            <p className="text-lg font-semibold text-yellow-400">Looking for someone to chat with...</p>
            
            <div className="mt-6 p-6 bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-xl max-w-md mx-auto shadow-lg">
              <p className="font-semibold mb-4 text-purple-400">How to test Omestr:</p>
              <ol className="text-left list-decimal pl-6 space-y-3">
                <li>Keep this window open</li>
                <li>Open another browser (Chrome, Firefox, Edge, etc. - not just a new tab)</li>
                <li>Navigate to <span className="text-blue-400">http://localhost:3000</span> in the other browser</li>
                <li>The two instances should connect automatically via Nostr</li>
                <li>Try sending messages between browsers!</li>
              </ol>
              <div className="mt-6 flex items-center space-x-2">
                <div className="h-2 w-2 bg-purple-500 rounded-full"></div>
                <p className="text-xs text-purple-300">
                  Using Nostr protocol for decentralized matchmaking
                </p>
              </div>
              
              <div className="mt-4 p-3 bg-gray-700/30 rounded-lg border border-gray-600/30">
                <div className="flex items-start space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-yellow-300">
                    If you're using private/incognito mode in one browser, matchmaking will still work
                    since we're using the Nostr network to connect users.
                  </p>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-gray-700/30 rounded-lg border border-gray-600/30">
                <div className="flex items-start space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-blue-300">
                    If connections aren't working, click the "Debug" button in the top right
                    to see what's happening behind the scenes.
                  </p>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-red-900/20 rounded-lg border border-red-800/30">
                <div className="flex items-start space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-xs text-white font-bold mb-2">Still not connecting?</p>
                    <ol className="text-left list-decimal pl-4 text-xs text-red-300 space-y-1">
                      <li>Click the "Debug" button in the top right</li>
                      <li>Click "Reset All Data and Restart" in <strong>all browser windows</strong></li>
                      <li>Try again - each browser needs a unique identity</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {status === 'disconnected' && (
          <div className="text-center text-gray-400 mt-10">
            <div className="w-16 h-16 mx-auto bg-red-500/20 rounded-full flex items-center justify-center mb-4">
              <div className="w-8 h-8 rounded-full bg-red-500"></div>
            </div>
            <p className="text-lg font-semibold text-red-400">Disconnected</p>
            <p className="mt-2">Click below to start looking for someone to chat with.</p>
          </div>
        )}
        
        {messages.map((message, index) => {
          const isFirst = index === 0 || messages[index - 1].sender !== message.sender;
          const showTimestamp = isFirst || messages[index - 1].timestamp < message.timestamp - 60000;
          
          return (
            <div key={message.id}>
              {showTimestamp && (
                <div className="text-center my-2">
                  <span className="text-xs text-gray-500 bg-gray-800/30 px-2 py-1 rounded-full">
                    {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                  </span>
                </div>
              )}
              <div className={`flex ${message.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div 
                  className={`rounded-2xl px-4 py-2 max-w-[70%] break-words shadow-sm ${
                    message.sender === 'me' 
                      ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white' 
                      : 'bg-gray-800/70 backdrop-blur-sm text-white border border-gray-700/50'
                  } ${isFirst ? (message.sender === 'me' ? 'rounded-tr-sm' : 'rounded-tl-sm') : ''}`}
                >
                  {message.content}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-black/30 backdrop-blur-sm p-4 border-t border-purple-900/30">
        {status === 'connected' ? (
          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-gray-800/70 text-white px-4 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500/50 border border-gray-700/50"
              autoFocus
            />
            <button
              type="submit"
              className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-6 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all duration-200 shadow-md hover:shadow-lg font-medium"
            >
              Send
            </button>
          </form>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={startLooking}
              className={`${
                status === 'looking' 
                  ? 'bg-yellow-600 hover:bg-yellow-700 cursor-wait' 
                  : 'bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700'
              } text-white px-8 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 shadow-md hover:shadow-lg transition-all duration-200 font-medium`}
              disabled={status === 'looking'}
            >
              {status === 'looking' ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Finding a stranger...
                </div>
              ) : 'Start Chatting'}
            </button>
          </div>
        )}
      </div>

      {/* Footer with Next button */}
      {status === 'connected' && (
        <div className="bg-black/30 backdrop-blur-sm p-3 border-t border-purple-900/30 flex justify-center">
          <button
            onClick={skipToNext}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-2 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-200 shadow-md hover:shadow-lg font-medium"
          >
            Next Stranger
          </button>
        </div>
      )}
    </div>
  );
} 