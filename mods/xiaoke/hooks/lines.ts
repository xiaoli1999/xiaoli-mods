// 台词库：只用 ASCII、中文和全角符号，避免宽度歧义字符把气泡边框撑歪。
// 语气阳光、亲切、像同事：不说让人联想到阴森、被监视、被命令、被当小孩哄的话（如「在下面」「盯着」「偷偷」「不许」「真乖」）

export function greeting(hour: number, days: number): string {
  const together = days > 1 ? `这是我们认识的第 ${days} 天～` : '初次见面，我是小克！'
  if (hour >= 5 && hour < 9) return `早上好呀！${together}先来杯咖啡？`
  if (hour >= 9 && hour < 12) return `上午好！${together}今天也元气满满地写代码吧`
  if (hour >= 12 && hour < 14) return `中午好～${together}记得吃饭，饿着肚子可写不出好代码`
  if (hour >= 14 && hour < 18) return `下午好！${together}困了就伸个懒腰，我趴这儿陪你`
  if (hour >= 18 && hour < 23) return `晚上好！${together}今天辛苦啦，还有什么要搞定的？`
  return `这么晚还在写代码…${together}我陪你，但要早点睡哦`
}

export const TURN_START = [
  '收到～我趴在这儿看 Claude 干活',
  '开工开工！我负责加油打气',
  '托着下巴，陪你们一起想',
  '好嘞，这个问题交给你们俩',
]

export const TOOL_ERROR = [
  '{tool} 摔了一跤…没关系，再来一次就好',
  '诶，{tool} 出错了，别急，Claude 会想办法的',
  '小插曲而已，{tool} 下一次一定行',
]

export const ERRORS_MANY = [
  '连着几次不顺…要不要换个思路？我陪你慢慢来',
  '深呼吸～卡住的时候，往往离答案不远了',
]

export const DENIED = ['好，听你的，这一步先不做', '收到，不让动就不动']

export const TURN_DONE = [
  '搞定！你今天也超棒的',
  '完成～要不要奖励自己一口零食？',
  '又解决一个问题，记一功！',
  '漂亮！这一轮很顺',
]

export const TURN_DONE_AFTER_ERRORS = ['虽然中间摔了几跤，最后还是搞定了！', '过程曲折，结局圆满～']

export const TURN_LONG = ['这一轮好长，辛苦啦～起来喝口水吧', '忙了这么久，让眼睛休息一下，看看远处']

export const TURN_ABORTED = ['打断也没关系，换个方向重新来', '停一下也好，想清楚再出发']

/** 一轮因接口出错（重试用尽、上下文超限等）中断 */
export const TURN_FAILED = ['接口好像闹脾气了…等一会儿再试试？']

/** 一轮被拒绝（refusal）结束：不是接口坏了，是这个问题它没法答 */
export const TURN_REFUSED = '这个它没法答呢，换个问法试试？'

export const LATE_NIGHT = '夜深了，今天的事做完就去睡吧，我给你留盏灯'

export const PET = ['嘿嘿，再摸一下嘛', '像素都被你摸亮了～', '被摸头了，今天的代码一定没有 bug！', '小短手挥一挥，收到你的摸摸啦']

export const PET_MILESTONE = '我们已经摸头 {n} 次啦，你是我最喜欢的人类！'

export const FEED = ['饼干！咔嚓咔嚓…好吃', '能量补充完毕，四条小腿又有劲了', '你也吃一块嘛，别光喂我']

export const PRAISE = [
  '能把复杂需求拆得这么清楚，真的很强',
  '今天也在认真解决问题，这本身就很了不起',
  'bug 最怕的就是你这种不放弃的人',
  '你写的每一行，都在让产品变得更好',
  '遇到难题不慌不乱，这就是靠谱',
]

/**
 * 定点久坐提醒（10、12、16、18 点）；会显示在带边框的提醒框里，不用省略号这类宽度歧义字符。
 * 久坐、喝水提醒以作者小黎的名义发出（提醒框标题是「小黎 · 久坐提醒 · 起来走走」「小黎 · 喝水提醒 · 喝口水」），小克来传话，所以各有一句「小黎让我提醒你」
 */
