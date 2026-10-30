import test from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil } from '../src/utils/formatters';
import type { Invitation, Notification, GiftRecord } from '../src/types';
import { extractAdditionalDetails } from '../src/services/aiService';
import { cleanExtractedNotes } from '../src/services/scanMappingService';

test('productionFeatures - 7-day reminder calculation and milestone key', () => {
  // Compute date exactly 7 calendar days in future using local date components
  const now = new Date();
  const future7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const y = future7Days.getFullYear();
  const m = String(future7Days.getMonth() + 1).padStart(2, '0');
  const d = String(future7Days.getDate()).padStart(2, '0');
  const future7DaysStr = `${y}-${m}-${d}`;

  const days = daysUntil(future7DaysStr);
  assert.equal(days, 7, 'daysUntil must report exactly 7 days');

  // Verify milestone key logic matching useAppStore
  const milestoneKey = days === 0 ? 'today' : days === 1 ? '1day' : days === 2 ? '2days' : days === 7 ? '7days' : `${days}days`;
  assert.equal(milestoneKey, '7days');

  const dayText = days === 0 ? 'Today' : days === 1 ? 'Tomorrow (1 day left)' : days === 2 ? 'in 2 days' : days === 7 ? 'in 7 days (1 week)' : `in ${days} days`;
  assert.equal(dayText, 'in 7 days (1 week)');

  // Verify reminder ID format
  const invId = 'inv-test-123';
  const reminderId = `notif-rem-${invId}-${milestoneKey}`;
  assert.equal(reminderId, 'notif-rem-inv-test-123-7days');
});

test('productionFeatures - 7-day reminder title and message generation', () => {
  const days = 7;
  const eventName = 'Presidential Gala';
  const dayText = 'in 7 days (1 week)';
  const isPending = false;

  const reminderTitle = isPending
    ? `Upcoming in 7 Days (Pending): ${eventName}`
    : `Upcoming in 7 Days: ${eventName}`;

  const reminderMessage = isPending
    ? `Protocol reminder (1 week left): Event is scheduled for ${dayText}. Invitation is pending review.`
    : `Protocol reminder: Event is scheduled for ${dayText}.`;

  assert.equal(reminderTitle, 'Upcoming in 7 Days: Presidential Gala');
  assert.ok(reminderMessage.includes('in 7 days (1 week)'));
});

test('productionFeatures - 7-day reminder deduplication logic', () => {
  const invId = 'inv-dedup-777';
  const milestoneKey = '7days';
  const reminderId = `notif-rem-${invId}-${milestoneKey}`;

  const existingNotifications: Notification[] = [
    {
      id: reminderId,
      vipId: 'vip_jaison',
      type: 'reminder',
      title: 'Upcoming in 7 Days: State Dinner',
      message: 'Protocol reminder: Event is scheduled for in 7 days (1 week).',
      read: false,
      timestamp: new Date().toISOString(),
      relatedEntityId: invId,
      actionUrl: `/event/${invId}`,
    },
  ];

  // Simulating duplicate check from useAppStore
  const reminderExists = existingNotifications.some(
    (n) =>
      n.id === reminderId ||
      (n.relatedEntityId === invId &&
        n.type === 'reminder' &&
        ((milestoneKey === 'today' && (n.message.toLowerCase().includes('today') || n.id.includes('-today'))) ||
          (milestoneKey === '1day' && (n.message.toLowerCase().includes('tomorrow') || n.message.toLowerCase().includes('1 day') || n.id.includes('-1day'))) ||
          (milestoneKey === '2days' && (n.message.toLowerCase().includes('in 2 days') || n.id.includes('-2days'))) ||
          (milestoneKey === '7days' && (n.message.toLowerCase().includes('7 days') || n.message.toLowerCase().includes('1 week') || n.id.includes('-7days')))))
  );

  assert.equal(reminderExists, true, 'Duplicate 7-day reminder must be prevented');
});

