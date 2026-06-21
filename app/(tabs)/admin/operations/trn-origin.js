import { MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ActivityIndicator } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import IrepsInstructionMedia from "../../../../components/IrepsInstructionMedia";
import IrepsSelectWithOther, {
  isSelectWithOtherFilled,
  makeSelectWithOtherValue,
  selectWithOtherToText,
} from "../../../../components/IrepsSelectWithOther";
import { useGeo } from "../../../../src/context/GeoContext";
import { useAuth } from "../../../../src/hooks/useAuth";
import { useIrepsLookupOptions } from "../../../../src/hooks/useIrepsLookupOptions";
import { useCreateLifecycleInstructionMutation } from "../../../../src/redux/lifecycleInstructionApi";
import { useGetServiceProvidersQuery } from "../../../../src/redux/spApi";
import { useGetUsersQuery } from "../../../../src/redux/usersApi";
import { addSubmissionQueueItem } from "../../../../src/utils/submissionQueue";

const LCT_TYPES = {
  METER_INSPECTION: {
    short: "INSP",
    title: "Meter Inspection",
    prefix: "TRN_MINSP",
  },
  METER_DISCONNECTION: {
    short: "DCN",
    title: "Meter Disconnection",
    prefix: "TRN_MDCN",
  },
  METER_RECONNECTION: {
    short: "RCN",
    title: "Meter Reconnection",
    prefix: "TRN_MRCN",
  },
  METER_REMOVAL: {
    short: "REM",
    title: "Meter Removal",
    prefix: "TRN_MREM",
  },
  METER_READING: {
    short: "MREAD",
    title: "Meter Reading",
    prefix: "TRN_MREAD",
  },
};

const INSTRUCTION_LOOKUP_KEYS = {
  METER_INSPECTION: "METER_INSPECTION_INSTRUCTION",
  METER_DISCONNECTION: "METER_DISCONNECTION_INSTRUCTION",
  METER_RECONNECTION: "METER_RECONNECTION_INSTRUCTION",
  METER_REMOVAL: "METER_REMOVAL_INSTRUCTION",
  METER_READING: "METER_READING_INSTRUCTION",
};

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeLower(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function safeParseJson(value, fallback = null) {
  try {
    if (!value) return fallback;
    if (typeof value !== "string") return value;
    return JSON.parse(decodeURIComponent(value));
  } catch {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
}

function safeClone(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (item === undefined ? null : item)),
  );
}

function getDisplayName(user) {
  const full = `${user?.profile?.name || ""} ${user?.profile?.surname || ""}`
    .trim()
    .replace(/\s+/g, " ");

  return (
    user?.profile?.displayName ||
    full ||
    user?.profile?.email ||
    user?.auth?.email ||
    user?.uid ||
    "NAv"
  );
}

function getUserRole(user) {
  return String(user?.employment?.role || "GST").trim();
}

function getUserSpId(user) {
  return String(user?.employment?.serviceProvider?.id || "").trim();
}

function getUserSpName(user) {
  return String(user?.employment?.serviceProvider?.name || "NAv").trim();
}

function serviceProviderLooksMnc(sp = {}) {
  const clients = Array.isArray(sp?.clients) ? sp.clients : [];

  return clients.some(
    (client) =>
      normalizeUpper(client?.clientType) === "LM" &&
      normalizeUpper(client?.relationshipType) === "MNC",
  );
}

function getParentMncId(sp = {}) {
  const clients = Array.isArray(sp?.clients) ? sp.clients : [];

  const parent = clients.find(
    (client) =>
      normalizeUpper(client?.clientType) === "SP" &&
      normalizeUpper(client?.relationshipType) === "SUBC",
  );

  return parent?.id || null;
}

function buildMncSubcMap(serviceProviders = []) {
  const map = {};

  serviceProviders.forEach((sp) => {
    if (!sp?.id) return;

    if (serviceProviderLooksMnc(sp)) {
      map[sp.id] = {
        mncId: sp.id,
        subcIds: [],
      };
    }
  });

  serviceProviders.forEach((sp) => {
    if (!sp?.id) return;

    const parentMncId = getParentMncId(sp);

    if (parentMncId && map[parentMncId]) {
      map[parentMncId].subcIds.push(sp.id);
    }
  });

  return map;
}

