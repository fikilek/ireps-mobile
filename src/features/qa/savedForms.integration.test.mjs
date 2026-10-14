import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { object, string } from "yup";
import { loadEntry, nativeHosts, paperHosts } from "../meters/entryTestHarness.mjs";
import { correctionParams, correctionSeed, savedMeter, amendmentFields } from "./amendmentModel.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const entries = [
  ["METER_DISCOVERY", "src/features/meters/FormMeterDiscovery.js"],
  ["METER_INSTALLATION", "src/features/meters/FormMeterIstallation.js"],
  ...["commissioning", "disconnection", "reconnection", "removal", "meter-reading", "inspection"].map(name => [name === "meter-reading" ? "METER_READING" : `METER_${name.toUpperCase()}`, `app/(tabs)/asts/${name}.${["inspection", "meter-reading"].includes(name) ? "js" : "jsx"}`]),
];
const select = text => ({ code: text, label: text, otherText: "" });
test("No Access reopens the shared form's flat fields and saves them into the original transaction", async t => {
  let props;
  const snapshot = { id: "same-trn", accessData: { trnType: "METER_DISCOVERY", premise: { id: "premise" },
    access: { hasAccess: "no", reasonCode: "Property Locked", reason: "Property Locked", appointment: null } }, media: [{ tag: "noAccessPhoto", url: "https://example.invalid/photo" }] };
  const Component = loadEntry("src/features/qa/NoAccessCorrection.js", {
    "react-native": nativeHosts,
    "./src/features/qa/QaAmendmentContext.js": { Formik: value => { props = value; return null; } },
    "./components/forms/IrepsNoAccessForm.js": { IrepsNoAccessForm: "NoAccessForm" },
  });
  let tree; await act(async () => { tree = create(React.createElement(Component, { snapshot })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  assert.equal(props.initialValues.reasonCode, "Property Locked");
  const values = { ...props.initialValues, reasonCode: "Other", reasonOther: "Guard denied access" };
  const fields = amendmentFields(snapshot, props.qaSerialize(values));
  assert.equal(fields.accessData.access.reason, "Guard denied access");
  assert.equal(fields.accessData.premise.id, "premise");
  assert.equal(fields.media[0].url, snapshot.media[0].url);
});
function fixture(type) {
  const ast = { astData: { astId: "original-meter", astNo: "04297700454", astManufacturer: "Conlog", astName: "Original model", meter: { type: "conventional", category: "Normal", phase: "single", seal: { sealNo: "", comment: "Seal Missing" }, cb: { size: "60", comment: "" }, keypad: { serialNo: "", comment: "" } } },
    anomalies: { anomaly: "Meter Ok", anomalyDetail: "Operationally Ok", otherAnomalies: [] }, normalisation: { actionTaken: ["None"], noActionReason: "" }, location: { gps: { lat: -28.1, lng: 30.2 }, placement: "Pole Top" }, ogs: { hasOffGridSupply: "no" } };
  return { id: "TRN_ORIGINAL", meterType: "electricity", ast, media: [{ tag: "astNoPhoto", url: "https://example.invalid/original.jpg" }],
    metadata: { createdOnDevice: "2026-09-01T08:00:00Z", createdByUid: "original-worker" }, fieldComment: { text: "Original field comment" },
    status: { state: "CONNECTED" }, origin: { channel: "FIELD" }, workflow: { state: "COMPLETED" },
    accessData: { trnType: type, access: { hasAccess: "yes", reason: "NAv" }, premise: { id: "premise", address: "Original street" }, erfId: "erf", erfNo: "1", parents: { lmPcode: "ZA5241", wardPcode: "ZA5241001" } },
    disconnection: { level: select("Meter") }, reconnection: { meterReconnected: { answer: "yes", notes: "Recorded" } }, removal: { meterRemoved: { answer: "yes", notes: "Recorded" }, meterReading: "10", noReadingReason: "" },
    commissioning: { finalSwitchOnTested: { answer: "yes", notes: "Recorded" } },
    meterReading: { reading: "10", readingAt: "2026-09-01T08:00:00Z", readingGps: { lat: -28.1, lng: 30.2 } },
    inspection: { inspectedAt: "2026-09-01T08:00:00Z", lastKnown: { ast, meterType: "electricity" }, captured: { ast, mreading: { reading: "10", readingAt: "2026-09-01T08:00:00Z" } }, comparison: { hasDifferences: false } } };
}

for (const [type, path] of entries) {
  test(`${type}: the real form reopens the saved submission with an empty current warehouse`, async t => {
    const snapshot = fixture(type), context = { trnId: snapshot.id, snapshot };
    let formProps;
    const forbidden = () => { throw Error("A correction must not originate new work"); };
    const qa = { editQueueItem: { payload: correctionSeed(snapshot) }, meter: savedMeter(context), premise: { id: "premise", parents: snapshot.accessData.parents }, params: correctionParams(context) };
    const component = loadEntry(path, {
      "react-native": { ...nativeHosts, Image: "Image", TextInput: "TextInput", StyleSheet: { create: x => x }, Alert: { alert() {} }, Linking: {}, },
      "react-native-paper": { ...paperHosts, Divider: "Divider", TextInput: "TextInput", RadioButton: { Group: "RadioGroup", Item: "RadioItem" } },
      "@expo/vector-icons": { MaterialCommunityIcons: "Icon", Feather: "Icon" },
      "@react-native-community/netinfo": { fetch: async () => ({ isConnected: false }) },
      "expo-router": { useRouter: () => ({}), Stack: { Screen: "Screen" } },
      "expo-location": { requestForegroundPermissionsAsync: async () => ({ status: "denied" }) },
      "firebase/functions": { httpsCallable: () => forbidden }, "firebase/storage": {}, "firebase/firestore": {},
      "./src/features/qa/QaAmendmentContext.js": { useQaAmendment: () => qa, useQaSearchParams: () => qa.params, Formik: props => { formProps = props; return null; } },
      "./src/context/GeoContext.js": { useGeo: () => ({ geoState: {}, updateGeo() {} }) },
      "./src/context/MapContext.js": { getSafeCoords: () => null },
      "./src/context/WarehouseContext.js": { useWarehouse: () => ({ all: { meters: [], prems: [], erfs: [] } }) },
      "./src/hooks/useAuth.js": { useAuth: () => ({ user: { uid: "takeover-supervisor" }, isSPV: true, profile: { employment: { role: "SPV", serviceProvider: { id: "mnc" } }, profile: { displayName: "Supervisor" } } }) },
      "./src/redux/spApi.js": { useGetServiceProvidersQuery: () => ({ data: [] }) },
      "./src/redux/trnsApi.js": { useAddTrnMutation: () => [forbidden, {}] },
      "./src/firebase/index.js": { functions: {}, db: {} },
      "./src/firebase": { functions: {}, db: {} },
      "./src/firebase.js": { functions: {}, db: {} },
      "./src/theme/formColors.js": { FORM_TEXT: "#172b4d", FORM_PLACEHOLDER: "#52647a" },
      "./src/utils/submissionQueue.js": { addSubmissionQueueItem: forbidden, updateSubmissionQueueItem: forbidden, getSubmissionQueueItemById: forbidden },
      "./src/utils/premiseSubmissionQueue.js": { getPremiseQueueItemByPremiseId: async () => null },
      "./src/utils/persistNoAccessMeterDiscoveryMedia.js": {},
      "./src/services/processSubmissionQueue.js": {}, "./src/services/startMeterDiscoveryQueueSyncService.js": {},
      "./src/utils/submitWindows.js": {}, "./src/utils/lifecycleReturn.js": {},
      "./components/forms/ElectricitySections.js": { ElectricitySections: "ElectricitySections" },
      "./components/forms/WaterSections.js": { WaterSections: "WaterSections" },
      "./components/forms/IrepsFieldCommentSection.js": { IrepsFieldCommentSection: "FieldComment", FIELD_COMMENT_MEDIA_TAG_LIST: [], fieldCommentSchema: object({ text: string() }) },
      "./components/forms/IrepsFormActions.js": { IrepsFormActions: "Actions" },
      "./components/forms/SubmitBlockers.js": { SubmitBlockers: "Blockers" },
      "./components/SceenLock.js": { ScreenLock: "ScreenLock" },
      "./components/media/IrepsMedia.js": { IrepsMedia: "Media" },
      "./components/maps/SovereignLocationPicker.js": { default: "LocationPicker" },
      "./components/IrepsSelectWithOther.js": { default: "Select", isSelectWithOtherFilled: x => !!x?.code, normalizeSelectWithOtherValue: x => typeof x === "object" ? x : select(x || ""), selectWithOtherToText: x => typeof x === "object" ? x.label || x.code || "" : x || "" },
      "./src/features/meters/ForensicFooter.js": { ForensicFooter: "Footer" },
    });
    let tree;
    await act(async () => { tree = create(React.createElement(component)); });
    t.after(async () => { await act(async () => tree.unmount()); });
    assert.ok(formProps, "form must open even when today's meter is unavailable or no longer eligible for new work");
    assert.equal(formProps.initialValues.id, snapshot.id);
    assert.equal(formProps.initialValues.ast.astData.astNo, snapshot.ast.astData.astNo);
    assert.equal(formProps.initialValues.metadata.createdOnDevice, snapshot.metadata.createdOnDevice);
    const fields = amendmentFields(snapshot, formProps.qaSerialize({ ...formProps.initialValues, fieldComment: { text: "Corrected comment" } }));
    if (fields.fieldComment) assert.equal(fields.fieldComment.text, "Corrected comment");
    assert.equal(fields.metadata, undefined);
    if (type === "METER_READING") assert.equal(fields.meterReading.readingAt, snapshot.meterReading.readingAt);
    if (type === "METER_INSPECTION") assert.equal(fields.inspection.inspectedAt, snapshot.inspection.inspectedAt);
  });
}
