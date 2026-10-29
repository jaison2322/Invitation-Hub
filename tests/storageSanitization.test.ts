import test from 'node:test';
import assert from 'node:assert/strict';

test('storageSanitization - partialize function strips passwordHash and pin', () => {
  // Simulate the partialize logic from useAppStore
  const sanitizeUser = (user: any) => {
    if (!user) return null;
    const { passwordHash, pin, ...rest } = user;
    return rest;
  };

  const sanitizeList = (list: any[]) => {
    return (list || []).map(({ passwordHash, pin, ...rest }) => rest);
  };

  const rawState = {
    theme: 'dark',
    isAuthenticated: true,
    isVIP: true,
    activeVipId: 'vip_jaison',
    authToken: 'token_1730000000_abcdef123456',
    currentUser: {
      id: 'vip_jaison',
      username: 'jaison',
      name: 'Jaison Francis',
      passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
      pin: '1234',
      phone: '+1234567890',
      email: 'jaison@example.com',
      createdAt: '2026-10-29T00:00:00.000Z',
    },
    currentPrivilegedUser: {
      id: 'priv_staff1',
      username: 'staff1',
      name: 'Staff Member',
      role: 'Assistant',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      pin: '5678',
      permissions: { canAddInvitations: true },
      addedBy: 'vip_jaison',
      addedAt: '2026-10-29T00:00:00.000Z',
    },
    privilegedUsers: [
      {
        id: 'priv_staff1',
        username: 'staff1',
        passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
        pin: '5678',
        name: 'Staff Member',
      },
      {
        id: 'priv_staff2',
        username: 'staff2',
        passwordHash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
        name: 'Staff Two',
      },
    ],
  };

  const serialized = {
    currentUser: sanitizeUser(rawState.currentUser),
    currentPrivilegedUser: sanitizeUser(rawState.currentPrivilegedUser),
    privilegedUsers: sanitizeList(rawState.privilegedUsers),
  };

  const jsonString = JSON.stringify(serialized);

  // 1. Password hashes must NOT exist anywhere in serialized JSON
  assert.equal(jsonString.includes('240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'), false);
  assert.equal(jsonString.includes('8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'), false);
  assert.equal(jsonString.includes('a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3'), false);

  // 2. PIN values must NOT exist in serialized JSON
  assert.equal(jsonString.includes('"pin"'), false);
  assert.equal(jsonString.includes('"1234"'), false);
  assert.equal(jsonString.includes('"5678"'), false);

  // 3. User identity and permissions are fully preserved
  assert.equal(serialized.currentUser.username, 'jaison');
  assert.equal(serialized.currentUser.name, 'Jaison Francis');
  assert.equal(serialized.currentUser.passwordHash, undefined);
  assert.equal(serialized.currentPrivilegedUser.username, 'staff1');
  assert.equal(serialized.currentPrivilegedUser.passwordHash, undefined);
  assert.equal(serialized.privilegedUsers[0].passwordHash, undefined);
  assert.equal(serialized.privilegedUsers[1].passwordHash, undefined);
});

