import { useFormikContext } from "formik";
import FormSelect from "./FormSelect";

export const AnomalySelect = ({ anomalies, disabled }) => {
  const { values, setValues } = useFormikContext();

  const getDetailsForAnomaly = (selectedAnomaly) => {
    const selectedAnomalyData = anomalies.find(
      (anomaly) => anomaly.anomaly === selectedAnomaly,
    );

    return selectedAnomalyData?.anomalyDetails || [];
  };

  const handleAnomalyChange = (selectedAnomaly) => {
    const details = getDetailsForAnomaly(selectedAnomaly);
    const isMeterOk = selectedAnomaly === "Meter Ok";

    const nextAnomalyDetail = isMeterOk ? details[0] || "" : "";

    setValues(
      {
        ...values,
        ast: {
          ...(values?.ast || {}),
          anomalies: {
            ...(values?.ast?.anomalies || {}),
            anomaly: selectedAnomaly,
            anomalyDetail: nextAnomalyDetail,
          },
        },
      },
      true,
    );
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
