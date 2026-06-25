import { IrepsMedia } from "../media/IrepsMedia";
import { AnomalyDetailSelect } from "./AnomalyDetailSelect";
import { AnomalySelect } from "./AnomalySelect";
import { FormSection } from "./FormSection";

// 🛑 Stop relying on 'values' from props
export const AnomalySection = ({ getOptions, disabled, ...props }) => {
  // const { values } = useFormikContext(); // 🏛️ Real-time context access
  const anomalies = getOptions("anomalies") || [];

  return (
    <FormSection title="Anomalies & Actions">
      <AnomalySelect anomalies={anomalies} disabled={disabled} />

      {/* 🧠 Now this component sees the update INSTANTLY */}
      <AnomalyDetailSelect anomalies={anomalies} disabled={disabled} />

      {/* 📸 Media slot will now appear on the first click */}

      <IrepsMedia tag="anomalyPhoto" {...props} />
    </FormSection>
  );
};
