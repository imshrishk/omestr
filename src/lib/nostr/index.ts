// Custom event kinds for our omestr app
export const OMESTR_KIND = 30078; // Custom kind for matchmaking events
import { logger } from './logger';

// Default relays to connect to
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
];

// Define NostrEvent interface
export interface NostrEvent {
  id: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
  sig: string;
}

// Define Subscription interface
export interface Subscription {
  sub: string;
  unsub: () => void;
  on: (event: string, callback: (event: NostrEvent) => void) => void;
}

// BroadcastChannel for cross-browser communication
let broadcastChannel: BroadcastChannel | null = null;

// Initialize broadcast channel
const initBroadcastChannel = () => {
  if (typeof window !== 'undefined' && !broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel('omestr_channel');
      logger.info('BroadcastChannel initialized successfully');
    } catch (error) {
      logger.error('BroadcastChannel initialization failed', error);
    }
  }
  return broadcastChannel;
};

// Generate a random string for session IDs, pubkeys, etc.
export const generateRandomString = (length = 32) => {
  // Make it safe for SSR by only using crypto in the browser
  if (typeof window !== 'undefined') {
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  // Fallback for SSR - will be replaced on client
  return Array(length).fill(0).map(() => '0').join('');
};

// Prefix for all storage keys
const KEY_PREFIX = 'omestr_global_';

// Storage keys for cross-browser communication
const STORAGE_KEYS = {
  LOOKING_USERS: `${KEY_PREFIX}looking_users`,
  MATCHED_USERS: `${KEY_PREFIX}matched_users`, 
  MESSAGES: `${KEY_PREFIX}messages`,
  EVENTS: `${KEY_PREFIX}events`,
  LAST_UPDATE: `${KEY_PREFIX}last_update`,
};

// Log all storage keys for debugging
if (typeof window !== 'undefined') {
  logger.debug('Storage keys initialized', { keys: Object.values(STORAGE_KEYS) });
}

// Load looking users from localStorage
const loadLookingUsers = (): Set<string> => {
  if (typeof window === 'undefined') return new Set<string>();
  
  try {
    const data = localStorage.getItem(STORAGE_KEYS.LOOKING_USERS);
    if (!data) {
      logger.info('No looking users found in storage');
      return new Set<string>();
    }
    
    const parsed = JSON.parse(data) as string[];
    logger.info(`Loaded ${parsed.length} looking users from storage`, { users: parsed });
    return new Set<string>(parsed);
  } catch (error) {
    logger.error('Error loading looking users from storage', error);
    return new Set<string>();
  }
};

// Save looking users to localStorage
const saveLookingUsers = (users: Set<string>) => {
  if (typeof window === 'undefined') return;
  
  try {
    const usersArray = Array.from(users);
    const data = JSON.stringify(usersArray);
    localStorage.setItem(STORAGE_KEYS.LOOKING_USERS, data);
    localStorage.setItem(STORAGE_KEYS.LAST_UPDATE, Date.now().toString());
    logger.info(`Saved ${usersArray.length} looking users to storage`, { users: usersArray });
  } catch (error) {
    logger.error('Error saving looking users to storage', error);
  }
};

// Load matched users from localStorage
const loadMatchedUsers = (): Map<string, string> => {
  if (typeof window === 'undefined') return new Map<string, string>();
  
  try {
    const data = localStorage.getItem(STORAGE_KEYS.MATCHED_USERS);
    if (!data) {
      logger.info('No matched users found in storage');
      return new Map<string, string>();
    }
    
    const parsed = JSON.parse(data) as [string, string][];
    logger.info(`Loaded ${parsed.length} matched users from storage`, { matches: parsed });
    return new Map<string, string>(parsed);
  } catch (error) {
    logger.error('Error loading matched users from storage', error);
    return new Map<string, string>();
  }
};

// Save matched users to localStorage
const saveMatchedUsers = (users: Map<string, string>) => {
  if (typeof window === 'undefined') return;
  
  try {
    const usersArray = Array.from(users.entries());
    const data = JSON.stringify(usersArray);
    localStorage.setItem(STORAGE_KEYS.MATCHED_USERS, data);
    localStorage.setItem(STORAGE_KEYS.LAST_UPDATE, Date.now().toString());
    logger.info(`Saved ${usersArray.length} matched pairs to storage`, { matches: usersArray });
  } catch (error) {
    logger.error('Error saving matched users to storage', error);
  }
};

// Load all stored events
const loadEvents = (): NostrEvent[] => {
  if (typeof window === 'undefined') return [];
  
  try {
    const data = localStorage.getItem(STORAGE_KEYS.EVENTS);
    if (!data) {
      logger.info('No events found in storage');
      return [];
    }
    
    const parsed = JSON.parse(data) as NostrEvent[];
    logger.info(`Loaded ${parsed.length} events from storage`);
    return parsed;
  } catch (error) {
    logger.error('Error loading events from storage', error);
    return [];
  }
};

// Save a new event to localStorage
const saveEvent = (event: NostrEvent) => {
  if (typeof window === 'undefined') return;
  
  try {
    const events = loadEvents();
    events.push(event);
    
    // Keep only last 100 events to prevent localStorage from filling up
    const trimmedEvents = events.slice(-100);
    
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(trimmedEvents));
    localStorage.setItem(STORAGE_KEYS.LAST_UPDATE, Date.now().toString());
    
    logger.info(`Saved new event to storage, kind: ${event.kind}`, { 
      event: { 
        id: event.id.substring(0, 8), 
        kind: event.kind,
        pubkey: event.pubkey.substring(0, 8),
        tags: event.tags
      } 
    });
  } catch (error) {
    logger.error('Error saving event to storage', error);
  }
};

