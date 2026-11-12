/**
 * @description 工作台本地文件：config.json 与 state.json 的路径、解析与写回，任务步骤的推进规则、面板开关取值、状态行文案；
 * 面板与主会话（经 mcp__xiaoxiaoli__progress）共用这一套读写。条目的步骤有两种：旧样式（前端需求 11 步、缺陷 6 步，
 * 按模板补齐）与按工作流建的（有 workflow 字段，步骤自成一套、每步记 slow），步骤键都按条目自己的核
 * @author xiao li
 * @createDate 2026-10-21 17:50
 */
import type {
    FlowType,
    ModConfigType,
    PaneWant,
    ProgressKind,
    ProgressStepType,
    ProgressTaskType,
    ProgressType,
    StepKey,
    StepModuleType,
    StepStatus,
    StepTaskType,
    WaitingKind,
    WorkbenchConfigType
} from '../types'
import { DEFAULT_NAME } from './profile'

/** 项目配置的默认位置，相对项目目录 */
export const CONFIG_PATH = 'docs/xiaoli/local/workbench/config.json'
/** 状态文件的默认位置，相对项目目录 */
export const STATE_PATH = 'docs/xiaoli/local/workbench/state.json'
/** mod 自己的配置，相对 mod 目录 */
export const MOD_CONFIG_FILE = 'config.json'
/** state.json 的结构版本：2 为带 steps，1 或没写为旧结构（只有 step 与 stepName） */
export const STATE_VERSION = 2
export const DEFAULT_REFRESH_MINUTES = 10
export const DEFAULT_BRANCH_TEMPLATE = 'feat/{id}'
export const DEFAULT_BUG_BRANCH_TEMPLATE = 'fix/{id}'
export const DEFAULT_BRANCH_BASE = 'origin/master'
export const WAITING_TEXT: Record<WaitingKind, string> = {
    align: '等你：对齐稿',
    review: '等你：看自测',
    tapd: '等你：批准改 TAPD'
}
export const WAITING_KINDS = ['align', 'review', 'tapd'] as const satisfies readonly WaitingKind[]
export const STEP_STATUSES = ['done', 'doing', 'todo'] as const satisfies readonly StepStatus[]
/** 需求工作流 ①–⑪，顺序与名字取 docs/xiaoli/workflow.md 的环节总表 */
export const STORY_STEPS = [
    { key: 'fetch', title: '拉取 TAPD' },
    { key: 'sort', title: '排序' },
    { key: 'branch', title: '建分支' },
    { key: 'read', title: '读需求与语雀' },
    { key: 'align', title: '对齐需求' },
    { key: 'develop', title: '开发' },
    { key: 'unit', title: '单测' },
    { key: 'selftest', title: '浏览器自测' },
    { key: 'docs', title: '写文档' },
    { key: 'tapd', title: '更新 TAPD' },
    { key: 'release', title: '发版' }
] as const satisfies readonly { key: StepKey; title: string }[]
/** 缺陷 6 步，和需求的 11 步并列 */
export const BUG_STEPS = [
    { key: 'screenshot', title: '读截图' },
    { key: 'env', title: '核环境版本' },
    { key: 'reproduce', title: '复现' },
    { key: 'diagnose', title: '定位判定' },
    { key: 'fix', title: '修复或拒绝' },
    { key: 'verify', title: '验证' }
] as const satisfies readonly { key: StepKey; title: string }[]
/** 每种条目的步骤模板 */
export const STEP_TEMPLATE: Record<ProgressKind, readonly { key: StepKey; title: string }[]> = { story: STORY_STEPS, bug: BUG_STEPS }
export const PROGRESS_KINDS = ['story', 'bug'] as const satisfies readonly ProgressKind[]
/** 两种模板的全部步骤键（旧样式条目用） */
export const STEP_KEYS: readonly StepKey[] = [...STORY_STEPS, ...BUG_STEPS].map(i => i.key)
/** 旧样式条目的慢环节：可以挂 TAPD 任务或自定义阶段与模块，面板在进行中时展开；其余为快环节，只显一行 */
export const SLOW_STEP_KEYS: readonly StepKey[] = ['read', 'align', 'develop', 'unit', 'selftest']
/** 步骤键的写法：小写字母开头，只含小写字母、数字与 -（工作流定义与进度工具共用） */
export const STEP_KEY_PATTERN = /^[a-z][a-z0-9-]*$/
/** 步骤键最长几个字符 */
export const STEP_KEY_LIMIT = 32
/** 需求工作流一共几步，旧结构的 step 按这个校验 */
export const STEP_COUNT = STORY_STEPS.length
/**
 * 演练用的演示条目的 ID：保留值，不是纯数字，和 TAPD 短 ID 撞不上。进度工具只放宽这一个值；
 * 它不算开工分流的「手上有活」、不和待办对应、不能重新开工，由 mcp__xiaoxiaoli__guide 的 start 建、finish 移除
 */
export const DEMO_ID = 'demo'
/** 分支名与分支起点只许这些字符，免得拼进命令时被 shell 解释 */
const REF_PATTERN = /^[\w./-]+$/

/**
 * 是不是演练的演示条目。
 * @param task 条目
 * @returns 是否演示条目
 */
export const isDemoTask = (task: Pick<ProgressTaskType, 'id'>): boolean => task.id === DEMO_ID

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/** 可选字符串字段：没写为 undefined，写了不是字符串为 null（整条不合格） */
const optionalString = (value: unknown): string | undefined | null => {
    if (value === undefined) return undefined

    return typeof value === 'string' ? value : null
}

/**
 * 拼出文件的完整路径：绝对路径原样用，相对路径接在工作目录后面。
 * @param workDir 会话工作目录
 * @param path 文件路径
 * @returns 完整路径
 */
export const joinPath = (workDir: string, path: string): string => {
    if (/^([a-zA-Z]:[\\/]|[\\/])/.test(path)) return path

    return `${workDir.replace(/[\\/]+$/, '')}/${path.replace(/^\.?[\\/]+/, '')}`
}

/**
 * 路径的规范写法：反斜杠换成正斜杠、去掉末尾斜杠、转小写（Windows 盘符与目录名不分大小写）。
 * @param path 路径
 * @returns 规范写法
 */
export const normalizePath = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/**
 * 两个路径是否指同一目录：分隔符、末尾斜杠、大小写都不算差别。
 * @param a 路径
 * @param b 路径
 * @returns 是否相同
 */
