import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location"; // Ensure this is imported at the to
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Formik } from "formik";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Divider,
  Modal,
  Portal,
  RadioButton,
  Surface,
  Text,
} from "react-native-paper";
import { array, object, string } from "yup";

// Firebase & Redux
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { ElectricitySections } from "../../../components/forms/ElectricitySections";
import { WaterSections } from "../../../components/forms/WaterSections";
import { IrepsMedia } from "../../../components/media/IrepsMedia";
import { ScreenLock } from "../../../components/SceenLock";
import { useGeo } from "../../context/GeoContext";
import { getSafeCoords } from "../../context/MapContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { functions } from "../../firebase";
import { useAuth } from "../../hooks/useAuth";
import { useMeterFormLookupOptions } from "../../hooks/useMeterFormLookupOptions";
import { useGetServiceProvidersQuery } from "../../redux/spApi";
import { useAddTrnMutation } from "../../redux/trnsApi";
import { getPremiseQueueItemByPremiseId } from "../../utils/premiseSubmissionQueue";
import {
  addSubmissionQueueItem,
  getSubmissionQueueItemById,
  removeSubmissionQueueItem,
  updateSubmissionQueueItem,
} from "../../utils/submissionQueue";
import { ForensicFooter } from "./ForensicFooter";

function buildMeterDiscoveryTrnId({ wardPcode, erfNo, meterType }) {
  const ts = Date.now();

  const safeWardPcode = String(wardPcode || "NAv")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12);

  const safeErfNo = String(erfNo || "NAv")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12);

  const typeCode =
    meterType === "water" ? "WTR" : meterType === "electricity" ? "ELC" : "NA";

  return `TRN_MDIS_${ts}_${typeCode}_${safeWardPcode}_${safeErfNo}`;
}

function toLatLng(value) {
  if (!value) return null;

  if (Array.isArray(value) && value.length === 2) {
    return { lat: Number(value[0]), lng: Number(value[1]) };
  }

  if (value?.lat != null && value?.lng != null) {
    return { lat: Number(value.lat), lng: Number(value.lng) };
  }

  if (value?.latitude != null && value?.longitude != null) {
    return { lat: Number(value.latitude), lng: Number(value.longitude) };
  }

  return null;
}

function getDistanceMeters(pointA, pointB) {
  const a = toLatLng(pointA);
  const b = toLatLng(pointB);

  if (!a || !b) return Number.POSITIVE_INFINITY;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return R * y;
}

