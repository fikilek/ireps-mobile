// UI-R006: appearance and interaction must use the same readiness decision.
export function formCanSubmit({ isValid, isValidating = false, dirty = false,
  isSubmitting = false, isTrnLoading = false } = {}) {
  return Boolean(isValid && dirty && !isValidating && !isSubmitting && !isTrnLoading);
}
