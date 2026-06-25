// src/redux/authApi.js

import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

import {
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  PhoneAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateEmail,
  updatePassword,
} from "firebase/auth";

import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase";
import { clearAuthState } from "./authStorage";
import { resetAuthenticatedApiStates } from "./logoutCleanup";
// import { geoApi } from "./geoApi";

function tsToMs(ts) {
  if (!ts) return null;

  // Firestore Timestamp
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;

  // Already a number
  if (typeof ts === "number") return ts;

  // ISO string
  if (typeof ts === "string") {
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? ms : null;
  }

  return null;
}

function normalizeUserProfile(raw) {
  if (!raw) return null;

  const meta = raw?.metadata || {};

  return {
    ...raw,
    // ✅ normalize metadata timestamps (keep original fields optional)
    metadata: {
      ...meta,
      createdAtMs: tsToMs(meta.createdAt),
      updatedAtMs: tsToMs(meta.updatedAt),
      // remove raw timestamps so nothing non-serializable enters Redux
      createdAt: undefined,
      updatedAt: undefined,
    },
  };
}

function signedOutAuthState({ logoutInProgress = false } = {}) {
  return {
    ready: true,
    isAuthenticated: false,
    auth: null,
    profile: null,
    claims: null,
    logoutInProgress,
  };
}

function waitForLogoutCleanupFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(resolve, 0));
      return;
    }

    setTimeout(resolve, 0);
  });
}

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["Admin", "User"],
  endpoints: (builder) => ({
    /* =====================================================
       AUTH STATE (BOOTSTRAP + REALTIME LISTENERS)
       ===================================================== */
    getAuthState: builder.query({
      keepUnusedDataFor: Infinity,
      queryFn: () => ({
        data: {
          ready: false, // Start as not ready
          isAuthenticated: false,
          auth: null,
          profile: null,
          claims: null,
          logoutInProgress: false,
        },
      }),

      async onCacheEntryAdded(_, { updateCachedData, cacheEntryRemoved }) {
        let profileUnsubscribe = null;

        // console.log(` `);
        // console.log(`getAuthState ---onCacheEntryAdded started`);

        const authUnsubscribe = onAuthStateChanged(auth, async (user) => {
          // 🛡️ Clean up old profile listener if user changes
          if (profileUnsubscribe) profileUnsubscribe();

          if (!user) {
            updateCachedData((draft) =>
              signedOutAuthState({
                logoutInProgress: draft?.logoutInProgress === true,
              }),
            );
            return;
          }

          // 🛰️ 1. Start Profile Stream (Real-time)
          const userRef = doc(db, "users", user.uid);
          profileUnsubscribe = onSnapshot(userRef, async (snap) => {
            // 🛰️ 2. Load claims (needed for role-based logic)
            const tokenResult = await user.getIdTokenResult(true);

            updateCachedData((draft) => {
              if (draft.logoutInProgress) return;

              draft.ready = true;
              draft.isAuthenticated = true;
              draft.auth = { uid: user.uid, email: user.email };
              const raw = snap.exists() ? snap.data() : null;
              draft.profile = raw ? normalizeUserProfile(raw) : null;

              // draft.profile = snap.exists() ? snap.data() : null;

              draft.claims = tokenResult.claims;
            });

            console.log(
              "📡 [AUTH STREAM]: Profile synchronized for",
              user.email,
            );
          });
        });

        await cacheEntryRemoved;
        authUnsubscribe();
        if (profileUnsubscribe) profileUnsubscribe();

        // console.log(`getAuthState ---onCacheEntryAdded ended`);
      },
    }),

    /* =====================================================
        SIGN UP GST (Locked to Guest Role)
      ===================================================== */

    signup: builder.mutation({
      async queryFn({ email, password, name, surname, serviceProvider }) {
        try {
          const fn = httpsCallable(functions, "signupFieldWorker");

          const res = await fn({
            email,
            password,
            name,
            surname,
            serviceProvider, // { id, name }
          });

          console.log("signupFieldWorker res:", res);

          return { data: res.data };
        } catch (error) {
          console.error("signup ----error", error);

          return {
            error: {
              message: error?.message || "Could not complete signup.",
            },
          };
        }
      },
    }),

    /* =====================================================
       SIGN IN
       ===================================================== */
    signin: builder.mutation({
      async queryFn({ email, password }) {
        try {
          const signinResult = await signInWithEmailAndPassword(
            auth,
            email,
            password,
          );
          // console.log(`signin ----signinResult`, signinResult);

          return { data: true };
        } catch (error) {
          console.log(`signin ----signn error`);
          return { error };
        }
      },
    }),

    /* =====================================================
       SIGN OUT
       ===================================================== */
    signout: builder.mutation({
      async queryFn(_, { dispatch, getState }) {
        const previousAuthState =
          authApi.endpoints.getAuthState.select(undefined)(getState())?.data;

        try {
          // 1) Stop protected screens/providers while Firebase Auth is valid.
          dispatch(
            authApi.util.updateQueryData(
              "getAuthState",
              undefined,
              () => signedOutAuthState({ logoutInProgress: true }),
            ),
          );

          await waitForLogoutCleanupFrame();

          // 2) Clear authenticated query caches and unsubscribe live streams.
          await resetAuthenticatedApiStates(dispatch);

          await waitForLogoutCleanupFrame();

          // 3) Revoke Firebase Auth only after listeners have stopped.
          await signOut(auth);

          // 4) Clear persisted/local auth storage and finish the transition.
          clearAuthState();

          await waitForLogoutCleanupFrame();

          dispatch(
            authApi.util.updateQueryData(
              "getAuthState",
              undefined,
              () => signedOutAuthState(),
            ),
          );

          return { data: true };
        } catch (error) {
          dispatch(
            authApi.util.updateQueryData(
              "getAuthState",
              undefined,
              () =>
                auth.currentUser && previousAuthState
                  ? {
                      ...previousAuthState,
                      logoutInProgress: false,
                    }
                  : signedOutAuthState(),
            ),
          );

          return { error };
        }
      },
    }),

    /* =====================================================
        UPDATE PROFILE (SAFE PARTIAL UPDATE)
        ===================================================== */

    updateProfile: builder.mutation({
      async queryFn({ uid, updates }) {
        try {
          const userRef = doc(db, "users", uid);
          await updateDoc(userRef, updates);
          return { data: true };
        } catch (error) {
          return { error };
        }
      },
    }),

    /* =====================================================
   SET / SWITCH ACTIVE WORKBASE
   ===================================================== */
    setActiveWorkbase: builder.mutation({
      async queryFn({ uid, workbase }) {
        try {
          const userRef = doc(db, "users", uid);

          // Read current onboarding status
          const snap = await getDoc(userRef);
          if (!snap.exists()) throw new Error("User not found");

          const user = snap.data();
          const updates = {
            "access.activeWorkbase": workbase,
            "metadata.updatedAt": serverTimestamp(),
            "metadata.updatedByUid": uid,
          };

          // 🔒 Only set onboarding COMPLETED if not already done
          if (user.onboarding?.status !== "COMPLETED") {
            updates["onboarding.status"] = "COMPLETED";
          }

          await updateDoc(userRef, updates);

          return { data: true };
        } catch (error) {
          return { error };
        }
      },
    }),

    /* =====================================================
       EMAIL VERIFICATION
       ===================================================== */
    sendEmailVerification: builder.mutation({
      async queryFn() {
        try {
          if (!auth.currentUser) {
            throw new Error("No authenticated user");
          }

          await sendEmailVerification(auth.currentUser);
          return { data: true };
        } catch (error) {
          return { error };
        }
      },
    }),

    /* =====================================================
       SYNC EMAIL VERIFIED
       ===================================================== */
    syncEmailVerified: builder.mutation({
      async queryFn({ uid }) {
        try {
          if (!auth.currentUser?.emailVerified) {
            // Email still not verified → nothing to sync
            return { data: false };
          }

          const userRef = doc(db, "users", uid);

          await updateDoc(userRef, {
            "onboarding.steps.emailVerified": true,
            "metadata.updatedAt": serverTimestamp(),
            "metadata.updatedByUid": uid,
          });

          return { data: true };
        } catch (error) {
          return { error };
        }
      },
    }),

    /* =====================================================
       REAUTHENTICATE
       ===================================================== */
    reauthenticate: builder.mutation({
      async queryFn({ password }) {
        try {
          const user = auth.currentUser;
          if (!user?.email) {
            throw new Error("No authenticated user");
          }

          const credential = EmailAuthProvider.credential(user.email, password);

          await reauthenticateWithCredential(user, credential);
          return { data: true };
        } catch (error) {
          return { error };
        }
      },
    }),

    /* =====================================================
       UPDATE EMAIL VERIFIED
       ===================================================== */
    updateEmailVerified: builder.mutation({
      async queryFn({ uid, email }) {
        await updateDoc(doc(db, "users", uid), {
          "identity.email": email,
          "onboarding.steps.emailVerified": true,
          "metadata.updatedAt": serverTimestamp(),
        });
        return { data: true };
      },
    }),

    /* =====================================================
       UPDATE EMAIL
       ===================================================== */
    updateEmail: builder.mutation({
      async queryFn({ newEmail }) {
        try {
          if (!auth.currentUser) {
            throw new Error("No authenticated user");
          }

          await updateEmail(auth.currentUser, newEmail);
          await sendEmailVerification(auth.currentUser);

          return { data: true };
        } catch (error) {
          return { error };
        }
      },
    }),

    /* =====================================================
      SEND PHONE OTP
      ===================================================== */
    sendPhoneOtp: builder.mutation({
      async queryFn({ phoneNumber, verifier }) {
        try {
          const provider = new PhoneAuthProvider(auth);
          const verificationId = await provider.verifyPhoneNumber(
            phoneNumber,
            verifier,
          );
          return { data: verificationId };
        } catch (error) {
          return { error };
        }
      },
    }),

    /* =====================================================
      CONFIRM PHONE OTP
      ===================================================== */
    confirmPhoneOtp: builder.mutation({
      async queryFn({ verificationId, code, uid, phoneNumber }) {
        try {
          const credential = PhoneAuthProvider.credential(verificationId, code);

          // 🔑 Attach phone to existing user
          await linkWithCredential(auth.currentUser, credential);

          // 🔥 Update Firestore
          await updateDoc(doc(db, "users", uid), {
            "contact.phoneNumber": phoneNumber,
            "onboarding.steps.phoneVerified": true,
            "metadata.updatedAt": serverTimestamp(),
          });

          return { data: true };
        } catch (error) {
          return { error };
        }
      },
    }),

    /* =====================================================
   UPDATE PASSWORD
===================================================== */
    updatePassword: builder.mutation({
      async queryFn({ newPassword }) {
        try {
          if (!auth.currentUser) {
            throw new Error("No authenticated user");
          }

          await updatePassword(auth.currentUser, newPassword);
          return { data: true };
        } catch (error) {
          return { error };
        }
      },
    }),

    /* =====================================================
       CREATE ADMIN (SPU ONLY)
       ===================================================== */
    createAdminUser: builder.mutation({
      async queryFn({ email, name, surname }) {
        try {
          const fn = httpsCallable(functions, "createAdminUser");

          const res = await fn({
            email,
            name,
            surname,
          });

          return { data: res.data };
        } catch (error) {
          console.log(`createAdminUser ----error`, error);
          return {
            error: {
              status: "CUSTOM_ERROR",
              message: error?.message || "Create admin failed",
            },
          };
        }
      },
      invalidatesTags: ["Admin", "User"],
    }),

    /* =====================================================
   INVITE MNG (SPU / ADM)
   ===================================================== */
    // src/redux/authApi.js
    inviteMng: builder.mutation({
      async queryFn({ email, name, surname, mnc }) {
        try {
          const fn = httpsCallable(functions, "inviteManagerUser");

          const res = await fn({
            email,
            name,
            surname,
            mnc, // { id, name }
          });
          console.log(`MNG created res: `, res);
          return { data: res.data };
        } catch (error) {
          return {
            error: {
              message: error?.message || "Could not invite manager.",
            },
          };
        }
      },
      invalidatesTags: ["User"],
    }),

    /* =====================================================
        INVITE ADMIN (SPU ONLY)
       ===================================================== */
    inviteAdmin: builder.mutation({
      async queryFn({ email, name, surname }) {
        try {
          // 🎯 ALIGNMENT: Must match the deployed function name exactly
          const fn = httpsCallable(functions, "inviteAdminUser");

          const res = await fn({
            email,
            name,
            surname,
          });

          return { data: res.data };
        } catch (error) {
          console.error("❌ [AUTH API]: Admin Invite Failed", error);
          return {
            error: {
              status: "CUSTOM_ERROR",
              message: error?.message || "Admin appointment failed",
            },
          };
        }
      },
      // 🚀 THE FRESHNESS TRIGGER:
      // This tells Redux to refetch the users list so the new ADM appears immediately.
      invalidatesTags: ["User"],
    }),

    /* =====================================================
       INVITE SPV (MNG ONLY)
       ===================================================== */
    inviteSpv: builder.mutation({
      async queryFn({ email, name, surname, serviceProvider }) {
        try {
          const fn = httpsCallable(functions, "inviteSupervisorUser");

          const res = await fn({
            email,
            name,
            surname,
            serviceProvider, // { id, name }
          });

          console.log(`SPV created res: `, res);

          return { data: res.data };
        } catch (error) {
          console.error("inviteSpv ----error", error);

          return {
            error: {
              message: error?.message || "Could not invite supervisor.",
            },
          };
        }
      },
      invalidatesTags: ["User"],
    }),

    /* =====================================================
       AUTHORISE FWR (MNG ONLY)
       ===================================================== */
    authorizeFwr: builder.mutation({
      async queryFn({ uid }) {
        try {
          const fn = httpsCallable(functions, "authorizeFieldWorker");
          const res = await fn({ uid });
          return { data: res.data };
        } catch (error) {
          return {
            error: {
              message: error?.message || "Could not authorize field worker.",
            },
          };
        }
      },
      invalidatesTags: ["User"],
    }),
  }),
});

/* =====================================================
   EXPORT HOOKS
   ===================================================== */
export const {
  useGetAuthStateQuery,
  useSignupMutation,
  useSigninMutation,
  useSignoutMutation,
  useUpdateProfileMutation,
  useSetActiveWorkbaseMutation,
  useSendEmailVerificationMutation,
  useReauthenticateMutation,
  useUpdateEmailVerifiedMutation,
  useSendPhoneOtpMutation,
  useConfirmPhoneOtpMutation,
  useUpdatePasswordMutation,
  useCreateAdminUserMutation,
  useInviteMngMutation,
  useInviteAdminMutation,
  useInviteSpvMutation,
  useAuthorizeFwrMutation,
} = authApi;
