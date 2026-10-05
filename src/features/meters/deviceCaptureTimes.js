// Called when the worker submits or edits a capture, never by the upload/retry loop.
export function buildDeviceCaptureTimes(previousMetadata = {}, capturedAt = new Date().toISOString()) {
  return {
    createdOnDevice: previousMetadata?.createdOnDevice || previousMetadata?.createdAt || capturedAt,
    updatedOnDevice: capturedAt,
  };
}