export const samePath = (a: string, b: string): boolean => normalizePath(a) === normalizePath(b)

/**
 * 是否可作分支名或分支起点：只许字母、数字与 . _ / -，免得拼进命令时被 shell 解释。
 * @param text 分支名
 * @returns 是否合格
 */
export const isRefName = (text: string): boolean => REF_PATTERN.test(text)

/**
 * 是否可作分支名模板：要含 {id}，换掉后只剩分支名允许的字符。
 * @param raw 模板原值
 * @returns 是否合格
 */
export const isBranchTemplate = (raw: unknown): raw is string =>
    typeof raw === 'string' && raw.includes('{id}') && REF_PATTERN.test(raw.replace(/\{id\}/g, '0'))

/** 分支名模板：不合格用默认 */
const toTemplate = (raw: unknown, fallback: string): string => (isBranchTemplate(raw) ? raw : fallback)

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
 * 解析项目的 config.json；必填字段缺失或类型不对返回 null，面板按「没配 TAPD」处理；可选字段不合格时不写或用默认值。
 * @param text 文件内容
 * @returns 配置
 */
export const parseConfig = (text: string): WorkbenchConfigType | null => {
    const value = parseRecord(text)
    if (value === null) return null

    const workspaceId = typeof value.tapdWorkspaceId === 'number' ? String(value.tapdWorkspaceId) : value.tapdWorkspaceId
    const minutes = value.refreshMinutes
    const base = value.branchBase
    if (typeof value.projectName !== 'string' || typeof workspaceId !== 'string' || !/^\d+$/.test(workspaceId)) return null

    const config: WorkbenchConfigType = {
        projectName: value.projectName,
        tapdWorkspaceId: workspaceId,
        refreshMinutes: typeof minutes === 'number' && minutes >= 1 ? minutes : DEFAULT_REFRESH_MINUTES,
        branchTemplate: toTemplate(value.branchTemplate, DEFAULT_BRANCH_TEMPLATE),
        bugBranchTemplate: toTemplate(value.bugBranchTemplate, DEFAULT_BUG_BRANCH_TEMPLATE),
        branchBase: typeof base === 'string' && REF_PATTERN.test(base) ? base : DEFAULT_BRANCH_BASE
    }
    if (typeof value.statePath === 'string' && value.statePath !== '') config.statePath = value.statePath

    return config
}

/**
 * 解析 mod 目录下的 config.json：两个路径缺了或不合格用默认位置，文件读不到也用默认。
 * @param text 文件内容，读不到为 ''
 * @returns mod 配置
 */
export const parseModConfig = (text: string): ModConfigType => {
    const value = parseRecord(text)
    const pick = (raw: unknown, fallback: string) => (typeof raw === 'string' && raw !== '' ? raw : fallback)

    return { configPath: pick(value?.configPath, CONFIG_PATH), statePath: pick(value?.statePath, STATE_PATH) }
}

/**
 * 路径的末段，用作项目名。
 * @param path 目录
 * @returns 末段，空路径为 ''
 */
export const baseName = (path: string): string => path.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) ?? ''

/** 步骤键的工作流名字 */
const stepTitle = (key: StepKey): string => [...STORY_STEPS, ...BUG_STEPS].find(i => i.key === key)?.title ?? key

/** 按种类的模板，步骤全是未开始 */
const todoSteps = (kind: ProgressKind): ProgressStepType[] => STEP_TEMPLATE[kind].map(i => ({ key: i.key, title: i.title, status: 'todo' }))

/**
 * 旧结构推导 steps：小于 step 的为已完成，等于的为进行中（stepName 作当前子项），其余未开始。
 * @param step 当前第几步，1 到 11
 * @param stepName 旧结构的步骤说明
 * @returns 11 步
 */
export const legacySteps = (step: number, stepName: string): ProgressStepType[] =>
    STORY_STEPS.map((i, index): ProgressStepType => {
        if (index + 1 < step) return { key: i.key, title: i.title, status: 'done' }
        if (index + 1 > step) return { key: i.key, title: i.title, status: 'todo' }

        return { key: i.key, title: i.title, status: 'doing', ...(stepName ? { detail: stepName } : {}) }
    })

/** 非负整数 */
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

/** 一个模块的字段校验：done 不超过 total，total 至少 1，不合格返回 null */
const toModule = (raw: unknown): StepModuleType | null => {
    if (!isRecord(raw) || typeof raw.name !== 'string' || raw.name === '') return null
    if (!isCount(raw.done) || !isCount(raw.total) || raw.total < 1 || raw.done > raw.total) return null

    return { name: raw.name, done: raw.done, total: raw.total }
}

/** 列表里每一项都要合格，有一项不合格整个返回 null */
const allValid = <T>(rawList: unknown[], toItem: (raw: unknown) => T | null): T[] | null => {
    const itemList = rawList.map(toItem)
    const validList = itemList.filter((i): i is T => i !== null)

    return validList.length === itemList.length ? validList : null
}

/** 步骤下一条 TAPD 任务或自定义阶段的字段校验，不合格返回 null */
const toStepTask = (raw: unknown): StepTaskType | null => {
    if (!isRecord(raw)) return null

    const id = typeof raw.id === 'number' ? String(raw.id) : raw.id
    const status = STEP_STATUSES.find(i => i === raw.status)
    const detail = optionalString(raw.detail)
    const modules = Array.isArray(raw.modules) ? allValid(raw.modules, toModule) : raw.modules === undefined ? [] : null
    if (typeof id !== 'string' || id === '' || typeof raw.title !== 'string' || status === undefined) return null
    if (detail === null || modules === null) return null

    const task: StepTaskType = { id, title: raw.title, status }
    if (detail) task.detail = detail
    if (modules.length) task.modules = modules

    return task
}

/**
 * 是否可作步骤键：小写字母开头，只含小写字母、数字与 -，不超过 32 个字符。
 * @param value 原值
 * @returns 是否合格
 */
export const isStepKey = (value: unknown): value is StepKey =>
    typeof value === 'string' && value.length <= STEP_KEY_LIMIT && STEP_KEY_PATTERN.test(value)

/**
 * 这一步是不是慢环节（可挂子项、进行中时面板展开）：条目记了 slow 就按它，旧条目没有按前端的慢环节。
 * @param step 步骤
 * @returns 是否慢环节
 */
