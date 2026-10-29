import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, sha256Fallback, constantTimeCompare } from '../src/utils/crypto';
import { generateSecureToken, generateId } from '../src/utils/id';

test('sha256Fallback produces accurate NIST test vector hash', () => {
  // SHA-256("admin123")
  const expected = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
  const actual = sha256Fallback('admin123');
  assert.equal(actual, expected);
});

test('hashPassword computes SHA-256 hash', async () => {
  const expected = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
  const actual = await hashPassword('admin123');
  assert.equal(actual, expected);
});

test('constantTimeCompare correctly compares strings', () => {
  assert.equal(constantTimeCompare('secret_hash_value', 'secret_hash_value'), true);
  assert.equal(constantTimeCompare('secret_hash_value', 'wrong_hash_value!'), false);
  assert.equal(constantTimeCompare('short', 'longer_string'), false);
  assert.equal(constantTimeCompare('', ''), true);
});

test('verifyPassword verifies correct password against hash', async () => {
  const hash = await hashPassword('MySecurePassword2026!');
  assert.equal(await verifyPassword('MySecurePassword2026!', hash), true);
  assert.equal(await verifyPassword('WrongPassword', hash), false);
  assert.equal(await verifyPassword('', hash), false);
  assert.equal(await verifyPassword('MySecurePassword2026!', ''), false);
});

test('generateSecureToken produces unique high-entropy tokens', () => {
  const token1 = generateSecureToken();
  const token2 = generateSecureToken();
  assert.notEqual(token1, token2);
  assert.match(token1, /^token_\d+_[a-f0-9]{32,}$/);
});
