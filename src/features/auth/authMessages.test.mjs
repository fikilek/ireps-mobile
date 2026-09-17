// AU-R001 7: every row of the Error Register gets the words the rule set promises.
import assert from "node:assert/strict";
import test from "node:test";

import {
  PASSWORD_MIN_LENGTH,
  changePasswordMessage,
  passwordProblem,
  passwordResetMessage,
  passwordResetSentMessage,
  serviceProviderListMessage,
  signinMessage,
  signupMessage,
} from "./authMessages.js";

const fbError = (code, message = "") => ({ code, message });

test("the password standard is eight characters", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8);
  assert.equal(passwordProblem("abcdefg", "abcdefg").message, "Password must be at least 8 characters.");
  assert.equal(passwordProblem("abcdefgh", "abcdefgh"), null);
  assert.equal(
    passwordProblem("abcdefgh", "abcdefgi").message,
    "The two passwords are not the same.",
  );
});

test("sign in names the cause, not one message for everything", () => {
  const wrong = "Email or password is not right.";

  for (const code of [
    "auth/invalid-credential",
    "auth/wrong-password",
    "auth/user-not-found",
    "auth/invalid-login-credentials",
  ]) {
    assert.equal(signinMessage(fbError(code)).message, wrong);
  }

  assert.equal(
    signinMessage(fbError("auth/invalid-email")).message,
    "That does not look like an email address.",
  );
  assert.equal(
    signinMessage(fbError("auth/user-disabled")).message,
    "This account has been stopped. Speak to your manager.",
  );
  assert.equal(
    signinMessage(fbError("auth/too-many-requests")).message,
    "Too many tries. Wait a few minutes and try again.",
  );
  assert.equal(
    signinMessage(fbError("auth/network-request-failed")).message,
    "No connection. Check your signal and try again.",
  );
  assert.match(
    signinMessage(fbError("auth/profile-wait")).message,
    /signed in, but your details did not load/,
  );
  assert.match(signinMessage(fbError("auth/internal-error")).message, /tell your manager/);
});

test("sign in never blames the network for a wrong password", () => {
  assert.notEqual(
    signinMessage(fbError("auth/invalid-credential")).message,
    signinMessage(fbError("auth/network-request-failed")).message,
  );
});

test("sign up keeps the reason the back end gave", () => {
  assert.match(
    signupMessage(fbError("functions/already-exists", "A user with this email already exists."))
      .message,
    /An account already uses this email/,
  );

  assert.match(
    signupMessage(
      fbError("functions/failed-precondition", "Selected service provider is not active."),
    ).message,
    /not active/,
  );

  assert.match(
    signupMessage(
      fbError(
        "functions/failed-precondition",
        "No responsible manager was found for the selected service provider.",
      ),
    ).message,
    /No manager is set for that service provider/,
  );

  assert.equal(
    signupMessage(
      fbError("functions/invalid-argument", "Password must be at least 8 characters."),
    ).message,
    "Password must be at least 8 characters.",
  );

  assert.equal(
    signupMessage(fbError("functions/unavailable")).message,
    "No connection. Check your signal and try again.",
  );

  // Anything else still carries the server's own words rather than a shrug, including a cause the
  // Error Register does not name.
  assert.equal(
    signupMessage(fbError("functions/internal", "Could not complete field worker signup.")).message,
    "Could not complete field worker signup.",
  );
  assert.equal(
    signupMessage(fbError("functions/not-found", "Selected service provider was not found."))
      .message,
    "Selected service provider was not found.",
  );

  assert.match(signupMessage(fbError("functions/internal")).message, /tell your manager/);
});

test("a picker that could not load says so", () => {
  assert.match(serviceProviderListMessage().message, /Could not load the service providers/);
});

test("password reset says the same thing whether or not the email has an account", () => {
  const sent = passwordResetSentMessage("worker@example.com");

  assert.match(sent.message, /worker@example\.com/);
  assert.match(sent.message, /If .* belongs to an iREPS account/);
  assert.match(sent.message, /junk folder/);

  // The words for an email with no account are the sent words, by rule.
  assert.equal(
    passwordResetSentMessage("nobody@example.com").message.replace("nobody", "worker"),
    sent.message,
  );
});

test("password reset only differs when the send did not happen", () => {
  assert.equal(
    passwordResetMessage(fbError("auth/too-many-requests")).message,
    "Too many tries. Wait a few minutes and try again.",
  );
  assert.equal(
    passwordResetMessage(fbError("auth/invalid-email")).message,
    "That does not look like an email address.",
  );
  assert.equal(
    passwordResetMessage(fbError("auth/network-request-failed")).message,
    "No connection. Check your signal and try again.",
  );
  assert.match(passwordResetMessage(fbError("auth/internal-error")).message, /Could not send/);
});

test("change password tells a stale sign-in apart from a short password", () => {
  assert.equal(
    changePasswordMessage(fbError("auth/weak-password")).message,
    "Password must be at least 8 characters.",
  );
  assert.match(
    changePasswordMessage(fbError("auth/requires-recent-login")).message,
    /sign in again/,
  );
  assert.equal(
    changePasswordMessage(fbError("auth/network-request-failed")).message,
    "No connection. Check your signal and try again.",
  );
  assert.match(changePasswordMessage(fbError("auth/internal-error")).message, /tell your manager/);
});
