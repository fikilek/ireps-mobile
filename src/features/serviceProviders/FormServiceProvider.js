import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  List,
  Searchbar,
  Text,
  TextInput,
} from "react-native-paper";
import { FORM_TEXT, FORM_PLACEHOLDER } from "../../theme/formColors";

export default function FormServiceProvider({
  formValues,
  setFormValues,
  allLms = [],
  allServiceProviders = [],
  isLoadingLms = false,
  isLoadingServiceProviders = false,
  canEditClients = false,
  canEditStatus = false,
  showRegisteredName = true,
  showRegistrationNumber = true,
  showOwner = true,
  excludedServiceProviderId = null,
  submitLabel = "SAVE SERVICE PROVIDER",
  helperNote = "",
  onSubmit,
  isSubmitting = false,
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const registryOptions = useMemo(() => {
    const lmOptions = (allLms || []).map((lm) => ({
      id: lm.id,
      name: lm.name || "NAv",
      clientType: "LM",
      relationshipType: "MNC",
      description: "Local Municipality",
      icon: "map-marker",
    }));

    const serviceProviderOptions = (allServiceProviders || [])
      .filter(
        (serviceProvider) => serviceProvider.id !== excludedServiceProviderId,
      )
      .map((serviceProvider) => ({
        id: serviceProvider.id,
        name:
          serviceProvider?.profile?.tradingName ||
          serviceProvider?.profile?.registeredName ||
          "NAv",
        clientType: "SP",
        relationshipType: "SUBC",
        description: "Service Provider",
        icon: "office-building",
      }));

    return [...lmOptions, ...serviceProviderOptions].filter((item) =>
      String(item?.name || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
    );
  }, [allLms, allServiceProviders, searchQuery, excludedServiceProviderId]);

  const updateProfileField = (fieldName, value) => {
    setFormValues((currentFormValues) => ({
      ...currentFormValues,
      profile: {
        ...currentFormValues.profile,
        [fieldName]: value,
      },
    }));
  };

  const updateOwnerField = (fieldName, value) => {
    setFormValues((currentFormValues) => ({
      ...currentFormValues,
      owner: {
        ...currentFormValues.owner,
        [fieldName]: value,
      },
    }));
  };

  const updateStatus = (nextStatus) => {
    setFormValues((currentFormValues) => ({
      ...currentFormValues,
      status: nextStatus,
    }));
  };

  const toggleClient = (client) => {
    const alreadySelected = (formValues?.clients || []).some(
      (selectedClient) => selectedClient.id === client.id,
    );

    if (alreadySelected) {
      setFormValues((currentFormValues) => ({
        ...currentFormValues,
        clients: (currentFormValues.clients || []).filter(
          (selectedClient) => selectedClient.id !== client.id,
        ),
      }));
      return;
    }

    setFormValues((currentFormValues) => ({
      ...currentFormValues,
      clients: [
        ...(currentFormValues.clients || []),
        {
          id: client.id,
          name: client.name,
          clientType: client.clientType,
          relationshipType: client.relationshipType,
        },
      ],
    }));
  };

  const tradingName = formValues?.profile?.tradingName ?? "";
  const registeredName = formValues?.profile?.registeredName ?? "";
  const registrationNumber = formValues?.profile?.registrationNumber ?? "";
  const ownerId = formValues?.owner?.id ?? "";
  const ownerName = formValues?.owner?.name ?? "";

  const selectedClients = formValues?.clients || [];
  const selectedStatus = formValues?.status || "ACTIVE";

  return (
    <>
      <View style={styles.helperNoteWrapper}>
        {helperNote ? (
          <Text style={styles.helperNote}>{helperNote}</Text>
        ) : null}
      </View>

      <Card style={styles.card} elevation={0}>
        <Card.Content>
          <Text style={styles.sectionHeader}>Service Provider Profile</Text>

          <TextInput
            label="Trading Name"
            value={tradingName}
            onChangeText={(value) => updateProfileField("tradingName", value)}
            mode="outlined"
            style={styles.input}
            autoCapitalize="words"
          />

          {showRegisteredName && (
            <TextInput
              label="Registered Name"
              value={registeredName}
              onChangeText={(value) =>
                updateProfileField("registeredName", value)
              }
              mode="outlined"
              style={styles.input}
              autoCapitalize="words"
            />
          )}

          {showRegistrationNumber && (
            <TextInput
              label="Registration Number"
              value={registrationNumber}
              onChangeText={(value) =>
                updateProfileField("registrationNumber", value)
              }
              mode="outlined"
              style={styles.input}
            />
          )}
        </Card.Content>
      </Card>

      {showOwner && (
        <Card style={styles.card} elevation={0}>
          <Card.Content>
            <Text style={styles.sectionHeader}>Owner</Text>

            <TextInput
              label="Owner Name"
              value={ownerName}
              onChangeText={(value) => updateOwnerField("name", value)}
              mode="outlined"
              style={styles.input}
              autoCapitalize="words"
            />

            <TextInput
              label="Owner ID"
              value={ownerId}
              onChangeText={(value) => updateOwnerField("id", value)}
              mode="outlined"
              style={styles.input}
            />
          </Card.Content>
        </Card>
      )}

      {canEditStatus && (
        <Card style={styles.card} elevation={0}>
          <Card.Content>
            <Text style={styles.sectionHeader}>Status</Text>

            <View style={styles.statusRow}>
              <Chip
                selected={selectedStatus === "ACTIVE"}
                onPress={() => updateStatus("ACTIVE")}
                style={[
                  styles.statusChip,
                  selectedStatus === "ACTIVE" && styles.statusChipActive,
                ]}
                textStyle={[
                  styles.statusChipText,
                  selectedStatus === "ACTIVE" && styles.statusChipTextActive,
                ]}
              >
                ACTIVE
              </Chip>

              <Chip
                selected={selectedStatus === "INACTIVE"}
                onPress={() => updateStatus("INACTIVE")}
                style={[
                  styles.statusChip,
                  selectedStatus === "INACTIVE" && styles.statusChipInactive,
                ]}
                textStyle={[
                  styles.statusChipText,
                  selectedStatus === "INACTIVE" && styles.statusChipTextActive,
                ]}
              >
                INACTIVE
              </Chip>
            </View>
          </Card.Content>
        </Card>
      )}

      {canEditClients && (
        <>
          <View style={styles.searchContainer}>
            <Searchbar
              placeholder="Search LMs or SPs"
              placeholderTextColor={FORM_PLACEHOLDER}
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={styles.searchBar}
              inputStyle={styles.searchInput}
              iconColor="#2563eb"
              elevation={0}
            />
          </View>

          <View style={styles.registryBox}>
            <Text style={styles.registryHeader}>
              Client Allocation ({selectedClients.length} Selected)
            </Text>

            {isLoadingLms || isLoadingServiceProviders ? (
              <ActivityIndicator
                animating={true}
                color="#2563eb"
                style={{ margin: 40 }}
              />
            ) : (
              registryOptions.map((item) => {
                const isSelected = selectedClients.some(
                  (selectedClient) => selectedClient.id === item.id,
                );

                return (
                  <List.Item
                    key={item.id}
                    title={item.name}
                    description={`${item.description} • ${item.relationshipType}`}
                    titleStyle={{
                      fontWeight: isSelected ? "800" : "600",
                      color: isSelected ? "#1d4ed8" : "#0f172a",
                    }}
                    descriptionStyle={{
                      color: isSelected ? "#1e40af" : "#64748b",
                    }}
                    left={() => (
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <Checkbox
                          status={isSelected ? "checked" : "unchecked"}
                          color="#2563eb"
                          uncheckedColor="#94a3b8"
                        />
                        <List.Icon
                          icon={item.icon}
                          color={
                            item.clientType === "LM" ? "#64748b" : "#8b5cf6"
                          }
                        />
                      </View>
                    )}
                    onPress={() => toggleClient(item)}
                    style={[
                      styles.clientItem,
                      isSelected && styles.clientItemActive,
                    ]}
                  />
                );
              })
            )}
          </View>
        </>
      )}

      <View style={styles.footer}>
        {canEditClients && (
          <View style={styles.chipBox}>
            {selectedClients.map((selectedClient) => (
              <Chip
                key={selectedClient.id}
                onClose={() => toggleClient(selectedClient)}
                style={styles.chip}
                textStyle={{ color: "#1e3a8a", fontWeight: "800" }}
                closeIconColor="#1d4ed8"
              >
                {selectedClient.name}
              </Chip>
            ))}
          </View>
        )}

        <Button
          mode="contained"
          onPress={onSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
          style={[
            styles.submitBtn,
            !tradingName.trim() && styles.submitBtnInactive,
          ]}
          contentStyle={{ height: 56 }}
          labelStyle={styles.submitBtnLabel}
        >
          {submitLabel}
        </Button>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    marginBottom: 12,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  sectionHeader: {
    fontSize: 11,
    fontWeight: "800",
    color: FORM_TEXT,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  input: {
    marginBottom: 10,
    backgroundColor: "#ffffff",
  },

  statusRow: {
    flexDirection: "row",
    gap: 10,
  },

  statusChip: {
    backgroundColor: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },

  statusChipActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#60a5fa",
  },

  statusChipInactive: {
    backgroundColor: "#fee2e2",
    borderColor: "#f87171",
  },

  statusChipText: {
    fontWeight: "700",
    color: FORM_TEXT,
  },

  statusChipTextActive: {
    color: "#0f172a",
  },

  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#f8fafc",
    overflow: "hidden",
  },

  searchBar: {
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    elevation: 0,
    shadowOpacity: 0,
    overflow: "hidden",
  },

  searchInput: {
    color: "#0f172a",
  },

  registryBox: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 8,
    minHeight: 420,
    borderTopWidth: 1,
    borderColor: "#e2e8f0",
  },

  registryHeader: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 14,
  },

  clientItem: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    backgroundColor: "#ffffff",
    paddingVertical: 2,
  },

  clientItemActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#60a5fa",
  },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 32,
    backgroundColor: "#ffffff",
  },

  chipBox: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
  },

  chip: {
    backgroundColor: "#bfdbfe",
    borderWidth: 1,
    borderColor: "#60a5fa",
  },

  submitBtn: {
    borderRadius: 16,
    backgroundColor: "#2563eb",
  },

  submitBtnInactive: {
    backgroundColor: "#93c5fd",
  },

  submitBtnLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
  },
  helperNote: {
    fontSize: 12,
    color: FORM_TEXT,
    marginVertical: 14,
    lineHeight: 18,
  },
  helperNoteWrapper: {
    paddingHorizontal: 16,
    // paddingVertical: 10,
    // paddingBottom: 32,
    backgroundColor: "#ffffff",
  },
});
