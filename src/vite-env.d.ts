/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEEPSEEK_API_KEY?: string
  readonly VITE_LLM_BASE_URL?: string
  readonly VITE_LLM_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
