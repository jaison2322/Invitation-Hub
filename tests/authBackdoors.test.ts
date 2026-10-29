import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, constantTimeCompare } from '../src/utils/crypto';
import { generateSecureToken } from '../src/utils/id';

test('authBackdoors - constant-time equality check', () => {
  assert.equal(constantTimeCompare('secret_hash_123', 'secret_hash_123'), true);
  assert.equal(constantTimeCompare('secret_hash_123', 'secret_hash_456'), false);
  assert.equal(constantTimeCompare('secret_hash_123', 'short'), false);
  assert.equal(constantTimeCompare('', ''), true);
  assert.equal(constantTimeCompare('a', ''), false);
});

test('authBackdoors - verifyPassword rejects bypass credentials', async () => {
  const genuineUserPassword = 'MySecretSuperPassword#2026!';
  const storedHash = await hashPassword(genuineUserPassword);

  // 1. Correct password must pass
  const validResult = await verifyPassword(genuineUserPassword, storedHash);
  assert.equal(validResult, true, 'Genuine password must verify against stored hash');

  // 2. Legacy backdoor 'admin123' must be strictly rejected
  const admin123Result = await verifyPassword('admin123', storedHash);
  assert.equal(admin123Result, false, "'admin123' backdoor must be rejected");

  // 3. Legacy backdoor 'staff123' must be strictly rejected
  const staff123Result = await verifyPassword('staff123', storedHash);
  assert.equal(staff123Result, false, "'staff123' backdoor must be rejected");

  // 4. Random wrong password must be rejected
  const randomWrong = await verifyPassword('IncorrectPassword999', storedHash);
  assert.equal(randomWrong, false, 'Random incorrect password must be rejected');
});

test('authBackdoors - CSPRNG tokens have high entropy and correct format', () => {
  const token1 = generateSecureToken('token');
  const token2 = generateSecureToken('token');

  assert.notEqual(token1, token2, 'Two generated tokens must never collide');
  assert.ok(token1.startsWith('token_'), "Token must start with 'token_' prefix");
  // token format: prefix_timestamp_48hexChars (24 bytes)
  const parts = token1.split('_');
  assert.ok(parts.length >= 3, 'Token must contain prefix, timestamp, and random hex payload');
  assert.ok(parts[2].length >= 32, 'Token random component must have at least 128 bits of entropy');
});

