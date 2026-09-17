// AU-R001: the words a person gets when a way into iREPS fails. The rule set's Error Register is the
// only source of these; nothing else writes its own wording for the same failure.

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULE_TEXT = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;

// The wait before Sign in stops expecting the person's record and gives them their screen back.
export const PROFILE_WAIT_MS = 30000;

const NO_CONNECTION = "No connection. Check your signal and try again.";
const NOT_AN_EMAIL = "That does not look like an email address.";
const TOO_MANY = "Too many tries. Wait a few minutes and try again.";

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

  if (code === "auth/invalid-email") {
    return { title: "Sign in failed", message: NOT_AN_EMAIL };
  }

  if (code === "auth/user-disabled") {
    return {
      title: "Account stopped",
      message: "This account has been stopped. Speak to your manager.",
    };
  }

  if (code === "auth/too-many-requests") {
    return { title: "Too many tries", message: TOO_MANY };
  }

  if (code === "auth/profile-wait") {
    return {
      title: "Details did not load",
      message:
        "You are signed in, but your details did not load. Check your signal and try again.",
    };
  }

  if (isNetworkFailure(error)) {
    return { title: "No connection", message: NO_CONNECTION };
  }

  return {
    title: "Sign in failed",
    message: "Sign in failed. Try again, and tell your manager if it keeps happening.",
  };
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
      message: "An account already uses this email. Sign in instead, or use Lost access?",
    };
  }

  if (code === "failed-precondition" && /manager/i.test(text)) {
    return {
      title: "No manager for that service provider",
      message:
        "No manager is set for that service provider. Ask your manager to sort this out before you sign up.",
    };
  }

  if (code === "failed-precondition" || /not active/i.test(text)) {
    return {
      title: "Service provider not active",
      message: "That service provider is not active. Choose another, or ask your manager.",
    };
  }

  if (code === "invalid-argument") {
    return { title: "Check the form", message: text || PASSWORD_RULE_TEXT };
  }

  if (isNetworkFailure(error)) {
    return { title: "No connection", message: NO_CONNECTION };
  }

  return {
    title: "Sign up failed",
    message:
      text || "Sign up failed. Try again, and tell your manager if it keeps happening.",
  };
}

// The signup picker cannot be left empty and silent (AU-R001 2).
export function serviceProviderListMessage() {
  return {
    title: "Service providers",
    message: "Could not load the service providers. Check your signal and try again.",
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

  if (code === "auth/invalid-email") {
    return { title: "Check the email", message: NOT_AN_EMAIL };
  }

  if (code === "auth/too-many-requests") {
    return { title: "Too many tries", message: TOO_MANY };
  }

  if (isNetworkFailure(error)) {
    return { title: "No connection", message: NO_CONNECTION };
  }

  return {
    title: "Could not send",
    message:
      "Could not send the reset link. Try again, and tell your manager if it keeps happening.",
  };
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
      message: "For your safety, sign in again before changing your password.",
    };
  }

  if (isNetworkFailure(error)) {
    return { title: "No connection", message: NO_CONNECTION };
  }

  return {
    title: "Password not changed",
    message:
      "Could not change the password. Try again, and tell your manager if it keeps happening.",
  };
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
