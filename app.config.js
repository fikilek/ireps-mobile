const APP_ENV = process.env.APP_ENV || process.env.EXPO_PUBLIC_APP_ENV || "dev";

const APP_VARIANTS = {
  dev: {
    name: "iREPS Dev",
    label: "DEV",
    androidPackage: "com.ireps.mobile.dev",
    scheme: "ireps-dev",
    icon: "./assets/images/ireps-icon-dev.png",
    adaptiveIconForeground: "./assets/images/ireps-icon-dev.png",
    adaptiveIconBackground: "#f6fe00",
  },
  test: {
    name: "iREPS Test",
    label: "TEST",
    androidPackage: "com.ireps.mobile.test",
    scheme: "ireps-test",
    icon: "./assets/images/ireps-icon-test.png",
    adaptiveIconForeground: "./assets/images/ireps-icon-test.png",
    adaptiveIconBackground: "#8d2ec4",
  },
  trial: {
    name: "iREPS Trial",
    label: "TRIAL",
    androidPackage: "com.ireps.mobile.trial",
    scheme: "ireps-trial",
    icon: "./assets/images/ireps-icon-trial.png",
    adaptiveIconForeground: "./assets/images/ireps-icon-trial.png",
    adaptiveIconBackground: "#3c1fcb",
  },
  live: {
    name: "iREPS",
    label: "LIVE",
    androidPackage: "com.ireps.mobile",
    scheme: "ireps",
    icon: "./assets/images/ireps-icon-live.png",
    adaptiveIconForeground: "./assets/images/ireps-icon-live.png",
    adaptiveIconBackground: "#c02424",
  },
};

const variant = APP_VARIANTS[APP_ENV] || APP_VARIANTS.dev;

export default {
  expo: {
    name: variant.name,
    slug: "maps1",
    owner: "ireps",
    version: "1.0.0",
    orientation: "portrait",
    icon: variant.icon,
    scheme: variant.scheme,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    ios: {
      supportsTablet: true,
    },

    android: {
      adaptiveIcon: {
        backgroundColor: variant.adaptiveIconBackground,
        foregroundImage: variant.adaptiveIconForeground,
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: variant.androidPackage,
      config: {
        googleMaps: {
          apiKey: "AIzaSyAxgD1BOhVPXgDAYCK_ZG8Gj6CZPRgiHiw",
        },
      },
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "READ_MEDIA_IMAGES",
        "READ_MEDIA_VIDEO",
      ],
    },

    plugins: [
      "expo-router",
      "expo-font",
      "expo-audio",
      "expo-camera",
      "expo-web-browser",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: { backgroundColor: "#000000" },
        },
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Allow iREPS to access your location for field monitoring and infrastructure mapping.",
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Allow iREPS to access photos for infrastructure reporting.",
          cameraPermission:
            "Allow iREPS to open the camera for meter inspections.",
        },
      ],
      [
        "expo-media-library",
        {
          photosPermission:
            "Allow iREPS to save infrastructure reports to your device.",
          savePhotosPermission: "Allow iREPS to save captured meter photos.",
          isAccessMediaLocationEnabled: true,
        },
      ],
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: false,
    },

    extra: {
      appEnv: APP_ENV,
      appEnvLabel: variant.label,
      appEnvColor: variant.adaptiveIconBackground,
      googleMapsApiKey: "AIzaSyAxgD1BOhVPXgDAYCK_ZG8Gj6CZPRgiHiw",
      eas: {
        projectId: "bf458047-0b33-4123-8a11-eea44fce56c2",
      },
    },

    runtimeVersion: {
      policy: "sdkVersion",
    },

    updates: {
      url: "https://u.expo.dev/bf458047-0b33-4123-8a11-eea44fce56c2",
    },
  },
};
