import { useCallback, useRef, useEffect } from 'react';
import { logger } from '../nostr/logger';

export function useSoundEffects() {
  const newMessageSound = useRef<HTMLAudioElement | null>(null);
  const connectionSound = useRef<HTMLAudioElement | null>(null);
  const disconnectionSound = useRef<HTMLAudioElement | null>(null);

  // Initialize sounds
  useEffect(() => {
    if (typeof window !== 'undefined') {
      newMessageSound.current = new Audio('/sounds/message.mp3');
      connectionSound.current = new Audio('/sounds/connect.mp3');
      disconnectionSound.current = new Audio('/sounds/disconnect.mp3');
      
      logger.info('Sound effects initialized');
    }
    
    return () => {
      newMessageSound.current = null;
      connectionSound.current = null;
      disconnectionSound.current = null;
    };
  }, []);

  const playNewMessageSound = useCallback(() => {
    if (newMessageSound.current) {
      newMessageSound.current.play().catch(err => 
        logger.error('Error playing message sound', err)
      );
    }
  }, []);

  const playConnectionSound = useCallback(() => {
    if (connectionSound.current) {
      connectionSound.current.play().catch(err => 
        logger.error('Error playing connection sound', err)
      );
    }
  }, []);

  const playDisconnectionSound = useCallback(() => {
    if (disconnectionSound.current) {
      disconnectionSound.current.play().catch(err => 
        logger.error('Error playing disconnection sound', err)
      );
    }
  }, []);

  return {
    playNewMessageSound,
    playConnectionSound,
    playDisconnectionSound,
  };
} 