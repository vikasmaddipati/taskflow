/**
 * NoSQL Injection & Prototype Pollution Sanitization Middleware
 *
 * In Express 5, req.query is a getter. Sanitization is performed in-place
 * by deleting forbidden keys ($ operators, dots, prototype keys) recursively.
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively strips keys starting with '$' or containing '.', or prototype pollution keys.
 * Operates in-place on objects and arrays.
 *
 * @param {any} target
 */
export const sanitizeInPlace = (target) => {
  if (!target || typeof target !== 'object') {
    return;
  }

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      if (typeof target[i] === 'object' && target[i] !== null) {
        sanitizeInPlace(target[i]);
      }
    }
    return;
  }

  for (const key of Object.keys(target)) {
    // Block prototype pollution
    if (FORBIDDEN_KEYS.has(key)) {
      delete target[key];
      continue;
    }

    // Strip keys starting with '$' or containing '.' (MongoDB operators & path traversal)
    if (key.startsWith('$') || key.includes('.')) {
      delete target[key];
      continue;
    }

    if (typeof target[key] === 'object' && target[key] !== null) {
      sanitizeInPlace(target[key]);
    }
  }
};

/**
 * Express middleware to sanitize req.body, req.query, and req.params in-place
 */
export const sanitizeInputs = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    sanitizeInPlace(req.body);
  }

  if (req.query && typeof req.query === 'object') {
    sanitizeInPlace(req.query);
  }

  if (req.params && typeof req.params === 'object') {
    sanitizeInPlace(req.params);
  }

  next();
};

export default sanitizeInputs;
