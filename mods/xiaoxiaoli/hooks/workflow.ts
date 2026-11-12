/**
 * @description 工种与工作流：工作流定义的校验（步骤数、键、标题、细则长度、版本）、三层查找（项目自定义 → 个人自定义 → 内置工种）
 * 与不合格时的降级和提示、新条目按哪套步骤建（与旧的前端步骤相同时建成旧样式）、workflow 工具的参数校验与返回文字；纯函数便于测试
 * @author xiao li
 * @createDate 2026-11-12 18:00
 */
import type { ActiveWorkflowType, FlowType, ProgressKind, WorkRole, WorkflowSource, WorkflowStepType, WorkflowType } from '../types'
import { BUG_STEPS, SLOW_STEP_KEYS, STEP_KEY_LIMIT, STORY_STEPS, isStepKey } from './workbench'
import { ROLE_TITLES } from './profile'

/** 自定义工作流的文件名：全局根目录下为个人自定义，全局项目目录下为项目自定义 */
export const WORKFLOW_FILE = 'workflow.json'
/** 内置工作流所在的目录，相对 mod 目录，文件名为工种 id */
export const WORKFLOW_DIR = 'workflows'
/** 工作流定义的结构版本；比它新的不采用、不覆盖 */
export const WORKFLOW_VERSION = 1
/** 每组步骤最多几步 */
export const STEP_LIMIT = 20
/** 步骤名最多几个字符（按码点数） */
export const STEP_TITLE_LIMIT = 12
/** what、tools、output、ask 每项最多几个字符 */
export const TEXT_LIMIT = 200
/** rules 最多几条 */
export const RULE_COUNT_LIMIT = 10
/** rules 每条最多几个字符 */
export const RULE_LIMIT = 300
/** 控制字符：C0（含换行、制表）、DEL、C1，外加行分隔符与段分隔符 */
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u{2028}\u{2029}]/u
/** 两组步骤的中文叫法，不合格原因里用 */
const KIND_LABEL: Record<ProgressKind, string> = { story: '需求（story）', bug: '缺陷（bug）' }
/** 每步的细则字段 */
const TEXT_FIELDS = ['what', 'tools', 'output', 'ask'] as const
/** 三层查找里两层自定义的叫法 */
const LAYER_LABEL: Record<'project' | 'personal', string> = { project: '项目自定义', personal: '个人自定义' }

/**
 * 代码里保留的前端步骤：内置文件读不到或不合格时、以及项目内模式用它；键、标题与慢环节同 workflows/frontend.json，不带细则。
 */
export const FALLBACK_WORKFLOW: WorkflowType = {
    version: WORKFLOW_VERSION,
    id: 'frontend',
    title: '前端',
    branch: true,
    story: STORY_STEPS.map(i => ({ key: i.key, title: i.title, slow: SLOW_STEP_KEYS.includes(i.key) })),
    bug: BUG_STEPS.map(i => ({ key: i.key, title: i.title, slow: false }))
}

/** 校验一份定义的结果：合格为规范后的定义；不合格为原因，版本比本 mod 新时 isNewer 为 true */
export type WorkflowCheckType = { workflow: WorkflowType } | { reason: string; isNewer: boolean }

/** 解析一个工作流文件的结果：空文件（或不存在）、合格、不合格 */
export type WorkflowParseType = WorkflowCheckType | { isEmpty: true }

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/** 不合格（不是版本问题） */
const invalid = (reason: string): WorkflowCheckType => ({ reason, isNewer: false })

/** 码点数 */
const lengthOf = (text: string): number => [...text].length

/**
 * 名字类字段（步骤名、工作流名）：非空、不超过 12 个字符、不含控制字符。
 * @param raw 原值
 * @param label 不合格原因里怎么称呼它
 * @returns 去掉首尾空白后的名字，或不合格的原因
 */
const checkTitle = (raw: unknown, label: string): { title: string } | { reason: string } => {
    if (typeof raw !== 'string' || raw.trim() === '') return { reason: `${label}要填，不能为空` }

    const title = raw.trim()
    if (CONTROL_PATTERN.test(title)) return { reason: `${label}不能含换行、制表等控制字符` }
    if (lengthOf(title) > STEP_TITLE_LIMIT) return { reason: `${label}最多 ${STEP_TITLE_LIMIT} 个字符，现在是 ${lengthOf(title)} 个` }

    return { title }
}

/**
 * 一步的校验：key、title 必填，slow 缺省为 false，what、tools、output、ask 可选文字，rules 可选文字数组；别的字段丢掉。
 * @param raw 原值
 * @param where 不合格原因里的位置，如「需求（story）第 3 步」
 * @returns 规范后的一步，或不合格的原因
 */
