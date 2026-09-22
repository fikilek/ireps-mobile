import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { Formik, useFormikContext } from "formik";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { Divider, Surface, Switch } from "react-native-paper";
import * as Yup from "yup";
import FormInput from "../../../components/forms/FormInput";
import FormMapPositioner from "../../../components/forms/FormMapPositioner";
import FormSelect from "../../../components/forms/FormSelect";
import { IrepsMedia } from "../../../components/media/IrepsMedia";
import { ScreenLock } from "../../../components/SceenLock";
import { useGeo } from "../../context/GeoContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../hooks/useAuth";
import {
  useCreatePremiseMutation,
  useGetPremiseByIdQuery,
  useUpdatePremiseMutation,
} from "../../redux/premisesApi";

import {
  addPremiseQueueItem,
  getPremiseQueueItemById,
  removePremiseQueueItem,
  updatePremiseQueueItem,
} from "../../utils/premiseSubmissionQueue";
import { ForensicFooter } from "../meters/ForensicFooter";
import {
  getMissingTargetedBatchContextFields,
  normalizeTargetedBatchContext,
  parseTargetedBatchAddress,
  parseTargetedBatchContextRouteParam,
} from "./targetedBatchPremiseContext";
import {
  DUPLICATE_CAPTURE_STATUSES,
  getDuplicateInitialStatus,
  getDuplicatePropertyTypeTemplate,
  isRepeatablePropertyType,
  reconcilePropertyTypeChange,
  requiresPropertyName,
  requiresUnitNo,
  sanitizePropertyTypeForSubmission,
  supportsUnitNo,
} from "./premiseRepeatability";
import { FORM_TEXT, HINT_PENDING_REWORD } from "../../theme/formColors";


const streetTypeOptions = [
  "Select...",
  "Street",
  "Road",
  "Avenue",
  "Drive",
  "Close",
  "Way",
  "Boulevard",
  "Crescent",
  "-",
];
const propertyTypeOptions = [
  "Select...",
  "Residential",
  "Commercial",
  "Industrial",
  "Sectional Title",
  "Townhouse Complex",
  "Vacant Land",
  "Flats",
  "Estate",
  "Church",
  "School",
  "Government",
  "Backroom",
];

const premiseOccupancySatusOptions = [
  "Select...",
  ...DUPLICATE_CAPTURE_STATUSES,
];

const GENERIC_ERF_CENTROID = { lat: -34.035, lng: 23.048 };

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function normalizeStrictRouteId(value) {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRequiredSourceString(value) {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveErfResetCentroid(erfGeo) {
  const lat = erfGeo?.centroid?.lat;
  const lng = erfGeo?.centroid?.lng;

  if (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }

  return { ...GENERIC_ERF_CENTROID };
}

function validateCanonicalDuplicateSource(
  source,
  normalizedRouteId,
  normalizedDuplicateId,
) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { source: null, error: "The source Premise is invalid." };
  }

  const sourceId = normalizeRequiredSourceString(source.id);
  const sourceErfId = normalizeRequiredSourceString(source.erfId);
  const sourceErfNo = normalizeRequiredSourceString(source.erfNo);
  const countryPcode = normalizeRequiredSourceString(
    source?.parents?.countryPcode,
  );
  const provincePcode = normalizeRequiredSourceString(
    source?.parents?.provincePcode,
  );
  const dmPcode = normalizeRequiredSourceString(source?.parents?.dmPcode);
  const lmPcode = normalizeRequiredSourceString(source?.parents?.lmPcode);
  const wardPcode = normalizeRequiredSourceString(source?.parents?.wardPcode);
  const sourceContext = source.context;

  if (
    !sourceId ||
    !sourceErfId ||
    !sourceErfNo ||
    !countryPcode ||
    !provincePcode ||
    !dmPcode ||
    !lmPcode ||
    !wardPcode
  ) {
    return {
      source: null,
      error: "The source Premise has incomplete relationship data.",
    };
  }

  if (sourceId !== normalizedDuplicateId) {
    return { source: null, error: "The source Premise ID does not match." };
  }

  if (sourceErfId !== normalizedRouteId) {
    return { source: null, error: "The source Premise is on another Erf." };
  }

  const duplicatePropertyType = getDuplicatePropertyTypeTemplate(
    source?.propertyType,
  );

  if (
    !duplicatePropertyType ||
    !isRepeatablePropertyType(duplicatePropertyType.type)
  ) {
    return {
      source: null,
      error: "The source Premise Property Type is not repeatable.",
    };
  }

  if (sourceContext !== "Township" && sourceContext !== "Suburb") {
    return {
      source: null,
      error: "The source Premise has invalid Property Context.",
    };
  }

  return {
    error: null,
    source: {
      id: sourceId,
      erfId: sourceErfId,
      erfNo: sourceErfNo,
      parents: {
        countryPcode,
        provincePcode,
        dmPcode,
        lmPcode,
        wardPcode,
      },
      context: sourceContext,
      address: {
        suburbName: source?.address?.suburbName,
        strNo: source?.address?.strNo,
        strName: source?.address?.strName,
        strType: source?.address?.strType,
      },
      propertyType: duplicatePropertyType,
      occupancy: {
        status: getDuplicateInitialStatus(source?.occupancy?.status),
      },
    },
  };
}

function getDuplicateIntegrityError({
  hasDuplicateIntent,
  hasPremiseIdKey,
  hasQueueItemIdKey,
  normalizedRouteId,
  normalizedDuplicateId,
  duplicateRouteKey,
  duplicateLatch,
}) {
  if (!hasDuplicateIntent) {
    return "Duplicate intent is no longer present.";
  }

  if (hasPremiseIdKey || hasQueueItemIdKey) {
    return "Duplicate mode conflicts with another Premise mode.";
  }

  if (!normalizedRouteId || !normalizedDuplicateId || !duplicateRouteKey) {
    return "Duplicate route IDs are invalid.";
  }

  if (!duplicateLatch || duplicateLatch.key !== duplicateRouteKey) {
    return "The current Duplicate source is not available.";
  }

  const validation = validateCanonicalDuplicateSource(
    duplicateLatch.source,
    normalizedRouteId,
    normalizedDuplicateId,
  );

  if (!validation.source) {
    return validation.error || "The current Duplicate source is invalid.";
  }

  return null;
}

function hasTaggedMedia(media, tag) {
  if (!Array.isArray(media)) return false;

  return media.some((item) => {
    if (!item) return false;
    return item.tag === tag;
  });
}

function isFilled(value) {
  return String(value || "").trim().length > 0;
}

function formatStreetName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(
      /(^|[^\p{L}\p{M}\p{N}])(\p{L})/gu,
      (_, boundary, letter) => `${boundary}${letter.toUpperCase()}`,
    );
}

