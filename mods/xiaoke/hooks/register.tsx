// 小克：趴在输入框上方的陪伴形象。实时围观 Claude 干活、点击互动、预估 token 与额度。
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TextProps } from 'claude-code'

import type { Activity, Brain, KeepAlive, Meter, Mood, Prefs, Profile, QuotaAlertLog, QuotaWindow, RestKind, TurnRecord } from '../types'
import { bubbleWidth } from './bubble'
import type { BubbleProps } from './bubble'
import type { ClickMap, ControlItem, ControlStyle } from './controls'
import {
  bar,
  brainLabel,
  dayKey,
  estimateTokens,
  fmtDuration,
  fmtSpan,
  fmtTokens,
  forecast,
  hhmm,
  localParts,
  padWidth,
  prettyModel,
  resetLabel,
  workDayStart,
} from './estimate'
import {
  KEEP_PROMPT,
  NEW_KEEP,
  judgeFork,
  keepCostLine,
  keepLimitNote,
  keepLimitText,
  keepStatusLine,
  keepStep,
  noteRequest,
  parseMaxHours,
  resumeKeep,
  rollDay,
  settleKeep,
  validMaxHours,
} from './keepalive'
import type { KeepOutcome } from './keepalive'
import * as L from './lines'
import { cleanLine, donePrompt, isWorthReacting, reactSystem, startEcho } from './react'
import type { TurnFacts } from './react'
import { ALERT_MS, SCHEDULE, doneHours, kindAt, nextSlot, readLog } from './remind'
import type { RemindKind } from './remind'
import { CHECKED_DAY_KEY, CHECK_DELAY_MS, MANIFEST_FILE, NOTICE_TIMEOUT_MS, RUN_TIMEOUT_MS, runUpdateCheck } from './update'
import type { UpdatePortsType } from './update'

type Dollar = EngineInterface

/** 与 avatar.tsx 的 AVATAR_SIZE 保持一致 */
const AVATAR = { full: { columns: 18, rows: 4 }, mini: { columns: 9, rows: 2 } } as const
/** 按钮按下后高亮多久 */
const PRESS_FLASH_MS = 1200
/** 点开的状态卡片多久没再点就自动收起 */
const CARD_AUTO_CLOSE_MS = 20_000
/** 开心、担心等情绪保持多久后回落 */
const MOOD_HOLD_MS = 20_000
/** 斜杠命令 /xiaoke 的说明与参数提示 */
const COMMAND_HELP =
  '切换工作/放松模式（rest 休息，quiet 切换安静、quiet on/off 安静开关，ai on/off 每轮结束自动说话（不影响悄悄话），keep on/off 缓存保活（默认一直保活到会话关闭，keep max 小时数|off 设或取消上限），calibrate 点击校准，hide 隐藏，show 显示）'
const COMMAND_HINT =
  '[rest|quiet|quiet on|quiet off|ai on|ai off|keep|keep on|keep off|keep max <小时>|keep max off|calibrate|hide|show]'
/** 手动 /xiaoke rest 休息 2 分钟（久坐、喝水是定点强提醒，时间表和时长见 remind.ts） */
const MANUAL_REST_MS = 2 * 60_000
/** 最近这么久没动静（没打字、没对话、没点小克）就算人不在：到点先不提醒，这个小时内回来再补 */
const AWAY_MS = 30 * 60_000
/** 每隔多久对一下主对话的模型（/model 切换后不用等下一次请求） */
const MODEL_CHECK_MS = 10_000
/** 提醒气泡：标题、颜色（久坐橙、喝水蓝、手动休息绿）、完成按钮的文字 */
const ALERT_STYLE: Record<RestKind, { title: string; color: string; done: string }> = {
  sit: { title: '久坐提醒 · 起来走走', color: '#ff9f43', done: '我起来啦' },
  water: { title: '喝水提醒 · 喝口水', color: '#38bdf8', done: '喝完啦' },
  manual: { title: '休息一下', color: '#4ade80', done: '休息好啦' },
}
/** 完成按钮前 1 分钟锁着，之后才能提前结束 */
const LOCK_MS = 60_000
const LOCKED_LABEL = (left: string) => `${left} 后可点`
const KIND_LABEL: Record<RemindKind, string> = { sit: '久坐', water: '喝水' }
const LONG_TURN_MS = 120_000
const WHISPER_MODEL = 'haiku'
/** 真实台词两次调用至少隔多久，连续快速问答时不重复花 token */
const REACT_MIN_GAP_MS = 20_000
/** 状态卡片的边框色 */
const CARD_BORDER = 'suggestion'
/** 额度提醒去重记录在 $.store 里的键；没有重置时间的窗口记录多久后作废 */
const QUOTA_ALERTS_KEY = 'quotaAlerts'
const QUOTA_ALERT_TTL_MS = 5 * 3_600_000

/** 台词颜色跟小克身体颜色走（与 avatar.tsx 的 BODY_COLOR 保持一致） */
const MOOD_COLOR: Record<Mood, string> = {
  idle: '#4f8ff7',
  watching: '#22c3d6',
  happy: '#ff8fb6',
  shy: '#ff8fb6',
  proud: '#f5b942',
  worried: '#a78bfa',
  sleepy: '#8a94b8',
}

/** 没有 Client 的表面退回颜文字 */
const FACE: Record<Mood, string> = {
  idle: '(=^-^=)',
  watching: '(=o.o=)',
  happy: '(=^w^=)',
  worried: '(=;_;=)',
  sleepy: '(=-.-=) zZ',
  proud: '(=^v^=)b',
  shy: '(=^///^=)',
}

const EMPTY_METER: Meter = { ctxTokens: null, ctxWindow: 0, ctxPercent: null, quotas: [], usd: null, model: '' }
const IDLE: Activity = { isBusy: false, startedAt: 0, tools: 0, errors: 0, lastTool: '' }
const NEW_PROFILE: Profile = { firstMet: '', lastDay: '', days: 0, pets: 0, snacks: 0, turns: 0, tokens: 0 }
const NO_BRAIN: Brain = { model: '', effort: '', isLive: false }

const mood = atom({ plugin: 'xiaoke', key: 'mood' } as const, 'idle')
const say = atom({ plugin: 'xiaoke', key: 'say' } as const, '')
const meter = atom({ plugin: 'xiaoke', key: 'meter' } as const, EMPTY_METER)
const turns = atom({ plugin: 'xiaoke', key: 'turns' } as const, [])
const activity = atom({ plugin: 'xiaoke', key: 'activity' } as const, IDLE)
const draft = atom({ plugin: 'xiaoke', key: 'draft' } as const, 0)
const now = atom({ plugin: 'xiaoke', key: 'now' } as const, 0)
const profile = atom({ plugin: 'xiaoke', key: 'profile' } as const, NEW_PROFILE)
const isQuiet = atom({ plugin: 'xiaoke', key: 'isQuiet' } as const, false)
/** 默认收起 = 工作模式；展开 = 放松模式 */
const isExpanded = atom({ plugin: 'xiaoke', key: 'isExpanded' } as const, false)
/** 强制休息到什么时候（毫秒时间戳），0 为没在休息 */
const restUntil = atom({ plugin: 'xiaoke', key: 'restUntil' } as const, 0)
const restKind = atom({ plugin: 'xiaoke', key: 'restKind' } as const, 'manual')
const restText = atom({ plugin: 'xiaoke', key: 'restText' } as const, '')
/** 今天已经提醒过的整点（多个会话共用） */
const reminded = atom({ plugin: 'xiaoke', key: 'reminded' } as const, [])
/** 主对话当前的模型和思考强度 */
const brain = atom({ plugin: 'xiaoke', key: 'brain' } as const, NO_BRAIN)
const isHidden = atom({ plugin: 'xiaoke', key: 'isHidden' } as const, false)
const petSeq = atom({ plugin: 'xiaoke', key: 'petSeq' } as const, 0)
const isWhispering = atom({ plugin: 'xiaoke', key: 'isWhispering' } as const, false)
const lastWhisper = atom({ plugin: 'xiaoke', key: 'lastWhisper' } as const, '')
const saySeq = atom({ plugin: 'xiaoke', key: 'saySeq' } as const, 0)
const pressed = atom({ plugin: 'xiaoke', key: 'pressed' } as const, '')
const openCard = atom({ plugin: 'xiaoke', key: 'openCard' } as const, '')
/** 点击校准模式（/xiaoke calibrate 开关） */
const isCalibrating = atom({ plugin: 'xiaoke', key: 'isCalibrating' } as const, false)
/** 点击口径：终端上报列 = off + Σ(英文 1 列，中文 cjk 列)；正常终端 off 0、cjk 2，校准后跨会话记住 */
const clickMap = atom({ plugin: 'xiaoke', key: 'clickMap' } as const, { off: 0, cjk: 2 })
/**
 * 真实台词：每轮结束时自动让 haiku 结合实际发生的事说一句（开始时是零 token 的模板句）；
 * /xiaoke ai on|off 只开关这一项，用户主动点的「悄悄话」不受影响
 */
