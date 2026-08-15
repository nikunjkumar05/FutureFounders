import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatTelUri, normalizeIndianPhone } from './phone';

describe('normalizeIndianPhone', () => {
  it('normalizes a clean 10-digit Indian number', () => {
    assert.equal(normalizeIndianPhone('9876543210'), '919876543210');
  });

  it('normalizes a +91-prefixed number', () => {
    assert.equal(normalizeIndianPhone('+919876543210'), '919876543210');
  });

  it('normalizes a +91 number with a space', () => {
    assert.equal(normalizeIndianPhone('+91 9876543210'), '919876543210');
  });

  it('normalizes a 91-prefixed number with a space', () => {
    assert.equal(normalizeIndianPhone('91 9876543210'), '919876543210');
  });

  it('normalizes a 91-prefixed number with a hyphen', () => {
    assert.equal(normalizeIndianPhone('91-9876543210'), '919876543210');
  });

  it('returns the number unchanged when already normalized', () => {
    assert.equal(normalizeIndianPhone('919876543210'), '919876543210');
  });

  it('returns null for short/invalid input', () => {
    assert.equal(normalizeIndianPhone('123'), null);
    assert.equal(normalizeIndianPhone(''), null);
  });

  it('returns null for a number with an unknown country code', () => {
    assert.equal(normalizeIndianPhone('+441234567890'), null);
  });

  it('returns null for non-numeric garbage', () => {
    assert.equal(normalizeIndianPhone('not-a-phone'), null);
  });
});

describe('formatTelUri', () => {
  it('strips spaces, hyphens, parens and dots', () => {
    assert.equal(formatTelUri('+91 (987) 654-3210'), '+919876543210');
  });
});
