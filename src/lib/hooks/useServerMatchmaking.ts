import { useState, useEffect, useCallback, useRef } from 'react';
import { generateRandomString } from '../nostr';
import { logger } from '../nostr/logger';
import { 
  generateUserId, 
  registerLookingUser, 
  checkForMatch, 
  removeUser,
  MatchUser
} from '../services/matchmaking';
import {
  sendMessage as apiSendMessage,
  checkForMessages,
  Message as ApiMessage
} from '../services/messaging';

// Types
export type ConnectionStatus = 'disconnected' | 'looking' | 'connected';

export type ChatMessage = {
  id: string;
  content: string;
  sender: 'me' | 'partner';
  timestamp: number;
};

export type MessageReaction = {
  emoji: string;
  sender: 'me' | 'partner';
};

export type MessageReactionsMap = {
  [messageId: string]: MessageReaction[];
};

// Generate a browser instance ID to uniquely identify this browser
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

// Hook for server-side matchmaking
export function useServerMatchmaking() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userId, setUserId] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [partner, setPartner] = useState<MatchUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keysGenerated, setKeysGenerated] = useState(false);
  const [lastMessageCheck, setLastMessageCheck] = useState<number>(0);
  
  // Add a ref to track whether message polling is active
  const isPollingActive = useRef(false);
  
  // Generate keys for this session
  const [pubkey, setPubkey] = useState<string>('');
  
  // Timer state and ref for connection duration
  const [chatDuration, setChatDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get or create browser instance ID
  const [browserId] = useState<string>(
    typeof window !== 'undefined' ? getBrowserInstanceId() : ''
  );
  
  // Polling intervals
  const matchCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const messageCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const MATCH_POLL_INTERVAL = 2000; // Poll for matches every 2 seconds
  const MESSAGE_POLL_INTERVAL = 1000; // Poll for messages every 1 second
  
  // New state for reactions
  const [messageReactions, setMessageReactions] = useState<MessageReactionsMap>({});
  
  // Create a ref for polling functions to avoid circular dependencies
  const startPollingForMessagesRef = useRef<() => NodeJS.Timeout | null>(null);
  
  // Initialize the session with a new user ID and keys
  const initialize = useCallback(() => {
    // Generate a new user ID for this session
    const newUserId = generateUserId();
    setUserId(newUserId);
    
    // Generate a new session ID
    const newSessionId = generateRandomString(12);
    setSessionId(newSessionId);
    
    // Generate new keys
    const newPubkey = generateRandomString(64);
    setPubkey(newPubkey);
    setKeysGenerated(true);
    
    logger.info('Initialized new session', { 
      userId: newUserId,
      sessionId: newSessionId,
      pubkey: newPubkey.substring(0, 8),
      browserId
    });
    
    return { newUserId, newSessionId, newPubkey };
  }, [browserId]);
  
  // Stop polling for matches
  const stopPollingForMatches = useCallback(() => {
    if (matchCheckInterval.current) {
      clearInterval(matchCheckInterval.current);
      matchCheckInterval.current = null;
      logger.info('Stopped polling for matches');
    }
  }, []);
  
  // Stop polling for messages
  const stopPollingForMessages = useCallback(() => {
    if (messageCheckInterval.current) {
      clearInterval(messageCheckInterval.current);
      messageCheckInterval.current = null;
      isPollingActive.current = false;
      logger.info('Stopped polling for messages');
    }
  }, []);
  
  // Format the chat duration as MM:SS
  const formattedDuration = useCallback(() => {
    const minutes = Math.floor(chatDuration / 60);
    const seconds = chatDuration % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [chatDuration]);
  
  // Start the chat duration timer
  const startTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    setChatDuration(0);
    
    // Update timer every second
    timerRef.current = setInterval(() => {
      setChatDuration(prev => prev + 1);
    }, 1000);
  }, []);
  
  // Stop the chat duration timer
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  
  // Start polling for messages - define the implementation function
  const startPollingForMessagesImpl = useCallback(() => {
    // Clear any existing interval
    if (messageCheckInterval.current) {
      clearInterval(messageCheckInterval.current);
    }
    
    // Initialize the last message check time - look back 10 seconds to catch any recent messages
    const initialTimestamp = Date.now() - 10000;
    setLastMessageCheck(initialTimestamp);
    
    // Store current values to use in the interval callback
    const currentUserId = userId;
    const currentPartner = partner;
    
    logger.info('Starting to poll for messages', { 
      userId: currentUserId, 
      partnerId: currentPartner?.id,
      chatSessionId: currentPartner?.chatSessionId,
      initialTimestamp: new Date(initialTimestamp).toISOString(),
      timestamp: new Date().toISOString()
    });
    
    if (!currentPartner) {
      logger.error('Cannot start polling for messages - no partner set');
      return null;
    }
    
    if (!currentPartner.chatSessionId) {
      logger.error('Cannot start polling for messages - no chatSessionId available', {
        partnerId: currentPartner.id
      });
      return null;
    }
    
    // Set polling as active
    isPollingActive.current = true;
    
    // Stop polling for matches when connected to ensure we don't get multiple matches
    if (matchCheckInterval.current) {
      logger.info('Stopping match polling because we are connected');
      stopPollingForMatches();
    }
    
    // Cache partner chatSessionId to use in the interval
    const chatSessionId = currentPartner.chatSessionId;
    
    // Set up polling interval
    messageCheckInterval.current = setInterval(async () => {
      // Verify we still have the correct state before polling
      if (!partner) {
        logger.warn('Partner missing during message polling', {
          currentStatus: status
        });
        return; // Just skip this iteration, don't stop polling completely
      }
      
      if (!partner.chatSessionId) {
        logger.warn('ChatSessionId missing during message polling', {
          partnerId: partner.id
        });
        return; // Just skip this iteration, don't stop polling completely
      }
      
      // Use current value for checking, not the state
      const currentLastCheck = lastMessageCheck;
      logger.debug('Checking for messages', { 
        userId: currentUserId, 
        currentLastCheck,
        chatSessionId,
        timestamp: new Date().toISOString()
      });
      
      try {
        const response = await checkForMessages(currentUserId, currentLastCheck, chatSessionId);
        
        if (!response.success) {
          logger.warn('Failed to check for messages', { error: response.error });
          return;
        }
        
        // If we have new messages, add them to the state
        if (response.messages && response.messages.length > 0) {
          logger.info('Received new messages', { 
            count: response.messages.length,
            userId: currentUserId,
            chatSessionId,
            messages: response.messages.map(m => ({
              id: m.id.substring(0, 8),
              content: m.content.substring(0, 20),
              from: m.senderId.substring(0, 8)
            }))
          });
          
          // Convert API messages to chat messages
          const newChatMessages: ChatMessage[] = response.messages.map((msg: ApiMessage) => {
            logger.debug('Converting API message to chat message', {
              id: msg.id.substring(0, 8),
              senderId: msg.senderId.substring(0, 8),
              receiverId: msg.receiverId.substring(0, 8),
              currentUserId: currentUserId.substring(0, 8),
              content: msg.content.substring(0, 20)
            });
            
            // Explicitly check if the message was sent by the current user
            // This ensures 'me' is consistently used for the current user's messages only
            const isSentByMe = msg.senderId === currentUserId;
            
            return {
              id: msg.id,
              content: msg.content,
              sender: isSentByMe ? 'me' : 'partner',
              timestamp: msg.timestamp,
            };
          });
          
          // Add new messages to the state
          setMessages(prevMessages => {
            logger.debug('Updating messages state', {
              currentCount: prevMessages.length,
              newCount: newChatMessages.length,
              totalAfter: prevMessages.length + newChatMessages.length
            });
            
            // Filter out any messages that already exist in the state by ID
            // Also filter out any duplicate messages with the same content from the same sender recently
            const uniqueNewMessages = newChatMessages.filter(newMsg => {
              // First check if the exact same message ID already exists
              const exactIdMatch = prevMessages.some(existingMsg => existingMsg.id === newMsg.id);
              if (exactIdMatch) return false;
              
              // For messages from me, also check for content similarity to prevent duplicates from API
              // This handles cases where the client-generated ID differs from server-returned ID
              if (newMsg.sender === 'me') {
                const contentMatch = prevMessages.some(existingMsg => 
                  existingMsg.sender === 'me' && 
                  existingMsg.content === newMsg.content &&
                  // Only check recent messages (within the last 5 seconds)
                  Math.abs(existingMsg.timestamp - newMsg.timestamp) < 5000
                );
                if (contentMatch) {
                  logger.debug('Filtered out duplicate content message', {
                    content: newMsg.content.substring(0, 20),
                    id: newMsg.id.substring(0, 8),
                    timestamp: newMsg.timestamp
                  });
                  return false;
                }
              }
              
              return true;
            });
            
            if (uniqueNewMessages.length !== newChatMessages.length) {
              logger.info('Filtered out duplicate messages', {
                total: newChatMessages.length,
                unique: uniqueNewMessages.length,
                duplicates: newChatMessages.length - uniqueNewMessages.length
              });
            }
            
            return [...prevMessages, ...uniqueNewMessages];
          });
        }
        
        // Always update the timestamp regardless of whether we received messages
        setLastMessageCheck(Date.now());
      } catch (err) {
        logger.error('Error while polling for messages', err);
      }
    }, MESSAGE_POLL_INTERVAL);
    
    return messageCheckInterval.current; // Return the interval ID
  }, [userId, partner, status, lastMessageCheck, stopPollingForMatches]);
  
  // Store the implementation in a ref to use in useEffect 
  // without creating circular dependencies
  useEffect(() => {
    startPollingForMessagesRef.current = startPollingForMessagesImpl;
  }, [startPollingForMessagesImpl]);
  
  // Create the public function that calls the implementation through the ref
  const startPollingForMessages = useCallback(() => {
    return startPollingForMessagesRef.current?.() || null;
  }, []);
  
  // Add effect to sync status and partner
  useEffect(() => {
    // If we have a partner but status isn't connected, fix it
    if (partner && status !== 'connected') {
      logger.info('Correcting status to connected because partner exists', {
        partnerId: partner.id.substring(0, 8),
        prevStatus: status
      });
      setStatus('connected');
    }
    
    // If status is connected but we don't have a partner, fix it
    if (!partner && status === 'connected') {
      logger.warn('Invalid state: Connected without partner, fixing status', {
        status
      });
      setStatus('looking');
    }
    
    // Ensure message polling is active if we're connected with a partner
    if (partner && status === 'connected' && !isPollingActive.current) {
      logger.info('Starting message polling because partner exists and status is connected');
      startPollingForMessages();
      
      // Also stop polling for matches when connected to ensure we don't get multiple matches
      if (matchCheckInterval.current) {
        logger.info('Stopping match polling because we are already connected');
        stopPollingForMatches();
      }
    }
  }, [partner, status, stopPollingForMatches, startPollingForMessages]);
  
  // Start looking for a chat partner
  const startLooking = useCallback(async () => {
    try {
      // Make sure we have keys and session info
      if (!keysGenerated) {
        initialize();
      }

      // Validate that we have the necessary data
      if (!userId) {
        logger.warn('Cannot start looking - missing userId');
        setError('Missing user ID. Please try again.');
        return;
      }

      if (!pubkey) {
        logger.warn('Cannot start looking - missing pubkey');
        setError('Missing user keys. Please try again.');
        return;
      }
      
      // Reset state
      setStatus('looking');
      setMessages([]);
      setPartner(null);
      setError(null);
      setMessageReactions({}); // Clear all previous reactions
      
      // Stop any existing message polling
      stopPollingForMessages();
      
      logger.info('Starting to look for chat partner', {
        userId,
        pubkey: pubkey.substring(0, 8),
        browserId
      });
      
      try {
        // Register as looking for a chat
        const response = await registerLookingUser(
          userId,
          pubkey,
          sessionId,
          browserId
        );
        
        if (!response) {
          setError('Failed to connect to server');
          setStatus('disconnected');
          logger.error('Failed to register as looking - no response', {});
          return;
        }
        
        if (!response.success) {
          setError(response.error || 'Failed to register as looking');
          setStatus('disconnected');
          logger.error('Failed to register as looking', { 
            error: response.error || 'Unknown error'
          });
          return;
        }
        
        // If we already found a match, connect immediately
        if (response.match) {
          logger.info('Found match immediately', { 
            matchId: response.match.id,
            matchPubkey: response.match.pubkey.substring(0, 8),
            chatSessionId: response.match.chatSessionId
          });
          
          // Create a new chat session ID if one wasn't provided
          let chatSessionIdToUse = response.match.chatSessionId;
          
          if (!chatSessionIdToUse) {
            // Generate a new chat session ID
            chatSessionIdToUse = generateRandomString(16);
            logger.info('Generated new chat session ID for immediate match', { 
              chatSessionId: chatSessionIdToUse
            });
          }
          
          // Important: Update the match object with the chat session ID
          response.match.chatSessionId = chatSessionIdToUse;
          
          // Update our status to matched with the session ID
          const updateResponse = await registerLookingUser(
            userId,
            pubkey,
            sessionId,
            browserId,
            'matched',
            chatSessionIdToUse
          );
          
          if (!updateResponse.success) {
            logger.warn('Failed to update status to matched after immediate match', {
              error: updateResponse.error
            });
          }
          
          // Store the partner info and set status
          setPartner(response.match);
          setStatus('connected');
          
          // Start the chat timer
          startTimer();
          
          // Check for matches one more time to ensure both users have the chat session ID
          // This is important to synchronize the connection status between the two users
          setTimeout(async () => {
            try {
              const matchCheckResponse = await checkForMatch(userId, browserId);
              if (matchCheckResponse.success && matchCheckResponse.match) {
                // Update partner with any additional info from the server
                setPartner(prev => ({
                  ...prev!,
                  ...matchCheckResponse.match!
                }));
                
                // Start polling for messages
                startPollingForMessagesRef.current?.();
              }
            } catch (error) {
              logger.error('Error in delayed match check', error);
            }
          }, 500);
          
          // Start polling for messages
          startPollingForMessagesRef.current?.();
          
          return;
        }
        
        // Start polling for matches
        startPollingForMatches();
      } catch (err) {
        logger.error('Error during startLooking', { error: err instanceof Error ? err.message : String(err) });
        setError('An unexpected error occurred while looking for a chat partner');
        setStatus('disconnected');
      }
    } catch (outerErr) {
      logger.error('Critical error in startLooking', { 
        error: outerErr instanceof Error ? outerErr.message : String(outerErr)
      });
      setError('Critical error occurred. Please refresh and try again.');
      setStatus('disconnected');
    }
  }, [userId, pubkey, sessionId, browserId, keysGenerated, initialize, stopPollingForMessages, startTimer]);
  
  // Start polling for matches
  const startPollingForMatches = useCallback(() => {
    // Clear any existing interval
    if (matchCheckInterval.current) {
      clearInterval(matchCheckInterval.current);
    }
    
    // Store current values to use in interval callback
    const currentUserId = userId;
    const currentBrowserId = browserId;
    
    logger.info('Starting to poll for matches', { 
      userId: currentUserId, 
      browserId: currentBrowserId
    });
    
    const checkMatchFn = async () => {
      if (status !== 'looking') {
        logger.debug('Not checking for matches because status is not looking', {
          status
        });
        return;
      }
      
      logger.debug('Checking for match', { 
        userId: currentUserId,
        timestamp: new Date().toISOString()
      });
      
      try {
        const response = await checkForMatch(currentUserId, currentBrowserId);
        
        if (!response.success) {
          logger.warn('Failed to check for match', { error: response.error });
          return;
        }
        
        // If we have a match, update state
        if (response.match) {
          logger.info('Match found from polling', { 
            match: {
              id: response.match.id.substring(0, 8),
              pubkey: response.match.pubkey.substring(0, 8)
            },
            chatSessionId: response.match.chatSessionId
          });
          
          // Update state with the match
          setPartner(response.match);
          setStatus('connected');
          
          // Start the chat timer
          startTimer();
          
          // Create a chat session ID if we don't have one
          if (!response.match.chatSessionId) {
            logger.error('Match found but no chatSessionId was provided', {
              matchId: response.match.id
            });
            
            // Generate a new chat session ID
            const newChatSessionId = generateRandomString(16);
            logger.info('Generated new chat session ID', { 
              chatSessionId: newChatSessionId 
            });
            
            // Register the user again with the new chat session ID to update the match
            // This ensures both users have the same chat session ID
            await registerLookingUser(
              currentUserId,
              pubkey,
              sessionId,
              currentBrowserId,
              'matched',
              newChatSessionId
            );
          }
          
          // Start polling for messages
          startPollingForMessagesRef.current?.();
          
          // Since we found a match, stop polling for more matches
          clearInterval(matchCheckInterval.current!);
          matchCheckInterval.current = null;
        }
      } catch (error) {
        logger.error('Error checking for match', error);
      }
    };
    
    // Check immediately first, then set up the interval
    checkMatchFn();
    
    // Set up polling interval
    matchCheckInterval.current = setInterval(checkMatchFn, MATCH_POLL_INTERVAL);
    
    return matchCheckInterval.current;
  }, [userId, sessionId, pubkey, status, browserId, startTimer]);
  
  // Register the user as looking for a match
  const registerAsLooking = useCallback(async () => {
    if (!userId || !keysGenerated) {
      logger.error('Cannot register as looking - missing userId or keys');
      return;
    }
    
    logger.info('Registering as looking for chat', { 
      userId, 
      pubkey: pubkey.substring(0, 8),
      sessionId,
      browserId
    });
    
    try {
      const response = await registerLookingUser(userId, pubkey, sessionId, browserId);
      
      if (!response.success) {
        logger.error('Failed to register as looking', { error: response.error });
        setError(response.error || 'Failed to register as looking');
        return;
      }
      
      // If we already have a match from registration, update state immediately
      if (response.match) {
        logger.info('Match found from registration', { 
          match: {
            id: response.match.id.substring(0, 8),
            pubkey: response.match.pubkey.substring(0, 8)
          },
          chatSessionId: response.match.chatSessionId
        });
        
        // Update state with the match
        setPartner(response.match);
        setStatus('connected');
        
        // Start the chat timer
        startTimer();
        
        // If we have a chat session ID, start polling for messages immediately
        if (response.match.chatSessionId) {
          startPollingForMessagesRef.current?.();
        } else {
          // Create a new chat session ID if needed
          logger.error('Match found but no chatSessionId was provided', {
            matchId: response.match.id
          });
          
          // Generate a new chat session ID
          const newChatSessionId = generateRandomString(16);
          logger.info('Generated new chat session ID', { 
            chatSessionId: newChatSessionId 
          });
          
          // Register again with chat session ID
          const updateResponse = await registerLookingUser(
            userId,
            pubkey,
            sessionId,
            browserId,
            'matched',
            newChatSessionId
          );
          
          if (updateResponse.success) {
            // Immediately check for match again to ensure both users have the chat session ID
            checkForMatch(userId, browserId).then(matchCheckResponse => {
              if (matchCheckResponse.success && matchCheckResponse.match) {
                setPartner(matchCheckResponse.match);
                startPollingForMessagesRef.current?.();
              }
            });
          }
        }
      } else {
        // Start polling for matches
        startPollingForMatches();
      }
    } catch (error) {
      logger.error('Error registering as looking', error);
      setError('Failed to register as looking');
    }
  }, [userId, pubkey, sessionId, browserId, keysGenerated, startPollingForMatches, startTimer]);
  
  // Send a chat message
  const sendMessage = useCallback(async (message: string) => {
    if (!partner || !partner.chatSessionId) {
      logger.error('Cannot send message - no partner connected or missing chatSessionId');
      return;
    }
    
    // Make sure we're in connected state when sending a message
    if (status !== 'connected') {
      logger.info('Setting status to connected for message sending');
      setStatus('connected');
    }
    
    // Make sure we're polling for messages when sending a message
    if (!isPollingActive.current) {
      logger.info('Message polling was not active, restarting it');
      startPollingForMessages();
    }
    
    // Double check that we have the correct partner ID before sending
    if (!partner.id) {
      logger.error('Cannot send message - partner ID is missing');
      return;
    }
    
    logger.info('Sending message to partner', { 
      message, 
      partnerId: partner.id,
      userId,
      chatSessionId: partner.chatSessionId
    });
    
    // Generate a unique ID for this message
    const messageId = generateRandomString(16);
    
    // Create a new local message
    const newMessage: ChatMessage = {
      id: messageId,
      content: message,
      sender: 'me',
      timestamp: Date.now(),
    };
    
    // Add the message to our local state
    setMessages(prevMessages => {
      // Check if we already have this exact message to prevent doubles
      if (prevMessages.some(msg => 
        msg.sender === 'me' && 
        msg.content === message &&
        // Only check recent messages (within the last 2 seconds)
        msg.timestamp > Date.now() - 2000
      )) {
        logger.warn('Prevented duplicate local message', { message });
        return prevMessages;
      }
      return [...prevMessages, newMessage];
    });
    
    try {
      // Send the message to the server
      const response = await apiSendMessage(message, userId, partner.id, partner.chatSessionId);
      
      if (!response.success) {
        logger.error('Failed to send message to server', { 
          error: response.error,
          message
        });
      } else {
        logger.info('Message sent successfully to server', { 
          messageId: response.message?.id,
          receiverId: partner.id,
          chatSessionId: partner.chatSessionId
        });
      }
    } catch (error) {
      logger.error('Exception when sending message', { 
        error: error instanceof Error ? error.message : String(error),
        message
      });
    }
  }, [partner, userId, status]);
  
  // Start/stop timer based on connection status
  useEffect(() => {
    if (status === 'connected') {
      startTimer();
    } else {
      stopTimer();
      setChatDuration(0);
    }
    
    return () => stopTimer();
  }, [status, startTimer, stopTimer]);
  
  // Disconnect from the current chat
  const disconnect = useCallback(async () => {
    // Capture current state for logging
    const currentPartnerId = partner?.id;
    const currentStatus = status;
    
    logger.info('Disconnecting from chat', {
      partnerId: currentPartnerId?.substring(0, 8),
      currentStatus
    });
    
    // Stop polling for messages but don't reset the state yet
    stopPollingForMessages();
    
    // Stop the timer
    stopTimer();
    
    // Stop polling for matches
    stopPollingForMatches();
    
    // Remove the user from the matchmaking service
    if (userId) {
      try {
        await removeUser(userId);
        logger.info('User removed from matchmaking service', { userId });
      } catch (err) {
        logger.error('Failed to remove user from matchmaking service', { 
          error: err, 
          userId 
        });
      }
    }
    
    // Reset state - important to do this after API calls to avoid re-renders mid-operation
    setStatus('disconnected');
    setPartner(null);
    setMessageReactions({}); // Clear all reactions when disconnecting
    
    logger.info('Disconnected from chat successfully');
    
    return true;
  }, [userId, stopPollingForMatches, stopPollingForMessages, stopTimer, partner, status]);
  
  // Skip to next partner
  const skipToNext = useCallback(() => {
    logger.info('Skipping to next partner');
    
    // Save last disconnect time to prevent immediate reconnect with same partner
    const lastMatchId = partner?.id;
    
    // First disconnect
    disconnect().then(() => {
      logger.info('Disconnected, now looking for new partner', { 
        previousPartnerId: lastMatchId?.substring(0, 8)
      });
      
      // Then start looking again after a short delay
      setTimeout(() => {
        startLooking();
      }, 500);
    });
  }, [disconnect, startLooking, partner]);
  
  // Reset all state and data
  const resetAll = useCallback(() => {
    logger.info('Resetting all state and data');
    
    // Disconnect first
    disconnect();
    
    // Clear browser instance ID
    if (typeof window !== 'undefined') {
      localStorage.removeItem('omestr_browser_instance_id');
    }
    
    // Reinitialize
    initialize();
  }, [disconnect, initialize]);
  
  // Initialize on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && !keysGenerated) {
      initialize();
    }
    
    // Clean up on unmount
    return () => {
      logger.info('Component unmounting, cleaning up resources');
      
      if (matchCheckInterval.current) {
        clearInterval(matchCheckInterval.current);
        matchCheckInterval.current = null;
        logger.debug('Match polling stopped on unmount');
      }
      
      if (messageCheckInterval.current) {
        clearInterval(messageCheckInterval.current);
        messageCheckInterval.current = null;
        logger.debug('Message polling stopped on unmount');
      }
      
      // Stop the timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        logger.debug('Timer stopped on unmount');
      }
      
      // Remove the user from the matchmaking service
      if (userId) {
        removeUser(userId).catch(err => {
          logger.error('Failed to remove user on unmount', err);
        });
      }
    };
  }, [initialize, userId, keysGenerated]);
  
  // Function to send reactions
  const sendReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!partner || !partner.chatSessionId) {
      logger.error('Cannot send reaction - no partner connected');
      return;
    }
    
    try {
      // First update local state for immediate feedback
      setMessageReactions(prev => {
        const updated = {...prev};
        if (!updated[messageId]) updated[messageId] = [];
        
        // Check if this reaction already exists to prevent duplicates
        const exists = updated[messageId].some(
          r => r.emoji === emoji && r.sender === 'me'
        );
        
        if (!exists) {
          updated[messageId].push({ emoji, sender: 'me' });
        }
        return updated;
      });
      
      // Then send to server
      const response = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          emoji,
          senderId: userId,
          receiverId: partner.id,
          chatSessionId: partner.chatSessionId,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.warn('Failed to send reaction', { error: errorText });
        return;
      }
      
      logger.info('Reaction sent successfully', { messageId, emoji });
    } catch (err) {
      logger.error('Error sending reaction', err);
    }
  }, [partner, userId]);

  // Poll for reactions
  useEffect(() => {
    if (!partner?.chatSessionId || status !== 'connected') return;
    
    // Initial fetch of reactions when connecting
    const fetchReactions = async () => {
      try {
        const response = await fetch(
          `/api/reactions?chatSessionId=${encodeURIComponent(partner.chatSessionId || '')}`
        );
        
        if (!response.ok) return;
        
        const data = await response.json();
        if (!data.success) return;
        
        if (data.reactions && data.reactions.length > 0) {
          processReactions(data.reactions);
        }
      } catch (err) {
        logger.error('Error fetching reactions', err);
      }
    };
    
    // Process reactions received from API
    const processReactions = (reactionsData: Array<{
      messageId: string;
      emoji: string;
      senderId: string;
      receiverId: string;
      timestamp: number;
      chatSessionId: string;
    }>) => {
      const newReactionsMap: MessageReactionsMap = {};
      
      reactionsData.forEach(reaction => {
        if (!newReactionsMap[reaction.messageId]) {
          newReactionsMap[reaction.messageId] = [];
        }
        
        // Determine if "me" or "partner" based on senderId
        const sender = reaction.senderId === userId ? 'me' : 'partner';
        
        // Check for duplicates before adding
        const exists = newReactionsMap[reaction.messageId].some(
          r => r.emoji === reaction.emoji && r.sender === sender
        );
        
        if (!exists) {
          newReactionsMap[reaction.messageId].push({
            emoji: reaction.emoji,
            sender: sender
          });
        }
      });
      
      // Merge with existing reactions
      setMessageReactions(prev => {
        const merged = {...prev};
        Object.keys(newReactionsMap).forEach(msgId => {
          if (!merged[msgId]) {
            merged[msgId] = [];
          }
          
          // Add new reactions that don't already exist
          newReactionsMap[msgId].forEach(reaction => {
            const exists = merged[msgId].some(
              r => r.emoji === reaction.emoji && r.sender === reaction.sender
            );
            
            if (!exists) {
              merged[msgId].push(reaction);
            }
          });
        });
        
        return merged;
      });
      
      logger.info('Updated reactions from server', { 
        count: Object.keys(newReactionsMap).length 
      });
    };
    
    // Fetch reactions immediately on connection
    fetchReactions();
    
    // Then set up interval for continuous polling
    const interval = setInterval(fetchReactions, 2000);
    
    return () => clearInterval(interval);
  }, [partner, status, userId]);
  
  return {
    status,
    messages,
    partner,
    error,
    startLooking,
    sendMessage,
    disconnect,
    skipToNext,
    resetAll,
    chatDuration,
    formattedDuration,
    messageReactions,
    sendReaction,
  };
} 