const isAiLines = atom({ plugin: 'xiaoke', key: 'isAiLines' } as const, true)
/** 真实台词累计花了多少 token */
const aiCost = atom({ plugin: 'xiaoke', key: 'aiCost' } as const, { calls: 0, input: 0, output: 0 })
/** 真实台词最近一次的结果（成功 / 失败原因），排查用 */
const aiLast = atom({ plugin: 'xiaoke', key: 'aiLast' } as const, '还没调用过')
/** 今天的开工时间：今天最早开的会话（跨会话共享，存在 $.store 的 workDay） */
const workStart = atom({ plugin: 'xiaoke', key: 'workStart' } as const, 0)
/** 小小黎侧栏开关：每秒从环境变量 XIAOXIAOLI_PANE 同步，决定开关按钮显示「干活」还是「收工」 */
const workbenchPane = atom({ plugin: 'xiaoke', key: 'workbenchPane' } as const, 'hide')
/** 缓存保活：计时、开关和本会话今天的次数（/xiaoke keep on|off） */
const keep = atom({ plugin: 'xiaoke', key: 'keep' } as const, NEW_KEEP)
/** 本会话跑过 session.start 没有：热重载后 $.state 还在，据此认出不是全新启动 */
const isStarted = atom({ plugin: 'xiaoke', key: 'isStarted' } as const, false)

// 模块变量：热重载后清空，在 session.start 里从 $.state 恢复
let currentMood: Mood = 'idle'
let moodSetAt = 0
let quiet = false
let busy = false
let lastMeter: Meter = EMPTY_METER
let lastDraft = 0
let turnBase = 0
let turnQuotaStart: number | null = null
let sessionStartedAt = 0
let lastActiveAt = 0
/** 上一跳之后有没有打字、点小克（在 tick 里统一记活跃时间） */
let isActiveSinceTick = false
let lastNowWrite = 0
/** 本会话已经处理过的提醒整点（'2026-10-15 10'），处理过就不再去读 $.store */
let handledSlot = ''
/** 上次写进 $.state 的模型和思考强度，没变就不写（每个模型请求都会来一次） */
let brainKey = ''
let lastModelCheck = 0
/** 上次 $.session.model() 读到的模型，变了才算用户切了模型 */
let lastSessionModel = ''
let pressedAt = 0
let cardOpenedAt = 0
let restEndsAt = 0
/** 本会话的上下文 ≥80% 提醒（额度提醒的去重记在 $.store，多个会话共用） */
const alerted = new Set<string>()
// 真实台词用的「这一轮」素材
let turnPrompt = ''
let turnTouched: string[] = []
let turnToolCounts: Record<string, number> = {}
/** 待生成的真实台词；每次排队序号 +1，生成慢了被新的盖过就丢弃 */
let pendingReact: { seq: number; system: string; prompt: string } | null = null
let reactSeq = 0
let isReacting = false
let lastReactAt = 0
/** 今天是哪天、今天几点开工 */
let workDay = { day: '', at: 0 }
/** 缓存保活的状态（$.state 里 keep 的镜像），每跳都要看，不用每次去读 */
let keepAlive: KeepAlive = NEW_KEEP
/** 保活的 $.model.fork 正在路上：这期间的 turn.step 可能是保活自己引起的，不算主对话的真实请求 */
let isKeepForking = false
/** 带子最近一次给的高度（行）：点小克时按实际画出来的样子判断，放不下 4 行就只有小个子 */
let bandRows: number = AVATAR.full.rows

type UsageLike = {
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]
  cost?: { usd: number }
}

function toMeter(u: UsageLike, model: string): Meter {
  return {
    ctxTokens: u.context.tokens ?? null,
    ctxWindow: u.context.window,
    ctxPercent: u.context.percent ?? null,
    quotas: u.rateLimits.map(r =>
      r.resetsAt === undefined
        ? { kind: r.kind, percentUsed: r.percentUsed }
        : { kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt },
    ),
    usd: u.cost?.usd ?? null,
    model,
  }
}

const fiveHourOf = (m: Meter): QuotaWindow | undefined => m.quotas.find(q => q.kind === 'five_hour')

function kindLabel(kind: string): string {
  if (kind === 'five_hour') return '5 小时'
  if (kind === 'seven_day') return '7 天'
  if (kind === 'spend_limit') return '消费上限'
  return kind.replace(/^seven_day_/, '7 天·')
}

function shortKind(kind: string): string {
  if (kind === 'five_hour') return '5h'
  if (kind === 'seven_day') return '7d'
  return kindLabel(kind)
}

function tone(percent: number): string {
  if (percent < 60) return 'success'
  if (percent < 85) return 'warning'
  return 'error'
}

/** 工具调用的简短描述：文件取文件名，命令截前 28 个字符 */
function describeTool(e: unknown): string {
  const args = e as Record<string, unknown>
  const pickString = (key: string) => (typeof args[key] === 'string' ? (args[key] as string) : '')
  const path = pickString('file_path') || pickString('path') || pickString('notebook_path')
  const target = path
    ? path.replace(/^.*[\\/]/, '')
    : pickString('command') || pickString('pattern') || pickString('description') || pickString('url') || pickString('query')
  const short = target.length > 28 ? `${target.slice(0, 28)}…` : target
  return short ? `${String(args.tool)} ${short}` : String(args.tool)
}

async function setMood($: Dollar, next: Mood): Promise<void> {
  currentMood = next
  moodSetAt = await $.clock.now()
  await update($, mood, () => next)
}

async function speak($: Dollar, text: string, next?: Mood): Promise<void> {
  await update($, say, () => text)
  await update($, saySeq, n => n + 1)
  if (next !== undefined) await setMood($, next)
}

/** 一轮做完：值得说才排队等 tick 交给 haiku；新的排队会让还没回来的旧台词作废 */
async function queueReaction($: Dollar, extra: Omit<TurnFacts, 'prompt'>): Promise<void> {
  const t = await $.clock.now()
  const facts: TurnFacts = { prompt: turnPrompt, ...extra }
  const skip = quiet
    ? '安静模式'
    : !(await read($, isAiLines))
      ? '已关闭'
      : turnPrompt.trim() === ''
        ? '这轮没有文字提问'
        : !isWorthReacting(facts)
          ? '被打断或闲聊，不值得花 token'
          : t - lastReactAt < REACT_MIN_GAP_MS
            ? '离上次调用太近'
            : ''
  if (skip !== '') {
    $.ui.log(`xiaoke react: 跳过（${skip}）`, { to: 'debug' })
    return
  }
  lastReactAt = t
  reactSeq += 1
  pendingReact = { seq: reactSeq, system: reactSystem(), prompt: donePrompt(facts) }
  $.ui.log(`xiaoke react: 排队 #${reactSeq}`, { to: 'debug' })
}

/** 记一笔真实台词的结果：状态卡片看得到，debug 日志也有 */
async function noteReaction($: Dollar, text: string): Promise<void> {
  const t = await $.clock.now()
  const stamped = `${hhmm(t)} ${text}`
  await update($, aiLast, () => stamped)
  $.ui.log(`xiaoke react: ${stamped}`, { to: 'debug' })
}

