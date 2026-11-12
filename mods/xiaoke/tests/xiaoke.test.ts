import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { AVATAR_SIZE, BODY_COLOR, PALETTE, avatarPixels, paletteFor, toRuns } from '../hooks/avatar'
import type { AvatarPose } from '../hooks/avatar'
import { bubbleRows, bubbleWidth, displayWidth, hitButton } from '../hooks/bubble'
import type { BubbleProps, Seg } from '../hooks/bubble'
import { DEFAULT_MAP, hitTest, solveMap } from '../hooks/controls'
import type { ControlItem } from '../hooks/controls'
import {
  brainLabel,
  dayKey,
  estimateTokens,
  fmtDuration,
  fmtSpan,
  forecast,
  prettyModel,
  startOfLocalDay,
  workDayStart,
} from '../hooks/estimate'
import {
  KEEP_IDLE_MS,
  KEEP_PROMPT,
  NEW_KEEP,
  judgeFork,
  keepLimitNote,
  keepLimitText,
  keepStatusLine,
  keepStep,
  nextKeepAt,
  noteRequest,
  parseMaxHours,
  resumeKeep,
  rollDay,
  settleKeep,
  validMaxHours,
} from '../hooks/keepalive'
import * as L from '../hooks/lines'
import type { Profile } from '../types'
import { cleanLine, donePrompt, isWorthReacting, reactSystem, startEcho } from '../hooks/react'
import { ALERT_MS, doneHours, kindAt, nextSlot, readLog } from '../hooks/remind'
import {
  CHANGELOG_FILE,
  CHECK_DELAY_MS,
  MANIFEST_FILE,
  changelogNotes,
  compareVersion,
  failedNotice,
  installOf,
  isCheckedToday,
  isNewer,
  localNotice,
  manifestVersion,
  parseVersion,
  runUpdateCheck,
  sourceUrls,
  updateSteps,
  updatedNotice,
} from '../hooks/update'
import type { RunResultType, UpdateNoticeType, UpdatePortsType } from '../hooks/update'

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 160,
  scroll: { offset: 0, bodyRows: 19 },
  view: {},
}

const COMMAND_ENV = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }

/** 把小黎会碰到的外部名词都接住：存储、时钟、toast */
function calmWorld(on: On) {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 8, 7, 0) })
  on('ui.toast', () => ({ value: undefined }))
}

/** 2026-10-15 当地 h:m:s（和 localParts 同一个时区口径） */
const DAY0 = startOfLocalDay(Date.UTC(2026, 9, 15, 4, 0))
const at = (h: number, m = 0, s = 0) => DAY0 + h * 3_600_000 + m * 60_000 + s * 1000

/**
 * 真的开一个会话：session.start 用到的外部名词都接住，时钟停在 nowMs；记下弹了几次 toast / 通知、注册了哪些命令。
 * store 传 null 时不接 $.store，由测试自己接（要在测试里直接改存储内容时用）
 */
async function boot($: Engine, on: On, nowMs: number, store: Record<string, unknown> | null = {}) {
  const seen = { toasts: 0, notifies: 0, commands: [] as string[], descriptions: [] as string[], hints: [] as string[] }
  if (store !== null) mock.store(on, store)
  const clock = mock.clock(on, { now: nowMs })
  on('ui.toast', () => {
    seen.toasts += 1
    return { value: undefined }
  })
  on('ui.notify', () => {
    seen.notifies += 1
    return { value: { isSent: false as const, reason: 'no-surface' as const } }
  })
  on('command.register', (_$, e) => {
    seen.commands.push(e.name)
    seen.descriptions.push(e.description ?? '')
    seen.hints.push(e.argumentHint ?? '')
    return { value: { command: e.name } }
  })
  on('session.usage', () => ({ value: { startedAt: nowMs, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('settings.read', () => ({ value: { effortLevel: 'xhigh' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  return { clock, seen }
}

const mountBand = ($: Engine) => $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
type Band = Awaited<ReturnType<typeof mountBand>>

/** 提醒气泡此刻的 props；没弹出来为 undefined */
async function bubbleOf(ui: Band): Promise<BubbleProps | undefined> {
  return (await ui.find({ type: 'Client', key: 'bubble' }))?.props.props as BubbleProps | undefined
}

/** 提醒气泡里匹配的那段文字；气泡没弹出来为 undefined */
async function bubbleText(ui: Band, text: RegExp): Promise<string | undefined> {
  if ((await bubbleOf(ui)) === undefined) return undefined
  return (await ui.find({ type: 'Text', text, in: 'bubble' }))?.text
}

/** 放松模式按钮行，和 register.tsx 的顺序一致 */
const BUTTONS: ControlItem[] = ['干活', '摸摸头', '喂饼干', '夸夸我', '悄悄话', '安静一会', '收起'].map((label, i) => ({
  key: ['workToggle', 'pet', 'feed', 'praise', 'whisper', 'quiet', 'expand'][i] ?? '',
  label,
  style: { dim: true },
}))

describe('点击判定', () => {
  test('正常终端（中文按 2 列）：点「收起」第一个字落在 expand', () => {
    // 干活 0-3 · 摸摸头 6-11 · 喂饼干 14-19 · 夸夸我 22-27 · 悄悄话 30-35 · 安静一会 38-45 · 收起 48-51
    expect(hitTest(BUTTONS, 0, DEFAULT_MAP)).toBe('workToggle')
    expect(hitTest(BUTTONS, 6, DEFAULT_MAP)).toBe('pet')
    expect(hitTest(BUTTONS, 49, DEFAULT_MAP)).toBe('expand')
    expect(hitTest(BUTTONS, 39, DEFAULT_MAP)).toBe('quiet')
  })

  test('中文少报列的终端：按校准口径换算后仍然点得准', () => {
    const map = { off: 0, cjk: 1.25 }
    // 收起 的上报区间从 (2×1.25+2) + 4×(3×1.25+2) + 4×1.25+2 = 34.5 开始
    expect(hitTest(BUTTONS, 35, map)).toBe('expand')
    // 同一个上报列，按正常口径会被错判成左边的按钮——这就是用户看到的偏移
    expect(hitTest(BUTTONS, 35, DEFAULT_MAP)).not.toBe('expand')
  })

  test('两点校准能还原出每个中文的上报列数和整体偏移', () => {
    // [A] 的 A 在第 1 列；[B] 的 B 在 3 + 20 个中文之后再 +1
    expect(solveMap(1, 1 + 3 + 20 * 2)).toEqual({ off: 0, cjk: 2 })
    expect(solveMap(3, 3 + 3 + 20 * 1.25)).toEqual({ off: 2, cjk: 1.25 })
    expect(solveMap(10, 5)).toBeUndefined()
  })
})

describe('工作模式（默认收起）', () => {
  test('只有 2 行：等比缩小的小黎 + 两行暗色状态，没有任何控件', async ($, on) => {
    calmWorld(on)
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    const avatar = await ui.find({ type: 'Client', key: 'avatar' })
    expect(avatar?.props.width).toBe(AVATAR_SIZE.mini.columns)
    expect(avatar?.props.height).toBe(2)
    expect(await ui.find({ type: 'Client', key: 'controls' })).toBeUndefined()
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    expect((await ui.find({ type: 'Text', text: /已工作 .* · 空闲/ }))?.props.dimColor).toBe(true)
    await ui.unmount()
  })

  test('已工作时长从会话开始累计，不随提问重置；只到分钟', () => {
    expect(fmtSpan(30_000)).toBe('不到 1min')
    expect(fmtSpan(12 * 60_000 + 40_000)).toBe('12min')
    expect(fmtSpan(125 * 60_000)).toBe('2h 5min')
    expect(fmtSpan(26 * 3_600_000)).toBe('1d 2h')
  })

  test('今天的开工时间 = 今天最早开的会话；换天重新算；跨 0 点的会话从 0 点算', () => {
    const now = Date.UTC(2026, 9, 9, 7, 0)
    const midnight = startOfLocalDay(now)
    const day = dayKey(now)
    // 今天第一个会话 9 点开：开工时间就是它
    const first = workDayStart(null, midnight + 9 * 3_600_000, now)
    expect(first).toEqual({ day, at: midnight + 9 * 3_600_000 })
    // 11 点又开一个会话：仍按 9 点算总时间
    expect(workDayStart(first, midnight + 11 * 3_600_000, now).at).toBe(midnight + 9 * 3_600_000)
    // 存的是昨天的：今天重新算
    expect(workDayStart({ day: '2026-10-08', at: midnight - 3_600_000 }, midnight + 10 * 3_600_000, now).at).toBe(midnight + 10 * 3_600_000)
    // 昨晚开的会话一直没关：今天从 0 点算
    expect(workDayStart(null, midnight - 2 * 3_600_000, now).at).toBe(midnight)
  })

  test('第 1 行是小黎说的话（弱化），第 2 行是状态和指标', async ($, on) => {
    calmWorld(on)
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    // 先展开摸一下头让小黎说句话，再收起
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await ui.post({ type: 'control', key: 'pet' }, { in: 'controls' })
    const said = (await ui.find({ type: 'Text', text: /摸|像素|手/ }))?.text
    await ui.post({ type: 'control', key: 'expand' }, { in: 'controls' })
    const line = await ui.find({ type: 'Text', text: said ?? '' })
    expect(line?.props.dimColor).toBe(true)
    // 刚被摸过头，心情是开心/害羞，台词跟着小黎变粉色
    expect(line?.props.color).toBe(BODY_COLOR.happy)
    expect(await ui.find({ type: 'Text', text: /下一轮≈/ })).toBeDefined()
    await ui.unmount()
  })

  test('认不出的参数只给用法，不误切模式', async ($, on) => {
    calmWorld(on)
    const result = await $.command.run({ command: 'xiaoli', args: 'reset', ...COMMAND_ENV })
    expect(result.text).toContain('不认识「reset」')
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.width).toBe(AVATAR_SIZE.mini.columns)
    await ui.unmount()
  })

  test('点小黎本身 = 展开；放松模式里再点 = 摸头', async ($, on) => {
    calmWorld(on)
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.width).toBe(AVATAR_SIZE.full.columns)
    await ui.pointer({ type: 'down', x: 8, y: 2, button: 'left', in: 'avatar' })
    await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'controls' })
    expect(await ui.find({ type: 'Text', text: '好感 1' })).toBeDefined()
    await ui.unmount()
  })
})

describe('放松模式（展开）', () => {
  test('点「收起」回到工作模式（控件自己判定点击）', async ($, on) => {
    calmWorld(on)
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.height).toBe(4)
    await ui.pointer({ type: 'down', x: 49, y: 1, button: 'left', in: 'controls' })
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.width).toBe(AVATAR_SIZE.mini.columns)
    await ui.unmount()
  })

  test('状态卡片靠点击：点胶囊打开，再点收起，点别的切换', async ($, on) => {
    calmWorld(on)
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    expect(await ui.find({ type: 'Text', text: /首个请求≈/ })).toBeUndefined()
    await ui.post({ type: 'control', key: 'chip-forecast' }, { in: 'controls' })
    expect(await ui.find({ type: 'Text', text: /首个请求≈/ })).toBeDefined()
    await ui.post({ type: 'control', key: 'chip-rest' }, { in: 'controls' })
    expect(await ui.find({ type: 'Text', text: /10点久坐 11点喝水 12点久坐 15点喝水 16点久坐 17点喝水 18点久坐/ })).toBeDefined()
    await ui.post({ type: 'control', key: 'chip-rest' }, { in: 'controls' })
    expect(await ui.find({ type: 'Text', text: /10点久坐/ })).toBeUndefined()
    await ui.unmount()
  })

  test('点按钮立刻在控件里亮一下作为反馈', async ($, on) => {
    calmWorld(on)
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    expect((await ui.find({ type: 'Text', text: '夸夸我', in: 'controls' }))?.props.dimColor).toBe(true)
    await ui.pointer({ type: 'down', x: 23, y: 1, button: 'left', in: 'controls' })
    expect((await ui.find({ type: 'Text', text: '夸夸我', in: 'controls' }))?.props.color).toBe('claude')
    await ui.unmount()
  })

  test('悄悄话走 model.complete，台词和花费都显示出来', async ($, on) => {
    calmWorld(on)
    on('model.complete', () => ({
      value: {
        isAnswered: true as const,
        text: '写了这么久，摸摸头～',
        usage: { input_tokens: 150, output_tokens: 18, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }))
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await ui.post({ type: 'control', key: 'whisper' }, { in: 'controls' })
    expect(await ui.find({ type: 'Text', text: '写了这么久，摸摸头～' })).toBeDefined()
    await ui.post({ type: 'control', key: 'chip-status' }, { in: 'controls' })
    expect(await ui.find({ type: 'Text', text: /悄悄话 入 150 \/ 出 18 token/ })).toBeDefined()
    await ui.unmount()
  })

  test('干活 / 收工是按钮行第一个、互斥的开关：干活 → show 并跑 /xiaoxiaoli show，变收工；再按 → hide，变回干活', async ($, on) => {
    calmWorld(on)
    const steps: string[] = []
    on('env.set', (_$, e) => {
      steps.push(`env ${e.name}=${e.value ?? ''}`)
      return { value: undefined }
    })
    on('command.run', (_$, e) => {
      steps.push(`command /${e.command} ${e.args}`)
      return {}
    })
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    const label = async () => (await ui.find({ type: 'Text', text: /^(干活|收工)$/, in: 'controls' }))?.text
    expect(await label()).toBe('干活')
    // 开关在第一位：0-3 列
    await ui.pointer({ type: 'down', x: 1, y: 1, button: 'left', in: 'controls' })
    expect(steps).toEqual(['env XIAOXIAOLI_PANE=show', 'command /xiaoxiaoli show'])
    expect(await label()).toBe('收工')
    await ui.pointer({ type: 'down', x: 1, y: 1, button: 'left', in: 'controls' })
    expect(steps).toEqual(['env XIAOXIAOLI_PANE=show', 'command /xiaoxiaoli show', 'env XIAOXIAOLI_PANE=hide'])
    expect(await label()).toBe('干活')
    // 只有一个开关按钮，其余按钮照旧
    expect(await ui.findAll({ type: 'Text', text: /^(干活|收工)$/, in: 'controls' })).toHaveLength(1)
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.width).toBe(AVATAR_SIZE.full.columns)
    await ui.unmount()
  })

  test('环境变量被外部改成 show（/xiaoxiaoli、面板关闭键等）：下一跳后开关显示「收工」', async ($, on) => {
    const env = { value: undefined as string | undefined }
    on('env.get', (_$, e) => ({ value: e.name === 'XIAOXIAOLI_PANE' ? env.value : undefined }))
    const { clock } = await boot($, on, at(9, 0))
    const ui = await mountBand($)
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    expect(await ui.find({ type: 'Text', text: '干活', in: 'controls' })).toBeDefined()
    env.value = 'show'
    await clock.advance(1000)
    expect(await ui.find({ type: 'Text', text: '收工', in: 'controls' })).toBeDefined()
    env.value = 'hide'
    await clock.advance(1000)
    expect(await ui.find({ type: 'Text', text: '干活', in: 'controls' })).toBeDefined()
    await ui.unmount()
  })
})

describe('点击校准', () => {
  test('/xiaoli calibrate → 点 A、点 B → 存下口径并切回放松模式，之后按新口径判定', async ($, on) => {
    calmWorld(on)
    await $.command.run({ command: 'xiaoli', args: 'calibrate', ...COMMAND_ENV })
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ type: 'Text', text: /\[A\].*\[B\]/, in: 'controls' })).toBeDefined()
    // 模拟每个中文只上报 1.5 列的终端
    await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'controls' })
    await ui.pointer({ type: 'down', x: 1 + 3 + 30, y: 0, button: 'left', in: 'controls' })
    expect(await ui.find({ type: 'Text', text: /每个中文按 1\.50 列上报/ })).toBeDefined()
    // 新口径下「收起」的上报区间是 [39, 42)（最前面多了 2 个中文的开关按钮）
    await ui.pointer({ type: 'down', x: 40, y: 1, button: 'left', in: 'controls' })
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.width).toBe(AVATAR_SIZE.mini.columns)
    await ui.unmount()
  })
})

