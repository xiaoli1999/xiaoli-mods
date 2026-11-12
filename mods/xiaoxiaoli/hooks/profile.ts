/**
 * @description 起名、工种与首次引导：全局档案 profile.json 的解析与写回（含工种、「已自动发起过」的标记与演练处理过没有）、
 * 名字规则（去后缀、长度、非法字符）、工种的认法、工作台全称与提示前缀、首次引导与演练引导要不要显示，
 * 以及「设置工作台」「走一遍演练」时发给 AI 的那段话；不依赖别的 hooks 模块，面板、状态行、开工消息都从这里取名字
 * @author xiao li
 * @createDate 2026-11-12 10:00
 */
import type { ProfileStateType, ProfileType, TourStateType, WorkRole } from '../types'

/** 六个工种的 id，也是内置工作流 workflows/<id>.json 的文件名 */
export const WORK_ROLES = ['frontend', 'backend', 'python', 'test', 'product', 'other'] as const satisfies readonly WorkRole[]
/** 工种的中文名 */
export const ROLE_TITLES: Record<WorkRole, string> = {
    frontend: '前端',
    backend: '后端',
    python: 'Python',
    test: '测试',
    product: '产品',
    other: '其他'
}
/** 没设工种时按前端 */
export const DEFAULT_ROLE: WorkRole = 'frontend'
/** 可选工种的说法，提示与拒绝原因里用 */
export const ROLE_CHOICES_TEXT = WORK_ROLES.map(i => ROLE_TITLES[i]).join('、')

