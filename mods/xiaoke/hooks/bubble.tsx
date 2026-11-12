// 小黎的提醒气泡：小黎旁边一个圆角对话框，尾巴 ◀ 指向小黎。Client 表面模块，自己画边框、自己判定按钮点击
// （用户终端点中文后面会偏，按 /xiaoli calibrate 量出的口径换算，同 controls.tsx）。
// 弹出时边框闪 3 下然后常亮；按钮前 1 分钟锁着（灰），之后亮起可点——锁不锁由 hooks 模块决定。
//   full（4 行，和放松模式的小黎一样高）：
//      ╭─ 久坐提醒 · 起来走走 ─────── 还剩 2:55 ─╮
//      │ 12 点啦，站起来走两步、伸个懒腰吧        │
//     ◀┤ ━━━━━━━━━━━━━━━━━━━━━━━──────────────── │
//      ╰─────────────────────────── 我起来啦 ─╯
//   compact（2 行，带子放不下 4 行时）：标题 + 倒计时 + 按钮一行，台词一行
import type { ClientModule } from 'claude-code'

export type BubbleButton = { label: string; isReady: boolean }
export type BubbleProps = {
  /** 每次新提醒换一个值（用结束时间），换了就重新闪 3 下 */
  id: number
  layout: 'full' | 'compact'
  width: number
  title: string
  text: string
  color: string
  /** 倒计时文字，如「还剩 2:55」 */
  countdown: string
  /** 剩余时间占比 0~1，画进度线 */
  left: number
  button: BubbleButton
  /** 点击口径：终端上报列 = off + Σ(英文 1 列，中文 cjk 列) */
  map: { off: number; cjk: number }
}

/** 气泡里的一段文字和它的样式 */
export type Seg = { text: string; color?: string; bg?: string; bold?: boolean; dim?: boolean; isButton?: boolean }

const INK = '#1b1b1b'
const MIN_WIDTH = 40
const MAX_WIDTH = 64
/** 闪 3 下：亮暗交替 6 帧，每帧 250ms */
const FLASH_FRAMES = 6
const FRAME_MS = 250
const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/

/** 终端显示宽度：中日韩字符算 2 格 */
export function displayWidth(text: string): number {
  let width = 0
  for (const ch of text) width += CJK.test(ch) ? 2 : 1
  return width
}

function reportedWidth(text: string, map: { cjk: number }): number {
  let width = 0
  for (const ch of text) width += CJK.test(ch) ? map.cjk : 1
  return width
}

/** 截到 width 列以内，截了就以「…」结尾 */
export function fit(text: string, width: number): string {
  if (displayWidth(text) <= width) return text
  if (width <= 0) return ''
  let out = ''
  let used = 0
  for (const ch of text) {
    const w = CJK.test(ch) ? 2 : 1
    if (used + w > width - 1) break
    out += ch
    used += w
  }
  return `${out}…`
}

/** 气泡多宽：放得下标题行、台词和按钮（两种按钮文字取宽的那个，免得解锁时宽度跳），最多 64 列 */
export function bubbleWidth(content: { title: string; text: string; labels: readonly string[] }, maxWidth: number): number {
  const button = Math.max(0, ...content.labels.map(displayWidth)) + 2
  const need = Math.max(
    displayWidth(content.title) + displayWidth('还剩 0:00') + 10,
    displayWidth(content.text) + 6,
    button + 8,
    MIN_WIDTH,
  )
  return Math.max(0, Math.min(need, MAX_WIDTH, maxWidth))
}

