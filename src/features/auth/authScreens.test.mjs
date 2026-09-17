// AU-R001: the auth screens import Firebase and MMKV at module load, so the parts that must hold are
// checked in the source text, the way the My Work Orders tests do.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const layoutSource = await read("../../../app/_layout.js");
const signinSource = await read("../../../app/(auth)/signin.jsx");
const signupSource = await read("../../../app/(auth)/signup.jsx");
const resetSource = await read("../../../app/(auth)/pwdReset.jsx");
const changePasswordSource = await read("../../../app/onboarding/change-password.js");
const selectWorkbaseSource = await read("../../../app/onboarding/select-workbase.js");
const invitedProfileSource = await read("../../../app/onboarding/complete-invited-profile.js");
const confirmAdminSource = await read("../../../app/onboarding/confirm-admin.js");
const authApiSource = await read("../../redux/authApi.js");
const inviteSources = await Promise.all(
  ["create-admin", "create-manager", "create-supervisor"].map((screen) =>
    read(`../../../app/(tabs)/admin/users/${screen}.js`),
  ),
);

test("a demanded password change stops everybody, not only users being onboarded", () => {
  assert.doesNotMatch(
    layoutSource,
    /status === "PENDING" && mustChangePassword/,
    "the demand must not be tied to the PENDING onboarding status",
  );

  assert.match(layoutSource, /if \(mustChangePassword\) \{/);

  // It has to be decided before the welcome screen is allowed to stand.
  const demandAt = layoutSource.indexOf("if (mustChangePassword) {");
  const welcomeAt = layoutSource.indexOf("if (isAtWelcome) return;");

  assert.ok(demandAt > -1 && welcomeAt > -1);
  assert.ok(demandAt < welcomeAt, "the demand must be checked before the welcome screen returns");
});

test("changing the password clears the demand and nothing else", () => {
  assert.match(changePasswordSource, /"onboarding\.mustChangePassword": false/);
  assert.doesNotMatch(
    changePasswordSource,
    /"onboarding\.status"/,
    "a forced change must not move a working user back into onboarding",
  );
  assert.match(changePasswordSource, /PASSWORD_MIN_LENGTH/);
  assert.doesNotMatch(changePasswordSource, /at least 6 characters/);
});

test("an invited admin is not left on a screen that never moves", () => {
  // AWAITING_INITIAL_SIGNUP is the status inviteAdminUser writes. It used to route nowhere.
  assert.match(layoutSource, /case "AWAITING_INITIAL_SIGNUP":/);
  assert.match(layoutSource, /status === "AWAITING_INITIAL_SIGNUP"/);
});

test("no screen knows an invited person's password in advance", () => {
  for (const source of [...inviteSources, invitedProfileSource, confirmAdminSource]) {
    assert.doesNotMatch(source, /"password",/);
    assert.doesNotMatch(source, /Default password/i);
    assert.doesNotMatch(source, /reauthenticateWithCredential/);
  }

  // Each invite hands the one-time password over, and waits to be told it was written down.
  for (const source of inviteSources) {
    assert.match(source, /invitationSentMessage\(/);
    assert.match(source, /oneTimePassword: result\?\.oneTimePassword/);
    assert.match(source, /I have written it down/);
  }
});

test("nothing but a password change clears the demand", () => {
  assert.doesNotMatch(
    selectWorkbaseSource,
    /mustChangePassword/,
    "choosing a workbase must not clear a demanded password change",
  );
});

test("the one password standard reaches the invited screens too", () => {
  for (const source of [invitedProfileSource, confirmAdminSource]) {
    assert.match(source, /passwordProblem\(form\.password, form\.confirmPassword\)/);
    assert.doesNotMatch(source, /length < 6/);
    assert.doesNotMatch(source, /6\+ characters|least 6 characters/);
  }
});

test("a password that changed is never reported as a failure", () => {
  // The password change and the record of it are two steps; only the first may fail as a change.
  const saveBlock = changePasswordSource.slice(
    changePasswordSource.indexOf("const save = async"),
    changePasswordSource.indexOf("const handleSave"),
  );

  assert.equal((saveBlock.match(/try \{/g) || []).length, 2);
  assert.match(saveBlock, /Password changed, but not recorded/);
  assert.match(saveBlock, /changePasswordMessage\(error\)/);

  // The app moves the person on once the demand is cleared; the screen does not route by itself.
  assert.doesNotMatch(saveBlock, /router\.replace/);
});

test("the change-password screen does not claim to be only for invited managers", () => {
  assert.doesNotMatch(changePasswordSource, /STEP 1 OF 2/);
  assert.doesNotMatch(changePasswordSource, /invited managers must change/);
});

test("sign in names the cause and cannot hang", () => {
  assert.doesNotMatch(signinSource, /"Network error\."/);
  assert.match(signinSource, /signinMessage\(error\)/);
  assert.match(signinSource, /PROFILE_WAIT_MS/);
  assert.match(signinSource, /auth\/profile-wait/);
  assert.match(signinSource, /clearTimeout\(timer\)/);

  // The wait is for the record, so it starts once the password has been accepted.
  assert.match(signinSource, /if \(!isWaitingForProfile\) return undefined;/);
  assert.match(signinSource, /\}\)\.unwrap\(\);\s*\n\s*setIsWaitingForProfile\(true\);/);

  // Nobody is left signed in with nowhere to go, and nobody has to retype: the screen's own Reset
  // button still clears the form, but signing in does not.
  assert.match(signinSource, /text: "Sign out"/);

  const handler = signinSource.slice(
    signinSource.indexOf("const handleSignin"),
    signinSource.indexOf("const renderError"),
  );

  assert.ok(handler.length > 0);
  assert.doesNotMatch(handler, /resetForm/);

  // The token refresh must not be reported as a failed sign in.
  assert.match(signinSource, /auth\.currentUser\?\.getIdToken\(true\)/);

  // Lost access? has somewhere to go.
  assert.match(signinSource, /router\.push\("\/pwdReset"\)/);
});

test("password reset asks first, says one thing, and never says who is on iREPS", () => {
  assert.match(resetSource, /Send a reset link\?/);
  assert.match(resetSource, /passwordResetSentMessage\(email\)/);
  assert.match(resetSource, /passwordResetMessage\(error\)/);
  assert.doesNotMatch(resetSource, /no account|not registered|does not exist/i);

  // One field only.
  const inputs = resetSource.match(/<TextInput/g) || [];
  assert.equal(inputs.length, 1);
});

test("the reset send treats an unknown email as a send", () => {
  assert.match(
    authApiSource,
    /if \(code === "auth\/user-not-found"\) \{\s*return \{ data: true \};/,
  );
  assert.match(authApiSource, /sendPasswordResetEmail\(auth, email\)/);
});

test("sign up takes its list from the back end and keeps the real reason", () => {
  assert.match(signupSource, /useGetSignupServiceProvidersQuery/);
  assert.doesNotMatch(signupSource, /spApi/, "a signed-out screen cannot read the records directly");
  assert.match(signupSource, /\}\)\.unwrap\(\);/, "without unwrap the failure is never caught");
  assert.match(signupSource, /signupMessage\(error\)/);
  assert.match(signupSource, /Send this sign up\?/);
  assert.match(signupSource, /serviceProviderListMessage\(\)/);
  assert.doesNotMatch(signupSource, /Please try again\./);
});

test("the sign-in error kept in Redux is a plain value", () => {
  assert.match(authApiSource, /function plainAuthError\(/);
  assert.doesNotMatch(
    authApiSource,
    /console\.log\(`signin ----signn error`\);\s*return \{ error \};/,
  );
});
