/**
 * @description TAPD 只读访问：工具白名单、返回解析、待办归一、排序、级联与迭代筛选
 * @author xiao li
 * @createDate 2026-10-21 17:45
 */
import type { McpToolResult } from 'claude-code'
import type { IterationType, TodoKind, TodoType } from '../types'

/** /mcp 列出的 TAPD 服务器名，工具名前缀 mcp__tapd__ 的中段 */
export const TAPD_SERVER = 'tapd'

/** 允许调用的 TAPD 工具，全部只读，名字都以 get_ 开头 */
export const TAPD_READ_TOOLS = [
    'get_todo',
    'get_stories_or_tasks',
    'get_bug',
    'get_user_participant_projects',
    'get_workflows_status_map',
    'get_iterations'
] as const
export type TapdReadTool = (typeof TAPD_READ_TOOLS)[number]

/** 拉取失败的类型：日志与面板只记这个，不记 TAPD 返回的正文 */
export type TapdErrorKind = 'denied-tool' | 'tapd-error' | 'parse' | 'contract' | 'call-failed'

/** 调一个 TAPD 只读工具 */
export type TapdCall = (tool: TapdReadTool, args: Record<string, unknown>) => Promise<McpToolResult>

/** 一个 TAPD 项目 */
export interface WorkspaceType {
    id: string
    name: string
}

/** 一轮拉取的结果 */
export interface TodoFetchType {
    todoList: TodoType[]
    /** 拉取失败的项目数 */
    failedCount: number
    /** 最后一个失败项目的错误类型，没失败为 '' */
    errorKind: TapdErrorKind | ''
    /** 最后一个失败项目的错误说明（describeError），没失败为 '' */
    errorDetail: string
}

export class TapdError extends Error {
    kind: TapdErrorKind

    constructor(kind: TapdErrorKind) {
        super(kind)
        this.name = 'TapdError'
        this.kind = kind
    }
}

/** 每类待办最多拉多少条 */
const TODO_LIMIT = 50
const TODO_KINDS = ['story', 'task', 'bug'] as const satisfies readonly TodoKind[]
/** 任务的状态只有三个，直接本地翻译 */
const TASK_STATUS: Record<string, string> = { open: '未开始', progressing: '进行中', done: '已完成' }
/** 优先级从高到低排名；缺陷的取值并入同一档，其他值排最后 */
const PRIORITY_RANK: Record<string, number> = {
    'urgent': 0,
    'high': 1,
    'middle': 2,
    'medium': 2,
    'low': 3,
    'nice to have': 4,
    'insignificant': 4
}
const OTHER_RANK = 5
const PRIORITY_TEXT: Record<string, string> = {
    'urgent': '急',
    'high': '高',
    'middle': '中',
    'medium': '中',
    'low': '低',
    'nice to have': '无',
    'insignificant': '无'
}
/** 补字段时要的列：需求、任务用 name，缺陷用 title；任务多要 story_id 挂到所属需求下，需求与任务要 iteration_id 按迭代筛 */
const STORY_FIELDS = 'id,name,status,priority_label,begin,due,iteration_id'
const TASK_FIELDS = 'id,name,status,priority_label,begin,due,story_id,iteration_id'
const ITERATION_FIELDS = 'id,name,startdate,enddate,status'
/** 迭代列表最多列几条（不含本迭代与全部） */
export const ITERATION_LIMIT = 8
const BUG_FIELDS = 'id,title,status,priority_label,begin,due'

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text)
    } catch {
        throw new TapdError('parse')
    }
}

/**
 * 校验工具名在白名单里且以 get_ 开头，不在就拒绝。
 * @param tool 工具名，不带 mcp__tapd__ 前缀
 * @returns 白名单里的工具名
 */
export const toReadTool = (tool: string): TapdReadTool => {
    const allowed = TAPD_READ_TOOLS.find(i => i === tool)
    if (allowed === undefined || !allowed.startsWith('get_')) throw new TapdError('denied-tool')

    return allowed
}

/**
 * 把 MCP 返回解成 JSON：返回字符串的工具会被包成 { result: "<json>" }，逐层拆开。
 * @param result $.mcp.call 的返回
 * @returns 解析后的值
 */
