import { useCallback, useMemo } from "react";

import { useIrepsLookupOptions } from "./useIrepsLookupOptions";

function isEnabled(option) {
  return option?.enabled !== false;
}

function optionLabels(options) {
  return (Array.isArray(options) ? options : [])
    .filter(isEnabled)
    .map((option) => option.label)
    .filter(Boolean);
}

function buildAnomalies(anomalyOptions, detailOptions) {
  const details = Array.isArray(detailOptions) ? detailOptions : [];

  return (Array.isArray(anomalyOptions) ? anomalyOptions : [])
    .filter(isEnabled)
    .map((anomaly) => ({
      anomaly: anomaly.label,
      anomalyDetails: details
        .filter(
          (detail) =>
            isEnabled(detail) &&
            String(detail?.parentCode || "").toUpperCase() ===
              String(anomaly?.code || "").toUpperCase(),
        )
        .map((detail) => detail.label)
        .filter(Boolean),
    }))
    .filter((anomaly) => anomaly.anomaly);
}

export function useMeterFormLookupOptions(meterType) {
  const manufacturerLookup = useIrepsLookupOptions("METER_MANUFACTURER");
  const anomalyLookup = useIrepsLookupOptions("METER_ANOMALY");
  const anomalyDetailLookup = useIrepsLookupOptions("ANOMALY_DETAIL");
  const normalisationLookup = useIrepsLookupOptions(
    "METER_NORMALISATION_ACTION",
  );
  const placementLookup = useIrepsLookupOptions("METER_PLACEMENT");
  const noAccessReasonLookup = useIrepsLookupOptions(
    "METER_NO_ACCESS_REASON",
  );

  const normalizedMeterType = String(meterType || "")
    .trim()
    .toLowerCase();

  const manufacturerOptions = useMemo(() => {
    return (manufacturerLookup.options || [])
      .filter(isEnabled)
      .filter((option) => {
        if (!Array.isArray(option?.appliesTo) || option.appliesTo.length === 0) {
          return true;
        }

        return option.appliesTo.includes(normalizedMeterType);
      })
      .map((option) => option.label)
      .filter(Boolean);
  }, [manufacturerLookup.options, normalizedMeterType]);

  const anomalies = useMemo(
    () =>
      buildAnomalies(anomalyLookup.options, anomalyDetailLookup.options),
    [anomalyLookup.options, anomalyDetailLookup.options],
  );

  const normalisationOptions = useMemo(() => {
    return (normalisationLookup.options || [])
      .filter(isEnabled)
      .map((option) => (option.code === "NONE" ? "none" : option.label))
      .filter(Boolean);
  }, [normalisationLookup.options]);

  const placementOptions = useMemo(
    () => optionLabels(placementLookup.options),
    [placementLookup.options],
  );

  const noAccessReasons = useMemo(
    () => optionLabels(noAccessReasonLookup.options),
    [noAccessReasonLookup.options],
  );

  const getOptions = useCallback(
    (name) => {
      switch (name) {
        case "water_manufacturers":
        case "elec_manufacturers":
          return manufacturerOptions;

        case "anomalies":
          return anomalies;

        case "norm_actions":
          return normalisationOptions;

        case "placements":
          return placementOptions;

        default:
          return [];
      }
    },
    [
      anomalies,
      manufacturerOptions,
      normalisationOptions,
      placementOptions,
    ],
  );

  return {
    getOptions,
    noAccessReasons,
  };
}