function getAllowedServiceProviderIds({ profile, serviceProviders = [] }) {
  const userSpId = profile?.employment?.serviceProvider?.id || null;
  if (!userSpId) return [];

  const userSp = serviceProviders.find((sp) => sp?.id === userSpId);
  if (!userSp) return [userSpId];

  const mncSubcMap = buildMncSubcMap(serviceProviders);

  if (serviceProviderLooksMnc(userSp)) {
    return [userSpId, ...(mncSubcMap[userSpId]?.subcIds || [])].filter(Boolean);
  }

  const parentMncId = getParentMncId(userSp);

  if (parentMncId) {
    return [parentMncId, ...(mncSubcMap[parentMncId]?.subcIds || [])].filter(
      Boolean,
    );
  }

  return [userSpId];
}

function getMeterKind(asset) {
  return (
    asset?.ast?.astData?.meter?.type || asset?.astData?.meter?.type || "NAv"
  );
}

function getMeterNo(asset) {
  return asset?.ast?.astData?.astNo || asset?.astData?.astNo || "NAv";
}

function getAstId(asset, params = {}) {
  return (
    params?.astId ||
    asset?.id ||
    asset?.ast?.astData?.astId ||
    asset?.astData?.astId ||
    "NAv"
  );
}

function getPremiseId(asset, params = {}) {
  return params?.premiseId || asset?.accessData?.premise?.id || "NAv";
}

function getMeterType(asset) {
  return asset?.meterType || "NAv";
}

function getStatus(asset) {
  return asset?.status?.state || "NAv";
}

function isLifecycleInstructionEligible({ trnType, asset }) {
  const status = normalizeUpper(getStatus(asset));

  if (trnType === "METER_INSPECTION") {
    return ["FIELD", "CONNECTED", "DISCONNECTED", "REMOVED"].includes(status);
  }

  return true;
}

function getWardPcode(asset, geoState) {
  return (
    asset?.accessData?.parents?.wardPcode ||
    geoState?.selectedWard?.pcode ||
    geoState?.selectedWard?.id ||
    null
  );
}

function getLmPcode(asset, geoState) {
  return (
    asset?.accessData?.parents?.lmPcode ||
    geoState?.selectedLm?.pcode ||
    geoState?.selectedLm?.id ||
    null
  );
}

function getAssetGps(asset) {
  const gps =
    asset?.ast?.location?.gps ||
    asset?.location?.gps ||
    asset?.gps ||
    asset?.accessData?.premise?.gps ||
    null;

  const lat = Number(gps?.lat);
  const lng = Number(gps?.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  return {
    lat,
    lng,
  };
}

function getTrnIdSuffix(asset) {
  const meterType = getMeterType(asset);
  const typeCode =
    meterType === "electricity" ? "ELC" : meterType === "water" ? "WTR" : "GEN";

  const wardPcode = asset?.accessData?.parents?.wardPcode || "NA";
  const erfNo = asset?.accessData?.erfNo || "NA";

  return `${typeCode}_${wardPcode}_${erfNo}`;
}

function buildInstructionTrnId({ trnType, asset }) {
  const config = LCT_TYPES[trnType] || LCT_TYPES.METER_INSPECTION;
  return `${config.prefix}_${Date.now()}_${getTrnIdSuffix(asset)}`;
}

// function normalizePublishedOptions(options = []) {
//   return Array.isArray(options)
//     ? options
//         .filter((option) => normalizeUpper(option?.status) === "PUBLISHED")
//         .sort(
//           (a, b) => Number(a?.sortOrder ?? 9999) - Number(b?.sortOrder ?? 9999),
//         )
//         .map((option) => ({
//           code: String(option?.code || option?.id || ""),
//           label: String(option?.label || option?.code || option?.id || ""),
//           description: String(option?.description || ""),
//           disabled: false,
//         }))
//         .filter((option) => option.code && option.label)
//     : [];
// }

function getMediaExtension(mediaItem = {}) {
  const type = normalizeUpper(mediaItem?.type);

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

function stripLocalUri(mediaItem = {}) {
  const { uri, ...cleanItem } = mediaItem;
  return cleanItem;
}

async function uploadLocalMediaItem({ storage, mediaItem, storagePath }) {
  if (!mediaItem?.uri || mediaItem?.url) {
    return mediaItem;
  }

  const response = await fetch(mediaItem.uri);
  const blob = await response.blob();

  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, blob);

  const downloadUrl = await getDownloadURL(storageRef);

  return {
    ...stripLocalUri(mediaItem),
    url: downloadUrl,
  };
}

async function syncLifecycleInstructionMedia({ payload }) {
  const storage = getStorage();
  const originalMedia = Array.isArray(payload?.media) ? payload.media : [];
  const trnId = payload?.id || "NAv";

  return await Promise.all(
    originalMedia.map(async (mediaItem) => {
      if (!mediaItem?.uri || mediaItem?.url) {
        return mediaItem;
      }

      const extension = getMediaExtension(mediaItem);

      const fileName = `${trnId}_${mediaItem?.tag || "instructionMedia"}_${Date.now()}.${extension}`;

      return await uploadLocalMediaItem({
        storage,
        mediaItem,
        storagePath: `trns/lifecycle_instructions/${trnId}/${fileName}`,
      });
    }),
  );
}

function withSubmitTimeout(promise, timeoutMs = 20000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => {
        reject(new Error("SUBMISSION_TIMEOUT"));
      }, timeoutMs),
    ),
  ]);
}

