import { useEffect, useRef, useState } from 'react'
import { SnookerGame, type GamePhase } from '@/game/SnookerGame'
import { Scoreboard } from '@/components/Scoreboard'
import type { FoulInfo, RulesState } from '@/rules/SnookerRules'
import type { SessionSummary, ShotSummary, TableSnapshot } from '@/summary/types'

type AppView = 'guest' | 'menu' | 'practise'

const DEV_USER = {
  username: 'admin',
  prizeMoney: 1000,
  worldRanking: 16,
} as const

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
  breakScore: 0,
  ballOn: 'red',
  redsRemaining: 15,
  phase: 'reds',
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
  const [view, setView] = useState<AppView>('guest')
  const [phase, setPhase] = useState<GamePhase>('general')
  const [showCareer, setShowCareer] = useState(false)
  const [showMenuIdentity, setShowMenuIdentity] = useState(false)
  const [power, setPower] = useState(0.35)
  const [lastPotted, setLastPotted] = useState<string[]>([])
  const [shotBlocked, setShotBlocked] = useState<string | null>(null)
  const [rulesState, setRulesState] = useState<RulesState>(INITIAL_RULES_STATE)
  const [foulInfo, setFoulInfo] = useState<FoulInfo | null>(null)
  const [latestTableSnapshot, setLatestTableSnapshot] = useState<TableSnapshot | null>(null)
  const [latestShotSummary, setLatestShotSummary] = useState<ShotSummary | null>(null)
  const [latestSessionSummary, setLatestSessionSummary] = useState<SessionSummary | null>(null)
  const [debugPanel, setDebugPanel] = useState<'snapshot' | 'shot' | null>(null)

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
      game.dispose()
      gameRef.current = null
    }
  }, [])

  useEffect(() => {
    const game = gameRef.current
    if (!game) return

    const enableInput = view === 'practise'
    game.setInputEnabled(enableInput)

    if (enableInput) {
      setShotBlocked(null)
      setLastPotted([])
      setPower(game.getPower())
      setPhase(game.getPhase())
      setDebugPanel(null)
    }
  }, [view])

  const enterMenu = (): void => {
    setShowCareer(false)
    setShowMenuIdentity(true)
    setView('menu')
  }

  const handleBeatAi = (): void => {
    setShowCareer(false)
    setShowMenuIdentity(false)
  }

  const startPractise = (): void => {
    setShotBlocked(null)
    setLastPotted([])
    setFoulInfo(null)
    setRulesState(INITIAL_RULES_STATE)
    setShowCareer(false)
    setShowMenuIdentity(false)
    setView('practise')
  }

  const showGameHud = view === 'practise'
  const debugJson = debugPanel === 'snapshot'
    ? latestTableSnapshot
    : debugPanel === 'shot'
      ? latestShotSummary
      : null

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#1a1510]">
      <div ref={hostRef} className="h-full w-full" />

      {view !== 'practise' && (
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
              <MenuButton label="Career" onClick={() => setShowCareer((current) => !current)} />
            </>
          )}
        </div>
      )}

      {view === 'menu' && showMenuIdentity && (
        <div className="pointer-events-none absolute right-6 top-5 z-20 flex items-center gap-6 text-sm uppercase tracking-[0.18em] text-[#f1ede4]">
          <span>Player: {DEV_USER.username}</span>
        </div>
      )}

      {view === 'menu' && showCareer && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/18">
          <div className="relative min-w-[520px] bg-black px-10 py-8 text-[#f2f0ea] shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
            <button
              type="button"
              onClick={() => setShowCareer(false)}
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
              My Prize Money: {DEV_USER.prizeMoney} £
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
              World Ranking Now: {DEV_USER.worldRanking}
            </p>
          </div>
        </div>
      )}

      {showGameHud && (
        <>
          <div className="pointer-events-none absolute left-[17px] top-[18px] z-10">
            <Scoreboard
              playerName={DEV_USER.username}
              score={rulesState.playerScore}
              breakScore={rulesState.breakScore}
              ballOn={rulesState.ballOn}
            />
          </div>

          <div className="pointer-events-none absolute left-0 right-0 top-0 flex justify-between p-4 text-sm text-white/90">
            <div>
              <p className="font-semibold tracking-wide">AI Snooker — Practise</p>
              <p className="text-white/60">Move mouse to aim · Wheel = power · Space = shot · R = reset</p>
            </div>
            <div className="text-right">
              <p>Phase: {phase}</p>
              <p>Power: {Math.round(power * 100)}%</p>
              {lastPotted.length > 0 && (
                <p className="text-amber-300">Potted: {lastPotted.join(', ')}</p>
              )}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded bg-black/50 px-4 py-2 text-center text-xs text-white/80">
            Minimal table + balls + collision (club room in P3)
          </div>

          {shotBlocked && (
            <div className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 rounded bg-black/70 px-4 py-2 text-sm font-semibold tracking-wide text-amber-300">
              {shotBlocked}
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
            <button
              type="button"
              onClick={() => setDebugPanel((current) => current === 'snapshot' ? null : 'snapshot')}
              className="rounded bg-black/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/85 hover:bg-black/85"
            >
              TableSnapshot
            </button>
            <button
              type="button"
              onClick={() => setDebugPanel((current) => current === 'shot' ? null : 'shot')}
              className="rounded bg-black/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/85 hover:bg-black/85"
            >
              ShotSummary
            </button>
          </div>

          {debugPanel && (
            <div className="absolute right-4 top-40 z-20 h-[520px] w-[420px] overflow-hidden rounded border border-white/10 bg-[#0b0a08]/95 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/75">
                <span>{debugPanel === 'snapshot' ? 'Latest TableSnapshot' : 'Latest ShotSummary'}</span>
                {latestSessionSummary && (
                  <span className="text-white/45">Session shots: {latestSessionSummary.shotCount}</span>
                )}
              </div>
              <pre className="h-[calc(100%-49px)] overflow-auto px-4 py-3 text-[11px] leading-5 text-[#d9d3c6]">
                {debugJson ? JSON.stringify(debugJson, null, 2) : 'No data yet.'}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  )
}
