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
 * Normalizes user-provided time string into canonical 24-hour HH:mm format.
 * Supports:
 * - 24-hour format: "14:30", "9:30", "09:30", "14:30:00"
 * - 12-hour format: "2:30 PM", "02:30 pm", "9 AM", "9:00 am", "11:45PM"
 * Returns null if input is empty, null, or invalid.
 */
export const normalizeTime = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const raw = timeStr.trim();
  if (!raw) return null;

  // 1. Check for 12-hour format with AM/PM
  const ampmMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2] || '0', 10);
    const meridian = ampmMatch[3].toUpperCase();

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;

    if (meridian === 'AM') {
      if (hours === 12) hours = 0;
    } else {
      if (hours !== 12) hours += 12;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // 2. Check for 24-hour format
  const match24 = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  return null;
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
 * Normalizes a date-only string or ISO timestamp into canonical instant and date string,
 * taking optional dueTime (HH:mm) into account.
 */
export const normalizeDueDate = (input, timeZone = 'UTC', dueTime = null) => {
  if (!input) {
    return { dueDate: null, dueDateString: null, dueTime: null };
  }

  const validTz = getValidTimezone(timeZone);
  const getOffsetMs = (date) => {
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: validTz }));
    return tzDate.getTime() - utcDate.getTime();
  };

  const formattedDueTime = normalizeTime(dueTime);

  // If input is YYYY-MM-DD
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    const dateStr = input.trim();
    if (formattedDueTime) {
      const localEstimate = new Date(`${dateStr}T${formattedDueTime}:00.000Z`);
      const offsetMs = getOffsetMs(localEstimate);
      return {
        dueDate: new Date(localEstimate.getTime() - offsetMs),
        dueDateString: dateStr,
        dueTime: formattedDueTime
      };
    }
    // All-day task: Calculate local end-of-day in the user's timezone converted to UTC instant
    const endLocalEstimate = new Date(`${dateStr}T23:59:59.999Z`);
    const offsetMs = getOffsetMs(endLocalEstimate);
    return {
      dueDate: new Date(endLocalEstimate.getTime() - offsetMs),
      dueDateString: dateStr,
      dueTime: null
    };
  }

  const parsed = new Date(input);
  if (isNaN(parsed.getTime())) {
    return { dueDate: null, dueDateString: null, dueTime: null };
  }

  // Extract date string in user timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: validTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const dateStr = formatter.format(parsed);

  if (formattedDueTime) {
    const localEstimate = new Date(`${dateStr}T${formattedDueTime}:00.000Z`);
    const offsetMs = getOffsetMs(localEstimate);
    return {
      dueDate: new Date(localEstimate.getTime() - offsetMs),
      dueDateString: dateStr,
      dueTime: formattedDueTime
    };
  }

  return {
    dueDate: parsed,
    dueDateString: dateStr,
    dueTime: null
  };
};