export const readJson = (result: McpToolResult): unknown => {
    if (result.isError) throw new TapdError('tapd-error')

    const text = result.content
        .filter(i => i.type === 'text')
        .map(i => i.text ?? '')
        .join('')
    let value = text === '' ? result.structuredContent : parseJson(text)
    while (isRecord(value) && typeof value.result === 'string') value = parseJson(value.result)
    if (isRecord(value) && typeof value.status === 'number' && value.status !== 1) throw new TapdError('tapd-error')

    return value
}

/**
 * 取返回里 data 数组的每一行；{ Story: {...} } 这种单键包装拆成里面的对象。
 * @param value readJson 的结果
 * @returns 每行的字段
 */
export const readRows = (value: unknown): Record<string, unknown>[] => {
    const data = isRecord(value) ? value.data : undefined
    if (!Array.isArray(data)) return []

    return data.filter(isRecord).map(row => {
        const keys = Object.keys(row)
        const inner = keys.length === 1 ? row[keys[0] as string] : undefined
        return isRecord(inner) ? inner : row
    })
}

/**
 * 读一个必填的字符串字段，数字也接受；缺了就是契约不符。
 * @param row 一行字段
 * @param key 字段名
 */
const requireText = (row: Record<string, unknown>, key: string): string => {
    const value = row[key]
    if (typeof value === 'number') return String(value)
    if (typeof value !== 'string' || value === '') throw new TapdError('contract')

    return value
}

/** 可空字段：null、缺省都当 '' */
const optionalText = (row: Record<string, unknown> | undefined, key: string): string => {
    const value = row?.[key]
    if (typeof value === 'number') return String(value)

    return typeof value === 'string' ? value : ''
}

/**
 * 优先级排名，越小越靠前：High > Middle > Low > Nice To Have > 其他。
 * @param priority 优先级原值
 * @returns 排名
 */
export const priorityRank = (priority: string): number => PRIORITY_RANK[priority.trim().toLowerCase()] ?? OTHER_RANK

/**
 * 优先级的短中文，用于行内显示。
 * @param priority 优先级原值
 * @returns 短中文，空值为 '-'
 */
export const priorityText = (priority: string): string =>
    PRIORITY_TEXT[priority.trim().toLowerCase()] ?? (priority === '' ? '-' : priority)

/** 日期升序，没填的排后面 */
const compareDate = (a: string, b: string): number => {
    if (a === b) return 0
    if (a === '') return 1
    if (b === '') return -1

    return a < b ? -1 : 1
}

/** 有预计开始或预计结束的算有时间 */
const hasTime = (todo: TodoType): boolean => todo.begin !== '' || todo.due !== ''

/** 两条待办的先后：有时间的在前，按预计开始、预计结束、优先级；没时间的在后，按优先级、ID */
const compareTodo = (a: TodoType, b: TodoType): number => {
    if (hasTime(a) !== hasTime(b)) return hasTime(a) ? -1 : 1

    const byPriority = priorityRank(a.priority) - priorityRank(b.priority)
    const byId = a.id === b.id ? 0 : a.id < b.id ? -1 : 1
    if (!hasTime(a)) return byPriority || byId

    return compareDate(a.begin, b.begin) || compareDate(a.due, b.due) || byPriority || byId
}

/**
 * 待办排序分两段：有预计开始或结束的排前面，按预计开始升序、预计结束升序、优先级；
 * 没有任何时间的排后面，按优先级（High > Middle > Low > Nice To Have > 其他）、ID。
 * @param todoList 待办
 * @returns 排好的新数组
 */
export const sortTodos = (todoList: readonly TodoType[]): TodoType[] => [...todoList].sort(compareTodo)

/**
 * 按迭代筛需求与任务，缺陷不分迭代；任务没有迭代时跟随父需求，父需求不在列表里无从判断，保留。
 * @param todoList 待办
 * @param iterationId 迭代 ID，'' 为不筛
 * @returns 筛后的待办
 */
