# Import API Examples and Best Practices

This guide provides comprehensive examples and best practices for using the Short Video Maker Import API effectively.

## Table of Contents

- [Quick Start Examples](#quick-start-examples)
- [Complete Workflows](#complete-workflows)
- [Error Handling Strategies](#error-handling-strategies)
- [Performance Optimization](#performance-optimization)
- [Rate Limiting Best Practices](#rate-limiting-best-practices)
- [Production Ready Code](#production-ready-code)
- [Testing Strategies](#testing-strategies)
- [Monitoring and Observability](#monitoring-and-observability)

## Quick Start Examples

### Simple URL Analysis

```javascript
// Basic video analysis without downloading
async function analyzeVideoQuick(url) {
  try {
    const response = await fetch('/api/import/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      title: data.metadata.title,
      duration: data.metadata.duration,
      canDownload: data.metadata.canDownload,
      estimatedTime: data.metadata.estimatedProcessingTime
    };
  } catch (error) {
    console.error('Analysis failed:', error);
    throw error;
  }
}

// Usage
analyzeVideoQuick('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  .then(info => console.log('Video info:', info))
  .catch(err => console.error('Failed:', err));
```

### Basic Import with Progress Monitoring

```javascript
import { io } from 'socket.io-client';

async function importVideoBasic(url) {
  // Start the import
  const response = await fetch('/api/import/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });

  const { jobId } = await response.json();
  
  // Monitor progress via WebSocket
  const socket = io('http://localhost:3233');
  
  return new Promise((resolve, reject) => {
    socket.emit('subscribe-import', jobId);
    
    socket.on('import-progress', (data) => {
      if (data.jobId === jobId) {
        console.log(`Progress: ${data.progress}% - ${data.status}`);
      }
    });
    
    socket.on('import-complete', (data) => {
      if (data.jobId === jobId) {
        socket.disconnect();
        resolve({ jobId, videoId: data.videoId });
      }
    });
    
    socket.on('import-error', (data) => {
      if (data.jobId === jobId) {
        socket.disconnect();
        reject(new Error(data.error));
      }
    });
  });
}
```

## Complete Workflows

### Professional Import Workflow

```javascript
class VideoImportWorkflow {
  constructor(baseUrl = 'http://localhost:3233') {
    this.baseUrl = baseUrl;
    this.socket = null;
    this.activeJobs = new Map();
  }

  async analyzeAndValidate(url) {
    const response = await this.request('/api/import/analyze', {
      method: 'POST',
      body: JSON.stringify({ 
        url,
        options: {
          includeTranscript: true,
          detectSegments: true,
          analyzeContent: true
        }
      })
    });

    const data = await response.json();
    
    // Validate before importing
    if (!data.metadata.canDownload) {
      throw new Error('Video cannot be downloaded from this source');
    }

    if (data.metadata.duration > 3600) { // 1 hour
      console.warn('Video is very long, import may take significant time');
    }

    return data;
  }

  async startImport(url, config = {}) {
    // Default configuration optimized for performance
    const defaultConfig = {
      segmentDetection: {
        method: 'scene-change',
        threshold: 0.3
      },
      contentAnalysis: {
        extractKeywords: true,
        generateSummary: false, // Disable for speed
        detectHighlights: true
      },
      translation: {
        enabled: false // Enable only if needed
      }
    };

    const mergedConfig = this.mergeConfig(defaultConfig, config);

    const response = await this.request('/api/import/process', {
      method: 'POST',
      body: JSON.stringify({ url, config: mergedConfig })
    });

    const { jobId } = await response.json();
    return jobId;
  }

  async monitorImport(jobId, options = {}) {
    const { onProgress, onComplete, onError, timeout = 1800000 } = options; // 30 min default

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.unsubscribeFromJob(jobId);
        reject(new Error('Import timeout'));
      }, timeout);

      this.subscribeToJob(jobId, {
        onProgress: (data) => {
          if (onProgress) onProgress(data);
        },
        onComplete: (data) => {
          clearTimeout(timer);
          this.unsubscribeFromJob(jobId);
          if (onComplete) onComplete(data);
          resolve(data);
        },
        onError: (error) => {
          clearTimeout(timer);
          this.unsubscribeFromJob(jobId);
          if (onError) onError(error);
          reject(new Error(error));
        }
      });
    });
  }

  async getSegments(jobId) {
    const response = await this.request(`/api/import/${jobId}/segments`);
    return response.json();
  }

  async optimizeSegments(jobId, segments) {
    // Optimize segment boundaries for better short-form content
    const optimizedSegments = segments.map(segment => {
      const duration = segment.endTime - segment.startTime;
      
      // Ensure segments are suitable for short-form content (15-60 seconds)
      if (duration < 15) {
        // Extend short segments
        segment.endTime = Math.min(segment.startTime + 20, segment.endTime + 10);
      } else if (duration > 60) {
        // Split long segments
        segment.endTime = segment.startTime + 45;
      }
      
      return segment;
    });

    const response = await this.request(`/api/import/${jobId}/segments`, {
      method: 'PUT',
      body: JSON.stringify({ segments: optimizedSegments })
    });

    return response.json();
  }

  async detectHighlights(jobId, criteria = ['engagement', 'visual-quality']) {
    const response = await this.request(`/api/import/${jobId}/highlights`, {
      method: 'POST',
      body: JSON.stringify({
        maxHighlights: 5,
        minDuration: 15,
        criteria
      })
    });

    return response.json();
  }

  // Complete workflow method
  async processVideo(url, options = {}) {
    try {
      console.log('🔍 Analyzing video...');
      const analysis = await this.analyzeAndValidate(url);
      console.log(`📹 Found: ${analysis.metadata.title} (${analysis.metadata.duration}s)`);

      console.log('🚀 Starting import...');
      const jobId = await this.startImport(url, options.config);

      console.log('⏳ Monitoring progress...');
      await this.monitorImport(jobId, {
        onProgress: (data) => {
          console.log(`Progress: ${data.progress}% - ${data.status} ${data.message || ''}`);
        }
      });

      console.log('📊 Retrieving segments...');
      const { segments } = await this.getSegments(jobId);

      if (options.optimizeSegments) {
        console.log('⚡ Optimizing segments...');
        await this.optimizeSegments(jobId, segments);
      }

      console.log('🎯 Detecting highlights...');
      const highlights = await this.detectHighlights(jobId, options.highlightCriteria);

      return {
        jobId,
        analysis,
        segments,
        highlights: highlights.highlights
      };

    } catch (error) {
      console.error('❌ Workflow failed:', error.message);
      throw error;
    }
  }

  // Helper methods
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: { 'Content-Type': 'application/json' },
      ...options
    };

    const response = await fetch(url, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`${response.status}: ${error.error || response.statusText}`);
    }

    return response;
  }

  subscribeToJob(jobId, callbacks) {
    if (!this.socket) {
      this.socket = io(this.baseUrl);
    }

    this.socket.emit('subscribe-import', jobId);
    this.activeJobs.set(jobId, callbacks);

    this.socket.on('import-progress', (data) => {
      const callback = this.activeJobs.get(data.jobId);
      if (callback && callback.onProgress) {
        callback.onProgress(data);
      }
    });

    this.socket.on('import-complete', (data) => {
      const callback = this.activeJobs.get(data.jobId);
      if (callback && callback.onComplete) {
        callback.onComplete(data);
      }
    });

    this.socket.on('import-error', (data) => {
      const callback = this.activeJobs.get(data.jobId);
      if (callback && callback.onError) {
        callback.onError(data.error);
      }
    });
  }

  unsubscribeFromJob(jobId) {
    if (this.socket) {
      this.socket.emit('unsubscribe-import', jobId);
    }
    this.activeJobs.delete(jobId);
  }

  mergeConfig(defaultConfig, userConfig) {
    return {
      ...defaultConfig,
      ...userConfig,
      segmentDetection: { ...defaultConfig.segmentDetection, ...userConfig.segmentDetection },
      contentAnalysis: { ...defaultConfig.contentAnalysis, ...userConfig.contentAnalysis },
      translation: { ...defaultConfig.translation, ...userConfig.translation }
    };
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.activeJobs.clear();
  }
}

// Usage
const workflow = new VideoImportWorkflow();

async function processYouTubeVideo() {
  try {
    const result = await workflow.processVideo(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      {
        optimizeSegments: true,
        highlightCriteria: ['engagement', 'hook-potential'],
        config: {
          segmentDetection: { method: 'ai-analysis' }
        }
      }
    );

    console.log('✅ Processing complete!');
    console.log(`Found ${result.segments.length} segments and ${result.highlights.length} highlights`);
    
    return result;
  } catch (error) {
    console.error('Processing failed:', error);
  } finally {
    workflow.disconnect();
  }
}
```

### Batch Processing Workflow

```javascript
class BatchImportProcessor {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 3;
    this.retryAttempts = options.retryAttempts || 2;
    this.retryDelay = options.retryDelay || 5000;
    this.workflow = new VideoImportWorkflow();
    this.queue = [];
    this.processing = new Map();
    this.results = new Map();
  }

  async processBatch(urls, config = {}) {
    console.log(`📦 Starting batch processing of ${urls.length} videos`);
    console.log(`⚙️ Concurrency: ${this.concurrency}, Retry attempts: ${this.retryAttempts}`);

    // Add all URLs to queue
    this.queue = urls.map(url => ({ url, config, attempts: 0 }));

    // Process with concurrency control
    const workers = Array(this.concurrency).fill().map(() => this.processWorker());
    
    // Wait for all workers to complete
    await Promise.all(workers);

    // Return results
    const results = {
      successful: [],
      failed: [],
      total: urls.length
    };

    for (const [url, result] of this.results.entries()) {
      if (result.success) {
        results.successful.push({ url, data: result.data });
      } else {
        results.failed.push({ url, error: result.error });
      }
    }

    console.log(`✅ Batch complete: ${results.successful.length} successful, ${results.failed.length} failed`);
    return results;
  }

  async processWorker() {
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      try {
        console.log(`🔄 Processing: ${job.url}`);
        this.processing.set(job.url, Date.now());

        const result = await this.processWithRetry(job);
        this.results.set(job.url, { success: true, data: result });
        
        console.log(`✅ Completed: ${job.url}`);
      } catch (error) {
        console.error(`❌ Failed: ${job.url} - ${error.message}`);
        this.results.set(job.url, { success: false, error: error.message });
      } finally {
        this.processing.delete(job.url);
      }

      // Add delay between jobs to respect rate limits
      await this.delay(2000);
    }
  }

  async processWithRetry(job) {
    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        return await this.workflow.processVideo(job.url, job.config);
      } catch (error) {
        if (attempt === this.retryAttempts) {
          throw error;
        }
        
        console.log(`⚠️ Attempt ${attempt + 1} failed for ${job.url}, retrying in ${this.retryDelay}ms...`);
        await this.delay(this.retryDelay * Math.pow(2, attempt)); // Exponential backoff
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getProgress() {
    const total = this.results.size + this.processing.size + this.queue.length;
    const completed = this.results.size;
    const processing = this.processing.size;
    const queued = this.queue.length;

    return { total, completed, processing, queued };
  }
}

// Usage
async function batchProcessVideos() {
  const urls = [
    'https://www.youtube.com/watch?v=video1',
    'https://www.youtube.com/watch?v=video2',
    'https://www.tiktok.com/@user/video/123',
    // ... more URLs
  ];

  const processor = new BatchImportProcessor({
    concurrency: 2,
    retryAttempts: 3
  });

  const results = await processor.processBatch(urls, {
    optimizeSegments: true,
    config: {
      segmentDetection: { method: 'scene-change' }
    }
  });

  console.log('Batch Results:', results);
}
```

## Error Handling Strategies

### Comprehensive Error Handler

```javascript
class ImportErrorHandler {
  static handle(error, context = {}) {
    const errorType = this.classifyError(error);
    
    console.error(`Error in ${context.operation || 'unknown operation'}:`, {
      type: errorType,
      message: error.message,
      context
    });

    switch (errorType) {
      case 'network':
        return this.handleNetworkError(error, context);
      case 'ratelimit':
        return this.handleRateLimitError(error, context);
      case 'validation':
        return this.handleValidationError(error, context);
      case 'server':
        return this.handleServerError(error, context);
      case 'timeout':
        return this.handleTimeoutError(error, context);
      default:
        return this.handleUnknownError(error, context);
    }
  }

  static classifyError(error) {
    if (error.message.includes('fetch')) return 'network';
    if (error.message.includes('429') || error.message.includes('rate limit')) return 'ratelimit';
    if (error.message.includes('400') || error.message.includes('validation')) return 'validation';
    if (error.message.includes('500') || error.message.includes('502')) return 'server';
    if (error.message.includes('timeout')) return 'timeout';
    return 'unknown';
  }

  static async handleNetworkError(error, context) {
    console.log('🌐 Network error detected, implementing retry logic...');
    
    if (context.retryCount && context.retryCount > 3) {
      throw new Error('Max network retries exceeded');
    }

    const delay = Math.min(1000 * Math.pow(2, context.retryCount || 0), 30000);
    console.log(`⏳ Retrying in ${delay}ms...`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return 'retry';
  }

  static async handleRateLimitError(error, context) {
    console.log('🚦 Rate limit detected, waiting before retry...');
    
    // Extract retry-after header if available
    const retryAfter = context.retryAfter || 60; // Default 60 seconds
    console.log(`⏳ Waiting ${retryAfter} seconds before retry...`);
    
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return 'retry';
  }

  static handleValidationError(error, context) {
    console.error('📋 Validation error - check your request parameters');
    throw new Error(`Validation failed: ${error.message}`);
  }

  static async handleServerError(error, context) {
    console.log('🔧 Server error detected...');
    
    if (context.retryCount && context.retryCount > 2) {
      throw new Error('Max server error retries exceeded');
    }

    const delay = 5000; // Fixed delay for server errors
    console.log(`⏳ Retrying in ${delay}ms...`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return 'retry';
  }

  static handleTimeoutError(error, context) {
    console.error('⏰ Operation timed out');
    throw new Error('Operation timed out - try reducing the scope or check server status');
  }

  static handleUnknownError(error, context) {
    console.error('❓ Unknown error type');
    throw error;
  }
}

// Usage with retry wrapper
async function withRetry(operation, context = {}, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      const action = await ImportErrorHandler.handle(error, {
        ...context,
        retryCount: attempt,
        operation: context.operation || 'unknown'
      });
      
      if (action !== 'retry' || attempt === maxRetries) {
        break;
      }
    }
  }
  
  throw lastError;
}
```

## Performance Optimization

### Optimized Import Configuration

```javascript
const PERFORMANCE_CONFIGS = {
  // Fast processing - minimal analysis
  fast: {
    segmentDetection: {
      method: 'fixed-duration',
      duration: 30
    },
    contentAnalysis: {
      extractKeywords: false,
      generateSummary: false,
      detectHighlights: false
    },
    translation: {
      enabled: false
    }
  },

  // Balanced - good quality with reasonable speed
  balanced: {
    segmentDetection: {
      method: 'scene-change',
      threshold: 0.4
    },
    contentAnalysis: {
      extractKeywords: true,
      generateSummary: false,
      detectHighlights: true
    },
    translation: {
      enabled: false
    }
  },

  // High quality - full analysis (slower)
  quality: {
    segmentDetection: {
      method: 'ai-analysis',
      threshold: 0.7
    },
    contentAnalysis: {
      extractKeywords: true,
      generateSummary: true,
      detectHighlights: true
    },
    translation: {
      enabled: true
    }
  }
};

function getOptimalConfig(videoInfo) {
  const duration = videoInfo.duration;
  
  if (duration < 300) { // < 5 minutes
    return PERFORMANCE_CONFIGS.quality;
  } else if (duration < 1800) { // < 30 minutes
    return PERFORMANCE_CONFIGS.balanced;
  } else {
    return PERFORMANCE_CONFIGS.fast;
  }
}
```

### Connection Pooling and Caching

```javascript
class OptimizedImportClient {
  constructor() {
    this.cache = new Map();
    this.connectionPool = new Map();
    this.analysisCache = new LRUCache(100); // Cache up to 100 analyses
  }

  async analyzeWithCache(url) {
    const cacheKey = this.getCacheKey(url);
    
    if (this.analysisCache.has(cacheKey)) {
      console.log('📋 Using cached analysis');
      return this.analysisCache.get(cacheKey);
    }

    const analysis = await this.analyze(url);
    this.analysisCache.set(cacheKey, analysis);
    
    return analysis;
  }

  getCacheKey(url) {
    return Buffer.from(url).toString('base64').substring(0, 32);
  }

  async preloadAnalysis(urls) {
    console.log(`🔄 Preloading analysis for ${urls.length} videos...`);
    
    const promises = urls.map(async (url) => {
      try {
        await this.analyzeWithCache(url);
      } catch (error) {
        console.warn(`Failed to preload analysis for ${url}:`, error.message);
      }
    });

    await Promise.allSettled(promises);
    console.log('✅ Analysis preloading complete');
  }
}
```

## Rate Limiting Best Practices

### Intelligent Rate Limiter

```javascript
class SmartRateLimiter {
  constructor(options = {}) {
    this.limits = {
      import: { requests: 10, window: 3600000 }, // 10 per hour
      analysis: { requests: 100, window: 3600000 }, // 100 per hour
      translation: { requests: 200, window: 3600000 } // 200 per hour
    };
    
    this.windows = new Map();
    this.queue = [];
    this.processing = false;
  }

  async throttledRequest(type, requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ type, requestFn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;

    while (this.queue.length > 0) {
      const { type, requestFn, resolve, reject } = this.queue.shift();
      
      if (this.canMakeRequest(type)) {
        try {
          this.recordRequest(type);
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          if (error.message.includes('429')) {
            // Re-queue on rate limit
            this.queue.unshift({ type, requestFn, resolve, reject });
            await this.delay(this.getBackoffDelay(type));
          } else {
            reject(error);
          }
        }
      } else {
        const waitTime = this.getWaitTime(type);
        console.log(`🚦 Rate limit reached for ${type}, waiting ${waitTime}ms`);
        await this.delay(waitTime);
        this.queue.unshift({ type, requestFn, resolve, reject });
      }
    }

    this.processing = false;
  }

  canMakeRequest(type) {
    const window = this.windows.get(type) || { requests: 0, resetTime: Date.now() + this.limits[type].window };
    
    if (Date.now() > window.resetTime) {
      // Reset window
      this.windows.set(type, { requests: 0, resetTime: Date.now() + this.limits[type].window });
      return true;
    }

    return window.requests < this.limits[type].requests;
  }

  recordRequest(type) {
    const window = this.windows.get(type) || { requests: 0, resetTime: Date.now() + this.limits[type].window };
    window.requests++;
    this.windows.set(type, window);
  }

  getWaitTime(type) {
    const window = this.windows.get(type);
    return window ? Math.max(0, window.resetTime - Date.now()) : 0;
  }

  getBackoffDelay(type) {
    return Math.min(300000, 5000 * Math.random() * 2); // Random delay up to 5 minutes
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage
const rateLimiter = new SmartRateLimiter();

async function rateLimitedImport(url) {
  return rateLimiter.throttledRequest('import', async () => {
    const response = await fetch('/api/import/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return response.json();
  });
}
```

## Production Ready Code

### Complete Production Client

```javascript
import { EventEmitter } from 'events';

class ProductionImportClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.baseUrl = options.baseUrl || 'http://localhost:3233';
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    
    this.socket = null;
    this.activeJobs = new Map();
    this.rateLimiter = new SmartRateLimiter();
    
    this.setupHealthCheck();
  }

  async healthCheck() {
    try {
      const response = await this.request('/health', { method: 'GET' });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async setupHealthCheck() {
    setInterval(async () => {
      const healthy = await this.healthCheck();
      if (!healthy) {
        this.emit('service-unavailable');
        console.warn('⚠️ Import service appears to be unavailable');
      }
    }, 60000); // Check every minute
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config = {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
      },
      ...options
    };

    // Add timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    config.signal = controller.signal;

    try {
      const response = await fetch(url, config);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async importVideo(url, options = {}) {
    this.emit('import-started', { url });
    
    try {
      // Step 1: Analyze
      this.emit('import-progress', { step: 'analyzing', progress: 10 });
      const analysis = await this.analyzeVideo(url);
      
      // Step 2: Start import
      this.emit('import-progress', { step: 'starting', progress: 20 });
      const jobId = await this.startImport(url, options.config);
      
      // Step 3: Monitor
      this.emit('import-progress', { step: 'monitoring', progress: 30 });
      const result = await this.monitorImport(jobId, {
        timeout: options.timeout || 1800000,
        onProgress: (data) => {
          this.emit('import-progress', {
            step: 'processing',
            progress: 30 + (data.progress * 0.6), // Scale to 30-90%
            details: data
          });
        }
      });

      // Step 4: Post-process
      this.emit('import-progress', { step: 'finalizing', progress: 95 });
      const segments = await this.getSegments(jobId);
      
      this.emit('import-complete', { 
        jobId, 
        analysis, 
        segments: segments.segments,
        result 
      });

      return { jobId, analysis, segments: segments.segments, result };

    } catch (error) {
      this.emit('import-error', { url, error: error.message });
      throw error;
    }
  }

  async analyzeVideo(url) {
    return this.rateLimiter.throttledRequest('analysis', async () => {
      const response = await this.request('/api/import/analyze', {
        method: 'POST',
        body: JSON.stringify({ url })
      });
      return response.json();
    });
  }

  async startImport(url, config) {
    return this.rateLimiter.throttledRequest('import', async () => {
      const response = await this.request('/api/import/process', {
        method: 'POST',
        body: JSON.stringify({ url, config })
      });
      const { jobId } = await response.json();
      return jobId;
    });
  }

  // ... other methods similar to previous examples
  
  // Graceful shutdown
  async shutdown() {
    console.log('🔄 Shutting down import client...');
    
    // Cancel all active jobs
    for (const [jobId] of this.activeJobs) {
      this.unsubscribeFromJob(jobId);
    }
    
    // Disconnect WebSocket
    if (this.socket) {
      this.socket.disconnect();
    }
    
    // Clear any timers
    this.removeAllListeners();
    
    console.log('✅ Import client shutdown complete');
  }
}

// Usage with proper error handling and cleanup
async function productionExample() {
  const client = new ProductionImportClient({
    baseUrl: process.env.IMPORT_API_URL,
    apiKey: process.env.IMPORT_API_KEY,
    timeout: 60000,
    retryAttempts: 3
  });

  // Set up event listeners
  client.on('import-progress', (data) => {
    console.log(`Progress: ${data.progress}% - ${data.step}`);
  });

  client.on('import-error', (data) => {
    console.error(`Import failed for ${data.url}:`, data.error);
  });

  client.on('service-unavailable', () => {
    console.warn('Import service is unavailable - consider implementing fallback');
  });

  // Graceful shutdown on process exit
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await client.shutdown();
    process.exit(0);
  });

  try {
    const result = await client.importVideo(
      'https://www.youtube.com/watch?v=example',
      {
        config: getOptimalConfig({ duration: 300 }),
        timeout: 1800000 // 30 minutes
      }
    );

    console.log('✅ Import successful:', result.jobId);
    return result;
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    throw error;
  }
}
```

## Testing Strategies

### Unit Test Example

```javascript
// tests/import-client.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VideoImportWorkflow } from '../src/VideoImportWorkflow';

describe('VideoImportWorkflow', () => {
  let workflow;
  let mockFetch;

  beforeEach(() => {
    workflow = new VideoImportWorkflow('http://test-server');
    
    // Mock fetch
    global.fetch = mockFetch = vi.fn();
  });

  afterEach(() => {
    workflow.disconnect();
    vi.restoreAllMocks();
  });

  it('should analyze video successfully', async () => {
    const mockResponse = {
      success: true,
      metadata: {
        title: 'Test Video',
        duration: 120,
        canDownload: true
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const result = await workflow.analyzeAndValidate('http://example.com/video');
    
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-server/api/import/analyze',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('http://example.com/video')
      })
    );

    expect(result.metadata.title).toBe('Test Video');
  });

  it('should handle analysis errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: 'Invalid URL' })
    });

    await expect(workflow.analyzeAndValidate('invalid-url'))
      .rejects.toThrow('400: Invalid URL');
  });

  it('should validate video downloadability', async () => {
    const mockResponse = {
      success: true,
      metadata: {
        title: 'Restricted Video',
        duration: 120,
        canDownload: false
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    await expect(workflow.analyzeAndValidate('http://example.com/restricted'))
      .rejects.toThrow('Video cannot be downloaded from this source');
  });
});
```

### Integration Test Example

```javascript
// tests/integration/import-api.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Import API Integration', () => {
  const BASE_URL = 'http://localhost:3233';
  let testJobId;

  beforeAll(async () => {
    // Wait for server to be ready
    await waitForServer(BASE_URL);
  });

  afterAll(async () => {
    // Cleanup test data
    if (testJobId) {
      // Cancel job if still running
    }
  });

  it('should complete full import workflow', async () => {
    // This test uses a known test video
    const testUrl = 'https://sample-videos.com/zip/10/mp4/SampleVideo_360x240_1mb.mp4';

    // Step 1: Analyze
    const analyzeResponse = await fetch(`${BASE_URL}/api/import/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: testUrl })
    });

    expect(analyzeResponse.ok).toBe(true);
    const analysis = await analyzeResponse.json();
    expect(analysis.success).toBe(true);
    expect(analysis.metadata.canDownload).toBe(true);

    // Step 2: Start import
    const importResponse = await fetch(`${BASE_URL}/api/import/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: testUrl,
        config: {
          segmentDetection: { method: 'fixed-duration', duration: 10 }
        }
      })
    });

    expect(importResponse.ok).toBe(true);
    const { jobId } = await importResponse.json();
    testJobId = jobId;
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/); // UUID format

    // Step 3: Monitor progress
    await waitForImportCompletion(jobId, 120000); // 2 minutes timeout

    // Step 4: Verify segments
    const segmentsResponse = await fetch(`${BASE_URL}/api/import/${jobId}/segments`);
    expect(segmentsResponse.ok).toBe(true);
    
    const segments = await segmentsResponse.json();
    expect(segments.segments).toBeInstanceOf(Array);
    expect(segments.segments.length).toBeGreaterThan(0);

  }, 180000); // 3 minute timeout for full test

  async function waitForServer(url, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const response = await fetch(`${url}/health`);
        if (response.ok) return;
      } catch (e) {
        // Continue waiting
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Server did not start within timeout');
  }

  async function waitForImportCompletion(jobId, timeout = 60000) {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      const response = await fetch(`${BASE_URL}/api/import/${jobId}/status`);
      const status = await response.json();
      
      if (status.status === 'completed') {
        return status;
      } else if (status.status === 'failed') {
        throw new Error(`Import failed: ${status.error}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error('Import did not complete within timeout');
  }
});
```

## Monitoring and Observability

### Comprehensive Monitoring Setup

```javascript
class ImportMonitor {
  constructor(options = {}) {
    this.metrics = new Map();
    this.events = [];
    this.maxEvents = options.maxEvents || 1000;
  }

  recordEvent(type, data) {
    const event = {
      type,
      timestamp: Date.now(),
      data
    };
    
    this.events.unshift(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }
    
    this.updateMetrics(type, data);
  }

  updateMetrics(type, data) {
    const metric = this.metrics.get(type) || {
      count: 0,
      totalDuration: 0,
      errors: 0,
      lastOccurrence: null
    };
    
    metric.count++;
    metric.lastOccurrence = Date.now();
    
    if (data.duration) {
      metric.totalDuration += data.duration;
      metric.avgDuration = metric.totalDuration / metric.count;
    }
    
    if (data.error) {
      metric.errors++;
      metric.errorRate = metric.errors / metric.count;
    }
    
    this.metrics.set(type, metric);
  }

  getMetrics() {
    const summary = {};
    
    for (const [type, metric] of this.metrics) {
      summary[type] = {
        ...metric,
        successRate: ((metric.count - metric.errors) / metric.count) || 0
      };
    }
    
    return summary;
  }

  getHealthStatus() {
    const metrics = this.getMetrics();
    const recentErrors = this.events
      .filter(e => e.timestamp > Date.now() - 300000) // Last 5 minutes
      .filter(e => e.data.error);
    
    return {
      status: recentErrors.length > 10 ? 'unhealthy' : 'healthy',
      errorCount: recentErrors.length,
      metrics
    };
  }

  generateReport() {
    const metrics = this.getMetrics();
    const health = this.getHealthStatus();
    
    return {
      timestamp: new Date().toISOString(),
      health: health.status,
      summary: {
        totalOperations: Object.values(metrics).reduce((sum, m) => sum + m.count, 0),
        totalErrors: Object.values(metrics).reduce((sum, m) => sum + m.errors, 0),
        avgSuccessRate: Object.values(metrics).reduce((sum, m) => sum + m.successRate, 0) / Object.keys(metrics).length || 0
      },
      details: metrics,
      recentEvents: this.events.slice(0, 50) // Last 50 events
    };
  }
}

// Usage with workflow
const monitor = new ImportMonitor();

// Wrap methods with monitoring
const monitoredWorkflow = new Proxy(new VideoImportWorkflow(), {
  get(target, prop) {
    const original = target[prop];
    
    if (typeof original === 'function' && prop.includes('analyze' || 'import' || 'process')) {
      return async function(...args) {
        const start = Date.now();
        const operationId = `${prop}-${Date.now()}`;
        
        monitor.recordEvent('operation-started', { operation: prop, operationId });
        
        try {
          const result = await original.apply(target, args);
          const duration = Date.now() - start;
          
          monitor.recordEvent('operation-completed', {
            operation: prop,
            operationId,
            duration,
            success: true
          });
          
          return result;
        } catch (error) {
          const duration = Date.now() - start;
          
          monitor.recordEvent('operation-failed', {
            operation: prop,
            operationId,
            duration,
            error: error.message,
            success: false
          });
          
          throw error;
        }
      };
    }
    
    return original;
  }
});

// Generate periodic reports
setInterval(() => {
  const report = monitor.generateReport();
  console.log('📊 Import API Health Report:', JSON.stringify(report, null, 2));
  
  // Send to monitoring system (e.g., Datadog, Prometheus)
  // sendToMonitoring(report);
}, 300000); // Every 5 minutes
```

This comprehensive guide provides production-ready examples and best practices for using the Short Video Maker Import API effectively, with proper error handling, performance optimization, and monitoring capabilities.