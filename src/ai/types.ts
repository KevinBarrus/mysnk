export type TriggerType =
  | 'pre_shot'
  | 'post_pot'
  | 'post_miss'
  | 'clutch_moment'
  | 'under_pressure'
  | 'opponent_error'
  | 'self_error'

export type CommentarySource = 'template' | 'llm'

export type ChanceQuality = 'easy' | 'medium' | 'hard' | 'unknown'
export type TableIntent = 'attack' | 'control' | 'escape' | 'unknown'
export type ShotOutcome = 'pot' | 'miss' | 'foul' | 'safety' | 'unknown'
export type FramePhase = 'opening' | 'mid' | 'endgame'
export type PressureLevel = 'low' | 'medium' | 'high'
export type Momentum = 'rising' | 'stable' | 'slipping'

export interface ShotSummary {
  legalTarget?: string
  pottedBalls?: string[]
  scored?: number
  foul?: boolean
  foulReason?: string
  shotOutcome?: ShotOutcome
  chanceQuality?: ChanceQuality
  tableIntent?: TableIntent
}

export interface MatchContext {
  scoreGap?: number
  framePhase?: FramePhase
  pressureLevel?: PressureLevel
  momentum?: Momentum
  isLeading?: boolean
  isTrailing?: boolean
  isClutch?: boolean
}

export interface CommentaryRequest {
  personaId: string
  trigger: TriggerType
  shot?: ShotSummary
  match?: MatchContext
}

export interface CommentaryAsset {
  text: string
  source: CommentarySource
  tags: string[]
}

export interface PersonaProfile {
  playingStyle: string
  technicalBias: string
  mentalTone: string
  riskAppetite: 'low' | 'medium' | 'high'
  tempo: string
}

export interface VoiceGuide {
  sentenceStyle: string
  vocabulary: string[]
  forbiddenPatterns: string[]
  emotionalCeiling: 'low' | 'medium' | 'high'
}

export interface SituationStyle {
  whenLeading: string
  whenTrailing: string
  whenOpponentMisses: string
  whenSelfMisses: string
  whenClutchPot: string
  whenInTrouble: string
}

export type TemplateBank = Record<TriggerType, string[]>

export interface LlmPromptAsset {
  systemPersona: string
  styleRules: string[]
  fewShotToneExamples: string[]
  fallbackTemplates: TemplateBank
}

export interface PersonaAsset {
  id: string
  displayName: string
  oneLiner: string
  profile: PersonaProfile
  voiceGuide: VoiceGuide
  situationStyle: SituationStyle
  templateBank: TemplateBank
  llmPromptAsset: LlmPromptAsset
}

export interface CommentaryGenerationAdvice {
  prefer: CommentarySource
  reason: string
}
