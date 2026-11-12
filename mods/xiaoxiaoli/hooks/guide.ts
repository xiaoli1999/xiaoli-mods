/**
 * @description 体检与演练：mod 目录下 guide/deps.json（依赖清单）与 guide/tour.json（演练脚本）的宽松读取、按工种筛依赖、
 * 演练脚本与工作流步骤的配对、mcp__xiaoxiaoli__guide 的参数校验、start 返回的演练脚本、体检结果 env.json 的读取与写回、
 * 按当前工种算出的缺项，以及演示条目的建法；纯函数便于测试。体检与带练由会话里的 AI 做，mod 不起进程、不读 settings
 * @author xiao li
 * @createDate 2026-11-12 22:00
 */
import type { CheckResultType, DepKindType, DepType, EnvStateType, FlowType, ProgressTaskType, TourType, WorkRole, WorkflowStepType } from '../types'
import { WORK_ROLES } from './profile'
import { DEMO_ID, flowSteps } from './workbench'

/** 依赖清单与演练脚本的位置，相对 mod 目录 */
export const DEPS_FILE = 'guide/deps.json'
export const TOUR_FILE = 'guide/tour.json'
/** 两份文件认识的结构版本 */
export const GUIDE_VERSION = 1
/** 体检结果的文件名，放在全局根目录下（默认 ~/.claude/xiaoxiaoli/env.json） */
export const ENV_FILE = 'env.json'
/** 体检结果的结构版本；文件里的比它新时不覆盖写 */
export const ENV_VERSION = 1
/** 演示条目的标题 */
export const DEMO_TITLE = '【演练】熟悉工作台'
/** 一项依赖的体检结果只能取这三个 */
export const CHECK_RESULTS = ['ok', 'missing', 'skipped'] as const satisfies readonly CheckResultType[]
/** 依赖的种类 */
const DEP_KINDS = ['mcp', 'skill', 'cli'] as const satisfies readonly DepKindType[]
/** 依赖种类在脚本里的叫法 */
const KIND_LABEL: Record<DepKindType, string> = { mcp: 'MCP', skill: 'skill', cli: '命令行工具' }
/** 依赖 id：小写字母或数字开头，只含小写字母、数字与 . _ -，最多 64 个字符 */
const DEP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
/** 控制字符（含换行、制表）与行分隔符、段分隔符：拼进脚本时换成空格，一项一行 */
const CONTROL_GLOBAL = /[\u0000-\u001f\u007f-\u009f\u{2028}\u{2029}]+/gu
/** tour.json 没写 fallback 时用的说法 */
const DEFAULT_STEP_GUIDE = '一句话说明这一步真实使用时做什么；问用户这一步需要事先准备什么数据或工具，记进资料。'
/** 演练工具与进度工具的全名，脚本里用 */
const GUIDE_TOOL_NAME = 'mcp__xiaoxiaoli__guide'
const PROGRESS_TOOL_NAME = 'mcp__xiaoxiaoli__progress'

/** 读依赖清单的结果：能用为依赖与跳过了几项（格式不对的），不能用为原因 */
export type DepsParseType = { depList: DepType[]; skippedCount: number } | { reason: string }

/** 读演练脚本的结果：能用为脚本，不能用为原因 */
export type TourParseType = { tour: TourType } | { reason: string }

/** mcp__xiaoxiaoli__guide 的参数 */
export type GuideInputType =
    | { action: 'start' }
    | { action: 'check'; results: Record<string, unknown> }
    | { action: 'finish'; summary?: string }

/** 体检结果文件读出来的内容 */
export interface EnvRecordType {
    /** 上次体检的时间（ISO），没有为 '' */
    checkedAt: string
    /** 每项依赖的结果，值不对的项不收 */
    results: Record<string, CheckResultType>
    /** 文件版本比本 mod 新：不覆盖写 */
    isNewer: boolean
}

/** 演练里的一个环节：工作流的步骤配上演练时验证什么 */
export interface TourStepType {
    key: string
    title: string
    /** 真实使用时做什么（工作流的 what），没写为 '' */
    what: string
    /** 演练时验证什么 */
    guide: string
}

