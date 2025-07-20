import { Video, OrientationEnum } from "../../../types/shorts";

export interface VideoProviderConfig {
  enabled: boolean;
  weight: number;
  rateLimit?: {
    requests: number;
    window: 'hour' | 'day' | 'minute';
  };
  specialization?: string[];
  requiresAttribution?: boolean;
  apiKey?: string;
}

export interface ProvidersConfig {
  providers: {
    [key: string]: VideoProviderConfig;
  };
  negativeKeywords: string[];
  usageTracking: {
    enabled: boolean;
    maxHistoryDays: number;
    preventRepeatsWithinDays: number;
  };
  search: {
    parallelTimeout: number;
    minDuration: number;
    maxDuration: number;
    preferredAspectRatio: string;
  };
}

export interface VideoUsageEntry {
  videoId: string;
  provider: string;
  timestamp: number;
  projectId?: string;
  searchTerms: string[];
}

export interface ProviderHealth {
  provider: string;
  healthy: boolean;
  lastError?: string;
  lastErrorTime?: number;
  successRate: number;
  totalRequests: number;
  failedRequests: number;
}

export interface VideoSearchContext {
  projectId?: string;
  excludeIds: string[];
  orientation: OrientationEnum;
  duration: number;
  searchTerms: string[];
}

export interface VideoProviderResponse {
  videos: Video[];
  provider: string;
  searchTime: number;
  totalResults?: number;
}

export interface RateLimitInfo {
  remaining: number;
  reset: number;
  limit: number;
}

export class VideoProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'VideoProviderError';
  }
}

export class RateLimitError extends VideoProviderError {
  constructor(provider: string, resetTime: number) {
    super(`Rate limit exceeded for ${provider}. Resets at ${new Date(resetTime).toISOString()}`, provider);
    this.name = 'RateLimitError';
  }
}

export class ProviderUnavailableError extends VideoProviderError {
  constructor(provider: string, reason: string) {
    super(`Provider ${provider} is unavailable: ${reason}`, provider);
    this.name = 'ProviderUnavailableError';
  }
}