function isValidMeterGps(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);

  return (
    value?.lat != null &&
    value?.lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

// --- MAIN FORM COMPONENT ---
export default function FormMeterDiscovery() {
  const {
    premiseId,
    action: actionRaw,
    queueItemId: queueItemIdRaw,
  } = useLocalSearchParams();

  const queueItemId = Array.isArray(queueItemIdRaw)
    ? queueItemIdRaw[0]
    : queueItemIdRaw;

  const [editQueueItem, setEditQueueItem] = useState(undefined);

  const { data: allServiceProviders = [] } = useGetServiceProvidersQuery();

  const action = (() => {
    try {
      return actionRaw
        ? JSON.parse(actionRaw)
        : { access: "no", meterType: "" };
    } catch (e) {
      return { access: "no", meterType: "" };
    }
  })();

  const router = useRouter();
  const { all } = useWarehouse();
  const [addTrn, { isLoading: isTrnLoading }] = useAddTrnMutation();
  const [liveLocation, setLiveLocation] = useState(null);
  const { geoState, updateGeo } = useGeo();
  const activeErf = geoState?.selectedErf;

  const [inProgress, setInProgress] = useState(false);

  const { profile, user } = useAuth();

  const agentUid = user?.uid || "unknown_uid";
  const agentName = profile?.profile?.displayName || "Field Agent";

  /*
  START GEOGRAPHY
  */

  // look for premise doc from the wrehouse. If cant find, as an alternative, go to mmkv for the premise details (which should be there since the agent had to have opened the form to get here)

  /*
  GET PREMISE DOC 
  */
  //  First check the warehouse
  const [draftPremise, setDraftPremise] = useState(null);

  const warehousePremise = useMemo(
    () => (all?.prems || []).find((p) => p.id === premiseId) || null,
    [all?.prems, premiseId],
  );

  // Get premise doc from premise draft in mmkv as a fallabck
  useEffect(() => {
    let mounted = true;

    const loadDraftPremise = async () => {
      if (warehousePremise || !premiseId) {
        if (mounted) setDraftPremise(null);
        return;
      }

      const queueItem = await getPremiseQueueItemByPremiseId(premiseId);

      if (mounted) {
        setDraftPremise(queueItem?.payload || null);
      }
    };

    loadDraftPremise();

    return () => {
      mounted = false;
    };
  }, [warehousePremise, premiseId]);

  useEffect(() => {
    let mounted = true;

    const loadEditQueueItem = async () => {
      if (!queueItemId) {
        if (mounted) setEditQueueItem(null);
        return;
      }

      const queueItem = await getSubmissionQueueItemById(queueItemId);

      if (mounted) {
        setEditQueueItem(queueItem || null);
      }
    };

    loadEditQueueItem();

    return () => {
      mounted = false;
    };
  }, [queueItemId]);

  const isEditMode = !!queueItemId;

  const premise = warehousePremise || draftPremise || null;
  // const premise = all.prems.find((p) => p.id === premiseId);

  const parents = premise?.parents || {};
  const countryPcode = parents?.countryPcode;
  const provincePcode = parents?.provincePcode;
  const dmPcode = parents?.dmPcode;
  const lmPcode = parents?.lmPcode;
  const wardPcode = parents?.wardPcode;
  /*
  END GEOGRAPHY
  */

  const currentMissionType =
    action?.access === "no" ? "NA" : action?.meterType || "NA";

  const { getOptions, noAccessReasons } =
    useMeterFormLookupOptions(currentMissionType);

  const premiseAddress =
    `${premise?.address?.strNo || ""} ${premise?.address?.strName || ""} ${premise?.address?.strType || ""}`.trim();

  const landingPoint = premise?.geometry?.centroid;

  const propType =
    `${premise?.propertyType?.type || ""} ${premise?.propertyType?.name || ""} ${premise?.propertyType?.unitNo || ""}`.trim();

  const [modalVisible, setModalVisible] = useState(false);

  const [showSuccess, setShowSuccess] = useState(false);
  // console.log(`FormMeterDiscovery ----showSuccess`, showSuccess);

  const finalErfNo = premise?.erfNo || "NAv";
  // console.log(`FormMeterDiscovery ----finalErfNo`, finalErfNo);

  const accessInitValues = {
    access: {
      hasAccess: action?.access === "yes" ? "yes" : "no",
      reason: "",
    },
  };

  const trnId = useMemo(
    () =>
      buildMeterDiscoveryTrnId({
        wardPcode,
        erfNo: premise?.erfNo,
        meterType: currentMissionType,
      }),
    [wardPcode, premise?.erfNo, currentMissionType],
  );

  async function getPremiseSubmitGate(formPremiseId) {
    if (!formPremiseId || formPremiseId === "NAv") {
      return {
        ok: false,
        resolvedPremiseId: "NAv",
        reason: "Premise id is missing.",
      };
    }

    const draftPremise = await getPremiseQueueItemByPremiseId(formPremiseId);

    // No draft in MMKV -> treat as already-synced/server premise
    if (!draftPremise) {
      return {
        ok: true,
        resolvedPremiseId: formPremiseId,
        reason: "",
      };
    }

    // Draft exists but not yet synced successfully
    if (
      draftPremise?.status !== "SUCCESS" ||
      draftPremise?.result?.success !== true
    ) {
      return {
        ok: false,
        resolvedPremiseId: "NAv",
        reason:
          "This meter draft cannot be submitted until the parent premise has been successfully saved.",
      };
    }

    // Draft says success, but no Firestore premise id returned
    if (
      !draftPremise?.result?.premiseId ||
      draftPremise?.result?.premiseId === "NAv"
    ) {
      return {
        ok: false,
        resolvedPremiseId: "NAv",
        reason:
          "Parent premise sync completed, but no Firestore premise id was returned.",
      };
    }

    return {
      ok: true,
      resolvedPremiseId: draftPremise.result.premiseId,
      reason: "",
    };
  }

  function buildTrnSystemFields(resolvedPremiseId = null) {
    const timestamp = new Date().toISOString();

    return {
      erfId: premise?.erfId || "",
      erfNo: premise?.erfNo || "",
      trnType: "METER_DISCOVERY",

      parents: {
        countryPcode,
        provincePcode,
        dmPcode,
        lmPcode,
        wardPcode,
      },

      premise: {
        id: resolvedPremiseId || premise?.id || "NAv",
        address: premiseAddress || "N/Av",
        propertyType: propType || "N/Av",
      },
    };
  }

  function resolveMncServiceProvider(spId, allServiceProviders, visited = []) {
    if (!spId || visited.includes(spId)) {
      return null;
    }

    const sp = allServiceProviders.find((s) => s.id === spId);
    if (!sp) return null;

    // 🔥 BASE CASE → MNC
    const isMnc = (sp.clients || []).some(
      (c) => c.clientType === "LM" && c.relationshipType === "MNC",
    );

    if (isMnc) {
      return {
        id: sp.id,
        name: sp?.profile?.tradingName || sp.id,
      };
    }

    // 🔁 RECURSION → SUBC → go up
    const parent = (sp.clients || []).find(
      (c) => c.clientType === "SP" && c.relationshipType === "SUBC",
    );

    if (!parent?.id) {
      return {
        id: sp.id,
        name: sp?.profile?.tradingName || sp.id,
      };
    }

    return resolveMncServiceProvider(parent.id, allServiceProviders, [
      ...visited,
      spId,
    ]);
  }

  const accessSchema = object().shape({
    accessData: object().shape({
      access: object().shape({
        hasAccess: string()
          .oneOf(["yes", "no"], "Access status is required")
          .required("Access status is required"),

        reason: string().when("hasAccess", {
          is: (val) => val === "no",
          then: (s) =>
            s.trim().required("Please provide a reason for no access"),
          otherwise: (s) => s.nullable().notRequired(),
        }),
      }),
    }),

    meterType: string().oneOf(["NA"]).required(),

    media: array()
      .of(object())
      .test("na-forensics", "No Access photo required", function (value) {
        const hasAccess = this.parent?.accessData?.access?.hasAccess;
        const reason = this.parent?.accessData?.access?.reason;

        if (hasAccess === "no" && reason && reason.trim() !== "") {
          return value?.some((item) => item.tag === "noAccessPhoto");
        }

        return true;
      }),
  });

  const WaterDiscoverySchema = object().shape({
    // --- SECTION 1: ADMINISTRATIVE ---
    accessData: accessSchema.fields.accessData, // Reusing your locked-in base schema

    // --- SECTION 2: THE PHYSICAL ASSET ---
    ast: object().shape({
      astData: object().shape({
        astNo: string().required("Meter number is required"),
        astManufacturer: string().required("Manufacturer is required"),
        astName: string().required("Model is required"),
        meter: object().shape({
          category: string()
            .oneOf(["Normal", "Bulk"])
            .required("Meter category is required"),
          type: string()
            .oneOf(["prepaid", "conventional"])
            .required("Meter type is required"),
        }),
      }),
      anomalies: object().shape({
        // 🏛️ The Trigger
        anomaly: string().required("Anomaly Required"),

        // 🧠 The Intelligent Detail
        anomalyDetail: string().when("anomaly", {
          is: (val) => !!String(val || "").trim(),
          then: (schema) => schema.required("Anomaly detail is required"),
          otherwise: (schema) => schema.notRequired().nullable(),
        }),
      }),
      location: object().shape({
        gps: object()
          .nullable()
          .required("GPS location is required")
          .test("is-valid-gps", "Invalid GPS coordinates", isValidMeterGps),
      }),
      meterReading: string().when("astData.meter.type", {
        is: "conventional",
        then: (schema) => schema.required("Meter reading is required"),
        otherwise: (schema) => schema.notRequired().nullable(),
      }),
      tokenReading: string().when("astData.meter.type", {
        is: "prepaid",
        then: (schema) => schema.required("Token reading is required"),
        otherwise: (schema) => schema.notRequired().nullable(),
      }),
    }),

    // --- SECTION 3: MISSION TYPE ---
    meterType: string().oneOf(["water"]).required(),

    // --- SECTION 4: TOP-LEVEL FORENSIC PROOF ---
    media: array()
      .of(object())
      .test("water-forensics", "Forensic photo missing", function (value) {
        const { accessData, ast } = this.parent; // 🎯 ACCESS SIBLINGS
        const hasAccess = accessData?.access?.hasAccess;
        const meterNo = ast?.astData?.astNo;
        const anomaly = ast?.anomalies?.anomaly;
        const meterReading = ast?.meterReading;
        const tokenReading = ast?.tokenReading;
        const meterSubtype = ast?.astData?.meter?.type;

        // 🚩 Rule 1: No Access (Only trigger if a reason is selected)
        if (hasAccess === "no" && accessData?.access?.reason) {
          if (!value?.some((m) => m.tag === "noAccessPhoto")) {
            return this.createError({ message: "No Access photo required" });
          }
        }

        // 🚩 Rule 2: Meter Photo (Only trigger if the agent started typing the Meter No)
        if (meterNo?.trim() && !value?.some((m) => m.tag === "astNoPhoto")) {
          return this.createError({ message: "Meter photo required" });
        }

        // 🚩 Rule 2: Meter Reading Photo (Only trigger if there is a reading
        if (
          meterSubtype === "conventional" &&
          meterReading?.trim() &&
          !value?.some((m) => m.tag === "meterReadingPhoto")
        ) {
          return this.createError({ message: "Meter reading photo required" });
        }

        if (
          meterSubtype === "prepaid" &&
          tokenReading?.trim() &&
          !value?.some((m) => m.tag === "tokenReadingPhoto")
        ) {
          return this.createError({ message: "Token reading photo required" });
        }

        // 🚩 Rule 3: Anomaly Photo (Only trigger if an actual anomaly is selected)
        if (
          anomaly &&
          anomaly !== "Meter Ok" &&
          !value?.some((m) => m.tag === "anomalyPhoto")
        ) {
          return this.createError({ message: "Anomaly photo required" });
        }

        return true;
      }),

    status: object().shape({
      state: string()
        .oneOf(["CONNECTED", "DISCONNECTED"])
        .required("Meter status is required"),
    }),
  });

  const ElecDiscoverySchema = object().shape({
    accessData: accessSchema.fields.accessData,

    ast: object().shape({
      astData: object().shape({
        astNo: string().required("Meter number is required"),

        astManufacturer: string().required("Manufacturer is required"),

        astName: string().when("astManufacturer", {
          is: (val) => val && val.length > 0,
          then: (schema) => schema.required("Model name is required"),
          otherwise: (schema) => schema.notRequired(),
        }),

        meter: object().shape({
          phase: string().oneOf(["single", "three"]).required("Phase Required"),

          type: string()
            .oneOf(["prepaid", "conventional"])
            .required("Meter Type Required"),

          category: string()
            .oneOf(["Normal", "Bulk"])
            .required("Meter Category Required"),

          seal: object().shape({
            sealNo: string().required("Seal number is required"),

            comment: string().when("sealNo", {
              is: (val) => !val || String(val).trim().length === 0,
              then: (s) => s.required("Comment required if no seal number"),
              otherwise: (s) => s.notRequired(),
            }),
          }),

          keypad: object()
            .shape({
              serialNo: string().nullable(),
              comment: string().nullable(),
            })
            .test(
              "prepaid-keypad",
              "Keypad serial number is required for prepaid meters",
              function (value) {
                if (this.parent?.type !== "prepaid") return true;
                return !!String(value?.serialNo || "").trim();
              },
            ),

          cb: object().shape({
            size: string().required("Required"),

            comment: string().when("size", {
              is: (val) => !val || val.trim().length === 0,
              then: (s) => s.required("Comment required if CB size is missing"),
              otherwise: (s) => s.notRequired(),
            }),
          }),
        }),
      }),

      anomalies: object().shape({
        anomaly: string().required("Anomaly Required"),

        anomalyDetail: string().when("anomaly", {
          is: (val) => !!String(val || "").trim(),
          then: (schema) => schema.required("Anomaly detail is required"),
          otherwise: (schema) => schema.notRequired().nullable(),
        }),
      }),

      ogs: object().shape({
        hasOffGridSupply: string().required("Off Grid Status Required"),
      }),

      normalisation: object().shape({
        actionTaken: array().of(string()).required("Required"),
      }),

      location: object().shape({
        placement: string().required("Placement Required"),
        gps: object()
          .nullable()
          .required("GPS location is required")
          .test("is-valid-gps", "Invalid GPS coordinates", isValidMeterGps),
      }),
    }),

    meterType: string().oneOf(["electricity"]).required(),

    media: array()
      .of(object())
      .test(
        "elec-top-level-forensics",
        "Forensic photos missing",
        function (value) {
          const { accessData, ast } = this.parent;

          const hasAccess = accessData?.access?.hasAccess;
          const meterNo = ast?.astData?.astNo;
          const sealNo = ast?.astData?.meter?.seal?.sealNo;
          const keypadSerial = ast?.astData?.meter?.keypad?.serialNo;
          const meterSubtype = ast?.astData?.meter?.type;
          const cbSize = ast?.astData?.meter?.cb?.size;
          const hasOffGrid = ast?.ogs?.hasOffGridSupply;
          const anomaly = ast?.anomalies?.anomaly;
          const normalisationActions = ast?.normalisation?.actionTaken;

          if (hasAccess === "no") {
            return value?.some((m) => m.tag === "noAccessPhoto")
              ? true
              : this.createError({ message: "No Access photo required" });
          }

          if (meterNo?.trim() && !value?.some((m) => m.tag === "astNoPhoto")) {
            return this.createError({ message: "Meter No. photo required" });
          }

          if (sealNo?.trim() && !value?.some((m) => m.tag === "sealPhoto")) {
            return this.createError({ message: "Seal photo required" });
          }

          if (
            meterSubtype === "prepaid" &&
            (!keypadSerial?.trim() ||
              !value?.some((m) => m.tag === "keypadPhoto"))
          ) {
            return this.createError({
              message: "Keypad Serial photo required",
            });
          }

          if (cbSize?.trim() && !value?.some((m) => m.tag === "astCbPhoto")) {
            return this.createError({
              message: "Circuit Breaker photo required",
            });
          }

          if (
            hasOffGrid === "yes" &&
            !value?.some((m) => m.tag === "ogsPhoto")
          ) {
            return this.createError({
              message: "Off-Grid Supply photo required",
            });
          }

          if (
            anomaly &&
            anomaly !== "Meter Ok" &&
            !value?.some((m) => m.tag === "anomalyPhoto")
          ) {
            return this.createError({ message: "Anomaly photo required" });
          }

          const hasIntervention = Array.isArray(normalisationActions)
            ? normalisationActions.some((a) => a !== "none")
            : false;

          if (
            hasIntervention &&
            !value?.some((m) => m.tag === "normalisationPhoto")
          ) {
            return this.createError({
              message: "Photo proof of Normalisation required",
            });
          }

          return true;
        },
      ),

    status: object().shape({
      state: string()
        .oneOf(["CONNECTED", "DISCONNECTED"])
        .required("Meter status is required"),
    }),
  });

  const getInitialValues = () => {
    const editPayload = editQueueItem?.payload || null;

    if (editPayload) {
      const editHasAccess =
        editPayload?.accessData?.access?.hasAccess === "no" ? "no" : "yes";

      const editMeterType =
        editHasAccess === "no" ? "NA" : editPayload?.meterType || "electricity";

      if (editHasAccess === "no") {
        return {
          initValues: editPayload,
          schema: accessSchema,
        };
      }

      if (editMeterType === "water") {
        return {
          initValues: editPayload,
          schema: WaterDiscoverySchema,
        };
      }

      return {
        initValues: editPayload,
        schema: ElecDiscoverySchema,
      };
    }

    // 🎯 Standardize access to the string "yes" or "no"
    const accessStr = action?.access === "yes" ? "yes" : "no";

    // --- STEP 1: THE NO ACCESS MISSION ---
    if (accessStr === "no") {
      return {
        initValues: {
          id: trnId,
          accessData: accessInitValues,
          ast: null,
          meterType: "NA",
          media: [],
          status: {
            state: null,
            id: null,
            detail: null,
          },
        },
        schema: accessSchema,
      };
    }

    // --- STEP 2: WATER DISCOVERY ---
    if (action?.meterType === "water") {
      return {
        initValues: {
          id: trnId,
          accessData: {
            ...accessInitValues,
            access: { hasAccess: "yes", reason: "NAv" },
          },
          ast: {
            astData: {
              astNo: "", // Empty for real field use
              astManufacturer: "",
              astName: "",
              meter: { category: "Normal", type: "conventional" },
            },
            anomalies: {
              anomaly: "",
              anomalyDetail: "",
            },
            location: {
              gps: null, // Placeholder for the final liveLocation capture
            },
            meterReading: "",
            tokenReading: "",
          },
          meterType: "water",
          media: [],
          status: {
            state: null,
            id: null,
            detail: null,
          },
        },
        schema: WaterDiscoverySchema,
      };
    }

    // --- STEP 3: ELECTRICITY DISCOVERY (The Default) ---
    return {
      initValues: {
        id: trnId,
        accessData: {
          ...accessInitValues,
          access: { hasAccess: "yes", reason: "NAv" },
        },
        ast: {
          astData: {
            astNo: "",
            astManufacturer: "",
            astName: "",
            meter: {
              phase: "",
              type: "",
              category: "",
              seal: { sealNo: "", comment: "" }, // 🎯 Initialized
              keypad: { serialNo: "", comment: "" }, // 🎯 Initialized
              cb: { size: "", comment: "" }, // 🎯 Initialized
            },
          },
          anomalies: {
            anomaly: "",
            anomalyDetail: "",
          },
          location: {
            gps: null, // 🛰️ Will be an Object {lat, lng} via the Picker
            placement: "",
          },
          ogs: { hasOffGridSupply: "no" },
          normalisation: { actionTaken: ["none"] },
        },
        meterType: "electricity",
        media: [],
        status: {
          state: null,
          id: null,
          detail: null,
        },
      },
      schema: ElecDiscoverySchema,
    };
  };

  function withSubmitTimeout(promise, timeoutMs = 30000) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error("SUBMISSION_TIMEOUT"));
        }, timeoutMs),
      ),
    ]);
  }

  const handleSubmitDiscovery = async (values) => {
    if (!premise?.id) {
      Alert.alert("Error", "Premise data not found.");
      return;
    }

    const formPremiseId = premise?.id || "NAv";
    const gate = await getPremiseSubmitGate(formPremiseId);

    let cleanPayload = null;
    let baseSystemFields = null;

    const timestamp = new Date().toISOString();

    const trnMetadata = {
      createdAt: timestamp,
      createdByUid: agentUid || "unknown_uid",
      createdByUser: agentName || "Field Agent",
      updatedAt: timestamp,
      updatedByUid: agentUid || "unknown_uid",
      updatedByUser: agentName || "Field Agent",
    };

    const userSpId = profile?.employment?.serviceProvider?.id;

    const resolvedMnc = resolveMncServiceProvider(
      userSpId,
      allServiceProviders,
    );

    const serviceProvider = resolvedMnc || {
      id: userSpId || "NAv",
      name: profile?.employment?.serviceProvider?.name || "NAv",
    };

    // const serviceProvider = {
    //   id: profile?.employment?.serviceProvider?.id || "NAv",
    //   name: profile?.employment?.serviceProvider?.name || "NAv",
    // };

    try {
      // Build system fields once.
      // If the premise draft is already successfully synced, use the real Firestore premise id.
      // Otherwise fall back to the current premise id for local draft storage purposes.
      baseSystemFields = buildTrnSystemFields(
        gate?.ok ? gate.resolvedPremiseId : premise?.id || "NAv",
      );

      // Build clean payload once.
      if (values?.accessData?.access?.hasAccess === "no") {
        cleanPayload = {
          id: values.id,
          accessData: {
            ...baseSystemFields,
            access: values.accessData.access,
          },
          ast: null,
          meterType: "NA",
          media: values?.media || [],
          metadata: trnMetadata,
          serviceProvider,
        };
      } else if (values?.meterType === "water") {
        const meterSubtype = values?.ast?.astData?.meter?.type;
        const creationReading = String(values?.ast?.meterReading || "").trim();
        const creationTokenReading = String(
          values?.ast?.tokenReading || "",
        ).trim();
        const cleanAst = { ...(values.ast || {}) };
        delete cleanAst.meterReading;
        delete cleanAst.tokenReading;

        cleanPayload = {
          id: values.id,
          accessData: {
            ...baseSystemFields,
            access: values.accessData.access,
          },
          ast: cleanAst,
          mreadings:
            meterSubtype === "conventional" && creationReading
              ? [
                  {
                    reading: creationReading,
                    readingAt: timestamp,
                    trnId: values.id,
                    source: "AST_CREATION",
                  },
                ]
              : [],
          treadings:
            meterSubtype === "prepaid" && creationTokenReading
              ? [
                  {
                    tokenReading: creationTokenReading,
                    readingAt: timestamp,
                    trnId: values.id,
                    source: "AST_CREATION",
                  },
                ]
              : [],
          meterType: "water",
          media: values?.media || [],
          status: {
            state: values?.status?.state,
            id: lmPcode || "NAv",
            detail: premise?.parents?.lmName || lmPcode || "NAv",
          },
          metadata: trnMetadata,
          serviceProvider,
        };
      } else if (values?.meterType === "electricity") {
        cleanPayload = {
          id: values.id,
          accessData: {
            ...baseSystemFields,
            access: values.accessData.access,
          },
          ast: values.ast,
          meterType: "electricity",
          media: values?.media || [],
          status: {
            state: values?.status?.state,
            id: lmPcode || "NAv",
            detail: premise?.parents?.lmName || lmPcode || "NAv",
          },
          metadata: trnMetadata,
          serviceProvider,
        };
      }

      if (!cleanPayload) {
        throw new Error("Unable to determine transaction payload.");
      }

      cleanPayload = JSON.parse(
        JSON.stringify(cleanPayload, (key, value) =>
          value === undefined ? null : value,
        ),
      );

      const saveMeterDraftToQueue = async (messageTitle, messageBody) => {
        const nextContext = {
          meterNo: values?.ast?.astData?.astNo || "NAv",
          meterType: cleanPayload?.meterType || "NAv",
          erfId: baseSystemFields?.erfId || "NAv",
          erfNo: baseSystemFields?.erfNo || "NAv",
          premiseId: premise?.id || "NAv",
          lmPcode: lmPcode || "NAv",
          wardPcode: wardPcode || "NAv",
        };

        let queueResult = null;

        if (queueItemId) {
          const existingSync = editQueueItem?.sync || {
            attempts: 0,
            lastAttemptAt: "NAv",
            nextRetryAt: "NAv",
          };

          queueResult = await updateSubmissionQueueItem(
            queueItemId,
            {
              payload: cleanPayload,
              context: nextContext,
              status: "PENDING",
              result: {
                success: false,
                code: "NAv",
                message: "NAv",
                trnId: "NAv",
              },
              sync: {
                ...existingSync,
                nextRetryAt: "NAv",
              },
            },
            agentUid,
            agentName,
          );
        } else {
          queueResult = await addSubmissionQueueItem({
            formType: "METER_DISCOVERY",
            payload: cleanPayload,
            context: nextContext,
            createdByUid: agentUid,
            createdByUser: agentName,
          });
        }

        if (!queueResult?.success) {
          Alert.alert(
            "Draft Save Failed",
            "Failed to save meter discovery draft locally.",
          );
          return false;
        }

        Alert.alert(messageTitle, messageBody);

        setShowSuccess(true);

        setTimeout(() => {
          updateGeo({ selectedPremise: null, lastSelectionType: "PREMISE" });
          router.replace("/(tabs)/premises");
        }, 1500);

        return true;
      };

      // GATE BLOCK PATH:
      // Parent premise not yet successfully synced to Firestore.
      // Save locally instead of discarding the work.
      if (!gate.ok) {
        console.log("Premise Not Ready", gate.reason);

        await saveMeterDraftToQueue(
          "Saved as Draft",
          "This meter draft was saved locally. It can only be submitted after the parent premise has been successfully saved.",
        );

        return;
      }

      setInProgress(true);

      // Connectivity is only checked after the gate passes.
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable;

      // OFFLINE PATH:
      // Parent premise is valid, but there is no connectivity.
      if (!isOnline) {
        await saveMeterDraftToQueue(
          "Saved Offline",
          "No internet connection. This submission was saved locally and will sync automatically when online.",
        );

        setInProgress(false);
        return;
      }

      // ONLINE PATH
      const storage = getStorage();

      const syncedMedia = await Promise.all(
        (values?.media || []).map(async (item) => {
          if (item.uri && !item.url) {
            const folder =
              values?.accessData?.access?.hasAccess === "yes"
                ? `${values?.meterType}_meters`
                : "no_access";

            const fileName = `${baseSystemFields.erfId}_${item.tag}_${Date.now()}.jpg`;
            const storageRef = ref(storage, `meters/${folder}/${fileName}`);

            const response = await fetch(item.uri);
            const blob = await response.blob();

            await uploadBytes(storageRef, blob);

            const downloadUrl = await getDownloadURL(storageRef);

            const { uri, ...cleanItem } = item;
            return { ...cleanItem, url: downloadUrl };
          }

          return item;
        }),
      );

      cleanPayload.media = syncedMedia;

      const onMeterDiscoveryCallable = httpsCallable(
        functions,
        "onMeterDiscoveryCallable",
      );

      // const test = true;
      // if (test) {
      //   return;
      // }
      // console.log(`handleSubmitDiscovery --cleanPayload`, cleanPayload);

      /*  
        START TIMEOUT WINDOW

      1. No network before submit
        → save locally immediately

      2. Network available, submit starts
        → wait up to 15 seconds

      3. Backend returns before 15 seconds
        → respect backend result
        → success = success
        → error = show error, do not queue

      4. 30 seconds passes with no response
        → save locally, regardless of reason

      */

      let result = null;

      try {
        const callableResult = await withSubmitTimeout(
          onMeterDiscoveryCallable(cleanPayload),
          15000,
        );
        result = callableResult?.data || {};
      } catch (error) {
        if (error?.message === "SUBMISSION_TIMEOUT") {
          await saveMeterDraftToQueue(
            "Saved Locally",
            "The submission is taking too long. Your meter data has been safely saved locally and can be submitted again later.",
          );

          setInProgress(false);
          return;
        }

        setInProgress(false);

        Alert.alert(
          "Submission Failed",
          error?.message || "Meter discovery submission failed.",
        );

        return;
      }

      /*  
        END TIMEOUT WINDOW
      */

      // const callableResult = await onMeterDiscoveryCallable(cleanPayload);
      // const result = callableResult?.data || {};

      if (!result?.success) {
        setInProgress(false);

        Alert.alert(
          result?.code === "DUPLICATE_METER"
            ? "Duplicate Meter"
            : "Submission Failed",
          result?.message || "Meter discovery submission failed.",
        );

        return;
      }

      if (queueItemId) {
        await removeSubmissionQueueItem(queueItemId);
      }

      setShowSuccess(true);

      setTimeout(() => {
        updateGeo({ selectedPremise: null, lastSelectionType: "PREMISE" });
        router.replace("/(tabs)/premises");
        setInProgress(false);
      }, 2000);
    } catch (error) {
      console.error("Submission Error:", error);
      Alert.alert("Error", error?.message || "Submission failed");
      setInProgress(false);
    }
  };

  const actionInit = useMemo(
    () => getInitialValues(),
    [premiseId, actionRaw, trnId, editQueueItem],
  );

  // 2. Setup the Watcher in a useEffect
  useEffect(() => {
    let subscription;

    const startWatching = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location is required for forensic evidence.",
        );
        return;
      }

      // Watch position changes in real-time
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 1, // Update every 1 meter moved
          timeInterval: 5000, // Or every 5 seconds
        },
        (location) => {
          setLiveLocation({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });
        },
      );
    };

    startWatching();

    // Cleanup on unmount
    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  const selectedErfId = activeErf?.id;
  const erfGeo =
    all?.geoLibrary?.[selectedErfId] || all?.geoEntries?.[selectedErfId];
  const erfBoundary = getSafeCoords(erfGeo?.geometry);

  const NEIGHBOURHOOD_RADIUS_METERS = 120;

  const nearbyPremises = useMemo(() => {
    if (!landingPoint || !Array.isArray(all?.prems)) return [];

    return all.prems
      .filter((item) => item?.id !== premise?.id)
      .map((item) => {
        const coordinate = toLatLng(item?.geometry?.centroid);
        const distance = getDistanceMeters(landingPoint, coordinate);

        return {
          id: item?.id,
          coordinate,
          distance,
          address: {
            strNo: item?.address?.strNo || "NAv",
            strName: item?.address?.strName || "NAv",
          },
          propertyType: {
            type: item?.propertyType?.type || "NAv",
            name: item?.propertyType?.name || "NAv",
            unitNo: item?.propertyType?.unitNo || "NAv",
          },
        };
      })
      .filter(
        (item) =>
          item.coordinate && item.distance <= NEIGHBOURHOOD_RADIUS_METERS,
      );
  }, [all?.prems, landingPoint, premise?.id]);

  const nearbyMeters = useMemo(() => {
    if (!landingPoint || !Array.isArray(all?.meters)) return [];

    return all.meters
      .map((item) => {
        const coordinate = toLatLng(
          item?.accessData?.gps ||
            item?.ast?.location?.gps ||
            item?.location?.gps ||
            item?.geometry?.centroid,
        );

        const distance = getDistanceMeters(landingPoint, coordinate);

        return {
          id: item?.id,
          coordinate,
          distance,
          meterType: item?.meterType || "NAv",
        };
      })
      .filter(
        (item) =>
          item.coordinate && item.distance <= NEIGHBOURHOOD_RADIUS_METERS,
      );
  }, [all?.meters, landingPoint]);

  const nearbyErfs = useMemo(() => {
    if (!landingPoint || !Array.isArray(all?.erfs)) return [];

    return all.erfs
      .filter((item) => item?.id !== selectedErfId)
      .map((item) => {
        const boundaryGeo =
          all?.geoLibrary?.[item?.id] || all?.geoEntries?.[item?.id];

        const boundary = getSafeCoords(boundaryGeo?.geometry);
        const coordinate = toLatLng(
          item?.geometry?.centroid || boundaryGeo?.centroid,
        );
        const distance = getDistanceMeters(landingPoint, coordinate);

        return {
          id: item?.id,
          erfNo: item?.erfNo || "NAv",
          coordinate,
          boundary,
          distance,
        };
      })
      .filter(
        (item) =>
          item.coordinate &&
          Array.isArray(item.boundary) &&
          item.boundary.length > 0 &&
          item.distance <= NEIGHBOURHOOD_RADIUS_METERS,
      );
  }, [
    all?.erfs,
    all?.geoLibrary,
    all?.geoEntries,
    landingPoint,
    selectedErfId,
  ]);

  if (isEditMode && editQueueItem === undefined) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loaderText}>Loading draft...</Text>
      </View>
    );
  }

  if (isEditMode && editQueueItem === null) {
    return (
      <View style={styles.loaderWrap}>
        <Text style={styles.loaderText}>Draft not found.</Text>
      </View>
    );
  }

  if (!premise) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loaderText}>Loading premise...</Text>
      </View>
    );
  }

  return (
    <>
      {/* 🛡️ THE GLOBAL GUARD: Drop it at the very top of your JSX */}
      <ScreenLock
        visible={inProgress}
        title={"SYNCING"}
        status="Securing encrypted data packet..."
      />
      <Formik
        initialValues={actionInit.initValues}
        onSubmit={handleSubmitDiscovery}
        validationSchema={actionInit.schema}
        enableReinitialize={true}
        validateOnMount={true}
        validateOnChange={true}
        // validateOnBlur={true}
      >
        {({ values, setFieldValue, errors }) => {
          // console.log(` `);
          // console.log(
          //   `handleSubmitDiscovery values`,
          //   JSON.stringify(values, null, 2),
          // );
          // console.log(` `);
          // console.log(`handleSubmitDiscovery --values`, values);
          // console.log(
          //   `handleSubmitDiscovery --values?.ast?.normalisation?.actionTaken`,
          //   values?.ast?.normalisation?.actionTaken,
          // );
          // console.log(
          //   `FormMeterDiscovery --values`,
          //   JSON.stringify(values, null, 2),
          // );

          // console.log(`FormMeterDiscovery --values`, values);
          // console.log(` `);
          // console.log(`handleSubmitDiscovery --errors`, errors);
          // console.log(`errors`, JSON.stringify(errors, null, 2));

          return (
            <ScrollView
              style={styles.container}
              contentContainerStyle={{ paddingBottom: 50 }}
            >
              <Stack.Screen
                options={{
                  title: premiseAddress || "Meter Discovery",
                  headerTitleStyle: { fontSize: 14, fontWeight: "900" }, // Sovereign Polish
                  headerLeft: () => (
                    <TouchableOpacity
                      // onPress={() => router.back()}
                      onPress={() => {
                        router.dismissAll();
                        router.replace("/(tabs)/premises");
                      }}
                      style={{ marginLeft: 10, padding: 5 }}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons
                        name="arrow-left"
                        size={24}
                        color="#1e293b"
                      />
                    </TouchableOpacity>
                  ),
                  headerRight: () => (
                    <View style={{ marginRight: 15 }}>
                      <Text
                        style={{
                          color: "#2563eb",
                          fontSize: 14,
                          fontWeight: "900",
                        }}
                      >
                        {premise?.erfNo || "N/Av"}
                      </Text>
                    </View>
                  ),
                }}
              />

              {/* ACCESS TOGGLE */}
              {values?.accessData?.access?.hasAccess === "yes" ? (
                // ACCESS SECTION
                <View>
                  {values?.meterType === "electricity" ? (
                    <ElectricitySections
                      values={values}
                      setFieldValue={setFieldValue}
                      getOptions={getOptions}
                      disabled={isTrnLoading}
                      agentName={agentName}
                      agentUid={agentUid}
                      erfBoundary={erfBoundary}
                      erfNo={finalErfNo}
                      erfCentroid={landingPoint}
                      landingPoint={landingPoint}
                      icon={"tooltip-outline"}
                      nearbyErfs={nearbyErfs}
                      nearbyPremises={nearbyPremises}
                      nearbyMeters={nearbyMeters}
                    />
                  ) : (
                    <WaterSections
                      values={values}
                      setFieldValue={setFieldValue}
                      getOptions={getOptions}
                      disabled={isTrnLoading}
                      agentName={agentName}
                      agentUid={agentUid}
                      erfBoundary={erfBoundary}
                      erfNo={finalErfNo}
                      erfCentroid={landingPoint}
                      landingPoint={landingPoint}
                      icon={"tooltip-outline"}
                      nearbyErfs={nearbyErfs}
                      nearbyPremises={nearbyPremises}
                      nearbyMeters={nearbyMeters}
                    />
                  )}
                </View>
              ) : (
                // NO ACCESS SECTION
                <Surface style={styles.card}>
                  {values?.accessData?.access?.hasAccess === "no" && (
                    <Surface style={styles.naCard} elevation={2}>
                      <View style={styles.sectionHeader}>
                        <MaterialCommunityIcons
                          name="alert-circle"
                          size={18}
                          color="#dc2626"
                        />
                        <Text
                          style={[styles.sectionTitle, { color: "#dc2626" }]}
                        >
                          NA Reason
                        </Text>
                      </View>

                      {/* Reason Selector */}
                      <TouchableOpacity
                        style={styles.selector}
                        onPress={() => setModalVisible(true)}
                      >
                        <View>
                          <Text style={styles.selectorValue}>
                            {values?.accessData?.access?.reason ||
                              "Select reason ..."}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name="chevron-down"
                          size={22}
                          color="#dc2626"
                        />
                      </TouchableOpacity>

                      <Divider style={{ marginVertical: 15 }} />

                      <IrepsMedia
                        name="media" // 🎯 Ensure this is NOT "accessData.media"
                        tag={"noAccessPhoto"}
                        agentName={agentName}
                        agentUid={agentUid}
                        fallbackGps={landingPoint}
                      />
                    </Surface>
                  )}
                </Surface>
              )}

              {/* RESET / SUBMIT BTNS */}
              <ForensicFooter
                isTrnLoading={isTrnLoading}
                isSuccess={showSuccess}
              />

              <Portal>
                <Modal
                  visible={modalVisible}
                  onDismiss={() => setModalVisible(false)}
                  contentContainerStyle={styles.modalContent}
                >
                  <RadioButton.Group
                    onValueChange={(v) => {
                      setFieldValue("accessData.access.reason", v);
                      setModalVisible(false);
                    }}
                    value={values?.accessData?.access?.reason}
                  >
                    {noAccessReasons.map((r) => (
                      <RadioButton.Item key={r} label={r} value={r} />
                    ))}
                  </RadioButton.Group>
                </Modal>

                <Modal
                  visible={showSuccess}
                  dismissable={false} // Force them to acknowledge or wait for auto-nav
                  contentContainerStyle={styles.successModal}
                >
                  <View style={styles.successContent}>
                    <View style={styles.successIconCircle}>
                      <Feather name="check" size={50} color="#fff" />
                    </View>
                    <Text style={styles.successTitle}>MISSION SUCCESS</Text>
                    <Text style={styles.successSub}>
                      {values?.accessData?.access?.hasAccess === "no"
                        ? "NA Access "
                        : ""}
                      Trn saved successfully
                    </Text>

                    <TouchableOpacity
                      style={styles.continueBtn}
                      onPress={() => {
                        setShowSuccess(false);
                      }}
                    >
                      <Text style={styles.continueBtnText}>CONTINUE</Text>
                    </TouchableOpacity>
                  </View>
                </Modal>
              </Portal>
            </ScrollView>
          );
        }}
      </Formik>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  sectionCard: {
    margin: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  sectionHeader: {
    padding: 10,
    backgroundColor: "#E2E8F0",
    flexDirection: "row",
    gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "bold", color: "#475569" },
  input: { marginBottom: 10, backgroundColor: "#fff" },
  selector: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 15,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  modalContent: {
    backgroundColor: "white",
    padding: 20,
    margin: 20,
    borderRadius: 12,
  },

  card: {
    backgroundColor: "#FFF",
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  naCard: {
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#fecaca",
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  row: { flexDirection: "row", gap: 10, padding: 10 },
  toggleBtn: { flex: 1, borderRadius: 10 },
  actionText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#475569",
    marginTop: 4,
  },
  selectorValue: { fontSize: 16, fontWeight: "600", color: "#1E293B" },
  footer: { flexDirection: "row", gap: 12, marginTop: 20, padding: 20 },
  submitBtn: { flex: 2, borderRadius: 10 },
  resetBtn: { flex: 1, borderRadius: 10 },
  watermarkOverlay: {
    position: "absolute",
    bottom: 20,
    left: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 10,
    borderRadius: 5,
  },
  watermarkText: { color: "white", fontSize: 10, fontWeight: "bold" },
  cameraControls: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
  },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  captureBtnInternal: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "white",
  },
  gpsBadge: {
    marginTop: 10,
    padding: 5,
    backgroundColor: "#dcfce7",
    borderRadius: 5,
  },
  gpsBadgeText: { fontSize: 10, color: "#166534", fontWeight: "bold" },

  headerMeterText: { fontSize: 14, color: "#64748b", fontWeight: "bold" },

  actionBlock: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#dc2626",
  },

  thumbnailContainer: {
    width: 110,
    height: 110,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    position: "relative",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  removePhotoBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    padding: 2,
  },

  inspectionModal: {
    margin: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "black",
  },
  inspectionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  fullImage: {
    width: "100%",
    height: "80%", // Leaves room for the close button and footer
  },
  closeInspectionBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
  },
  inspectionFooter: {
    position: "absolute",
    bottom: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  inspectionText: {
    color: "white",
    fontWeight: "bold",
    letterSpacing: 1,
  },

  modalContainer: {
    backgroundColor: "white",
    padding: 10,
    margin: 20,
    borderRadius: 20,
    height: "70%",
  },
  cameraWrapper: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 15,
    backgroundColor: "#000",
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  scanTarget: {
    width: 250,
    height: 150,
    borderWidth: 2,
    borderColor: "#00FF00",
    backgroundColor: "transparent",
  },
  scanText: {
    color: "white",
    marginTop: 20,
    fontWeight: "bold",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 5,
  },
  closeBtn: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
  },
  successModal: {
    backgroundColor: "white",
    padding: 30,
    margin: 40,
    borderRadius: 20,
    alignItems: "center",
  },
  successContent: {
    alignItems: "center",
    width: "100%",
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#22C55E", // Success Green
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    // Shadow for depth
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 1,
  },
  successSub: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  continueBtn: {
    backgroundColor: "#0F172A",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  continueBtnText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 14,
  },

  integratedMediaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: "#F1F5F9", // Subtle background to "group" the media tools
    borderRadius: 12,
    padding: 8,
    height: 120, // Enough height for 100px thumbnails + padding
  },
  cameraSlot: {
    width: 90,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#CBD5E1",
    paddingRight: 8,
  },
  ribbonSlot: {
    flex: 1, // Takes all remaining space
    height: "100%",
  },
  tinyLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#475569",
    marginTop: 2,
  },
  inputContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0", // Normal border
    overflow: "hidden", // Keeps the left border sharp
  },
  errorIndicator: {
    borderLeftWidth: 5, // 🎯 The "Sexy" thin indicator
    borderLeftColor: "#EF4444", // Forensic Red
    backgroundColor: "#FEF2F2", // Very light red tint (Optional)
  },

  mapModalContainer: { padding: 10, flex: 1, justifyContent: "center" },
  mapPickerSurface: {
    borderRadius: 20,
    height: "70%",
    overflow: "hidden",
    backgroundColor: "white",
  },
  pickerMap: { flex: 1 },
  modalHeader: {
    padding: 15,
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 15,
    backgroundColor: "#f8fafc",
  },

  iconCircleSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  centroidLabel: {
    backgroundColor: "rgba(15, 23, 42, 0.7)", // Dark slate semi-transparent
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  centroidText: {
    color: "#FFD700",
    fontSize: 10,
    fontWeight: "900",
  },
  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 24,
  },

  loaderText: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "700",
    color: "#64748b",
  },
});
