import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { loadEntry, deferredGate, paperHosts, nativeHosts } from "./entryTestHarness.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const choices = ["WATER", "ELEC", "NO ACCESS (NA)"];
const missionFor = id => ({
  premiseId: id,
  premise: { id, erfId: `erf-${id}`, erfNo: id, address: `${id} Craigside Street`, parents: { wardPcode: "ward", lmPcode: "lm" } },
});

async function mount(t, kind) {
  const requests = [], routes = [], alerts = [], selections = [];
  let closes = 0;
  let context = { isVisible: true, mission: missionFor("5184"), [`closeMission${kind}`]: () => { closes++; } };
  const overrides = {
    "expo-router": { useRouter: () => ({ push: route => routes.push(route) }) },
    "react-native": { ...nativeHosts, StyleSheet: { create: value => value }, Alert: { alert: (...args) => alerts.push(args) } },
    "react-native-paper": paperHosts,
    "./src/context/GeoContext.js": { useGeo: () => ({ updateGeo: value => selections.push(value) }) },
    [`./src/context/${kind}Context.js`]: { [`use${kind}`]: () => context },
    "./src/features/meters/batchWorkGate.js": deferredGate(requests),
  };
  const Component = loadEntry(`components/Mission${kind}Modal.js`, overrides);
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

for (const label of choices) {
  test(`Discovery: ${label} keeps the targeted batch and return destination`, async t => {
    const form = await mount(t, "Discovery");
    const batch = {
      sourceModule: "SALES_TARGETED_BATCH", tbId: "batch-1", rowId: "row-2",
      erfId: "erf-5184", erfNo: "5184", targetedMeterNo: "123456",
      returnTo: "/(tabs)/admin/operations/my-workorders",
    };
    await form.context({ mission: { ...missionFor("5184"), targetedBatchContext: batch } });
    await form.tap(label);
    await form.result(0, "ALLOWED");
    const params = form.routes[0].params;
    const context = label === "NO ACCESS (NA)" ? JSON.parse(params.context) : null;
    const carried = context?.targetedBatchContext || JSON.parse(params.targetedBatchContext);
    assert.equal(carried.tbId, "batch-1");
    assert.equal(carried.rowId, "row-2");
    assert.equal(carried.returnTo, batch.returnTo);
    if (context) {
      assert.equal(context.returnTo, batch.returnTo);
      assert.equal(context.meterNo, "123456");
    }
  });
}

for (const kind of ["Installation", "Discovery"]) {
  test(`${kind} immediately shows one progress indicator and prevents repeated choices`, async t => {
    const form = await mount(t, kind);
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
      test(`${kind}: ${label} preserves its route after ${state}`, async t => {
        const form = await mount(t, kind);
        await form.tap(label);
        await form.result(0, state);
        assert.equal(form.closes, 1);
        assert.equal(form.routes.length, 1);
        const route = form.routes[0];
        if (label === "NO ACCESS (NA)") {
          assert.equal(route.pathname, "/(tabs)/admin/operations/no-access");
          const context = JSON.parse(route.params.context);
          assert.equal(context.trnType, `METER_${kind.toUpperCase()}`);
          assert.equal(context.premiseId, "5184");
          assert.equal(context.premiseAddress, "5184 Craigside Street");
          assert.equal(context.erfId, "erf-5184");
          assert.equal(context.returnTo, "/(tabs)/premises");
          assert.equal(form.selections.length, 0);
        } else {
          assert.equal(route.pathname, kind === "Installation" ? "/(tabs)/premises/form-meter-installation" : "/(tabs)/premises/form");
          assert.equal(route.params.premiseId, "5184");
          assert.deepEqual(JSON.parse(route.params.action), { access: "yes", meterType: label === "WATER" ? "water" : "electricity" });
          assert.equal(form.selections[0].selectedPremise.id, "5184");
        }
      });
    }
  }

  test(`${kind}: a refusal keeps the server message, clears progress and allows another choice`, async t => {
    const form = await mount(t, kind);
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
    test(`${kind}: Cancel discards a late ${state} result`, async t => {
      const form = await mount(t, kind);
      await form.tap("NO ACCESS (NA)");
      await form.tap("CANCEL");
      await form.result(0, state, "Old refusal");
      assert.equal(form.closes, 1);
      assert.equal(form.routes.length, 0);
      assert.equal(form.alerts.length, 0);
      assert.equal(form.renderer.root.findAllByType("ActivityIndicator").length, 0);
    });
  }

  test(`${kind}: outside dismissal and unmount both discard pending navigation`, async t => {
    const dismissed = await mount(t, kind);
    await dismissed.tap("WATER");
    await dismissed.dismiss();
    await dismissed.result(0, "ALLOWED");
    assert.equal(dismissed.routes.length, 0);
    const removed = await mount(t, kind);
    await removed.tap("ELEC");
    await removed.unmount();
    await removed.result(0, "ALLOWED");
    assert.equal(removed.routes.length, 0);
  });

  for (const transition of ["new premise", "close and reopen"]) {
    test(`${kind}: ${transition} cannot receive the earlier result or lose its own progress`, async t => {
      const form = await mount(t, kind);
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

}