const checkStep = (raw: unknown, where: string): { step: WorkflowStepType } | { reason: string } => {
    if (!isRecord(raw)) return { reason: `${where}要是一个对象` }
    if (!isStepKey(raw.key)) {
        return { reason: `${where}的 key「${String(raw.key)}」要是小写字母开头、只含小写字母、数字与 - 的文字，最多 ${STEP_KEY_LIMIT} 个字符` }
    }

    const title = checkTitle(raw.title, `${where}（${raw.key}）的 title `)
    if ('reason' in title) return title
    if (raw.slow !== undefined && typeof raw.slow !== 'boolean') return { reason: `${where}（${raw.key}）的 slow 要是 true 或 false` }

    const step: WorkflowStepType = { key: raw.key, title: title.title, slow: raw.slow === true }
    for (const field of TEXT_FIELDS) {
        const value = raw[field]
        if (value === undefined) continue
        if (typeof value !== 'string') return { reason: `${where}（${raw.key}）的 ${field} 要是文字` }
        if (lengthOf(value) > TEXT_LIMIT) return { reason: `${where}（${raw.key}）的 ${field} 最多 ${TEXT_LIMIT} 个字符` }
        step[field] = value
    }
    if (raw.rules !== undefined) {
        const rules = raw.rules
        if (!Array.isArray(rules) || !rules.every((i): i is string => typeof i === 'string')) return { reason: `${where}（${raw.key}）的 rules 要是文字数组` }
        if (rules.length > RULE_COUNT_LIMIT) return { reason: `${where}（${raw.key}）的 rules 最多 ${RULE_COUNT_LIMIT} 条` }
        if (rules.some(i => lengthOf(i) > RULE_LIMIT)) return { reason: `${where}（${raw.key}）的 rules 每条最多 ${RULE_LIMIT} 个字符` }
        step.rules = [...rules]
    }

    return { step }
}

/**
 * 一组步骤的校验：1 到 20 步，每步合格，key 在组内不重复。
 * @param raw 原值
 * @param kind 哪一组
 * @returns 规范后的步骤，或不合格的原因
 */
const checkSteps = (raw: unknown, kind: ProgressKind): { steps: WorkflowStepType[] } | { reason: string } => {
    const label = KIND_LABEL[kind]
    if (!Array.isArray(raw)) return { reason: `${label}要是步骤数组` }
    if (raw.length < 1 || raw.length > STEP_LIMIT) return { reason: `${label}要有 1 到 ${STEP_LIMIT} 步，现在是 ${raw.length} 步` }

    const steps: WorkflowStepType[] = []
    for (const [index, item] of raw.entries()) {
        const checked = checkStep(item, `${label}第 ${index + 1} 步`)
        if ('reason' in checked) return checked
        if (steps.some(i => i.key === checked.step.key)) return { reason: `${label}里的 key「${checked.step.key}」重复了` }
        steps.push(checked.step)
    }

    return { steps }
}

/**
 * 校验一份工作流定义：version 缺省为 1（不是正整数不合格，比 1 新的不采用）；branch 缺省为 true；id、title 可选；
 * story、bug 各 1 到 20 步。别的字段丢掉，返回规范后的定义。
 * @param raw 原值（JSON 解析后的）
 * @returns 合格的定义，或不合格的原因
 */
export const checkWorkflow = (raw: unknown): WorkflowCheckType => {
    if (!isRecord(raw)) return invalid('定义要是一个 JSON 对象')

    const version = raw.version ?? WORKFLOW_VERSION
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return invalid('version 要是正整数')
    if (version > WORKFLOW_VERSION) return { reason: `version ${version} 比本 mod 认识的新（${WORKFLOW_VERSION}），先更新 mod`, isNewer: true }
    if (raw.branch !== undefined && typeof raw.branch !== 'boolean') return invalid('branch 要是 true 或 false')
    if (raw.id !== undefined && !isStepKey(raw.id)) return invalid('id 要是小写字母开头、只含小写字母、数字与 - 的文字')

    const title = raw.title === undefined ? undefined : checkTitle(raw.title, '工作流的 title ')
    if (title !== undefined && 'reason' in title) return invalid(title.reason)

    const story = checkSteps(raw.story, 'story')
    if ('reason' in story) return invalid(story.reason)

    const bug = checkSteps(raw.bug, 'bug')
    if ('reason' in bug) return invalid(bug.reason)

    const workflow: WorkflowType = { version: WORKFLOW_VERSION, branch: raw.branch !== false, story: story.steps, bug: bug.steps }
    if (typeof raw.id === 'string') workflow.id = raw.id
    if (title !== undefined) workflow.title = title.title

    return { workflow }
}

