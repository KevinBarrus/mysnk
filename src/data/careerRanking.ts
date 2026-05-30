import { WORLD_RANKING, type WorldRankingEntry } from '@/data/worldRanking'

export const DEV_PLAYER_PROFILE = {
  username: 'admin',
  prizeMoney: 1000,
  worldRanking: 16,
} as const

export type ChallengeTier = 'A' | 'B' | 'C' | 'D'

export interface CareerRankingEntry extends WorldRankingEntry {
  displayName: string
  challengeTier: ChallengeTier
  isPlayer: boolean
}

function getDisplayName(name: string): string {
  const match = name.match(/（(.+)）/)
  return match?.[1] ?? name
}

function getChallengeTier(rank: number): ChallengeTier {
  if (rank >= 13) return 'D'
  if (rank >= 9) return 'C'
  if (rank >= 5) return 'B'
  return 'A'
}

export const CAREER_RANKING: CareerRankingEntry[] = WORLD_RANKING.map((entry) => {
  const isPlayer = entry.rank === DEV_PLAYER_PROFILE.worldRanking

  if (isPlayer) {
    return {
      ...entry,
      name: DEV_PLAYER_PROFILE.username,
      displayName: DEV_PLAYER_PROFILE.username,
      prizeMoney: DEV_PLAYER_PROFILE.prizeMoney,
      challengeTier: getChallengeTier(entry.rank),
      isPlayer: true,
    }
  }

  return {
    ...entry,
    displayName: getDisplayName(entry.name),
    challengeTier: getChallengeTier(entry.rank),
    isPlayer: false,
  }
})

export const NEXT_CHALLENGER =
  CAREER_RANKING.find((entry) => entry.rank === DEV_PLAYER_PROFILE.worldRanking - 1) ?? null

