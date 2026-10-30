import { AppError } from '../utils/AppError.js';
import { ZodError } from 'zod';
import { config } from '../config/env.js';

export const notFound = (req, res, next) => {
  next(new AppError(`Endpoint not found - ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
};

export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected internal error occurred';
  let details = err.details || null;

  // 1. Handle Zod Schema Validation Errors
  if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      rule: issue.code
    }));
  }

  // 2. Handle Mongoose Duplicate Key Error (E11000)
  else if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY_ERROR';
    const keys = Object.keys(err.keyValue || {});
    const meaningfulKey = keys.find((k) => k !== 'organization') || keys[0] || 'resource';
    const duplicateValue = err.keyValue?.[meaningfulKey];
    message = duplicateValue
      ? `A resource with ${meaningfulKey} "${duplicateValue}" already exists`
      : `A resource with that ${meaningfulKey} already exists`;
    details = { keys, keyValue: err.keyValue };
  }

  // 3. Handle Mongoose Schema Validation Errors
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'SCHEMA_VALIDATION_ERROR';
    const errors = Object.values(err.errors || {});
    message = errors.map((e) => e.message).join('; ');
    details = errors.map((e) => ({
      field: e.path,
      message: e.message
    }));
  }

  // 4. Handle Mongoose CastError (Bad ObjectId)
  else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_IDENTIFIER';
    message = `Invalid identifier format for field '${err.path}'`;
    details = { field: err.path, value: err.value };
  }

  // 5. Handle JWT Authentication Errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Authentication token is invalid or malformed';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication session has expired. Please log in again.';
  }

  // 6. Handle SyntaxError (e.g. malformed JSON in request body)
  else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    code = 'MALFORMED_JSON';
    message = 'Malformed JSON syntax in request body';
  }

  // 7. Handle Mongoose Buffer / Connection Timeout Errors
  else if (
    err.name === 'MongooseError' &&
    (err.message?.includes('buffering timed out') || err.message?.includes('buffer timed out'))
  ) {
    statusCode = 503;
    code = 'DATABASE_UNAVAILABLE';
    message = 'Database connection is not configured or offline. Please configure a valid MONGODB_URI (e.g. MongoDB Atlas) in your server .env file.';
  }

  // Ensure non-operational errors don't leak stack traces in production
  const isDev = !config.isProd;
  const isOperational = err.isOperational || statusCode < 500;

  if (!isOperational && config.isProd) {
    message = 'An unexpected internal server error occurred';
    details = null;
  }

  // Set X-API-Version header
  res.setHeader('X-API-Version', '1.0.0');

  res.status(statusCode).json({
    success: false,
    code,
    message,
    error: {
      code,
      message,
      details
    },
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    ...(isDev && { stack: err.stack })
  });
};

export default errorHandler;
