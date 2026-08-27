import { Platform } from "react-native";

import {
  hasRemainingCredit,
  removeRemainingCreditPhoto,
} from "../../src/features/meters/remainingCreditContract";
import { IrepsMedia } from "../media/IrepsMedia";
import FormInput from "./FormInput";
import { FormSection } from "./FormSection";
import FormSelect from "./FormSelect";

const RC_NAME = "ast.astData.meter.remainingCredit";
const RCC_NAME = "ast.astData.meter.remainingCreditComment";
const RCC_OTHER_NAME = "ast.astData.meter.remainingCreditCommentOther";

export function RemainingCreditSection({
  values,
  setFieldValue,
  getOptions,
  disabled = false,
  agentName,
  agentUid,
  landingPoint,
  isDiscovery = false,
}) {
  const meter = values?.ast?.astData?.meter || {};
  const currentCredit = String(meter?.remainingCredit ?? "");
  const hasCredit = hasRemainingCredit(currentCredit);
  const selectedReason = String(meter?.remainingCreditComment ?? "");
  const isOtherReason = !hasCredit && selectedReason === "Other";

  if (!isDiscovery || meter?.type !== "prepaid") {
    return null;
  }

  const handleCreditChange = (nextValue) => {
    const nextHasCredit = hasRemainingCredit(nextValue);

    if (hasCredit && !nextHasCredit) {
      setFieldValue(
        "media",
        removeRemainingCreditPhoto(values?.media || []),
        false,
      );
    }

    if (nextHasCredit) {
      if (String(meter?.remainingCreditComment ?? "").trim()) {
        setFieldValue(RCC_NAME, "", false);
      }
      if (String(meter?.remainingCreditCommentOther ?? "").trim()) {
        setFieldValue(RCC_OTHER_NAME, "", false);
      }
    }

    setFieldValue(RC_NAME, nextValue, true);
  };

  return (
    <FormSection title="Remaining Credit">
      <FormInput
        label="Remaining Credit"
        name={RC_NAME}
        placeholder="Enter remaining credit"
        autoCapitalize="none"
        keyboardType={
          Platform.OS === "ios" ? "numbers-and-punctuation" : "numeric"
        }
        onChangeText={handleCreditChange}
        disabled={disabled}
      />

      {!hasCredit ? (
        <>
          <FormSelect
            label="Reason Remaining Credit Could Not Be Captured"
            name={RCC_NAME}
            options={getOptions("remaining_credit_comment_reasons")}
            disabled={disabled}
            onValueChange={(nextValue) => {
              if (nextValue !== "Other") {
                setFieldValue(RCC_OTHER_NAME, "", false);
              }
            }}
          />

          {isOtherReason && (
            <FormInput
              label="Specify Other Reason"
              name={RCC_OTHER_NAME}
              placeholder="Enter reason remaining credit could not be captured"
              disabled={disabled}
            />
          )}
        </>
      ) : (
        <IrepsMedia
          tag="remainingCreditPhoto"
          agentName={agentName}
          agentUid={agentUid}
          fallbackGps={landingPoint}
          required
        />
      )}
    </FormSection>
  );
}
