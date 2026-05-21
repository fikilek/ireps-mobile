import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Formik } from "formik";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
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
  TextInput,
} from "react-native-paper";
import { array, object, string } from "yup";

import { httpsCallable } from "firebase/functions";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

import { IrepsFormActions } from "../../../components/forms/IrepsFormActions";
import { IrepsNoAccessSection } from "../../../components/forms/IrepsNoAccessSection";
import IrepsSelectWithOther, {
  isSelectWithOtherFilled,
  normalizeSelectWithOtherValue,
  selectWithOtherToText,
} from "../../../components/IrepsSelectWithOther";
import { IrepsMedia } from "../../../components/media/IrepsMedia";
import { ScreenLock } from "../../../components/SceenLock";
import { useWarehouse } from "../../../src/context/WarehouseContext";
import { functions } from "../../../src/firebase";
import { useAuth } from "../../../src/hooks/useAuth";
import { useIrepsLookupOptions } from "../../../src/hooks/useIrepsLookupOptions";
import { useGetServiceProvidersQuery } from "../../../src/redux/spApi";
import {
  addSubmissionQueueItem,
  getSubmissionQueueItemById,
  removeSubmissionQueueItem,
  updateSubmissionQueueItem,
} from "../../../src/utils/submissionQueue";

const EMPTY_SELECT_WITH_OTHER = {
  code: "",
  label: "",
  otherText: "",
};

const DCN_SUBMIT_TIMEOUT_MS = 15000; // TEST ONLY - restore to 15000 after MMKV reconciliation test

const EXECUTION_MEDIA_TAGS = [
  "disconnectionLevelEvidence",
  "disconnectionMeterReadingEvidence",
  "tokenReadingPhoto",
  "safetyEvidence",
  "noAccessPhoto",
];

function makeEmptySelectWithOther() {
  return { ...EMPTY_SELECT_WITH_OTHER };
}

function readFirstString(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean) return clean;
  }

  return "";
}

function getInstructionWorkflowState(action = {}) {
  return String(
    action?.workflowState || action?.workflow?.state || "",
  ).toUpperCase();
}

function isLifecycleInstructionLocked(action = {}) {
  const workflowState = getInstructionWorkflowState(action);

  return (
    action?.source === "WMS" ||
    Boolean(action?.instructionTrnId) ||
    Boolean(action?.trnId) ||
    Boolean(action?.id) ||
    [
      "ISSUED",
      "REASSIGNED",
      "ACCEPTED",
      "REJECTED",
      "COMPLETED",
      "CANCELLED",
    ].includes(workflowState)
  );
}

function withSubmitTimeout(promise, timeoutMs = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => {
        reject(new Error("SUBMISSION_TIMEOUT"));
      }, timeoutMs),
    ),
  ]);
}

function removeUndefined(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (item === undefined ? null : item)),
  );
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

function getPremiseAddress(premise, astDoc) {
  const premiseAddress =
    `${premise?.address?.strNo || ""} ${premise?.address?.strName || ""} ${
      premise?.address?.strType || ""
    }`.trim();

  return premiseAddress || astDoc?.accessData?.premise?.address || "NAv";
}

function getPropertyType(premise, astDoc) {
  const propType =
    `${premise?.propertyType?.type || ""} ${premise?.propertyType?.name || ""} ${
      premise?.propertyType?.unitNo || ""
    }`.trim();

  return propType || astDoc?.accessData?.premise?.propertyType || "NAv";
}

