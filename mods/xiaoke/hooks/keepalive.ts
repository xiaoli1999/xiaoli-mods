// 缓存保活：主对话最后一次请求后 50 分钟还没新请求，就用 $.model.fork 旁路请求一次，
// 让 API 读一遍主对话的提示词缓存、把 1 小时的寿命续上；不进对话历史。纯函数，测试直接引用
import type { ModelForkResult, ModelUsage } from 'claude-code'

import type { KeepAlive } from '../types'
import { fmtSpan, fmtTokens, hhmm } from './estimate'

/** 提示词缓存的寿命（订阅账号 1 小时；超额计费时会降到 5 分钟，那时靠命中率发现并停下） */
export const CACHE_TTL_MS = 60 * 60_000
/** 主对话最后一次请求后多久保活 */
export const KEEP_IDLE_MS = 50 * 60_000
/** 距上次请求超过这么久就不发了：电脑睡过或卡住，缓存来不及保，发了白花钱 */
export const KEEP_LATE_MS = 58 * 60_000
/** 失败后多久重试（只重试一次） */
export const KEEP_RETRY_MS = 3 * 60_000
/** 可选上限（/xiaoke keep max <小时>）允许的范围；默认 0 = 不设上限，一直保活到会话关闭 */
export const KEEP_MAX_HOURS_MIN = 1
export const KEEP_MAX_HOURS_MAX = 72
/** 读到的缓存不到这次请求输入的一半，判定缓存已失效 */
export const KEEP_MIN_HIT_PERCENT = 50
/** 旁路请求追加的那句话，回复直接丢掉 */
export const KEEP_PROMPT =
  '[小克缓存保活] 这是小黎 mods 的陪伴猫小克自动发出的缓存保活请求，回复会被丢弃。不需要做任何事，不要调用工具，只回复一个字：在'

export const NEW_KEEP: KeepAlive = {
  isOn: true,
  lastAt: 0,
  realAt: 0,
  retryAt: 0,
  stopped: '',
  isSending: false,
  day: '',
  count: 0,
  read: 0,
  output: 0,
  last: '',
  maxHours: 0,
}

/** 上限换成毫秒；没设上限（0，或热重载前的旧状态里没有这个字段）为 0 */
const capMs = (k: KeepAlive) => (k.maxHours > 0 ? k.maxHours * 3_600_000 : 0)

/** 存储里读出的上限：1–72 的整数才算数，其余（没有这个字段的老用户、坏数据）一律按不限 0 */
export function validMaxHours(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= KEEP_MAX_HOURS_MIN && v <= KEEP_MAX_HOURS_MAX ? v : 0
}

/** /xiaoke keep max 后面的参数：off 为 0（取消上限），1–72 的正整数为小时数，其余为 null（不认识） */
export function parseMaxHours(text: string): number | null {
  const t = text.trim()
  if (t === 'off') return 0
  if (!/^\d+$/.test(t)) return null
  const n = validMaxHours(Number(t))
  return n === 0 ? null : n
}

/** 上限的说法，放在 keep on 等回复里：不限写「一直保活到会话关闭」，设了写出小时数 */
export function keepLimitText(k: KeepAlive): string {
  return k.maxHours > 0 ? `连续 ${k.maxHours} 小时没对话就停` : '一直保活到会话关闭'
}

/** /xiaoke keep 回复末尾的上限说明：当前设置和怎么改 */
export function keepLimitNote(k: KeepAlive): string {
  return k.maxHours > 0
    ? `保活上限 ${k.maxHours} 小时：连续 ${k.maxHours} 小时没对话就停（/xiaoke keep max off 取消上限）`
    : '保活不设上限：一直保活到会话关闭（/xiaoke keep max 小时数 可设上限）'
}

/** 每一跳该做什么：等着、发保活、停下（带原因） */
export type KeepStep = { kind: 'wait' } | { kind: 'send' } | { kind: 'stop'; reason: string }

const WAIT: KeepStep = { kind: 'wait' }

/** 该发保活的时间：失败重试优先，否则最后一次请求后 50 分钟 */
const dueAt = (k: KeepAlive) => (k.retryAt > 0 ? k.retryAt : k.lastAt + KEEP_IDLE_MS)

