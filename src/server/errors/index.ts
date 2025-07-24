/**
 * Error handling exports
 * Centralized exports for all error handling utilities
 */

// Custom error classes
export {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  ProcessingError,
  ConfigurationError,
  FileOperationError,
} from './AppError';

// Response formatter
export {
  ResponseFormatter,
  createPaginationMeta,
  type ApiResponse,
  type PaginatedResponse,
  type PaginationMeta,
} from '../utils/ResponseFormatter';

// Middleware
export {
  globalErrorHandler,
  asyncHandler,
  notFoundHandler,
  uncaughtExceptionHandler,
  unhandledRejectionHandler,
  gracefulShutdownHandler,
} from '../middleware/errorHandler';