/**
 * 解析一个工作流文件：空白或不存在（读不到为 ''）为没有；不是合法 JSON、不合格、版本比本 mod 新都给原因。
 * @param text 文件内容
 * @returns 解析结果
 */
export const parseWorkflow = (text: string): WorkflowParseType => {
    if (text.trim() === '') return { isEmpty: true }

    let value: unknown
    try {
        value = JSON.parse(text)
    } catch {
        return invalid('不是合法 JSON')
    }

    return checkWorkflow(value)
}

/**
 * 写进 workflow.json 的全文：规范后的定义，字段顺序固定，两格缩进，末尾换行。
 * @param workflow 合格的定义
 * @returns 文件内容
 */
export const workflowFileText = (workflow: WorkflowType): string => {
    const { version, id, title, branch, story, bug } = workflow
    return `${JSON.stringify({ version, ...(id === undefined ? {} : { id }), ...(title === undefined ? {} : { title }), branch, story, bug }, null, 2)}\n`
}

/** 查找时的一层：文件位置与内容（读不到为 ''） */
export interface WorkflowLayerType {
    path: string
    text: string
}

/** 三层查找的输入 */
export interface WorkflowLayersType {
    /** 项目自定义：全局项目目录下的 workflow.json；没有全局项目目录为 null */
    project: WorkflowLayerType | null
    /** 个人自定义：全局根目录下的 workflow.json；取不到全局根目录为 null */
    personal: WorkflowLayerType | null
    /** 内置：mod 目录下 workflows/<工种>.json */
    builtin: WorkflowLayerType
    /** 当前工种 */
    role: WorkRole
}

/** 三层查找的结果：生效的工作流，内置文件不能用时的原因（只记日志，不提示用户） */
export interface WorkflowPickType {
    active: ActiveWorkflowType
    builtinError: string
}

/** 拼一个生效的工作流 */
const activeOf = (workflow: WorkflowType, source: WorkflowSource, id: string, label: string, path: string, noticeList: string[]): ActiveWorkflowType => ({
    workflow,
    source,
    id,
    label,
    path,
    noticeList
})

/**
 * 项目内模式的工作流：沿用代码里的前端步骤，流程按项目内文档约定，不读工种与自定义工作流，不往项目仓库写任何文件。
 * @returns 生效的工作流
 */
export const repoWorkflow = (): ActiveWorkflowType =>
    activeOf(FALLBACK_WORKFLOW, 'repo', 'frontend', '项目内模式（沿用前端步骤，流程按项目内文档）', '', [])

/**
 * 三层查找：项目自定义 → 个人自定义 → 内置（按工种），第一份合格的生效。自定义文件为空当作没有；存在但不合格（含版本比本 mod 新）
 * 时跳过它用下一层，并在 noticeList 里如实说明哪一份、为什么。内置文件读不到或不合格时退回代码里的前端步骤，原因放在 builtinError。
 * @param layers 三层的文件位置与内容、当前工种
 * @returns 生效的工作流与内置文件的问题
 */
export const pickWorkflow = ({ project, personal, builtin, role }: WorkflowLayersType): WorkflowPickType => {
    const skippedList: string[] = []
    const customList: ['project' | 'personal', WorkflowLayerType | null][] = [
        ['project', project],
        ['personal', personal]
    ]
    const finish = (picked: Omit<ActiveWorkflowType, 'noticeList'>, builtinError = ''): WorkflowPickType => ({
        active: { ...picked, noticeList: skippedList.length ? [...skippedList, `先用${picked.label}`] : [] },
        builtinError
    })
    for (const [source, layer] of customList) {
        if (layer === null) continue

        const parsed = parseWorkflow(layer.text)
        if ('isEmpty' in parsed) continue
        if ('workflow' in parsed) return finish(activeOf(parsed.workflow, source, source, LAYER_LABEL[source], layer.path, []))
        skippedList.push(`${LAYER_LABEL[source]}工作流（${layer.path}）不合格：${parsed.reason}`)
    }

    const parsed = parseWorkflow(builtin.text)
    if ('workflow' in parsed) return finish(activeOf(parsed.workflow, 'builtin', role, `内置 · ${ROLE_TITLES[role]}`, builtin.path, []))

    const error = 'isEmpty' in parsed ? '读不到' : parsed.reason
    return finish(activeOf(FALLBACK_WORKFLOW, 'fallback', 'frontend', '内置 · 前端（代码里保留的步骤）', '', []), `${builtin.path} ${error}`)
}