/** 每秒一跳：到点且还来得及就发；来不及就停；设了上限的，连续这么久没真实对话也停（默认不设，一直保活到会话关闭） */
export function keepStep(k: KeepAlive, now: number): KeepStep {
  if (!k.isOn || k.isSending || k.lastAt === 0 || k.stopped !== '') return WAIT
  if (now - k.lastAt >= KEEP_LATE_MS) {
    return { kind: 'stop', reason: `距上次请求已 ${fmtSpan(now - k.lastAt)}，缓存来不及保了` }
  }
  if (now < dueAt(k)) return WAIT
  const cap = capMs(k)
  if (cap > 0 && now - k.realAt >= cap) return { kind: 'stop', reason: `连续 ${k.maxHours} 小时没对话，停止保活` }
  return { kind: 'send' }
}

/** 下一次保活的时间；不会再保活（关了、没缓存、停了、设了上限且下次已过上限）为 0 */
export function nextKeepAt(k: KeepAlive): number {
  if (!k.isOn || k.lastAt === 0 || k.stopped !== '') return 0
  const due = dueAt(k)
  const cap = capMs(k)
  return cap > 0 && due - k.realAt >= cap ? 0 : due
}

/** 主对话发了请求：重新计时，停下的也恢复 */
export function noteRequest(k: KeepAlive, now: number): KeepAlive {
  return { ...k, lastAt: now, realAt: now, retryAt: 0, stopped: '' }
}

/** 没命中停下时 stopped 的开头：这种停下说明缓存已经过期了 */
const MISS_STOPPED = '缓存没读到'

/**
 * /xiaoke keep on：打开，停下的立刻恢复，不用等下次对话。
 * 缓存已经保不住的（距上次请求超过 58 分钟、或上次就是没读到缓存才停的）当作还没有可保的缓存，下次对话起重新计时；
 * 其余的清掉停下和重试，设了上限的从现在重新算（用户刚亲手打开，说明人在），到点就照常保活
 */
export function resumeKeep(k: KeepAlive, now: number): KeepAlive {
  const on: KeepAlive = { ...k, isOn: true }
  if (k.stopped === '') return on
  const isLost = k.lastAt === 0 || now - k.lastAt >= KEEP_LATE_MS || k.stopped.startsWith(MISS_STOPPED)
  if (isLost) return { ...on, stopped: '', retryAt: 0, lastAt: 0 }
  return { ...on, stopped: '', retryAt: 0, realAt: Math.max(k.realAt, now) }
}

/** 换天：次数和用量从 0 开始 */
export function rollDay(k: KeepAlive, day: string): KeepAlive {
  return k.day === day ? k : { ...k, day, count: 0, read: 0, output: 0, last: '' }
}

/** 一次保活请求的结果 */
export type KeepOutcome =
  | { kind: 'hit'; read: number; output: number }
  | { kind: 'miss'; read: number; output: number; percent: number }
  | { kind: 'empty' }
  | { kind: 'fail'; why: string; read: number; output: number }

function byHit(u: ModelUsage): KeepOutcome {
  const total = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  const percent = total > 0 ? Math.round((u.cache_read_input_tokens / total) * 100) : 0
  const spent = { read: u.cache_read_input_tokens, output: u.output_tokens }
  return percent >= KEEP_MIN_HIT_PERCENT ? { kind: 'hit', ...spent } : { kind: 'miss', ...spent, percent }
}

/** 看 fork 的结果：读到多少缓存决定成没成；空回复也是请求成功，照样按命中算 */
export function judgeFork(r: ModelForkResult): KeepOutcome {
  if (r.isAnswered) return byHit(r.usage)
  if (r.reason === 'nothing-to-fork') return { kind: 'empty' }
  if (r.reason === 'empty-reply') return byHit(r.usage)
  const spent = { read: r.usage.cache_read_input_tokens, output: r.usage.output_tokens }
  if (r.reason === 'api-error') {
    return { kind: 'fail', why: `接口错误${r.status === null ? '' : ` ${r.status}`} ${r.error}`, ...spent }
  }
  return { kind: 'fail', why: '请求被中断', ...spent }
}

/** 记下一次保活的结果：新的状态、要弹的 toast（'' 不弹）、是否续上了 */
export type KeepSettled = { next: KeepAlive; toast: string; isKept: boolean }

/**
 * 保活请求回来了。k 是此刻的状态（发送期间主对话可能自己发过请求），sentAt 发出时间，now 回来时间。
 * 命中：次数 +1，从发出时重新计时；没命中：判定失效停下；失败：3 分钟后重试一次，来不及或已重试过就停
 */
