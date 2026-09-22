import { useAuth } from "@/src/hooks/useAuth";
import { useInviteSpvMutation } from "@/src/redux/authApi";
import { useGetServiceProvidersQuery } from "@/src/redux/spApi";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  HelperText,
  List,
  Modal,
  Portal,
  Text,
  TextInput,
} from "react-native-paper";
import { FORM_TEXT } from "../../../../src/theme/formColors";

function getServiceProviderParentSpClient(serviceProvider) {
  const clients = Array.isArray(serviceProvider?.clients)
    ? serviceProvider.clients
    : [];

  return (
    clients.find(
      (client) =>
        client?.clientType === "SP" &&
        client?.relationshipType === "SUBC" &&
        client?.id,
    ) || null
  );
}

function getDirectSubcChildren(parentSpId, allServiceProviders = []) {
  return allServiceProviders.filter((serviceProvider) => {
    const parentSpClient = getServiceProviderParentSpClient(serviceProvider);
    return parentSpClient?.id === parentSpId;
  });
}

function collectMngTreeServiceProviderIds(
  rootSpId,
  allServiceProviders = [],
  visitedIds = new Set(),
) {
  if (!rootSpId) return [];
  if (visitedIds.has(rootSpId)) return [];

  visitedIds.add(rootSpId);

  const childProviders = getDirectSubcChildren(rootSpId, allServiceProviders);

  const childIds = childProviders.flatMap((childProvider) =>
    collectMngTreeServiceProviderIds(
      childProvider.id,
      allServiceProviders,
      visitedIds,
    ),
  );

  return [rootSpId, ...childIds];
}

