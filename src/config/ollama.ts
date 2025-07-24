/**
 * Ollama service configuration
 */

export interface OllamaConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeout: number;
  maxRetries: number;
  contextWindow: number;
  batchSize: number;
  cache: {
    enabled: boolean;
    ttl: number; // milliseconds
  };
  scoring: {
    minHighlightScore: number;
    maxSuggestions: number;
    contextWindowSeconds: number;
  };
}

// Default configuration
export const defaultOllamaConfig: OllamaConfig = {
  enabled: process.env.NODE_ENV !== 'test', // Disabled in tests unless explicitly enabled
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  model: process.env.OLLAMA_MODEL || 'gemma3:12b-it-qat',
  timeout: parseInt(process.env.OLLAMA_TIMEOUT || '60000', 10), // 60 seconds
  maxRetries: parseInt(process.env.OLLAMA_MAX_RETRIES || '3', 10),
  contextWindow: parseInt(process.env.OLLAMA_CONTEXT_WINDOW || '8192', 10),
  batchSize: parseInt(process.env.OLLAMA_BATCH_SIZE || '5', 10),
  cache: {
    enabled: process.env.OLLAMA_CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.OLLAMA_CACHE_TTL || '3600000', 10) // 1 hour
  },
  scoring: {
    minHighlightScore: parseInt(process.env.OLLAMA_MIN_HIGHLIGHT_SCORE || '70', 10),
    maxSuggestions: parseInt(process.env.OLLAMA_MAX_SUGGESTIONS || '10', 10),
    contextWindowSeconds: parseInt(process.env.OLLAMA_CONTEXT_WINDOW_SECONDS || '60', 10)
  }
};

// Production optimized config
export const productionOllamaConfig: OllamaConfig = {
  ...defaultOllamaConfig,
  timeout: 120000, // 2 minutes for production
  maxRetries: 5,
  batchSize: 10,
  cache: {
    enabled: true,
    ttl: 7200000 // 2 hours
  },
  scoring: {
    minHighlightScore: 75, // Higher threshold for production
    maxSuggestions: 15,
    contextWindowSeconds: 90
  }
};

// Development config
export const developmentOllamaConfig: OllamaConfig = {
  ...defaultOllamaConfig,
  timeout: 30000, // Shorter timeout for dev
  maxRetries: 2,
  batchSize: 3,
  cache: {
    enabled: false, // Disable cache in development
    ttl: 300000 // 5 minutes if enabled
  },
  scoring: {
    minHighlightScore: 60, // Lower threshold for testing
    maxSuggestions: 5,
    contextWindowSeconds: 45
  }
};

// Get config based on environment
export function getOllamaConfig(): OllamaConfig {
  switch (process.env.NODE_ENV) {
    case 'production':
      return productionOllamaConfig;
    case 'development':
      return developmentOllamaConfig;
    case 'test':
      return {
        ...defaultOllamaConfig,
        enabled: false, // Disabled by default in tests
        cache: { enabled: false, ttl: 0 }
      };
    default:
      return defaultOllamaConfig;
  }
}

// Validation helper
export function validateOllamaConfig(config: Partial<OllamaConfig>): string[] {
  const errors: string[] = [];
  
  if (config.timeout && config.timeout < 1000) {
    errors.push('Timeout must be at least 1000ms');
  }
  
  if (config.maxRetries && (config.maxRetries < 0 || config.maxRetries > 10)) {
    errors.push('Max retries must be between 0 and 10');
  }
  
  if (config.contextWindow && config.contextWindow < 1024) {
    errors.push('Context window must be at least 1024 tokens');
  }
  
  if (config.batchSize && (config.batchSize < 1 || config.batchSize > 20)) {
    errors.push('Batch size must be between 1 and 20');
  }
  
  if (config.scoring?.minHighlightScore && 
      (config.scoring.minHighlightScore < 0 || config.scoring.minHighlightScore > 100)) {
    errors.push('Min highlight score must be between 0 and 100');
  }
  
  if (config.scoring?.maxSuggestions && 
      (config.scoring.maxSuggestions < 1 || config.scoring.maxSuggestions > 50)) {
    errors.push('Max suggestions must be between 1 and 50');
  }
  
  return errors;
}

// Environment variable documentation
export const envVarDocs = {
  OLLAMA_BASE_URL: 'Base URL for Ollama API (default: http://localhost:11434)',
  OLLAMA_MODEL: 'AI model to use (default: gemma3:12b-it-qat)',
  OLLAMA_TIMEOUT: 'Request timeout in milliseconds (default: 60000)',
  OLLAMA_MAX_RETRIES: 'Maximum retry attempts (default: 3)',
  OLLAMA_CONTEXT_WINDOW: 'Maximum tokens per request (default: 8192)',
  OLLAMA_BATCH_SIZE: 'Number of items to process simultaneously (default: 5)',
  OLLAMA_CACHE_ENABLED: 'Enable result caching (default: true)',
  OLLAMA_CACHE_TTL: 'Cache time-to-live in milliseconds (default: 3600000)',
  OLLAMA_MIN_HIGHLIGHT_SCORE: 'Minimum score for highlight detection (default: 70)',
  OLLAMA_MAX_SUGGESTIONS: 'Maximum number of clip suggestions (default: 10)',
  OLLAMA_CONTEXT_WINDOW_SECONDS: 'Analysis window size in seconds (default: 60)'
};

export default getOllamaConfig;