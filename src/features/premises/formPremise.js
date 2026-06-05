import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { Formik } from "formik";
import { useEffect, useMemo, useState } from "react";
import {
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
  useUpdatePremiseMutation,
} from "../../redux/premisesApi";

import {
  addPremiseQueueItem,
  getPremiseQueueItemById,
  removePremiseQueueItem,
  updatePremiseQueueItem,
} from "../../utils/premiseSubmissionQueue";
import { ForensicFooter } from "../meters/ForensicFooter";

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
  `Occupied`,
  `Unoccupied`,
  `Vandalised`,
  `Under Construction`,
  `Dilapidated`,
];

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

function requiresPropertyName(type) {
  return (
    type !== "Select..." &&
    type !== "Residential" &&
    type !== "Vacant Land" &&
    !!String(type || "").trim()
  );
}

function requiresUnitNo(type) {
  return (
    type === "Flats" ||
    type === "Sectional Title" ||
    type === "Townhouse Complex"
  );
}

export default function FormPremise() {
  // console.log(`FormPremise ----mounted`);

  const [inProgress, setInProgress] = useState(false);

  const { all } = useWarehouse();

  const router = useRouter();

  const { id, premiseId, duplicateId, queueItemId } = useLocalSearchParams();

  const isEdit = !!premiseId;

  const isDuplicate = !!duplicateId;

  const sourcePremise = useMemo(() => {
    const targetId = premiseId || duplicateId;
    if (!targetId) return null;
    return all?.prems?.find((p) => p.id === targetId);
  }, [premiseId, duplicateId, all?.prems]);

  const [queueItem, setQueueItem] = useState(null);

  const isQueueEdit = !!queueItemId;
  const isEditLike = isEdit || isQueueEdit;

  useEffect(() => {
    let mounted = true;

    async function loadQueueItem() {
      if (!queueItemId) {
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
  }, [queueItemId]);

  const { profile, user } = useAuth();

  const agentUid = user?.uid || "unknown_uid";
  // console.log(`agentUid`, agentUid);

  const agentName = profile?.profile?.displayName || "Field Agent";
  // console.log(`agentName`, agentName);

  const { geoState, updateGeo } = useGeo();

  const selectedErf = geoState?.selectedErf || null;

  const targetGeo =
    all?.geoLibrary?.[id] || all?.geoLibrary?.[selectedErf?.erfId] || null;

  const erfNo =
    queueItem?.payload?.erfNo ||
    sourcePremise?.erfNo ||
    selectedErf?.erfNo ||
    "NAv";

  const erfCentroid = useMemo(() => {
    if (targetGeo?.centroid?.lat != null && targetGeo?.centroid?.lng != null) {
      return {
        lat: targetGeo.centroid.lat,
        lng: targetGeo.centroid.lng,
      };
    }

    return { lat: -34.035, lng: 23.048 };
  }, [targetGeo]);

  const admin = selectedErf?.admin;

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
          is: (val) => requiresUnitNo(val),
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
          "property-type-photo-required",
          "Property Type photo is mandatory once property type is selected",
          function (media) {
            const propertyType = this.parent?.propertyType?.type;

            const propertyTypeChosen =
              !!propertyType &&
              propertyType !== "Select..." &&
              String(propertyType).trim() !== "";

            if (!propertyTypeChosen) return true;

            return hasTaggedMedia(media, "propertyTypePhoto");
          },
        )
        .test(
          "property-address-photo-required",
          "Property Address photo is mandatory once street number and street name are completed",
          function (media) {
            const strNo = this.parent?.address?.strNo;
            const strName = this.parent?.address?.strName;

            const addressCompleted = isFilled(strNo) && isFilled(strName);

            if (!addressCompleted) return true;

            return hasTaggedMedia(media, "propertyAdrPhoto");
          },
        ),
    });
  }, [erfCentroid, isEditLike]);

  const initialValues = useMemo(() => {
    const baseGeometry = {
      centroid: {
        lat: erfCentroid?.lat,
        lng: erfCentroid?.lng,
      },
    };

    const baseContext = selectedErf?.isTownship ? "Township" : "Suburb";

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
    if (isDuplicate && sourcePremise) {
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
          unitNo: "",
        },

        occupancy: {
          status: sourcePremise?.occupancy?.status || "Occupied",
        },

        geometry: baseGeometry,

        media: [],
      };
    }

    // NEW
    return {
      context: baseContext,

      address: {
        suburbName: "",
        strNo: "",
        strName: "",
        strType: "Select...",
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
    sourcePremise,
    erfCentroid,
    selectedErf?.isTownship,
    isQueueEdit,
    queueItem,
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

    const wardNo =
      admin?.ward?.name?.match(/\d+/)?.[0] ||
      admin?.ward?.pcode?.slice(-3) ||
      "UNK";

    const safeErfNo = String(erfNo || "N-A").replace(/\//g, "-");

    const generatedId = `PRM_${Date.now()}_${Math.floor(
      Math.random() * 1000,
    )}_W${wardNo}_${safeErfNo}`;

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

            propertyType: {
              type: values?.propertyType?.type || "Select...",
              name: String(values?.propertyType?.name || "").trim(),
              unitNo: String(values?.propertyType?.unitNo || "").trim(),
            },

            occupancy: {
              status: values?.occupancy?.status || "Occupied",
            },

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
      4. ONLINE SUBMIT WITH 20 SECOND TIMEOUT
      ------------------------------------------------ */
      let result = null;
      // console.log(`FormPremise handleSubmit --isEdit`, isEdit);

      try {
        const firestoreSubmitStartedAtMs = Date.now();

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

      updateGeo({ selectedPremise: null, lastSelectionType: "PREMISE" });
      // logSubmitTime("geo updated");

      ToastAndroid.show("Premise saved.", ToastAndroid.LONG);

      router.replace("/(tabs)/premises");
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
        {({ setFieldValue, values, isSubmitting, errors }) => {
          // console.log(`FormPremise --errors`, errors);
          // console.log(`FormPremise --values`, values);
          return (
            <View style={styles.container}>
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

                        <Text style={{ fontSize: 10, color: "#94a3b8" }}>
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
                    />

                    <Divider style={styles.divider} />
                    {/* PROPERTYTYPE unitName */}
                    {requiresPropertyName(values?.propertyType?.type) && (
                      <>
                        <FormInput
                          label="Unit Name"
                          name="propertyType.name"
                          placeholder="Unit Name"
                          keyboardType="default"
                        />
                        <Divider style={styles.divider} />
                      </>
                    )}

                    {requiresUnitNo(values?.propertyType?.type) && (
                      <FormInput
                        label="Unit Number"
                        name="propertyType.unitNo"
                        placeholder="Unit Number"
                        keyboardType="default"
                      />
                    )}
                  </Surface>

                  <IrepsMedia
                    tag={"propertyTypePhoto"}
                    agentName={agentName}
                    agentUid={agentUid}
                    fallbackGps={values?.geometry?.centroid}
                  />
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
                          keyboardType="default"
                        />
                      </View>
                      <View style={{ flex: 2, marginLeft: 12 }}>
                        <FormInput
                          label="STR NAME"
                          name="address.strName"
                          placeholder="Str Name"
                          autoCapitalize="words" // 🏛️ Auto-Title Case for Street Names
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
                  />

                  <Surface style={styles.card} elevation={1}>
                    <FormMapPositioner
                      label="Physical Premise Location"
                      name="geometry.centroid"
                      erfId={id}
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
    color: "#64748b",
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
