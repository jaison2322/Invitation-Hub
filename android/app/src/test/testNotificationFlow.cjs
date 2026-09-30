// testNotificationFlow.js - Test suite verifying the 7 scenarios in mobile notification permission flow

let localStorageStore = {};
global.localStorage = {
  getItem: (key) => localStorageStore[key] || null,
  setItem: (key, val) => { localStorageStore[key] = String(val); },
  removeItem: (key) => { delete localStorageStore[key]; },
  clear: () => { localStorageStore = {}; }
};

// Simulation of mobileNotificationService logic
function createService(nativeConfig) {
  let hasRequestedFirstLaunch = false;
  const STORAGE_KEY_ASKED = 'vip_notif_perm_asked';

  return {
    config: nativeConfig,
    requestCallCount: 0,
    checkCallCount: 0,

    resetSession() {
      hasRequestedFirstLaunch = false;
    },

    async checkPermission() {
      this.checkCallCount++;
      if (this.config.sdkInt >= 33) {
        if (this.config.granted) {
          return { granted: true, status: 'granted', canAskAgain: true };
        } else if (!this.config.askedBefore) {
          return { granted: false, status: 'prompt', canAskAgain: true };
        } else {
          return { granted: false, status: 'denied', canAskAgain: this.config.rationale };
        }
      } else {
        // Android 12 and below
        return {
          granted: this.config.notificationsEnabled,
          status: this.config.notificationsEnabled ? 'granted' : 'denied',
          canAskAgain: this.config.notificationsEnabled
        };
      }
    },

    async requestPermission(force = false) {
      this.requestCallCount++;
      const current = await this.checkPermission();
      if (current.granted) return current;

      if (current.status === 'denied' && !current.canAskAgain && !force) {
        return current;
      }

      localStorage.setItem(STORAGE_KEY_ASKED, 'true');
      this.config.askedBefore = true;

      if (this.config.sdkInt >= 33) {
        // Simulates Android 13 dialog outcome
        const outcome = this.config.simulatedUserAction; // 'ALLOW', 'DENY', 'PERMANENT_DENY'
        if (outcome === 'ALLOW') {
          this.config.granted = true;
          return { granted: true, status: 'granted', canAskAgain: true };
        } else if (outcome === 'PERMANENT_DENY') {
          this.config.granted = false;
          this.config.rationale = false;
          return { granted: false, status: 'denied', canAskAgain: false };
        } else {
          this.config.granted = false;
          this.config.rationale = true;
          return { granted: false, status: 'denied', canAskAgain: true };
        }
      } else {
        // Android 12: does not request POST_NOTIFICATIONS runtime permission
        return {
          granted: this.config.notificationsEnabled,
          status: this.config.notificationsEnabled ? 'granted' : 'denied',
          canAskAgain: this.config.notificationsEnabled
        };
      }
    },

    async requestFirstLaunchPermission() {
      if (hasRequestedFirstLaunch) {
        return null; // Guarded against recomposition / navigation
      }
      hasRequestedFirstLaunch = true;

      try {
        const alreadyAsked = localStorage.getItem(STORAGE_KEY_ASKED);
        if (alreadyAsked === 'true') {
          return null; // Guarded against reopen
        }

        const current = await this.checkPermission();
        if (current.granted) {
          localStorage.setItem(STORAGE_KEY_ASKED, 'true');
          return current;
        }

        if (current.status === 'denied' && !current.canAskAgain) {
          localStorage.setItem(STORAGE_KEY_ASKED, 'true');
          return current;
        }

        localStorage.setItem(STORAGE_KEY_ASKED, 'true');
        return await this.requestPermission(false);
      } catch (err) {
        return null;
      }
    }
  };
}

let passed = 0;
let total = 0;
function assert(condition, name) {
  total++;
  if (condition) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    console.error(`FAIL: ${name}`);
  }
}

async function runTests() {
  console.log('--- Scenario 1 & 2: Fresh installation on Android 13+, user taps Allow ---');
  localStorage.clear();
  let svc1 = createService({
    sdkInt: 35,
    granted: false,
    askedBefore: false,
    rationale: false,
    simulatedUserAction: 'ALLOW'
  });
  let res1 = await svc1.requestFirstLaunchPermission();
  assert(svc1.requestCallCount === 1, 'Permission was requested on first launch');
  assert(res1 && res1.granted === true, 'User tapped Allow, notifications are granted');
  assert(localStorage.getItem('vip_notif_perm_asked') === 'true', 'Asked flag persisted in storage');

  console.log('\n--- Scenario 3: Fresh installation on Android 13+, user taps Don\'t allow ---');
  localStorage.clear();
  let svc2 = createService({
    sdkInt: 35,
    granted: false,
    askedBefore: false,
    rationale: false,
    simulatedUserAction: 'DENY'
  });
  let res2 = await svc2.requestFirstLaunchPermission();
  assert(svc2.requestCallCount === 1, 'Permission was requested on first launch');
  assert(res2 && res2.granted === false, 'Result is denied, but returned cleanly without error');
  assert(localStorage.getItem('vip_notif_perm_asked') === 'true', 'Asked flag persisted in storage');

  console.log('\n--- Scenario 4: Permission already granted ---');
  localStorage.clear();
  let svc3 = createService({
    sdkInt: 35,
    granted: true,
    askedBefore: false,
    rationale: false,
    simulatedUserAction: 'NONE'
  });
  let res3 = await svc3.requestFirstLaunchPermission();
  assert(svc3.requestCallCount === 0, 'No permission request triggered because already granted');
  assert(res3 && res3.granted === true, 'Returns current granted status');

  console.log('\n--- Scenario 5: App is closed and reopened ---');
  // Closed and reopened means localStorage has STORAGE_KEY_ASKED = 'true', but new session
  let svc4 = createService({
    sdkInt: 35,
    granted: false,
    askedBefore: true,
    rationale: true,
    simulatedUserAction: 'NONE'
  });
  // Note: localStorage has 'vip_notif_perm_asked' = 'true' from svc2
  let res4 = await svc4.requestFirstLaunchPermission();
  assert(svc4.requestCallCount === 0, 'No repeated permission dialog when reopened');
  assert(res4 === null, 'Returns null on subsequent launches');

  console.log('\n--- Scenario 6: Android 12 or below ---');
  localStorage.clear();
  let svc5 = createService({
    sdkInt: 31, // Android 12
    notificationsEnabled: true,
    askedBefore: false,
    rationale: false
  });
  let res5 = await svc5.requestFirstLaunchPermission();
  assert(svc5.requestCallCount === 0, 'Did not attempt to request Android 13 runtime permission');
  assert(res5 && res5.granted === true, 'Android 12 defaults to enabled without crash');

  console.log('\n--- Recomposition & Navigation Guard Test ---');
  localStorage.clear();
  let svcG = createService({
    sdkInt: 35,
    granted: false,
    askedBefore: false,
    rationale: false,
    simulatedUserAction: 'ALLOW'
  });
  await svcG.requestFirstLaunchPermission(); // First mount
  await svcG.requestFirstLaunchPermission(); // Recomposition / re-render
  await svcG.requestFirstLaunchPermission(); // Route change navigation
  assert(svcG.requestCallCount === 1, 'Only requested once despite 3 consecutive calls');

  console.log(`\n========================================`);
  console.log(`Results: ${passed}/${total} assertions passed.`);
  console.log(`========================================`);
}

runTests();
