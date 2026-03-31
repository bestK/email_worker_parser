/**
 * @param {string | undefined | null} raw
 * @returns {string[]}
 */
export function normalizeEmailDomains(raw) {
  return String(raw || '')
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean);
}

/**
 * @param {string[]} domains
 * @param {string | undefined | null} requestedDomain
 * @returns {string}
 */
export function pickEmailDomain(domains, requestedDomain) {
  if (!Array.isArray(domains) || domains.length === 0) {
    throw new Error('EMAIL_DOMAIN is not configured');
  }

  const normalizedRequested = (requestedDomain || '').trim().toLowerCase();
  if (normalizedRequested) {
    const matched = domains.find((domain) => domain.toLowerCase() === normalizedRequested);
    if (!matched) {
      throw new Error(`Requested domain is not allowed: ${requestedDomain}`);
    }
    return matched;
  }

  const index = Math.floor(Math.random() * domains.length);
  return domains[index];
}

/**
 * @param {string[]} domains
 * @param {{ requestedDomain?: string | null, randomPart?: string }} [options]
 * @returns {string}
 */
export function createInboxAddress(domains, options = {}) {
  const domain = pickEmailDomain(domains, options.requestedDomain);
  const randomPart = options.randomPart
    || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  return `${randomPart}@${domain}`;
}
