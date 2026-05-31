import { useEffect, useRef, useState } from 'react'
import {
  generateAiInnerMonologue,
  getAiAbilityProfile,
} from '@/ai'
import {
  generatePracticeInstantFeedback,
  getPracticeInstantFeedback,
  streamMatchReview,
  streamPracticeReview,
} from '@/ai/coach'
import { SnookerGame, type AiTurnResolvedEvent, type GamePhase } from '@/game/SnookerGame'
import { Scoreboard } from '@/components/Scoreboard'
import {
  BEAT_AI_UNLOCK_PRIZE_MONEY,
  CAREER_RANKING,
  DEV_PLAYER_PROFILE,
  type CareerRankingEntry,
} from '@/data/careerRanking'
import type { FoulInfo, RulesState } from '@/rules/SnookerRules'
import { simulatePracticeSession } from '@/summary/simulatePracticeSession'
import { simulateMatchSession } from '@/summary/simulateMatchSession'
import type { SessionSummary, ShotSummary, TableSnapshot } from '@/summary/types'

type AppView = 'guest' | 'menu' | 'practise' | 'beat-ai'
type PauseMenuView = 'menu' | 'controls'
type SimulatedResultMode = 'practice' | 'match'

interface MatchSettlementBreakdown {
  winPrize: number
  breakPrize: number
  totalPrize: number
  resultLabel: string
}

const MENU_BUTTON_FONT_STACK = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif'
const HUD_FONT_STACK = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif'

const FOUL_LABEL: Record<string, string> = {
  whitePotted: 'FOUL',
  wrongBallFirst: 'FOUL',
  noBallHit: 'MISS',
  colorPottedOnRed: 'FOUL',
}

const INITIAL_RULES_STATE: RulesState = {
  playerScore: 0,
  aiScore: 0,
  breakScore: 0,
  ballOn: 'red',
  redsRemaining: 15,
  phase: 'reds',
  currentActor: 'player',
}

function formatPrizeMoney(value: number): string {
  return `${value.toLocaleString('en-GB')} £`
}

function getPracticeReward(highestBreak: number): number {
  if (highestBreak >= 147) return 100000
  if (highestBreak >= 100) return 5000
  if (highestBreak >= 50) return 500
  if (highestBreak >= 30) return 300
  return 0
}

function getBeatAiWinReward(rank: number): number {
  if (rank >= 10 && rank <= 15) return 100000
  if (rank >= 5 && rank <= 10) return 200000
  if (rank >= 1 && rank <= 5) return 200000 + (5 - rank) * 50000
  return 0
}

function buildPracticeSessionKey(session: SessionSummary): string {
  return [
    session.mode,
    session.shotCount,
    session.totalScore,
    session.highestBreak,
    session.foulCount,
    session.potCount,
    session.legalFirstHitCount,
    session.simplePotMissCount,
    session.goodCueBallPositionCount,
    session.nextChanceCreatedCount,
  ].join(':')
}

function getMatchSettlementBreakdown(
  session: SessionSummary,
  challenger: CareerRankingEntry | null,
): MatchSettlementBreakdown {
  const winPrize = challenger && session.score.player > session.score.ai
    ? getBeatAiWinReward(challenger.rank)
    : 0
  const breakPrize = getPracticeReward(session.highestBreak)
  const totalPrize = winPrize + breakPrize
  const resultLabel = session.score.player > session.score.ai
    ? 'Victory'
    : session.score.player < session.score.ai
      ? 'Defeat'
      : 'Draw'

  return {
    winPrize,
    breakPrize,
    totalPrize,
    resultLabel,
  }
}

interface MenuButtonProps {
  label: string
  onClick: () => void
}

function MenuButton({ label, onClick }: MenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-fit bg-black px-7 py-5 text-left text-[#f2f0ea] transition hover:bg-[#161616] focus:outline-none"
      style={{
        fontFamily: MENU_BUTTON_FONT_STACK,
      }}
    >
      <span
        className="block text-[64px] leading-[0.9] font-semibold uppercase"
        style={{
          fontStretch: 'condensed',
          transform: 'scaleX(0.82) scaleY(1.04)',
          transformOrigin: 'left center',
          textRendering: 'geometricPrecision',
          WebkitFontSmoothing: 'antialiased',
          letterSpacing: '-0.04em',
        }}
      >
        {label}
      </span>
    </button>
  )
}

