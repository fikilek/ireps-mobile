// src/components/maps/NeighbourhoodPremiseMarker.js
// iREPS — Premise Neighbourhood Marker (PNBS)

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { memo, useEffect, useMemo, useState } from "react";
import { formatStreetAddress } from "../../src/features/premises/streetAddress";
import { StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-maps";

/* ----------------------------
   Helpers
----------------------------- */
const getPropertyBeacon = (type = "") => {
  const t = (type || "").toLowerCase();

  if (t.includes("church") || t.includes("religion")) {
    return { name: "church", color: "#6366f1" };
  }

  if (t.includes("school") || t.includes("education")) {
    return { name: "school", color: "#10b981" };
  }

  if (t.includes("township")) {
    return { name: "home-variant", color: "#f59e0b" };
  }

  if (t.includes("suburb")) {
    return { name: "home-city", color: "#3b82f6" };
  }

  if (t.includes("flat") || t.includes("sectional")) {
    return { name: "office-building", color: "#8b5cf6" };
  }

  if (
    t.includes("commercial") ||
    t.includes("shop") ||
    t.includes("business")
  ) {
    return { name: "storefront", color: "#ec4899" };
  }

  if (t.includes("industrial") || t.includes("factory")) {
    return { name: "factory", color: "#64748b" };
  }

  return { name: "home", color: "#94a3b8" };
};

const getOccupancyColor = (status = "") => {
  const s = (status || "").toUpperCase();

  if (s === "OCCUPIED") return "#10B981";
  if (s === "ACCESSED") return "#3B82F6";
  if (s === "NO_ACCESS") return "#EF4444";

  return "#64748B";
};

const formatShortAddress = (addr) => formatStreetAddress(addr) || "No Address";

/* ----------------------------
   Component
----------------------------- */
function NeighbourhoodPremiseMarkerBase({
  prem,
  zoom,
  coordinate,
  onPress,
  onDragEnd,
  isDragging = false,
  isSaving = false,
  // The premise the worker has selected. It is drawn exactly like its neighbours - same card, same words,
  // same icon - and says it is the selected one with a thick blue border (owner, 2026-09-24).
  isSelected = false,
  showAddressFromZoom = 18,
  showTypeFromZoom = 18,
}) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  const statusColor = useMemo(
    () => getOccupancyColor(prem?.occupancy?.status),
    [prem?.occupancy?.status],
  );

  const beacon = useMemo(
    () => getPropertyBeacon(prem?.propertyType?.type),
    [prem?.propertyType?.type],
  );

  const erfLabel = useMemo(() => `Erf ${prem?.erfNo || "?"}`, [prem?.erfNo]);

  const addressLabel = useMemo(
    () => formatShortAddress(prem?.address),
    [prem?.address],
  );

  useEffect(() => {
    if (isDragging || isSaving) {
      setTracksViewChanges(true);
      return;
    }

    setTracksViewChanges(true);

    const timer = setTimeout(() => {
      setTracksViewChanges(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    prem?.id,
    prem?.erfNo,
    prem?.occupancy?.status,
    prem?.propertyType?.type,
    prem?.propertyType?.name,
    prem?.propertyType?.unitNo,
    prem?.address?.strNo,
    prem?.address?.strName,
    prem?.address?.strType,
    zoom,
    showAddress,
    isSelected,
    coordinate?.latitude,
    coordinate?.longitude,
    isDragging,
    isSaving,
  ]);

  if (!prem) return null;
  if (coordinate?.latitude == null || coordinate?.longitude == null) {
    return null;
  }

  const typeUnitName = prem?.propertyType?.name || "";
  const typeUnitNo = prem?.propertyType?.unitNo || "";
  const unitNameNo =
    typeUnitName && typeUnitNo
      ? `${typeUnitName}-${typeUnitNo}`
      : typeUnitName || "";

  const showAddress = (zoom || 0) >= showAddressFromZoom;

  const shouldTrack = tracksViewChanges || isDragging || isSaving;

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      draggable={isDragging}
      tracksViewChanges={shouldTrack}
      onPress={onPress}
      onDragEnd={(e) => {
        const next = e?.nativeEvent?.coordinate;
        if (!next) return;
        onDragEnd?.(next);
      }}
    >
      <View
        style={[
          styles.badge,
          { borderColor: statusColor },
          isSelected && styles.badgeSelected,
          isDragging && styles.badgeDragging,
          isSaving && styles.badgeSaving,
        ]}
      >
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            {erfLabel}
          </Text>

          {showAddress && (
            <View>
              <Text style={styles.sub} numberOfLines={1}>
                {addressLabel}
              </Text>

              {!!unitNameNo && (
                <Text style={styles.sub} numberOfLines={1}>
                  {unitNameNo}
                </Text>
              )}
            </View>
          )}

          <View
            style={[styles.iconBox, { backgroundColor: `${beacon.color}18` }]}
          >
            <MaterialCommunityIcons
              name={beacon.name}
              size={10}
              color={beacon.color}
            />
          </View>
        </View>
      </View>
    </Marker>
  );
}

const areEqual = (prev, next) => {
  return (
    prev.prem?.id === next.prem?.id &&
    prev.zoom === next.zoom &&
    prev.isDragging === next.isDragging &&
    prev.isSaving === next.isSaving &&
    prev.showAddressFromZoom === next.showAddressFromZoom &&
    prev.showTypeFromZoom === next.showTypeFromZoom &&
    prev.coordinate?.latitude === next.coordinate?.latitude &&
    prev.coordinate?.longitude === next.coordinate?.longitude &&
    prev.prem?.occupancy?.status === next.prem?.occupancy?.status &&
    prev.prem?.propertyType?.type === next.prem?.propertyType?.type &&
    prev.prem?.propertyType?.name === next.prem?.propertyType?.name &&
    prev.prem?.propertyType?.unitNo === next.prem?.propertyType?.unitNo &&
    prev.prem?.erfNo === next.prem?.erfNo &&
    prev.prem?.address?.strNo === next.prem?.address?.strNo &&
    prev.prem?.address?.strName === next.prem?.address?.strName &&
    prev.prem?.address?.strType === next.prem?.address?.strType
  );
};

const NeighbourhoodPremiseMarker = memo(
  NeighbourhoodPremiseMarkerBase,
  areEqual,
);

NeighbourhoodPremiseMarker.displayName = "NeighbourhoodPremiseMarker";
export default NeighbourhoodPremiseMarker;

/* ----------------------------
   Styles
----------------------------- */
const styles = StyleSheet.create({
  badge: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 4,
    padding: 4,
    borderWidth: 1,
    maxWidth: 50,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },

  badgeSelected: {
    borderWidth: 3,
    borderColor: "#1d4ed8",
  },

  badgeDragging: {
    borderWidth: 4,
    borderColor: "#3525eb",
    transform: [{ scale: 1.06 }],
  },

  badgeSaving: {
    opacity: 0.9,
  },

  iconBox: {
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },

  textCol: {
    flex: 1,
    gap: 1,
  },

  title: {
    fontSize: 6,
    fontWeight: "900",
    color: "#0F172A",
  },

  sub: {
    fontSize: 6,
    fontWeight: "700",
    color: "#64748B",
  },

  type: {
    fontSize: 5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  dragLabel: {
    fontSize: 6,
    fontWeight: "900",
    color: "#2563EB",
  },

  savingLabel: {
    fontSize: 6,
    fontWeight: "900",
    color: "#F59E0B",
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
});

// // src/components/maps/NeighbourhoodPremiseMarker.js
// // iREPS — Premise Neighbourhood Marker (PNBS)
// // Lightweight, offline-safe, scalable

// import { MaterialCommunityIcons } from "@expo/vector-icons";
// import { memo, useMemo } from "react";
// import { StyleSheet, Text, View } from "react-native";
// import { Marker } from "react-native-maps";

// /* ----------------------------
//    Helpers
// ----------------------------- */
// const getPropertyBeacon = (type = "") => {
//   const t = (type || "").toLowerCase();

//   if (t.includes("church") || t.includes("religion")) {
//     return { name: "church", color: "#6366f1" };
//   }

//   if (t.includes("school") || t.includes("education")) {
//     return { name: "school", color: "#10b981" };
//   }

//   if (t.includes("township")) {
//     return { name: "home-variant", color: "#f59e0b" };
//   }

//   if (t.includes("suburb")) {
//     return { name: "home-city", color: "#3b82f6" };
//   }

//   if (t.includes("flat") || t.includes("sectional")) {
//     return { name: "office-building", color: "#8b5cf6" };
//   }

//   if (
//     t.includes("commercial") ||
//     t.includes("shop") ||
//     t.includes("business")
//   ) {
//     return { name: "storefront", color: "#ec4899" };
//   }

//   if (t.includes("industrial") || t.includes("factory")) {
//     return { name: "factory", color: "#64748b" };
//   }

//   return { name: "home", color: "#94a3b8" };
// };

// const getOccupancyColor = (status = "") => {
//   const s = (status || "").toUpperCase();

//   if (s === "OCCUPIED") return "#10B981";
//   if (s === "ACCESSED") return "#3B82F6";
//   if (s === "NO_ACCESS") return "#EF4444";

//   return "#64748B";
// };

// const formatShortAddress = (addr) => {
//   const strNo = addr?.strNo || "";
//   const strName = addr?.strName || "";
//   const strType = addr?.strType || "";
//   const s = `${strNo} ${strName} ${strType}`.trim();
//   return s || "No Address";
// };

// /* ----------------------------
//    Component
// ----------------------------- */
// function NeighbourhoodPremiseMarkerBase({
//   prem,
//   zoom,
//   coordinate,
//   onPress,
//   onDragEnd,
//   isDragging = false,
//   isSaving = false,
//   showAddressFromZoom = 18,
//   showTypeFromZoom = 18,
// }) {
//   const statusColor = useMemo(
//     () => getOccupancyColor(prem?.occupancy?.status),
//     [prem?.occupancy?.status],
//   );

//   const beacon = useMemo(
//     () => getPropertyBeacon(prem?.propertyType?.type),
//     [prem?.propertyType?.type],
//   );

//   const erfLabel = useMemo(() => `Erf ${prem?.erfNo || "?"}`, [prem?.erfNo]);

//   const addressLabel = useMemo(
//     () => formatShortAddress(prem?.address),
//     [prem?.address],
//   );

//   if (!prem) return null;
//   if (coordinate?.latitude == null || coordinate?.longitude == null)
//     return null;

//   const typeLabel = prem?.propertyType?.type || "";
//   const typeUnitName = prem?.propertyType?.name || "";
//   const typeUnitNo = prem?.propertyType?.unitNo || "";
//   const unitNameNo =
//     typeUnitName && typeUnitNo
//       ? `${typeUnitName}-${typeUnitNo}`
//       : typeUnitName || "";

//   const showAddress = (zoom || 0) >= showAddressFromZoom;
//   const showType = (zoom || 0) >= showTypeFromZoom;

//   return (
//     // <Marker
//     //   coordinate={coordinate}
//     //   anchor={{ x: 0.5, y: 0.5 }}
//     //   draggable={isDragging}
//     //   onPress={onPress}
//     //   onDragEnd={(e) => {
//     //     const next = e?.nativeEvent?.coordinate;
//     //     if (!next) return;
//     //     onDragEnd?.(next);
//     //   }}
//     // >
//     <Marker
//       coordinate={coordinate}
//       anchor={{ x: 0.5, y: 0.5 }}
//       draggable={isDragging}
//       // tracksViewChanges={isDragging || isSaving}
//       tracksViewChanges={true}
//       onPress={onPress}
//       onDragEnd={(e) => {
//         const next = e?.nativeEvent?.coordinate;
//         if (!next) return;
//         onDragEnd?.(next);
//       }}
//     >
//       <View
//         style={[
//           styles.badge,
//           { borderColor: statusColor },
//           isDragging && styles.badgeDragging,
//           isSaving && styles.badgeSaving,
//         ]}
//       >
//         <View style={styles.textCol}>
//           <Text style={styles.title} numberOfLines={1}>
//             {erfLabel}
//           </Text>

//           {showAddress && (
//             <View>
//               <Text style={styles.sub} numberOfLines={1}>
//                 {addressLabel}
//               </Text>

//               {!!unitNameNo && (
//                 <Text style={styles.sub} numberOfLines={1}>
//                   {unitNameNo}
//                 </Text>
//               )}
//             </View>
//           )}

//           <View
//             style={[styles.iconBox, { backgroundColor: `${beacon.color}18` }]}
//           >
//             <MaterialCommunityIcons
//               name={beacon.name}
//               size={10}
//               color={beacon.color}
//             />
//           </View>

//           {/* {isDragging && (
//             <Text style={styles.dragLabel} numberOfLines={1}>
//               MOVE
//             </Text>
//           )}

//           {isSaving && (
//             <Text style={styles.savingLabel} numberOfLines={1}>
//               SAVING
//             </Text>
//           )} */}

//           {/* keep for later if needed
//           {showType && !!typeLabel && (
//             <Text
//               style={[styles.type, { color: beacon.color }]}
//               numberOfLines={1}
//             >
//               {typeLabel}
//             </Text>
//           )} */}
//         </View>
//       </View>
//     </Marker>
//   );
// }

// const areEqual = (prev, next) => {
//   return (
//     prev.prem?.id === next.prem?.id &&
//     prev.zoom === next.zoom &&
//     prev.isDragging === next.isDragging &&
//     prev.isSaving === next.isSaving &&
//     prev.showAddressFromZoom === next.showAddressFromZoom &&
//     prev.showTypeFromZoom === next.showTypeFromZoom &&
//     prev.coordinate?.latitude === next.coordinate?.latitude &&
//     prev.coordinate?.longitude === next.coordinate?.longitude &&
//     prev.prem?.occupancy?.status === next.prem?.occupancy?.status &&
//     prev.prem?.propertyType?.type === next.prem?.propertyType?.type &&
//     prev.prem?.propertyType?.name === next.prem?.propertyType?.name &&
//     prev.prem?.propertyType?.unitNo === next.prem?.propertyType?.unitNo &&
//     prev.prem?.erfNo === next.prem?.erfNo &&
//     prev.prem?.address?.strNo === next.prem?.address?.strNo &&
//     prev.prem?.address?.strName === next.prem?.address?.strName &&
//     prev.prem?.address?.strType === next.prem?.address?.strType
//   );
// };

// const NeighbourhoodPremiseMarker = memo(
//   NeighbourhoodPremiseMarkerBase,
//   areEqual,
// );

// NeighbourhoodPremiseMarker.displayName = "NeighbourhoodPremiseMarker";
// export default NeighbourhoodPremiseMarker;

// /* ----------------------------
//    Styles
// ----------------------------- */
// const styles = StyleSheet.create({
//   badge: {
//     backgroundColor: "rgba(255,255,255,0.96)",
//     borderRadius: 4,
//     padding: 4,
//     borderWidth: 1,
//     maxWidth: 50,
//     elevation: 3,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 1 },
//     shadowOpacity: 0.1,
//     shadowRadius: 2,
//   },

//   badgeDragging: {
//     borderWidth: 4,
//     borderColor: "#3525eb",
//     transform: [{ scale: 1.06 }],
//   },

//   badgeSaving: {
//     opacity: 0.9,
//   },

//   iconBox: {
//     borderRadius: 8,
//     justifyContent: "center",
//     alignItems: "center",
//     marginRight: 8,
//   },

//   textCol: {
//     flex: 1,
//     gap: 1,
//   },

//   title: {
//     fontSize: 6,
//     fontWeight: "900",
//     color: "#0F172A",
//   },

//   sub: {
//     fontSize: 6,
//     fontWeight: "700",
//     color: "#64748B",
//   },

//   type: {
//     fontSize: 5,
//     fontWeight: "900",
//     textTransform: "uppercase",
//     letterSpacing: 0.4,
//   },

//   dragLabel: {
//     fontSize: 6,
//     fontWeight: "900",
//     color: "#2563EB",
//   },

//   savingLabel: {
//     fontSize: 6,
//     fontWeight: "900",
//     color: "#F59E0B",
//   },

//   dot: {
//     width: 8,
//     height: 8,
//     borderRadius: 4,
//     marginLeft: 8,
//   },
// });

// // // src/components/maps/NeighbourhoodPremiseMarker.js
// // // iREPS — Premise Neighbourhood Marker (PNBS)
// // // Lightweight, offline-safe, scalable (memo + tracksViewChanges=false)

// // import { MaterialCommunityIcons } from "@expo/vector-icons";
// // import { memo, useMemo } from "react";
// // import { StyleSheet, Text, View } from "react-native";
// // import { Marker } from "react-native-maps";

// // /* ----------------------------
// //    Helpers (kept inside scope)
// // ----------------------------- */
// // const getPropertyBeacon = (type = "") => {
// //   const t = (type || "").toLowerCase();

// //   if (t.includes("church") || t.includes("religion"))
// //     return { name: "church", color: "#6366f1" };

// //   if (t.includes("school") || t.includes("education"))
// //     return { name: "school", color: "#10b981" };

// //   if (t.includes("township")) return { name: "home-variant", color: "#f59e0b" };

// //   if (t.includes("suburb")) return { name: "home-city", color: "#3b82f6" };

// //   if (t.includes("flat") || t.includes("sectional"))
// //     return { name: "office-building", color: "#8b5cf6" };

// //   if (t.includes("commercial") || t.includes("shop") || t.includes("business"))
// //     return { name: "storefront", color: "#ec4899" };

// //   if (t.includes("industrial") || t.includes("factory"))
// //     return { name: "factory", color: "#64748b" };

// //   return { name: "home", color: "#94a3b8" };
// // };

// // const getOccupancyColor = (status = "") => {
// //   const s = (status || "").toUpperCase();

// //   if (s === "OCCUPIED") return "#10B981";
// //   if (s === "ACCESSED") return "#3B82F6";
// //   if (s === "NO_ACCESS") return "#EF4444";

// //   return "#64748B";
// // };

// // const formatShortAddress = (addr) => {
// //   const strNo = addr?.strNo || "";
// //   const strName = addr?.strName || "";
// //   const strType = addr?.strType || "";
// //   const s = `${strNo} ${strName} ${strType}`.trim();
// //   return s || "No Address";
// // };

// // /* ----------------------------
// //    Component
// // ----------------------------- */
// // const NeighbourhoodPremiseMarker = memo(
// //   ({
// //     prem,
// //     zoom,
// //     coordinate,
// //     onPress,
// //     onLongPress,
// //     onDragEnd,
// //     isDragging = false,
// //     isSaving = false,
// //     showAddressFromZoom = 18,
// //     showTypeFromZoom = 18,

// //     // prem,
// //     // zoom,
// //     // coordinate, // required: { latitude, longitude }
// //     // onPress, // optional
// //     // showAddressFromZoom = 18, // show address at this zoom+
// //     // showTypeFromZoom = 18, // show property type at this zoom+
// //     // maxWidth = 90, // allow tuning if you want wider labels
// //   }) => {
// //     // Defensive guard

// //     const statusColor = useMemo(
// //       () => getOccupancyColor(prem?.occupancy?.status),
// //       [prem?.occupancy?.status],
// //     );

// //     const beacon = useMemo(
// //       () => getPropertyBeacon(prem?.propertyType?.type),
// //       [prem?.propertyType?.type],
// //     );

// //     const erfLabel = useMemo(() => `Erf ${prem?.erfNo || "?"}`, [prem?.erfNo]);

// //     const addressLabel = useMemo(
// //       () => formatShortAddress(prem?.address),
// //       [prem?.address],
// //     );

// //     if (!prem || !coordinate) return null;

// //     const typeLabel = prem?.propertyType?.type || "";
// //     const typeUnitName = prem?.propertyType?.name || "";
// //     const typeUnitNo = prem?.propertyType?.unitNo || "";
// //     const untiNameNo = `${typeUnitName}-${typeUnitNo}`;

// //     const showAddress = (zoom || 0) >= showAddressFromZoom;
// //     const showType = (zoom || 0) >= showTypeFromZoom;

// //     return (
// //       <Marker
// //         coordinate={coordinate}
// //         draggable={isDragging}
// //         onPress={onPress}
// //         onLongPress={onLongPress}
// //         onDragEnd={(e) => {
// //           const next = e?.nativeEvent?.coordinate;
// //           if (!next) return;
// //           onDragEnd?.(next);
// //         }}

// //         // coordinate={coordinate}
// //         // anchor={{ x: 0.5, y: 0.5 }}
// //         // // tracksViewChanges={false}
// //         // onPress={onPress}
// //       >
// //         <View
// //           style={[
// //             styles.badge,
// //             isDragging && styles.badgeDragging,
// //             { borderColor: statusColor, maxWidth: 50 },
// //           ]}
// //         >
// //           {/* Left Icon (Property Beacon) */}

// //           {/* Text Column */}
// //           <View style={styles.textCol}>
// //             <Text style={styles.title} numberOfLines={1}>
// //               {erfLabel}
// //             </Text>

// //             {showAddress && (
// //               <View>
// //                 <Text style={styles.sub} numberOfLines={1}>
// //                   {addressLabel}
// //                 </Text>
// //                 <Text style={styles.sub} numberOfLines={1}>
// //                   {typeUnitName ? untiNameNo : ""}
// //                 </Text>
// //               </View>
// //             )}
// //             <View
// //               style={[styles.iconBox, { backgroundColor: `${beacon.color}18` }]}
// //             >
// //               <MaterialCommunityIcons
// //                 name={beacon.name}
// //                 size={10}
// //                 color={beacon.color}
// //               />
// //             </View>

// //             {/* {showType && !!typeLabel && (
// //               <Text
// //                 style={[styles.type, { color: beacon.color }]}
// //                 numberOfLines={1}
// //               >
// //                 {typeLabel}
// //               </Text>
// //             )} */}
// //           </View>

// //           {/* Right Status Dot (Occupancy) */}
// //           {/* <View style={[styles.dot, { backgroundColor: statusColor }]} /> */}
// //         </View>
// //       </Marker>
// //     );
// //   },
// // );

// // NeighbourhoodPremiseMarker.displayName = "NeighbourhoodPremiseMarker";
// // export default NeighbourhoodPremiseMarker;

// // /* ----------------------------
// //    Styles
// // ----------------------------- */
// // const styles = StyleSheet.create({
// //   badge: {
// //     backgroundColor: "rgba(255,255,255,0.96)",
// //     borderRadius: 4,
// //     padding: 4,
// //     borderWidth: 1,
// //     width: "90",
// //     elevation: 3,
// //     shadowColor: "#000",
// //     shadowOffset: { width: 0, height: 1 },
// //     shadowOpacity: 0.1,
// //     shadowRadius: 2,
// //   },

// //   iconBox: {
// //     borderRadius: 8,
// //     justifyContent: "center",
// //     alignItems: "center",
// //     marginRight: 8,
// //   },

// //   textCol: {
// //     flex: 1,
// //     gap: 1,
// //   },

// //   title: {
// //     fontSize: 6,
// //     fontWeight: "900",
// //     color: "#0F172A",
// //   },

// //   sub: {
// //     fontSize: 6,
// //     fontWeight: "700",
// //     color: "#64748B",
// //   },

// //   type: {
// //     fontSize: 5,
// //     fontWeight: "900",
// //     textTransform: "uppercase",
// //     letterSpacing: 0.4,
// //   },

// //   dot: {
// //     width: 8,
// //     height: 8,
// //     borderRadius: 4,
// //     marginLeft: 8,
// //   },

// //   badgeDragging: {
// //     borderWidth: 3,
// //     borderColor: "#2563EB",
// //     transform: [{ scale: 1.06 }],
// //   },
// // });
