/**
 * Standardized Operational Error Class for TaskFlow
 */
export class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {string} [code='INTERNAL_ERROR'] - Machine-readable error code
   * @param {Array<Object>|Object|null} [details=null] - Structured validation or context details
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  // Common Factory Methods
  static badRequest(message = 'Bad Request', code = 'BAD_REQUEST', details = null) {
    return new AppError(message, 400, code, details);
  }

  static validation(message = 'Validation failed', details = null) {
    return new AppError(message, 400, 'VALIDATION_ERROR', details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(message, 401, code);
  }

  static forbidden(message = 'Permission denied', code = 'PERMISSION_DENIED') {
    return new AppError(message, 403, code);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(message, 404, code);
  }

  static conflict(message = 'Resource already exists or conflict occurred', code = 'CONFLICT') {
    return new AppError(message, 409, code);
  }

  static tooManyRequests(message = 'Too many requests. Please slow down.', code = 'RATE_LIMIT_EXCEEDED') {
    return new AppError(message, 429, code);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable', code = 'SERVICE_UNAVAILABLE') {
    return new AppError(message, 503, code);
  }
}

export default AppError;