function isSamePoint(a, b, tolerance = 0.000001) {
  if (!a || !b) return false;

  const aLat = Number(a?.lat);
  const aLng = Number(a?.lng);
  const bLat = Number(b?.lat);
  const bLng = Number(b?.lng);

  if (
    Number.isNaN(aLat) ||
    Number.isNaN(aLng) ||
    Number.isNaN(bLat) ||
    Number.isNaN(bLng)
  ) {
    return false;
  }

  return Math.abs(aLat - bLat) < tolerance && Math.abs(aLng - bLng) < tolerance;
}

function DuplicateGpsResetHydrator({
  enabled,
  initialResetCentroid,
  resetCentroid,
}) {
  const { setFieldValue, values } = useFormikContext();
  const previousResetCentroidRef = useRef(initialResetCentroid);
  const currentCentroid = values?.geometry?.centroid;

  useEffect(() => {
    const previousResetCentroid = previousResetCentroidRef.current;
    previousResetCentroidRef.current = resetCentroid;

    if (
      !enabled ||
      !isSamePoint(currentCentroid, previousResetCentroid) ||
      isSamePoint(currentCentroid, resetCentroid)
    ) {
      return;
    }

    setFieldValue("geometry.centroid", { ...resetCentroid }, false);
  }, [currentCentroid, enabled, resetCentroid, setFieldValue]);

  return null;
}

