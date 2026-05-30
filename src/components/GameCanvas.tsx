import { useEffect, useRef, useState } from 'react'
import { SnookerGame, type GamePhase } from '@/game/SnookerGame'
import { Scoreboard } from '@/components/Scoreboard'
import type { FoulInfo, RulesState } from '@/rules/SnookerRules'

type AppView = 'guest' | 'menu' | 'practise'

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
  const [power, setPower] = useState(0.35)
  const [lastPotted, setLastPotted] = useState<string[]>([])
  const [shotBlocked, setShotBlocked] = useState<string | null>(null)
  const [rulesState, setRulesState] = useState<RulesState>(INITIAL_RULES_STATE)
  const [foulInfo, setFoulInfo] = useState<FoulInfo | null>(null)

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
    }
  }, [view])

  const enterMenu = (): void => {
    setView('menu')
  }

  const startPractise = (): void => {
    setShotBlocked(null)
    setLastPotted([])
    setFoulInfo(null)
    setRulesState(INITIAL_RULES_STATE)
    setView('practise')
  }

  const showGameHud = view === 'practise'

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
              <MenuButton label="Beat AI" onClick={() => undefined} />
              <MenuButton label="Practise" onClick={startPractise} />
            </>
          )}
        </div>
      )}

      {view === 'menu' && (
        <div className="pointer-events-none absolute right-6 top-5 z-20 flex items-center gap-6 text-sm uppercase tracking-[0.18em] text-[#f1ede4]">
          <span>Guest Player</span>
          <span className="text-[#d7b36a]">GBP 0</span>
        </div>
      )}

      {showGameHud && (
        <>
          <div className="pointer-events-none absolute left-[17px] top-[18px] z-10">
            <Scoreboard
              playerName="PLAYER 1"
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
        </>
      )}
    </div>
  )
}
