import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { ResponseFormatter } from '../utils/ResponseFormatter';
import { logger } from '../../logger';

/**
 * Global error handler middleware
 * This should be the last middleware in the chain
 */
export const globalErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  // Log the error with request context
  logErrorWithContext(error, req);

  // Handle different types of errors
  if (error instanceof AppError) {
    ResponseFormatter.error(res, error);
  } else if (error.name === 'ValidationError') {
    // Handle Joi or other validation errors
    ResponseFormatter.validationError(res, error.message);
  } else if (error.name === 'CastError') {
    // Handle invalid ObjectId or similar casting errors
    ResponseFormatter.error(res, new AppError('Invalid ID format', 400, 'INVALID_ID'));
  } else if (error.name === 'JsonWebTokenError') {
    ResponseFormatter.unauthorized(res, 'Invalid token');
  } else if (error.name === 'TokenExpiredError') {
    ResponseFormatter.unauthorized(res, 'Token expired');
  } else if (error.name === 'MulterError') {
    // Handle file upload errors
    handleMulterError(error, res);
  } else if (error.name === 'SyntaxError' && 'body' in error) {
    // Handle JSON parsing errors
    ResponseFormatter.error(res, new AppError('Invalid JSON format', 400, 'INVALID_JSON'));
  } else {
    // Handle unknown errors
    ResponseFormatter.error(res, new AppError(
      process.env.NODE_ENV === 'production' 
        ? 'Something went wrong!' 
        : error.message,
      500,
      'INTERNAL_SERVER_ERROR'
    ));
  }
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors and pass them to the error handler
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 * Should be placed after all routes but before the global error handler
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
};

/**
 * Handle Multer (file upload) errors
 */
function handleMulterError(error: any, res: Response): void {
  let message: string;
  let code: string;

  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      message = 'File too large';
      code = 'FILE_TOO_LARGE';
      break;
    case 'LIMIT_FILE_COUNT':
      message = 'Too many files';
      code = 'TOO_MANY_FILES';
      break;
    case 'LIMIT_UNEXPECTED_FILE':
      message = 'Unexpected file field';
      code = 'UNEXPECTED_FILE';
      break;
    default:
      message = 'File upload error';
      code = 'FILE_UPLOAD_ERROR';
  }

  ResponseFormatter.error(res, new AppError(message, 400, code));
}

/**
 * Log error with request context
 */
function logErrorWithContext(error: Error, req: Request): void {
  const context = {
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString(),
  };

  if (error instanceof AppError) {
    const logLevel = error.statusCode >= 500 ? 'error' : 'warn';
    logger[logLevel]({
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        isOperational: error.isOperational,
        stack: error.stack,
      },
      request: context,
    }, 'Application error with request context');
  } else {
    logger.error({
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      request: context,
    }, 'Unhandled error with request context');
  }
}

/**
 * Process exit handler for uncaught exceptions
 */
export const uncaughtExceptionHandler = (error: Error): void => {
  logger.fatal({
    error: {
      message: error.message,
      stack: error.stack,
    },
  }, 'Uncaught Exception! Shutting down...');
  
  process.exit(1);
};

/**
 * Process exit handler for unhandled rejections
 */
export const unhandledRejectionHandler = (reason: unknown, promise: Promise<unknown>): void => {
  logger.fatal({
    error: {
      reason,
      promise: promise.toString(),
    },
  }, 'Unhandled Rejection! Shutting down...');
  
  process.exit(1);
};

/**
 * Graceful shutdown handler
 */
export const gracefulShutdownHandler = (server: any) => {
  return (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    
    server.close(() => {
      logger.info('Process terminated');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };
};