import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useListIrepsSelectLookupsQuery } from "@/src/redux/irepsSelectLookupsApi";
import { FORM_TEXT, FORM_PLACEHOLDER } from "../../../../../src/theme/formColors";

function getStatusStyle(status) {
  const cleanStatus = String(status || "").toUpperCase();

  if (cleanStatus === "PUBLISHED") {
    return {
      label: "Published",
      containerStyle: styles.statusPublished,
      textStyle: styles.statusPublishedText,
    };
  }

  if (cleanStatus === "DRAFT") {
    return {
      label: "Draft",
      containerStyle: styles.statusDraft,
      textStyle: styles.statusDraftText,
    };
  }

  if (cleanStatus === "DISABLED") {
    return {
      label: "Disabled",
      containerStyle: styles.statusDisabled,
      textStyle: styles.statusDisabledText,
    };
  }

  if (cleanStatus === "ARCHIVED") {
    return {
      label: "Archived",
      containerStyle: styles.statusArchived,
      textStyle: styles.statusArchivedText,
    };
  }

  return {
    label: cleanStatus || "Unknown",
    containerStyle: styles.statusUnknown,
    textStyle: styles.statusUnknownText,
  };
}

function LookupStatusBadge({ status }) {
  const statusUi = getStatusStyle(status);

  return (
    <View style={[styles.statusBadge, statusUi.containerStyle]}>
      <Text style={[styles.statusBadgeText, statusUi.textStyle]}>
        {statusUi.label}
      </Text>
    </View>
  );
}

function LookupCard({ item }) {
  const lookupKey = item?.lookupKey || item?.id || "NAv";
  const title = item?.title || lookupKey;
  const domain = item?.domain || "NAv";
  const optionCount = Number(item?.optionCount || 0);
  const version = Number(item?.version || 1);

  return (
    <Pressable
      style={styles.lookupCard}
      onPress={() =>
        router.push({
          pathname: "/(tabs)/admin/settings/select-lookups/[lookupKey]",
          params: {
            lookupKey,
          },
        })
      }
    >
      <View style={styles.lookupCardMain}>
        <View style={styles.lookupTitleRow}>
          <Text style={styles.lookupTitle} numberOfLines={1}>
            {title}
          </Text>

          <LookupStatusBadge status={item?.status} />
        </View>

        <Text style={styles.lookupKey} numberOfLines={1}>
          {lookupKey}
        </Text>

        <View style={styles.lookupMetaRow}>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons
              name="folder-outline"
              size={14}
              color="#6B7280"
            />
            <Text style={styles.metaPillText}>{domain}</Text>
          </View>

          <View style={styles.metaPill}>
            <MaterialCommunityIcons
              name="format-list-bulleted"
              size={14}
              color="#6B7280"
            />
            <Text style={styles.metaPillText}>
              {optionCount} option{optionCount === 1 ? "" : "s"}
            </Text>
          </View>

          <View style={styles.metaPill}>
            <MaterialCommunityIcons
              name="source-branch"
              size={14}
              color="#6B7280"
            />
            <Text style={styles.metaPillText}>v{version}</Text>
          </View>
        </View>

        {item?.allowOther !== false ? (
          <View style={styles.otherRow}>
            <MaterialCommunityIcons
              name="plus-circle-outline"
              size={14}
              color="#2563EB"
            />
            <Text style={styles.otherText}>
              Allows Other: {item?.otherLabel || "Other"}
            </Text>
          </View>
        ) : null}
      </View>

      <MaterialCommunityIcons name="chevron-right" size={24} color="#9CA3AF" />
    </Pressable>
  );
}

