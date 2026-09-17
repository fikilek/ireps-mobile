// TB-R051: who may open My Work Orders on the phone ("the FWR and SPV who can
// open them today"). Pure, so My Work Orders and the batch checks on the
// Premises and Maps tabs share one gate.

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function readFirstString(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean) return clean;
  }

  return "";
}

export function getServiceProviderRelationshipType(profile = {}) {
  return normalizeUpper(
    readFirstString(
      profile?.employment?.serviceProvider?.relationshipType,
      profile?.employment?.serviceProvider?.clientRelationshipType,
      profile?.employment?.relationshipType,
      profile?.serviceProvider?.relationshipType,
      profile?.serviceProvider?.clientRelationshipType,
    ),
  );
}

export function isFieldWorkorderActor({ actorRole, profile } = {}) {
  const cleanRole = normalizeUpper(actorRole);

  if (cleanRole === "FWR") return true;

  if (cleanRole !== "SPV") return false;

  const relationshipType = getServiceProviderRelationshipType(profile);

  // If the app profile knows this SPV is MNC-side, block this field screen.
  // Some current user profiles only carry role + serviceProvider id, so unknown
  // relationship remains allowed and the backend still performs final authority.
  if (relationshipType === "MNC") return false;

  return true;
}
