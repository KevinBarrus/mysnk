import { coachPromptAssets } from '@/ai/coach/assets'
import type { CoachPersona, MatchReviewInput } from '@/ai/coach/types'

export function buildMatchReviewUserPrompt(
  review: MatchReviewInput,
  persona: CoachPersona = 'strict',
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
      `difficulty=${shot.potDifficulty}`,
      `cueBall=${shot.cueBallPositionResult}`,
      `nextChance=${shot.nextShotChance}`,
    ].join(', ')
  }).join('\n')

  return [
    'You are generating a short snooker match review in Simplified Chinese.',
    `Persona style: ${personaGuide.coreStyle}`,
    persona === 'strict'
      ? 'Strict persona rule: be sharp and blunt when the player wastes control or gives away the table, but keep it analytical.'
      : 'Calm persona rule: stay composed, precise, and professional.',
    'Task:',
    '- Write a short post-match coaching review for the player.',
    '- Keep it to 3 or 4 sentences.',
    '- Sentence 1-2: summarize the player in this match.',
    '- Sentence 3-4: analyze the opponent style and how the player should respond next time.',
    '- Mention the opponent by name when useful.',
    '- Do not invent hidden events or physics.',
    '- Sound like a coach, not a commentator.',
    '',
    'Structured match summary:',
    `mode=${review.mode}`,
    `opponentName=${review.opponentName}`,
    `playerScore=${review.playerScore}`,
    `aiScore=${review.aiScore}`,
    `shotCount=${review.shotCount}`,
    `highestBreak=${review.highestBreak}`,
    `playerHighestBreak=${review.playerHighestBreak}`,
    `aiHighestBreak=${review.aiHighestBreak}`,
    `foulCount=${review.foulCount}`,
    `playerFoulCount=${review.playerFoulCount}`,
    `aiFoulCount=${review.aiFoulCount}`,
    `potCount=${review.potCount}`,
    `playerPotCount=${review.playerPotCount}`,
    `aiPotCount=${review.aiPotCount}`,
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