// Type for message entries
type MessageEntry = [string, any[]];

// Load messages from localStorage
const loadMessages = (): Map<string, any[]> => {
  if (typeof window === 'undefined') return new Map<string, any[]>();
  
  try {
    const data = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    if (!data) {
      logger.info('No messages found in storage');
      return new Map<string, any[]>();
    }
    
    const parsed = JSON.parse(data) as MessageEntry[];
    logger.info(`Loaded ${parsed.length} conversation threads from storage`);
    return new Map<string, any[]>(parsed);
  } catch (error) {
    logger.error('Error loading messages from storage', error);
    return new Map<string, any[]>();
  }
};

// Save messages to localStorage
const saveMessages = (messages: Map<string, any[]>) => {
  if (typeof window === 'undefined') return;
  
  try {
    const messagesArray = Array.from(messages.entries());
    const data = JSON.stringify(messagesArray);
    localStorage.setItem(STORAGE_KEYS.MESSAGES, data);
    localStorage.setItem(STORAGE_KEYS.LAST_UPDATE, Date.now().toString());
    logger.info(`Saved ${messagesArray.length} conversation threads to storage`);
  } catch (error) {
    logger.error('Error saving messages to storage', error);
  }
};

// Type for shared instance
interface SharedInstance {
  looking: Set<string>;
  matched: Map<string, string>;
  messages: Map<string, any[]>;
  lastChecked: number;
}

// Shared instance for communication between browser tabs
let sharedInstance: SharedInstance | null = null;

// Get or create the shared instance
const getSharedInstance = (): SharedInstance => {
  if (typeof window === 'undefined') {
    logger.debug('Creating empty shared instance for SSR');
    return { 
      looking: new Set<string>(), 
      matched: new Map<string, string>(), 
      messages: new Map<string, any[]>(),
      lastChecked: 0
    };
  }
  
  if (!sharedInstance) {
    // Create a new shared instance if it doesn't exist
    logger.info('Initializing shared instance');
    sharedInstance = {
      looking: loadLookingUsers(),
      matched: loadMatchedUsers(),
      messages: loadMessages(),
      lastChecked: Date.now()
    };
    
    // Initialize the broadcast channel
    initBroadcastChannel();
  }
  
  return sharedInstance;
};

