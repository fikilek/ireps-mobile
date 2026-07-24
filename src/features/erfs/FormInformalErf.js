import { useRouter } from "expo-router";
import { Formik } from "formik";
import { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Button,
  Modal,
  Portal,
  RadioButton,
  Surface,
  TextInput,
} from "react-native-paper";

import { FormSection } from "../../../components/forms/FormSection";
import InformalErfLocationPicker from "../../../components/maps/InformalErfLocationPicker";
import { IrepsMedia } from "../../../components/media/IrepsMedia";
import { useGeo } from "../../context/GeoContext";
import { getSafeCoords } from "../../context/MapContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../hooks/useAuth";
import { submitInformalErfWithFallback } from "../../services/informalErfSubmissionController";
import { ForensicFooter } from "../meters/ForensicFooter";

const NEARBY_RADIUS_M = 350;
const MAX_CONTEXT_ITEMS = 100;

const INFORMAL_ERF_CREATION_REASONS = Object.freeze([
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

const INFORMAL_ERF_CREATION_REASON_CODES = new Set(
  INFORMAL_ERF_CREATION_REASONS.map((option) => option.value),
);

const BOUNDARY_COORDINATE_PRECISION = 7;

const normalizeBoundaryPoint = (value) => {
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    (lat === 0 && lng === 0)
  ) {
    return null;
  }

  return { lat, lng };
};

const getBoundaryValidationError = (value) => {
  if (!Array.isArray(value) || value.length < 3) {
    return "Draw and confirm at least three Informal ERF boundary points.";
  }

  const normalizedPoints = value.map(normalizeBoundaryPoint);

  if (normalizedPoints.some((point) => !point)) {
    return "Every Informal ERF boundary point must contain a valid latitude and longitude.";
  }

  const uniquePointKeys = new Set(
    normalizedPoints.map(
      (point) =>
        `${point.lat.toFixed(BOUNDARY_COORDINATE_PRECISION)}:${point.lng.toFixed(
          BOUNDARY_COORDINATE_PRECISION,
        )}`,
    ),
  );

  if (uniquePointKeys.size !== normalizedPoints.length) {
    return "Every Informal ERF boundary point must be unique.";
  }

  return null;
};

const getCreationReasonLabel = (reasonCode) => {
  return (
    INFORMAL_ERF_CREATION_REASONS.find((option) => option.value === reasonCode)
      ?.label || "Select a creation reason"
  );
};

const validateInformalErf = (values) => {
  const errors = {};

  const boundaryValidationError = getBoundaryValidationError(
    values?.boundaryPoints,
  );

  if (boundaryValidationError) {
    errors.boundaryPoints = boundaryValidationError;
  }

  const reasonCode = String(values?.reasonCode || "").trim();

  if (!INFORMAL_ERF_CREATION_REASON_CODES.has(reasonCode)) {
    errors.reasonCode = "Select a reason for creating the Informal ERF.";
  }

  if (reasonCode === "OTHER") {
    const reasonOther = String(values?.reasonOther || "").trim();

    if (!reasonOther) {
      errors.reasonOther = "Enter the other creation reason.";
    } else if (reasonOther.length > 250) {
      errors.reasonOther =
        "The other creation reason cannot exceed 250 characters.";
    }
  }

  const hasRequiredSitePhoto =
    Array.isArray(values?.media) &&
    values.media.some((item) => {
      const isCorrectTag = item?.tag === "informalErfSitePhoto";
      const hasMediaLocation =
        !!String(item?.uri || "").trim() || !!String(item?.url || "").trim();

      return isCorrectTag && hasMediaLocation;
    });

  if (!hasRequiredSitePhoto) {
    errors.media = "Informal ERF site photograph is required.";
  }

  return errors;
};

const toLatLng = (value) => {
  if (value?.lat != null && value?.lng != null) {
    return {
      lat: Number(value.lat),
      lng: Number(value.lng),
    };
  }

  if (value?.latitude != null && value?.longitude != null) {
    return {
      lat: Number(value.latitude),
      lng: Number(value.longitude),
    };
  }

  if (Array.isArray(value) && value.length >= 2) {
    return {
      lat: Number(value[0]),
      lng: Number(value[1]),
    };
  }

  return null;
};

const readCoordinateFromAny = (...values) => {
  for (const value of values) {
    const coordinate = toLatLng(value);

    if (
      coordinate &&
      Number.isFinite(coordinate.lat) &&
      Number.isFinite(coordinate.lng)
    ) {
      return coordinate;
    }
  }

  return null;
};

const getBoundaryCentroid = (boundary = []) => {
  if (!Array.isArray(boundary) || boundary.length === 0) return null;

  const validPoints = boundary
    .map((point) => ({
      lat: Number(point?.latitude ?? point?.lat),
      lng: Number(point?.longitude ?? point?.lng),
    }))
    .filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
    );

  if (!validPoints.length) return null;

  const totals = validPoints.reduce(
    (accumulator, point) => ({
      lat: accumulator.lat + point.lat,
      lng: accumulator.lng + point.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: totals.lat / validPoints.length,
    lng: totals.lng / validPoints.length,
  };
};

const distanceMeters = (from, to) => {
  const a = toLatLng(from);
  const b = toLatLng(to);

  if (
    !a ||
    !b ||
    !Number.isFinite(a.lat) ||
    !Number.isFinite(a.lng) ||
    !Number.isFinite(b.lat) ||
    !Number.isFinite(b.lng)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadiusM = 6371000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusM * Math.asin(Math.sqrt(haversine));
};

const formatCoordinate = (value) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(6) : "N/A";

export default function FormInformalErf({
  initialProposedErfLocation,
  initialDeviceLocation = null,
}) {
  const router = useRouter();
  const { geoState } = useGeo();
  const { all } = useWarehouse();
  const { profile, user } = useAuth();
  const [reasonModalVisible, setReasonModalVisible] = useState(false);

  const agentUid = user?.uid || "unknown_uid";
  const agentName = profile?.profile?.displayName || "Field Agent";

  const selectedLm = geoState?.selectedLm || null;
  const selectedWard = geoState?.selectedWard || null;

  const selectedMapPoint = useMemo(() => {
    const coordinate = toLatLng(initialProposedErfLocation);

    if (
      !coordinate ||
      !Number.isFinite(coordinate.lat) ||
      !Number.isFinite(coordinate.lng)
    ) {
      return null;
    }

    return coordinate;
  }, [initialProposedErfLocation]);

  const initialValues = useMemo(
    () => ({
      boundaryPoints: [],
      reasonCode: "",
      reasonOther: "",
      media: [],
    }),
    [],
  );

  const lmPcode =
    selectedLm?.pcode || selectedLm?.lmPcode || selectedLm?.id || "NAv";

  const wardPcode =
    selectedWard?.pcode || selectedWard?.wardPcode || selectedWard?.id || "NAv";

  const devicePoint = useMemo(() => {
    if (!initialDeviceLocation) return null;

    const latitude = Number(initialDeviceLocation.latitude);
    const longitude = Number(initialDeviceLocation.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return {
      lat: latitude,
      lng: longitude,
    };
  }, [initialDeviceLocation]);

  const selectedWardBoundary = useMemo(() => {
    const wardId = selectedWard?.id || selectedWard?.pcode || null;
    const heavyWard = wardId ? all?.geoLibrary?.[wardId] : null;
    const geometry =
      heavyWard?.geometry || selectedWard?.geometry || heavyWard || null;

    const coordinates = getSafeCoords(geometry);
    return Array.isArray(coordinates) ? coordinates : [];
  }, [all?.geoLibrary, selectedWard]);

  const nearbyErfs = useMemo(() => {
    if (!selectedMapPoint || !Array.isArray(all?.erfs)) return [];

    return all.erfs
      .map((erf) => {
        const erfId =
          erf?.id || erf?.erfId || erf?.pcode || erf?.erfNo || "NAv";

        const heavyGeometry =
          all?.geoLibrary?.[erfId] || all?.geoEntries?.[erfId] || null;

        const boundary = getSafeCoords(
          heavyGeometry?.geometry || erf?.geometry || heavyGeometry || null,
        );

        const centroid = readCoordinateFromAny(
          erf?.geometry?.centroid,
          heavyGeometry?.centroid,
          erf?.centroid,
          erf?.coordinate,
          erf?.gps,
          getBoundaryCentroid(boundary),
        );

        const distanceM = distanceMeters(selectedMapPoint, centroid);

        if (
          !centroid ||
          !Array.isArray(boundary) ||
          boundary.length === 0 ||
          distanceM > NEARBY_RADIUS_M
        ) {
          return null;
        }

        return {
          id: erfId,
          erfNo:
            erf?.erfNo ||
            erf?.erf_no ||
            erf?.erfNumber ||
            erf?.sg?.erfNo ||
            erf?.sg?.parcelNo ||
            erf?.parcelNo ||
            erf?.code ||
            "NAv",
          centroid,
          boundary,
          distanceM,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, MAX_CONTEXT_ITEMS);
  }, [all?.erfs, all?.geoEntries, all?.geoLibrary, selectedMapPoint]);

  const nearbyPremises = useMemo(() => {
    if (!selectedMapPoint || !Array.isArray(all?.prems)) return [];

    return all.prems
      .map((premise) => {
        const coordinate = readCoordinateFromAny(
          premise?.geometry?.centroid,
          premise?.coordinate,
          premise?.gps,
          premise?.location?.gps,
          premise?.address?.gps,
        );

        const distanceM = distanceMeters(selectedMapPoint, coordinate);

        if (!coordinate || distanceM > NEARBY_RADIUS_M) {
          return null;
        }

        return {
          id: premise?.id || premise?.premiseId || "NAv",
          coordinate,
          address: premise?.address || {},
          propertyType: premise?.propertyType || {},
          distanceM,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, MAX_CONTEXT_ITEMS);
  }, [all?.prems, selectedMapPoint]);

  const nearbyMeters = useMemo(() => {
    if (!selectedMapPoint || !Array.isArray(all?.meters)) return [];

    return all.meters
      .map((meter) => {
        const coordinate = readCoordinateFromAny(
          meter?.accessData?.gps,
          meter?.ast?.location?.gps,
          meter?.location?.gps,
          meter?.geometry?.centroid,
          meter?.coordinate,
          meter?.gps,
          meter?.astData?.location?.gps,
        );

        const distanceM = distanceMeters(selectedMapPoint, coordinate);

        if (!coordinate || distanceM > NEARBY_RADIUS_M) {
          return null;
        }

        return {
          id:
            meter?.id ||
            meter?.ast?.astData?.astId ||
            meter?.astData?.astId ||
            "NAv",
          coordinate,
          meterType:
            meter?.meterType ||
            meter?.ast?.meterType ||
            meter?.ast?.astData?.meter?.type ||
            meter?.astData?.meter?.type ||
            "NAv",
          distanceM,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, MAX_CONTEXT_ITEMS);
  }, [all?.meters, selectedMapPoint]);

  if (!selectedMapPoint) {
    return (
      <View style={styles.centeredScreen}>
        <Surface style={styles.messageCard}>
          <Text style={styles.messageTitle}>MAP POSITION REQUIRED</Text>
          <Text style={styles.messageText}>
            Return to the map and long press the exact position where the
            Informal ERF must be created.
          </Text>
          <Button mode="contained" onPress={() => router.back()}>
            RETURN TO MAP
          </Button>
        </Surface>
      </View>
    );
  }

  return (
    <Formik
      initialValues={initialValues}
      initialTouched={{
        boundaryPoints: true,
      }}
      validate={validateInformalErf}
      validateOnMount={true}
      validateOnChange={true}
      validateOnBlur={false}
      onSubmit={async (values) => {
        if (!devicePoint) {
          Alert.alert(
            "Device GPS Not Captured",
            "The Informal ERF boundary is captured, but iREPS has not yet captured the phone GPS required for the forensic submission record. Keep location enabled, return to the map, and try again.",
          );
          return;
        }

        const submissionResult = await submitInformalErfWithFallback({
          payloadInput: {
            lmPcode,
            wardPcode,

            deviceLocation: {
              latitude: initialDeviceLocation?.latitude,
              longitude: initialDeviceLocation?.longitude,
              accuracyM: initialDeviceLocation?.accuracyM,
              altitudeM: initialDeviceLocation?.altitudeM,
              headingDegrees: initialDeviceLocation?.headingDegrees,
              speedMps: initialDeviceLocation?.speedMps,
              capturedAtMs: initialDeviceLocation?.capturedAtMs,
            },

            boundaryPoints: Array.isArray(values?.boundaryPoints)
              ? values.boundaryPoints.map((point) => ({
                  lat: Number(point?.lat ?? point?.latitude),
                  lng: Number(point?.lng ?? point?.longitude),
                }))
              : [],

            reasonCode: values?.reasonCode,

            reasonOther:
              values?.reasonCode === "OTHER"
                ? String(values?.reasonOther || "").trim()
                : null,

            media: Array.isArray(values?.media) ? values.media : [],
          },

          context: {
            lmPcode,
            lmName: selectedLm?.name || selectedLm?.id || "NAv",
            wardPcode,
            wardName:
              selectedWard?.name ||
              selectedWard?.pcode ||
              selectedWard?.id ||
              "NAv",
          },

          createdByUid: agentUid,
          createdByUser: agentName,
        });

        if (submissionResult?.mode === "ONLINE") {
          Alert.alert(
            "Informal ERF Created",
            submissionResult?.duplicate
              ? "This Informal ERF was already created. No duplicate was added."
              : `The Informal ERF was created successfully.\n\n${submissionResult?.erfId || ""}`,
            [
              {
                text: "OK",
                onPress: () => router.back(),
              },
            ],
          );

          return;
        }

        if (submissionResult?.mode === "QUEUED") {
          Alert.alert(
            "Saved Locally",
            submissionResult?.message ||
              "The Informal ERF is saved on this device and will submit automatically when the network is available.",
            [
              {
                text: "OK",
                onPress: () => router.back(),
              },
            ],
          );

          return;
        }

        if (submissionResult?.mode === "REJECTED") {
          Alert.alert(
            "Informal ERF Not Created",
            submissionResult?.message ||
              "The server rejected this Informal ERF.",
          );

          return;
        }

        Alert.alert(
          "Submission Failed",
          submissionResult?.message ||
            "The Informal ERF could not be submitted or saved locally.",
        );
      }}
    >
      {({ errors, isSubmitting, setFieldValue, setValues, values }) => {
        const showBoundaryError = !!errors?.boundaryPoints;

        const showReasonError = !!errors?.reasonCode;

        const showReasonOtherError = !!errors?.reasonOther;

        const showMediaError = !!errors?.media;

        return (
          <View style={styles.screen}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <FormSection title="CURRENT CONTEXT">
                <Text style={styles.contextLine}>
                  Workbase: {selectedLm?.name || selectedLm?.id || "N/A"}
                </Text>
                <Text style={styles.contextLine}>
                  Ward: {selectedWard?.name || selectedWard?.pcode || "N/A"}
                </Text>
                <Text style={styles.contextLine}>
                  Workflow Start Position:{" "}
                  {formatCoordinate(selectedMapPoint.lat)},{" "}
                  {formatCoordinate(selectedMapPoint.lng)}
                </Text>
                <Text style={styles.contextLine}>
                  Selection Method: Main map long press (map centre only)
                </Text>
                <Text style={styles.contextLine}>
                  Device GPS:{" "}
                  {devicePoint
                    ? `${formatCoordinate(devicePoint.lat)}, ${formatCoordinate(
                        devicePoint.lng,
                      )}`
                    : "Not captured"}
                </Text>
                {devicePoint ? (
                  <Text style={styles.contextLine}>
                    Device Accuracy: {initialDeviceLocation?.accuracyM ?? "N/A"}{" "}
                    m
                  </Text>
                ) : null}
              </FormSection>

              <InformalErfLocationPicker
                label="INFORMAL ERF BOUNDARY"
                name="boundaryPoints"
                initialGps={selectedMapPoint}
                icon="map-marker-plus"
                referenceBoundary={selectedWardBoundary}
                erfNo="INFORMAL"
                erfCentroid={null}
                nearbyErfs={nearbyErfs}
                nearbyPremises={nearbyPremises}
                nearbyMeters={nearbyMeters}
              />

              <FormSection title="REASON FOR INFORMAL ERF">
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.reasonSelector,
                    showReasonError && styles.reasonSelectorError,
                  ]}
                  onPress={() => setReasonModalVisible(true)}
                >
                  <Text
                    style={[
                      styles.reasonSelectorText,
                      !values?.reasonCode && styles.reasonPlaceholder,
                    ]}
                  >
                    {getCreationReasonLabel(values?.reasonCode)}
                  </Text>

                  <Text style={styles.reasonSelectorChevron}>▼</Text>
                </TouchableOpacity>

                {showReasonError ? (
                  <Text style={styles.fieldErrorText}>{errors.reasonCode}</Text>
                ) : null}

                {values?.reasonCode === "OTHER" ? (
                  <View style={styles.otherReasonWrapper}>
                    <TextInput
                      mode="outlined"
                      label="OTHER CREATION REASON"
                      placeholder="Enter the reason"
                      value={values?.reasonOther}
                      onChangeText={(value) =>
                        setFieldValue("reasonOther", value)
                      }
                      multiline
                      maxLength={250}
                      error={showReasonOtherError}
                      style={styles.otherReasonInput}
                    />

                    <Text style={styles.characterCount}>
                      {String(values?.reasonOther || "").length}/250
                    </Text>

                    {showReasonOtherError ? (
                      <Text style={styles.fieldErrorText}>
                        {errors.reasonOther}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </FormSection>

              <FormSection title="INFORMAL ERF SITE PHOTOGRAPH">
                <Text style={styles.mediaHint}>
                  Capture one clear photograph showing the physical site.
                </Text>

                <IrepsMedia
                  name="media"
                  tag="informalErfSitePhoto"
                  agentName={agentName}
                  agentUid={agentUid}
                  required
                />

                {showMediaError ? (
                  <Text style={styles.fieldErrorText}>{errors.media}</Text>
                ) : null}
              </FormSection>
            </ScrollView>

            <ForensicFooter
              isTrnLoading={isSubmitting}
              disableSubmitWhenInvalid
              leftButtonLabel="CANCEL"
              onLeftButtonPress={() => router.back()}
            />

            <Portal>
              <Modal
                visible={reasonModalVisible}
                onDismiss={() => {
                  setReasonModalVisible(false);
                }}
                contentContainerStyle={styles.reasonModalContainer}
              >
                <Surface style={styles.reasonModalSurface}>
                  <Text style={styles.reasonModalTitle}>
                    SELECT CREATION REASON
                  </Text>

                  <ScrollView
                    style={styles.reasonOptionsList}
                    keyboardShouldPersistTaps="handled"
                  >
                    <RadioButton.Group
                      value={values?.reasonCode}
                      onValueChange={async (reasonCode) => {
                        await setValues(
                          {
                            ...values,
                            reasonCode,
                            reasonOther:
                              reasonCode === "OTHER" ? values.reasonOther : "",
                          },
                          true,
                        );

                        setReasonModalVisible(false);
                      }}
                    >
                      {INFORMAL_ERF_CREATION_REASONS.map((option) => (
                        <RadioButton.Item
                          key={option.value}
                          label={option.label}
                          value={option.value}
                          labelStyle={styles.reasonOptionLabel}
                        />
                      ))}
                    </RadioButton.Group>
                  </ScrollView>

                  <Button
                    mode="outlined"
                    onPress={() => {
                      setReasonModalVisible(false);
                    }}
                  >
                    CLOSE
                  </Button>
                </Surface>
              </Modal>
            </Portal>
          </View>
        );
      }}
    </Formik>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  scrollContent: {
    padding: 12,
    paddingBottom: 28,
  },

  contextLine: {
    fontSize: 11,
    color: "#475569",
    marginTop: 2,
  },

  reasonSelector: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },

  reasonSelectorError: {
    borderColor: "#ef4444",
    borderWidth: 2,
  },

  reasonSelectorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },

  reasonPlaceholder: {
    color: "#94a3b8",
    fontWeight: "600",
  },

  reasonSelectorChevron: {
    marginLeft: 10,
    fontSize: 10,
    color: "#64748b",
  },

  otherReasonWrapper: {
    marginTop: 12,
  },

  otherReasonInput: {
    backgroundColor: "#ffffff",
  },

  characterCount: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 9,
    color: "#94a3b8",
  },

  fieldErrorText: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: "700",
    color: "#ef4444",
  },

  boundaryErrorText: {
    marginTop: 6,
    marginHorizontal: 4,
  },

  reasonModalContainer: {
    marginHorizontal: 12,
    justifyContent: "center",
  },

  reasonModalSurface: {
    maxHeight: "82%",
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#ffffff",
  },

  reasonModalTitle: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
  },

  reasonOptionsList: {
    marginBottom: 12,
  },

  reasonOptionLabel: {
    fontSize: 12,
    color: "#334155",
  },

  mediaHint: {
    marginTop: 4,
    marginBottom: 4,
    fontSize: 10,
    color: "#64748b",
  },

  centeredScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    backgroundColor: "#f8fafc",
  },

  messageCard: {
    width: "100%",
    maxWidth: 420,
    padding: 18,
    borderRadius: 14,
    backgroundColor: "#ffffff",
  },

  messageTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
  },

  messageText: {
    marginVertical: 12,
    fontSize: 12,
    lineHeight: 18,
    color: "#475569",
    textAlign: "center",
  },
});
