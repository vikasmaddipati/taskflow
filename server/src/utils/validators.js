/**
 * Standards-compliant, production-grade email and input validation utilities.
 */

// Modern, standards-aware RFC 5322 regex supporting unlimited TLD lengths (.engineering, .technology, .museum, etc.), plus-addressing, and subdomains
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates email address against RFC 5322 standards and modern domain guidelines
 * @param {string} email
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
  if (typeof email !== 'string') return false;

  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;

  // Split into local part and domain
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0 || atIndex !== trimmed.lastIndexOf('@')) return false;

  const localPart = trimmed.slice(0, atIndex);
  const domainPart = trimmed.slice(atIndex + 1);

  if (localPart.length > 64 || domainPart.length > 253) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) return false;
  if (domainPart.startsWith('.') || domainPart.endsWith('.') || domainPart.includes('..')) return false;

  // Domain must contain at least one dot and a valid TLD
  const domainParts = domainPart.split('.');
  if (domainParts.length < 2) return false;

  const tld = domainParts[domainParts.length - 1];
  // Modern TLDs can be anywhere between 2 and 63 alphabetical characters
  if (!/^[a-zA-Z]{2,63}$/.test(tld)) return false;

  return EMAIL_REGEX.test(trimmed);
};

/**
 * Safely normalizes an email address (trims whitespace and converts to lowercase)
 * @param {string} email
 * @returns {string}
 */
export const normalizeEmail = (email) => {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
};
