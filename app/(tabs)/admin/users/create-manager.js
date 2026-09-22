import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Formik } from "formik";
import { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Divider,
  List,
  Modal,
  Portal,
  TextInput,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import { useInviteMngMutation } from "../../../../src/redux/authApi";
import { useGetServiceProvidersQuery } from "../../../../src/redux/spApi";
import { FORM_TEXT } from "../../../../src/theme/formColors";

export default function CreateManagerScreen() {
  const router = useRouter();
  const [inviteMng, { isLoading: isInviting }] = useInviteMngMutation();

  const { data: allSPs = [], isLoading: loadingSPs } =
    useGetServiceProvidersQuery();

  const [selectedMNC, setSelectedMNC] = useState(null);
  const [mncModal, setMncModal] = useState(false);

  // Current rule:
  // An SP is valid for MNG creation if:
  // - status === ACTIVE
  // - clients is a non-empty array
  // - at least one client has clientType === "LM"
  const mncList = useMemo(() => {
    return (allSPs || []).filter((sp) => {
      const status = String(sp?.status || "").toUpperCase();
      const clients = Array.isArray(sp?.clients) ? sp.clients : [];
      const hasLmClient = clients.some((client) => client?.clientType === "LM");

      return status === "ACTIVE" && hasLmClient;
    });
  }, [allSPs]);

  const getSpName = (sp) =>
    sp?.profile?.tradingName ||
    sp?.profile?.registeredName ||
    sp?.name ||
    "NAv";

  const getSpLmCount = (sp) => {
    const clients = Array.isArray(sp?.clients) ? sp.clients : [];
    return clients.filter((client) => client?.clientType === "LM").length;
  };

  const handleSubmit = async (values) => {
    if (
      !values?.email?.trim() ||
      !values?.name?.trim() ||
      !values?.surname?.trim()
    ) {
      return Alert.alert("Hold!", "Email, name and surname are required.");
    }

    if (!selectedMNC?.id) {
      return Alert.alert("Hold!", "Select a Main Contractor first.");
    }

    try {
      await inviteMng({
        email: values.email.toLowerCase().trim(),
        name: values.name.trim(),
        surname: values.surname.trim(),
        mnc: {
          id: selectedMNC.id,
          name: getSpName(selectedMNC),
        },
      }).unwrap();

      Alert.alert(
        "Mission Confirmed",
        `Manager ${values.name.trim()} invited successfully.`,
      );
      router.back();
    } catch (err) {
      Alert.alert(
        "Command Error",
        err?.data || err?.message || "Could not invite manager.",
      );
    }
  };

  if (loadingSPs) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Syncing Service Providers...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.sovereignLabel}>Appoint Manager (MNG)</Text>

        <Formik
          initialValues={{ email: "", name: "", surname: "" }}
          onSubmit={handleSubmit}
        >
          {({ handleChange, handleSubmit, values }) => (
            <View style={styles.form}>
              <TextInput
                label="Email Address"
                value={values.email}
                onChangeText={handleChange("email")}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />

              <View style={styles.row}>
                <TextInput
                  label="First Name"
                  value={values.name}
                  onChangeText={handleChange("name")}
                  mode="outlined"
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  label="Surname"
                  value={values.surname}
                  onChangeText={handleChange("surname")}
                  mode="outlined"
                  style={[styles.input, { flex: 1 }]}
                />
              </View>

              <Divider style={styles.divider} />

              {/* MNC SELECTOR */}
              <TouchableOpacity
                onPress={() => setMncModal(true)}
                style={styles.selector}
              >
                <Text style={styles.boxLabel}>
                  Assigned Main Contractor (MNC)
                </Text>

                <View style={styles.selectorInner}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text
                      style={[
                        styles.selectedText,
                        !selectedMNC && styles.placeholder,
                      ]}
                      numberOfLines={1}
                    >
                      {selectedMNC
                        ? getSpName(selectedMNC)
                        : "Select Main Contractor..."}
                    </Text>

                    {!!selectedMNC && (
                      <Text style={styles.helperText} numberOfLines={1}>
                        {getSpLmCount(selectedMNC)} LM workbase
                        {getSpLmCount(selectedMNC) === 1 ? "" : "s"} will be
                        inherited automatically
                      </Text>
                    )}
                  </View>

                  <MaterialCommunityIcons
                    name="office-building"
                    size={20}
                    color="#2563eb"
                  />
                </View>
              </TouchableOpacity>

              {/* INFO BOX */}
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Workbase Inheritance</Text>
                <Text style={styles.infoText}>
                  You do not assign workbases manually here. When the Manager is
                  created, the system reads LM clients from the selected Service
                  Provider and inherits those workbases automatically.
                </Text>
              </View>

              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={isInviting}
                style={styles.submitBtn}
                labelStyle={{ fontWeight: "900" }}
              >
                INVITE TO iREPS
              </Button>
            </View>
          )}
        </Formik>

        <Portal>
          <Modal
            visible={mncModal}
            onDismiss={() => setMncModal(false)}
            contentContainerStyle={styles.modal}
          >
            <Text style={styles.modalTitle}>Select Main Contractor</Text>

            <ScrollView style={{ maxHeight: 360 }}>
              {mncList.length === 0 ? (
                <Text style={styles.emptyText}>
                  No active Service Providers with LM clients found.
                </Text>
              ) : (
                mncList.map((mnc) => (
                  <List.Item
                    key={mnc?.id}
                    title={getSpName(mnc)}
                    description={`${getSpLmCount(mnc)} LM workbase${
                      getSpLmCount(mnc) === 1 ? "" : "s"
                    }`}
                    onPress={() => {
                      setSelectedMNC(mnc);
                      setMncModal(false);
                    }}
                    left={(p) => <List.Icon {...p} icon="office-building" />}
                  />
                ))
              )}
            </ScrollView>
          </Modal>
        </Portal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { padding: 24 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: "800",
    color: FORM_TEXT,
  },
  sovereignLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#2563eb",
    textTransform: "uppercase",
    marginBottom: 24,
    letterSpacing: 1,
  },
  form: { gap: 12 },
  row: { flexDirection: "row", gap: 10 },
  input: { backgroundColor: "#f8fafc" },
  divider: { marginVertical: 8, backgroundColor: "transparent" },
  selector: {
    padding: 16,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  boxLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: FORM_TEXT,
    textTransform: "uppercase",
  },
  selectorInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  selectedText: {
    fontSize: 15,
    fontWeight: "700",
    color: FORM_TEXT,
  },
  placeholder: { color: FORM_TEXT },
  helperText: {
    marginTop: 4,
    fontSize: 11,
    color: FORM_TEXT,
  },
  infoBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  infoTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#1d4ed8",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  infoText: {
    fontSize: 12,
    color: "#1e3a8a",
    lineHeight: 18,
  },
  submitBtn: {
    marginTop: 20,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    height: 50,
    justifyContent: "center",
  },
  modal: {
    backgroundColor: "white",
    padding: 20,
    margin: 20,
    borderRadius: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: FORM_TEXT,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 13,
    color: FORM_TEXT,
    paddingVertical: 12,
  },
});
