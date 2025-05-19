import { useState, useEffect, useCallback, useRef } from 'react';
import {
  generateKeypair,
  createPool,
  publishMatchmakingEvent,
  subscribeToMatchmaking,
  publishChatMessage,
  subscribeToChatMessages,
  generateRandomString,
  DEFAULT_RELAYS,
  OMESTR_KIND,
} from './index';
import { logger } from './logger';
import { SimplePool, Event } from 'nostr-tools';

type ChatMessage = {
  id: string;
  content: string;
  sender: 'me' | 'partner';
  timestamp: number;
};

type ConnectionStatus = 'disconnected' | 'looking' | 'connected';

// Generate a unique browser instance ID to differentiate between browser sessions
const getBrowserInstanceId = (): string => {
  if (typeof window === 'undefined') return '';
  
  const storageKey = 'omestr_browser_instance_id';
  let instanceId = localStorage.getItem(storageKey);
  
  if (!instanceId) {
    instanceId = generateRandomString(16);
    localStorage.setItem(storageKey, instanceId);
    logger.info('Generated new browser instance ID', { instanceId });
  }
  
  return instanceId;
};

// Always generate a new keypair for each session instead of reusing from localStorage
const getSessionKeypair = (): { privateKey: string; publicKey: string } => {
  const keypair = generateKeypair();
  logger.info('Generated new session keypair', { 
    publicKey: keypair.publicKey.substring(0, 8)
  });
  return keypair;
};

// Clear all storage related to the application
const clearAllStorage = () => {
  if (typeof window === 'undefined') return;
  
  logger.info('Clearing all application storage');
  
  // Clear all keys with our prefix
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('omestr_')) {
      localStorage.removeItem(key);
    }
  });
  
  // Also clear logs
  localStorage.removeItem('omestr_logs');
};

