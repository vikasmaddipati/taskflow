import { ZodError } from 'zod';

/**
 * Express middleware factory for validating request components using Zod schemas.
 * Safely mutates req.query and req.params in place to maintain Express 5 getter compatibility.
 *
 * @param {Object} schemas
 * @param {import('zod').ZodSchema} [schemas.body] - Schema for req.body
 * @param {import('zod').ZodSchema} [schemas.query] - Schema for req.query
 * @param {import('zod').ZodSchema} [schemas.params] - Schema for req.params
 */
export const validate = (schemas) => {
  return async (req, res, next) => {
    try {
      if (schemas.params && req.params) {
        const parsedParams = await schemas.params.parseAsync(req.params);
        for (const k of Object.keys(req.params)) {
          delete req.params[k];
        }
        Object.assign(req.params, parsedParams);
      }

      if (schemas.query && req.query) {
        const parsedQuery = await schemas.query.parseAsync(req.query);
        for (const k of Object.keys(req.query)) {
          delete req.query[k];
        }
        Object.assign(req.query, parsedQuery);
      }

      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

export default validate;
