import { buildLlmSessionDigest, buildLlmShotDigest, buildLlmTableDigest } from '@/ai/llm/buildLlmShotDigest'
import type { LlmNarrationRequest } from '@/ai/llm/types'
import type { SessionSummary, ShotSummary, TableSnapshot } from '@/summary/types'

export function buildLlmNarrationRequest(params: {
  scene: LlmNarrationRequest['scene']
  personaId: string
  shot?: ShotSummary
  table?: TableSnapshot
  session?: SessionSummary
  recentShots?: ShotSummary[]
  style?: Partial<LlmNarrationRequest['style']>
}): LlmNarrationRequest {
  const shotDigest = params.shot ? buildLlmShotDigest(params.shot) : undefined
  const sessionDigest = params.session ? buildLlmSessionDigest(params.session) : undefined

  const fallbackFact = shotDigest?.after
    ?? (params.table ? {
      mode: params.table.mode,
      actor: params.table.actor,
      currentActor: params.table.currentActor,
      phase: params.table.phase,
      ballOn: params.table.ballOn,
      redsRemaining: params.table.redsRemaining,
      score: {
        player: params.table.score.player,
        ai: params.table.score.ai,
      },
      breakScore: params.table.breakScore,
    } : sessionDigest?.recentShots.at(-1)?.after)

  if (!fallbackFact) {
    throw new Error('llm_narration_request_missing_fact_context')
  }

  return {
    scene: params.scene,
    personaId: params.personaId,
    fact: fallbackFact,
    shot: shotDigest,
    table: params.table
      ? buildLlmTableDigest(params.table, params.shot?.after.cueBallEndPosition ?? null)
      : undefined,
    session: sessionDigest,
    recentShots: params.recentShots?.map(buildLlmShotDigest),
    style: {
      maxSentences: params.style?.maxSentences ?? 2,
      tone: params.style?.tone ?? 'focused, concise, competitive',
      language: params.style?.language ?? 'zh-CN',
    },
  }
}