/** 按行拆成带样式的片段；full 布局每行正好 width 列，右边框才对得齐 */
export function bubbleRows(p: BubbleProps, isDim: boolean): Seg[][] {
  const edge = (text: string): Seg => ({ text, color: p.color, ...(isDim ? { dim: true } : {}) })
  const button: Seg = p.button.isReady
    ? { text: ` ${p.button.label} `, bg: p.color, color: INK, bold: true, isButton: true }
    : { text: ` ${p.button.label} `, dim: true, isButton: true }
  const countdown: Seg = { text: p.countdown, color: p.color }
  const countdownWidth = displayWidth(p.countdown)

  if (p.layout === 'compact') {
    const room = p.width - 2 - countdownWidth - displayWidth(button.text) - 4
    return [
      [edge('◀ '), { text: fit(p.title, room), color: p.color, bold: true }, { text: '  ' }, countdown, { text: '  ' }, button],
      [{ text: '  ' }, { text: fit(p.text, p.width - 2) }],
    ]
  }

  const title = fit(p.title, p.width - 10 - countdownWidth)
  const topFill = p.width - 9 - displayWidth(title) - countdownWidth
  const inner = p.width - 5
  const said = fit(p.text, inner)
  const filled = Math.round(Math.min(1, Math.max(0, p.left)) * inner)
  const bottomFill = p.width - 6 - displayWidth(button.text)
  return [
    [
      { text: ' ' },
      edge('╭─ '),
      { text: title, color: p.color, bold: true },
      { text: ' ' },
      edge('─'.repeat(Math.max(1, topFill))),
      { text: ' ' },
      countdown,
      edge(' ─╮'),
    ],
    [{ text: ' ' }, edge('│ '), { text: said }, { text: ' '.repeat(Math.max(0, inner - displayWidth(said))) }, edge(' │')],
    [edge('◀┤ '), { text: '━'.repeat(filled), color: p.color }, { text: '─'.repeat(inner - filled), dim: true }, edge(' │')],
    [{ text: ' ' }, edge(`╰${'─'.repeat(Math.max(1, bottomFill))}`), { text: ' ' }, button, edge(' ─╯')],
  ]
}

/** 上报的点击落没落在按钮上（锁着也算点中，由 hooks 模块回一句「再坚持」）；左右各宽容 1 列 */
export function hitButton(p: BubbleProps, x: number, y: number): boolean {
  const row = bubbleRows(p, false)[y]
  if (row === undefined) return false
  let at = p.map.off
  for (const seg of row) {
    const w = reportedWidth(seg.text, p.map)
    if (seg.isButton === true) return x >= at - 1 && x < at + w + 1
    at += w
  }
  return false
}

type BubbleState = { frame: number; flashFrom: number; seenId: number }

/** 计时器和点击回调只在第一次渲染时注册，拿不到后续的 props，所以最新 props 放在模块级（这个模块只有一个实例） */
let latestProps: BubbleProps | undefined

const Bubble: ClientModule<BubbleProps, BubbleState> = (props, surface) => {
  const { Box, Text } = surface.elements
  latestProps = props
  let s = surface.state
  if (s === undefined) {
    s = { frame: 0, flashFrom: 0, seenId: props.id }
    surface.setState(s)
    surface.every(FRAME_MS, () => {
      const cur = surface.state
      if (cur === undefined) return
      const next = { ...cur, frame: cur.frame + 1 }
      // 闪完了就只推进帧号，不触发重绘
      if (next.frame - next.flashFrom > FLASH_FRAMES) {
        cur.frame = next.frame
        return
      }
      surface.setState(next)
    })
    surface.onPointer(e => {
      const p = latestProps
      if (p === undefined || e.type !== 'down' || e.button !== 'left') return
      if (hitButton(p, e.x, e.y)) surface.post({ type: 'done' })
    })
  }
  // 换了一次新提醒：重新闪 3 下
  if (props.id !== s.seenId) {
    s = { ...s, seenId: props.id, flashFrom: s.frame }
    surface.setState(s)
  }
  const age = s.frame - s.flashFrom
  const isDim = age < FLASH_FRAMES && age % 2 === 1
  return (
    <Box flexDirection="column">
      {bubbleRows(props, isDim).map(row => (
        <Box flexDirection="row">
          {row
            .filter(seg => seg.text !== '')
            .map(seg => (
              <Text
                {...(seg.color ? { color: seg.color } : {})}
                {...(seg.bg ? { backgroundColor: seg.bg } : {})}
                {...(seg.bold ? { bold: true } : {})}
                {...(seg.dim ? { dimColor: true } : {})}
              >
                {seg.text}
              </Text>
            ))}
        </Box>
      ))}
    </Box>
  )
}

export default Bubble
