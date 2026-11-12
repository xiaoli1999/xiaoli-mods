// 小黎的可点控件：状态胶囊 + 按钮都画在这个 Client 里，自己做点击判定。
// 用户的 JetBrains 终端：英文点击准，中文后面的点击会往左偏，且每个中文偏同样的量——
// 即终端上报点击列号时，每个中文字算的列数不是 2。两点校准量出「每个中文上报几列」(cjk) 和整体偏移 (off)，
// 判定时按这个口径计算每个控件在「上报坐标」里的区间，点哪儿就是哪个。
import type { ClientModule } from 'claude-code'

export type ControlStyle = { color?: string; dim?: boolean; bold?: boolean }
export type ControlItem = { key: string; label: string; style: ControlStyle; dot?: ControlStyle }
/** 点击口径：上报列 = off + Σ(英文 1 列，中文 cjk 列)。正常终端 off=0、cjk=2 */
export type ClickMap = { off: number; cjk: number }
export type ControlsProps = {
  mode: 'controls' | 'calibrate'
  map: ClickMap
  /** 每行一组控件：第 0 行胶囊，第 1 行按钮 */
  rows: ControlItem[][]
}

export const DEFAULT_MAP: ClickMap = { off: 0, cjk: 2 }
const GAP = 2
/** 校准行：[A] + 20 个中文 + [B] */
export const CALIB_CJK = '小黎小黎小黎小黎小黎小黎小黎小黎小黎小黎'
const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/

/** 一段文字在「上报坐标」里占几列 */
export function reportedWidth(text: string, map: ClickMap): number {
  let w = 0
  for (const ch of text) w += CJK.test(ch) ? map.cjk : 1
  return w
}

/** 每个控件在本行「上报坐标」里的区间 [start, end)，圆点 ● 加空格算 2 列 */
export function spans(row: readonly ControlItem[], map: ClickMap): { key: string; start: number; end: number }[] {
  const out: { key: string; start: number; end: number }[] = []
  let at = map.off
  for (const item of row) {
    const w = (item.dot ? 2 : 0) + reportedWidth(item.label, map)
    out.push({ key: item.key, start: at, end: at + w })
    at += w + GAP
  }
  return out
}

/** 上报列落在哪个控件上；落在缝里就取 1 列内最近的 */
export function hitTest(row: readonly ControlItem[], reportedX: number, map: ClickMap): string | undefined {
  const all = spans(row, map)
  return (
    all.find(s => reportedX >= s.start && reportedX < s.end)?.key ??
    all.find(s => reportedX >= s.start - 1 && reportedX < s.end + 1)?.key
  )
}

/** 两点校准：点 [A] 的 A 上报 x1，点 [B] 的 B 上报 x2 */
export function solveMap(x1: number, x2: number): ClickMap | undefined {
  const n = [...CALIB_CJK].length
  const off = x1 - 1
  const cjk = (x2 - x1 - 3) / n
  if (!Number.isFinite(cjk) || cjk < 0 || cjk > 3) return undefined
  return { off, cjk }
}

type ControlsState = {
  flashKey: string
  flashUntil: number
  frame: number
  /** 校准：已点了 A 的上报列 */
  calibX1: number | null
  calibDone: ClickMap | null
  calibFailed: boolean
}

/** 点击回调只在第一次渲染时注册，拿不到后续的 props，所以最新 props 放在模块级（这个模块只有一个实例） */
let latestProps: ControlsProps | undefined

const Controls: ClientModule<ControlsProps, ControlsState> = (props, surface) => {
  const { Box, Text } = surface.elements
  latestProps = props
  if (surface.state === undefined) {
    surface.setState({ flashKey: '', flashUntil: 0, frame: 0, calibX1: null, calibDone: null, calibFailed: false })
    surface.every(150, () => {
      const cur = surface.state
      if (cur === undefined) return
      if (cur.flashKey !== '' && cur.frame + 1 >= cur.flashUntil) surface.setState({ ...cur, frame: cur.frame + 1, flashKey: '' })
      else cur.frame += 1
    })
    surface.onPointer(e => {
      const cur = surface.state
      const p = latestProps
      if (cur === undefined || p === undefined || e.type !== 'down' || e.button !== 'left') return
      if (p.mode === 'calibrate') {
        if (cur.calibX1 === null) {
          surface.setState({ ...cur, calibX1: e.x, calibDone: null, calibFailed: false })
          return
        }
        const map = solveMap(cur.calibX1, e.x)
        surface.setState({ ...cur, calibX1: null, calibDone: map ?? null, calibFailed: map === undefined })
        if (map) surface.post({ type: 'calib', off: map.off, cjk: map.cjk })
        return
      }
      const row = p.rows[e.y]
      if (row === undefined) return
      const key = hitTest(row, e.x, p.map)
      if (key === undefined) return
      // 先在本地亮一下，不等 hooks 模块回来
      surface.setState({ ...cur, flashKey: key, flashUntil: cur.frame + 5 })
      surface.post({ type: 'control', key })
    })
  }
  const s = surface.state

  if (props.mode === 'calibrate') {
    const done = s?.calibDone
    const tip = done
      ? `校准完成：每个中文上报 ${done.cjk.toFixed(2)} 列，整体偏移 ${done.off}。马上切回放松模式，点按钮试试`
      : s?.calibFailed
        ? '这次两下没对上，再来：先点 [A] 的 A，再点 [B] 的 B'
        : s?.calibX1 == null
          ? '第 1 步：点左边 [A] 中间的 A'
          : '第 2 步：点右边 [B] 中间的 B'
    return (
      <Box flexDirection="column">
        <Text color="claude">{`[A]${CALIB_CJK}[B]`}</Text>
        <Text {...(done ? { color: 'success' } : s?.calibFailed ? { color: 'warning' } : { dimColor: true })}>{tip}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {props.rows.map(row => (
        <Box flexDirection="row">
          {row.flatMap((item, i) => {
            const style = s?.flashKey === item.key ? { color: 'claude', bold: true } : item.style
            const label = (
              <Text
                {...(style.color ? { color: style.color } : {})}
                {...(style.dim ? { dimColor: true } : {})}
                {...(style.bold ? { bold: true } : {})}
              >
                {item.label}
              </Text>
            )
            const dot = item.dot ? (
              <Text {...(item.dot.color ? { color: item.dot.color } : {})} {...(item.dot.dim ? { dimColor: true } : {})}>
                {'● '}
              </Text>
            ) : null
            const node = dot ? [dot, label] : [label]
            return i === 0 ? node : [<Text>{' '.repeat(GAP)}</Text>, ...node]
          })}
        </Box>
      ))}
    </Box>
  )
}

export default Controls