function cleanDisplayValue(value) {
  const text = String(value || "").trim();

  if (!text) return "";
  if (text === "NAv") return "";
  if (text.toUpperCase() === "NAV") return "";

  return text;
}

function getPropertySummary(asset) {
  const premise = asset?.accessData?.premise || {};
  const propertyType = premise?.propertyType;

  let type = "";
  let name = "";
  let unitNo = "";

  if (propertyType && typeof propertyType === "object") {
    type = cleanDisplayValue(
      propertyType?.type || propertyType?.label || propertyType?.name,
    );
    name = cleanDisplayValue(
      propertyType?.name || premise?.propertyName || premise?.name,
    );
    unitNo = cleanDisplayValue(
      propertyType?.unitNo ||
        propertyType?.unitNumber ||
        premise?.unitNo ||
        premise?.unitNumber,
    );
  } else {
    type = cleanDisplayValue(propertyType || premise?.type);
    name = cleanDisplayValue(premise?.propertyName || premise?.name);
    unitNo = cleanDisplayValue(premise?.unitNo || premise?.unitNumber);
  }

  return [type, name, unitNo].filter(Boolean).join(" • ");
}

export default function TrnOriginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { geoState } = useGeo();
  const { user, profile, isMNG, isSPV } = useAuth();

  const asset = useMemo(() => {
    return safeParseJson(params?.asset || params?.assetJson, null);
  }, [params?.asset, params?.assetJson]);

  const trnType = normalizeUpper(params?.trnType || "METER_INSPECTION");
  const trnConfig = LCT_TYPES[trnType] || LCT_TYPES.METER_INSPECTION;
  const instructionLookupKey =
    INSTRUCTION_LOOKUP_KEYS[trnType] ||
    INSTRUCTION_LOOKUP_KEYS.METER_INSPECTION;
  console.log(`TrnOriginScreen --instructionLookupKey`, instructionLookupKey);

  const agentUid = user?.uid || profile?.uid || "SYSTEM";
  const agentName = profile?.profile?.displayName || "SYSTEM";

  const [instructionSelect, setInstructionSelect] = useState(
    makeSelectWithOtherValue(),
  );
  const [instructionNotes, setInstructionNotes] = useState("");
  const [instructionMedia, setInstructionMedia] = useState([]);
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: users = [], isLoading: usersLoading } = useGetUsersQuery();
  const { data: serviceProviders = [], isLoading: spsLoading } =
    useGetServiceProvidersQuery();

  const {
    title: instructionLookupTitle,
    options: instructionOptions,
    allowOther: instructionAllowsOther,
    otherCode: instructionOtherCode,
    otherLabel: instructionOtherLabel,
    isLoading: instructionLookupLoading,
    isFetching: instructionLookupFetching,
    error: instructionLookupError,
    source: instructionLookupSource,
  } = useIrepsLookupOptions(instructionLookupKey);

  const [createLifecycleInstruction, { isLoading: creating }] =
    useCreateLifecycleInstructionMutation();

  const lmPcode = getLmPcode(asset, geoState);
  const wardPcode = getWardPcode(asset, geoState);
  const assetGps = getAssetGps(asset);

  const actorSpId = profile?.employment?.serviceProvider?.id || null;
  const actorSp = useMemo(() => {
    return serviceProviders.find((sp) => sp?.id === actorSpId) || null;
  }, [serviceProviders, actorSpId]);

  const isMncSpv = isSPV && serviceProviderLooksMnc(actorSp);
  const canCreateInstruction = isMNG || isMncSpv;

  const allowedSpIds = useMemo(() => {
    return getAllowedServiceProviderIds({
      profile,
      serviceProviders,
    });
  }, [profile, serviceProviders]);

  const visibleUsers = useMemo(() => {
    return users
      .filter((item) => {
        const accountStatus = item?.accountStatus || "NAv";
        const onboardingStatus = item?.onboarding?.status || "NAv";
        const spId = getUserSpId(item);

        return (
          accountStatus === "ACTIVE" &&
          onboardingStatus === "COMPLETED" &&
          allowedSpIds.includes(spId)
        );
      })
      .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
  }, [users, allowedSpIds]);

  const selectedTargetKeySet = useMemo(() => {
    return new Set(selectedTargets.map((item) => `${item.type}_${item.id}`));
  }, [selectedTargets]);

  const selectedUserTargets = useMemo(() => {
    return selectedTargets.filter((item) => item.type === "USER");
  }, [selectedTargets]);

  const userOptions = useMemo(() => {
    return visibleUsers
      .map((item) => ({
        id: item.uid,
        title: getDisplayName(item),
        subtitle: `${getUserRole(item)} • ${getUserSpName(item)}`,
        type: "USER",
        icon: "account-outline",
        raw: item,
      }))
      .filter((item) => !selectedTargetKeySet.has(`USER_${item.id}`));
  }, [visibleUsers, selectedTargetKeySet]);

  useEffect(() => {
    setInstructionSelect(makeSelectWithOtherValue());
  }, [instructionLookupKey]);

  const instructionText = selectWithOtherToText(
    instructionSelect,
    instructionOtherCode,
  );

  const astId = getAstId(asset, params);
  const premiseId = getPremiseId(asset, params);
  const busy = creating || submitting;
  const isEligibleLifecycleInstruction = isLifecycleInstructionEligible({
    trnType,
    asset,
  });

  const canSubmit =
    canCreateInstruction &&
    isEligibleLifecycleInstruction &&
    !busy &&
    asset &&
    trnType &&
    astId !== "NAv" &&
    premiseId !== "NAv" &&
    isSelectWithOtherFilled(instructionSelect, instructionOtherCode) &&
    instructionText.trim().length > 0 &&
    selectedTargets.length === 1 &&
    selectedTargets[0]?.type === "USER";
  console.log(`TrnOriginScreen --canSubmit`, canSubmit);

  const isLoading =
    usersLoading ||
    spsLoading ||
    instructionLookupLoading ||
    instructionLookupFetching;

  function addTarget(target) {
    if (target?.type !== "USER" || !target?.id) return;

    setSelectedTargets([target]);
  }

  function removeTarget(target) {
    setSelectedTargets((prev) =>
      prev.filter(
        (item) => !(item.type === target.type && item.id === target.id),
      ),
    );
  }

  function handleSelectUserTarget(option) {
    const selectedUser = visibleUsers.find((item) => item.uid === option.id);
    if (!selectedUser) return;

    addTarget({
      type: "USER",
      id: selectedUser.uid,
      name: getDisplayName(selectedUser),
    });
  }

  async function saveLifecycleInstructionToQueue(payload, message) {
    const result = await addSubmissionQueueItem({
      formType: "LIFECYCLE_INSTRUCTION",
      payload,
      context: {
        meterNo: getMeterNo(asset),
        meterType: getMeterType(asset),
        erfId: asset?.accessData?.erfId || asset?.erfId || "NAv",
        erfNo: asset?.accessData?.erfNo || "NAv",
        premiseId,
        lmPcode: lmPcode || "NAv",
        wardPcode: wardPcode || "NAv",
      },
      createdByUid: agentUid,
      createdByUser: agentName,
    });

    if (!result?.success) {
      throw new Error(result?.message || "Could not save lifecycle draft.");
    }

    Alert.alert(
      "Saved Offline",
      message ||
        "No network. Lifecycle instruction saved to offline forms queue.",
      [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ],
    );
  }

  async function handleCreateInstruction() {
    if (!canSubmit) return;

    setSubmitting(true);

    const trnId = buildInstructionTrnId({
      trnType,
      asset,
    });

    const basePayload = safeClone({
      id: trnId,
      trnType,
      astId,
      premiseId,

      assignment: {
        targets: selectedTargets,

        instruction: {
          code: trnType,
          text: instructionText.trim(),
          notes: instructionNotes.trim(),
          mediaRequired: false,
        },
      },

      media: Array.isArray(instructionMedia) ? instructionMedia : [],
    });

    let queuePayload = basePayload;

    try {
      const netState = await NetInfo.fetch();

      const isOnline = Boolean(
        netState?.isConnected && netState?.isInternetReachable,
      );

      if (!isOnline) {
        await saveLifecycleInstructionToQueue(basePayload);
        return;
      }

      const syncedMedia = await syncLifecycleInstructionMedia({
        payload: basePayload,
      });

      const finalPayload = {
        ...basePayload,
        media: syncedMedia,
      };

      queuePayload = finalPayload;

      const result = await withSubmitTimeout(
        createLifecycleInstruction(finalPayload).unwrap(),
        20000,
      );

      Alert.alert(
        "TRN Created",
        result?.message || "Lifecycle instruction created successfully.",
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ],
      );
    } catch (error) {
      console.log("TRN_ORIGIN create ERROR", error);

      const netState = await NetInfo.fetch();
      const isOnline = Boolean(
        netState?.isConnected && netState?.isInternetReachable,
      );

      if (!isOnline || error?.message === "SUBMISSION_TIMEOUT") {
        try {
          await saveLifecycleInstructionToQueue(
            queuePayload,
            error?.message === "SUBMISSION_TIMEOUT"
              ? "Submission is taking too long. Lifecycle instruction saved to offline forms queue."
              : "Network dropped. Lifecycle instruction saved to offline forms queue.",
          );
          return;
        } catch (queueError) {
          console.log("TRN_ORIGIN queue save ERROR", queueError);
        }
      }

      Alert.alert(
        "Create TRN Failed",
        error?.message ||
          error?.data?.message ||
          "Could not create lifecycle instruction.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    if (busy) return;

    router.back();
  }

  if (!asset) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right"]}>
        <Stack.Screen
          options={{
            title: "TRN Origin",
            headerTitleStyle: { fontSize: 14, fontWeight: "900" },
          }}
        />

        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={42}
            color="#f97316"
          />
          <Text style={styles.emptyTitle}>No AST data received</Text>
          <Text style={styles.emptyText}>
            Open this screen from AstsScreen so the selected meter can be used
            to create the lifecycle instruction.
          </Text>

          <Pressable style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>GO BACK</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Stack.Screen
        options={{
          title: "Worksorder/Trn Creation",
          headerTitleStyle: { fontSize: 16, fontWeight: "900" },
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons
              name="clipboard-text-clock-outline"
              size={24}
              color="#ffffff"
            />
          </View>

          <View style={styles.heroMain}>
            <Text style={styles.heroTitle}>{trnConfig.title}</Text>
            <Text style={styles.heroSub}>
              Create an office-issued lifecycle instruction
            </Text>
          </View>

          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{trnConfig.short}</Text>
          </View>
        </View>

        {!canCreateInstruction && (
          <View style={styles.warningCard}>
            <MaterialCommunityIcons
              name="lock-alert-outline"
              size={20}
              color="#b45309"
            />
            <Text style={styles.warningText}>
              Only MNG and MNC supervisors can create lifecycle instructions.
            </Text>
          </View>
        )}

        {!isEligibleLifecycleInstruction && (
          <View style={styles.warningCard}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={20}
              color="#b45309"
            />
            <Text style={styles.warningText}>
              This meter is not eligible for {trnConfig.title}.
            </Text>
          </View>
        )}

        <Section title="Meter Summary" icon="counter">
          <InfoRow label="Meter No" value={getMeterNo(asset)} />
          <InfoRow
            label="Address"
            value={asset?.accessData?.premise?.address}
          />
          <InfoRow label="Property" value={getPropertySummary(asset)} />
          <InfoRow label="ERF No" value={asset?.accessData?.erfNo} />
          <InfoRow label="Meter Type" value={getMeterType(asset)} />
          <InfoRow label="Meter Kind" value={getMeterKind(asset)} />
          <InfoRow label="LM" value={lmPcode || "NAv"} />
          <InfoRow label="Ward" value={wardPcode || "NAv"} />
          <InfoRow label="Current Status" value={getStatus(asset)} strong />
        </Section>

        <Section title="Instruction" icon="clipboard-edit-outline">
          <IrepsSelectWithOther
            label={instructionLookupTitle || "Instruction"}
            placeholder="Select instruction"
            required
            loading={instructionLookupLoading || instructionLookupFetching}
            disabled={busy}
            options={instructionOptions}
            value={instructionSelect}
            onChange={setInstructionSelect}
            includeOther={instructionAllowsOther}
            otherCode={instructionOtherCode}
            otherLabel={instructionOtherLabel}
            otherPlaceholder="Enter instruction"
            errorText={
              instructionLookupError
                ? "Could not load instruction options."
                : ""
            }
            helperText={`Lookup: ${instructionLookupKey} • Source: ${instructionLookupSource}`}
          />

          <Text style={styles.label}>Instruction Notes</Text>
          <TextInput
            value={instructionNotes}
            onChangeText={setInstructionNotes}
            placeholder="Optional notes"
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.textAreaSmall]}
            multiline
            editable={!busy}
          />
        </Section>

        <Section title="Instruction Media" icon="paperclip">
          <IrepsInstructionMedia
            value={instructionMedia}
            onChange={setInstructionMedia}
            tag="instructionMedia"
            agentName={agentName}
            agentUid={agentUid}
            fallbackGps={assetGps}
            disabled={busy}
            required={false}
            maxItems={12}
          />
        </Section>

        <Section
          title="Assign To Individual User"
          icon="account-hard-hat-outline"
        >
          <DynamicTargetPicker
            title="Select User"
            buttonLabel="SELECT USER"
            modalTitle="Select Individual User"
            options={userOptions}
            selectedTargets={selectedUserTargets}
            onSelect={handleSelectUserTarget}
            onRemoveTarget={removeTarget}
            disabled={busy}
            loading={isLoading}
            emptyText="No assignable users found under this MNC scope."
            selectedEmptyText="No user selected yet."
          />
        </Section>

        {/* <View style={styles.workorderCard}>
          <Text style={styles.workorderLabel}>Workorder Bucket</Text>
          <Text style={styles.workorderTitle}>General</Text>
          <Text style={styles.workorderText}>
            This individually created TRN will be saved under the General
            workorder bucket. Mass-created TRNs from WMC will later use a real
            workorder id.
          </Text>
        </View> */}

        <View style={styles.actions}>
          <Pressable
            style={[styles.actionButton, styles.cancelButton]}
            onPress={handleBack}
            disabled={busy}
          >
            <Text style={styles.cancelButtonText}>CANCEL</Text>
          </Pressable>

          <Pressable
            style={[
              styles.actionButton,
              styles.createButton,
              !canSubmit && styles.createButtonDisabled,
              busy && styles.createButtonLoading,
            ]}
            onPress={handleCreateInstruction}
            disabled={!canSubmit}
          >
            {busy ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#7c2d12" />
                <Text style={styles.createLoadingText}>CREATING</Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.createButtonText,
                  !canSubmit && styles.createButtonTextDisabled,
                ]}
              >
                CREATE TRN
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, icon, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name={icon} size={18} color="#2563eb" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

      {children}
    </View>
  );
}

