import { NextResponse } from 'next/server';

interface Reaction {
  messageId: string;
  emoji: string;
  senderId: string;
  receiverId: string;
  timestamp: number;
  chatSessionId: string;
}

// In-memory storage for reactions
// Note: In a production app, this would use a database
const reactions: Reaction[] = [];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messageId, emoji, senderId, receiverId, chatSessionId } = body;
    
    if (!messageId || !emoji || !senderId || !receiverId || !chatSessionId) {
      return NextResponse.json({ 
        error: 'Missing required fields' 
      }, { status: 400 });
    }
    
    // Check for duplicate reaction (don't add if already exists)
    const duplicateReaction = reactions.find(r => 
      r.messageId === messageId && 
      r.emoji === emoji && 
      r.senderId === senderId && 
      r.chatSessionId === chatSessionId
    );
    
    if (!duplicateReaction) {
      const reaction: Reaction = {
        messageId,
        emoji,
        senderId,
        receiverId,
        timestamp: Date.now(),
        chatSessionId,
      };
      
      reactions.push(reaction);
      
      console.log(`Added reaction: ${emoji} to message ${messageId} in chat ${chatSessionId}`);
    } else {
      console.log(`Duplicate reaction prevented: ${emoji} to message ${messageId}`);
    }
    
    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Error in reactions POST:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chatSessionId = searchParams.get('chatSessionId');
    
    if (!chatSessionId) {
      return NextResponse.json({ 
        error: 'Missing chatSessionId parameter' 
      }, { status: 400 });
    }
    
    const chatReactions = reactions.filter(
      reaction => reaction.chatSessionId === chatSessionId
    );
    
    console.log(`Returning ${chatReactions.length} reactions for chat ${chatSessionId}`);
    
    return NextResponse.json({
      reactions: chatReactions,
      success: true,
    });
  } catch (error) {
    console.error('Error in reactions GET:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
} 