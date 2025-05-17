// Custom event kinds for our omestr app
export const OMESTR_KIND = 30078; // Custom kind for matchmaking events
import { logger } from './logger';

// Global type definition for the window object
declare global {
  interface Window {
    _omestrPoolRef?: {
      current?: {
        connectedRelays: Set<string>;
      }
    }
  }
}

// Default relays to connect to - increased list of reliable relays
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nostr.plebchain.org',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.current.fyi'
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
      broadcastChannel.onmessage = (event) => {
        const { type, data } = JSON.parse(event.data);
        if (type === 'storage_update') {
          logger.debug('Received storage update from other tab');
          checkForUpdates();
        }
      };
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
    
    // Clean up stale looking users - check if they have expired
    const currentTime = Date.now();
    const validUsers = parsed.filter(pubkey => {
      const userLastActivity = localStorage.getItem(`${KEY_PREFIX}user_activity_${pubkey}`);
      if (!userLastActivity) return false;
      
      const lastActivity = parseInt(userLastActivity, 10);
      // More aggressive timeout - 30 seconds of inactivity is enough to consider user stale
      const isValid = currentTime - lastActivity < 30000; // 30 seconds stale check 
      
      if (!isValid) {
        // Remove stale user activity data
        localStorage.removeItem(`${KEY_PREFIX}user_activity_${pubkey}`);
        
        // Remove browser instance ID association
        const browserKey = `omestr_browser_${pubkey}`;
        if (localStorage.getItem(browserKey)) {
          localStorage.removeItem(browserKey);
        }
        
        logger.info(`Removed stale user: ${pubkey.substring(0, 8)}`);
      }
      
      return isValid;
    });
    
    // If the valid users count is different, update the storage
    if (validUsers.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEYS.LOOKING_USERS, JSON.stringify(validUsers));
      localStorage.setItem(STORAGE_KEYS.LAST_UPDATE, Date.now().toString());
    }
    
    logger.info(`Loaded ${validUsers.length} valid looking users from storage (filtered ${parsed.length - validUsers.length} stale)`, { users: validUsers });
    return new Set<string>(validUsers);
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
    
    // Update last activity timestamp for each user
    const currentTime = Date.now().toString();
    usersArray.forEach(pubkey => {
      localStorage.setItem(`${KEY_PREFIX}user_activity_${pubkey}`, currentTime);
    });
    
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
    
    // Filter out expired events (older than 2 minutes)
    const now = Date.now();
    const validEvents = parsed.filter(event => {
      const eventTime = event.created_at * 1000; // Convert to milliseconds
      return now - eventTime < MATCH_EXPIRY;
    });
    
    logger.info(`Loaded ${validEvents.length} valid events from storage (filtered ${parsed.length - validEvents.length} expired)`);
    return validEvents;
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
type MessageEntry = [string, Record<string, unknown>[]];

// Load messages from localStorage
const loadMessages = (): Map<string, Record<string, unknown>[]> => {
  if (typeof window === 'undefined') return new Map<string, Record<string, unknown>[]>();
  
  try {
    const data = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    if (!data) {
      logger.info('No messages found in storage');
      return new Map<string, Record<string, unknown>[]>();
    }
    
    const parsed = JSON.parse(data) as MessageEntry[];
    logger.info(`Loaded ${parsed.length} conversation threads from storage`);
    return new Map<string, Record<string, unknown>[]>(parsed);
  } catch (error) {
    logger.error('Error loading messages from storage', error);
    return new Map<string, Record<string, unknown>[]>();
  }
};

