import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotFreshness } from '../data-store.mjs';
import { normalizeState, decodeState } from '../model.mjs';
test('Retrieval freshness does not remain current forever', () => {
  const now=Date.parse('2026-10-17T12:00:00Z');
  assert.equal(snapshotFreshness('2026-10-17T10:00:00Z',now),'recent');
  assert.equal(snapshotFreshness('2026-09-01T00:00:00Z',now),'stale');
  assert.equal(snapshotFreshness('invalid',now),'stale');
  assert.equal(snapshotFreshness('2027-01-01T00:00:00Z',now),'stale');
});
test('All provinces and territories survive a shared view', () => {
  for(const province of ['AB','BC','SK','MB','ON','QC','NB','NS','PE','NL','YT','NT','NU']) assert.equal(normalizeState({province}).province,province);
});
test('Oversized shared state cannot allocate an unbounded input', () => {
  assert.equal(decodeState('#v1='+ 'x'.repeat(65537)),null);
});
