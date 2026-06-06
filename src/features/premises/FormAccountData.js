import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FieldArray, Formik, getIn } from "formik";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator, Button, Modal, Portal, Surface, Text } from "react-native-paper";
import { array, object, string } from "yup";

import { IrepsMedia } from "../../../components/media/IrepsMedia";
import { functions } from "../../firebase";
import {
  useGetAccountMastersByPremiseIdQuery,
} from "../../redux/accountDataApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../hooks/useAuth";
import {
  addAccountDataQueueItem,
  getAccountDataDraftByPremiseId,
  removeAccountDataDraftByPremiseId,
  saveAccountDataDraft,
} from "../../utils/accountDataSubmissionQueue";
import FormInputAccountNo from "./FormInputAccountNo";

const ACCOUNT_DATA_MEDIA_TAGS = [
  {
    tag: "accountDocumentPhoto",
    label: "Account Statement / Account Document",
    required: false,
  },
  {
    tag: "ownerIdPhoto",
    label: "Owner ID Photo",
    required: false,
  },
  {
    tag: "occupantIdPhoto",
    label: "Occupant ID Photo",
    required: false,
  },
  {
    tag: "proofOfResidencePhoto",
    label: "Proof of Residence",
    required: false,
  },
  {
    tag: "otherAccountEvidencePhoto",
    label: "Other Account Evidence",
    required: false,
  },
];

function readSingleParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function toNAv(value) {
  const clean = String(value || "").trim();
  return clean || "NAv";
}

function normalizeAccountNo(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function formatPremiseAddress(premise) {
  return [
    premise?.address?.strNo,
    premise?.address?.strName,
    premise?.address?.strType,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function formatPropertyType(premise) {
  return [
    premise?.propertyType?.type,
    premise?.propertyType?.name,
    premise?.propertyType?.unitNo,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" • ");
}

function buildInitialValues() {
  return {
    owner: {
      ownerType: "NATURAL_PERSON",

      naturalPerson: {
        name: "",
        surname: "",
        idNumber: "",
      },

      juristicPerson: {
        registeredName: "",
        registrationNumber: "",
        tradingName: "",
      },

      contact: {
        phone: "",
        whatsapp: "",
        email: "",
      },
    },

    occupant: {
      isOwner: "no",
      name: "",
      surname: "",
      idNumber: "",
      relationshipToOwner: "",

      contact: {
        phone: "",
        whatsapp: "",
        email: "",
      },
    },

    accounts: [
      {
        accountNo: "",
      },
    ],

    media: [],
  };
}


function fromNAv(value) {
  const clean = String(value || "").trim();
  const upper = clean.toUpperCase();

  if (!clean || upper === "NAV" || upper === "N/A" || upper === "NA") {
    return "";
  }

  return clean;
}

function formatDateLabel(value) {
  if (!value || value === "NAv") return "NAv";

  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return "NAv";
  }
}

function getAccountMasterAccountNo(accountMaster = {}) {
  return (
    accountMaster?.account?.accountNo ||
    accountMaster?.account?.accountNoNormalized ||
    accountMaster?.accountNo ||
    "NAv"
  );
}

function getAccountMasterOwnerLabel(accountMaster = {}) {
  const owner = accountMaster?.owner || {};

  if (owner?.ownerType === "JURISTIC_PERSON") {
    return (
      fromNAv(owner?.juristicPerson?.registeredName) ||
      fromNAv(owner?.juristicPerson?.tradingName) ||
      "NAv"
    );
  }

  const fullName = [
    fromNAv(owner?.naturalPerson?.name),
    fromNAv(owner?.naturalPerson?.surname),
  ]
    .filter(Boolean)
    .join(" ");

  return fullName || "NAv";
}

function buildValuesFromAccountMaster(accountMaster = {}, media = []) {
  const baseValues = buildInitialValues();
  const owner = accountMaster?.owner || {};
  const occupant = accountMaster?.occupant || {};
  const ownerType =
    owner?.ownerType === "JURISTIC_PERSON" ? "JURISTIC_PERSON" : "NATURAL_PERSON";

  return {
    ...baseValues,

    owner: {
      ownerType,

      naturalPerson: {
        name: fromNAv(owner?.naturalPerson?.name),
        surname: fromNAv(owner?.naturalPerson?.surname),
        idNumber: fromNAv(owner?.naturalPerson?.idNumber),
      },

      juristicPerson: {
        registeredName: fromNAv(owner?.juristicPerson?.registeredName),
        registrationNumber: fromNAv(owner?.juristicPerson?.registrationNumber),
        tradingName: fromNAv(owner?.juristicPerson?.tradingName),
      },

      contact: {
        phone: fromNAv(owner?.contact?.phone),
        whatsapp: fromNAv(owner?.contact?.whatsapp),
        email: fromNAv(owner?.contact?.email),
      },
    },

    occupant: {
      isOwner: "no",
      name: fromNAv(occupant?.name),
      surname: fromNAv(occupant?.surname),
      idNumber: fromNAv(occupant?.idNumber),
      relationshipToOwner: fromNAv(occupant?.relationshipToOwner),

      contact: {
        phone: fromNAv(occupant?.contact?.phone),
        whatsapp: fromNAv(occupant?.contact?.whatsapp),
        email: fromNAv(occupant?.contact?.email),
      },
    },

    accounts: [
      {
        accountNo: fromNAv(getAccountMasterAccountNo(accountMaster)),
      },
    ],

    media: Array.isArray(media) ? media : [],
  };
}

function buildOwnerValuesFromAccountMaster(accountMaster = {}) {
  const owner = accountMaster?.owner || {};
  const ownerType =
    owner?.ownerType === "JURISTIC_PERSON" ? "JURISTIC_PERSON" : "NATURAL_PERSON";

  return {
    ownerType,

    naturalPerson: {
      name: fromNAv(owner?.naturalPerson?.name),
      surname: fromNAv(owner?.naturalPerson?.surname),
      idNumber: fromNAv(owner?.naturalPerson?.idNumber),
    },

    juristicPerson: {
      registeredName: fromNAv(owner?.juristicPerson?.registeredName),
      registrationNumber: fromNAv(owner?.juristicPerson?.registrationNumber),
      tradingName: fromNAv(owner?.juristicPerson?.tradingName),
    },

    contact: {
      phone: fromNAv(owner?.contact?.phone),
      whatsapp: fromNAv(owner?.contact?.whatsapp),
      email: fromNAv(owner?.contact?.email),
    },
  };
}

function cleanOwner(owner = {}) {
  const ownerType =
    owner?.ownerType === "JURISTIC_PERSON" ? "JURISTIC_PERSON" : "NATURAL_PERSON";

  return {
    ownerType,

    naturalPerson: {
      name: toNAv(owner?.naturalPerson?.name),
      surname: toNAv(owner?.naturalPerson?.surname),
      idNumber: toNAv(owner?.naturalPerson?.idNumber),
    },

    juristicPerson: {
      registeredName: toNAv(owner?.juristicPerson?.registeredName),
      registrationNumber: toNAv(owner?.juristicPerson?.registrationNumber),
      tradingName: toNAv(owner?.juristicPerson?.tradingName),
    },

    contact: {
      phone: toNAv(owner?.contact?.phone),
      whatsapp: toNAv(owner?.contact?.whatsapp),
      email: toNAv(owner?.contact?.email),
    },
  };
}

function cleanOccupant(occupant = {}) {
  return {
    name: toNAv(occupant?.name),
    surname: toNAv(occupant?.surname),
    idNumber: toNAv(occupant?.idNumber),
    relationshipToOwner: toNAv(occupant?.relationshipToOwner),

    contact: {
      phone: toNAv(occupant?.contact?.phone),
      whatsapp: toNAv(occupant?.contact?.whatsapp),
      email: toNAv(occupant?.contact?.email),
    },
  };
}

function cleanAccounts(accounts = []) {
  const list = Array.isArray(accounts) ? accounts : [];

  return list
    .map((account) => ({
      accountNo: normalizeAccountNo(account?.accountNo),
    }))
    .filter((account) => !!account.accountNo);
}

function buildCleanPayload({ premiseId, values }) {
  return {
    premiseId,
    owner: cleanOwner(values?.owner),
    occupant: cleanOccupant(values?.occupant),
    accounts: cleanAccounts(values?.accounts),
    media: Array.isArray(values?.media) ? values.media : [],
  };
}

function hasAtLeastOneAccountNo(values = {}) {
  return cleanAccounts(values?.accounts).length > 0;
}

function isAccountDataFormEmpty(values = {}) {
  const owner = values?.owner || {};
  const occupant = values?.occupant || {};

  const textValues = [
    owner?.naturalPerson?.name,
    owner?.naturalPerson?.surname,
    owner?.naturalPerson?.idNumber,
    owner?.juristicPerson?.registeredName,
    owner?.juristicPerson?.registrationNumber,
    owner?.juristicPerson?.tradingName,
    owner?.contact?.phone,
    owner?.contact?.whatsapp,
    owner?.contact?.email,
    occupant?.name,
    occupant?.surname,
    occupant?.idNumber,
    occupant?.relationshipToOwner,
    occupant?.contact?.phone,
    occupant?.contact?.whatsapp,
    occupant?.contact?.email,
    ...(Array.isArray(values?.accounts)
      ? values.accounts.map((account) => account?.accountNo)
      : []),
  ];

  const hasText = textValues.some((value) => String(value || "").trim());
  const hasMedia = Array.isArray(values?.media) && values.media.length > 0;

  return !hasText && !hasMedia;
}

function sanitizeStorageSegment(value, fallback = "NAv") {
  const clean = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_\-]/g, "_")
    .slice(0, 160);

  return clean || fallback;
}