// Check for updates in localStorage from other browsers
const checkForUpdates = (callback?: () => void) => {
  if (typeof window === 'undefined' || !sharedInstance) return;
  
  const lastUpdateStr = localStorage.getItem(STORAGE_KEYS.LAST_UPDATE);
  if (!lastUpdateStr) {
    logger.debug('No last update timestamp found in storage');
    return;
  }
  
  const lastUpdate = parseInt(lastUpdateStr, 10);
  
  // If there's a new update from another browser
  if (lastUpdate > sharedInstance.lastChecked) {
    logger.info('Detected update from another browser instance', {
      lastUpdate: new Date(lastUpdate).toISOString(),
      lastChecked: new Date(sharedInstance.lastChecked).toISOString(),
      timeDiff: lastUpdate - sharedInstance.lastChecked
    });
    
    // Reload all data
    sharedInstance.looking = loadLookingUsers();
    sharedInstance.matched = loadMatchedUsers();
    sharedInstance.messages = loadMessages();
    sharedInstance.lastChecked = Date.now();
    
    // Call the callback if provided
    if (callback) {
      logger.debug('Executing update callback');
      callback();
    }
  } else {
    logger.debug('No new updates detected', {
      lastUpdate: new Date(lastUpdate).toISOString(),
      lastChecked: new Date(sharedInstance.lastChecked).toISOString()
    });
  }
};

export const generateKeypair = () => {
  // In a real nostr app, we would use proper cryptography here
  // This is just a mock for our demo
  const privateKey = generateRandomString(64);
  const publicKey = generateRandomString(64);
  
  logger.info('Generated new keypair', { publicKey: publicKey.substring(0, 8) + '...' });
  return { privateKey, publicKey };
};

const broadcastEvent = (type: string, data: any) => {
  if (typeof window === 'undefined' || !broadcastChannel) return;
  
  try {
    broadcastChannel.postMessage(JSON.stringify({ type, data }));
    logger.debug(`Broadcasted ${type} event via BroadcastChannel`);
  } catch (error) {
    logger.error('Error broadcasting event', { error, type });
  }
};

// Debug function to dump all localStorage data
export const dumpLocalStorage = () => {
  if (typeof window === 'undefined') return null;
  
  const result: Record<string, any> = {};
  
  // Get all storage items with our prefix
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(KEY_PREFIX)) {
      try {
        result[key] = JSON.parse(localStorage.getItem(key) || '');
      } catch (e) {
        result[key] = localStorage.getItem(key);
      }
    }
  });
  
  logger.info('LocalStorage dump', result);
  return result;
};

// Mock implementation of a relay pool
export class SimplePool {
  relays: string[] = [];
  eventCallbacks: Map<string, ((event: NostrEvent) => void)[]> = new Map();
  polling: boolean = false;
  pollInterval: number = 2000; // Poll every 2 seconds
  
  constructor() {
    // If in browser, setup broadcast channel listener
    if (typeof window !== 'undefined') {
      const bc = initBroadcastChannel();
      if (bc) {
        bc.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            logger.debug('Received broadcast', { type: parsed.type });
            
            if (parsed.type === 'nostr_event') {
              this.handleNostrEvent(parsed.data);
            }
          } catch (error) {
            logger.error('Error parsing broadcast message', error);
          }
        };
      }
      
