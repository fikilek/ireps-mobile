import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { getIn, useFormikContext } from "formik"; // 🎯 Added getIn
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Button, IconButton } from "react-native-paper";
import ViewShot from "react-native-view-shot";

// 🎯 1. Added 'name' prop to synchronize with the parent
export const IrepsCamera = ({
  name = "media",
  tag,
  agentName,
  agentUid,
  fallbackGps = null,
}) => {
  const { values, setFieldValue } = useFormikContext();

  const [permission, requestPermission] = useCameraPermissions();
  const [isVisible, setIsVisible] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [flashMode, setFlashMode] = useState("auto");

  const [currentGps, setCurrentGps] = useState(null);

  const cameraRef = useRef(null);
  const viewShotRef = useRef(null);

  const withTimeout = (promise, timeoutMs = 1200) =>
    Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

  const resolveGpsInBackground = async () => {
    try {
      let permissionResult = await Location.getForegroundPermissionsAsync();

      if (permissionResult?.status !== "granted") {
        permissionResult = await Location.requestForegroundPermissionsAsync();
      }

      if (permissionResult?.status !== "granted") {
        setCurrentGps(null);
        return;
      }

      // Fast first attempt: cached location
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: 100,
      });

      if (lastKnown?.coords) {
        setCurrentGps({
          lat: lastKnown.coords.latitude ?? null,
          lng: lastKnown.coords.longitude ?? null,
        });
      }

      // Slow attempt: fresh location, but capped
      const freshLocation = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        1200,
      );

      if (freshLocation?.coords) {
        setCurrentGps({
          lat: freshLocation.coords.latitude ?? null,
          lng: freshLocation.coords.longitude ?? null,
        });
      }
    } catch (e) {
      console.error("Location Error", e);
      setCurrentGps(null);
    }
  };

  const handleOpen = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return;
    }

    // Each new camera session starts in AUTO flash mode.
    setFlashMode("auto");

    // Open camera immediately
    setIsVisible(true);

    // Resolve GPS without blocking camera opening
    setTimeout(() => {
      resolveGpsInBackground();
    }, 0);
  };

  const handleCapture = async () => {
    if (cameraRef.current && !isProcessing) {
      setIsProcessing(true);
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.6,
          skipProcessing: false,
        });
        setPreviewPhoto(photo.uri);
      } catch (e) {
        console.error("Capture Error", e);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const resolvedGps =
    currentGps?.lat != null && currentGps?.lng != null
      ? { lat: currentGps.lat, lng: currentGps.lng }
      : fallbackGps?.lat != null && fallbackGps?.lng != null
        ? { lat: fallbackGps.lat, lng: fallbackGps.lng }
        : { lat: null, lng: null };

  const handleFinalAccept = async () => {
    if (viewShotRef.current) {
      try {
        const finalUri = await viewShotRef.current.capture();
        const timestamp = new Date().toISOString();

        const forensicMedia = {
          tag: tag || "unlabeled",
          uri: finalUri,
          url: null,
          type: "image",
          gps: resolvedGps,
          created: { at: timestamp, byUser: agentName, byUid: agentUid },
          updated: { at: timestamp, byUser: agentName, byUid: agentUid },
        };

        // 🎯 2. THE ALIGNMENT: Use getIn and the 'name' prop
        // This dynamically finds the correct array (Root or Nested)
        const currentMedia = getIn(values, name) || [];

        // 🎯 3. Filter out existing photos with the same tag in the CORRECT array
        const otherMedia = currentMedia.filter((m) => m.tag !== tag);

        // 🎯 4. Save back to the dynamic path
        setFieldValue(name, [...otherMedia, forensicMedia]);

        setIsVisible(false);
        setPreviewPhoto(null);
      } catch (e) {
        console.error("Save Error", e);
      }
    }
  };

  return (
    <View>
      <IconButton
        icon="camera-plus"
        mode="contained"
        containerColor="#34D399"
        iconColor="white"
        size={28}
        onPress={handleOpen}
      />

      <Modal
        visible={isVisible}
        animationType="slide"
        onRequestClose={() => setIsVisible(false)}
      >
        <View style={styles.container}>
          {previewPhoto ? (
            <View style={styles.previewWrapper}>
              <ViewShot
                ref={viewShotRef}
                options={{ format: "jpg", quality: 0.8 }}
                style={styles.shotContainer}
              >
                <Image
                  source={{ uri: previewPhoto }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />

                {/* FORENSIC RIBBON */}
                <View style={styles.ribbon}>
                  <View style={styles.ribbonRow}>
                    <MaterialCommunityIcons
                      name="tag-outline"
                      size={14}
                      color="#34D399"
                    />
                    <Text
                      style={[
                        styles.ribbonText,
                        { color: "#34D399", fontWeight: "bold" },
                      ]}
                    >
                      {" "}
                      TAG: {tag}
                    </Text>
                  </View>

                  <View style={styles.ribbonRow}>
                    <View style={styles.ribbonItem}>
                      <MaterialCommunityIcons
                        name="account-circle-outline"
                        size={12}
                        color="white"
                      />
                      <Text style={styles.ribbonText}> {agentName}</Text>
                    </View>
                    <View style={[styles.ribbonItem, { marginLeft: 10 }]}>
                      <MaterialCommunityIcons
                        name="clock-outline"
                        size={12}
                        color="white"
                      />
                      <Text style={styles.ribbonText}>
                        {" "}
                        {new Date().toLocaleTimeString()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.ribbonRow}>
                    <MaterialCommunityIcons
                      name="map-marker-outline"
                      size={12}
                      color="#FBBF24"
                    />
                    <Text style={styles.ribbonText}>
                      GPS:{" "}
                      {resolvedGps?.lat != null && resolvedGps?.lng != null
                        ? `${Number(resolvedGps.lat).toFixed(6)} / ${Number(resolvedGps.lng).toFixed(6)}`
                        : "LOCATION UNAVAILABLE"}
                    </Text>
                  </View>
                </View>
              </ViewShot>

              <View style={styles.reviewBar}>
                <Button
                  mode="outlined"
                  textColor="white"
                  style={styles.reviewBtn}
                  onPress={() => setPreviewPhoto(null)}
                >
                  RETAKE
                </Button>
                <Button
                  mode="contained"
                  buttonColor="#34D399"
                  style={styles.reviewBtn}
                  onPress={handleFinalAccept}
                >
                  ACCEPT
                </Button>
              </View>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="back"
                flash={flashMode}
              />
              <View style={styles.overlayContainer} pointerEvents="box-none">
                <View style={styles.topSection}>
                  <Text style={styles.guideText}>ALIGN {tag?.toUpperCase()}</Text>

                  <View style={styles.flashControls}>
                    {[
                      { value: "auto", label: "AUTO", icon: "flash-auto" },
                      { value: "on", label: "ON", icon: "flash" },
                      { value: "off", label: "OFF", icon: "flash-off" },
                    ].map((option) => {
                      const isActive = flashMode === option.value;

                      return (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.flashOption,
                            isActive && styles.flashOptionActive,
                          ]}
                          onPress={() => setFlashMode(option.value)}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons
                            name={option.icon}
                            size={17}
                            color={isActive ? "#0f172a" : "white"}
                          />
                          <Text
                            style={[
                              styles.flashOptionText,
                              isActive && styles.flashOptionTextActive,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.reticle} />
                <View style={styles.bottomSection}>
                  <IconButton
                    icon="close"
                    iconColor="white"
                    containerColor="rgba(0,0,0,0.3)"
                    onPress={() => setIsVisible(false)}
                  />
                  <TouchableOpacity
                    style={styles.shutterBtn}
                    onPress={handleCapture}
                  >
                    <View style={styles.shutterInner}>
                      {isProcessing && <ActivityIndicator color="red" />}
                    </View>
                  </TouchableOpacity>
                  <View style={{ width: 60 }} />
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
};

// ... (Styles remain identical to your previous version)

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  previewWrapper: { flex: 1, padding: 20, justifyContent: "center" },
  shotContainer: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 12,
    overflow: "hidden",
  },
  previewImage: { flex: 1 },
  ribbon: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.75)",
    padding: 10,
  },
  ribbonRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  ribbonItem: { flexDirection: "row", alignItems: "center" },
  ribbonText: {
    color: "white",
    fontSize: 10,
    fontFamily: Platform.OS === "android" ? "monospace" : "Courier",
  },
  reviewBar: {
    flexDirection: "row",
    marginTop: 20,
    justifyContent: "space-between",
  },
  reviewBtn: { flex: 0.48 },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 60,
  },
  topSection: {
    alignItems: "center",
  },
  guideText: {
    color: "white",
    fontWeight: "bold",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 20,
  },
  flashControls: {
    flexDirection: "row",
    marginTop: 12,
    padding: 4,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  flashOption: {
    minWidth: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  flashOptionActive: {
    backgroundColor: "white",
  },
  flashOptionText: {
    color: "white",
    fontSize: 10,
    fontWeight: "800",
  },
  flashOptionTextActive: {
    color: "#0f172a",
  },
  reticle: {
    width: 280,
    height: 240,
    borderWidth: 2,
    borderColor: "#34D399",
    borderStyle: "dashed",
    borderRadius: 20,
  },
  bottomSection: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    alignItems: "center",
  },
  shutterBtn: {
    width: 75,
    height: 75,
    borderRadius: 40,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInner: {
    width: 65,
    height: 65,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: "black",
  },
});