/** tick 里调用：一次只跑一个 haiku 请求，回来时如果已经有更新的排队就丢掉这句 */
async function runReaction($: Dollar): Promise<void> {
  if (isReacting || pendingReact === null) return
  const job = pendingReact
  pendingReact = null
  isReacting = true
  try {
    const r = await $.model.complete({
      model: WHISPER_MODEL,
      system: job.system,
      prompt: job.prompt,
      // 一句 30 字以内的中文，60 token 足够
      maxTokens: 60,
      effort: 'low',
      timeoutMs: 20_000,
    })
    const input = r.usage.input_tokens + r.usage.cache_read_input_tokens + r.usage.cache_creation_input_tokens
    await update($, aiCost, c => ({ calls: c.calls + 1, input: c.input + input, output: c.output + r.usage.output_tokens }))
    if (!r.isAnswered) {
      const why = r.reason === 'api-error' ? `接口错误 ${r.status ?? ''} ${r.error}` : r.reason === 'aborted' ? '被中断/超时' : '模型没回文字'
      await noteReaction($, `✗ ${why}`)
      return
    }
    const text = cleanLine(r.text)
    // 生成期间又有新一轮排队了：这句已经过时，不说
    if (job.seq !== reactSeq) {
      await noteReaction($, `↷ #${job.seq} 已过时，丢弃`)
    } else if (text !== '' && !quiet) {
      await speak($, text)
      await noteReaction($, `✓ #${job.seq} 入 ${input} / 出 ${r.usage.output_tokens}`)
    }
  } catch (err) {
    // 模型不可用就保持词库里的那句，但把原因记下来
    await noteReaction($, `✗ 调用失败：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    isReacting = false
  }
}

async function setMeter($: Dollar, next: Meter): Promise<void> {
  lastMeter = next
  await update($, meter, () => next)
}

const brainKeyOf = (b: Brain) => `${b.model}|${b.effort}|${b.isLive}`

/** 记下主对话的模型和思考强度，没变就不写 */
async function noteBrain($: Dollar, next: Brain): Promise<void> {
  const key = brainKeyOf(next)
  if (key === brainKey) return
  brainKey = key
  await update($, brain, () => next)
}

/** 设置里的思考强度（effortLevel），没设为 '' */
async function effortSetting($: Dollar): Promise<string> {
  const settings = await $.settings.read()
  return typeof settings.effortLevel === 'string' ? settings.effortLevel : ''
}

/**
 * /model 切换后不用等下一次请求：定时对一下主对话设置的模型，它自己变了才更新，
 * 免得把真实请求报上来的（比如临时降级的）模型来回改；思考强度等下一次请求再更新
 */
async function refreshModel($: Dollar): Promise<void> {
  const model = await $.session.model()
  if (model === lastSessionModel) return
  lastSessionModel = model
  const cur = await read($, brain)
  if (model !== '' && model !== cur.model) await noteBrain($, { ...cur, model })
}

/** 读额度提醒的去重记录，顺手丢掉已经过去的窗口（过了重置时间；没有重置时间的 5 小时后作废） */
function liveQuotaAlerts(stored: unknown, nowMs: number): QuotaAlertLog {
  if (typeof stored !== 'object' || stored === null) return {}
  const live: QuotaAlertLog = {}
  for (const [key, at] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof at !== 'number') continue
    const resetsAt = Date.parse(key.slice(key.indexOf(':') + 1))
    const endsAt = Number.isNaN(resetsAt) ? at + QUOTA_ALERT_TTL_MS : resetsAt
    if (endsAt > nowMs) live[key] = at
  }
  return live
}

/**
 * 额度或上下文过线时提醒一次。额度：同一个窗口（种类 + 重置时间）所有会话合计只提醒一次，
 * 记录放在 $.store，热重载后也不重复；上下文：本会话过 80% 提醒一次，降回 50% 以下再重新算
 */
async function checkAlerts($: Dollar, m: Meter): Promise<void> {
  for (const q of m.quotas) {
    if (q.percentUsed < 80) continue
    const key = `${q.kind}:${q.resetsAt ?? ''}`
    const t = await $.clock.now()
    const log = liveQuotaAlerts(await $.store.get(QUOTA_ALERTS_KEY), t)
    if (log[key] !== undefined) continue
    await $.store.set(QUOTA_ALERTS_KEY, { ...log, [key]: t })
    const text = L.fill(L.QUOTA_HIGH, {
      kind: kindLabel(q.kind),
      p: q.percentUsed,
      reset: resetLabel(q.kind, q.resetsAt) || '稍后会恢复',
    })
    // 安静模式也照常弹 toast：关系到还能不能继续用；只是小克不开口
    $.ui.toast(`小克：${text}`, { timeoutMs: 8000 })
    if (!quiet) await speak($, text, 'worried')
  }
  if (m.ctxPercent === null) return
  if (m.ctxPercent < 50) alerted.delete('ctx')
  if (m.ctxPercent >= 80 && !alerted.has('ctx')) {
    alerted.add('ctx')
    if (!quiet) await speak($, L.fill(L.CTX_HIGH, { p: m.ctxPercent }), 'worried')
  }
}

/** 读档案并记今天见过面：$.store 里的 lastDay 不是今天才加一天（会话开始、会话里跨 0 点都走这里） */
async function loadProfile($: Dollar, nowMs: number): Promise<Profile> {
  const stored = await $.store.get('profile')
  const today = dayKey(nowMs)
  const base: Profile =
    typeof stored === 'object' && stored !== null
      ? { ...NEW_PROFILE, ...(stored as Partial<Profile>) }
      : { ...NEW_PROFILE, firstMet: today }
  const next = base.lastDay === today ? base : { ...base, lastDay: today, days: base.days + 1 }
  await $.store.set('profile', next)
  await update($, profile, () => next)
  return next
}

async function saveProfile($: Dollar, change: (p: Profile) => Profile): Promise<Profile> {
  const next = await update($, profile, change)
  await $.store.set('profile', next)
  return next
}

/** 展开/安静/真实台词/缓存保活开关和上限偏好跨会话记住 */
async function savePrefs($: Dollar): Promise<void> {
  const prefs: Prefs = {
    isExpanded: await read($, isExpanded),
    isQuiet: await read($, isQuiet),
    isAiLines: await read($, isAiLines),
    isKeepAlive: keepAlive.isOn,
    keepMaxHours: keepAlive.maxHours,
  }
  await $.store.set('prefs', prefs)
}

async function loadPrefs($: Dollar): Promise<void> {
  const stored = await $.store.get('prefs')
  if (typeof stored !== 'object' || stored === null) return
  const prefs = stored as { [K in keyof Prefs]?: unknown }
  // 保活上限：老版本存的没有这个字段，按不限处理
  const maxHours = validMaxHours(prefs.keepMaxHours)
  const isOn = typeof prefs.isKeepAlive === 'boolean' ? prefs.isKeepAlive : keepAlive.isOn
  await setKeep($, { ...keepAlive, isOn, maxHours })
  if (typeof prefs.isAiLines === 'boolean') {
    const v = prefs.isAiLines
    await update($, isAiLines, () => v)
  }
  if (typeof prefs.isExpanded === 'boolean') {
    const v = prefs.isExpanded
    await update($, isExpanded, () => v)
  }
  if (typeof prefs.isQuiet === 'boolean') {
    const v = prefs.isQuiet
    await update($, isQuiet, () => v)
  }
}

/** 每秒一跳：忙碌时刷新计时、情绪回落、卡片自动收起、久坐/喝水提醒（形象动画在 avatar.tsx 里自己跑） */
async function tick($: Dollar): Promise<void> {
  const t = await $.clock.now()
  // 打字、点小克只在这里记一笔活跃时间，避免每次按键都多一次 $ 调用
  if (isActiveSinceTick) {
    isActiveSinceTick = false
    lastActiveAt = t
  }
  if (t - lastModelCheck >= MODEL_CHECK_MS) {
    lastModelCheck = t
    await refreshModel($)
  }
  // 干活或休息倒计时时每秒刷新，平时 10 秒一次（会话已工作时长只到分钟）
  if (busy || restEndsAt > 0 || t - lastNowWrite >= 10_000) {
    lastNowWrite = t
    await update($, now, () => t)
  }
  if (restEndsAt > 0 && t >= restEndsAt) {
    restEndsAt = 0
    await update($, restUntil, () => 0)
    await speak($, L.pick(L.REST_DONE), 'happy')
  }
  if (!quiet && t - moodSetAt > MOOD_HOLD_MS) {
    // 强提醒期间一直害羞脸红地盯着你
    const calm: Mood = restEndsAt > t ? 'shy' : busy ? 'watching' : 'idle'
    if (currentMood !== calm) await setMood($, calm)
  }
  if (pressedAt > 0 && t - pressedAt >= PRESS_FLASH_MS) {
    pressedAt = 0
    await update($, pressed, () => '')
  }
  if (cardOpenedAt > 0 && t - cardOpenedAt >= CARD_AUTO_CLOSE_MS) {
    cardOpenedAt = 0
    await update($, openCard, () => '')
  }
  await remind($, t)
  // 过了 0 点：新的一天从 0 点开始算；见面天数也加一（按 $.store 档案里的 lastDay 去重，多个会话一天只加一次）
  if (workDay.day !== '' && dayKey(t) !== workDay.day) {
    workDay = workDayStart(await $.store.get('workDay'), sessionStartedAt, t)
    await $.store.set('workDay', workDay)
    await update($, workStart, () => workDay.at)
    await loadProfile($, t)
  }
  await syncWorkbench($)
  // 真实台词、缓存保活：不 await，请求要几秒，别卡住每秒一跳
  void runReaction($)
  void runKeep($, t)
}

async function setKeep($: Dollar, next: KeepAlive): Promise<void> {
  keepAlive = next
  await update($, keep, () => next)
}

/**
 * 缓存保活：主对话最后一次请求后 50 分钟没新请求，就 $.model.fork 旁路请求一次（不进对话历史），
 * 读一遍主对话的缓存把寿命续上；默认不设上限，只要会话开着就一直保活到会话关闭。
 * 来不及、没命中、失败重试后仍失败、或设了上限（/xiaoke keep max）且连续这么久没对话就停下，下次对话或 /xiaoke keep on 后恢复。
 * 安静模式下保活成功不弹 toast、小克也不开口；失败和停下的 toast 照常弹（用户得知道）
 */
async function runKeep($: Dollar, t: number): Promise<void> {
  const rolled = rollDay(keepAlive, dayKey(t))
  const step = keepStep(rolled, t)
  if (step.kind === 'wait') {
    if (rolled !== keepAlive) await setKeep($, rolled)
    return
  }
  if (step.kind === 'stop') {
    await setKeep($, { ...rolled, stopped: step.reason, retryAt: 0 })
    $.ui.toast(`小克：${step.reason}，下次对话后恢复`, { timeoutMs: 8000 })
    return
  }
  // 第一个 await 之前就标上 isSending，下一跳不会重复发
  await setKeep($, { ...rolled, isSending: true })
  let outcome: KeepOutcome
  // fork 在路上时引擎若也为它跑 turn.step，别被当成主对话的真实请求（否则设了上限时永远到不了）
  isKeepForking = true
  try {
    outcome = judgeFork(await $.model.fork({ prompt: KEEP_PROMPT }))
  } catch (err) {
    outcome = { kind: 'fail', why: err instanceof Error ? err.message : String(err), read: 0, output: 0 }
  } finally {
    isKeepForking = false
  }
  // 用回来时的最新状态结算：发送期间主对话可能自己发过请求
  const settled = settleKeep(keepAlive, outcome, t, await $.clock.now())
  await setKeep($, settled.next)
  $.ui.log(`xiaoke keep: ${settled.next.last || outcome.kind}`, { to: 'debug' })
  // 安静模式：成功的 toast 不弹（不打扰）；失败、停下的照常弹
  const isQuietSuccess = settled.isKept && quiet
  if (settled.toast !== '' && !isQuietSuccess) $.ui.toast(settled.toast, { timeoutMs: 8000 })
  if (settled.isKept && !quiet) await speak($, L.fill(L.pick(L.KEEP_DONE), { n: settled.next.count }), 'happy')
}

/** 每秒对一下小小黎侧栏的开关：用户可能用 /xiaoxiaoli、面板的关闭键等别的方式开关过 */
async function syncWorkbench($: Dollar): Promise<void> {
  try {
    const pane = (await $.env.get('XIAOXIAOLI_PANE')) === 'show' ? 'show' : 'hide'
    if (pane !== (await read($, workbenchPane))) await update($, workbenchPane, () => pane)
  } catch {
    // 读不到环境变量时保持原样，不影响每秒一跳的其他事
  }
}

/**
 * 定点提醒：10、12、16、18 点久坐，11、15、17 点喝水，各强提醒 3 分钟。
 * 到点时人不在电脑前就先不弹，这个小时内回来了再补；同一个整点多个会话只算一次（记在 $.store），
 * 别的会话刚弹过、还在 3 分钟里的，这边也跟着一起亮。
 */
async function remind($: Dollar, t: number): Promise<void> {
  const hour = localParts(t).hour
  const kind = kindAt(hour)
  if (kind === undefined || quiet) return
  const day = dayKey(t)
  const slot = `${day} ${hour}`
  if (handledSlot === slot) return
  if (!busy && t - lastActiveAt > AWAY_MS) return
  handledSlot = slot
  const log = readLog(await $.store.get('reminders'), day)
  const firedAt = log.done[String(hour)]
  const text = L.fill(L.pick(kind === 'sit' ? L.SIT : L.WATER), { hh: hour })
  if (firedAt === undefined) {
    const next = { day, done: { ...log.done, [String(hour)]: t } }
    await $.store.set('reminders', next)
    await update($, reminded, () => doneHours(next))
    await startRest($, kind, text, ALERT_MS)
    // 终端通知（按用户自己的通知设置：系统通知或响铃）；发不出去也不影响带子里的提醒
    void $.ui.notify(text, { title: `小克 · ${ALERT_STYLE[kind].title}` }).catch(() => undefined)
    return
  }
  await update($, reminded, () => doneHours(log))
  const endsAt = firedAt + ALERT_MS
  // 热重载后接着同一个倒计时，不重复开一次
  if (t < endsAt && restEndsAt < endsAt) await startRest($, kind, text, endsAt - t)
}

/** 强提醒：带子展开成醒目的提醒框（就在小克旁边），倒计时结束前收不回去 */
async function startRest($: Dollar, kind: RestKind, text: string, durationMs: number): Promise<void> {
  const t = await $.clock.now()
  restEndsAt = t + durationMs
  const until = restEndsAt
  await update($, restUntil, () => until)
  await update($, restKind, () => kind)
  await update($, restText, () => text)
  await update($, openCard, () => '')
  await update($, now, () => t)
  await speak($, text, 'shy')
}

const restTotal = (kind: RestKind) => (kind === 'manual' ? MANUAL_REST_MS : ALERT_MS)

/** 气泡里点了完成：前 1 分钟还锁着就撒个娇，之后提前收起并夸一句 */
async function onRestDone($: Dollar): Promise<void> {
  const t = await $.clock.now()
  if (restEndsAt <= t) return
  const kind = await read($, restKind)
  const unlockAt = restEndsAt - restTotal(kind) + LOCK_MS
  // 还锁着：气泡里那句换成撒娇（按钮上有倒计时）
  if (t < unlockAt) {
    await update($, restText, () => L.REST_LOCKED)
    await speak($, L.REST_LOCKED, 'shy')
    return
  }
  restEndsAt = 0
  await update($, restUntil, () => 0)
  await update($, now, () => t)
  await speak($, L.pick(L.REST_FINISHED[kind]), 'proud')
}

/** 倒计时文字 m:ss */
function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function personaStatus(a: Activity, m: Meter, nowMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - sessionStartedAt) / 60_000))
  const doing = a.isBusy ? `Claude 正在干活（已调用 ${a.tools} 次工具）` : '这会儿空闲'
  const trouble = a.errors > 0 ? `，刚才工具失败了 ${a.errors} 次` : ''
  const q = fiveHourOf(m)
  const quota = q === undefined ? '' : `，5 小时额度用了 ${q.percentUsed}%`
  return `现在 ${hhmm(nowMs)}，本次已陪伴约 ${minutes} 分钟，${doing}${trouble}${quota}。`
}

async function onPet($: Dollar): Promise<void> {
  await update($, petSeq, n => n + 1)
  const p = await saveProfile($, x => ({ ...x, pets: x.pets + 1 }))
  const line = p.pets % 10 === 0 ? L.fill(L.PET_MILESTONE, { n: p.pets }) : L.pick(L.PET)
  await speak($, line, p.pets % 3 === 0 ? 'shy' : 'happy')
}

async function onFeed($: Dollar): Promise<void> {
  await update($, petSeq, n => n + 1)
  await saveProfile($, x => ({ ...x, snacks: x.snacks + 1 }))
  await speak($, L.pick(L.FEED), 'happy')
}

async function onPraise($: Dollar): Promise<void> {
  await speak($, L.pick(L.PRAISE), 'proud')
}

async function onQuiet($: Dollar): Promise<void> {
  await setQuiet($, !quiet)
}

/**
 * 安静模式：完全不打扰、不花 token。每轮结束不调模型说话、不弹定点提醒、点「悄悄话」只回一句固定台词（不调模型）、
 * 保活成功不弹 toast；额度到 80%、保活失败或停下的 toast 照常弹。命令和按钮都走这里
 */
async function setQuiet($: Dollar, isOn: boolean): Promise<void> {
  quiet = await update($, isQuiet, () => isOn)
  await savePrefs($)
  await speak($, quiet ? L.QUIET_ON : L.QUIET_OFF, quiet ? 'sleepy' : 'happy')
}

async function onToggleExpand($: Dollar): Promise<void> {
  // 强制休息中：收不回去，撒个娇
  const t = await $.clock.now()
  if (restEndsAt > t) {
    await speak($, L.fill(L.pick(L.REST_STAY), { left: countdown(restEndsAt - t) }), 'shy')
    return
  }
  await update($, isExpanded, v => !v)
  await savePrefs($)
}

/**
 * 点小克本身：工作模式里是展开，放松模式里是摸头。按实际画出来的样子判断：
 * 带子放不下 4 行时只画得出 2 行的小个子，展不开，就说一句提示，不改模式、不加好感
 */
async function onAvatarClick($: Dollar): Promise<void> {
  if (bandRows < AVATAR.full.rows) {
    await speak($, L.TOO_SHORT)
    return
  }
  const t = await $.clock.now()
  const isRelaxing = (await read($, isExpanded)) || restEndsAt > t
  if (isRelaxing) await onPet($)
  else await onToggleExpand($)
}

type ActionKey = 'workToggle' | 'pet' | 'feed' | 'praise' | 'whisper' | 'quiet' | 'expand'

/** 按钮按下：先亮一下作为反馈，再执行动作（$ 只能传给顶层函数，所以按 key 分发） */
async function press($: Dollar, key: ActionKey): Promise<void> {
  pressedAt = await $.clock.now()
  await update($, pressed, () => key)
  if (key === 'pet') await onPet($)
  else if (key === 'feed') await onFeed($)
  else if (key === 'praise') await onPraise($)
  else if (key === 'whisper') await onWhisper($)
  else if (key === 'quiet') await onQuiet($)
  else if (key === 'workToggle') await onWorkToggle($)
  else await onToggleExpand($)
}

/** 干活 / 收工开关：切到另一侧，先改按钮文字再通知小小黎，不等下一跳 */
async function onWorkToggle($: Dollar): Promise<void> {
  const value = (await read($, workbenchPane)) === 'show' ? 'hide' : 'show'
  await update($, workbenchPane, () => value)
  await setWorkbench($, value)
}

/** 干活 / 收工：写进程环境变量 XIAOXIAOLI_PANE，小小黎每 0.5 秒轮询一次，据此打开或收起它的侧栏 */
async function setWorkbench($: Dollar, value: 'show' | 'hide'): Promise<void> {
  await $.env.set('XIAOXIAOLI_PANE', value)
  if (value !== 'show') return
  // 再走一次 /xiaoxiaoli show，让面板算作用户请求打开，不受 144 列门槛限制
  try {
    await $.command.run({ command: 'xiaoxiaoli', args: 'show' })
  } catch {
    // 小小黎未加载时忽略
  }
}

/** 校准完成：存下点击口径，退出校准，切到放松模式让用户马上试 */
async function onCalibrated($: Dollar, map: ClickMap): Promise<void> {
  await update($, clickMap, () => map)
  await $.store.set('clickMap', map)
  await update($, isCalibrating, () => false)
  await update($, isExpanded, () => true)
  await savePrefs($)
  await speak($, `校准好啦：你的终端每个中文按 ${map.cjk.toFixed(2)} 列上报。现在点按钮试试准不准～`, 'happy')
}

const ACTION_KEYS: readonly ActionKey[] = ['workToggle', 'pet', 'feed', 'praise', 'whisper', 'quiet', 'expand']
const CARD_KEYS: readonly CardKey[] = ['status', 'model', 'quota', 'ctx', 'forecast', 'rest', 'keep']

/** 自绘控件被点中：胶囊开卡片，按钮走 press */
async function onControl($: Dollar, key: string): Promise<void> {
  const card = CARD_KEYS.find(k => `chip-${k}` === key)
  if (card !== undefined) {
    await toggleCard($, card)
    return
  }
  const act = ACTION_KEYS.find(k => k === key)
  if (act !== undefined) await press($, act)
}

type CardKey = 'status' | 'model' | 'quota' | 'ctx' | 'forecast' | 'rest' | 'keep'

/** 点状态胶囊：打开它的卡片；再点一次收起，点别的就切过去 */
async function toggleCard($: Dollar, key: CardKey): Promise<void> {
  cardOpenedAt = await $.clock.now()
  await update($, openCard, cur => (cur === key ? '' : key))
}

/**
 * 悄悄话：点一下，小克看着你此刻的状态主动说一句（走 haiku，花费显示在状态行）。
 * 是用户主动点的，/xiaoke ai off 之后照样调用；只有安静模式下不调模型，直接回一句固定台词（零 token）
 */
async function onWhisper($: Dollar): Promise<void> {
  if (quiet) {
    await speak($, L.WHISPER_QUIET, 'sleepy')
    return
  }
  if (await read($, isWhispering)) return
  await update($, isWhispering, () => true)
  await setMood($, 'watching')
  const nowMs = await $.clock.now()
  const status = personaStatus(await read($, activity), await read($, meter), nowMs)
  let text: string
  let cost = ''
  try {
    const r = await $.model.complete({
      model: WHISPER_MODEL,
      system: L.whisperSystem(),
      prompt: L.whisperPrompt(status),
      maxTokens: 120,
      effort: 'low',
      timeoutMs: 20_000,
    })
    if (r.isAnswered) {
      // 和真实台词同一套清洗：取第一行、去引号和自称前缀，按人设里的字数上限截断
      text = cleanLine(r.text, L.WHISPER_MAX_CHARS)
      const input = r.usage.input_tokens + r.usage.cache_read_input_tokens + r.usage.cache_creation_input_tokens
      cost = `悄悄话 入 ${input} / 出 ${r.usage.output_tokens} token`
    } else {
      text = `唔…一时想不出说什么（${r.reason}），先陪你安静待会儿`
    }
  } catch (err) {
    text = `唔…这会儿连不上（${err instanceof Error ? err.message : String(err)}）`
  }
  await update($, lastWhisper, () => cost)
  await update($, isWhispering, () => false)
  await speak($, text, 'happy')
}

/** 本 mod 的名字：自动更新取主分支上 mods/<它>/ 下的文件，插件市场安装时更新 <它>@<市场名> */
const MOD_NAME = 'xiaoke'

/** 读一个文件，读不到为 '' */
async function readText($: Dollar, path: string): Promise<string> {
  try {
    return await $.fs.read(path)
  } catch {
    return ''
  }
}

/**
 * 自动更新要用的外部能力（流程见 hooks/update.ts 的 runUpdateCheck，和工作台同一份）：只 GET 两个公开地址、不带请求头；
 * 只运行 claude plugin marketplace update 与 claude plugin update 两条命令；两个 mod 经进程环境变量 XIAOLI_MODS_UPDATING 错开更新，
 * 经 XIAOLI_MODS_RELOAD_AT 只发起一次 /reload-plugins
 */
async function updatePortsOf($: Dollar): Promise<UpdatePortsType> {
  const root = $.plugin.root
  return {
    mod: MOD_NAME,
    subject: '陪伴猫',
    root,
    today: dayKey(await $.clock.now()),
    readCheckedDay: () => $.store.get(CHECKED_DAY_KEY),
    writeCheckedDay: async day => {
      await $.store.set(CHECKED_DAY_KEY, day)
    },
    readManifest: () => readText($, `${root.replace(/[\\/]+$/, '')}/${MANIFEST_FILE}`),
    fetchText: async url => {
      try {
        const response = await $.http.fetch(url)
        return response.ok && response.text.trim() !== '' ? response.text : null
      } catch {
        return null
      }
    },
    isBusy: async () => busy,
    readLock: () => $.env.get('XIAOLI_MODS_UPDATING'),
    writeLock: async value => {
      await $.env.set('XIAOLI_MODS_UPDATING', value)
    },
    readReloadAt: () => $.env.get('XIAOLI_MODS_RELOAD_AT'),
    writeReloadAt: async value => {
      await $.env.set('XIAOLI_MODS_RELOAD_AT', value)
    },
    now: () => $.clock.now(),
    sleep: ms => $.clock.sleep(ms),
    run: argv => $.process.run(argv, { timeoutMs: RUN_TIMEOUT_MS }),
    canReload: async () => {
      try {
        return (await $.command.list()).some(i => i.name === 'reload-plugins' && i.source === 'builtin')
      } catch {
        return false
      }
    },
    reload: async () => {
      try {
        await $.command.run({ command: 'reload-plugins', args: '' })
      } catch (cause) {
        $.ui.log(`自动更新：发起 /reload-plugins 失败：${cause instanceof Error ? cause.message : String(cause)}`, { to: 'debug' })
        $.ui.toast('小克：没能自动重新加载插件，输入 /reload-plugins 立即生效，或下次开会话自动生效')
      }
    },
    notify: async notice => {
      $.ui.toast(`小克：${notice.toast}`, { timeoutMs: NOTICE_TIMEOUT_MS })
      $.ui.log(`小克：${notice.log}`)
    },
    log: text => $.ui.log(`自动更新：${text}`, { to: 'debug' }),
  }
}

/** 会话启动后延后查一次有没有新版（每台机器每天成功查过一次就不再查）；出错只记调试日志，不打扰使用 */
async function checkUpdate($: Dollar): Promise<void> {
  try {
    $.ui.log(`自动更新：${await runUpdateCheck(await updatePortsOf($))}`, { to: 'debug' })
  } catch (cause) {
    try {
      $.ui.log(`自动更新出错：${cause instanceof Error ? cause.message : String(cause)}`, { to: 'debug' })
    } catch {
      // 记不了日志也不影响使用
    }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // 本会话第一次跑 session.start 才算全新启动；热重载再来的看 $.state 认出来
    const isFreshStart = !(await read($, isStarted))
    if (isFreshStart) await update($, isStarted, () => true)
    // 命令只有 /xiaoke：猫叫小克，名字和插件标识一致；改名期间加的 /xiaoli 已去掉
    await $.command.register({
      name: 'xiaoke',
      description: `小克：${COMMAND_HELP}`,
      argumentHint: COMMAND_HINT,
    })
    const t = await $.clock.now()
    const usage = await $.session.usage()
    sessionStartedAt = usage.startedAt
    // 今天的开工时间：和其它会话共用 $.store，取今天最早开的那个
    workDay = workDayStart(await $.store.get('workDay'), sessionStartedAt, t)
    await $.store.set('workDay', workDay)
    await update($, workStart, () => workDay.at)
    lastActiveAt = t
    lastNowWrite = t
    lastModelCheck = t
    moodSetAt = t
    handledSlot = ''
    // 今天已经提醒过哪些整点（多个会话共用）
    const remindedHours = doneHours(readLog(await $.store.get('reminders'), dayKey(t)))
    await update($, reminded, () => remindedHours)
    // 模型和思考强度：还没发过请求就先按设置显示；热重载时保留上次真实请求的
    lastSessionModel = await $.session.model()
    const knownBrain = await read($, brain)
    brainKey = brainKeyOf(knownBrain)
    if (!knownBrain.isLive) {
      await noteBrain($, { model: lastSessionModel, effort: await effortSetting($), isLive: false })
    }
    // 热重载时接着原来的保活计时；重载前在路上的那次请求已经随旧模块丢了。
    // 先铺一层默认值：从老版本热重载过来的状态里没有后加的字段（maxHours），按默认的不限处理
    await setKeep($, rollDay({ ...NEW_KEEP, ...(await read($, keep)), isSending: false }, dayKey(t)))
    await loadPrefs($)
    quiet = await read($, isQuiet)
    currentMood = await read($, mood)
    // 热重载时接着上次没走完的休息倒计时
    restEndsAt = await read($, restUntil)
    // 上次校准过的点击口径
    const savedMap = await $.store.get('clickMap')
    if (typeof savedMap === 'object' && savedMap !== null) {
      const sm = savedMap as { off?: unknown; cjk?: unknown }
      if (typeof sm.off === 'number' && typeof sm.cjk === 'number') {
        const restored = { off: sm.off, cjk: sm.cjk }
        await update($, clickMap, () => restored)
      }
    }
    await setMeter($, toMeter(usage, (await read($, meter)).model))
    await update($, now, () => t)
    const prof = await loadProfile($, t)
    if ((await read($, say)) === '') {
      const hour = localParts(t).hour
      await speak($, L.greeting(hour, prof.days), hour >= 23 || hour < 5 ? 'sleepy' : 'happy')
    }
    $.clock.every(1000, () => {
      void tick($)
    })
    // 自动更新：全新启动、有人在终端前时延后查一次；热重载、-p 与 SDK 的会话不查
    if (isFreshStart && e.isInteractive && e.surface !== null) $.clock.after(CHECK_DELAY_MS, () => void checkUpdate($))
    return result
  })

  // /xiaoke 的处理；/xiaoli 不再注册，也不在这里响应
  on('command.run', { command: 'xiaoke' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'hide') {
      await update($, isHidden, () => true)
      return { text: '小克：那我先躲起来啦，/xiaoke show 随时叫我' }
    }
    // 只有 show 让藏起来的小克出来；查状态、开关、打错参数都不顺带取消隐藏
    if (arg === 'show') {
      await update($, isHidden, () => false)
      return { text: '小克：我回来啦～' }
    }
    const hiddenNote = (await read($, isHidden)) ? '（我还藏着，/xiaoke show 叫我出来才看得到）' : ''
    if (arg === 'rest') {
      await startRest($, 'manual', L.pick(L.REST_MANUAL), MANUAL_REST_MS)
      return { text: '小克：好，休息 2 分钟，到点我自动收起～' }
    }
    if (arg === 'calibrate') {
      const isOn = await update($, isCalibrating, v => !v)
      return {
        text: isOn
          ? `小克：校准模式开了。先点 [A] 中间的 A，再点 [B] 中间的 B，校准完自动退出；/xiaoke calibrate 也能退出。带子要有 ${AVATAR.full.rows} 行高才画得出 [A][B]，看不到就先把窗口拉高${hiddenNote}`
          : '小克：校准模式关了',
      }
    }
    if (arg === 'quiet on' || arg === 'quiet off' || arg === 'quiet') {
      await setQuiet($, arg === 'quiet' ? !quiet : arg === 'quiet on')
      return { text: quiet ? '小克：好，我安静待着，/xiaoke quiet off 叫我说话' : '小克：我回来啦，继续陪你说话～' }
    }
    if (arg === 'ai on' || arg === 'ai off') {
      const isOn = arg === 'ai on'
      await update($, isAiLines, () => isOn)
      await savePrefs($)
      const cost = await read($, aiCost)
      return {
        text: isOn
          ? `小克：好，每轮结束时我用 haiku 结合这一轮真实发生的事说一句（目前累计 ${cost.calls} 次，入 ${cost.input} / 出 ${cost.output} token）`
          : // ai off 只关每轮结束的自动台词；悄悄话是用户主动点的，照样调用
            '小克：好，每轮结束不再自动说话了（不花 token）；点「悄悄话」仍会调用一次',
      }
    }
    // /xiaoke keep max <小时>|off：可选的保活上限，默认不设；跨会话记住
    const maxArg = /^keep max(?:\s+(.*))?$/.exec(arg)
    if (maxArg !== null) {
      const t = await $.clock.now()
      const hours = parseMaxHours(maxArg[1] ?? '')
      if (hours === null) {
        return {
          text: `小克：上限要填 1–72 的整数小时，比如 /xiaoke keep max 12；/xiaoke keep max off 取消上限。现在：${keepLimitNote(keepAlive)}`,
        }
      }
      await setKeep($, { ...keepAlive, maxHours: hours })
      await savePrefs($)
      return {
        text:
          hours > 0
            ? `小克：好，保活上限设为 ${hours} 小时：连续 ${hours} 小时没对话就停（跨会话记住，/xiaoke keep max off 取消）。${keepStatusLine(keepAlive, t)}`
            : `小克：好，保活不设上限了：只要会话开着、保活开着，就一直保活到会话关闭（跨会话记住）。${keepStatusLine(keepAlive, t)}`,
      }
    }
    if (arg === 'keep' || arg === 'keep on' || arg === 'keep off') {
      const t = await $.clock.now()
      if (arg === 'keep') return { text: `小克：${keepStatusLine(keepAlive, t)}。${keepLimitNote(keepAlive)}` }
      const isOn = arg === 'keep on'
      // keep on：停下的立刻恢复（见 resumeKeep），回复里的状态句和卡片一致
      await setKeep($, isOn ? resumeKeep(keepAlive, t) : { ...keepAlive, isOn, retryAt: 0 })
      await savePrefs($)
      return {
        text: isOn
          ? `小克：缓存保活开了，主对话 50 分钟没请求我就续一下缓存，${keepLimitText(keepAlive)}。${keepStatusLine(keepAlive, t)}`
          : '小克：缓存保活关了，/xiaoke keep on 再打开',
      }
    }
    // 认不出的参数（比如把 rest 打成 reset）只给用法，不误切模式
    if (arg !== '') {
      return {
        text: `小克：不认识「${arg}」。用法：/xiaoke 切换工作/放松模式 · /xiaoke rest 休息 2 分钟 · /xiaoke quiet 切换安静模式（quiet on|off 指定开关） · /xiaoke ai on|off 每轮结束自动说话开关（悄悄话不受影响） · /xiaoke keep on|off 缓存保活（/xiaoke keep 看状态；默认一直保活到会话关闭，/xiaoke keep max 小时数|off 设或取消上限） · /xiaoke calibrate 点击校准 · /xiaoke hide 隐藏 · /xiaoke show 显示`,
      }
    }
    // 强提醒中：收不回去，撒个娇
    const t = await $.clock.now()
    if (restEndsAt > t) return { text: `小克：${L.fill(L.pick(L.REST_STAY), { left: countdown(restEndsAt - t) })}` }
    const expanded = await update($, isExpanded, v => !v)
    await savePrefs($)
    return { text: `${expanded ? '小克：展开啦' : '小克：缩小一点陪你'}${hiddenNote}` }
  })

  // 打字时实时估算输入框的 token（显示在输入框下方的提示行）
  on('prompt.edit', async ($, e, next) => {
    const result = await next(e)
    isActiveSinceTick = true
    const n = estimateTokens(result.text)
    if (n !== lastDraft) {
      lastDraft = n
      await update($, draft, () => n)
    }
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    lastDraft = 0
    await update($, draft, () => 0)
    return result
  })

  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    // 子代理（含队友）每次运行也会来 turn.start：只看主对话，不动这一轮的状态、也不说话
    if (e.agentId !== undefined) return result
    const t = await $.clock.now()
    busy = true
    lastActiveAt = t
    const prev = await read($, turns)
    turnBase = (lastMeter.ctxTokens ?? 0) + (prev.at(-1)?.output ?? 0) + estimateTokens(e.text)
    turnQuotaStart = fiveHourOf(lastMeter)?.percentUsed ?? null
    await update($, activity, () => ({ isBusy: true, startedAt: t, tools: 0, errors: 0, lastTool: '' }))
    await update($, now, () => t)
    // 记下这一轮的素材，给真实台词用
    turnPrompt = e.text
    turnTouched = []
    turnToolCounts = {}
    if (quiet) {
      await setMood($, 'sleepy')
    } else {
      // 提问时不花 token：模板句直接引用问题开头；没文字（比如续跑）就用词库句
      const echo = e.text.trim() === '' ? L.pick(L.TURN_START) : startEcho(e.text, n => Math.floor(Math.random() * n))
      await speak($, echo, 'watching')
    }
    return result
  })

  // 每个模型请求发出前：记下主对话实际用的模型和思考强度，缓存保活从这一刻重新计时（子代理的不算）
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const effort = e.effort === undefined ? '' : typeof e.effort === 'number' ? fmtTokens(e.effort) : e.effort
      await noteBrain($, { model: e.model, effort, isLive: true })
      // 保活 fork 在路上、主对话又没在跑一轮：这次请求多半是保活自己，不记成真实请求
      // （保活成功后从发出时重新计时，由 runKeep 里的 settleKeep 负责）
      const isOwnKeep = isKeepForking && !busy
      if (!isOwnKeep) await setKeep($, noteRequest(keepAlive, await $.clock.now()))
    }
    return yield* next(e)
  })

  // 实时围观每一次工具调用（只看主对话，子代理不打扰）
  on('tool.call', async ($, e, next) => {
    const isMain = e.agentId === undefined
    if (isMain) {
      const what = describeTool(e)
      turnTouched = [...turnTouched, what].slice(-12)
      turnToolCounts = { ...turnToolCounts, [e.tool]: (turnToolCounts[e.tool] ?? 0) + 1 }
      void update($, activity, a => ({ ...a, tools: a.tools + 1, lastTool: what }))
    }
    const ran = await next(e)
    if (!isMain || quiet) return ran
    if (ran.deny !== undefined) {
      await speak($, L.pick(L.DENIED))
    } else if (ran.isError === true) {
      const a = await update($, activity, x => ({ ...x, errors: x.errors + 1 }))
      const text = a.errors >= 3 ? L.pick(L.ERRORS_MANY) : L.fill(L.pick(L.TOOL_ERROR), { tool: e.tool })
      await speak($, text, 'worried')
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const t = await $.clock.now()
    busy = false
    lastActiveAt = t

    const usage = await $.session.usage()
    const m = toMeter(usage, e.usage?.model ?? lastMeter.model)
    await setMeter($, m)

    const u = e.usage
    const processed = u ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : 0
    const output = u?.output_tokens ?? 0
    const quotaEnd = fiveHourOf(m)?.percentUsed
    const quotaDelta =
      turnQuotaStart !== null && quotaEnd !== undefined && quotaEnd >= turnQuotaStart
        ? Math.round((quotaEnd - turnQuotaStart) * 10) / 10
        : null
    if (processed > 0) {
      const record: TurnRecord = { base: turnBase, processed, output, quotaDelta, ms: e.durationMs }
      await update($, turns, list => [...list, record].slice(-30))
    }
    await saveProfile($, p => ({ ...p, turns: p.turns + 1, tokens: p.tokens + processed + output }))
    const act = await update($, activity, a => ({ ...a, isBusy: false }))
    await update($, now, () => t)

    if (quiet) {
      await setMood($, 'sleepy')
    } else {
      const hour = localParts(t).hour
      if (e.reason === 'aborted') await speak($, L.pick(L.TURN_ABORTED), 'idle')
      else if (e.reason === 'refusal') await speak($, L.TURN_REFUSED, 'idle')
      else if (e.reason !== 'answer') await speak($, L.pick(L.TURN_FAILED), 'worried')
      else if (e.durationMs >= LONG_TURN_MS) await speak($, L.pick(L.TURN_LONG), 'proud')
      else if (act.errors > 0) await speak($, L.pick(L.TURN_DONE_AFTER_ERRORS), 'proud')
      else if (hour >= 23 || hour < 5) await speak($, L.LATE_NIGHT, 'sleepy')
      else await speak($, L.pick(L.TURN_DONE), 'happy')
      // 值得说的轮次再让 haiku 结合真实发生的事说一句，几秒后替换上面那句（每轮最多一次）
      await queueReaction($, {
        reason: e.reason,
        duration: fmtDuration(e.durationMs),
        toolCounts: turnToolCounts,
        touched: turnTouched,
        errors: act.errors,
        answer: e.answer,
      })
    }
    await checkAlerts($, m)
    return result
  })

  // 额度窗口挪动整点、上下文变化时引擎主动推送
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    const m = toMeter(e, lastMeter.model)
    await setMeter($, m)
    await checkAlerts($, m)
    return result
  })

  // Client 发来的消息：avatar 点小克本身；bubble 点提醒气泡的完成按钮；controls 点胶囊/按钮、或校准结果
  on('ui.message', async ($, e, next) => {
    const result = await next(e)
    if (typeof e.data !== 'object' || e.data === null) return result
    const data = e.data as { type?: unknown; key?: unknown; off?: unknown; cjk?: unknown }
    isActiveSinceTick = true
    if (e.element === 'avatar' && data.type === 'click') {
      await onAvatarClick($)
    } else if (e.element === 'bubble' && data.type === 'done') {
      await onRestDone($)
    } else if (e.element === 'controls' && data.type === 'control' && typeof data.key === 'string') {
      await onControl($, data.key)
    } else if (e.element === 'controls' && data.type === 'calib' && typeof data.off === 'number' && typeof data.cjk === 'number') {
      await onCalibrated($, { off: data.off, cjk: data.cjk })
    }
    return result
  })

  // 输入框下方提示行：打字时追加实时 token 预估
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const n = await read($, draft)
    if (!e.props.isDraft || n === 0 || (await read($, isHidden))) return next(e)
    const met = await read($, meter)
    const fc = forecast(met.ctxTokens ?? 0, n, await read($, turns), fiveHourOf(met))
    const quota = fc.quota === null ? '' : ` · 5h≈+${fc.quota.toFixed(1)}%`
    return next({ ...e, props: { ...e.props, tail: `小克：输入≈${fmtTokens(n)} token · 本轮≈${fmtTokens(fc.processed)}${quota}` } })
  })

  // 输入框上方的带子：收起 = 工作模式（2 行极简），展开 = 放松模式（4 行，小克趴在输入框上）
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const nowMs = await read($, now)
    const restEnd = await read($, restUntil)
    const isResting = restEnd > nowMs
    // 隐藏时照样弹强提醒：健康提醒不能因为小克躲起来就看不到
    if (!isResting && (await read($, isHidden))) return next(e)
    // 记下带子高度，点小克时据此判断实际画的是不是小个子
    bandRows = e.props.maxRows
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const m = await read($, mood)
    const line = await read($, say)
    const act = await read($, activity)
    const met = await read($, meter)
    const history = await read($, turns)
    const draftTokens = await read($, draft)
    const prof = await read($, profile)
    const silent = await read($, isQuiet)
    const pets = await read($, petSeq)
    const says = await read($, saySeq)
    const flash = await read($, pressed)
    const opened = await read($, openCard)
    const whispering = await read($, isWhispering)
    const whisperCost = await read($, lastWhisper)
    const aiOn = await read($, isAiLines)
    const ai = await read($, aiCost)
    const aiResult = await read($, aiLast)
    const dayStartAt = await read($, workStart)
    const calibrating = await read($, isCalibrating)
    const map = await read($, clickMap)
    const mind = await read($, brain)
    const remindedHours = await read($, reminded)
    const pane = await read($, workbenchPane)
    const kept = await read($, keep)
    // 强制休息、校准时一定展开；带子高度放不下时只能收起
    const expanded =
      ((await read($, isExpanded)) || isResting || calibrating) && e.props.maxRows >= AVATAR.full.rows

    const size = expanded ? 'full' : 'mini'
    const box = AVATAR[size]
    const fc = forecast(met.ctxTokens ?? 0, draftTokens, history, fiveHourOf(met))
    const last = history.at(-1)
    // 安静模式要看得出来，不然像是小克坏了不说话；安静时点悄悄话回的那句固定台词要让人看到，不被安静提示盖住
    const bubble = silent
      ? line === L.WHISPER_QUIET
        ? line
        : '（安静模式中，/xiaoke quiet off 恢复说话）'
      : whispering
        ? L.WHISPER_THINKING
        : line === ''
          ? '…'
          : line
    // 今天已工作：从今天最早开的会话算起（所有会话一致）；本会话时长放在状态卡片里
    const workedFrom = dayStartAt > 0 ? dayStartAt : sessionStartedAt
    const workedFor = workedFrom > 0 ? fmtSpan(nowMs - workedFrom) : '不到 1min'
    const sessionFor = sessionStartedAt > 0 ? fmtSpan(nowMs - sessionStartedAt) : '不到 1min'
    const aiAvg =
      ai.calls > 0 ? `平均每次 入 ${Math.round(ai.input / ai.calls)} / 出 ${Math.round(ai.output / ai.calls)}` : '还没调用'
    const aiLine = aiOn
      ? `真实台词 ${ai.calls} 次（${aiAvg}，累计 ${fmtTokens(ai.input + ai.output)}）· 最近 ${aiResult}`
      : '真实台词已关：每轮结束不自动说话，点悄悄话仍会调用一次'
    const headQuota = fiveHourOf(met) ?? met.quotas[0]
    const worst = Math.max(met.ctxPercent ?? 0, ...met.quotas.map(q => q.percentUsed))
    const hasClient = 'Client' in els

    const avatar = hasClient ? (
      <els.Client
        key="avatar"
        module="./avatar.tsx"
        props={{ mood: m, petSeq: pets, saySeq: says, isBusy: act.isBusy, size }}
        width={box.columns}
        height={box.rows}
      />
    ) : (
      <Text bold color="claude">
        {FACE[m]}
      </Text>
    )

    // 用量前面先说清楚用的什么模型、什么思考强度
    const brainText = brainLabel(mind.model, mind.effort)
    const metrics = [
      ...(brainText === '' ? [] : [brainText]),
      ...(headQuota === undefined ? [] : [`${shortKind(headQuota.kind)} ${headQuota.percentUsed}%`]),
      ...(met.ctxPercent === null ? [] : [`ctx ${met.ctxPercent}%`]),
      `下一轮≈${fmtTokens(fc.processed)}`,
      ...(kept.isOn ? [`保活 ${kept.count} 次`] : []),
    ].join(' · ')

    // 强提醒：小克旁边的对话气泡（bubble.tsx 自己画、自己判定按钮），倒计时结束前一直在；
    // 放得下 4 行就是带尾巴的圆角气泡，和小克一样高；放不下就在 2 行里显示标题、倒计时、按钮和台词
    if (isResting) {
      const kind = await read($, restKind)
      const style = ALERT_STYLE[kind]
      const left = restEnd - nowMs
      const total = restTotal(kind)
      const lockLeft = restEnd - total + LOCK_MS - nowMs
      const text = (await read($, restText)) || bubble
      const remain = `还剩 ${countdown(left)}`
      if (!hasClient) {
        return (
          <Box flexDirection="row" alignItems="flex-end">
            {avatar}
            <Box flexDirection="column" marginLeft={2} flexGrow={1} flexShrink={1}>
              <Text color={style.color} bold wrap="truncate-end">{`${style.title}  ${remain}`}</Text>
              <Text wrap="truncate-end">{text}</Text>
            </Box>
          </Box>
        )
      }
      const maxWidth = e.props.bodyColumns - box.columns - (expanded ? 0 : 1)
      const width = expanded
        ? bubbleWidth({ title: style.title, text, labels: [style.done, LOCKED_LABEL('0:00')] }, maxWidth)
        : maxWidth
      const bubbleProps: BubbleProps = {
        id: restEnd,
        layout: expanded ? 'full' : 'compact',
        width,
        title: style.title,
        text,
        color: style.color,
        countdown: remain,
        left: left / total,
        button: lockLeft > 0 ? { label: LOCKED_LABEL(countdown(lockLeft)), isReady: false } : { label: style.done, isReady: true },
        map,
      }
      return (
        <Box flexDirection="row" alignItems="flex-end">
          {avatar}
          <Box marginLeft={expanded ? 0 : 1}>
            <els.Client key="bubble" module="./bubble.tsx" props={bubbleProps} width={width} height={box.rows} />
          </Box>
        </Box>
      )
    }

    // 工作模式：2 行。小克等比缩小一半，没有按钮；第 1 行是小克说的话（弱化），第 2 行是状态和指标；点小克本身展开
    // 「今天已工作」从今天第一个会话开始累计，不因每次提问重新计时；圆点颜色表示 Claude 此刻在不在干活
    if (!expanded) {
      const doing = act.isBusy
        ? `正在${act.lastTool ? ` ${act.lastTool}` : '思考'}${act.errors > 0 ? ` · 失败 ${act.errors}` : ''}`
        : '空闲'
      const status = `今天已工作 ${workedFor} · ${doing}`
      return (
        <Box flexDirection="row" alignItems="flex-end">
          {avatar}
          <Box flexDirection="column" marginLeft={2} flexGrow={1} flexShrink={1}>
            <Text color={MOOD_COLOR[m]} dimColor wrap="truncate-end">
              {bubble}
            </Text>
            <Box flexDirection="row">
              <Text {...(act.isBusy ? { color: 'warning' } : { dimColor: true })}>{act.isBusy ? '● ' : '○ '}</Text>
              <Box flexShrink={1}>
                <Text dimColor wrap="truncate-end">
                  {status}
                </Text>
              </Box>
              <Box flexShrink={0}>
                <Text {...(worst >= 80 ? { color: 'warning' } : { dimColor: true })}>{`  ·  ${metrics}`}</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    // 可点的胶囊和按钮都交给 controls.tsx 自己画、自己判定（用户终端点中文后面会偏，引擎自带 Button 判定不准）
    const controlsWidth = Math.max(30, e.props.bodyColumns - AVATAR.full.columns - 2)
    const controls = (rows: ControlItem[][], mode: 'controls' | 'calibrate') =>
      hasClient ? (
        <els.Client key="controls" module="./controls.tsx" props={{ mode, map, rows }} width={controlsWidth} height={2} />
      ) : null

    // 校准：和放松模式同一个位置画 [A]……[B]，量出的口径才对得上真按钮
    if (calibrating) {
      return (
        <Box flexDirection="row" alignItems="flex-end">
          {avatar}
          <Box flexDirection="column" marginLeft={2} flexGrow={1}>
            <Box flexDirection="column" height={2}>
              <Text color="claude">点击校准：你的终端点中文后面会往左偏，点两下就能算出偏多少</Text>
              <Text dimColor>{`当前口径：每个中文按 ${map.cjk.toFixed(2)} 列算，整体偏移 ${map.off}`}</Text>
            </Box>
            {controls([], 'calibrate')}
          </Box>
        </Box>
      )
    }

    // 放松模式：状态胶囊点一下，卡片换到台词的位置（最多 2 行）
    type Chip = { key: CardKey; dot: ControlStyle; label: string; card: string[] }
    // 胶囊行挤，模型胶囊只写短名和强度级别，卡片里再写全
    const brainChip = mind.model === '' ? '模型 --' : `${prettyModel(mind.model)}${mind.effort ? ` · ${mind.effort}` : ''}`
    const hourNow = localParts(nowMs).hour
    const upcoming = nextSlot(hourNow, remindedHours)
    const upcomingAt = upcoming === undefined ? '' : `${String(upcoming.hour).padStart(2, '0')}:00 ${KIND_LABEL[upcoming.kind]}`
    const plan = SCHEDULE.map(s => `${s.hour}点${KIND_LABEL[s.kind]}${remindedHours.includes(s.hour) ? '✓' : ''}`).join(' ')
    const chips: Chip[] = [
      act.isBusy
        ? {
            key: 'status',
            dot: { color: 'warning' },
            label: `今天已工作 ${workedFor}`,
            card: [
              `Claude 本轮已处理 ${fmtDuration(nowMs - act.startedAt)} · 工具调用 ${act.tools} 次${act.errors > 0 ? ` · 失败 ${act.errors} 次` : ''}${act.lastTool ? ` · 正在 ${act.lastTool}` : ''}`,
              aiLine,
            ],
          }
        : {
            key: 'status',
            dot: { dim: true },
            label: `今天已工作 ${workedFor}`,
            card: [
              `今天 ${hhmm(workedFrom)} 开工 · 本会话 ${sessionFor} · 认识第 ${prof.days} 天 · 一起完成 ${prof.turns} 轮 · 好感 ${prof.pets + prof.snacks * 2}${silent ? ' · 安静模式' : ''}`,
              `${aiLine}${whisperCost ? ` · ${whisperCost}` : ''}`,
            ],
          },
      {
        key: 'model',
        dot: { color: 'suggestion' },
        label: brainChip,
        card: [
          `模型 ${mind.model || '还不知道'} · 思考强度 ${mind.effort || '模型不支持或还不知道'}（${mind.isLive ? '最近一次请求的实际值' : '取自设置，发出请求后按实际值显示'}）`,
          '/model 切换模型 · /effort 调整思考强度',
        ],
      },
      headQuota === undefined
        ? { key: 'quota', dot: { dim: true }, label: '额度 --', card: ['额度：第一轮回复后显示', '非订阅账号没有额度窗口'] }
        : {
            key: 'quota',
            dot: { color: tone(Math.max(...met.quotas.map(q => q.percentUsed))) },
            label: `${shortKind(headQuota.kind)} ${headQuota.percentUsed}%`,
            card: met.quotas.map(
              q => `${padWidth(kindLabel(q.kind), 8)}${bar(q.percentUsed, 10)} ${`${q.percentUsed}%`.padStart(4)}  ${resetLabel(q.kind, q.resetsAt)}`,
            ),
          },
      met.ctxPercent === null
        ? { key: 'ctx', dot: { dim: true }, label: 'ctx --', card: ['上下文：第一轮回复后显示'] }
        : {
            key: 'ctx',
            dot: { color: tone(met.ctxPercent) },
            label: `ctx ${met.ctxPercent}%`,
            card: [
              `上下文  ${bar(met.ctxPercent, 10)} ${fmtTokens(met.ctxTokens ?? 0)} / ${fmtTokens(met.ctxWindow)}`,
              `${met.usd === null ? '本会话花费：暂无' : `本会话折合 $${met.usd.toFixed(2)}（按 API 价计）`}${met.model ? ` · ${met.model}` : ''}`,
            ],
          },
      {
        key: 'forecast',
        dot: { color: 'claude' },
        label: `下一轮≈${fmtTokens(fc.processed)}`,
        card: [
          `首个请求≈${fmtTokens(fc.firstInput)} 输入 · 整轮≈${fmtTokens(fc.processed)} 处理 · ≈${fmtTokens(fc.output)} 输出`,
          `${fc.quota === null ? '5h 额度：再完成一轮就能估' : `5h 额度≈+${fc.quota.toFixed(1)}%${fc.turnsLeft === null ? '' : ` · 还够≈${fc.turnsLeft} 轮`}`}${
            last === undefined ? '' : ` · 上一轮 ${fmtTokens(last.processed)} 处理 / ${fmtTokens(last.output)} 输出 / ${fmtDuration(last.ms)}`
          }`,
        ],
      },
      {
        key: 'rest',
        // 到点了但人刚不在、还没弹：亮黄点，回来一动就补
        dot: upcoming?.hour === hourNow ? { color: 'warning' } : { dim: true },
        label: upcoming === undefined ? '今天提醒完啦' : upcomingAt,
        card: [
          `今天 ${plan}`,
          `${upcoming === undefined ? '今天的提醒都结束啦' : `下一次 ${upcomingAt}`} · 到点强提醒 3min，人不在先不弹，只在这个小时内回来才补 · /xiaoke rest 立刻休息 · /xiaoke calibrate 点击校准`,
        ],
      },
      {
        key: 'keep',
        // 绿：计时中；橙：正在保活；黄：停下了；灰：关了或还没有缓存
        dot:
          !kept.isOn || kept.lastAt === 0
            ? { dim: true }
            : kept.isSending
              ? { color: 'claude' }
              : kept.stopped !== ''
                ? { color: 'warning' }
                : { color: 'success' },
        label: `保活 ${kept.count} 次`,
        card: [keepStatusLine(kept, nowMs), keepCostLine(kept)],
      },
    ]
    const openChip = chips.find(c => c.key === opened)

    const chipItems: ControlItem[] = chips.map(c => ({
      key: `chip-${c.key}`,
      label: c.label,
      style: opened === c.key ? {} : { dim: true },
      dot: c.dot,
    }))
    const actionItem = (key: ActionKey, label: string): ControlItem => ({
      key,
      label,
      style: flash === key ? { color: 'claude', bold: true } : { dim: true },
    })
    const actionItems: ControlItem[] = [
      actionItem('workToggle', pane === 'show' ? '收工' : '干活'),
      actionItem('pet', '摸摸头'),
      actionItem('feed', '喂饼干'),
      actionItem('praise', '夸夸我'),
      actionItem('whisper', whispering ? '思考中…' : '悄悄话'),
      actionItem('quiet', silent ? '陪我说话' : '安静一会'),
      actionItem('expand', '收起'),
    ]

    return (
      <Box flexDirection="row" alignItems="flex-end">
        {avatar}
        <Box flexDirection="column" marginLeft={2} flexGrow={1}>
          <Box flexDirection="column" height={2} overflow="hidden">
            {openChip === undefined ? (
              <Text color={MOOD_COLOR[m]} wrap="wrap">
                {bubble}
              </Text>
            ) : (
              openChip.card.slice(0, 2).map(text => (
                <Text color={CARD_BORDER} wrap="truncate-end">
                  {text}
                </Text>
              ))
            )}
          </Box>
          {controls([chipItems, actionItems], 'controls')}
        </Box>
      </Box>
    )
  })
}