export default function SelectLookupsPage() {
  const [searchText, setSearchText] = useState("");

  const {
    data: lookups = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useListIrepsSelectLookupsQuery();

  const filteredLookups = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) return lookups;

    return lookups.filter((item) => {
      const haystack = [
        item?.lookupKey,
        item?.title,
        item?.description,
        item?.domain,
        item?.fieldKey,
        item?.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [lookups, searchText]);

  function handleCreateLookup() {
    router.push("/(tabs)/admin/settings/select-lookups/create");
  }

  function handleRefresh() {
    refetch();
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.centerText}>Loading select lookups...</Text>
      </View>
    );
  }

  if (error) {
    console.log(`error`, error);
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={42}
          color="#B91C1C"
        />

        <Text style={styles.errorTitle}>Could not load select lookups</Text>

        <Text style={styles.errorMessage}>
          {error?.message || "Please check your connection and try again."}
        </Text>

        <Pressable style={styles.primaryButton} onPress={handleRefresh}>
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <View style={styles.headerIcon}>
          <MaterialCommunityIcons
            name="format-list-bulleted-type"
            size={26}
            color="#2563EB"
          />
        </View>

        <View style={styles.headerTextWrap}>
          <Text style={styles.screenTitle}>Select Lookups</Text>
          <Text style={styles.screenSubtitle}>
            Manage reusable dropdown values used by iREPS forms.
          </Text>
        </View>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color="#6B7280" />

          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search lookup key, title, domain..."
            placeholderTextColor={FORM_PLACEHOLDER}
            style={styles.searchInput}
            autoCapitalize="none"
          />

          {searchText ? (
            <Pressable onPress={() => setSearchText("")}>
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color="#9CA3AF"
              />
            </Pressable>
          ) : null}
        </View>

        <Pressable style={styles.createButton} onPress={handleCreateLookup}>
          <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
          <Text style={styles.createButtonText}>Create</Text>
        </Pressable>
      </View>

      <FlatList
        data={filteredLookups}
        keyExtractor={(item) => item?.lookupKey || item?.id}
        renderItem={({ item }) => <LookupCard item={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="database-search-outline"
              size={38}
              color="#9CA3AF"
            />

            <Text style={styles.emptyTitle}>
              {searchText ? "No matching lookups" : "No lookups created yet"}
            </Text>

            <Text style={styles.emptyText}>
              {searchText
                ? "Try another search term."
                : "Create the first reusable dropdown lookup for iREPS forms."}
            </Text>

            {!searchText ? (
              <Pressable
                style={[styles.primaryButton, styles.emptyButton]}
                onPress={handleCreateLookup}
              >
                <Text style={styles.primaryButtonText}>Create Lookup</Text>
              </Pressable>
            ) : null}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    padding: 16,
  },

  center: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },

  centerText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },

  errorTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
  },

  errorMessage: {
    marginTop: 6,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },

  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 14,
  },

  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  headerTextWrap: {
    flex: 1,
  },

  screenTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
  },

  screenSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },

  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  searchBox: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    marginRight: 10,
  },

  searchInput: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: 14,
    color: FORM_TEXT,
  },

  createButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingHorizontal: 14,
  },

  createButtonText: {
    marginLeft: 4,
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  listContent: {
    paddingBottom: 24,
  },

  lookupCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
  },

  lookupCardMain: {
    flex: 1,
    paddingRight: 8,
  },

  lookupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  lookupTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
    marginRight: 8,
  },

  lookupKey: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },

  lookupMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    gap: 6,
  },

  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
  },

  metaPillText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
  },

  otherRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
  },

  otherText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },

  statusBadgeText: {
    fontSize: 10,
    fontWeight: "900",
  },

  statusPublished: {
    backgroundColor: "#DCFCE7",
  },

  statusPublishedText: {
    color: "#166534",
  },

  statusDraft: {
    backgroundColor: "#FEF3C7",
  },

  statusDraftText: {
    color: "#92400E",
  },

  statusDisabled: {
    backgroundColor: "#E5E7EB",
  },

  statusDisabledText: {
    color: "#374151",
  },

  statusArchived: {
    backgroundColor: "#FEE2E2",
  },

  statusArchivedText: {
    color: "#991B1B",
  },

  statusUnknown: {
    backgroundColor: "#E0E7FF",
  },

  statusUnknownText: {
    color: "#3730A3",
  },

  emptyCard: {
    marginTop: 32,
    padding: 24,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
  },

  emptyText: {
    marginTop: 5,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
  },

  emptyButton: {
    marginTop: 14,
  },

  primaryButton: {
    marginTop: 18,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
