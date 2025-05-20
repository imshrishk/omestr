import React, { useState, useRef, useEffect } from 'react';
import { useServerMatchmaking } from '../lib/hooks/useServerMatchmaking';
import { useSoundEffects } from '../lib/hooks/useSoundEffects';
import { logger } from '../lib/nostr/logger';
import { dumpLocalStorage } from '../lib/nostr/index';

// Define types for logs and storage data
interface LogEntry {
  level: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

interface MessageType {
  id: string;
  content: string;
  sender: 'me' | 'partner';
  timestamp: number;
}

export default function ChatInterface() {
  const [inputMessage, setInputMessage] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [storageData, setStorageData] = useState<Record<string, unknown> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { 
    status, 
    messages, 
    partner,
    error,
    startLooking, 
    sendMessage, 
    skipToNext,
    resetAll,
    formattedDuration,
    messageReactions,
    sendReaction
  } = useServerMatchmaking();
  
  // Initialize sound effects hook
  const { 
    playNewMessageSound, 
    playConnectionSound, 
    playDisconnectionSound 
  } = useSoundEffects();
  
  // Track which message has emoji picker open
  const [activeEmojiPicker, setActiveEmojiPicker] = useState<string | null>(null);

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

  // Play sound on new messages
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      // Only play sound for partner messages
      if (lastMessage.sender === 'partner') {
        playNewMessageSound();
      }
    }
  }, [messages, playNewMessageSound]);

  // Play sound on connection status changes
  useEffect(() => {
    if (status === 'connected' && partner) {
      playConnectionSound();
    } else if (status === 'disconnected') {
      playDisconnectionSound();
    }
  }, [status, partner, playConnectionSound, playDisconnectionSound]);

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
  
  const handleReactionClick = (messageId: string, emoji: string) => {
    sendReaction(messageId, emoji);
    setActiveEmojiPicker(null);
  };
  
  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '😡'];

  // Message component with reactions
  const MessageItem = ({ message }: { message: MessageType }) => {
    const isMe = message.sender === 'me';
    const reactions = messageReactions[message.id] || [];
    
    // Always display messages from "me" on the right and "partner" on the left
    // This will ensure the chat shows the same layout for both users
    const messagePosition = isMe ? 'justify-end' : 'justify-start';
    const messageBgColor = isMe ? 'bg-purple-600' : 'bg-gray-700';
    
    // Separate reactions by who sent them
    const myReactions = reactions.filter(r => r.sender === 'me');
    const partnerReactions = reactions.filter(r => r.sender === 'partner');
    
    return (
      <div className={`flex ${messagePosition} mb-4`}>
        <div className="flex flex-col max-w-[80%]">
          <div className={`rounded-lg px-4 py-2 break-words ${
            messageBgColor
          } text-white`}>
            {message.content}
          </div>
          
          {/* Display reactions */}
          {reactions.length > 0 && (
            <div className={`flex mt-1 space-x-1 ${messagePosition} flex-wrap`}>
              {myReactions.map((reaction, idx) => (
                <span key={`my-${idx}`} className="bg-purple-800 text-white text-xs rounded-full px-2 py-1 mb-1">
                  {reaction.emoji}
                </span>
              ))}
              {partnerReactions.map((reaction, idx) => (
                <span key={`partner-${idx}`} className="bg-gray-800 text-white text-xs rounded-full px-2 py-1 mb-1">
                  {reaction.emoji}
                </span>
              ))}
            </div>
          )}
          
          {/* Add reaction button */}
          <div className={`flex mt-1 ${messagePosition}`}>
            <button 
              onClick={() => setActiveEmojiPicker(activeEmojiPicker === message.id ? null : message.id)}
              className="text-gray-400 hover:text-white text-sm bg-gray-800 hover:bg-gray-700 rounded-full h-6 w-6 flex items-center justify-center"
              title="Add reaction"
            >
              😀
            </button>
          </div>
          
          {/* Emoji picker */}
          {activeEmojiPicker === message.id && (
            <div className={`bg-gray-800 rounded p-2 mt-1 flex flex-wrap gap-2 ${isMe ? 'ml-auto' : 'mr-auto'}`}>
              {commonEmojis.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleReactionClick(message.id, emoji)}
                  className="hover:bg-gray-700 rounded p-1 text-lg"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700">
        <div className="text-xl font-bold text-purple-400">Omestr</div>
        <div className="flex items-center space-x-4">
          {status === 'connected' && (
            <div className="text-green-400 font-mono bg-gray-900 px-3 py-1 rounded-md">
              Connected for {formattedDuration()}
            </div>
          )}
          <div className="flex items-center space-x-2">
            <div className={`h-3 w-3 rounded-full ${
              status === 'connected' ? 'bg-green-500' : 
              status === 'looking' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
            }`}></div>
            <div>
              {status === 'connected' ? 'Connected' : 
               status === 'looking' ? 'Looking for a stranger...' : 'Disconnected'}
            </div>
          </div>
          <button 
            onClick={() => setShowDebug(!showDebug)} 
            className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded-md"
          >
            {showDebug ? 'Hide Debug' : 'Debug'}
          </button>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="bg-gray-800 p-4 border-b border-gray-700 text-xs overflow-auto max-h-96">
          <div className="flex justify-between mb-4">
            <h3 className="font-bold text-purple-400">Debug Information</h3>
            <div className="flex space-x-2">
              <button 
                onClick={handleClearLogs}
                className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
              >
                Clear Logs
              </button>
              <button 
                onClick={handleClearStorage}
                className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
              >
                Reset Storage
              </button>
            </div>
          </div>
          
          <div className="mb-4 p-3 bg-red-900/50 rounded-lg">
            <p className="font-bold text-white text-center mb-2">Not connecting with other browsers?</p>
            <p className="text-red-200 mb-2">
              Each browser needs a <span className="font-bold">unique identity</span>. Click the button below
              to reset your browser&apos;s identity, then try connecting again.
            </p>
            <div className="flex justify-center">
              <button
                onClick={handleClearStorage}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded animate-pulse"
              >
                Reset All Data and Restart
              </button>
            </div>
          </div>
          
          <div className="mb-4">
            <h4 className="font-semibold border-b border-gray-700 pb-1 mb-2">Session Info</h4>
            <pre className="bg-gray-900 p-2 rounded overflow-auto whitespace-pre-wrap">
              {`Status: ${status}\n`}
              {`Partner: ${partner ? 'Found - ID: ' + partner.id.substring(0, 8) + '...' : 'None'}\n`}
              {partner ? `Chat Session ID: ${partner.chatSessionId || 'None'}\n` : ''}
              {`Messages Count: ${messages.length}\n`}
              {`Error: ${error || 'None'}\n`}
              {`Browser Instance ID: ${typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('omestr_browser_instance_id')?.substring(0, 8) + '...' : 'Not available'}\n`}
              {`Browser: ${navigator.userAgent}\n`}
              {`Storage Available: ${typeof window !== 'undefined' && !!window.localStorage}\n`}
              {`StorageEvent Support: ${typeof window !== 'undefined' && 'onstorage' in window}\n`}
              {`BroadcastChannel Support: ${typeof window !== 'undefined' && 'BroadcastChannel' in window}\n`}
            </pre>
          </div>
          
          <div className="mb-4">
            <h4 className="font-semibold border-b border-gray-700 pb-1 mb-2">Messages ({messages.length})</h4>
            <div className="bg-gray-900 p-2 rounded overflow-auto h-32 whitespace-pre-wrap">
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
            <pre className="bg-gray-900 p-2 rounded overflow-auto h-32 whitespace-pre-wrap">
              {storageData ? JSON.stringify(storageData, null, 2) : 'No data'}
            </pre>
          </div>
          
          <div>
            <h4 className="font-semibold border-b border-gray-700 pb-1 mb-2">
              Logs ({logs.length})
            </h4>
            <div className="bg-gray-900 p-2 rounded overflow-auto h-64">
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
            <p className="text-lg font-semibold text-green-400">Connected!</p>
            <p className="mt-2">You are now chatting with a random stranger.</p>
            <p className="mt-1">Say hello!</p>
          </div>
        )}
        
        {messages.length === 0 && status === 'looking' && (
          <div className="text-center text-gray-400 mt-10">
            <p className="text-lg font-semibold text-yellow-400">Looking for someone to chat with...</p>
            
            <div className="mt-6 p-4 bg-gray-800 rounded-lg max-w-md mx-auto">
              <p className="font-semibold mb-2 text-purple-400">How to test Omestr:</p>
              <ol className="text-left list-decimal pl-6 space-y-2">
                <li>Keep this window open</li>
                <li>Open another browser (Chrome, Firefox, Edge, Brave etc. - not just a new tab)</li>
                <li>Navigate to <span className="text-blue-400">https://omestr.vercel.app</span> in the other browser</li>
                <li>The two instances should connect automatically</li>
                <li>Try sending messages between browsers!</li>
              </ol>
              <p className="mt-4 text-xs text-gray-500">
                We&apos;re using the Nostr protocol and decentralized relays to connect users
              </p>
              <div className="mt-4 p-2 bg-gray-700 rounded-md">
                <p className="text-xs text-yellow-300">
                  Note: All messages are encrypted end-to-end using the Nostr protocol (NIP-04),
                  and communications happen through decentralized relays rather than a central server.
                </p>
              </div>
              <div className="mt-4 p-2 bg-gray-700 rounded-md">
                <p className="text-xs text-blue-300">
                  Troubleshooting: If connections aren&apos;t working, click the &quot;Debug&quot; button in the top right
                  to see what&apos;s happening behind the scenes.
                </p>
              </div>
              <div className="mt-4 p-3 bg-red-900/20 rounded-md">
                <p className="text-xs text-white font-bold mb-1">
                  Still not connecting?
                </p>
                <ol className="text-left list-decimal pl-4 text-xs text-red-300">
                  <li>Click the &quot;Debug&quot; button in the top right</li>
                  <li>Click &quot;Reset All Data and Restart&quot; in <strong>all browser windows</strong></li>
                  <li>Try again - each browser needs a unique identity(Can also use Ctrl+Shift+R)</li>
                </ol>
              </div>
            </div>
          </div>
        )}
        
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-gray-800 p-4 border-t border-gray-700">
        {status === 'connected' ? (
          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-l-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoFocus
            />
            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-r-md focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
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
                  ? 'bg-yellow-600 hover:bg-yellow-700' 
                  : 'bg-green-600 hover:bg-green-700'
              } text-white px-8 py-3 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 font-medium`}
              disabled={status === 'looking'}
            >
              {status === 'looking' ? 'Finding a stranger...' : 'Start Chatting'}
            </button>
          </div>
        )}
      </div>

      {/* Footer with Next button */}
      {status === 'connected' && (
        <div className="bg-gray-800 p-3 border-t border-gray-700 flex justify-center">
          <button
            onClick={skipToNext}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 font-medium"
          >
            Next Stranger
          </button>
        </div>
      )}
    </div>
  );
} 