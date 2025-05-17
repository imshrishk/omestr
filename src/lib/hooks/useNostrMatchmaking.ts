import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  generateKeypair, 
  createPool, 
  publishMatchmakingEvent, 
  subscribeToMatchmaking, 
  publishChatMessage, 
  subscribeToChatMessages, 
  SimplePool, 
  generateRandomString, 
  DEFAULT_RELAYS,
  NostrEvent,
  clearStorage
} from '../nostr';
import { logger } from '../nostr/logger';

// Prefix for all storage keys - must match the one in ../nostr/index.ts
const KEY_PREFIX = 'omestr_global_';

// Types
export type ConnectionStatus = 'disconnected' | 'looking' | 'connecting' | 'connected';

export type ChatMessage = {
  id: string;
  content: string;
  sender: 'me' | 'partner';
  timestamp: number;
};

export type PartnerInfo = {
  id: string;         // Partner's Nostr pubkey
  chatSessionId: string;  // Shared chat session ID
};

// Define a type for the subscription object
type Subscription = {
  sub: string;
  unsub: () => void;
  on: (event: string, callback: (event: NostrEvent) => void) => void;
};

// Generate a unique browser instance ID to differentiate between browser sessions
const getBrowserInstanceId = (): string => {
  if (typeof window === 'undefined') return '';
  
  const storageKey = 'omestr_browser_instance_id';
  // Use sessionStorage instead of localStorage to ensure unique IDs per tab
  let instanceId = sessionStorage.getItem(storageKey);
  
  if (!instanceId) {
    // Add browser fingerprinting elements to make IDs more unique across browsers
    const browserFingerprint = navigator.userAgent + 
      '-' + window.screen.width + 
      '-' + window.screen.height + 
      '-' + new Date().getTimezoneOffset() +
      '-' + navigator.language;
      
    // Generate unique ID based on fingerprint and random string
    instanceId = generateRandomString(8) + '-' + 
      browserFingerprint.split('').reduce((a, b) => {
        return a + b.charCodeAt(0);
      }, 0).toString(16);
      
    sessionStorage.setItem(storageKey, instanceId);
    logger.info('Generated new browser instance ID', { instanceId });
  }
  
  return instanceId;
};

