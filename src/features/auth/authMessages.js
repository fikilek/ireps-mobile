// AU-R001: the words a person gets when a way into iREPS fails. The rule set's Error Register is the
// only source of these; nothing else writes its own wording for the same failure.

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULE_TEXT = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;

// The wait before Sign in stops expecting the person's record and gives them their screen back.
export const PROFILE_WAIT_MS = 30000;

// Each of these is shown in a window with a title, and the message never repeats its title.
const NO_CONNECTION = {
  title: "No connection",
  message: "Check your signal and try again.",
};
const NOT_AN_EMAIL = {
  title: "Check the email",
  message: "That does not look like an email address.",
};
const TOO_MANY = {
  title: "Too many tries",
  message: "Wait a few minutes and try again.",
};
const TRY_AGAIN_AND_REPORT = "Try again, and tell your manager if it keeps happening.";

function errorCode(error) {
  return String(error?.code || "").trim();
}

function errorText(error) {
  return String(error?.message || "").trim();
}

function isNetworkFailure(error) {
  const code = errorCode(error);

  if (code === "auth/network-request-failed") return true;
  if (code === "functions/unavailable") return true;
  if (code === "unavailable") return true;

  return /network|offline|internet|timed out|timeout/i.test(errorText(error));
}

// A callable answers with "functions/already-exists"; the same failure raised on the server is
// "already-exists". Both are read the same way.
function callableCode(error) {
  return errorCode(error).replace(/^functions\//, "");
}

// A callable's message arrives wrapped by the client as "FirebaseError: ..." on some paths.
function callableText(error) {
  return errorText(error).replace(/^(FirebaseError:\s*)+/i, "").trim();
}

/* =====================================================
   SIGN IN  (AU-R001 7.1)
   ===================================================== */
export function signinMessage(error) {
  const code = errorCode(error);

  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found" ||
    code === "auth/invalid-login-credentials"
  ) {
    return { title: "Sign in failed", message: "Email or password is not right." };
  }

  if (code === "auth/invalid-email") return NOT_AN_EMAIL;

  if (code === "auth/user-disabled") {
    return { title: "Account stopped", message: "Speak to your manager." };
  }

  if (code === "auth/too-many-requests") return TOO_MANY;

  if (code === "auth/profile-wait") {
    return {
      title: "Your details did not load",
      message: "You are signed in, but they did not arrive. Check your signal and try again.",
    };
  }

  if (isNetworkFailure(error)) return NO_CONNECTION;

  return { title: "Sign in failed", message: TRY_AGAIN_AND_REPORT };
}

/* =====================================================
   SIGN UP  (AU-R001 7.2)
   ===================================================== */
export function signupMessage(error) {
  const code = callableCode(error);
  const text = callableText(error);

  if (code === "already-exists" || /already exists/i.test(text)) {
    return {
      title: "Email already used",
      message: "Sign in instead, or use Lost access?",
    };
  }

  if (code === "failed-precondition" && /manager/i.test(text)) {
    return {
      title: "No manager for that service provider",
      message: "Ask your manager to sort this out before you sign up.",
    };
  }

  if (code === "failed-precondition" || /not active/i.test(text)) {
    return {
      title: "Service provider not active",
      message: "Choose another, or ask your manager.",
    };
  }

  if (code === "invalid-argument") {
    return { title: "Check the form", message: text || PASSWORD_RULE_TEXT };
  }

  if (isNetworkFailure(error)) return NO_CONNECTION;

  return { title: "Sign up failed", message: text || TRY_AGAIN_AND_REPORT };
}

// The signup picker cannot be left empty and silent (AU-R001 2).
export function serviceProviderListMessage() {
  return {
    title: "Could not load the service providers",
    message: "Check your signal and try again.",
  };
}

/* =====================================================
   AN INVITATION  (AU-R001 9)
   ===================================================== */

// The one-time password is shown once, here, to whoever sent the invitation. iREPS cannot email it,
// so this window is the only place it ever appears.
export function invitationSentMessage({ role, name, email, oneTimePassword }) {
  const who = String(name || "").trim() || "They";

  if (!oneTimePassword) {
    return {
      title: `${role} invited`,
      message: `${who} can sign in as ${email}, but iREPS did not give back a one-time password. Ask them to use Lost access? on the sign-in screen to set one.`,
    };
  }

  return {
    title: `${role} invited`,
    message: `${who} signs in as ${email} with this one-time password:\n\n${oneTimePassword}\n\nWrite it down or send it to them now — iREPS cannot email it and will never show it again. They must set their own password the first time they sign in.`,
  };
}

/* =====================================================
   PASSWORD RESET  (AU-R001 7.3)
   ===================================================== */

// The same words whether or not the email has an account. Nothing here tells a stranger who is on
// iREPS.
export function passwordResetSentMessage(email) {
  return {
    title: "Reset link sent",
    message: email
      ? `If ${email} belongs to an iREPS account, a reset link is on its way. Check the inbox, and the junk folder.`
      : "If that email belongs to an iREPS account, a reset link is on its way. Check the inbox, and the junk folder.",
  };
}

export function passwordResetMessage(error) {
  const code = errorCode(error);

  if (code === "auth/invalid-email") return NOT_AN_EMAIL;

  if (code === "auth/too-many-requests") return TOO_MANY;

  if (isNetworkFailure(error)) return NO_CONNECTION;

  return { title: "Could not send the reset link", message: TRY_AGAIN_AND_REPORT };
}

/* =====================================================
   CHANGE PASSWORD  (AU-R001 7.4)
   ===================================================== */
export function changePasswordMessage(error) {
  const code = errorCode(error);

  if (code === "auth/weak-password") {
    return { title: "Password too short", message: PASSWORD_RULE_TEXT };
  }

  if (code === "auth/requires-recent-login") {
    return {
      title: "Sign in again",
      message: "For your safety, iREPS needs a fresh sign-in before you change your password.",
    };
  }

  if (isNetworkFailure(error)) return NO_CONNECTION;

  return { title: "Password not changed", message: TRY_AGAIN_AND_REPORT };
}

// The two checks a password must pass before it is sent anywhere (AU-R001 1).
export function passwordProblem(password, confirmPassword) {
  const typed = String(password ?? "");
  const confirmed = String(confirmPassword ?? "");

  if (typed.length < PASSWORD_MIN_LENGTH) {
    return { title: "Password too short", message: PASSWORD_RULE_TEXT };
  }

  if (typed !== confirmed) {
    return { title: "Passwords differ", message: "The two passwords are not the same." };
  }

  return null;
}