export const isSlowStep = (step: ProgressStepType): boolean => step.slow ?? SLOW_STEP_KEYS.includes(step.key)

/** 一步的字段校验，不合格返回 null；slow 写了就要是 true 或 false */
const toStep = (raw: unknown): ProgressStepType | null => {
    if (!isRecord(raw)) return null

    const key = isStepKey(raw.key) ? raw.key : undefined
    const status = STEP_STATUSES.find(i => i === raw.status)
    const title = optionalString(raw.title)
    const detail = optionalString(raw.detail)
    const tasks = Array.isArray(raw.tasks) ? allValid(raw.tasks, toStepTask) : raw.tasks === undefined ? [] : null
    if (key === undefined || status === undefined || title === null || detail === null || tasks === null) return null
    if (raw.confirm !== undefined && typeof raw.confirm !== 'boolean') return null
    if (raw.slow !== undefined && typeof raw.slow !== 'boolean') return null

    const step: ProgressStepType = { key, title: title || stepTitle(key), status }
    if (detail) step.detail = detail
    if (raw.confirm === true) step.confirm = true
    if (tasks.length) step.tasks = tasks
    if (typeof raw.slow === 'boolean') step.slow = raw.slow

    return step
}

/**
 * 新结构的 steps，每一项都要合格、键不重复。按工作流建的条目（有 workflow 字段）步骤自成一套：至少一步，按文件里的顺序，
 * 每步都记上 slow（文件里没写为 false）；旧样式条目的键要属于这种条目的前端模板，缺的步骤补成未开始，按模板排好。
 * @param rawList state.json 里的 steps
 * @param kind 条目种类
 * @param isOwnFlow 是否按工作流建的条目
 * @returns 步骤；有不合格项返回 null
 */
const toSteps = (rawList: unknown[], kind: ProgressKind, isOwnFlow: boolean): ProgressStepType[] | null => {
    const template = STEP_TEMPLATE[kind]
    const validList = allValid(rawList, toStep)
    if (validList === null || new Set(validList.map(i => i.key)).size !== validList.length) return null
    if (isOwnFlow) return validList.length ? validList.map(step => ({ ...step, slow: step.slow === true })) : null
    if (!validList.every(step => template.some(i => i.key === step.key))) return null

    return template.map(i => validList.find(step => step.key === i.key) ?? { key: i.key, title: i.title, status: 'todo' })
}

/** 旧结构的 step 与 stepName 校验后推导 steps，不合格返回 null */
const toLegacy = (raw: Record<string, unknown>): ProgressStepType[] | null => {
    const step = raw.step
    if (typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > STEP_COUNT) return null
    if (typeof raw.stepName !== 'string') return null

    return legacySteps(step, raw.stepName)
}

/** 一个条目的字段校验，不合格返回 null；没写 kind 为需求，没有 steps 时按旧结构的 step 与 stepName 推导 */
const toTask = (raw: unknown): ProgressTaskType | null => {
    if (!isRecord(raw)) return null

    const id = typeof raw.id === 'number' ? String(raw.id) : raw.id
    const kind = raw.kind === undefined ? 'story' : PROGRESS_KINDS.find(i => i === raw.kind)
    const waiting = raw.waiting ?? null
    const extraList = [raw.branch, raw.sessionId, raw.worktree, raw.note].map(optionalString)
    /* 所属 TAPD 项目 ID：面板开工时写的可选字段，数字也接受 */
    const workspaceId = optionalString(typeof raw.workspaceId === 'number' ? String(raw.workspaceId) : raw.workspaceId)
    /* 按哪份工作流建的：有它的条目步骤自成一套 */
    const workflow = optionalString(raw.workflow)
    if (typeof id !== 'string' || id === '' || typeof raw.title !== 'string' || typeof raw.updatedAt !== 'string') return null
    if (waiting !== null && !WAITING_KINDS.some(i => i === waiting)) return null
    if (extraList.some(i => i === null) || workspaceId === null || workflow === null || kind === undefined) return null

    const steps = Array.isArray(raw.steps) ? toSteps(raw.steps, kind, Boolean(workflow)) : kind === 'story' && !workflow ? toLegacy(raw) : null
    if (steps === null) return null

    const [branch, sessionId, worktree, note] = extraList
    const task: ProgressTaskType = {
        id,
        kind,
        title: raw.title,
        steps,
        waiting: WAITING_KINDS.find(i => i === waiting) ?? null,
        updatedAt: raw.updatedAt
    }
    if (workflow) task.workflow = workflow
    if (workspaceId) task.workspaceId = workspaceId
    if (branch) task.branch = branch
    if (sessionId) task.sessionId = sessionId
    if (worktree) task.worktree = worktree
    if (note) task.note = note

    return task
}

/**
 * 解析 state.json：新旧结构都认，不合格的任务跳过，并在 error 里说明跳过了几条。
 * @param text 文件内容
 * @returns 进行中任务与错误说明
 */
export const parseProgress = (text: string): ProgressType => {
    let value: unknown
    try {
        value = JSON.parse(text)
    } catch {
        return { taskList: [], error: 'state.json 不是合法 JSON' }
    }
    if (!isRecord(value) || !Array.isArray(value.tasks)) return { taskList: [], error: 'state.json 缺少 tasks 数组' }
    if (typeof value.version === 'number' && value.version > STATE_VERSION) {
        return { taskList: [], error: `state.json 版本 ${value.version} 比小小黎新，先更新 mod` }
    }

    const rawList: unknown[] = value.tasks
    const taskList = rawList.map(toTask).filter((i): i is ProgressTaskType => i !== null)
    const skipped = rawList.length - taskList.length

    return { taskList, error: skipped ? `state.json 有 ${skipped} 条任务格式不对，已跳过` : '' }
}

/** 一个对象写成一行 JSON，值为 undefined 的键不写 */
const inlineJson = (value: Record<string, unknown>): string => {
    const fieldList = Object.entries(value)
        .filter(entry => entry[1] !== undefined)
        .map(([key, item]) => `${JSON.stringify(key)}: ${JSON.stringify(item)}`)

    return `{ ${fieldList.join(', ')} }`
}

