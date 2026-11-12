// 小黎的状态契约：$.state 中每个值的类型

/** 心情：决定像素形象的表情 */
export type Mood = 'idle' | 'watching' | 'happy' | 'worried' | 'sleepy' | 'proud' | 'shy'

/** 一个额度窗口（five_hour / seven_day / spend_limit） */
export type QuotaWindow = { kind: string; percentUsed: number; resetsAt?: string }

/** 最近一次测得的用量：上下文、额度、花费 */
export type Meter = {
  ctxTokens: number | null
  ctxWindow: number
  ctxPercent: number | null
  quotas: QuotaWindow[]
  usd: number | null
  model: string
}

/** 一轮对话的实际消耗，用来校准下一轮的预估 */
export type TurnRecord = {
  /** 发出时估算的首个请求输入（上下文 + 提示词） */
  base: number
  /** 整轮实际处理的输入：未缓存 + 缓存读 + 缓存写 */
  processed: number
  output: number
  /** 这一轮 5 小时额度涨了多少个百分点，拿不到为 null */
  quotaDelta: number | null
  ms: number
}

/** Claude 当前在干什么 */
export type Activity = {
  isBusy: boolean
  startedAt: number
  tools: number
  errors: number
  lastTool: string
}

/** 主对话当前用的模型和思考强度 */
export type Brain = {
  /** 模型 ID（claude-opus-5-5），显示时再缩成短名 */
  model: string
  /** 思考强度 low / medium / high / xhigh / max；'' 为模型不支持或还不知道 */
  effort: string
  /** true：取自最近一次真实请求；false：还没发过请求，取自设置 */
  isLive: boolean
}

/** 强提醒的种类：久坐、喝水、手动休息 */
export type RestKind = 'sit' | 'water' | 'manual'

/** 缓存保活：本会话的计时和今天的保活记录 */
export type KeepAlive = {
  /** 开关（/xiaoli keep on|off，跨会话记住） */
  isOn: boolean
  /** 主对话最后一次请求（含保活）的时间，计时起点；0 为还没有可保的缓存 */
  lastAt: number
  /** 最后一次真实对话请求的时间，设了上限（maxHours）时从这里算 */
  realAt: number
  /** 失败后几点重试，0 为不重试 */
  retryAt: number
  /** 停下的原因，'' 为没停；下次对话或 /xiaoli keep on 后清空 */
  stopped: string
  /** 保活请求正在路上 */
  isSending: boolean
  /** 次数和用量记在哪天，过 0 点清零 */
  day: string
  /** 本会话今天保活成功的次数 */
  count: number
  /** 本会话今天保活累计读缓存的 token */
  read: number
  /** 本会话今天保活累计输出的 token */
  output: number
  /** 上次保活的结果，'' 为今天还没保活过 */
  last: string
  /**
   * 可选上限：连续这么多小时没真实对话就停（1–72，/xiaoli keep max <小时>|off，跨会话记住）；
   * 0 为不设上限，一直保活到会话关闭（默认）
   */
  maxHours: number
}

/**
 * 跨会话记住的偏好（存在 $.store 的 prefs）。老版本存的没有后加的字段，读的时候逐个判断类型，缺的按默认
 */
export type Prefs = {
  isExpanded: boolean
  isQuiet: boolean
  isAiLines: boolean
  /** 缓存保活开关 */
  isKeepAlive: boolean
  /** 缓存保活上限（小时，1–72）；0 或没有这个字段为不设上限，一直保活到会话关闭 */
  keepMaxHours: number
}

/**
 * 额度提醒的去重记录（存在 $.store 的 quotaAlerts，多个会话、热重载共用）：
 * 键是「额度种类:重置时间」，同一个键就是同一个额度窗口；值是提醒的时刻（毫秒时间戳），窗口过了就清掉
 */
export type QuotaAlertLog = Record<string, number>

/** 跨会话保留的档案（同时写入 $.store） */
export type Profile = {
  firstMet: string
  lastDay: string
  days: number
  pets: number
  snacks: number
  turns: number
  tokens: number
}

declare module 'claude-code' {
  interface PluginState {
    xiaoke: {
      mood: Mood
      say: string
      meter: Meter
      turns: TurnRecord[]
      activity: Activity
      draft: number
      now: number
      profile: Profile
      isQuiet: boolean
      /** 用户选的模式：false 工作模式（收起），true 放松模式（展开） */
      isExpanded: boolean
      /** 强制休息到什么时候（毫秒时间戳），期间强制展开，0 为没在休息 */
      restUntil: number
      /** 正在强提醒的种类 */
      restKind: RestKind
      /** 强提醒框里的那句话（摸头、真实台词都不会冲掉它） */
      restText: string
      /** 今天已经提醒过的整点（多个会话共用，来自 $.store 的 reminders） */
      reminded: number[]
      /** 主对话当前的模型和思考强度 */
      brain: Brain
      isHidden: boolean
      /** 每摸一次加一，形象据此冒爱心 */
      petSeq: number
      /** 每说一句新台词加一，形象据此动动嘴 */
      saySeq: number
      /** 刚点过的按钮，短暂高亮作为按下反馈 */
      pressed: string
      /** 点开的状态卡片（status / model / quota / ctx / forecast / rest / keep），'' 为都收着 */
      openCard: string
      /** 点击校准模式 */
      isCalibrating: boolean
      /** 点击口径：终端上报列 = off + Σ(英文 1 列，中文 cjk 列) */
      clickMap: { off: number; cjk: number }
      /**
       * 真实台词开关（/xiaoli ai on|off）：只管每轮结束时自动让 haiku 结合实际发生的事说一句（开始时是零 token 的模板句）；
       * 「悄悄话」是用户主动点的，不受这个开关影响
       */
      isAiLines: boolean
      /** 真实台词累计调用次数和 token */
      aiCost: { calls: number; input: number; output: number }
      /** 真实台词最近一次的结果（成功 / 失败原因） */
      aiLast: string
      /** 今天的开工时间（今天最早开的会话），毫秒时间戳 */
      workStart: number
      isWhispering: boolean
      /** 上一句悄悄话的花费说明 */
      lastWhisper: string
      /** 小小黎侧栏开关（来自环境变量 XIAOXIAOLI_PANE）：show 时按钮显示「收工」，其余为 hide，显示「干活」 */
      workbenchPane: 'show' | 'hide'
      /** 缓存保活：主对话 50 分钟没请求就旁路请求一次，续上 1 小时的提示词缓存 */
      keep: KeepAlive
      /** 本会话跑过 session.start 没有：之后再来的（热重载）不算全新启动，不查自动更新 */
      isStarted: boolean
    }
  }
}
