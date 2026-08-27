import { View } from "react-native";
import FormInputMeterNo from "../../src/features/meters/FormInputMeterNo";
import { removeRemainingCreditPhoto } from "../../src/features/meters/remainingCreditContract";
import SovereignLocationPicker from "../maps/SovereignLocationPicker";
import { IrepsMedia } from "../media/IrepsMedia";
import { AnomalySection } from "./AnomalySection";
import FormInput from "./FormInput";
import { FormSection } from "./FormSection";
import FormSelect from "./FormSelect";
import { RemainingCreditSection } from "./RemainingCreditSection";
import { OtherAnomalySection } from "./OtherAnomalySection";

export const WaterSections = ({
  values,
  setFieldValue,
  getOptions,
  disabled,
  agentName,
  agentUid,
  erfBoundary = [],
  erfNo = "",
  erfCentroid = null,
  landingPoint,
  icon,
  nearbyErfs = [],
  nearbyPremises = [],
  nearbyMeters = [],
  isDiscovery = false,
}) => {
  return (
    <View style={disabled && { opacity: 0.7 }}>
      <FormSection title="Water Meter Description">
        <FormInputMeterNo
          label="Meter Number"
          name="ast.astData.astNo"
          disabled={disabled}
        />
        <IrepsMedia
          tag={"astNoPhoto"}
          agentName={agentName}
          agentUid={agentUid}
          fallbackGps={landingPoint}
        />

        <FormSelect
          label="Category (Normal/Bulk)"
          options={
            isDiscovery ? getOptions("meter_categories") : ["Normal", "Bulk"]
          }
          name="ast.astData.meter.category"
          disabled={disabled}
        />
        <FormSelect
          label="TYPE"
          options={
            isDiscovery
              ? getOptions("meter_types")
              : ["prepaid", "conventional"]
          }
          name="ast.astData.meter.type"
          disabled={disabled}
          onValueChange={(nextValue) => {
            if (isDiscovery && nextValue === "conventional") {
              setFieldValue(
                "ast.astData.meter.remainingCredit",
                "",
                false,
              );
              setFieldValue(
                "ast.astData.meter.remainingCreditComment",
                "",
                false,
              );
              setFieldValue(
                "ast.astData.meter.remainingCreditCommentOther",
                "",
                false,
              );
              setFieldValue(
                "media",
                removeRemainingCreditPhoto(values?.media || []),
                false,
              );
            }
          }}
        />
        <FormSelect
          label="Manufacture"
          options={getOptions("water_manufacturers")}
          name="ast.astData.astManufacturer"
          disabled={disabled}
        />
        <FormInput
          label="Model Name"
          name="ast.astData.astName"
          disabled={disabled}
        />
      </FormSection>

      <FormSection title="Meter Reading">
        {values?.ast?.astData?.meter?.type === "prepaid" ? (
          <>
            <FormInput
              label="Token Reading"
              name="ast.tokenReading"
              disabled={disabled}
              keyboardType="numeric"
              numbersOnly={true}
            />
            {values?.ast?.tokenReading?.trim() && (
              <IrepsMedia
                tag={"tokenReadingPhoto"}
                agentName={agentName}
                agentUid={agentUid}
                fallbackGps={landingPoint}
              />
            )}
          </>
        ) : (
          <>
            <FormInput
              label="Meter Reading"
              name="ast.meterReading"
              disabled={disabled}
              keyboardType="numeric"
              numbersOnly={true}
            />
            {values?.ast?.meterReading?.trim() && (
              <IrepsMedia
                tag={"meterReadingPhoto"}
                agentName={agentName}
                agentUid={agentUid}
                fallbackGps={landingPoint}
              />
            )}
          </>
        )}
      </FormSection>

      <RemainingCreditSection
        values={values}
        setFieldValue={setFieldValue}
        getOptions={getOptions}
        disabled={disabled}
        agentName={agentName}
        agentUid={agentUid}
        landingPoint={landingPoint}
        isDiscovery={isDiscovery}
      />

      <FormSection title="Meter Status">
        {isDiscovery && (
          <FormSelect
            label="METER STATUS"
            name="status.state"
            options={getOptions("meter_statuses")}
            disabled={disabled}
          />
        )}
      </FormSection>

      <AnomalySection
        values={values}
        getOptions={getOptions}
        agentName={agentName}
        agentUid={agentUid}
        setFieldValue={setFieldValue}
        disabled={disabled}
      />

      {isDiscovery && (
        <OtherAnomalySection
          values={values}
          setFieldValue={setFieldValue}
          options={getOptions("other_anomalies")}
          disabled={disabled}
        />
      )}

      <SovereignLocationPicker
        label="METER GPS LOCATION"
        name="ast.location.gps"
        initialGps={landingPoint}
        icon={icon}
        referenceBoundary={erfBoundary}
        erfNo={erfNo}
        erfCentroid={erfCentroid}
        nearbyErfs={nearbyErfs}
        nearbyPremises={nearbyPremises}
        nearbyMeters={nearbyMeters}
      />
    </View>
  );
};
