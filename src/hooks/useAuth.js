// src/hooks/useAuth.js
import { authApi } from "../redux/authApi";

export const useAuth = () => {
  const { data, isLoading, isError } =
    authApi.endpoints.getAuthState.useQueryState();
  // console.log(`useAuth ----data`, data);

  const profile = data?.profile || null;
  const role = profile?.employment?.role || "GST";

  // Centralized Active Workbase Extraction
  const activeWorkbase = profile?.access?.activeWorkbase || null;
  // console.log(`useAuth ----activeWorkbase`, activeWorkbase);

  const activeWorkbaseId = activeWorkbase?.id || null;
  // console.log(`useAuth ----activeWorkbase`, activeWorkbase);

  return {
    user: data?.auth || null,
    profile,

    // Identity & Access
    role,
    isSPU: role === "SPU",
    isADM: role === "ADM",
    isMNG: role === "MNG",
    isSPV: role === "SPV",
    isFWR: role === "FWR",
    activeWorkbase, // Full object (contains name, pcode, etc)
    activeWorkbaseId, // Just the ID string (ZA1048)
    workbases: profile?.access?.workbases || [],

    // Onboarding & Flow
    status: profile?.onboarding?.status || "IDLE",
    ready: data?.ready || false,
    isAuthenticated: !!data?.auth,
    logoutInProgress: data?.logoutInProgress === true,

    isLoading,
    isError,
  };
};
