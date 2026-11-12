// 定点健康提醒：几点提醒什么、下一次是几点、今天提醒过哪些。纯函数，测试直接引用

export type RemindKind = 'sit' | 'water'

/** 10、12、16、18 点久坐；11、15、17 点喝水（从早到晚） */
export const SCHEDULE: readonly { hour: number; kind: RemindKind }[] = [
  { hour: 10, kind: 'sit' },
  { hour: 11, kind: 'water' },
  { hour: 12, kind: 'sit' },
  { hour: 15, kind: 'water' },
  { hour: 16, kind: 'sit' },
  { hour: 17, kind: 'water' },
  { hour: 18, kind: 'sit' },
]

/** 久坐、喝水都强提醒 3 分钟 */
export const ALERT_MS = 3 * 60_000

/** 这个整点要提醒什么，不是提醒点为 undefined */
export function kindAt(hour: number): RemindKind | undefined {
  return SCHEDULE.find(s => s.hour === hour)?.kind
}

/** 今天的提醒记录（多个会话共用，存在 $.store 的 reminders）：每个整点是什么时候弹出来的 */
export type RemindLog = { day: string; done: Record<string, number> }

/** 读出今天的记录；存的是别的天、或者数据不对，就从空的开始 */
export function readLog(stored: unknown, day: string): RemindLog {
  const prev = stored as { day?: unknown; done?: unknown } | null
  if (prev === null || typeof prev !== 'object' || prev.day !== day) return { day, done: {} }
  if (typeof prev.done !== 'object' || prev.done === null) return { day, done: {} }
  const done: Record<string, number> = {}
  for (const [hour, at] of Object.entries(prev.done as Record<string, unknown>)) {
    if (typeof at === 'number') done[hour] = at
  }
  return { day, done }
}

/** 今天已经提醒过的整点，从早到晚 */
export function doneHours(log: RemindLog): number[] {
  return Object.keys(log.done)
    .map(Number)
    .filter(h => Number.isInteger(h))
    .sort((a, b) => a - b)
}

/** 下一个要提醒的整点：当前这个小时还没提醒也算（人回来就补）；今天都过了为 undefined */
export function nextSlot(hour: number, done: readonly number[]): { hour: number; kind: RemindKind } | undefined {
  return SCHEDULE.find(s => s.hour > hour || (s.hour === hour && !done.includes(s.hour)))
}
