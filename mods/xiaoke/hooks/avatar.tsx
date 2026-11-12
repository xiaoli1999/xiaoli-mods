// 小黎的形象：Claude Code 吉祥物的变体。Client 表面模块，在绘制线程里自己跑动画、自己接鼠标
// 原版 logo 是 9 列 × 3 行的四分块字符（▐▛███▜▌ / ▝▜█████▛▘ / ▘▘ ▝▝），即 18×6 个小像素：
//   收起（工作模式）：正面的缩小版 9×4 半格像素（2 行），有眼睛，会眨眼、张望、动小手
//   展开（放松模式）：放大 2 倍（每个小像素占一整格），腿藏在输入框后面，4 行高，用半格 ▀▄ 加表情
// 身体颜色跟着心情变：空闲蓝、干活青、开心粉、骄傲金、担心紫、犯困灰蓝
import type { ClientModule } from 'claude-code'

export type AvatarMood = 'idle' | 'watching' | 'happy' | 'worried' | 'sleepy' | 'proud' | 'shy'
export type AvatarSize = 'full' | 'mini'
export type AvatarProps = { mood: AvatarMood; petSeq: number; saySeq: number; isBusy: boolean; size: AvatarSize }

/** 一帧画面需要的全部输入，纯数据，便于预览和测试 */
export type AvatarPose = {
  size: AvatarSize
  mood: AvatarMood
  /** -1 看左，0 看前，1 看右 */
  gaze: number
  isBlink: boolean
  isPressed: boolean
  isTalking: boolean
  /** 0 不挥手，1/2 举起左手/右手 */
  wavePhase: number
  /** 0 不动，1/2 左右手轮流按下（Claude 干活时像在打字） */
  typePhase: number
  heartPhase: number | null
  /** 角落的小火花一闪一闪（变体标记） */
  isSparkle: boolean
}

export const PALETTE: Record<string, string> = {
  O: '#4f8ff7', // 身体（默认蓝，实际按心情换色）
  D: '#141820', // 眼睛
  S: '#2a3552', // 闭着的眼睛（比眼睛浅一点，像一道眼缝）
  M: '#1c2233', // 嘴巴
  P: '#ff6b9a', // 腮红
  T: '#e8f4ff', // 眼泪
  R: '#ff5a7a', // 爱心
  Y: '#fff3c4', // 小火花
}

/** 不同心情不同身体颜色 */
export const BODY_COLOR: Record<AvatarMood, string> = {
  idle: '#4f8ff7', // 空闲：蓝
  watching: '#22c3d6', // Claude 干活：青
  happy: '#ff8fb6', // 开心：粉
  shy: '#ff8fb6', // 害羞：粉
  proud: '#f5b942', // 骄傲：金
  worried: '#a78bfa', // 担心：紫
  sleepy: '#8a94b8', // 犯困：灰蓝
}

export function paletteFor(mood: AvatarMood): Record<string, string> {
  return { ...PALETTE, O: BODY_COLOR[mood] }
}

// 原版吉祥物 18×6 小像素：头身 3~14 列，眼睛在第 1 行 5、12 列，第 2 行伸出两只手，第 4 行四条腿
export const LOGO = [
  '...OOOOOOOOOOOO...',
  '...OO.OOOOOO.OO...',
  '.OOOOOOOOOOOOOOOO.',
  '...OOOOOOOOOOOO...',
  '....O.O....O.O....',
  '..................',
]

export const AVATAR_SIZE: Record<AvatarSize, { columns: number; rows: number }> = {
  full: { columns: 18, rows: 4 },
  mini: { columns: 9, rows: 2 },
}

function put(grid: string[][], row: number, col: number, code: string): void {
  const line = grid[row]
  if (line !== undefined && col >= 0 && col < line.length) line[col] = code
}

/** 只画在透明处，装饰物不盖住身体 */
function putOnAir(grid: string[][], row: number, col: number, code: string): void {
  if (grid[row]?.[col] === '.') put(grid, row, col, code)
}

