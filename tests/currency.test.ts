import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, formatCurrencyForTenant, getCurrencySymbol, resolveDisplayCurrency } from '../main/countries';

test('formatCurrency: en-US / USD', () => {
  assert.equal(formatCurrency(1234.5, 'USD', 'en-US'), '$1,234.50');
});

test('formatCurrency: en-IN / INR has rupees symbol and grouping', () => {
  const out = formatCurrency(1234.5, 'INR', 'en-IN');
  assert.match(out, /1,234\.50/);
  assert.match(out, /₹/);
});

test('formatCurrency: es-AR / ARS uses comma decimal', () => {
  const out = formatCurrency(1234.5, 'ARS', 'es-AR');
  assert.match(out, /1\.234,50/);
});

test('formatCurrency: zero amount still formats', () => {
  assert.equal(formatCurrency(0, 'USD', 'en-US'), '$0.00');
});

test('formatCurrency: empty currency falls back to fixed', () => {
  assert.equal(formatCurrency(1234.5, '', 'en-US'), '1234.50');
});

test('formatCurrencyForTenant: IN tenant uses en-IN locale', () => {
  const out = formatCurrencyForTenant(1234.5, 'IN', 'INR');
  assert.match(out, /1,234\.50/);
  assert.match(out, /₹/);
});

test('formatCurrencyForTenant: AR tenant uses es-AR locale', () => {
  const out = formatCurrencyForTenant(1234.5, 'AR', 'ARS');
  assert.match(out, /1\.234,50/);
});

test('formatCurrencyForTenant: US tenant uses en-US locale', () => {
  assert.equal(formatCurrencyForTenant(1234.5, 'US', 'USD'), '$1,234.50');
});

test('formatCurrencyForTenant: unknown country falls back to en-US', () => {
  assert.equal(formatCurrencyForTenant(7, 'ZZ', 'USD'), '$7.00');
});

test('formatCurrencyForTenant: missing country defaults to IN', () => {
  const out = formatCurrencyForTenant(7, undefined, 'INR');
  assert.match(out, /7\.00/);
  assert.match(out, /₹/);
});

test('resolveDisplayCurrency: KZT tenant stays KZT', () => {
  assert.equal(resolveDisplayCurrency('KZ', 'KZT'), 'KZT');
});

test('resolveDisplayCurrency: leftover INR on a non-India country becomes the country currency', () => {
  assert.equal(resolveDisplayCurrency('KZ', 'INR'), 'KZT');
  assert.equal(resolveDisplayCurrency('US', 'INR'), 'USD');
});

test('resolveDisplayCurrency: empty tenant falls back to KZT, never INR', () => {
  assert.equal(resolveDisplayCurrency(undefined, undefined), 'KZT');
  assert.equal(resolveDisplayCurrency('IN', 'INR'), 'KZT');
  assert.equal(resolveDisplayCurrency(undefined, 'INR'), 'KZT');
});

test('formatCurrency: KZT never renders as Indian rupee', () => {
  for (const locale of ['kk-KZ', 'ru-KZ', 'en-US', 'en-IN']) {
    const out = formatCurrency(1800, 'KZT', locale);
    assert.doesNotMatch(out, /₹/);
    assert.match(out, /₸/);
    assert.match(out, /1[,.\s\u00A0\u202F]?800/);
  }
  assert.equal(getCurrencySymbol('KZT', 'en-US'), '₸');
  assert.equal(getCurrencySymbol('KZT', 'kk-KZ'), '₸');
});

test('formatCurrencyForTenant: Kazakhstan cafe shows tenge', () => {
  const out = formatCurrencyForTenant(1800, 'KZ', 'KZT');
  assert.match(out, /₸/);
  assert.doesNotMatch(out, /₹/);
});
