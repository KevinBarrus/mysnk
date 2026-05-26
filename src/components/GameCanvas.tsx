import { useEffect, useRef, useState } from 'react'
import { SnookerGame, type GamePhase } from '@/game/SnookerGame'

export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<SnookerGame | null>(null)
  const [phase, setPhase] = useState<GamePhase>('aiming')
  const [power, setPower] = useState(0.35)
  const [lastPotted, setLastPotted] = useState<string[]>([])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const game = new SnookerGame(host)
    gameRef.current = game
    game.setCallbacks({
      onPhaseChange: (p) => {
        setPhase(p)
        setPower(game.getPower())
      },
      onPotted: (ids) => setLastPotted(ids),
    })

    const interval = setInterval(() => {
      if (gameRef.current) setPower(gameRef.current.getPower())
    }, 100)

    return () => {
      clearInterval(interval)
      game.dispose()
      gameRef.current = null
    }
  }, [])

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#1a1510]">
      <div ref={hostRef} className="h-full w-full" />

      <div className="pointer-events-none absolute left-0 right-0 top-0 flex justify-between p-4 text-sm text-white/90">
        <div>
          <p className="font-semibold tracking-wide">AI Snooker — P1</p>
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
    </div>
  )
}