test('productionFeatures - gift records support both received and given directions', () => {
  const giftGiven: GiftRecord = {
    id: 'gift-1',
    vipId: 'vip_jaison',
    direction: 'given',
    eventId: 'event-101',
    eventTitle: 'Wedding of Vijay & Priya',
    eventDate: '2026-10-30',
    giftName: 'Gold Chain 24g',
    giftCategory: 'gold',
    estimatedValue: 150000,
    recipientName: 'Vijay',
    notes: 'Gifted at main stage',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const giftReceived: GiftRecord = {
    id: 'gift-2',
    vipId: 'vip_jaison',
    direction: 'received',
    eventId: 'event-202',
    eventTitle: 'VIP Silver Jubilee Function',
    eventDate: '2026-10-25',
    giftName: 'Silver Memento & Shawl',
    giftCategory: 'silver',
    estimatedValue: 25000,
    recipientName: 'Chairman of Industries',
    notes: 'Received from chief guest',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert.equal(giftGiven.direction, 'given');
  assert.equal(giftReceived.direction, 'received');

  // Verify list filtering separates the two directions cleanly
  const allGifts = [giftGiven, giftReceived];
  const givenList = allGifts.filter((g) => g.direction === 'given');
  const receivedList = allGifts.filter((g) => g.direction === 'received');

  assert.equal(givenList.length, 1);
  assert.equal(givenList[0].id, 'gift-1');
  assert.equal(receivedList.length, 1);
  assert.equal(receivedList[0].id, 'gift-2');
});

test('productionFeatures - extractAdditionalDetails purges URLs and OCR noise while extracting parentage and notes', () => {
  const userOcrText = "google.com/search?client= Milan Mantra : ச க ] ந oe A R 7 '4 வ - < 5 - Yo ' 0 Roy Family cordially invited you the engagement of Sidharth Roy S/ 0: My. Pravakar Roy E& Mrs. Sunita Roy RRitika Mitra D/ 0: Ram Prakesh and Sunita Mittal 1 ம்";
  const extracted = extractAdditionalDetails(userOcrText);

  assert.ok(extracted, 'Should extract meaningful notes');
  assert.ok(!extracted.includes('google.com'), 'Must not contain google.com');
  assert.ok(!extracted.includes('client='), 'Must not contain client=');
  assert.ok(!extracted.includes('Milan Mantra'), 'Must not contain Milan Mantra watermark');
  assert.ok(!extracted.includes('oe A R'), 'Must not contain isolated symbol noise');
  assert.ok(extracted.includes('S/o: Mr. Pravakar Roy & Mrs. Sunita Roy'), 'Must extract corrected groom parentage');
  assert.ok(extracted.includes('D/o: Ram Prakesh and Sunita Mittal'), 'Must extract bride parentage');
});

test('productionFeatures - extractAdditionalDetails extracts RSVP, food notice, and dress code cleanly', () => {
  const cardWithDetails = "Wedding Reception of Ajay & Divya\non 25th Dec 2026 at 7 PM\nDinner to follow\nRSVP: +91 98401 23456\nDress Code: Ethnic / Traditional\nWith best compliments from Uncle and Aunt\nhttps://google.com/search?client=chrome";
  const extracted = extractAdditionalDetails(cardWithDetails);

  assert.ok(extracted, 'Should extract notes');
  assert.ok(extracted.includes('RSVP: +91 98401 23456'), 'Should extract RSVP');
  assert.ok(extracted.includes('Dinner to follow'), 'Should extract Dinner to follow');
  assert.ok(extracted.includes('Dress Code: Ethnic / Traditional'), 'Should extract dress code');
  assert.ok(!extracted.includes('https://'), 'Should strip URLs');
});

test('productionFeatures - cleanExtractedNotes returns empty for pure noise or URLs', () => {
  const junkText = "https://google.com/search?client=chrome Milan Mantra !@#$%^&*() ச க ] ந oe A R";
  const cleaned = cleanExtractedNotes(junkText);
  assert.equal(cleaned, '', 'Pure junk/URLs must return empty string');
});

test('productionFeatures - user notification preferences filter reminder triggers', () => {
  const customPrefs = {
    newInvitations: true,
    scheduleConflicts: true,
    statusUpdates: false,
    remind7Days: false,
    remind2Days: true,
    remind1Day: true,
    remindDayOf: true,
  };

  const checkMilestoneAllowed = (days: number, prefs: typeof customPrefs) => {
    return (
      (days === 0 && prefs.remindDayOf) ||
      (days === 1 && prefs.remind1Day) ||
      (days === 2 && prefs.remind2Days) ||
      (days === 7 && prefs.remind7Days)
    );
  };

  assert.equal(checkMilestoneAllowed(7, customPrefs), false, '7-day reminder should be filtered out when disabled');
  assert.equal(checkMilestoneAllowed(2, customPrefs), true, '2-day reminder should trigger when enabled');
  assert.equal(checkMilestoneAllowed(1, customPrefs), true, '1-day reminder should trigger when enabled');
  assert.equal(checkMilestoneAllowed(0, customPrefs), true, 'Day-of reminder should trigger when enabled');
});

test('productionFeatures - customizable advance reminder days (e.g., 3, 5, 10 days before event)', () => {
  const userConfiguredPrefs = {
    reminderDays: [0, 1, 3, 5, 10],
  };

  const isReminderAllowed = (daysBefore: number, prefs: typeof userConfiguredPrefs, eventOverrideDays?: number[]) => {
    const activeDays = Array.isArray(eventOverrideDays) && eventOverrideDays.length > 0
      ? eventOverrideDays
      : prefs.reminderDays;
    return activeDays.includes(daysBefore);
  };

  // Configured days should trigger
  assert.equal(isReminderAllowed(3, userConfiguredPrefs), true, '3-day reminder must be allowed');
  assert.equal(isReminderAllowed(5, userConfiguredPrefs), true, '5-day reminder must be allowed');
  assert.equal(isReminderAllowed(10, userConfiguredPrefs), true, '10-day reminder must be allowed');
  assert.equal(isReminderAllowed(0, userConfiguredPrefs), true, 'Day-of reminder must be allowed');

  // Non-configured day (e.g. 7 days or 4 days) should not trigger
  assert.equal(isReminderAllowed(7, userConfiguredPrefs), false, '7-day reminder should not trigger when not in list');
  assert.equal(isReminderAllowed(4, userConfiguredPrefs), false, '4-day reminder should not trigger when not in list');

  // Per-event override: event specifically configured for 14 days before
  const eventCustomDays = [14, 1];
  assert.equal(isReminderAllowed(14, userConfiguredPrefs, eventCustomDays), true, 'Per-event 14-day reminder must trigger');
  assert.equal(isReminderAllowed(3, userConfiguredPrefs, eventCustomDays), false, 'Global 3-day reminder is bypassed by per-event override');
});

test('productionFeatures - custom reminder ID and message formatting for arbitrary days', () => {
  const days = 3;
  const milestoneKey = days === 0 ? 'today' : days === 1 ? '1day' : days === 2 ? '2days' : days === 7 ? '7days' : `${days}days`;
  const dayText = days === 0 ? 'Today' : days === 1 ? 'Tomorrow (1 day left)' : days === 2 ? 'in 2 days' : days === 7 ? 'in 7 days (1 week)' : `in ${days} days`;
  const invId = 'inv-custom-3d';
  const reminderId = `notif-rem-${invId}-${milestoneKey}`;

  assert.equal(milestoneKey, '3days');
  assert.equal(dayText, 'in 3 days');
  assert.equal(reminderId, 'notif-rem-inv-custom-3d-3days');

  const eventName = 'Annual Corporate Summit';
  const reminderTitle = `Upcoming in ${days} Days: ${eventName}`;
  assert.equal(reminderTitle, 'Upcoming in 3 Days: Annual Corporate Summit');
});