export function useNostr() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [keypair, setKeypair] = useState<{ privateKey: string; publicKey: string } | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [partnerPubkey, setPartnerPubkey] = useState<string | null>(null);
  const [browserInstanceId] = useState<string>(typeof window !== 'undefined' ? getBrowserInstanceId() : '');
  
  const poolRef = useRef<SimplePool | null>(null);
  const matchmakingSubRef = useRef<{ unsub: () => void } | null>(null);
  const chatSubRef = useRef<{ unsub: () => void } | null>(null);
  
  // Initialize the Nostr connection
  const initialize = useCallback(() => {
    // Always generate a new keypair for this session
    const newKeypair = getSessionKeypair();
    setKeypair(newKeypair);
    
    // Create a new session ID
    const newSessionId = generateRandomString(12);
    setSessionId(newSessionId);
    
    // Create a pool for relay connections
    if (!poolRef.current) {
      poolRef.current = createPool();
    }
    
    return { newKeypair, newSessionId };
  }, []);
  
  // Start looking for a chat partner
  const startLooking = useCallback(async () => {
    if (!keypair || !poolRef.current) {
      const { newKeypair, newSessionId } = initialize();
      
      // Reset state for a new session
      setStatus('looking');
      setMessages([]);
      setPartnerPubkey(null);
      
      // Make sure pool is initialized
      if (!poolRef.current) return;
      
      logger.info('Starting to look for chat partners', { 
        pubkey: newKeypair.publicKey.substring(0, 8) + '...',
        sessionId: newSessionId,
        browserId: browserInstanceId
      });
      
      // Publish a "looking" event
      await publishMatchmakingEvent(
        poolRef.current,
        newKeypair.privateKey,
        newKeypair.publicKey,
        newSessionId,
        'looking',
        undefined,
        browserInstanceId
      );
      
      // Subscribe to matchmaking events
      subscribeToMatchmakingEvents(newKeypair.publicKey, newSessionId);
    } else {
      // Reset state for a new session
      setStatus('looking');
      setMessages([]);
      setPartnerPubkey(null);
      
      logger.info('Starting to look for chat partners', { 
        pubkey: keypair.publicKey.substring(0, 8) + '...',
        sessionId,
        browserId: browserInstanceId
      });
      
      // Publish a "looking" event
      await publishMatchmakingEvent(
        poolRef.current,
        keypair.privateKey,
        keypair.publicKey,
        sessionId,
        'looking',
        undefined,
        browserInstanceId
      );
      
      // Subscribe to matchmaking events
      subscribeToMatchmakingEvents(keypair.publicKey, sessionId);
    }
  }, [keypair, sessionId, initialize, browserInstanceId]);
  
  // Subscribe to matchmaking events
  const subscribeToMatchmakingEvents = useCallback((publicKey: string, currentSessionId: string) => {
    if (!poolRef.current) return;
    
    // Close previous subscription if it exists
    if (matchmakingSubRef.current) {
      matchmakingSubRef.current.unsub();
    }
    
    // Create a new subscription
    const sub = subscribeToMatchmaking(
      poolRef.current,
      publicKey,
      (event: Event) => {
        // Check for unique browser instance IDs
        const browserIdTag = event.tags.find((tag: string[]) => tag[0] === 'browser_id');
        const eventBrowserId = browserIdTag ? browserIdTag[1] : '';
        
        // Extract status from tags
        const statusTag = event.tags.find((tag: string[]) => tag[0] === 'status');
        const status = statusTag ? statusTag[1] : '';
        
        // Extract session ID from tags
        const sessionTag = event.tags.find((tag: string[]) => tag[0] === 'session');
        const eventSessionId = sessionTag ? sessionTag[1] : '';
        
        logger.debug('Received matchmaking event', {
          status,
          pubkey: event.pubkey.substring(0, 8),
          sessionId: eventSessionId,
          browserInstanceId: eventBrowserId,
          ourBrowserId: browserInstanceId
        });
        
        // Skip our own browser's events by comparing browser instance IDs
        if (eventBrowserId === browserInstanceId) {
          logger.debug('Skipping event from our own browser instance');
          return;
        }
        
        // Handle "looking" events when we're also looking
        if (status === 'looking' && !partnerPubkey) {
          // Found a potential match from a different browser
          handlePotentialMatch(event.pubkey, eventSessionId);
        }
        
        // Handle "matched" events with our pubkey
        const partnerTag = event.tags.find((tag: string[]) => tag[0] === 'p' && tag[1] === publicKey);
        if (status === 'matched' && partnerTag) {
          // Confirm the match
          handleMatchConfirmation(event.pubkey, eventSessionId);
        }
      }
    );
    
    matchmakingSubRef.current = sub;
  }, [partnerPubkey, browserInstanceId]);
  
  // Handle a potential match
  const handlePotentialMatch = useCallback(async (potentialPartnerPubkey: string, partnerSessionId: string) => {
    if (!keypair || !poolRef.current || status !== 'looking') return;
    
    logger.info(`Found potential match: ${potentialPartnerPubkey.substring(0, 8)}...`, {
      status,
      partnerSessionId,
      browserId: browserInstanceId
    });
    
    // Update our event to "matched" with the partner's pubkey
    await publishMatchmakingEvent(
      poolRef.current,
      keypair.privateKey,
      keypair.publicKey,
      sessionId,
      'matched',
      potentialPartnerPubkey,
      browserInstanceId
    );
    
    // Set the partner's pubkey
    setPartnerPubkey(potentialPartnerPubkey);
    setStatus('connected');
    
    // Subscribe to chat messages
    subscribeToChatMessagesFromPartner(potentialPartnerPubkey);
  }, [keypair, poolRef, status, sessionId, browserInstanceId]);
  
  // Handle match confirmation
  const handleMatchConfirmation = useCallback(async (confirmedPartnerPubkey: string, partnerSessionId: string) => {
    if (!keypair || !poolRef.current) return;
    
    logger.info(`Match confirmed with: ${confirmedPartnerPubkey.substring(0, 8)}...`, {
      status,
      partnerSessionId,
      browserId: browserInstanceId
    });
    
    // Set the partner's pubkey
    setPartnerPubkey(confirmedPartnerPubkey);
    setStatus('connected');
    
    // Subscribe to chat messages
    subscribeToChatMessagesFromPartner(confirmedPartnerPubkey);
  }, [keypair, poolRef, status, browserInstanceId]);
  
  // Subscribe to chat messages from the partner
  const subscribeToChatMessagesFromPartner = useCallback((partnerPubkeyToUse: string) => {
    if (!keypair || !poolRef.current) return;
    
    // Close previous subscription if it exists
    if (chatSubRef.current) {
      chatSubRef.current.unsub();
    }
    
    // Create a new subscription
    const sub = subscribeToChatMessages(
      poolRef.current,
      keypair.privateKey,
      keypair.publicKey,
      partnerPubkeyToUse,
      sessionId,
      browserInstanceId,
      (event: Event & { decryptedContent?: string }) => {
        if (!event.decryptedContent) {
          logger.error('Received message with no decrypted content', { 
            id: event.id.substring(0, 8),
            pubkey: event.pubkey.substring(0, 8)
          });
          return;
        }
        
        logger.info(`Received message from ${event.pubkey.substring(0, 8)}`, {
          content: event.decryptedContent.substring(0, 20) + (event.decryptedContent.length > 20 ? '...' : '')
        });
        
        // Add the message to our messages list
        const newMessage: ChatMessage = {
          id: event.id,
          content: event.decryptedContent,
          sender: 'partner',
          timestamp: event.created_at,
        };
        
        setMessages(prev => [...prev, newMessage]);
      }
    );
    
    chatSubRef.current = sub;
  }, [keypair, poolRef, sessionId, browserInstanceId]);
  
  // Send a chat message
  const sendMessage = useCallback(async (content: string) => {
    if (!keypair || !poolRef.current || !partnerPubkey) {
      logger.error('Cannot send message, not connected to a partner');
      return;
    }
    
    // Create a message object
    const newMessage: ChatMessage = {
      id: generateRandomString(16),
      content,
      sender: 'me',
      timestamp: Math.floor(Date.now() / 1000),
    };
    
    // Add to messages immediately for UI responsiveness
    setMessages(prev => [...prev, newMessage]);
    
    // Send the message via Nostr
    try {
      await publishChatMessage(
        poolRef.current,
        keypair.privateKey,
        keypair.publicKey,
        partnerPubkey,
        sessionId,
        content,
        browserInstanceId
      );
      logger.info('Message sent successfully', { 
        to: partnerPubkey.substring(0, 8),
        content: content.substring(0, 20) + (content.length > 20 ? '...' : '')
      });
    } catch (error) {
      logger.error('Error sending message', error);
      
      // Optionally, you could add error handling here
      // For example, mark the message as "failed" in the UI
    }
  }, [keypair, poolRef, partnerPubkey, sessionId, browserInstanceId]);
  
  // Disconnect from the current chat
  const disconnect = useCallback(() => {
    logger.info('Disconnecting from chat');
    
    // Close subscriptions
    if (matchmakingSubRef.current) {
      matchmakingSubRef.current.unsub();
      matchmakingSubRef.current = null;
    }
    
    if (chatSubRef.current) {
      chatSubRef.current.unsub();
      chatSubRef.current = null;
    }
    
    // Reset state
    setStatus('disconnected');
    setPartnerPubkey(null);
    setMessages([]);
    
    // Optional: Clear the keypair to generate a new one next time
    setKeypair(null);
  }, []);
  
  // Clear all stored data
  const clearData = useCallback(() => {
    disconnect();
    clearAllStorage();
  }, [disconnect]);
  
  // Clean up subscriptions when component unmounts
  useEffect(() => {
    return () => {
      if (matchmakingSubRef.current) {
        matchmakingSubRef.current.unsub();
      }
      
      if (chatSubRef.current) {
        chatSubRef.current.unsub();
      }
    };
  }, []);
  
  return {
    status,
    messages,
    startLooking,
    sendMessage,
    disconnect,
    clearData,
  };
} 