/** 演练脚本的输入 */
export interface TourScriptOptionsType {
    tour: TourType
    /** 本工种用得到的依赖，或依赖清单不能用的原因 */
    deps: DepsParseType
    /** 工种中文名 */
    roleTitle: string
    /** 生效工作流的来源，如「内置 · 前端」 */
    workflowLabel: string
    /** 走流程的环节 */
    stepList: TourStepType[]
    /** 通用资料目录，取不到为 '' */
    sharedDir: string
    /** 项目资料目录，项目内模式为 '' */
    dataDir: string
    /** 本项目概况（project 工具 get 的内容） */
    overview: string
}

/** 体检结果的整理：收下的、不认识的 id、值不对的 id */
export interface CheckResultsType {
    results: Record<string, CheckResultType>
    unknownList: string[]
    invalidList: string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/** 读成 JSON 值，不是合法 JSON 为 undefined */
const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text) as unknown
    } catch {
        return undefined
    }
}

/** 文字数组：不是数组为空，去掉不是文字或只有空白的项 */
const stringList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((i): i is string => typeof i === 'string' && i.trim() !== '').map(i => i.trim()) : []

/** 非空文字，去掉首尾空白；不是文字或只有空白为 undefined */
const optionalText = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined)

/**
 * 拼进脚本的一段文字：控制字符换成空格，保证一项一行。
 * @param text 原文
 * @returns 一行文字
 */
export const oneLine = (text: string): string => text.replace(CONTROL_GLOBAL, ' ').trim()

/**
 * 两份文件共用的外壳校验：读不到、不是合法 JSON、不是对象、版本比本 mod 新都给原因；version 没写按 1。
 * @param text 文件内容
 * @returns 对象，或原因
 */
const guideRecord = (text: string): { record: Record<string, unknown> } | { reason: string } => {
    if (text.trim() === '') return { reason: '读不到' }

    const value = parseJson(text)
    if (value === undefined) return { reason: '不是合法 JSON' }
    if (!isRecord(value)) return { reason: '要是一个 JSON 对象' }

    const version = value.version ?? GUIDE_VERSION
    if (typeof version === 'number' && version > GUIDE_VERSION) return { reason: `version ${version} 比本 mod 认识的新（${GUIDE_VERSION}），先更新 mod` }
    if (version !== GUIDE_VERSION) return { reason: 'version 要是 1' }

    return { record: value }
}

/** 一项依赖的宽松校验：id、kind、title、use、detect 必须合格；install、account 不是文字就丢掉；roles 没写为全部工种、认不出的工种丢掉 */
const toDep = (raw: unknown): DepType | undefined => {
    if (!isRecord(raw)) return undefined

    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    const kind = DEP_KINDS.find(i => i === raw.kind)
    const title = optionalText(raw.title)
    const use = optionalText(raw.use)
    const detect = optionalText(raw.detect)
    if (!DEP_ID_PATTERN.test(id) || kind === undefined || title === undefined || use === undefined || detect === undefined) return undefined

    const roles: WorkRole[] = Array.isArray(raw.roles) ? WORK_ROLES.filter(role => (raw.roles as unknown[]).includes(role)) : [...WORK_ROLES]
    const install = optionalText(raw.install)
    const account = optionalText(raw.account)
    return { id, kind, title, use, detect, ...(install === undefined ? {} : { install }), ...(account === undefined ? {} : { account }), roles }
}

/**
 * 读依赖清单 guide/deps.json（宽松）：外壳不对（读不到、不是 JSON 对象、版本更新、没有 items 数组）整份不能用；
 * 格式不对的项与重复的 id 跳过并计数，其余照用。
 * @param text 文件内容，读不到为 ''
 * @returns 依赖与跳过数，或不能用的原因
 */
export const parseDeps = (text: string): DepsParseType => {
    const shell = guideRecord(text)
    if ('reason' in shell) return shell

    const items = shell.record.items
    if (!Array.isArray(items)) return { reason: '缺少 items 数组' }

    const depList: DepType[] = []
    for (const item of items) {
        const dep = toDep(item)
        if (dep !== undefined && !depList.some(i => i.id === dep.id)) depList.push(dep)
    }

    return { depList, skippedCount: items.length - depList.length }
}

/**
 * 读演练脚本 guide/tour.json（宽松）：外壳不对（读不到、不是 JSON 对象、版本更新）整份不能用；
 * rules、check、features、finish 不是数组当空、去掉不是文字的项，steps 只收文字值，fallback 没写用代码里的一句。
 * @param text 文件内容，读不到为 ''
 * @returns 脚本，或不能用的原因
 */
