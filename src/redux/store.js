import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import {
  FLUSH,
  PAUSE,
  PERSIST,
  persistReducer,
  persistStore,
  PURGE,
  REGISTER,
  REHYDRATE,
} from "redux-persist";

import { reduxStorage } from "./reduxStorage";

import { astsApi } from "./astsApi";
import { authApi } from "./authApi";
import { erfsApi } from "./erfsApi";
import { geoApi } from "./geoApi";
import { premisesApi } from "./premisesApi";
import { salesApi } from "./salesApi";
import { settingsApi } from "./settingsApi";
import { spApi } from "./spApi";
import { teamsApi } from "./teamsApi";
import { trnsApi } from "./trnsApi";
import { usersApi } from "./usersApi";

import { geofenceApi } from "./geofenceApi";
import { irepsLookupOptionsApi } from "./irepsLookupOptionsApi";
import { irepsSelectLookupsApi } from "./irepsSelectLookupsApi";
import { lifecycleInstructionApi } from "./lifecycleInstructionApi";
import { bgoApi } from "./bgoApi";
import { accountDataApi } from "./accountDataApi";
import newTrnsReducer from "./newTrnsSlice";
import offlineReducer from "./offlineSlice";

/* =====================================================
   ROOT REDUCER
===================================================== */
const rootReducer = combineReducers({
  [geoApi.reducerPath]: geoApi.reducer,
  [authApi.reducerPath]: authApi.reducer,
  [usersApi.reducerPath]: usersApi.reducer,
  [spApi.reducerPath]: spApi.reducer,
  [teamsApi.reducerPath]: teamsApi.reducer,
  [erfsApi.reducerPath]: erfsApi.reducer,
  [premisesApi.reducerPath]: premisesApi.reducer,
  [trnsApi.reducerPath]: trnsApi.reducer,
  [settingsApi.reducerPath]: settingsApi.reducer,
  [astsApi.reducerPath]: astsApi.reducer,
  [salesApi.reducerPath]: salesApi.reducer,
  [geofenceApi.reducerPath]: geofenceApi.reducer,
  [irepsSelectLookupsApi.reducerPath]: irepsSelectLookupsApi.reducer,
  [irepsLookupOptionsApi.reducerPath]: irepsLookupOptionsApi.reducer,
  [lifecycleInstructionApi.reducerPath]: lifecycleInstructionApi.reducer,
  [bgoApi.reducerPath]: bgoApi.reducer,
  [accountDataApi.reducerPath]: accountDataApi.reducer,

  offline: offlineReducer,
  newTrns: newTrnsReducer,
});

/* =====================================================
   REDUX PERSIST CONFIG
===================================================== */
const persistConfig = {
  key: "root",
  version: 2,
  storage: reduxStorage,

  // Keep persisted state small + valuable
  whitelist: ["offline"],

  // Never persist auth + large/sensitive caches
  blacklist: [
    erfsApi.reducerPath,
    usersApi.reducerPath,
    spApi.reducerPath,
    teamsApi.reducerPath,
    trnsApi.reducerPath,
    settingsApi.reducerPath,
    astsApi.reducerPath,
    authApi.reducerPath,
    geoApi.reducerPath,
    premisesApi.reducerPath,
    salesApi.reducerPath,
    geofenceApi.reducerPath,
    irepsSelectLookupsApi.reducerPath,
    irepsLookupOptionsApi.reducerPath,
    lifecycleInstructionApi.reducerPath,
    bgoApi.reducerPath,
    accountDataApi.reducerPath,
    "newTrns",
  ],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

/* =====================================================
   STORE
===================================================== */
export const store = configureStore({
  reducer: persistedReducer,

  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: __DEV__
        ? false
        : {
            ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
          },
    }).concat(
      geoApi.middleware,
      authApi.middleware,
      usersApi.middleware,
      spApi.middleware,
      teamsApi.middleware,
      erfsApi.middleware,
      premisesApi.middleware,
      trnsApi.middleware,
      settingsApi.middleware,
      astsApi.middleware,
      salesApi.middleware,
      geofenceApi.middleware,
      irepsSelectLookupsApi.middleware,
      irepsLookupOptionsApi.middleware,
      lifecycleInstructionApi.middleware,
      bgoApi.middleware,
      accountDataApi.middleware,
    ),
});

export const persistor = persistStore(store);

// ✅ RTK Query listeners (recommended)
setupListeners(store.dispatch);
