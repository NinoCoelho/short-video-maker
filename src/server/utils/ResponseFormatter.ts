import { Response } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from '../../logger';

/**
 * Standard API response interface
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

/**
 * Pagination metadata interface
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Paginated response interface
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: PaginationMeta;
}

/**
 * Response formatter utility class
 */
export class ResponseFormatter {
  /**
   * Send success response
   */
  static success<T>(
    res: Response,
    data?: T,
    statusCode: number = 200
  ): void {
    const response: ApiResponse<T> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.status(statusCode).json(response);
  }

  /**
   * Send paginated success response
   */
  static successPaginated<T>(
    res: Response,
    data: T[],
    pagination: PaginationMeta,
    statusCode: number = 200
  ): void {
    const response: PaginatedResponse<T> = {
      success: true,
      data,
      pagination,
      timestamp: new Date().toISOString(),
    };

    res.status(statusCode).json(response);
  }

  /**
   * Send error response
   */
  static error(
    res: Response,
    error: Error | AppError,
    statusCode?: number
  ): void {
    // Determine status code
    let httpStatus = statusCode || 500;
    if (error instanceof AppError) {
      httpStatus = error.statusCode;
    }

    // Prepare error response
    const errorResponse: ApiResponse = {
      success: false,
      error: {
        code: error instanceof AppError ? error.code : 'INTERNAL_SERVER_ERROR',
        message: this.sanitizeErrorMessage(error.message),
        ...(process.env.NODE_ENV === 'development' && {
          details: error instanceof AppError ? this.getErrorDetails(error) : undefined,
        }),
      },
      timestamp: new Date().toISOString(),
    };

    // Log error for monitoring
    this.logError(error, httpStatus);

    res.status(httpStatus).json(errorResponse);
  }

  /**
   * Send validation error response
   */
  static validationError(
    res: Response,
    message: string,
    validationErrors?: Record<string, string[]>
  ): void {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: message,
        details: validationErrors,
      },
      timestamp: new Date().toISOString(),
    };

    logger.warn({ validationErrors }, 'Validation error occurred');
    res.status(400).json(response);
  }

  /**
   * Send not found response
   */
  static notFound(
    res: Response,
    resource: string,
    identifier?: string
  ): void {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message,
      },
      timestamp: new Date().toISOString(),
    };

    res.status(404).json(response);
  }

  /**
   * Send unauthorized response
   */
  static unauthorized(
    res: Response,
    message: string = 'Authentication required'
  ): void {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'AUTHENTICATION_ERROR',
        message,
      },
      timestamp: new Date().toISOString(),
    };

    res.status(401).json(response);
  }

  /**
   * Send forbidden response
   */
  static forbidden(
    res: Response,
    message: string = 'Access forbidden'
  ): void {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'AUTHORIZATION_ERROR',
        message,
      },
      timestamp: new Date().toISOString(),
    };

    res.status(403).json(response);
  }

  /**
   * Sanitize error messages to remove sensitive information
   */
  private static sanitizeErrorMessage(message: string): string {
    // Remove file paths that might contain sensitive information
    let sanitized = message.replace(/\/[^\s]+/g, '[PATH_REMOVED]');
    
    // Remove potential connection strings or URLs with credentials
    sanitized = sanitized.replace(/[a-zA-Z]+:\/\/[^@\s]+@[^\s]+/g, '[CONNECTION_STRING_REMOVED]');
    
    // Remove potential API keys or tokens
    sanitized = sanitized.replace(/[a-zA-Z0-9_-]{32,}/g, '[TOKEN_REMOVED]');
    
    return sanitized;
  }

  /**
   * Get error details for development mode
   */
  private static getErrorDetails(error: AppError): any {
    const details: any = {
      stack: error.stack,
    };

    // Add specific error details based on error type
    if ('validationErrors' in error) {
      details.validationErrors = (error as any).validationErrors;
    }
    if ('service' in error) {
      details.service = (error as any).service;
    }
    if ('videoId' in error) {
      details.videoId = (error as any).videoId;
    }
    if ('stage' in error) {
      details.stage = (error as any).stage;
    }
    if ('operation' in error) {
      details.operation = (error as any).operation;
    }
    if ('path' in error) {
      details.path = (error as any).path;
    }

    return details;
  }

  /**
   * Log errors for monitoring
   */
  private static logError(error: Error, statusCode: number): void {
    const logLevel = statusCode >= 500 ? 'error' : 'warn';
    
    if (error instanceof AppError) {
      logger[logLevel]({
        error: {
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
          isOperational: error.isOperational,
          stack: error.stack,
        },
      }, 'Application error occurred');
    } else {
      logger.error({
        error: {
          message: error.message,
          stack: error.stack,
        },
      }, 'Unhandled error occurred');
    }
  }
}

/**
 * Helper function to create pagination metadata
 */
export function createPaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}