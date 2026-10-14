import React from "react";
import { ScrollView } from "react-native";
import { Formik } from "./QaAmendmentContext";
import { IrepsNoAccessForm } from "../../../components/forms/IrepsNoAccessForm";

export default function NoAccessCorrection({ snapshot }) {
  return <Formik initialValues={{ ...snapshot.accessData.access, media: snapshot.media || [] }}
    qaSerialize={values => ({ ...snapshot, media: values.media, accessData: { ...snapshot.accessData, access: values } })}>
    {({ values, setValues }) => <ScrollView><IrepsNoAccessForm visible value={values}
      originalAccess={snapshot.accessData.access} onChange={setValues}
      fallbackGps={snapshot.media?.[0]?.gps} /></ScrollView>}
  </Formik>;
}
