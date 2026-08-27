const RECOGNIZED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "mp4",
  "mov",
  "webm",
  "3gp",
  "m4a",
  "mp3",
  "wav",
  "aac",
]);

const MIME_EXTENSION_MAP = Object.freeze({
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
});

function normalizeExtension(value) {
  const extension = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");

  return RECOGNIZED_EXTENSIONS.has(extension) ? extension : "";
}

function getUriExtension(uri) {
  const cleanUri = String(uri || "")
    .trim()
    .split("#")[0]
    .split("?")[0];
  const match = cleanUri.match(/\.([A-Za-z0-9]+)$/);

  return normalizeExtension(match?.[1]);
}

function getMimeExtension(item = {}) {
  const mime = String(
    item?.mimeType || item?.mime || item?.contentType || "",
  )
    .trim()
    .toLowerCase();

  if (MIME_EXTENSION_MAP[mime]) {
    return MIME_EXTENSION_MAP[mime];
  }

  const exactType = String(item?.type || "")
    .trim()
    .toLowerCase();

  if (exactType.includes("/") && MIME_EXTENSION_MAP[exactType]) {
    return MIME_EXTENSION_MAP[exactType];
  }

  return "";
}

export function getMediaExtension(item = {}) {
  const uriExtension = getUriExtension(item?.uri || item?.url);
  if (uriExtension) return uriExtension;

  const mimeExtension = getMimeExtension(item);
  if (mimeExtension) return mimeExtension;

  const type = String(item?.type || "")
    .trim()
    .toLowerCase();

  if (type.includes("video")) return "mp4";
  if (type.includes("audio") || type.includes("voice")) return "m4a";
  if (type.includes("image") || type.includes("photo")) return "jpg";

  return "jpg";
}
