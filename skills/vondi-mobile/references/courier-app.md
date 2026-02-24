# vondi-courier — Курьерское приложение

## Экраны (expo-router структура)

```
app/
├── (auth)/
│   └── login.tsx          # Авторизация курьера
├── (tabs)/
│   ├── index.tsx          # Список заданий (главный)
│   ├── history.tsx        # История доставок
│   └── profile.tsx        # Профиль курьера
├── order/
│   ├── [id].tsx           # Детали заказа
│   ├── [id]/scan.tsx      # Сканирование при получении
│   └── [id]/proof.tsx     # Фото подтверждение доставки
└── _layout.tsx
```

## Пользовательские сценарии (User Stories)

### US-1: Начало смены

1. Открыть приложение
2. Войти (телефон + пароль)
3. Увидеть список активных заданий на сегодня

### US-2: Получение заказа со склада

1. Открыть задание
2. Нажать "Получить посылку"
3. Сканировать штрихкод посылки
4. Подтвердить — статус → "in_transit"

### US-3: Доставка покупателю

1. Открыть задание (статус in_transit)
2. Нажать "Открыть маршрут" → Google Maps / 2GIS
3. По прибытии — нажать "Подтвердить доставку"
4. Опционально: сфотографировать подтверждение
5. Статус → "delivered"

### US-4: Неудачная доставка

1. Отметить причину (не дома, отказ, неверный адрес)
2. Статус → "failed" с причиной
3. Задание возвращается в очередь (решает диспетчер)

## Ключевые компоненты

### OrderCard

```typescript
interface OrderCardProps {
  orderId: string;
  address: string;
  recipientName: string;
  recipientPhone: string;
  items: { name: string; qty: number }[];
  status: "pending" | "in_transit" | "delivered" | "failed";
  scheduledTime?: string;
}
```

### StatusBadge

Цвета статусов:

- pending: `#FFA500` (оранжевый)
- in_transit: `#007AFF` (синий)
- delivered: `#34C759` (зелёный)
- failed: `#FF3B30` (красный)

## API вызовы

**БЛОКЕР:** Delivery Service использует только gRPC. REST API для курьеров не существует.
Endpoint-ы ниже — целевые (из плана), будут реализованы в Фазе 0.
Верифицировать через Swagger после реализации: `http://localhost:8888/swagger.json`

```
// Активный маршрут курьера (из RoutingService.GetActiveRoute)
GET /api/v1/courier/routes/active

// Завершить точку маршрута (включая proof_photo_url)
POST /api/v1/courier/waypoints/{id}/complete

// Отправить координаты (CourierTrackingService)
POST /api/v1/courier/tracking
Body: { lat: float, lng: float, timestamp: int64 }
```

## GPS Трекинг

```typescript
import * as Location from "expo-location";

// Разрешение на background location (запрашивать при первом запуске)
await Location.requestBackgroundPermissionsAsync();

// Отправка координат на сервер каждые 30 сек
Location.watchPositionAsync(
  { accuracy: Location.Accuracy.High, timeInterval: 30000, distanceInterval: 50 },
  (location) => {
    api.post("/api/v1/courier/tracking", {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      timestamp: location.timestamp,
    });
  },
);
```

## Офлайн-очередь

При потере сети — действия (обновление статуса, фото) сохраняются в SQLite.
При восстановлении сети — очередь отправляется автоматически.

```typescript
// store/offline-queue.ts
interface QueueItem {
  id: string;
  type: "status_update" | "proof_upload" | "location_update";
  payload: object;
  createdAt: number;
  retries: number;
}
```

## Push-уведомления

Курьер получает push при:

- Назначении нового задания
- Изменении приоритета задания
- Сообщении от диспетчера
