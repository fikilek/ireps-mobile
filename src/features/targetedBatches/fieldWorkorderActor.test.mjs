import test from "node:test";
import assert from "node:assert/strict";

import {
  getServiceProviderRelationshipType,
  isFieldWorkorderActor,
} from "./fieldWorkorderActor.js";

// ---- TB-R051: My Work Orders opens only for the FWR and SPV who can open it today ----

test("FWR is a field work order actor whatever the profile says", () => {
  assert.equal(isFieldWorkorderActor({ actorRole: "FWR", profile: {} }), true);
  assert.equal(isFieldWorkorderActor({ actorRole: " fwr ", profile: null }), true);
  assert.equal(
    isFieldWorkorderActor({
      actorRole: "FWR",
      profile: { employment: { serviceProvider: { relationshipType: "MNC" } } },
    }),
    true,
  );
});

test("SPV is a field work order actor unless the profile says MNC-side", () => {
  assert.equal(isFieldWorkorderActor({ actorRole: "SPV", profile: {} }), true);
  assert.equal(isFieldWorkorderActor({ actorRole: "spv", profile: undefined }), true);
  assert.equal(
    isFieldWorkorderActor({
      actorRole: "SPV",
      profile: { employment: { serviceProvider: { relationshipType: "SUBC" } } },
    }),
    true,
  );

  const mncProfiles = [
    { employment: { serviceProvider: { relationshipType: "MNC" } } },
    { employment: { serviceProvider: { clientRelationshipType: " mnc " } } },
    { employment: { relationshipType: "MNC" } },
    { serviceProvider: { relationshipType: "MNC" } },
    { serviceProvider: { clientRelationshipType: "MNC" } },
  ];
  for (const profile of mncProfiles) {
    assert.equal(isFieldWorkorderActor({ actorRole: "SPV", profile }), false, JSON.stringify(profile));
  }
});

test("every other role, and no role, is refused", () => {
  for (const actorRole of ["MNG", "ADM", "SPU", "GST", "NAv", "", " ", null, undefined, 0]) {
    assert.equal(isFieldWorkorderActor({ actorRole, profile: {} }), false, String(actorRole));
  }
  assert.equal(isFieldWorkorderActor({}), false);
  assert.equal(isFieldWorkorderActor(), false);
});

test("relationship type is the first non-empty field, in My Work Orders' order", () => {
  assert.equal(getServiceProviderRelationshipType(), "");
  assert.equal(getServiceProviderRelationshipType(null), "");
  assert.equal(getServiceProviderRelationshipType({}), "");
  // A blank first field does not hide a later one.
  assert.equal(
    getServiceProviderRelationshipType({
      employment: { serviceProvider: { relationshipType: "  ", clientRelationshipType: "subc" } },
      serviceProvider: { relationshipType: "MNC" },
    }),
    "SUBC",
  );
  // The employment service provider wins over the root service provider.
  assert.equal(
    getServiceProviderRelationshipType({
      employment: { relationshipType: "SUBC" },
      serviceProvider: { relationshipType: "MNC" },
    }),
    "SUBC",
  );
  // An SPV whose first relationship field is not MNC stays allowed.
  assert.equal(
    isFieldWorkorderActor({
      actorRole: "SPV",
      profile: {
        employment: { relationshipType: "SUBC" },
        serviceProvider: { relationshipType: "MNC" },
      },
    }),
    true,
  );
});
