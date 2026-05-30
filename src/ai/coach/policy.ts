import type { CoachRenderMode, CoachRoutingPolicy, CoachScene } from '@/ai/coach/types'

export const coachRoutingPolicy: CoachRoutingPolicy = {
  localTemplateScenes: ['instant_praise', 'instant_taunt', 'foul_alert', 'easy_miss'],
  llmPreferredScenes: ['session_review'],
  llmOptionalScenes: ['instant_praise', 'instant_taunt'],
}

export function getPreferredRenderMode(scene: CoachScene): CoachRenderMode {
  if (coachRoutingPolicy.localTemplateScenes.includes(scene)) return 'template'
  if (coachRoutingPolicy.llmPreferredScenes.includes(scene)) return 'llm'
  return 'template'
}
