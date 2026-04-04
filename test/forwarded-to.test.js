import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractDuckDuckGoAlias,
  resolveForwardedTo,
} from '../src/forwarded-to.js';

// --- helpers ---

/** Build a base64url-encoded JSON payload like DuckDuckGo embeds in HTML. */
function makeDuckUrl(address) {
  const json = JSON.stringify({ address });
  const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `https://duckduckgo.com/email/addresses/${b64}`;
}

function wrapHtml(url) {
  return `<html><body><p>Manage: <a href="${url}">${url}</a></p></body></html>`;
}

// --- extractDuckDuckGoAlias ---

test('extractDuckDuckGoAlias returns alias from valid DuckDuckGo URL with @', () => {
  const html = wrapHtml(makeDuckUrl('my_alias@duck.com'));
  assert.equal(extractDuckDuckGoAlias(html), 'my_alias@duck.com');
});

test('extractDuckDuckGoAlias appends @duck.com when address has no @', () => {
  const html = wrapHtml(makeDuckUrl('cusp-jot-curtsy'));
  assert.equal(extractDuckDuckGoAlias(html), 'cusp-jot-curtsy@duck.com');
});

test('extractDuckDuckGoAlias lowercases the address', () => {
  const html = wrapHtml(makeDuckUrl('MyAlias@Duck.COM'));
  assert.equal(extractDuckDuckGoAlias(html), 'myalias@duck.com');
});

test('extractDuckDuckGoAlias returns null when no DuckDuckGo URL present', () => {
  assert.equal(extractDuckDuckGoAlias('<html><body>no link</body></html>'), null);
});

test('extractDuckDuckGoAlias returns null for malformed base64 payload', () => {
  const html = '<html><a href="https://duckduckgo.com/email/addresses/!!!invalid!!!">x</a></html>';
  assert.equal(extractDuckDuckGoAlias(html), null);
});

test('extractDuckDuckGoAlias returns null when JSON has no address field', () => {
  const json = JSON.stringify({ foo: 'bar' });
  const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const html = wrapHtml(`https://duckduckgo.com/email/addresses/${b64}`);
  assert.equal(extractDuckDuckGoAlias(html), null);
});

test('extractDuckDuckGoAlias returns null when address is empty string', () => {
  const json = JSON.stringify({ address: '' });
  const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const html = wrapHtml(`https://duckduckgo.com/email/addresses/${b64}`);
  assert.equal(extractDuckDuckGoAlias(html), null);
});

// --- resolveForwardedTo ---

test('resolveForwardedTo prefers X-Forwarded-To header', () => {
  const headers = [{ key: 'X-Forwarded-To', value: 'header@example.com' }];
  const html = wrapHtml(makeDuckUrl('duck@duck.com'));
  assert.equal(resolveForwardedTo(headers, html), 'header@example.com');
});

test('resolveForwardedTo is case-insensitive on header key', () => {
  const headers = [{ key: 'x-forwarded-to', value: 'lower@example.com' }];
  assert.equal(resolveForwardedTo(headers, null), 'lower@example.com');
});

test('resolveForwardedTo falls back to DuckDuckGo HTML parsing', () => {
  const html = wrapHtml(makeDuckUrl('fallback@duck.com'));
  assert.equal(resolveForwardedTo([], html), 'fallback@duck.com');
});

test('resolveForwardedTo fallback appends @duck.com for bare alias', () => {
  const html = wrapHtml(makeDuckUrl('thread-sheep-storm'));
  assert.equal(resolveForwardedTo([], html), 'thread-sheep-storm@duck.com');
});

test('resolveForwardedTo returns null when no header and no html', () => {
  assert.equal(resolveForwardedTo([], null), null);
});

test('resolveForwardedTo returns null when no header and html has no duck link', () => {
  assert.equal(resolveForwardedTo([], '<html>plain</html>'), null);
});
