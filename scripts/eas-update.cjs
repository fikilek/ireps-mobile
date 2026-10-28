#!/usr/bin/env node
// Turnkey EAS Update script ensuring explicit environment variables for Metro bundling.
const { execSync } = require("child_process");

const channel = process.argv[2];
if (!channel || !["development", "test", "live"].includes(channel)) {
  console.error("Usage: node scripts/eas-update.cjs <development|test|live> [optional message]");
  process.exit(1);
}

const envMap = {
  development: "dev",
  test: "test",
  live: "live",
};

const appEnv = envMap[channel];
const message = process.argv[3] || `EAS update for ${channel} with explicit APP_ENV=${appEnv}`;

console.log(`[iREPS EAS] Publishing to channel "${channel}" with explicit APP_ENV="${appEnv}" and EXPO_PUBLIC_APP_ENV="${appEnv}"...`);

try {
  execSync(`npx eas update --channel ${channel} --platform android --message "${message}"`, {
    stdio: "inherit",
    env: {
      ...process.env,
      APP_ENV: appEnv,
      EXPO_PUBLIC_APP_ENV: appEnv,
    },
  });
} catch (error) {
  console.error(`[iREPS EAS] Update failed:`, error.message);
  process.exit(1);
}
