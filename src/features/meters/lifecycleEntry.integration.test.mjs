import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { loadEntry, deferredGate, nativeHosts, paperHosts } from "./entryTestHarness.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const actions = [
  ["COMM", "COMMISSIONING", "FIELD"],
  ["INSP", "INSPECTION", "CONNECTED"],
  ["DISC", "DISCONNECTION", "CONNECTED"],
  ["RECON", "RECONNECTION", "DISCONNECTED"],
  ["REM", "REMOVAL", "CONNECTED"],
  ["MREAD", "READING", "CONNECTED"],
];
const assetFor = (state, id = "asset-1") => ({
  id, meterType: "electricity", status: { state },
  ast: { astData: { astNo: "123456", meter: { type: "conventional" } } },
  accessData: {
    erfId: "erf-5187", erfNo: "5187",
    premise: { id: "premise-5187", address: "5187 Craigside Street" },
    parents: { wardPcode: "ward-006", lmPcode: "lm" },
  },
});

async function mount(t, state = "CONNECTED", office = false) {
  const requests = [], routes = [], alerts = [];
  let focused = true, item = assetFor(state);
  const Component = loadEntry("src/features/asts/astItem.js", {
    "react-native": { ...nativeHosts, StyleSheet: { create: value => value }, Alert: { alert: (...args) => alerts.push(args) } },
    "react-native-paper": paperHosts,
    "@expo/vector-icons": { MaterialCommunityIcons: "Icon" },
    "@react-navigation/native": { useIsFocused: () => focused },
    "expo-router": { useRouter: () => ({ push: route => routes.push(route) }) },
    "./src/context/GeoContext.js": { useGeo: () => ({ geoState: {}, updateGeo() {} }) },
    "./src/context/WarehouseContext.js": { useWarehouse: () => ({ all: { prems: [] } }) },
    "./src/hooks/useAuth.js": { useAuth: () => ({ isFWR: !office, isMNG: office, isSPV: false, profile: {} }) },
    "./src/redux/spApi.js": { useGetServiceProvidersQuery: () => ({ data: [] }) },
    "./src/utils/updatedAtLabel.js": { updatedAtLabel: () => "" },
    "./src/features/meters/formOptions.js": { anomalyTone: () => "ok" },
    "./src/features/meters/batchWorkGate.js": deferredGate(requests),
  });
  let renderer;
  const element = () => React.createElement(Component, { item });
  await act(async () => { renderer = create(element()); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const button = label => renderer.root.findAllByType("TouchableOpacity")
    .find(node => node.findAllByType("Text").some(text => text.props.children === label));
  return {
    renderer, requests, routes, alerts, button,
    async tap(label) { await act(async () => { button(label).props.onPress(); }); },
    async result(state, index = 0) { await act(async () => requests[index].resolve({ state, message: "Another team's ERF." })); },
    async choose(text) { await act(async () => alerts.at(-1)[2].find(choice => choice.text === text).onPress()); },
    async cancel() { await act(async () => renderer.root.findByType("Button").props.onPress()); },
    async back() { await act(async () => renderer.root.findAllByType("Modal").find(node => node.props.visible).props.onRequestClose()); },
    async blur() { focused = false; await act(async () => renderer.update(element())); },
    async replace() { item = assetFor(state, "asset-2"); await act(async () => renderer.update(element())); },
    async unmount() { await act(async () => renderer.unmount()); },
    get spinners() { return renderer.root.findAllByType("ActivityIndicator").length; },
  };
}

for (const [label, type, meterState] of actions) {
  for (const answer of ["NO ACCESS", "YES, I REACHED IT"]) {
    test(`${type}: immediate progress then ${answer} preserves the transaction and meter`, async t => {
      const form = await mount(t, meterState);
      await form.tap(label);
      assert.equal(form.spinners, 1);
      assert.equal(form.alerts.length, 0);
      assert.equal(form.routes.length, 0);
      assert.equal(form.requests[0].input.erfId, "erf-5187");
      assert.equal(form.requests[0].input.premiseId, "premise-5187");
      ["COMM", ...actions.map(action => action[0])].forEach(name => assert.equal(form.button(name).props.disabled, true));
      await form.result("ALLOWED");
      assert.equal(form.spinners, 0);
      assert.equal(form.alerts.length, 1);
      await form.choose(answer);
      assert.equal(form.routes.length, 1);
      const route = form.routes[0];
      const context = JSON.parse(answer === "NO ACCESS" ? route.params.context : route.params.action);
      assert.equal(context.trnType, `METER_${type}`);
      assert.equal(context.astId, "asset-1");
      assert.equal(context.premiseId, "premise-5187");
      assert.equal(context.returnTo, "/(tabs)/asts");
      if (answer === "NO ACCESS") {
        assert.equal(route.pathname, "/(tabs)/admin/operations/no-access");
        assert.equal(context.erfId, "erf-5187");
      } else {
        assert.equal(route.pathname, `/(tabs)/asts/${type === "READING" ? "meter-reading" : type.toLowerCase()}`);
        assert.equal(JSON.parse(decodeURIComponent(route.params.asset)).id, "asset-1");
        assert.equal(context.source, "FIELD");
        assert.equal(context.statusBefore, meterState);
      }
    });
  }
}

test("rapid taps on different meter actions start just one check", async t => {
  const form = await mount(t);
  await act(async () => {
    form.button("INSP").props.onPress();
    form.button("DISC").props.onPress();
    form.button("MREAD").props.onPress();
  });
  assert.equal(form.requests.length, 1);
  await form.result("ALLOWED");
  assert.equal(form.alerts.length, 1);
});

test("a refused meter check keeps the server message and allows retry", async t => {
  const form = await mount(t);
  await form.tap("INSP");
  await form.result("BLOCKED");
  assert.deepEqual(form.alerts, [["This work is not yours", "Another team's ERF.\n\nAsk the office."]]);
  assert.equal(form.spinners, 0);
  assert.equal(form.routes.length, 0);
  await form.tap("INSP");
  assert.equal(form.requests.length, 2);
});

test("an offline meter check still permits the access question", async t => {
  const form = await mount(t);
  await form.tap("MREAD");
  await form.result("UNCHECKED");
  assert.equal(form.spinners, 0);
  await form.choose("NO ACCESS");
  assert.equal(JSON.parse(form.routes[0].params.context).trnType, "METER_READING");
});

for (const [label, state] of [["INSP", "CONNECTED"], ["COMM", "FIELD"]]) {
for (const transition of ["cancel", "back", "blur", "replace", "unmount"]) {
  test(`${label}: ${transition} ignores a late meter work-access result`, async t => {
    const form = await mount(t, state);
    await form.tap(label);
    await form[transition]();
    await form.result("ALLOWED");
    assert.equal(form.alerts.length, 0);
    assert.equal(form.routes.length, 0);
    if (transition !== "unmount") assert.equal(form.spinners, 0);
  });
}
}

test("Commissioning checks work ownership, blocks refused work and allows an offline access choice", async t => {
  const form = await mount(t, "FIELD");
  await act(async () => {
    form.button("COMM").props.onPress();
    form.button("COMM").props.onPress();
    form.button("INSP").props.onPress();
  });
  assert.equal(form.requests.length, 1);
  await form.result("BLOCKED");
  assert.equal(form.routes.length, 0);
  assert.equal(form.alerts.at(-1)[0], "This work is not yours");
  await form.tap("COMM");
  await form.result("UNCHECKED", 1);
  await form.choose("NO ACCESS");
  assert.equal(JSON.parse(form.routes[0].params.context).trnType, "METER_COMMISSIONING");
});

test("Commissioning keeps its FIELD and actor eligibility before the shared gate", async t => {
  for (const [state, office, title] of [["CONNECTED", false, "Not Eligible"], ["FIELD", true, "Not Allowed"]]) {
    const form = await mount(t, state, office);
    await form.tap("COMM");
    assert.equal(form.requests.length, 0);
    assert.equal(form.routes.length, 0);
    assert.equal(form.alerts.at(-1)[0], title);
  }
});

test("a cancelled request cannot stop the next meter check's spinner", async t => {
  const form = await mount(t);
  await form.tap("INSP");
  await form.cancel();
  await form.tap("DISC");
  await form.result("BLOCKED", 0);
  assert.equal(form.spinners, 1);
  assert.equal(form.alerts.length, 0);
  await form.result("ALLOWED", 1);
  await form.choose("NO ACCESS");
  assert.equal(JSON.parse(form.routes[0].params.context).trnType, "METER_DISCONNECTION");
});

test("office instructions keep their immediate origin route", async t => {
  const form = await mount(t, "CONNECTED", true);
  await form.tap("INSP");
  assert.equal(form.requests.length, 0);
  assert.equal(form.spinners, 0);
  assert.equal(form.routes[0].pathname, "/(tabs)/admin/operations/trn-origin");
});
