/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the KSHETRA FastAPI prediction service.
   * Defaults to http://127.0.0.1:8000 when unset (local development).
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