export const parseTour = (text: string): TourParseType => {
    const shell = guideRecord(text)
    if ('reason' in shell) return shell

    const record = shell.record
    const steps = isRecord(record.steps)
        ? Object.fromEntries(Object.entries(record.steps).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== ''))
        : {}
    return {
        tour: {
            rules: stringList(record.rules),
            check: stringList(record.check),
            steps,
            fallback: optionalText(record.fallback) ?? DEFAULT_STEP_GUIDE,
            features: stringList(record.features),
            finish: stringList(record.finish)
        }
    }
}

/**
 * 本工种用得到的依赖，顺序照清单。
 * @param depList 依赖清单
 * @param role 工种
 * @returns 依赖
 */
export const depsOfRole = (depList: readonly DepType[], role: WorkRole): DepType[] => depList.filter(i => i.roles.includes(role))

/**
 * 一个环节演练时验证什么：先查「<工作流 id>:<步骤键>」，再查「<步骤键>」，都没有用 fallback。
 * @param tour 演练脚本
 * @param workflowId 工作流 id（内置为工种 id）
 * @param key 步骤键
 * @returns 说法
 */
export const stepGuideOf = (tour: TourType, workflowId: string, key: string): string =>
    tour.steps[`${workflowId}:${key}`] ?? tour.steps[key] ?? tour.fallback

/**
 * 把工作流的步骤配上演练脚本：每步带标题、真实使用时做什么（what）与演练时验证什么。
 * @param tour 演练脚本
 * @param workflowId 工作流 id
 * @param steps 工作流的 story 步骤
 * @returns 演练的环节
 */
export const tourStepsOf = (tour: TourType, workflowId: string, steps: readonly WorkflowStepType[]): TourStepType[] =>
    steps.map(step => ({ key: step.key, title: step.title, what: step.what ?? '', guide: stepGuideOf(tour, workflowId, step.key) }))

/** 编号列表，每项一行 */
const numbered = (list: readonly string[]): string[] => list.map((item, index) => `${index + 1}. ${oneLine(item)}`)

/** 依赖清单里的一项，一行 */
const depLine = (dep: DepType): string => {
    const partList = [
        `- ${dep.id}（${KIND_LABEL[dep.kind]}）${oneLine(dep.title)}：${oneLine(dep.use)}`,
        `检测：${oneLine(dep.detect)}`,
        `安装：${dep.install === undefined ? '清单里没写' : oneLine(dep.install)}`,
        ...(dep.account === undefined ? [] : [`账号：${oneLine(dep.account)}`])
    ]
    return partList.join('；')
}

/** 第一部分体检里的依赖清单 */
const depSection = (deps: DepsParseType, roleTitle: string): string[] => {
    if ('reason' in deps) return [`依赖清单 ${DEPS_FILE} 不能用（${deps.reason}），这次跳过体检，不调 check，直接进入第二部分`]

    const skipped = deps.skippedCount ? `（清单里有 ${deps.skippedCount} 项格式不对，已跳过）` : ''
    if (!deps.depList.length) return [`依赖清单里没有${roleTitle}用得到的项${skipped}，这次跳过体检，不调 check`]

    return [`依赖清单（${roleTitle}用得到的 ${deps.depList.length} 项）${skipped}：`, ...deps.depList.map(depLine)]
}

/** 第二部分里的一个环节，三行：序号、键与标题；真实使用；演练 */
const stepLines = (step: TourStepType, index: number): string[] => [
    `${index + 1}. ${step.key} ${oneLine(step.title)}`,
    ...(step.what === '' ? [] : [`   真实使用：${oneLine(step.what)}`]),
    `   演练：${oneLine(step.guide)}`
]

/**
 * start 返回给 AI 的演练脚本，顺序：开头几行（演示条目与进度怎么报、演练工具怎么调、资料记在哪、工种与工作流）→ 总规则 →
 * 第一部分体检（做法与本工种依赖清单）→ 第二部分走流程（每个环节的序号、步骤键、标题、真实使用时做什么、演练时验证什么）→
 * 第三部分功能点 → 收尾 → 本项目概况。
 * @param options 脚本、依赖、工种、工作流、环节、两处资料目录与项目概况
 * @returns 脚本全文
 */
