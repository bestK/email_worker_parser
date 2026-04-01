import test from 'node:test';
import assert from 'node:assert/strict';

async function loadModule() {
  try {
    return await import('../src/timezone.js');
  } catch {
    return null;
  }
}

test('resolveEffectiveTimeZone prefers explicit query timezone over Cloudflare timezone', async () => {
  const mod = await loadModule();

  assert.equal(typeof mod?.resolveEffectiveTimeZone, 'function');
  assert.equal(
    mod.resolveEffectiveTimeZone('Asia/Tokyo', 'Asia/Shanghai'),
    'Asia/Tokyo'
  );
});

test('resolveEffectiveTimeZone falls back to Cloudflare timezone when query is missing', async () => {
  const mod = await loadModule();

  assert.equal(typeof mod?.resolveEffectiveTimeZone, 'function');
  assert.equal(
    mod.resolveEffectiveTimeZone(null, 'Asia/Shanghai'),
    'Asia/Shanghai'
  );
});

test('resolveEffectiveTimeZone falls back to UTC when no valid timezone is available', async () => {
  const mod = await loadModule();

  assert.equal(typeof mod?.resolveEffectiveTimeZone, 'function');
  assert.equal(
    mod.resolveEffectiveTimeZone(null, null),
    'UTC'
  );
  assert.equal(
    mod.resolveEffectiveTimeZone('Bad/Timezone', 'Also/Bad'),
    'UTC'
  );
});