// Hook for Nostr-based matchmaking
export function useNostrMatchmaking() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [keypair, setKeypair] = useState<{ privateKey: string; publicKey: string } | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [partner, setPartner] = useState<PartnerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [browserInstanceId] = useState<string>(typeof window !== 'undefined' ? getBrowserInstanceId() : '');
  
  // Refs to maintain pool and subscriptions
  const poolRef = useRef<SimplePool | null>(null);
  const matchmakingSubRef = useRef<Subscription | null>(null);
  const chatSubRef = useRef<Subscription | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  
  // Track the last match attempt time to prevent spamming
  const lastMatchAttemptRef = useRef<number>(0);
  // Track pending match confirmations
  const pendingMatchRef = useRef<{pubkey: string, sessionId: string, timestamp: number} | null>(null);
  // Track connection timeouts
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Initialize the Nostr connection
  const initialize = useCallback(() => {
    logger.info('Initializing Nostr connection');
    
    // Generate a new keypair for this session
    const newKeypair = generateKeypair();
    setKeypair(newKeypair);
    
    // Create a new session ID - ensure it's never empty
    const newSessionId = generateRandomString(12);
    logger.info('Generated new session ID', { sessionId: newSessionId });
    setSessionId(newSessionId);
    
    // Create a pool for relay connections if it doesn't exist
    if (!poolRef.current) {
      poolRef.current = createPool();
      logger.info('Created new Nostr pool with relays', { relays: DEFAULT_RELAYS });
      
      // Store the pool reference globally for diagnostics
      if (typeof window !== 'undefined') {
        window._omestrPoolRef = poolRef;
      }
    }
    
    return { newKeypair, newSessionId };
  }, []);
  
  // Add a function to check and restore relay connections
  const checkRelayConnections = useCallback(() => {
    if (!poolRef.current) return;
    
    // Check if we have any connected relays
    const connectedCount = poolRef.current.connectedRelays.size;
    
    if (connectedCount === 0) {
      logger.warn('No connected relays detected, attempting to reconnect');
      
      // Try connecting to all relays again
      poolRef.current.connect(DEFAULT_RELAYS);
      
      // Set a timer to verify connections were established
      setTimeout(() => {
        const newConnectedCount = poolRef.current?.connectedRelays.size || 0;
        if (newConnectedCount === 0) {
          logger.error('Failed to connect to any relays after retry');
          setError('Failed to connect to any Nostr relays. Please check your network connection.');
        } else {
          logger.info(`Successfully reconnected to ${newConnectedCount} relays`);
          setError(null);
        }
      }, 5000);
    }
  }, []);
  
  // Periodically check relay connections
  useEffect(() => {
    // Skip if not looking or connecting
    if (status !== 'looking' && status !== 'connecting') return;
    
    const interval = setInterval(() => {
      checkRelayConnections();
    }, 15000); // Check every 15 seconds
    
    return () => clearInterval(interval);
  }, [status, checkRelayConnections]);
  
  // Subscribe to chat with a partner
  const subscribeToChatWithPartner = useCallback((partnerPubkey: string, chatSessionId: string) => {
    if (!keypair || !poolRef.current) return;
    
    logger.info(`Subscribing to chat with partner: ${partnerPubkey.substring(0, 8)}`, {
      chatSessionId
    });
    
    // Unsubscribe from any existing chat subscription
    if (chatSubRef.current) {
      chatSubRef.current.unsub();
      chatSubRef.current = null;
    }
    
    // Subscribe to chat messages
    const sub = subscribeToChatMessages(
      poolRef.current,
      keypair.publicKey,
      partnerPubkey,
      chatSessionId,
      browserInstanceId,
      (event: NostrEvent) => {
        // Extract the message content
        const content = event.content;
        const isMine = event.pubkey === keypair.publicKey;
        
        // Add the message to the list
        const newMessage: ChatMessage = {
          id: event.id,
          content: content,
          sender: isMine ? 'me' : 'partner',
          timestamp: event.created_at * 1000 // Convert to milliseconds
        };
        
        logger.info(`Received ${isMine ? 'my' : 'partner'} message: ${content.substring(0, 20)}${content.length > 20 ? '...' : ''}`, {
          messageId: event.id.substring(0, 8)
        });
        
        setMessages(prevMessages => [...prevMessages, newMessage]);
      }
    );
    
    chatSubRef.current = sub;
  }, [keypair, browserInstanceId]);
  
  // Handle match confirmation
  const handleMatchConfirmation = useCallback((confirmedPartnerPubkey: string, chatSessionId: string) => {
    if (!keypair || status === 'connected') return;
    
    logger.info(`Match confirmed with: ${confirmedPartnerPubkey.substring(0, 8)}...`, {
      status,
      chatSessionId,
      browserId: browserInstanceId
    });
    
    // Clear any connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    
    // Set the partner's pubkey and update state
    setPartner({
      id: confirmedPartnerPubkey,
      chatSessionId: chatSessionId || generateRandomString(12)
    });
    setStatus('connected');
    isConnectingRef.current = false;
    pendingMatchRef.current = null;
    
    // Subscribe to chat messages
    subscribeToChatWithPartner(confirmedPartnerPubkey, chatSessionId);
  }, [keypair, status, browserInstanceId, subscribeToChatWithPartner]);
  
  // Handle a potential match
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handlePotentialMatch = useCallback(async (potentialPartnerPubkey: string, partnerSessionId: string) => {
    if (!keypair || !poolRef.current) return;
    // Only proceed if we're in an appropriate state for matching
    if (!(status === 'looking' || status === 'connecting')) return;
    
    // Prevent rapid repeated match attempts with the same user
    const now = Date.now();
    if (
      lastMatchAttemptRef.current > now - 5000 && // 5 second cooldown between match attempts
      pendingMatchRef.current?.pubkey === potentialPartnerPubkey
    ) {
      logger.info('Ignoring duplicate match attempt (cooldown period)', {
        partner: potentialPartnerPubkey.substring(0, 8),
        elapsed: now - lastMatchAttemptRef.current
      });
      return;
    }
    
    // Only skip if we're absolutely certain this is our own pubkey
    // DO NOT skip based on browser ID - this prevents cross-device matching
    if (potentialPartnerPubkey === keypair.publicKey) {
      logger.warn('Ignoring match with ourselves (same pubkey)', {
        pubkey: potentialPartnerPubkey.substring(0, 8)
      });
      return;
    }
    
    // Update connection state
    setStatus('connecting');
    isConnectingRef.current = true;
    lastMatchAttemptRef.current = now;
    
    // Store the pending match
    const chatSessionId = generateRandomString(12);
    pendingMatchRef.current = {
      pubkey: potentialPartnerPubkey,
      sessionId: chatSessionId,
      timestamp: now
    };
    
    logger.info(`Found potential match: ${potentialPartnerPubkey.substring(0, 8)}...`, {
      status,
      partnerSessionId,
      browserId: browserInstanceId.substring(0, 8),
      chatSessionId
    });
    
    // Update our event to "matched" with the partner's pubkey
    await publishMatchmakingEvent(
      poolRef.current,
      keypair.privateKey,
      keypair.publicKey,
      sessionId,
      'matched',
      potentialPartnerPubkey,
      browserInstanceId,
      chatSessionId
    );
    
    // Create a promise that will resolve when match is confirmed or timeout
    const matchPromise = new Promise<boolean>((resolve) => {
      // Set a 10-second timeout for match confirmation
      const timeout = setTimeout(() => {
        logger.warn('Match confirmation timeout with partner', {
          partner: potentialPartnerPubkey.substring(0, 8)
        });
        resolve(false);
      }, 10000);
      
      // Create a function to check if the pending match has been confirmed
      const checkMatchConfirmed = () => {
        if (partner && partner.id === potentialPartnerPubkey) {
          clearTimeout(timeout);
          resolve(true);
        }
      };
      
      // Check immediately and then periodically
      checkMatchConfirmed();
      const checkInterval = setInterval(() => {
        checkMatchConfirmed();
        // If no longer connecting, stop checking
        if (!isConnectingRef.current) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve(false);
        }
      }, 1000);
    });
    
    // Wait for match confirmation or timeout
    const matchConfirmed = await matchPromise;
    
    // If match was not confirmed, reset to looking state
    if (!matchConfirmed && status === 'connecting') {
      logger.info('Match was not confirmed, returning to looking state');
      pendingMatchRef.current = null;
      isConnectingRef.current = false;
      setStatus('looking');
      
      // Re-publish looking event
      if (poolRef.current) {
        publishMatchmakingEvent(
          poolRef.current,
          keypair.privateKey,
          keypair.publicKey,
          sessionId,
          'looking',
          undefined,
          browserInstanceId
        ).catch(err => {
          logger.error('Error republishing looking event after failed match', err);
        });
      }
    }
  }, [keypair, status, sessionId, browserInstanceId, partner]);
  
  // Handle looking match - when we find someone who is looking
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleLookingMatch = useCallback((partnerPubkey: string, chatSessionId: string) => {
    if (!keypair || !poolRef.current || status !== 'looking') return;
    
    // Only skip if we're absolutely certain this is our own pubkey
    // DO NOT skip based on browser ID - this prevents cross-device matching
    if (partnerPubkey === keypair.publicKey) {
      logger.warn('Ignoring match with ourselves (same pubkey)', {
        pubkey: partnerPubkey.substring(0, 8)
      });
      return;
    }
    
    // Set a minimum time between match attempts to prevent spamming
    const now = Date.now();
    if (now - lastMatchAttemptRef.current < 5000) { // 5 second cooldown
      logger.info('Ignoring match attempt (cooldown period)', {
        elapsed: now - lastMatchAttemptRef.current
      });
      return;
    }
    
    lastMatchAttemptRef.current = now;
    
    // Attempt to match with this user
    handlePotentialMatch(partnerPubkey, chatSessionId);
  }, [keypair, poolRef, status, handlePotentialMatch]);
  
  // Subscribe to matchmaking events
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const subscribeToMatchmakingEvents = useCallback((publicKey: string) => {
    if (!poolRef.current) return;
    
    // Unsubscribe from any existing subscription
    if (matchmakingSubRef.current) {
      matchmakingSubRef.current.unsub();
      matchmakingSubRef.current = null;
    }
    
    logger.info('Subscribing to matchmaking events');
    
    // Subscribe to matchmaking events
    const sub = subscribeToMatchmaking(
      poolRef.current,
      publicKey,
      (event: NostrEvent) => {
        // Log all incoming events for troubleshooting
        logger.info(`Received matchmaking event kind ${event.kind} from ${event.pubkey.substring(0, 8)}`, {
          relays: poolRef.current?.connectedRelays.size || 0,
          status: event.tags.find(t => t[0] === 'status')?.[1] || 'unknown',
          ourPubkey: publicKey.substring(0, 8),
          browserId: event.tags.find(t => t[0] === 'browser_id')?.[1]?.substring(0, 8) || 'unknown',
          timestamp: new Date(event.created_at * 1000).toISOString()
        });
        
        // Skip our own events
        if (event.pubkey === publicKey) {
          logger.debug('Skipping our own matchmaking event', {
            id: event.id.substring(0, 8),
            pubkey: event.pubkey.substring(0, 8),
          });
          return;
        }
        
        // Don't skip based on browser ID for cross-device compatibility
        
        // Extract status from tags
        const statusTag = event.tags.find(tag => tag[0] === 'status');
        const eventStatus = statusTag ? statusTag[1] : '';
        
        // Extract session ID from tags - generate a random one if empty
        const sessionTag = event.tags.find(tag => tag[0] === 'session');
        let eventSessionId = sessionTag ? sessionTag[1] : '';
        if (!eventSessionId) {
          eventSessionId = generateRandomString(12);
          logger.info('Found event with empty session ID, generated one', { 
            newSessionId: eventSessionId,
            pubkey: event.pubkey.substring(0, 8)
          });
        }
        
        // Extract chat session ID from tags
        const chatSessionTag = event.tags.find(tag => tag[0] === 'chat_session');
        const chatSessionId = chatSessionTag ? chatSessionTag[1] : '';
        
        // Check if event is targeting us specifically
        const partnerTag = event.tags.find(tag => tag[0] === 'p' && tag[1] === publicKey);
        
        // Handle different event types based on status
        if (eventStatus === 'looking' && status === 'looking') {
          // Someone else is looking, try to match with them
          logger.info(`Found user who is looking: ${event.pubkey.substring(0, 8)}`, {
            eventStatus,
            eventSessionId,
            ourStatus: status,
            relayCount: poolRef.current?.connectedRelays.size || 0
          });
          
          // Try to match with this user
          handleLookingMatch(event.pubkey, eventSessionId);
        }
        else if (eventStatus === 'matched' && partnerTag) {
          // Someone has matched with us, confirm the match
          logger.info(`User ${event.pubkey.substring(0, 8)} has matched with us`, {
            eventStatus,
            eventSessionId,
            chatSessionId,
            ourStatus: status
          });
          
          // Confirm match with this user
          handleMatchConfirmation(event.pubkey, chatSessionId || eventSessionId);
        }
      }
    );
    
    matchmakingSubRef.current = sub;
  }, [status, handleLookingMatch, handleMatchConfirmation]);
  
  // Start looking for a chat partner
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startLooking = useCallback(async () => {
    // If already looking or connecting, don't do anything
    if (status === 'looking' || status === 'connecting') {
      logger.info('Already looking for chat partners');
      return;
    }
    
    logger.info('Starting to look for chat partners...', {
      status: status,
      previousPartner: partner ? partner.id.substring(0, 8) : 'none'
    });
    
    // Clear any existing connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    
    // Reset state for a new session
    setStatus('looking');
    setMessages([]);
    setPartner(null);
    setError(null);
    isConnectingRef.current = false;
    pendingMatchRef.current = null;
    
    // Clean up stale looking users from localStorage
    if (typeof window !== 'undefined') {
      // Force cleanup of any stale users that might be preventing matches
      const lookingUsersData = localStorage.getItem('omestr_global_looking_users');
      if (lookingUsersData) {
        try {
          const lookingUsers = JSON.parse(lookingUsersData) as string[];
          
          // If there are more than 5 "looking" users, something is wrong - clear them
          if (lookingUsers.length > 5) {
            logger.warn(`Found ${lookingUsers.length} looking users, which is suspiciously high - clearing stale data`);
            
            // Force reload looking users to clean up stale entries
            localStorage.setItem('omestr_global_looking_users', JSON.stringify([]));
            
            // Also clear browser instance IDs for these users
            lookingUsers.forEach(pubkey => {
              const browserKey = `omestr_browser_${pubkey}`;
              if (localStorage.getItem(browserKey)) {
                localStorage.removeItem(browserKey);
              }
              localStorage.removeItem(`${KEY_PREFIX}user_activity_${pubkey}`);
            });
          }
        } catch (error) {
          logger.error('Error cleaning up stale looking users', error);
        }
      }
    }
    
    // Make sure we have keys and pool
    if (!keypair || !poolRef.current) {
      const { newKeypair, newSessionId } = initialize();
      
      // If pool still not initialized, return with error
      if (!poolRef.current) {
        setError('Failed to initialize Nostr connection');
        setStatus('disconnected');
        return;
      }
      
      // Use the newly generated keypair
      logger.info('Starting to look for chat partners with new keypair', { 
        pubkey: newKeypair.publicKey.substring(0, 8), 
        sessionId: newSessionId, 
        browserId: browserInstanceId 
      });
      
      // Publish a "looking" event
      try {
        // Ensure we have a valid session ID
        if (!newSessionId) {
          logger.error('Invalid session ID, generating new one');
          setSessionId(generateRandomString(12));
        }
        
        // First, check connected relays
        logger.info(`Currently connected to ${poolRef.current.connectedRelays.size} relays`);
        if (poolRef.current.connectedRelays.size === 0) {
          logger.warn('No connected relays, forcing reconnection...');
          poolRef.current.connect(DEFAULT_RELAYS);
          
          // Wait a bit for connections to establish
          await new Promise(resolve => setTimeout(resolve, 3000));
          logger.info(`After reconnection, connected to ${poolRef.current.connectedRelays.size} relays`);
        }
        
        // Publish initial looking event
        await publishMatchmakingEvent(
          poolRef.current,
          newKeypair.privateKey,
          newKeypair.publicKey,
          newSessionId, // Ensure we use the newly generated session ID
          'looking',
          undefined,
          browserInstanceId
        );
        
        // Subscribe to matchmaking events
        subscribeToMatchmakingEvents(newKeypair.publicKey);
        
        // Immediately attempt to match with any existing looking users
        if (poolRef.current) {
          logger.info('Checking for existing looking users to match with');
          
          // Get the looking users from local storage
          if (typeof window !== 'undefined') {
            const lookingUsersData = localStorage.getItem('omestr_global_looking_users');
            if (lookingUsersData) {
              try {
                const lookingUsers = JSON.parse(lookingUsersData) as string[];
                
                // Don't filter by browser ID to allow cross-device matching
                const otherUsers = lookingUsers.filter(id => {
                  return id !== newKeypair.publicKey; // Only filter out our own pubkey
                });
                
                if (otherUsers.length > 0) {
                  logger.info(`Found ${otherUsers.length} other looking users to try to match with`, {
                    users: otherUsers.map(u => u.substring(0, 8))
                  });
                  
                  // Try to match with each one in sequence
                  for (const targetUser of otherUsers) {
                    logger.info(`Attempting to match with user: ${targetUser.substring(0, 8)}`);
                    
                    // Generate a session ID for this user
                    const userChatSessionId = generateRandomString(12);
                    
                    // Send a matched event for this user
                    await handleLookingMatch(targetUser, userChatSessionId);
                    
                    // If we got connected, break the loop
                    if (status === 'connected') {
                      break;
                    }
                    
                    // Small delay between attempts
                    await new Promise(resolve => setTimeout(resolve, 500));
                  }
                } else {
                  logger.info('No other looking users found');
                }
              } catch (error) {
                logger.error('Error parsing looking users data', error);
              }
            }
          }
        }
        
        // Set up a more frequent republish (every 3 seconds) to ensure visibility
        const publishInterval = setInterval(async () => {
          // Check if we need to stop publishing
          if (isConnectingRef.current || !poolRef.current) {
            clearInterval(publishInterval);
            return;
          }
          
          // Get current status to avoid React closure issues
          const currentStatus = getStatus();
          if (currentStatus !== 'looking') {
            clearInterval(publishInterval);
            return;
          }
          
          logger.info('Republishing looking event to increase visibility', {
            connectedRelays: poolRef.current.connectedRelays.size
          });
          
          try {
            await publishMatchmakingEvent(
              poolRef.current,
              newKeypair.privateKey,
              newKeypair.publicKey,
              newSessionId,
              'looking',
              undefined,
              browserInstanceId
            );
          } catch (err) {
            logger.error('Error republishing looking event', err);
          }
        }, 3000); // Republish every 3 seconds
        
        // Helper function to get current status and avoid closure issues
        const getStatus = (): ConnectionStatus => {
          return status;
        }
        
        // Set a timeout to reset to 'looking' state if no match is found
        // This helps recover from stalled 'connecting' states
        connectionTimeoutRef.current = setTimeout(() => {
          // Check if we're still in a connecting state with no partner
          if (isConnectingRef.current && !partner) {
            logger.warn('Connection attempt timed out, resetting to looking state');
            pendingMatchRef.current = null;
            isConnectingRef.current = false;
            setStatus('looking');
            
            // Re-publish looking event after timeout
            if (poolRef.current) {
              publishMatchmakingEvent(
                poolRef.current,
                newKeypair.privateKey,
                newKeypair.publicKey,
                newSessionId,
                'looking',
                undefined,
                browserInstanceId
              ).catch(err => {
                logger.error('Error republishing looking event after timeout', err);
              });
            }
          }
        }, 15000); // 15 second timeout for connection attempts
        
      } catch (err) {
        logger.error('Error publishing looking event', err);
        setError('Failed to publish looking event');
        setStatus('disconnected');
      }
    } else {
      // Use existing keypair for looking
      const existingSessionId = sessionId || generateRandomString(12);
      if (!sessionId) {
        setSessionId(existingSessionId);
      }
      
      // Publish looking event with existing keypair
      await publishMatchmakingEvent(
        poolRef.current,
        keypair.privateKey,
        keypair.publicKey,
        existingSessionId,
        'looking',
        undefined,
        browserInstanceId
      );
      
      // Subscribe to matchmaking events
      subscribeToMatchmakingEvents(keypair.publicKey);
    }
  }, [initialize, status, browserInstanceId, partner, subscribeToMatchmakingEvents, handleLookingMatch, keypair, sessionId]);
  
  // Send a chat message
  const sendMessage = useCallback(async (message: string) => {
    if (!keypair || !poolRef.current || !partner) {
      logger.error('Cannot send message - missing keypair, pool, or partner');
      return;
    }
    
    logger.info('Sending message to partner', {
      partner: partner.id.substring(0, 8),
      content: message.substring(0, 20),
      chatSessionId: partner.chatSessionId
    });
    
    try {
      // Send message via Nostr
      await publishChatMessage(
        poolRef.current,
        keypair.privateKey,
        keypair.publicKey,
        partner.id,
        partner.chatSessionId,
        message,
        browserInstanceId
      );
      
      // Add message to our chat
      const newMessage: ChatMessage = {
        id: generateRandomString(16),
        content: message,
        sender: 'me',
        timestamp: Date.now(),
      };
      
      setMessages(prev => [...prev, newMessage]);
    } catch (err) {
      const error = err as Error;
      logger.error('Error sending message', error);
      setError('Failed to send message');
    }
  }, [keypair, partner, browserInstanceId]);
  
  // Disconnect from current chat
  const disconnect = useCallback(() => {
    logger.info('Disconnecting from chat');
    
    // Unsubscribe from matchmaking
    if (matchmakingSubRef.current) {
      matchmakingSubRef.current.unsub();
      matchmakingSubRef.current = null;
    }
    
    // Unsubscribe from chat
    if (chatSubRef.current) {
      chatSubRef.current.unsub();
      chatSubRef.current = null;
    }
    
    // Reset state
    setStatus('disconnected');
    setPartner(null);
    isConnectingRef.current = false;
    pendingMatchRef.current = null;
    
    // Clear any timeouts
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);
  
  // Skip to next chat partner
  const skipToNext = useCallback(() => {
    logger.info('Skipping to next chat partner');
    
    // Disconnect from current chat
    disconnect();
    
    // Start looking for a new partner
    setTimeout(() => {
      startLooking();
    }, 1000);
  }, [disconnect, startLooking]);
  
  // Reset all state and storage
  const resetAll = useCallback(() => {
    logger.info('Resetting all state and storage');
    
    // Disconnect from current chat
    disconnect();
    
    // Use the improved storage cleaning function
    clearStorage();
    
    // Generate a new browser instance ID
    if (typeof window !== 'undefined') {
      // Clear any existing browser IDs in storage for any users
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith('omestr_browser_')) {
          localStorage.removeItem(key);
        }
      }
      
      // Generate completely new browser instance ID
      // Add browser fingerprinting elements to make IDs more unique across browsers
      const browserFingerprint = navigator.userAgent + 
        '-' + window.screen.width + 
        '-' + window.screen.height + 
        '-' + new Date().getTimezoneOffset() +
        '-' + navigator.language;
        
      // Generate unique ID based on fingerprint and random string
      const newInstanceId = generateRandomString(8) + '-' + 
        browserFingerprint.split('').reduce((a, b) => {
          return a + b.charCodeAt(0);
        }, 0).toString(16) + '-' + Date.now().toString(36);
        
      sessionStorage.setItem('omestr_browser_instance_id', newInstanceId);
      logger.info('Generated completely new browser instance ID', { newInstanceId });
    }
    
    // Reset keypair and session ID
    setKeypair(null);
    setSessionId('');
    
    // Reset messages
    setMessages([]);
    
    // Restart after a short delay
    setTimeout(() => {
      initialize();
      startLooking();
    }, 1000);
  }, [disconnect, initialize, startLooking]);
  
  // Return the public API
  return {
    status,
    messages,
    partner,
    error,
    startLooking,
    sendMessage,
    disconnect,
    skipToNext,
    resetAll
  };
} 