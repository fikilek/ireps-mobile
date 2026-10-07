import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { act, create } from "react-test-renderer";
import { Formik, useFormikContext } from "formik";
import { loadEntry, nativeHosts, paperHosts } from "./entryTestHarness.mjs";

// Keep real Formik and the shared component; replace device recording/playback.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const photo = { tag: "fieldCommentPhoto", uri: "file:///photo.jpg", type: "image" };
const video = { tag: "fieldCommentVideo", url: "https://example.test/saved.mp4", type: "video" };

async function mount(t, media = []) {
  let state, setRecording;
  const modes = [], videoSources = [];
  const player = { pause() {}, play() {}, seekTo: async () => {} };
  const recorder = {
    uri: "file:///voice.m4a",
    prepareToRecordAsync: async () => {},
    record: () => setRecording(true),
    stop: async () => setRecording(false),
  };
  function Probe() {
    state = useFormikContext();
    return null;
  }
  const Section = loadEntry("components/forms/IrepsFieldCommentSection.js", {
    "react-native": {
      ...nativeHosts, TextInput: "TextInput",
      StyleSheet: { create: value => value }, Platform: { OS: "android" },
      AppState: { addEventListener: () => ({ remove() {} }) },
      Alert: { alert: message => assert.fail(message) },
    },
    "react-native-paper": { ...paperHosts, IconButton: "IconButton", MD3LightTheme: { colors: {} } },
    "@expo/vector-icons": { MaterialCommunityIcons: "Icon" },
    "./components/media/IrepsMedia.js": { IrepsMedia: "PhotoCapture" },
    "expo-audio": {
      AudioModule: { requestRecordingPermissionsAsync: async () => ({ granted: true }) },
      RecordingPresets: { HIGH_QUALITY: {} },
      setAudioModeAsync: async mode => modes.push(mode),
      useAudioRecorder: () => recorder,
      useAudioRecorderState: () => {
        const [isRecording, update] = React.useState(false);
        setRecording = update;
        return { isRecording, durationMillis: 1200 };
      },
      useAudioPlayer: () => player,
      useAudioPlayerStatus: () => ({ playing: false, duration: 1.2 }),
    },
    "expo-location": {
      getForegroundPermissionsAsync: async () => ({ status: "granted" }),
      getLastKnownPositionAsync: async () => ({ coords: { latitude: -28, longitude: 30 } }),
    },
    "expo-video": {
      VideoView: "VideoView",
      useVideoPlayer: source => { videoSources.push(source); return player; },
    },
  }, { exportName: "IrepsFieldCommentSection" });
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Formik, {
      initialValues: { fieldComment: { text: "" }, media }, onSubmit() {},
    }, React.createElement(React.Fragment, null,
      React.createElement(Probe), React.createElement(Section, { agentName: "FWR", agentUid: "fwr-id" }))));
  });
  t.after(async () => { await act(async () => renderer.unmount()); });
  function slot(title) {
    return renderer.root.findAll(node => typeof node.type === "function" && node.props.title === title)[0];
  }
  return {
    renderer, modes, videoSources, slot,
    get values() { return state.values; },
    async comment(text) {
      await act(async () => renderer.root.findByType("TextInput").props.onChangeText(text));
    },
    async record() {
      await act(async () => slot("Voice Clip").findByType("IconButton").props.onPress());
    },
    async preview(title) { await act(async () => slot(title).props.onPreview()); },
    async remove(title) {
      await act(async () => {
        const close = slot(title).findAllByType("Pressable").find(node =>
          node.findAllByType("Icon").some(icon => icon.props.name === "close-circle") &&
          node.findAllByType("Pressable").length === 1);
        close.props.onPress({ stopPropagation() {} });
      });
    },
  };
}

test("new comments retain text/photo/voice capture without a video control", async t => {
  const form = await mount(t, [photo]);
  assert.equal(form.slot("Video Clip"), undefined);
  assert.equal(form.slot("Saved Video Clip"), undefined);
  assert.equal(form.renderer.root.findAllByType("Modal").length, 0);
  const photoControl = form.renderer.root.findByType("PhotoCapture");
  assert.equal(photoControl.props.tag, "fieldCommentPhoto");
  assert.equal(photoControl.props.required, false);
  await form.comment("Meter and seal checked");
  await form.record();
  assert.equal(form.slot("Voice Clip").findByType("IconButton").props.icon, "stop");
  await form.record();
  assert.equal(form.values.fieldComment.text, "Meter and seal checked");
  assert.equal(form.values.media.length, 2);
  const voice = form.values.media.find(item => item.tag === "fieldCommentVoice");
  assert.equal(voice.uri, "file:///voice.m4a");
  assert.equal(voice.type, "audio");
  assert.equal(voice.durationMillis, 1200);
  assert.equal(voice.created.byUid, "fwr-id");
  assert.deepEqual(form.values.media.find(item => item.tag === photo.tag), photo);
  assert.equal(form.modes.at(-1).allowsRecording, false);
  await form.preview("Voice Clip");
  assert.equal(form.renderer.root.findAllByType("Modal").length, 1);
});

test("editing and recording voice preserve an existing video; explicit removal offers no replacement", async t => {
  const form = await mount(t, [photo, video]);
  assert.equal(form.slot("Saved Video Clip").findAllByType("IconButton").length, 0);
  await form.comment("Updated field note");
  await form.record();
  await form.record();
  assert.deepEqual(form.values.media.find(item => item.tag === video.tag), video);
  assert.deepEqual(form.values.media.find(item => item.tag === photo.tag), photo);
  await form.preview("Saved Video Clip");
  assert.equal(form.renderer.root.findByType("VideoView").props.nativeControls, true);
  assert.equal(form.videoSources.at(-1).uri, video.url);
  await act(async () => form.renderer.root.findByType("Modal").props.onRequestClose());
  await form.remove("Voice Clip");
  assert.deepEqual(form.values.media.find(item => item.tag === video.tag), video);
  await form.remove("Saved Video Clip");
  assert.equal(form.slot("Saved Video Clip"), undefined);
  assert.equal(form.slot("Video Clip"), undefined);
  assert.equal(form.values.media.length, 1);
  assert.deepEqual(form.values.media.find(item => item.tag === photo.tag), photo);
  assert.equal(form.values.fieldComment.text, "Updated field note");
});
