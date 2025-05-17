import { NextResponse } from 'next/server';

// In-memory store for users looking to chat
// This will be reset when the server restarts
type LookingUser = {
  id: string;
  pubkey: string;
  sessionId: string;
  timestamp: number;
  browserId: string;
  status: 'looking' | 'matched';
  matchedWith?: string;
  chatSessionId?: string; // Track conversation between matched users
};

// Clean up users older than 5 minutes
const EXPIRY_TIME = 5 * 60 * 1000; 

// Store for users looking to chat
let lookingUsers: LookingUser[] = [];

// Clean up old users
const cleanupOldUsers = () => {
  const now = Date.now();
  lookingUsers = lookingUsers.filter(user => (now - user.timestamp) < EXPIRY_TIME);
};

// Generate a random string for chat session IDs
const generateRandomId = (length: number = 12): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Route handler for registering a user looking to chat
export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();
    const { id, pubkey, sessionId, browserId, status, chatSessionId } = body;
    
    if (!id || !pubkey || !sessionId || !browserId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Clean up old users
    cleanupOldUsers();
    
    // Check if user exists
    const existingUserIndex = lookingUsers.findIndex(user => 
      user.id === id || user.browserId === browserId
    );
    
    // Update or add user
    const userData: LookingUser = {
      id,
      pubkey,
      sessionId,
      browserId,
      status: status || 'looking',
      timestamp: Date.now(),
      chatSessionId // Use provided chatSessionId if present
    };
    
    if (existingUserIndex >= 0) {
      // Update existing user
      lookingUsers[existingUserIndex] = {
        ...lookingUsers[existingUserIndex],
        ...userData
      };
    } else {
      // Add new user
      lookingUsers.push(userData);
    }
    
    // Find a match for this user (excluding users from the same browser)
    let match: LookingUser | null = null;
    
    if (status === 'looking') {
      match = lookingUsers.find(user => 
        user.id !== id && 
        user.browserId !== browserId && 
        user.status === 'looking'
      ) || null;
      
      // If we found a match, update both users
      if (match !== null) {
        // Generate a shared chat session ID for both users
        const sharedChatSessionId = generateRandomId(16);
        
        // Update the current user to indicate they're matched
        const currentUserIndex = lookingUsers.findIndex(user => user.id === id);
        if (currentUserIndex >= 0) {
          lookingUsers[currentUserIndex].status = 'matched';
          lookingUsers[currentUserIndex].matchedWith = match.id;
          lookingUsers[currentUserIndex].chatSessionId = sharedChatSessionId;
        }
        
        // Update the matched user to indicate they're matched
        const matchId = match.id; // Store ID in variable to avoid null issues
        const matchedUserIndex = lookingUsers.findIndex(user => user.id === matchId);
        if (matchedUserIndex >= 0) {
          lookingUsers[matchedUserIndex].status = 'matched';
          lookingUsers[matchedUserIndex].matchedWith = id;
          lookingUsers[matchedUserIndex].chatSessionId = sharedChatSessionId;
        }
        
        // Update the match object to include chatSessionId
        match = {
          ...match,
          chatSessionId: sharedChatSessionId
        };
      }
    }
    
    // Return the updated user data and potential match
    return NextResponse.json({
      user: userData,
      match: match,
      success: true
    });
  } catch (error) {
    console.error('Error in matchmaking POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Route handler for getting looking users
export async function GET(request: Request) {
  try {
    // Clean up old users
    cleanupOldUsers();
    
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const browserId = searchParams.get('browserId');
    
    if (!id || !browserId) {
      return NextResponse.json(
        { error: 'Missing required query parameters' },
        { status: 400 }
      );
    }
    
    // Check if this user has a match
    const user = lookingUsers.find(u => u.id === id);
    const match = user?.matchedWith 
      ? lookingUsers.find(u => u.id === user.matchedWith)
      : null;
      
    if (match) {
      console.log(`[Matchmaking API] Found match for user ${id.substring(0, 6)}... with user ${match.id.substring(0, 6)}...`);
      console.log(`[Matchmaking API] Chat session ID: ${match.chatSessionId || 'none'}`);
    }
    
    // Get all other looking users (for debugging)
    const otherUsers = lookingUsers.filter(u => 
      u.id !== id && u.browserId !== browserId
    );
    
    return NextResponse.json({
      match,
      otherUsers,
      userCount: lookingUsers.length,
      success: true
    });
  } catch (error) {
    console.error('Error in matchmaking GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Route handler for removing a user
export async function DELETE(request: Request) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'Missing required query parameter' },
        { status: 400 }
      );
    }
    
    // Remove the user
    lookingUsers = lookingUsers.filter(user => user.id !== id);
    
    return NextResponse.json({
      success: true,
      removedId: id,
      remainingCount: lookingUsers.length
    });
  } catch (error) {
    console.error('Error in matchmaking DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 