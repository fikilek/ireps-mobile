import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { create, act } from "react-test-renderer";
import { transformSync } from "@babel/core";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const filename = fileURLToPath(new URL("../../../components/MissionInstallationModal.js", import.meta.url));
const { code } = transformSync(fs.readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  plugins: [
    [require.resolve("@babel/plugin-transform-react-jsx"), { runtime: "automatic" }],
    require.resolve("@babel/plugin-transform-modules-commonjs"),
  ],
});
const choices = ["WATER", "ELEC", "NO ACCESS (NA)"];
const missionFor = id => ({
  premiseId: id,
  premise: { id, erfId: `erf-${id}`, erfNo: id, address: `${id} Craigside Street`, parents: { wardPcode: "ward", lmPcode: "lm" } },
});

async function mount(t) {
  const requests = [], routes = [], alerts = [], selections = [];
  let closes = 0;
  let context = { isVisible: true, mission: missionFor("5184"), closeMissionInstallation: () => { closes++; } };
  const overrides = {
    "expo-router": { useRouter: () => ({ push: route => routes.push(route) }) },
    "react-native": { View: "View", StyleSheet: { create: value => value }, Alert: { alert: (...args) => alerts.push(args) } },
    "react-native-paper": Object.fromEntries(["ActivityIndicator", "Button", "Modal", "Portal", "Surface", "Text"].map(name => [name, name])),
    "../src/context/GeoContext": { useGeo: () => ({ updateGeo: value => selections.push(value) }) },
    "../src/context/InstallationContext": { useInstallation: () => context },
    "../src/features/meters/accessGate": { premiseAddressWords: premise => premise.address, premisePropertyTypeWords: () => "Residential" },
    "../src/features/meters/batchWorkGate": {
      BATCH_WORK_BLOCKED: "BLOCKED", BATCH_WORK_BLOCKED_TITLE: "This work is not yours", BATCH_WORK_BLOCKED_FOOTER: "Ask the office.",
      checkBatchWorkBeforeForm: input => new Promise(resolve => requests.push({ input, resolve })),
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => overrides[name] || require(name), console }, { filename });
  const Component = module.exports.default;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Component)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const button = label => renderer.root.findAllByType("Button").find(node => node.props.children === label);
  return {
    renderer, requests, routes, alerts, selections, button,
    get closes() { return closes; },
    // Do not await the press promise: the check deliberately remains unresolved.
    async tap(label) { await act(async () => { button(label).props.onPress(); }); },
    async result(index, state, message = "") { await act(async () => { requests[index].resolve({ state, message }); }); },
    async context(next) { context = { ...context, ...next }; await act(async () => renderer.update(React.createElement(Component))); },
    async dismiss() { await act(async () => renderer.root.findByType("Modal").props.onDismiss()); },
    async unmount() { await act(async () => renderer.unmount()); },
  };
}

test("Installation immediately shows one progress indicator and prevents repeated choices", async t => {
  const form = await mount(t);
  assert.equal(form.renderer.root.findAllByType("ActivityIndicator").length, 0);
  const firstPress = form.button("NO ACCESS (NA)").props.onPress;
  const secondPress = form.button("WATER").props.onPress;
  await act(async () => { firstPress(); secondPress(); firstPress(); });
  assert.equal(form.requests.length, 1, "Even taps before a render start only one check");
  assert.equal(form.requests[0].input.premiseId, "5184");
  assert.equal(form.requests[0].input.erfId, "erf-5184");
  assert.equal(form.routes.length, 0);
  assert.equal(form.renderer.root.findAllByType("ActivityIndicator").length, 1);
  assert.ok(form.renderer.root.findAllByType("Text").some(node => node.props.children === "Checking work access…"));
  choices.forEach(label => assert.equal(form.button(label).props.disabled, true));
  assert.ok(!form.button("CANCEL").props.disabled);
  await form.result(0, "ALLOWED");
  assert.equal(form.routes.length, 1);
  assert.equal(form.renderer.root.findAllByType("ActivityIndicator").length, 0);
});

