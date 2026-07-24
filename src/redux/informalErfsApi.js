// src/redux/informalErfsApi.js

import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { httpsCallable } from "firebase/functions";

import { functions } from "../firebase";

export const INFORMAL_ERF_CALLABLE_NAME = "submitInformalErfCallable";
export const INFORMAL_ERF_CALLABLE_TIMEOUT_MS = 60000;

const cleanText = (value, fallback = "") => {
  const clean = String(value ?? "").trim();
  return clean || fallback;
};

const normalizeErrorCode = (value) =>
  cleanText(value, "UNKNOWN_ERROR")
    .replace(/^functions\//, "")
    .toUpperCase();

/**
 * Converts Firebase callable errors into a plain serializable shape that can
 * safely pass through RTK Query and the Informal ERF submission controller.
 */
export const normalizeInformalErfApiError = (error = {}) => {
  const details =
    error?.details ||
    error?.customData?.details ||
    error?.data ||
    {};

  return {
    code: normalizeErrorCode(
      error?.code ||
        details?.businessCode ||
        details?.code ||
        "UNKNOWN_ERROR",
    ),
    message:
      cleanText(error?.message) ||
      cleanText(details?.message) ||
      "The Informal ERF could not be submitted.",
    details: {
      ...details,
    },
  };
};

const validateCallablePayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "The Informal ERF callable payload must be an object.";
  }

  if (payload?.schemaVersion !== 2) {
    return "The Informal ERF callable payload must use schemaVersion 2.";
  }

  if (payload?.formType !== "INFORMAL_ERF_CREATE") {
    return "The Informal ERF callable payload has an invalid formType.";
  }

  return null;
};

/**
 * Informal ERF API
 *
 * This API owns communication with submitInformalErfCallable. The submission
 * controller owns the final V2 payload, uploaded media and retry identity.
 */
export const informalErfsApi = createApi({
  reducerPath: "informalErfsApi",
  baseQuery: fakeBaseQuery(),

  endpoints: (builder) => ({
    submitInformalErf: builder.mutation({
      async queryFn(payload) {
        const payloadError = validateCallablePayload(payload);

        if (payloadError) {
          return {
            error: {
              code: "INVALID_PAYLOAD",
              message: payloadError,
              details: {
                retriable: false,
                errorType: "PERMANENT",
              },
            },
          };
        }

        try {
          const submitCallable = httpsCallable(
            functions,
            INFORMAL_ERF_CALLABLE_NAME,
            {
              timeout: INFORMAL_ERF_CALLABLE_TIMEOUT_MS,
            },
          );

          const response = await submitCallable(payload);
          const result = response?.data || {};

          if (result?.success !== true) {
            return {
              error: {
                code: normalizeErrorCode(
                  cleanText(result?.code, "BACKEND_REJECTED"),
                ),
                message:
                  cleanText(result?.message) ||
                  "The Informal ERF submission was rejected.",
                details: {
                  ...(result?.details || {}),
                  retriable: result?.details?.retriable === true,
                  errorType:
                    cleanText(result?.details?.errorType) ||
                    "PERMANENT",
                },
              },
            };
          }

          return {
            data: result,
          };
        } catch (error) {
          return {
            error: normalizeInformalErfApiError(error),
          };
        }
      },
    }),
  }),
});

export const { useSubmitInformalErfMutation } = informalErfsApi;
