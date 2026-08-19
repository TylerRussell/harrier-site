// Tests for the site checks themselves — specifically the boundary between "warn" and "fail", because
// getting that wrong in either direction is expensive. Too eager and the build reds forever on something
// no commit can fix, and the mail stops being read. Too lax and a real leak ships as a note.
//
//   node --test verify/checks.test.mjs        (no browser needed — these are the pure paths)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeInjection, offOriginRequests, pageErrors } from './checks.mjs';

const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js/v451322';
const stubPage = (scripts) => ({ evaluate: async () => scripts });

test('an injected script that was BLOCKED is a warning, not a failure', async () => {
  const result = await edgeInjection(stubPage([BEACON]), /* nothing completed */ []);
  assert.equal(result.failures.length, 0, 'a blocked injection must not fail the build');
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Web Analytics/);
  assert.match(result.warnings[0], /dash\.cloudflare\.com/, 'a warning must say how to fix it');
});

test('an injected script that actually LOADED is a failure — data left the browser', async () => {
  const result = await edgeInjection(stubPage([BEACON]), [BEACON]);
  assert.equal(result.failures.length, 1, 'a completed injected request must fail the build');
  assert.match(result.failures[0], /actually LOADED/);
});

test('a clean page warns about nothing and fails on nothing', async () => {
  const result = await edgeInjection(stubPage([]), []);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.warnings, []);
});

test('off-origin requests from OUR code still fail', () => {
  const failures = offOriginRequests(['https://evil.example/tracker.js'], 'https://getharrier.com/');
  assert.equal(failures.length, 1);
  assert.match(failures[0], /off-origin request/);
});

test('…but a CDN-injected request is not counted twice', () => {
  // edgeInjection owns this one. Counting it here too would blame the page for the edge's doing, and
  // would make the check unfixable from the repository.
  assert.deepEqual(offOriginRequests([BEACON], 'https://getharrier.com/'), []);
});

test('same-origin requests are never flagged', () => {
  assert.deepEqual(offOriginRequests(['https://getharrier.com/css/base.css'], 'https://getharrier.com/'), []);
});

test('page errors exclude CSP blocks of injected scripts, and keep everything else', () => {
  const errors = [
    "Loading the script 'https://static.cloudflareinsights.com/beacon.min.js' violates ... Content Security Policy",
    'TypeError: window.thing is not a function',
  ];
  const failures = pageErrors(errors);
  assert.equal(failures.length, 1, 'exactly the real error should survive');
  assert.match(failures[0], /TypeError/);
});
