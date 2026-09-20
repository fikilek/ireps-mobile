// AU-R001 3 and 7.1: Sign in names the cause and cannot hang. The screen imports Firebase and MMKV
// at module load, so what must hold is checked in the source text.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const signinSource = await read("../../../app/(auth)/signin.jsx");
const authApiSource = await read("../../redux/authApi.js");

test("sign in names the cause instead of blaming the network for everything", () => {
  assert.doesNotMatch(signinSource, /"Network error\."/);
  assert.doesNotMatch(signinSource, /Invalid credentials\./);
  assert.match(signinSource, /signinMessage\(error\)/);
});

test("the cursor waits in the email field", () => {
  assert.match(signinSource, /placeholder="Email address"[\s\S]{0,700}autoFocus/);
});

test("sign in cannot spin forever", () => {
  assert.match(signinSource, /PROFILE_WAIT_MS/);
  assert.match(signinSource, /auth\/profile-wait/);
  assert.match(signinSource, /clearTimeout\(timer\)/);

  // The wait is for the person's record, so it starts once the password has been accepted.
  assert.match(signinSource, /if \(!isWaitingForProfile\) return undefined;/);
  assert.match(signinSource, /\}\)\.unwrap\(\);\s*\n\s*setIsWaitingForProfile\(true\);/);

  // Nobody is left signed in with nowhere to go.
  assert.match(signinSource, /text: "Sign out"/);
});

test("a token refresh is never reported as a failed sign in", () => {
  assert.match(signinSource, /auth\.currentUser\?\.getIdToken\(true\)/);

  const handler = signinSource.slice(
    signinSource.indexOf("const handleSignin"),
    signinSource.indexOf("const renderError"),
  );

  assert.ok(handler.length > 0);
  assert.match(handler, /catch \(tokenError\)/);

  // What the person typed stays in the form in case the wait runs out.
  assert.doesNotMatch(handler, /resetForm/);
});

test("the sign-in error kept in Redux is a plain value", () => {
  assert.match(authApiSource, /function plainAuthError\(/);
  assert.match(authApiSource, /return \{ error: plainAuthError\(error, "Sign in failed\."\) \};/);
  assert.doesNotMatch(authApiSource, /console\.log\(`signin ----signn error`\);/);
});
