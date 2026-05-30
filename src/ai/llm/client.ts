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
  if (!config.apiKey) {
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
    throw new Error(`llm_request_failed:${response.status}`)
  }

  const json = await response.json() as OpenAiChatResponse
  const text = json.choices?.[0]?.message?.content?.trim()

  if (!text) {
    throw new Error('llm_empty_response')
  }

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
  if (!config.apiKey) {
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
    throw new Error(`llm_request_failed:${response.status}`)
  }

  if (!response.body) {
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
    throw new Error('llm_empty_response')
  }

  return {
    text: finalText,
    model: config.model,
  }
}