/** 一步写回的文字：没挂任务的一行，挂了任务的每条任务再占一行；slow 只写 true（按工作流建的条目没写就是 false） */
const stepText = (step: ProgressStepType): string => {
    const slow = step.slow === true ? true : undefined
    const head = inlineJson({ key: step.key, title: step.title, slow, status: step.status, detail: step.detail, confirm: step.confirm })
    if (step.tasks === undefined) return `        ${head}`

    const taskLines = step.tasks.map(
        i => `          ${inlineJson({ id: i.id, title: i.title, status: i.status, detail: i.detail, modules: i.modules })}`
    )
    return [`        ${head.replace(/ \}$/, ', "tasks": [')}`, taskLines.join(',\n'), '        ] }'].join('\n')
}

/** 一条需求写回的文字：字段顺序固定，可选字段没有就不写，每步一行 */
const taskText = (task: ProgressTaskType): string => {
    const fieldLine = (key: string, value: unknown) => `      ${JSON.stringify(key)}: ${JSON.stringify(value)}`
    const stepLines = task.steps.map(stepText)
    const tailList: [string, unknown][] = [
        ['waiting', task.waiting],
        ['branch', task.branch],
        ['sessionId', task.sessionId],
        ['worktree', task.worktree],
        ['note', task.note],
        ['updatedAt', task.updatedAt]
    ]
    const lineList = [
        fieldLine('id', task.id),
        ...(task.workspaceId === undefined ? [] : [fieldLine('workspaceId', task.workspaceId)]),
        fieldLine('kind', task.kind),
        ...(task.workflow === undefined ? [] : [fieldLine('workflow', task.workflow)]),
        fieldLine('title', task.title),
        ['      "steps": [', stepLines.join(',\n'), '      ]'].join('\n'),
        ...tailList.filter(i => i[1] !== undefined).map(([key, value]) => fieldLine(key, value))
    ]

    return ['    {', lineList.join(',\n'), '    }'].join('\n')
}

/**
 * 写回 state.json 的全文：version 2，每步一行，便于人看和比对。
 * @param taskList 任务
 * @returns 文件内容
 */
export const stringifyState = (taskList: readonly ProgressTaskType[]): string => {
    const tasks = taskList.length ? ['  "tasks": [', taskList.map(taskText).join(',\n'), '  ]'].join('\n') : '  "tasks": []'

    return ['{', `  "version": ${STATE_VERSION},`, tasks, '}', ''].join('\n')
}

/** 推进一步要改的内容 */
export interface StepChangeType {
    key: StepKey
    /** 不传只改 detail 与 confirm */
    status?: StepStatus
    /** 当前子项；'' 清掉，不传保留 */
    detail?: string
    /** 结论要用户确认；不传保留 */
    confirm?: boolean
    updatedAt: string
}

/** 一步换状态：detail 传了用传的、'' 清掉、没传保留；confirm 同理 */
const withStatus = (step: ProgressStepType, status: StepStatus, change: { detail?: string; confirm?: boolean } = {}): ProgressStepType => {
    const next: ProgressStepType = { key: step.key, title: step.title, status }
    const detail = change.detail ?? step.detail
    if (detail) next.detail = detail
    if (change.confirm ?? step.confirm) next.confirm = true
    if (step.tasks) next.tasks = step.tasks
    if (step.slow !== undefined) next.slow = step.slow

    return next
}

/**
 * 推进条目的一步，doing 与 done 都按线性推进：它之前的步骤全记完成。doing 时它之后的回到未开始
 * （返工时原先已完成的后续步骤清掉 detail 与待确认），done 时它之后的不动；todo 只改这一步；不传 status 只改 detail 与 confirm。
 * @param task 条目
 * @param change 哪一步、改成什么
 * @returns 新条目；步骤不在这种条目的模板里时原样返回
 */
export const setStep = (task: ProgressTaskType, change: StepChangeType): ProgressTaskType => {
    const index = task.steps.findIndex(i => i.key === change.key)
    if (index < 0) return task

    const steps = task.steps.map((step, i) => {
        if (i === index) return withStatus(step, change.status ?? step.status, change)
        if (change.status !== 'doing' && change.status !== 'done') return step
        if (i < index) return step.status === 'done' ? step : withStatus(step, 'done')
        if (change.status === 'done' || step.status === 'todo') return step

        return withStatus(step, 'todo', step.status === 'done' ? { detail: '', confirm: false } : {})
    })

    return { ...task, steps, updatedAt: change.updatedAt }
}

/** 面板开工时新建条目的字段 */
export interface NewTaskType {
    /** TAPD 短 ID */
    id: string
    kind: ProgressKind
    title: string
    updatedAt: string
    /** 待办所属的 TAPD 项目 ID */
    workspaceId?: string
    branch?: string
    sessionId?: string
    worktree?: string
    /** 开工那一步的当前子项 */
    detail: string
    /** 按哪套步骤建：不传为旧样式（前端需求 11 步、缺陷 6 步）；传了按它建，条目记上 workflow 与每步的 slow */
    flow?: FlowType
}

/** 面板上已经做完的步骤：拉取 TAPD、排序 */
const PANEL_DONE_KEYS: readonly StepKey[] = ['fetch', 'sort']

/**
 * 条目按某套步骤新建时，步骤全是未开始；不传为这种条目的前端模板。
 * @param kind 条目种类
 * @param flow 工作流的步骤
 * @returns 步骤
 */
export const flowSteps = (kind: ProgressKind, flow?: FlowType): ProgressStepType[] =>
    flow === undefined ? todoSteps(kind) : flow.steps.map(i => ({ key: i.key, title: i.title, status: 'todo', slow: i.slow }))

/**
 * 面板开工时从哪一步开始：需求的拉取 TAPD、排序已在面板上完成，从后面第一步开始（前端为③建分支，测试为读需求）；
 * 缺陷从第一步开始。
 * @param steps 条目的步骤
 * @param kind 条目种类
 * @returns 开始那一步的键
 */
export const startKeyOf = (steps: readonly ProgressStepType[], kind: ProgressKind): StepKey => {
    const start = kind === 'bug' ? steps[0] : (steps.find(i => !PANEL_DONE_KEYS.includes(i.key)) ?? steps.at(-1))
    return start?.key ?? ''
}

/**
 * 面板开工时建的条目：需求从拉取、排序之后的第一步进行中，缺陷从第一步进行中。按工作流建的条目记上 workflow。
 * @param options 条目字段
 * @returns 条目
 */