describe('斜杠命令：主命令 /xiaoli，旧命令 /xiaoke 仍可用', () => {
  test('会话启动时两个命令都注册，主命令在前', async ($, on) => {
    const { seen } = await boot($, on, at(9, 0))
    expect(seen.commands).toEqual(['xiaoli', 'xiaoke'])
  })

  test('keep off、keep、认不出的参数：/xiaoli 与 /xiaoke 回的文字一模一样', async ($, on) => {
    await boot($, on, at(13))
    for (const args of ['keep off', 'keep', 'reset']) {
      const byNew = await $.command.run({ command: 'xiaoli', args, ...COMMAND_ENV })
      const byOld = await $.command.run({ command: 'xiaoke', args, ...COMMAND_ENV })
      expect(byOld.text).toBe(byNew.text)
    }
    const off = await $.command.run({ command: 'xiaoke', args: 'keep off', ...COMMAND_ENV })
    expect(off.text).toBe('小黎：缓存保活关了，/xiaoli keep on 再打开')
    const usage = await $.command.run({ command: 'xiaoke', args: 'reset', ...COMMAND_ENV })
    expect(usage.text).toContain('不认识「reset」。用法：/xiaoli 切换工作/放松模式')
  })

  test('无参数切换模式：两个命令改的是同一份状态，/xiaoli 展开后 /xiaoke 再收起', async ($, on) => {
    calmWorld(on)
    const ui = await mountBand($)
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.width).toBe(AVATAR_SIZE.mini.columns)
    expect((await $.command.run({ command: 'xiaoli', args: '', ...COMMAND_ENV })).text).toBe('小黎：展开啦')
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.width).toBe(AVATAR_SIZE.full.columns)
    expect((await $.command.run({ command: 'xiaoke', args: '', ...COMMAND_ENV })).text).toBe('小黎：缩小一点陪你')
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.width).toBe(AVATAR_SIZE.mini.columns)
    await ui.unmount()
  })
})

describe('强制休息', () => {
  test('/xiaoli rest 后小黎旁边弹出休息气泡，倒计时结束前收不回去', async ($, on) => {
    calmWorld(on)
    const result = await $.command.run({ command: 'xiaoli', args: 'rest', ...COMMAND_ENV })
    expect(result.text).toContain('休息 2 分钟')
    const ui = await mountBand($)
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.width).toBe(AVATAR_SIZE.full.columns)
    expect(await bubbleText(ui, /休息一下/)).toBeDefined()
    expect(await bubbleText(ui, /还剩 2:00/)).toBeDefined()
    // 气泡占了按钮的位置
    expect(await ui.find({ type: 'Client', key: 'controls' })).toBeUndefined()
    const stay = await $.command.run({ command: 'xiaoli', args: '', ...COMMAND_ENV })
    expect(stay.text).toMatch(/还剩 2:00|再坚持 2:00|还有 2:00/)
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.width).toBe(AVATAR_SIZE.full.columns)
    await ui.unmount()
  })

  test('带子高度放不下放松模式时，只能用工作模式显示', async ($, on) => {
    calmWorld(on)
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, maxRows: 3 } })
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.width).toBe(AVATAR_SIZE.mini.columns)
    await ui.unmount()
  })
})

describe('像素形象', () => {
  const base: AvatarPose = {
    size: 'full',
    mood: 'idle',
    gaze: 0,
    isBlink: false,
    isPressed: false,
    isTalking: false,
    wavePhase: 0,
    typePhase: 0,
    heartPhase: null,
    isSparkle: false,
  }

  test('工作模式就是 Claude Code logo 藏起腿的样子（放松模式的一半大）', () => {
    const runs = toRuns(avatarPixels({ ...base, size: 'mini' }))
    const rows = runs.map(row => row.map(r => r.text).join(''))
    // 正面：第 1 行脑袋上半格是身体、下半格第 2、6 列是眼睛；第 2 行伸出小手
    expect(rows).toEqual([' █▀███▀█ ', '▀███████▀'])
    const eyes = runs[0]?.filter(r => r.bg === PALETTE.D)
    expect(eyes).toHaveLength(2)
  })

  test('不同心情不同身体颜色：空闲蓝、干活青、开心粉、骄傲金、担心紫、犯困灰蓝', () => {
    expect(BODY_COLOR.idle).toBe('#4f8ff7')
    expect(new Set(Object.values(BODY_COLOR)).size).toBe(6)
    for (const mood of ['idle', 'watching', 'happy', 'worried', 'sleepy', 'proud', 'shy'] as const) {
      for (const size of ['full', 'mini'] as const) {
        const runs = toRuns(avatarPixels({ ...base, size, mood }), paletteFor(mood)).flat()
        expect(runs.some(r => r.fg === BODY_COLOR[mood])).toBe(true)
      }
    }
  })

  test('放松模式 18×4 格、工作模式 9×2 格，各种姿态行宽都对得上', () => {
    for (const size of ['full', 'mini'] as const) {
      for (const mood of ['idle', 'watching', 'happy', 'worried', 'sleepy', 'proud', 'shy'] as const) {
        for (const extra of [{}, { heartPhase: 1, wavePhase: 1, isTalking: true, isSparkle: true }, { typePhase: 2, gaze: -1 }, { gaze: 1 }]) {
          const runs = toRuns(avatarPixels({ ...base, ...extra, size, mood }), paletteFor(mood))
          expect(runs).toHaveLength(AVATAR_SIZE[size].rows)
          for (const row of runs) expect(row.map(r => r.text).join('')).toHaveLength(AVATAR_SIZE[size].columns)
        }
      }
    }
  })
})

describe('安静模式', () => {
  test('/xiaoli quiet on 后台词位置明确提示在安静模式，quiet off 恢复说话', async ($, on) => {
    calmWorld(on)
    await $.command.run({ command: 'xiaoli', args: 'quiet on', ...COMMAND_ENV })
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ type: 'Text', text: /安静模式中，\/xiaoli quiet off 恢复说话/ })).toBeDefined()
    await ui.unmount()
    const back = await $.command.run({ command: 'xiaoli', args: 'quiet off', ...COMMAND_ENV })
    expect(back.text).toContain('我回来啦')
    const ui2 = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    expect(await ui2.find({ type: 'Text', text: /安静模式中/ })).toBeUndefined()
    await ui2.unmount()
  })
})