function InfoRow({ label, value, strong = false }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, strong && styles.infoValueStrong]}>
        {value || "NAv"}
      </Text>
    </View>
  );
}

function DynamicTargetPicker({
  title,
  buttonLabel,
  modalTitle,
  options,
  selectedTargets = [],
  onSelect,
  onRemoveTarget,
  disabled,
  loading,
  emptyText,
  selectedEmptyText,
}) {
  const [visible, setVisible] = useState(false);
  const [searchText, setSearchText] = useState("");

  const filteredOptions = useMemo(() => {
    const search = normalizeLower(searchText);

    if (!search) return options;

    return options.filter((option) => {
      return (
        normalizeLower(option?.title).includes(search) ||
        normalizeLower(option?.subtitle).includes(search) ||
        normalizeLower(option?.id).includes(search)
      );
    });
  }, [options, searchText]);

  function handleOpen() {
    if (disabled) return;

    setSearchText("");
    setVisible(true);
  }

  function handleSelect(option) {
    onSelect?.(option);
    setVisible(false);
    setSearchText("");
  }

  return (
    <View style={styles.targetPicker}>
      <Text style={styles.targetPickerTitle}>{title}</Text>

      <Pressable
        style={[
          styles.openPickerButton,
          disabled && styles.openPickerButtonDisabled,
        ]}
        onPress={handleOpen}
        disabled={disabled}
      >
        <MaterialCommunityIcons name="chevron-down" size={19} color="#2563eb" />

        <View style={styles.openPickerMain}>
          <Text style={styles.openPickerTitle}>{buttonLabel}</Text>
          <Text style={styles.openPickerMeta}>
            {loading
              ? "Loading..."
              : options.length === 0
                ? emptyText
                : `${options.length} available`}
          </Text>
        </View>
      </Pressable>

      <View style={styles.selectedTargetsBox}>
        <Text style={styles.selectedTargetsTitle}>
          Selected ({selectedTargets.length})
        </Text>

        {selectedTargets.length === 0 ? (
          <Text style={styles.emptyInline}>{selectedEmptyText}</Text>
        ) : (
          <View style={styles.targetList}>
            {selectedTargets.map((target) => (
              <View
                key={`${target.type}_${target.id}`}
                style={styles.targetCard}
              >
                <View style={styles.targetIcon}>
                  <MaterialCommunityIcons
                    name="account-outline"
                    size={17}
                    color="#2563eb"
                  />
                </View>

                <View style={styles.targetMain}>
                  <Text style={styles.targetName}>{target.name}</Text>
                  <Text style={styles.targetMeta}>{target.type}</Text>
                </View>

                <Pressable
                  onPress={() => onRemoveTarget?.(target)}
                  disabled={disabled}
                  style={styles.targetRemove}
                >
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={20}
                    color="#dc2626"
                  />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalTitle}</Text>

              <Pressable
                style={styles.modalClose}
                onPress={() => setVisible(false)}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={23}
                  color="#0f172a"
                />
              </Pressable>
            </View>

            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search..."
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {loading ? (
              <View style={styles.modalState}>
                <ActivityIndicator size="small" color="#2563eb" />
                <Text style={styles.modalStateText}>Loading...</Text>
              </View>
            ) : filteredOptions.length === 0 ? (
              <View style={styles.modalState}>
                <MaterialCommunityIcons
                  name="database-search-outline"
                  size={28}
                  color="#94a3b8"
                />
                <Text style={styles.modalStateText}>
                  {options.length === 0 ? emptyText : "No matching results."}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.optionList}
                showsVerticalScrollIndicator={false}
              >
                {filteredOptions.map((option) => (
                  <Pressable
                    key={`${option.type}_${option.id}`}
                    style={styles.optionCard}
                    onPress={() => handleSelect(option)}
                  >
                    <View style={styles.optionIcon}>
                      <MaterialCommunityIcons
                        name={option.icon || "checkbox-blank-circle-outline"}
                        size={20}
                        color="#2563eb"
                      />
                    </View>

                    <View style={styles.optionMain}>
                      <Text style={styles.optionTitle}>{option.title}</Text>
                      <Text style={styles.optionSubtitle}>
                        {option.subtitle || option.id}
                      </Text>
                    </View>

                    <MaterialCommunityIcons
                      name="plus-circle"
                      size={20}
                      color="#16a34a"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    padding: 12,
    paddingBottom: 28,
  },

  hero: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },

  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },

  heroMain: {
    flex: 1,
  },

  heroTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  heroSub: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },

  typeBadge: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },

  typeBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#166534",
  },

  warningCard: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },

  warningText: {
    flex: 1,
    color: "#92400e",
    fontSize: 12,
    fontWeight: "800",
  },

  section: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },

  infoLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "800",
  },

  infoValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 11,
    color: "#334155",
    fontWeight: "700",
  },

  infoValueStrong: {
    color: "#2563eb",
    fontWeight: "900",
  },

  label: {
    fontSize: 11,
    fontWeight: "900",
    color: "#334155",
    marginBottom: 6,
  },

  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "700",
  },

  textAreaSmall: {
    minHeight: 56,
    textAlignVertical: "top",
  },

  targetPicker: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },

  targetPickerTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 8,
  },

  openPickerButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
  },

  openPickerButtonDisabled: {
    opacity: 0.55,
  },

  openPickerMain: {
    flex: 1,
  },

  openPickerTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
  },

  openPickerMeta: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
  },

  selectedTargetsBox: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
  },

  selectedTargetsTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#64748b",
    marginBottom: 8,
    textTransform: "uppercase",
  },

  targetList: {
    gap: 8,
  },

  targetCard: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  targetIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },

  targetMain: {
    flex: 1,
  },

  targetName: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
  },

  targetMeta: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "900",
    color: "#2563eb",
  },

  targetRemove: {
    padding: 3,
  },

  emptyInline: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 60,
  },

  modalSheet: {
    maxHeight: "76%",
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 14,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },

  modalTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
  },

  modalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },

  searchInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "700",
  },

  modalState: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  modalStateText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },

  optionList: {
    maxHeight: 520,
  },

  optionCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    borderRadius: 13,
    padding: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },

  optionMain: {
    flex: 1,
  },

  optionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },

  optionSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },

  // workorderCard: {
  //   backgroundColor: "#f8fafc",
  //   borderWidth: 1,
  //   borderColor: "#cbd5e1",
  //   borderRadius: 14,
  //   padding: 12,
  //   marginBottom: 12,
  // },

  // workorderLabel: {
  //   fontSize: 10,
  //   fontWeight: "900",
  //   color: "#64748b",
  //   textTransform: "uppercase",
  // },

  // workorderTitle: {
  //   fontSize: 14,
  //   fontWeight: "900",
  //   color: "#0f172a",
  //   marginTop: 4,
  // },

  // workorderText: {
  //   fontSize: 11,
  //   color: "#64748b",
  //   fontWeight: "700",
  //   marginTop: 4,
  //   lineHeight: 16,
  // },

  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 2,
  },

  actionButton: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelButton: {
    flex: 0.8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },

  cancelButtonText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "900",
  },

  createButton: {
    flex: 2,
    backgroundColor: "#86efac",
  },

  createButtonDisabled: {
    backgroundColor: "#94a3b8",
  },

  createButtonLoading: {
    backgroundColor: "#fde047",
  },

  createButtonText: {
    color: "#14532d",
    fontSize: 12,
    fontWeight: "900",
  },

  createButtonTextDisabled: {
    color: "#f8fafc",
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  createLoadingText: {
    color: "#7c2d12",
    fontSize: 12,
    fontWeight: "900",
  },

  emptyWrap: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 12,
  },

  emptyText: {
    textAlign: "center",
    fontSize: 12,
    color: "#64748b",
    fontWeight: "700",
    marginTop: 6,
    lineHeight: 18,
  },

  backButton: {
    marginTop: 18,
    backgroundColor: "#0f172a",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },

  backButtonText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 12,
  },
});