export const filterByIteration = (todoList: readonly TodoType[], iterationId: string): TodoType[] => {
    if (iterationId === '') return [...todoList]

    const storyIteration = new Map(todoList.filter(i => i.kind === 'story').map(i => [i.id, i.iterationId]))
    return todoList.filter(todo => {
        if (todo.kind === 'bug') return true
        if (todo.kind === 'story' || todo.iterationId !== '') return todo.iterationId === iterationId

        const parent = storyIteration.get(todo.storyId)
        return parent === undefined || parent === iterationId
    })
}

/** 迭代按开始日期倒序 */
const compareStartDesc = (a: IterationType, b: IterationType): number =>
    a.startdate === b.startdate ? 0 : a.startdate < b.startdate ? 1 : -1

/**
 * 今天所在的迭代：开始与结束日期之间含今天，有多个取开始最晚的。
 * @param iterationList 迭代
 * @param today 今天 YYYY-MM-DD
 * @returns 迭代 ID，没有为 ''
 */
export const currentIterationId = (iterationList: readonly IterationType[], today: string): string => {
    const current = iterationList
        .filter(i => i.startdate !== '' && i.startdate <= today && (i.enddate === '' || today <= i.enddate))
        .sort(compareStartDesc)[0]

    return current?.id ?? ''
}

/** 级联后的一行待办 */
export interface CascadeRowType {
    todo: TodoType
    /** 任务挂在所属需求下面时为 true，排版时缩进 */
    isChild: boolean
}

/**
 * 需求与任务级联：需求按 sortTodos 列出，每个需求下紧跟它的任务；
 * 没有父需求或父需求不在列表里的任务排在所有需求之后，缺陷独立一组放最后，组内都按 sortTodos 排。
 * @param todoList 待办
 * @returns 级联后的行
 */
export const cascadeTodos = (todoList: readonly TodoType[]): CascadeRowType[] => {
    const sorted = sortTodos(todoList)
    const storyList = sorted.filter(i => i.kind === 'story')
    const storyIdList = storyList.map(i => i.id)
    const taskList = sorted.filter(i => i.kind === 'task')
    const orphanList = taskList.filter(i => !storyIdList.includes(i.storyId))
    const bugList = sorted.filter(i => i.kind === 'bug')

    return [
        ...storyList.flatMap(story => [
            { todo: story, isChild: false },
            ...taskList.filter(i => i.storyId === story.id).map(i => ({ todo: i, isChild: true }))
        ]),
        ...orphanList.map(i => ({ todo: i, isChild: false })),
        ...bugList.map(i => ({ todo: i, isChild: false }))
    ]
}

/**
 * TAPD 长 ID 去掉「11 + 项目 ID」前缀和前导 0，得到网页上显示的短 ID。
 * @param id 长 ID
 * @param workspaceId 项目 ID
 * @returns 短 ID；不符合长 ID 规则时原样返回
 */
export const shortId = (id: string, workspaceId: string): string => {
    const prefix = `11${workspaceId}`
    if (!id.startsWith(prefix) || id.length <= prefix.length) return id

    return id.slice(prefix.length).replace(/^0+/, '')
}

/** 缺陷「重新打开」在 TAPD 里的状态原值（get_bug、get_todo 返回的 status），get_workflows_status_map 把它翻成「重新打开」 */
export const BUG_REOPENED_STATUS = 'reopened'

/** 自定义工作流里的重新打开状态，原值各项目不同（如 QA_audited、status_15），中文名都带这四个字（如「C1-重新打开」） */
const BUG_REOPENED_NAME = '重新打开'

/**
 * 是否 TAPD 上当前状态为「重新打开」的缺陷：状态原值是 reopened，或翻译后的中文名带「重新打开」
 * （自定义工作流的原值各项目不同，只能认中文名）。
 * @param todo 待办
 * @returns 是否重新打开的缺陷
 */
export const isReopenedBug = (todo: TodoType): boolean =>
    todo.kind === 'bug' && (todo.statusKey === BUG_REOPENED_STATUS || todo.status.includes(BUG_REOPENED_NAME))