      // Start polling for updates from localStorage
      this.startPolling();
    }
  }
  
  // Start polling for updates from other browsers
  private startPolling() {
    if (this.polling) return;
    
    this.polling = true;
    logger.info('Started polling for cross-browser updates');
    
    const poll = () => {
      if (!this.polling) return;
      
      checkForUpdates(() => {
        // When updates are detected, check for new events
        const events = loadEvents();
        
        // Process all events
        if (events.length > 0) {
          logger.info(`Processing ${events.length} events from storage`);
          events.forEach(event => {
            this.handleNostrEvent(event);
          });
        }
      });
      
      setTimeout(poll, this.pollInterval);
    };
    
    poll();
  }
  
  // Stop polling
  private stopPolling() {
    logger.info('Stopped polling for updates');
    this.polling = false;
  }
  
  // Handle an incoming Nostr event from broadcast
  private handleNostrEvent(event: NostrEvent) {
    logger.debug(`Processing Nostr event kind ${event.kind}`, { 
      id: event.id.substring(0, 8),
      pubkey: event.pubkey.substring(0, 8),
      kind: event.kind 
    });
    this.broadcastEvent(event);
  }
  
  // Connect to relays
  connect(relays: string[]) {
    this.relays = relays;
    logger.info('Connected to relays', { relays });
    return this;
  }
  
  // Publish an event to relays
  async publish(relays: string[], event: NostrEvent) {
    logger.info(`Publishing event kind ${event.kind}`, { 
      id: event.id.substring(0, 8),
      kind: event.kind,
      relays: relays.length
    });
    
    // Get the shared instance for communication
    const shared = getSharedInstance();
    
    // Extract info from the event
    const statusTag = event.tags.find((tag: string[]) => tag[0] === 'status');
    const status = statusTag ? statusTag[1] : '';
    const sessionTag = event.tags.find((tag: string[]) => tag[0] === 'session');
    const sessionId = sessionTag ? sessionTag[1] : '';
    
    // Handle the event based on its kind and status
    if (event.kind === OMESTR_KIND) {
      if (status === 'looking') {
        logger.info(`User ${event.pubkey.substring(0, 8)} is looking for a match`, {
          sessionId,
          pubkey: event.pubkey
        });
        
        // Add to the list of looking users
        shared.looking.add(event.pubkey);
        saveLookingUsers(shared.looking);
        
        // Save the event for other browsers to find
        saveEvent(event);
        
        // Check for other looking users to match with
        const lookingUsers = Array.from(shared.looking).filter(pk => pk !== event.pubkey);
        logger.info(`Found ${lookingUsers.length} other looking users`);
        
        if (lookingUsers.length > 0) {
          // Log all looking users
          lookingUsers.forEach(pk => {
            logger.debug(`Looking user: ${pk.substring(0, 8)}...`);
          });
        }
      } else if (status === 'matched') {
        // Extract the matched pubkey
        const matchedTag = event.tags.find((tag: string[]) => tag[0] === 'p');
        const matchedPubkey = matchedTag ? matchedTag[1] : null;
        
        if (matchedPubkey) {
          logger.info(`User ${event.pubkey.substring(0, 8)} matched with ${matchedPubkey.substring(0, 8)}`, {
            sessionId,
            pubkey: event.pubkey,
            matchedPubkey
          });
          
          // Record the match
          shared.matched.set(event.pubkey, matchedPubkey);
          saveMatchedUsers(shared.matched);
          
          // Save the event for other browsers to find
          saveEvent(event);
          
          // Remove both from the looking list
          shared.looking.delete(event.pubkey);
          shared.looking.delete(matchedPubkey);
          saveLookingUsers(shared.looking);
        }
      }
    } else if (event.kind === 4) { // Chat message
      // Store the message
      const pTag = event.tags.find((tag: string[]) => tag[0] === 'p');
      const recipientPubkey = pTag ? pTag[1] : null;
      
      if (recipientPubkey && sessionId) {
        logger.info(`Chat message from ${event.pubkey.substring(0, 8)} to ${recipientPubkey.substring(0, 8)}`, {
          sessionId,
          content: event.content.substring(0, 20) + (event.content.length > 20 ? '...' : '')
        });
        
        const messageKey = `${event.pubkey}:${recipientPubkey}:${sessionId}`;
        const reverseKey = `${recipientPubkey}:${event.pubkey}:${sessionId}`;
        
        // Store the message in both directions for easy lookup
        if (!shared.messages.has(messageKey)) {
          shared.messages.set(messageKey, []);
        }
        if (!shared.messages.has(reverseKey)) {
          shared.messages.set(reverseKey, []);
        }
        
        const messagesList = shared.messages.get(messageKey);
        const reverseList = shared.messages.get(reverseKey);
        
        if (messagesList) messagesList.push(event);
        if (reverseList) reverseList.push(event);
        
        saveMessages(shared.messages);
        
        // Save the event for other browsers to find
        saveEvent(event);
      }
    }
    
    // Broadcast the event to other browser tabs
    broadcastEvent('nostr_event', event);
    
    // In a real implementation, this would send the event to the relays
    // For this demo, we'll just simulate it with a timeout and broadcast locally
    return new Promise<string>(resolve => {
      setTimeout(() => {
        // Simulate the event being published and broadcast locally to subscribers
        this.broadcastEvent(event);
        resolve('OK');
      }, 300);
    });
  }
  
  // Subscribe to events matching a filter
  sub(relays: string[], filters: any[]): Subscription {
    const subId = generateRandomString(8);
    this.eventCallbacks.set(subId, []);
    
    logger.info('Subscribed to events', { 
      kinds: filters[0]?.kinds,
      relays: relays.length,
      subId
    });
    
    // Process the filter to check for existing events
    // This helps with cross-tab communication
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        const shared = getSharedInstance();
        const callbacks = this.eventCallbacks.get(subId) || [];
        
        const filter = filters[0];
        
        if (!filter) return;
        
        // If looking for matchmaking events
        if (filter.kinds?.includes(OMESTR_KIND)) {
          logger.info(`Looking for matchmaking events, found ${shared.looking.size} looking users`);
          
          // Send all looking events
          for (const pubkey of shared.looking) {
            logger.debug(`Found looking user: ${pubkey.substring(0, 8)}...`);
            const event: NostrEvent = {
              id: generateRandomString(64),
              kind: OMESTR_KIND,
              created_at: Math.floor(Date.now() / 1000),
              tags: [['status', 'looking'], ['session', generateRandomString(12)]],
              content: '',
              pubkey,
              sig: generateRandomString(64),
            };
            
            callbacks.forEach(callback => callback(event));
          }
        }
        
        // If looking for chat messages
        if (filter.kinds?.includes(4) && filter.authors && filter['#p']) {
          const pubkey = filter['#p'][0];
          const author = filter.authors[0];
          const sessionId = filter['#session']?.[0];
          
          if (sessionId) {
            logger.info(`Looking for chat messages between ${author.substring(0, 8)} and ${pubkey.substring(0, 8)}`);
            
            const messageKey = `${author}:${pubkey}:${sessionId}`;
            const messages = shared.messages.get(messageKey) || [];
            
            if (messages.length > 0) {
              logger.info(`Found ${messages.length} existing messages`);
            }
            
            // Send all existing messages
            for (const message of messages) {
              callbacks.forEach(callback => callback(message));
            }
          }
        }
      }, 500);
    }
    
    // In a real implementation, this would subscribe to the relays
    // For this demo, we'll just return a subscription object
    return {
      sub: subId,
      unsub: () => {
        logger.info(`Unsubscribing from ${subId}`);
        this.eventCallbacks.delete(subId);
      },
      on: (event: string, callback: (event: NostrEvent) => void) => {
        if (event === 'event') {
          const callbacks = this.eventCallbacks.get(subId) || [];
          callbacks.push(callback);
          this.eventCallbacks.set(subId, callbacks);
          logger.debug(`Added callback to subscription ${subId}`);
        }
      }
    };
  }
  
  // Broadcast an event to all subscribers (used internally)
  private broadcastEvent(event: NostrEvent) {
    let callbackCount = 0;
    this.eventCallbacks.forEach((callbacks, subId) => {
      callbacks.forEach(callback => {
        callback(event);
        callbackCount++;
      });
    });
    
    if (callbackCount > 0) {
      logger.debug(`Broadcasted event to ${callbackCount} callbacks`, {
        id: event.id.substring(0, 8),
        kind: event.kind
      });
    }
  }
}

