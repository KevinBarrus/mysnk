import { COMMENTARY_GENERATION_GUIDE, PERSONA_ASSETS } from '@/ai/personas'
import { buildLlmNarrationRequest, generateLlmText, isLlmConfigured } from '@/ai/llm'
import type { MatchContext, PersonaAsset } from '@/ai/types'
import type { CareerRankingEntry } from '@/data/careerRanking'
import type { SessionSummary, ShotSummary, TableSnapshot } from '@/summary/types'

export interface AiInnerMonologueResult {
  text: string
  source: 'llm' | 'template'
  personaId: string
  promptUsed?: string
  fallbackReason?: string
}

function choosePersonaId(challenger: Pick<CareerRankingEntry, 'displayName' | 'challengeTier'> | null | undefined): string {
  const name = challenger?.displayName ?? ''
  if (/ronnie/i.test(name)) return 'rocket'
  if (/selby/i.test(name)) return 'granite'
  if (/zhao/i.test(name)) return 'ace'
  if (/trump/i.test(name)) return 'crown'
  if (/ding/i.test(name)) return 'ice'

  switch (challenger?.challengeTier) {
    case 'A':
      return 'crown'
    case 'B':
      return 'granite'
    case 'D':
      return 'ice'
    case 'C':
    default:
      return 'ice'
  }
}

function inferMatchContext(score: { player: number; ai: number }, redsRemaining: number, scoredPoints?: number): MatchContext {
  const scoreGap = score.ai - score.player
  return {
    scoreGap,
    framePhase: redsRemaining >= 10 ? 'opening' : redsRemaining >= 4 ? 'mid' : 'endgame',
    pressureLevel: redsRemaining <= 3 || Math.abs(scoreGap) <= 7 ? 'high' : Math.abs(scoreGap) <= 20 ? 'medium' : 'low',
    momentum: scoredPoints && scoredPoints > 0 ? 'rising' : 'stable',
    isLeading: scoreGap > 0,
    isTrailing: scoreGap < 0,
    isClutch: redsRemaining <= 3 || Math.abs(scoreGap) <= 7,
  }
}

function chooseTemplateTrigger(match: MatchContext, shot?: ShotSummary): keyof PersonaAsset['templateBank'] {
  if (shot?.foul) return 'under_pressure'
  if (shot?.turnChanged) return 'opponent_error'
  if (match.isClutch) return 'clutch_moment'
  if (match.isTrailing || match.pressureLevel === 'high') return 'under_pressure'
  return 'pre_shot'
}

function pickTemplateLine(persona: PersonaAsset, trigger: keyof PersonaAsset['templateBank'], seed: number): string {
  const lines = persona.templateBank[trigger]
  if (!lines || lines.length === 0) return '先把这一杆做干净。'
  return lines[Math.abs(seed) % lines.length] ?? lines[0]
}

function buildUserPrompt(params: {
  persona: PersonaAsset
  scene: string
  match: MatchContext
  shot?: ShotSummary
  table?: TableSnapshot
  session?: SessionSummary
}): string {
  return [
    '请生成这位斯诺克球员此刻的一句心理活动。',
    '输出要求：只输出一句中文；不要加引号；不要加名字前缀；不要分段；不要解释规则。',
    `球员：${params.persona.displayName}`,
    `人物风格：${params.persona.oneLiner}`,
    `当前场景：${params.scene}`,
    `比赛语境：${JSON.stringify(params.match)}`,
    params.shot ? `上一杆结果：${JSON.stringify({
      actor: params.shot.actor,
      outcome: params.shot.outcome,
      scoredPoints: params.shot.scoredPoints,
      foul: params.shot.foul?.message ?? null,
      turnChanged: params.shot.turnChanged,
      after: {
        phase: params.shot.after.phase,
        ballOn: params.shot.after.ballOn,
        redsRemaining: params.shot.after.redsRemaining,
        score: {
          player: params.shot.after.playerScore,
          ai: params.shot.after.aiScore,
        },
        breakScore: params.shot.after.breakScore,
      },
    })}` : '上一杆结果：无',
    params.table ? `当前台面摘要：${JSON.stringify({
      phase: params.table.phase,
      ballOn: params.table.ballOn,
      redsRemaining: params.table.redsRemaining,
      score: params.table.score,
      breakScore: params.table.breakScore,
    })}` : '当前台面摘要：无',
    '语气要符合该球员人设，像他正在脑内自言自语。',
    '优先表达：这一杆怎么处理、是否要进攻、是否要带防、是否要回应对手、是否要先稳住。',
  ].join('\n')
}

export async function generateAiInnerMonologue(params: {
  challenger: Pick<CareerRankingEntry, 'displayName' | 'challengeTier'> | null | undefined
  shot?: ShotSummary
  table?: TableSnapshot
  session?: SessionSummary
  recentShots?: ShotSummary[]
}): Promise<AiInnerMonologueResult> {
  const personaId = choosePersonaId(params.challenger)
  const persona = PERSONA_ASSETS[personaId] ?? PERSONA_ASSETS.ice
  const request = buildLlmNarrationRequest({
    scene: 'ai_pre_turn',
    personaId,
    shot: params.shot,
    table: params.table,
    session: params.session,
    recentShots: params.recentShots,
    style: {
      maxSentences: 1,
      tone: `${persona.profile.mentalTone} ${persona.situationStyle.whenInTrouble}`,
      language: 'zh-CN',
    },
  })
  const match = inferMatchContext(request.fact.score, request.fact.redsRemaining, request.shot?.scoredPoints)
  const trigger = chooseTemplateTrigger(match, params.shot)
  const fallback = pickTemplateLine(persona, trigger, params.shot?.shotIndex ?? request.fact.score.ai + request.fact.score.player)
  const prompt = buildUserPrompt({
    persona,
    scene: request.scene,
    match,
    shot: params.shot,
    table: params.table,
    session: params.session,
  })

  console.log('[AiInnerMonologue] start', {
    personaId,
    challenger: params.challenger?.displayName ?? null,
    score: request.fact.score,
    redsRemaining: request.fact.redsRemaining,
    hasShot: Boolean(params.shot),
    hasTable: Boolean(params.table),
    hasSession: Boolean(params.session),
  })

  if (!isLlmConfigured()) {
    console.log('[AiInnerMonologue] fallback', {
      source: 'template',
      fallbackReason: 'missing_api_key',
      personaId,
    })
    return {
      text: fallback,
      source: 'template',
      personaId,
      promptUsed: prompt,
      fallbackReason: 'missing_api_key',
    }
  }

  try {
    const result = await generateLlmText({
      systemPrompt: [
        persona.llmPromptAsset.systemPersona,
        ...persona.llmPromptAsset.styleRules,
        `偏好建议：${COMMENTARY_GENERATION_GUIDE.pre_shot.reason}`,
      ].join('\n'),
      userPrompt: prompt,
      temperature: 0.95,
    })

    console.log('[AiInnerMonologue] done', {
      source: 'llm',
      fallbackReason: null,
      personaId,
    })
    return {
      text: result.text,
      source: 'llm',
      personaId,
      promptUsed: prompt,
    }
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : 'llm_unknown_error'
    console.log('[AiInnerMonologue] fallback', {
      source: 'template',
      fallbackReason,
      personaId,
    })
    return {
      text: fallback,
      source: 'template',
      personaId,
      promptUsed: prompt,
      fallbackReason,
    }
  }
}
