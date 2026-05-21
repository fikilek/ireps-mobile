import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { VideoView, useVideoPlayer } from "expo-video";
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator } from "react-native-paper";

function makeMediaId() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MEDIA_${Date.now()}_${random}`;
}

function normalizeMediaArray(value) {
  return Array.isArray(value) ? value : [];
}

function getMediaUri(item = {}) {
  return item?.uri || item?.url || "";
}

function normalizeLower(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getMediaTypeFromAsset(asset = {}) {
  const type = normalizeLower(asset?.type || asset?.mediaType);
  const uri = normalizeLower(asset?.uri);

  if (type.includes("video")) return "video";
  if (type.includes("audio")) return "audio";

  if (uri.includes(".mp4") || uri.includes(".mov")) return "video";

  if (
    uri.includes(".m4a") ||
    uri.includes(".mp3") ||
    uri.includes(".wav") ||
    uri.includes(".aac") ||
    uri.includes(".webm")
  ) {
    return "audio";
  }

  return "image";
}

function formatTime(iso) {
  if (!iso) return "--:--";

  try {
    return new Date(iso).toLocaleTimeString();
  } catch (_error) {
    return "--:--";
  }
}

function formatDuration(ms) {
  const value = Number(ms || 0);

  if (!value) return "NAv";

  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getTypeIcon(type) {
  if (type === "video") return "video-outline";
  if (type === "audio" || type === "voice") return "microphone-outline";
  return "image-outline";
}

function getTypeLabel(type) {
  if (type === "video") return "VIDEO";
  if (type === "audio" || type === "voice") return "VOICE";
  return "PHOTO";
}

function VideoPreview({ uri }) {
  const player = useVideoPlayer(uri ? { uri } : null, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  if (!uri) {
    return (
      <View style={styles.audioPreview}>
        <MaterialCommunityIcons
          name="video-outline"
          size={28}
          color="#2563eb"
        />
      </View>
    );
  }

  return (
    <VideoView
      style={styles.previewImage}
      player={player}
      nativeControls
      allowsFullscreen
      contentFit="cover"
      surfaceType="textureView"
    />
  );
}

function AudioPreview({ item }) {
  const uri = getMediaUri(item);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);

  const isPlaying = Boolean(status?.playing);

  const handleTogglePlayback = () => {
    try {
      if (!uri) return;

      if (isPlaying) {
        player.pause();
        player.seekTo(0);
        return;
      }

      player.seekTo(0);
      player.play();
    } catch (error) {
      console.log("IrepsInstructionMedia AudioPreview error", error);
      Alert.alert("Playback Failed", error?.message || "Could not play audio.");
    }
  };

  return (
    <View style={styles.audioPreview}>
      <MaterialCommunityIcons
        name={isPlaying ? "volume-high" : "microphone-outline"}
        size={28}
        color="#2563eb"
      />

      <Pressable style={styles.playButton} onPress={handleTogglePlayback}>
        <MaterialCommunityIcons
          name={isPlaying ? "stop-circle-outline" : "play-circle-outline"}
          size={17}
          color="#ffffff"
        />
        <Text style={styles.playButtonText}>{isPlaying ? "STOP" : "PLAY"}</Text>
      </Pressable>
    </View>
  );
}

export default function IrepsInstructionMedia({
  value = [],
  onChange,
  tag = "instructionMedia",
  agentName = "SYSTEM",
  agentUid = "SYSTEM",
  fallbackGps = null,
  disabled = false,
  required = false,
  maxItems = 12,
  title = "Instruction Media",
  helperText = "Optional office instruction evidence. Media is kept locally and uploaded only when the form is submitted or synced.",
}) {
  const media = normalizeMediaArray(value);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioRecorderState = useAudioRecorderState(audioRecorder);

  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraMode, setCameraMode] = useState("picture");
  const [processing, setProcessing] = useState(false);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [currentGps, setCurrentGps] = useState(null);

  const cameraRef = useRef(null);

  const isRecordingAudio = Boolean(audioRecorderState?.isRecording);
  const hasError = required && media.length === 0;
  const canAddMore = media.length < maxItems;

  const resolvedGps =
    currentGps?.lat != null && currentGps?.lng != null
      ? {
          lat: currentGps.lat,
          lng: currentGps.lng,
        }
      : fallbackGps?.lat != null && fallbackGps?.lng != null
        ? {
            lat: fallbackGps.lat,
            lng: fallbackGps.lng,
          }
        : {
            lat: null,
            lng: null,
          };

  const counts = useMemo(() => {
    return media.reduce(
      (acc, item) => {
        const type = item?.type || "image";

        if (type === "video") {
          acc.video += 1;
        } else if (type === "audio" || type === "voice") {
          acc.voice += 1;
        } else {
          acc.photo += 1;
        }

        return acc;
      },
      {
        photo: 0,
        video: 0,
        voice: 0,
      },
    );
  }, [media]);

  function emitChange(nextMedia) {
    onChange?.(normalizeMediaArray(nextMedia));
  }

  function appendMedia(item) {
    if (!canAddMore) {
      Alert.alert(
        "Media Limit Reached",
        `You can attach a maximum of ${maxItems} media items.`,
      );
      return;
    }

    emitChange([item, ...media]);
  }

  function removeMedia(mediaId) {
    emitChange(media.filter((item) => item?.id !== mediaId));
  }

  async function resolveGps() {
    try {
      let permissionResult = await Location.getForegroundPermissionsAsync();

      if (permissionResult?.status !== "granted") {
        permissionResult = await Location.requestForegroundPermissionsAsync();
      }

      if (permissionResult?.status !== "granted") {
        setCurrentGps(null);
        return null;
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: 100,
      });

      if (lastKnown?.coords) {
        const gps = {
          lat: lastKnown.coords.latitude ?? null,
          lng: lastKnown.coords.longitude ?? null,
        };

        setCurrentGps(gps);
        return gps;
      }

      const fresh = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (fresh?.coords) {
        const gps = {
          lat: fresh.coords.latitude ?? null,
          lng: fresh.coords.longitude ?? null,
        };

        setCurrentGps(gps);
        return gps;
      }

      setCurrentGps(null);
      return null;
    } catch (error) {
      console.log("IrepsInstructionMedia resolveGps error", error);
      setCurrentGps(null);
      return null;
    }
  }

  function buildMediaObject({
    uri,
    type,
    source,
    gps = resolvedGps,
    durationMillis = null,
  }) {
    const timestamp = new Date().toISOString();

    return {
      id: makeMediaId(),
      tag,
      uri,
      url: null,
      type,
      source,
      durationMillis,
      gps: gps || {
        lat: null,
        lng: null,
      },
      created: {
        at: timestamp,
        byUser: agentName,
        byUid: agentUid,
      },
      updated: {
        at: timestamp,
        byUser: agentName,
        byUid: agentUid,
      },
    };
  }

  async function openCamera(mode = "picture") {
    if (disabled || !canAddMore) return;

    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();

      if (!result?.granted) {
        Alert.alert(
          "Camera Permission Required",
          "Camera access is required to capture instruction media.",
        );
        return;
      }
    }

    await resolveGps();

    setCameraMode(mode);
    setCameraVisible(true);
  }

  async function capturePhoto() {
    if (!cameraRef.current || processing) return;

    try {
      setProcessing(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        throw new Error("No photo URI returned.");
      }

      appendMedia(
        buildMediaObject({
          uri: photo.uri,
          type: "image",
          source: "camera",
        }),
      );

      setCameraVisible(false);
    } catch (error) {
      console.log("IrepsInstructionMedia capturePhoto error", error);
      Alert.alert("Photo Failed", error?.message || "Could not take photo.");
    } finally {
      setProcessing(false);
    }
  }

  async function startVideoRecording() {
    if (!cameraRef.current || recordingVideo || processing) return;

    try {
      setRecordingVideo(true);
      setProcessing(true);

      const result = await cameraRef.current.recordAsync({
        maxDuration: 60,
      });

      if (!result?.uri) {
        throw new Error("No video URI returned.");
      }

      appendMedia(
        buildMediaObject({
          uri: result.uri,
          type: "video",
          source: "camera",
        }),
      );

      setCameraVisible(false);
    } catch (error) {
      console.log("IrepsInstructionMedia startVideoRecording error", error);

      if (!String(error?.message || "").includes("Recording stopped")) {
        Alert.alert(
          "Video Failed",
          error?.message || "Could not record video.",
        );
      }
    } finally {
      setRecordingVideo(false);
      setProcessing(false);
    }
  }

  function stopVideoRecording() {
    try {
      cameraRef.current?.stopRecording?.();
    } catch (error) {
      console.log("IrepsInstructionMedia stopVideoRecording error", error);
    }
  }

  async function chooseFromGallery() {
    if (disabled || !canAddMore) return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission?.granted) {
        Alert.alert(
          "Gallery Permission Required",
          "Media library access is required to choose media.",
        );
        return;
      }

      const gps = await resolveGps();

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 0.8,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });

      if (result?.canceled) return;

      const assets = Array.isArray(result?.assets) ? result.assets : [];

      if (!assets.length) return;

      const availableSlots = Math.max(maxItems - media.length, 0);
      const selectedAssets = assets.slice(0, availableSlots);

      const nextItems = selectedAssets
        .filter((asset) => asset?.uri)
        .map((asset) =>
          buildMediaObject({
            uri: asset.uri,
            type: getMediaTypeFromAsset(asset),
            source: "gallery",
            gps,
            durationMillis: asset?.duration || null,
          }),
        );

      emitChange([...nextItems, ...media]);
    } catch (error) {
      console.log("IrepsInstructionMedia chooseFromGallery error", error);
      Alert.alert(
        "Gallery Failed",
        error?.message || "Could not choose media from gallery.",
      );
    }
  }

  async function startVoiceRecording() {
    if (disabled || !canAddMore || isRecordingAudio) return;

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!permission?.granted) {
        Alert.alert(
          "Microphone Permission Required",
          "Microphone access is required to record voice notes.",
        );
        return;
      }

      await resolveGps();

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      console.log("IrepsInstructionMedia startVoiceRecording error", error);
      Alert.alert(
        "Voice Recording Failed",
        error?.message || "Could not start voice recording.",
      );
    }
  }

  async function stopVoiceRecording() {
    if (!isRecordingAudio) return;

    try {
      await audioRecorder.stop();

      const uri = audioRecorder.uri;

      if (!uri) {
        throw new Error("No audio URI returned.");
      }

      appendMedia(
        buildMediaObject({
          uri,
          type: "audio",
          source: "voice",
          durationMillis: Number(audioRecorderState?.durationMillis || 0),
        }),
      );

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    } catch (error) {
      console.log("IrepsInstructionMedia stopVoiceRecording error", error);
      Alert.alert(
        "Voice Recording Failed",
        error?.message || "Could not save voice recording.",
      );
    }
  }

  function renderMediaPreview(item) {
    const uri = getMediaUri(item);
    const type = item?.type || "image";

    if (type === "image" && uri) {
      return <Image source={{ uri }} style={styles.previewImage} />;
    }

    if (type === "video" && uri) {
      return <VideoPreview uri={uri} />;
    }

    if (type === "audio" || type === "voice") {
      return <AudioPreview item={item} />;
    }

    return (
      <View style={styles.audioPreview}>
        <MaterialCommunityIcons
          name={getTypeIcon(type)}
          size={28}
          color="#2563eb"
        />
      </View>
    );
  }

  function renderMediaItem(item) {
    const uri = getMediaUri(item);
    const type = item?.type || "image";

    return (
      <View key={item.id || uri} style={styles.mediaCard}>
        <View style={styles.previewBox}>{renderMediaPreview(item)}</View>

        <View style={styles.mediaInfo}>
          <View style={styles.mediaTopRow}>
            <Text style={styles.mediaType}>{getTypeLabel(type)}</Text>

            <TouchableOpacity
              onPress={() => removeMedia(item.id)}
              disabled={disabled}
              style={styles.deleteButton}
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={20}
                color="#dc2626"
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.mediaTag}>{item?.tag || tag}</Text>

          <Text style={styles.mediaMeta}>
            {item?.source || "local"} • {formatTime(item?.created?.at)}
          </Text>

          <Text style={styles.mediaMeta}>
            Duration: {formatDuration(item?.durationMillis)}
          </Text>

          <Text style={styles.mediaMeta}>
            GPS:{" "}
            {item?.gps?.lat != null && item?.gps?.lng != null
              ? `${Number(item.gps.lat).toFixed(6)} / ${Number(item.gps.lng).toFixed(6)}`
              : "LOCATION UNAVAILABLE"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, hasError && styles.containerError]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.helper}>{helperText}</Text>
        </View>

        <View style={styles.countBadge}>
          <Text style={styles.countText}>{media.length}</Text>
        </View>
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countMeta}>Photos: {counts.photo}</Text>
        <Text style={styles.countMeta}>Videos: {counts.video}</Text>
        <Text style={styles.countMeta}>Voice: {counts.voice}</Text>
      </View>

      <View style={styles.actionGrid}>
        <Pressable
          style={[styles.actionButton, disabled && styles.actionDisabled]}
          onPress={() => openCamera("picture")}
          disabled={disabled || !canAddMore}
        >
          <MaterialCommunityIcons
            name="camera-plus"
            size={20}
            color="#ffffff"
          />
          <Text style={styles.actionText}>Take Photo</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, disabled && styles.actionDisabled]}
          onPress={() => openCamera("video")}
          disabled={disabled || !canAddMore}
        >
          <MaterialCommunityIcons
            name="video-plus-outline"
            size={20}
            color="#ffffff"
          />
          <Text style={styles.actionText}>Record Video</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, disabled && styles.actionDisabled]}
          onPress={chooseFromGallery}
          disabled={disabled || !canAddMore}
        >
          <MaterialCommunityIcons
            name="image-multiple-outline"
            size={20}
            color="#ffffff"
          />
          <Text style={styles.actionText}>Gallery</Text>
        </Pressable>

        <Pressable
          style={[
            styles.actionButton,
            isRecordingAudio && styles.recordingButton,
            disabled && styles.actionDisabled,
          ]}
          onPress={isRecordingAudio ? stopVoiceRecording : startVoiceRecording}
          disabled={disabled || (!isRecordingAudio && !canAddMore)}
        >
          <MaterialCommunityIcons
            name={
              isRecordingAudio ? "stop-circle-outline" : "microphone-outline"
            }
            size={20}
            color="#ffffff"
          />
          <Text style={styles.actionText}>
            {isRecordingAudio ? "Stop Voice" : "Record Voice"}
          </Text>
        </Pressable>
      </View>

      {isRecordingAudio ? (
        <View style={styles.recordingStrip}>
          <MaterialCommunityIcons
            name="record-circle-outline"
            size={18}
            color="#dc2626"
          />
          <Text style={styles.recordingText}>
            Recording voice note •{" "}
            {formatDuration(audioRecorderState?.durationMillis)}
          </Text>
        </View>
      ) : null}

      {!canAddMore ? (
        <Text style={styles.limitText}>Maximum media items reached.</Text>
      ) : null}

      {hasError ? (
        <Text style={styles.errorText}>Media is required.</Text>
      ) : null}

      {media.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons
            name="cloud-upload-outline"
            size={28}
            color="#94a3b8"
          />
          <Text style={styles.emptyText}>
            No instruction media added. This is allowed unless this form makes
            media mandatory later.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.mediaList} nestedScrollEnabled>
          {media.map(renderMediaItem)}
        </ScrollView>
      )}

      <Modal
        visible={cameraVisible}
        animationType="slide"
        onRequestClose={() => {
          if (recordingVideo) {
            stopVideoRecording();
          }

          setCameraVisible(false);
        }}
      >
        <View style={styles.cameraScreen}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode={cameraMode}
          />

          <View style={styles.cameraOverlay} pointerEvents="box-none">
            <View style={styles.cameraTopBar}>
              <Pressable
                style={styles.cameraIconButton}
                onPress={() => {
                  if (recordingVideo) {
                    stopVideoRecording();
                  }

                  setCameraVisible(false);
                }}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={26}
                  color="#ffffff"
                />
              </Pressable>

              <Text style={styles.cameraTitle}>
                {cameraMode === "video" ? "RECORD VIDEO" : "TAKE PHOTO"}
              </Text>

              <View style={{ width: 44 }} />
            </View>

            <View style={styles.reticle}>
              <Text style={styles.reticleText}>{tag.toUpperCase()}</Text>
            </View>

            <View style={styles.cameraBottomBar}>
              {cameraMode === "video" ? (
                <Pressable
                  style={[
                    styles.shutterButton,
                    recordingVideo && styles.videoStopButton,
                  ]}
                  onPress={
                    recordingVideo ? stopVideoRecording : startVideoRecording
                  }
                  disabled={processing && !recordingVideo}
                >
                  {processing && !recordingVideo ? (
                    <ActivityIndicator color="#dc2626" />
                  ) : (
                    <View
                      style={[
                        styles.shutterInner,
                        recordingVideo && styles.videoStopInner,
                      ]}
                    />
                  )}
                </Pressable>
              ) : (
                <Pressable
                  style={styles.shutterButton}
                  onPress={capturePhoto}
                  disabled={processing}
                >
                  {processing ? (
                    <ActivityIndicator color="#dc2626" />
                  ) : (
                    <View style={styles.shutterInner} />
                  )}
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },

  containerError: {
    borderColor: "#dc2626",
    backgroundColor: "#fff1f2",
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  title: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },

  helper: {
    marginTop: 4,
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
    lineHeight: 16,
  },

  countBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    alignItems: "center",
    justifyContent: "center",
  },

  countText: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "900",
  },

  countRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },

  countMeta: {
    fontSize: 10,
    color: "#475569",
    fontWeight: "900",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },

  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },

  actionButton: {
    flexGrow: 1,
    minWidth: "47%",
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },

  recordingButton: {
    backgroundColor: "#dc2626",
  },

  actionDisabled: {
    opacity: 0.5,
  },

  actionText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },

  recordingStrip: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  recordingText: {
    color: "#991b1b",
    fontSize: 11,
    fontWeight: "900",
  },

  limitText: {
    marginTop: 8,
    color: "#b45309",
    fontSize: 11,
    fontWeight: "800",
  },

  errorText: {
    marginTop: 8,
    color: "#dc2626",
    fontSize: 11,
    fontWeight: "900",
  },

  emptyBox: {
    marginTop: 12,
    minHeight: 86,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },

  emptyText: {
    marginTop: 6,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 16,
  },

  mediaList: {
    marginTop: 12,
    maxHeight: 420,
  },

  mediaCard: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 8,
    marginBottom: 8,
  },

  previewBox: {
    width: 88,
    height: 88,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  previewImage: {
    width: "100%",
    height: "100%",
  },

  audioPreview: {
    width: "100%",
    height: "100%",
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  mediaInfo: {
    flex: 1,
    paddingLeft: 10,
  },

  mediaTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  mediaType: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "900",
  },

  deleteButton: {
    padding: 2,
  },

  mediaTag: {
    marginTop: 3,
    color: "#2563eb",
    fontSize: 11,
    fontWeight: "900",
  },

  mediaMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
  },

  playButton: {
    borderRadius: 999,
    backgroundColor: "#0f172a",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  playButtonText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },

  cameraScreen: {
    flex: 1,
    backgroundColor: "#000000",
  },

  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },

  cameraTopBar: {
    paddingTop: Platform.OS === "ios" ? 56 : 34,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  cameraIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  cameraTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  reticle: {
    alignSelf: "center",
    width: 280,
    height: 240,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#22c55e",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 10,
  },

  reticleText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },

  cameraBottomBar: {
    paddingBottom: Platform.OS === "ios" ? 48 : 34,
    paddingTop: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },

  shutterButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },

  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: "#0f172a",
  },

  videoStopButton: {
    backgroundColor: "#fee2e2",
  },

  videoStopInner: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#dc2626",
    borderWidth: 0,
  },
});
