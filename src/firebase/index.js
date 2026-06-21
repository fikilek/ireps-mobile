// import { initializeApp } from "firebase/app";
// import { getReactNativePersistence, initializeAuth } from "firebase/auth";
// import { initializeFirestore } from "firebase/firestore";
// import { getFunctions } from "firebase/functions";
// import { getStorage } from "firebase/storage";
// import { MMKV } from "../redux/mmkv";

// // ireps2 (Staging)
// const firebaseConfig = {
// apiKey: "AIzaSyAkE9nf-G-gW9Pv9ZSxRzyr0FL3G6XXJA8",
// authDomain: "ireps2.firebaseapp.com",
// projectId: "ireps2",
// storageBucket: "ireps2.appspot.com",
// messagingSenderId: "885517634969",
// appId: "1:885517634969:web:f013c3961097836245d708",
// };

// // ipreps (production)
// // const firebaseConfig = {
// // 	apiKey: "AIzaSyCivNf1fZ_8d692nLhjpuiRwSqZVBofMIM",
// // 	authDomain: "ireps-5c3e9.firebaseapp.com",
// // 	projectId: "ireps-5c3e9",
// // 	storageBucket: "ireps-5c3e9.firebasestorage.app",
// // 	messagingSenderId: "236369917108",
// // 	appId: "1:236369917108:web:85b87ec389686408d1d3e1",
// // 	measurementId: "G-EC8PYLH79J",
// // };

// // Initialize Firebase
// const app = initializeApp(firebaseConfig);

// // Initialize firestore
// export const db = initializeFirestore(app, {
//   experimentalForceLongPolling: true,
//   useFetchStreams: false,
//   // localCache: persistentLocalCache(),
// });
// // export const db = getFirestore(app);
// // export const db = initializeFirestore(app, {
// //   experimentalForceLongPolling: true, // 🎯 THE STABILIZER
// // });
// // export const db = initializeFirestore(app, {
// //   experimentalForceLongPolling: true,
// //   useFetchStreams: false,
// // });

// export const auth = initializeAuth(app, {
//   persistence: getReactNativePersistence(MMKV),
// });

// // initialize firebase storage
// export const storage = getStorage(app);

// // Initialize functions
// export const functions = getFunctions(app);

// -------------------------------------------

import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import { MMKV } from "../redux/mmkv";

const APP_ENV = (process.env.EXPO_PUBLIC_APP_ENV || "dev").trim().toLowerCase();

const FIREBASE_CONFIGS = {
  dev: {
    apiKey: "AIzaSyAkE9nf-G-gW9Pv9ZSxRzyr0FL3G6XXJA8",
    authDomain: "ireps2.firebaseapp.com",
    projectId: "ireps2",
    storageBucket: "ireps2.appspot.com",
    messagingSenderId: "885517634969",
    appId: "1:885517634969:web:f013c3961097836245d708",
  },

  test: {
    apiKey: "AIzaSyByO39nV149fricf4ltUcOWDIsJHpLQ7Lg",
    authDomain: "ireps-test.firebaseapp.com",
    projectId: "ireps-test",
    storageBucket: "ireps-test.firebasestorage.app",
    messagingSenderId: "941227937262",
    appId: "1:941227937262:web:92d002062f1e39784a92ff",
    measurementId: "G-WXG8YWD5YC",
  },
};

const firebaseConfig = FIREBASE_CONFIGS[APP_ENV];

if (!firebaseConfig) {
  throw new Error(
    `[iREPS Firebase] Unsupported EXPO_PUBLIC_APP_ENV="${APP_ENV}". Expected one of: ${Object.keys(
      FIREBASE_CONFIGS,
    ).join(", ")}`,
  );
}

if (!firebaseConfig.projectId) {
  throw new Error(
    `[iREPS Firebase] Missing Firebase projectId for APP_ENV="${APP_ENV}".`,
  );
}

console.log(
  `[iREPS Firebase] Connecting APP_ENV="${APP_ENV}" to project "${firebaseConfig.projectId}"`,
);

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(MMKV),
});

export const storage = getStorage(app);

export const functions = getFunctions(app);

export const firebaseApp = app;
export const firebaseProjectId = firebaseConfig.projectId;
export const firebaseEnvironment = APP_ENV;
