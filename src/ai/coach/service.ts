import { buildPracticeReviewInput, getPracticeInstantFeedback } from '@/ai/coach/practice'
import type {
  CoachPersona,
  CoachRenderedFeedback,
  CoachSessionSource,
  CoachShotSource,
  PracticeReviewInput,
} from '@/ai/coach/types'

export interface PracticeCoachInstantResult {
  feedback: CoachRenderedFeedback | null
  reviewInput: PracticeReviewInput | null
}

export function getPracticeCoachInstantResult(
  shot: CoachShotSource,
  session?: CoachSessionSource | null,
  persona: CoachPersona = 'strict',
): PracticeCoachInstantResult {
  const feedback = getPracticeInstantFeedback(shot, persona)
  const reviewInput = session ? buildPracticeReviewInput(session) : null

  return {
    feedback,
    reviewInput,
  }
}
