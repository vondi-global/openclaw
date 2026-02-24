# Expo / React Native — паттерны для vondi

## Структура проекта (шаблон)

```
vondi-courier/
├── app/
│   ├── _layout.tsx          # Root layout (auth guard)
│   ├── (auth)/
│   │   └── login.tsx
│   └── (tabs)/
│       ├── _layout.tsx      # Tab navigator
│       └── index.tsx
├── components/
│   ├── ui/                  # Базовые UI компоненты
│   └── domain/              # Бизнес компоненты (OrderCard, etc.)
├── services/
│   ├── api.ts               # fetch-based API client
│   ├── delivery.ts          # Delivery API calls
│   └── auth.ts              # Auth API calls
├── store/
│   ├── index.ts             # Redux store + RootState
│   └── slices/
│       ├── authSlice.ts     # Redux auth slice
│       └── ordersSlice.ts   # Redux orders slice
├── hooks/
│   ├── useOrders.ts
│   └── useLocation.ts
├── types/
│   └── index.ts             # TypeScript interfaces
├── constants/
│   └── colors.ts            # Vondi brand colors
├── app.json
├── eas.json
├── package.json
└── tsconfig.json
```

## Инициализация нового проекта

```bash
npx create-expo-app vondi-courier --template expo-template-blank-typescript
cd vondi-courier
npx expo install expo-router expo-location expo-camera \
  expo-notifications @react-native-async-storage/async-storage \
  react-native-paper @reduxjs/toolkit react-redux
```

## Auth Guard (root layout)

```typescript
// app/_layout.tsx
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { Redirect, Stack } from 'expo-router';

export default function RootLayout() {
  const token = useSelector((state: RootState) => state.auth.token);

  if (!token) return <Redirect href="/(auth)/login" />;

  return <Stack />;
}
```

## Типичный экран со списком

```typescript
// app/(tabs)/index.tsx
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { getActiveOrders } from '@/services/delivery';
import { OrderCard } from '@/components/domain/OrderCard';
import type { Order } from '@/types';

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await getActiveOrders();
      setOrders(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <FlatList
      data={orders}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <OrderCard order={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
    />
  );
}
```

## Цвета Vondi

```typescript
// constants/colors.ts
export const Colors = {
  primary: "#1a1a2e",
  accent: "#4a6cf7",
  background: "#f8f9fa",
  success: "#34C759",
  warning: "#FFA500",
  error: "#FF3B30",
  info: "#007AFF",
  text: "#1a1a2e",
  textSecondary: "#666666",
  border: "#E5E5EA",
  white: "#FFFFFF",
};
```

## API клиент (fetch)

```typescript
// services/api.ts — нет axios, нативный fetch
import AsyncStorage from "@react-native-async-storage/async-storage";
import { store } from "@/store";
import { clearCredentials } from "@/store/slices/authSlice";

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
    store.dispatch(clearCredentials());
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

## Сканер (полный паттерн)

```typescript
// app/order/[id]/scan.tsx
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { confirmPickup } from '@/services/delivery';

export default function ScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text>Нужен доступ к камере</Text>
        <Button onPress={requestPermission}>Разрешить</Button>
      </View>
    );
  }

  const handleScan = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    try {
      await confirmPickup(id, data);
      router.back();
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось подтвердить');
      setScanned(false);
    }
  };

  return (
    <CameraView
      style={StyleSheet.absoluteFillObject}
      onBarcodeScanned={handleScan}
      barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'ean8'] }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
```

## EAS Build конфиг

```json
// eas.json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

```bash
# Preview APK (для тестирования)
eas build -p android --profile preview

# Production AAB (для Google Play)
eas build -p android --profile production

# Скачать последний build
eas build:list --platform android --limit 1
```

## app.json минимум

```json
{
  "expo": {
    "name": "Vondi Courier",
    "slug": "vondi-courier",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "vondi-courier",
    "android": {
      "package": "rs.vondi.courier",
      "permissions": ["ACCESS_FINE_LOCATION", "ACCESS_BACKGROUND_LOCATION", "CAMERA"]
    }
  }
}
```

Для storefront-app: `"orientation": "landscape"`, package: `rs.vondi.storefront`
