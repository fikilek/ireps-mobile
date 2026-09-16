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

  // An anomaly with a single detail is system-populated; one with a real choice
  // (Meter Ok now has three) must be left to the user, or the picker would lock
  // on the first option and the suspicions could never be selected.
  const isSingleDetail = options.length === 1;
  const onlyDetail = isSingleDetail ? options[0] || "" : "";

  useEffect(() => {
    if (!currentAnomaly) {
      if (currentDetail) {
        setFieldValue("ast.anomalies.anomalyDetail", "", true);
      }

      return;
    }

    // Safety net for edit mode, late lookup hydration, or cached forms:
    // where there is only one detail, it is system-populated.
    if (isSingleDetail) {
      if (onlyDetail && currentDetail !== onlyDetail) {
        setFieldValue("ast.anomalies.anomalyDetail", onlyDetail, true);
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
    isSingleDetail,
    onlyDetail,
    options,
    setFieldValue,
  ]);

  const isSystemControlledDetail =
    isSingleDetail && !!onlyDetail && currentDetail === onlyDetail;

  return (
    <FormSelect
      label="ANOMALY DETAIL"
      name="ast.anomalies.anomalyDetail"
      options={options}
      disabled={disabled || isSystemControlledDetail}
    />
  );
};
