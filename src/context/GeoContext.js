// src/context/GeoContext.js
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../hooks/useAuth";
import { useGetLocalMunicipalityByIdQuery } from "../redux/geoApi";
import {
  getRestorableLastActiveScope,
  saveLastActiveScope,
} from "../storage/wardScopeStorage";

export const GeoContext = createContext(null);

// DEFAULT GEO BOOT MODEL
// Stage 0: LM unknown, Ward unknown
//   - selectedLm = null
//   - selectedWard = null
//   - selectedErf = null
//   - selectedPremise = null
//   - selectedMeter = null
//
// Stage 1: LM known from user workbase, Ward unknown
//   - selectedLm = user workbase
//   - selectedWard = null
//   - selectedErf = null
//   - selectedPremise = null
//   - selectedMeter = null
//
// Stage 2: LM known, Ward restored/selected
//   - selectedLm = active LM
//   - selectedWard = active Ward
//   - selectedErf = null
//   - selectedPremise = null
//   - selectedMeter = null
//
// IMPORTANT:
// Warehouse operational data must remain closed until both LM and Ward exist.
// MMKV is only used here to record/replay the last active scope pointer.
// Operational data still flows RTK Query -> WarehouseContext -> UI.

const INITIAL_GEO = {
  selectedLm: null,
  selectedWard: null,
  selectedErf: null,
  selectedPremise: null,
  selectedMeter: null,

  lastSelectionType: null,
  flightSignal: 0, // counter, not Date.now
};

function readUidFromAuth(authCtx, profile) {
  return (
    authCtx?.auth?.uid ||
    authCtx?.uid ||
    profile?.uid ||
    profile?.id ||
    profile?.identity?.uid ||
    null
  );
}

function getGeoPcode(entity) {
  return entity?.pcode || entity?.id || null;
}

