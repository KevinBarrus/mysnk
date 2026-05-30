import type { ReactNode } from 'react'
import type { BallOnIndicator } from '@/rules/SnookerRules'

interface ScoreboardProps {
  playerName: string
  score: number
  breakScore: number
  ballOn: BallOnIndicator
}

const SCOREBOARD_FONT_STACK = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif'

const BALL_SWATCH: Record<string, string> = {
  red: '#c81724',
  yellow: '#efc23b',
  green: '#136a3d',
  brown: '#6c3d1f',
  blue: '#265fcb',
  pink: '#d7839c',
  black: '#161616',
}

// Six colour segments for the "any colour" indicator (after potting a red)
const COLOR_SEGMENTS = [
  { color: '#efc23b', rotation: 0 },    // yellow
  { color: '#136a3d', rotation: 60 },   // green
  { color: '#6c3d1f', rotation: 120 },  // brown
  { color: '#265fcb', rotation: 180 },  // blue
  { color: '#d7839c', rotation: 240 },  // pink
  { color: '#161616', rotation: 300 },  // black
]

function ScoreboardPanel({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative h-[54px] w-[536px] overflow-hidden bg-[#0d0b07] text-white shadow-[0_1px_0_rgba(255,255,255,0.04)]"
      style={{
        clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 64%, 23px 64%, 23px 67%, 0 67%)',
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.012),rgba(255,255,255,0.002))]" />
      <div className="absolute inset-0 bg-[linear-gradient(176deg,transparent_0%,transparent_30%,rgba(255,255,255,0.028)_31%,transparent_32%,transparent_56%,rgba(255,255,255,0.012)_57%,transparent_58%,transparent_100%)] opacity-45" />
      <div className="absolute inset-y-0 right-0 w-[102px] bg-[#eda62a]" />
      <div className="relative flex h-full items-center">{children}</div>
    </div>
  )
}

function BallIndicator({ ballOn }: { ballOn: BallOnIndicator }) {
  if (ballOn === 'color') {
    // Multi-colour pie: 6 equal segments, one per colour ball
    const r = 12.5
    const cx = 12.5
    const cy = 12.5
    const segments = COLOR_SEGMENTS.map(({ color, rotation }) => {
      const startRad = (rotation - 90) * (Math.PI / 180)
      const endRad = (rotation + 60 - 90) * (Math.PI / 180)
      const x1 = cx + r * Math.cos(startRad)
      const y1 = cy + r * Math.sin(startRad)
      const x2 = cx + r * Math.cos(endRad)
      const y2 = cy + r * Math.sin(endRad)
      return (
        <path
          key={color}
          d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
          fill={color}
        />
      )
    })
    return (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full border border-white/95 bg-transparent overflow-hidden">
        <svg width="25" height="25" viewBox="0 0 25 25" className="rounded-full overflow-hidden">
          {segments}
        </svg>
      </div>
    )
  }

  return (
    <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full border border-white/95 bg-transparent">
      <div
        className="h-[25px] w-[25px] rounded-full border-[0.5px] border-white/95"
        style={{ backgroundColor: BALL_SWATCH[ballOn] }}
      />
    </div>
  )
}

export function Scoreboard({ playerName, score, breakScore, ballOn }: ScoreboardProps) {
  return (
    <ScoreboardPanel>
      <div className="flex w-[240px] items-center pl-[30px]">
        <span
          className="text-[30px] leading-none font-semibold uppercase tracking-[-0.015em] text-[#f1ede4]"
          style={{
            fontFamily: SCOREBOARD_FONT_STACK,
            fontStretch: 'condensed',
            transform: 'scaleX(0.82) scaleY(1.08)',
            transformOrigin: 'left center',
            textRendering: 'geometricPrecision',
            WebkitFontSmoothing: 'antialiased',
            letterSpacing: '-0.02em',
          }}
        >
          {playerName}
        </span>
      </div>

      <div className="flex w-[54px] justify-center">
        <BallIndicator ballOn={ballOn} />
      </div>

      <div className="flex w-[140px] items-baseline justify-start gap-[14px] pl-[18px] text-[#efebe1]">
        <span
          className="text-[18px] leading-none font-semibold tracking-normal"
          style={{
            fontFamily: SCOREBOARD_FONT_STACK,
            fontStretch: 'condensed',
            transform: 'scaleX(1.00) scaleY(1.00)',
            transformOrigin: 'left center',
            textRendering: 'geometricPrecision',
            WebkitFontSmoothing: 'antialiased',
            letterSpacing: '-0.01em',
          }}
        >
          BRK
        </span>
        <span
          className="min-w-[16px] text-[18px] leading-none font-semibold tracking-normal"
          style={{
            fontFamily: SCOREBOARD_FONT_STACK,
            fontStretch: 'condensed',
            transform: 'scaleX(1.20) scaleY(1.20)',
            transformOrigin: 'left center',
            textRendering: 'geometricPrecision',
            WebkitFontSmoothing: 'antialiased',
            letterSpacing: '-0.01em',
          }}
        >
          {breakScore}
        </span>
      </div>

      <div className="flex w-[102px] items-center justify-center">
        <span
          className="text-[51px] leading-none font-semibold tracking-normal text-black"
          style={{
            fontFamily: SCOREBOARD_FONT_STACK,
            fontStretch: 'condensed',
            transform: 'scaleX(0.62) scaleY(0.60)',
            transformOrigin: 'center center',
            textRendering: 'geometricPrecision',
            WebkitFontSmoothing: 'antialiased',
            letterSpacing: '0',
          }}
        >
          {score}
        </span>
      </div>
    </ScoreboardPanel>
  )
}
