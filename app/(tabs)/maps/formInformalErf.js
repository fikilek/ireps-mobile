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

  const selectedLatitude = toOptionalNumber(
    params.selectedLatitude ?? params.latitude,
  );
  const selectedLongitude = toOptionalNumber(
    params.selectedLongitude ?? params.longitude,
  );

  const initialProposedErfLocation =
    selectedLatitude != null && selectedLongitude != null
      ? {
          lat: selectedLatitude,
          lng: selectedLongitude,
        }
      : null;

  const deviceLatitude = toOptionalNumber(params.deviceLatitude);
  const deviceLongitude = toOptionalNumber(params.deviceLongitude);

  const initialDeviceLocation =
    deviceLatitude != null && deviceLongitude != null
      ? {
          latitude: deviceLatitude,
          longitude: deviceLongitude,
          accuracyM: toOptionalNumber(params.accuracyM),
          altitudeM: toOptionalNumber(params.altitudeM),
          headingDegrees: toOptionalNumber(params.headingDegrees),
          speedMps: toOptionalNumber(params.speedMps),
          capturedAtMs:
            toOptionalNumber(params.capturedAtMs) ?? Date.now(),
        }
      : null;

  return (
    <FormInformalErf
      initialProposedErfLocation={initialProposedErfLocation}
      initialDeviceLocation={initialDeviceLocation}
    />
  );
}