export const newTask = ({ id, kind, title, updatedAt, workspaceId, branch, sessionId, worktree, detail, flow }: NewTaskType): ProgressTaskType => {
    const steps = flowSteps(kind, flow)
    const empty: ProgressTaskType = { id, kind, title, steps, waiting: null, updatedAt }
    if (flow) empty.workflow = flow.id
    if (workspaceId) empty.workspaceId = workspaceId
    if (branch) empty.branch = branch
    if (sessionId) empty.sessionId = sessionId
    if (worktree) empty.worktree = worktree

    return setStep(empty, { key: startKeyOf(steps, kind), status: 'doing', detail, updatedAt })
}

/**
 * 条目是不是这条待办：短 ID 相同；两边都有 TAPD 项目 ID 时还要求项目 ID 相同，条目没有项目 ID（旧条目、进度工具新建的）只看短 ID。
 * 演练的演示条目不和任何待办对应。
 * @param task 条目
 * @param id 待办的短 ID
 * @param workspaceId 待办所属的 TAPD 项目 ID，不传只看短 ID
 * @returns 是否对应
 */
export const isSameTask = (task: ProgressTaskType, id: string, workspaceId?: string): boolean =>
    !isDemoTask(task) && task.id === id && (task.workspaceId === undefined || workspaceId === undefined || task.workspaceId === workspaceId)

/**
 * 找待办对应的条目：项目 ID 也对上的优先，其次是没记项目 ID、短 ID 相同的；演练的演示条目不算。
 * @param taskList 条目
 * @param id 待办的短 ID
 * @param workspaceId 待办所属的 TAPD 项目 ID，不传只看短 ID
 * @returns 条目，没有为 undefined
 */
export const findTask = (taskList: readonly ProgressTaskType[], id: string, workspaceId?: string): ProgressTaskType | undefined =>
    taskList.find(i => !isDemoTask(i) && i.id === id && workspaceId !== undefined && i.workspaceId === workspaceId) ??
    taskList.find(i => isSameTask(i, id, workspaceId))

/** 某个条目某一步下挂着的一个子项 */
export interface StepTaskFoundType {
    /** 子项所在的条目 */
    task: ProgressTaskType
    /** 子项所在的步骤 */
    step: ProgressStepType
    stepTask: StepTaskType
}

/**
 * 找挂在某个条目某一步下的 TAPD 任务（第二级子项）：子项 ID 等于待办短 ID，所在条目按 isSameTask 的口径核对项目 ID。
 * 自定义阶段（如「自测」）的 ID 不是纯数字，与待办的短 ID 天然不撞；演练的演示条目下挂的子项不算（演练时挂了真实任务也不和待办对应）。
 * @param taskList 条目
 * @param id 任务的短 ID
 * @param workspaceId 任务所属的 TAPD 项目 ID，不传只看短 ID
 * @returns 子项及其所在条目与步骤，没有为 undefined
 */
export const findStepTask = (taskList: readonly ProgressTaskType[], id: string, workspaceId?: string): StepTaskFoundType | undefined => {
    for (const task of taskList) {
        if (isDemoTask(task)) continue
        if (task.workspaceId !== undefined && workspaceId !== undefined && task.workspaceId !== workspaceId) continue

        for (const step of task.steps) {
            const stepTask = step.tasks?.find(i => i.id === id)
            if (stepTask !== undefined) return { task, step, stepTask }
        }
    }

    return undefined
}

/**
 * 换掉一个条目，没有就追加在末尾。传了 previous 换掉它本身；没传按 findTask（短 ID 与项目 ID）找要换的那条，
 * 不同 TAPD 项目撞了短 ID 的条目互不覆盖。
 * @param taskList 条目
 * @param task 新条目
 * @param previous 要换掉的原条目，须是 taskList 里的那个对象
 * @returns 新数组
 */
export const upsertTask = (taskList: readonly ProgressTaskType[], task: ProgressTaskType, previous?: ProgressTaskType): ProgressTaskType[] => {
    const target = previous ?? findTask(taskList, task.id, task.workspaceId)
    const index = target === undefined ? -1 : taskList.indexOf(target)

    return index < 0 ? [...taskList, task] : taskList.map((i, n) => (n === index ? task : i))
}

/**
 * 重新开工（缺陷在 TAPD 上重新打开、或 TAPD 任务重新做）时重置条目：全部步骤回到未开始，清掉当前子项、待确认、子项与等待标记；
 * 分支、会话、worktree、备注不动。
 * @param task 条目
 * @param updatedAt 更新时间
 * @returns 新条目
 */
export const resetTask = (task: ProgressTaskType, updatedAt: string): ProgressTaskType => ({
    ...task,
    steps: task.steps.map((i): ProgressStepType => ({ key: i.key, title: i.title, status: 'todo', ...(i.slow === undefined ? {} : { slow: i.slow }) })),
    waiting: null,
    updatedAt
})

/**
 * 重新做挂在某一步下的 TAPD 任务：只把这个子项改回进行中、它下面的模块改回未完成（done 归 0），
 * 所在步骤与条目的状态都不往回改。
 * @param task 子项所在的条目
 * @param key 子项所在的步骤
 * @param stepTaskId 子项 ID
 * @param updatedAt 更新时间
 * @returns 新条目
 */
export const redoStepTask = (task: ProgressTaskType, key: StepKey, stepTaskId: string, updatedAt: string): ProgressTaskType => {
    const redo = (stepTask: StepTaskType): StepTaskType => {
        const next: StepTaskType = { ...stepTask, status: 'doing' }
        if (stepTask.modules) next.modules = stepTask.modules.map(i => ({ ...i, done: 0 }))

        return next
    }
    const steps = task.steps.map(step =>
        step.key === key && step.tasks ? { ...step, tasks: step.tasks.map(i => (i.id === stepTaskId ? redo(i) : i)) } : step
    )

    return { ...task, steps, updatedAt }
}

/**
 * 11 步是否都已完成。
 * @param task 任务
 * @returns 是否完成
 */
export const isTaskDone = (task: ProgressTaskType): boolean => task.steps.every(i => i.status === 'done')

/**
 * 当前一步：进行中的那步，没有就是第一个没完成的；全部完成为 undefined。
 * @param task 任务
 * @returns 步骤与它的序号（1 起）
 */