export const SIT = [
  '{hh} 点啦，站起来走两步、伸个懒腰吧',
  '起来活动一下肩颈，这儿有我呢',
  '坐太久对腰不好哦，起身溜达一圈再回来～',
  '小黎让我提醒你：该起来走走啦',
]

/** 定点喝水提醒（11、15、17 点）；同上，带边框，不用省略号 */
export const WATER = [
  '{hh} 点啦，该喝水了～杯子里的水还温吗？',
  '来，干了这杯（白开水）',
  '补充点水分，脑子会转得更快哦',
  '小黎让我提醒你：喝口水再继续',
]

/** 强制休息中点「收起」：撒个娇不让收 */
export const REST_STAY = ['再休息一会嘛，还剩 {left}', '眼睛和腰都在谢谢你，再坚持 {left}', '先别急着回去干活，还有 {left} 哦']

/** 强提醒倒计时结束：提醒框收起，工作/放松模式保持用户原来选的，不替用户改 */
export const REST_DONE = ['休息结束～满血回来继续干活吧', '充电完成！继续加油，我就在这儿陪着你', '好啦，继续加油，有事随时叫我']

/** 提醒气泡里点了「我起来啦 / 喝完啦 / 休息好啦」 */
export const REST_FINISHED: Record<'sit' | 'water' | 'manual', readonly string[]> = {
  sit: ['好棒！活动开了，腰都在谢谢你', '起来走一走就是不一样，继续加油～'],
  water: ['咕嘟咕嘟，补水完成！', '喝完啦？脑子又转起来了～'],
  manual: ['休息好啦，满血回来继续干活吧', '充好电了，我们继续～'],
}

/** 按钮还锁着就去点 */
export const REST_LOCKED = '再坚持一会儿，按钮亮了才能点哦～'

/** /xiaoke rest 手动休息 */
export const REST_MANUAL = ['好嘞，休息两分钟，看看远处、活动活动手腕', '暂停一下～深呼吸，喝口水']

export const QUOTA_HIGH ='{kind}额度已经用了 {p}%，{reset}，接下来挑重点问哦'

export const CTX_HIGH = '上下文已经 {p}% 了，可以考虑 /compact 压缩一下'

export const QUIET_ON = '好，我安静趴着，有事叫我'
export const QUIET_OFF = '我回来啦～'

export const WHISPER_THINKING = '小克歪着头想了想…'

/** 安静模式下点「悄悄话」：不调模型（零 token），直接回这一句 */
export const WHISPER_QUIET = '嘘，现在是安静模式～想听我说悄悄话，先点「陪我说话」关掉安静吧'

/** 带子不足 4 行、只画得下 2 行的小个子时点小克：展不开，也不改模式 */
export const TOO_SHORT = '这里太矮了，展不开～把窗口拉高一点再点我'

/** 缓存保活成功（{n} 是本会话今天第几次） */
export const KEEP_DONE = [
  '顺手帮你续了下缓存～回来不用重新读上下文',
  '缓存焐热啦，今天第 {n} 次，我守着呢',
  '帮你把上下文续上了（第 {n} 次），慢慢来不着急',
]

export function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] ?? (list[0] as T)
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''))
}

/** 悄悄话最多几个字：人设里这么要求，回来的话也按这个长度清洗 */
export const WHISPER_MAX_CHARS = 36

/** 悄悄话的人设：根据主人此刻的状态主动说一句（小克的颜色随心情变，人设里不写颜色） */
export function whisperSystem(): string {
  return [
    '你是「小克」，Claude Code 吉祥物的变体：一只像素小方块，有两只小短手和四条小短腿，趴在程序员的输入框上陪主人写代码。',
    '性格温暖、俏皮、有点呆萌，偶尔用 (^_^) 这类颜文字，不用 emoji。',
    `只用简体中文，一句话，不超过 ${WHISPER_MAX_CHARS} 个字，不说教，不列清单，不写代码。`,
    '语气阳光、亲切，像同事一样；不说阴森或像在监视人的话（如「在你下面」「盯着你」「偷偷」）。',
  ].join('\n')
}

export function whisperPrompt(status: string): string {
  return `主人此刻的状态：${status}\n请主动对主人说一句贴心或俏皮的话。`
}