async function uploadAccountDataMedia({ premiseId, media = [] }) {
  const mediaList = Array.isArray(media) ? media : [];

  if (mediaList.length === 0) {
    return [];
  }

  const storage = getStorage();
  const safePremiseId = sanitizeStorageSegment(premiseId);

  const uploadedMedia = await Promise.all(
    mediaList.map(async (mediaItem, index) => {
      if (!mediaItem?.uri || mediaItem?.url) {
        return mediaItem;
      }

      const tag = sanitizeStorageSegment(mediaItem?.tag || `media_${index}`);
      const fileName = `${Date.now()}_${index}_${tag}.jpg`;
      const storagePath = `data-cleansing/account-data/${safePremiseId}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      const response = await fetch(mediaItem.uri);
      const blob = await response.blob();

      await uploadBytes(storageRef, blob);

      const downloadUrl = await getDownloadURL(storageRef);
      const { uri, ...cleanMediaItem } = mediaItem;

      return {
        ...cleanMediaItem,
        url: downloadUrl,
      };
    }),
  );

  return uploadedMedia;
}

function isOfflineOrNetworkError(error = {}) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code.includes("unavailable") ||
    code.includes("deadline") ||
    code.includes("network") ||
    message.includes("network") ||
    message.includes("offline") ||
    message.includes("failed to fetch")
  );
}


const AccountDataSchema = object().shape({
  owner: object().shape({
    ownerType: string()
      .oneOf(["NATURAL_PERSON", "JURISTIC_PERSON"])
      .required("Owner type is required"),

    naturalPerson: object().when("ownerType", {
      is: "NATURAL_PERSON",
      then: (schema) =>
        schema.shape({
          name: string().trim().required("Owner name is required"),
          surname: string().trim().required("Owner surname is required"),
          idNumber: string().nullable(),
        }),
      otherwise: (schema) => schema,
    }),

    juristicPerson: object().when("ownerType", {
      is: "JURISTIC_PERSON",
      then: (schema) =>
        schema.shape({
          registeredName: string().trim().required("Registered name is required"),
          registrationNumber: string().nullable(),
          tradingName: string().nullable(),
        }),
      otherwise: (schema) => schema,
    }),

    contact: object().shape({
      phone: string().nullable(),
      whatsapp: string().nullable(),
      email: string().email("Invalid email").nullable(),
    }),
  }),

  occupant: object().shape({
    isOwner: string().oneOf(["yes", "no"]).nullable(),
    contact: object().shape({
      email: string().email("Invalid email").nullable(),
    }),
  }),

  accounts: array()
    .of(
      object().shape({
        accountNo: string().trim().required("Account number is required"),
      }),
    )
    .min(1, "At least one account number is required")
    .test(
      "unique-account-numbers",
      "Duplicate account numbers are not allowed",
      (accounts = []) => {
        const normalized = accounts
          .map((account) => normalizeAccountNo(account?.accountNo))
          .filter(Boolean);

        return new Set(normalized).size === normalized.length;
      },
    ),

  media: array().of(object()).nullable(),
});

function SectionCard({ icon, title, children, tone = "default", rightAction = null }) {
  return (
    <Surface style={styles.sectionCard} elevation={1}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <MaterialCommunityIcons
            name={icon}
            size={18}
            color={tone === "warning" ? "#b45309" : "#0f172a"}
          />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>

        {rightAction ? <View style={styles.sectionHeaderAction}>{rightAction}</View> : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </Surface>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  error = null,
}) {
  const hasError = !!error;

  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, hasError && styles.fieldLabelError]}>
        {label}
      </Text>
      <View style={styles.textInputShell}>
        <TextInputProxy
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          hasError={hasError}
        />
      </View>

      {hasError && <Text style={styles.formErrorText}>{error}</Text>}
    </View>
  );
}

function TextInputProxy({ value, onChangeText, keyboardType, hasError = false }) {
  return (
    <TextInput
      value={value || ""}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      placeholder="NAv"
      placeholderTextColor="#94a3b8"
      style={[styles.textInput, hasError && styles.textInputError]}
    />
  );
}


function ExistingAccountCard({ accountMaster, busy = false, onEdit }) {
  const accountNo = getAccountMasterAccountNo(accountMaster);
  const ownerLabel = getAccountMasterOwnerLabel(accountMaster);
  const updatedAt = accountMaster?.metadata?.updatedAt || "NAv";

  return (
    <View style={styles.existingAccountCard}>
      <View style={styles.existingAccountHeader}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.existingAccountNo}>{accountNo}</Text>
          <Text style={styles.existingAccountOwner} numberOfLines={1}>
            {ownerLabel}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.openEditBtn, busy && styles.disabledBtn]}
          disabled={busy}
          activeOpacity={0.85}
          onPress={() => onEdit?.(accountMaster)}
        >
          <MaterialCommunityIcons
            name="pencil-outline"
            size={16}
            color="#ffffff"
          />
          <Text style={styles.openEditText}>OPEN / EDIT</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.existingAccountUpdated}>
        Last updated: {formatDateLabel(updatedAt)}
      </Text>
    </View>
  );
}

function AccountDataFooter({ loading, isValid, dirty, onSubmit, onReset }) {
  const isFormReady = isValid && dirty;

  const config = loading
    ? {
        text: "IS SUBMITTING...",
        color: "#22C55E",
        bg: "#FEF08A",
        icon: "loading",
      }
    : isFormReady
      ? {
          text: "SUBMIT",
          color: "#22C55E",
          bg: "transparent",
          icon: "check-bold",
        }
      : {
          text: "SUBMIT",
          color: "#DC2626",
          bg: "transparent",
          icon: "close-thick",
        };

  return (
    <View style={styles.footerContainer}>
      <Button
        mode="outlined"
        onPress={onReset}
        style={styles.resetBtn}
        disabled={loading}
        textColor="#64748B"
      >
        RESET
      </Button>

      <Button
        mode="contained"
        onPress={onSubmit}
        disabled={loading}
        icon={({ size, color }) =>
          loading ? (
            <ActivityIndicator size={size} color={config.color} />
          ) : (
            <MaterialCommunityIcons
              name={config.icon}
              size={size}
              color={color || config.color}
            />
          )
        }
        buttonColor={config.bg}
        textColor={config.color}
        contentStyle={{ height: 48 }}
        style={[
          styles.submitBtn,
          {
            borderColor: config.color,
            borderWidth: config.bg === "transparent" ? 1.5 : 0,
          },
        ]}
        labelStyle={{ fontWeight: "bold" }}
      >
        {config.text}
      </Button>
    </View>
  );
}


export default function FormAccountData() {
  const router = useRouter();
  const { premiseId: premiseIdRaw } = useLocalSearchParams();
  const premiseId = readSingleParam(premiseIdRaw);

  const { all } = useWarehouse();
  const { user, profile } = useAuth();

  const {
    data: accountMasters = [],
    isLoading: accountMastersLoading,
    isError: accountMastersHasError,
  } = useGetAccountMastersByPremiseIdQuery(premiseId, {
    skip: !premiseId,
  });


  const [draftValues, setDraftValues] = useState(null);
  const [editAccountMasterId, setEditAccountMasterId] = useState("");
  const [formMode, setFormMode] = useState("CLOSED");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTitle, setSuccessTitle] = useState("SAVED LOCALLY");
  const [successSub, setSuccessSub] = useState(
    "Account data was saved to the Data Cleansing local queue for syncing later.",
  );
  const [busyMessage, setBusyMessage] = useState("");

  const agentUid = user?.uid || "unknown_uid";
  const agentName = profile?.profile?.displayName || "Field Agent";

  const premise = useMemo(
    () => (all?.prems || []).find((item) => item?.id === premiseId) || null,
    [all?.prems, premiseId],
  );

  const premiseAddress = useMemo(() => formatPremiseAddress(premise), [premise]);
  const propertyType = useMemo(() => formatPropertyType(premise), [premise]);
  const accountRefs = Array.isArray(premise?.accountRefs) ? premise.accountRefs : [];
  const accountMastersList = Array.isArray(accountMasters) ? accountMasters : [];
  const accountCount =
    accountMastersList.length > 0 ? accountMastersList.length : accountRefs.length;
  const isEditingExistingAccount = formMode === "EDIT" && !!editAccountMasterId;
  const isFormOpen = formMode === "CREATE" || formMode === "EDIT";
  const latestOwnerAccountMaster = useMemo(() => {
    const list = Array.isArray(accountMasters) ? accountMasters : [];

    return (
      [...list]
        .filter((item) => !!item?.owner)
        .sort((a, b) => {
          const bTime = new Date(
            b?.metadata?.updatedAt || b?.metadata?.createdAt || 0,
          ).getTime();
          const aTime = new Date(
            a?.metadata?.updatedAt || a?.metadata?.createdAt || 0,
          ).getTime();

          return (Number.isFinite(bTime) ? bTime : 0) -
            (Number.isFinite(aTime) ? aTime : 0);
        })?.[0] || null
    );
  }, [accountMasters]);
  const canUseExistingOwner =
    formMode === "CREATE" && !isEditingExistingAccount && !!latestOwnerAccountMaster;
  const parents = premise?.parents || {};
  const fallbackGps = premise?.geometry?.centroid || null;

  const initialValues = useMemo(() => {
    return draftValues || buildInitialValues();
  }, [draftValues]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable));
    });

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadDraft = async () => {
      if (!premiseId) {
        if (mounted) setDraftLoaded(true);
        return;
      }

      const draft = await getAccountDataDraftByPremiseId(premiseId);

      if (mounted) {
        setDraftValues(draft?.values || null);
        if (draft?.values) {
          setFormMode("CREATE");
          setEditAccountMasterId("");
        }
        setDraftLoaded(true);
      }
    };

    loadDraft();

    return () => {
      mounted = false;
    };
  }, [premiseId]);

  const context = useMemo(
    () => ({
      premiseId: premise?.id || premiseId || "NAv",
      erfId: premise?.erfId || "NAv",
      erfNo: premise?.erfNo || "NAv",
      lmPcode: parents?.lmPcode || "NAv",
      wardPcode: parents?.wardPcode || "NAv",
    }),
    [premise?.id, premise?.erfId, premise?.erfNo, premiseId, parents?.lmPcode, parents?.wardPcode],
  );

  const handleSaveDraft = async (values) => {
    if (!premiseId) {
      Alert.alert("Missing Premise", "Premise id is required to save this draft.");
      return;
    }

    if (isAccountDataFormEmpty(values)) {
      Alert.alert(
        "Nothing to Save",
        "The form is still empty. Capture account data before saving a local draft.",
      );
      return;
    }

    if (!hasAtLeastOneAccountNo(values)) {
      Alert.alert(
        "Missing Account Number",
        "Capture at least one municipal account number before saving a local draft.",
      );
      return;
    }

    setBusyMessage("Saving local draft...");

    const result = await saveAccountDataDraft({
      premiseId,
      values,
      context,
      savedByUid: agentUid,
      savedByUser: agentName,
    });

    setBusyMessage("");

    if (result?.success) {
      Alert.alert(
        "Draft Saved",
        result?.message || "Account data draft saved locally.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/(tabs)/premises"),
          },
        ],
      );
      return;
    }

    Alert.alert(
      "Draft Save Failed",
      result?.message || "Failed to save account data draft.",
    );
  };

  const handleAddAccountFromHeader = ({
    values,
    touched,
    setFieldValue,
    setTouched,
    resetForm,
    validateForm,
  }) => {
    if (isEditingExistingAccount) {
      Alert.alert(
        "Start New Account Capture?",
        "This will clear the current edit form and open a clean account capture form.",
        [
          { text: "CANCEL", style: "cancel" },
          {
            text: "CONTINUE",
            onPress: () => {
              const blankValues = buildInitialValues();
              setEditAccountMasterId("");
              setFormMode("CREATE");
              setDraftValues(blankValues);
              resetForm({
                values: blankValues,
                touched: { accounts: [{ accountNo: true }] },
              });
              setTimeout(() => validateForm?.(blankValues), 0);
            },
          },
        ],
      );
      return;
    }

    if (!isFormOpen) {
      const blankValues = buildInitialValues();
      setEditAccountMasterId("");
      setFormMode("CREATE");
      setDraftValues(blankValues);
      resetForm({
        values: blankValues,
        touched: { accounts: [{ accountNo: true }] },
      });
      setTimeout(() => validateForm?.(blankValues), 0);
      return;
    }

    const currentAccounts = Array.isArray(values?.accounts) ? values.accounts : [];
    const nextAccounts = [...currentAccounts, { accountNo: "" }];
    const nextValues = {
      ...values,
      accounts: nextAccounts,
    };

    setFieldValue("accounts", nextAccounts, true);
    setTouched(
      {
        ...(touched || {}),
        accounts: nextAccounts.map(() => ({ accountNo: true })),
      },
      false,
    );
    setTimeout(() => validateForm?.(nextValues), 0);
  };

  const handleResetAccountDataForm = async (resetForm) => {
    Alert.alert(
      "Reset Form?",
      "This will clear all captured account data, media, draft values, and edit mode for this premise.",
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "YES, RESET",
          style: "destructive",
          onPress: async () => {
            const blankValues = buildInitialValues();
            setEditAccountMasterId("");
            setFormMode("CLOSED");
            setDraftValues(blankValues);
            await removeAccountDataDraftByPremiseId(premiseId);
            resetForm({ values: blankValues });
          },
        },
      ],
      { cancelable: true },
    );
  };

  const handleUseExistingOwner = ({ setFieldValue }) => {
    if (!latestOwnerAccountMaster) {
      Alert.alert(
        "No Existing Owner",
        "No existing owner data is available for this premise yet.",
      );
      return;
    }

    Alert.alert(
      "Use Existing Owner?",
      "This will copy the existing owner details into the owner fields. You can still edit the fields after copying.",
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "COPY",
          onPress: () => {
            const ownerValues = buildOwnerValuesFromAccountMaster(
              latestOwnerAccountMaster,
            );

            setFieldValue("owner", ownerValues);
          },
        },
      ],
    );
  };

  const saveSubmissionToLocalQueue = async ({
    cleanPayload,
    title = "SAVED LOCALLY",
    message = "Account data was saved to the Data Cleansing local queue for syncing later.",
  }) => {
    const result = await addAccountDataQueueItem({
      premiseId,
      payload: cleanPayload,
      context,
      createdByUid: agentUid,
      createdByUser: agentName,
    });

    if (result?.success) {
      await removeAccountDataDraftByPremiseId(premiseId);
      setSuccessTitle(title);
      setSuccessSub(message);
      setShowSuccess(true);
      return true;
    }

    Alert.alert(
      "Submit Failed",
      result?.message || "Failed to save account data to local queue.",
    );

    return false;
  };

  const handleSubmitAccountData = async (values, actions) => {
    if (!premiseId) {
      Alert.alert("Missing Premise", "Premise id is required to submit this form.");
      actions?.setSubmitting?.(false);
      return;
    }

    if (!premise?.id) {
      Alert.alert(
        "Premise Unavailable",
        "This premise is not available in the current synced ward. Please sync or select the correct ward and try again.",
      );
      actions?.setSubmitting?.(false);
      return;
    }

    const cleanPayload = buildCleanPayload({ premiseId, values });

    try {
      const netState = await NetInfo.fetch();
      const deviceOnline = Boolean(
        netState.isConnected && netState.isInternetReachable,
      );

      if (!deviceOnline) {
        setBusyMessage("Device offline. Saving to local account data queue...");

        await saveSubmissionToLocalQueue({
          cleanPayload,
          title: "SAVED LOCALLY",
          message:
            "Device is offline. Account data was saved to the Data Cleansing local queue for syncing later.",
        });

        return;
      }

      setBusyMessage("Uploading account data media...");

      const syncedMedia = await uploadAccountDataMedia({
        premiseId,
        media: cleanPayload.media,
      });

      const callablePayload = {
        ...cleanPayload,
        media: syncedMedia,
      };

      setBusyMessage("Submitting account data...");

      const callable = httpsCallable(functions, "onCreateAccountDataCallable");
      const response = await callable(callablePayload);
      const result = response?.data || {};

      if (!result?.success) {
        Alert.alert(
          "Account Data Not Submitted",
          result?.message ||
            "The backend did not accept this account data. Please correct the form and try again.",
        );
        return;
      }

      await removeAccountDataDraftByPremiseId(premiseId);

      setSuccessTitle("SUBMITTED");
      setSuccessSub(
        result?.fieldAccountDataId
          ? `Account data was submitted successfully. Field account data id: ${result.fieldAccountDataId}`
          : result?.message || "Account data was submitted successfully.",
      );
      setShowSuccess(true);
    } catch (error) {
      console.log("FormAccountData -- submit error", {
        code: error?.code,
        message: error?.message,
      });

      if (isOfflineOrNetworkError(error)) {
        setBusyMessage("Network unavailable. Saving to local account data queue...");

        await saveSubmissionToLocalQueue({
          cleanPayload,
          title: "SAVED LOCALLY",
          message:
            "Network was unavailable during submit. Account data was saved to the local queue for syncing later.",
        });

        return;
      }

      Alert.alert(
        "Submit Failed",
        error?.message ||
          "Account data could not be submitted. Please review the form and try again.",
      );
    } finally {
      setBusyMessage("");
      actions?.setSubmitting?.(false);
    }
  };


  const handleOpenExistingAccount = (accountMaster) => {
    if (!accountMaster?.id) return;

    const latestMedia = Array.isArray(accountMaster?.media)
      ? accountMaster.media
      : [];

    setEditAccountMasterId(accountMaster.id);
    setFormMode("EDIT");
    setDraftValues(buildValuesFromAccountMaster(accountMaster, latestMedia));
  };

  const handleCloseAccountCapture = (resetForm) => {
    const blankValues = buildInitialValues();

    setEditAccountMasterId("");
    setFormMode("CLOSED");
    setDraftValues(blankValues);
    resetForm?.({ values: blankValues });
  };

  const copyOwnerToOccupant = ({ values, setFieldValue }) => {
    Alert.alert(
      "Copy Owner to Occupant?",
      "Owner details will populate the occupant fields. You can still edit the occupant fields after copying.",
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "COPY",
          onPress: () => {
            const owner = values?.owner || {};

            if (owner?.ownerType === "JURISTIC_PERSON") {
              setFieldValue("occupant.name", owner?.juristicPerson?.registeredName || "");
              setFieldValue("occupant.surname", "");
              setFieldValue("occupant.idNumber", owner?.juristicPerson?.registrationNumber || "");
              setFieldValue("occupant.relationshipToOwner", "JURISTIC_OWNER");
            } else {
              setFieldValue("occupant.name", owner?.naturalPerson?.name || "");
              setFieldValue("occupant.surname", owner?.naturalPerson?.surname || "");
              setFieldValue("occupant.idNumber", owner?.naturalPerson?.idNumber || "");
              setFieldValue("occupant.relationshipToOwner", "OWNER");
            }

            setFieldValue("occupant.contact.phone", owner?.contact?.phone || "");
            setFieldValue("occupant.contact.whatsapp", owner?.contact?.whatsapp || "");
            setFieldValue("occupant.contact.email", owner?.contact?.email || "");
            setFieldValue("occupant.isOwner", "yes");
          },
        },
      ],
    );
  };

  if (!draftLoaded) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loaderText}>Loading account form...</Text>
      </View>
    );
  }

  if (!premise) {
    return (
      <View style={styles.loaderWrap}>
        <MaterialCommunityIcons name="home-alert-outline" size={52} color="#f59e0b" />
        <Text style={styles.loaderText}>Premise not available in the current synced ward.</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace("/(tabs)/premises")}
        >
          <Text style={styles.backBtnText}>BACK TO PREMISES</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <Formik
        initialValues={initialValues}
        validationSchema={AccountDataSchema}
        onSubmit={handleSubmitAccountData}
        enableReinitialize={true}
        validateOnMount={true}
        validateOnChange={true}
      >
        {({
          values,
          touched,
          setFieldValue,
          setTouched,
          errors,
          handleSubmit,
          isValid,
          dirty,
          isSubmitting,
          resetForm,
          validateForm,
        }) => (
          <View style={styles.screen}>
            <Stack.Screen
              options={{
                title: "FormAccountData",
                headerTitleStyle: { fontSize: 14, fontWeight: "900" },
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => router.replace("/(tabs)/premises")}
                    style={{ marginLeft: 10, padding: 5 }}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1e293b" />
                  </TouchableOpacity>
                ),
                headerRight: () => (
                  <View style={{ marginRight: 15 }}>
                    <Text style={styles.headerErfText}>{premise?.erfNo || "NAv"}</Text>
                  </View>
                ),
              }}
            />

            <ScrollView
              style={styles.container}
              contentContainerStyle={styles.contentContainer}
              keyboardShouldPersistTaps="handled"
            >
              <SectionCard icon="home-city-outline" title="Premise Summary">
                <Text style={styles.summaryAddress}>{premiseAddress || "NAv"}</Text>

                <View style={styles.summaryGrid}>
                  <View style={styles.summaryPill}>
                    <Text style={styles.summaryLabel}>ERF</Text>
                    <Text style={styles.summaryValue}>{premise?.erfNo || "NAv"}</Text>
                  </View>
                  <View style={styles.summaryPill}>
                    <Text style={styles.summaryLabel}>Ward</Text>
                    <Text style={styles.summaryValue}>{parents?.wardPcode || "NAv"}</Text>
                  </View>
                  <View style={styles.summaryPillWide}>
                    <Text style={styles.summaryLabel}>Property</Text>
                    <Text style={styles.summaryValue}>{propertyType || "NAv"}</Text>
                  </View>
                </View>
              </SectionCard>

              <SectionCard
                icon="account-cash-outline"
                title="Existing Accounts"
                rightAction={
                  <TouchableOpacity
                    style={[styles.headerAddAccountBtn, !!busyMessage && styles.disabledBtn]}
                    activeOpacity={0.85}
                    disabled={!!busyMessage}
                    onPress={() =>
                      handleAddAccountFromHeader({
                        values,
                        touched,
                        setFieldValue,
                        setTouched,
                        resetForm,
                        validateForm,
                      })
                    }
                  >
                    <MaterialCommunityIcons
                      name="plus-circle-outline"
                      size={16}
                      color="#ffffff"
                    />
                    <Text style={styles.headerAddAccountText}>ADD ACCOUNT</Text>
                  </TouchableOpacity>
                }
              >
                {accountMastersLoading ? (
                  <Text style={styles.infoText}>Loading existing account details...</Text>
                ) : accountMastersList.length > 0 ? (
                  <>
                    <Text style={styles.infoText}>
                      {accountMastersList.length} account
                      {accountMastersList.length === 1 ? "" : "s"} linked to
                      this premise.
                    </Text>

                    {accountMastersList.map((accountMaster) => (
                      <ExistingAccountCard
                        key={accountMaster.id}
                        accountMaster={accountMaster}
                        busy={!!busyMessage}
                        onEdit={handleOpenExistingAccount}
                      />
                    ))}
                  </>
                ) : accountCount > 0 ? (
                  <>
                    <Text style={styles.infoText}>
                      {accountCount} account{accountCount === 1 ? "" : "s"} linked to this premise.
                    </Text>
                    <Text style={styles.warningText}>
                      Account references exist, but account master details are
                      not available on this device yet. You can still capture
                      new account data.
                    </Text>
                  </>
                ) : (
                  <Text style={styles.infoText}>No accounts currently linked to this premise.</Text>
                )}

                {accountMastersHasError && (
                  <Text style={styles.warningText}>
                    Existing account details could not be loaded. You can still
                    capture new account data.
                  </Text>
                )}

                {!isOnline && (
                  <Text style={styles.warningText}>
                    Existing account details may be unavailable offline. You
                    can still capture new account data.
                  </Text>
                )}

                <Text style={styles.mutedText}>
                  {isFormOpen
                    ? "The account form is open below."
                    : "Tap ADD ACCOUNT to capture a new account, or OPEN / EDIT on an existing account."}
                </Text>
              </SectionCard>

              {isFormOpen && (
                <>
              <SectionCard
                icon="barcode-scan"
                title="Capture Account Numbers"
                rightAction={
                  <TouchableOpacity
                    onPress={() => handleCloseAccountCapture(resetForm)}
                    style={styles.cancelEditBtn}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons
                      name="close-circle-outline"
                      size={18}
                      color="#dc2626"
                    />
                    <Text style={styles.cancelEditText}>
                      {isEditingExistingAccount ? "Cancel Edit" : "Cancel Capture"}
                    </Text>
                  </TouchableOpacity>
                }
              >
                {isEditingExistingAccount ? (
                  <View>
                    <View style={styles.editModeBanner}>
                      <MaterialCommunityIcons
                        name="history"
                        size={18}
                        color="#0f172a"
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.editModeTitle}>
                          Editing Existing Account
                        </Text>
                        <Text style={styles.editModeSub}>
                          Submitting will create a new field_account_data
                          history record and update the current account master.
                        </Text>
                      </View>
                    </View>

                    <Surface style={styles.accountRowCard} elevation={0}>
                      <View style={styles.accountRowHeader}>
                        <Text style={styles.accountRowTitle}>
                          Account Number Locked
                        </Text>

                      </View>

                      <View style={styles.lockedAccountBox}>
                        <Text style={styles.lockedAccountNo}>
                          {values?.accounts?.[0]?.accountNo || "NAv"}
                        </Text>
                      </View>

                      <Text style={styles.mutedText}>
                        Account number changes are not allowed in edit mode.
                        Capture account-number corrections as a separate
                        future workflow.
                      </Text>
                    </Surface>
                  </View>
                ) : (
                  <FieldArray name="accounts">
                    {({ remove }) => (
                      <View>
                        {(values?.accounts || []).map((account, index) => (
                          <Surface key={index} style={styles.accountRowCard} elevation={0}>
                            <View style={styles.accountRowHeader}>
                              <Text style={styles.accountRowTitle}>Account {index + 1}</Text>
                              {values.accounts.length > 1 && (
                                <TouchableOpacity
                                  onPress={() => remove(index)}
                                  style={styles.removeAccountBtn}
                                >
                                  <MaterialCommunityIcons name="delete-outline" size={18} color="#dc2626" />
                                  <Text style={styles.removeAccountText}>Remove</Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            <FormInputAccountNo
                              label="Municipal Account Number"
                              name={`accounts.${index}.accountNo`}
                            />
                          </Surface>
                        ))}

                        {typeof errors?.accounts === "string" && (
                          <Text style={styles.formErrorText}>{errors.accounts}</Text>
                        )}
                      </View>
                    )}
                  </FieldArray>
                )}
              </SectionCard>

              <SectionCard
                icon="account-tie-outline"
                title="Owner"
                rightAction={
                  canUseExistingOwner ? (
                    <TouchableOpacity
                      style={[
                        styles.addExistingOwnerBtn,
                        !!busyMessage && styles.disabledBtn,
                      ]}
                      activeOpacity={0.85}
                      disabled={!!busyMessage}
                      onPress={() => handleUseExistingOwner({ setFieldValue })}
                    >
                      <MaterialCommunityIcons
                        name="account-arrow-left-outline"
                        size={15}
                        color="#ffffff"
                      />
                      <Text style={styles.addExistingOwnerText}>
                        ADD EXISTING OWNER
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
              >
                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      values.owner.ownerType === "NATURAL_PERSON" && styles.toggleBtnActive,
                    ]}
                    onPress={() => setFieldValue("owner.ownerType", "NATURAL_PERSON")}
                  >
                    <Text
                      style={[
                        styles.toggleBtnText,
                        values.owner.ownerType === "NATURAL_PERSON" && styles.toggleBtnTextActive,
                      ]}
                    >
                      Natural Person
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      values.owner.ownerType === "JURISTIC_PERSON" && styles.toggleBtnActive,
                    ]}
                    onPress={() => setFieldValue("owner.ownerType", "JURISTIC_PERSON")}
                  >
                    <Text
                      style={[
                        styles.toggleBtnText,
                        values.owner.ownerType === "JURISTIC_PERSON" && styles.toggleBtnTextActive,
                      ]}
                    >
                      Juristic Person
                    </Text>
                  </TouchableOpacity>
                </View>

                {values.owner.ownerType === "JURISTIC_PERSON" ? (
                  <>
                    <TextField
                      label="Registered Name"
                      value={values.owner.juristicPerson.registeredName}
                      onChangeText={(value) => setFieldValue("owner.juristicPerson.registeredName", value)}
                      error={getIn(errors, "owner.juristicPerson.registeredName")}
                    />
                    <TextField
                      label="Registration Number"
                      value={values.owner.juristicPerson.registrationNumber}
                      onChangeText={(value) => setFieldValue("owner.juristicPerson.registrationNumber", value)}
                    />
                    <TextField
                      label="Trading Name"
                      value={values.owner.juristicPerson.tradingName}
                      onChangeText={(value) => setFieldValue("owner.juristicPerson.tradingName", value)}
                    />
                  </>
                ) : (
                  <>
                    <TextField
                      label="Name"
                      value={values.owner.naturalPerson.name}
                      onChangeText={(value) => setFieldValue("owner.naturalPerson.name", value)}
                      error={getIn(errors, "owner.naturalPerson.name")}
                    />
                    <TextField
                      label="Surname"
                      value={values.owner.naturalPerson.surname}
                      onChangeText={(value) => setFieldValue("owner.naturalPerson.surname", value)}
                      error={getIn(errors, "owner.naturalPerson.surname")}
                    />
                    <TextField
                      label="ID Number"
                      value={values.owner.naturalPerson.idNumber}
                      onChangeText={(value) => setFieldValue("owner.naturalPerson.idNumber", value)}
                    />
                  </>
                )}

                <Text style={styles.subSectionTitle}>Owner Contact</Text>
                <TextField
                  label="Phone"
                  value={values.owner.contact.phone}
                  onChangeText={(value) => setFieldValue("owner.contact.phone", value)}
                  keyboardType="phone-pad"
                />
                <TextField
                  label="WhatsApp"
                  value={values.owner.contact.whatsapp}
                  onChangeText={(value) => setFieldValue("owner.contact.whatsapp", value)}
                  keyboardType="phone-pad"
                />
                <TextField
                  label="Email"
                  value={values.owner.contact.email}
                  onChangeText={(value) => setFieldValue("owner.contact.email", value)}
                  keyboardType="email-address"
                  error={getIn(errors, "owner.contact.email")}
                />
              </SectionCard>

              <SectionCard icon="account-outline" title="Occupant">
                <View style={styles.ownerOccupantRow}>
                  <Text style={styles.ownerOccupantText}>Is the occupant the owner?</Text>
                  <View style={styles.yesNoRow}>
                    <TouchableOpacity
                      style={[
                        styles.yesNoBtn,
                        values.occupant.isOwner === "yes" && styles.yesBtnActive,
                      ]}
                      onPress={() => copyOwnerToOccupant({ values, setFieldValue })}
                    >
                      <Text
                        style={[
                          styles.yesNoText,
                          values.occupant.isOwner === "yes" && styles.yesNoTextActive,
                        ]}
                      >
                        YES
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.yesNoBtn,
                        values.occupant.isOwner === "no" && styles.noBtnActive,
                      ]}
                      onPress={() => setFieldValue("occupant.isOwner", "no")}
                    >
                      <Text
                        style={[
                          styles.yesNoText,
                          values.occupant.isOwner === "no" && styles.yesNoTextActive,
                        ]}
                      >
                        NO
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TextField
                  label="Name"
                  value={values.occupant.name}
                  onChangeText={(value) => setFieldValue("occupant.name", value)}
                />
                <TextField
                  label="Surname"
                  value={values.occupant.surname}
                  onChangeText={(value) => setFieldValue("occupant.surname", value)}
                />
                <TextField
                  label="ID Number"
                  value={values.occupant.idNumber}
                  onChangeText={(value) => setFieldValue("occupant.idNumber", value)}
                />
                <TextField
                  label="Relationship to Owner"
                  value={values.occupant.relationshipToOwner}
                  onChangeText={(value) => setFieldValue("occupant.relationshipToOwner", value)}
                />

                <Text style={styles.subSectionTitle}>Occupant Contact</Text>
                <TextField
                  label="Phone"
                  value={values.occupant.contact.phone}
                  onChangeText={(value) => setFieldValue("occupant.contact.phone", value)}
                  keyboardType="phone-pad"
                />
                <TextField
                  label="WhatsApp"
                  value={values.occupant.contact.whatsapp}
                  onChangeText={(value) => setFieldValue("occupant.contact.whatsapp", value)}
                  keyboardType="phone-pad"
                />
                <TextField
                  label="Email"
                  value={values.occupant.contact.email}
                  onChangeText={(value) => setFieldValue("occupant.contact.email", value)}
                  keyboardType="email-address"
                  error={getIn(errors, "occupant.contact.email")}
                />
              </SectionCard>

              <SectionCard icon="camera-iris" title="Optional Media Evidence">
                <Text style={styles.mutedText}>
                  Media is optional. Capture evidence only when available.
                </Text>
                {ACCOUNT_DATA_MEDIA_TAGS.map((item) => (
                  <View key={item.tag} style={styles.mediaItemWrap}>
                    <Text style={styles.mediaLabel}>{item.label}</Text>
                    <IrepsMedia
                      name="media"
                      tag={item.tag}
                      agentName={agentName}
                      agentUid={agentUid}
                      fallbackGps={fallbackGps}
                      required={false}
                    />
                  </View>
                ))}
              </SectionCard>

              <TouchableOpacity
                style={styles.saveDraftBtn}
                onPress={() => handleSaveDraft(values)}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="content-save-outline" size={20} color="#0f172a" />
                <Text style={styles.saveDraftText}>SAVE DRAFT LOCALLY</Text>
              </TouchableOpacity>
                </>
              )}
            </ScrollView>

            {isFormOpen && (
              <AccountDataFooter
                loading={isSubmitting || !!busyMessage}
                isValid={isValid}
                dirty={dirty}
                onSubmit={handleSubmit}
                onReset={() => handleResetAccountDataForm(resetForm)}
              />
            )}
          </View>
        )}
      </Formik>

      <Portal>
        <Modal visible={!!busyMessage} dismissable={false} contentContainerStyle={styles.busyModal}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.busyText}>{busyMessage}</Text>
        </Modal>

        <Modal visible={showSuccess} dismissable={false} contentContainerStyle={styles.successModal}>
          <View style={styles.successContent}>
            <View style={styles.successIconCircle}>
              <Feather name="check" size={50} color="#fff" />
            </View>
            <Text style={styles.successTitle}>{successTitle}</Text>
            <Text style={styles.successSub}>{successSub}</Text>

            <TouchableOpacity
              style={styles.continueBtn}
              onPress={() => {
                setShowSuccess(false);
                router.replace("/(tabs)/premises");
              }}
            >
              <Text style={styles.continueBtnText}>CONTINUE</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F1F5F9" },
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  contentContainer: { padding: 12, paddingBottom: 24 },
  footerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  submitBtn: {
    flex: 1,
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    marginLeft: 10,
  },
  resetBtn: {
    flex: 0.35,
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    borderColor: "#e2e8f0",
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
    fontSize: 16,
    fontWeight: "800",
    color: "#64748b",
    textAlign: "center",
  },
  backBtn: {
    marginTop: 16,
    backgroundColor: "#0f172a",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backBtnText: { color: "#fff", fontWeight: "900" },
  headerErfText: { color: "#2563eb", fontSize: 14, fontWeight: "900" },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#E2E8F0",
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    paddingRight: 8,
  },
  sectionHeaderAction: {
    flexShrink: 0,
  },
  sectionTitle: { fontSize: 14, fontWeight: "900", color: "#0f172a" },
  sectionBody: { padding: 14 },
  summaryAddress: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 12,
  },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summaryPill: {
    minWidth: 92,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
  },
  summaryPillWide: {
    flex: 1,
    minWidth: 150,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
  },
  summaryLabel: {
    fontSize: 9,
    color: "#64748b",
    fontWeight: "900",
    textTransform: "uppercase",
  },
  summaryValue: { fontSize: 12, color: "#0f172a", fontWeight: "800", marginTop: 3 },
  infoText: { fontSize: 13, color: "#0f172a", fontWeight: "700", lineHeight: 19 },
  mutedText: { fontSize: 12, color: "#64748b", marginTop: 6, lineHeight: 18 },
  warningText: {
    fontSize: 12,
    color: "#b45309",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    fontWeight: "700",
  },
  headerAddAccountBtn: {
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  headerAddAccountText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  addExistingOwnerBtn: {
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: "#2563eb",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  addExistingOwnerText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
  existingAccountCard: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  existingAccountHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  existingAccountNo: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "900",
  },
  existingAccountOwner: {
    marginTop: 3,
    fontSize: 12,
    color: "#334155",
    fontWeight: "700",
  },
  existingAccountUpdated: {
    marginTop: 8,
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
  },
  openEditBtn: {
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: "#2563eb",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  openEditText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  disabledBtn: {
    opacity: 0.55,
  },
  editModeBanner: {
    backgroundColor: "#e0f2fe",
    borderWidth: 1,
    borderColor: "#7dd3fc",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    gap: 10,
  },
  editModeTitle: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 13,
  },
  editModeSub: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  cancelEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  cancelEditText: {
    color: "#dc2626",
    fontSize: 10,
    fontWeight: "900",
  },
  lockedAccountBox: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  lockedAccountNo: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  accountRowCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginBottom: 10,
  },
  accountRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  accountRowTitle: { fontSize: 12, color: "#0f172a", fontWeight: "900" },
  removeAccountBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  removeAccountText: { color: "#dc2626", fontSize: 10, fontWeight: "900" },
  formErrorText: {
    color: "#dc2626",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 8,
  },
  addAccountBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addAccountText: { color: "#0f172a", fontWeight: "900", fontSize: 12 },
  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  toggleBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  toggleBtnActive: { backgroundColor: "#0f172a", borderColor: "#0f172a" },
  toggleBtnText: { color: "#334155", fontSize: 12, fontWeight: "900" },
  toggleBtnTextActive: { color: "#fff" },
  fieldWrap: { marginBottom: 10 },
  fieldLabel: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "900",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  fieldLabelError: { color: "#dc2626" },
  textInputShell: {},
  textInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "600",
  },
  textInputError: {
    borderLeftWidth: 5,
    borderLeftColor: "#dc2626",
    backgroundColor: "#fff1f2",
  },
  subSectionTitle: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 11,
    color: "#0f172a",
    fontWeight: "900",
    textTransform: "uppercase",
  },
  ownerOccupantRow: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  ownerOccupantText: { color: "#0f172a", fontWeight: "900", marginBottom: 10 },
  yesNoRow: { flexDirection: "row", gap: 8 },
  yesNoBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  yesBtnActive: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  noBtnActive: { backgroundColor: "#0f172a", borderColor: "#0f172a" },
  yesNoText: { color: "#334155", fontSize: 12, fontWeight: "900" },
  yesNoTextActive: { color: "#fff" },
  mediaItemWrap: { marginTop: 12 },
  mediaLabel: { fontSize: 11, fontWeight: "900", color: "#334155", marginBottom: 4 },
  saveDraftBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  saveDraftText: { color: "#0f172a", fontSize: 13, fontWeight: "900" },
  busyModal: {
    backgroundColor: "white",
    padding: 24,
    margin: 40,
    borderRadius: 18,
    alignItems: "center",
  },
  busyText: { marginTop: 12, color: "#334155", fontWeight: "800", textAlign: "center" },
  successModal: {
    backgroundColor: "white",
    padding: 30,
    margin: 40,
    borderRadius: 20,
    alignItems: "center",
  },
  successContent: { alignItems: "center", width: "100%" },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#22C55E",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
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
  continueBtnText: { color: "#FFF", fontWeight: "bold", fontSize: 14 },
});
