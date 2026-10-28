// Strict environment resolution for iREPS Mobile Firebase.
// Lock 1: Explicit EXPO_PUBLIC_APP_ENV variable (strictly validated, zero guessing).
// Lock 2: Hardware/OS native package identity fallback (com.ireps.mobile.test, etc.).
// Fail-Fast: Throws hard error immediately if neither is valid.

export function resolveAppEnv({ env = process.env, constants = null } = {}) {
  // Lock 1: Explicit environment variable (strictly validated, zero guessing)
  const envVar = (env?.EXPO_PUBLIC_APP_ENV || env?.APP_ENV || "").trim().toLowerCase();
  if (envVar && ["dev", "test", "trial", "live"].includes(envVar)) {
    return envVar;
  }

  // Lock 2: Hardware/OS native package identity fallback
  const androidPackage = constants?.expoConfig?.android?.package || "";
  if (androidPackage === "com.ireps.mobile.test") return "test";
  if (androidPackage === "com.ireps.mobile") return "live";
  if (androidPackage === "com.ireps.mobile.dev") return "dev";
  if (androidPackage === "com.ireps.mobile.trial") return "trial";

  // Fail-Fast: Throw hard error if neither is valid
  throw new Error(
    `[iREPS Firebase] Fatal: Cannot resolve application environment. ` +
    `EXPO_PUBLIC_APP_ENV is missing/unrecognized ("${envVar}") and Android package is "${androidPackage}". ` +
    `Refusing to start.`
  );
}
