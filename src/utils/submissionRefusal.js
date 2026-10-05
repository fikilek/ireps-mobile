// Called only after the Firebase transport code has identified a business refusal.
// Installation puts the actionable code in details; keep it for the saved-work feedback.
export function thrownSubmissionRefusal(error, trnId = "NAv") {
  return {
    code: error?.details?.code || error?.code || "SUBMISSION_REFUSED",
    message: error?.details?.message || error?.message || "Submission requires review.",
    trnId,
  };
}
