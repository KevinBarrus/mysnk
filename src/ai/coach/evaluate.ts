import { getPreferredRenderMode } from '@/ai/coach/policy'
import type {
  CoachFeedbackDecision,
  CoachSessionSource,
  CoachShotSource,
} from '@/ai/coach/types'

export function evaluateShotForCoach(shot: CoachShotSource): CoachFeedbackDecision | null {
  if (shot.actor !== 'player') return null

  if (shot.foul) {
    return {
      scene: 'foul_alert',
      dimension: 'foul_awareness',
      sentiment: 'negative',
      reasonTag: shot.foul.type,
      renderMode: getPreferredRenderMode('foul_alert'),
    }
  }

  if (shot.simplePotMiss === true) {
    return {
      scene: 'easy_miss',
      dimension: 'pot_accuracy',
      sentiment: 'negative',
      reasonTag: 'simple_pot_miss',
      renderMode: getPreferredRenderMode('easy_miss'),
    }
  }

  if (shot.outcome === 'score') {
    const dimension = shot.cueBallPositionResult === 'ideal'
      ? 'cue_control'
      : shot.scoredPoints >= 2 || shot.after.breakScore >= 10
        ? 'scoring_run'
        : 'attack_result'

    return {
      scene: 'instant_praise',
      dimension,
      sentiment: 'positive',
      reasonTag: 'scored',
      renderMode: getPreferredRenderMode('instant_praise'),
    }
  }

  if (shot.outcome === 'miss') {
    const dimension = shot.hitLegalFirstTarget ? 'attack_result' : 'shot_selection'
    const reasonTag = shot.hitLegalFirstTarget ? 'missed_conversion' : 'poor_selection'

    return {
      scene: 'instant_taunt',
      dimension,
      sentiment: 'negative',
      reasonTag,
      renderMode: getPreferredRenderMode('instant_taunt'),
    }
  }

  return null
}

export function evaluateSessionForCoach(session: CoachSessionSource): CoachFeedbackDecision | null {
  if (session.shotCount === 0) return null

  if (session.foulCount >= 2 && session.foulCount >= session.shotCount / 4) {
    return {
      scene: 'session_review',
      dimension: 'foul_awareness',
      sentiment: 'negative',
      reasonTag: 'foul_heavy_session',
      renderMode: getPreferredRenderMode('session_review'),
    }
  }

  if (session.simplePotMissCount >= 2) {
    return {
      scene: 'session_review',
      dimension: 'pot_accuracy',
      sentiment: 'negative',
      reasonTag: 'easy_chances_wasted',
      renderMode: getPreferredRenderMode('session_review'),
    }
  }

  if (session.nextChanceCreatedCount >= Math.max(2, Math.floor(session.shotCount / 3))) {
    return {
      scene: 'session_review',
      dimension: 'scoring_run',
      sentiment: 'positive',
      reasonTag: 'repeatable_scoring_flow',
      renderMode: getPreferredRenderMode('session_review'),
    }
  }

  if (session.goodCueBallPositionCount * 2 < session.shotCount) {
    return {
      scene: 'session_review',
      dimension: 'cue_control',
      sentiment: 'negative',
      reasonTag: 'cue_control_breakdown',
      renderMode: getPreferredRenderMode('session_review'),
    }
  }

  return {
    scene: 'session_review',
    dimension: 'attack_result',
    sentiment: 'neutral',
    reasonTag: 'general_conversion_review',
    renderMode: getPreferredRenderMode('session_review'),
  }
}