// Create a Nostr pool for relay connections
export const createPool = (relays = DEFAULT_RELAYS) => {
  const pool = new SimplePool();
  pool.connect(relays);
  return pool;
};

// Publish a matchmaking event
export const publishMatchmakingEvent = async (
  pool: SimplePool,
  privateKey: string,
  publicKey: string,
  sessionId: string,
  status: 'looking' | 'matched',
  matchedPubkey?: string,
  browserInstanceId?: string
) => {
  const tags = [
    ['status', status],
    ['session', sessionId],
  ];

  if (matchedPubkey) {
    tags.push(['p', matchedPubkey]);
  }
  
  // Add browser instance ID to identify different browser sessions
  if (browserInstanceId) {
    tags.push(['browser_id', browserInstanceId]);
  }

  const event: NostrEvent = {
    id: generateRandomString(64),
    kind: OMESTR_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
    pubkey: publicKey,
    sig: generateRandomString(64), // Mock signature
  };

  try {
    logger.info(`Publishing matchmaking event: ${status}`, {
      sessionId,
      publicKey: publicKey.substring(0, 8),
      matched: matchedPubkey ? matchedPubkey.substring(0, 8) : undefined,
      browserId: browserInstanceId
    });
    return await pool.publish(DEFAULT_RELAYS, event);
  } catch (error) {
    logger.error('Error publishing matchmaking event', error);
    throw error;
  }
};

