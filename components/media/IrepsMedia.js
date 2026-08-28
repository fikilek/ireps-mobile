import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getIn, useFormikContext } from "formik";
import { useMemo, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { IrepsCamera } from "./IrepsCamera";

const MEDIA_ERROR_MATCHERS = {
  // Discovery / installation evidence
  astNoPhoto: ["meter"],
  anomalyPhoto: ["anomaly"],
  noAccessPhoto: ["no access"],
  keypadPhoto: ["keypad"],
  sealPhoto: ["seal"],
  astCbPhoto: ["circuit breaker"],
  ogsPhoto: ["off-grid supply"],
  normalisationPhoto: ["normalisation"],
  propertyTypePhoto: ["property type"],
  propertyAdrPhoto: ["property address"],
  meterReadingPhoto: ["meter reading"],

  // Commissioning lifecycle evidence
  vendingEvidence: ["vending evidence", "vending"],
  finalSwitchOnEvidence: ["final switch-on evidence", "final switch-on"],
  keypadIssuedEvidence: ["keypad issued evidence", "keypad issued"],

  // Removal lifecycle evidence
  removalInstructionEvidence: ["removal instruction evidence"],
  removalEvidence: ["removal evidence"],
  finalReadingEvidence: ["final reading evidence"],
  supplySafeEvidence: ["supply safe evidence"],
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isMediaErrorForTag({ tag, errorText }) {
  const normalizedError = normalizeText(errorText);
  if (!tag || !normalizedError) return false;

  const matchers = MEDIA_ERROR_MATCHERS[tag] || [];

  return matchers.some((matcher) =>
    normalizedError.includes(normalizeText(matcher)),
  );
}

function getMediaSource(capturedPhoto) {
  const uri = capturedPhoto?.url || capturedPhoto?.uri || null;
  return uri ? { uri } : null;
}

function formatCaptureTime(capturedPhoto) {
  if (!capturedPhoto?.created?.at) return "--:--";

  try {
    return new Date(capturedPhoto.created.at).toLocaleTimeString();
  } catch (_error) {
    return "--:--";
  }
}

function buildPlaceholderText({ tag, hasError }) {
  const safeTag = String(tag || "MEDIA").toUpperCase();

  if (hasError) {
    return `📸 CAPTURE REQUIRED: ${safeTag} MISSING`;
  }

  return `NO ${safeTag} CAPTURED`;
}

export const IrepsMedia = ({
  name = "media",
  tag,
  agentName,
  agentUid,
  fallbackGps,
  acquireDeviceGps = true,
  required = false,
}) => {
  const { values, errors, setFieldValue } = useFormikContext();
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  const mediaArray = getIn(values, name) || [];
  const capturedPhoto = mediaArray.find((item) => item?.tag === tag);

  const mediaError = getIn(errors, name);
  const mediaErrorText = typeof mediaError === "string" ? mediaError : "";

  const isTargetedError = useMemo(
    () =>
      isMediaErrorForTag({
        tag,
        errorText: mediaErrorText,
      }),
    [tag, mediaErrorText],
  );

  const hasError =
    (required && !capturedPhoto) ||
    (!!mediaErrorText && isTargetedError && !capturedPhoto);

  const mediaSource = getMediaSource(capturedPhoto);

  const removeImage = () => {
    const nextMediaArray = mediaArray.filter((item) => item?.tag !== tag);
    setFieldValue(name, nextMediaArray);
  };

  return (
    <View style={[styles.container, hasError && styles.containerError]}>
      <View style={styles.cameraBox}>
        <IrepsCamera
          name={name}
          tag={tag}
          agentName={agentName}
          agentUid={agentUid}
          fallbackGps={fallbackGps}
          acquireDeviceGps={acquireDeviceGps}
        />
      </View>

      <View style={styles.ribbonSlot}>
        {capturedPhoto && mediaSource ? (
          <TouchableOpacity
            style={styles.photoContainer}
            onPress={() => setIsPreviewVisible(true)}
            activeOpacity={0.8}
          >
            <Image
              key={mediaSource.uri}
              source={mediaSource}
              style={styles.thumbnail}
            />

            <View style={styles.infoArea}>
              <View style={styles.metaRow}>
                <MaterialCommunityIcons name="tag" size={12} color="#34D399" />
                <Text style={styles.tagText}> {tag}</Text>
              </View>

              <Text style={styles.statusText}>FORENSIC CAPTURE OK</Text>

              <Text style={styles.timeText}>
                {formatCaptureTime(capturedPhoto)}
              </Text>
            </View>

            <TouchableOpacity
              onPress={removeImage}
              style={styles.deleteBtn}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={20}
                color="#EF4444"
              />
            </TouchableOpacity>
          </TouchableOpacity>
        ) : (
          <View
            style={[styles.placeholder, hasError && styles.placeholderError]}
          >
            <Text
              style={[styles.placeholderText, hasError && styles.errorText]}
            >
              {buildPlaceholderText({ tag, hasError })}
            </Text>
          </View>
        )}
      </View>

      <Modal
        visible={isPreviewVisible}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setIsPreviewVisible(false)}
      >
        <View style={styles.fullScreenContainer}>
          {!!mediaSource && (
            <Image
              source={mediaSource}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}

          <TouchableOpacity
            style={styles.closePreviewBtn}
            onPress={() => setIsPreviewVisible(false)}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="close-box" size={40} color="white" />
            <Text style={styles.closeText}>CLOSE PREVIEW</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 10,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  containerError: {
    borderColor: "#EF4444",
    borderLeftWidth: 8,
    backgroundColor: "#FFF1F2",
  },

  cameraBox: {
    flex: 0.2,
    alignItems: "center",
  },

  ribbonSlot: {
    flex: 0.8,
    marginLeft: 10,
  },

  photoContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    padding: 6,
    height: 90,
  },

  thumbnail: {
    width: 65,
    height: 78,
    borderRadius: 6,
    resizeMode: "cover",
  },

  infoArea: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: "center",
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },

  tagText: {
    color: "#34D399",
    fontSize: 10,
    fontWeight: "bold",
  },

  statusText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "600",
  },

  timeText: {
    color: "#94A3B8",
    fontSize: 8,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },

  deleteBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
  },

  placeholder: {
    height: 90,
    justifyContent: "center",
    alignItems: "center",
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 8,
  },

  placeholderError: {
    borderColor: "#EF4444",
    borderWidth: 2,
    borderStyle: "solid",
    backgroundColor: "#FFE4E6",
  },

  placeholderText: {
    fontSize: 9,
    color: "#64748B",
    fontWeight: "bold",
    textAlign: "center",
  },

  errorText: {
    color: "#EF4444",
  },

  fullScreenContainer: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },

  fullScreenImage: {
    width: "100%",
    height: "100%",
  },

  closePreviewBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    alignItems: "center",
  },

  closeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
    marginTop: -5,
  },
});