// Type for shared instance
interface SharedInstance {
  looking: Set<string>;
  matched: Map<string, string>;
  messages: Map<string, Record<string, unknown>[]>;
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
      messages: new Map<string, Record<string, unknown>[]>(),
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

const broadcastEvent = (type: string, data: Record<string, unknown>) => {
  if (typeof window === 'undefined' || !broadcastChannel) return;
  
  try {
    const message = JSON.stringify({
      type,
      data,
      timestamp: Date.now()
    });
    
    broadcastChannel.postMessage(message);
    
    // Additionally, update the last update timestamp in localStorage
    // This helps with cross-browser detection
    localStorage.setItem(STORAGE_KEYS.LAST_UPDATE, Date.now().toString());
    
    logger.debug(`Broadcasted event: ${type}`, data);
  } catch (error) {
    logger.error(`Error broadcasting event: ${type}`, error);
  }
};

// Debug function to dump all localStorage data
export const dumpLocalStorage = () => {
  if (typeof window === 'undefined') return null;
  
  const result: Record<string, unknown> = {};
  
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

// Expiry time for matchmaking events (2 minutes)
export const MATCH_EXPIRY = 2 * 60 * 1000; // 2 minutes

// Mock implementation of a relay pool
export class SimplePool {
  relays: string[] = [];
  connectedRelays: Set<string> = new Set();
  eventCallbacks: Map<string, ((event: NostrEvent) => void)[]> = new Map();
  polling: boolean = false;
  pollInterval: number = 2000; // Poll every 2 seconds
  reconnectAttempts: Map<string, number> = new Map();
  maxReconnectAttempts: number = 5;
  
  constructor() {
    // Setup polling for events when in browser
    if (typeof window !== 'undefined') {
      // Initialize the broadcast channel for cross-browser communication
      initBroadcastChannel();
      
      // Start polling immediately
      this.startPolling();
      
      // Start periodic relay health checks
      this.startRelayHealthChecks();
      
      // Expose the pool reference for diagnostics
      if (!window._omestrPoolRef) {
        window._omestrPoolRef = { current: this };
      }
    }
  }
  
  // Check if relays are connected and try to reconnect if not
  private verifyRelayConnections() {
    // If we have no relays, there's nothing to check
    if (this.relays.length === 0) return;
    
    // Count connected relays
    const connectedCount = this.connectedRelays.size;
    const targetCount = Math.ceil(this.relays.length * 0.6); // We want at least 60% of relays connected
    
    if (connectedCount < targetCount) {
      logger.warn(`Only ${connectedCount}/${this.relays.length} relays connected, attempting to reconnect`);
      
      // Try to reconnect to all relays that aren't connected
      this.relays.forEach(relay => {
        if (!this.connectedRelays.has(relay)) {
          const attempts = this.reconnectAttempts.get(relay) || 0;
          
          if (attempts < this.maxReconnectAttempts) {
            logger.info(`Attempting to reconnect to relay: ${relay} (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);
            
            try {
              const ws = new WebSocket(relay);
              
              ws.onopen = () => {
                this.connectedRelays.add(relay);
                this.reconnectAttempts.delete(relay); // Reset attempts on success
                logger.info(`Successfully reconnected to relay: ${relay}`);
              };
              
              ws.onerror = () => {
                // Failed to connect, increment attempt counter
                this.reconnectAttempts.set(relay, attempts + 1);
                logger.warn(`Failed to reconnect to relay: ${relay}`);
              };
            } catch (error) {
              // Failed to connect, increment attempt counter
              this.reconnectAttempts.set(relay, attempts + 1);
              logger.error(`Error reconnecting to ${relay}`, error);
            }
          } else {
            logger.error(`Max reconnect attempts reached for relay: ${relay}, giving up`);
          }
        }
      });
    }
  }
  
  // Start periodic health checks for relay connections
  private startRelayHealthChecks() {
    setInterval(() => {
      this.verifyRelayConnections();
    }, 30000); // Check every 30 seconds
  }
  
  // Connect to relays
  connect(relays: string[]) {
    this.relays = relays;
    
    logger.info('Connecting to relays', { relays });
    
    // Connect to relays using WebSockets
    relays.forEach(relay => {
      try {
        const ws = new WebSocket(relay);
        
        ws.onopen = () => {
          this.connectedRelays.add(relay);
          logger.info(`Connected to relay: ${relay}`);
        };
        
        ws.onerror = (e) => {
          logger.warn(`Failed to connect to relay: ${relay}`, e);
        };
        
        ws.onclose = () => {
          this.connectedRelays.delete(relay);
          logger.info(`Disconnected from relay: ${relay}`);
        };
      } catch (error) {
        logger.error(`Error connecting to ${relay}`, error);
      }
    });
    
    logger.info('Initiated connections to relays', { 
      relays,
      totalRelays: relays.length
    });
    
    return this;
  }
  
  // Disconnect from all relays
  disconnect() {
    logger.info('Disconnecting from all relays');
    
    // Clear connected relays set
    this.connectedRelays.clear();
    
    // Reset reconnect attempts
    this.reconnectAttempts.clear();
    
    return this;
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
      
      // Periodically force sync state even without updates
      const shared = getSharedInstance();
      if (shared.looking.size > 0) {
        logger.debug(`Periodic sync: ${shared.looking.size} looking users available`);
      }
      
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
    
    // Skip expired events
    const eventTime = event.created_at * 1000; // Convert to milliseconds
    if (Date.now() - eventTime > MATCH_EXPIRY) {
      logger.debug(`Skipping expired event from ${event.pubkey.substring(0, 8)}`, {
        age: Math.floor((Date.now() - eventTime) / 1000) + ' seconds'
      });
      return;
    }
    
    // Broadcast to all subscribers
    this.broadcastEvent(event);
    
    // Special handling for matchmaking events
    if (event.kind === OMESTR_KIND) {
      // Extract status from tags
      const statusTag = event.tags.find(tag => tag[0] === 'status');
      const status = statusTag ? statusTag[1] : '';
      
      // Get browser instance ID to avoid duplicate handling
      const browserIdTag = event.tags.find(tag => tag[0] === 'browser_id');
      const browserInstanceId = browserIdTag ? browserIdTag[1] : '';
      
      // Store the browser instance ID for this pubkey - this helps with matching logic
      if (browserInstanceId && typeof window !== 'undefined') {
        localStorage.setItem(`omestr_browser_${event.pubkey}`, browserInstanceId);
      }
      
      // Handle 'looking' events
      if (status === 'looking') {
        const shared = getSharedInstance();
        
        // Add the user to looking users if not already there
        if (!shared.looking.has(event.pubkey)) {
          logger.info(`Adding ${event.pubkey.substring(0, 8)} to looking users`);
          shared.looking.add(event.pubkey);
          saveLookingUsers(shared.looking);
        }
        
        // Update user activity timestamp
        if (typeof window !== 'undefined') {
          localStorage.setItem(`${KEY_PREFIX}user_activity_${event.pubkey}`, Date.now().toString());
        }
      }
      
      // Handle 'matched' events
      if (status === 'matched') {
        // Extract target pubkey for matched events
        const targetTag = event.tags.find(tag => tag[0] === 'p');
        const targetPubkey = targetTag ? targetTag[1] : null;
        
        if (targetPubkey) {
          logger.info(`Processing match between ${event.pubkey.substring(0, 8)} and ${targetPubkey.substring(0, 8)}`);
          
          // Make sure the match is registered in shared instance
          const shared = getSharedInstance();
          if (!shared.matched.has(event.pubkey)) {
            shared.matched.set(event.pubkey, targetPubkey);
            saveMatchedUsers(shared.matched);
            
            // Remove both users from looking
            shared.looking.delete(event.pubkey);
            shared.looking.delete(targetPubkey);
            saveLookingUsers(shared.looking);
          }
        }
      }
    }
  }
  
  // Publish an event to all connected relays with retry
  async publish(relays: string[], event: NostrEvent) {
    // Store the event locally for other browser tabs to see
    saveEvent(event);
    
    // Broadcast the event to all subscription callbacks
    this.broadcastEvent(event);
    
    // CRITICAL FIX: Force broadcast to ALL relays regardless of connection status
    // This ensures events propagate even if relay connections aren't fully established
    DEFAULT_RELAYS.forEach(relay => {
      try {
        const ws = new WebSocket(relay);
        ws.onopen = () => {
          try {
            // Format as proper Nostr relay message
            ws.send(JSON.stringify(["EVENT", event]));
            logger.debug(`Force-sent event to ${relay}`);
            
            // Add relay to connected set if not already there
            if (!this.connectedRelays.has(relay)) {
              this.connectedRelays.add(relay);
              logger.info(`Added ${relay} to connected relays via force-send`);
            }
            
            // Close after sending
            setTimeout(() => ws.close(), 500);
          } catch (err) {
            logger.error(`Error sending event to ${relay}`, err);
            ws.close();
          }
        };
        ws.onerror = () => {
          logger.warn(`Failed to force-send to ${relay}`);
          ws.close();
        };
      } catch (err) {
        logger.error(`Error creating WebSocket for ${relay}`, err);
      }
    });
    
    // Set up retry logic
    const maxRetries = 3;
    let retryCount = 0;
    let publishSuccess = false;
    
    while (retryCount <= maxRetries && !publishSuccess) {
      // Get current connected relays count
      const connectedRelaysCount = this.connectedRelays.size;
      
      if (connectedRelaysCount > 0) {
        try {
          // In a real implementation, this would publish to actual WebSockets
          // For this simulation, we'll log it and store it
          logger.info(`Publishing event to ${connectedRelaysCount} relays (attempt ${retryCount + 1}/${maxRetries + 1})`, { 
            id: event.id.substring(0, 8), 
            kind: event.kind,
            tags: event.tags
          });
          
          // Simulate successful publish
          publishSuccess = true;
          
          // If this is a matchmaking event, store it more persistently for discovery
          if (event.kind === OMESTR_KIND) {
            // Store in localStorage for better cross-browser visibility
            const statusTag = event.tags.find(tag => tag[0] === 'status');
            if (statusTag && statusTag[1] === 'looking') {
              // Store this pubkey in the looking users list for broader discovery
              try {
                const lookingUsersKey = 'omestr_global_looking_users';
                const existingData = localStorage.getItem(lookingUsersKey) || '[]';
                const lookingUsers = JSON.parse(existingData) as string[];
                
                // Add the pubkey if it's not already there
                if (!lookingUsers.includes(event.pubkey)) {
                  lookingUsers.push(event.pubkey);
                  localStorage.setItem(lookingUsersKey, JSON.stringify(lookingUsers));
                  logger.info(`Added pubkey to looking users: ${event.pubkey.substring(0, 8)}`);
                }
                
                // Mark this user as active
                localStorage.setItem(`${KEY_PREFIX}user_activity_${event.pubkey}`, Date.now().toString());
              } catch (e) {
                logger.error('Error updating looking users in localStorage', e);
              }
            }
          }
        } catch (error) {
          logger.error(`Error publishing (attempt ${retryCount + 1}/${maxRetries + 1})`, error);
          retryCount++;
          
          // Wait with exponential backoff before retrying
          if (retryCount <= maxRetries) {
            const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 8000);
            logger.info(`Retrying publish in ${backoffTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          }
        }
      } else {
        logger.error(`No connected relays for publish attempt ${retryCount + 1}`);
        retryCount++;
        
        if (retryCount <= maxRetries) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Try to connect to relays again
          this.connect(relays);
          
          // Give relays time to connect
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    // Final result
    return publishSuccess;
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
          
          // Extract our pubkey if it's in the filter
          const ourPubkey = filter['#p']?.[0] || '';
          const browserInstanceId = getBrowserInstanceId();
          
          // Send all looking events
          for (const pubkey of shared.looking) {
            // Skip our own looking events or those from the same browser
            if (pubkey === ourPubkey) continue;
            
            logger.info(`Broadcasting looking user event: ${pubkey.substring(0, 8)}...`);
            const event: NostrEvent = {
              id: generateRandomString(64),
              kind: OMESTR_KIND,
              created_at: Math.floor(Date.now() / 1000),
              tags: [
                ['status', 'looking'], 
                ['session', generateRandomString(12)], 
                ['browser_id', browserInstanceId]
              ],
              content: '',
              pubkey,
              sig: generateRandomString(64),
            };
            
            // Only send to callbacks, don't do internal processing
            callbacks.forEach(callback => callback(event));
          }
          
          // Check matched pairs too
          const matchPairs = Array.from(shared.matched.entries());
          if (matchPairs.length > 0) {
            logger.info(`Found ${matchPairs.length} matched pairs`);
            
            // Send matched events that are relevant to this subscription
            for (const [pubkey1, pubkey2] of matchPairs) {
              // Only send if our pubkey is one of the matched ones
              if (ourPubkey && (pubkey1 === ourPubkey || pubkey2 === ourPubkey)) {
                const partnerPubkey = pubkey1 === ourPubkey ? pubkey2 : pubkey1;
                const chatSessionId = generateRandomString(16);
                
                logger.info(`Broadcasting matched event between ${pubkey1.substring(0, 8)} and ${pubkey2.substring(0, 8)}`);
                
                const matchEvent: NostrEvent = {
                  id: generateRandomString(64),
                  kind: OMESTR_KIND,
                  created_at: Math.floor(Date.now() / 1000),
                  tags: [
                    ['status', 'matched'], 
                    ['session', generateRandomString(12)],
                    ['p', partnerPubkey],
                    ['chat_session', chatSessionId],
                    ['browser_id', browserInstanceId]
                  ],
                  content: '',
                  pubkey: ourPubkey,
                  sig: generateRandomString(64),
                };
                
                callbacks.forEach(callback => callback(matchEvent));
              }
            }
          }
          
          // Force all looking users to broadcast their availability more often
          if (shared.looking.size > 5 && shared.matched.size === 0) {
            logger.warn(`Multiple looking users (${shared.looking.size}) but no matches - forcing broadcast`);
            
            // Immediately broadcast all looking users to all active subscriptions
            for (const pubkey of shared.looking) {
              // Create an event for each user
              const lookingEvent: NostrEvent = {
                id: generateRandomString(64),
                kind: OMESTR_KIND,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                  ['status', 'looking'], 
                  ['session', generateRandomString(12)],
                  ['browser_id', browserInstanceId]
                ],
                content: '',
                pubkey,
                sig: generateRandomString(64),
              };
              
              // Broadcast to ALL subscriptions to maximize visibility
              this.broadcastEvent(lookingEvent);
            }
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
              // Cast message to NostrEvent
              callbacks.forEach(callback => callback(message as unknown as NostrEvent));
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
  browserInstanceId?: string,
  chatSessionId?: string
) => {
  // Ensure sessionId is never empty
  const validSessionId = sessionId || generateRandomString(12);
  if (!sessionId) {
    logger.warn('Generated new session ID for matchmaking', { validSessionId });
  }
  
  const tags = [
    ['status', status],
    ['session', validSessionId],
    ['expiry', (Date.now() + MATCH_EXPIRY).toString()], // Add expiry timestamp
  ];

  if (matchedPubkey) {
    tags.push(['p', matchedPubkey]);
  }
  
  // Add browser instance ID to identify different browser sessions
  if (browserInstanceId) {
    tags.push(['browser_id', browserInstanceId]);
  } else {
    // Always include browser instance ID
    tags.push(['browser_id', getBrowserInstanceId()]);
  }
  
  // Add chat session ID for matched status
  if (chatSessionId && status === 'matched') {
    tags.push(['chat_session', chatSessionId]);
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
      sessionId: validSessionId,
      publicKey: publicKey.substring(0, 8),
      matched: matchedPubkey ? matchedPubkey.substring(0, 8) : undefined,
      browserId: browserInstanceId || getBrowserInstanceId(),
      chatSessionId
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

// Generate a unique browser instance ID to differentiate between browser sessions
const getBrowserInstanceId = (): string => {
  if (typeof window === 'undefined') return '';
  
  const storageKey = 'omestr_browser_instance_id';
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

// Clear storage for debugging and reset
export const clearStorage = () => {
  if (typeof window === 'undefined') return;
  
  logger.info('Clearing all storage data for Omestr');
  
  try {
    // Clear all localStorage items with our prefix
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('omestr_') || key.startsWith(KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
    
    // Specifically clear all browser ID associations
    for (const key of keys) {
      if (key.startsWith('omestr_browser_')) {
        localStorage.removeItem(key);
      }
    }
    
    // Reset the shared instance
    if (sharedInstance) {
      sharedInstance.looking = new Set<string>();
      sharedInstance.matched = new Map<string, string>();
      sharedInstance.messages = new Map<string, Record<string, unknown>[]>();
      sharedInstance.lastChecked = Date.now();
    }
    
    // Store empty arrays for consistent state
    localStorage.setItem(STORAGE_KEYS.LOOKING_USERS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.MATCHED_USERS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.LAST_UPDATE, Date.now().toString());
    
    // Clear sessionStorage items related to browser instance IDs
    sessionStorage.removeItem('omestr_browser_instance_id');
    
    // Broadcast the clear event to other tabs
    if (broadcastChannel) {
      broadcastChannel.postMessage(JSON.stringify({ 
        type: 'storage_cleared', 
        timestamp: Date.now() 
      }));
    }
    
    logger.info('Storage cleared successfully');
  } catch (error) {
    logger.error('Error clearing storage', error);
  }
  
  return true;
}; 