// Subscribe to matchmaking events
export const subscribeToMatchmaking = (
  pool: SimplePool,
  publicKey: string,
  onEvent: (event: NostrEvent) => void
) => {
  const filter = {
    kinds: [OMESTR_KIND],
    '#status': ['looking', 'matched'],
  };

  logger.info('Subscribing to matchmaking events', { publicKey: publicKey.substring(0, 8) });
  const sub = pool.sub(DEFAULT_RELAYS, [filter]);
  sub.on('event', onEvent);
  return sub;
};

// Publish a chat message
export const publishChatMessage = async (
  pool: SimplePool,
  privateKey: string,
  publicKey: string,
  recipientPubkey: string,
  sessionId: string,
  message: string,
  browserInstanceId?: string
) => {
  const tags = [
    ['p', recipientPubkey],
    ['session', sessionId],
  ];
  
  // Add browser instance ID to identify different browser sessions
  if (browserInstanceId) {
    tags.push(['browser_id', browserInstanceId]);
  }

  const event: NostrEvent = {
    id: generateRandomString(64),
    kind: 4, // Direct message
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: message, // In a real implementation, this would be encrypted
    pubkey: publicKey,
    sig: generateRandomString(64), // Mock signature
  };

  try {
    logger.info(`Publishing chat message to ${recipientPubkey.substring(0, 8)}`, {
      sessionId,
      content: message.substring(0, 20) + (message.length > 20 ? '...' : ''),
      browserId: browserInstanceId
    });
    return await pool.publish(DEFAULT_RELAYS, event);
  } catch (error) {
    logger.error('Error publishing chat message', error);
    throw error;
  }
};

// Subscribe to chat messages
export const subscribeToChatMessages = (
  pool: SimplePool,
  publicKey: string,
  partnerPubkey: string,
  sessionId: string,
  browserInstanceId: string,
  onEvent: (event: NostrEvent) => void
) => {
  const filter = {
    kinds: [4], // Direct message
    authors: [partnerPubkey],
    '#p': [publicKey],
    '#session': [sessionId],
  };

  logger.info(`Subscribing to chat messages from ${partnerPubkey.substring(0, 8)}`, {
    sessionId,
    publicKey: publicKey.substring(0, 8),
    browserId: browserInstanceId
  });
  
  const sub = pool.sub(DEFAULT_RELAYS, [filter]);
  sub.on('event', onEvent);
  return sub;
}; 
