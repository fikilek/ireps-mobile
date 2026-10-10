import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { act, create } from "react-test-renderer";
import { Formik, useFormikContext } from "formik";
import { loadEntry, nativeHosts, paperHosts } from "./entryTestHarness.mjs";

// Keep real Formik and the shared component; replace device playback.
//
// Owner, 11 October 2026: "lets remove the voice clip once and for all .. in
// all field comments .. in all trns", and "when we have time we will bring
// both voice and video back". So a field comment now captures text and a
// photo. What a worker already recorded stays playable and explicitly
// removable - taking the control away must not strand the clip behind it.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const photo = { tag: "fieldCommentPhoto", uri: "file:///photo.jpg", type: "image" };
const voice = { tag: "fieldCommentVoice", url: "https://example.test/saved.m4a", type: "audio" };
const video = { tag: "fieldCommentVideo", url: "https://example.test/saved.mp4", type: "video" };

async function mount(t, media = []) {
  let state;
  const videoSources = [];
  const player = { pause() {}, play() {}, seekTo: async () => {} };
  function Probe() {
    state = useFormikContext();
    return null;
  }
  // The component is handed a player and nothing else from expo-audio. It
  // loads, which is the proof that no recorder is left in it.
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
    renderer, videoSources, slot,
    get values() { return state.values; },
    async comment(text) {
      await act(async () => renderer.root.findByType("TextInput").props.onChangeText(text));
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

test("a new comment offers text and a photo, and nothing to record", async t => {
  const form = await mount(t, [photo]);

  for (const gone of ["Voice Clip", "Saved Voice Clip", "Video Clip", "Saved Video Clip"]) {
    assert.equal(form.slot(gone), undefined, gone + " must not be offered");
  }

  assert.equal(form.renderer.root.findAllByType("Modal").length, 0);

  const photoControl = form.renderer.root.findByType("PhotoCapture");
  assert.equal(photoControl.props.tag, "fieldCommentPhoto");
  assert.equal(photoControl.props.required, false);

  await form.comment("Meter and seal checked");

  assert.equal(form.values.fieldComment.text, "Meter and seal checked");
  assert.equal(form.values.media.length, 1, "no clip appears from nowhere");
  assert.deepEqual(form.values.media[0], photo);
});

test("the help text no longer promises a voice clip", async t => {
  const form = await mount(t, []);
  const words = form.renderer.root
    .findAllByType("Text")
    .flatMap(node => (Array.isArray(node.props.children) ? node.props.children : [node.props.children]))
    .filter(child => typeof child === "string")
    .join(" ");

  assert.match(words, /Add optional text or a photo\./);
  assert.doesNotMatch(words, /voice/i);
});

test("a saved voice clip still plays, and removing it offers no replacement", async t => {
  const form = await mount(t, [photo, voice, video]);

  // A saved clip carries no capture button, exactly as the saved video does.
  assert.equal(form.slot("Saved Voice Clip").findAllByType("IconButton").length, 0);
  assert.equal(form.slot("Saved Video Clip").findAllByType("IconButton").length, 0);

  await form.preview("Saved Voice Clip");
  assert.equal(form.renderer.root.findAllByType("Modal").length, 1, "the clip is playable");
  await act(async () => form.renderer.root.findByType("Modal").props.onRequestClose());

  await form.comment("Updated field note");
  assert.deepEqual(form.values.media.find(item => item.tag === voice.tag), voice);

  await form.remove("Saved Voice Clip");

  assert.equal(form.slot("Saved Voice Clip"), undefined, "it is gone");
  assert.equal(form.slot("Voice Clip"), undefined, "and nothing replaces it");
  assert.equal(form.values.media.length, 2);
  assert.deepEqual(form.values.media.find(item => item.tag === photo.tag), photo);
  assert.deepEqual(form.values.media.find(item => item.tag === video.tag), video);
  assert.equal(form.values.fieldComment.text, "Updated field note");
});

test("a saved video clip is untouched by the voice removal", async t => {
  const form = await mount(t, [video]);

  await form.preview("Saved Video Clip");
  assert.equal(form.renderer.root.findByType("VideoView").props.nativeControls, true);
  assert.equal(form.videoSources.at(-1).uri, video.url);
});

test("every form reads the one field comment well", async () => {
  // Owner, 11 October 2026: "we should make fieldComment 1 resuable
  // component". The tags a comment uploads and the shape its text takes are
  // declared once, in the section, so a form cannot know a different set from
  // the one that captures them.
  const section = await readFile(
    new URL("../../../components/forms/IrepsFieldCommentSection.js", import.meta.url),
    "utf8",
  );

  assert.match(
    section,
    /export const FIELD_COMMENT_MEDIA_TAG_LIST = Object\.values\(FIELD_COMMENT_MEDIA_TAGS\)/,
  );
  assert.match(
    section,
    /export const fieldCommentSchema = object\(\)\.shape\(\{ text: string\(\)\.notRequired\(\) \}\)/,
  );

  const forms = [
    "../../../app/(tabs)/asts/disconnection.jsx",
    "../../../app/(tabs)/asts/reconnection.jsx",
    "./FormMeterDiscovery.js",
  ];

  for (const form of forms) {
    const source = await readFile(new URL(form, import.meta.url), "utf8");

    assert.match(source, /fieldCommentSchema/, form + " must take the shared schema");
    assert.doesNotMatch(
      source,
      /fieldComment: object\(\)\.shape\(/,
      form + " must not declare its own field comment shape",
    );
    assert.doesNotMatch(
      source,
      /"fieldCommentVoice"/,
      form + " must not name the field comment tags for itself",
    );
  }
});
