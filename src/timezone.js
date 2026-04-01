/**
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function normalizeTimeZone(raw) {
  if (!raw) return null;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw });
    return raw;
  } catch {
    return null;
  }
}

/**
 * @param {string | null | undefined} requestedTimeZone
 * @param {string | null | undefined} cfTimeZone
 * @returns {string}
 */
export function resolveEffectiveTimeZone(requestedTimeZone, cfTimeZone) {
  return normalizeTimeZone(requestedTimeZone)
    || normalizeTimeZone(cfTimeZone)
    || 'UTC';
}

/**
 * @param {string} timeZone
 * @returns {Intl.DateTimeFormat}
 */
export function createTimeZoneFormatter(timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
}

/**
 * @param {unknown} raw
 * @returns {Date | null}
 */
export function parseUtcTimestamp(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  const date = new Date(withZone);

  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * @param {unknown} raw
 * @param {Intl.DateTimeFormat} formatter
 * @returns {unknown}
 */
export function formatUtcTimestampForTimeZone(raw, formatter) {
  const date = parseUtcTimestamp(raw);
  if (!date) return raw;

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