function resolveMncServiceProvider(spId, allServiceProviders, visited = []) {
  if (!spId || visited.includes(spId)) return null;

  const sp = allServiceProviders.find((s) => s.id === spId);
  if (!sp) return null;

  const isMnc = (sp.clients || []).some(
    (c) => c.clientType === "LM" && c.relationshipType === "MNC",
  );

  if (isMnc) {
    return {
      id: sp.id,
      name: sp?.profile?.tradingName || sp.id,
    };
  }

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

function textToOtherSelectValue(text) {
  const clean = String(text || "").trim();

  if (!clean) return makeEmptySelectWithOther();

  return {
    code: "OTHER",
    label: "Other",
    otherText: clean,
  };
}

function normalizeInstructionValue(value) {
  if (!value) return makeEmptySelectWithOther();

  if (typeof value === "string") {
    return textToOtherSelectValue(value);
  }

  if (value?.code !== undefined || value?.otherText !== undefined) {
    return normalizeSelectWithOtherValue(value);
  }

  if (value?.text) {
    return textToOtherSelectValue(value.text);
  }

  return makeEmptySelectWithOther();
}

function normalizeNoReadingReasonValue(value) {
  if (!value) return makeEmptySelectWithOther();

  if (typeof value === "string") {
    return textToOtherSelectValue(value);
  }

  if (value?.code !== undefined || value?.otherText !== undefined) {
    return normalizeSelectWithOtherValue(value);
  }

  return makeEmptySelectWithOther();
}

function normalizeNoAccessReasonValue(value, reasonText = "") {
  if (value?.code !== undefined || value?.otherText !== undefined) {
    return normalizeSelectWithOtherValue(value);
  }

  if (reasonText && reasonText !== "NAv") {
    return textToOtherSelectValue(reasonText);
  }

  return makeEmptySelectWithOther();
}

function normalizeCodeLabelValue(value) {
  if (!value) return makeEmptySelectWithOther();

  if (value?.code !== undefined || value?.label !== undefined) {
    return normalizeSelectWithOtherValue(value);
  }

  return makeEmptySelectWithOther();
}

function normalizeMeterKindForReading(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

function isPrepaidMeterKind(value) {
  return normalizeMeterKindForReading(value) === "prepaid";
}

function getHasAccess(values = {}) {
  return String(values?.accessData?.access?.hasAccess || "yes").toLowerCase();
}

function isNoAccess(values = {}) {
  return getHasAccess(values) === "no";
}

function hasMediaTag(media = [], tag) {
  return (Array.isArray(media) ? media : []).some((item) => item?.tag === tag);
}

function filterExecutionMedia(media = []) {
  return (Array.isArray(media) ? media : []).filter((item) =>
    EXECUTION_MEDIA_TAGS.includes(item?.tag),
  );
}

function buildBackendDisconnectionPayload(
  disconnection = {},
  { isPrepaid = false, noAccess = false } = {},
) {
  if (noAccess) {
    return {
      level: {
        code: "",
        label: "",
      },

      supplyDisconnected: {
        answer: "",
        notes: "",
      },

      meterReading: "",
      tokenReading: "",
      noReadingReason: "",

      safetyConfirmed: {
        answer: "",
        notes: "",
      },
    };
  }

  return {
    level: {
      code: disconnection?.level?.code || "",
      label: disconnection?.level?.label || "",
    },

    supplyDisconnected: {
      answer: disconnection?.supplyDisconnected?.answer || "",
      notes: disconnection?.supplyDisconnected?.notes || "",
    },

    meterReading: isPrepaid ? "" : String(disconnection?.meterReading || ""),
    tokenReading: isPrepaid ? String(disconnection?.tokenReading || "") : "",

    noReadingReason: selectWithOtherToText(disconnection?.noReadingReason),

    safetyConfirmed: {
      answer: disconnection?.safetyConfirmed?.answer || "",
      notes: disconnection?.safetyConfirmed?.notes || "",
    },
  };
}

function buildAssignmentPayload({
  assignment = {},
  officeInstruction = {},
  instructionLocked = true,
}) {
  const { instructionSelect, createdFor, ...restAssignment } = assignment || {};

  const targetFromCreatedFor = createdFor?.id
    ? [
        {
          type: createdFor?.type || "USER",
          id: createdFor.id,
          name: createdFor?.name || "NAv",
        },
      ]
    : [];

  const targets =
    Array.isArray(restAssignment?.targets) && restAssignment.targets.length
      ? restAssignment.targets
      : targetFromCreatedFor;

  const instructionText = instructionLocked
    ? String(
        officeInstruction?.text || restAssignment?.instruction?.text || "",
      ).trim()
    : selectWithOtherToText(instructionSelect);

  return {
    ...restAssignment,
    targets,
    instruction: {
      code:
        restAssignment?.instruction?.code ||
        officeInstruction?.code ||
        "METER_DISCONNECTION",
      text: instructionText,
      notes: String(
        restAssignment?.instruction?.notes || officeInstruction?.notes || "",
      ).trim(),
      mediaRequired:
        restAssignment?.instruction?.mediaRequired === true ||
        officeInstruction?.mediaRequired === true,
    },
  };
}

function normalizeFirebaseStorageImageUrl(rawUrl) {
  const url = String(rawUrl || "").trim();

  if (!url) return "";

  const marker = "firebasestorage.googleapis.com/v0/b/";
  const objectMarker = "/o/";

  if (!url.includes(marker) || !url.includes(objectMarker)) {
    return url;
  }

  try {
    const [beforeQuery, query = ""] = url.split("?");
    const objectMarkerIndex = beforeQuery.indexOf(objectMarker);

    if (objectMarkerIndex < 0) return url;

    const prefix = beforeQuery.slice(
      0,
      objectMarkerIndex + objectMarker.length,
    );
    const objectPath = beforeQuery.slice(
      objectMarkerIndex + objectMarker.length,
    );

    const decodedObjectPath = decodeURIComponent(objectPath);
    const encodedObjectPath = encodeURIComponent(decodedObjectPath);

    return `${prefix}${encodedObjectPath}${query ? `?${query}` : ""}`;
  } catch (error) {
    console.log("normalizeFirebaseStorageImageUrl --error", error);

    return url;
  }
}

function getMediaPreviewUrl(mediaItem = {}) {
  return normalizeFirebaseStorageImageUrl(
    mediaItem?.url || mediaItem?.uri || "",
  );
}

const DisconnectionSchema = object()
  .shape({
    accessData: object().shape({
      access: object().shape({
        hasAccess: string()
          .oneOf(["yes", "no"])
          .required("Access outcome is required"),
        reason: string().notRequired(),
        reasonSelect: object().shape({
          code: string().notRequired(),
          label: string().notRequired(),
          otherText: string().notRequired(),
        }),
      }),
    }),

    assignment: object().shape({
      instructionSelect: object().shape({
        code: string().notRequired(),
        label: string().notRequired(),
        otherText: string().notRequired(),
      }),
    }),

    disconnection: object().shape({
      level: object().shape({
        code: string().notRequired(),
        label: string().notRequired(),
        otherText: string().notRequired(),
      }),

      supplyDisconnected: object().shape({
        answer: string().notRequired(),
        notes: string().notRequired(),
      }),

      meterReading: string().notRequired(),
      tokenReading: string().notRequired(),

      noReadingReason: object().shape({
        code: string().notRequired(),
        label: string().notRequired(),
        otherText: string().notRequired(),
      }),

      safetyConfirmed: object().shape({
        answer: string().notRequired(),
        notes: string().notRequired(),
      }),
    }),

    media: array().of(object()),
  })
  .test("dcn-v02-validation", "DCN validation failed", function (values = {}) {
    const access = values?.accessData?.access || {};
    const disconnection = values?.disconnection || {};
    const media = values?.media || [];

    if (String(access?.hasAccess || "").toLowerCase() === "no") {
      if (!isSelectWithOtherFilled(access?.reasonSelect)) {
        return this.createError({
          path: "accessData.access.reasonSelect",
          message: "No-access reason is required",
        });
      }

      if (!hasMediaTag(media, "noAccessPhoto")) {
        return this.createError({
          path: "media",
          message: "No access photo is required",
        });
      }

      return true;
    }

    if (!isSelectWithOtherFilled(disconnection?.level)) {
      return this.createError({
        path: "disconnection.level",
        message: "Disconnection level is required",
      });
    }

    if (!["yes", "no"].includes(disconnection?.supplyDisconnected?.answer)) {
      return this.createError({
        path: "disconnection.supplyDisconnected.answer",
        message: "Supply disconnected answer is required",
      });
    }

    if (disconnection?.supplyDisconnected?.answer !== "yes") {
      return this.createError({
        path: "disconnection.supplyDisconnected.answer",
        message: "Supply must be confirmed as disconnected before submit",
      });
    }

    if (!hasMediaTag(media, "disconnectionLevelEvidence")) {
      return this.createError({
        path: "media",
        message: "Disconnection level evidence required",
      });
    }

    const meterReading = String(disconnection?.meterReading || "").trim();
    const tokenReading = String(disconnection?.tokenReading || "").trim();

    if (
      !meterReading &&
      !tokenReading &&
      !isSelectWithOtherFilled(disconnection?.noReadingReason)
    ) {
      return this.createError({
        path: "disconnection.noReadingReason",
        message:
          "Meter reading, token reading, or no-reading reason is required",
      });
    }

    if (
      meterReading &&
      !hasMediaTag(media, "disconnectionMeterReadingEvidence")
    ) {
      return this.createError({
        path: "media",
        message: "Disconnection meter reading evidence required",
      });
    }

    if (tokenReading && !hasMediaTag(media, "tokenReadingPhoto")) {
      return this.createError({
        path: "media",
        message: "Token reading photo is required",
      });
    }

    if (!["yes", "no"].includes(disconnection?.safetyConfirmed?.answer)) {
      return this.createError({
        path: "disconnection.safetyConfirmed.answer",
        message: "Safety confirmed answer is required",
      });
    }

    if (disconnection?.safetyConfirmed?.answer !== "yes") {
      return this.createError({
        path: "disconnection.safetyConfirmed.answer",
        message: "Safety must be confirmed before submit",
      });
    }

    if (!hasMediaTag(media, "safetyEvidence")) {
      return this.createError({
        path: "media",
        message: "Safety evidence required",
      });
    }

    return true;
  });

const YesNoQuestion = ({
  title,
  description,
  value,
  notes,
  answerPath,
  notesPath,
  setFieldValue,
  errorText,
  children,
}) => {
  return (
    <Surface style={styles.questionCard} elevation={1}>
      <View style={styles.questionHeader}>
        <Text style={styles.questionTitle}>{title}</Text>
        <Text style={styles.questionDescription}>{description}</Text>
      </View>

      <RadioButton.Group
        value={value}
        onValueChange={(nextValue) => setFieldValue(answerPath, nextValue)}
      >
        <View style={styles.radioRow}>
          <TouchableOpacity
            style={[
              styles.radioChoice,
              value === "yes" && styles.radioChoiceYes,
            ]}
            onPress={() => setFieldValue(answerPath, "yes")}
          >
            <RadioButton value="yes" />
            <Text style={styles.radioText}>YES</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.radioChoice, value === "no" && styles.radioChoiceNo]}
            onPress={() => setFieldValue(answerPath, "no")}
          >
            <RadioButton value="no" />
            <Text style={styles.radioText}>NO</Text>
          </TouchableOpacity>
        </View>
      </RadioButton.Group>

      {value === "no" && (
        <TextInput
          mode="outlined"
          label="Reason / Notes"
          value={notes}
          onChangeText={(text) => setFieldValue(notesPath, text)}
          multiline
          numberOfLines={3}
          style={styles.notesInput}
        />
      )}

      <View style={styles.questionEvidenceSlot}>{children}</View>

      {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
    </Surface>
  );
};

const AccessOutcomeCard = ({ value, setFieldValue }) => {
  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="gate-alert" size={18} color="#DC2626" />
        <Text style={styles.sectionTitle}>Site Access Outcome</Text>
      </View>

      <Text style={styles.accessHelpText}>
        Select YES if the meter or supply point was accessed. Select NO ACCESS
        if the executor could not safely reach the meter or supply point.
      </Text>

      <RadioButton.Group
        value={value}
        onValueChange={(nextValue) => {
          setFieldValue("accessData.access.hasAccess", nextValue);

          if (nextValue === "yes") {
            setFieldValue("accessData.access.reason", "NAv");
            setFieldValue(
              "accessData.access.reasonSelect",
              makeEmptySelectWithOther(),
            );
          }
        }}
      >
        <View style={styles.accessChoiceRow}>
          <TouchableOpacity
            style={[
              styles.accessChoice,
              value === "yes" && styles.accessChoiceYes,
            ]}
            onPress={() => {
              setFieldValue("accessData.access.hasAccess", "yes");
              setFieldValue("accessData.access.reason", "NAv");
              setFieldValue(
                "accessData.access.reasonSelect",
                makeEmptySelectWithOther(),
              );
            }}
            activeOpacity={0.85}
          >
            <RadioButton value="yes" />
            <View style={styles.accessChoiceTextWrap}>
              <Text style={styles.accessChoiceTitle}>ACCESS YES</Text>
              <Text style={styles.accessChoiceSub}>
                Continue with DCN checks
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.accessChoice,
              value === "no" && styles.accessChoiceNo,
            ]}
            onPress={() => setFieldValue("accessData.access.hasAccess", "no")}
            activeOpacity={0.85}
          >
            <RadioButton value="no" />
            <View style={styles.accessChoiceTextWrap}>
              <Text style={styles.accessChoiceTitle}>NO ACCESS</Text>
              <Text style={styles.accessChoiceSub}>
                Complete as unsuccessful
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </RadioButton.Group>
    </Surface>
  );
};

