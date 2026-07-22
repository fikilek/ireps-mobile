export const INFORMAL_ERF_QUEUE_FORM_TYPE =
  "INFORMAL_ERF_CREATE";

export const INFORMAL_ERF_PAYLOAD_SCHEMA_VERSION = 1;

export const INFORMAL_ERF_SITE_PHOTO_TAG =
  "informalErfSitePhoto";

export const INFORMAL_ERF_CREATION_REASONS = Object.freeze([
  {
    label: "No formal ERF exists at this location",
    value: "NO_FORMAL_ERF",
  },
  {
    label: "Structure is in an unmapped informal area",
    value: "UNMAPPED_INFORMAL_AREA",
  },
  {
    label: "Meter is outside mapped ERFs",
    value: "METER_OUTSIDE_MAPPED_ERF",
  },
  {
    label: "Service connection has no matching ERF",
    value: "SERVICE_CONNECTION_WITHOUT_ERF",
  },
  {
    label: "Cadastral information is incomplete",
    value: "CADASTRAL_DATA_INCOMPLETE",
  },
  {
    label: "Correct formal ERF cannot be identified",
    value: "FORMAL_ERF_NOT_IDENTIFIABLE",
  },
  {
    label: "Other",
    value: "OTHER",
  },
]);

export const INFORMAL_ERF_CREATION_REASON_CODES = new Set(
  INFORMAL_ERF_CREATION_REASONS.map(
    (option) => option.value,
  ),
);

export const getInformalErfCreationReasonLabel = (
  reasonCode,
) => {
  return (
    INFORMAL_ERF_CREATION_REASONS.find(
      (option) => option.value === reasonCode,
    )?.label || "Unknown reason"
  );
};