/**
 * 新条目按哪套步骤建：这一组的键、标题与慢环节和旧的前端步骤完全相同时返回 undefined（建成旧样式条目，老版本 mod 也读得懂）；
 * 否则返回工作流的步骤，条目记上 workflow 与每步的 slow，之后工作流怎么改都不影响它。
 * @param active 生效的工作流
 * @param kind 条目种类
 * @returns 步骤，与前端相同为 undefined
 */
export const flowOf = (active: Pick<ActiveWorkflowType, 'workflow' | 'id'>, kind: ProgressKind): FlowType | undefined => {
    const steps = active.workflow[kind]
    const legacy = FALLBACK_WORKFLOW[kind]
    const isLegacy =
        steps.length === legacy.length && steps.every((step, index) => step.key === legacy[index]?.key && step.title === legacy[index]?.title && step.slow === legacy[index]?.slow)

    return isLegacy ? undefined : { id: active.id, steps: steps.map(({ key, title, slow }) => ({ key, title, slow })) }
}

/**
 * 新条目两种都按哪套步骤建（进度工具新建条目用）。
 * @param active 生效的工作流
 * @returns 需求与缺陷各自的步骤，与前端相同的那种不给
 */
export const flowsOf = (active: Pick<ActiveWorkflowType, 'workflow' | 'id'>): Partial<Record<ProgressKind, FlowType>> => {
    const story = flowOf(active, 'story')
    const bug = flowOf(active, 'bug')

    return { ...(story === undefined ? {} : { story }), ...(bug === undefined ? {} : { bug }) }
}

/** mcp__xiaoxiaoli__workflow 的参数 */
export type WorkflowInputType =
    | { action: 'get'; kind?: ProgressKind }
    | { action: 'set'; scope: 'project' | 'personal'; definition: unknown }
    | { action: 'reset'; scope: 'project' | 'personal' }

/**
 * 校验 mcp__xiaoxiaoli__workflow 的参数：action 必填；get 的 kind 可选；set、reset 要 scope，set 还要 definition（对象，或它的 JSON 文字）。
 * definition 的内容在这里不校验，交给 checkWorkflow。
 * @param raw 工具参数
 * @returns 参数；不合格返回原因
 */
export const toWorkflowInput = (raw: Record<string, unknown>): WorkflowInputType | string => {
    const action = raw.action
    if (action !== 'get' && action !== 'set' && action !== 'reset') return 'action 只能是 get、set、reset'
    if (action === 'get') {
        if (raw.kind !== undefined && raw.kind !== 'story' && raw.kind !== 'bug') return 'kind 只能是 story、bug'
        return raw.kind === undefined ? { action } : { action, kind: raw.kind }
    }

    const scope = raw.scope
    if (scope !== 'project' && scope !== 'personal') return `${action} 要给 scope：project（本项目）或 personal（个人，所有项目）`
    if (action === 'reset') return { action, scope }
    if (raw.definition === undefined) return 'set 要给完整的 definition（story、bug，可选 branch、title）'

    if (typeof raw.definition !== 'string') return { action, scope, definition: raw.definition }
    try {
        return { action, scope, definition: JSON.parse(raw.definition) as unknown }
    } catch {
        return 'definition 是文字时要是合法 JSON'
    }
}

/**
 * workflow 工具 get 的返回：一行来源说明（含进行中的条目不受影响），自定义不合格时再加说明，最后是定义的 JSON；
 * 给了 kind 时只带那一组步骤，省 token。
 * @param active 生效的工作流
 * @param kind 只要哪一组，不传为两组
 * @returns 返回文字
 */
export const workflowText = (active: ActiveWorkflowType, kind?: ProgressKind): string => {
    const { version, id, title, branch, story, bug } = active.workflow
    const head = { version, ...(id === undefined ? {} : { id }), ...(title === undefined ? {} : { title }), branch }
    const body = kind === undefined ? { ...head, story, bug } : { ...head, [kind]: active.workflow[kind] }
    const where = active.path === '' ? '' : `（${active.path}）`
    const source = `来源：${active.label}${where}；${branch ? '开工建分支' : '开工不建分支'}；进行中的条目按各自开工时记下的步骤走，不受它影响`

    return [source, ...active.noticeList.map(i => `注意：${i}`), JSON.stringify(body)].join('\n')
}

/** 两层自定义的叫法 */
export const scopeLabel = (scope: 'project' | 'personal'): string => LAYER_LABEL[scope]
