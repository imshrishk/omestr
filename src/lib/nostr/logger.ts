// Logging levels
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Log entry structure
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: any;
}

// Max number of logs to keep in storage
const MAX_LOGS = 1000;

// Storage key for logs
const LOGS_STORAGE_KEY = 'omestr_logs';

// Get logs from storage
const getStoredLogs = (): LogEntry[] => {
  if (typeof window === 'undefined') return [];
  
  try {
    const storedLogs = localStorage.getItem(LOGS_STORAGE_KEY);
    if (!storedLogs) return [];
    return JSON.parse(storedLogs) as LogEntry[];
  } catch (error) {
    console.error('Failed to parse stored logs:', error);
    return [];
  }
};

// Save logs to storage
const saveLogs = (logs: LogEntry[]) => {
  if (typeof window === 'undefined') return;
  
  try {
    // Keep only the most recent logs
    const trimmedLogs = logs.slice(-MAX_LOGS);
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(trimmedLogs));
  } catch (error) {
    console.error('Failed to save logs:', error);
  }
};

class Logger {
  private logs: LogEntry[] = [];
  
  constructor() {
    if (typeof window !== 'undefined') {
      // Load existing logs from localStorage
      this.logs = getStoredLogs();
      
      // Periodically save logs
      setInterval(() => this.saveLogs(), 5000);
    }
  }
  
  // Save logs to localStorage
  private saveLogs() {
    saveLogs(this.logs);
  }
  
  // Clear all logs
  clear() {
    this.logs = [];
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOGS_STORAGE_KEY);
    }
  }
  
  // Get all logs
  getLogs(): LogEntry[] {
    return [...this.logs];
  }
  
  // Add a new log entry
  private addEntry(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data
    };
    
    this.logs.push(entry);
    
    // Also log to console for immediate feedback
    const formattedTime = new Date(entry.timestamp).toISOString().split('T')[1].split('.')[0];
    
    switch (level) {
      case 'debug':
        console.debug(`[${formattedTime}] 🔍 ${message}`, data || '');
        break;
      case 'info':
        console.info(`[${formattedTime}] ℹ️ ${message}`, data || '');
        break;
      case 'warn':
        console.warn(`[${formattedTime}] ⚠️ ${message}`, data || '');
        break;
      case 'error':
        console.error(`[${formattedTime}] ❌ ${message}`, data || '');
        break;
    }
  }
  
  // Log methods
  debug(message: string, data?: any) {
    this.addEntry('debug', message, data);
  }
  
  info(message: string, data?: any) {
    this.addEntry('info', message, data);
  }
  
  warn(message: string, data?: any) {
    this.addEntry('warn', message, data);
  }
  
  error(message: string, data?: any) {
    this.addEntry('error', message, data);
  }
}

// Create and export a singleton instance
export const logger = new Logger(); 