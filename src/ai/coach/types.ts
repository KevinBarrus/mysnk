import type { SessionSummary, ShotSummary } from '@/summary/types'

export type CoachPersona = 'strict' | 'calm'

export type CoachScene =
  | 'instant_praise'
  | 'instant_taunt'
  | 'foul_alert'
  | 'easy_miss'
  | 'session_review'

export type CoachDimension =
  | 'attack_result'
  | 'shot_selection'
  | 'pot_accuracy'
  | 'cue_control'
  | 'foul_awareness'
  | 'scoring_run'

export type CoachSentiment = 'positive' | 'neutral' | 'negative'

export type CoachRenderMode = 'template' | 'llm'

export interface CoachSceneStyleRule {
  maxSentences: number
  target: string
  focus: string
  avoid: string[]
}

export interface CoachPersonaGuide {
  coreStyle: string
  strengths: CoachScene[]
  avoid: string[]
}

export interface CoachTemplateEntry {
  dimension: CoachDimension
  sentiment: CoachSentiment
  lines: string[]
}

export interface CoachPromptAssetSet {
  systemPromptSkeleton: string
  sceneRules: Record<CoachScene, CoachSceneStyleRule>
  personas: Record<CoachPersona, CoachPersonaGuide>
  templates: Record<CoachPersona, Record<CoachScene, CoachTemplateEntry[]>>
}

export interface CoachRoutingPolicy {
  localTemplateScenes: CoachScene[]
  llmPreferredScenes: CoachScene[]
  llmOptionalScenes: CoachScene[]
}

export type CoachShotSource = ShotSummary
export type CoachSessionSource = SessionSummary
