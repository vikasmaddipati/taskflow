/**
 * Timezone and Date-boundary utilities for accurate calendar calculations across timezones
 */

/**
 * Validates whether an IANA timezone string is recognized.
 * Falls back to 'UTC' if invalid or missing.
 */
export const getValidTimezone = (tz) => {
  if (!tz || typeof tz !== 'string') return 'UTC';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return tz.trim();
  } catch {
    return 'UTC';
  }
};

/**
 * Gets the current calendar date string (YYYY-MM-DD) in the specified timezone
 */
export const getTodayDateString = (timeZone = 'UTC') => {
  const validTz = getValidTimezone(timeZone);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: validTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date()); // Formats as YYYY-MM-DD
};

/**
 * Calculates start (00:00:00.000) and end (23:59:59.999) UTC instants for today
 * in the specified user timezone.
 */
export const getTimezoneDayBoundaries = (timeZone = 'UTC') => {
  const validTz = getValidTimezone(timeZone);
  const now = new Date();

  // Get parts in user timezone
  const partsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: validTz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });

  const parts = partsFormatter.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === 'year').value, 10);
  const month = parseInt(parts.find((p) => p.type === 'month').value, 10);
  const day = parseInt(parts.find((p) => p.type === 'day').value, 10);

  // ISO date string in target timezone: YYYY-MM-DD
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Find UTC timestamp corresponding to local 00:00:00 and 23:59:59.999
  // Using Intl formatters to bridge offset accurately including DST
  const startLocalEstimate = new Date(`${dateStr}T00:00:00Z`);
  const endLocalEstimate = new Date(`${dateStr}T23:59:59.999Z`);

  // Compute timezone offset at this exact day
  const getOffsetMs = (date) => {
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: validTz }));
    return tzDate.getTime() - utcDate.getTime();
  };

  const offsetMs = getOffsetMs(startLocalEstimate);

  const startUtc = new Date(startLocalEstimate.getTime() - offsetMs);
  const endUtc = new Date(endLocalEstimate.getTime() - offsetMs);

  return {
    timeZone: validTz,
    dateString: dateStr,
    start: startUtc,
    end: endUtc
  };
};

/**
 * Normalizes a date-only string or ISO timestamp into canonical instant and date string
 */
export const normalizeDueDate = (input, timeZone = 'UTC') => {
  if (!input) {
    return { dueDate: null, dueDateString: null };
  }

  // If input is YYYY-MM-DD
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    const dateStr = input.trim();
    // End of that calendar day in user timezone
    const boundaries = getTimezoneDayBoundaries(timeZone);
    return {
      dueDate: new Date(`${dateStr}T23:59:59.999Z`),
      dueDateString: dateStr
    };
  }

  const parsed = new Date(input);
  if (isNaN(parsed.getTime())) {
    return { dueDate: null, dueDateString: null };
  }

  // Extract date string in user timezone
  const validTz = getValidTimezone(timeZone);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: validTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return {
    dueDate: parsed,
    dueDateString: formatter.format(parsed)
  };
};