export function settleKeep(k: KeepAlive, o: KeepOutcome, sentAt: number, now: number): KeepSettled {
  const base: KeepAlive = { ...k, isSending: false }
  // 发送期间主对话自己发了请求：缓存已经续上了，不再据这次结果停下或重试
  const isOvertaken = k.realAt > sentAt
  const stamp = hhmm(sentAt)
  if (o.kind === 'empty') {
    const next = isOvertaken ? base : { ...base, lastAt: 0, retryAt: 0, last: `${stamp} 还没有可保的缓存` }
    return { next, toast: '', isKept: false }
  }
  const spent = { read: base.read + o.read, output: base.output + o.output }
  if (o.kind === 'hit') {
    const count = base.count + 1
    return {
      next: {
        ...base,
        ...spent,
        count,
        lastAt: Math.max(base.lastAt, sentAt),
        retryAt: 0,
        last: `${stamp} 读缓存 ${fmtTokens(o.read)} ✓ 出 ${o.output}`,
      },
      toast: `小克：缓存保活第 ${count} 次，读缓存 ${fmtTokens(o.read)}，续到 ${hhmm(sentAt + CACHE_TTL_MS)}`,
      isKept: true,
    }
  }
  if (isOvertaken) return { next: { ...base, ...spent }, toast: '', isKept: false }
  if (o.kind === 'miss') {
    return {
      next: { ...base, ...spent, retryAt: 0, stopped: `${MISS_STOPPED}（只命中 ${o.percent}%），可能已过期`, last: `${stamp} 只命中 ${o.percent}% ✗` },
      toast: `小克：保活没读到缓存（只命中 ${o.percent}%），可能已过期，先停下，下次对话后恢复`,
      isKept: false,
    }
  }
  const retryAt = now + KEEP_RETRY_MS
  if (base.retryAt === 0 && retryAt < base.lastAt + KEEP_LATE_MS) {
    return {
      next: { ...base, ...spent, retryAt, last: `${stamp} 失败（${o.why}），${hhmm(retryAt)} 重试` },
      toast: `小克：缓存保活失败（${o.why}），3 分钟后重试`,
      isKept: false,
    }
  }
  return {
    next: { ...base, ...spent, retryAt: 0, stopped: `保活失败（${o.why}）`, last: `${stamp} 失败（${o.why}）✗` },
    toast: `小克：缓存保活失败（${o.why}），先停下，下次对话后恢复`,
    isKept: false,
  }
}

/** 「缓存」卡片第 1 行：现在的状态和下一次保活 */
export function keepStatusLine(k: KeepAlive, now: number): string {
  const today = `本会话今天 ${k.count} 次`
  if (!k.isOn) return `缓存保活已关 · /xiaoke keep on 打开 · ${today}`
  if (k.isSending) return `正在保活… · ${today}`
  if (k.lastAt === 0) return `还没有可保的缓存，第一轮对话后开始计时 · ${today}`
  if (k.stopped !== '') return `已停下：${k.stopped}，下次对话或 /xiaoke keep on 后恢复 · ${today}`
  const next = nextKeepAt(k)
  const quiet = `距上次对话 ${fmtSpan(now - k.realAt)}`
  if (next === 0) return `${quiet}，到 ${k.maxHours}h 上限不再保活，缓存约 ${hhmm(k.lastAt + CACHE_TTL_MS)} 过期 · ${today}`
  // 没设上限就一直保活到会话关闭；设了写出几小时
  const limit = k.maxHours > 0 ? `${quiet} / 上限 ${k.maxHours}h` : `${quiet} · 一直保活到会话关闭`
  // 已经到点（比如 keep on 刚恢复）：下一跳就发
  if (next <= now) return `马上保活 · ${today} · ${limit}`
  return `下次保活 ${hhmm(next)}（还剩 ${fmtSpan(next - now)}）· ${today} · ${limit}`
}

/** 「缓存」卡片第 2 行：上次结果和今天的用量 */
export function keepCostLine(k: KeepAlive): string {
  const last = k.last === '' ? '今天还没保活过' : `上次 ${k.last}`
  return `${last} · 今天累计读缓存 ${fmtTokens(k.read)} / 出 ${fmtTokens(k.output)} token · /xiaoke keep on|off|max`
}
