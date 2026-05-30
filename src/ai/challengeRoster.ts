export interface WorldRankingEntry {
  rank: number
  nameZh: string
  nameEn: string
  prizeGbp: number
}

export interface ChallengeOpponentPlan {
  personaId: string
  displayName: string
  rank: number
  prizeGbp: number
  challengeTier: 'entry' | 'mid' | 'boss' | 'final'
  positioning: string
  packaging: string
  whyNow: string
}

// Snapshot derived from src/data/worldranking.md.
export const WORLD_RANKING_SNAPSHOT: WorldRankingEntry[] = [
  { rank: 1, nameZh: '贾德·特鲁姆普', nameEn: 'Judd Trump', prizeGbp: 1655550 },
  { rank: 2, nameZh: '尼尔·罗伯逊', nameEn: 'Neil Robertson', prizeGbp: 1210550 },
  { rank: 3, nameZh: '赵心童', nameEn: 'Zhao Xintong', prizeGbp: 1176550 },
  { rank: 4, nameZh: '吴宜泽', nameEn: 'Wu Yize', prizeGbp: 1120900 },
  { rank: 5, nameZh: '约翰·希金斯', nameEn: 'John Higgins', prizeGbp: 968350 },
  { rank: 6, nameZh: '肖恩·墨菲', nameEn: 'Shaun Murphy', prizeGbp: 956800 },
  { rank: 7, nameZh: '马克·威廉姆斯', nameEn: 'Mark Williams', prizeGbp: 903400 },
  { rank: 8, nameZh: '凯伦·威尔逊', nameEn: 'Kyren Wilson', prizeGbp: 897100 },
  { rank: 9, nameZh: '马克·塞尔比', nameEn: 'Mark Selby', prizeGbp: 849350 },
  { rank: 10, nameZh: '巴里·霍金斯', nameEn: 'Barry Hawkins', prizeGbp: 685350 },
  { rank: 11, nameZh: '肖国栋', nameEn: 'Xiao Guodong', prizeGbp: 658900 },
  { rank: 12, nameZh: '马克·艾伦', nameEn: 'Mark Allen', prizeGbp: 587750 },
  { rank: 13, nameZh: '克里斯·韦克林', nameEn: 'Chris Wakelin', prizeGbp: 584200 },
  { rank: 14, nameZh: '罗尼·奥沙利文', nameEn: "Ronnie O'Sullivan", prizeGbp: 551250 },
  { rank: 15, nameZh: '丁俊晖', nameEn: 'Ding Junhui', prizeGbp: 464850 },
  { rank: 16, nameZh: '斯佳辉', nameEn: 'Si Jiahui', prizeGbp: 439400 },
]

export const HACKATHON_CHALLENGE_ROSTER: ChallengeOpponentPlan[] = [
  {
    personaId: 'ice',
    displayName: '丁俊晖',
    rank: 15,
    prizeGbp: 464850,
    challengeTier: 'entry',
    positioning: '入门挑战对象，代表“稳、细、讲质量”的正统强手。',
    packaging: '以名将光环做吸引力，但用当前第 15 名和较低奖金做可挑战叙事，像是需要认真应对但并非不可逾越的第一道大关。',
    whyNow: '知名度高，情绪表达克制，适合做玩家最先感知“不同人格”的样板。',
  },
  {
    personaId: 'ace',
    displayName: '赵心童',
    rank: 3,
    prizeGbp: 1176550,
    challengeTier: 'mid',
    positioning: '中段挑战对象，代表“快、敢、能一波带走”的开放局面杀手。',
    packaging: '把高排名和高奖金包装成“手热起来就很难拦”的上升期明星，对比丁俊晖形成明显代际和节奏差异。',
    whyNow: '排名高、中文用户辨识度强、打法观感好，演示里最容易打出人格记忆点。',
  },
  {
    personaId: 'granite',
    displayName: '马克·塞尔比',
    rank: 9,
    prizeGbp: 849350,
    challengeTier: 'boss',
    positioning: '中后段 Boss，对应“控局、磨人、不给机会”的耐心型噩梦。',
    packaging: '虽然排名不是前 3，但奖金和名声足以支撑“老练硬骨头”设定，重点卖点不是火力而是折磨感。',
    whyNow: '与进攻型角色形成最强反差，能证明 AI 对手不只是换皮台词。',
  },
  {
    personaId: 'crown',
    displayName: '贾德·特鲁姆普',
    rank: 1,
    prizeGbp: 1655550,
    challengeTier: 'final',
    positioning: '最终挑战对象，代表当前排名和奖金双顶的火力型头号目标。',
    packaging: '直接把世界第 1 和最高奖金包装成“当前版本最值钱的头号目标”，人格上强调接管比赛和舞台压迫感。',
    whyNow: '排名叙事最干净，终局目标清晰，适合黑客松 demo 的收束。',
  },
]

export const PERSONA_LAYERING_NOTES = [
  '入门层优先选高知名度但当前排名不在最顶的选手，降低“碰到传奇就像碰最终 Boss”的叙事跳跃。',
  '中层优先选观感最鲜明的进攻手，让用户在第二阶段明显感觉到人格和节奏变化。',
  'Boss 层优先选能制造压迫感的控制型选手，证明项目的人格系统不只是攻击性台词模板。',
  '最终层再使用排名和奖金都最强的头号种子，形成挑战闭环。',
] as const
