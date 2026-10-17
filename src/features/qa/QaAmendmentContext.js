import React, { createContext, useContext, useEffect } from "react";
import { Formik as BaseFormik, useFormikContext } from "formik";
import { ScrollView, View, Text, TextInput, TouchableOpacity } from "react-native";
import { useLocalSearchParams } from "expo-router";

export const QaAmendmentContext = createContext(null);
export const useQaAmendment = () => useContext(QaAmendmentContext);
export function useQaSearchParams() {
  const params = useLocalSearchParams();
  const qa = useQaAmendment();
  return qa ? { ...params, ...qa.params } : params;
}

function QaControls({ serialize }) {
  const qa = useQaAmendment();
  const form = useFormikContext();
  const observe = qa.observe;
  useEffect(() => { observe(form.values); }, [observe, form.values]);
  return <ScrollView style={{ flexGrow: 0, maxHeight: "45%", backgroundColor: "#eaf2ff" }} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
    <Text style={{ fontSize: 19, fontWeight: "700", color: "#102c54" }}>QA {qa.context.state}</Text>
    <Text selectable style={{ color: "#172b4d" }}>{qa.context.trnId}</Text>
    {(!!qa.context.snapshot.qa?.reasonLabel || !!qa.context.snapshot.qa?.comment) && <Text style={{ color: "#8b1b1b" }}>{[qa.context.snapshot.qa.reasonLabel, qa.context.snapshot.qa.comment].filter(Boolean).join(": ")}</Text>}
    {qa.context.takeover && <TextInput accessibilityLabel="Takeover reason" placeholder="Why are you taking over? Confirm the submitter has left." placeholderTextColor="#52647a" value={qa.takeoverReason} onChangeText={qa.setTakeoverReason} multiline maxLength={4000} style={{ color: "#172b4d", backgroundColor: "white", padding: 10 }} />}
    {!!qa.message && <Text accessibilityRole="alert" style={{ color: "#8b1b1b" }}>{qa.message}</Text>}
    {!!qa.conflict && <TouchableOpacity onPress={qa.confirmHistoricalOnly}><Text style={{ color: "#075dc5", padding: 10 }}>Retain newer meter facts; correct this historical transaction only</Text></TouchableOpacity>}
    {qa.context.snapshot.accessData?.access?.hasAccess === "no" && <View style={{ flexDirection: "row", gap: 16 }}>
      <TouchableOpacity disabled={qa.busy} onPress={() => qa.save(form.values)}><Text style={{ color: "#075dc5", padding: 8 }}>SAVE</Text></TouchableOpacity>
      <TouchableOpacity disabled={qa.busy} onPress={() => qa.submit(serialize(form.values), form.values)}><Text style={{ color: "#075dc5", padding: 8 }}>{qa.busy ? "Sending…" : "SUBMIT"}</Text></TouchableOpacity>
    </View>}
  </ScrollView>;
}

export function Formik({ qaSerialize = value => value, children, ...props }) {
  const qa = useQaAmendment();
  if (!qa) return <BaseFormik {...props}>{children}</BaseFormik>;
  return <BaseFormik {...props} initialValues={qa.initialValues || props.initialValues} enableReinitialize={false}
    initialStatus={{ qaAmendment: true }} onSubmit={values => qa.submit(qaSerialize(values), values)}>
    {form => <View style={{ flex: 1 }}>
      <QaControls serialize={qaSerialize} />
      <View style={{ flex: 1 }} pointerEvents={qa.busy ? "none" : "auto"}>{typeof children === "function" ? children(form) : children}</View>
    </View>}
  </BaseFormik>;
}