function isEyesClosed(pose: AvatarPose): boolean {
  return pose.isBlink || pose.mood === 'sleepy'
}

function isEyesHappy(pose: AvatarPose): boolean {
  return pose.isPressed || pose.mood === 'happy' || pose.mood === 'proud' || pose.mood === 'shy'
}

/** 按姿态拼出像素网格，每格是调色板字母，'.' 为透明 */
export function avatarPixels(pose: AvatarPose): string[][] {
  return pose.size === 'mini' ? miniPixels(pose) : fullPixels(pose)
}

// 工作模式的正面小样 9×4 半格像素（2 行字符）：脑袋、两只眼睛、伸出来的小手
const MINI = [
  '.OOOOOOO.',
  '.ODOOODO.',
  'OOOOOOOOO',
  '.OOOOOOO.',
]

/** 工作模式：正面小样；眨眼、张望、打字、挥手、开心脸红、担心掉泪、说话张嘴 */
function miniPixels(pose: AvatarPose): string[][] {
  const grid = MINI.map(row => row.split(''))
  // 眼睛默认在第 1 行 2、6 列，看左/看右挪一列
  const shift = pose.gaze < 0 ? -1 : pose.gaze > 0 ? 1 : 0
  put(grid, 1, 2, 'O')
  put(grid, 1, 6, 'O')
  const eye = isEyesClosed(pose) ? 'S' : 'D'
  put(grid, 1, 2 + shift, eye)
  put(grid, 1, 6 + shift, eye)
  if (isEyesHappy(pose)) {
    put(grid, 2, 1, 'P')
    put(grid, 2, 7, 'P')
  }
  if (pose.mood === 'worried') put(grid, 2, 2 + shift, 'T')
  if (pose.isTalking) put(grid, 2, 4, 'M')
  // 挥手：小手举到脑袋旁边；打字：两只小手轮流缩回去
  if (pose.wavePhase === 1) {
    put(grid, 2, 0, '.')
    put(grid, 1, 0, 'O')
  } else if (pose.wavePhase === 2) {
    put(grid, 2, 8, '.')
    put(grid, 1, 8, 'O')
  } else if (pose.typePhase === 1) {
    put(grid, 2, 0, '.')
  } else if (pose.typePhase === 2) {
    put(grid, 2, 8, '.')
  }
  return grid
}

/** 放松模式：logo 前 4 行每行拆成上下两个半格（腿藏在输入框后面），细节画在半格上 */
function fullPixels(pose: AvatarPose): string[][] {
  const grid: string[][] = []
  for (const row of LOGO.slice(0, 4)) grid.push(row.split(''), row.split(''))
  // 眼睛：第 2、3 半格行，默认第 5、12 列；看左/看右整体挪一列
  const shift = pose.gaze < 0 ? -1 : pose.gaze > 0 ? 1 : 0
  for (const c of [5, 12]) {
    put(grid, 2, c, 'O')
    put(grid, 3, c, 'O')
  }
  for (const base of [5, 12]) {
    const c = base + shift
    if (isEyesClosed(pose)) {
      put(grid, 3, c, 'D')
    } else if (isEyesHappy(pose)) {
      put(grid, 2, c, 'D')
    } else {
      put(grid, 2, c, 'D')
      put(grid, 3, c, 'D')
    }
  }
  if (pose.mood === 'worried') put(grid, 4, 5 + shift, 'T')
  if (pose.mood === 'shy' || pose.isPressed) {
    put(grid, 4, 4, 'P')
    put(grid, 4, 13, 'P')
  }
  if (pose.isTalking) {
    put(grid, 4, 8, 'M')
    put(grid, 4, 9, 'M')
  }
  // 挥手：一只手举到眼睛高度
  if (pose.wavePhase === 1) {
    put(grid, 4, 1, '.')
    put(grid, 4, 2, '.')
    put(grid, 2, 1, 'O')
    put(grid, 2, 2, 'O')
    put(grid, 3, 2, 'O')
  } else if (pose.wavePhase === 2) {
    put(grid, 4, 15, '.')
    put(grid, 4, 16, '.')
    put(grid, 2, 15, 'O')
    put(grid, 2, 16, 'O')
    put(grid, 3, 15, 'O')
  }
  // 打字：一只手往下按半格
  if (pose.typePhase === 1) {
    put(grid, 4, 1, '.')
    put(grid, 4, 2, '.')
    put(grid, 6, 1, 'O')
    put(grid, 6, 2, 'O')
  } else if (pose.typePhase === 2) {
    put(grid, 4, 15, '.')
    put(grid, 4, 16, '.')
    put(grid, 6, 15, 'O')
    put(grid, 6, 16, 'O')
  }
  if (pose.isSparkle) {
    putOnAir(grid, 0, 1, 'Y')
    putOnAir(grid, 1, 0, 'Y')
    putOnAir(grid, 1, 2, 'Y')
  }
  if (pose.heartPhase !== null) {
    const c = pose.heartPhase % 2 === 0 ? 15 : 0
    putOnAir(grid, 0, c, 'R')
    putOnAir(grid, 0, c + 2, 'R')
    putOnAir(grid, 1, c + 1, 'R')
  }
  return grid
}

