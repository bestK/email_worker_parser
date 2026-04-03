import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEmailDomains,
  pickEmailDomain,
  createInboxAddress,
} from '../src/email-domain.js';

test('normalizeEmailDomains splits comma-separated domains and trims whitespace', () => {
  assert.deepEqual(
    normalizeEmailDomains('  a.com, b.com ,, c.com  '),
    ['a.com', 'b.com', 'c.com']
  );
});

test('pickEmailDomain returns requested domain when it exists', () => {
  assert.equal(
    pickEmailDomain(['a.com', 'b.com'], 'b.com'),
    'b.com'
  );
});

test('pickEmailDomain falls back to a random domain when request is missing', () => {
  const domains = ['a.com', 'b.com'];
  const result = pickEmailDomain(domains, null);
  assert.ok(domains.includes(result), `expected one of ${domains}, got ${result}`);
});

test('pickEmailDomain rejects a requested domain outside configuration', () => {
  assert.throws(
    () => pickEmailDomain(['a.com', 'b.com'], 'c.com'),
    /not allowed/i
  );
});

test('pickEmailDomain matches wildcard labels one-to-one', () => {
  assert.equal(
    pickEmailDomain(['*.*.domain.com'], 'a.b.domain.com'),
    'a.b.domain.com'
  );
});

test('pickEmailDomain matches common single-label wildcard domains', () => {
  assert.equal(
    pickEmailDomain(['*.domain.com'], 'api.domain.com'),
    'api.domain.com'
  );
});

test('pickEmailDomain rejects common wildcard domains with too many labels', () => {
  assert.throws(
    () => pickEmailDomain(['*.domain.com'], 'a.b.domain.com'),
    /not allowed/i
  );
});

test('pickEmailDomain rejects wildcard matches with too many labels', () => {
  assert.throws(
    () => pickEmailDomain(['*.*.domain.com'], 'a.b.c.domain.com'),
    /not allowed/i
  );
});

test('pickEmailDomain rejects wildcard matches with too few labels', () => {
  assert.throws(
    () => pickEmailDomain(['*.*.domain.com'], 'b.domain.com'),
    /not allowed/i
  );
});

test('createInboxAddress uses requested domain in generated address', () => {
  const address = createInboxAddress(['a.com', 'b.com'], {
    requestedDomain: 'b.com',
    randomPart: 'abc123',
  });

  assert.equal(address, 'abc123@b.com');
});

test('createInboxAddress uses a configured domain by default', () => {
  const domains = ['a.com', 'b.com'];
  const address = createInboxAddress(domains, {
    randomPart: 'abc123',
  });

  assert.ok(
    domains.some((d) => address === `abc123@${d}`),
    `expected abc123@<one of ${domains}>, got ${address}`
  );
});

test('createInboxAddress prefers exact domains when wildcard domains are also configured', () => {
  const address = createInboxAddress(['*.domain.com', 'fixed.com'], {
    randomPart: 'abc123',
  });

  assert.equal(address, 'abc123@fixed.com');
});

test('createInboxAddress rejects wildcard-only configuration without requested domain', () => {
  assert.throws(
    () => createInboxAddress(['*.domain.com'], { randomPart: 'abc123' }),
    /requested domain is required/i
  );
});