describe('真实台词', () => {
  const facts = { prompt: '帮我查一下批量保存为什么会 413' }

  test('提问时零 token：模板句直接引用问题开头', () => {
    const line = startEcho(facts.prompt, () => 0)
    expect(line).toBe('收到「帮我查一下批量保存为什么会…」，我在旁边盯着～')
  })

  test('只有值得说的轮次才调 haiku：被打断、没用工具的短闲聊都跳过', () => {
    expect(isWorthReacting({ ...facts, reason: 'aborted', toolCounts: { Read: 3 } })).toBe(false)
    expect(isWorthReacting({ ...facts, reason: 'answer', answer: '好的' })).toBe(false)
    expect(isWorthReacting({ ...facts, reason: 'answer', toolCounts: { Edit: 1 } })).toBe(true)
  })

  test('一轮结束的上下文紧凑但带上真实发生的事：工具、动过的文件、失败、回复要点', () => {
    const p = donePrompt({
      ...facts,
      reason: 'answer',
      duration: '3min 10s',
      toolCounts: { Read: 5, Edit: 2 },
      touched: ['Read BatchDesign.js', 'Edit save.js'],
      errors: 1,
      answer: '根因是窗口期 dataURL 穿透，单裁片 13-26MB',
    })
    expect(p).toContain('Read×5 Edit×2')
    expect(p).toContain('Edit save.js')
    expect(p).toContain('失败1次')
    expect(p).toContain('dataURL 穿透')
    // 为了省 token：整段上下文控制在 300 字以内，人设一行
    expect(p.length).toBeLessThan(300)
    expect(reactSystem().length).toBeLessThan(90)
  })

  test('长问题、长回复都会被截短', () => {
    const p = donePrompt({ prompt: '问'.repeat(500), reason: 'answer', toolCounts: { Read: 1 }, answer: '答'.repeat(2000) })
    expect(p.length).toBeLessThan(260)
  })

  test('模型回复清洗成一行台词', () => {
    expect(cleanLine('「413 的根因找到啦，干得漂亮！」\n多余的第二行')).toBe('413 的根因找到啦，干得漂亮！')
    expect(cleanLine('小黎：辛苦啦')).toBe('辛苦啦')
    expect(cleanLine('')).toBe('')
  })

  test('/xiaoli ai off 关掉真实台词，ai on 再打开', async ($, on) => {
    calmWorld(on)
    const off = await $.command.run({ command: 'xiaoli', args: 'ai off', ...COMMAND_ENV })
    expect(off.text).toBe('小黎：好，每轮结束不再自动说话了（不花 token）；点「悄悄话」仍会调用一次')
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await ui.post({ type: 'control', key: 'chip-status' }, { in: 'controls' })
    expect(await ui.find({ type: 'Text', text: /真实台词已关/ })).toBeDefined()
    await ui.unmount()
    const back = await $.command.run({ command: 'xiaoli', args: 'ai on', ...COMMAND_ENV })
    expect(back.text).toContain('用 haiku')
  })
})

describe('提醒气泡（画法和点击）', () => {
  const base: BubbleProps = {
    id: 1,
    layout: 'full',
    width: 44,
    title: '久坐提醒 · 起来走走',
    text: '12 点啦，站起来走两步、伸个懒腰吧',
    color: '#ff9f43',
    countdown: '还剩 2:55',
    left: 0.97,
    button: { label: '0:55 后可点', isReady: false },
    map: DEFAULT_MAP,
  }
  const widthOf = (row: readonly Seg[]) => row.reduce((w, seg) => w + displayWidth(seg.text), 0)
  const joined = (p: BubbleProps) => bubbleRows(p, false).map(row => row.map(seg => seg.text).join(''))

  test('4 行圆角气泡：每行一样宽、右边框对得齐，尾巴在第 3 行指向小黎，按钮嵌在下边框', () => {
    // 宽 44：标题 19 列、倒计时 9 列，上边框补 7 条线；台词 33 列，补 6 个空格；进度线 39 格剩 97%
    expect(joined(base)).toEqual([
      ` ╭─ 久坐提醒 · 起来走走 ${'─'.repeat(7)} 还剩 2:55 ─╮`,
      ` │ 12 点啦，站起来走两步、伸个懒腰吧${' '.repeat(6)} │`,
      `◀┤ ${'━'.repeat(38)}─ │`,
      ` ╰${'─'.repeat(25)}  0:55 后可点  ─╯`,
    ])
    for (const width of [40, 44, 52, 64]) {
      for (const text of ['短', '很长的台词'.repeat(12)]) {
        for (const left of [0, 0.5, 1]) {
          for (const button of [base.button, { label: '我起来啦', isReady: true }]) {
            const rows = bubbleRows({ ...base, width, text, left, button }, false)
            expect(rows).toHaveLength(4)
            for (const row of rows) expect(widthOf(row)).toBe(width)
          }
        }
      }
    }
  })

  test('解锁后按钮是亮色底的实心块，锁着时是灰的', () => {
    const ready = bubbleRows({ ...base, button: { label: '我起来啦', isReady: true } }, false)[3]?.find(seg => seg.isButton)
    expect(ready).toEqual({ text: ' 我起来啦 ', bg: base.color, color: '#1b1b1b', bold: true, isButton: true })
    expect(bubbleRows(base, false)[3]?.find(seg => seg.isButton)?.dim).toBe(true)
  })

  test('宽度跟着内容走，不撑满整行，最多 64 列', () => {
    const labels = ['我起来啦', '0:00 后可点']
    expect(bubbleWidth({ title: base.title, text: '补充点水分', labels }, 200)).toBe(40)
    expect(bubbleWidth({ title: base.title, text: '长'.repeat(50), labels }, 200)).toBe(64)
    expect(bubbleWidth({ title: base.title, text: '长'.repeat(50), labels }, 50)).toBe(50)
  })

  test('只有点在按钮上才算；中文少报列的终端按校准口径换算后也点得准', () => {
    const ready = { ...base, button: { label: '我起来啦', isReady: true } }
    // full：按钮前全是边框线，没有中文，口径不影响
    const hits = [...Array(80).keys()].filter(x => hitButton(ready, x, 3))
    expect(Math.min(...hits)).toBe(44 - 6 - 10 + 3 - 1)
    expect(hitButton(ready, hits[0] ?? 0, 2)).toBe(false)
    // compact：按钮前面有中文标题和倒计时；按 1.5 列口径上报时区间是 [29, 37)，按正常口径会点歪
    const compact: BubbleProps = { ...ready, layout: 'compact', width: 80, map: { off: 0, cjk: 1.5 } }
    expect(hitButton(compact, 29, 0)).toBe(true)
    expect(hitButton(compact, 36, 0)).toBe(true)
    expect(hitButton(compact, 39, 0)).toBe(false)
    expect(hitButton({ ...compact, map: DEFAULT_MAP }, 29, 0)).toBe(false)
  })
})

describe('定点提醒（10/12/16/18 久坐，11/15/17 喝水）', () => {
  test('一天 7 个提醒点逐个往后排；当前小时还没弹也算下一个', () => {
    const fired: string[] = []
    let done: number[] = []
    for (let h = 0; h < 24; h += 1) {
      const slot = nextSlot(h, done)
      if (slot?.hour !== h) continue
      fired.push(`${h}${slot.kind}`)
      done = [...done, h]
    }
    expect(fired).toEqual(['10sit', '11water', '12sit', '15water', '16sit', '17water', '18sit'])
    expect(nextSlot(13, [10, 11, 12])).toEqual({ hour: 15, kind: 'water' })
    expect(nextSlot(10, [])).toEqual({ hour: 10, kind: 'sit' })
    expect(nextSlot(19, [])).toBeUndefined()
    expect(kindAt(14)).toBeUndefined()
  })

  test('提醒记录按天算：换了一天就清空，坏数据丢掉', () => {
    expect(doneHours(readLog({ day: '2026-10-14', done: { 10: 1 } }, '2026-10-15'))).toEqual([])
    expect(doneHours(readLog({ day: '2026-10-15', done: { 16: 3, 10: 1, x: 'bad' } }, '2026-10-15'))).toEqual([10, 16])
    expect(doneHours(readLog(null, '2026-10-15'))).toEqual([])
  })

  test('到点在小黎旁边弹出对话气泡，强提醒 3 分钟，不再走右上角 toast', async ($, on) => {
    const { clock, seen } = await boot($, on, at(9, 59, 50))
    const ui = await mountBand($)
    expect(await bubbleOf(ui)).toBeUndefined()
    await clock.advance(15_000)
    const client = await ui.find({ type: 'Client', key: 'bubble' })
    // 和放松模式的小黎一样高；宽度跟着内容走，不撑满整行
    expect(client?.props.height).toBe(4)
    expect(client?.props.width).toBeLessThanOrEqual(64)
    expect((await ui.find({ type: 'Client', key: 'avatar' }))?.props.width).toBe(AVATAR_SIZE.full.columns)
    expect(await bubbleText(ui, /^久坐提醒 · 起来走走$/)).toBeDefined()
    expect(await bubbleText(ui, /^还剩 2:5\d$/)).toBeDefined()
    expect(await bubbleText(ui, /0:5\d 后可点/)).toBeDefined()
    expect(seen.toasts).toBe(0)
    expect(seen.notifies).toBe(1)
    // 2 分多钟后还在
    await clock.advance(2 * 60_000)
    expect(await bubbleOf(ui)).toBeDefined()
    // 3 分钟到了收回去
    await clock.advance(60_000)
    expect(await bubbleOf(ui)).toBeUndefined()
    await ui.unmount()
  })

  test('完成按钮前 1 分钟锁着，点了只撒娇；1 分钟后点「我起来啦」提前收起', async ($, on) => {
    const { clock } = await boot($, on, at(9, 59, 50))
    const ui = await mountBand($)
    await clock.advance(15_000)
    await ui.post({ type: 'done' }, { in: 'bubble' })
    expect(await bubbleText(ui, /按钮亮了才能点/)).toBeDefined()
    expect((await bubbleOf(ui))?.button.isReady).toBe(false)
    await clock.advance(60_000)
    const p = await bubbleOf(ui)
    expect(p?.button).toEqual({ label: '我起来啦', isReady: true })
    // 在终端里真的点一下下边框上的按钮
    const x = p === undefined ? -1 : [...Array(p.width).keys()].find(i => hitButton(p, i, 3)) ?? -1
    await ui.pointer({ type: 'down', x: x + 2, y: 3, button: 'left', in: 'bubble' })
    expect(await bubbleOf(ui)).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /活动开了|走一走/ })).toBeDefined()
    await ui.unmount()
  })

  test('同一个会话一天能弹多次：10 点久坐弹过，11 点照样弹喝水', { timeoutMs: 30_000 }, async ($, on) => {
    const { clock } = await boot($, on, at(9, 59, 50))
    const ui = await mountBand($)
    await clock.advance(15_000)
    expect(await bubbleText(ui, /久坐提醒/)).toBeDefined()
    // 10:40 回来点了下小黎（人在）
    await clock.set(at(10, 40))
    expect(await bubbleOf(ui)).toBeUndefined()
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await clock.set(at(11, 0, 5))
    expect(await bubbleText(ui, /喝水提醒 · 喝口水/)).toBeDefined()
    expect(await bubbleText(ui, /0:5\d 后可点/)).toBeDefined()
    await ui.unmount()
  })

  test('到点人不在电脑前先不弹，这个小时内回来一动就补上', { timeoutMs: 30_000 }, async ($, on) => {
    const { clock } = await boot($, on, at(9, 29))
    const ui = await mountBand($)
    // 9:29 之后一直没动静，10 点到了也不弹
    await clock.set(at(10, 0, 5))
    expect(await bubbleOf(ui)).toBeUndefined()
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await clock.advance(1000)
    expect(await bubbleText(ui, /久坐提醒/)).toBeDefined()
    await ui.unmount()
  })

  test('多个会话共用一份记录：别的会话刚弹过就跟着亮剩下的时间，不重复通知', async ($, on) => {
    const reminders = { day: dayKey(at(10)), done: { 10: at(10, 0) } }
    const { clock, seen } = await boot($, on, at(10, 1), { reminders })
    const ui = await mountBand($)
    await clock.advance(1000)
    expect(await bubbleText(ui, /久坐提醒/)).toBeDefined()
    expect(await bubbleText(ui, /还剩 1:59/)).toBeDefined()
    // 别的会话那边已经过了 1 分钟，这边按钮也一起解锁
    expect((await bubbleOf(ui))?.button.isReady).toBe(true)
    expect(seen.notifies).toBe(0)
    await ui.unmount()
  })

  test('别的会话弹过已经超过 3 分钟：新开的会话不再弹', async ($, on) => {
    const reminders = { day: dayKey(at(10)), done: { 10: at(10, 0) } }
    const { clock } = await boot($, on, at(10, 20), { reminders })
    const ui = await mountBand($)
    await clock.advance(1000)
    expect(await bubbleOf(ui)).toBeUndefined()
    await ui.unmount()
  })

  test('带子放不下 4 行：2 行的紧凑气泡，按钮照样能点', async ($, on) => {
    const { clock } = await boot($, on, at(9, 59, 50))
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, maxRows: 3 } })
    await clock.advance(15_000)
    const client = await ui.find({ type: 'Client', key: 'bubble' })
    expect(client?.props.height).toBe(2)
    expect((await bubbleOf(ui))?.layout).toBe('compact')
    expect(await bubbleText(ui, /久坐提醒 · 起来走走/)).toBeDefined()
    await ui.unmount()
  })

  test('安静模式不弹', async ($, on) => {
    const { clock, seen } = await boot($, on, at(16, 59, 55))
    await $.command.run({ command: 'xiaoli', args: 'quiet on', ...COMMAND_ENV })
    const ui = await mountBand($)
    await clock.advance(10_000)
    expect(await bubbleOf(ui)).toBeUndefined()
    expect(seen.notifies).toBe(0)
    await ui.unmount()
    await $.command.run({ command: 'xiaoli', args: 'quiet off', ...COMMAND_ENV })
  })
})

