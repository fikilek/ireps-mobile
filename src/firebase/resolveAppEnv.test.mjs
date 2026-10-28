import test from "node:test";
import assert from "node:assert/strict";

import { resolveAppEnv } from "./resolveAppEnv.js";

test("Lock 1: resolveAppEnv resolves valid EXPO_PUBLIC_APP_ENV directly", () => {
  assert.equal(resolveAppEnv({ env: { EXPO_PUBLIC_APP_ENV: "test" } }), "test");
  assert.equal(resolveAppEnv({ env: { EXPO_PUBLIC_APP_ENV: "dev" } }), "dev");
  assert.equal(resolveAppEnv({ env: { EXPO_PUBLIC_APP_ENV: "live" } }), "live");
  assert.equal(resolveAppEnv({ env: { EXPO_PUBLIC_APP_ENV: "trial" } }), "trial");
  assert.equal(resolveAppEnv({ env: { APP_ENV: "test" } }), "test");
});

test("Lock 2: resolveAppEnv resolves from native Android package identity when env is missing", () => {
  const testPackage = { expoConfig: { android: { package: "com.ireps.mobile.test" } } };
  const livePackage = { expoConfig: { android: { package: "com.ireps.mobile" } } };
  const devPackage = { expoConfig: { android: { package: "com.ireps.mobile.dev" } } };
  const trialPackage = { expoConfig: { android: { package: "com.ireps.mobile.trial" } } };

  assert.equal(resolveAppEnv({ env: {}, constants: testPackage }), "test");
  assert.equal(resolveAppEnv({ env: {}, constants: livePackage }), "live");
  assert.equal(resolveAppEnv({ env: {}, constants: devPackage }), "dev");
  assert.equal(resolveAppEnv({ env: {}, constants: trialPackage }), "trial");
});

test("Fail-Fast: resolveAppEnv throws hard error when env is unrecognized and package is unknown", () => {
  assert.throws(
    () => resolveAppEnv({ env: { EXPO_PUBLIC_APP_ENV: "staging" }, constants: null }),
    /Fatal: Cannot resolve application environment/,
  );
  assert.throws(
    () => resolveAppEnv({ env: {}, constants: null }),
    /Fatal: Cannot resolve application environment/,
  );
});
