// Simple browser logger that matches the server logger interface
export const logger = {
  debug: (message: any, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[DEBUG]', message, ...args);
    }
  },
  
  info: (message: any, ...args: any[]) => {
    console.info('[INFO]', message, ...args);
  },
  
  warn: (message: any, ...args: any[]) => {
    console.warn('[WARN]', message, ...args);
  },
  
  error: (message: any, ...args: any[]) => {
    console.error('[ERROR]', message, ...args);
  }
};