/** 档案的文件名，放在全局根目录下（默认 ~/.claude/xiaoxiaoli/profile.json） */
export const PROFILE_FILE = 'profile.json'
/** 档案的结构版本；文件里的版本比它新时名字用默认、不显示引导、不覆盖写 */
export const PROFILE_VERSION = 1
/** 没起名、选了先不设或档案读不懂时用的名字 */
export const DEFAULT_NAME = '小小黎'
/** 名字后面接的后缀：名字 + 它 = 工作台全称 */
export const WORKBENCH_SUFFIX = 'AI工作台'
/** 名字最多几个字符，按码点数 */
export const NAME_LIMIT = 12
/** 档案版本比本 mod 新时，改名、先不设、设置引导的拒绝原因 */
export const PROFILE_NEWER_TEXT = 'profile.json 是更新版本的 mod 写的，先更新 mod 再改'
/** 名字结尾已带的后缀：「AI工作台」「AI 工作台」「工作台」，AI 不分大小写，免得拼成「某某AI工作台AI工作台」 */
const SUFFIX_PATTERN = /\s*(?:ai\s*)?工作台$/i
/** 控制字符：C0（含换行、制表）、DEL、C1，外加行分隔符与段分隔符 */
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u{2028}\u{2029}]/u
/** 名字会进 TAPD 评论的 HTML 署名，这五个字符不许有 */
const HTML_PATTERN = /[<>&"']/
/** 起名与先不设时改的字段，其余字段写回时原样保留（含自动发起的标记 guided、guidedBy） */
const OWN_KEYS = ['version', 'name', 'skipped']
/** 记自动发起标记时改的字段，其余（含 name、skipped）原样保留 */
const GUIDED_KEYS = ['version', 'guided', 'guidedBy']
/** 记演练结果时改的字段，其余原样保留 */
const TOUR_KEYS = ['version', 'tour', 'tourAt', 'tourSummary']
/** 演练小结最多存几个字符（按码点数） */
export const TOUR_SUMMARY_LIMIT = 500

/** 校验名字的结果：合格为去掉首尾空白与后缀后的名字，不合格为原因 */
export type NameCheckType = { name: string } | { reason: string }

/**
 * 写档案要改的内容：起了名字（可一并设工种）、只设工种、选了先不设、记下「已自动发起过设置引导」
 * （guidedBy 为发起它的会话 ID，多个会话同时启动时写完重读、认出是不是自己记的），或记下演练处理过
 * （done 走过、declined 选了不用；tourAt 为时间，summary 为演练小结，只在 done 时可带）
 */
export type ProfileChangeType =
    | { name: string; role?: WorkRole }
    | { role: WorkRole }
    | { isSkipped: true }
    | { guidedBy: string }
    | { tour: TourStateType; tourAt: string; summary?: string }

/**
 * 认工种：id（不分大小写）或中文名（前端、后端、Python、测试、产品、其他），前后空白不算。
 * @param raw 原值
 * @returns 工种，认不出为 undefined
 */
export const toRole = (raw: unknown): WorkRole | undefined => {
    if (typeof raw !== 'string') return undefined

    const text = raw.trim().toLowerCase()
    return WORK_ROLES.find(i => i === text || ROLE_TITLES[i].toLowerCase() === text)
}

/**
 * 当前工种：档案里设了就用，没设为前端。
 * @param profile 档案内容
 * @returns 工种
 */
export const roleOf = (profile: ProfileType): WorkRole => profile.role || DEFAULT_ROLE

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/** 读成对象，不是合法 JSON 对象返回 null */
const parseRecord = (text: string): Record<string, unknown> | null => {
    try {
        const value: unknown = JSON.parse(text)
        return isRecord(value) ? value : null
    } catch {
        return null
    }
}

/**
 * 名字的规范写法：去掉首尾空白；结尾带「AI工作台」「AI 工作台」「工作台」的去掉这个后缀，再去一次空白。
 * @param raw 用户起的名字
 * @returns 规范后的名字，可能为 ''
 */
export const normalizeName = (raw: string): string => raw.trim().replace(SUFFIX_PATTERN, '').trim()

/**
 * 校验名字：先按 normalizeName 规范，再要求 1 到 12 个字符（按码点数）、不含控制字符、不含 < > & " ' 这五个字符。
 * @param raw 名字原值，可能是模型或用户给的任意值
 * @returns 合格的名字，或不合格的原因
 */
export const checkName = (raw: unknown): NameCheckType => {
    if (typeof raw !== 'string') return { reason: 'name 要填名字（文字）' }

    const name = normalizeName(raw)
    const count = [...name].length
    if (count === 0) return { reason: '名字不能为空（去掉首尾空白与「AI工作台」后缀后什么也不剩）' }
    if (CONTROL_PATTERN.test(name)) return { reason: '名字不能含换行、制表等控制字符' }
    if (HTML_PATTERN.test(name)) return { reason: '名字不能含 < > & " \' 这五个字符（名字会进 TAPD 评论的署名）' }
    if (count > NAME_LIMIT) return { reason: `名字最多 ${NAME_LIMIT} 个字符，现在是 ${count} 个` }

    return { name }
}

/**
 * 解析全局档案：不是合法 JSON、版本不对、字段类型不对或名字不合格，都当作还没设置，不报错；
 * 版本比本 mod 认识的新时 isNewer 为 true，名字照样当作没设置。名字合格时以名字为准，忽略 skipped。
 * guided 为 true 是「已自动发起过设置引导」的标记，只管以后不再自动发起，不影响是否还没设置。
 * tour 只认 done、declined，其余当作没处理过演练（不写这个字段）。
 * @param text 文件内容，读不到为 ''
 * @returns 档案内容
 */
export const parseProfile = (text: string): ProfileType => {
    const empty: ProfileType = { name: '', isSkipped: false, isNewer: false, isGuided: false, role: '' }
    const value = parseRecord(text)
    if (value === null) return empty
    if (typeof value.version === 'number' && value.version > PROFILE_VERSION) return { ...empty, isNewer: true }
    if (value.version !== PROFILE_VERSION) return empty

    /* 工种只认文件里写的 id，认不出当作没设 */
    const role = WORK_ROLES.find(i => i === value.role) ?? ''
    const tour: { tour?: TourStateType } = value.tour === 'done' || value.tour === 'declined' ? { tour: value.tour } : {}
    const read: ProfileType = { ...empty, isGuided: value.guided === true, role, ...tour }
    const checked = checkName(value.name)
    if ('name' in checked) return { ...read, name: checked.name }

    return { ...read, isSkipped: value.skipped === true }
}

/**
 * 档案里记的「是哪个会话自动发起的设置引导」：写完标记后重读，认出是不是自己记的。
 * @param text 文件内容
 * @returns 发起它的会话 ID，没有为 ''
 */
export const guidedByOf = (text: string): string => {
    const value = parseRecord(text)?.guidedBy
    return typeof value === 'string' ? value : ''
}

/** 对象去掉几个键 */
const omitKeys = (value: Record<string, unknown>, keyList: readonly string[]): Record<string, unknown> =>
    Object.fromEntries(Object.entries(value).filter(([key]) => !keyList.includes(key)))

/** 对象写成带缩进的 JSON 全文，末尾换行 */
const toJsonText = (value: Record<string, unknown>): string => `${JSON.stringify(value, null, 2)}\n`

/**
 * 写回档案的全文：版本写成 1；起名时写 name、去掉 skipped，先不设时写 skipped、去掉 name；
 * 记自动发起标记时写 guided: true 与 guidedBy，名字与 skipped 不动；记演练时写 tour 与 tourAt，带了小结写 tourSummary
 * （超过 500 个字符只存前 500 个），没带就去掉上次的；文件里别的字段原样保留。
 * @param oldText 原文件全文，没有为 ''
 * @param change 起的名字、先不设、自动发起的标记，或演练结果
 * @returns 新全文，末尾换行
 */
export const profileText = (oldText: string, change: ProfileChangeType): string => {
    const record = parseRecord(oldText) ?? {}
    if ('guidedBy' in change) return toJsonText({ version: PROFILE_VERSION, ...omitKeys(record, GUIDED_KEYS), guided: true, guidedBy: change.guidedBy })
    if ('tour' in change) {
        const summary = change.summary === undefined || change.summary.trim() === '' ? {} : { tourSummary: [...change.summary.trim()].slice(0, TOUR_SUMMARY_LIMIT).join('') }
        return toJsonText({ version: PROFILE_VERSION, ...omitKeys(record, TOUR_KEYS), tour: change.tour, tourAt: change.tourAt, ...summary })
    }
    if ('isSkipped' in change) return toJsonText({ version: PROFILE_VERSION, skipped: true, ...omitKeys(record, OWN_KEYS) })
    /* 只设工种：名字与先不设都不动 */
    if (!('name' in change)) return toJsonText({ version: PROFILE_VERSION, ...omitKeys(record, ['version', 'role']), role: change.role })

    const role = change.role === undefined ? {} : { role: change.role }
    return toJsonText({ version: PROFILE_VERSION, name: change.name, ...omitKeys(record, change.role === undefined ? OWN_KEYS : [...OWN_KEYS, 'role']), ...role })
}

/**
 * 当前用的名字：档案里起了就用起的，没起、先不设或读不懂为默认名。
 * @param profile 档案内容
 * @returns 名字
 */
export const nameOf = (profile: ProfileType): string => profile.name || DEFAULT_NAME

/**
 * 工作台全称：名字 + AI工作台。
 * @param name 名字
 * @returns 全称，如「小小黎AI工作台」
 */
export const fullNameOf = (name: string): string => `${name}${WORKBENCH_SUFFIX}`

/**
 * 提示前缀统一从这里出：toast、命令回复、工具拒绝都写成「<名字>：<内容>」。
 * @param name 名字
 * @param text 内容
 * @returns 带前缀的提示
 */
export const noticeText = (name: string, text: string): string => `${name}：${text}`

/**
 * 是否还没设置、要显示首次引导：取得到全局根目录（档案有路径）、版本不比本 mod 新，且档案里既没有合格的名字也没选先不设。
 * @param state $.state 里的档案
 * @returns 是否显示引导
 */
export const isSetupPending = (state: ProfileStateType): boolean =>
    state.path !== '' && !state.isNewer && state.name === '' && !state.isSkipped

/**
 * 演练还没处理过：取得到全局根目录、版本不比本 mod 新，档案里没记 tour（没走过也没选不用）。
 * 这时演练工具放进工具列表，设置引导里多问一步要不要走演练。
 * @param state $.state 里的档案
 * @returns 是否还没处理过
 */
export const isTourPending = (state: ProfileStateType): boolean => state.path !== '' && !state.isNewer && state.tour === undefined

/**
 * 面板要不要在引导位置出「走一遍演练」「不用了」两行：演练还没处理过，且名字已经起了或选了先不设（和起名引导不同时出）。
 * 老用户（起了名、没有演练记录）也会看到一次。
 * @param state $.state 里的档案
 * @returns 是否显示
 */
export const isTourOffered = (state: ProfileStateType): boolean => isTourPending(state) && !isSetupPending(state)

/** 设置引导那段话的参数 */
export interface SetupPromptOptionsType {
    /** 档案里起的名字，没起为 '' */
    name: string
    /** 档案里的工种，没设为 ''；不传为 '' */
    role?: WorkRole | ''
    /** 当前项目还没绑定 TAPD（全局模式没绑定），是才写进问 TAPD 项目的那一条 */
    isUnbound: boolean
    /** 项目目录名，问 TAPD 项目时说是哪个项目 */
    projectName: string
    /** 是否首次使用时自动发起的（来源说明不同），不传为否 */
    isAuto?: boolean
    /** 保存之后要不要多问一步「走一遍演练」：演练还没处理过、演练脚本能用时为是；不传为否 */
    isTourOffered?: boolean
}

/** 演练工具的全名，提示里用 */
const GUIDE_TOOL_NAME = 'mcp__xiaoxiaoli__guide'
/** 工具还没加载时怎么取它 */
const GUIDE_TOOL_LOAD = `工具还没加载时先用 ToolSearch 查 select:${GUIDE_TOOL_NAME}`

/**
 * 「开始设置」、/xiaoxiaoli setup 与首次使用自动发起时发进会话的那段话：让 AI 用 AskUserQuestion 问名字、再问工种；
 * 项目还没绑定 TAPD 时再问对应哪个 TAPD 项目；拿到后调 mcp__xiaoxiaoli__setup 保存，一两句话告诉结果，不做别的事；
 * 演练还没处理过时，保存之后再问要不要走一遍演练（现在走就调 mcp__xiaoxiaoli__guide 的 start，以后再说就告诉入口）；
 * 用户不想现在设时不追问，告诉他以后的入口。已起过名、设过工种的告诉 AI 当前的，可以重新设置。
 * @param options 当前名字与工种、是否没绑定、项目目录名、是否自动发起、是否问演练
 * @returns 消息全文
 */
export const setupPrompt = ({ name, role = '', isUnbound, projectName, isAuto = false, isTourOffered = false }: SetupPromptOptionsType): string => {
    const isDefault = name === '' || name === DEFAULT_NAME
    const current = name === '' ? `现在用的是默认名「${DEFAULT_NAME}」` : `现在叫「${fullNameOf(name)}」`
    const keep = isDefault ? `「保持默认：${DEFAULT_NAME}」` : `「保持当前：${name}」和「恢复默认：${DEFAULT_NAME}」`
    const askName = [
        `用 AskUserQuestion 工具问我「工作台叫什么名字？」，说明最终名称是「名字+${WORKBENCH_SUFFIX}」（比如起名「小美」就叫「小美${WORKBENCH_SUFFIX}」），${current}；`,
        `选项里给${keep}，我也可以选「其他」自己填。名字 1 到 ${NAME_LIMIT} 个字符，不能含换行与 < > & " ' 这几个字符`
    ].join('')
    const askRole = [
        `再问我主要做哪类工作（工种决定开工用哪套工作流，测试、产品、其他开工不建分支），可以和上一问放在同一次 AskUserQuestion 里；`,
        `选项给「前端」「后端」「测试」「产品」，并说明 Python 或别的工种选「其他」自己填${role === '' ? '' : `；现在是「${ROLE_TITLES[role]}」`}`
    ].join('')
    const askBind = [
        `再用 AskUserQuestion 问我这个项目（${projectName}）对应哪个 TAPD 项目，选项里给「先不绑」（候选可用 mcp__tapd__get_user_participant_projects 查我参与的项目）；`,
        '我选了某个项目就调 mcp__xiaoxiaoli__bind 绑定，选「先不绑」就跳过'
    ].join('')
    const save = [
        `拿到名字和工种后调 mcp__xiaoxiaoli__setup 保存：name 传名字（选保持默认就传「${DEFAULT_NAME}」），`,
        'role 传 frontend、backend、test、product 之一，自己填 Python 的传 python，填别的都传 other',
        '（工具还没加载时先用 ToolSearch 查 select:mcp__xiaoxiaoli__setup）；然后用一两句话告诉我结果，不要做别的事',
        isTourOffered ? '（下一条除外）' : ''
    ].join('')
    const askTour = [
        '保存成功后，再用 AskUserQuestion 问我要不要花几分钟走一遍演练：说明演练会先检查本机已经装了哪些 MCP、skill 和命令行工具，',
        '再按我的工作流带我模拟走一遍、讲讲工作台的功能点，卡在哪里就告诉我要准备什么；不建分支、不提交、不改 TAPD，',
        '只把我当场给的配置记进资料目录，装任何工具前都先问我；会多花几轮对话。选项给「现在走」「以后再说」。',
        `选「现在走」就调 ${GUIDE_TOOL_NAME}，action 传 start（${GUIDE_TOOL_LOAD}），照它返回的脚本带我走；`,
        `选「以后再说」就告诉我以后输入 /xiaoxiaoli tour 可以再来，不调 ${GUIDE_TOOL_NAME}`
    ].join('')
    const later = [
        '我不想现在设（关掉提问、按了取消或说以后再说）时不要追问，也不要调 mcp__xiaoxiaoli__setup，',
        '只告诉我以后想起名可以点工作台面板上的「开始设置」或输入 /xiaoxiaoli setup'
    ].join('')
    const stepList = [askName, askRole, ...(isUnbound ? [askBind] : []), save, ...(isTourOffered ? [askTour] : []), later]
    const head = isAuto
        ? '首次使用，自动发起设置工作台（只自动这一次），按下面做：'
        : '设置工作台（来自工作台面板的「开始设置」或 /xiaoxiaoli setup），按下面做：'

    return [head, ...stepList.map((step, index) => `${index + 1}. ${step}`)].join('\n')
}

/**
 * 面板「走一遍演练」与 /xiaoxiaoli tour 发进会话的那段话：让 AI 调 mcp__xiaoxiaoli__guide 的 start，照返回的脚本带着走；
 * 用户中途叫停就立刻停、调 finish 收尾并告诉以后的入口。
 * @returns 消息全文
 */
export const tourPrompt = (): string =>
    [
        '走一遍演练（来自工作台面板的「走一遍演练」或 /xiaoxiaoli tour），按下面做：',
        `1. 调 ${GUIDE_TOOL_NAME}，action 传 start（${GUIDE_TOOL_LOAD}），照它返回的脚本一步步带我走：先体检，再按工作流模拟走一遍，最后讲功能点`,
        `2. 我中途说停或以后再说，就立刻停下，调 ${GUIDE_TOOL_NAME}（action 传 finish）收尾，告诉我以后输入 /xiaoxiaoli tour 可以再来`
    ].join('\n')