/** 合成一条待办所需的原料 */
interface TodoSourceType {
    kind: TodoKind
    /** get_todo 的一行 */
    row: Record<string, unknown>
    /** 补字段的一行，补失败时没有 */
    detail?: Record<string, unknown>
    /** 状态英文名到中文名 */
    statusMap: Record<string, string>
    workspaceId: string
}

/**
 * 把待办行和补来的详情合成一条待办；状态缺失显示 '-'，ID 与标题缺失算契约不符。
 * @param source 合成所需的原料
 * @returns 待办
 */
const toTodo = ({ kind, row, detail, statusMap, workspaceId }: TodoSourceType): TodoType => {
    const status = optionalText(detail, 'status') || optionalText(row, 'status')
    const title =
        optionalText(row, 'name') || optionalText(row, 'title') || optionalText(detail, 'name') || optionalText(detail, 'title')
    if (title === '') throw new TapdError('contract')

    /* TAPD 里没有父需求的任务 story_id 为 0，没有迭代的 iteration_id 也为 0 */
    const storyId = kind === 'task' ? optionalText(detail, 'story_id') || optionalText(row, 'story_id') : ''
    const iterationId = kind === 'bug' ? '' : optionalText(detail, 'iteration_id') || optionalText(row, 'iteration_id')

    return {
        kind,
        id: requireText(row, 'id'),
        title,
        status: (kind === 'task' ? TASK_STATUS[status] : statusMap[status]) ?? (status || '-'),
        statusKey: status,
        priority: optionalText(detail, 'priority_label') || optionalText(row, 'priority'),
        begin: optionalText(detail, 'begin'),
        due: optionalText(detail, 'due'),
        workspaceId,
        storyId: storyId === '0' ? '' : storyId,
        iterationId: iterationId === '0' ? '' : iterationId
    }
}

/** 一个项目下一类待办的查询条件 */
interface KindQueryType {
    call: TapdCall
    /** 项目 ID，TAPD 工具要数字 */
    workspaceId: number
    kind: TodoKind
}

/** 补字段：一次按多个 ID 查回优先级、预计开始与结束 */
const fetchDetails = async (query: KindQueryType, idList: string[]): Promise<Record<string, unknown>[]> => {
    const options = { id: idList.join(','), limit: idList.length }
    const result =
        query.kind === 'bug'
            ? await query.call('get_bug', { workspace_id: query.workspaceId, options: { ...options, fields: BUG_FIELDS } })
            : await query.call('get_stories_or_tasks', {
                  workspace_id: query.workspaceId,
                  options: query.kind === 'story'
                      ? { ...options, entity_type: 'stories', fields: STORY_FIELDS }
                      : { ...options, entity_type: 'tasks', fields: TASK_FIELDS }
              })

    return readRows(readJson(result))
}

