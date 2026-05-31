import { coachPromptAssets } from '@/ai/coach/assets'
import type { CoachPersona, CoachShotSource } from '@/ai/coach/types'

export function buildPracticeInstantUserPrompt(
  shot: CoachShotSource,
  persona: CoachPersona = 'strict',
): string {
  const personaGuide = coachPromptAssets.personas[persona]

  return [
    'You are generating instant snooker coaching feedback in Simplified Chinese.',
    `Persona style: ${personaGuide.coreStyle}`,
    persona === 'strict'
      ? 'Strict persona rule: when the player wastes an easy chance or makes a cheap foul, be harsh, sarcastic, and pressuring. Mild profanity is allowed if it adds coaching pressure.'
      : 'Calm persona rule: stay composed, precise, and professional.',
    'Task:',
    '- Write exactly one short sentence.',
    '- React only to this single shot.',
    '- If the shot was an easy miss, make that explicit.',
    '- If the shot was a hard miss, reduce the blame and focus on adjustment.',
    '- If the shot was a foul, point out the basic error and immediate consequence.',
    '- If the shot scored, praise one concrete positive.',
    '- Do not invent mechanics, tactics, or table details not present in the data.',
    '',
    'Structured shot summary:',
    `shot=${shot.shotIndex}`,
    `mode=${shot.mode}`,
    `actor=${shot.actor}`,
    `outcome=${shot.outcome}`,
    `scored=${shot.scoredPoints}`,
    `foul=${shot.foul ? 'yes' : 'no'}`,
    `foulMessage=${shot.foul?.message ?? 'none'}`,
    `legalFirstHit=${shot.hitLegalFirstTarget ? 'yes' : 'no'}`,
    `simplePotChance=${shot.simplePotChance}`,
    `simplePotMiss=${shot.simplePotMiss}`,
    `difficulty=${shot.potDifficulty}`,
    `cueBall=${shot.cueBallPositionResult}`,
    `nextChance=${shot.nextShotChance}`,
    `breakAfter=${shot.after.breakScore}`,
    '',
    'Return only the final feedback sentence.',
  ].join('\n')
}