function normalizeProviderOptions(
  serviceProviderIds = [],
  allServiceProviders = [],
) {
  const seenIds = new Set();

  return serviceProviderIds
    .map((id) => allServiceProviders.find((item) => item?.id === id))
    .filter(Boolean)
    .map((serviceProvider) => ({
      id: serviceProvider?.id || "NAv",
      name:
        String(serviceProvider?.profile?.tradingName || "").trim() ||
        String(serviceProvider?.name || "").trim() ||
        "NAv",
      status: serviceProvider?.status || "NAv",
    }))
    .filter((item) => {
      if (!item?.id || item.id === "NAv" || seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export default function CreateSupervisorScreen() {
  const router = useRouter();
  const { user, profile, isMNG } = useAuth();

  const [inviteSpv, { isLoading: isSubmitting }] = useInviteSpvMutation();

  const { data: allServiceProviders = [], isLoading: isLoadingProviders } =
    useGetServiceProvidersQuery();

  const creatorServiceProvider = profile?.employment?.serviceProvider || null;
  const creatorServiceProviderId = creatorServiceProvider?.id || null;

  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [selectedServiceProvider, setSelectedServiceProvider] = useState(null);
  const [providerPickerVisible, setProviderPickerVisible] = useState(false);

  const allowedServiceProviders = useMemo(() => {
    if (!creatorServiceProviderId) return [];
    if (!Array.isArray(allServiceProviders) || allServiceProviders.length === 0)
      return [];

    const allowedIds = collectMngTreeServiceProviderIds(
      creatorServiceProviderId,
      allServiceProviders,
    );

    return normalizeProviderOptions(allowedIds, allServiceProviders);
  }, [creatorServiceProviderId, allServiceProviders]);

  const selectedProviderName =
    selectedServiceProvider?.name || "Select Service Provider";

  const emailError =
    email.trim().length > 0 &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());

  const canSubmit =
    !isSubmitting &&
    !!name.trim() &&
    !!surname.trim() &&
    !!email.trim() &&
    !emailError &&
    !!selectedServiceProvider?.id;

  const handleCreateSupervisor = async () => {
    if (!isMNG) {
      Alert.alert("Access Denied", "Only a Manager may create a Supervisor.");
      return;
    }

    if (!creatorServiceProviderId) {
      Alert.alert(
        "Missing Service Provider Link",
        "This Manager is not linked to a valid Service Provider.",
      );
      return;
    }

    if (!name.trim() || !surname.trim() || !email.trim()) {
      Alert.alert(
        "Incomplete Form",
        "Name, surname, email and service provider are required.",
      );
      return;
    }

    if (emailError) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (!selectedServiceProvider?.id || !selectedServiceProvider?.name) {
      Alert.alert(
        "Service Provider Required",
        "Please choose the Service Provider the Supervisor belongs to.",
      );
      return;
    }

    try {
      await inviteSpv({
        email: email.trim().toLowerCase(),
        name: name.trim(),
        surname: surname.trim(),
        serviceProvider: {
          id: selectedServiceProvider.id,
          name: selectedServiceProvider.name,
        },
      }).unwrap();

      Alert.alert(
        "Supervisor Created",
        "The Supervisor was created successfully. Default password is 'password' and must be changed on first login.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error) {
      Alert.alert(
        "Creation Failed",
        error?.message || "The Supervisor could not be created.",
      );
    }
  };

  if (!isMNG) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.centerText}>
          Mission denied. Only Managers may create Supervisors.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Create Supervisor</Text>
          <Text style={styles.helper}>
            Create an SPV under your MNC or one of your SUBCs. The Supervisor
            will inherit workbases through the selected Service Provider.
          </Text>

          <View style={styles.section}>
            <TextInput
              label="Name"
              mode="outlined"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              style={styles.input}
            />

            <TextInput
              label="Surname"
              mode="outlined"
              value={surname}
              onChangeText={setSurname}
              autoCapitalize="words"
              style={styles.input}
            />

            <TextInput
              label="Email"
              mode="outlined"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />
            <HelperText type="error" visible={!!emailError}>
              Enter a valid email address.
            </HelperText>

            <Text style={styles.label}>Assign Service Provider</Text>
            <Pressable
              style={styles.selector}
              onPress={() => setProviderPickerVisible(true)}
            >
              <View>
                <Text style={styles.selectorTitle}>{selectedProviderName}</Text>
                <Text style={styles.selectorSub}>
                  Choose the MNC or SUBC this Supervisor belongs to.
                </Text>
              </View>
            </Pressable>

            <HelperText
              type="info"
              visible={
                !!creatorServiceProvider?.name || !!creatorServiceProviderId
              }
            >
              Your root Service Provider:{" "}
              {creatorServiceProvider?.name || "NAv"}
            </HelperText>

            <HelperText
              type="error"
              visible={!selectedServiceProvider?.id && !isLoadingProviders}
            >
              Please choose a Service Provider.
            </HelperText>
          </View>

          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={() => router.back()}
              style={styles.actionBtn}
            >
              Cancel
            </Button>

            <Button
              mode="contained"
              onPress={handleCreateSupervisor}
              loading={isSubmitting}
              disabled={!canSubmit}
              style={styles.actionBtn}
            >
              Create Supervisor
            </Button>
          </View>
        </View>
      </ScrollView>

      <Portal>
        <Modal
          visible={providerPickerVisible}
          onDismiss={() => setProviderPickerVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>Select Service Provider</Text>

          {isLoadingProviders ? (
            <Text style={styles.modalEmpty}>Loading service providers...</Text>
          ) : allowedServiceProviders.length === 0 ? (
            <Text style={styles.modalEmpty}>
              No Service Providers available in your structure.
            </Text>
          ) : (
            allowedServiceProviders.map((item) => (
              <List.Item
                key={item.id}
                title={item.name}
                description={`${item.status} • ${item.id}`}
                onPress={() => {
                  setSelectedServiceProvider({
                    id: item.id,
                    name: item.name,
                  });
                  setProviderPickerVisible(false);
                }}
                right={(props) =>
                  selectedServiceProvider?.id === item.id ? (
                    <List.Icon {...props} icon="check" color="#2563eb" />
                  ) : null
                }
              />
            ))
          )}

          <Button onPress={() => setProviderPickerVisible(false)}>Close</Button>
        </Modal>
      </Portal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: FORM_TEXT,
    marginBottom: 8,
  },
  helper: {
    color: FORM_TEXT,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 18,
  },
  section: {
    gap: 8,
  },
  input: {
    backgroundColor: "#fff",
  },
  label: {
    marginTop: 4,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: "900",
    color: FORM_TEXT,
  },
  selector: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#fff",
  },
  selectorTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: FORM_TEXT,
  },
  selectorSub: {
    fontSize: 12,
    color: FORM_TEXT,
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
  },
  actionBtn: {
    borderRadius: 10,
  },
  modal: {
    backgroundColor: "#fff",
    margin: 20,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: FORM_TEXT,
    marginBottom: 12,
  },
  modalEmpty: {
    color: FORM_TEXT,
    marginBottom: 12,
  },
  centerWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 24,
  },
  centerText: {
    textAlign: "center",
    color: FORM_TEXT,
    fontWeight: "700",
  },
});