describe('模型和思考强度', () => {
  test('模型 ID 缩成短名，后面跟思考强度', () => {
    expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(prettyModel('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5')
    expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
    expect(prettyModel('opus')).toBe('Opus')
    expect(brainLabel('claude-fable-5-1', 'xhigh')).toBe('Fable 5.1 · 思考 xhigh')
    expect(brainLabel('claude-haiku-5-5', '')).toBe('Haiku 5.5')
    expect(brainLabel('', 'high')).toBe('')
  })

  test('用量前面显示模型和思考强度：开会话先按设置，发出请求后按实际值，子代理的不算', async ($, on) => {
    on('turn.step', async function* (_$, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
    await boot($, on, at(14))
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ type: 'Text', text: /· {2}Opus 5\.5 · 思考 xhigh · 下一轮≈/ })).toBeDefined()
    const step = async (e: { model: string; effort: 'low' | 'high'; agentId?: string }) => {
      for await (const chunk of $.turn.step({ turnId: 't1', index: 0, messageCount: 1, ...e })) void chunk
    }
    await step({ model: 'claude-sonnet-5-5', effort: 'high' })
    expect(await ui.find({ type: 'Text', text: /Sonnet 5\.5 · 思考 high/ })).toBeDefined()
    await step({ model: 'claude-haiku-5-5', effort: 'low', agentId: 'a1' })
    expect(await ui.find({ type: 'Text', text: /Sonnet 5\.5 · 思考 high/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('预估', () => {
  test('时长按 s → min → h → d 进位', () => {
    expect(fmtDuration(35_000)).toBe('35s')
    expect(fmtDuration(130_000)).toBe('2min 10s')
    expect(fmtDuration(3_900_000)).toBe('1h 5min')
    expect(fmtDuration(93_600_000)).toBe('1d 2h')
  })

  test('中文按字、英文按字符折算 token', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('你好世界')).toBe(5)
    expect(estimateTokens('hello world!')).toBe(4)
  })

  test('有历史时按实际倍率和额度消耗校准', () => {
    const turns = [
      { base: 10_000, processed: 50_000, output: 1000, quotaDelta: 1, ms: 30_000 },
      { base: 20_000, processed: 100_000, output: 3000, quotaDelta: 2, ms: 60_000 },
    ]
    const fc = forecast(20_000, 0, turns, { kind: 'five_hour', percentUsed: 40 })
    expect(fc.processed).toBe(115_000)
    expect(fc.turnsLeft).toBe(26)
  })
})

describe('缓存保活', () => {
  /** 一次请求的用量：读了多少缓存、多少没走缓存 */
  const usage = (read: number, input = 200, output = 3) => ({
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: read,
    cache_creation_input_tokens: 0,
  })
  const answered = (read: number, input = 200) => ({ isAnswered: true as const, text: '在', usage: usage(read, input) })
  const overloaded = {
    isAnswered: false as const,
    reason: 'api-error' as const,
    status: 529,
    error: 'overloaded' as const,
    usage: usage(0, 0, 0),
  }
  const step = async ($: Engine, e: { model: string; agentId?: string }) => {
    for await (const chunk of $.turn.step({ turnId: 't1', index: 0, messageCount: 1, ...e })) void chunk
  }
  const answerSteps = (on: On) =>
    on('turn.step', async function* (_$, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })

  test('主对话最后一次请求后 50 分钟才发；还没缓存、关了、正在发都不发', () => {
    const k = noteRequest(NEW_KEEP, at(9))
    expect(keepStep(NEW_KEEP, at(9) + KEEP_IDLE_MS).kind).toBe('wait')
    expect(keepStep(k, at(9, 49, 59)).kind).toBe('wait')
    expect(keepStep(k, at(9, 50)).kind).toBe('send')
    expect(keepStep({ ...k, isOn: false }, at(9, 50)).kind).toBe('wait')
    expect(keepStep({ ...k, isSending: true }, at(9, 50)).kind).toBe('wait')
    expect(nextKeepAt(k)).toBe(at(9, 50))
  })

  test('期间有对话就顺延：从最后一次请求重新算 50 分钟，停下的也恢复', () => {
    const k = noteRequest(noteRequest(NEW_KEEP, at(9)), at(9, 30))
    expect(keepStep(k, at(9, 50)).kind).toBe('wait')
    expect(keepStep(k, at(10, 20)).kind).toBe('send')
    const resumed = noteRequest({ ...k, stopped: '缓存没读到' }, at(11))
    expect(resumed.stopped).toBe('')
    expect(nextKeepAt(resumed)).toBe(at(11, 50))
  })

  test('电脑睡过、距上次请求已超过 58 分钟：缓存来不及保，停下不发', () => {
    const s = keepStep(noteRequest(NEW_KEEP, at(9)), at(10, 10))
    expect(s.kind).toBe('stop')
    expect(s.kind === 'stop' ? s.reason : '').toContain('来不及')
  })

  test('设了 8 小时上限、一直没对话：每 50 分钟一次，连续 8 小时后停，一共 9 次', () => {
    let k = { ...noteRequest(NEW_KEEP, at(9)), maxHours: 8 }
    let sent = 0
    for (let t = at(9); t <= at(18); t += 60_000) {
      const s = keepStep(k, t)
      if (s.kind === 'stop') {
        k = { ...k, stopped: s.reason }
        break
      }
      if (s.kind === 'send') {
        sent += 1
        k = settleKeep({ ...k, isSending: true }, judgeFork(answered(100_000)), t, t).next
      }
    }
    expect(sent).toBe(9)
    expect(k.count).toBe(9)
    expect(k.stopped).toContain('8 小时')
  })

  test('设了 8 小时上限：第 9 次之后卡片写明到 8h 上限、缓存几点过期', () => {
    const k = { ...noteRequest(NEW_KEEP, at(9)), lastAt: at(16, 30), maxHours: 8 }
    expect(nextKeepAt(k)).toBe(0)
    expect(keepStatusLine(k, at(16, 31))).toContain('到 8h 上限不再保活，缓存约 17:30 过期')
  })

  test('命中：次数 +1，从发出时重新计时，toast 写明续到几点', () => {
    const k = { ...noteRequest(NEW_KEEP, at(9)), isSending: true }
    const s = settleKeep(k, judgeFork(answered(128_000)), at(9, 50), at(9, 50, 4))
    expect(s.isKept).toBe(true)
    expect(s.next).toMatchObject({ count: 1, lastAt: at(9, 50), read: 128_000, output: 3, isSending: false })
    expect(s.toast).toBe('小黎：缓存保活第 1 次，读缓存 128.0k，续到 10:50')
    expect(nextKeepAt(s.next)).toBe(at(10, 40))
  })

  test('读到的缓存不到一半：判定已失效，停下并提示，下次对话后恢复', () => {
    const k = { ...noteRequest(NEW_KEEP, at(9)), isSending: true }
    const s = settleKeep(k, judgeFork(answered(1_000, 99_000)), at(9, 50), at(9, 50, 5))
    expect(s.isKept).toBe(false)
    expect(s.next.count).toBe(0)
    expect(s.next.stopped).toContain('只命中 1%')
    expect(s.toast).toContain('可能已过期')
    expect(keepStep(s.next, at(10, 40)).kind).toBe('wait')
    expect(nextKeepAt(noteRequest(s.next, at(11)))).toBe(at(11, 50))
  })

  test('接口失败：3 分钟后重试一次，再失败就停下', () => {
    const k = { ...noteRequest(NEW_KEEP, at(9)), isSending: true }
    const first = settleKeep(k, judgeFork(overloaded), at(9, 50), at(9, 50, 2))
    expect(first.next.retryAt).toBe(at(9, 53, 2))
    expect(first.toast).toBe('小黎：缓存保活失败（接口错误 529 overloaded），3 分钟后重试')
    expect(keepStep(first.next, at(9, 53)).kind).toBe('wait')
    expect(keepStep(first.next, at(9, 53, 2)).kind).toBe('send')
    const second = settleKeep({ ...first.next, isSending: true }, judgeFork(overloaded), at(9, 53, 2), at(9, 53, 4))
    expect(second.next.retryAt).toBe(0)
    expect(second.next.stopped).toContain('保活失败')
  })

  test('重试会超过 58 分钟就不重试，直接停下', () => {
    const k = { ...noteRequest(NEW_KEEP, at(9)), isSending: true }
    const s = settleKeep(k, judgeFork(overloaded), at(9, 55), at(9, 55, 30))
    expect(s.next.retryAt).toBe(0)
    expect(s.next.stopped).toContain('保活失败')
  })

  test('还没有可保的缓存（新会话、刚 /clear）：不计数、不弹 toast，等下次对话', () => {
    const k = { ...noteRequest(NEW_KEEP, at(9)), isSending: true }
    const s = settleKeep(k, judgeFork({ isAnswered: false, reason: 'nothing-to-fork' }), at(9, 50), at(9, 50))
    expect(s.next.lastAt).toBe(0)
    expect(s.next.count).toBe(0)
    expect(s.toast).toBe('')
    expect(keepStatusLine(s.next, at(9, 51))).toContain('还没有可保的缓存')
  })

  test('保活路上主对话自己发了请求：没命中也不停下，计时以主对话为准', () => {
    const k = { ...noteRequest(NEW_KEEP, at(9, 50, 3)), isSending: true }
    const s = settleKeep(k, judgeFork(answered(0, 100_000)), at(9, 50), at(9, 50, 5))
    expect(s.next.stopped).toBe('')
    expect(s.next.lastAt).toBe(at(9, 50, 3))
    expect(s.toast).toBe('')
  })

  test('次数按本会话今天算：过 0 点清零', () => {
    const k = { ...NEW_KEEP, day: '2026-10-15', count: 4, read: 500_000, output: 20, last: '23:10 读缓存 125.0k ✓ 出 5' }
    expect(rollDay(k, '2026-10-15')).toBe(k)
    expect(rollDay(k, '2026-10-16')).toMatchObject({ day: '2026-10-16', count: 0, read: 0, output: 0, last: '' })
  })

  test('主对话 50 分钟没请求：旁路请求一次，toast + 小黎说一句，工作模式显示「保活 1 次」', { timeoutMs: 90_000 }, async ($, on) => {
    const prompts: string[] = []
    on('model.fork', (_$, e) => {
      prompts.push(e.prompt)
      return { value: answered(120_000, 300) }
    })
    answerSteps(on)
    const { clock, seen } = await boot($, on, at(13))
    const ui = await mountBand($)
    expect(await ui.find({ type: 'Text', text: /· 保活 0 次$/ })).toBeDefined()
    await step($, { model: 'claude-opus-5-5' })
    await clock.set(at(13, 49, 59))
    expect(prompts).toHaveLength(0)
    await clock.advance(2000)
    expect(prompts).toEqual([KEEP_PROMPT])
    expect(seen.toasts).toBe(1)
    expect(await ui.find({ type: 'Text', text: /· 保活 1 次$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /续了下缓存|缓存焐热|上下文续上/ })).toBeDefined()
    await ui.unmount()
  })

  test('放松模式「保活」胶囊：子代理的请求不算；/xiaoli keep off 后工作模式不再显示', async ($, on) => {
    answerSteps(on)
    await boot($, on, at(13))
    const ui = await mountBand($)
    await step($, { model: 'claude-haiku-5-5', agentId: 'a1' })
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    expect(await ui.find({ type: 'Text', text: '保活 0 次', in: 'controls' })).toBeDefined()
    await ui.post({ type: 'control', key: 'chip-keep' }, { in: 'controls' })
    expect(await ui.find({ type: 'Text', text: /^还没有可保的缓存/ })).toBeDefined()
    await step($, { model: 'claude-opus-5-5' })
    expect(await ui.find({ type: 'Text', text: /^下次保活 13:50（还剩 \d+min）· 本会话今天 0 次/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^今天还没保活过 · 今天累计读缓存 0/ })).toBeDefined()
    await ui.post({ type: 'control', key: 'expand' }, { in: 'controls' })
    const off = await $.command.run({ command: 'xiaoli', args: 'keep off', ...COMMAND_ENV })
    expect(off.text).toContain('缓存保活关了')
    expect(await ui.find({ type: 'Text', text: /保活/ })).toBeUndefined()
    const status = await $.command.run({ command: 'xiaoli', args: 'keep', ...COMMAND_ENV })
    expect(status.text).toContain('缓存保活已关')
    await ui.unmount()
  })

  test('设了上限时，保活的 fork 在路上时来的请求不算真实对话：上限照常从最后一次真实对话算，闲置计时仍从保活发出时重算', { timeoutMs: 90_000 }, async ($, on) => {
    let release = () => undefined as void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    on('model.fork', async () => {
      await gate
      return { value: answered(120_000, 300) }
    })
    answerSteps(on)
    const { clock } = await boot($, on, at(13))
    await $.command.run({ command: 'xiaoli', args: 'keep max 8', ...COMMAND_ENV })
    await step($, { model: 'claude-opus-5-5' })
    await clock.set(at(13, 50))
    // 保活发出去还没回来：这时引擎若为它跑了一次 turn.step，不能当成主对话的请求
    await step($, { model: 'claude-opus-5-5' })
    release()
    await clock.advance(1000)
    const status = await $.command.run({ command: 'xiaoli', args: 'keep', ...COMMAND_ENV })
    expect(status.text).toContain('本会话今天 1 次')
    expect(status.text).toContain('距上次对话 50min')
    expect(status.text).toContain('下次保活 14:40')
    expect(status.text).toContain('/ 上限 8h')
  })

  test('保活路上主对话真的开始了一轮：那一轮的请求照样算真实对话', { timeoutMs: 90_000 }, async ($, on) => {
    let release = () => undefined as void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    on('model.fork', async () => {
      await gate
      return { value: answered(120_000, 300) }
    })
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    answerSteps(on)
    const { clock } = await boot($, on, at(13))
    await step($, { model: 'claude-opus-5-5' })
    await clock.set(at(13, 50))
    await $.turn.start({ text: '继续', turnId: 't2' })
    await step($, { model: 'claude-opus-5-5' })
    release()
    await clock.advance(1000)
    const status = await $.command.run({ command: 'xiaoli', args: 'keep', ...COMMAND_ENV })
    expect(status.text).toContain('距上次对话 不到 1min')
  })

  test('/xiaoli keep on 让停下的立刻恢复：缓存还在就接着保，保不住的等下次对话计时，状态句不再说下次对话后恢复', () => {
    // 设了 8 小时上限、连续 8 小时没对话停下：最后一次保活 16:30 还续着缓存，17:20 打开就马上接着保
    const capped = { ...noteRequest(NEW_KEEP, at(9)), lastAt: at(16, 30), maxHours: 8, stopped: '连续 8 小时没对话，停止保活' }
    const resumed = resumeKeep(capped, at(17, 20))
    expect(resumed).toMatchObject({ isOn: true, stopped: '', retryAt: 0, realAt: at(17, 20), lastAt: at(16, 30) })
    expect(keepStep(resumed, at(17, 20)).kind).toBe('send')
    expect(keepStatusLine(resumed, at(17, 20))).toMatch(/^马上保活/)
    // 没读到缓存停下的：缓存已经过期，当作还没有可保的缓存
    const k = { ...noteRequest(NEW_KEEP, at(9)), isSending: true }
    const missed = settleKeep(k, judgeFork(answered(1_000, 99_000)), at(9, 50), at(9, 50, 5)).next
    const fresh = resumeKeep(missed, at(9, 51))
    expect(fresh).toMatchObject({ stopped: '', lastAt: 0 })
    expect(keepStatusLine(fresh, at(9, 51))).toContain('还没有可保的缓存')
    // 距上次请求超过 58 分钟（电脑睡过）停下的：同样等下次对话
    expect(resumeKeep({ ...noteRequest(NEW_KEEP, at(9)), stopped: '缓存来不及保了' }, at(10, 10)).lastAt).toBe(0)
    // 没停下的只是打开，计时不动
    const off = { ...noteRequest(NEW_KEEP, at(9)), isOn: false }
    expect(resumeKeep(off, at(9, 10))).toEqual({ ...off, isOn: true })
    for (const s of [resumed, fresh]) expect(keepStatusLine(s, at(17, 21))).not.toContain('下次对话后恢复')
  })

  test('保活失败停下后 /xiaoli keep on：回复不再说下次对话后恢复，下一跳就重新保活', { timeoutMs: 90_000 }, async ($, on) => {
    let forks = 0
    on('model.fork', () => {
      forks += 1
      return { value: forks <= 2 ? overloaded : answered(120_000, 300) }
    })
    answerSteps(on)
    const { clock } = await boot($, on, at(13))
    await step($, { model: 'claude-opus-5-5' })
    // 13:50 失败、13:53 重试再失败 → 停下
    await clock.set(at(13, 53, 10))
    expect(forks).toBe(2)
    expect((await $.command.run({ command: 'xiaoli', args: 'keep', ...COMMAND_ENV })).text).toContain('已停下')
    const reply = await $.command.run({ command: 'xiaoli', args: 'keep on', ...COMMAND_ENV })
    expect(reply.text).not.toContain('下次对话后恢复')
    expect(reply.text).not.toContain('已停下')
    expect(reply.text).toContain('马上保活')
    await clock.advance(1000)
    expect(forks).toBe(3)
    expect((await $.command.run({ command: 'xiaoli', args: 'keep', ...COMMAND_ENV })).text).toContain('本会话今天 1 次')
  })
})

describe('0.4.2 修复', () => {
  const turnHooks = (on: On) => {
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
  }
  const cmd = ($: Engine, args: string) => $.command.run({ command: 'xiaoli', args, ...COMMAND_ENV })
  const avatarOf = async (ui: Band) => (await ui.find({ type: 'Client', key: 'avatar' }))?.props

  test('子代理开始不冲掉主对话这一轮：台词、交给 haiku 的「问」和工具统计都还是主对话的', async ($, on) => {
    const prompts: string[] = []
    on('model.complete', (_$, e) => {
      prompts.push(e.prompt)
      return {
        value: {
          isAnswered: true as const,
          text: '查到原因啦',
          usage: { input_tokens: 100, output_tokens: 8, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }
    })
    on('tool.call', () => ({ result: 'ok' }))
    turnHooks(on)
    const { clock } = await boot($, on, at(14))
    const ui = await mountBand($)
    await $.turn.start({ text: '帮我查批量保存为什么报错', turnId: 't1' })
    expect(await ui.find({ type: 'Text', text: /帮我查批量保存/ })).toBeDefined()
    await $.tool.call({ tool: 'Read', file_path: 'save.js' })
    await $.turn.start({ text: '子代理任务：搜遍全部文件', turnId: 't2', agentId: 'a1' })
    expect(await ui.find({ type: 'Text', text: /帮我查批量保存/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /子代理任务/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /正在 Read save\.js/ })).toBeDefined()
    await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '已定位：保存接口在窗口期把 dataURL 直接塞进请求体，单个裁片就有十几兆。', durationMs: 30_000, isAborted: false })
    await clock.advance(1000)
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('问:帮我查批量保存为什么报错')
    expect(prompts[0]).toContain('Read×1')
    await ui.unmount()
  })

  test('带子不足 4 行时点小黎：说展不开，不改模式、不加好感；/xiaoli calibrate 回复写明要 4 行高', async ($, on) => {
    calmWorld(on)
    const short = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, isCollapsed: false, maxRows: 3 } })
    await short.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await short.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    expect((await short.find({ type: 'Text', text: L.TOO_SHORT }))?.text).toBe(L.TOO_SHORT)
    expect((await avatarOf(short))?.width).toBe(AVATAR_SIZE.mini.columns)
    await short.unmount()
    // 窗口拉高：仍是原来的工作模式，好感没涨
    const tall = await mountBand($)
    expect((await avatarOf(tall))?.width).toBe(AVATAR_SIZE.mini.columns)
    await tall.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    expect((await avatarOf(tall))?.width).toBe(AVATAR_SIZE.full.columns)
    await tall.post({ type: 'control', key: 'chip-status' }, { in: 'controls' })
    expect(await tall.find({ type: 'Text', text: '好感 0' })).toBeDefined()
    await tall.unmount()
    expect((await cmd($, 'calibrate')).text).toContain('带子要有 4 行高才画得出 [A][B]')
  })

  test('被拒绝结束说「没法答」，不说接口闹脾气；接口出错照旧', async ($, on) => {
    turnHooks(on)
    await boot($, on, at(14))
    const ui = await mountBand($)
    await $.turn.start({ text: '问个问题', turnId: 't1' })
    await $.turn.complete({ turnId: 't1', reason: 'refusal', refusal: { category: null, explanation: null }, answer: '', durationMs: 5000, isAborted: false })
    expect(await ui.find({ type: 'Text', text: L.TURN_REFUSED })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /闹脾气/ })).toBeUndefined()
    await $.turn.start({ text: '再问一个', turnId: 't2' })
    await $.turn.complete({ turnId: 't2', reason: 'error', answer: '', durationMs: 5000, isAborted: false })
    expect(await ui.find({ type: 'Text', text: /闹脾气/ })).toBeDefined()
    await ui.unmount()
  })

  test('悄悄话的回复和真实台词同一套清洗：取第一行、去引号和自称，按人设的 36 字截断', async ($, on) => {
    expect(cleanLine('长'.repeat(50), L.WHISPER_MAX_CHARS)).toBe(`${'长'.repeat(36)}…`)
    expect(L.whisperSystem()).toContain(`不超过 ${L.WHISPER_MAX_CHARS} 个字`)
    calmWorld(on)
    const replies = ['「小黎：今天也辛苦啦，喝口水吧～」\n（这是第二行解释）', '长'.repeat(50)]
    on('model.complete', () => ({
      value: {
        isAnswered: true as const,
        text: replies.shift() ?? '',
        usage: { input_tokens: 150, output_tokens: 18, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }))
    const ui = await mountBand($)
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await ui.post({ type: 'control', key: 'whisper' }, { in: 'controls' })
    expect((await ui.find({ type: 'Text', text: /辛苦啦/ }))?.text).toBe('今天也辛苦啦，喝口水吧～')
    await ui.post({ type: 'control', key: 'whisper' }, { in: 'controls' })
    expect((await ui.find({ type: 'Text', text: /^长+…$/ }))?.text).toBe(`${'长'.repeat(36)}…`)
    await ui.unmount()
  })

  test('只有 /xiaoli show 让藏起来的小黎出来：keep、打错的参数、ai、quiet、切换模式都不会', async ($, on) => {
    calmWorld(on)
    const ui = await mountBand($)
    expect(await avatarOf(ui)).toBeDefined()
    await cmd($, 'hide')
    expect(await avatarOf(ui)).toBeUndefined()
    for (const args of ['keep', 'keep on', 'keep off', 'reset', 'ai on', 'quiet', 'quiet']) {
      await cmd($, args)
      expect(await avatarOf(ui), args).toBeUndefined()
    }
    expect((await cmd($, '')).text).toContain('/xiaoli show 叫我出来')
    expect(await avatarOf(ui)).toBeUndefined()
    expect((await cmd($, 'show')).text).toBe('小黎：我回来啦～')
    expect(await avatarOf(ui)).toBeDefined()
    await ui.unmount()
  })

  test('额度 ≥80% 的提醒：同一个窗口只弹一次（记在 $.store），换了新窗口再提醒', async ($, on) => {
    on('session.measure', () => ({ changed: [] }))
    const { seen } = await boot($, on, at(14))
    const measure = (percentUsed: number, resetsAt: string) =>
      $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed, resetsAt }], changed: [] })
    const first = new Date(at(16)).toISOString()
    await measure(85, first)
    expect(seen.toasts).toBe(1)
    await measure(92, first)
    expect(seen.toasts).toBe(1)
    await measure(81, new Date(at(21)).toISOString())
    expect(seen.toasts).toBe(2)
  })

  test('别的会话（或热重载前的本会话）已经提醒过这个窗口：这边不再弹；窗口已过的旧记录不挡新提醒', async ($, on) => {
    const resetsAt = new Date(at(16)).toISOString()
    const stale = new Date(at(11)).toISOString()
    const quotaAlerts = { [`five_hour:${resetsAt}`]: at(13), [`seven_day:${stale}`]: at(6) }
    on('session.measure', () => ({ changed: [] }))
    const { seen } = await boot($, on, at(14), { quotaAlerts })
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 88, resetsAt }], changed: [] })
    expect(seen.toasts).toBe(0)
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'seven_day', percentUsed: 88, resetsAt: stale }], changed: [] })
    expect(seen.toasts).toBe(1)
  })

  test('会话跨过 0 点：「认识第 N 天」加一；别的会话已经加过就不重复加', async ($, on) => {
    const today = dayKey(at(12))
    const tomorrow = dayKey(at(24, 0, 1))
    const base: Profile = { firstMet: '2026-10-10', lastDay: today, days: 3, pets: 0, snacks: 0, turns: 0, tokens: 0 }
    const mem: Record<string, unknown> = { profile: base }
    on('store.get', (_$, e) => ({ value: mem[e.key] }))
    on('store.set', (_$, e) => {
      mem[e.key] = e.value
      return { value: undefined }
    })
    const { clock } = await boot($, on, at(23, 59, 58), null)
    expect((mem.profile as Profile).days).toBe(3)
    await clock.advance(5000)
    expect(mem.profile).toMatchObject({ lastDay: tomorrow, days: 4 })
    const ui = await mountBand($)
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await ui.post({ type: 'control', key: 'chip-status' }, { in: 'controls' })
    expect(await ui.find({ type: 'Text', text: '认识第 4 天' })).toBeDefined()
    // 再过一阵也不会重复加
    await clock.advance(5000)
    expect((mem.profile as Profile).days).toBe(4)
    await ui.unmount()
  })

  test('同一天别的会话先过了 0 点、已经加过天数：这个会话过 0 点不再加，只跟上档案', async ($, on) => {
    const today = dayKey(at(12))
    const tomorrow = dayKey(at(24, 0, 1))
    const mem: Record<string, unknown> = {
      profile: { firstMet: '2026-10-10', lastDay: today, days: 3, pets: 0, snacks: 0, turns: 0, tokens: 0 } satisfies Profile,
    }
    on('store.get', (_$, e) => ({ value: mem[e.key] }))
    on('store.set', (_$, e) => {
      mem[e.key] = e.value
      return { value: undefined }
    })
    const { clock } = await boot($, on, at(23, 59, 58), null)
    // 另一个会话 0 点刚过就记了今天
    mem.profile = { ...(mem.profile as Profile), lastDay: tomorrow, days: 4 }
    await clock.advance(5000)
    expect((mem.profile as Profile).days).toBe(4)
    const ui = await mountBand($)
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await ui.post({ type: 'control', key: 'chip-status' }, { in: 'controls' })
    expect(await ui.find({ type: 'Text', text: '认识第 4 天' })).toBeDefined()
    await ui.unmount()
  })

  test('强提醒结束：台词不说缩回去，用户选的放松模式保持不变', async ($, on) => {
    expect(L.REST_DONE.some(s => /缩回去|收回/.test(s))).toBe(false)
    const { clock } = await boot($, on, at(14))
    const ui = await mountBand($)
    expect((await cmd($, '')).text).toBe('小黎：展开啦')
    await cmd($, 'rest')
    expect(await bubbleOf(ui)).toBeDefined()
    await clock.advance(2 * 60_000 + 1000)
    expect(await bubbleOf(ui)).toBeUndefined()
    expect((await avatarOf(ui))?.width).toBe(AVATAR_SIZE.full.columns)
    expect(await ui.find({ type: 'Text', text: new RegExp(L.REST_DONE.join('|')) })).toBeDefined()
    await ui.unmount()
  })

  test('文案：ai on 只说每轮结束时；命令说明、参数提示、用法列全 hide、show、quiet；提醒卡片写清只在这个小时内补；悄悄话人设不写颜色', async ($, on) => {
    const { seen } = await boot($, on, at(9))
    for (const d of seen.descriptions) {
      expect(d).toContain('hide 隐藏')
      expect(d).toContain('show 显示')
      expect(d).toContain('quiet 切换安静')
    }
    for (const h of seen.hints) expect(h).toContain('[rest|quiet|quiet on|')
    const aiOn = await cmd($, 'ai on')
    expect(aiOn.text).toContain('每轮结束时')
    expect(aiOn.text).not.toContain('开始')
    expect((await cmd($, 'reset')).text).toContain('/xiaoli quiet 切换安静模式')
    expect(L.whisperSystem()).not.toContain('橙')
    const ui = await mountBand($)
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await ui.post({ type: 'control', key: 'chip-rest' }, { in: 'controls' })
    expect(await ui.find({ type: 'Text', text: /人不在先不弹，只在这个小时内回来才补/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('0.4.3：保活默认不设上限、安静模式不打扰、ai off 说法', () => {
  const cmd = ($: Engine, args: string) => $.command.run({ command: 'xiaoli', args, ...COMMAND_ENV })
  const usage = (read: number, input = 200, output = 3) => ({
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: read,
    cache_creation_input_tokens: 0,
  })
  const answered = (read: number, input = 200) => ({ isAnswered: true as const, text: '在', usage: usage(read, input) })
  const overloaded = {
    isAnswered: false as const,
    reason: 'api-error' as const,
    status: 529,
    error: 'overloaded' as const,
    usage: usage(0, 0, 0),
  }
  const step = async ($: Engine) => {
    for await (const chunk of $.turn.step({ turnId: 't1', index: 0, messageCount: 1, model: 'claude-opus-5-5' })) void chunk
  }
  const answerSteps = (on: On) =>
    on('turn.step', async function* (_$, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
  /** 自己接 $.store，测试里能直接看存进去的偏好 */
  const memStore = (on: On, mem: Record<string, unknown>) => {
    on('store.get', (_$, e) => ({ value: mem[e.key] }))
    on('store.set', (_$, e) => {
      mem[e.key] = e.value
      return { value: undefined }
    })
  }
  const reply = (text: string) => ({
    value: {
      isAnswered: true as const,
      text,
      usage: { input_tokens: 150, output_tokens: 18, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  })

  test('默认不设上限：连续 30 小时没真实对话也一直每 50 分钟保活一次，不停下', () => {
    let k = noteRequest(NEW_KEEP, at(9))
    expect(k.maxHours).toBe(0)
    const end = at(9) + 30 * 3_600_000
    let sent = 0
    let stops = 0
    for (let t = at(9); t <= end; t += 60_000) {
      const s = keepStep(k, t)
      if (s.kind === 'stop') stops += 1
      if (s.kind === 'send') {
        sent += 1
        k = settleKeep({ ...k, isSending: true }, judgeFork(answered(100_000)), t, t).next
      }
    }
    expect(stops).toBe(0)
    expect(sent).toBe(36)
    expect(k.stopped).toBe('')
    expect(nextKeepAt(k)).toBe(end + KEEP_IDLE_MS)
    // 从老版本热重载过来、状态里没有 maxHours 字段的：同样按不限
    const legacy = { ...noteRequest(NEW_KEEP, at(9)), lastAt: at(20, 30), maxHours: undefined as unknown as number }
    expect(keepStep(legacy, at(21, 20)).kind).toBe('send')
    expect(nextKeepAt(legacy)).toBe(at(21, 20))
  })

  test('上限参数：只认 1–72 的整数小时，off 取消；存储里没有或坏掉的一律按不限', () => {
    expect(parseMaxHours('1')).toBe(1)
    expect(parseMaxHours('12')).toBe(12)
    expect(parseMaxHours(' 72 ')).toBe(72)
    expect(parseMaxHours('off')).toBe(0)
    for (const bad of ['', '0', '73', '1.5', '-3', 'abc', '12h']) expect(parseMaxHours(bad), bad).toBeNull()
    expect(validMaxHours(undefined)).toBe(0)
    expect(validMaxHours(12)).toBe(12)
    for (const bad of [0, 73, 1.5, '12', null]) expect(validMaxHours(bad)).toBe(0)
  })

  test('卡片如实反映设置：不限写「一直保活到会话关闭」，设了上限写小时数，到上限停下的原因也写对', () => {
    const k = noteRequest(NEW_KEEP, at(9))
    const free = keepStatusLine(k, at(9, 10))
    expect(free).toBe('下次保活 09:50（还剩 40min）· 本会话今天 0 次 · 距上次对话 10min · 一直保活到会话关闭')
    expect(free).not.toContain('8h')
    expect(keepLimitText(k)).toBe('一直保活到会话关闭')
    expect(keepLimitNote(k)).toBe('保活不设上限：一直保活到会话关闭（/xiaoli keep max 小时数 可设上限）')
    const capped = { ...k, maxHours: 12 }
    expect(keepStatusLine(capped, at(9, 10))).toContain('距上次对话 10min / 上限 12h')
    expect(keepLimitText(capped)).toBe('连续 12 小时没对话就停')
    expect(keepLimitNote(capped)).toBe('保活上限 12 小时：连续 12 小时没对话就停（/xiaoli keep max off 取消上限）')
    const late = { ...capped, lastAt: at(20, 30) }
    expect(keepStatusLine(late, at(20, 31))).toContain('到 12h 上限不再保活，缓存约 21:30 过期')
    const s = keepStep(late, at(21, 20))
    expect(s.kind === 'stop' ? s.reason : '').toBe('连续 12 小时没对话，停止保活')
  })

  test('/xiaoli keep max 12 设上限、跨会话记住；keep max off 取消；不认识的参数只给用法、不改设置', async ($, on) => {
    const mem: Record<string, unknown> = {}
    memStore(on, mem)
    await boot($, on, at(13), null)
    const set = await cmd($, 'keep max 12')
    expect(set.text).toContain('小黎：好，保活上限设为 12 小时：连续 12 小时没对话就停（跨会话记住，/xiaoli keep max off 取消）。')
    expect(mem.prefs).toMatchObject({ isKeepAlive: true, keepMaxHours: 12 })
    expect((await cmd($, 'keep')).text).toContain('保活上限 12 小时：连续 12 小时没对话就停')
    const turnedOn = await cmd($, 'keep on')
    expect(turnedOn.text).toContain('主对话 50 分钟没请求我就续一下缓存，连续 12 小时没对话就停。')
    for (const bad of ['keep max', 'keep max 0', 'keep max 73', 'keep max 1.5', 'keep max abc']) {
      expect((await cmd($, bad)).text, bad).toContain('小黎：上限要填 1–72 的整数小时，比如 /xiaoli keep max 12；/xiaoli keep max off 取消上限')
    }
    expect(mem.prefs).toMatchObject({ keepMaxHours: 12 })
    const off = await cmd($, 'keep max off')
    expect(off.text).toContain('小黎：好，保活不设上限了：只要会话开着、保活开着，就一直保活到会话关闭（跨会话记住）。')
    expect(mem.prefs).toMatchObject({ keepMaxHours: 0 })
    expect((await cmd($, 'keep')).text).toContain('保活不设上限：一直保活到会话关闭')
    const again = await cmd($, 'keep on')
    expect(again.text).toContain('主对话 50 分钟没请求我就续一下缓存，一直保活到会话关闭。')
    expect(again.text).not.toContain('8 小时')
    // 旧命令同样可用
    expect((await $.command.run({ command: 'xiaoke', args: 'keep max 6', ...COMMAND_ENV })).text).toContain('保活上限设为 6 小时')
  })

  test('新会话从存储恢复上限：存着 keepMaxHours 的照用', async ($, on) => {
    await boot($, on, at(13), { prefs: { isExpanded: false, isQuiet: false, isAiLines: true, isKeepAlive: true, keepMaxHours: 6 } })
    expect((await cmd($, 'keep')).text).toContain('保活上限 6 小时')
  })

  test('老用户存储里没有 keepMaxHours（或是坏数据）：按不限处理', async ($, on) => {
    await boot($, on, at(13), { prefs: { isExpanded: false, isQuiet: false, isAiLines: true, isKeepAlive: true } })
    expect((await cmd($, 'keep')).text).toContain('保活不设上限：一直保活到会话关闭')
    await cmd($, 'keep max 999')
    expect((await cmd($, 'keep')).text).toContain('保活不设上限')
  })

  test('安静模式 + 设了 1 小时上限：保活成功不弹 toast，到上限停下照常弹', { timeoutMs: 120_000 }, async ($, on) => {
    let forks = 0
    on('model.fork', () => {
      forks += 1
      return { value: answered(120_000, 300) }
    })
    answerSteps(on)
    const { clock, seen } = await boot($, on, at(13))
    await cmd($, 'quiet on')
    await cmd($, 'keep max 1')
    await step($)
    await clock.set(at(13, 50, 1))
    expect(forks).toBe(1)
    expect(seen.toasts).toBe(0)
    expect((await cmd($, 'keep')).text).toContain('本会话今天 1 次')
    // 14:40 又到点，但离最后一次真实对话已经 1 小时 40 分：停下，这个要让用户知道
    await clock.set(at(14, 40, 1))
    expect(forks).toBe(1)
    expect(seen.toasts).toBe(1)
    expect((await cmd($, 'keep')).text).toContain('已停下：连续 1 小时没对话，停止保活')
  })

  test('安静模式：保活失败的 toast 照常弹（重试一次、再失败停下各一条）', { timeoutMs: 120_000 }, async ($, on) => {
    let forks = 0
    on('model.fork', () => {
      forks += 1
      return { value: overloaded }
    })
    answerSteps(on)
    const { clock, seen } = await boot($, on, at(13))
    await cmd($, 'quiet on')
    await step($)
    await clock.set(at(13, 50, 1))
    expect(forks).toBe(1)
    expect(seen.toasts).toBe(1)
    await clock.set(at(13, 53, 10))
    expect(forks).toBe(2)
    expect(seen.toasts).toBe(2)
  })

  test('安静模式：额度到 80% 的提醒照常弹 toast', async ($, on) => {
    on('session.measure', () => ({ changed: [] }))
    const { seen } = await boot($, on, at(14))
    await cmd($, 'quiet on')
    const resetsAt = new Date(at(16)).toISOString()
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 85, resetsAt }], changed: [] })
    expect(seen.toasts).toBe(1)
  })

  test('安静模式点「悄悄话」：不调模型（零 token），直接回固定一句，看得到、不被安静提示盖住；关掉安静后照常调用', async ($, on) => {
    calmWorld(on)
    let calls = 0
    on('model.complete', () => {
      calls += 1
      return reply('陪你写到现在啦')
    })
    await cmd($, 'quiet on')
    const ui = await mountBand($)
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await ui.post({ type: 'control', key: 'whisper' }, { in: 'controls' })
    expect(calls).toBe(0)
    expect(await ui.find({ type: 'Text', text: L.WHISPER_QUIET })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /安静模式中，\/xiaoli quiet off 恢复说话/ })).toBeUndefined()
    // 收起成工作模式也看得到这一句
    await ui.post({ type: 'control', key: 'expand' }, { in: 'controls' })
    expect(await ui.find({ type: 'Text', text: L.WHISPER_QUIET })).toBeDefined()
    // 关掉安静：悄悄话照常调用模型
    await cmd($, 'quiet off')
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await ui.post({ type: 'control', key: 'whisper' }, { in: 'controls' })
    expect(calls).toBe(1)
    expect(await ui.find({ type: 'Text', text: '陪你写到现在啦' })).toBeDefined()
    await ui.unmount()
  })

  test('ai off 只关每轮结束的自动台词：一轮结束不调模型，点「悄悄话」仍调用一次；命令说明、参数提示、用法写清楚', async ($, on) => {
    let calls = 0
    on('model.complete', () => {
      calls += 1
      return reply('歇口气再继续吧')
    })
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    const { clock, seen } = await boot($, on, at(14))
    for (const d of seen.descriptions) {
      expect(d).toContain('ai on/off 每轮结束自动说话（不影响悄悄话）')
      expect(d).toContain('keep on/off 缓存保活（默认一直保活到会话关闭，keep max 小时数|off 设或取消上限）')
      expect(d).not.toContain('8 小时')
    }
    for (const h of seen.hints) expect(h).toContain('|keep off|keep max <小时>|keep max off|')
    const usageText = (await cmd($, 'reset')).text ?? ''
    expect(usageText).toContain('/xiaoli ai on|off 每轮结束自动说话开关（悄悄话不受影响）')
    expect(usageText).toContain('默认一直保活到会话关闭，/xiaoli keep max 小时数|off 设或取消上限） · /xiaoli calibrate 点击校准')
    const off = await cmd($, 'ai off')
    expect(off.text).toBe('小黎：好，每轮结束不再自动说话了（不花 token）；点「悄悄话」仍会调用一次')
    expect(off.text).not.toContain('不再调用')
    await $.turn.start({ text: '帮我看看为什么构建失败', turnId: 't1' })
    await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '构建失败是因为依赖版本冲突，锁文件里同一个包出现了两个大版本，已经帮你统一好了。', durationMs: 30_000, isAborted: false })
    await clock.advance(1000)
    expect(calls).toBe(0)
    const ui = await mountBand($)
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'avatar' })
    await ui.post({ type: 'control', key: 'whisper' }, { in: 'controls' })
    expect(calls).toBe(1)
    expect(await ui.find({ type: 'Text', text: '歇口气再继续吧' })).toBeDefined()
    await ui.post({ type: 'control', key: 'chip-status' }, { in: 'controls' })
    expect(await ui.find({ type: 'Text', text: /真实台词已关：每轮结束不自动说话，点悄悄话仍会调用一次/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('0.5.0：自动更新', () => {
  const MOD = 'xiaoke'
  const TODAY = '2026-11-13'
  const [RAW_MANIFEST, MIRROR_MANIFEST] = sourceUrls(MOD, MANIFEST_FILE) as [string, string]
  const [RAW_CHANGELOG, MIRROR_CHANGELOG] = sourceUrls(MOD, CHANGELOG_FILE) as [string, string]
  const manifestOf = (version: string) => JSON.stringify({ name: MOD, version })
  const CHANGELOG = ['# 更新记录', '', '## 0.5.0', '', '- 插件市场安装', '- 每天自动更新', '', '## 0.4.3', '', '- 保活默认不设上限'].join('\n')
  const NOTES = ['插件市场安装', '每天自动更新']
  const MARKET_ROOT = 'C:\\Users\\a\\.claude\\plugins\\cache\\xiaoli-mods\\xiaoke\\0.4.3'
  const LOCAL_ROOT = 'D:\\Demo\\xiaoli-mods\\mods\\xiaoke'
  const OPTIONS = { subject: '陪伴猫', from: '0.4.3', to: '0.5.0', noteList: NOTES }
  const MANUAL = 'claude plugin marketplace update xiaoli-mods，再运行 claude plugin update xiaoke@xiaoli-mods'
  const STEPS = [
    ['claude', 'plugin', 'marketplace', 'update', 'xiaoli-mods'],
    ['claude', 'plugin', 'update', 'xiaoke@xiaoli-mods'],
  ]
  const ran = (stdout: string, exitCode = 0, stderr = ''): RunResultType => ({ exitCode, stdout, stderr })
  const NEWER = { [RAW_MANIFEST]: manifestOf('0.5.0'), [RAW_CHANGELOG]: CHANGELOG }

  type FakeWorld = {
    root?: string
    stored?: unknown
    remote?: Record<string, string>
    busyList?: boolean[]
    lock?: string
    reloadAt?: string
    run?: (argv: readonly string[]) => RunResultType | Error
    canReload?: boolean
  }
  /** 造的外部世界，记下流程做了什么 */
  function fake(world: FakeWorld = {}) {
    const seen = { fetched: [] as string[], ran: [] as string[][], notices: [] as UpdateNoticeType[], written: [] as string[], locks: [] as (string | undefined)[], slept: 0, reloads: 0 }
    let now = 1000
    const ports: UpdatePortsType = {
      mod: MOD,
      subject: '陪伴猫',
      root: world.root ?? MARKET_ROOT,
      today: TODAY,
      readCheckedDay: async () => world.stored,
      writeCheckedDay: async day => {
        seen.written.push(day)
      },
      readManifest: async () => manifestOf('0.4.3'),
      fetchText: async url => {
        seen.fetched.push(url)
        return world.remote?.[url] ?? null
      },
      isBusy: async () => {
        const list = world.busyList ?? [false]
        return (list.length > 1 ? list.shift() : list[0]) ?? false
      },
      readLock: async () => world.lock,
      writeLock: async value => {
        seen.locks.push(value)
        world.lock = value
      },
      readReloadAt: async () => world.reloadAt,
      writeReloadAt: async value => {
        world.reloadAt = value
      },
      now: async () => now,
      sleep: async ms => {
        seen.slept += 1
        now += ms
      },
      run: async argv => {
        seen.ran.push([...argv])
        const result = world.run?.(argv) ?? ran('ok')
        if (result instanceof Error) throw result
        return result
      },
      canReload: async () => world.canReload ?? true,
      reload: async () => {
        seen.reloads += 1
      },
      notify: async notice => {
        seen.notices.push(notice)
      },
      log: () => undefined,
    }
    return { ports, seen }
  }

  test('版本比较只认正式版本：0.10.0 比 0.9.0 大，可带 v 前缀，格式不对、预发布不认', () => {
    expect(compareVersion('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersion('v0.5.0', '0.5.0')).toBe(0)
    expect(parseVersion(' v1.2.3 ')).toEqual([1, 2, 3])
    expect(['0.5', '0.5.0-beta', '01.0.0', 'abc', ''].map(parseVersion)).toEqual([null, null, null, null, null])
    expect([isNewer('0.5.0', '0.4.3'), isNewer('0.4.3', '0.4.3'), isNewer('0.4.2', '0.4.3'), isNewer('0.5.0-rc.1', '0.4.3')]).toEqual([true, false, false, false])
    expect(manifestVersion(manifestOf('0.5.0'))).toBe('0.5.0')
    expect(manifestVersion('坏的')).toBeNull()
  })

  test('CHANGELOG 截要点：有这一节取前几条，没有这一节、文字为空都是空的', () => {
    expect(changelogNotes(CHANGELOG, '0.5.0')).toEqual(NOTES)
    expect(changelogNotes(CHANGELOG, '0.4.0')).toEqual([])
    expect(changelogNotes('', '0.5.0')).toEqual([])
  })

  test('安装方式与一天一查：插件缓存 cache/<市场名>/xiaoke/<版本> 下为插件市场安装，仓库目录为本地目录加载；$.store 记着今天为查过', () => {
    expect(installOf(MARKET_ROOT, MOD)).toEqual({ kind: 'market', marketplace: 'xiaoli-mods' })
    expect(installOf(LOCAL_ROOT, MOD)).toEqual({ kind: 'local' })
    expect(installOf('C:\\Users\\a\\.claude\\plugins\\cache\\xiaoli-mods\\xiaoxiaoli\\0.9.0', MOD)).toEqual({ kind: 'local' })
    expect([isCheckedToday(TODAY, TODAY), isCheckedToday('2026-11-12', TODAY)]).toEqual([true, false])
    expect(updateSteps(MOD, 'xiaoli-mods')).toEqual(STEPS)
    expect(sourceUrls(MOD, MANIFEST_FILE)).toEqual([
      'https://raw.githubusercontent.com/xiaoli1999/xiaoli-mods/master/mods/xiaoke/.claude-plugin/plugin.json',
      'https://cdn.jsdelivr.net/gh/xiaoli1999/xiaoli-mods@master/mods/xiaoke/.claude-plugin/plugin.json',
    ])
  })

  test('流程：今天查过不取；不比自己新记今天；两个地址都取不到不记；原始地址取不到走镜像', async () => {
    const checked = fake({ stored: TODAY, remote: NEWER })
    expect(await runUpdateCheck(checked.ports)).toBe('checked-today')
    expect(checked.seen.fetched).toEqual([])
    const same = fake({ remote: { [RAW_MANIFEST]: manifestOf('0.4.3') } })
    expect(await runUpdateCheck(same.ports)).toBe('up-to-date')
    expect(same.seen.written).toEqual([TODAY])
    const offline = fake({ remote: {} })
    expect(await runUpdateCheck(offline.ports)).toBe('fetch-failed')
    expect(offline.seen.fetched).toEqual([RAW_MANIFEST, MIRROR_MANIFEST])
    expect(offline.seen.written).toEqual([])
    const mirror = fake({ root: LOCAL_ROOT, remote: { [MIRROR_MANIFEST]: manifestOf('0.5.0'), [MIRROR_CHANGELOG]: CHANGELOG } })
    expect(await runUpdateCheck(mirror.ports)).toBe('local-notified')
    expect(mirror.seen.fetched).toEqual([RAW_MANIFEST, MIRROR_MANIFEST, RAW_CHANGELOG, MIRROR_CHANGELOG])
    expect(mirror.seen.notices).toEqual([localNotice(OPTIONS)])
    expect(mirror.seen.ran).toEqual([])
  })

  test('插件市场安装：成功时先刷新市场再更新插件、记今天、提示要点并发起一次重载；失败提示原因与手动命令、不记今天', async () => {
    const ok = fake({ remote: NEWER })
    expect(await runUpdateCheck(ok.ports)).toBe('updated')
    expect(ok.seen.ran).toEqual(STEPS)
    expect(ok.seen.locks).toEqual([MOD, undefined])
    expect(ok.seen.written).toEqual([TODAY])
    expect(ok.seen.notices).toEqual([updatedNotice(OPTIONS, true)])
    expect(ok.seen.reloads).toBe(1)
    const failed = fake({ remote: NEWER, run: argv => (argv[2] === 'update' ? ran('', 1, 'offline') : ran('ok')) })
    expect(await runUpdateCheck(failed.ports)).toBe('update-failed')
    expect(failed.seen.notices).toEqual([failedNotice(OPTIONS, 'offline', MANUAL)])
    expect(failed.seen.written).toEqual([])
    expect(failed.seen.reloads).toBe(0)
    const busy = fake({ remote: NEWER, busyList: [true, false] })
    expect(await runUpdateCheck(busy.ports)).toBe('updated')
    expect(busy.seen.slept).toBe(1)
    // 说已是最新：版本就是远端的（别的会话刚更新过）算装上了，比远端旧算没更新上
    expect(await runUpdateCheck(fake({ remote: NEWER, run: () => ran('xiaoke is already at the latest version (0.5.0).') }).ports)).toBe('updated')
    expect(await runUpdateCheck(fake({ remote: NEWER, run: () => ran('xiaoke is already at the latest version (0.4.3).') }).ports)).toBe('update-failed')
  })

  /** 开一个会话：记下自动更新的请求、命令、提示与日志；$.store 用手边的 mem，看得到写进去的日期 */
  async function bootUpdate($: Engine, on: On, options: { remote: Record<string, string>; mem?: Record<string, unknown>; isInteractive?: boolean }) {
    const nowMs = at(9, 0)
    const mem = options.mem ?? {}
    const seen = { fetched: [] as { url: string; init: unknown }[], ran: [] as unknown[], toasts: [] as string[], logs: [] as string[] }
    on('store.get', (_$, e) => ({ value: mem[e.key] }))
    on('store.set', (_$, e) => {
      mem[e.key] = e.value
      return { value: undefined }
    })
    const clock = mock.clock(on, { now: nowMs })
    on('ui.toast', (_$, e) => {
      seen.toasts.push(e.text)
      return { value: undefined }
    })
    on('ui.log', (_$, e) => {
      seen.logs.push(e.text)
      return { value: undefined }
    })
    on('ui.notify', () => ({ value: { isSent: false as const, reason: 'no-surface' as const } }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('session.usage', () => ({ value: { startedAt: nowMs, context: { window: 200_000 }, rateLimits: [] } }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('settings.read', () => ({ value: { effortLevel: 'xhigh' } }))
    on('fs.read', (_$, e) => (e.path.replace(/\\/g, '/').endsWith('/xiaoke/.claude-plugin/plugin.json') ? { value: manifestOf('0.4.3') } : { deny: 'ENOENT' }))
    on('http.fetch', (_$, e) => {
      seen.fetched.push({ url: e.url, init: e.init })
      const text = options.remote[e.url]
      return text === undefined ? { deny: 'offline' } : { value: { status: 200, ok: true, headers: {}, text } }
    })
    on('process.run', (_$, e) => {
      seen.ran.push(e.argv)
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    const isInteractive = options.isInteractive ?? true
    await $.session.start({ cwd: '.', surface: isInteractive ? 'terminal' : null, isInteractive })
    return { clock, seen, mem, nowMs }
  }

  test('经会话启动：延后才查，请求只是公开地址的 GET、不带任何选项；本机从本地目录加载，有新版只提示 git pull、不运行命令，记今天', async ($, on) => {
    const { clock, seen, mem, nowMs } = await bootUpdate($, on, { remote: NEWER })
    await clock.advance(CHECK_DELAY_MS - 10)
    expect(seen.fetched).toEqual([])
    await clock.advance(10)
    expect(seen.fetched).toEqual([
      { url: RAW_MANIFEST, init: undefined },
      { url: RAW_CHANGELOG, init: undefined },
    ])
    expect(seen.toasts).toContain(`小黎：${localNotice(OPTIONS).toast}`)
    expect(seen.logs).toContain(`小黎：${localNotice(OPTIONS).log}`)
    expect(seen.ran).toEqual([])
    expect(mem.updateCheckedDay).toBe(dayKey(nowMs))
  })

  test('经会话启动：今天查过不再请求；取不到时不提示、不记今天', async ($, on) => {
    const { clock, seen, mem } = await bootUpdate($, on, { remote: {}, mem: { updateCheckedDay: '2026-01-01' } })
    await clock.advance(CHECK_DELAY_MS)
    expect(seen.fetched.map(i => i.url)).toEqual([RAW_MANIFEST, MIRROR_MANIFEST])
    expect(seen.toasts.filter(i => i.includes('新版'))).toEqual([])
    expect(mem.updateCheckedDay).toBe('2026-01-01')
  })

  test('经会话启动：$.store 里记着今天时不发请求', async ($, on) => {
    const { clock, seen } = await bootUpdate($, on, { remote: NEWER, mem: { updateCheckedDay: dayKey(at(9, 0)) } })
    await clock.advance(CHECK_DELAY_MS)
    expect(seen.fetched).toEqual([])
  })

  test('非交互式会话不查；热重载重跑 session.start 不再查', async ($, on) => {
    const quiet = await bootUpdate($, on, { remote: NEWER, isInteractive: false })
    await quiet.clock.advance(CHECK_DELAY_MS * 2)
    expect(quiet.seen.fetched).toEqual([])
    // 同一个会话里再跑一次 session.start（热重载）：交互式也不查，isStarted 已记在 $.state
    await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
    await quiet.clock.advance(CHECK_DELAY_MS * 2)
    expect(quiet.seen.fetched).toEqual([])
  })
})
