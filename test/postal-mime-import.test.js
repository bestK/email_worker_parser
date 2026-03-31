import test from 'node:test';
import assert from 'node:assert/strict';

test('vendor postal mime module exposes a constructable default export', async () => {
  const mod = await import('../src/vendor/postal-mime-node.js');
  const PostalMime = mod.default;

  assert.equal(typeof PostalMime, 'function');

  const parser = new PostalMime();
  assert.equal(typeof parser.parse, 'function');
});