export const currentStep = (task: ProgressTaskType): { no: number; step: ProgressStepType } | undefined => {
    const doingIndex = task.steps.findIndex(i => i.status === 'doing')
    const index = doingIndex >= 0 ? doingIndex : task.steps.findIndex(i => i.status !== 'done')
    const step = task.steps[index]

    return step === undefined ? undefined : { no: index + 1, step }
}

/**
 * 模块是否做完。
 * @param module 模块
 * @returns 是否做完
 */
export const isModuleDone = (module: StepModuleType): boolean => module.done >= module.total

/**
 * 模块的文字「界面2 顶栏 3/5」。
 * @param module 模块
 * @returns 文字
 */
export const moduleLabel = (module: StepModuleType): string => `${module.name} ${module.done}/${module.total}`

/**
 * 一步的当前子项，用于状态行与折叠行：挂了子项（TAPD 任务或自定义阶段）时提炼成「子项 2/3 · 界面2 顶栏 3/5」（第几条子项在做、它第一个没做完的模块），
 * 没有模块时用子项的 detail 或标题，没有子项在做时为「子项 8/10」加这一步的 detail；没挂子项为这一步的 detail。
 * @param step 步骤
 * @returns 子项，没有为 ''
 */
export const stepSub = (step: ProgressStepType): string => {
    const taskList = step.tasks ?? []
    if (!taskList.length) return step.detail ?? ''

    const doingIndex = taskList.findIndex(i => i.status === 'doing')
    const current = taskList[doingIndex]
    const doneCount = taskList.filter(i => i.status === 'done').length
    const head = `子项 ${current === undefined ? doneCount : doingIndex + 1}/${taskList.length}`
    if (current === undefined) return step.detail ? `${head} · ${step.detail}` : head

    const module = current.modules?.find(i => !isModuleDone(i))
    return `${head} · ${module ? moduleLabel(module) : current.detail || current.title}`
}

/**
 * 一步的紧凑文字：已完成「对齐需求【已完成】」；进行中「开发中-界面2 顶栏」，挂了子项时「开发中 · 子项 2/3 · 界面2 顶栏 3/5」；
 * 未开始「发版（token 待申请）」。
 * @param step 步骤
 * @returns 文字
 */
export const stepLabel = (step: ProgressStepType): string => {
    if (step.status === 'done') return `${step.title}【已完成】`
    if (step.status === 'todo') return step.detail ? `${step.title}（${step.detail}）` : step.title
    if (step.tasks?.length) return `${doingText({ ...step, detail: undefined })} · ${stepSub(step)}`

    return doingText(step)
}

/**
 * 进行中一步的文字「开发中」「开发中-界面2 顶栏」，面板树状展开时用作这一步那一行。
 * @param step 步骤
 * @returns 文字
 */
export const doingText = (step: ProgressStepType): string => {
    const doing = `${step.title}${/\w$/.test(step.title) ? ' ' : ''}中`

    return step.detail ? `${doing}-${step.detail}` : doing
}

/**
 * 条目是不是当前会话的：记了 sessionId 的按 ID 比；没记的（旧条目）归主工作区的会话。
 * 进行中区展开、开工分流、状态行三处都按这一条判断。
 * @param task 条目
 * @param sessionId 当前会话 ID
 * @param isMainCheckout 当前会话是否在主工作区
 * @returns 是否归当前会话
 */
export const ownsTask = (task: ProgressTaskType, sessionId: string, isMainCheckout: boolean): boolean =>
    task.sessionId === undefined ? isMainCheckout : task.sessionId === sessionId

/**
 * 状态行文案：只取本会话没做完的条目（没记 sessionId 的旧条目在主工作区的会话里算本会话的），多条时显示第一条，
 * 「另 N 条」只数本会话的；本会话一条没有或取不到会话 ID 时返回 undefined 清掉状态行。开头是工作台的名字；演练的演示条目写「演练」不写 ID。
 * @param taskList 进行中任务
 * @param sessionId 当前会话 ID
 * @param isMainCheckout 当前会话是否在主工作区
 * @param name 工作台名字（档案里起的），不传为默认名
 * @returns 状态行文字
 */
export const statusText = (
    taskList: readonly ProgressTaskType[],
    sessionId: string,
    isMainCheckout: boolean,
    name: string = DEFAULT_NAME
): string | undefined => {
    if (sessionId === '') return undefined

    const openList = taskList.filter(i => ownsTask(i, sessionId, isMainCheckout) && !isTaskDone(i))
    const task = openList[0]
    const current = task === undefined ? undefined : currentStep(task)
    if (task === undefined || current === undefined) return undefined

    const more = openList.length > 1 ? ` · 另 ${openList.length - 1} 条` : ''
    return `${name} · ${isDemoTask(task) ? '演练' : task.id} 第 ${current.no} 步 ${stepLabel(current.step)}${more}`
}

/** 主会话经 mcp__xiaoxiaoli__progress 推进条目的参数 */
export interface ProgressInputType {
    /** 需求或缺陷的 TAPD 短 ID */
    id: string
    /** 新建条目时用，默认 story */
    kind?: ProgressKind
    /** 新建条目时必填 */
    title?: string
    step?: StepKey
    status?: StepStatus
    detail?: string
    /** 这一步的结论要用户确认，面板标「待确认」；false 清掉 */
    confirm?: boolean
    /** 这一步下的 TAPD 任务短 ID（纯数字）或自定义阶段名（如「自测」），只有慢环节能挂 */
    taskId?: string
    /** 新挂 TAPD 任务时必填；自定义阶段省略时用 taskId */
    taskTitle?: string
    taskStatus?: StepStatus
    taskDetail?: string
    /** 任务下的模块名，如「界面2 顶栏」 */
    module?: string
    moduleDone?: number
    /** 新加模块时必填 */
    moduleTotal?: number
    /** null 为清掉等待 */
    waiting?: WaitingKind | null
    branch?: string
    note?: string
    /** 把这条需求记到调用工具的会话上（换了会话接着做时用） */
    bindSession: boolean
    /** 从 state.json 移除这条需求 */
    remove: boolean
}

/** 参数之间的依赖：给了后面的就得给前面的 */
const DEPEND_LIST = [
    ['status', 'step'],
    ['detail', 'step'],
    ['confirm', 'step'],
    ['taskId', 'step'],
    ['taskTitle', 'taskId'],
    ['taskStatus', 'taskId'],
    ['taskDetail', 'taskId'],
    ['module', 'taskId'],
    ['moduleDone', 'module'],
    ['moduleTotal', 'module']
] as const

