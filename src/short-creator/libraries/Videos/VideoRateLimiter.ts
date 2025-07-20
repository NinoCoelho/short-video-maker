import { VideoProviderConfig, RateLimitInfo } from './types';
import { logger } from '../../../logger';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class VideoRateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private configs: Map<string, VideoProviderConfig> = new Map();

  setProviderConfig(providerName: string, config: VideoProviderConfig): void {
    this.configs.set(providerName, config);
  }

  async checkRateLimit(providerName: string): Promise<RateLimitInfo> {
    const config = this.configs.get(providerName);
    if (!config?.rateLimit) {
      return {
        remaining: 9999,
        reset: Date.now() + 3600000,
        limit: 9999,
      };
    }

    const limit = config.rateLimit;
    const entry = this.limits.get(providerName);
    const now = Date.now();

    let currentEntry: RateLimitEntry;

    if (!entry || now > entry.resetTime) {
      const windowMs = this.getWindowMs(limit.window);
      currentEntry = {
        count: 0,
        resetTime: now + windowMs,
      };
      this.limits.set(providerName, currentEntry);
    } else {
      currentEntry = entry;
    }

    const remaining = Math.max(0, limit.requests - currentEntry.count);

    return {
      remaining,
      reset: currentEntry.resetTime,
      limit: limit.requests,
    };
  }

  async consumeRequest(providerName: string): Promise<boolean> {
    const rateLimitInfo = await this.checkRateLimit(providerName);
    
    if (rateLimitInfo.remaining <= 0) {
      logger.warn({ 
        provider: providerName, 
        resetTime: new Date(rateLimitInfo.reset).toISOString() 
      }, "Rate limit exceeded");
      return false;
    }

    const entry = this.limits.get(providerName);
    if (entry) {
      entry.count++;
    }

    logger.debug({ 
      provider: providerName, 
      remaining: rateLimitInfo.remaining - 1,
      used: entry?.count || 1,
      limit: rateLimitInfo.limit
    }, "Rate limit consumed");

    return true;
  }

  getRemainingRequests(providerName: string): number {
    const config = this.configs.get(providerName);
    if (!config?.rateLimit) {
      return 9999;
    }

    const entry = this.limits.get(providerName);
    if (!entry || Date.now() > entry.resetTime) {
      return config.rateLimit.requests;
    }

    return Math.max(0, config.rateLimit.requests - entry.count);
  }

  getResetTime(providerName: string): number {
    const entry = this.limits.get(providerName);
    if (!entry) {
      return Date.now() + 3600000;
    }
    return entry.resetTime;
  }

  getAllRateLimits(): Record<string, RateLimitInfo> {
    const result: Record<string, RateLimitInfo> = {};

    for (const [providerName] of this.configs.entries()) {
      const config = this.configs.get(providerName);
      const entry = this.limits.get(providerName);
      const now = Date.now();

      if (!config?.rateLimit) {
        result[providerName] = {
          remaining: 9999,
          reset: now + 3600000,
          limit: 9999,
        };
        continue;
      }

      let currentCount = 0;
      let resetTime = now + this.getWindowMs(config.rateLimit.window);

      if (entry && now <= entry.resetTime) {
        currentCount = entry.count;
        resetTime = entry.resetTime;
      }

      result[providerName] = {
        remaining: Math.max(0, config.rateLimit.requests - currentCount),
        reset: resetTime,
        limit: config.rateLimit.requests,
      };
    }

    return result;
  }

  isProviderAvailable(providerName: string): boolean {
    return this.getRemainingRequests(providerName) > 0;
  }

  getNextAvailableProvider(providers: string[]): string | null {
    for (const provider of providers) {
      if (this.isProviderAvailable(provider)) {
        return provider;
      }
    }
    return null;
  }

  waitForReset(providerName: string): Promise<void> {
    const resetTime = this.getResetTime(providerName);
    const waitTime = Math.max(0, resetTime - Date.now());
    
    if (waitTime === 0) {
      return Promise.resolve();
    }

    logger.info({ 
      provider: providerName, 
      waitTimeMs: waitTime,
      resetTime: new Date(resetTime).toISOString()
    }, "Waiting for rate limit reset");

    return new Promise(resolve => setTimeout(resolve, waitTime));
  }

  private getWindowMs(window: 'hour' | 'day' | 'minute'): number {
    switch (window) {
      case 'minute':
        return 60 * 1000;
      case 'hour':
        return 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
      default:
        return 60 * 60 * 1000;
    }
  }

  resetProvider(providerName: string): void {
    this.limits.delete(providerName);
    logger.info({ provider: providerName }, "Rate limit reset");
  }

  resetAllProviders(): void {
    this.limits.clear();
    logger.info("All rate limits reset");
  }

  getStats(): {
    totalProviders: number;
    availableProviders: number;
    rateLimitedProviders: string[];
    nextResetTimes: Record<string, number>;
  } {
    const totalProviders = this.configs.size;
    let availableProviders = 0;
    const rateLimitedProviders: string[] = [];
    const nextResetTimes: Record<string, number> = {};

    for (const [providerName] of this.configs.entries()) {
      const available = this.isProviderAvailable(providerName);
      if (available) {
        availableProviders++;
      } else {
        rateLimitedProviders.push(providerName);
      }
      nextResetTimes[providerName] = this.getResetTime(providerName);
    }

    return {
      totalProviders,
      availableProviders,
      rateLimitedProviders,
      nextResetTimes,
    };
  }
}