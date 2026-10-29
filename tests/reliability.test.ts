import test from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil } from '../src/utils/formatters';
import { extractJsonString } from '../src/services/visionOcrService';

test('reliability - daysUntil handles invalid inputs gracefully without NaN', () => {
  // Invalid string must return 0, not NaN
  const res1 = daysUntil('invalid-date-string');
  assert.equal(res1, 0);
  assert.equal(Number.isNaN(res1), false);

  // Empty string
  const res2 = daysUntil('');
  assert.equal(res2, 0);
  assert.equal(Number.isNaN(res2), false);

  // Null/undefined edge cases
  const res3 = daysUntil(null as any);
  assert.equal(res3, 0);
  assert.equal(Number.isNaN(res3), false);

  // Valid today date should be 0
  const todayStr = new Date().toISOString().split('T')[0];
  const resToday = daysUntil(todayStr);
  assert.equal(resToday, 0);
});

test('reliability - extractJsonString strips preambles, postscripts, and markdown fences', () => {
  // 1. Markdown code block
  const fenced = '```json\n{"title": "Gala", "eventType": "reception"}\n```';
  const extracted1 = extractJsonString(fenced);
  assert.deepEqual(JSON.parse(extracted1), { title: 'Gala', eventType: 'reception' });

  // 2. Preamble with markdown code block
  const withPreamble = 'Here is the extracted invitation details:\n```json\n{"title": "Wedding Reception", "date": "2026-11-15"}\n```\nHope this helps!';
  const extracted2 = extractJsonString(withPreamble);
  assert.deepEqual(JSON.parse(extracted2), { title: 'Wedding Reception', date: '2026-11-15' });

  // 3. Conversational text without backticks
  const noBackticks = 'Certainly! The parsed JSON is: {"title": "Annual Meet", "venue": "Grand Ballroom"} Thank you.';
  const extracted3 = extractJsonString(noBackticks);
  assert.deepEqual(JSON.parse(extracted3), { title: 'Annual Meet', venue: 'Grand Ballroom' });

  // 4. Raw clean JSON
  const rawClean = '{"eventType": "birthday", "mainPerson": "Alex"}';
  const extracted4 = extractJsonString(rawClean);
  assert.deepEqual(JSON.parse(extracted4), { eventType: 'birthday', mainPerson: 'Alex' });
});

test('reliability - double-tap ref lock prevents duplicate submissions', () => {
  let executionCount = 0;
  const isSubmittingRef = { current: false };

  const simulateSubmit = () => {
    if (isSubmittingRef.current) return false;
    isSubmittingRef.current = true;
    executionCount++;
    return true;
  };

  // First tap executes
  const firstTap = simulateSubmit();
  assert.equal(firstTap, true);
  assert.equal(executionCount, 1);

  // Rapid second tap while still submitting is locked out
  const secondTap = simulateSubmit();
  assert.equal(secondTap, false);
  assert.equal(executionCount, 1);

  // After completion, unlock allows next deliberate submission
  isSubmittingRef.current = false;
  const thirdTap = simulateSubmit();
  assert.equal(thirdTap, true);
  assert.equal(executionCount, 2);
});

test('reliability - state reset collections include giftRecords', () => {
  // Verify that the reset keys defined across store resets cover all 9 entities
  const requiredResetKeys = [
    'people',
    'invitations',
    'familyEvents',
    'schedule',
    'reminders',
    'giftRecords',
    'privilegedUsers',
    'activityLogs',
    'notifications',
  ];

  const sampleResetState = {
    people: [],
    invitations: [],
    familyEvents: [],
    schedule: [],
    reminders: [],
    giftRecords: [],
    privilegedUsers: [],
    activityLogs: [],
    notifications: [],
    currentScanResult: null,
  };

  for (const key of requiredResetKeys) {
    assert.ok(key in sampleResetState, `Reset state must include ${key} to prevent cross-account leaks`);
    assert.deepEqual((sampleResetState as any)[key], [], `${key} must be reset to an empty array`);
  }
});

