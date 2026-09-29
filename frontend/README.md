# Frontend

Interfaz de la agenda financiera. React + TypeScript + Vite + Tailwind v4.

## Desarrollo

El backend tiene que estar corriendo en el puerto 8000. Vite redirige las
llamadas a `/api` hacia ahí (ver `vite.config.ts`).

```bash
npm install
npm run dev
```

## Build

```bash
npm run build     # verifica tipos y compila en dist/
npm run preview   # sirve el build
```

## Estructura

```
src/
  pages/         Una pantalla por ruta
  components/     Modal, FormModal, Card, Button, TransactionItem, Layout...
  hooks/          useAsync: carga con loading / error / reload
  services/api.ts Cliente HTTP tipado contra /api
  utils/format.ts Moneda y fechas en es-AR
  types/          Los tipos de la API
```

`types/` espeja los schemas de Pydantic en `backend/app/schemas/`. Si cambiás
uno, actualizá el otro.
