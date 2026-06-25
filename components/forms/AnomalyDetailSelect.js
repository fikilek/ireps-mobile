import { getIn, useFormikContext } from "formik";
import { useEffect, useMemo } from "react";
import FormSelect from "./FormSelect";

export const AnomalyDetailSelect = ({ anomalies, disabled }) => {
  const { values, setFieldValue } = useFormikContext();

  const currentAnomaly = getIn(values, "ast.anomalies.anomaly") || "";
  const currentDetail = getIn(values, "ast.anomalies.anomalyDetail") || "";

  const options = useMemo(() => {
    const selectedAnomalyData = anomalies.find(
      (anomaly) => anomaly.anomaly === currentAnomaly,
    );

    return selectedAnomalyData?.anomalyDetails || [];
  }, [anomalies, currentAnomaly]);

  const isMeterOk = currentAnomaly === "Meter Ok";
  const meterOkDetail = isMeterOk ? options[0] || "" : "";

  useEffect(() => {
    if (!currentAnomaly) {
      if (currentDetail) {
        setFieldValue("ast.anomalies.anomalyDetail", "", true);
      }

      return;
    }

    // Safety net for edit mode, late lookup hydration, or cached forms:
    // if Meter Ok is selected, the detail must be system-populated.
    if (isMeterOk) {
      if (meterOkDetail && currentDetail !== meterOkDetail) {
        setFieldValue("ast.anomalies.anomalyDetail", meterOkDetail, true);
      }

      return;
    }

    // If the selected anomaly changed outside AnomalySelect, avoid keeping
    // a detail that no longer belongs to the selected parent anomaly.
    if (currentDetail && options.length > 0 && !options.includes(currentDetail)) {
      setFieldValue("ast.anomalies.anomalyDetail", "", true);
    }
  }, [
    currentAnomaly,
    currentDetail,
    isMeterOk,
    meterOkDetail,
    options,
    setFieldValue,
  ]);

  const isSystemControlledMeterOkDetail =
    isMeterOk && !!meterOkDetail && currentDetail === meterOkDetail;

  return (
    <FormSelect
      label="ANOMALY DETAIL"
      name="ast.anomalies.anomalyDetail"
      options={options}
      disabled={disabled || isSystemControlledMeterOkDetail}
    />
  );
};
