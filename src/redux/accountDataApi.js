import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";

function getUpdatedAtMs(item = {}) {
  const raw = item?.metadata?.updatedAt || item?.metadata?.createdAt || "";
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function sortAccountMastersByUpdatedAt(list = []) {
  return [...list].sort((a, b) => getUpdatedAtMs(b) - getUpdatedAtMs(a));
}


function normalizeAccountNo(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function getFieldAccountDataMs(item = {}) {
  const raw = item?.metadata?.updatedAt || item?.metadata?.createdAt || "";
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function sortFieldAccountDataByUpdatedAt(list = []) {
  return [...list].sort((a, b) => getFieldAccountDataMs(b) - getFieldAccountDataMs(a));
}

function hasFieldAccountDataMedia(item = {}) {
  return Array.isArray(item?.media) && item.media.length > 0;
}

function fieldAccountDataMatchesAccount(item = {}, accountNoNormalized = "") {
  const cleanAccountNo = normalizeAccountNo(accountNoNormalized);

  if (!cleanAccountNo) return false;

  const accounts = Array.isArray(item?.accounts) ? item.accounts : [];

  return accounts.some((account) => {
    return normalizeAccountNo(account?.accountNo) === cleanAccountNo;
  });
}

export const accountDataApi = createApi({
  reducerPath: "accountDataApi",
  baseQuery: fakeBaseQuery(),

  endpoints: (builder) => ({
    getAccountMastersByPremiseId: builder.query({
      queryFn: () => ({ data: [] }),

      async onCacheEntryAdded(
        premiseId,
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved },
      ) {
        let unsubscribe = () => {};

        try {
          await cacheDataLoaded;

          const cleanPremiseId = String(premiseId || "").trim();

          if (!cleanPremiseId || cleanPremiseId === "NAv") return;

          const q = query(
            collection(db, "account_master"),
            where("premise.premiseId", "==", cleanPremiseId),
          );

          unsubscribe = onSnapshot(
            q,
            (snapshot) => {
              const rows = snapshot.docs.map((snap) => ({
                id: snap.id,
                ...snap.data(),
              }));

              updateCachedData(() => sortAccountMastersByUpdatedAt(rows));
            },
            (error) => {
              console.log("accountDataApi -- account_master stream error", {
                premiseId: cleanPremiseId,
                code: error?.code,
                message: error?.message,
              });
            },
          );
        } catch (error) {
          console.log("accountDataApi -- getAccountMastersByPremiseId error", {
            premiseId,
            code: error?.code,
            message: error?.message,
          });
        }

        await cacheEntryRemoved;
        unsubscribe();
      },
    }),

    getLatestFieldAccountDataMedia: builder.query({
      async queryFn({ premiseId, accountNo, latestFieldAccountDataId } = {}) {
        try {
          const cleanPremiseId = String(premiseId || "").trim();
          const accountNoNormalized = normalizeAccountNo(accountNo);
          const cleanLatestFieldAccountDataId = String(
            latestFieldAccountDataId || "",
          ).trim();

          if (!cleanPremiseId || cleanPremiseId === "NAv" || !accountNoNormalized) {
            return {
              data: {
                media: [],
                sourceFieldAccountDataId: "NAv",
              },
            };
          }

          if (
            cleanLatestFieldAccountDataId &&
            cleanLatestFieldAccountDataId !== "NAv"
          ) {
            const latestSnap = await getDoc(
              doc(db, "field_account_data", cleanLatestFieldAccountDataId),
            );

            if (latestSnap.exists()) {
              const latestRow = {
                id: latestSnap.id,
                ...latestSnap.data(),
              };

              if (
                fieldAccountDataMatchesAccount(latestRow, accountNoNormalized) &&
                hasFieldAccountDataMedia(latestRow)
              ) {
                return {
                  data: {
                    media: latestRow.media || [],
                    sourceFieldAccountDataId: latestRow.id,
                  },
                };
              }
            }
          }

          const q = query(
            collection(db, "field_account_data"),
            where("premise.premiseId", "==", cleanPremiseId),
          );

          const snapshot = await getDocs(q);
          const matchingRowsWithMedia = snapshot.docs
            .map((snap) => ({
              id: snap.id,
              ...snap.data(),
            }))
            .filter((row) => {
              return (
                fieldAccountDataMatchesAccount(row, accountNoNormalized) &&
                hasFieldAccountDataMedia(row)
              );
            });

          const bestMediaRow = sortFieldAccountDataByUpdatedAt(
            matchingRowsWithMedia,
          )?.[0];

          return {
            data: {
              media: Array.isArray(bestMediaRow?.media) ? bestMediaRow.media : [],
              sourceFieldAccountDataId: bestMediaRow?.id || "NAv",
            },
          };
        } catch (error) {
          console.log("accountDataApi -- getLatestFieldAccountDataMedia error", {
            premiseId,
            accountNo,
            latestFieldAccountDataId,
            code: error?.code,
            message: error?.message,
          });

          return {
            error: {
              status: "CUSTOM_ERROR",
              error: error?.message || "Failed to load account media.",
            },
          };
        }
      },
    }),
  }),
});

export const {
  useGetAccountMastersByPremiseIdQuery,
  useLazyGetLatestFieldAccountDataMediaQuery,
} = accountDataApi;
