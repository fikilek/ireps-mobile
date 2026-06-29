#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const [envName, configJsonPath] = process.argv.slice(2);

const EXPECTED = {
  dev: {
    appName: "iREPS Dev",
    appEnvLabel: "DEV",
    androidPackage: "com.ireps.mobile.dev",
    firebaseProjectId: "ireps2",
    buildProfiles: ["development"],
  },
  test: {
    appName: "iREPS Test",
    appEnvLabel: "TEST",
    androidPackage: "com.ireps.mobile.test",
    firebaseProjectId: "ireps-test",
    buildProfiles: ["test", "test-store"],
  },
};

function fail(message) {
  console.error(`\n[iREPS CI] ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Could not read JSON file ${filePath}: ${error.message}`);
  }
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    fail(`${label} mismatch. Expected "${expected}" but got "${actual}".`);
  }
}

if (!envName || !configJsonPath) {
  fail("Usage: node scripts/ci/verify-mobile-env.cjs <dev|test> <expo-config-json-path>");
}

const expected = EXPECTED[envName];
if (!expected) {
  fail(`Unsupported environment "${envName}". Expected one of: ${Object.keys(EXPECTED).join(", ")}`);
}

const rawConfig = readJson(configJsonPath);
const expoConfig = rawConfig.expo || rawConfig;

assertEqual("Expo app name", expoConfig.name, expected.appName);
assertEqual("Expo Android package", expoConfig.android && expoConfig.android.package, expected.androidPackage);
assertEqual("Expo extra.appEnv", expoConfig.extra && expoConfig.extra.appEnv, envName);
assertEqual("Expo extra.appEnvLabel", expoConfig.extra && expoConfig.extra.appEnvLabel, expected.appEnvLabel);

const firebasePath = path.join(process.cwd(), "src", "firebase", "index.js");
const firebaseSource = fs.readFileSync(firebasePath, "utf8");
const firebaseRegex = new RegExp(`${envName}:\\s*\\{[\\s\\S]*?projectId:\\s*["']${expected.firebaseProjectId}["']`);

if (!firebaseRegex.test(firebaseSource)) {
  fail(`Firebase config for APP_ENV="${envName}" must point to projectId="${expected.firebaseProjectId}".`);
}

const eas = readJson(path.join(process.cwd(), "eas.json"));

for (const profileName of expected.buildProfiles) {
  const profile = eas.build && eas.build[profileName];
  if (!profile) {
    fail(`Missing EAS build profile "${profileName}".`);
  }

  assertEqual(`EAS ${profileName} APP_ENV`, profile.env && profile.env.APP_ENV, envName);
  assertEqual(`EAS ${profileName} EXPO_PUBLIC_APP_ENV`, profile.env && profile.env.EXPO_PUBLIC_APP_ENV, envName);
}

if (envName === "test") {
  const testProfile = eas.build.test;
  assertEqual("EAS test distribution", testProfile.distribution, "internal");
  assertEqual("EAS test Android buildType", testProfile.android && testProfile.android.buildType, "apk");

  const storeProfile = eas.build["test-store"];
  assertEqual("EAS test-store distribution", storeProfile.distribution, "store");
  if (storeProfile.android && storeProfile.android.buildType === "apk") {
    fail("EAS test-store must not build an APK. Leave android.buildType unset so EAS produces a Play Store AAB.");
  }
}

console.log(
  `[iREPS CI] ${envName.toUpperCase()} OK: ${expected.appName} / ${expected.androidPackage} / Firebase ${expected.firebaseProjectId}`,
);
