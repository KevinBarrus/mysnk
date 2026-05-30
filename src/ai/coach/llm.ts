import { buildPracticeReviewInput, getPracticeReviewTemplate } from '@/ai/coach/practice'
import { buildPracticeReviewUserPrompt } from '@/ai/coach/reviewPrompt'
import { coachPromptAssets } from '@/ai/coach/assets'
import { generateLlmText, isLlmConfigured, streamLlmText } from '@/ai/llm'
import type {
  CoachPersona,
  CoachSessionSource,
  PracticeReviewResult,
  PracticeReviewStreamHandlers,
} from '@/ai/coach/types'

export async function generatePracticeReview(
  session: CoachSessionSource,
  persona: CoachPersona = 'calm',
): Promise<PracticeReviewResult> {
  const fallback = getPracticeReviewTemplate(session, persona)
  const reviewInput = buildPracticeReviewInput(session)
  const prompt = buildPracticeReviewUserPrompt(reviewInput, persona)

  if (!isLlmConfigured()) {
    return {
      text: fallback?.text ?? '这段训练已经有内容了，下一步先把稳定性收住。',
      source: 'template',
      promptUsed: prompt,
      fallbackReason: 'missing_api_key',
    }
  }

  try {
    const result = await generateLlmText({
      systemPrompt: coachPromptAssets.systemPromptSkeleton,
      userPrompt: prompt,
      temperature: 0.8,
    })

    return {
      text: result.text,
      source: 'llm',
      promptUsed: prompt,
    }
  } catch (error) {
    return {
      text: fallback?.text ?? '这段训练已经有内容了，下一步先把稳定性收住。',
      source: 'template',
      promptUsed: prompt,
      fallbackReason: error instanceof Error ? error.message : 'llm_unknown_error',
    }
  }
}

export async function streamPracticeReview(
  session: CoachSessionSource,
  handlers: PracticeReviewStreamHandlers = {},
  persona: CoachPersona = 'calm',
): Promise<PracticeReviewResult> {
  const fallback = getPracticeReviewTemplate(session, persona)
  const reviewInput = buildPracticeReviewInput(session)
  const prompt = buildPracticeReviewUserPrompt(reviewInput, persona)

  if (!isLlmConfigured()) {
    const fallbackResult: PracticeReviewResult = {
      text: fallback?.text ?? '这段训练已经有内容了，下一步先把稳定性收住。',
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
      text: fallback?.text ?? '这段训练已经有内容了，下一步先把稳定性收住。',
      source: 'template',
      promptUsed: prompt,
      fallbackReason: error instanceof Error ? error.message : 'llm_unknown_error',
    }
    handlers.onError?.(fallbackResult)
    return fallbackResult
  }
}
