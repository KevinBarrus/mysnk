export interface LlmTextRequest {
  systemPrompt: string
  userPrompt: string
  temperature?: number
}

export interface LlmTextResponse {
  text: string
  model: string
}

export interface LlmTextStreamHandlers {
  onChunk?: (chunk: string, fullText: string) => void
}

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

interface OpenAiChatStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string
    }
  }>
}

export interface LlmClientConfig {
  apiKey?: string
  baseUrl: string
  model: string
}

function maskApiKey(apiKey?: string): string {
  if (!apiKey) return 'missing'
  if (apiKey.length <= 10) return `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`
  return `${apiKey.slice(0, 6)}***${apiKey.slice(-4)}`
}

function logLlmRequest(kind: 'text' | 'stream', config: LlmClientConfig, request: LlmTextRequest): void {
  console.log('[LLMClient] request', {
    kind,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: maskApiKey(config.apiKey),
    temperature: request.temperature ?? 0.7,
  })
}

function logLlmSuccess(kind: 'text' | 'stream', config: LlmClientConfig, text: string): void {
  console.log('[LLMClient] success', {
    kind,
    baseUrl: config.baseUrl,
    model: config.model,
    chars: text.length,
  })
}

function logLlmFailure(kind: 'text' | 'stream', config: LlmClientConfig, reason: string): void {
  console.log('[LLMClient] failure', {
    kind,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: maskApiKey(config.apiKey),
    reason,
  })
}

export function getSharedLlmConfig(): LlmClientConfig {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY?.trim()
  const baseUrl = (
    import.meta.env.VITE_LLM_BASE_URL?.trim() || 'https://api.deepseek.com'
  ).replace(/\/+$/, '')
  const model = import.meta.env.VITE_LLM_MODEL?.trim() || 'deepseek-chat'

  return {
    apiKey,
    baseUrl,
    model,
  }
}

export function isLlmConfigured(config = getSharedLlmConfig()): boolean {
  return Boolean(config.apiKey)
}

export async function generateLlmText(
  request: LlmTextRequest,
  config = getSharedLlmConfig(),
): Promise<LlmTextResponse> {
  logLlmRequest('text', config, request)

  if (!config.apiKey) {
    logLlmFailure('text', config, 'llm_missing_api_key')
    throw new Error('llm_missing_api_key')
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: request.temperature ?? 0.7,
      messages: [
        {
          role: 'system',
          content: request.systemPrompt,
        },
        {
          role: 'user',
          content: request.userPrompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    logLlmFailure('text', config, `llm_request_failed:${response.status}`)
    throw new Error(`llm_request_failed:${response.status}`)
  }

  const json = await response.json() as OpenAiChatResponse
  const text = json.choices?.[0]?.message?.content?.trim()

  if (!text) {
    logLlmFailure('text', config, 'llm_empty_response')
    throw new Error('llm_empty_response')
  }

  logLlmSuccess('text', config, text)

  return {
    text,
    model: config.model,
  }
}

export async function streamLlmText(
  request: LlmTextRequest,
  handlers: LlmTextStreamHandlers = {},
  config = getSharedLlmConfig(),
): Promise<LlmTextResponse> {
  logLlmRequest('stream', config, request)

  if (!config.apiKey) {
    logLlmFailure('stream', config, 'llm_missing_api_key')
    throw new Error('llm_missing_api_key')
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: request.temperature ?? 0.7,
      stream: true,
      messages: [
        {
          role: 'system',
          content: request.systemPrompt,
        },
        {
          role: 'user',
          content: request.userPrompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    logLlmFailure('stream', config, `llm_request_failed:${response.status}`)
    throw new Error(`llm_request_failed:${response.status}`)
  }

  if (!response.body) {
    logLlmFailure('stream', config, 'llm_stream_missing_body')
    throw new Error('llm_stream_missing_body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith('data:')) continue

      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue

      const json = JSON.parse(payload) as OpenAiChatStreamChunk
      const chunk = json.choices?.[0]?.delta?.content ?? ''
      if (!chunk) continue

      text += chunk
      handlers.onChunk?.(chunk, text)
    }

    if (done) break
  }

  const finalText = text.trim()
  if (!finalText) {
    logLlmFailure('stream', config, 'llm_empty_response')
    throw new Error('llm_empty_response')
  }

  logLlmSuccess('stream', config, finalText)

  return {
    text: finalText,
    model: config.model,
  }
}
