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
import * as Location from "expo-location";
import { VideoView, useVideoPlayer } from "expo-video";
import { getIn, useFormikContext } from "formik";
import { useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ActivityIndicator, IconButton, Surface } from "react-native-paper";

import { IrepsMedia } from "../media/IrepsMedia";

export const FIELD_COMMENT_MEDIA_TAGS = {
  photo: "fieldCommentPhoto",
  voice: "fieldCommentVoice",
  video: "fieldCommentVideo",
};

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

function formatDuration(ms) {
  const value = Number(ms || 0);

  if (!value) return "0:00";

  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatCaptureTime(item = {}) {
  if (!item?.created?.at) return "--:--";

  try {
    return new Date(item.created.at).toLocaleTimeString();
  } catch (_error) {
    return "--:--";
  }
}

function FieldCommentVideoPreview({ uri }) {
  const player = useVideoPlayer(uri ? { uri } : null, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  if (!uri) {
    return (
      <View style={styles.mediaFallback}>
        <MaterialCommunityIcons name="video-outline" size={28} color="#34D399" />
      </View>
    );
  }

  return (
    <VideoView
      style={styles.forensicPreviewMedia}
      player={player}
      nativeControls
      allowsFullscreen
      contentFit="cover"
      surfaceType="textureView"
    />
  );
}

function FieldCommentVoicePreview({ item }) {
  const uri = getMediaUri(item);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const isPlaying = Boolean(status?.playing);

  function togglePlayback() {
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
      console.log("IrepsFieldCommentSection voice playback error", error);
      Alert.alert("Playback Failed", error?.message || "Could not play voice clip.");
    }
  }

  return (
    <Pressable style={styles.voicePreview} onPress={togglePlayback}>
      <MaterialCommunityIcons
        name={isPlaying ? "stop-circle-outline" : "microphone-outline"}
        size={28}
        color="#34D399"
      />
      <Text style={styles.voicePreviewText}>{isPlaying ? "STOP" : "PLAY"}</Text>
    </Pressable>
  );
}

function ForensicMediaSlot({
  title,
  description,
  icon,
  item,
  onCapture,
  onRemove,
  disabled,
  recording = false,
  recordingDuration = 0,
  type,
}) {
  const uri = getMediaUri(item);
  const tag = item?.tag ||
    (type === "voice"
      ? FIELD_COMMENT_MEDIA_TAGS.voice
      : FIELD_COMMENT_MEDIA_TAGS.video);

  return (
    <View style={styles.questionCard}>
      <View style={styles.questionHeader}>
        <View style={styles.questionTitleRow}>
          <Text style={styles.questionTitle}>{title}</Text>
          <Text style={styles.optionalBadge}>OPTIONAL</Text>
          <Text style={styles.limitText}>{item ? "1/1" : "0/1"}</Text>
        </View>
        <Text style={styles.questionDescription}>{description}</Text>
      </View>

      <View style={styles.irepsMediaContainer}>
        <View style={styles.cameraBox}>
          <IconButton
            icon={recording ? "stop" : icon}
            mode="contained"
            containerColor={recording ? "#DC2626" : "#34D399"}
            iconColor="white"
            size={28}
            onPress={onCapture}
            disabled={disabled || (Boolean(item) && !recording)}
          />
          {recording ? (
            <Text style={styles.recordingTime}>
              {formatDuration(recordingDuration)}
            </Text>
          ) : null}
        </View>

        <View style={styles.ribbonSlot}>
          {item ? (
            <View style={styles.forensicMediaRow}>
              <View style={styles.forensicPreview}>
                {type === "voice" ? (
                  <FieldCommentVoicePreview item={item} />
                ) : (
                  <FieldCommentVideoPreview uri={uri} />
                )}
              </View>

              <View style={styles.forensicInfo}>
                <View style={styles.metaRow}>
                  <MaterialCommunityIcons name="tag" size={12} color="#34D399" />
                  <Text style={styles.tagText}> {tag}</Text>
                </View>

                <Text style={styles.statusText}>FORENSIC CAPTURE OK</Text>
                <Text style={styles.timeText}>
                  {formatCaptureTime(item)}
                  {type === "voice"
                    ? ` • ${formatDuration(item?.durationMillis)}`
                    : ""}
                </Text>
              </View>

              <Pressable
                onPress={onRemove}
                style={styles.deleteBtn}
                disabled={disabled}
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  size={20}
                  color="#EF4444"
                />
              </Pressable>
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                {recording
                  ? `RECORDING ${FIELD_COMMENT_MEDIA_TAGS.voice.toUpperCase()}`
                  : `NO ${tag.toUpperCase()} CAPTURED`}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export function IrepsFieldCommentSection({
  commentName = "fieldComment.text",
  mediaName = "media",
  agentName = "SYSTEM",
  agentUid = "SYSTEM",
  fallbackGps = null,
  disabled = false,
}) {
  const { values, setFieldValue } = useFormikContext();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioRecorderState = useAudioRecorderState(audioRecorder);

  const [cameraVisible, setCameraVisible] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [currentGps, setCurrentGps] = useState(null);

  const cameraRef = useRef(null);

  const commentValue = String(getIn(values, commentName) || "");
  const media = normalizeMediaArray(getIn(values, mediaName));

  const photo = media.find((item) => item?.tag === FIELD_COMMENT_MEDIA_TAGS.photo);
  const voice = media.find((item) => item?.tag === FIELD_COMMENT_MEDIA_TAGS.voice);
  const video = media.find((item) => item?.tag === FIELD_COMMENT_MEDIA_TAGS.video);

  const isRecordingAudio = Boolean(audioRecorderState?.isRecording);

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

  function replaceTaggedMedia(tag, item) {
    const otherMedia = media.filter((mediaItem) => mediaItem?.tag !== tag);
    setFieldValue(mediaName, item ? [item, ...otherMedia] : otherMedia);
  }

  function buildMediaObject({
    tag,
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
      console.log("IrepsFieldCommentSection resolveGps error", error);
      setCurrentGps(null);
      return null;
    }
  }

  async function openVideoCamera() {
    if (disabled || video) return;

    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();

      if (!result?.granted) {
        Alert.alert(
          "Camera Permission Required",
          "Camera access is required to record a field comment video.",
        );
        return;
      }
    }

    await resolveGps();
    setCameraVisible(true);
  }

  async function startVideoRecording() {
    if (!cameraRef.current || recordingVideo || processing || video) return;

    try {
      setRecordingVideo(true);
      setProcessing(true);

      const result = await cameraRef.current.recordAsync();

      if (!result?.uri) {
        throw new Error("No video URI returned.");
      }

      replaceTaggedMedia(
        FIELD_COMMENT_MEDIA_TAGS.video,
        buildMediaObject({
          tag: FIELD_COMMENT_MEDIA_TAGS.video,
          uri: result.uri,
          type: "video",
          source: "camera",
        }),
      );

      setCameraVisible(false);
    } catch (error) {
      console.log("IrepsFieldCommentSection startVideoRecording error", error);

      if (!String(error?.message || "").includes("Recording stopped")) {
        Alert.alert("Video Failed", error?.message || "Could not record video.");
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
      console.log("IrepsFieldCommentSection stopVideoRecording error", error);
    }
  }

  async function startVoiceRecording() {
    if (disabled || voice || isRecordingAudio) return;

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!permission?.granted) {
        Alert.alert(
          "Microphone Permission Required",
          "Microphone access is required to record a field comment voice clip.",
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
      console.log("IrepsFieldCommentSection startVoiceRecording error", error);
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

      replaceTaggedMedia(
        FIELD_COMMENT_MEDIA_TAGS.voice,
        buildMediaObject({
          tag: FIELD_COMMENT_MEDIA_TAGS.voice,
          uri,
          type: "audio",
          source: "voice",
          durationMillis: Number(audioRecorderState?.durationMillis || 0),
        }),
      );
    } catch (error) {
      console.log("IrepsFieldCommentSection stopVoiceRecording error", error);
      Alert.alert(
        "Voice Recording Failed",
        error?.message || "Could not save voice recording.",
      );
    } finally {
      try {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });
      } catch (audioModeError) {
        console.log("IrepsFieldCommentSection audio mode reset error", audioModeError);
      }
    }
  }

  return (
    <Surface style={styles.container} elevation={1}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons
          name="comment-text-multiple-outline"
          size={18}
          color="#2563EB"
        />
        <Text style={styles.sectionTitle}>FWR General Comment</Text>
      </View>

      <Text style={styles.sectionHelpText}>
        Optional field notes and supporting media. This section does not block submission.
      </Text>

      <View style={styles.questionCard}>
        <View style={styles.questionHeader}>
          <View style={styles.questionTitleRow}>
            <Text style={styles.questionTitle}>Comment</Text>
            <Text style={styles.optionalBadge}>OPTIONAL</Text>
          </View>
          <Text style={styles.questionDescription}>
            Add an optional field comment about the work completed on site.
          </Text>
        </View>

        <TextInput
          value={commentValue}
          onChangeText={(nextValue) => setFieldValue(commentName, nextValue)}
          placeholder="Add a general field comment..."
          placeholderTextColor="#94A3B8"
          multiline
          editable={!disabled}
          textAlignVertical="top"
          style={[styles.commentInput, disabled && styles.inputDisabled]}
        />
      </View>

      <View style={styles.questionCard}>
        <View style={styles.questionHeader}>
          <View style={styles.questionTitleRow}>
            <Text style={styles.questionTitle}>Photo</Text>
            <Text style={styles.optionalBadge}>OPTIONAL</Text>
            <Text style={styles.limitText}>{photo ? "1/1" : "0/1"}</Text>
          </View>
          <Text style={styles.questionDescription}>
            Capture an optional supporting field photo.
          </Text>
        </View>

        <IrepsMedia
          name={mediaName}
          tag={FIELD_COMMENT_MEDIA_TAGS.photo}
          agentName={agentName}
          agentUid={agentUid}
          fallbackGps={fallbackGps}
          required={false}
        />
      </View>

      <ForensicMediaSlot
        title="Voice Clip"
        description="Record an optional supporting voice clip."
        icon="microphone-outline"
        item={voice}
        onCapture={isRecordingAudio ? stopVoiceRecording : startVoiceRecording}
        onRemove={() => replaceTaggedMedia(FIELD_COMMENT_MEDIA_TAGS.voice, null)}
        disabled={disabled}
        recording={isRecordingAudio}
        recordingDuration={audioRecorderState?.durationMillis}
        type="voice"
      />

      <ForensicMediaSlot
        title="Video Clip"
        description="Record an optional supporting field video."
        icon="video-outline"
        item={video}
        onCapture={openVideoCamera}
        onRemove={() => replaceTaggedMedia(FIELD_COMMENT_MEDIA_TAGS.video, null)}
        disabled={disabled}
        recording={recordingVideo}
        type="video"
      />

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
            mode="video"
          />

          <View style={styles.cameraOverlay} pointerEvents="box-none">
            <View style={styles.cameraTopSection}>
              <Text style={styles.cameraGuideText}>
                ALIGN {FIELD_COMMENT_MEDIA_TAGS.video.toUpperCase()}
              </Text>
            </View>

            <View style={styles.cameraReticle} />

            <View style={styles.cameraBottomSection}>
              <IconButton
                icon="close"
                iconColor="white"
                containerColor="rgba(0,0,0,0.3)"
                onPress={() => {
                  if (recordingVideo) {
                    stopVideoRecording();
                  }

                  setCameraVisible(false);
                }}
              />

              <Pressable
                style={styles.shutterButton}
                onPress={recordingVideo ? stopVideoRecording : startVideoRecording}
                disabled={processing && !recordingVideo}
              >
                <View
                  style={[
                    styles.shutterInner,
                    recordingVideo && styles.videoStopInner,
                  ]}
                >
                  {processing && !recordingVideo ? (
                    <ActivityIndicator color="red" />
                  ) : null}
                </View>
              </Pressable>

              <View style={{ width: 60 }} />
            </View>
          </View>
        </View>
      </Modal>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    margin: 12,
    padding: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1E293B",
    textTransform: "uppercase",
  },

  sectionHelpText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginBottom: 12,
  },

  questionCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  questionHeader: {
    marginBottom: 8,
  },

  questionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  questionTitle: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "900",
  },

  questionDescription: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 3,
  },

  optionalBadge: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900",
  },

  limitText: {
    marginLeft: "auto",
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
  },

  commentInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  inputDisabled: {
    opacity: 0.55,
  },

  irepsMediaContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 10,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  cameraBox: {
    flex: 0.2,
    alignItems: "center",
  },

  recordingTime: {
    marginTop: -4,
    color: "#DC2626",
    fontSize: 9,
    fontWeight: "900",
  },

  ribbonSlot: {
    flex: 0.8,
    marginLeft: 10,
  },

  forensicMediaRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    padding: 6,
    height: 90,
  },

  forensicPreview: {
    width: 65,
    height: 78,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#0F172A",
  },

  forensicPreviewMedia: {
    width: "100%",
    height: "100%",
  },

  mediaFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F172A",
  },

  voicePreview: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F172A",
  },

  voicePreviewText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "900",
    marginTop: 2,
  },

  forensicInfo: {
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

  placeholderText: {
    fontSize: 9,
    color: "#64748B",
    fontWeight: "bold",
    textAlign: "center",
  },

  cameraScreen: {
    flex: 1,
    backgroundColor: "black",
  },

  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 60,
  },

  cameraTopSection: {
    alignItems: "center",
  },

  cameraGuideText: {
    color: "white",
    fontWeight: "bold",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 20,
  },

  cameraReticle: {
    width: 280,
    height: 240,
    borderWidth: 2,
    borderColor: "#34D399",
    borderStyle: "dashed",
    borderRadius: 20,
  },

  cameraBottomSection: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    alignItems: "center",
  },

  shutterButton: {
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

  videoStopInner: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#DC2626",
    borderWidth: 0,
    alignSelf: "center",
    marginTop: 16,
  },
});
