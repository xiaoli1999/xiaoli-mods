// token / 额度粗估与格式化：纯函数，测试直接引用
import type { QuotaWindow, TurnRecord } from '../types'

const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/

/** 粗估文本 token 数：中日韩字符约 1.1 token/字，其余约 3.5 字符/token */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    if (CJK.test(ch)) cjk += 1
    else other += 1
  }
  return Math.ceil(cjk * 1.1 + other / 3.5)
}

export type TurnForecast = {
  /** 第一个请求的输入（上下文 + 上一轮输出 + 新提示词） */
  firstInput: number
  /** 整轮预计处理的输入（每次工具往返都会重发上下文，大部分命中缓存） */
  processed: number
  output: number
  /** 预计消耗 5 小时额度的百分点；没有历史时为 null */
  quota: number | null
  /** 按这个节奏 5 小时额度还够几轮 */
  turnsLeft: number | null
  basis: string
}

/** 无历史时假设一轮约 3 次请求、输出 1500 token */
const DEFAULT_RATIO = 3
const DEFAULT_OUTPUT = 1500

export function forecast(
  ctxTokens: number,
  draft: number,
  turns: readonly TurnRecord[],
  fiveHour: QuotaWindow | undefined,
): TurnForecast {
  const recent = turns.filter(t => t.base > 0 && t.processed > 0).slice(-8)
  const lastOutput = recent.at(-1)?.output ?? 0
  const firstInput = ctxTokens + lastOutput + draft
  const ratio = recent.length > 0 ? clamp(avg(recent.map(t => t.processed / t.base)), 1, 40) : DEFAULT_RATIO
  const output = recent.length > 0 ? Math.round(avg(recent.map(t => t.output))) : DEFAULT_OUTPUT
  const processed = Math.round(firstInput * ratio)

  // 用「每百万处理 token 涨几个百分点」折算本轮额度
  const metered = recent.filter(t => t.quotaDelta !== null)
  let quota: number | null = null
  const meteredTokens = sum(metered.map(t => t.processed))
  if (metered.length > 0 && meteredTokens > 0) {
    const perMillion = sum(metered.map(t => t.quotaDelta ?? 0)) / (meteredTokens / 1e6)
    quota = (perMillion * processed) / 1e6
  }

  let turnsLeft: number | null = null
  if (fiveHour !== undefined && quota !== null && quota >= 0.05) {
    turnsLeft = Math.floor(Math.max(0, 100 - fiveHour.percentUsed) / quota)
  }

  const basis = recent.length > 0 ? `按最近 ${recent.length} 轮校准` : '暂无历史，按默认值'
  return { firstInput, processed, output, quota, turnsLeft, basis }
}

export function fmtTokens(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 1e6) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1e6).toFixed(2)}M`
}

/** 会话时长：只到分钟，不跟着秒跳（不到 1 分钟显示「不到 1min」） */
export function fmtSpan(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  if (m < 1) return '不到 1min'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}min`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

/** 时长随长度进位：s → min → h → d，只保留最大的两级 */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}min ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}min`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

export function bar(percent: number, width: number): string {
  const filled = Math.round((clamp(percent, 0, 100) / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** 终端显示宽度：中日韩字符算 2 格 */
export function displayWidth(text: string): number {
  let width = 0
  for (const ch of text) width += CJK.test(ch) ? 2 : 1
  return width
}

export function padWidth(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)))
}

// 运行环境的 Date 可能固定为 UTC；偏移为 0 时按东八区兜底（本机在国内）
const FALLBACK_OFFSET_MIN = 480

function offsetMinutes(ms: number): number {
  const systemOffset = -new Date(ms).getTimezoneOffset()
  return systemOffset === 0 ? FALLBACK_OFFSET_MIN : systemOffset
}

/** 当地当天 0 点的时间戳 */
export function startOfLocalDay(ms: number): number {
  const offset = offsetMinutes(ms) * 60_000
  return Math.floor((ms + offset) / 86_400_000) * 86_400_000 - offset
}

/** 今天的开工时间：今天最早开的会话；跨过 0 点的会话从 0 点算起 */
export function workDayStart(stored: unknown, sessionStartedAt: number, nowMs: number): { day: string; at: number } {
  const day = dayKey(nowMs)
  const begin = Math.max(sessionStartedAt, startOfLocalDay(nowMs))
  const prev = stored as { day?: unknown; at?: unknown } | null
  if (prev !== null && typeof prev === 'object' && prev.day === day && typeof prev.at === 'number') {
    return { day, at: Math.min(prev.at, begin) }
  }
  return { day, at: begin }
}

export function localParts(ms: number) {
  const offset = offsetMinutes(ms)
  const d = new Date(ms + offset * 60_000)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function hhmm(ms: number): string {
  const t = localParts(ms)
  return `${pad(t.hour)}:${pad(t.minute)}`
}

export function dayKey(ms: number): string {
  const t = localParts(ms)
  return `${t.year}-${pad(t.month)}-${pad(t.day)}`
}

export function resetLabel(kind: string, iso: string | undefined): string {
  if (iso === undefined) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  if (kind === 'five_hour') return `${hhmm(ms)} 恢复`
  const t = localParts(ms)
  return `${t.month}/${t.day} ${hhmm(ms)} 恢复`
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** 模型 ID 缩成短名：claude-opus-5-5 → Opus 5.5，claude-sonnet-4-5-20250929 → Sonnet 4.5，[1m] 后缀 → 1M */
export function prettyModel(id: string): string {
  const raw = id.trim()
  const isLong = /\[1m\]$/i.test(raw)
  const base = raw.replace(/\[1m\]$/i, '')
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i.exec(base)
  const name = m
    ? `${capitalize(m[1] ?? '')} ${m[2] ?? ''}${m[3] ? `.${m[3]}` : ''}`
    : /^[a-z]+$/.test(base)
      ? capitalize(base)
      : base
  return isLong ? `${name} 1M` : name
}

/** 模型 + 思考强度：Opus 5.5 · 思考 xhigh；还不知道模型时为空 */
export function brainLabel(model: string, effort: string): string {
  const name = prettyModel(model)
  if (name === '') return ''
  return effort === '' ? name : `${name} · 思考 ${effort}`
}

function avg(list: readonly number[]): number {
  return list.length === 0 ? 0 : sum(list) / list.length
}

function sum(list: readonly number[]): number {
  return list.reduce((a, b) => a + b, 0)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
