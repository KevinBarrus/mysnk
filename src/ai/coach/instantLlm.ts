import { coachPromptAssets } from '@/ai/coach/assets'
import { getPracticeInstantFeedback } from '@/ai/coach/practice'
import { buildPracticeInstantUserPrompt } from '@/ai/coach/instantPrompt'
import { generateLlmText, isLlmConfigured } from '@/ai/llm'
import type { CoachPersona, CoachShotSource, PracticeReviewResult } from '@/ai/coach/types'

export async function generatePracticeInstantFeedback(
  shot: CoachShotSource,
  persona: CoachPersona = 'strict',
): Promise<PracticeReviewResult> {
  const fallback = getPracticeInstantFeedback(shot, persona)
  const prompt = buildPracticeInstantUserPrompt(shot, persona)

  if (!isLlmConfigured()) {
    return {
      text: fallback?.text ?? '先把这一杆的基本完成度守住。',
      source: 'template',
      promptUsed: prompt,
      fallbackReason: 'missing_api_key',
    }
  }

  try {
    const result = await generateLlmText({
      systemPrompt: coachPromptAssets.systemPromptSkeleton,
      userPrompt: prompt,
      temperature: 0.85,
    })

    return {
      text: result.text,
      source: 'llm',
      promptUsed: prompt,
    }
  } catch (error) {
    return {
      text: fallback?.text ?? '先把这一杆的基本完成度守住。',
      source: 'template',
      promptUsed: prompt,
      fallbackReason: error instanceof Error ? error.message : 'llm_unknown_error',
    }
  }
}
