import { generateRandomString } from '../nostr';
import { logger } from '../nostr/logger';

// Types
export type MatchmakingStatus = 'looking' | 'matched';

export interface MatchUser {
  id: string;
  pubkey: string;
  sessionId: string;
  browserId: string;
  status: MatchmakingStatus;
  matchedWith?: string;
  chatSessionId?: string;
}

interface MatchmakingResponse {
  user?: MatchUser;
  match?: MatchUser | null;
  otherUsers?: MatchUser[];
  userCount?: number;
  success: boolean;
  error?: string;
  removedId?: string;
  remainingCount?: number;
}

// Generate a unique user ID
export const generateUserId = (): string => {
  return generateRandomString(16);
};

// Register a user looking to chat
export const registerLookingUser = async (
  userId: string,
  pubkey: string,
  sessionId: string,
  browserId: string,
  status: MatchmakingStatus = 'looking',
  chatSessionId?: string
): Promise<MatchmakingResponse> => {
  try {
    const response = await fetch('/api/matchmaking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: userId,
        pubkey,
        sessionId,
        browserId,
        status,
        chatSessionId
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to register looking user', { status: response.status, error: errorText });
      return { success: false, error: errorText };
    }
    
    const data = await response.json();
    logger.info('Registered looking user', { 
      userId, 
      status,
      hasMatch: !!data.match,
      chatSessionId: data.user?.chatSessionId || data.match?.chatSessionId
    });
    
    return data;
  } catch (error) {
    logger.error('Error registering looking user', error);
    return { success: false, error: 'Failed to register user' };
  }
};

// Check for a match
export const checkForMatch = async (
  userId: string,
  browserId: string
): Promise<MatchmakingResponse> => {
  try {
    const response = await fetch(`/api/matchmaking?id=${userId}&browserId=${browserId}`, {
      method: 'GET',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to check for match', { status: response.status, error: errorText });
      return { success: false, error: errorText };
    }
    
    const data = await response.json();
    
    if (data.match) {
      logger.info('Found a match', { 
        userId, 
        matchId: data.match.id,
        matchPubkey: data.match.pubkey.substring(0, 8),
      });
    }
    
    return data;
  } catch (error) {
    logger.error('Error checking for match', error);
    return { success: false, error: 'Failed to check for match' };
  }
};

// Remove a user
export const removeUser = async (userId: string): Promise<MatchmakingResponse> => {
  try {
    const response = await fetch(`/api/matchmaking?id=${userId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to remove user', { status: response.status, error: errorText });
      return { success: false, error: errorText };
    }
    
    const data = await response.json();
    logger.info('Removed user', { userId, remainingCount: data.remainingCount });
    
    return data;
  } catch (error) {
    logger.error('Error removing user', error);
    return { success: false, error: 'Failed to remove user' };
  }
}; 