/**
 * 校验 mcp__xiaoxiaoli__progress 的参数：参数是模型给的，逐个字段核对。id 只认纯数字的 TAPD 短 ID，外加演示条目的保留值 demo。
 * @param raw 工具参数
 * @returns 参数；不合格返回错误说明
 */
export const toProgressInput = (raw: Record<string, unknown>): ProgressInputType | string => {
    const id = typeof raw.id === 'number' ? String(raw.id) : raw.id
    const taskId = typeof raw.taskId === 'number' ? String(raw.taskId) : raw.taskId
    const kind = PROGRESS_KINDS.find(i => i === raw.kind)
    /* 步骤键取自条目自己的工作流，这里只核写法，属不属于这个条目在 applyProgress 里按条目核 */
    const step = isStepKey(raw.step) ? raw.step : undefined
    const status = STEP_STATUSES.find(i => i === raw.status)
    const taskStatus = STEP_STATUSES.find(i => i === raw.taskStatus)
    const waiting = raw.waiting === 'none' ? null : WAITING_KINDS.find(i => i === raw.waiting)
    const textList = [raw.title, raw.detail, raw.taskTitle, raw.taskDetail, raw.module, raw.branch, raw.note].map(optionalString)
    const missing = DEPEND_LIST.find(([key, need]) => raw[key] !== undefined && raw[need] === undefined)
    if (typeof id !== 'string' || !(/^\d+$/.test(id) || id === DEMO_ID)) return 'id 要填需求或缺陷的 TAPD 短 ID（纯数字）'
    if (missing !== undefined) return `给了 ${missing[0]} 就要给 ${missing[1]}`
    if (raw.kind !== undefined && kind === undefined) return 'kind 只能是 story、bug'
    if (raw.step !== undefined && step === undefined) return 'step 要填这个条目的步骤键（取自工作流，小写字母开头，只含小写字母、数字与 -）'
    if (raw.status !== undefined && status === undefined) return 'status 只能是 done、doing、todo'
    if (raw.taskStatus !== undefined && taskStatus === undefined) return 'taskStatus 只能是 done、doing、todo'
    if (taskId !== undefined && (typeof taskId !== 'string' || !taskId.trim())) return 'taskId 要填 TAPD 任务短 ID（纯数字）或自定义阶段名，不能为空'
    if (raw.waiting !== undefined && waiting === undefined) return 'waiting 只能是 align、review、tapd、none'
    if (textList.some(i => i === null)) return 'title、detail、taskTitle、taskDetail、module、branch、note 要是字符串'
    if (raw.module === '') return 'module 不能为空'
    if ([raw.moduleDone, raw.moduleTotal].some(i => i !== undefined && !isCount(i))) return 'moduleDone、moduleTotal 要是非负整数'
    if (raw.moduleTotal === 0) return 'moduleTotal 至少 1'
    if (typeof raw.branch === 'string' && raw.branch !== '' && !REF_PATTERN.test(raw.branch)) return 'branch 只能含字母、数字与 . _ / -'
    if ([raw.confirm, raw.remove, raw.bindSession].some(i => i !== undefined && typeof i !== 'boolean')) return 'confirm、remove、bindSession 要是 true 或 false'

    const [title, detail, taskTitle, taskDetail, module, branch, note] = textList.map(i => i ?? undefined)
    return {
        id,
        kind,
        title,
        step,
        status,
        detail,
        confirm: typeof raw.confirm === 'boolean' ? raw.confirm : undefined,
        taskId: typeof taskId === 'string' ? taskId.trim() : undefined,
        taskTitle,
        taskStatus,
        taskDetail,
        module,
        moduleDone: isCount(raw.moduleDone) ? raw.moduleDone : undefined,
        moduleTotal: isCount(raw.moduleTotal) ? raw.moduleTotal : undefined,
        waiting,
        branch,
        note,
        bindSession: raw.bindSession === true,
        remove: raw.remove === true
    }
}

/** 可选字段：'' 删掉，其余写上 */
const withOptional = (task: ProgressTaskType, key: 'branch' | 'note', value: string): ProgressTaskType => {
    const next = { ...task }
    if (value === '') delete next[key]
    else next[key] = value

    return next
}

/**
 * 改任务下的一个模块：已有的按名字改，新加的要 total；done 不能超过 total。
 * @param task 步骤下的任务
 * @param input 已校验的参数
 * @returns 新任务；不能改时返回错误说明
 */
const withModule = (task: StepTaskType, input: ProgressInputType): StepTaskType | string => {
    const moduleList = task.modules ?? []
    const found = moduleList.find(i => i.name === input.module)
    if (found === undefined && input.moduleTotal === undefined) return `子项 ${task.id} 下没有模块 ${input.module}，新加要带 moduleTotal`

    const total = input.moduleTotal ?? found?.total ?? 1
    const module: StepModuleType = { name: input.module ?? '', done: input.moduleDone ?? found?.done ?? 0, total }
    if (module.done > module.total) return `模块 ${module.name} 的 moduleDone 超过了 moduleTotal`

    const modules = found === undefined ? [...moduleList, module] : moduleList.map(i => (i.name === module.name ? module : i))
    return { ...task, modules }
}

/**
 * 挂进行中的子项时这一步要不要推成进行中：只有正常前进才推，即这一步未开始、且它后面没有已完成或进行中的步骤。
 * 这一步已完成、或在当前进行中的步骤之前时不推，任何步骤的状态都不往回改。
 * @param steps 条目的步骤
 * @param index 这一步的下标
 * @returns 是否推成进行中
 */
const isForwardStart = (steps: readonly ProgressStepType[], index: number): boolean =>
    steps[index]?.status === 'todo' && steps.slice(index + 1).every(i => i.status === 'todo')

/**
 * 改步骤下的一条 TAPD 任务或自定义阶段及其模块；任务改成进行中时只在正常前进的情况下把这一步推成进行中（见 isForwardStart），
 * 其余情况只挂子项、不动步骤状态。新挂 TAPD 任务（纯数字 taskId）要带 taskTitle，自定义阶段不带时标题取 taskId。
 * @param task 需求
 * @param input 已校验的参数，带 step 与 taskId
 * @param updatedAt 更新时间
 * @returns 新需求；不能改时返回错误说明
 */