export const GeoProvider = ({ children }) => {
  const authCtx = useAuth();
  const { profile } = authCtx || {};

  const uid = readUidFromAuth(authCtx, profile);
  const activeWorkbase = profile?.access?.activeWorkbase || null;
  const workbaseId = getGeoPcode(activeWorkbase);
  const restoreAttemptRef = useRef(null);

  const [geoState, setGeoState] = useState(INITIAL_GEO);
  const selectedLm = geoState?.selectedLm || null;
  const selectedWard = geoState?.selectedWard || null;
  const selectedLmPcode = getGeoPcode(selectedLm);
  const selectedWardPcode = getGeoPcode(selectedWard);

  useEffect(() => {
    if (!profile) {
      restoreAttemptRef.current = null;
      setGeoState(INITIAL_GEO);
      return;
    }

    if (!workbaseId) {
      restoreAttemptRef.current = null;
      setGeoState((prev) => {
        if (!prev.selectedLm && !prev.selectedWard) return prev;

        return {
          ...INITIAL_GEO,
          flightSignal: prev.flightSignal + 1,
        };
      });
      return;
    }

    setGeoState((prev) => {
      const prevLmId = getGeoPcode(prev.selectedLm);
      if (prevLmId === workbaseId) return prev;

      return {
        ...INITIAL_GEO,
        selectedLm: activeWorkbase || { id: workbaseId },
        lastSelectionType: "LM",
        flightSignal: prev.flightSignal + 1,
      };
    });
  }, [profile, workbaseId, activeWorkbase]);

  // 2) HYDRATE: fetch full LM doc
  const { data: remoteLmDoc } = useGetLocalMunicipalityByIdQuery(workbaseId, {
    skip: !workbaseId,
  });

  useEffect(() => {
    if (!profile || !remoteLmDoc) return;

    // ignore late docs that don't match profile workbase
    const remoteLmPcode = getGeoPcode(remoteLmDoc);
    if (remoteLmPcode !== workbaseId) return;

    setGeoState((prev) => {
      // only hydrate the current LM if it matches and is still placeholder
      if (getGeoPcode(prev.selectedLm) !== remoteLmPcode) return prev;

      const prevHasFullGeo =
        !!prev.selectedLm?.bbox ||
        !!prev.selectedLm?.geometry ||
        !!prev.selectedLm?.parents;

      if (prevHasFullGeo && prev.selectedLm?.name === remoteLmDoc?.name) {
        return prev;
      }

      return {
        ...prev,
        selectedLm: remoteLmDoc,
        flightSignal: prev.flightSignal + 1,
      };
    });
  }, [profile, remoteLmDoc, workbaseId]);

  // 3) RESTORE: replay last active ward pointer after user + workbase + LM are known.
  useEffect(() => {
    if (!profile || !uid || !workbaseId || !remoteLmDoc) return;

    const lmPcode = getGeoPcode(remoteLmDoc);
    if (!lmPcode) return;

    const restoreKey = `${uid}__${workbaseId}__${lmPcode}`;
    if (restoreAttemptRef.current === restoreKey) return;

    // Do not override a ward the user already selected under this LM.
    if (selectedWardPcode && selectedLmPcode === lmPcode) {
      restoreAttemptRef.current = restoreKey;
      return;
    }

    const restorableScope = getRestorableLastActiveScope({
      uid,
      activeWorkbaseId: workbaseId,
      lmPcode,
    });

    restoreAttemptRef.current = restoreKey;

    if (!restorableScope?.wardPcode) return;

    setGeoState((prev) => {
      // If something selected a ward while this effect was resolving, do not override it.
      if (prev?.selectedWard?.id || prev?.selectedWard?.pcode) return prev;

      const ward = restorableScope.ward || {
        id: restorableScope.wardPcode,
        pcode: restorableScope.wardPcode,
        name: `Ward ${restorableScope.wardPcode}`,
      };

      return {
        ...INITIAL_GEO,
        selectedLm: remoteLmDoc,
        selectedWard: ward,
        lastSelectionType: "WARD",
        flightSignal: prev.flightSignal + 1,
      };
    });
  }, [
    profile,
    uid,
    workbaseId,
    remoteLmDoc,
    selectedLmPcode,
    selectedWardPcode,
  ]);

  // 4) RECORD: whenever a valid LM + Ward scope is active, save the pointer to MMKV.
  useEffect(() => {
    if (!profile || !uid || !workbaseId) return;

    const lm = selectedLm;
    const ward = selectedWard;
    const lmPcode = selectedLmPcode;
    const wardPcode = selectedWardPcode;

    if (!lmPcode || !wardPcode) return;

    saveLastActiveScope({
      uid,
      activeWorkbaseId: workbaseId,
      lmPcode,
      wardPcode,
      lm,
      ward,
    });
  }, [
    profile,
    uid,
    workbaseId,
    selectedLm,
    selectedWard,
    selectedLmPcode,
    selectedWardPcode,
  ]);

  /**
   * updateGeo(updates, options)
   * options.silent === true => does NOT bump flightSignal
   */

  const updateGeo = useCallback((updates, options = {}) => {
    setGeoState((prev) => {
      const silent = !!options.silent;
      const hasUpdate = (key) =>
        Object.prototype.hasOwnProperty.call(updates, key);

      let next = { ...prev, ...updates };

      // cascade clears
      if (hasUpdate("selectedLm")) {
        const prevLmId = getGeoPcode(prev?.selectedLm);
        const nextLmId = getGeoPcode(updates?.selectedLm);
        const lmChanged = prevLmId !== nextLmId;

        if (lmChanged && !hasUpdate("selectedWard")) {
          next.selectedWard = null;
        }

        if (!hasUpdate("selectedErf")) next.selectedErf = null;
        if (!hasUpdate("selectedPremise")) next.selectedPremise = null;
        if (!hasUpdate("selectedMeter")) next.selectedMeter = null;
      } else if (hasUpdate("selectedWard")) {
        if (!hasUpdate("selectedErf")) next.selectedErf = null;
        if (!hasUpdate("selectedPremise")) next.selectedPremise = null;
        if (!hasUpdate("selectedMeter")) next.selectedMeter = null;
      } else if (hasUpdate("selectedErf")) {
        if (!hasUpdate("selectedPremise")) next.selectedPremise = null;
        if (!hasUpdate("selectedMeter")) next.selectedMeter = null;
      } else if (hasUpdate("selectedPremise")) {
        if (!hasUpdate("selectedMeter")) next.selectedMeter = null;
      }

      if (!silent) {
        next.flightSignal = prev.flightSignal + 1;
      }

      return next;
    });
  }, []);

  /**
   * resetGeo()
   * Clears UI selection WITHOUT triggering Pilot.
   * Keeps LM + Ward so the active scope remains stable.
   */
  const resetGeo = useCallback(() => {
    setGeoState((prev) => ({
      ...INITIAL_GEO,
      selectedLm: prev.selectedLm,
      selectedWard: prev.selectedWard,
      flightSignal: prev.flightSignal,
    }));
  }, []);

  const value = useMemo(
    () => ({
      geoState,
      updateGeo,
      resetGeo,
      setGeoState,
    }),
    [geoState, updateGeo, resetGeo],
  );

  return <GeoContext.Provider value={value}>{children}</GeoContext.Provider>;
};

export const useGeo = () => {
  const ctx = useContext(GeoContext);
  if (!ctx) throw new Error("useGeo must be used within GeoProvider");
  return ctx;
};
