import { NextResponse } from 'next/server';

// In-memory store for messages
// This will be reset when the server restarts
interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  timestamp: number;
  chatSessionId: string; // Add session ID to track conversation
}

// Keep messages for a limited time
const MESSAGE_RETENTION_TIME = 60 * 60 * 1000; // 1 hour

// Store for messages
let messages: ChatMessage[] = [];

// Clean up old messages
const cleanupOldMessages = () => {
  const now = Date.now();
  messages = messages.filter(message => (now - message.timestamp) < MESSAGE_RETENTION_TIME);
};

// Log the current state of messages
const logMessageState = () => {
  console.log(`[Messages API] Current messages count: ${messages.length}`);
  if (messages.length > 0) {
    messages.forEach(msg => {
      console.log(`[Messages API] Message ${msg.id}: from=${msg.senderId.substring(0, 6)}... to=${msg.receiverId.substring(0, 6)}... chatSessionId=${msg.chatSessionId} content=${msg.content.substring(0, 30)}...`);
    });
  }
};

// Route handler for sending a message
export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();
    const { id, content, senderId, receiverId, chatSessionId } = body;
    
    console.log(`[Messages API] Received POST request to send message: ${id}`);
    console.log(`[Messages API] From: ${senderId.substring(0, 6)}... To: ${receiverId.substring(0, 6)}...`);
    console.log(`[Messages API] Chat Session: ${chatSessionId}`);
    console.log(`[Messages API] Content: ${content.substring(0, 30)}...`);
    
    if (!id || !content || !senderId || !receiverId || !chatSessionId) {
      console.error('[Messages API] Missing required fields in POST request');
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Clean up old messages
    cleanupOldMessages();
    
    // Create a new message
    const message: ChatMessage = {
      id,
      content,
      senderId,
      receiverId,
      timestamp: Date.now(),
      chatSessionId
    };
    
    // Store the message
    messages.push(message);
    console.log(`[Messages API] Added message to store. Total messages: ${messages.length}`);
    
    // Return success
    return NextResponse.json({
      message,
      success: true
    });
  } catch (error) {
    console.error('Error in messages POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Route handler for getting messages
export async function GET(request: Request) {
  try {
    // Clean up old messages
    cleanupOldMessages();
    
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const after = searchParams.get('after');
    const chatSessionId = searchParams.get('chatSessionId');
    
    console.log(`[Messages API] Received GET request for user: ${userId?.substring(0, 6)}...`);
    console.log(`[Messages API] After timestamp: ${after || 'none'}`);
    console.log(`[Messages API] Chat Session ID: ${chatSessionId || 'none'}`);
    
    if (!userId) {
      console.error('[Messages API] Missing userId in GET request');
      return NextResponse.json(
        { error: 'Missing required query parameter: userId' },
        { status: 400 }
      );
    }
    
    // Find messages where this user is the receiver
    let userMessages = messages.filter(message => 
      message.receiverId === userId
    );
    console.log(`[Messages API] Found ${userMessages.length} messages where user is receiver`);
    
    // If chatSessionId is provided, filter messages by chatSessionId
    if (chatSessionId) {
      const beforeFilter = userMessages.length;
      userMessages = userMessages.filter(message => 
        message.chatSessionId === chatSessionId
      );
      console.log(`[Messages API] After filtering by chatSessionId (${chatSessionId}), ${userMessages.length} messages remain (from ${beforeFilter})`);
    } else {
      console.warn('[Messages API] No chatSessionId provided, this may cause messages to be mixed between chats');
    }
    
    // If after timestamp is provided, only return messages after that time
    if (after) {
      const afterTimestamp = parseInt(after, 10);
      if (!isNaN(afterTimestamp)) {
        const beforeFilter = userMessages.length;
        userMessages = userMessages.filter(message => 
          message.timestamp > afterTimestamp
        );
        console.log(`[Messages API] After filtering by timestamp, ${userMessages.length} messages remain (from ${beforeFilter})`);
      }
    }
    
    // Log all messages for debugging
    logMessageState();
    
    return NextResponse.json({
      messages: userMessages,
      success: true
    });
  } catch (error) {
    console.error('Error in messages GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 