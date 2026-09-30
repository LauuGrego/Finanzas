/// <reference types="vite/client" />

/**
 * Set only in a split deployment (Vercel for the frontend, Render for the API).
 * When it is absent the frontend is served by the backend itself and talks to
 * `/api` on its own origin, which is what local development does.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
