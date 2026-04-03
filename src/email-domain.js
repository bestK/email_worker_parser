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
 * @param {string} pattern
 * @returns {boolean}
 */
export function isWildcardDomainPattern(pattern) {
  return String(pattern || '').includes('*');
}

/**
 * @param {string} pattern
 * @param {string} domain
 * @returns {boolean}
 */
export function matchesDomainPattern(pattern, domain) {
  const patternLabels = String(pattern || '').trim().toLowerCase().split('.').filter(Boolean);
  const domainLabels = String(domain || '').trim().toLowerCase().split('.').filter(Boolean);

  if (patternLabels.length !== domainLabels.length) {
    return false;
  }

  return patternLabels.every((label, index) => label === '*' || label === domainLabels[index]);
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
    const matched = domains.find((domain) => matchesDomainPattern(domain, normalizedRequested));
    if (!matched) {
      throw new Error(`Requested domain is not allowed: ${requestedDomain}`);
    }
    return normalizedRequested;
  }

  const exactDomains = domains.filter((domain) => !isWildcardDomainPattern(domain));
  if (exactDomains.length === 0) {
    throw new Error('A requested domain is required when EMAIL_DOMAIN only contains wildcard patterns');
  }

  const index = Math.floor(Math.random() * exactDomains.length);
  return exactDomains[index];
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
