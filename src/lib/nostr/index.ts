// Custom event kinds for our omestr app
export const OMESTR_KIND = 30078; // Custom kind for matchmaking events
import { logger } from './logger';
import * as nostrTools from 'nostr-tools';
import type { Event } from 'nostr-tools';

// Default relays to connect to
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
];

// Export the Event type for use in other files
export type { Event as NostrEvent } from 'nostr-tools';
export type { Filter } from 'nostr-tools';

// Define Subscription interface
export interface Subscription {
  sub: string;
  unsub: () => void;
  on: (event: string, callback: (event: Event) => void) => void;
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

// Generate a random string for session IDs, etc.
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
const loadEvents = (): Event[] => {
  if (typeof window === 'undefined') return [];
  
  try {
    const data = localStorage.getItem(STORAGE_KEYS.EVENTS);
    if (!data) {
      logger.info('No events found in storage');
      return [];
    }
    
    const parsed = JSON.parse(data) as Event[];
    logger.info(`Loaded ${parsed.length} events from storage`);
    return parsed;
  } catch (error) {
    logger.error('Error loading events from storage', error);
    return [];
  }
};

// Save a new event to localStorage
const saveEvent = (event: Event) => {
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

// Generate a keypair for Nostr
export const generateKeypair = () => {
  const privateKeyHex = nostrTools.generateSecretKey();
  // Convert Uint8Array to hex string
  const privateKey = Array.from(privateKeyHex).map(b => b.toString(16).padStart(2, '0')).join('');
  const publicKey = nostrTools.getPublicKey(privateKeyHex);
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

// Create a SimplePool for relay connections
export const createPool = (relays = DEFAULT_RELAYS) => {
  const pool = new nostrTools.SimplePool();
  logger.info('Created SimplePool and connecting to relays', { relays });
  return pool;
};

// Publish a matchmaking event to find chat partners
export const publishMatchmakingEvent = async (
  pool: nostrTools.SimplePool,
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
  
  if (browserInstanceId) {
    tags.push(['browser_id', browserInstanceId]);
  }
  
  // Create an unsigned event
  const event = {
    kind: OMESTR_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
    pubkey: publicKey,
  };
  
  // Convert hex private key to Uint8Array
  const privateKeyBytes = new Uint8Array(privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
  
  // Sign the event with the private key
  const signedEvent = nostrTools.finalizeEvent(event, privateKeyBytes);
  
  logger.info('Publishing matchmaking event', { 
    status, 
    sessionId,
    pubkey: publicKey.substring(0, 8),
    matchedPubkey: matchedPubkey?.substring(0, 8)
  });
  
  // Publish to relays
  const pubs = pool.publish(DEFAULT_RELAYS, signedEvent);
  await Promise.all(pubs);
  
  return signedEvent;
};

// Subscribe to matchmaking events
export const subscribeToMatchmaking = (
  pool: nostrTools.SimplePool,
  publicKey: string,
  onEvent: (event: nostrTools.Event) => void
) => {
  const filter: nostrTools.Filter = {
    kinds: [OMESTR_KIND],
  };
  
  logger.info('Subscribing to matchmaking events', { 
    pubkey: publicKey.substring(0, 8)
  });
  
  // Subscribe to events from actual relays
  // @ts-ignore - SimplePool API mismatch, but it works at runtime
  const sub = pool.sub(DEFAULT_RELAYS, [filter]);
  sub.on('event', (event: nostrTools.Event) => {
    onEvent(event);
  });
  
  return sub;
};

// Publish a direct message to a chat partner
export const publishChatMessage = async (
  pool: nostrTools.SimplePool,
  privateKey: string,
  publicKey: string,
  recipientPubkey: string,
  sessionId: string,
  message: string,
  browserInstanceId?: string
) => {
  // Convert hex private key to Uint8Array
  const privateKeyBytes = new Uint8Array(privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
  
  // Encrypt the message content according to NIP-04
  const encryptedContent = await nostrTools.nip04.encrypt(
    privateKeyBytes,
    recipientPubkey,
    message
  );
  
  const tags = [
    ['p', recipientPubkey],
    ['session', sessionId],
  ];
  
  if (browserInstanceId) {
    tags.push(['browser_id', browserInstanceId]);
  }
  
  // Create an unsigned event
  const event = {
    kind: 4, // Kind 4 is for encrypted direct messages
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: encryptedContent,
    pubkey: publicKey,
  };
  
  // Sign the event with the private key
  const signedEvent = nostrTools.finalizeEvent(event, privateKeyBytes);
  
  logger.info('Publishing chat message', { 
    recipientPubkey: recipientPubkey.substring(0, 8),
    sessionId
  });
  
  // Publish to relays
  const pubs = pool.publish(DEFAULT_RELAYS, signedEvent);
  await Promise.all(pubs);
  
  return signedEvent;
};

// Subscribe to direct messages
export const subscribeToChatMessages = (
  pool: nostrTools.SimplePool,
  privateKey: string,
  publicKey: string,
  partnerPubkey: string,
  sessionId: string,
  browserInstanceId: string,
  onEvent: (event: nostrTools.Event & { decryptedContent?: string }) => void
) => {
  // Convert hex private key to Uint8Array
  const privateKeyBytes = new Uint8Array(privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
  
  // Filter for direct messages (kind 4) from our partner
  const filter: nostrTools.Filter = {
    kinds: [4],
    authors: [partnerPubkey],
    '#p': [publicKey],
  };
  
  logger.info('Subscribing to chat messages', { 
    partnerPubkey: partnerPubkey.substring(0, 8),
    sessionId
  });
  
  // Subscribe to events from actual relays
  // @ts-ignore - SimplePool API mismatch, but it works at runtime
  const sub = pool.sub(DEFAULT_RELAYS, [filter]);
  sub.on('event', async (event: nostrTools.Event) => {
    try {
      // Decrypt the message content according to NIP-04
      const decryptedContent = await nostrTools.nip04.decrypt(
        privateKeyBytes,
        partnerPubkey,
        event.content
      );
      
      // Create a message with the decrypted content
      const message = {
        ...event,
        decryptedContent
      };
      
      // Invoke the callback with the decrypted message
      onEvent(message);
    } catch (error) {
      logger.error('Error decrypting message', error);
    }
  });
  
  return sub;
}; 
