// AU-R001 7: every row of the Error Register gets the words the rule set promises.
import assert from "node:assert/strict";
import test from "node:test";

import {
  PASSWORD_MIN_LENGTH,
  changePasswordMessage,
  invitationSentMessage,
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

  const stopped = signinMessage(fbError("auth/user-disabled"));
  assert.equal(stopped.title, "Account stopped");
  assert.equal(stopped.message, "Speak to your manager.");

  const tooMany = signinMessage(fbError("auth/too-many-requests"));
  assert.equal(tooMany.title, "Too many tries");
  assert.equal(tooMany.message, "Wait a few minutes and try again.");

  const offline = signinMessage(fbError("auth/network-request-failed"));
  assert.equal(offline.title, "No connection");
  assert.equal(offline.message, "Check your signal and try again.");

  assert.match(
    signinMessage(fbError("auth/profile-wait")).message,
    /You are signed in, but they did not arrive/,
  );
  assert.match(signinMessage(fbError("auth/internal-error")).message, /tell your manager/);
});

test("no window says the same thing twice", () => {
  const windows = [
    signinMessage(fbError("auth/invalid-credential")),
    signinMessage(fbError("auth/user-disabled")),
    signinMessage(fbError("auth/too-many-requests")),
    signinMessage(fbError("auth/network-request-failed")),
    signinMessage(fbError("auth/internal-error")),
    signupMessage(fbError("functions/already-exists", "A user with this email already exists.")),
    signupMessage(fbError("functions/failed-precondition", "Selected service provider is not active.")),
    signupMessage(fbError("functions/unavailable")),
    serviceProviderListMessage(),
    passwordResetMessage(fbError("auth/too-many-requests")),
    passwordResetMessage(fbError("auth/internal-error")),
    changePasswordMessage(fbError("auth/network-request-failed")),
    changePasswordMessage(fbError("auth/internal-error")),
  ];

  for (const { title, message } of windows) {
    assert.ok(title.length > 0 && message.length > 0);
    assert.ok(
      !message.toLowerCase().startsWith(title.toLowerCase()),
      `"${message}" must not open by repeating its title "${title}"`,
    );
  }
});

test("sign in never blames the network for a wrong password", () => {
  assert.notEqual(
    signinMessage(fbError("auth/invalid-credential")).message,
    signinMessage(fbError("auth/network-request-failed")).message,
  );
});

test("sign up keeps the reason the back end gave", () => {
  const taken = signupMessage(
    fbError("functions/already-exists", "A user with this email already exists."),
  );
  assert.equal(taken.title, "Email already used");
  assert.match(taken.message, /Sign in instead, or use Lost access\?/);

  assert.equal(
    signupMessage(
      fbError("functions/failed-precondition", "Selected service provider is not active."),
    ).title,
    "Service provider not active",
  );

  assert.equal(
    signupMessage(
      fbError(
        "functions/failed-precondition",
        "No responsible manager was found for the selected service provider.",
      ),
    ).title,
    "No manager for that service provider",
  );

  assert.equal(
    signupMessage(
      fbError("functions/invalid-argument", "Password must be at least 8 characters."),
    ).message,
    "Password must be at least 8 characters.",
  );

  assert.equal(
    signupMessage(fbError("functions/unavailable")).title,
    "No connection",
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

test("an invitation hands over its one-time password, once", () => {
  const sent = invitationSentMessage({
    role: "Supervisor",
    name: "Thabo",
    email: "thabo@example.com",
    oneTimePassword: "K7RM-4TQD-9XBV",
  });

  assert.equal(sent.title, "Supervisor invited");
  assert.match(sent.message, /K7RM-4TQD-9XBV/);
  assert.match(sent.message, /thabo@example\.com/);
  assert.match(sent.message, /never show it again/);
  assert.match(sent.message, /must set their own password/);

  // If the back end gives nothing back, the person is not told a password that does not exist.
  const missing = invitationSentMessage({
    role: "Manager",
    name: "Thabo",
    email: "thabo@example.com",
  });

  assert.match(missing.message, /Lost access\?/);
  assert.doesNotMatch(missing.message, /undefined/);
});

test("a picker that could not load says so", () => {
  assert.match(serviceProviderListMessage().title, /Could not load the service providers/);
  assert.match(serviceProviderListMessage().message, /Check your signal/);
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
    "Wait a few minutes and try again.",
  );
  assert.equal(
    passwordResetMessage(fbError("auth/invalid-email")).message,
    "That does not look like an email address.",
  );
  assert.equal(
    passwordResetMessage(fbError("auth/network-request-failed")).title,
    "No connection",
  );
  assert.match(
    passwordResetMessage(fbError("auth/internal-error")).title,
    /Could not send the reset link/,
  );
});

test("change password tells a stale sign-in apart from a short password", () => {
  assert.equal(
    changePasswordMessage(fbError("auth/weak-password")).message,
    "Password must be at least 8 characters.",
  );
  assert.match(
    changePasswordMessage(fbError("auth/requires-recent-login")).message,
    /fresh sign-in/,
  );
  assert.equal(
    changePasswordMessage(fbError("auth/network-request-failed")).message,
    "Check your signal and try again.",
  );
  assert.match(changePasswordMessage(fbError("auth/internal-error")).message, /tell your manager/);
});
