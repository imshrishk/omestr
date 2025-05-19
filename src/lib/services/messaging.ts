import { generateRandomString } from '../nostr';
import { logger } from '../nostr/logger';

// Types
export interface Message {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  timestamp: number;
  chatSessionId: string;
}

interface MessageResponse {
  message?: Message;
  messages?: Message[];
  success: boolean;
  error?: string;
}

// Generate a unique message ID
export const generateMessageId = (): string => {
  return generateRandomString(16);
};

// Send a message to another user
export const sendMessage = async (
  content: string,
  senderId: string,
  receiverId: string,
  chatSessionId: string
): Promise<MessageResponse> => {
  try {
    const messageId = generateMessageId();
    
    logger.info('Sending message to API', { 
      messageId,
      senderId: senderId.substring(0, 8),
      receiverId: receiverId.substring(0, 8),
      chatSessionId,
      contentPreview: content.substring(0, 20)
    });
    
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: messageId,
        content,
        senderId,
        receiverId,
        chatSessionId
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to send message', { 
        status: response.status, 
        error: errorText,
        messageId
      });
      return { success: false, error: errorText };
    }
    
    const data = await response.json();
    logger.info('Message sent successfully', { 
      messageId, 
      receiverId: receiverId.substring(0, 8),
      chatSessionId,
      timestamp: new Date().toISOString()
    });
    
    return data;
  } catch (error) {
    logger.error('Error sending message', error);
    return { success: false, error: 'Failed to send message' };
  }
};

// Check for new messages
export const checkForMessages = async (
  userId: string,
  afterTimestamp?: number,
  chatSessionId?: string
): Promise<MessageResponse> => {
  try {
    let url = `/api/messages?userId=${encodeURIComponent(userId)}`;
    
    if (afterTimestamp) {
      url += `&after=${afterTimestamp}`;
    }
    
    if (chatSessionId) {
      url += `&chatSessionId=${encodeURIComponent(chatSessionId)}`;
    } else {
      logger.warn('No chatSessionId provided when checking for messages', {
        userId: userId.substring(0, 8)
      });
    }
    
    logger.debug('Checking for messages', {
      userId: userId.substring(0, 8),
      afterTimestamp,
      afterTimestampStr: afterTimestamp ? new Date(afterTimestamp).toISOString() : 'none',
      chatSessionId,
      url
    });
    
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to check for messages', { 
        status: response.status, 
        error: errorText,
        userId: userId.substring(0, 8)
      });
      return { success: false, error: errorText };
    }
    
    const data = await response.json();
    
    if (data.messages && data.messages.length > 0) {
      logger.info('Received new messages from API', { 
        count: data.messages.length,
        userId: userId.substring(0, 8),
        chatSessionId,
        messageIds: data.messages.map((m: Message) => m.id.substring(0, 8))
      });
      
      // Log message previews for debugging
      data.messages.forEach((msg: Message) => {
        logger.debug('Message content', {
          id: msg.id.substring(0, 8),
          from: msg.senderId.substring(0, 8),
          to: msg.receiverId.substring(0, 8),
          chatSessionId: msg.chatSessionId,
          content: msg.content.substring(0, 30)
        });
      });
    } else {
      logger.debug('No new messages received', {
        userId: userId.substring(0, 8),
        chatSessionId
      });
    }
    
    return data;
  } catch (error) {
    logger.error('Error checking for messages', error);
    return { success: false, error: 'Failed to check for messages' };
  }
}; 