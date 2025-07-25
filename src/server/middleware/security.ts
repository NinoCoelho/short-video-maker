import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import { logger } from '../../logger';
import { VoiceEnum } from '../../types/shorts';

/**
 * Path Traversal Protection Utility
 * Validates file paths to prevent ../ attacks and ensure files are within allowed directories
 */
export class PathTraversalGuard {
  private static readonly allowedDirectories = [
    process.env.DATA_DIR || path.join(process.cwd(), 'data'),
    process.env.TEMP_DIR || path.join(process.cwd(), 'temp'),
    process.env.CACHE_DIR || path.join(process.cwd(), 'cache'),
    path.join(process.cwd(), 'static'),
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'fonts'),
  ];

  /**
   * Validates if a file path is safe and within allowed directories
   * @param filePath - The file path to validate
   * @param allowedDir - Optional specific allowed directory
   * @returns The resolved safe path or throws an error
   */
  static validatePath(filePath: string, allowedDir?: string): string {
    try {
      // Normalize the path to prevent bypasses like double encoding
      const normalizedPath = path.normalize(filePath);
      
      // Resolve to absolute path
      const resolvedPath = path.resolve(normalizedPath);
      
      // Check if path contains suspicious patterns
      if (this.containsSuspiciousPatterns(normalizedPath)) {
        throw new Error('Path contains suspicious patterns');
      }
      
      // Determine allowed directories
      const dirsToCheck = allowedDir ? [path.resolve(allowedDir)] : this.allowedDirectories.map(dir => path.resolve(dir));
      
      // Check if resolved path is within any allowed directory
      const isWithinAllowedDir = dirsToCheck.some(allowedPath => {
        const relative = path.relative(allowedPath, resolvedPath);
        return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
      });
      
      if (!isWithinAllowedDir) {
        throw new Error(`Path '${filePath}' is not within allowed directories`);
      }
      
      return resolvedPath;
    } catch (error) {
      logger.warn({ filePath, error: error instanceof Error ? error.message : 'Unknown error' }, 'Path validation failed');
      throw new Error('Invalid file path');
    }
  }

  /**
   * Check for suspicious patterns in file paths
   */
  private static containsSuspiciousPatterns(filePath: string): boolean {
    const suspiciousPatterns = [
      /\.\./,                    // Parent directory traversal
      /\/\//,                   // Double slashes
      /%2e%2e/i,               // URL encoded dots
      /%2f/i,                  // URL encoded slash
      /\\{2,}/,                // Multiple backslashes
      /\0/,                    // Null bytes
      /[<>"|*?:]/,            // Invalid filename characters
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i // Windows reserved names
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Express middleware for path validation
   */
  static middleware(paramNames: string[] = ['filename', 'id', 'path']) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        for (const paramName of paramNames) {
          const paramValue = req.params[paramName];
          if (paramValue) {
            // Validate the parameter value
            this.validatePath(paramValue);
          }
        }
        next();
      } catch (error) {
        logger.warn({ 
          url: req.url, 
          params: req.params, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }, 'Path traversal attempt blocked');
        
        res.status(400).json({
          error: 'Invalid file path',
          message: 'The requested path contains invalid characters or attempts path traversal'
        });
      }
    };
  }

  /**
   * Validate file exists and is within allowed directory
   */
  static validateFileAccess(filePath: string): boolean {
    try {
      const safePath = this.validatePath(filePath);
      return fs.existsSync(safePath) && fs.statSync(safePath).isFile();
    } catch (error) {
      return false;
    }
  }
}

/**
 * URL Validation for SSRF Protection
 */
export class URLValidator {
  private static readonly allowedDomains = [
    'pixabay.com',
    'api.pixabay.com',
    'pexels.com',
    'api.pexels.com',
    'unsplash.com',
    'api.unsplash.com',
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'api.openai.com',
    'api.anthropic.com',
    'generativelanguage.googleapis.com'
  ];

  private static readonly blockedIPs = [
    '127.0.0.1',
    '0.0.0.0',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '169.254.0.0/16', // Link-local
    'fc00::/7',       // IPv6 private
    '::1'             // IPv6 localhost
  ];

  /**
   * Validates if a URL is safe for external requests
   */
  static validateURL(urlString: string): boolean {
    try {
      const url = new URL(urlString);
      
      // Only allow HTTP and HTTPS
      if (!['http:', 'https:'].includes(url.protocol)) {
        logger.warn({ url: urlString, protocol: url.protocol }, 'Invalid protocol in URL');
        return false;
      }
      
      // Check against allowed domains
      const hostname = url.hostname.toLowerCase();
      const isAllowedDomain = this.allowedDomains.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
      );
      
      if (!isAllowedDomain) {
        logger.warn({ url: urlString, hostname }, 'URL hostname not in allowed domains');
        return false;
      }
      
      // Check for IP addresses in hostname
      if (this.isIPAddress(hostname)) {
        logger.warn({ url: urlString, hostname }, 'Direct IP access not allowed');
        return false;
      }
      
      return true;
    } catch (error) {
      logger.warn({ url: urlString, error: error instanceof Error ? error.message : 'Unknown error' }, 'Invalid URL format');
      return false;
    }
  }

  private static isIPAddress(hostname: string): boolean {
    // Simple IP address detection
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^[0-9a-fA-F:]+$/;
    
    return ipv4Regex.test(hostname) || (hostname.includes(':') && ipv6Regex.test(hostname));
  }

  /**
   * Express middleware for URL validation
   */
  static middleware(bodyFields: string[] = ['url', 'videoUrl', 'audioUrl']) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        for (const field of bodyFields) {
          const url = req.body[field];
          if (url && typeof url === 'string') {
            if (!this.validateURL(url)) {
              return res.status(400).json({
                error: 'Invalid URL',
                message: `URL in field '${field}' is not allowed`,
                field
              });
            }
          }
        }
        
        // Also check query parameters
        for (const [key, value] of Object.entries(req.query)) {
          if (key.toLowerCase().includes('url') && typeof value === 'string') {
            if (!this.validateURL(value)) {
              return res.status(400).json({
                error: 'Invalid URL',
                message: `URL in query parameter '${key}' is not allowed`,
                parameter: key
              });
            }
          }
        }
        
        next();
      } catch (error) {
        logger.error({ error, body: req.body }, 'URL validation error');
        res.status(500).json({
          error: 'URL validation failed',
          message: 'Internal server error during URL validation'
        });
      }
    };
  }
}

