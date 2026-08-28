import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_DOMAINS,
  ACTIVITY_SKILLS,
  validateActivityCatalogs,
} from '../src/modules/activity-performance/catalogs.js';

test('activity performance catalogs include the required initial sets', () => {
  const validation = validateActivityCatalogs();

  assert.equal(validation.ok, true);
  assert.equal(ACTIVITY_DOMAINS.length, 7);
  assert.equal(ACTIVITY_CATEGORIES.length, 16);
  assert.equal(ACTIVITY_SKILLS.length, 24);
});

test('activity categories reference stable domain codes', () => {
  const domainCodes = new Set(ACTIVITY_DOMAINS.map((domain) => domain.codigo));

  for (const category of ACTIVITY_CATEGORIES) {
    assert.equal(domainCodes.has(category.dominioCodigo), true, category.codigo);
  }
});

test('activity catalog codes are unique and business-safe', () => {
  for (const collection of [ACTIVITY_DOMAINS, ACTIVITY_CATEGORIES, ACTIVITY_SKILLS]) {
    const codes = collection.map((item) => item.codigo);
    assert.equal(new Set(codes).size, codes.length);
    assert.equal(codes.every((code) => /^[a-z0-9_]+$/.test(code)), true);
  }
});