export const tourScript = ({ tour, deps, roleTitle, workflowLabel, stepList, sharedDir, dataDir, overview }: TourScriptOptionsType): string => {
    const lastKey = stepList.at(-1)?.key ?? ''
    const shared = sharedDir === '' ? '取不到用户目录，没有通用资料目录' : `各项目通用的记进通用资料目录 ${sharedDir}`
    const data = dataDir === '' ? '本项目是项目内模式，只属于本项目的按项目内文档约定的位置记' : `只属于本项目的记进项目资料目录 ${dataDir}`
    const headList = [
        '演练脚本：照着走，一次一个环节，每个环节说完、验证完再往下。',
        `演示条目：ID ${DEMO_ID}，工作面板进行中区的「${DEMO_TITLE}」，已记到本会话。进入一个环节时调 ${PROGRESS_TOOL_NAME}（id 传 ${DEMO_ID}，step 传步骤键，status 传 doing），` +
            `最后一个环节（${lastKey}）做完传 status=done（工具还没加载时先用 ToolSearch 查 select:${PROGRESS_TOOL_NAME}）。`,
        `演练工具就是 ${GUIDE_TOOL_NAME}：体检做完传 action=check 与 results（键为依赖清单里的 id，值为 ok、missing 或 skipped）；收尾传 action=finish，可带 summary（一两句小结）。`,
        `资料目录（resources.md 记地址、命令等，secrets.env 记账号）：${shared}；${data}；两处都有的以项目的为准。`,
        `工种：${roleTitle}；工作流：${workflowLabel}（走流程共 ${stepList.length} 个环节）。`
    ]
    const sectionList = [
        headList,
        ['总规则', ...numbered(tour.rules)],
        ['第一部分 体检', ...numbered(tour.check), ...depSection(deps, roleTitle)],
        [`第二部分 走流程（共 ${stepList.length} 个环节，按顺序）`, ...stepList.flatMap(stepLines)],
        ['第三部分 功能点（走完流程后逐条指给用户看）', ...numbered(tour.features)],
        ['收尾', ...numbered(tour.finish)],
        ['本项目概况', overview]
    ]

    return sectionList.map(lineList => lineList.join('\n')).join('\n\n')
}

/**
 * 校验 mcp__xiaoxiaoli__guide 的参数：action 只能是 start、check、finish；check 要 results 对象（也认它的 JSON 文字）；
 * finish 的 summary 可选，要是文字。
 * @param raw 工具参数
 * @returns 参数，或不合格的原因
 */
export const toGuideInput = (raw: Record<string, unknown>): GuideInputType | string => {
    if (raw.action === 'start') return { action: 'start' }
    if (raw.action === 'finish') {
        if (raw.summary !== undefined && typeof raw.summary !== 'string') return 'summary 要是文字'
        return typeof raw.summary === 'string' ? { action: 'finish', summary: raw.summary } : { action: 'finish' }
    }
    if (raw.action !== 'check') return 'action 只能是 start、check、finish'

    const results = typeof raw.results === 'string' ? parseJson(raw.results) : raw.results
    if (!isRecord(results)) return 'check 要给 results 对象，如 { "tapd": "ok", "figma": "missing" }'

    return { action: 'check', results }
}

/**
 * 整理体检结果：键要是依赖清单里的 id（不认识的丢掉），值只能是 ok、missing、skipped（不对的丢掉）。
 * @param results 原始结果
 * @param depList 依赖清单（全部工种的）
 * @returns 收下的结果与丢掉的 id
 */
export const toCheckResults = (results: Record<string, unknown>, depList: readonly DepType[]): CheckResultsType => {
    const kept: Record<string, CheckResultType> = {}
    const unknownList: string[] = []
    const invalidList: string[] = []
    for (const [id, value] of Object.entries(results)) {
        const result = CHECK_RESULTS.find(i => i === value)
        if (!depList.some(i => i.id === id)) unknownList.push(id)
        else if (result === undefined) invalidList.push(id)
        else kept[id] = result
    }

    return { results: kept, unknownList, invalidList }
}

/**
 * 读体检结果 env.json（宽松）：读不懂、版本不对都当作没体检过；版本比本 mod 新时 isNewer 为 true；results 里值不对的项不收。
 * @param text 文件内容，读不到为 ''
 * @returns 体检结果
 */
export const parseEnv = (text: string): EnvRecordType => {
    const empty: EnvRecordType = { checkedAt: '', results: {}, isNewer: false }
    const value = parseJson(text)
    if (!isRecord(value)) return empty
    if (typeof value.version === 'number' && value.version > ENV_VERSION) return { ...empty, isNewer: true }
    if (value.version !== ENV_VERSION || typeof value.checkedAt !== 'string') return empty

    const results = isRecord(value.results)
        ? Object.fromEntries(Object.entries(value.results).filter((entry): entry is [string, CheckResultType] => CHECK_RESULTS.some(i => i === entry[1])))
        : {}
    return { checkedAt: value.checkedAt, results, isNewer: false }
}

