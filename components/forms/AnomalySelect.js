import { useFormikContext } from "formik";
import FormSelect from "./FormSelect";

export const AnomalySelect = ({ anomalies, disabled }) => {
  const { setFieldValue } = useFormikContext();

  const getDetailsForAnomaly = (selectedAnomaly) => {
    const selectedAnomalyData = anomalies.find(
      (anomaly) => anomaly.anomaly === selectedAnomaly,
    );

    return selectedAnomalyData?.anomalyDetails || [];
  };

  // The anomaly itself is already set by the select before this runs; all this has to do is settle the
  // detail that belongs to it.
  //
  // It used to write the WHOLE form back with setValues, built from the values of the last render - which
  // do not include the anomaly just chosen, nor anything else changed in the same tick. Every other field
  // was overwritten from that older snapshot, and the form was validated against it.
  const handleAnomalyChange = (selectedAnomaly) => {
    const details = getDetailsForAnomaly(selectedAnomaly);

    // Only fill the detail in when there is nothing to choose. Meter Ok now offers Operationally Ok and
    // the two suspicions, so the user picks.
    const nextAnomalyDetail = details.length === 1 ? details[0] || "" : "";

    setFieldValue("ast.anomalies.anomalyDetail", nextAnomalyDetail, true);
  };

  return (
    <FormSelect
      label="ANOMALY"
      name="ast.anomalies.anomaly"
      options={anomalies.map((a) => a.anomaly)}
      disabled={disabled}
      onValueChange={handleAnomalyChange}
    />
  );
};
