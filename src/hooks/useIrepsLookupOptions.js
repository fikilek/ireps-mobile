import { useEffect, useMemo } from "react";
import { createMMKV } from "react-native-mmkv";

import { useGetIrepsLookupOptionsQuery } from "@/src/redux/irepsLookupOptionsApi";

export const lookupStorage = createMMKV({
  id: "ireps-lookup-options",
});

function cacheKey(lookupKey) {
  return `lookup-options:${lookupKey}`;
}

function readCachedLookup(lookupKey) {
  try {
    const raw = lookupStorage.getString(cacheKey(lookupKey));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.log("readCachedLookup ---- ERROR", {
      lookupKey,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      raw: error,
    });

    return null;
  }
}

function writeCachedLookup(lookupKey, value) {
  try {
    lookupStorage.set(cacheKey(lookupKey), JSON.stringify(value));
  } catch (error) {
    console.log("writeCachedLookup ---- ERROR", {
      lookupKey,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      raw: error,
    });
  }
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];

  return options
    .map((item) => ({
      code: String(item?.code || "").trim(),
      label: String(item?.label || "").trim(),
      value: String(item?.value || item?.code || "").trim(),
      name: String(item?.name || item?.label || "").trim(),
      description: String(item?.description || "").trim(),
      sortOrder: Number(item?.sortOrder ?? 9999),
      status: String(item?.status || "").trim().toUpperCase(),
      enabled: item?.enabled !== false,
      parentCode: String(item?.parentCode || "")
        .trim()
        .toUpperCase(),
      appliesTo: Array.isArray(item?.appliesTo)
        ? item.appliesTo
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean)
        : [],
    }))
    .filter((item) => item.code && item.label)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
}

export function useIrepsLookupOptions(lookupKey) {
  const cached = useMemo(() => {
    if (!lookupKey) return null;
    return readCachedLookup(lookupKey);
  }, [lookupKey]);

  const query = useGetIrepsLookupOptionsQuery(
    { lookupKey },
    {
      skip: !lookupKey,
      refetchOnMountOrArgChange: true,
    },
  );

  const liveData = query.data || null;

  useEffect(() => {
    if (!lookupKey || !liveData) return;

    writeCachedLookup(lookupKey, {
      ...liveData,
      options: normalizeOptions(liveData.options),
      cachedAt: new Date().toISOString(),
    });
  }, [lookupKey, liveData]);

  const sourceData = liveData || cached || null;

  return {
    lookupKey,

    title: sourceData?.title || "",
    description: sourceData?.description || "",
    domain: sourceData?.domain || "",
    fieldKey: sourceData?.fieldKey || "",

    version: Number(sourceData?.version || 1),

    allowOther: sourceData?.allowOther !== false,
    otherCode: sourceData?.otherCode || "OTHER",
    otherLabel: sourceData?.otherLabel || "Other",

    options: normalizeOptions(sourceData?.options),

    isLoading: query.isLoading && !cached,
    isFetching: query.isFetching,
    error: query.error,

    source: liveData ? "backend" : cached ? "mmkv" : "empty",

    refetch: query.refetch,
  };
}