export default function FormPremise() {
  // console.log(`FormPremise ----mounted`);

  const [inProgress, setInProgress] = useState(false);

  const { all } = useWarehouse();

  const router = useRouter();

  const params = useLocalSearchParams();
  const {
    id,
    premiseId,
    duplicateId,
    queueItemId,
    targetedBatchContext: routeTargetedBatchContext,
  } = params;

  const hasDuplicateIntent = hasOwn(params, "duplicateId");
  const hasPremiseIdKey = hasOwn(params, "premiseId");
  const hasQueueItemIdKey = hasOwn(params, "queueItemId");
  const duplicateModeConflict = Boolean(
    hasDuplicateIntent && (hasPremiseIdKey || hasQueueItemIdKey),
  );
  const normalizedRouteId = normalizeStrictRouteId(id);
  const normalizedDuplicateId = normalizeStrictRouteId(duplicateId);
  const duplicateRouteKey =
    normalizedRouteId && normalizedDuplicateId
      ? JSON.stringify([normalizedRouteId, normalizedDuplicateId])
      : null;

  const isDuplicate = hasDuplicateIntent;
  const isEdit = !hasDuplicateIntent && !!premiseId;
  const isQueueEdit = !hasDuplicateIntent && !!queueItemId;
  const isEditLike = isEdit || isQueueEdit;

  const sourcePremise = useMemo(() => {
    if (!isEdit) return null;

    const targetId = premiseId;
    if (!targetId) return null;
    return all?.prems?.find((p) => p.id === targetId);
  }, [all?.prems, isEdit, premiseId]);

  const localDuplicateCandidate = useMemo(() => {
    if (
      !hasDuplicateIntent ||
      duplicateModeConflict ||
      !normalizedRouteId ||
      !normalizedDuplicateId ||
      !Array.isArray(all?.prems)
    ) {
      return null;
    }

    return (
      all.prems.find(
        (premise) =>
          normalizeStrictRouteId(premise?.id) === normalizedDuplicateId,
      ) || null
    );
  }, [
    all?.prems,
    duplicateModeConflict,
    hasDuplicateIntent,
    normalizedDuplicateId,
    normalizedRouteId,
  ]);

  const localDuplicateResolution = useMemo(() => {
    if (!localDuplicateCandidate) return null;

    return validateCanonicalDuplicateSource(
      localDuplicateCandidate,
      normalizedRouteId,
      normalizedDuplicateId,
    );
  }, [localDuplicateCandidate, normalizedDuplicateId, normalizedRouteId]);

  const [duplicateLatch, setDuplicateLatch] = useState(null);
  const [duplicateCentroidSeed, setDuplicateCentroidSeed] = useState(null);

  useEffect(() => {
    const latchIsEffective = Boolean(
      hasDuplicateIntent && !duplicateModeConflict && duplicateRouteKey,
    );

    setDuplicateLatch((currentLatch) => {
      if (
        !currentLatch ||
        (latchIsEffective && currentLatch.key === duplicateRouteKey)
      ) {
        return currentLatch;
      }

      return null;
    });

    setDuplicateCentroidSeed((currentSeed) => {
      if (
        !currentSeed ||
        (latchIsEffective && currentSeed.key === duplicateRouteKey)
      ) {
        return currentSeed;
      }

      return null;
    });
  }, [duplicateModeConflict, duplicateRouteKey, hasDuplicateIntent]);

  const currentDuplicateLatchResolution = useMemo(() => {
    if (!duplicateRouteKey || duplicateLatch?.key !== duplicateRouteKey) {
      return null;
    }

    return validateCanonicalDuplicateSource(
      duplicateLatch.source,
      normalizedRouteId,
      normalizedDuplicateId,
    );
  }, [
    duplicateLatch,
    duplicateRouteKey,
    normalizedDuplicateId,
    normalizedRouteId,
  ]);
  const hasValidCurrentDuplicateLatch = Boolean(
    hasDuplicateIntent &&
      !duplicateModeConflict &&
      duplicateRouteKey &&
      duplicateLatch?.key === duplicateRouteKey &&
      currentDuplicateLatchResolution?.source,
  );
  const canonicalDuplicateSource = hasValidCurrentDuplicateLatch
    ? currentDuplicateLatchResolution.source
    : null;
  const duplicateErfGeo =
    normalizedRouteId && all?.geoLibrary
      ? all.geoLibrary[normalizedRouteId] || null
      : null;
  const skipDuplicateResolver = !(
    hasDuplicateIntent &&
    !duplicateModeConflict &&
    normalizedRouteId &&
    normalizedDuplicateId &&
    !localDuplicateCandidate &&
    !hasValidCurrentDuplicateLatch
  );

  const {
    data: duplicateResolverData,
    error: duplicateResolverError,
    isError: isDuplicateResolverError,
    isFetching: isDuplicateResolverFetching,
    isLoading: isDuplicateResolverLoading,
    refetch: refetchDuplicateSource,
  } = useGetPremiseByIdQuery(normalizedDuplicateId || "", {
    skip: skipDuplicateResolver,
    refetchOnMountOrArgChange: true,
  });

  const serverDuplicateResolution = useMemo(() => {
    if (duplicateResolverData?.status !== "found") return null;

    return validateCanonicalDuplicateSource(
      duplicateResolverData.premise,
      normalizedRouteId,
      normalizedDuplicateId,
    );
  }, [duplicateResolverData, normalizedDuplicateId, normalizedRouteId]);

  useEffect(() => {
    if (
      !hasDuplicateIntent ||
      duplicateModeConflict ||
      !duplicateRouteKey ||
      hasValidCurrentDuplicateLatch
    ) {
      return;
    }

    const resolvedSource = localDuplicateCandidate
      ? localDuplicateResolution?.source
      : !isDuplicateResolverLoading && !isDuplicateResolverFetching
        ? serverDuplicateResolution?.source
        : null;

    if (!resolvedSource) return;

    setDuplicateCentroidSeed({
      key: duplicateRouteKey,
      centroid: resolveErfResetCentroid(duplicateErfGeo),
    });
    setDuplicateLatch({ key: duplicateRouteKey, source: resolvedSource });
  }, [
    duplicateErfGeo,
    duplicateModeConflict,
    duplicateRouteKey,
    hasDuplicateIntent,
    hasValidCurrentDuplicateLatch,
    isDuplicateResolverFetching,
    isDuplicateResolverLoading,
    localDuplicateCandidate,
    localDuplicateResolution?.source,
    serverDuplicateResolution?.source,
  ]);

  const duplicateResolution = useMemo(() => {
    if (!hasDuplicateIntent) return null;

    if (duplicateModeConflict) {
      return {
        state: "MODE CONFLICT",
        message: "Duplicate cannot be combined with Edit or Queue Edit.",
      };
    }

    if (!normalizedRouteId || !normalizedDuplicateId) {
      return {
        state: "INVALID ROUTE",
        message: "The Duplicate route contains invalid Premise or Erf IDs.",
      };
    }

    if (hasValidCurrentDuplicateLatch) {
      return { state: "VALID DUPLICATE", message: null };
    }

    if (localDuplicateCandidate) {
      if (!localDuplicateResolution?.source) {
        return {
          state: "INVALID SOURCE",
          message:
            localDuplicateResolution?.error ||
            "The local source Premise is invalid.",
        };
      }

      return {
        state: "PENDING SOURCE",
        message: "Preparing the local Premise source.",
      };
    }

    if (isDuplicateResolverLoading || isDuplicateResolverFetching) {
      return {
        state: "PENDING SOURCE",
        message: "Resolving the Premise source from the server.",
      };
    }

    if (isDuplicateResolverError) {
      return {
        state: "SOURCE ERROR",
        message:
          duplicateResolverError?.message ||
          "The Premise source could not be resolved from the server.",
      };
    }

    if (duplicateResolverData?.status === "missing") {
      return {
        state: "SOURCE MISSING",
        message: "The Premise source does not exist on the server.",
      };
    }

    if (duplicateResolverData?.status === "found") {
      if (!serverDuplicateResolution?.source) {
        return {
          state: "INVALID SOURCE",
          message:
            serverDuplicateResolution?.error ||
            "The server source Premise is invalid.",
        };
      }

      return {
        state: "PENDING SOURCE",
        message: "Preparing the server Premise source.",
      };
    }

    return {
      state: "PENDING SOURCE",
      message: "Resolving the Premise source.",
    };
  }, [
    duplicateModeConflict,
    duplicateResolverData,
    duplicateResolverError?.message,
    hasDuplicateIntent,
    hasValidCurrentDuplicateLatch,
    isDuplicateResolverError,
    isDuplicateResolverFetching,
    isDuplicateResolverLoading,
    localDuplicateCandidate,
    localDuplicateResolution,
    normalizedDuplicateId,
    normalizedRouteId,
    serverDuplicateResolution,
  ]);

  const [queueItem, setQueueItem] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadQueueItem() {
      if (!isQueueEdit) {
        if (mounted) setQueueItem(null);
        return;
      }

      const item = await getPremiseQueueItemById(queueItemId);
      if (mounted) setQueueItem(item || null);
    }

    loadQueueItem();

    return () => {
      mounted = false;
    };
  }, [isQueueEdit, queueItemId]);

  const { profile, user } = useAuth();

  const agentUid = user?.uid || "unknown_uid";
  // console.log(`agentUid`, agentUid);

  const agentName = profile?.profile?.displayName || "Field Agent";
  // console.log(`agentName`, agentName);

  const { geoState, updateGeo } = useGeo();

  const selectedErf = geoState?.selectedErf || null;

  // TB-R051: the batch goes with the work. The form keeps the batch it opened with: the route param is the
  // checked context and wins over the selected ERF's; without it, the selected ERF's context when the form
  // opened. A later change of the selected ERF neither drops nor swaps it, and an ordinary form ignores a
  // context that appears on the selected ERF after it opened. When the router reuses this open form with
  // new params (e.g. "Ordinary premise" chosen from the Maps tab), the batch is captured again for them.
  const openedRouteKey = JSON.stringify([
    id ?? null,
    premiseId ?? null,
    duplicateId ?? null,
    queueItemId ?? null,
    routeTargetedBatchContext === undefined ? "__no_batch_param__" : routeTargetedBatchContext,
  ]);
  const captureOpenedTargetedBatch = () => {
    const routeCarriesBatch = routeTargetedBatchContext !== undefined;

    return {
      key: openedRouteKey,
      originated:
        routeCarriesBatch || hasOwn(selectedErf, "targetedBatchContext"),
      context: routeCarriesBatch
        ? parseTargetedBatchContextRouteParam(routeTargetedBatchContext)
        : normalizeTargetedBatchContext(selectedErf?.targetedBatchContext),
    };
  };
  const [openedTargetedBatch, setOpenedTargetedBatch] = useState(captureOpenedTargetedBatch);
  // Set while rendering (React's pattern for state derived from changed props), so no render uses the old batch.
  if (openedTargetedBatch.key !== openedRouteKey) {
    setOpenedTargetedBatch(captureOpenedTargetedBatch());
  }

  const queueTargetedBatchContext = isDuplicate
    ? undefined
    : queueItem?.payload?.targetedBatchContext;

  // An offline queue edit reads its batch from the queue item, as before.
  const originatedFromTargetedBatch = Boolean(
    !isDuplicate &&
      (isQueueEdit
        ? routeTargetedBatchContext !== undefined ||
          hasOwn(selectedErf, "targetedBatchContext") ||
          hasOwn(queueItem?.payload, "targetedBatchContext")
        : openedTargetedBatch.originated),
  );

  const targetedBatchContext = useMemo(() => {
    if (isDuplicate) return null;

    if (isQueueEdit) {
      return normalizeTargetedBatchContext(queueTargetedBatchContext);
    }

    return openedTargetedBatch.context;
  }, [
    isDuplicate,
    isQueueEdit,
    queueTargetedBatchContext,
    openedTargetedBatch,
  ]);

  const targetGeo = isDuplicate
    ? null
    : all?.geoLibrary?.[id] || all?.geoLibrary?.[selectedErf?.erfId] || null;

  const erfNo = isDuplicate
    ? canonicalDuplicateSource?.erfNo || "NAv"
    : queueItem?.payload?.erfNo ||
      sourcePremise?.erfNo ||
      selectedErf?.erfNo ||
      targetGeo?.erfNo ||
      "NAv";

  const duplicateResetCentroid = useMemo(
    () => resolveErfResetCentroid(duplicateErfGeo),
    [duplicateErfGeo],
  );

  const erfCentroid = useMemo(() => {
    if (hasValidCurrentDuplicateLatch) {
      return duplicateResetCentroid;
    }

    if (targetGeo?.centroid?.lat != null && targetGeo?.centroid?.lng != null) {
      return {
        lat: targetGeo.centroid.lat,
        lng: targetGeo.centroid.lng,
      };
    }

    return { ...GENERIC_ERF_CENTROID };
  }, [duplicateResetCentroid, hasValidCurrentDuplicateLatch, targetGeo]);

  const initialErfCentroid =
    isDuplicate && duplicateCentroidSeed?.key === duplicateRouteKey
      ? duplicateCentroidSeed.centroid
      : erfCentroid;

  const admin = isDuplicate
    ? null
    : String(selectedErf?.id || selectedErf?.erfId || "").trim() ===
        String(id || "").trim()
      ? selectedErf?.admin
      : targetGeo?.admin;

  const unitNoValidationContext = useMemo(() => {
    const originalPropertyType = isQueueEdit
      ? queueItem?.payload?.propertyType
      : isEdit
        ? sourcePremise?.propertyType
        : null;

    return {
      mode: isQueueEdit
        ? "QUEUE_EDIT"
        : isEdit
          ? "EDIT"
          : isDuplicate
            ? "DUPLICATE"
            : "NEW",
      originalType: originalPropertyType?.type || "",
      originalUnitNo: originalPropertyType?.unitNo || "",
    };
  }, [
    isDuplicate,
    isEdit,
    isQueueEdit,
    queueItem?.payload?.propertyType,
    sourcePremise?.propertyType,
  ]);

  const premiseSchema = useMemo(() => {
    return Yup.object().shape({
      address: Yup.object().shape({
        suburbName: Yup.string().trim().required("Mandatory"),
        strNo: Yup.string().trim().required("Mandatory"),
        strName: Yup.string().trim().required("Mandatory"),
        strType: Yup.string()
          .notOneOf(["Select..."], "Please select a street type")
          .required("Required"),
      }),

      propertyType: Yup.object().shape({
        type: Yup.string()
          .notOneOf(["Select..."], "Please select a property type")
          .required("Required"),

        name: Yup.string().when("type", {
          is: (val) => requiresPropertyName(val),
          then: (schema) => schema.trim().required("Unit Name is mandatory"),
          otherwise: (schema) => schema.optional(),
        }),

        unitNo: Yup.string().when("type", {
          is: (val) => requiresUnitNo(val, unitNoValidationContext),
          then: (schema) => schema.trim().required("Unit No is mandatory"),
          otherwise: (schema) => schema.optional(),
        }),
      }),

      context: Yup.string()
        .oneOf(["Township", "Suburb"], "Please select a valid category")
        .required("Required"),

      occupancy: Yup.object().shape({
        status: Yup.string()
          .oneOf(
            [
              "Occupied",
              "Unoccupied",
              "Vandalised",
              "Under Construction",
              "Dilapidated",
              "Accessed",
            ],
            "Invalid Status",
          )
          .required("Required"),
      }),

      geometry: Yup.object().shape({
        centroid: Yup.object()
          .shape({
            lat: Yup.number().required("Latitude is required"),
            lng: Yup.number().required("Longitude is required"),
          })
          .test(
            "moved-from-erf-centroid",
            "You must move the GPS pin away from the default ERF position",
            function (value) {
              if (isEditLike) return true;

              const hasValidPoint =
                typeof value?.lat === "number" &&
                typeof value?.lng === "number";

              if (!hasValidPoint) return false;

              const hasDefaultPoint =
                typeof erfCentroid?.lat === "number" &&
                typeof erfCentroid?.lng === "number";

              if (!hasDefaultPoint) return true;

              return !isSamePoint(value, erfCentroid);
            },
          ),
      }),

      media: Yup.array()
        .default([])
        .test(
          "property-address-photo-required",
          "Property Address photo is mandatory once street number and street name are completed",
          (media, context) => {
            const strNo = context?.parent?.address?.strNo;
            const strName = context?.parent?.address?.strName;

            const addressCompleted = isFilled(strNo) && isFilled(strName);

            if (!addressCompleted) return true;

            return hasTaggedMedia(media, "propertyAdrPhoto");
          },
        ),
    });
  }, [erfCentroid, isEditLike, unitNoValidationContext]);

  const selectedErfIsTownship = isDuplicate
    ? null
    : selectedErf?.isTownship;

  const initialValues = useMemo(() => {
    const baseGeometry = {
      centroid: {
        lat: initialErfCentroid?.lat,
        lng: initialErfCentroid?.lng,
      },
    };

    const baseContext = selectedErfIsTownship ? "Township" : "Suburb";

    // QUEUE EDIT
    if (isQueueEdit && queueItem?.payload) {
      const payload = queueItem.payload;

      return {
        context: payload?.context || baseContext,

        address: {
          suburbName: payload?.address?.suburbName || "",
          strNo: payload?.address?.strNo || "",
          strName: payload?.address?.strName || "",
          strType: payload?.address?.strType || "Select...",
        },

        propertyType: {
          type: payload?.propertyType?.type || "Select...",
          name: payload?.propertyType?.name || "",
          unitNo: payload?.propertyType?.unitNo || "",
        },

        occupancy: {
          status: payload?.occupancy?.status || "Occupied",
        },

        geometry: payload?.geometry?.centroid
          ? {
              centroid: {
                lat: payload.geometry.centroid.lat,
                lng: payload.geometry.centroid.lng,
              },
            }
          : baseGeometry,

        media: Array.isArray(payload?.media) ? payload.media : [],
      };
    }

    // EDIT
    if (isEdit && sourcePremise) {
      return {
        context: sourcePremise?.context || baseContext,

        address: {
          suburbName: sourcePremise?.address?.suburbName || "",
          strNo: sourcePremise?.address?.strNo || "",
          strName: sourcePremise?.address?.strName || "",
          strType: sourcePremise?.address?.strType || "Select...",
        },

        propertyType: {
          type: sourcePremise?.propertyType?.type || "Select...",
          name: sourcePremise?.propertyType?.name || "",
          unitNo: sourcePremise?.propertyType?.unitNo || "",
        },

        occupancy: {
          status: sourcePremise?.occupancy?.status || "Occupied",
        },

        geometry: sourcePremise?.geometry?.centroid
          ? {
              centroid: {
                lat: sourcePremise.geometry.centroid.lat,
                lng: sourcePremise.geometry.centroid.lng,
              },
            }
          : baseGeometry,

        media: Array.isArray(sourcePremise?.media) ? sourcePremise.media : [],
      };
    }

    // DUPLICATE
    if (isDuplicate && canonicalDuplicateSource) {
      return {
        context: canonicalDuplicateSource.context,

        address: {
          suburbName: canonicalDuplicateSource?.address?.suburbName || "",
          strNo: canonicalDuplicateSource?.address?.strNo || "",
          strName: canonicalDuplicateSource?.address?.strName || "",
          strType:
            canonicalDuplicateSource?.address?.strType || "Select...",
        },

        propertyType: {
          type: canonicalDuplicateSource?.propertyType?.type || "Select...",
          name: canonicalDuplicateSource?.propertyType?.name || "",
          unitNo: "",
        },

        occupancy: {
          status: canonicalDuplicateSource?.occupancy?.status || "Select...",
        },

        geometry: baseGeometry,

        media: [],
      };
    }

    // NEW
    const targetedBatchAddress = targetedBatchContext
      ? parseTargetedBatchAddress(targetedBatchContext.sourceAddress)
      : null;

    return {
      context: baseContext,

      address: {
        suburbName: targetedBatchAddress?.suburbName || "",
        strNo: targetedBatchAddress?.strNo || "",
        strName: targetedBatchAddress?.strName || "",
        strType: targetedBatchAddress?.strType || "Select...",
      },

      propertyType: {
        type: "Select...",
        name: "",
        unitNo: "",
      },

      occupancy: {
        status: "Occupied",
      },

      geometry: baseGeometry,

      media: [],
    };
  }, [
    isEdit,
    isDuplicate,
    canonicalDuplicateSource,
    sourcePremise,
    initialErfCentroid,
    selectedErfIsTownship,
    isQueueEdit,
    queueItem,
    targetedBatchContext,
  ]);

  const [createPremise] = useCreatePremiseMutation();
  // const [addPremise] = useAddPremiseMutation();

  const [updatePremise] = useUpdatePremiseMutation(); // 🎯 Ensure this is in your API slice

  function buildSystemFields() {
    const timestamp = new Date().toISOString();

    const stampedParents = {
      countryPcode: admin?.country?.pcode || null,
      provincePcode: admin?.province?.pcode || null,
      dmPcode: admin?.district?.pcode || null,
      lmPcode: admin?.localMunicipality?.pcode || null,
      wardPcode: admin?.ward?.pcode || null,
    };

    const wardNo = isDuplicate
      ? canonicalDuplicateSource?.parents?.wardPcode?.slice(-3) || "UNK"
      : admin?.ward?.name?.match(/\d+/)?.[0] ||
        admin?.ward?.pcode?.slice(-3) ||
        "UNK";

    const safeErfNo = String(erfNo || "N-A").replace(/\//g, "-");

    const generatedId = `PRM_${Date.now()}_${Math.floor(
      Math.random() * 1000,
    )}_W${wardNo}_${safeErfNo}`;

    if (isDuplicate) {
      return {
        id: generatedId,
        schemaVersion: "1.0.0",
        erfId: canonicalDuplicateSource.erfId,
        erfNo: canonicalDuplicateSource.erfNo,
        parents: {
          countryPcode: canonicalDuplicateSource.parents.countryPcode,
          provincePcode: canonicalDuplicateSource.parents.provincePcode,
          dmPcode: canonicalDuplicateSource.parents.dmPcode,
          lmPcode: canonicalDuplicateSource.parents.lmPcode,
          wardPcode: canonicalDuplicateSource.parents.wardPcode,
        },
        services: {
          electricityMeters: [],
          waterMeters: [],
        },
        metadata: {
          createdAt: timestamp,
          createdByUid: agentUid || "unknown_uid",
          createdByUser: agentName || "Field Agent",
          updatedAt: timestamp,
          updatedByUid: agentUid || "unknown_uid",
          updatedByUser: agentName || "Field Agent",
        },
        noAccessTrnIds: [],
      };
    }

    if (isEdit || isQueueEdit) {
      const sourceData = isQueueEdit ? queueItem?.payload : sourcePremise;

      return {
        id: sourceData?.id,
        schemaVersion: sourceData?.schemaVersion || "1.0.0",
        erfId: sourceData?.erfId || id,
        erfNo: sourceData?.erfNo || erfNo,

        parents: {
          countryPcode:
            sourceData?.parents?.countryPcode || stampedParents.countryPcode,
          provincePcode:
            sourceData?.parents?.provincePcode || stampedParents.provincePcode,
          dmPcode: sourceData?.parents?.dmPcode || stampedParents.dmPcode,
          lmPcode: sourceData?.parents?.lmPcode || stampedParents.lmPcode,
          wardPcode: sourceData?.parents?.wardPcode || stampedParents.wardPcode,
        },

        services: {
          electricityMeters: Array.isArray(
            sourceData?.services?.electricityMeters,
          )
            ? sourceData.services.electricityMeters
            : [],
          waterMeters: Array.isArray(sourceData?.services?.waterMeters)
            ? sourceData.services.waterMeters
            : [],
        },

        metadata: {
          createdAt: sourceData?.metadata?.createdAt || timestamp,
          createdByUid:
            sourceData?.metadata?.createdByUid || agentUid || "unknown_uid",
          createdByUser:
            sourceData?.metadata?.createdByUser || agentName || "Field Agent",

          updatedAt: timestamp,
          updatedByUid: agentUid || "unknown_uid",
          updatedByUser: agentName || "Field Agent",
        },

        noAccessTrnIds: Array.isArray(sourceData?.noAccessTrnIds)
          ? sourceData.noAccessTrnIds
          : [],
      };
    }

    return {
      id: generatedId,
      schemaVersion: "1.0.0",
      erfId: id,
      erfNo: erfNo,
      parents: stampedParents,

      services: {
        electricityMeters: [],
        waterMeters: [],
      },

      metadata: {
        createdAt: timestamp,
        createdByUid: agentUid || "unknown_uid",
        createdByUser: agentName || "Field Agent",

        updatedAt: timestamp,
        updatedByUid: agentUid || "unknown_uid",
        updatedByUser: agentName || "Field Agent",
      },

      noAccessTrnIds: [],
    };
  }

  function withSubmitTimeout(promise, timeoutMs = 10000) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error("SUBMISSION_TIMEOUT"));
        }, timeoutMs),
      ),
    ]);
  }

  const handleSubmit = async (values, { setSubmitting }) => {
    if (isDuplicate) {
      const integrityError = getDuplicateIntegrityError({
        hasDuplicateIntent,
        hasPremiseIdKey,
        hasQueueItemIdKey,
        normalizedRouteId,
        normalizedDuplicateId,
        duplicateRouteKey,
        duplicateLatch,
      });

      if (integrityError) {
        ToastAndroid.show(integrityError, ToastAndroid.LONG);
        return;
      }
    }

    // console.log(` `);
    // console.log(` `);
    // console.log(` `);
    // const submitStartedAtMs = Date.now();

    // const logSubmitTime = (label) => {
    //   const elapsedSeconds = ((Date.now() - submitStartedAtMs) / 1000).toFixed(
    //     2,
    //   );
    //   console.log(
    //     `⏱️ FormPremise submit timing -- ${label}: ${elapsedSeconds}s`,
    //   );
    // };

    setInProgress(true);
    // logSubmitTime("START");

    console.log(`FormPremise handleSubmit --values`, values);

    try {
      const systemFields = buildSystemFields();
      const premiseDocId = systemFields.id;
      const linkedTargetedBatchContext =
        !isEdit && !isDuplicate ? targetedBatchContext : null;

      // TB-R051: a batch row selected elsewhere after the form opened never replaces the form's batch.
      const laterSelectedErfContext = normalizeTargetedBatchContext(
        selectedErf?.targetedBatchContext,
      );

      if (
        linkedTargetedBatchContext &&
        laterSelectedErfContext &&
        (laterSelectedErfContext.tbId !== linkedTargetedBatchContext.tbId ||
          laterSelectedErfContext.rowId !== linkedTargetedBatchContext.rowId)
      ) {
        console.log("[FORM PREMISE][TB CONTEXT KEPT]", {
          tbId: linkedTargetedBatchContext.tbId,
          rowId: linkedTargetedBatchContext.rowId,
          selectedErfTbId: laterSelectedErfContext.tbId,
          selectedErfRowId: laterSelectedErfContext.rowId,
        });
      }

      if (!isEdit && !isDuplicate && originatedFromTargetedBatch) {
        const missingContextFields = getMissingTargetedBatchContextFields(
          linkedTargetedBatchContext,
        );

        if (missingContextFields.length > 0) {
          console.warn("Targeted Batch premise submission blocked", {
            missingFields: missingContextFields,
            tbId: linkedTargetedBatchContext?.tbId || null,
            rowId: linkedTargetedBatchContext?.rowId || null,
            salesDocId: linkedTargetedBatchContext?.salesDocId || null,
            erfId: linkedTargetedBatchContext?.erfId || null,
          });
          throw new Error(
            `Targeted Batch context is incomplete: ${missingContextFields.join(", ")}.`,
          );
        }

        if (
          linkedTargetedBatchContext.erfId !==
          String(systemFields?.erfId || "").trim()
        ) {
          throw new Error(
            "Targeted Batch ERF context does not match the premise ERF.",
          );
        }
      }

      // logSubmitTime("system fields built");

      const netState = await NetInfo.fetch();
      const isOnline = Boolean(
        netState?.isConnected && netState?.isInternetReachable,
      );
      // logSubmitTime(`network checked -- isOnline=${isOnline}`);

      /* ------------------------------------------------
     1. BUILD BASE PAYLOAD FIRST
     This is what we save offline OR sync online
     ------------------------------------------------ */
      const originalPropertyTypeForSubmission = isQueueEdit
        ? queueItem?.payload?.propertyType
        : isEdit
          ? sourcePremise?.propertyType
          : null;

      const submittedPropertyType = sanitizePropertyTypeForSubmission(
        values?.propertyType,
        {
          mode: unitNoValidationContext.mode,
          originalPropertyType: originalPropertyTypeForSubmission,
        },
      );

      const basePayload = JSON.parse(
        JSON.stringify(
          {
            ...systemFields,

            context: values.context,

            address: {
              suburbName: String(values?.address?.suburbName || "").trim(),
              strNo: String(values?.address?.strNo || "").trim(),
              strName: String(values?.address?.strName || "").trim(),
              strType: values?.address?.strType || "Select...",
            },

            propertyType: submittedPropertyType,

            occupancy: {
              status: values?.occupancy?.status || "Occupied",
            },

            ...(linkedTargetedBatchContext
              ? {
                  targetedBatchContext: linkedTargetedBatchContext,
                }
              : {}),

            geometry: {
              centroid: {
                lat: values?.geometry?.centroid?.lat,
                lng: values?.geometry?.centroid?.lng,
              },
            },

            // IMPORTANT:
            // offline queue keeps media uri
            media: Array.isArray(values?.media) ? values.media : [],
          },
          (key, value) => (value === undefined ? null : value),
        ),
      );
      // logSubmitTime("base payload built");

      /* ------------------------------------------------
     2. OFFLINE -> SAVE / UPDATE QUEUE
     Same model as FormMeterDiscovery
     ------------------------------------------------ */
      if (!isOnline) {
        if (queueItemId) {
          await updatePremiseQueueItem(
            queueItemId,
            {
              payload: basePayload,
              status: "PENDING",
              result: {
                success: false,
                code: "NAv",
                message: "NAv",
                premiseId: "NAv",
              },
            },
            agentUid,
            agentName,
          );
        } else {
          await addPremiseQueueItem({
            payload: basePayload,
            createdByUid: agentUid,
            createdByUser: agentName,
          });
        }

        // logSubmitTime("saved offline queue");

        ToastAndroid.show(
          "No network. Premise saved to offline storage.",
          ToastAndroid.LONG,
        );

        router.replace("/(tabs)/admin/storage/premise-offline-storage");
        // logSubmitTime("OFFLINE END");
        return;
      }

      /* ------------------------------------------------
     3. ONLINE -> upload any local media first
     ------------------------------------------------ */
      const storage = getStorage();

      // const uploadStartedAtMs = Date.now();

      const syncedMedia = await Promise.all(
        (basePayload?.media || []).map(async (item, index) => {
          if (item?.uri && !item?.url) {
            const mediaStartedAtMs = Date.now();

            const fileName = `${premiseDocId}_${item.tag}_${Date.now()}.jpg`;

            const storageRef = ref(
              storage,
              `premises/${premiseDocId}/${fileName}`,
            );

            const response = await fetch(item.uri);
            const blob = await response.blob();

            await uploadBytes(storageRef, blob);
            const downloadUrl = await getDownloadURL(storageRef);

            const mediaElapsedSeconds = (
              (Date.now() - mediaStartedAtMs) /
              1000
            ).toFixed(2);

            console.log(
              `⏱️ FormPremise media upload ${index + 1} (${item.tag}) took ${mediaElapsedSeconds}s`,
            );

            const { uri, ...cleanItem } = item;

            return {
              ...cleanItem,
              url: downloadUrl,
            };
          }

          return item;
        }),
      );

      // const uploadElapsedSeconds = (
      //   (Date.now() - uploadStartedAtMs) /
      //   1000
      // ).toFixed(2);

      // console.log(
      //   `⏱️ FormPremise all media uploads took ${uploadElapsedSeconds}s`,
      // );

      // logSubmitTime("media synced");

      const finalValues = {
        ...basePayload,
        media: syncedMedia,
      };

      // logSubmitTime("final payload built");

      /* ------------------------------------------------
      4. ONLINE SUBMIT WITH 15 SECOND TIMEOUT
      ------------------------------------------------ */
      let result = null;
      // console.log(`FormPremise handleSubmit --isEdit`, isEdit);

      try {
        // const firestoreSubmitStartedAtMs = Date.now();

        if (isEdit) {
          result = await withSubmitTimeout(
            updatePremise(finalValues).unwrap(),
            15000,
          );
        } else {
          result = await withSubmitTimeout(
            createPremise(finalValues).unwrap(),
            15000,
          );
        }

        // const firestoreSubmitElapsedSeconds = (
        //   (Date.now() - firestoreSubmitStartedAtMs) /
        //   1000
        // ).toFixed(2);

        // console.log(
        //   `⏱️ FormPremise Firestore submit took ${firestoreSubmitElapsedSeconds}s`,
        // );

        // logSubmitTime("firestore submit complete");
      } catch (error) {
        // logSubmitTime("firestore submit failed");
        console.log(`FormPremise handleSubmit --error`, error);

        if (error?.message === "SUBMISSION_TIMEOUT") {
          if (queueItemId) {
            await updatePremiseQueueItem(
              queueItemId,
              {
                payload: finalValues,
                status: "PENDING",
                result: {
                  success: false,
                  code: "NAv",
                  message: "NAv",
                  premiseId: "NAv",
                },
              },
              agentUid,
              agentName,
            );
          } else {
            await addPremiseQueueItem({
              payload: finalValues,
              createdByUid: agentUid,
              createdByUser: agentName,
            });
          }

          // logSubmitTime("timeout fallback saved offline queue");

          ToastAndroid.show(
            "Premise submission is taking too long. Saved locally.",
            ToastAndroid.LONG,
          );

          router.replace("/(tabs)/admin/storage/premise-offline-storage");
          // logSubmitTime("TIMEOUT END");
          return;
        }

        throw error;
      }

      if (!isEdit && !result?.success) {
        // logSubmitTime("rejected by createPremise");

        ToastAndroid.show(
          result?.message || "Premise rejected",
          ToastAndroid.LONG,
        );
        return;
      }

      /* ------------------------------------------------
     5. CLEANUP
     If this came from queue, remove successful item
     ------------------------------------------------ */
      if (queueItemId) {
        await removePremiseQueueItem(queueItemId);
        // logSubmitTime("queue item removed");
      }

      const targetedBatchLink = result?.targetedBatchLink;
      const targetedBatchPremiseLinked = Boolean(
        !isEdit &&
          linkedTargetedBatchContext &&
          targetedBatchLink?.linked === true &&
          String(result?.premiseId || "").trim() === premiseDocId &&
          String(targetedBatchLink?.tbId || "").trim() ===
            linkedTargetedBatchContext.tbId &&
          String(targetedBatchLink?.rowId || "").trim() ===
            linkedTargetedBatchContext.rowId,
      );
      const successRoute = targetedBatchPremiseLinked
        ? linkedTargetedBatchContext.returnTo ||
          "/(tabs)/admin/operations/my-workorders"
        : "/(tabs)/premises";

      updateGeo({ selectedPremise: null, lastSelectionType: "PREMISE" });
      // logSubmitTime("geo updated");

      ToastAndroid.show("Premise saved.", ToastAndroid.LONG);

      if (originatedFromTargetedBatch || isQueueEdit) {
        router.replace(successRoute);
      } else {
        router.back();
      }
      // logSubmitTime("SUCCESS END");
    } catch (err) {
      // logSubmitTime("ERROR END");

      const errorMessage =
        err?.data?.message || err?.message || "Could not save premise form.";

      console.warn(`🛰️Could not save premise form: ${errorMessage}`);

      ToastAndroid.show(errorMessage, ToastAndroid.LONG);
    } finally {
      // logSubmitTime("FINALLY");
      setSubmitting(false);
      setInProgress(false);
    }
  };

  if (
    isDuplicate &&
    duplicateResolution?.state !== "VALID DUPLICATE"
  ) {
    const isPending = duplicateResolution?.state === "PENDING SOURCE";
    const canRetry = duplicateResolution?.state === "SOURCE ERROR";

    return (
      <View style={styles.resolutionContainer}>
        <Stack.Screen
          options={{
            title: "Duplicate Premise",
            headerLeft: () => (
              <Pressable onPress={() => router.back()} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={28} color="#1e293b" />
              </Pressable>
            ),
          }}
        />

        {isPending && <ActivityIndicator size="large" color="#2563eb" />}

        <Text style={styles.resolutionTitle}>
          {duplicateResolution?.state || "INVALID SOURCE"}
        </Text>
        <Text style={styles.resolutionMessage}>
          {duplicateResolution?.message ||
            "The Duplicate request cannot be opened safely."}
        </Text>

        <View style={styles.resolutionActions}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.resolutionBackButton}
          >
            <Text style={styles.resolutionBackButtonText}>Back</Text>
          </TouchableOpacity>

          {canRetry && (
            <TouchableOpacity
              onPress={() => refetchDuplicateSource()}
              style={styles.resolutionRetryButton}
            >
              <Text style={styles.resolutionRetryButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <>
      <ScreenLock
        visible={inProgress}
        title="SYNCING"
        status="Uploading premise form data..."
      />

      <Formik
        initialValues={initialValues}
        validationSchema={premiseSchema}
        validateOnMount={true}
        onSubmit={handleSubmit}
        enableReinitialize={true}
      >
        {({ setFieldValue, setValues, values, isSubmitting, errors }) => {
          // console.log(`FormPremise --errors`, errors);
          // console.log(`FormPremise --values`, values);
          return (
            <View style={styles.container}>
              <DuplicateGpsResetHydrator
                key={duplicateRouteKey || "non-duplicate"}
                enabled={hasValidCurrentDuplicateLatch}
                initialResetCentroid={initialErfCentroid}
                resetCentroid={erfCentroid}
              />

              <Stack.Screen
                options={{
                  title: isEditLike ? "Edit Premise" : "New Premise",
                  headerRight: () => (
                    <View style={styles.headerErfBadge}>
                      <Text style={styles.headerErfText}>ERF: {erfNo}</Text>
                    </View>
                  ),
                  headerLeft: () => (
                    <Pressable
                      onPress={() => router.back()}
                      style={styles.backBtn}
                    >
                      <Ionicons name="chevron-back" size={28} color="#1e293b" />
                    </Pressable>
                  ),
                }}
              />

              <ScrollView contentContainerStyle={styles.formScroll}>
                {/* Property Clasification */}
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons
                    name="office-building-marker"
                    size={18}
                    color="#059669"
                  />
                  <Text style={styles.sectionTitle}>
                    PROPERTY CLASSIFICATION
                  </Text>
                </View>
                <Surface style={styles.card} elevation={1}>
                  {/* PROPERTY CONTEXT [Township / Suburb] */}
                  <Surface style={styles.card} elevation={1}>
                    {/* 🏙️ TOWNSHIP / SUBURB TOGGLE ROW */}
                    <TouchableOpacity
                      // 🛡️ Lock interaction if the form is in flight
                      disabled={isSubmitting}
                      style={styles.toggleRow}
                      activeOpacity={0.7}
                      onPress={() =>
                        setFieldValue(
                          "context",
                          values.context === "Township" ? "Suburb" : "Township",
                        )
                      }
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.toggleLabel}>
                          {values.context === "Township"
                            ? "Township"
                            : "Suburb"}
                        </Text>

                        <Text style={{ fontSize: 10, color: FORM_TEXT }}>
                          Tap row to toggle geographic context
                        </Text>
                      </View>

                      <Switch
                        value={values.context === "Township"}
                        color="#059669"
                        onValueChange={(v) =>
                          setFieldValue("context", v ? "Township" : "Suburb")
                        }
                      />
                    </TouchableOpacity>
                  </Surface>
                  <FormSelect
                    label="Property Status"
                    name="occupancy.status"
                    options={premiseOccupancySatusOptions}
                    icon="office-building-marker"
                  />

                  <Divider style={styles.divider} />

                  {/* PROPERTYTYPE type */}
                  <Surface style={styles.card} elevation={1}>
                    <FormSelect
                      label="Property Type"
                      name="propertyType.type"
                      options={propertyTypeOptions}
                      icon="office-building-marker"
                      onValueChange={(nextType) => {
                        if (nextType === values?.propertyType?.type) return;

                        const reconciled = reconcilePropertyTypeChange(nextType);
                        setValues(
                          {
                            ...values,
                            propertyType: {
                              ...values.propertyType,
                              type: nextType,
                              name: reconciled.name,
                              unitNo: reconciled.unitNo,
                            },
                          },
                          true,
                        );
                      }}
                    />

                    <Divider style={styles.divider} />
                    {/* PROPERTYTYPE unitName */}
                    {requiresPropertyName(values?.propertyType?.type) && (
                      <>
                        <FormInput
                          label="Unit Name"
                          name="propertyType.name"
                          placeholder="Unit Name"
                          placeholderTextColor={HINT_PENDING_REWORD}
                          keyboardType="default"
                        />
                        <Divider style={styles.divider} />
                      </>
                    )}

                    {supportsUnitNo(values?.propertyType?.type) && (
                      <FormInput
                        label="Unit Number"
                        name="propertyType.unitNo"
                        placeholder="Unit Number"
                        placeholderTextColor={HINT_PENDING_REWORD}
                        keyboardType="default"
                      />
                    )}
                  </Surface>
                </Surface>

                {/* STREET ADDRESS */}
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons
                    name="map-marker-radius"
                    size={18}
                    color="#059669"
                  />
                  <Text style={styles.sectionTitle}>STREET ADDRESS</Text>
                </View>
                <Surface style={styles.card} elevation={1}>
                  <Surface style={styles.card} elevation={1}>
                    <View style={{ flex: 1 }}>
                      <FormInput
                        label="SUBURB NAME"
                        name="address.suburbName"
                        placeholder="Suburb Name"
                        placeholderTextColor={HINT_PENDING_REWORD}
                        keyboardType="default"
                      />
                    </View>
                  </Surface>

                  <Surface style={styles.card} elevation={1}>
                    <View style={{ flexDirection: "row" }}>
                      <View style={{ flex: 1 }}>
                        <FormInput
                          label="STR NO"
                          name="address.strNo"
                          placeholder="Str No"
                          placeholderTextColor={HINT_PENDING_REWORD}
                          keyboardType="default"
                        />
                      </View>
                      <View style={{ flex: 2, marginLeft: 12 }}>
                        <FormInput
                          label="STR NAME"
                          name="address.strName"
                          placeholder="Str Name"
                          placeholderTextColor={HINT_PENDING_REWORD}
                          autoCapitalize="words" // 🏛️ Auto-Title Case for Street Names
                          onChangeText={(text) =>
                            setFieldValue(
                              "address.strName",
                              formatStreetName(text),
                            )
                          }
                        />
                      </View>
                    </View>

                    <FormSelect
                      label="STREET TYPE"
                      name="address.strType"
                      options={streetTypeOptions}
                    />
                  </Surface>

                  <IrepsMedia
                    tag={"propertyAdrPhoto"}
                    agentName={agentName}
                    agentUid={agentUid}
                    fallbackGps={values?.geometry?.centroid}
                    acquireDeviceGps={false}
                  />

                  <Surface style={styles.card} elevation={1}>
                    <FormMapPositioner
                      label="Physical Premise Location"
                      name="geometry.centroid"
                      erfId={isDuplicate ? normalizedRouteId : id}
                      defaultLocation={erfCentroid}
                    />
                  </Surface>
                </Surface>

                {/* 🎯 THE SOVEREIGN FOOTER */}

                <ForensicFooter />

                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          );
        }}
      </Formik>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },

  resolutionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f1f5f9",
  },

  resolutionTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
  },

  resolutionMessage: {
    marginTop: 10,
    maxWidth: 420,
    fontSize: 14,
    lineHeight: 20,
    color: FORM_TEXT,
    textAlign: "center",
  },

  resolutionActions: {
    flexDirection: "row",
    marginTop: 24,
  },

  resolutionBackButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#fff",
  },

  resolutionBackButtonText: {
    color: "#334155",
    fontWeight: "800",
  },

  resolutionRetryButton: {
    marginLeft: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#2563eb",
  },

  resolutionRetryButtonText: {
    color: "#fff",
    fontWeight: "800",
  },

  formScroll: { padding: 16 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },

  headerErfBadge: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 10,
  },

  headerErfText: {
    color: "#34d399",
    fontSize: 11,
    fontWeight: "bold",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: FORM_TEXT,
    marginLeft: 6,
  },

  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  toggleLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },

  divider: {
    marginVertical: 10,
  },

  backBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
  },
});
