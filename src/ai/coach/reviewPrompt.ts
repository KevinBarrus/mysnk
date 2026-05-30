import { coachPromptAssets } from '@/ai/coach/assets'
import type { CoachPersona, PracticeReviewInput } from '@/ai/coach/types'

export function buildPracticeReviewUserPrompt(
  review: PracticeReviewInput,
  persona: CoachPersona = 'calm',
): string {
  const personaGuide = coachPromptAssets.personas[persona]
  const recentShots = review.recentShots.map((shot) => {
    return [
      `shot=${shot.shotIndex}`,
      `outcome=${shot.outcome}`,
      `scored=${shot.scoredPoints}`,
      `foul=${shot.foul ? 'yes' : 'no'}`,
      `foulMessage=${shot.foulMessage ?? 'none'}`,
      `legalFirstHit=${shot.hitLegalFirstTarget ? 'yes' : 'no'}`,
      `breakAfter=${shot.breakScoreAfterShot}`,
      `cueBall=${shot.cueBallPositionResult}`,
      `nextChance=${shot.nextShotChance}`,
    ].join(', ')
  }).join('\n')

  return [
    'You are generating a short snooker practice review in Simplified Chinese.',
    `Persona style: ${personaGuide.coreStyle}`,
    persona === 'strict'
      ? 'Strict persona rule: when the player wastes easy chances or commits cheap fouls, you should sound harsh, contemptuous, and pressuring. You may use mild profanity, but keep it purposeful and not repetitive.'
      : 'Calm persona rule: stay composed, precise, and professional.',
    'Task:',
    '- Write a short coaching review for a practice segment.',
    '- Keep it to 2 or 3 sentences.',
    '- Mention one clear strength or one clear problem, then one next-step suggestion.',
    '- Do not mention hidden physics or invent missing facts.',
    '- Sound like a coach, not a commentator.',
    '- In strict mode, if simple misses are a clear pattern, make that the central attack point.',
    '',
    'Structured practice summary:',
    `mode=${review.mode}`,
    `shotCount=${review.shotCount}`,
    `totalScore=${review.totalScore}`,
    `highestBreak=${review.highestBreak}`,
    `foulCount=${review.foulCount}`,
    `potCount=${review.potCount}`,
    `legalFirstHitCount=${review.legalFirstHitCount}`,
    `simplePotMissCount=${review.simplePotMissCount}`,
    `goodCueBallPositionCount=${review.goodCueBallPositionCount}`,
    `nextChanceCreatedCount=${review.nextChanceCreatedCount}`,
    'recentShots:',
    recentShots || 'none',
    '',
    'Return only the final review text.',
  ].join('\n')
}