const OfficeInstructionSection = ({
  title,
  icon,
  color,
  instruction,
  media,
}) => {
  const [activeMedia, setActiveMedia] = useState(null);

  const cleanMedia = useMemo(() => {
    return (Array.isArray(media) ? media : []).filter(
      (item) => item?.url || item?.uri,
    );
  }, [media]);

  const hasMedia = cleanMedia.length > 0;
  const activeUrl = getMediaPreviewUrl(activeMedia);

  async function openActiveMediaExternal() {
    if (!activeUrl) return;

    try {
      await Linking.openURL(activeUrl);
    } catch (error) {
      console.log(
        "OfficeInstructionSection openActiveMediaExternal --error",
        error,
      );

      Alert.alert(
        "Open Media Failed",
        "Could not open this instruction media item.",
      );
    }
  }

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

      <View style={styles.readOnlyBox}>
        <Text style={styles.readOnlyLabel}>Instruction</Text>
        <Text style={styles.readOnlyValue}>{instruction?.text || "NAv"}</Text>

        <Text style={styles.readOnlyLabel}>Instruction Notes</Text>
        <Text style={styles.readOnlyValue}>
          {instruction?.notes || "No notes captured."}
        </Text>

        <Text style={styles.readOnlyLabel}>Instruction Media</Text>

        {!hasMedia ? (
          <Text style={styles.readOnlyValue}>
            No instruction media captured.
          </Text>
        ) : (
          <View style={styles.readOnlyMediaList}>
            {cleanMedia.map((item, index) => {
              const itemUrl = item?.url || item?.uri || "";
              const isImage =
                String(item?.type || "").toLowerCase() === "image" ||
                itemUrl.toLowerCase().includes(".jpg") ||
                itemUrl.toLowerCase().includes(".jpeg") ||
                itemUrl.toLowerCase().includes(".png") ||
                itemUrl.toLowerCase().includes(".webp");

              return (
                <TouchableOpacity
                  key={`${itemUrl || "instruction-media"}-${index}`}
                  style={styles.mediaReadOnlyRow}
                  activeOpacity={0.8}
                  onPress={() => setActiveMedia(item)}
                >
                  <View style={styles.mediaReadOnlyThumbWrap}>
                    {isImage ? (
                      <Image
                        source={{ uri: getMediaPreviewUrl(item) }}
                        style={styles.mediaReadOnlyThumb}
                        resizeMode="cover"
                      />
                    ) : (
                      <MaterialCommunityIcons
                        name="file-eye-outline"
                        size={20}
                        color="#2563EB"
                      />
                    )}
                  </View>

                  <View style={styles.mediaReadOnlyMain}>
                    <Text style={styles.mediaReadOnlyText}>
                      {item?.tag || "instructionMedia"} •{" "}
                      {item?.type || "media"}
                    </Text>

                    {!!item?.created?.byUser && (
                      <Text style={styles.mediaReadOnlyMeta}>
                        Uploaded by {item.created.byUser}
                      </Text>
                    )}

                    <Text style={styles.mediaReadOnlyHint}>Tap to preview</Text>
                  </View>

                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color="#2563EB"
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <Portal>
        <Modal
          visible={Boolean(activeMedia)}
          onDismiss={() => setActiveMedia(null)}
          contentContainerStyle={styles.instructionMediaModal}
        >
          <View style={styles.instructionMediaModalHeader}>
            <View style={styles.instructionMediaModalIcon}>
              <MaterialCommunityIcons
                name="image-multiple-outline"
                size={22}
                color="#2563EB"
              />
            </View>

            <View style={styles.instructionMediaModalTitleWrap}>
              <Text style={styles.instructionMediaModalTitle}>
                Instruction Media
              </Text>
              <Text style={styles.instructionMediaModalSub}>
                {activeMedia?.tag || "instructionMedia"} •{" "}
                {activeMedia?.type || "media"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.instructionMediaModalClose}
              onPress={() => setActiveMedia(null)}
            >
              <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>

          {activeUrl ? (
            <>
              <View style={styles.instructionMediaPreviewFrame}>
                <Image
                  source={{ uri: activeUrl }}
                  style={styles.instructionMediaPreviewImage}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.instructionMediaMetaBox}>
                <Text style={styles.instructionMediaMetaText}>
                  Uploaded by: {activeMedia?.created?.byUser || "NAv"}
                </Text>
                <Text style={styles.instructionMediaMetaText}>
                  Tag: {activeMedia?.tag || "NAv"}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.openInstructionMediaButton}
                onPress={openActiveMediaExternal}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons
                  name="open-in-new"
                  size={17}
                  color="#FFFFFF"
                />
                <Text style={styles.openInstructionMediaButtonText}>
                  OPEN FULL IMAGE
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.instructionMediaEmptyBox}>
              <MaterialCommunityIcons
                name="image-off-outline"
                size={34}
                color="#94A3B8"
              />
              <Text style={styles.readOnlyValue}>No media URL found.</Text>
            </View>
          )}
        </Modal>
      </Portal>
    </Surface>
  );
};

export default function FormMeterDisconnection() {
  const {
    astId: astIdRaw,
    sourceAstId: sourceAstIdRaw,
    premiseId: premiseIdRaw,
    instructionTrnId: instructionTrnIdRaw,
    trnId: trnIdRaw,
    action: actionRaw,
    queueItemId: queueItemIdRaw,
  } = useLocalSearchParams();

  const routeAstId = Array.isArray(astIdRaw) ? astIdRaw[0] : astIdRaw;
  const routeSourceAstId = Array.isArray(sourceAstIdRaw)
    ? sourceAstIdRaw[0]
    : sourceAstIdRaw;
  const routeInstructionTrnId = Array.isArray(instructionTrnIdRaw)
    ? instructionTrnIdRaw[0]
    : instructionTrnIdRaw;
  const routeTrnId = Array.isArray(trnIdRaw) ? trnIdRaw[0] : trnIdRaw;
  const premiseId = Array.isArray(premiseIdRaw)
    ? premiseIdRaw[0]
    : premiseIdRaw;
  const queueItemId = Array.isArray(queueItemIdRaw)
    ? queueItemIdRaw[0]
    : queueItemIdRaw;

  const action = useMemo(() => {
    try {
      return actionRaw ? JSON.parse(actionRaw) : {};
    } catch (_error) {
      return {};
    }
  }, [actionRaw]);

  const instructionTrnId = readFirstString(
    routeInstructionTrnId,
    routeTrnId,
    action?.instructionTrnId,
    action?.trnId,
    action?.id,
    action?.trn?.id,
  );

  const sourceAstId = readFirstString(
    routeSourceAstId,
    routeAstId,
    action?.sourceAstId,
    action?.astId,
    action?.ast?.astData?.astId,
  );

  const officeInstruction = useMemo(() => {
    return action?.officeInstruction || action?.assignment?.instruction || {};
  }, [action]);

  const officeInstructionMedia = useMemo(() => {
    if (Array.isArray(action?.officeInstructionMedia)) {
      return action.officeInstructionMedia;
    }

    if (Array.isArray(action?.media)) {
      return action.media.filter((media) => media?.tag === "instructionMedia");
    }

    return [];
  }, [action]);

  const instructionLocked = useMemo(() => {
    return Boolean(instructionTrnId) || isLifecycleInstructionLocked(action);
  }, [action, instructionTrnId]);

  const router = useRouter();
  const { all } = useWarehouse();
  const { profile, user } = useAuth();
  const { data: allServiceProviders = [] } = useGetServiceProvidersQuery();

  const [editQueueItem, setEditQueueItem] = useState(undefined);
  const [inProgress, setInProgress] = useState(false);
  const [saveInProgress, setSaveInProgress] = useState(false);
  const [initialEligible, setInitialEligible] = useState(null);

  const [submitOutcome, setSubmitOutcome] = useState({
    visible: false,
    type: null,
    title: "",
    message: "",
    goBackOnContinue: true,
  });

  const agentUid = user?.uid || "unknown_uid";
  const agentName = profile?.profile?.displayName || "Field Agent";

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

  const astDoc = useMemo(() => {
    const id = sourceAstId;
    if (!id) return null;

    const warehouseAst =
      (all?.meters || []).find((meterDoc) => meterDoc?.id === id) || null;

    if (warehouseAst) return warehouseAst;

    const actionAst = action?.ast || {};
    const actionAstData = actionAst?.astData || {};
    const actionAccessData = action?.accessData || {};
    const actionStatus = action?.status || {};

    const actionMeterNo = readFirstString(
      actionAstData?.astNo,
      action?.meterNo,
    );

    if (!actionAstData?.astId && !actionMeterNo) {
      return null;
    }

    return {
      id,
      ast: {
        ...actionAst,
        astData: {
          ...actionAstData,
          astId: readFirstString(actionAstData?.astId, id),
          astNo: readFirstString(actionAstData?.astNo, action?.meterNo, "NAv"),
          astManufacturer: readFirstString(
            actionAstData?.astManufacturer,
            "NAv",
          ),
          astName: readFirstString(actionAstData?.astName, "NAv"),
          meter: actionAstData?.meter || {
            type: readFirstString(action?.meterKind, "NAv"),
            category: readFirstString(action?.meterType, "NAv"),
          },
        },
      },
      accessData: {
        ...actionAccessData,
        erfId: readFirstString(actionAccessData?.erfId, action?.erfId, "NAv"),
        erfNo: readFirstString(actionAccessData?.erfNo, action?.erfNo, "NAv"),
        parents: actionAccessData?.parents || {},
        premise: {
          ...(actionAccessData?.premise || {}),
          id: readFirstString(
            actionAccessData?.premise?.id,
            action?.premiseId,
            premiseId,
            "NAv",
          ),
          address: readFirstString(
            actionAccessData?.premise?.address,
            action?.address,
            "NAv",
          ),
          propertyType: readFirstString(
            actionAccessData?.premise?.propertyType,
            action?.propertyType,
            "NAv",
          ),
        },
      },
      status: {
        ...actionStatus,
        state: readFirstString(
          actionStatus?.state,
          action?.meterPreStatus,
          "UNKNOWN",
        ),
        id: readFirstString(actionStatus?.id, "NAv"),
        detail: readFirstString(actionStatus?.detail, "NAv"),
      },
      meterType: readFirstString(action?.meterType, "NAv"),
    };
  }, [all?.meters, sourceAstId, action, premiseId]);

  const premise = useMemo(() => {
    const id =
      premiseId || astDoc?.accessData?.premise?.id || action?.premiseId || null;

    if (!id) return null;

    const warehousePremise =
      (all?.prems || []).find((premiseDoc) => premiseDoc?.id === id) || null;

    if (warehousePremise) return warehousePremise;

    if (astDoc?.accessData?.premise?.id) {
      return {
        id: astDoc.accessData.premise.id,
        erfNo: astDoc?.accessData?.erfNo || action?.erfNo || "NAv",
        parents: astDoc?.accessData?.parents || {},
        address: {
          strNo: "",
          strName:
            astDoc?.accessData?.premise?.address || action?.address || "",
          strType: "",
        },
        propertyType: {
          type: "",
          name: astDoc?.accessData?.premise?.propertyType || "NAv",
          unitNo: "",
        },
        geometry: {
          centroid: null,
        },
      };
    }

    return null;
  }, [
    all?.prems,
    premiseId,
    astDoc?.accessData?.premise?.id,
    astDoc?.accessData?.premise?.address,
    astDoc?.accessData?.premise?.propertyType,
    astDoc?.accessData?.erfNo,
    astDoc?.accessData?.parents,
    action,
  ]);

  const astData = astDoc?.ast?.astData || {};
  const meter = astData?.meter || {};

  const meterNo = readFirstString(astData?.astNo, action?.meterNo, "NAv");

  const meterType = readFirstString(
    astDoc?.meterType,
    action?.meterType,
    meter?.category,
    "NAv",
  );

  const meterKind = String(
    readFirstString(meter?.type, action?.meterKind, "NAv"),
  ).toLowerCase();

  const isPrepaidReading = isPrepaidMeterKind(meterKind);

  const currentStatus = String(
    readFirstString(astDoc?.status?.state, action?.meterPreStatus, "UNKNOWN"),
  ).toUpperCase();

  const parents = astDoc?.accessData?.parents || premise?.parents || {};
  const wardPcode = parents?.wardPcode || "NAv";
  const lmPcode = parents?.lmPcode || "NAv";
  const erfNo =
    astDoc?.accessData?.erfNo || premise?.erfNo || action?.erfNo || "NAv";

  const premiseAddress = getPremiseAddress(premise, astDoc);
  const propType = getPropertyType(premise, astDoc);

  const fallbackGps =
    toLatLng(astDoc?.ast?.location?.gps) ||
    toLatLng(premise?.geometry?.centroid) ||
    null;

  useEffect(() => {
    if (initialEligible !== null) return;
    if (!astDoc?.id) return;

    const firstStatus = String(
      astDoc?.status?.state || action?.meterPreStatus || "",
    ).toUpperCase();

    if (!firstStatus) return;

    setInitialEligible(firstStatus === "CONNECTED");
  }, [
    initialEligible,
    astDoc?.id,
    astDoc?.status?.state,
    action?.meterPreStatus,
  ]);

  const isEligible = initialEligible === true;

  const userSpId = profile?.employment?.serviceProvider?.id;

  const serviceProvider = useMemo(() => {
    const resolvedMnc = resolveMncServiceProvider(
      userSpId,
      allServiceProviders,
    );

    return (
      resolvedMnc || {
        id: userSpId || "NAv",
        name: profile?.employment?.serviceProvider?.name || "NAv",
      }
    );
  }, [
    userSpId,
    allServiceProviders,
    profile?.employment?.serviceProvider?.name,
  ]);

  const disconnectionInstructionLookup = useIrepsLookupOptions(
    "METER_DISCONNECTION_INSTRUCTION",
  );
  console.log(
    `disconnnection --disconnectionInstructionLookup`,
    disconnectionInstructionLookup,
  );

  const levelLookup = useIrepsLookupOptions("METER_DISCONNECTION_LEVEL");
  console.log(`disconnnection --levelLookup`, levelLookup);

  const noReadingReasonLookup = useIrepsLookupOptions(
    "METER_NO_READING_REASON",
  );
  console.log(`disconnnection --noReadingReasonLookup`, noReadingReasonLookup);

  function buildTrnSystemFields() {
    return {
      erfId: astDoc?.accessData?.erfId || premise?.erfId || "NAv",
      erfNo: astDoc?.accessData?.erfNo || premise?.erfNo || "NAv",
      trnType: "METER_DISCONNECTION",

      parents: {
        countryPcode: parents?.countryPcode || "NAv",
        provincePcode: parents?.provincePcode || "NAv",
        dmPcode: parents?.dmPcode || "NAv",
        lmPcode: parents?.lmPcode || "NAv",
        wardPcode: parents?.wardPcode || "NAv",
      },

      premise: {
        id: astDoc?.accessData?.premise?.id || premise?.id || "NAv",
        address: premiseAddress || "NAv",
        propertyType: propType || "NAv",
      },
    };
  }

  function buildQueueContext(values, baseSystemFields) {
    return {
      trnType: "METER_DISCONNECTION",
      instructionTrnId: instructionTrnId || "NAv",
      sourceAstId: astDoc?.id || sourceAstId || "NAv",
      astId: astDoc?.id || sourceAstId || "NAv",
      meterNo: values?.ast?.astData?.astNo || "NAv",
      meterType: values?.meterType || "NAv",
      erfId: baseSystemFields?.erfId || "NAv",
      erfNo: baseSystemFields?.erfNo || "NAv",
      premiseId: baseSystemFields?.premise?.id || "NAv",
      lmPcode: lmPcode || "NAv",
      wardPcode: wardPcode || "NAv",
    };
  }

  function buildExecutionPayload(values, mediaOverride) {
    const baseSystemFields = buildTrnSystemFields();
    const noAccess = isNoAccess(values);
    const noAccessReason = noAccess
      ? selectWithOtherToText(values?.accessData?.access?.reasonSelect)
      : "NAv";

    const executionOutcome = {
      outcome: noAccess ? "NO_ACCESS" : "SUCCESS",
      success: !noAccess,
    };

    return removeUndefined({
      id: instructionTrnId,
      instructionTrnId,
      sourceAstId: astDoc?.id || sourceAstId || "NAv",

      trnType: "METER_DISCONNECTION",

      accessData: {
        ...baseSystemFields,
        access: {
          hasAccess: values?.accessData?.access?.hasAccess || "yes",
          reason: noAccessReason || "NAv",
          reasonSelect: values?.accessData?.access?.reasonSelect,
        },
      },

      ast: values.ast,

      disconnection: buildBackendDisconnectionPayload(values.disconnection, {
        isPrepaid: isPrepaidReading,
        noAccess,
      }),

      executionOutcome,

      assignment: buildAssignmentPayload({
        assignment: values.assignment,
        officeInstruction,
        instructionLocked,
      }),

      meterType: values.meterType,
      media: filterExecutionMedia(mediaOverride || values.media || []),
      status: values.status,
      serviceProvider,
    });
  }

  function buildDisconnectionFailureMessage(values, result) {
    const noAccess = isNoAccess(values);

    if (noAccess) {
      return [
        "The DCN was completed as NO ACCESS.",
        "",
        "Result:",
        "• The field attempt was completed.",
        "• The meter was not moved to DISCONNECTED.",
        "",
        `AST status: ${result?.astStatusAfter || currentStatus}`,
      ].join("\n");
    }

    return [
      "The disconnection TRN was submitted, but the meter was not moved to DISCONNECTED.",
      "",
      `AST status: ${result?.astStatusAfter || currentStatus}`,
      "",
      "Please review the completed TRN result.",
    ].join("\n");
  }

  async function saveDraftToQueue(values, messageTitle, messageBody) {
    const baseSystemFields = buildTrnSystemFields();
    const cleanPayload = buildExecutionPayload(values, values?.media || []);
    const nextContext = buildQueueContext(values, baseSystemFields);

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
          status: "IN_PROGRESS",
          result: {
            success: false,
            code: "LOCAL_SAVE_ONLY",
            message: "Saved locally only. Not submitted.",
            trnId: instructionTrnId || "NAv",
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
        formType: "METER_DISCONNECTION",
        payload: cleanPayload,
        context: nextContext,
        status: "IN_PROGRESS",
        createdByUid: agentUid,
        createdByUser: agentName,
      });
    }

    if (!queueResult?.success) {
      Alert.alert(
        "Draft Save Failed",
        "Failed to save disconnection draft locally.",
      );
      return false;
    }

    setSubmitOutcome({
      visible: true,
      type: "savedLocally",
      title: messageTitle || "SAVED LOCALLY",
      message:
        messageBody ||
        "This DCN execution form was saved locally only. No backend update was made.",
      goBackOnContinue: true,
    });

    return true;
  }

  async function handleSaveDisconnection(values) {
    try {
      setSaveInProgress(true);

      await saveDraftToQueue(
        values,
        "SAVED LOCALLY",
        "This DCN execution form was saved locally only. It was not submitted and no backend update was made.",
      );

      setSaveInProgress(false);
    } catch (error) {
      console.log("handleSaveDisconnection --error", error);
      setSaveInProgress(false);

      Alert.alert(
        "Save Failed",
        error?.message || "Failed to save this DCN form locally.",
      );
    }
  }

  const getInitialValues = useCallback(() => {
    const editPayload = editQueueItem?.payload || null;

    if (editPayload) {
      return {
        ...editPayload,
        id: instructionTrnId || editPayload?.id || "NAv",
        instructionTrnId:
          instructionTrnId || editPayload?.instructionTrnId || "NAv",
        sourceAstId: sourceAstId || editPayload?.sourceAstId || "NAv",

        accessData: {
          ...editPayload?.accessData,
          access: {
            hasAccess:
              editPayload?.accessData?.access?.hasAccess === "no"
                ? "no"
                : "yes",
            reason: editPayload?.accessData?.access?.reason || "NAv",
            reasonSelect: normalizeNoAccessReasonValue(
              editPayload?.accessData?.access?.reasonSelect,
              editPayload?.accessData?.access?.reason,
            ),
          },
        },

        assignment: {
          ...editPayload?.assignment,
          instructionSelect: normalizeInstructionValue(
            editPayload?.assignment?.instructionSelect ||
              editPayload?.assignment?.instruction,
          ),
        },

        disconnection: {
          ...editPayload?.disconnection,
          level: normalizeCodeLabelValue(editPayload?.disconnection?.level),
          meterReading:
            typeof editPayload?.disconnection?.meterReading === "object"
              ? editPayload?.disconnection?.meterReading?.reading || ""
              : editPayload?.disconnection?.meterReading || "",
          tokenReading: editPayload?.disconnection?.tokenReading || "",
          noReadingReason: normalizeNoReadingReasonValue(
            editPayload?.disconnection?.noReadingReason ||
              editPayload?.disconnection?.meterReading?.noReadingReason,
          ),
          safetyConfirmed: editPayload?.disconnection?.safetyConfirmed || {
            answer: "",
            notes: "",
          },
        },

        media: filterExecutionMedia(editPayload?.media || []),
      };
    }

    return {
      id: instructionTrnId,
      instructionTrnId,
      sourceAstId: astDoc?.id || sourceAstId || "NAv",

      accessData: {
        access: {
          hasAccess: "yes",
          reason: "NAv",
          reasonSelect: makeEmptySelectWithOther(),
        },
      },

      ast: {
        astData: {
          astId: astDoc?.id || sourceAstId || "NAv",
          astNo: astData?.astNo || "NAv",
          astManufacturer: astData?.astManufacturer || "NAv",
          astName: astData?.astName || "NAv",
          meter: {
            type: meter?.type || "NAv",
            category: meter?.category || "NAv",
          },
        },
      },

      disconnection: {
        level: makeEmptySelectWithOther(),

        supplyDisconnected: {
          answer: "",
          notes: "",
        },

        meterReading: "",
        tokenReading: "",
        noReadingReason: makeEmptySelectWithOther(),

        safetyConfirmed: {
          answer: "",
          notes: "",
        },
      },

      assignment: {
        instructionSelect: instructionLocked
          ? normalizeInstructionValue(officeInstruction)
          : makeEmptySelectWithOther(),

        instruction: instructionLocked
          ? {
              code: officeInstruction?.code || "METER_DISCONNECTION",
              text: officeInstruction?.text || "",
              notes: officeInstruction?.notes || "",
              mediaRequired: officeInstruction?.mediaRequired === true,
            }
          : {
              code: "METER_DISCONNECTION",
              text: "",
              notes: "",
              mediaRequired: true,
            },

        targets: Array.isArray(action?.assignment?.targets)
          ? action.assignment.targets
          : [
              {
                type: "USER",
                id: agentUid,
                name: agentName,
              },
            ],

        acceptedRejectedAt: action?.assignment?.acceptedRejectedAt || null,
        acceptedRejectedUid: action?.assignment?.acceptedRejectedUid || null,
        acceptedRejectedUser: action?.assignment?.acceptedRejectedUser || null,
        rejectReason: action?.assignment?.rejectReason || "",

        cancelledAt: action?.assignment?.cancelledAt || null,
        cancelledByUid: action?.assignment?.cancelledByUid || null,
        cancelledByUser: action?.assignment?.cancelledByUser || null,
        cancelReason: action?.assignment?.cancelReason || "",
      },

      meterType,

      media: [],

      status: {
        state: astDoc?.status?.state || "UNKNOWN",
        id: astDoc?.status?.id || lmPcode || "NAv",
        detail: astDoc?.status?.detail || lmPcode || "NAv",
      },
    };
  }, [
    editQueueItem,
    instructionTrnId,
    sourceAstId,
    astDoc?.id,
    astData?.astNo,
    astData?.astManufacturer,
    astData?.astName,
    meter?.type,
    meter?.category,
    meterType,
    agentUid,
    agentName,
    lmPcode,
    astDoc?.status?.state,
    astDoc?.status?.id,
    astDoc?.status?.detail,
    officeInstruction,
    instructionLocked,
    action?.assignment?.targets,
    action?.assignment?.acceptedRejectedAt,
    action?.assignment?.acceptedRejectedUid,
    action?.assignment?.acceptedRejectedUser,
    action?.assignment?.rejectReason,
    action?.assignment?.cancelledAt,
    action?.assignment?.cancelledByUid,
    action?.assignment?.cancelledByUser,
    action?.assignment?.cancelReason,
  ]);

  const actionInit = useMemo(() => getInitialValues(), [getInitialValues]);

  const handleSubmitDisconnection = async (values) => {
    if (!instructionTrnId) {
      Alert.alert(
        "Missing Instruction",
        "This DCN execution form must be opened from an accepted WMS instruction.",
      );
      return;
    }

    if (!astDoc?.id) {
      Alert.alert("Error", "AST data not found.");
      return;
    }

    if (!isEligible) {
      Alert.alert("Not Eligible", "Only CONNECTED meters can be disconnected.");
      return;
    }

    try {
      setInProgress(true);

      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable;

      if (!isOnline) {
        setInProgress(false);

        Alert.alert(
          "Offline",
          "You are offline. Use SAVE to keep this DCN execution form locally, then submit when online.",
        );

        return;
      }

      const storage = getStorage();

      const syncedMedia = await Promise.all(
        filterExecutionMedia(values?.media || []).map(async (item) => {
          if (item.uri && !item.url) {
            const fileName = `${instructionTrnId}_${item.tag}_${Date.now()}.jpg`;
            const storageRef = ref(
              storage,
              `meters/lifecycle/disconnection/${fileName}`,
            );

            const response = await fetch(item.uri);
            const blob = await response.blob();

            await uploadBytes(storageRef, blob);

            const downloadUrl = await getDownloadURL(storageRef);

            const { uri, ...cleanItem } = item;

            return {
              ...cleanItem,
              url: downloadUrl,
            };
          }

          const { uri, ...cleanItem } = item || {};
          return cleanItem;
        }),
      );

      const cleanPayload = buildExecutionPayload(values, syncedMedia);

      const onMeterLifecycleTrnCallable = httpsCallable(
        functions,
        "onMeterLifecycleTrnCallable",
      );

      let result = null;

      try {
        const callableResult = await withSubmitTimeout(
          onMeterLifecycleTrnCallable(cleanPayload),
          DCN_SUBMIT_TIMEOUT_MS,
        );

        result = callableResult?.data || {};
      } catch (error) {
        if (error?.message === "SUBMISSION_TIMEOUT") {
          await saveDraftToQueue(
            values,
            "SAVED LOCALLY",
            "The submission took too long. The DCN form was saved locally only and was not confirmed by the backend.",
          );

          setInProgress(false);
          return;
        }

        setInProgress(false);

        Alert.alert(
          "Submission Failed",
          error?.message || "Meter disconnection submission failed.",
        );

        return;
      }

      if (!result?.success) {
        setInProgress(false);

        Alert.alert(
          "Submission Failed",
          result?.message || "Meter disconnection submission failed.",
        );

        return;
      }

      if (queueItemId) {
        await removeSubmissionQueueItem(queueItemId);
      }

      setInProgress(false);

      router.replace("/admin/operations/my-workorders");
      return;
    } catch (error) {
      console.error("Disconnection Submission Error:", error);
      Alert.alert("Error", error?.message || "Submission failed");
      setInProgress(false);
    }
  };

  function closeAfterExecutionOutcome(outcomeType) {
    setSubmitOutcome({
      visible: false,
      type: null,
      title: "",
      message: "",
      goBackOnContinue: true,
    });

    if (outcomeType === "savedLocally") {
      router.replace("/(tabs)/admin/operations/my-workorders");
      return;
    }

    router.replace("/(tabs)/admin/operations/my-workorders");
  }

  const confirmCancel = () => {
    Alert.alert(
      "Cancel Disconnection Form?",
      "This disconnection form has not been submitted. If you cancel now, the captured data will be lost unless you use SAVE.",
      [
        {
          text: "STAY",
          style: "cancel",
        },
        {
          text: "CANCEL FORM",
          style: "destructive",
          onPress: () => router.back(),
        },
      ],
    );
  };

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

  if (!instructionTrnId) {
    return (
      <ScrollView style={styles.container}>
        <Stack.Screen
          options={{
            title: "Disconnect Meter",
            headerTitleStyle: { fontSize: 14, fontWeight: "900" },
          }}
        />

        <Surface style={styles.notEligibleCard} elevation={2}>
          <MaterialCommunityIcons
            name="file-alert-outline"
            size={42}
            color="#ef4444"
          />

          <Text style={styles.notEligibleTitle}>Missing DCN Instruction</Text>

          <Text style={styles.notEligibleText}>
            DCN execution must be opened from an accepted WMS instruction.
          </Text>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>GO BACK</Text>
          </TouchableOpacity>
        </Surface>
      </ScrollView>
    );
  }

  if (!astDoc || initialEligible === null) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loaderText}>Loading meter...</Text>
      </View>
    );
  }

  if (initialEligible === false) {
    return (
      <ScrollView style={styles.container}>
        <Stack.Screen
          options={{
            title: "Disconnect Meter",
            headerTitleStyle: { fontSize: 14, fontWeight: "900" },
          }}
        />

        <Surface style={styles.notEligibleCard} elevation={2}>
          <MaterialCommunityIcons
            name="lock-alert-outline"
            size={42}
            color="#f59e0b"
          />

          <Text style={styles.notEligibleTitle}>
            Meter Not Eligible For Disconnection
          </Text>

          <Text style={styles.notEligibleText}>
            Only CONNECTED meters can be disconnected.
          </Text>

          <Divider style={{ width: "100%", marginVertical: 16 }} />

          <Text style={styles.summaryLine}>Status: {currentStatus}</Text>
          <Text style={styles.summaryLine}>Meter Type: {meterType}</Text>
          <Text style={styles.summaryLine}>Meter Kind: {meterKind}</Text>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>GO BACK</Text>
          </TouchableOpacity>
        </Surface>
      </ScrollView>
    );
  }

  return (
    <>
      <ScreenLock
        visible={inProgress || saveInProgress}
        title="DISCONNECTION"
        status={
          saveInProgress
            ? "Saving locally..."
            : "Securing lifecycle transaction..."
        }
      />

      <Formik
        initialValues={actionInit}
        onSubmit={handleSubmitDisconnection}
        validationSchema={DisconnectionSchema}
        enableReinitialize={true}
        validateOnMount={true}
        validateOnChange={true}
      >
        {({
          values,
          setFieldValue,
          handleSubmit,
          resetForm,
          validateForm,
          errors,
          isValid,
        }) => {
          const disconnectionErrors = errors?.disconnection || {};
          const assignmentErrors = errors?.assignment || {};
          const accessErrors = errors?.accessData?.access || {};
          const noAccess = isNoAccess(values);

          return (
            <ScrollView
              style={styles.container}
              contentContainerStyle={{ paddingBottom: 50 }}
            >
              <Stack.Screen
                options={{
                  title: `Disconnect ${meterNo}`,
                  headerTitleStyle: { fontSize: 14, fontWeight: "900" },
                  headerLeft: () => (
                    <TouchableOpacity
                      onPress={confirmCancel}
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
                      <Text style={styles.headerStatus}>{currentStatus}</Text>
                    </View>
                  ),
                }}
              />

              <Surface style={styles.card} elevation={1}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons
                    name="counter"
                    size={18}
                    color="#ef4444"
                  />
                  <Text style={styles.sectionTitle}>Meter Summary</Text>
                </View>

                <View style={styles.summaryGrid}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Instruction TRN</Text>
                    <Text style={styles.summaryValue}>{instructionTrnId}</Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Meter No</Text>
                    <Text style={styles.summaryValue}>{meterNo}</Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Manufacturer</Text>
                    <Text style={styles.summaryValue}>
                      {astData?.astManufacturer || "NAv"}
                    </Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Model</Text>
                    <Text style={styles.summaryValue}>
                      {astData?.astName || "NAv"}
                    </Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Meter Type</Text>
                    <Text style={styles.summaryValue}>{meterType}</Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Meter Kind</Text>
                    <Text style={styles.summaryValue}>{meterKind}</Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Current Status</Text>
                    <Text style={styles.summaryValue}>{currentStatus}</Text>
                  </View>
                </View>

                <Divider style={{ marginVertical: 12 }} />

                <View style={styles.addressRow}>
                  <MaterialCommunityIcons
                    name="map-marker-outline"
                    size={16}
                    color="#64748b"
                  />
                  <Text style={styles.addressText}>
                    ERF {erfNo} • {premiseAddress}
                  </Text>
                </View>
              </Surface>

              {instructionLocked ? (
                <OfficeInstructionSection
                  title="Disconnection Instruction"
                  icon="text-box-remove-outline"
                  color="#ef4444"
                  instruction={officeInstruction}
                  media={officeInstructionMedia}
                />
              ) : (
                <Surface style={styles.card} elevation={1}>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons
                      name="text-box-remove-outline"
                      size={18}
                      color="#ef4444"
                    />
                    <Text style={styles.sectionTitle}>
                      Disconnection Instruction
                    </Text>
                  </View>

                  <IrepsSelectWithOther
                    label="Disconnection Instruction"
                    placeholder="Select disconnection instruction"
                    options={disconnectionInstructionLookup.options}
                    includeOther={
                      disconnectionInstructionLookup.allowOther ?? true
                    }
                    otherCode={
                      disconnectionInstructionLookup.otherCode || "OTHER"
                    }
                    otherLabel={
                      disconnectionInstructionLookup.otherLabel || "Other"
                    }
                    loading={
                      disconnectionInstructionLookup.isLoading ||
                      disconnectionInstructionLookup.isFetching
                    }
                    value={values?.assignment?.instructionSelect}
                    onChange={(nextValue) => {
                      setFieldValue("assignment.instructionSelect", nextValue);
                      setFieldValue(
                        "assignment.instruction.text",
                        selectWithOtherToText(nextValue),
                      );
                    }}
                    errorText={
                      typeof assignmentErrors?.instructionSelect === "string"
                        ? assignmentErrors?.instructionSelect
                        : ""
                    }
                  />

                  <TextInput
                    mode="outlined"
                    label="Instruction Notes"
                    value={values?.assignment?.instruction?.notes || ""}
                    onChangeText={(text) =>
                      setFieldValue("assignment.instruction.notes", text)
                    }
                    multiline
                    numberOfLines={3}
                    style={styles.notesInput}
                  />
                </Surface>
              )}

              <AccessOutcomeCard
                value={values?.accessData?.access?.hasAccess || "yes"}
                setFieldValue={setFieldValue}
              />

              <Surface style={styles.card} elevation={1}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons
                    name="power-plug-off-outline"
                    size={18}
                    color="#ef4444"
                  />
                  <Text style={styles.sectionTitle}>
                    Disconnection Execution
                  </Text>
                </View>

                {noAccess ? (
                  <IrepsNoAccessSection
                    visible={true}
                    value={values?.accessData?.access?.reasonSelect}
                    onChange={(nextValue) => {
                      setFieldValue(
                        "accessData.access.reasonSelect",
                        nextValue,
                      );
                      setFieldValue(
                        "accessData.access.reason",
                        selectWithOtherToText(nextValue),
                      );
                    }}
                    mediaName="media"
                    mediaTag="noAccessPhoto"
                    agentName={agentName}
                    agentUid={agentUid}
                    fallbackGps={fallbackGps}
                    reasonErrorText={
                      typeof accessErrors?.reasonSelect === "string"
                        ? accessErrors.reasonSelect
                        : ""
                    }
                    mediaErrorText={
                      typeof errors?.media === "string" &&
                      errors.media.toLowerCase().includes("access")
                        ? errors.media
                        : ""
                    }
                  />
                ) : (
                  <>
                    <Surface style={styles.questionCard} elevation={1}>
                      <View style={styles.questionHeader}>
                        <Text style={styles.questionTitle}>
                          Disconnection Level
                        </Text>
                        <Text style={styles.questionDescription}>
                          Select the physical level of disconnection completed
                          on site.
                        </Text>
                      </View>

                      <IrepsSelectWithOther
                        label="Level"
                        placeholder="Select disconnection level"
                        options={levelLookup.options}
                        includeOther={false}
                        loading={
                          levelLookup.isLoading || levelLookup.isFetching
                        }
                        value={values?.disconnection?.level}
                        onChange={(nextValue) =>
                          setFieldValue("disconnection.level", nextValue)
                        }
                        errorText={
                          typeof disconnectionErrors?.level === "string"
                            ? disconnectionErrors.level
                            : ""
                        }
                      />
                    </Surface>

                    <YesNoQuestion
                      title="Supply disconnected"
                      description="Confirm that the supply was disconnected according to the selected level."
                      value={values?.disconnection?.supplyDisconnected?.answer}
                      notes={values?.disconnection?.supplyDisconnected?.notes}
                      answerPath="disconnection.supplyDisconnected.answer"
                      notesPath="disconnection.supplyDisconnected.notes"
                      setFieldValue={setFieldValue}
                      errorText={
                        disconnectionErrors?.supplyDisconnected?.answer ||
                        disconnectionErrors?.supplyDisconnected?.notes
                      }
                    >
                      <IrepsMedia
                        name="media"
                        tag="disconnectionLevelEvidence"
                        agentName={agentName}
                        agentUid={agentUid}
                        fallbackGps={fallbackGps}
                        required={
                          values?.disconnection?.supplyDisconnected?.answer ===
                          "yes"
                        }
                      />
                    </YesNoQuestion>

                    <Surface style={styles.questionCard} elevation={1}>
                      <View style={styles.questionHeader}>
                        <Text style={styles.questionTitle}>
                          {isPrepaidReading ? "Token reading" : "Meter reading"}
                        </Text>

                        <Text style={styles.questionDescription}>
                          {isPrepaidReading
                            ? "Capture the prepaid token/register reading at disconnection. If unavailable, provide the reason."
                            : "Capture the meter reading at disconnection. If unavailable, provide the reason."}
                        </Text>
                      </View>

                      {isPrepaidReading ? (
                        <>
                          <TextInput
                            mode="outlined"
                            label="Token Reading"
                            value={values?.disconnection?.tokenReading}
                            onChangeText={(text) =>
                              setFieldValue(
                                "disconnection.tokenReading",
                                text.replace(/[^\d.]/g, ""),
                              )
                            }
                            keyboardType="numeric"
                            style={styles.readingInput}
                          />

                          <View style={styles.questionEvidenceSlot}>
                            <IrepsMedia
                              name="media"
                              tag="tokenReadingPhoto"
                              agentName={agentName}
                              agentUid={agentUid}
                              fallbackGps={fallbackGps}
                              required={
                                !!String(
                                  values?.disconnection?.tokenReading || "",
                                ).trim()
                              }
                            />
                          </View>
                        </>
                      ) : (
                        <>
                          <TextInput
                            mode="outlined"
                            label="Meter Reading"
                            value={values?.disconnection?.meterReading}
                            onChangeText={(text) =>
                              setFieldValue(
                                "disconnection.meterReading",
                                text.replace(/[^\d.]/g, ""),
                              )
                            }
                            keyboardType="numeric"
                            style={styles.readingInput}
                          />

                          <View style={styles.questionEvidenceSlot}>
                            <IrepsMedia
                              name="media"
                              tag="disconnectionMeterReadingEvidence"
                              agentName={agentName}
                              agentUid={agentUid}
                              fallbackGps={fallbackGps}
                              required={
                                !!String(
                                  values?.disconnection?.meterReading || "",
                                ).trim()
                              }
                            />
                          </View>
                        </>
                      )}

                      <IrepsSelectWithOther
                        label="No Reading Reason"
                        placeholder="Select reason"
                        options={noReadingReasonLookup.options}
                        includeOther={noReadingReasonLookup.allowOther ?? true}
                        otherCode={noReadingReasonLookup.otherCode || "OTHER"}
                        otherLabel={noReadingReasonLookup.otherLabel || "Other"}
                        loading={
                          noReadingReasonLookup.isLoading ||
                          noReadingReasonLookup.isFetching
                        }
                        value={values?.disconnection?.noReadingReason}
                        onChange={(nextValue) =>
                          setFieldValue(
                            "disconnection.noReadingReason",
                            nextValue,
                          )
                        }
                        errorText={
                          typeof disconnectionErrors?.noReadingReason ===
                          "string"
                            ? disconnectionErrors.noReadingReason
                            : ""
                        }
                      />
                    </Surface>

                    <YesNoQuestion
                      title="Safety confirmed"
                      description="Confirm that the disconnection was left safe after the work was done."
                      value={values?.disconnection?.safetyConfirmed?.answer}
                      notes={values?.disconnection?.safetyConfirmed?.notes}
                      answerPath="disconnection.safetyConfirmed.answer"
                      notesPath="disconnection.safetyConfirmed.notes"
                      setFieldValue={setFieldValue}
                      errorText={
                        disconnectionErrors?.safetyConfirmed?.answer ||
                        disconnectionErrors?.safetyConfirmed?.notes
                      }
                    >
                      <IrepsMedia
                        name="media"
                        tag="safetyEvidence"
                        agentName={agentName}
                        agentUid={agentUid}
                        fallbackGps={fallbackGps}
                        required={
                          values?.disconnection?.safetyConfirmed?.answer ===
                          "yes"
                        }
                      />
                    </YesNoQuestion>
                  </>
                )}

                {typeof errors?.media === "string" && (
                  <Text style={styles.errorText}>{errors.media}</Text>
                )}
              </Surface>

              <IrepsFormActions
                resetLabel="RESET"
                saveLabel="SAVE"
                submitLabel="SUBMIT DISCONNECTION"
                canSave={true}
                canSubmit={isValid}
                loading={inProgress}
                saveLoading={saveInProgress}
                onReset={() => {
                  Alert.alert(
                    "Reset Form?",
                    "This will clear your changes and return the form to the state it had when it first loaded.",
                    [
                      {
                        text: "KEEP EDITING",
                        style: "cancel",
                      },
                      {
                        text: "RESET",
                        style: "destructive",
                        onPress: () => {
                          resetForm();

                          setTimeout(() => {
                            validateForm();
                          }, 0);
                        },
                      },
                    ],
                  );
                }}
                onSave={() => handleSaveDisconnection(values)}
                onSubmit={handleSubmit}
                disabledReason="Complete all required fields before submitting."
              />

              <Portal>
                <Modal
                  visible={submitOutcome.visible}
                  dismissable={false}
                  contentContainerStyle={[
                    styles.successModal,
                    submitOutcome.type === "disconnectionFailed" &&
                      styles.failedOutcomeModal,
                    submitOutcome.type === "noAccess" &&
                      styles.noAccessOutcomeModal,
                  ]}
                >
                  <View style={styles.successContent}>
                    <View
                      style={[
                        styles.successIconCircle,
                        submitOutcome.type === "disconnectionFailed" &&
                          styles.failedIconCircle,
                        submitOutcome.type === "savedLocally" &&
                          styles.savedLocallyIconCircle,
                        submitOutcome.type === "noAccess" &&
                          styles.noAccessIconCircle,
                      ]}
                    >
                      <Feather
                        name={
                          submitOutcome.type === "disconnectionFailed"
                            ? "alert-triangle"
                            : submitOutcome.type === "savedLocally"
                              ? "download-cloud"
                              : submitOutcome.type === "noAccess"
                                ? "slash"
                                : "check"
                        }
                        size={46}
                        color="#fff"
                      />
                    </View>

                    <Text
                      style={[
                        styles.successTitle,
                        submitOutcome.type === "disconnectionFailed" &&
                          styles.failedOutcomeTitle,
                        submitOutcome.type === "noAccess" &&
                          styles.noAccessOutcomeTitle,
                      ]}
                    >
                      {submitOutcome.title}
                    </Text>

                    <Text style={styles.outcomeMessage}>
                      {submitOutcome.message}
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.continueBtn,
                        submitOutcome.type === "disconnectionFailed" &&
                          styles.failedContinueBtn,
                        submitOutcome.type === "noAccess" &&
                          styles.noAccessContinueBtn,
                      ]}
                      onPress={() => {
                        closeAfterExecutionOutcome(submitOutcome.type);
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
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },

  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F8FAFC",
  },

  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
    fontWeight: "700",
    textAlign: "center",
  },

  headerStatus: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "900",
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    margin: 12,
    padding: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1E293B",
    textTransform: "uppercase",
  },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  summaryItem: {
    width: "48%",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  summaryLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 4,
  },

  summaryValue: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "800",
  },

  addressRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  addressText: {
    marginLeft: 6,
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },

  accessHelpText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginBottom: 12,
  },

  accessChoiceRow: {
    flexDirection: "row",
    gap: 10,
  },

  accessChoice: {
    flex: 1,
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },

  accessChoiceYes: {
    borderColor: "#22C55E",
    backgroundColor: "#F0FDF4",
  },

  accessChoiceNo: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },

  accessChoiceTextWrap: {
    flex: 1,
  },

  accessChoiceTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0F172A",
  },

  accessChoiceSub: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    marginTop: 2,
  },

  questionCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  questionHeader: {
    marginBottom: 8,
  },

  questionTitle: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "900",
  },

  questionDescription: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 3,
  },

  radioRow: {
    flexDirection: "row",
    gap: 10,
  },

  radioChoice: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },

  radioChoiceYes: {
    borderColor: "#22C55E",
    backgroundColor: "#F0FDF4",
  },

  radioChoiceNo: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },

  radioText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#334155",
  },

  notesInput: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
  },

  readingInput: {
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
  },

  questionEvidenceSlot: {
    marginTop: 10,
  },

  errorText: {
    color: "#DC2626",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6,
  },

  readOnlyBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },

  readOnlyLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#64748B",
    textTransform: "uppercase",
  },

  readOnlyValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 18,
  },

  readOnlyMediaList: {
    gap: 8,
  },

  mediaReadOnlyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 9,
  },

  mediaReadOnlyText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },

  mediaReadOnlyMeta: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
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
    backgroundColor: "#22C55E",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },

  savedLocallyIconCircle: {
    backgroundColor: "#2563EB",
  },

  noAccessIconCircle: {
    backgroundColor: "#DC2626",
  },

  successTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 1,
    textAlign: "center",
  },

  continueBtn: {
    marginTop: 22,
    backgroundColor: "#2563EB",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },

  continueBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  notEligibleCard: {
    margin: 18,
    padding: 22,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },

  notEligibleTitle: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },

  notEligibleText: {
    marginTop: 8,
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },

  summaryLine: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "800",
    marginVertical: 2,
  },

  backButton: {
    marginTop: 20,
    backgroundColor: "#2563EB",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },

  backButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  failedOutcomeModal: {
    borderWidth: 2,
    borderColor: "#F97316",
  },

  noAccessOutcomeModal: {
    borderWidth: 2,
    borderColor: "#DC2626",
  },

  failedIconCircle: {
    backgroundColor: "#F97316",
  },

  failedOutcomeTitle: {
    color: "#9A3412",
  },

  noAccessOutcomeTitle: {
    color: "#991B1B",
  },

  outcomeMessage: {
    fontSize: 13,
    color: "#334155",
    marginTop: 12,
    textAlign: "left",
    lineHeight: 19,
    width: "100%",
    fontWeight: "600",
  },

  failedContinueBtn: {
    backgroundColor: "#F97316",
  },

  noAccessContinueBtn: {
    backgroundColor: "#DC2626",
  },

  mediaReadOnlyThumbWrap: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  mediaReadOnlyThumb: {
    width: "100%",
    height: "100%",
  },

  mediaReadOnlyMain: {
    flex: 1,
    minWidth: 0,
  },

  mediaReadOnlyHint: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "900",
    color: "#2563EB",
  },

  instructionMediaModal: {
    backgroundColor: "#FFFFFF",
    margin: 18,
    borderRadius: 20,
    padding: 14,
    maxHeight: "88%",
  },

  instructionMediaModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },

  instructionMediaModalIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },

  instructionMediaModalTitleWrap: {
    flex: 1,
  },

  instructionMediaModalTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },

  instructionMediaModalSub: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },

  instructionMediaModalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  instructionMediaPreviewFrame: {
    height: 330,
    borderRadius: 16,
    backgroundColor: "#020617",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  instructionMediaPreviewImage: {
    width: "100%",
    height: "100%",
  },

  instructionMediaMetaBox: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 9,
  },

  instructionMediaMetaText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 2,
  },

  openInstructionMediaButton: {
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },

  openInstructionMediaButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  instructionMediaEmptyBox: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