export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<SnookerGame | null>(null)
  const foulTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const practiceRewardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aiTurnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aiThoughtStreamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const aiThoughtHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aiThoughtRequestIdRef = useRef(0)
  const aiTurnMarkerRef = useRef<string | null>(null)
  const awardedPracticeSessionKeysRef = useRef(new Set<string>())
  const awardedBeatAiWinRef = useRef(false)
  const [view, setView] = useState<AppView>('guest')
  const [phase, setPhase] = useState<GamePhase>('general')
  const [showCareer, setShowCareer] = useState(false)
  const [showRanking, setShowRanking] = useState(false)
  const [showBeatAiRanking, setShowBeatAiRanking] = useState(false)
  const [showMenuIdentity, setShowMenuIdentity] = useState(false)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [pauseMenuView, setPauseMenuView] = useState<PauseMenuView>('menu')
  const [playerPrizeMoney, setPlayerPrizeMoney] = useState<number>(DEV_PLAYER_PROFILE.prizeMoney)
  const [power, setPower] = useState(0.35)
  const [lastPotted, setLastPotted] = useState<string[]>([])
  const [shotBlocked, setShotBlocked] = useState<string | null>(null)
  const [rulesState, setRulesState] = useState<RulesState>(INITIAL_RULES_STATE)
  const [foulInfo, setFoulInfo] = useState<FoulInfo | null>(null)
  const [aiTurnMessage, setAiTurnMessage] = useState<string | null>(null)
  const [latestAiTurn, setLatestAiTurn] = useState<AiTurnResolvedEvent | null>(null)
  const [aiInnerThought, setAiInnerThought] = useState<string | null>(null)
  const [aiInnerThoughtDisplay, setAiInnerThoughtDisplay] = useState<string>('')
  const [latestTableSnapshot, setLatestTableSnapshot] = useState<TableSnapshot | null>(null)
  const [latestShotSummary, setLatestShotSummary] = useState<ShotSummary | null>(null)
  const [latestSessionSummary, setLatestSessionSummary] = useState<SessionSummary | null>(null)
  const [coachMessage, setCoachMessage] = useState<string | null>(null)
  const [coachMessageSource, setCoachMessageSource] = useState<'llm' | 'template' | null>(null)
  const [coachReview, setCoachReview] = useState<string | null>(null)
  const [coachReviewDisplay, setCoachReviewDisplay] = useState('')
  const [coachReviewSource, setCoachReviewSource] = useState<'llm' | 'template' | null>(null)
  const [coachReviewFallbackReason, setCoachReviewFallbackReason] = useState<string | null>(null)
  const [coachReviewChunkCount, setCoachReviewChunkCount] = useState(0)
  const [isGeneratingCoachReview, setIsGeneratingCoachReview] = useState(false)
  const [simulateConfirmOpen, setSimulateConfirmOpen] = useState(false)
  const [showSimulatedResult, setShowSimulatedResult] = useState(false)
  const [simulatedResultMode, setSimulatedResultMode] = useState<SimulatedResultMode | null>(null)
  const [simulatedShotSummary, setSimulatedShotSummary] = useState<ShotSummary[] | null>(null)
  const [simulatedTableSnapshot, setSimulatedTableSnapshot] = useState<TableSnapshot | null>(null)
  const [simulatedSettlement, setSimulatedSettlement] = useState<MatchSettlementBreakdown | null>(null)
  const [practiceRewardMessage, setPracticeRewardMessage] = useState<string | null>(null)
  const [debugPanel, setDebugPanel] = useState<'snapshot' | 'shot' | null>(null)
  const [selectedAiChallenger, setSelectedAiChallenger] = useState<CareerRankingEntry | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const game = new SnookerGame(host)
    gameRef.current = game
    game.setInputEnabled(false)
    game.setCallbacks({
      onPhaseChange: (p) => {
        setPhase(p)
        setPower(game.getPower())
      },
      onPotted: (ids) => setLastPotted(ids),
      onShotBlocked: (message) => setShotBlocked(message),
      onScoreUpdate: (state) => {
        console.log('[GameCanvas] Score update:', state)
        setRulesState(state)
      },
      onFoul: (foul) => {
        console.log('[GameCanvas] Foul:', foul)
        if (foulTimerRef.current) clearTimeout(foulTimerRef.current)
        setFoulInfo(foul)
        if (foul) {
          foulTimerRef.current = setTimeout(() => setFoulInfo(null), 3000)
        }
      },
      onAiTurnResolved: (turn) => {
        setLatestAiTurn(turn)
      },
      onTableSnapshot: (snapshot) => {
        setLatestTableSnapshot(snapshot)
      },
      onShotSummary: (summary) => {
        setLatestShotSummary(summary)
      },
      onSessionSummary: (summary) => {
        setLatestSessionSummary(summary)
        console.log('[GameCanvas] Session summary:', summary)
      },
    })

    const interval = setInterval(() => {
      if (gameRef.current) setPower(gameRef.current.getPower())
    }, 100)

    return () => {
      clearInterval(interval)
      if (foulTimerRef.current) clearTimeout(foulTimerRef.current)
      if (practiceRewardTimerRef.current) clearTimeout(practiceRewardTimerRef.current)
      if (aiTurnTimerRef.current) clearTimeout(aiTurnTimerRef.current)
      if (aiThoughtStreamTimerRef.current) clearInterval(aiThoughtStreamTimerRef.current)
      if (aiThoughtHoldTimerRef.current) clearTimeout(aiThoughtHoldTimerRef.current)
      game.dispose()
      gameRef.current = null
    }
  }, [])

  useEffect(() => {
    const game = gameRef.current
    if (!game) return

    const enableInput = view === 'practise' || view === 'beat-ai'
    game.setInputEnabled(enableInput)

    if (enableInput) {
      setShotBlocked(null)
      setLastPotted([])
      setAiTurnMessage(null)
      setLatestAiTurn(null)
      setAiInnerThought(null)
      setAiInnerThoughtDisplay('')
      setCoachMessage(null)
      setCoachMessageSource(null)
      setCoachReview(null)
      setCoachReviewDisplay('')
      setCoachReviewSource(null)
      setCoachReviewFallbackReason(null)
      setCoachReviewChunkCount(0)
      setSimulateConfirmOpen(false)
      setShowSimulatedResult(false)
      setSimulatedResultMode(null)
      setSimulatedShotSummary(null)
      setSimulatedTableSnapshot(null)
      setSimulatedSettlement(null)
      setPracticeRewardMessage(null)
      setPauseOpen(false)
      setPauseMenuView('menu')
      awardedBeatAiWinRef.current = false
      setPower(game.getPower())
      setPhase(game.getPhase())
      setDebugPanel(null)
    }
  }, [view])

  const enterMenu = (): void => {
    setShowCareer(false)
    setShowRanking(false)
    setShowBeatAiRanking(false)
    setShowMenuIdentity(true)
    setView('menu')
  }

  const handleBeatAi = (): void => {
    setShowCareer(false)
    setShowRanking(false)
    setShowBeatAiRanking(true)
    setShowMenuIdentity(false)
  }

  const startPractise = (): void => {
    gameRef.current?.setMode('practice')
    setShotBlocked(null)
    setLastPotted([])
    setFoulInfo(null)
    setAiTurnMessage(null)
    setLatestAiTurn(null)
    setAiInnerThought(null)
    setAiInnerThoughtDisplay('')
    setCoachMessage(null)
    setCoachMessageSource(null)
    setCoachReview(null)
    setCoachReviewDisplay('')
    setCoachReviewSource(null)
    setCoachReviewFallbackReason(null)
    setCoachReviewChunkCount(0)
    setSimulateConfirmOpen(false)
    setShowSimulatedResult(false)
    setSimulatedResultMode(null)
    setSimulatedShotSummary(null)
    setSimulatedTableSnapshot(null)
    setSimulatedSettlement(null)
    setPracticeRewardMessage(null)
    setPauseOpen(false)
    setPauseMenuView('menu')
    awardedBeatAiWinRef.current = false
    setRulesState(INITIAL_RULES_STATE)
    setShowCareer(false)
    setShowRanking(false)
    setShowBeatAiRanking(false)
    setShowMenuIdentity(false)
    setView('practise')
  }

  const startBeatAiMatch = (challenger: CareerRankingEntry): void => {
    gameRef.current?.setAiAbility(getAiAbilityProfile(challenger))
    gameRef.current?.setMode('match')
    setSelectedAiChallenger(challenger)
    setShotBlocked(null)
    setLastPotted([])
    setFoulInfo(null)
    setAiTurnMessage(null)
    setLatestAiTurn(null)
    setAiInnerThought(null)
    setAiInnerThoughtDisplay('')
    setCoachMessage(null)
    setCoachMessageSource(null)
    setCoachReview(null)
    setCoachReviewDisplay('')
    setCoachReviewSource(null)
    setCoachReviewFallbackReason(null)
    setCoachReviewChunkCount(0)
    setSimulateConfirmOpen(false)
    setShowSimulatedResult(false)
    setSimulatedResultMode(null)
    setSimulatedShotSummary(null)
    setSimulatedTableSnapshot(null)
    setSimulatedSettlement(null)
    setPracticeRewardMessage(null)
    setPauseOpen(false)
    setPauseMenuView('menu')
    awardedBeatAiWinRef.current = false
    setRulesState(INITIAL_RULES_STATE)
    setShowCareer(false)
    setShowRanking(false)
    setShowBeatAiRanking(false)
    setShowMenuIdentity(false)
    setView('beat-ai')
  }

  const showGameHud = view === 'practise' || view === 'beat-ai'
  const showAiHud = view === 'beat-ai' && selectedAiChallenger !== null
  const aiChallenger = selectedAiChallenger
  const aiTableName = (aiChallenger?.displayName ?? 'AI').replace(/\s+/g, '')
  const playerAtTable = rulesState.currentActor === 'player'
  const playerBreakScore = playerAtTable ? rulesState.breakScore : 0
  const aiBreakScore = rulesState.currentActor === 'ai' ? rulesState.breakScore : 0
  const playerBallOn = playerAtTable ? rulesState.ballOn : null
  const aiBallOn = rulesState.currentActor === 'ai' ? rulesState.ballOn : null
  const liveCareerRanking = CAREER_RANKING.map((entry) => entry.isPlayer
    ? { ...entry, prizeMoney: playerPrizeMoney }
    : entry)
  const debugJson = debugPanel === 'snapshot'
    ? latestTableSnapshot
    : debugPanel === 'shot'
      ? latestShotSummary
      : null
  const isSimulationOverlayOpen = showSimulatedResult && simulatedResultMode !== null
  const isOverlayBlockingGame = pauseOpen || simulateConfirmOpen || isSimulationOverlayOpen
  const beatAiEntries = liveCareerRanking

  useEffect(() => {
    gameRef.current?.setPaused(isOverlayBlockingGame)
  }, [isOverlayBlockingGame])

  const resetPracticeUiState = (): void => {
    awardedPracticeSessionKeysRef.current.clear()
    awardedBeatAiWinRef.current = false
    setLatestShotSummary(null)
    setLatestTableSnapshot(null)
    setLatestSessionSummary(null)
    setLastPotted([])
    setFoulInfo(null)
    setCoachMessage(null)
    setCoachMessageSource(null)
    setCoachReview(null)
    setCoachReviewDisplay('')
    setCoachReviewSource(null)
    setCoachReviewFallbackReason(null)
    setCoachReviewChunkCount(0)
    setShowSimulatedResult(false)
    setSimulatedResultMode(null)
    setSimulatedShotSummary(null)
    setSimulatedTableSnapshot(null)
    setSimulatedSettlement(null)
    setPracticeRewardMessage(null)
    setDebugPanel(null)
    setSimulateConfirmOpen(false)
    setPauseOpen(false)
    setPauseMenuView('menu')
  }

  const handlePauseResume = (): void => {
    if (isSimulationOverlayOpen) return
    setPauseOpen(false)
    setPauseMenuView('menu')
  }

  const handlePauseRestart = (): void => {
    gameRef.current?.restartCurrentFrame({ emitSessionSummary: false })
    resetPracticeUiState()
    if (view === 'beat-ai' && aiChallenger) {
      startBeatAiMatch(aiChallenger)
      return
    }
    if (view === 'practise') {
      startPractise()
    }
  }

  const handlePauseQuit = (): void => {
    gameRef.current?.restartCurrentFrame({ emitSessionSummary: false })
    resetPracticeUiState()
    setShowCareer(false)
    setShowRanking(false)
    setShowBeatAiRanking(false)
    setShowMenuIdentity(true)
    setView('menu')
  }

  const awardPracticeReward = (session: SessionSummary): void => {
    if (session.mode !== 'practice' || session.shotCount <= 0) return

    const sessionKey = buildPracticeSessionKey(session)
    if (awardedPracticeSessionKeysRef.current.has(sessionKey)) return
    awardedPracticeSessionKeysRef.current.add(sessionKey)

    const reward = getPracticeReward(session.highestBreak)
    if (reward <= 0) return
    setPlayerPrizeMoney((current) => current + reward)

    const tierLabel = session.highestBreak >= 147
      ? 'Maximum Break'
      : session.highestBreak >= 100
        ? 'Century Break'
        : session.highestBreak >= 50
          ? 'Break 50'
          : session.highestBreak >= 30
            ? 'Break 30'
            : 'Practice Completed'

    setPracticeRewardMessage(`${tierLabel}: +${formatPrizeMoney(reward)}`)
    if (practiceRewardTimerRef.current) clearTimeout(practiceRewardTimerRef.current)
    practiceRewardTimerRef.current = setTimeout(() => setPracticeRewardMessage(null), 4000)
  }

  useEffect(() => {
    if (view !== 'practise' || !latestSessionSummary || showSimulatedResult) return
    awardPracticeReward(latestSessionSummary)
  }, [latestSessionSummary, showSimulatedResult, view])

  useEffect(() => {
    if (view !== 'beat-ai' || phase !== 'ended' || !aiChallenger) return
    if (showSimulatedResult) return
    if (awardedBeatAiWinRef.current) return
    if (rulesState.playerScore <= rulesState.aiScore) return

    awardedBeatAiWinRef.current = true
    const reward = getBeatAiWinReward(aiChallenger.rank)
    if (reward <= 0) return

    setPlayerPrizeMoney((current) => current + reward)
    setPracticeRewardMessage(`Beat #${aiChallenger.rank} ${aiChallenger.displayName}: +${formatPrizeMoney(reward)}`)
    if (practiceRewardTimerRef.current) clearTimeout(practiceRewardTimerRef.current)
    practiceRewardTimerRef.current = setTimeout(() => setPracticeRewardMessage(null), 5000)
  }, [aiChallenger, phase, rulesState.aiScore, rulesState.playerScore, showSimulatedResult, view])

  useEffect(() => {
    if (view !== 'practise') return
    if (!latestShotSummary) return
    if (latestShotSummary.shotIndex === 1) {
      setCoachMessage(null)
      setCoachMessageSource(null)
      return
    }
    if (showSimulatedResult) {
      setCoachMessage(null)
      setCoachMessageSource(null)
      return
    }

    let cancelled = false

    void generatePracticeInstantFeedback(latestShotSummary, 'strict')
      .then((feedback) => {
        if (cancelled) return
        setCoachMessage(feedback.text)
        setCoachMessageSource(feedback.source)
      })
      .catch(() => {
        if (cancelled) return
        const feedback = getPracticeInstantFeedback(latestShotSummary, 'strict')
        setCoachMessage(feedback?.text ?? null)
        setCoachMessageSource('template')
      })

    return () => {
      cancelled = true
    }
  }, [latestShotSummary, showSimulatedResult, view])

  useEffect(() => {
    if (view !== 'beat-ai') return
    if (!latestAiTurn || !aiChallenger) return

    let message = `${aiTableName} missed`
    if (latestAiTurn.foul) {
      message = `${aiTableName} fouled`
    } else if (latestAiTurn.scored > 0) {
      message = `${aiTableName} ${latestAiTurn.resolution.text} (+${latestAiTurn.scored})`
      if (latestAiTurn.retainsTurn) message += ' and stays on'
    }

    setAiTurnMessage(message)
    if (aiTurnTimerRef.current) clearTimeout(aiTurnTimerRef.current)
    aiTurnTimerRef.current = setTimeout(() => setAiTurnMessage(null), 1800)
  }, [aiChallenger, aiTableName, latestAiTurn, view])

  useEffect(() => {
    if (view !== 'beat-ai' || phase !== 'aiResolving' || rulesState.currentActor !== 'ai' || !aiChallenger) {
      aiTurnMarkerRef.current = null
      if (aiThoughtHoldTimerRef.current) {
        clearTimeout(aiThoughtHoldTimerRef.current)
        aiThoughtHoldTimerRef.current = null
      }
      if (aiThoughtStreamTimerRef.current) {
        clearInterval(aiThoughtStreamTimerRef.current)
        aiThoughtStreamTimerRef.current = null
      }
      return
    }

    const turnMarker = `${latestAiTurn?.afterState.playerScore ?? rulesState.playerScore}-${latestAiTurn?.afterState.aiScore ?? rulesState.aiScore}-${latestSessionSummary?.shotCount ?? 0}`
    if (aiTurnMarkerRef.current === turnMarker) return
    aiTurnMarkerRef.current = turnMarker

    const requestId = ++aiThoughtRequestIdRef.current
    setAiInnerThought(null)
    setAiInnerThoughtDisplay('')

    void generateAiInnerMonologue({
      challenger: aiChallenger,
      shot: latestShotSummary ?? undefined,
      table: latestTableSnapshot ?? undefined,
      session: latestSessionSummary ?? undefined,
      recentShots: latestSessionSummary?.shots.slice(-3),
    }).then((result) => {
      if (aiThoughtRequestIdRef.current !== requestId) return
      setAiInnerThought(result.text)
    }).catch(() => {
      if (aiThoughtRequestIdRef.current !== requestId) return
      setAiInnerThought('先把这一杆做干净。')
    })
  }, [
    aiChallenger,
    latestAiTurn?.afterState.aiScore,
    latestAiTurn?.afterState.playerScore,
    latestSessionSummary,
    latestShotSummary,
    latestTableSnapshot,
    phase,
    rulesState.aiScore,
    rulesState.currentActor,
    rulesState.playerScore,
    view,
  ])

  useEffect(() => {
    if (aiThoughtStreamTimerRef.current) {
      clearInterval(aiThoughtStreamTimerRef.current)
      aiThoughtStreamTimerRef.current = null
    }

    if (!aiInnerThought) {
      setAiInnerThoughtDisplay('')
      return
    }

    let index = 0
    setAiInnerThoughtDisplay('')
    aiThoughtStreamTimerRef.current = setInterval(() => {
      index += 1
      setAiInnerThoughtDisplay(aiInnerThought.slice(0, index))
      if (index >= aiInnerThought.length && aiThoughtStreamTimerRef.current) {
        clearInterval(aiThoughtStreamTimerRef.current)
        aiThoughtStreamTimerRef.current = null
        if (aiThoughtHoldTimerRef.current) clearTimeout(aiThoughtHoldTimerRef.current)
        aiThoughtHoldTimerRef.current = setTimeout(() => {
          aiThoughtHoldTimerRef.current = null
        }, 3000)
      }
    }, 64)

    return () => {
      if (aiThoughtStreamTimerRef.current) {
        clearInterval(aiThoughtStreamTimerRef.current)
        aiThoughtStreamTimerRef.current = null
      }
      if (aiThoughtHoldTimerRef.current) {
        clearTimeout(aiThoughtHoldTimerRef.current)
        aiThoughtHoldTimerRef.current = null
      }
    }
  }, [aiInnerThought])

  const runSimulatedPracticeToEnd = async (): Promise<void> => {
    const simulated = simulatePracticeSession()
    console.log('[PracticeSimulation] generated', {
      patternId: simulated.patternId,
      shotCount: simulated.session.shotCount,
      simplePotMissCount: simulated.session.simplePotMissCount,
      foulCount: simulated.session.foulCount,
    })
    setLatestShotSummary(simulated.latestShot)
    setLatestTableSnapshot(simulated.latestTable)
    setLatestSessionSummary(simulated.session)
    awardPracticeReward(simulated.session)
    setSimulatedShotSummary(simulated.session.shots)
    setSimulatedTableSnapshot(simulated.latestTable)
    setSimulatedSettlement({
      winPrize: 0,
      breakPrize: getPracticeReward(simulated.session.highestBreak),
      totalPrize: getPracticeReward(simulated.session.highestBreak),
      resultLabel: 'Practice Ended',
    })
    setCoachMessage(null)
    setCoachMessageSource(null)
    setSimulateConfirmOpen(false)
    setShowSimulatedResult(true)
    setSimulatedResultMode('practice')
    setDebugPanel(null)

    setIsGeneratingCoachReview(true)
    setCoachReview(null)
    setCoachReviewDisplay('')
    setCoachReviewSource('llm')
    setCoachReviewFallbackReason(null)
    setCoachReviewChunkCount(0)

    try {
      const review = await streamPracticeReview(
        simulated.session,
        {
          onChunk: (_chunk, fullText) => {
            setCoachReviewDisplay(fullText)
            setCoachReviewChunkCount((current) => current + 1)
          },
          onDone: (result) => {
            setCoachReviewSource(result.source)
            setCoachReviewFallbackReason(result.fallbackReason ?? null)
          },
          onError: (result) => {
            setCoachReviewSource(result.source)
            setCoachReviewDisplay(result.text)
            setCoachReviewFallbackReason(result.fallbackReason ?? null)
          },
        },
        'strict',
      )
      setCoachReview(review.text)
      setCoachReviewDisplay(review.text)
      setCoachReviewSource(review.source)
      setCoachReviewFallbackReason(review.fallbackReason ?? null)
    } finally {
      setIsGeneratingCoachReview(false)
    }
  }

  const runSimulatedMatchToEnd = async (): Promise<void> => {
    if (!aiChallenger) return

    const simulated = simulateMatchSession()
    const settlement = getMatchSettlementBreakdown(simulated.session, aiChallenger)
    console.log('[MatchSimulation] generated', {
      patternId: simulated.patternId,
      shotCount: simulated.session.shotCount,
      playerScore: simulated.session.score.player,
      aiScore: simulated.session.score.ai,
    })

    setLatestShotSummary(simulated.latestShot)
    setLatestTableSnapshot(simulated.latestTable)
    setLatestSessionSummary(simulated.session)
    setSimulatedShotSummary(simulated.session.shots)
    setSimulatedTableSnapshot(simulated.latestTable)
    setSimulatedSettlement(settlement)
    setCoachMessage(null)
    setCoachMessageSource(null)
    setAiTurnMessage(null)
    setSimulateConfirmOpen(false)
    setShowSimulatedResult(true)
    setSimulatedResultMode('match')
    setDebugPanel(null)

    if (settlement.totalPrize > 0) {
      setPlayerPrizeMoney((current) => current + settlement.totalPrize)
      setPracticeRewardMessage(`${settlement.resultLabel}: +${formatPrizeMoney(settlement.totalPrize)}`)
      if (practiceRewardTimerRef.current) clearTimeout(practiceRewardTimerRef.current)
      practiceRewardTimerRef.current = setTimeout(() => setPracticeRewardMessage(null), 5000)
    }

    setIsGeneratingCoachReview(true)
    setCoachReview(null)
    setCoachReviewDisplay('')
    setCoachReviewSource('llm')
    setCoachReviewFallbackReason(null)
    setCoachReviewChunkCount(0)

    try {
      const review = await streamMatchReview(
        simulated.session,
        aiChallenger.displayName,
        {
          onChunk: (_chunk, fullText) => {
            setCoachReviewDisplay(fullText)
            setCoachReviewChunkCount((current) => current + 1)
          },
          onDone: (result) => {
            setCoachReviewSource(result.source)
            setCoachReviewFallbackReason(result.fallbackReason ?? null)
          },
          onError: (result) => {
            setCoachReviewSource(result.source)
            setCoachReviewDisplay(result.text)
            setCoachReviewFallbackReason(result.fallbackReason ?? null)
          },
        },
        'strict',
      )
      setCoachReview(review.text)
      setCoachReviewDisplay(review.text)
      setCoachReviewSource(review.source)
      setCoachReviewFallbackReason(review.fallbackReason ?? null)
    } finally {
      setIsGeneratingCoachReview(false)
    }
  }

  const handlePracticeReview = async (): Promise<void> => {
    if (view !== 'practise' || !latestSessionSummary || isGeneratingCoachReview) return

    setIsGeneratingCoachReview(true)
    setCoachReview(null)
    setCoachReviewDisplay('')
    setCoachReviewSource('llm')
    setCoachReviewFallbackReason(null)
    setCoachReviewChunkCount(0)
    console.log('[CoachReview] start', {
      shotCount: latestSessionSummary.shotCount,
      totalScore: latestSessionSummary.totalScore,
    })
    try {
      const review = await streamPracticeReview(
        latestSessionSummary,
        {
          onChunk: (_chunk, fullText) => {
            setCoachReviewDisplay(fullText)
            setCoachReviewChunkCount((current) => current + 1)
          },
          onDone: (result) => {
            setCoachReviewSource(result.source)
            setCoachReviewFallbackReason(result.fallbackReason ?? null)
            console.log('[CoachReview] done', {
              source: result.source,
              fallbackReason: result.fallbackReason ?? null,
            })
          },
          onError: (result) => {
            setCoachReviewSource(result.source)
            setCoachReviewDisplay(result.text)
            setCoachReviewFallbackReason(result.fallbackReason ?? null)
            console.log('[CoachReview] fallback', {
              source: result.source,
              fallbackReason: result.fallbackReason ?? null,
            })
          },
        },
        'strict',
      )
      setCoachReview(review.text)
      setCoachReviewSource(review.source)
      setCoachReviewDisplay(review.text)
      setCoachReviewFallbackReason(review.fallbackReason ?? null)
      console.log('[CoachReview] final', {
        source: review.source,
        fallbackReason: review.fallbackReason ?? null,
      })
    } finally {
      setIsGeneratingCoachReview(false)
    }
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#1a1510]">
      <div ref={hostRef} className="h-full w-full" />

      {view !== 'practise' && view !== 'beat-ai' && (
        <div className="absolute left-0 top-[272px] z-20 flex flex-col gap-8">
          {view === 'guest' ? (
            <>
              <MenuButton label="Login" onClick={enterMenu} />
              <MenuButton label="Register" onClick={enterMenu} />
            </>
          ) : (
            <>
              <MenuButton label="Beat AI" onClick={handleBeatAi} />
              <MenuButton label="Practise" onClick={startPractise} />
              <MenuButton
                label="Career"
                onClick={() => {
                  setShowRanking(false)
                  setShowCareer((current) => !current)
                }}
              />
            </>
          )}
        </div>
      )}

      {view === 'menu' && showMenuIdentity && (
        <div className="pointer-events-none absolute right-6 top-5 z-20 flex items-center gap-6 text-sm uppercase tracking-[0.18em] text-[#f1ede4]">
          <span>Player: {DEV_PLAYER_PROFILE.username}</span>
        </div>
      )}

      {view === 'menu' && showCareer && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/18">
          <div className="relative min-w-[520px] bg-black px-10 py-8 text-[#f2f0ea] shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
            <button
              type="button"
              onClick={() => {
                setShowRanking(false)
                setShowCareer(false)
              }}
              aria-label="Close career panel"
              className="absolute right-4 top-3 text-[30px] leading-none text-[#f2f0ea] transition hover:text-[#d9b86d] focus:outline-none"
              style={{
                fontFamily: MENU_BUTTON_FONT_STACK,
                fontStretch: 'condensed',
              }}
            >
              ×
            </button>
            <p
              className="text-[34px] leading-none font-semibold uppercase"
              style={{
                fontFamily: MENU_BUTTON_FONT_STACK,
                fontStretch: 'condensed',
                transform: 'scaleX(0.86)',
                transformOrigin: 'left center',
                letterSpacing: '-0.03em',
              }}
            >
              My Prize Money: {formatPrizeMoney(playerPrizeMoney)}
            </p>
            <p
              className="mt-5 text-[30px] leading-none font-semibold uppercase text-[#d9b86d]"
              style={{
                fontFamily: MENU_BUTTON_FONT_STACK,
                fontStretch: 'condensed',
                transform: 'scaleX(0.88)',
                transformOrigin: 'left center',
                letterSpacing: '-0.025em',
              }}
            >
              World Ranking Now: {DEV_PLAYER_PROFILE.worldRanking}
            </p>
            <button
              type="button"
              onClick={() => setShowRanking(true)}
              className="mt-10 bg-[#d9b86d] px-6 py-3 text-[24px] font-semibold uppercase text-black transition hover:bg-[#ebca82] focus:outline-none"
              style={{
                fontFamily: MENU_BUTTON_FONT_STACK,
                fontStretch: 'condensed',
                transform: 'scaleX(0.88)',
                transformOrigin: 'left center',
                letterSpacing: '-0.02em',
              }}
            >
              Ranking
            </button>
          </div>
        </div>
      )}

      {view === 'menu' && showCareer && showRanking && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/28">
          <div className="relative max-h-[78vh] min-w-[860px] overflow-hidden bg-black px-8 py-7 text-[#f2f0ea] shadow-[0_12px_40px_rgba(0,0,0,0.65)]">
            <button
              type="button"
              onClick={() => setShowRanking(false)}
              aria-label="Close ranking panel"
              className="absolute right-4 top-3 text-[30px] leading-none text-[#f2f0ea] transition hover:text-[#d9b86d] focus:outline-none"
              style={{
                fontFamily: MENU_BUTTON_FONT_STACK,
                fontStretch: 'condensed',
              }}
            >
              ×
            </button>
            <p
              className="mb-6 text-[34px] leading-none font-semibold uppercase"
              style={{
                fontFamily: MENU_BUTTON_FONT_STACK,
                fontStretch: 'condensed',
                transform: 'scaleX(0.88)',
                transformOrigin: 'left center',
                letterSpacing: '-0.03em',
              }}
            >
              World Ranking
            </p>
            <div className="max-h-[62vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-[90px_1fr_220px] gap-x-6 border-b border-white/15 pb-3 text-[15px] uppercase tracking-[0.16em] text-[#b8ad96]">
                <span>Rank</span>
                <span>Player</span>
                <span>Prize Money</span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {liveCareerRanking.map((entry) => (
                  <div
                    key={entry.rank}
                    className={`grid grid-cols-[90px_1fr_220px] gap-x-6 px-3 py-3 ${
                      entry.isPlayer ? 'bg-[#1d1608]' : 'bg-white/[0.03]'
                    }`}
                  >
                    <span className="text-[24px] font-semibold leading-none text-[#d9b86d]">
                      #{entry.rank}
                    </span>
                    <span className="text-[20px] leading-none text-[#f2f0ea]">
                      {entry.displayName}
                    </span>
                    <span className="text-[20px] leading-none text-[#f2f0ea]">
                      {formatPrizeMoney(entry.prizeMoney)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'menu' && showBeatAiRanking && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/28">
          <div className="relative max-h-[78vh] min-w-[980px] overflow-hidden bg-black px-8 py-7 text-[#f2f0ea] shadow-[0_12px_40px_rgba(0,0,0,0.65)]">
            <button
              type="button"
              onClick={() => setShowBeatAiRanking(false)}
              aria-label="Close beat ai ranking panel"
              className="absolute right-4 top-3 text-[30px] leading-none text-[#f2f0ea] transition hover:text-[#d9b86d] focus:outline-none"
              style={{
                fontFamily: MENU_BUTTON_FONT_STACK,
                fontStretch: 'condensed',
              }}
            >
              ×
            </button>
            <p
              className="mb-2 text-[34px] leading-none font-semibold uppercase"
              style={{
                fontFamily: MENU_BUTTON_FONT_STACK,
                fontStretch: 'condensed',
                transform: 'scaleX(0.88)',
                transformOrigin: 'left center',
                letterSpacing: '-0.03em',
              }}
            >
              Beat AI
            </p>
            <p className="mb-6 text-[14px] uppercase tracking-[0.16em] text-[#b8ad96]">
              Choose a world-ranked star to enter the room
            </p>
            <div className="max-h-[62vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-[90px_1fr_220px_280px] gap-x-6 border-b border-white/15 pb-3 text-[15px] uppercase tracking-[0.16em] text-[#b8ad96]">
                <span>Rank</span>
                <span>Player</span>
                <span>Prize Money</span>
                <span />
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {beatAiEntries.map((entry) => {
                  const locked = entry.rank === 1
                  const selectable = !locked && !entry.isPlayer

                  return (
                    <div
                      key={entry.rank}
                      className={`grid grid-cols-[90px_1fr_220px_280px] items-center gap-x-6 px-3 py-3 ${
                        locked ? 'bg-white/[0.02] text-white/45' : 'bg-white/[0.05]'
                      }`}
                    >
                      <span className={`text-[24px] font-semibold leading-none ${locked ? 'text-[#7e7463]' : 'text-[#d9b86d]'}`}>
                        #{entry.rank}
                      </span>
                      <span className={`text-[20px] leading-none ${locked ? 'text-white/45' : 'text-[#f2f0ea]'}`}>
                        {entry.displayName}
                      </span>
                      <span className={`text-[20px] leading-none ${locked ? 'text-white/40' : 'text-[#f2f0ea]'}`}>
                        {formatPrizeMoney(entry.prizeMoney)}
                      </span>
                      {selectable ? (
                        <button
                          type="button"
                          onClick={() => startBeatAiMatch(entry)}
                          className="justify-self-end px-3 text-[34px] leading-none text-[#d9b86d] transition hover:text-[#ebca82] focus:outline-none"
                          aria-label={`Challenge ${entry.displayName}`}
                        >
                          &gt;
                        </button>
                      ) : (
                        <div className="justify-self-end text-right text-[14px] uppercase tracking-[0.08em] text-[#7e7463]">
                          {entry.isPlayer ? (
                            <span className="ml-3">Current Player</span>
                          ) : (
                            <>
                              <span className="text-[18px]">🔒</span>
                              <span className="ml-3">奖金需达到{BEAT_AI_UNLOCK_PRIZE_MONEY}￡方可解锁</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showGameHud && (
        <>
          <div className="pointer-events-none absolute left-[17px] top-[18px] z-10">
            <Scoreboard
              playerName={DEV_PLAYER_PROFILE.username}
              score={rulesState.playerScore}
              breakScore={playerBreakScore}
              ballOn={playerBallOn}
            />
          </div>

          <div className="pointer-events-none absolute left-0 right-0 top-0 flex justify-between p-4 text-sm text-white/90">
            <div>
              <p className="font-semibold tracking-wide">
                {view === 'beat-ai' ? 'AI Snooker — Beat AI' : 'AI Snooker — Practise'}
              </p>
              <p className="text-white/60">Move mouse to aim · Wheel = power · Space = shot · R = reset</p>
            </div>
            <div className="text-right">
              {view === 'beat-ai' && aiChallenger && (
                <p className="text-amber-300">Challenger: #{aiChallenger.rank} {aiChallenger.displayName}</p>
              )}
              {view === 'beat-ai' && (
                <p className="text-white/70">At table: {rulesState.currentActor === 'ai' ? aiTableName : 'Player'}</p>
              )}
              <p>Phase: {phase}</p>
              <p>Power: {Math.round(power * 100)}%</p>
              {lastPotted.length > 0 && (
                <p className="text-amber-300">Potted: {lastPotted.join(', ')}</p>
              )}
            </div>
          </div>

          {showAiHud && (
            <div className="pointer-events-none absolute right-[17px] top-[18px] z-10">
              <Scoreboard
                playerName={aiChallenger!.displayName}
                score={rulesState.aiScore}
                breakScore={aiBreakScore}
                ballOn={aiBallOn}
              />
              <div className="mt-3 w-[536px] rounded bg-black/65 px-4 py-3 text-[13px] leading-6 text-[#f1ede4] shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
                <span className="font-semibold text-[#eda62a]">{aiTableName}:</span>
                <span className="ml-2 whitespace-pre-wrap">{aiInnerThoughtDisplay}</span>
                {phase === 'aiResolving' && aiInnerThoughtDisplay.length === 0 && (
                  <span className="ml-2 text-white/55">...</span>
                )}
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded bg-black/50 px-4 py-2 text-center text-xs text-white/80">
            Minimal table + balls + collision (club room in P3)
          </div>

          {shotBlocked && (
            <div className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 rounded bg-black/70 px-4 py-2 text-sm font-semibold tracking-wide text-amber-300">
              {shotBlocked}
            </div>
          )}

          {phase === 'aiResolving' && (
            <div className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded bg-black/75 px-4 py-2 text-sm font-semibold tracking-wide text-amber-200">
              {aiTableName} at Table
            </div>
          )}

          {aiTurnMessage && phase !== 'aiResolving' && (
            <div className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded bg-black/75 px-4 py-2 text-sm font-semibold tracking-wide text-amber-200">
              {aiTurnMessage}
            </div>
          )}

          {view === 'practise' && !showSimulatedResult && coachMessage && (
            <div className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded bg-black/75 px-4 py-2 text-sm font-semibold tracking-wide text-[#f1ede4]">
              Coach{coachMessageSource ? ` (${coachMessageSource.toUpperCase()})` : ''}: {coachMessage}
            </div>
          )}

          {view === 'practise' && practiceRewardMessage && (
            <div className="pointer-events-none absolute left-1/2 top-32 z-20 -translate-x-1/2 rounded bg-[#0f2a14]/90 px-4 py-2 text-sm font-semibold tracking-wide text-[#d7f7c7] shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
              Reward: {practiceRewardMessage}
            </div>
          )}

          {foulInfo && (
            <div
              className="pointer-events-none absolute left-1/2 top-[88px] z-20 -translate-x-1/2"
              style={{ fontFamily: HUD_FONT_STACK }}
            >
              <div className="bg-[#0d0b07] px-0 shadow-[0_2px_12px_rgba(0,0,0,0.7)]" style={{ minWidth: 320 }}>
                {/* top accent line */}
                <div className="h-[3px] w-full bg-[#cc0000]" />
                <div className="flex items-stretch">
                  {/* red label */}
                  <div className="flex w-[88px] items-center justify-center bg-[#cc0000] px-4 py-3">
                    <span
                      className="text-[22px] font-semibold uppercase leading-none tracking-widest text-white"
                      style={{ letterSpacing: '0.12em' }}
                    >
                      {FOUL_LABEL[foulInfo.type] ?? 'FOUL'}
                    </span>
                  </div>
                  {/* description + penalty */}
                  <div className="flex flex-1 flex-col justify-center px-5 py-3">
                    <span
                      className="text-[13px] uppercase leading-none tracking-[0.1em] text-[#b0a898]"
                    >
                      {foulInfo.message}
                    </span>
                    <span
                      className="mt-1 text-[11px] uppercase leading-none tracking-[0.08em] text-[#6b6358]"
                    >
                      Penalty: {foulInfo.penalty} pts
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="absolute right-4 top-24 z-20 flex flex-col items-end gap-2">
            {view === 'practise' && (
              <button
                type="button"
                onClick={() => {
                  void handlePracticeReview()
                }}
                disabled={!latestSessionSummary || isGeneratingCoachReview}
                className="rounded bg-[#d9b86d] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-black hover:bg-[#ebca82] disabled:cursor-not-allowed disabled:bg-[#7c6d49] disabled:text-black/60"
              >
                {isGeneratingCoachReview ? 'Coach...' : 'Coach Review'}
              </button>
            )}
            {view === 'practise' && (
              <button
                type="button"
                onClick={() => setSimulateConfirmOpen(true)}
                disabled={isGeneratingCoachReview}
                className="rounded bg-black/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/85 hover:bg-black/85 disabled:cursor-not-allowed disabled:bg-black/40 disabled:text-white/40"
              >
                Simulate To End
              </button>
            )}
            {view === 'beat-ai' && (
              <button
                type="button"
                onClick={() => setSimulateConfirmOpen(true)}
                disabled={isGeneratingCoachReview}
                className="rounded bg-black/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/85 hover:bg-black/85 disabled:cursor-not-allowed disabled:bg-black/40 disabled:text-white/40"
              >
                Simulate To End
              </button>
            )}
            <button
              type="button"
              onClick={() => setDebugPanel((current) => current === 'snapshot' ? null : 'snapshot')}
              disabled={isSimulationOverlayOpen}
              className="rounded bg-black/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/85 hover:bg-black/85"
            >
              TableSnapshot
            </button>
            <button
              type="button"
              onClick={() => setDebugPanel((current) => current === 'shot' ? null : 'shot')}
              disabled={isSimulationOverlayOpen}
              className="rounded bg-black/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/85 hover:bg-black/85"
            >
              ShotSummary
            </button>
          </div>

          <div className="absolute bottom-5 right-5 z-20">
            <button
              type="button"
              onClick={() => {
                if (isSimulationOverlayOpen) return
                setPauseOpen(true)
                setPauseMenuView('menu')
              }}
              className="flex h-12 w-12 items-center justify-center bg-black/62 text-[28px] font-semibold leading-none text-white/60 transition hover:bg-black/80 hover:text-white disabled:cursor-not-allowed disabled:bg-black/35 disabled:text-white/25"
              aria-label="Pause game"
              disabled={isSimulationOverlayOpen}
            >
              II
            </button>
          </div>

          {debugPanel && !showSimulatedResult && (
            <div className="absolute right-4 top-40 z-20 h-[520px] w-[420px] overflow-hidden rounded border border-white/10 bg-[#0b0a08]/95 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/75">
                <span>{debugPanel === 'snapshot' ? 'Latest TableSnapshot' : 'Latest ShotSummary'}</span>
                <div className="flex items-center gap-3">
                  {latestSessionSummary && (
                    <span className="text-white/45">Session shots: {latestSessionSummary.shotCount}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setDebugPanel(null)}
                    aria-label="Close debug panel"
                    className="text-[18px] leading-none text-white/65 transition hover:text-white"
                  >
                    ×
                  </button>
                </div>
              </div>
              <pre className="h-[calc(100%-49px)] overflow-auto px-4 py-3 text-[11px] leading-5 text-[#d9d3c6]">
                {debugJson ? JSON.stringify(debugJson, null, 2) : 'No data yet.'}
              </pre>
            </div>
          )}

          {pauseOpen && (
            <div className="absolute inset-0 z-40 bg-black/26">
              <div className="absolute left-1/2 top-[47%] w-[820px] -translate-x-1/2 -translate-y-1/2 bg-[#080b04]/92 text-[#ebe7dc] shadow-[0_18px_40px_rgba(0,0,0,0.52)]">
                {pauseMenuView === 'menu' ? (
                  <>
                    <div className="border-b border-white/10 px-10 py-5">
                      <p
                        className="text-[66px] font-semibold uppercase leading-none tracking-[-0.05em] text-[#f3efe7]"
                        style={{
                          fontFamily: MENU_BUTTON_FONT_STACK,
                          fontStretch: 'condensed',
                          transform: 'scaleX(0.8)',
                          transformOrigin: 'left center',
                        }}
                      >
                        Paused
                      </p>
                    </div>
                    <div className="flex flex-col text-[26px] uppercase text-[#dfdacd]">
                      <button
                        type="button"
                        onClick={handlePauseResume}
                        className="border-b border-white/8 px-12 py-5 text-left transition hover:bg-white/[0.025]"
                        style={{ fontFamily: MENU_BUTTON_FONT_STACK, fontStretch: 'condensed' }}
                      >
                        Resume
                      </button>
                      <button
                        type="button"
                        onClick={handlePauseRestart}
                        className="border-b border-white/8 px-12 py-5 text-left transition hover:bg-white/[0.025]"
                        style={{ fontFamily: MENU_BUTTON_FONT_STACK, fontStretch: 'condensed' }}
                      >
                        Restart
                      </button>
                      <button
                        type="button"
                        onClick={() => setPauseMenuView('controls')}
                        className="border-b border-white/8 px-12 py-5 text-left transition hover:bg-white/[0.025]"
                        style={{ fontFamily: MENU_BUTTON_FONT_STACK, fontStretch: 'condensed' }}
                      >
                        Controls Guide
                      </button>
                      <button
                        type="button"
                        onClick={handlePauseQuit}
                        className="border-b border-white/8 px-12 py-5 text-left transition hover:bg-white/[0.025]"
                        style={{ fontFamily: MENU_BUTTON_FONT_STACK, fontStretch: 'condensed' }}
                      >
                        Quit
                      </button>
                    </div>
                    <div className="flex justify-center px-10 py-5">
                      <button
                        type="button"
                        onClick={handlePauseResume}
                        className="min-w-[132px] bg-[#d7d5d0] px-8 py-3 text-[24px] font-semibold uppercase leading-none text-black transition hover:bg-[#f1efeb]"
                        style={{ fontFamily: MENU_BUTTON_FONT_STACK, fontStretch: 'condensed' }}
                      >
                        Resume
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between border-b border-white/10 px-10 py-5">
                      <p
                        className="text-[54px] font-semibold uppercase leading-none tracking-[-0.05em] text-[#f3efe7]"
                        style={{
                          fontFamily: MENU_BUTTON_FONT_STACK,
                          fontStretch: 'condensed',
                          transform: 'scaleX(0.8)',
                          transformOrigin: 'left center',
                        }}
                      >
                        Controls Guide
                      </p>
                      <button
                        type="button"
                        onClick={() => setPauseMenuView('menu')}
                        className="text-[18px] uppercase tracking-[0.14em] text-white/70 transition hover:text-white"
                        style={{ fontFamily: MENU_BUTTON_FONT_STACK, fontStretch: 'condensed' }}
                      >
                        Back
                      </button>
                    </div>
                    <div className="px-10 py-8">
                      <table className="w-full border-collapse text-left text-[24px] uppercase text-[#dfdacd]">
                        <tbody>
                          {[
                            ['w', '瞄准'],
                            ['a', '左移'],
                            ['d', '右移'],
                            ['s', '站立'],
                          ].map(([key, label]) => (
                            <tr key={key} className="border-b border-white/8">
                              <td
                                className="w-[140px] px-4 py-4 text-[#d9b86d]"
                                style={{ fontFamily: MENU_BUTTON_FONT_STACK, fontStretch: 'condensed' }}
                              >
                                {key}
                              </td>
                              <td
                                className="px-4 py-4"
                                style={{ fontFamily: MENU_BUTTON_FONT_STACK, fontStretch: 'condensed' }}
                              >
                                {label}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {(view === 'practise' || view === 'beat-ai') && simulateConfirmOpen && (
            <div className="absolute right-4 top-40 z-30 w-[420px] rounded border border-white/10 bg-[#0b0a08]/95 px-4 py-4 text-[#f1ede4] shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/75">
                Simulate To End
              </div>
              <p className="mt-3 text-sm leading-6 text-[#ddd7ca]">
                {view === 'beat-ai'
                  ? 'Confirm simulating the rest of this match?'
                  : 'Confirm simulating the rest of this practice session?'}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (view === 'beat-ai') {
                      void runSimulatedMatchToEnd()
                    } else {
                      void runSimulatedPracticeToEnd()
                    }
                  }}
                  className="rounded bg-[#d9b86d] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-black hover:bg-[#ebca82]"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setSimulateConfirmOpen(false)}
                  className="rounded bg-black/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/85 hover:bg-black/85"
                >
                  No
                </button>
              </div>
            </div>
          )}

          {showSimulatedResult && simulatedResultMode && (
            <>
            <div className="absolute left-4 right-4 top-40 z-20 grid grid-cols-4 gap-4">
              <div className="h-[520px] overflow-hidden rounded border border-white/10 bg-[#0b0a08]/95 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/75">
                  <span>ShotSummary</span>
                  {simulatedShotSummary && (
                    <span className="text-white/45">Shots: {simulatedShotSummary.length}</span>
                  )}
                </div>
                <pre className="h-[calc(100%-49px)] overflow-auto px-4 py-3 text-[11px] leading-5 text-[#d9d3c6]">
                  {simulatedShotSummary ? JSON.stringify(simulatedShotSummary, null, 2) : debugPanel === 'shot' && debugJson ? JSON.stringify(debugJson, null, 2) : 'No data yet.'}
                </pre>
              </div>

              <div className="h-[520px] overflow-hidden rounded border border-white/10 bg-[#0b0a08]/95 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/75">
                  <span>TableSnapshot</span>
                  {latestSessionSummary && (
                    <span className="text-white/45">Session shots: {latestSessionSummary.shotCount}</span>
                  )}
                </div>
                <pre className="h-[calc(100%-49px)] overflow-auto px-4 py-3 text-[11px] leading-5 text-[#d9d3c6]">
                  {simulatedTableSnapshot ? JSON.stringify(simulatedTableSnapshot, null, 2) : debugPanel === 'snapshot' && debugJson ? JSON.stringify(debugJson, null, 2) : 'No data yet.'}
                </pre>
              </div>

              <div className="h-[520px] overflow-hidden rounded border border-white/10 bg-[#0b0a08]/95 px-4 py-4 text-[#f1ede4] shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-white/75">
                  <span>Settlement</span>
                  <span>{simulatedSettlement?.resultLabel ?? 'Summary'}</span>
                </div>
                <div className="mt-5 space-y-4">
                  <div className="rounded border border-white/8 bg-white/[0.03] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#9c9075]">Victory Prize</div>
                    <div className="mt-2 text-[26px] font-semibold text-[#f3efe7]">
                      {formatPrizeMoney(simulatedSettlement?.winPrize ?? 0)}
                    </div>
                  </div>
                  <div className="rounded border border-white/8 bg-white/[0.03] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#9c9075]">Break Prize</div>
                    <div className="mt-2 text-[26px] font-semibold text-[#f3efe7]">
                      {formatPrizeMoney(simulatedSettlement?.breakPrize ?? 0)}
                    </div>
                  </div>
                  <div className="rounded border border-[#d9b86d]/30 bg-[#1c1407] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#d9b86d]">Total</div>
                    <div className="mt-2 text-[34px] font-semibold text-[#f4de9a]">
                      {formatPrizeMoney(simulatedSettlement?.totalPrize ?? 0)}
                    </div>
                  </div>
                  {latestSessionSummary && (
                    <div className="pt-2 text-sm leading-6 text-[#d5cfbf]">
                      Score: {latestSessionSummary.score.player} - {latestSessionSummary.score.ai}
                      <br />
                      Highest Break: {latestSessionSummary.highestBreak}
                    </div>
                  )}
                </div>
              </div>

              <div className="h-[520px] overflow-hidden rounded border border-[#d9b86d]/35 bg-[#0b0a08]/95 px-4 py-4 text-[#f1ede4] shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-[#d9b86d]">
                  <span>AI教练点评</span>
                  <span>{coachReviewSource === 'llm' ? 'LLM' : 'Template'}</span>
                </div>
                <div className="mt-2 flex flex-col gap-1 text-[10px] uppercase tracking-[0.12em] text-[#9c9075]">
                  <span>Status: {isGeneratingCoachReview ? 'streaming' : 'done'}</span>
                  <span>Chunks: {coachReviewChunkCount}</span>
                  <span>Fallback: {coachReviewFallbackReason ?? 'none'}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#ddd7ca]">
                  {coachReviewDisplay || coachReview || 'No review yet.'}
                </p>
              </div>
            </div>
            <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 gap-3">
              <button
                type="button"
                onClick={handlePauseRestart}
                className="min-w-[150px] rounded bg-[#d9b86d] px-6 py-3 text-[14px] font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-[#ebca82]"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={handlePauseQuit}
                className="min-w-[150px] rounded bg-black/75 px-6 py-3 text-[14px] font-semibold uppercase tracking-[0.14em] text-white/90 transition hover:bg-black"
              >
                Quit
              </button>
            </div>
            </>
          )}

          {view === 'practise' && !showSimulatedResult && !debugPanel && (coachReview || isGeneratingCoachReview) && (
            <div className="absolute right-4 top-40 z-20 w-[420px] rounded border border-[#d9b86d]/35 bg-[#0b0a08]/95 px-4 py-4 text-[#f1ede4] shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-[#d9b86d]">
                <span>Coach Review</span>
                <span>{coachReviewSource === 'llm' ? 'LLM' : 'Template'}</span>
              </div>
              <div className="mt-2 flex flex-col gap-1 text-[10px] uppercase tracking-[0.12em] text-[#9c9075]">
                <span>Status: {isGeneratingCoachReview ? 'streaming' : 'done'}</span>
                <span>Chunks: {coachReviewChunkCount}</span>
                <span>Fallback: {coachReviewFallbackReason ?? 'none'}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#ddd7ca]">
                {coachReviewDisplay || coachReview || '...'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
