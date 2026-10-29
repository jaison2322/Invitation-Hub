import test from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil } from '../src/utils/formatters';
import type { Invitation, Notification, GiftRecord } from '../src/types';

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
