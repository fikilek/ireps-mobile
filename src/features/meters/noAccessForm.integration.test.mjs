import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { create, act } from "react-test-renderer";
import { Formik, useFormikContext } from "formik";
import { transformSync } from "@babel/core";
import * as capture from "./noAccessCapture.js";
import * as policy from "./noAccessAppointmentPolicy.js";
import * as reasons from "./noAccessReasons.js";
import * as appointment from "./noAccessAppointment.js";
import * as readiness from "../../utils/formCanSubmit.js";

// Real React/Formik effects and real form/dropdown/footer handlers. Only native display
// primitives and camera hardware are replaced, so native effect ordering is preserved.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const initial = { reasonCode: "", reasonOther: "", appointment: null, media: [] };
const photo = [{ tag: "noAccessPhoto", uri: "file:///test.jpg" }];
const now = Date.parse("2026-10-05T09:00:10Z");

async function mount(t, openingValues = initial, originalAccess = null) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now });
  let state;
  let alert;
  let foreground;
  const native = Object.fromEntries(["View", "Text", "TouchableOpacity", "ScrollView", "ActivityIndicator", "Image", "Modal"].map(name => [name, name]));
  Object.assign(native, {
    StyleSheet: { create: value => value }, Platform: { OS: "android" },
    Alert: { alert: (...args) => { alert = args; } },
    AppState: { addEventListener: (_event, handler) => { foreground = handler; return { remove() {} }; } },
  });
  const paper = Object.fromEntries(["Divider", "Modal", "Portal", "Surface", "TextInput"].map(name => [name, name]));
  paper.List = { Item: "ListItem", Icon: "ListIcon" };
  paper.Button = function MockButton({ icon, children, ...props }) {
    return React.createElement("Button", props, icon?.({ size: 20, color: props.textColor }), children);
  };
  const overrides = {
    "react-native": native, "react-native-paper": paper,
    "@expo/vector-icons": { MaterialCommunityIcons: "Icon" },
    "../../src/theme/formColors": { FORM_TEXT: "#000" },
    "../../src/features/meters/noAccessCapture": capture,
    "../../src/features/meters/noAccessReasons": reasons,
    "../../src/features/meters/noAccessAppointmentPolicy": policy,
    "../../src/features/meters/noAccessAppointment": appointment,
    "../../utils/formCanSubmit": readiness,
    "./IrepsCamera": { IrepsCamera: "Camera" },
    "../../../components/forms/SubmitBlockers": { SubmitBlockers: "SubmitBlockers" },
  };
  function load(file) {
    const filename = path.join(root, file);
    const { code } = transformSync(fs.readFileSync(filename, "utf8"), {
      filename, babelrc: false, configFile: false,
      plugins: [[require.resolve("@babel/plugin-transform-react-jsx"), { runtime: "automatic" }], require.resolve("@babel/plugin-transform-modules-commonjs")],
    });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports,
      require: name => overrides[name] || require(name), console, Date,
      setTimeout: (...args) => setTimeout(...args), clearTimeout: (...args) => clearTimeout(...args),
    }, { filename });
    return module.exports;
  }
  overrides["./FormSelect"] = load("components/forms/FormSelect.js");
  overrides["../media/IrepsMedia"] = load("components/media/IrepsMedia.js");
  const { IrepsNoAccessForm } = load("components/forms/IrepsNoAccessForm.js");
  const { ForensicFooter } = load("src/features/meters/ForensicFooter.js");
  function Body() {
    state = useFormikContext();
    return React.createElement(React.Fragment, null,
      React.createElement(IrepsNoAccessForm, {
        visible: true, value: state.values, originalAccess,
        onChange: next => state.setValues({ ...state.values, ...next }),
        reasonErrorText: state.errors.reasonCode || state.errors.reasonOther || "",
        mediaErrorText: state.errors.media || "", appointmentErrorText: state.errors.appointment || "",
      }), React.createElement(ForensicFooter));
  }
  const validate = values => capture.validateNoAccessCapture(values, values.media, { originalAccess });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Formik, {
    initialValues: openingValues, initialErrors: validate(openingValues), validate,
    validateOnMount: true, validateOnChange: true, onSubmit() {},
  }, React.createElement(Body))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return {
    renderer, get state() { return state; }, get alert() { return alert; },
    button: name => renderer.root.findAllByType("Button").find(node => node.props.children.includes(name)),
    async reason(title) { await act(async () => renderer.root.findAllByType("ListItem").find(node => node.props.title === title).props.onPress()); },
    async photo() { await act(async () => state.setFieldValue("media", photo)); },
    async agreement() {
      const form = renderer.root.findByType(IrepsNoAccessForm);
      const value = { at: new Date(now + 10000).toISOString(), madeAt: new Date(now).toISOString() };
      await act(async () => form.props.onChange({ ...form.props.value, appointment: value }));
    },
    async pickerAgreement() {
      const tapText = async label => act(async () => {
        renderer.root.findAllByType("TouchableOpacity").find(node =>
          !node.props.disabled && node.findAllByType("Text").some(text => text.props.children === label)).props.onPress();
      });
      await tapText("MAKE AN APPOINTMENT");
      await tapText(6); // 6 October 2026, tomorrow in the frozen clock
      await tapText("01:00");
    },
    async removeAgreement() { await act(async () => {
      renderer.root.findAllByType("TouchableOpacity").find(node => node.findAllByType("Text").some(text => text.props.children === "REMOVE")).props.onPress();
    }); },
    async tick(ms) { await act(async () => t.mock.timers.tick(ms)); },
    async resume() { await act(async () => foreground("active")); },
  };
}

