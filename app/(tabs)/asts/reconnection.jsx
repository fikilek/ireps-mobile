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

import { IrepsFieldCommentSection } from "../../../components/forms/IrepsFieldCommentSection";
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

const RCN_SUBMIT_TIMEOUT_MS = 15000;

const EXECUTION_MEDIA_TAGS = [
  "instructionMedia",
  "reconnectionEvidence",
  "noAccessPhoto",
  "fieldCommentPhoto",
  "fieldCommentVoice",
  "fieldCommentVideo",
];

const FIELD_RECONNECTION_INSTRUCTION_OPTIONS = [
  {
    code: "METER_RECONNECTION",
    label:
      "Reconnect meter supply and confirm the supply has been made good again",
  },
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

function normalizeNoAccessReasonValue(value, reasonText = "") {
  if (value?.code !== undefined || value?.otherText !== undefined) {
    return normalizeSelectWithOtherValue(value);
  }

  if (reasonText && reasonText !== "NAv") {
    return textToOtherSelectValue(reasonText);
  }

  return makeEmptySelectWithOther();
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

function getMediaExtension(mediaItem = {}) {
  const type = String(mediaItem?.type || "")
    .trim()
    .toUpperCase();

  if (type === "VIDEO") return "mp4";
  if (type === "AUDIO" || type === "VOICE") return "m4a";
  if (type === "IMAGE" || type === "PHOTO") return "jpg";

  const uri = String(mediaItem?.uri || "").toLowerCase();

  if (uri.includes(".mp4")) return "mp4";
  if (uri.includes(".mov")) return "mov";
  if (uri.includes(".m4a")) return "m4a";
  if (uri.includes(".mp3")) return "mp3";
  if (uri.includes(".wav")) return "wav";
  if (uri.includes(".aac")) return "aac";
  if (uri.includes(".png")) return "png";
  if (uri.includes(".webp")) return "webp";

  return "jpg";
}

function buildBackendReconnectionPayload(
  reconnection = {},
  { noAccess = false } = {},
) {
  if (noAccess) {
    return {
      supplyReconnected: {
        answer: "",
        notes: "",
      },
    };
  }

  return {
    supplyReconnected: {
      answer: reconnection?.supplyReconnected?.answer || "",
      notes: reconnection?.supplyReconnected?.notes || "",
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
        "METER_RECONNECTION",
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

const ReconnectionSchema = object()
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

    reconnection: object().shape({
      supplyReconnected: object().shape({
        answer: string().notRequired(),
        notes: string().notRequired(),
      }),
    }),

    fieldComment: object().shape({
      text: string().notRequired(),
    }),

    media: array().of(object()),
  })
  .test("rcn-v01-validation", "RCN validation failed", function (values = {}) {
    const access = values?.accessData?.access || {};
    const reconnection = values?.reconnection || {};
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

    if (!["yes", "no"].includes(reconnection?.supplyReconnected?.answer)) {
      return this.createError({
        path: "reconnection.supplyReconnected.answer",
        message: "Supply reconnected answer is required",
      });
    }

    if (reconnection?.supplyReconnected?.answer !== "yes") {
      return this.createError({
        path: "reconnection.supplyReconnected.answer",
        message: "Supply must be confirmed as reconnected before submit",
      });
    }

    if (!hasMediaTag(media, "reconnectionEvidence")) {
      return this.createError({
        path: "media",
        message: "Reconnection evidence required",
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
                Continue with RCN checks
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

export default function FormMeterReconnection() {
  const {
    astId: astIdRaw,
    sourceAstId: sourceAstIdRaw,
    premiseId: premiseIdRaw,
    instructionTrnId: instructionTrnIdRaw,
    trnId: trnIdRaw,
    action: actionRaw,
    queueItemId: queueItemIdRaw,
    returnTo: returnToRaw,
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
  const routeReturnTo = Array.isArray(returnToRaw)
    ? returnToRaw[0]
    : returnToRaw;

  const action = useMemo(() => {
    try {
      return actionRaw ? JSON.parse(actionRaw) : {};
    } catch (_error) {
      return {};
    }
  }, [actionRaw]);

  const instructionTrnIdCandidate = readFirstString(
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

  const router = useRouter();
  const { all } = useWarehouse();
  const { profile, user } = useAuth();
  const { data: allServiceProviders = [] } = useGetServiceProvidersQuery();

  const [editQueueItem, setEditQueueItem] = useState(undefined);

  const actionOriginChannel = String(action?.origin?.channel || "")
    .trim()
    .toUpperCase();
  const actionOriginSource = String(action?.origin?.source || "")
    .trim()
    .toUpperCase();
  const queuedOriginChannel = String(
    editQueueItem?.payload?.origin?.channel || "",
  )
    .trim()
    .toUpperCase();
  const queuedOriginSource = String(editQueueItem?.payload?.origin?.source || "")
    .trim()
    .toUpperCase();

  const isFieldOrigin =
    (actionOriginChannel === "FIELD" && actionOriginSource === "AST_ITEM") ||
    (queuedOriginChannel === "FIELD" && queuedOriginSource === "AST_ITEM");

  const instructionTrnId = isFieldOrigin ? "" : instructionTrnIdCandidate;
  const returnTo = readFirstString(routeReturnTo, action?.returnTo);

  const instructionLocked = useMemo(() => {
    return Boolean(instructionTrnId) || isLifecycleInstructionLocked(action);
  }, [action, instructionTrnId]);

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

  function getLifecycleReturnRoute() {
    return readFirstString(
      returnTo,
      queueItemId ? "/(tabs)/admin/storage/forms-submission-queue" : "",
      instructionTrnId ? "/(tabs)/admin/operations/my-workorders" : "",
      "/(tabs)/asts",
    );
  }

  function navigateAfterReconnection() {
    router.replace(getLifecycleReturnRoute());
  }

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

    setInitialEligible(firstStatus === "DISCONNECTED");
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

  const fieldOriginatedTrnId = useMemo(() => {
    if (instructionTrnId) return instructionTrnId;
    if (!isFieldOrigin) return "";

    const cleanMeterType = String(meterType || "")
      .trim()
      .toLowerCase();

    const serviceCode =
      cleanMeterType === "electricity" || cleanMeterType === "elec"
        ? "ELC"
        : cleanMeterType === "water" || cleanMeterType === "wtr"
          ? "WTR"
          : "MTR";

    const safeWardPcode = String(wardPcode || "WARD")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .toUpperCase();

    const safeErfNo = String(erfNo || "ERF")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .toUpperCase();

    return `TRN_MRCN_${Date.now()}_${serviceCode}_${safeWardPcode}_${safeErfNo}`;
  }, [instructionTrnId, isFieldOrigin, meterType, wardPcode, erfNo]);

  function buildTrnSystemFields() {
    return {
      erfId: astDoc?.accessData?.erfId || premise?.erfId || "NAv",
      erfNo: astDoc?.accessData?.erfNo || premise?.erfNo || "NAv",
      trnType: "METER_RECONNECTION",

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
    const resolvedTrnId = readFirstString(
      instructionTrnId,
      values?.id,
      fieldOriginatedTrnId,
    );

    return {
      trnType: "METER_RECONNECTION",
      trnId: resolvedTrnId || "NAv",
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

    const resolvedTrnId = readFirstString(
      instructionTrnId,
      values?.id,
      fieldOriginatedTrnId,
    );

    return removeUndefined({
      id: resolvedTrnId,
      instructionTrnId: instructionTrnId || "",
      sourceAstId: astDoc?.id || sourceAstId || "NAv",

      trnType: "METER_RECONNECTION",

      accessData: {
        ...baseSystemFields,
        access: {
          hasAccess: values?.accessData?.access?.hasAccess || "yes",
          reason: noAccessReason || "NAv",
          reasonSelect: values?.accessData?.access?.reasonSelect,
        },
      },

      ast: values.ast,

      reconnection: buildBackendReconnectionPayload(values.reconnection, {
        noAccess,
      }),

      fieldComment: {
        text: String(values?.fieldComment?.text || "").trim(),
      },

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

      origin: isFieldOrigin
        ? {
            channel: "FIELD",
            source: "AST_ITEM",
            parentInspectionTrnId: null,
          }
        : {
            channel: "OFFICE",
            source: "WMS",
            parentInspectionTrnId:
              values?.origin?.parentInspectionTrnId ||
              action?.origin?.parentInspectionTrnId ||
              null,
          },

      workflow: isFieldOrigin
        ? {
            state: "COMPLETED",
            requiresAcceptance: false,
          }
        : values?.workflow,
    });
  }

  function buildReconnectionFailureMessage(values, result) {
    const noAccess = isNoAccess(values);

    if (noAccess) {
      return [
        "The RCN was completed as NO ACCESS.",
        "",
        "Result:",
        "• The field attempt was completed.",
        "• The meter was not moved to CONNECTED.",
        "",
        `AST status: ${result?.astStatusAfter || currentStatus}`,
      ].join("\n");
    }

    return [
      "The reconnection TRN was submitted, but the meter was not moved to CONNECTED.",
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
            trnId: cleanPayload?.id || instructionTrnId || "NAv",
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
        formType: "METER_RECONNECTION",
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
        "Failed to save reconnection draft locally.",
      );
      return false;
    }

    setSubmitOutcome({
      visible: true,
      type: "savedLocally",
      title: messageTitle || "SAVED LOCALLY",
      message:
        messageBody ||
        "This RECONNECTION execution form was saved locally only. No backend update was made.",
      goBackOnContinue: true,
    });

    return true;
  }

  async function handleSaveReconnection(values) {
    try {
      setSaveInProgress(true);

      await saveDraftToQueue(
        values,
        "SAVED LOCALLY",
        "This RCN execution form was saved locally only. It was not submitted and no backend update was made.",
      );

      setSaveInProgress(false);
    } catch (error) {
      console.log("handleSaveReconnection--error", error);
      setSaveInProgress(false);

      Alert.alert(
        "Save Failed",
        error?.message || "Failed to save this RCN form locally.",
      );
    }
  }

  const getInitialValues = useCallback(() => {
    const editPayload = editQueueItem?.payload || null;

    if (editPayload) {
      const { reconnection: _reconnection, ...cleanEditPayload } =
        editPayload || {};
      const editReconnection = editPayload?.reconnection || {};

      return {
        ...cleanEditPayload,
        id:
          instructionTrnId || editPayload?.id || fieldOriginatedTrnId || "NAv",
        instructionTrnId: isFieldOrigin
          ? ""
          : instructionTrnId || editPayload?.instructionTrnId || "",
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

        reconnection: {
          supplyReconnected: editReconnection?.supplyReconnected || {
            answer: "",
            notes: "",
          },
        },

        fieldComment: {
          text: String(editPayload?.fieldComment?.text || ""),
        },

        media: filterExecutionMedia(editPayload?.media || []),
      };
    }

    return {
      id: instructionTrnId || fieldOriginatedTrnId,
      instructionTrnId: instructionTrnId || "",
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

      reconnection: {
        supplyReconnected: {
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
              code: officeInstruction?.code || "METER_RECONNECTION",
              text: officeInstruction?.text || "",
              notes: officeInstruction?.notes || "",
              mediaRequired: officeInstruction?.mediaRequired === true,
            }
          : {
              code: "METER_RECONNECTION",
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

      fieldComment: {
        text: "",
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
    fieldOriginatedTrnId,
    isFieldOrigin,
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

  const handleSubmitReconnection = async (values) => {
    if (!instructionTrnId && !isFieldOrigin) {
      Alert.alert(
        "Missing Instruction",
        "This RCN execution form must be opened from an accepted WMS instruction.",
      );
      return;
    }

    if (!astDoc?.id) {
      Alert.alert("Error", "AST data not found.");
      return;
    }

    if (!isEligible) {
      Alert.alert(
        "Not Eligible",
        "Only DISCONNECTED meters can be reconnected.",
      );
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
          "You are offline. Use SAVE to keep this RCN execution form locally, then submit when online.",
        );

        return;
      }

      const storage = getStorage();
      const uploadTrnId = readFirstString(
        instructionTrnId,
        values?.id,
        fieldOriginatedTrnId,
      );

      const syncedMedia = await Promise.all(
        filterExecutionMedia(values?.media || []).map(async (item) => {
          if (item.uri && !item.url) {
            const extension = getMediaExtension(item);
            const fileName =
              `${uploadTrnId}_${item.tag}_${Date.now()}.${extension}`;
            const storageRef = ref(
              storage,
              `meters/lifecycle/reconnection/${fileName}`,
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
          RCN_SUBMIT_TIMEOUT_MS,
        );

        result = callableResult?.data || {};
      } catch (error) {
        if (error?.message === "SUBMISSION_TIMEOUT") {
          await saveDraftToQueue(
            values,
            "SAVED LOCALLY",
            "The submission took too long. The RCN form was saved locally only and was not confirmed by the backend.",
          );

          setInProgress(false);
          return;
        }

        setInProgress(false);

        Alert.alert(
          "Submission Failed",
          error?.message || "Meter reconnection submission failed.",
        );

        return;
      }

      if (!result?.success) {
        setInProgress(false);

        Alert.alert(
          "Submission Failed",
          result?.message || "Meter reconnection submission failed.",
        );

        return;
      }

      if (queueItemId) {
        await removeSubmissionQueueItem(queueItemId);
      }

      setInProgress(false);

      navigateAfterReconnection();
      return;
    } catch (error) {
      console.error("ReconnectionSubmission Error:", error);
      Alert.alert("Error", error?.message || "Submission failed");
      setInProgress(false);
    }
  };

  function closeAfterExecutionOutcome() {
    setSubmitOutcome({
      visible: false,
      type: null,
      title: "",
      message: "",
      goBackOnContinue: true,
    });

    navigateAfterReconnection();
  }

  const confirmCancel = () => {
    Alert.alert(
      "Cancel Reconnection Form?",
      "This reconnection form has not been submitted. If you cancel now, the captured data will be lost unless you use SAVE.",
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

  if (!instructionTrnId && !isFieldOrigin) {
    return (
      <ScrollView style={styles.container}>
        <Stack.Screen
          options={{
            title: "Reconnect Meter",
            headerTitleStyle: { fontSize: 14, fontWeight: "900" },
          }}
        />

        <Surface style={styles.notEligibleCard} elevation={2}>
          <MaterialCommunityIcons
            name="file-alert-outline"
            size={42}
            color="#ef4444"
          />

          <Text style={styles.notEligibleTitle}>
            Missing RECONNECTION Instruction
          </Text>

          <Text style={styles.notEligibleText}>
            RECONNECTION execution must be opened from an accepted WMS
            instruction.
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
            title: "Reconnect Meter",
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
            Meter Not Eligible For Reconnection
          </Text>

          <Text style={styles.notEligibleText}>
            Only DISCONNECTED meters can be reconnected.
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
        title="RECONNECTION"
        status={
          saveInProgress
            ? "Saving locally..."
            : "Securing lifecycle transaction..."
        }
      />

      <Formik
        initialValues={actionInit}
        onSubmit={handleSubmitReconnection}
        validationSchema={ReconnectionSchema}
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
          const reconnectionErrors = errors?.reconnection || {};
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
                  title: `Reconnect ${meterNo}`,
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
                    <Text style={styles.summaryValue}>
                      {instructionTrnId || fieldOriginatedTrnId || "FIELD TRN"}
                    </Text>
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
                  title="Reconnection Instruction"
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
                      Reconnection Instruction
                    </Text>
                  </View>

                  <IrepsSelectWithOther
                    label="Reconnection Instruction"
                    placeholder="Select reconnection instruction"
                    options={FIELD_RECONNECTION_INSTRUCTION_OPTIONS}
                    includeOther={true}
                    otherCode="OTHER"
                    otherLabel="Other"
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

                  <View style={styles.questionEvidenceSlot}>
                    <Text style={styles.questionTitle}>Instruction Photo</Text>
                    <Text style={styles.questionDescription}>
                      Optional. Capture the written instruction if available.
                    </Text>
                    <IrepsMedia
                      name="media"
                      tag="instructionMedia"
                      agentName={agentName}
                      agentUid={agentUid}
                      fallbackGps={fallbackGps}
                      required={false}
                    />
                  </View>
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
                    Reconnection Execution
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
                    <YesNoQuestion
                      title="Supply reconnected"
                      description="Confirm that the supply was reconnected and made safe for use."
                      value={values?.reconnection?.supplyReconnected?.answer}
                      notes={values?.reconnection?.supplyReconnected?.notes}
                      answerPath="reconnection.supplyReconnected.answer"
                      notesPath="reconnection.supplyReconnected.notes"
                      setFieldValue={setFieldValue}
                      errorText={
                        reconnectionErrors?.supplyReconnected?.answer ||
                        reconnectionErrors?.supplyReconnected?.notes
                      }
                    >
                      <IrepsMedia
                        name="media"
                        tag="reconnectionEvidence"
                        agentName={agentName}
                        agentUid={agentUid}
                        fallbackGps={fallbackGps}
                        required={
                          values?.reconnection?.supplyReconnected?.answer ===
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

              <IrepsFieldCommentSection
                agentName={agentName}
                agentUid={agentUid}
                fallbackGps={fallbackGps}
                disabled={inProgress || saveInProgress}
              />

              <IrepsFormActions
                resetLabel="RESET"
                saveLabel="SAVE"
                submitLabel="SUBMIT RECONNECTION"
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
                onSave={() => handleSaveReconnection(values)}
                onSubmit={handleSubmit}
                disabledReason="Complete all required fields before submitting."
              />

              <Portal>
                <Modal
                  visible={submitOutcome.visible}
                  dismissable={false}
                  contentContainerStyle={[
                    styles.successModal,
                    submitOutcome.type === "reconnectionFailed" &&
                      styles.failedOutcomeModal,
                    submitOutcome.type === "noAccess" &&
                      styles.noAccessOutcomeModal,
                  ]}
                >
                  <View style={styles.successContent}>
                    <View
                      style={[
                        styles.successIconCircle,
                        submitOutcome.type === "reconnectionFailed" &&
                          styles.failedIconCircle,
                        submitOutcome.type === "savedLocally" &&
                          styles.savedLocallyIconCircle,
                        submitOutcome.type === "noAccess" &&
                          styles.noAccessIconCircle,
                      ]}
                    >
                      <Feather
                        name={
                          submitOutcome.type === "reconnectionFailed"
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
                        submitOutcome.type === "reconnectionFailed" &&
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
                        submitOutcome.type === "reconnectionFailed" &&
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
