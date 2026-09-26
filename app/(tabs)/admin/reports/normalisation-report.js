import { useGeo } from "@/src/context/GeoContext";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { Text } from "react-native-paper";
import DateRangeModal from "../../../../components/DateRangeModal";
import { ExportIntelligenceModal } from "../../../../components/ExportModal";
import UserTrnsReportHeader from "../../../../components/UserTrnsReportHeader";
import { db } from "../../../../src/firebase";

export default function NormalisationReport() {
  const { geoState } = useGeo();
  const lmPcode = geoState?.selectedLm?.id;
  const lmName = geoState?.selectedLm?.name || "Municipality";

  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.max(screenWidth - 80, 260);

  const [activeView, setActiveView] = useState("DAILY");
  const [showDateModal, setShowDateModal] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState({
    label: "ALL TIME",
    start: null,
    end: null,
  });

  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!lmPcode) {
      setRows([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const reportRef = collection(db, "report_trn_normalisation");
    const reportQuery = query(
      reportRef,
      where("parents.lmPcode", "==", lmPcode),
    );

    const unsubscribe = onSnapshot(
      reportQuery,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => {
          const item = doc.data();

          return {
            id: item?.id || doc.id,
            activityDate: item?.activityDate || "NAv",
            action: formatNormalisationAction(item?.normalisation?.actions),
            // action: item?.normalisation?.actions?.join(" + ") || "NAv",
            count: item?.counts?.trns || 0,
            updatedAt: item?.metadata?.updatedAt || "NAv",
          };
        });

        setRows(data);
        setIsLoading(false);
      },
      (error) => {
        console.log("normalisation-report snapshot error", error);
        setRows([]);
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [lmPcode]);

  const formatNormalisationAction = (actions = []) => {
    if (!Array.isArray(actions) || actions.length === 0) return "NAv";

    return actions
      .map((action) => {
        const text = String(action || "").trim();
        if (!text) return "NAv";

        // MN-R001 1.9.0: no reader capitalises anything on the way out. The stored
        // word is None, so this shows what the record actually holds.
        return text;
      })
      .join(" + ");
  };

  const normalizeDay = (value) => {
    if (!value) return null;

    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString().slice(0, 10);
  };

  const isWithinDateRange = (activityDate, start, end) => {
    const day = normalizeDay(activityDate);
    const startDay = normalizeDay(start);
    const endDay = normalizeDay(end);

    if (!day) return false;
    if (!startDay && !endDay) return true;
    if (startDay && day < startDay) return false;
    if (endDay && day > endDay) return false;

    return true;
  };

  const shortenLabel = (text = "", max = 24) => {
    const clean = String(text || "");
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max)}...`;
  };

  const getSafeMaxValue = (items = []) => {
    const max = Math.max(...items.map((item) => item?.value || 0), 0);

    if (max <= 5) return 5;

    return Math.ceil(max * 1.2);
  };

  const filteredRows = useMemo(() => {
    return rows.filter((item) =>
      isWithinDateRange(
        item?.activityDate,
        activeDateRange?.start,
        activeDateRange?.end,
      ),
    );
  }, [rows, activeDateRange]);

  const dailyData = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const dateCompare = String(b?.activityDate || "").localeCompare(
        String(a?.activityDate || ""),
      );
      if (dateCompare !== 0) return dateCompare;

      const updatedCompare = String(b?.updatedAt || "").localeCompare(
        String(a?.updatedAt || ""),
      );
      if (updatedCompare !== 0) return updatedCompare;

      return String(a?.action || "").localeCompare(String(b?.action || ""));
    });
  }, [filteredRows]);

  const summaryData = useMemo(() => {
    const grouped = new Map();

    filteredRows.forEach((item) => {
      const key = item?.action || "NAv";

      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          action: key,
          count: 0,
        });
      }

      const existing = grouped.get(key);
      existing.count += item?.count || 0;
    });

    return Array.from(grouped.values()).sort((a, b) => {
      if ((b?.count || 0) !== (a?.count || 0)) {
        return (b?.count || 0) - (a?.count || 0);
      }

      return String(a?.action || "").localeCompare(String(b?.action || ""));
    });
  }, [filteredRows]);

  const topActionGraphData = useMemo(() => {
    return (summaryData || []).slice(0, 8).map((item) => ({
      value: item?.count || 0,
      label: shortenLabel(item?.action || "NAv", 24),
      fullLabel: item?.action || "NAv",
      frontColor: "#2563eb",
    }));
  }, [summaryData]);

  const dailyTrendGraphData = useMemo(() => {
    const grouped = new Map();

    filteredRows.forEach((item) => {
      const day = item?.activityDate || "NAv";

      if (!grouped.has(day)) {
        grouped.set(day, {
          fullDate: day,
          value: 0,
        });
      }

      grouped.get(day).value += item?.count || 0;
    });

    return Array.from(grouped.values())
      .sort((a, b) => String(a.fullDate).localeCompare(String(b.fullDate)))
      .map((item) => ({
        value: item.value,
        label:
          typeof item.fullDate === "string" && item.fullDate.length >= 10
            ? item.fullDate.slice(5)
            : "NAv",
        fullDate: item.fullDate,
        frontColor: "#0ea5e9",
      }));
  }, [filteredRows]);

  const topActionMaxValue = useMemo(() => {
    return getSafeMaxValue(topActionGraphData);
  }, [topActionGraphData]);

  const dailyTrendMaxValue = useMemo(() => {
    return getSafeMaxValue(dailyTrendGraphData);
  }, [dailyTrendGraphData]);

  const actionChartHeight = Math.max(topActionGraphData.length * 42, 220);

  const visibleData = useMemo(() => {
    if (activeView === "SUMMARY") return summaryData;
    return dailyData;
  }, [activeView, dailyData, summaryData]);

  const totalCount = useMemo(() => {
    return filteredRows.reduce((sum, item) => sum + (item.count || 0), 0);
  }, [filteredRows]);

  const handleExport = async () => {
    try {
      const timestamp = new Date().toISOString().split("T")[0];
      let csvContent = "";

      if (activeView === "GRAPHS") {
        const topRows = (topActionGraphData || []).map(
          (item) => `"${item.fullLabel}",${item.value || 0}`,
        );

        const trendRows = (dailyTrendGraphData || []).map(
          (item) => `"${item.fullDate || "NAv"}",${item.value || 0}`,
        );

        csvContent = [
          "TOP NORMALISATION ACTIONS,COUNT",
          ...topRows,
          "",
          "ACTIVITY DATE,COUNT",
          ...trendRows,
        ].join("\n");
      } else if (activeView === "DAILY") {
        const exportRows = (dailyData || []).map(
          (item) =>
            `"${item.action}","${item.activityDate || "NAv"}",${item.count || 0}`,
        );

        csvContent = [
          "NORMALISATION ACTION,ACTIVITY DATE,COUNT",
          ...exportRows,
        ].join("\n");
      } else {
        const exportRows = (summaryData || []).map(
          (item) => `"${item.action}",${item.count || 0}`,
        );

        csvContent = ["NORMALISATION ACTION,COUNT", ...exportRows].join("\n");
      }

      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const now = new Date();
      const timeString = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
      const fileName = `Normalisation_Report_${lmName}_${activeView}_${timestamp}_${timeString}.csv`;
      const fileUri = `${baseDir}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent);

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/csv",
          dialogTitle: `Export ${lmName} Intelligence`,
        });
      }

      setIsExportModalVisible(false);
    } catch (error) {
      console.error("❌ NORMALISATION_EXPORT_FAILED:", error);
      alert("Export Error: " + error.message);
    }
  };

  if (isLoading) {
    return <ActivityIndicator style={{ flex: 1 }} color="#2563eb" />;
  }

  return (
    <View style={styles.container}>
      <UserTrnsReportHeader
        totalValue={totalCount}
        type="TRNS"
        activeView={activeView}
        selectedDateLabel={activeDateRange.label}
        onOpenDateFilter={() => setShowDateModal(true)}
        onChangeView={setActiveView}
        onDownload={() => setIsExportModalVisible(true)}
      />

      {activeView === "GRAPHS" ? (
        <ScrollView
          style={styles.graphScroll}
          contentContainerStyle={styles.graphScrollContent}
        >
          <View style={styles.graphCard}>
            <Text style={styles.graphCardTitle}>Top Normalisation Actions</Text>
            <Text style={styles.graphCardSubTitle}>
              Most common action groups in selected date range
            </Text>

            {topActionGraphData.length === 0 ? (
              <View style={styles.graphEmptyWrap}>
                <Text style={styles.graphEmptyText}>
                  No normalisation graph data for selected range.
                </Text>
              </View>
            ) : (
              <>
                <BarChart
                  data={topActionGraphData}
                  horizontal
                  width={chartWidth}
                  height={actionChartHeight}
                  barWidth={16}
                  spacing={18}
                  noOfSections={4}
                  maxValue={topActionMaxValue}
                  disableScroll
                  rotateYAxisTexts={0}
                  xAxisColor="#cbd5e1"
                  yAxisColor="#cbd5e1"
                  yAxisTextStyle={{ color: "#475569", fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: "#64748b", fontSize: 9 }}
                />

                <View style={styles.graphLegendWrap}>
                  {topActionGraphData.map((item, index) => (
                    <Text
                      key={`${item.fullLabel}-${index}`}
                      style={styles.graphLegendText}
                    >
                      {index + 1}. {item.fullLabel} ({item.value})
                    </Text>
                  ))}
                </View>
              </>
            )}
          </View>

          <View style={styles.graphCard}>
            <Text style={styles.graphCardTitle}>Daily Normalisation Trend</Text>
            <Text style={styles.graphCardSubTitle}>
              Total normalisation counts per day in selected date range
            </Text>

            {dailyTrendGraphData.length === 0 ? (
              <View style={styles.graphEmptyWrap}>
                <Text style={styles.graphEmptyText}>
                  No daily trend data for selected range.
                </Text>
              </View>
            ) : (
              <BarChart
                data={dailyTrendGraphData}
                width={chartWidth}
                height={240}
                barWidth={22}
                spacing={18}
                noOfSections={4}
                maxValue={dailyTrendMaxValue}
                disableScroll
                xAxisColor="#cbd5e1"
                yAxisColor="#cbd5e1"
                yAxisTextStyle={{ color: "#475569", fontSize: 10 }}
                xAxisLabelTextStyle={{ color: "#64748b", fontSize: 9 }}
              />
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.tableHeader}>
            <View style={styles.typeHeaderCell}>
              <Text style={styles.headerText}>NORMALISATION ACTION</Text>
            </View>
            <View style={styles.countHeaderCell}>
              <Text style={styles.headerText}>COUNT</Text>
            </View>
          </View>

          <FlatList
            data={visibleData}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.typeCell}>
                  <Text style={styles.actionName}>{item.action}</Text>

                  {activeView === "DAILY" ? (
                    <Text style={styles.dateText}>
                      {item.activityDate || "NAv"}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.countCell}>
                  <Text style={styles.numCellText}>{item.count || 0}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>
                  {activeView === "SUMMARY"
                    ? `No normalisation action groups found for ${activeDateRange.label} in ${lmName}.`
                    : `No daily normalisation groups found for ${activeDateRange.label} in ${lmName}.`}
                </Text>
              </View>
            }
          />
        </View>
      )}

      <DateRangeModal
        visible={showDateModal}
        onClose={() => setShowDateModal(false)}
        onSelect={(range) => setActiveDateRange(range)}
      />

      <ExportIntelligenceModal
        visible={isExportModalVisible}
        onClose={() => setIsExportModalVisible(false)}
        onExport={handleExport}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 2,
    borderColor: "#cbd5e1",
  },

  typeHeaderCell: {
    flex: 4,
    padding: 12,
    borderRightWidth: 1,
    borderColor: "#e2e8f0",
  },

  countHeaderCell: {
    flex: 1,
    padding: 12,
    alignItems: "center",
  },

  headerText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#475569",
    letterSpacing: 1,
  },

  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#fff",
  },

  typeCell: {
    flex: 4,
    padding: 15,
    backgroundColor: "#fdfdfd",
    borderRightWidth: 1,
    borderColor: "#f1f5f9",
  },

  countCell: {
    flex: 1,
    padding: 15,
    justifyContent: "center",
    alignItems: "center",
  },

  numCellText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#2563eb",
  },

  actionName: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1e293b",
  },

  dateText: {
    marginTop: 4,
    fontSize: 9,
    color: "#94a3b8",
  },

  emptyWrap: {
    padding: 40,
    alignItems: "center",
  },

  emptyText: {
    color: "#64748b",
    fontWeight: "600",
    textAlign: "center",
  },

  graphScroll: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  graphScrollContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 16,
  },

  graphCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
  },

  graphCardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
  },

  graphCardSubTitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 11,
    color: "#64748b",
  },

  graphEmptyWrap: {
    paddingVertical: 30,
    alignItems: "center",
    justifyContent: "center",
  },

  graphEmptyText: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
    textAlign: "center",
  },

  graphLegendWrap: {
    marginTop: 14,
    gap: 6,
  },

  graphLegendText: {
    fontSize: 10,
    color: "#475569",
    fontWeight: "600",
  },
});