test("return selection validates immediately before any clock tick", async t => {
  const form = await mount(t);
  assert.equal(form.state.errors.reasonCode, "Choose why you could not access the meter.");
  assert.equal(form.button("RESET").props.disabled, true);
  await form.reason("Property Locked");
  assert.ok(form.state.errors.media);
  await form.photo();
  assert.equal(form.button("SUBMIT").props.disabled, false);
  await form.reason(policy.RETURN_VISIT_REASON);
  assert.equal(form.state.values.media.length, 0, "Changing to a return visit removes the previous photo from the payload");
  assert.ok(form.state.errors.appointment, "Newly visible appointment must already be invalid; no timer has run");
  assert.equal(form.state.errors.media, undefined);
  assert.equal(form.button("SUBMIT").props.disabled, true);
  assert.equal(Date.now(), now, "The clock did not advance");
});

test("Other requires an explanation even with a photo, and clearing it blocks submission again", async t => {
  const form = await mount(t);
  await form.reason("Other");
  await form.photo();
  const input = () => form.renderer.root.findAllByType("TextInput")
    .find(node => node.props.label === "Other NA Reason");
  const change = async value => act(async () => input().props.onChangeText(value));

  for (const value of ["", "   \t\n", "NAv"]) {
    await change(value);
    assert.equal(form.state.errors.reasonOther, "Type what stopped you reaching the meter.");
    assert.equal(input().props.error, true);
    assert.equal(form.button("SUBMIT").props.disabled, true);
    assert.equal(form.state.errors.media, undefined, "The explanation is the only missing requirement");
  }

  await change("  Guard asked me to contact the building manager  ");
  assert.equal(form.state.errors.reasonOther, undefined);
  assert.equal(input().props.error, false);
  assert.equal(form.button("SUBMIT").props.disabled, false);
  const payload = capture.buildNoAccessPayload({ context: { trnType: "METER_INSPECTION" },
    value: form.state.values, media: photo, trnId: "TEST_OTHER", capturedAt: new Date(now).toISOString() });
  assert.equal(payload.accessData.access.reasonOther, "Guard asked me to contact the building manager");

  await change("");
  assert.ok(form.state.errors.reasonOther);
  assert.equal(form.button("SUBMIT").props.disabled, true);
  assert.equal(Date.now(), now, "Validation must not wait for a timer");
});

test("a saved Other visit with no explanation remains invalid when reopened", async t => {
  const saved = { ...initial, reasonCode: "OTHER", reasonOther: "   ", media: photo };
  const form = await mount(t, saved, saved);
  assert.ok(form.state.errors.reasonOther);
  assert.equal(form.state.isValid, false);
  assert.equal(form.button("SUBMIT").props.disabled, true);
  const input = form.renderer.root.findAllByType("TextInput").find(node => node.props.label === "Other NA Reason");
  await act(async () => input.props.onChangeText("Guard could not find the meter room key"));
  assert.equal(form.state.errors.reasonOther, undefined);
  assert.equal(form.button("SUBMIT").props.disabled, false);
});

test("switching ordinary reasons clears the photo and immediately requires fresh evidence", async t => {
  const form = await mount(t);
  await form.reason("Property Locked");
  await form.photo();
  assert.ok(form.renderer.root.findAllByType("Image").length > 0);
  assert.equal(form.button("SUBMIT").props.disabled, false);
  await form.reason("Access Refused by Occupant");
  assert.equal(form.state.values.media.length, 0);
  assert.equal(form.renderer.root.findAllByType("Image").length, 0, "The previous thumbnail must disappear too");
  assert.ok(form.state.errors.media);
  assert.equal(form.button("SUBMIT").props.disabled, true);
  await form.photo();
  assert.equal(form.state.errors.media, undefined);
  assert.equal(form.button("SUBMIT").props.disabled, false);
  await form.reason(policy.RETURN_VISIT_REASON);
  await form.agreement();
  await form.reason("Property Locked");
  assert.equal(form.state.values.media.length, 0, "Returning to the original reason must not resurrect its photo");
  assert.equal(form.state.values.appointment, null);
  assert.ok(form.state.errors.media);
  assert.equal(form.button("SUBMIT").props.disabled, true);
});

