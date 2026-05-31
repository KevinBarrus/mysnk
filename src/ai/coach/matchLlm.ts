import { buildMatchReviewInput, getMatchReviewTemplate } from '@/ai/coach/match'
import { buildMatchReviewUserPrompt } from '@/ai/coach/matchPrompt'
import { coachPromptAssets } from '@/ai/coach/assets'
import { isLlmConfigured, streamLlmText } from '@/ai/llm'
import type {
  CoachPersona,
  CoachSessionSource,
  PracticeReviewResult,
  PracticeReviewStreamHandlers,
} from '@/ai/coach/types'

export async function streamMatchReview(
  session: CoachSessionSource,
  opponentName: string,
  handlers: PracticeReviewStreamHandlers = {},
  persona: CoachPersona = 'strict',
): Promise<PracticeReviewResult> {
  const fallback = getMatchReviewTemplate(session, opponentName, persona)
  const reviewInput = buildMatchReviewInput(session, opponentName)
  const prompt = buildMatchReviewUserPrompt(reviewInput, persona)

  if (!isLlmConfigured()) {
    const fallbackResult: PracticeReviewResult = {
      text: fallback?.text ?? `这局和 ${opponentName} 打完，先把送分点和节奏失控的问题记下来，下一局别再重复。`,
      source: 'template',
      promptUsed: prompt,
      fallbackReason: 'missing_api_key',
    }
    handlers.onError?.(fallbackResult)
    return fallbackResult
  }

  try {
    const result = await streamLlmText(
      {
        systemPrompt: coachPromptAssets.systemPromptSkeleton,
        userPrompt: prompt,
        temperature: 0.85,
      },
      {
        onChunk: (chunk, fullText) => {
          handlers.onChunk?.(chunk, fullText)
        },
      },
    )

    const finalResult: PracticeReviewResult = {
      text: result.text,
      source: 'llm',
      promptUsed: prompt,
    }
    handlers.onDone?.(finalResult)
    return finalResult
  } catch (error) {
    const fallbackResult: PracticeReviewResult = {
      text: fallback?.text ?? `这局和 ${opponentName} 打完，先把送分点和节奏失控的问题记下来，下一局别再重复。`,
      source: 'template',
      promptUsed: prompt,
      fallbackReason: error instanceof Error ? error.message : 'llm_unknown_error',
    }
    handlers.onError?.(fallbackResult)
    return fallbackResult
  }
}