/** 状态英文名到中文名；任务不用查 */
const fetchStatusMap = async (query: KindQueryType): Promise<Record<string, string>> => {
    if (query.kind === 'task') return {}

    const args = { workspace_id: query.workspaceId, options: { system: query.kind } }
    const value = readJson(await query.call('get_workflows_status_map', args))
    const data = isRecord(value) ? value.data : undefined
    if (!isRecord(data)) return {}

    return Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

/** 补字段与状态名是锦上添花：失败时按待办自带的字段显示，不拖垮整张列表 */
const tryFetch = async <T>(load: () => Promise<T>, fallback: T): Promise<T> => {
    try {
        return await load()
    } catch {
        return fallback
    }
}

/** 拉一个项目下的一类待办 */
const fetchKind = async (query: KindQueryType): Promise<TodoType[]> => {
    const args = { workspace_id: query.workspaceId, entity_type: query.kind, limit: TODO_LIMIT }
    const rowList = readRows(readJson(await query.call('get_todo', args)))
    if (!rowList.length) return []

    const idList = rowList.map(i => requireText(i, 'id'))
    const [detailList, statusMap] = await Promise.all([
        tryFetch(() => fetchDetails(query, idList), []),
        tryFetch(() => fetchStatusMap(query), {})
    ])
    const detailById = new Map(detailList.map(i => [optionalText(i, 'id'), i]))
    const workspaceId = String(query.workspaceId)

    return rowList.map(row => toTodo({ kind: query.kind, row, detail: detailById.get(requireText(row, 'id')), statusMap, workspaceId }))
}

/**
 * 拉一个项目下需求、任务、缺陷三类待办。
 * @param call TAPD 只读调用
 * @param workspaceId 项目 ID
 * @returns 该项目的待办，未排序
 */
export const fetchWorkspaceTodos = async (call: TapdCall, workspaceId: string): Promise<TodoType[]> => {
    const groupList = await Promise.all(TODO_KINDS.map(kind => fetchKind({ call, workspaceId: Number(workspaceId), kind })))

    return groupList.flat()
}

/**
 * 本项目的迭代，按开始日期倒序。
 * @param call TAPD 只读调用
 * @param workspaceId 项目 ID
 * @returns 迭代列表
 */
export const fetchIterations = async (call: TapdCall, workspaceId: string): Promise<IterationType[]> => {
    const options = { fields: ITERATION_FIELDS, limit: 50, order: 'startdate desc' }
    const rowList = readRows(readJson(await call('get_iterations', { workspace_id: Number(workspaceId), options })))

    return rowList
        .map(i => ({
            id: requireText(i, 'id'),
            name: optionalText(i, 'name'),
            startdate: optionalText(i, 'startdate'),
            enddate: optionalText(i, 'enddate')
        }))
        .sort(compareStartDesc)
}

/**
 * 当前用户参与的项目，去掉公司（organization）这一层。
 * @param call TAPD 只读调用
 * @returns 项目列表
 */
export const fetchWorkspaces = async (call: TapdCall): Promise<WorkspaceType[]> => {
    const rowList = readRows(readJson(await call('get_user_participant_projects', {})))

    return rowList
        .filter(i => i.category !== 'organization')
        .map(i => ({ id: requireText(i, 'id'), name: optionalText(i, 'name') }))
}

/**
 * 任意异常归成错误类型，不带正文。
 * @param cause 捕获到的异常
 * @returns 错误类型
 */
export const toErrorKind = (cause: unknown): TapdErrorKind => (cause instanceof TapdError ? cause.kind : 'call-failed')

/** 错误说明最多留几个字符 */
const ERROR_DETAIL_LIMIT = 200

/**
 * 给 debug 日志用的错误说明：$.mcp.call 自己抛的异常留原始信息的前 200 字符；
 * 解析 TAPD 返回时抛的 TapdError 只留类型，不带返回正文。
 * @param cause 捕获到的异常
 * @returns 错误说明
 */
export const describeError = (cause: unknown): string => {
    if (cause instanceof TapdError) return cause.kind

    const text = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)
    return text.slice(0, ERROR_DETAIL_LIMIT)
}

/**
 * 逐个项目拉待办并排序；单个项目失败只计数，全部失败才算整体失败。
 * 项目之间串行，避免一次压给 TAPD 太多并发请求。
 * @param call TAPD 只读调用
 * @param workspaceList 要拉的项目
 * @returns 排好序的待办与失败情况
 */
export const fetchTodos = async (call: TapdCall, workspaceList: readonly WorkspaceType[]): Promise<TodoFetchType> => {
    const todoList: TodoType[] = []
    let failedCount = 0
    let errorKind: TapdErrorKind | '' = ''
    let errorDetail = ''
    let lastCause: unknown
    for (const workspace of workspaceList) {
        try {
            /* 带上项目名：「全部项目」视图开工别的项目的待办时，确认行要写明属于哪个项目 */
            const named = (await fetchWorkspaceTodos(call, workspace.id)).map(i => (workspace.name ? { ...i, workspaceName: workspace.name } : i))
            todoList.push(...named)
        } catch (cause) {
            failedCount += 1
            errorKind = toErrorKind(cause)
            errorDetail = describeError(cause)
            lastCause = cause
        }
    }
    /* 全部失败：抛出原始异常，调用方据此记日志并安排重试 */
    if (workspaceList.length && failedCount === workspaceList.length) throw lastCause

    return { todoList: sortTodos(todoList), failedCount, errorKind, errorDetail }
}
