import React from "react";
import { Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

// Shared TB / MD BGO presentation. Callers own data, permissions and actions.
export default function BatchCardPresentation({ styles, icon, status, title, subtitle,
  counts, tiles, metadata, children }) {
  return (
    <View style={styles.bucketCard}>
      <View style={styles.groupTopRow}>
        <View style={styles.groupIcon}>
          <MaterialCommunityIcons name={icon} size={23} color="#2563eb" />
        </View>
        <View style={styles.bucketStatusBadge}>
          <Text style={styles.bucketStatusText}>{status}</Text>
        </View>
      </View>
      <Text style={styles.groupTitle}>{title}</Text>
      <Text style={styles.groupSub}>{subtitle}</Text>
      <View style={styles.tbCardStatusRow}>
        {tiles.map((tile) => {
          const total = tile.summaryKey === "total";
          return (
            <View key={tile.key} style={[styles.tbStatusFilter, total && styles.tbStatusFilterTotal]}>
              <Text style={[styles.tbStatusFilterLabel, total && styles.tbStatusFilterLabelTotal]} numberOfLines={2}>
                {tile.label}
              </Text>
              <Text style={[styles.tbStatusFilterValue, { color: tile.color }]}>
                {counts?.[tile.summaryKey] ?? "NAv"}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.bucketMetaGrid}>{metadata}</View>
      {children}
    </View>
  );
}