const withStepTask = (task: ProgressTaskType, input: ProgressInputType, updatedAt: string): ProgressTaskType | string => {
    const key = input.step
    const step = task.steps.find(i => i.key === key)
    if (key === undefined || step === undefined || input.taskId === undefined) return task

    const taskList = step.tasks ?? []
    const found = taskList.find(i => i.id === input.taskId)
    const isTapdTask = /^\d+$/.test(input.taskId)
    if (found === undefined && isTapdTask && !input.taskTitle) return `${step.title} 下没有子项 ${input.taskId}，新挂要带 taskTitle`

    let stepTask: StepTaskType = found ?? { id: input.taskId, title: input.taskTitle || input.taskId, status: 'todo' }
    if (input.taskTitle) stepTask = { ...stepTask, title: input.taskTitle }
    if (input.taskStatus !== undefined) stepTask = { ...stepTask, status: input.taskStatus }
    if (input.taskDetail !== undefined) {
        stepTask = { ...stepTask, detail: input.taskDetail }
        if (!input.taskDetail) delete stepTask.detail
    }
    if (input.module !== undefined) {
        const next = withModule(stepTask, input)
        if (typeof next === 'string') return next

        stepTask = next
    }

    const tasks = found === undefined ? [...taskList, stepTask] : taskList.map(i => (i.id === stepTask.id ? stepTask : i))
    const withTasks = { ...task, steps: task.steps.map(i => (i.key === key ? { ...i, tasks } : i)) }
    const isStarting = stepTask.status === 'doing' && isForwardStart(task.steps, task.steps.indexOf(step))

    return isStarting ? setStep(withTasks, { key, status: 'doing', updatedAt }) : withTasks
}

/** applyProgress 的环境：更新时间、调用工具的会话、新建条目时按哪套步骤 */
export interface ProgressContextType {
    updatedAt: string
    sessionId: string
    /** 进度工具新建条目时按当前生效的工作流建；某种没给（或与前端步骤相同）时建成旧样式 */
    flowFor?: Partial<Record<ProgressKind, FlowType>>
}

/**
 * 按 mcp__xiaoxiaoli__progress 的参数改需求列表：移除、新建（要 title，按当前生效的工作流建步骤）、推进一步、改步骤下的任务与模块、
 * 改等待、分支、备注与所属会话。step 按这个条目自己的步骤键核，子项只能挂在它的慢环节下。演示条目（demo）只能推进与移除，
 * 不能经这里新建（要经 mcp__xiaoxiaoli__guide 的 start 建）。
 * @param taskList 现有需求
 * @param input 已校验的参数
 * @param context 更新时间、调用工具的会话 ID、新建条目的步骤
 * @returns 新需求列表与回给模型的话；不能改时返回错误说明
 */
export const applyProgress = (
    taskList: readonly ProgressTaskType[],
    input: ProgressInputType,
    { updatedAt, sessionId, flowFor = {} }: ProgressContextType
): { taskList: ProgressTaskType[]; text: string } | string => {
    const found = taskList.find(i => i.id === input.id)
    if (input.remove && found === undefined) return `state.json 里没有条目 ${input.id}`
    /* 只移除找到的那一条，不同 TAPD 项目撞了短 ID 的其他条目不动 */
    if (input.remove) return { taskList: taskList.filter(i => i !== found), text: `已移除 ${input.id}` }
    if (found === undefined && input.id === DEMO_ID) return `state.json 里没有演示条目 ${DEMO_ID}，要先调 mcp__xiaoxiaoli__guide（action 传 start）建`
    if (found === undefined && !input.title) return `state.json 里没有条目 ${input.id}，新建要带 title`

    const kind = found?.kind ?? input.kind ?? 'story'
    const flow = flowFor[kind]
    const created: ProgressTaskType = { id: input.id, kind, title: '', steps: flowSteps(kind, flow), waiting: null, updatedAt }
    let task: ProgressTaskType = found ?? (flow === undefined ? created : { ...created, workflow: flow.id })
    const stepAt = input.step === undefined ? undefined : task.steps.find(i => i.key === input.step)
    if (input.step !== undefined && stepAt === undefined) {
        return `${kind === 'bug' ? '缺陷' : '需求'}的步骤只有 ${task.steps.map(i => i.key).join('、')}`
    }
    if (input.taskId !== undefined && stepAt !== undefined && !isSlowStep(stepAt)) {
        const slowKeys = task.steps.filter(isSlowStep).map(i => i.key)
        return slowKeys.length ? `只有 ${slowKeys.join('、')} 能挂任务` : '这个条目没有能挂子项的慢环节'
    }

    if (input.title) task = { ...task, title: input.title }
    if (input.step !== undefined) {
        task = setStep(task, { key: input.step, status: input.status, detail: input.detail, confirm: input.confirm, updatedAt })
    }
    const withTask = withStepTask(task, input, updatedAt)
    if (typeof withTask === 'string') return withTask

    task = withTask
    if (input.waiting !== undefined) task = { ...task, waiting: input.waiting }
    if (input.branch !== undefined) task = withOptional(task, 'branch', input.branch)
    if (input.note !== undefined) task = withOptional(task, 'note', input.note)
    if (input.bindSession && sessionId) task = { ...task, sessionId }
    task = { ...task, updatedAt }

    const current = currentStep(task)
    const where = current === undefined ? `${task.steps.length} 步全部完成` : `第 ${current.no} 步 ${stepLabel(current.step)}`
    /* 已有条目原地换掉（面板记的 workspaceId 随 ...found 带着），不同 TAPD 项目撞了短 ID 的其他条目不动 */
    return { taskList: upsertTask(taskList, task, found), text: `已更新 ${task.id}：${where}` }
}

/**
 * 读环境变量的开关值，show / hide 之外都当没设。
 * @param value 环境变量原值
 * @returns 开关值
 */
export const toPaneWant = (value: unknown): PaneWant | undefined => (value === 'show' || value === 'hide' ? value : undefined)

/**
 * 轮询到的环境变量与上次比：变成 show / hide 才需要动面板，其余不动。
 * @param last 上次读到的值
 * @param current 这次读到的值
 * @returns 需要切到的状态，不用动为 undefined
 */
export const paneChange = (last: string | undefined, current: string | undefined): PaneWant | undefined =>
    current === last ? undefined : toPaneWant(current)