/**
 * API Key Validation Middleware
 */
export class APIKeyValidator {
  private static readonly requiredKeys = {
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY,
    deepl: process.env.DEEPL_API_KEY,
    googleCloud: process.env.GOOGLE_CLOUD_API_KEY
  };

  /**
   * Validates if required API keys are present and have correct format
   */
  static validateApiKey(service: keyof typeof APIKeyValidator.requiredKeys): boolean {
    const apiKey = this.requiredKeys[service];
    
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }
    
    // Basic format validation
    switch (service) {
      case 'openai':
        return apiKey.startsWith('sk-') && apiKey.length > 20;
      case 'google':
        return apiKey.length > 30; // Google API keys are typically longer
      case 'deepl':
        return apiKey.endsWith(':fx') || apiKey.length > 20;
      case 'googleCloud':
        return apiKey.length > 30;
      default:
        return apiKey.length > 10;
    }
  }

  /**
   * Middleware to check required API keys for specific services
   */
  static requireApiKeys(services: (keyof typeof APIKeyValidator.requiredKeys)[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      const missingKeys: string[] = [];
      
      for (const service of services) {
        if (!this.validateApiKey(service)) {
          missingKeys.push(service);
        }
      }
      
      if (missingKeys.length > 0) {
        logger.warn({ 
          missingKeys, 
          url: req.url, 
          method: req.method 
        }, 'API keys missing for request');
        
        return res.status(503).json({
          error: 'Service Unavailable',
          message: `Required API keys not configured: ${missingKeys.join(', ')}`,
          missingServices: missingKeys
        });
      }
      
      next();
    };
  }
}


/**
 * Rate Limiting Configuration
 */
export const createRateLimiter = (options: {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
    max: options.maxRequests || 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: 'Too Many Requests',
      message: options.message || 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil((options.windowMs || 15 * 60 * 1000) / 1000)
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/mcp/health';
    },
    handler: (req, res) => {
      logger.warn({
        ip: req.ip,
        url: req.url,
        method: req.method,
        userAgent: req.get('User-Agent')
      }, 'Rate limit exceeded');
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: options.message || 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil((options.windowMs || 15 * 60 * 1000) / 1000)
      });
    }
  });
};

/**
 * Input Validation Schemas
 */
export const validationSchemas = {
  renderRequest: Joi.object({
    id: Joi.string().alphanum().max(50).optional(),
    scenes: Joi.array().items(
      Joi.object({
        text: Joi.string().max(500).required(),
        searchTerms: Joi.array().items(Joi.string().max(50)).max(10).optional(),
        videos: Joi.array().items(Joi.string().uri()).max(5).optional()
      })
    ).min(1).max(10).required(),
    config: Joi.object({
      voice: Joi.string().valid(...Object.values(VoiceEnum)).optional(),
      language: Joi.string().valid('pt', 'en', 'es', 'fr').optional(),
      orientation: Joi.string().valid('portrait', 'landscape').optional(),
      music: Joi.string().optional(), // Dynamic validation handled by DynamicValidation middleware
      referenceAudioPath: Joi.string().max(200).optional()
    }).required()
  }),

  searchQuery: Joi.object({
    query: Joi.string().min(1).max(200).required(),
    count: Joi.number().integer().min(1).max(20).optional(),
    orientation: Joi.string().valid('portrait', 'landscape', 'square').optional()
  }),

  ttsRequest: Joi.object({
    text: Joi.string().min(1).max(1000).required(),
    voice: Joi.string().valid(...Object.values(VoiceEnum)).optional(),
    language: Joi.string().valid('pt', 'en', 'es', 'fr').optional(),
    referenceAudioPath: Joi.string().max(200).optional()
  }),

  videoId: Joi.object({
    id: Joi.string().alphanum().min(1).max(50).required()
  })
};

/**
 * Request validation middleware
 */
export const validateRequest = (schema: Joi.ObjectSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[source];
    const { error, value } = schema.validate(data, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn({ 
        url: req.url, 
        method: req.method, 
        validationErrors: details 
      }, 'Request validation failed');

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Request data validation failed',
        details
      });
    }

    // Replace request data with validated data
    req[source] = value;
    next();
  };
};

/**
 * Request sanitization middleware - removes potentially dangerous fields
 */
export const sanitizeRequest = (req: Request, res: Response, next: NextFunction) => {
  // Remove dangerous fields that could be used for prototype pollution
  const dangerousFields = ['__proto__', 'constructor', 'prototype'];
  
  const sanitizeObject = (obj: any): void => {
    if (obj && typeof obj === 'object') {
      for (const key of dangerousFields) {
        delete obj[key];
      }
      
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          sanitizeObject(value);
        }
      }
    }
  };

  sanitizeObject(req.body);
  sanitizeObject(req.query);
  sanitizeObject(req.params);
  
  next();
};