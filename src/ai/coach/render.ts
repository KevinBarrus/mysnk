import { coachPromptAssets } from '@/ai/coach/assets'
import { evaluateSessionForCoach, evaluateShotForCoach } from '@/ai/coach/evaluate'
import type {
  CoachFeedbackDecision,
  CoachPersona,
  CoachRenderedFeedback,
  CoachSessionSource,
  CoachShotSource,
  CoachTemplateEntry,
} from '@/ai/coach/types'

function pickTemplateEntry(
  persona: CoachPersona,
  decision: CoachFeedbackDecision,
): CoachTemplateEntry {
  const entries = coachPromptAssets.templates[persona][decision.scene]
  const exact = entries.find(
    (entry) => entry.dimension === decision.dimension && entry.sentiment === decision.sentiment,
  )
  if (exact) return exact

  const dimensionOnly = entries.find((entry) => entry.dimension === decision.dimension)
  if (dimensionOnly) return dimensionOnly

  return entries[0]
}

function pickLine(lines: string[], seed: number): string {
  if (lines.length === 0) return ''
  const index = Math.abs(seed) % lines.length
  return lines[index]
}

function renderDecision(
  decision: CoachFeedbackDecision,
  persona: CoachPersona,
  seed: number,
): CoachRenderedFeedback {
  const entry = pickTemplateEntry(persona, decision)
  const text = pickLine(entry.lines, seed)

  return {
    ...decision,
    persona,
    text,
  }
}

export function renderShotCoachFeedback(
  shot: CoachShotSource,
  persona: CoachPersona = 'strict',
): CoachRenderedFeedback | null {
  const decision = evaluateShotForCoach(shot)
  if (!decision) return null
  return renderDecision(decision, persona, shot.shotIndex)
}

export function renderSessionCoachFeedback(
  session: CoachSessionSource,
  persona: CoachPersona = 'calm',
): CoachRenderedFeedback | null {
  const decision = evaluateSessionForCoach(session)
  if (!decision) return null
  return renderDecision(decision, persona, session.shotCount + session.totalScore)
}
