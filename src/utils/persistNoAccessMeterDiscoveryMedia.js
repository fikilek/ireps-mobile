import * as FileSystem from "expo-file-system/legacy";

const NO_ACCESS_MEDIA_ROOT = `${FileSystem.documentDirectory || ""}ireps/submission-media/meter-discovery-no-access/`;

function sanitizePathSegment(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);

  return cleaned || fallback;
}

function isAlreadyDurableUri(uri, trnDirectory) {
  return typeof uri === "string" && uri.startsWith(trnDirectory);
}

export async function persistNoAccessMeterDiscoveryMedia({
  trnId,
  media = [],
} = {}) {
  if (!FileSystem.documentDirectory) {
    throw new Error(
      "Durable app storage is unavailable. No Access evidence cannot be saved safely.",
    );
  }

  const safeTrnId = sanitizePathSegment(trnId, "UNKNOWN_TRN");
  const trnDirectory = `${NO_ACCESS_MEDIA_ROOT}${safeTrnId}/`;

  await FileSystem.makeDirectoryAsync(trnDirectory, {
    intermediates: true,
  });

  const persistedMedia = [];

  for (let index = 0; index < (Array.isArray(media) ? media.length : 0); index += 1) {
    const item = media[index];

    if (!item?.uri || item?.url) {
      persistedMedia.push(item);
      continue;
    }

    if (isAlreadyDurableUri(item.uri, trnDirectory)) {
      const existingInfo = await FileSystem.getInfoAsync(item.uri);

      if (!existingInfo?.exists) {
        throw new Error(
          `Saved No Access evidence is missing for ${item?.tag || "media"}.`,
        );
      }

      persistedMedia.push(item);
      continue;
    }

    const safeTag = sanitizePathSegment(item?.tag, `media_${index + 1}`);
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    const uniqueSuffix = `${Date.now()}_${randomSuffix}_${index + 1}`;
    const destinationUri = `${trnDirectory}${uniqueSuffix}_${safeTag}.jpg`;

    await FileSystem.copyAsync({
      from: item.uri,
      to: destinationUri,
    });

    const copiedInfo = await FileSystem.getInfoAsync(destinationUri);

    if (!copiedInfo?.exists) {
      throw new Error(
        `No Access evidence could not be copied to durable storage for ${item?.tag || "media"}.`,
      );
    }

    persistedMedia.push({
      ...item,
      uri: destinationUri,
    });
  }

  return persistedMedia;
}

export async function cleanupNoAccessMeterDiscoveryMedia({ trnId } = {}) {
  if (!FileSystem.documentDirectory || !trnId) return;

  const safeTrnId = sanitizePathSegment(trnId, "UNKNOWN_TRN");
  const trnDirectory = `${NO_ACCESS_MEDIA_ROOT}${safeTrnId}/`;
  const directoryInfo = await FileSystem.getInfoAsync(trnDirectory);

  if (!directoryInfo?.exists) return;

  await FileSystem.deleteAsync(trnDirectory, { idempotent: true });
}
