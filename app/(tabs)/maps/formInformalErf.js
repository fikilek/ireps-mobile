import { useLocalSearchParams } from "expo-router";

import FormInformalErf from "../../../src/features/erfs/FormInformalErf";

const readSingleParam = (value) =>
  Array.isArray(value) ? value[0] : value;

const toOptionalNumber = (value) => {
  const raw = readSingleParam(value);
  if (raw == null || raw === "") return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function InformalErfFormScreen() {
  const params = useLocalSearchParams();

  const latitude = toOptionalNumber(params.latitude);
  const longitude = toOptionalNumber(params.longitude);

  const initialDeviceLocation =
    latitude != null && longitude != null
      ? {
          latitude,
          longitude,
          accuracyM: toOptionalNumber(params.accuracyM),
          capturedAtMs:
            toOptionalNumber(params.capturedAtMs) ?? Date.now(),
        }
      : null;

  return (
    <FormInformalErf initialDeviceLocation={initialDeviceLocation} />
  );
}