for (const state of ["ALLOWED", "UNCHECKED"]) {
  for (const label of choices) {
    test(`${label} preserves its route after ${state}`, async t => {
      const form = await mount(t);
      await form.tap(label);
      await form.result(0, state);
      assert.equal(form.closes, 1);
      assert.equal(form.routes.length, 1);
      const route = form.routes[0];
      if (label === "NO ACCESS (NA)") {
        assert.equal(route.pathname, "/(tabs)/admin/operations/no-access");
        const context = JSON.parse(route.params.context);
        assert.equal(context.trnType, "METER_INSTALLATION");
        assert.equal(context.premiseId, "5184");
        assert.equal(context.premiseAddress, "5184 Craigside Street");
        assert.equal(context.erfId, "erf-5184");
        assert.equal(context.returnTo, "/(tabs)/premises");
        assert.equal(form.selections.length, 0);
      } else {
        assert.equal(route.pathname, "/(tabs)/premises/form-meter-installation");
        assert.equal(route.params.premiseId, "5184");
        assert.deepEqual(JSON.parse(route.params.action), { access: "yes", meterType: label === "WATER" ? "water" : "electricity" });
        assert.equal(form.selections[0].selectedPremise.id, "5184");
      }
    });
  }
}

test("a refusal keeps the server message, clears progress and allows another choice", async t => {
  const form = await mount(t);
  await form.tap("NO ACCESS (NA)");
  await form.result(0, "BLOCKED", "ERF 5184 belongs to another team.");
  assert.deepEqual(form.alerts, [["This work is not yours", "ERF 5184 belongs to another team.\n\nAsk the office."]]);
  assert.equal(form.routes.length, 0);
  assert.equal(form.closes, 0);
  choices.forEach(label => assert.equal(form.button(label).props.disabled, false));
  assert.equal(form.renderer.root.findAllByType("ActivityIndicator").length, 0);
  await form.tap("ELEC");
  assert.equal(form.requests.length, 2);
});

for (const state of ["ALLOWED", "BLOCKED"]) {
  test(`Cancel discards a late ${state} result`, async t => {
    const form = await mount(t);
    await form.tap("NO ACCESS (NA)");
    await form.tap("CANCEL");
    await form.result(0, state, "Old refusal");
    assert.equal(form.closes, 1);
    assert.equal(form.routes.length, 0);
    assert.equal(form.alerts.length, 0);
    assert.equal(form.renderer.root.findAllByType("ActivityIndicator").length, 0);
  });
}

test("outside dismissal and unmount both discard pending navigation", async t => {
  const dismissed = await mount(t);
  await dismissed.tap("WATER");
  await dismissed.dismiss();
  await dismissed.result(0, "ALLOWED");
  assert.equal(dismissed.routes.length, 0);
  const removed = await mount(t);
  await removed.tap("ELEC");
  await removed.unmount();
  await removed.result(0, "ALLOWED");
  assert.equal(removed.routes.length, 0);
});

for (const transition of ["new premise", "close and reopen"]) {
  test(`${transition} cannot receive the earlier result or lose its own progress`, async t => {
    const form = await mount(t);
    await form.tap("NO ACCESS (NA)");
    if (transition === "close and reopen") {
      await form.context({ isVisible: false });
      await form.context({ isVisible: true });
    } else {
      await form.context({ mission: missionFor("5224") });
    }
    assert.equal(form.renderer.root.findAllByType("ActivityIndicator").length, 0);
    await form.tap("WATER");
    await form.result(0, "ALLOWED");
    assert.equal(form.routes.length, 0);
    assert.equal(form.renderer.root.findAllByType("ActivityIndicator").length, 1);
    await form.result(1, "ALLOWED");
    assert.equal(form.routes.length, 1);
    assert.equal(form.routes[0].params.premiseId, transition === "new premise" ? "5224" : "5184");
  });
}