test("reselecting a saved reason keeps its photo and confirmed reset restores the opening draft", async t => {
  const saved = { ...initial, reasonCode: "Property Locked", media: photo };
  const form = await mount(t, saved, saved);
  await form.reason("Property Locked");
  assert.deepEqual(form.state.values.media, photo);
  assert.equal(form.state.dirty, false);
  await form.reason("Access Refused by Occupant");
  assert.equal(form.state.values.media.length, 0);
  await act(async () => form.button("RESET").props.onPress());
  await act(async () => form.alert[2].find(button => button.text === "CANCEL").onPress?.());
  assert.equal(form.state.values.media.length, 0);
  await act(async () => form.button("RESET").props.onPress());
  await act(async () => form.alert[2].find(button => button.text === "YES, RESET").onPress());
  assert.deepEqual(form.state.values, saved);
  assert.ok(form.renderer.root.findAllByType("Image").length > 0);
  assert.equal(form.state.dirty, false);
  assert.equal(form.button("SUBMIT").props.disabled, true);
});

test("completing and removing an appointment updates errors before a clock tick", async t => {
  const form = await mount(t, { ...initial, reasonCode: policy.RETURN_VISIT_REASON });
  assert.ok(form.state.errors.appointment);
  await form.pickerAgreement();
  assert.equal(form.state.values.appointment.at, "2026-10-05T23:00:00.000Z");
  assert.equal(form.state.errors.appointment, undefined, "Completed appointment must clear its old missing error immediately");
  assert.equal(form.button("SUBMIT").props.disabled, false);
  await form.removeAgreement();
  assert.ok(form.state.errors.appointment);
  assert.equal(form.button("SUBMIT").props.disabled, true);
  assert.equal(Date.now(), now);
});

test("reason changes, reset and expiry use current values and keep valid-and-dirty gating", async t => {
  const form = await mount(t);
  await form.reason(policy.RETURN_VISIT_REASON);
  await form.agreement();
  await form.reason("Property Locked");
  assert.equal(form.state.values.appointment, null);
  assert.deepEqual(Object.keys(form.state.errors), ["media"]);
  await form.reason(policy.RETURN_VISIT_REASON);
  assert.deepEqual(Object.keys(form.state.errors), ["appointment"]);
  await form.agreement();
  await act(async () => form.button("RESET").props.onPress());
  assert.ok(form.state.values.appointment, "Opening confirmation must not reset");
  await act(async () => form.alert[2].find(button => button.text === "CANCEL").onPress?.());
  assert.ok(form.state.values.appointment, "Cancel must leave changes intact");
  await act(async () => form.alert[2].find(button => button.text === "YES, RESET").onPress());
  assert.deepEqual(form.state.values, initial);
  assert.deepEqual(Object.keys(form.state.errors), ["reasonCode"]);
  assert.equal(form.button("RESET").props.disabled, true);
  assert.equal(form.button("SUBMIT").props.disabled, true);
  await form.reason(policy.RETURN_VISIT_REASON);
  await form.agreement();
  await form.tick(10000);
  assert.ok(form.state.errors.appointment, "Timer still invalidates a newly expired appointment");
  assert.equal(form.button("SUBMIT").props.disabled, true);
  await form.resume();
  assert.ok(form.state.errors.appointment);
});

test("reset restores the opening saved agreement and does not make an unchanged draft dirty", async t => {
  const saved = { ...initial, reasonCode: policy.RETURN_VISIT_REASON,
    appointment: { at: "2026-10-04T08:00:00.000Z", madeAt: "2026-10-03T08:00:00.000Z" } };
  const form = await mount(t, saved, saved);
  assert.equal(form.state.isValid, true, "Late delivery of an unchanged saved agreement is allowed");
  assert.equal(form.button("SUBMIT").props.disabled, true, "Valid alone cannot enable an unchanged form");
  assert.equal(form.button("RESET").props.disabled, true);
  await form.reason("Property Locked");
  assert.ok(form.state.errors.media);
  await act(async () => form.button("RESET").props.onPress());
  await act(async () => form.alert[2].find(button => button.text === "YES, RESET").onPress());
  assert.deepEqual(form.state.values, saved);
  assert.equal(form.state.isValid, true);
  assert.equal(form.state.dirty, false);
  assert.equal(form.button("SUBMIT").props.disabled, true);
});
