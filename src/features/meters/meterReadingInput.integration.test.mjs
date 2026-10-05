import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { useFormikContext } from "formik";
import { loadEntry, nativeHosts, paperHosts } from "./entryTestHarness.mjs";

// Exercise the real screen, Formik, validation and batched updates. GPS is delayed
// deliberately: it must merge into whatever the worker has typed in the meantime.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const gps = { latitude: -28.1666362, longitude: 30.2552325 };

async function mount(t, kind = "conventional") {
  let state;
  const requests = [];
  const services = [];
  const fixture = {
    id: "test-meter", meterType: "electricity", status: { state: "REMOVED" },
    ast: {
      astData: { astNo: "65386", meter: { type: kind, category: "Normal" } },
      location: { gps },
    },
    accessData: { erfNo: "4311", premise: { id: "test-premise", address: "4311 Jacaranda Avenue" } },
    mreadings: [{ reading: "523", readingAt: "2026-10-05T18:32:35.854Z" }],
  };
  const warehouse = { all: { meters: [fixture], prems: [] } };
  function Media(props) {
    state = useFormikContext();
    return React.createElement("Media", props);
  }
  const Screen = loadEntry("app/(tabs)/asts/meter-reading.js", {
    "react-native": { ...nativeHosts, TextInput: "NativeTextInput", Image: "Image",
      StyleSheet: { create: value => value }, Platform: { OS: "android", select: value => value.android ?? value.default },
      Alert: { alert() {} }, Linking: {},
    },
    "react-native-paper": { ...paperHosts, Divider: "Divider", TextInput: "TextInput", RadioButton: { Group: "RadioGroup" } },
    "@expo/vector-icons": { Feather: "Icon", MaterialCommunityIcons: "Icon" },
    "@react-native-community/netinfo": {},
    "expo-location": {
      Accuracy: { High: 4 }, requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
      getCurrentPositionAsync: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    },
    "expo-router": { Stack: { Screen: "StackScreen" },
      useLocalSearchParams: () => ({ astId: fixture.id }), useRouter: () => ({}),
    },
    "firebase/functions": { httpsCallable: () => () => { throw Error("No backend writes allowed in this test"); } },
    "firebase/storage": {},
    "./src/firebase.js": { functions: {} },
    "./src/theme/formColors.js": { FORM_TEXT: "#000", FORM_PLACEHOLDER: "#777" },
    "./src/context/WarehouseContext.js": { useWarehouse: () => warehouse },
    "./src/hooks/useAuth.js": { useAuth: () => ({ user: { uid: "test-worker" }, profile: {} }) },
    "./src/redux/spApi.js": { useGetServiceProvidersQuery: () => ({ data: services }) },
    "./src/utils/submissionQueue.js": {},
    "./components/media/IrepsMedia.js": { IrepsMedia: Media },
    "./components/forms/IrepsFormActions.js": { IrepsFormActions: "FormActions" },
    "./components/SceenLock.js": { ScreenLock: "ScreenLock" },
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Screen)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const label = kind === "prepaid" ? "Token Reading" : "Meter Reading";
  const field = kind === "prepaid" ? "tokenReading" : "reading";
  const input = () => renderer.root.findAllByType("TextInput").find(node => node.props.label === label);
  return {
    renderer, requests, get state() { return state; }, get value() { return input().props.value; },
    get canSubmit() { return renderer.root.findByType("FormActions").props.canSubmit; },
    async type(text) { await act(async () => input().props.onChangeText(text)); },
    async blur() { await act(async () => input().props.onBlur()); },
    async photo() { await act(async () => state.setFieldValue("media", [{
      tag: field === "reading" ? "meterReadingEvidence" : "tokenReadingPhoto", uri: "file:///test.jpg",
    }])); },
    async gps(index = 0) { await act(async () => requests[index].resolve({ coords: gps })); },
    async tap(text) { await act(async () => {
      renderer.root.findAllByType("TouchableOpacity").find(node =>
        node.findAllByType("Text").some(child => child.props.children === text)).props.onPress();
    }); },
  };
}

for (const kind of ["conventional", "prepaid"]) {
  test(`${kind}: delayed GPS keeps the latest reading, capture time and photo`, async t => {
    const form = await mount(t, kind);
    assert.equal(form.value, "");
    assert.equal(form.canSubmit, false);
    await form.type("5");
    const capturedAt = form.state.values.meterReading.readingAt;
    assert.ok(capturedAt);
    await form.type("52");
    await form.type("524.5");
    await form.photo();
    assert.equal(form.requests.length, 1);
    assert.equal(form.value, "524.5");
    assert.equal(form.canSubmit, false, "GPS is still required");
    await form.gps();
    assert.equal(form.value, "524.5", "GPS must not restore the blank value from before typing");
    assert.equal(form.state.values.meterReading.readingAt, capturedAt);
    assert.equal(form.state.values.media.length, 1, "Camera update must also survive");
    assert.equal(form.state.errors.meterReading?.reading, undefined);
    assert.equal(form.canSubmit, true);
    // The blur callback also awaits GPS while the worker can keep editing.
    await form.blur();
    await form.type("525");
    await form.gps(1);
    assert.equal(form.value, "525");
    assert.equal(form.canSubmit, true);
  });
}

test("clearing a reading while GPS is pending never restores the old reading", async t => {
  const form = await mount(t);
  await form.type("524");
  await form.gps();
  assert.equal(form.value, "524");
  await form.blur();
  await form.type("");
  await form.gps(1);
  assert.equal(form.value, "");
  assert.equal(form.state.errors.meterReading.reading, "Meter reading is required");
  assert.equal(form.canSubmit, false);
});

test("No Reading Available remains selected when GPS completes", async t => {
  const form = await mount(t);
  await form.tap("NO READING AVAILABLE");
  assert.equal(form.state.values.meterReading.noReadingMode, true);
  await form.gps();
  assert.equal(form.state.values.meterReading.noReadingMode, true);
  assert.equal(form.state.errors.meterReading.noReadingReason, "No-reading reason is required");
  assert.equal(form.canSubmit, false);
});

test("a lower reading still requires a reason after GPS capture", async t => {
  const form = await mount(t);
  await form.type("520");
  await form.photo();
  await form.gps();
  assert.equal(form.value, "520");
  assert.equal(form.canSubmit, false);
  assert.ok(form.renderer.root.findAllByType("Text").some(node => node.props.children === "Reading Lower Than Last Reading"));
  await form.type("524");
  assert.equal(form.canSubmit, true);
});
