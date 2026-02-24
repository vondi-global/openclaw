---
name: vondi-mobile
description: "Mobile app development for Vondi Global marketplace (vondi.rs, Serbia). Use when building, modifying, or debugging React Native/Expo mobile apps: vondi-courier (courier GPS tracking + barcode scanning), vondi-storefront (pickup point tablet app), or future vondi-app (marketplace). Handles EAS Build, API integration with vondi.rs backend, TypeScript patterns."
metadata: { "openclaw": { "emoji": "📱", "requires": { "bins": ["node", "npx"] } } }
---

# Vondi Mobile Development

## Architecture

**Stack:** Expo SDK 54 | TypeScript | expo-router | Redux Toolkit | React Native Paper

**Apps (priority order):**

1. `vondi-courier` — courier app (GPS, barcode, delivery confirmation)
2. `vondi-storefront` — pickup point tablet app (order receive/issue)
3. `vondi-app` — marketplace buyer app (future, not started)

**Repos:**

- `/p/github.com/vondi-global/vondi-courier`
- `/p/github.com/vondi-global/vondi-storefront`

**Full plan:** `/p/github.com/vondi-global/openclaw/.openclaw/workspace/VONDI_MOBILE_PLAN.md`

## Key Principles

- 100% AI development — no manual native code changes
- Use Expo managed workflow (no ejecting)
- TypeScript strict mode (same as vondi frontend)
- Auth: JWT Bearer from vondi Auth Service
- API base URL: `https://api.vondi.rs` (production) / `https://devapi.vondi.rs` (dev)
- All screens in `app/` using expo-router (file-based routing like Next.js)

## Development Workflow

```bash
# Start dev server (test on phone via Expo Go app)
cd /p/github.com/vondi-global/vondi-courier
npx expo start

# Build APK (no Android Studio needed)
eas build --platform android --profile preview

# Build production AAB for Play Store
eas build --platform android --profile production
```

## Backend API Integration

Verify endpoints in Swagger before use: `http://localhost:8888/swagger.json`

```typescript
// services/api.ts — fetch-based client (нет axios, нативный fetch)
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://devapi.vondi.rs";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await AsyncStorage.getItem("jwt_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    await AsyncStorage.removeItem("jwt_token");
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
};
```

## Expo Native Modules

```bash
# GPS (background tracking)
npx expo install expo-location

# Camera + barcode scanner (expo-barcode-scanner удалён в SDK 52+, только expo-camera)
npx expo install expo-camera

# Push notifications
npx expo install expo-notifications

# Local storage
npx expo install @react-native-async-storage/async-storage

# SQLite (offline queue)
npx expo install expo-sqlite
```

## app.json permissions (Android)

```json
{
  "android": {
    "permissions": [
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "CAMERA",
      "READ_EXTERNAL_STORAGE",
      "WRITE_EXTERNAL_STORAGE",
      "RECEIVE_BOOT_COMPLETED",
      "VIBRATE"
    ]
  }
}
```

## State Management (Redux Toolkit)

```typescript
// store/slices/authSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface AuthState {
  token: string | null;
  courierId: string | null;
}

const authSlice = createSlice({
  name: "auth",
  initialState: { token: null, courierId: null } as AuthState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ token: string; courierId: string }>) => {
      state.token = action.payload.token;
      state.courierId = action.payload.courierId;
    },
    clearCredentials: (state) => {
      state.token = null;
      state.courierId = null;
    },
  },
});

export const { setCredentials, clearCredentials } = authSlice.actions;
export default authSlice.reducer;

// store/index.ts
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";

export const store = configureStore({ reducer: { auth: authReducer } });
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

## Barcode Scanner Pattern

```typescript
import { CameraView, useCameraPermissions } from 'expo-camera';

export function Scanner({ onScan }: { onScan: (code: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission?.granted) {
    return <Button title="Allow Camera" onPress={requestPermission} />;
  }

  return (
    <CameraView
      style={{ flex: 1 }}
      onBarcodeScanned={({ data }) => onScan(data)}
      barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13'] }}
    />
  );
}
```

## EAS Build Setup

```bash
# One-time setup
npm install -g eas-cli
# EXPO_TOKEN хранится в ~/.zshrc
eas build:configure
```

```json
// eas.json
{
  "build": {
    "preview": {
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

## Maps (Mapbox)

Same Mapbox token as vondi web frontend. Find token in `/p/github.com/vondi-global/vondi/frontend/.env*`.

```bash
npx expo install @rnmapbox/maps
```

```typescript
import MapboxGL from "@rnmapbox/maps";
MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);
```

## i18n (expo-localization + react-i18next)

Languages: `sr` (primary), `en`, `ru`. Auto-detect from device locale.

```bash
npx expo install expo-localization
npm install react-i18next i18next
```

```typescript
// i18n/index.ts
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import sr from "./locales/sr.json";
import en from "./locales/en.json";

i18n.use(initReactI18next).init({
  resources: { sr: { translation: sr }, en: { translation: en } },
  lng: Localization.getLocales()[0]?.languageCode ?? "sr",
  fallbackLng: "sr",
  interpolation: { escapeValue: false },
});

export default i18n;
```

## References

- Courier app screens & flows: `references/courier-app.md`
- Storefront app screens & flows: `references/storefront-app.md`
- Expo/React Native code patterns: `references/expo-patterns.md`