/**
 * 写回 env.json 的全文：版本写 1，checkedAt 与 results 换成这次的（整份换掉，上次有、这次没查的项不留），别的字段原样保留。
 * @param oldText 原文件全文，没有为 ''
 * @param next 这次的体检时间与结果
 * @returns 新全文，末尾换行
 */
export const envText = (oldText: string, next: { checkedAt: string; results: Record<string, CheckResultType> }): string => {
    const old = parseJson(oldText)
    const rest = isRecord(old) ? Object.fromEntries(Object.entries(old).filter(([key]) => !['version', 'checkedAt', 'results'].includes(key))) : {}
    return `${JSON.stringify({ version: ENV_VERSION, ...rest, checkedAt: next.checkedAt, results: next.results }, null, 2)}\n`
}

/**
 * 按当前工种算出的体检结果：只算本工种用得到的依赖，缺的与跳过的写依赖名；依赖清单不能用时按结果里的 id 算。没体检过为 null。
 * @param depList 本工种用得到的依赖；依赖清单不能用时为 null
 * @param record 体检结果
 * @returns 面板与概况用的结果
 */
export const envStateOf = (depList: readonly DepType[] | null, record: EnvRecordType): EnvStateType | null => {
    if (record.checkedAt === '') return null

    const pick = (result: CheckResultType): string[] =>
        depList === null
            ? Object.entries(record.results).filter(entry => entry[1] === result).map(entry => entry[0])
            : depList.filter(i => record.results[i.id] === result).map(i => i.title)
    return { checkedAt: record.checkedAt, missingList: pick('missing'), skippedList: pick('skipped') }
}

/**
 * check 成功后回给 AI 的一句：写到哪、就绪几项、缺哪些、跳过哪些，丢掉了哪些 id。
 * @param path env.json 的位置
 * @param checked 整理后的结果
 * @param depList 依赖清单（取依赖名）
 * @returns 一句话
 */
export const checkReplyText = (path: string, checked: CheckResultsType, depList: readonly DepType[]): string => {
    const titlesOf = (result: CheckResultType): string[] =>
        Object.entries(checked.results)
            .filter(entry => entry[1] === result)
            .map(([id]) => depList.find(i => i.id === id)?.title ?? id)
    const missing = titlesOf('missing')
    const skipped = titlesOf('skipped')
    const partList = [
        `就绪 ${titlesOf('ok').length} 项`,
        missing.length ? `缺 ${missing.length} 项（${missing.join('、')}）` : '没有缺的',
        ...(skipped.length ? [`跳过 ${skipped.length} 项（${skipped.join('、')}）`] : []),
        ...(checked.unknownList.length ? [`不认识的 id 已丢掉：${checked.unknownList.join('、')}`] : []),
        ...(checked.invalidList.length ? [`值不对的已丢掉（只能是 ok、missing、skipped）：${checked.invalidList.join('、')}`] : [])
    ]
    return `已记下体检结果（写入 ${path}）：${partList.join('；')}`
}

/** 演示条目的字段 */
export interface DemoTaskOptionsType {
    /** 按哪套步骤建：当前生效工作流的 story 组，与旧的前端步骤相同时不传（建成旧样式） */
    flow?: FlowType
    updatedAt: string
    /** 本会话 ID，取不到为 '' */
    sessionId: string
}

/**
 * 演示条目：ID demo、标题「【演练】熟悉工作台」、需求种类，步骤取当前生效工作流的 story 组且全部未开始（演练先体检，
 * 走到哪个环节由 AI 上报），记到本会话；不记 TAPD 项目 ID、分支与 worktree。
 * @param options 步骤、更新时间、会话 ID
 * @returns 条目
 */
export const newDemoTask = ({ flow, updatedAt, sessionId }: DemoTaskOptionsType): ProgressTaskType => {
    const task: ProgressTaskType = { id: DEMO_ID, kind: 'story', title: DEMO_TITLE, steps: flowSteps('story', flow), waiting: null, updatedAt }
    if (flow) task.workflow = flow.id
    if (sessionId) task.sessionId = sessionId

    return task
}
