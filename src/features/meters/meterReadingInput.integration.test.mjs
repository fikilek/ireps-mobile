import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { useFormikContext } from "formik";
import { StackActions, StackRouter } from "@react-navigation/routers";
import { loadEntry, nativeHosts, paperHosts } from "./entryTestHarness.mjs";

// Exercise the real screen, Formik, validation and batched updates. GPS is delayed
// deliberately: it must merge into whatever the worker has typed in the meantime.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const gps = { latitude: -28.1666362, longitude: 30.2552325 };

async function mount(t, kind = "conventional", options = {}) {
  let state;
  const requests = [];
  const services = [];
  const events = [];
  const alerts = [];
  const storage = new Map();
  const files = new Map([["file:///test.jpg", "photo bytes"], ["file:///saved-photo.jpg", "saved photo bytes"]]);
  const connection = { online: options.online === true, reply: options.reply || { success: true, code: "OK" } };
  const calls = [];
  const retries = [];
  storage.set("submission_queue_items", JSON.stringify(options.queueItems || []));
  const stack = StackRouter({ initialRouteName: options.rootOnly ? "meter-reading" : "index" });
  const stackConfig = { routeNames: ["index", "meter-reading"], routeParamList: {}, routeGetIdList: {} };
  let navigationState = stack.getInitialState(stackConfig);
  const dispatch = action => {
    navigationState = stack.getStateForAction(navigationState, action, stackConfig) || navigationState;
  };
  if (!options.rootOnly) dispatch(StackActions.push("meter-reading"));
  let destination = "/(tabs)/asts/meter-reading";
  const router = {
    canDismiss: () => navigationState.index > 0,
    dismissAll: () => { events.push("dismiss"); dispatch(StackActions.popToTop()); },
    replace: href => {
      events.push("replace");
      destination = href;
      if (href === "/(tabs)/asts") dispatch(StackActions.replace("index"));
    },
    navigate: href => { events.push("navigate"); destination = href; },
  };
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
  const overrides = {
    "react-native": { ...nativeHosts, TextInput: "NativeTextInput", Image: "Image",
      StyleSheet: { create: value => value }, Platform: { OS: "android", select: value => value.android ?? value.default },
      Alert: { alert: (...args) => { alerts.push(args); events.push("alert"); } }, Linking: {},
    },
    "react-native-paper": { ...paperHosts, Divider: "Divider", TextInput: "TextInput", RadioButton: { Group: "RadioGroup" } },
    "@expo/vector-icons": { Feather: "Icon", MaterialCommunityIcons: "Icon" },
    "@react-native-community/netinfo": { fetch: async () => {
      events.push("connectivity");
      return { isConnected: connection.online, isInternetReachable: connection.online };
    } },
    "expo-location": {
      Accuracy: { High: 4 }, requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
      getCurrentPositionAsync: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    },
    "expo-router": { Stack: { Screen: "StackScreen" },
      useLocalSearchParams: () => ({ astId: fixture.id, ...options.params }), useRouter: () => router,
    },
    "firebase/functions": { httpsCallable: (_functions, name) => async payload => {
      calls.push({ name, payload: JSON.parse(JSON.stringify(payload)) });
      events.push("callable");
      if (connection.reply instanceof Error) throw connection.reply;
      return { data: connection.reply };
    } },
    "firebase/storage": { getStorage: () => ({}), ref: (_storage, path) => path,
      uploadBytesResumable: () => {
        events.push("upload");
        if (connection.uploadMode !== "stalled") return Promise.resolve();
        let reject;
        const upload = new Promise((_resolve, fail) => { reject = fail; });
        upload.cancel = () => reject(Object.assign(new Error("Upload cancelled"), { code: "storage/canceled" }));
        return upload;
      },
      getDownloadURL: async path => `https://example.test/${path}`,
      deleteObject: async () => { throw Error("Submitted reading evidence must survive refusal"); },
    },
    "expo-file-system/legacy": {
      documentDirectory: "file:///documents/",
      makeDirectoryAsync: async () => {},
      copyAsync: async ({ from, to }) => {
        if (options.mediaFailure || !files.has(from)) throw Error("Photo could not be saved");
        files.set(to, files.get(from)); events.push("photo copied");
      },
      getInfoAsync: async uri => ({ exists: [...files.keys()].some(path => path.startsWith(uri)) }),
      deleteAsync: async uri => { for (const path of files.keys()) if (path.startsWith(uri)) files.delete(path); },
    },
    "./src/services/startMeterDiscoveryQueueSyncService.js": {
      scheduleMeterDiscoveryQueueSyncRetry: details => retries.push(details),
    },
    "./src/firebase.js": { functions: {} },
    "./src/theme/formColors.js": { FORM_TEXT: "#000", FORM_PLACEHOLDER: "#777" },
    "./src/context/WarehouseContext.js": { useWarehouse: () => warehouse },
    "./src/hooks/useAuth.js": { useAuth: () => ({ user: { uid: "test-worker" }, profile: {} }) },
    "./src/redux/spApi.js": { useGetServiceProvidersQuery: () => ({ data: services }) },
    "react-native-mmkv": { createMMKV: () => ({
      getString: key => storage.get(key),
      set: (key, value) => {
        if (options.storageFailure) throw Error("Device storage unavailable");
        storage.set(key, value);
        events.push("persisted");
      },
    }) },
    "./components/media/IrepsMedia.js": { IrepsMedia: Media },
    "./components/forms/IrepsFormActions.js": { IrepsFormActions: "FormActions" },
    "./components/SceenLock.js": { ScreenLock: "ScreenLock" },
  };
  const globals = { fetch: async uri => {
    assert.ok(files.has(uri), "Sending must read a photo that still exists");
    return { blob: async () => ({ size: files.get(uri).length }) };
  } };
  const Screen = loadEntry("app/(tabs)/asts/meter-reading.js", overrides, { globals });
  const sendQueue = loadEntry("src/services/processSubmissionQueue.js", overrides, { globals, exportName: "processSubmissionQueue" });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Screen)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const label = kind === "prepaid" ? "Token Reading" : "Meter Reading";
  const field = kind === "prepaid" ? "tokenReading" : "reading";
  const input = () => renderer.root.findAllByType("TextInput").find(node => node.props.label === label);
  return {
    renderer, requests, alerts, events, connection, calls, retries, files,
    async reconnect() { connection.online = true; await sendQueue({ filterMode: "AUTO_SEND", includeSyncing: true }); },
    get queue() { return JSON.parse(storage.get("submission_queue_items")); },
    get destination() { return destination; }, get navigationState() { return navigationState; },
    get state() { return state; }, get value() { return input().props.value; },
    get canSubmit() { return renderer.root.findByType("FormActions").props.canSubmit; },
    async type(text) { await act(async () => input().props.onChangeText(text)); },
    async blur() { await act(async () => input().props.onBlur()); },
    async save() { await act(async () => renderer.root.findByType("FormActions").props.onSave()); },
    async submit() { await act(async () => state.submitForm()); },
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

test("SAVE persists the reading and photo before closing the form without an extra Continue tap", async t => {
  const form = await mount(t);
  await form.type("527");
  await form.photo();
  await form.gps();
  const capturedAt = form.state.values.meterReading.readingAt;
  await form.save();
  assert.equal(form.queue.length, 1);
  assert.equal(form.queue[0].payload.meterReading.reading, "527");
  assert.equal(form.queue[0].payload.meterReading.readingAt, capturedAt);
  assert.ok(form.queue[0].payload.media[0].uri.startsWith("file:///documents/"));
  assert.equal(form.files.get(form.queue[0].payload.media[0].uri), "photo bytes");
  assert.equal(form.queue[0].status, "IN_PROGRESS");
  assert.equal(form.destination, "/(tabs)/asts");
  assert.ok(form.navigationState.routes.every(route => route.name !== "meter-reading"));
  assert.deepEqual(form.events.slice(0, 2), ["photo copied", "persisted"]);
  assert.match(form.alerts.at(-1)[0], /saved/i);
  await form.reconnect();
  assert.equal(form.calls.length, 0, "SAVE is a draft, not an automatic submission");
});

test("failed local storage keeps the reading open and editable", async t => {
  const form = await mount(t, "conventional", { storageFailure: true });
  await form.type("527");
  await form.photo();
  await form.save();
  assert.equal(form.queue.length, 0);
  assert.equal(form.destination, "/(tabs)/asts/meter-reading");
  assert.equal(form.value, "527");
  assert.deepEqual(form.events, ["photo copied", "alert"]);
  assert.match(form.alerts.at(-1)[0], /not saved/i);
});

for (const rootOnly of [false, true]) {
  test(`saving a queued reading clears the AST stack before returning to Saved Forms (root only: ${rootOnly})`, async t => {
    const form = await mount(t, "conventional", {
      rootOnly, params: { queueItemId: "saved-reading" },
      queueItems: [{ id: "saved-reading", status: "IN_PROGRESS", payload: {
        id: "reading-trn", ast: { astData: { astNo: "65386" }, location: { gps } },
        meterReading: { reading: "527", readingAt: "2026-10-05T19:03:12Z", readingGps: { lat: gps.latitude, lng: gps.longitude } },
        media: [{ tag: "meterReadingEvidence", uri: "file:///saved-photo.jpg" }],
      } }],
    });
    await form.type("528");
    await form.save();
    assert.equal(form.queue.length, 1, "An edited saved form updates the same item");
    assert.equal(form.queue[0].id, "saved-reading");
    assert.equal(form.queue[0].payload.meterReading.reading, "528");
    assert.equal(form.destination, "/(tabs)/admin/storage/forms-submission-queue");
    assert.ok(form.navigationState.routes.every(route => route.name !== "meter-reading"), "Returning to ASTs or pressing Back must not reopen the saved form");
    assert.deepEqual(form.events.slice(0, 2), ["photo copied", "persisted"]);
  });
}

test("saving an office reading returns to My Work Orders after removing the form", async t => {
  const form = await mount(t, "conventional", { params: { instructionTrnId: "office-reading" } });
  await form.type("527");
  await form.save();
  assert.equal(form.queue[0].payload.instructionTrnId, "office-reading");
  assert.equal(form.destination, "/(tabs)/admin/operations/my-workorders");
  assert.ok(form.navigationState.routes.every(route => route.name !== "meter-reading"));
});

test("offline SUBMIT persists the actual reading and photo, closes, and reconnect sends the same capture once", async t => {
  const form = await mount(t);
  await form.type("527");
  await form.photo();
  await form.gps();
  const readingAt = form.state.values.meterReading.readingAt;
  await form.submit();
  assert.equal(form.queue.length, 1);
  const queued = form.queue[0];
  assert.equal(queued.status, "PENDING");
  assert.equal(queued.context.autoSend, true);
  assert.equal(queued.payload.meterReading.reading, "527");
  assert.equal(queued.payload.meterReading.readingAt, readingAt);
  assert.ok(form.files.has(queued.payload.media[0].uri));
  assert.equal(form.calls.length, 0);
  assert.deepEqual(form.events.slice(0, 3), ["photo copied", "persisted", "connectivity"]);
  assert.match(form.alerts.at(-1)[0], /saved offline/i);
  assert.ok(form.retries.length);
  assert.equal(form.destination, "/(tabs)/asts");
  assert.ok(form.navigationState.routes.every(route => route.name !== "meter-reading"));
  // Mimic camera-cache eviction while the phone has no signal.
  form.files.delete("file:///test.jpg");
  await form.reconnect();
  assert.equal(form.calls.length, 1);
  assert.equal(form.calls[0].name, "onMeterLifecycleTrnCallable");
  assert.equal(form.calls[0].payload.id, queued.payload.id);
  assert.equal(form.calls[0].payload.meterReading.readingAt, readingAt);
  assert.deepEqual(form.calls[0].payload.metadata, queued.payload.metadata);
  assert.ok(form.calls[0].payload.media[0].url);
  assert.equal(form.queue[0].status, "SUCCESS");
  assert.equal(form.files.has(queued.payload.media[0].uri), false, "Clean durable evidence only after acknowledgement");
  await form.reconnect();
  assert.equal(form.calls.length, 1);
});

test("online SUBMIT also persists first and closes after the shared sender confirms it", async t => {
  const form = await mount(t, "conventional", { online: true });
  await form.type("527");
  await form.photo();
  await form.gps();
  await form.submit();
  assert.deepEqual(form.events.slice(0, 3), ["photo copied", "persisted", "connectivity"]);
  assert.equal(form.calls.length, 1);
  assert.equal(form.queue.length, 0, "Acknowledged capture is removed from the queue");
  assert.match(form.alerts.at(-1)[0], /reading recorded/i);
  assert.equal(form.destination, "/(tabs)/asts");
});

for (const office of [false, true]) {
test(`submitting an edited draft preserves its capture and origin (office: ${office})`, async t => {
  const draft = await mount(t, "conventional", { params: office ? { instructionTrnId: "office-reading" } : {} });
  await draft.type("527");
  await draft.photo();
  await draft.gps();
  await draft.save();
  const original = draft.queue[0];
  const form = await mount(t, "conventional", {
    params: { queueItemId: original.id, instructionTrnId: "NAv", trnId: original.payload.id,
      action: JSON.stringify({ source: "MMKV_QUEUE", trnId: original.payload.id, instructionTrnId: "NAv" }),
    }, queueItems: [original],
  });
  // The persistent file outlives the first screen.
  form.files.set(original.payload.media[0].uri, draft.files.get(original.payload.media[0].uri));
  await form.type("528");
  await form.submit();
  assert.equal(form.queue.length, 1);
  assert.equal(form.queue[0].id, original.id);
  assert.equal(form.queue[0].payload.id, original.payload.id);
  assert.equal(form.queue[0].payload.instructionTrnId, office ? "office-reading" : "");
  assert.equal(form.queue[0].payload.origin.channel, office ? "OFFICE" : "FIELD");
  assert.equal(form.queue[0].payload.metadata.createdOnDevice, original.payload.metadata.createdOnDevice);
  assert.equal(form.queue[0].payload.meterReading.reading, "528");
  assert.equal(form.queue[0].status, "PENDING");
  assert.equal(form.queue[0].context.autoSend, true);
  assert.equal(form.destination, "/(tabs)/admin/storage/forms-submission-queue");
  await form.reconnect();
  assert.equal(form.calls[0].payload.meterReading.reading, "528");
});
}

for (const failure of ["storageFailure", "mediaFailure"]) {
  test(`SUBMIT keeps the filled form open if ${failure} prevents durable saving`, async t => {
    const form = await mount(t, "conventional", { online: true, [failure]: true });
    await form.type("527");
    await form.photo();
    await form.gps();
    await form.submit();
    assert.equal(form.queue.length, 0);
    assert.equal(form.calls.length, 0);
    assert.equal(form.events.includes("connectivity"), false);
    assert.equal(form.destination, "/(tabs)/asts/meter-reading");
    assert.equal(form.value, "527");
    assert.match(form.alerts.at(-1)[0], /not saved/i);
  });
}

test("a refused reading remains available to correct and is not described as waiting to send", async t => {
  const form = await mount(t, "conventional", { online: true, reply: { success: false, code: "INVALID_READING", message: "Correct the reading." } });
  await form.type("527");
  await form.photo();
  await form.gps();
  await form.submit();
  assert.equal(form.queue[0].status, "CONFLICT");
  assert.ok(form.files.has(form.queue[0].payload.media[0].uri));
  assert.match(form.alerts.at(-1)[0], /not accepted/i);
  assert.equal(form.alerts.at(-1)[1], "Correct the reading.");
  await form.reconnect();
  assert.equal(form.calls.length, 1);
});

test("a lost acknowledgement keeps the capture and retries its original id, timestamp and uploaded photo", async t => {
  const form = await mount(t, "conventional", { online: true,
    reply: Object.assign(new Error("Connection lost"), { code: "functions/unavailable" }),
  });
  await form.type("527");
  await form.photo();
  await form.gps();
  await form.submit();
  assert.equal(form.queue[0].status, "PENDING");
  assert.ok(form.files.has(form.queue[0].payload.media[0].uri));
  assert.match(form.alerts.at(-1)[0], /saved on this phone/i);
  form.connection.reply = { success: true, idempotent: true };
  await form.reconnect();
  assert.equal(form.calls.length, 2);
  assert.deepEqual(form.calls[1], form.calls[0]);
  assert.equal(form.events.filter(event => event === "upload").length, 1);
  assert.equal(form.queue[0].status, "SUCCESS");
});

test("a slow upload cannot trap the worker on the form and its later timeout keeps evidence for retry", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.parse("2026-10-05T19:03:12Z") });
  const form = await mount(t, "conventional", { online: true });
  form.connection.uploadMode = "stalled";
  await form.type("527");
  await form.photo();
  await form.gps();
  await act(async () => {
    const submitted = form.state.submitForm();
    for (let step = 0; step < 150 && !form.events.includes("upload"); step++) await Promise.resolve();
    assert.ok(form.events.includes("upload"));
    t.mock.timers.tick(15001);
    await submitted;
  });
  assert.equal(form.destination, "/(tabs)/asts");
  assert.match(form.alerts.at(-1)[0], /saved on this phone/i);
  const captured = form.queue[0].payload;
  assert.equal(form.queue[0].status, "SYNCING");
  assert.ok(form.files.has(captured.media[0].uri));
  await act(async () => {
    t.mock.timers.tick(60000);
    for (let step = 0; step < 150 && form.queue[0].status === "SYNCING"; step++) await Promise.resolve();
  });
  assert.equal(form.queue[0].status, "PENDING");
  assert.equal(form.queue[0].result.code, "STORAGE_UPLOAD_TIMEOUT");
  form.connection.uploadMode = "success";
  await form.reconnect();
  assert.equal(form.calls[0].payload.id, captured.id);
  assert.equal(form.calls[0].payload.meterReading.reading, "527");
  assert.equal(form.calls[0].payload.meterReading.readingAt, captured.meterReading.readingAt);
  assert.equal(form.queue[0].status, "SUCCESS");
});
