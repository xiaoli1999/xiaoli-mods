// 小克的「真实台词」：开头用零 token 的模板句引用主人的问题；一轮做完再让 haiku 结合真实发生的事说一句。
// 为了省 token：人设一行、上下文全部截短、输出上限很小；纯函数，便于测试。调用、节流、过期丢弃在 register.tsx 里。

export type TurnFacts = {
  /** 主人这轮说的话 */
  prompt: string
  /** 这轮怎么结束的：answer / aborted / error / refusal */
  reason?: string
  duration?: string
  /** 各工具调用次数，如 { Read: 5, Edit: 3 } */
  toolCounts?: Record<string, number>
  /** 动过的东西，如 ['Edit avatar.tsx', 'Bash claude plugin test'] */
  touched?: string[]
  errors?: number
  /** Claude 最终回复的开头 */
  answer?: string
}

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}

/**
 * 人设压成一行，每次调用都要发，越短越省（要在 90 字以内）；装的人不一定是作者，主人不写名字。
 * 末尾一句是用语护栏：不说阴森、像在监视人的话。为了腾出字数并少一点「在下面」的联想，去掉了「趴在输入框上」；
 * 「只说这轮真实发生的事」同时管着不编造
 */
export function reactSystem(): string {
  return '你是小克，陪主人写代码的像素小方块，阳光俏皮。只回一句简体中文，不超过30字，只说这轮真实发生的事，不用emoji，不写代码，不说在你下面、盯着你、偷偷这类阴森或监视感的话。'
}

/** 主人刚提问：零 token 的模板句，直接引用问题开头 */
export function startEcho(prompt: string, pick: (n: number) => number): string {
  const q = clip(prompt, 14)
  const templates = ['收到「{q}」，我在旁边陪着～', '「{q}」是吧，交给 Claude，我负责加油', '好嘞，开始搞「{q}」！', '「{q}」，我陪你一起等结果']
  return (templates[pick(templates.length)] ?? templates[0] ?? '').replace('{q}', q)
}

/** 这一轮值不值得花 token 让 haiku 说一句：被打断、没用工具的短闲聊都不值得 */
export function isWorthReacting(f: TurnFacts): boolean {
  if (f.reason === 'aborted') return false
  const toolCount = Object.values(f.toolCounts ?? {}).reduce((a, b) => a + b, 0)
  return toolCount > 0 || (f.answer ?? '').trim().length >= 40
}

/** 一轮做完：紧凑的真实素材，交给 haiku 说一句 */
export function donePrompt(f: TurnFacts): string {
  const tools = Object.entries(f.toolCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, n]) => `${name}×${n}`)
    .join(' ')
  const ending = f.reason === 'error' ? '出错中断' : f.reason === 'refusal' ? '被拒绝' : '完成'
  return [
    `问:${clip(f.prompt, 80)}`,
    `结果:${ending},${f.duration ?? '?'}${tools ? `,${tools}` : ''}${f.errors ? `,失败${f.errors}次` : ''}`,
    f.touched && f.touched.length > 0 ? `动过:${f.touched.slice(-4).map(t => clip(t, 24)).join(';')}` : '',
    f.answer ? `回复:${clip(f.answer, 120)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * 模型回复清洗成一行台词：取第一行、去引号和自称前缀、限长（默认 60 字，悄悄话按它人设里的字数上限）。
 * 自称前缀认「小克：」，也认改名期间的旧名「小黎：」「小黎mods：」（模型偶尔沿用）
 */
export function cleanLine(text: string, max = 60): string {
  const first = text.split(/\r?\n/).map(s => s.trim()).find(s => s.length > 0) ?? ''
  const unquoted = first.replace(/^[「『“"'（(]+|[」』”"'）)]+$/g, '').replace(/^(?:小克|小黎)(?:\s*mods)?[:：]\s*/i, '')
  return unquoted.length > max ? `${unquoted.slice(0, max)}…` : unquoted
}