type Cell = { ch: string; fg?: string; bg?: string }

/** 两行像素合成一个半格字符 */
function halfCell(top: string | undefined, bottom: string | undefined, palette: Record<string, string>): Cell {
  const t = top !== undefined && top !== '.' ? palette[top] : undefined
  const b = bottom !== undefined && bottom !== '.' ? palette[bottom] : undefined
  if (t === undefined && b === undefined) return { ch: ' ' }
  if (b === undefined) return { ch: '▀', fg: t }
  if (t === undefined) return { ch: '▄', fg: b }
  if (t === b) return { ch: '█', fg: t }
  return { ch: '▀', fg: t, bg: b }
}

export type CellRun = { text: string; fg?: string; bg?: string }

function pushCell(runs: CellRun[], cell: Cell): void {
  const last = runs.at(-1)
  if (last !== undefined && last.fg === cell.fg && last.bg === cell.bg) last.text += cell.ch
  else runs.push({ text: cell.ch, ...(cell.fg ? { fg: cell.fg } : {}), ...(cell.bg ? { bg: cell.bg } : {}) })
}

/** 网格转成按行合并的文字片段（半格：每个字符上下两个像素），颜色按心情调色板取 */
export function toRuns(
  grid: string[][],
  palette: Record<string, string> = PALETTE,
  overlay: ReadonlyMap<string, Cell> = new Map(),
): CellRun[][] {
  const rows: CellRun[][] = []
  for (let r = 0; r < grid.length; r += 2) {
    const width = grid[r]?.length ?? 0
    const runs: CellRun[] = []
    for (let c = 0; c < width; c += 1) {
      pushCell(runs, overlay.get(`${r / 2},${c}`) ?? halfCell(grid[r]?.[c], grid[r + 1]?.[c], palette))
    }
    rows.push(runs)
  }
  return rows
}

const FRAME_MS = 140

type AvatarState = {
  frame: number
  hoverX: number | null
  heartUntil: number
  pressUntil: number
  talkUntil: number
  waveUntil: number
  seenPet: number
  seenSay: number
}

/** 由帧号推出这一帧的姿态 */
function poseAt(props: AvatarProps, s: AvatarState): AvatarPose {
  const f = s.frame
  const columns = AVATAR_SIZE[props.size].columns
  let gaze = 0
  if (s.hoverX !== null) gaze = s.hoverX < columns * 0.4 ? -1 : s.hoverX > columns * 0.6 ? 1 : 0
  else if (props.isBusy) gaze = [-1, 0, 1, 0][Math.floor(f / 7) % 4] ?? 0
  else gaze = [0, 0, 0, -1, 0, 0, 1, 0][Math.floor(f / 20) % 8] ?? 0
  const isWaving = f < s.waveUntil
  return {
    size: props.size,
    mood: props.mood,
    gaze,
    isBlink: f % 37 === 0 || f % 61 === 0,
    isPressed: f < s.pressUntil,
    isTalking: f < s.talkUntil && f % 2 === 0,
    wavePhase: isWaving ? (Math.floor(f / 2) % 2) + 1 : 0,
    typePhase: props.isBusy && !isWaving ? (f % 2) + 1 : 0,
    heartPhase: f < s.heartUntil ? Math.floor(f / 2) : null,
    isSparkle: f % 45 < 3,
  }
}

function poseKey(p: AvatarPose): string {
  return [
    p.size, p.mood, p.gaze, p.isBlink, p.isPressed, p.isTalking, p.wavePhase, p.typePhase,
    p.heartPhase === null ? '-' : p.heartPhase % 2, p.isSparkle,
  ].join('|')
}

/** 计时器回调只在第一次渲染时注册，拿不到后续的 props，所以最新 props 放在模块级（这个模块只有一个实例） */
let latestProps: AvatarProps | undefined

const Avatar: ClientModule<AvatarProps, AvatarState> = (props, surface) => {
  const { Box, Text } = surface.elements
  latestProps = props
  let s = surface.state
  if (s === undefined) {
    s = {
      frame: 1,
      hoverX: null,
      heartUntil: 0,
      pressUntil: 0,
      talkUntil: 0,
      waveUntil: 10,
      seenPet: props.petSeq,
      seenSay: props.saySeq,
    }
    surface.setState(s)
    let shownKey = ''
    surface.every(FRAME_MS, () => {
      const cur = surface.state
      if (cur === undefined || latestProps === undefined) return
      const next = { ...cur, frame: cur.frame + 1 }
      const key = poseKey(poseAt(latestProps, next))
      // 画面没变就只推进帧号，不触发重绘
      if (key === shownKey) {
        cur.frame = next.frame
        return
      }
      shownKey = key
      surface.setState(next)
    })
    surface.onPointer(e => {
      const cur = surface.state
      if (cur === undefined) return
      if (e.type === 'down' && e.button === 'left') {
        // 点一下：工作模式里是展开，放松模式里是摸头，由 hooks 模块决定
        surface.setState({ ...cur, pressUntil: cur.frame + 6 })
        surface.post({ type: 'click' })
      } else if (e.type === 'move') {
        if (cur.hoverX !== e.x) surface.setState({ ...cur, hoverX: e.x })
      } else if (e.type === 'leave') {
        surface.setState({ ...cur, hoverX: null })
      }
    })
  }
  // 摸头冒爱心、挥挥手；有新台词就动动嘴
  if (props.petSeq !== s.seenPet || props.saySeq !== s.seenSay) {
    const isPet = props.petSeq !== s.seenPet
    s = {
      ...s,
      seenPet: props.petSeq,
      seenSay: props.saySeq,
      ...(isPet ? { heartUntil: s.frame + 14, pressUntil: s.frame + 6, waveUntil: s.frame + 8 } : {}),
      talkUntil: s.frame + 12,
    }
    surface.setState(s)
  }

  const pose = poseAt(props, s)
  const overlay = new Map<string, Cell>()
  if (props.size === 'full' && props.mood === 'sleepy') {
    const up = Math.floor(s.frame / 6) % 2 === 0
    overlay.set(`0,${up ? 16 : 17}`, { ch: up ? 'z' : 'Z', fg: '#9db4ff' })
  }
  const rows = toRuns(avatarPixels(pose), paletteFor(props.mood), overlay)
  return (
    <Box flexDirection="column">
      {rows.map(runs => (
        <Box flexDirection="row">
          {runs.map(run => (
            <Text {...(run.fg ? { color: run.fg } : {})} {...(run.bg ? { backgroundColor: run.bg } : {})}>
              {run.text}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export default Avatar
