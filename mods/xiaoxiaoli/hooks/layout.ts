/**
 * @description 面板排版：按显示宽度截断，把首次引导（还没起名时）、标题、迭代筛选、待办（全局模式未绑定时为绑定列表）、进行中任务
 * 排成一行一行的内容，每行带它被点中时的动作；标题按档案里的名字算；沉浸模式下只排标题和进行中任务
 * @author xiao li
 * @createDate 2026-10-21 17:55
 */
import type {
    BindStateType,
    IterationStateType,
    LaunchType,
    ProgressStepType,
    ProgressTaskType,
    ProgressType,
    StepTaskType,
    TodoKind,
    TodoMetaType,
    TodoScope,
    TodoStartState,
    TodoType,
    WorkbenchConfigType,
    WorkplaceType
} from '../types'
import { ITERATION_LIMIT, cascadeTodos, filterByIteration, isReopenedBug, priorityRank, priorityText, shortId } from './tapd'
import {
    WAITING_TEXT,
    currentStep,
    doingText,
    findStepTask,
    findTask,
    isModuleDone,
    isSlowStep,
    isTaskDone,
    moduleLabel,
    ownsTask,
    stepLabel,
    stepSub
} from './workbench'
import { PASTE_TEXT } from './launch'
import { DEFAULT_NAME, fullNameOf } from './profile'

/*
 * 以下两个形状会作为 Client 的 props 传给 board.tsx，必须是 JsonValue；
 * interface 没有隐式索引签名，赋不进 JsonValue，所以这里用 type
 */
/** 一行里的一段文字及其样式 */
export type SegType = {
    text: string
    color?: string
    bold?: boolean
    dim?: boolean
    /** 删除线，已完成的步骤、任务与模块用 */
    strike?: boolean
}
/** 面板里的一行；action 为点中这一行时发回 hooks 的动作，没有则点中只是取消高亮 */
export type BoardLineType = {
    segList: SegType[]
    action?: string
}

/** 排版所需的全部状态 */
export interface BoardInputType {
    /** 项目的 TAPD 配置，null 为没配 */
    config: WorkbenchConfigType | null
    todoList: TodoType[]
    todoMeta: TodoMetaType
    selectedId: string
    progress: ProgressType
    iteration: IterationStateType
    /** 当前会话所在的项目，null 为还没定下 */
    workplace: WorkplaceType | null
    /** 最近一次生成的启动命令 */
    launch: LaunchType | null
    /** 全局模式下还没绑定 TAPD 时的绑定列表 */
    binding: BindStateType
    /** 是否沉浸：只排标题与进行中区 */
    isFocus: boolean
    /** 工作台名字（档案里起的，不含「AI工作台」），标题按它算；不传为默认名 */
    name?: string
    /** 是否还没起名、要在最上方显示首次引导（沉浸时不显示）；不传为否 */
    isSetupPending?: boolean
}

/** 待办一行的排版参数 */
export interface TodoLineOptionsType {
    todo: TodoType
    /** 面板列数 */
    width: number
    /** 是否被点中，点中时整行文字高亮加粗，不铺底色 */
    selected: boolean
    /** 是否为挂在需求下的任务，是则缩进并加层级标记 */
    isChild: boolean
    /** 开工态：待开工、开工中、已完成，默认待开工 */
    startState?: TodoStartState
}

/** 顶部一行的排版参数 */
interface HeaderOptionsType {
    /** 字间加了空格的工作台全称（见 spacedTitleOf） */
    title: string
    /** 项目名：配了 TAPD 用配置里的（全部项目视图为「全部项目（n 个）」），没配或没绑定用项目目录名 */
    name: string
    /** 右边是否带状态位（重试、错误、拉取中、刷新时间）；项目内没配 TAPD 时不拉取，右边只有「[ 刷新 ]」 */
    showStatus: boolean
    meta: TodoMetaType
    width: number
    /** 选了本迭代但今天不在任何迭代里，退化为全部时提示 */
    noCurrent: boolean
}

export const NO_CONFIG_TEXT = '本项目没配 TAPD（缺 config.json 或不完整），见 README'
/** 项目里没有 config.json、又取不到全局根目录时的说明，面板上分两行排，免得窄面板截掉环境变量名 */
export const NO_GLOBAL_ROOT_LINES = ['取不到用户目录，无法使用全局绑定；', '可设环境变量 XIAOXIAOLI_HOME 指定全局目录'] as const
/** 同上的整句：refresh 回复、绑定与解绑的拒绝原因用 */
export const NO_GLOBAL_ROOT_TEXT = NO_GLOBAL_ROOT_LINES.join('')
/** 已完成、不能重新开工的条目，选中后在确认行的位置显示这一行，不可点 */
export const NO_RESTART_TEXT = '已完成，不能重新开工'
export const NO_BINDING_TEXT = '本项目还没绑定 TAPD 项目'
/** 本项目记着不用 TAPD（systems.tapd 为 false）时待办区的说明，分两行排，免得窄面板截掉后半句 */
export const TAPD_OFF_LINES = ['本项目不用 TAPD：不列 TAPD 项目，也不拉待办', '要用时对 AI 说「这个项目用 TAPD」或绑定 TAPD 项目'] as const
export const BIND_PICK_TEXT = '点一个 TAPD 项目，再点「绑定」确认：'
export const BIND_HINT_TEXT = '也可以对 AI 说「这个项目对应 TAPD 的某某项目」'
export const BIND_PREFIX = 'bind:'
export const BIND_CONFIRM_PREFIX = 'bindok:'
export const NO_PROGRESS_TEXT = '暂无进行中任务'
export const ACTION_REFRESH = 'refresh'
export const ACTION_SCOPE = 'scope'
export const ACTION_ITERATION = 'iteration'
export const ITERATION_PREFIX = 'iter:'
/**
 * 面板标题：引擎只有一个面板时不画标签标题，所以在第一行自己画；字号改不了，字间加空格把标题撑大。
 * 标题按档案里的名字算（名字 + AI工作台），改名后下一次绘制就换。
 * @param name 工作台名字
 * @returns 字间加了空格的全称，如「小 小 黎 A I 工 作 台」
 */
export const spacedTitleOf = (name: string): string => [...fullNameOf(name)].join(' ')
/** 默认名的标题与字间加空格的写法 */
export const BOARD_TITLE = fullNameOf(DEFAULT_NAME)
export const BOARD_TITLE_SPACED = spacedTitleOf(DEFAULT_NAME)
/** 首次引导：还没起名时排在面板最上方的两行，各自整行可点 */
export const ACTION_SETUP_START = 'setup:start'
export const ACTION_SETUP_SKIP = 'setup:skip'
export const SETUP_GUIDE_TEXT = '第一次用？给工作台起个名字'
export const SETUP_SKIP_HINT_TEXT = '不设也能照常用'
export const SETUP_START_TEXT = '[ 开始设置 ]'
export const SETUP_SKIP_TEXT = '[ 先不设 ]'
export const TODO_PREFIX = 'todo:'
export const START_PREFIX = 'start:'
export const ACTION_LAUNCH_COPY = 'launch:copy'
export const ACTION_LAUNCH_CLOSE = 'launch:close'
/** 进出沉浸：点「进行中」标题行切换 */
export const ACTION_FOCUS = 'focus'
export const FOCUS_ENTER_TEXT = '[ 沉浸 ]'
export const FOCUS_EXIT_TEXT = '[ 退出沉浸 ]'
/** 任务挂在需求下时整体缩进 4 列，里面画 ASCII 连接符，避开宽度有歧义的制表符 */
const CHILD_PREFIX = ' |- '
/*
 * 配色只用主题键，不用 'error' 红色：可点的动作与当前选中项用品牌强调色，未选中的备选项用 subtle，
 * 计数与刷新时间用 inactive，提示与错误用 warning
 */
const ACCENT = 'suggestion'
const OPTION = 'subtle'
const META = 'inactive'
const NOTICE = 'warning'
const SEPARATOR = 'subtle'
/** 已完成的步骤、任务、模块：灰色加删除线；未开始的：弱化 */
const DONE_STYLE: Omit<SegType, 'text'> = { color: META, strike: true }
const TODO_STYLE: Omit<SegType, 'text'> = { dim: true }
/** 进行中的标记，其余行同宽留空 */
const DOING_MARK = '> '
const IDLE_MARK = '  '
/** 树状展开：第二级从步骤名下面起、每级往右缩两格；中间项 ├─、最后一项 └─，没结束的上级在下一级前面接 │ */
const TREE_INDENT = '     '
const TREE_MID = '├─'
const TREE_LAST = '└─'
const TREE_PIPE = '│ '
const TREE_BLANK = '  '
/** 选中行的样式：只给文字上色加粗，不用 inverse 或 backgroundColor 铺底 */
const SELECTED_STYLE: Omit<SegType, 'text'> = { color: ACCENT, bold: true }
/** 分隔用的空行，留一个空格保证占满一行 */
const BLANK_LINE: BoardLineType = { segList: [{ text: ' ' }] }
/** 类型标颜色；连接符用父需求的颜色 */
const STORY_COLOR = 'suggestion'
const KIND_MARK: Record<TodoKind, SegType> = {
    story: { text: '需', color: STORY_COLOR },
    task: { text: '任', color: 'success' },
    bug: { text: '缺', color: 'warning' }
}
/** ID 用正常色加 dim：亮度介于标题（text）与时间（inactive）之间 */
const ID_STYLE: Omit<SegType, 'text'> = { color: 'text', dim: true }
/** 右侧三列定宽、右对齐：状态 12 列、优先级 2 列、日期 5 列，列间 1 空格 */
const STATUS_WIDTH = 12
const PRIORITY_WIDTH = 2
const DATE_WIDTH = 5
const RIGHT_WIDTH = 1 + STATUS_WIDTH + 1 + PRIORITY_WIDTH + 1 + DATE_WIDTH
/** 开工态标在 ID 后面：只有点了「开工」才离开待开工 */
const START_MARK: Record<TodoStartState, SegType> = {
    waiting: { text: '待开工 ', color: META },
    started: { text: '开工中 ', color: ACCENT, bold: true },
    done: { text: '已完成 ', color: META }
}
/** 选中后确认行的按钮字；已完成的另按种类定（见 startButtonOf） */
const START_BUTTON: Record<Exclude<TodoStartState, 'done'>, string> = { waiting: '开工', started: '继续' }
/** 要用户确认的步骤后面跟的标记 */
const CONFIRM_MARK: SegType = { text: '【待确认】', color: NOTICE, bold: true }
/** 面板内边距：顶部空 1 行，左右各空 1 列 */
const PAD_LEFT = ' '
const PAD_X = 2
/** 截断收尾用 ASCII，避开「…」在部分字体下宽度不定 */
const ELLIPSIS = '..'
/** 运行环境的 Date 可能固定为 UTC，偏移为 0 时按东八区算 */
const FALLBACK_OFFSET_MIN = 480
/** 中日韩文字与全角符号，终端里占 2 列 */
const WIDE_CHAR = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/

const charWidth = (ch: string): number => (WIDE_CHAR.test(ch) ? 2 : 1)

/**
 * 文字在终端里占几列：中日韩与全角 2 列，其余 1 列。
 * @param text 文字
 * @returns 列数
 */
export const displayWidth = (text: string): number => [...text].reduce((sum, ch) => sum + charWidth(ch), 0)

/** 按显示宽度硬截，不加收尾 */
const cutWidth = (text: string, width: number): string => {
    let out = ''
    let used = 0
    for (const ch of text) {
        if (used + charWidth(ch) > width) break
        out += ch
        used += charWidth(ch)
    }

    return out
}

/**
 * 按显示宽度截断，超出时末尾换成 ASCII 的 ..。
 * @param text 文字
 * @param width 最多几列
 * @returns 不超过 width 列的文字
 */
export const fitWidth = (text: string, width: number): string => {
    if (width <= 0) return ''
    if (displayWidth(text) <= width) return text
    if (width <= ELLIPSIS.length) return cutWidth(text, width)

    return `${cutWidth(text, width - ELLIPSIS.length)}${ELLIPSIS}`
}

/** 按显示宽度右侧补空格到 width 列 */
const padEndWidth = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - displayWidth(text)))
/** 按显示宽度左侧补空格到 width 列，用于右对齐 */
const padStartWidth = (text: string, width: number): string => ' '.repeat(Math.max(0, width - displayWidth(text))) + text

/**
 * 一行所有段落合起来截到 width 列，保留每段的样式。
 * @param segList 一行的段落
 * @param width 最多几列
 * @returns 截断后的段落
 */
export const fitLine = (segList: readonly SegType[], width: number): SegType[] => {
    const out: SegType[] = []
    let left = width
    for (const seg of segList) {
        if (left <= 0) break
        const text = displayWidth(seg.text) <= left ? seg.text : fitWidth(seg.text, left)
        out.push({ ...seg, text })
        left -= displayWidth(text)
    }

    return out
}

/** 时间戳换成当地时间，按 UTC 字段读 */
const toLocal = (ms: number): Date => {
    const systemOffset = -new Date(ms).getTimezoneOffset()
    return new Date(ms + (systemOffset === 0 ? FALLBACK_OFFSET_MIN : systemOffset) * 60_000)
}
const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * 时间戳的当地时分。
 * @param ms 毫秒时间戳
 * @returns HH:MM
 */
export const clockText = (ms: number): string => {
    const local = toLocal(ms)

    return `${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`
}

/**
 * 时间戳的当地日期，用来判断今天落在哪个迭代。
 * @param ms 毫秒时间戳
 * @returns YYYY-MM-DD
 */
export const todayText = (ms: number): string => {
    const local = toLocal(ms)

    return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`
}

/**
 * 「本项目」视图下实际用来筛选的迭代；「全部项目」视图与选了全部时不筛。
 * @param iteration 迭代筛选的状态
 * @param scope 待办视图
 * @returns 迭代 ID，'' 为不筛
 */
export const iterationFilterId = (iteration: IterationStateType, scope: TodoScope): string => {
    if (scope === 'all' || iteration.pick === 'all') return ''
    if (iteration.pick === 'current') return iteration.currentId

    return iteration.pick
}

/** 预计开始只显示月-日，没填为 -- */
const dateText = (date: string): string => (/^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(5, 10) : '--')

/**
 * 待办一行：左边前缀（任务的连接符）、类型标、短 ID、标题，右边定宽右对齐的状态、优先级、预计开始。
 * 标题列宽 = 总宽 − 左边前缀 − 右侧三列与间隔，先算好再按显示宽度截断，右侧三列不会被标题挤走。
 * @param options 待办、可用列数、是否被点中、是否挂在需求下
 * @returns 一行
 */
export const todoLine = ({ todo, width, selected, isChild, startState = 'waiting' }: TodoLineOptionsType): BoardLineType => {
    const id = shortId(todo.id, todo.workspaceId)
    const mark = KIND_MARK[todo.kind]
    const state = START_MARK[startState]
    const prefix = isChild ? CHILD_PREFIX : ''
    const headWidth = displayWidth(prefix) + displayWidth(mark.text) + displayWidth(` ${id} `) + displayWidth(state.text)
    const titleWidth = Math.max(0, width - headWidth - RIGHT_WIDTH)
    const status = padStartWidth(fitWidth(todo.status, STATUS_WIDTH), STATUS_WIDTH)
    const priority = padStartWidth(cutWidth(priorityText(todo.priority), PRIORITY_WIDTH), PRIORITY_WIDTH)
    const begin = padStartWidth(dateText(todo.begin), DATE_WIDTH)
    const segList: SegType[] = [
        ...(isChild ? [{ text: CHILD_PREFIX, color: STORY_COLOR }] : []),
        mark,
        { text: ` ${id} `, ...ID_STYLE },
        state,
        { text: padEndWidth(fitWidth(todo.title, titleWidth), titleWidth), ...(todo.kind === 'story' ? { bold: true } : {}) },
        { text: ` ${status}`, dim: true },
        { text: ` ${priority}`, ...(priorityRank(todo.priority) <= 1 ? { color: 'warning', bold: true } : {}) },
        { text: ` ${begin}`, dim: true }
    ]
    const shown = selected ? segList.map(i => ({ text: i.text, ...SELECTED_STYLE })) : segList

    return { segList: fitLine(shown, width), action: `${TODO_PREFIX}${todo.id}` }
}

/** 标题行右侧的状态位：重试提示、错误、拉取中，都没有时是刷新时间 */
const statusSeg = (meta: TodoMetaType): SegType => {
    if (meta.retryCount) return { text: `正在连接 TAPD，第 ${meta.retryCount} 次重试`, color: NOTICE }
    if (meta.error) return { text: meta.error, color: NOTICE }
    if (meta.todoLoading) return { text: '拉取中...', color: META }

    return { text: meta.refreshedAt ? `刷新于 ${clockText(meta.refreshedAt)}` : '还没刷新', color: META }
}

/**
 * 左右两头排的一行：右边贴右内边距、优先保住，左边按剩下的宽度截断，中间补空格；宽到连右边都放不下时右边按 fitLine 截断。
 * 标题行、进行中区的标题行与首次引导都这样排。
 * @param leftList 左边的段落
 * @param rightList 右边的段落
 * @param width 可用列数
 * @param action 整行点中时的动作
 * @returns 一行
 */
const edgeLine = (leftList: readonly SegType[], rightList: readonly SegType[], width: number, action: string): BoardLineType => {
    const right = fitLine(rightList, width)
    const rightWidth = displayWidth(right.map(i => i.text).join(''))
    const left = fitLine(leftList, Math.max(0, width - rightWidth - 1))
    const gap = width - displayWidth(left.map(i => i.text).join('')) - rightWidth

    return { segList: [...left, { text: ' '.repeat(Math.max(0, gap)) }, ...right], action }
}

/**
 * 标题行：左边拉开字距的标题（按档案里的名字）与项目名，右边贴右内边距放「[ 刷新 ]」与状态位；整行点击 = 刷新。
 * 右边优先保住，左边按剩下的宽度截断。
 */
const headerLine = ({ title, name, showStatus, meta, width, noCurrent }: HeaderOptionsType): BoardLineType => {
    const rightList: SegType[] = showStatus ? [{ text: ' ' }, statusSeg(meta)] : []
    const leftList: SegType[] = [
        { text: title, ...SELECTED_STYLE },
        { text: ` · ${name}` },
        ...(noCurrent ? [{ text: ' · 无当前迭代，显示全部', color: NOTICE }] : [])
    ]

    return edgeLine(leftList, [{ text: '[ 刷新 ]', ...SELECTED_STYLE }, ...rightList], width, ACTION_REFRESH)
}

/**
 * 首次引导：还没起名时排在面板最上方。点击只认行号，两个按钮各占一行：
 * 第一行说明加「[ 开始设置 ]」（点它让 AI 来问名字），第二行「不设也能照常用」加「[ 先不设 ]」（点它不再提示）。
 * @param width 可用列数
 * @returns 两行
 */
const setupGuideLines = (width: number): BoardLineType[] => [
    edgeLine([{ text: SETUP_GUIDE_TEXT, color: NOTICE, bold: true }], [{ text: SETUP_START_TEXT, ...SELECTED_STYLE }], width, ACTION_SETUP_START),
    edgeLine([{ text: SETUP_SKIP_HINT_TEXT, color: META }], [{ text: SETUP_SKIP_TEXT, color: OPTION }], width, ACTION_SETUP_SKIP)
]

/** 标题下的分隔线：ASCII - 铺满可用宽度 */
const separatorLine = (width: number): BoardLineType => ({ segList: [{ text: '-'.repeat(width), color: SEPARATOR }] })

/** 迭代名，列表里找不到时为 '' */
const iterationName = (iteration: IterationStateType, id: string): string => iteration.list.find(i => i.id === id)?.name ?? ''

/** 迭代行上显示的当前选择 */
const pickLabel = (iteration: IterationStateType): string => {
    if (iteration.pick === 'all') return '全部'
    if (iteration.pick !== 'current') return iterationName(iteration, iteration.pick) || '已选迭代'

    /* 迭代没拉到时本迭代 ID 为空，列表实际没按迭代筛，如实写明 */
    if (!iteration.loaded) return '本迭代（迭代未加载，暂显示全部）'

    return iteration.currentId ? `本迭代（${iterationName(iteration, iteration.currentId)}）` : '本迭代（无，显示全部）'
}

/** 迭代筛选：一行当前选择，点开后列出本迭代、全部与最近的迭代 */
const iterationLines = (iteration: IterationStateType, width: number): BoardLineType[] => {
    const head: BoardLineType = {
        segList: fitLine(
            [
                { text: '迭代：', color: ACCENT },
                { text: pickLabel(iteration), color: ACCENT, bold: true },
                { text: iteration.listShow ? ' ▾' : ' ▸', color: ACCENT }
            ],
            width
        ),
        action: ACTION_ITERATION
    }
    if (!iteration.listShow) return [head]

    const optionList = [
        { pick: 'current', text: '本迭代' },
        { pick: 'all', text: '全部' },
        ...iteration.list.slice(0, ITERATION_LIMIT).map(i => ({
            pick: i.id,
            text: `${i.name}  ${dateText(i.startdate)}~${dateText(i.enddate)}`
        }))
    ]
    const lineList = optionList.map(option => {
        const isOn = option.pick === iteration.pick
        const segList: SegType[] = [
            { text: isOn ? '  * ' : '    ', color: ACCENT },
            { text: option.text, ...(isOn ? SELECTED_STYLE : { color: OPTION }) }
        ]
        return { segList: fitLine(segList, width), action: `${ITERATION_PREFIX}${option.pick}` }
    })

    return [head, ...lineList]
}

/** 视图切换按钮：当前视图高亮 */
const scopeLine = (meta: TodoMetaType, width: number): BoardLineType => {
    const pick = (isOn: boolean): Omit<SegType, 'text'> => (isOn ? SELECTED_STYLE : { color: OPTION })
    const segList: SegType[] = [
        { text: '[ 切换：', color: ACCENT },
        { text: '本项目', ...pick(meta.scope === 'project') },
        { text: ' / ', color: ACCENT },
        { text: '全部项目', ...pick(meta.scope === 'all') },
        { text: ' ]', color: ACCENT }
    ]

    return { segList: fitLine(segList, width), action: ACTION_SCOPE }
}

/**
 * 待办的开工态：本项目状态文件里有这个条目就是开工中，做完是已完成；某一步下挂着的 TAPD 任务按它自己的状态，进行中为开工中、做完为已完成、未开始为待开工；其余待开工。
 * 条目与待办按短 ID 与 TAPD 项目 ID 对应：两边都记了项目 ID 要求相同，条目没记只看短 ID（见 findTask）。
 * @param todo 待办
 * @param taskList 进行中条目
 * @returns 开工态
 */
export const startStateOf = (todo: TodoType, taskList: readonly ProgressTaskType[]): TodoStartState => {
    const id = shortId(todo.id, todo.workspaceId)
    const task = findTask(taskList, id, todo.workspaceId)
    if (task !== undefined) return isTaskDone(task) ? 'done' : 'started'

    /* 第二级也可能是自定义阶段（如「自测」），它的 id 不是纯数字，与待办的短 ID 天然不撞 */
    const stepTask = findStepTask(taskList, id, todo.workspaceId)?.stepTask
    if (stepTask === undefined) return 'waiting'

    if (stepTask.status === 'done') return 'done'
    return stepTask.status === 'doing' ? 'started' : 'waiting'
}

/**
 * 选中后确认行的按钮字：待开工「开工」、开工中「继续」；已完成的 TAPD 任务可以「重新做」，
 * 已完成的缺陷只有 TAPD 上重新打开时才能「重新开工」，已完成的需求（及没重新打开的缺陷）不能重新开工。
 * 面板排确认行与 hooks 确认开工都按这一条判断。
 * @param todo 待办
 * @param startState 开工态
 * @returns 按钮字，不能开工为 undefined
 */
export const startButtonOf = (todo: TodoType, startState: TodoStartState): string | undefined => {
    if (startState !== 'done') return START_BUTTON[startState]
    if (todo.kind === 'task') return '重新做'

    return isReopenedBug(todo) ? '重新开工' : undefined
}

/**
 * 开工别的 TAPD 项目的待办时的说明：待办所属项目与当前绑定的项目不同才有。
 * @param todo 待办
 * @param input 排版所需的全部状态
 * @returns 说明，属于当前绑定项目为 ''
 */
const otherProjectNote = (todo: TodoType, input: BoardInputType): string => {
    if (input.config === null || todo.workspaceId === input.config.tapdWorkspaceId) return ''

    return `属于「${todo.workspaceName || todo.workspaceId}」，将在当前仓库（${input.workplace?.name ?? ''}）开工`
}

/**
 * 选中待办下面的确认行：能开工时一行可点的「[ 开工 <ID> ]」（按钮字见 startButtonOf），别的 TAPD 项目的待办再写明所属项目与开工的仓库，
 * 放得下跟在按钮同一行，放不下另起一行（不可点）；不能重新开工时为一行不可点的说明。
 * @param todo 待办
 * @param startState 开工态
 * @param input 排版所需的全部状态
 * @param width 可用列数
 * @returns 确认行
 */
const confirmLines = (todo: TodoType, startState: TodoStartState, input: BoardInputType, width: number): BoardLineType[] => {
    const button = startButtonOf(todo, startState)
    if (button === undefined) return [{ segList: fitLine([{ text: `  ${NO_RESTART_TEXT}`, color: META }], width) }]

    const action = `${START_PREFIX}${todo.id}`
    const buttonSeg: SegType = { text: `  [ ${button} ${todo.id} ]`, color: ACCENT, bold: true }
    const note = otherProjectNote(todo, input)
    if (note === '') return [{ segList: fitLine([buttonSeg], width), action }]
    if (displayWidth(`${buttonSeg.text}  ${note}`) <= width) return [{ segList: [buttonSeg, { text: `  ${note}`, color: NOTICE }], action }]

    return [
        { segList: fitLine([buttonSeg], width), action },
        { segList: fitLine([{ text: `    ${note}`, color: NOTICE }], width) }
    ]
}

/** 待办区：标题行、按迭代筛过并级联的每条待办，选中的那条下面跟开工确认（见 confirmLines） */
const todoSection = (input: BoardInputType, width: number): BoardLineType[] => {
    const meta = input.todoMeta
    const shownList = filterByIteration(input.todoList, iterationFilterId(input.iteration, meta.scope))
    const title: BoardLineType = { segList: fitLine([{ text: '待办', bold: true }, { text: `（${shownList.length}）`, color: META }], width) }
    if (!shownList.length) {
        const empty = meta.retryCount && !meta.refreshedAt ? '正在连接 TAPD...' : meta.todoLoading && !meta.refreshedAt ? '拉取中...' : '暂无待办'
        return [title, { segList: [{ text: empty, dim: true }] }]
    }

    const lineList = cascadeTodos(shownList).flatMap(({ todo, isChild }) => {
        const selected = todo.id === input.selectedId
        const startState = startStateOf(todo, input.progress.taskList)
        const line = todoLine({ todo, width, selected, isChild, startState })
        if (!selected) return [line]

        return [line, ...confirmLines(todo, startState, input, width)]
    })

    return [title, ...lineList]
}

/**
 * 绑定列表：全局模式下项目还没绑定 TAPD 时代替待办区。提示一行，参与的项目每个一行（项目名、项目 ID），
 * 点中的那个高亮，下面跟一行「[ 绑定 <项目名> ]」确认；末尾提示也可以让 AI 绑定。
 * @param binding 绑定列表的状态
 * @param meta 拉取状态，空态文案用
 * @param width 可用列数
 * @returns 每一行
 */
const bindSection = (binding: BindStateType, meta: TodoMetaType, width: number): BoardLineType[] => {
    const title: BoardLineType = { segList: fitLine([{ text: NO_BINDING_TEXT, color: NOTICE, bold: true }], width) }
    const hint: BoardLineType = { segList: fitLine([{ text: BIND_HINT_TEXT, color: META }], width) }
    if (!binding.list.length) {
        const isConnecting = meta.retryCount && !binding.loaded
        const empty = isConnecting ? '正在连接 TAPD...' : meta.todoLoading && !binding.loaded ? '拉取参与的 TAPD 项目...' : '没拉到参与的 TAPD 项目，点标题行刷新'
        return [title, { segList: fitLine([{ text: empty, dim: true }], width) }, hint]
    }

    const lineList = binding.list.flatMap(project => {
        const name = project.name || project.id
        const selected = project.id === binding.selectedId
        const segList: SegType[] = [{ text: '  ' }, { text: name, bold: true }, { text: `  ${project.id}`, ...ID_STYLE }]
        const line: BoardLineType = {
            segList: fitLine(selected ? segList.map(i => ({ text: i.text, ...SELECTED_STYLE })) : segList, width),
            action: `${BIND_PREFIX}${project.id}`
        }
        if (!selected) return [line]

        const confirm: BoardLineType = {
            segList: fitLine([{ text: `    [ 绑定 ${name} ]`, color: ACCENT, bold: true }], width),
            action: `${BIND_CONFIRM_PREFIX}${project.id}`
        }
        return [line, confirm]
    })

    return [title, { segList: fitLine([{ text: BIND_PICK_TEXT, color: META }], width) }, ...lineList, hint]
}

/**
 * 按显示宽度把一段文字折成几行，不加收尾，用于整条显示的启动命令。
 * @param text 文字
 * @param width 每行最多几列
 * @returns 每行文字
 */
export const wrapWidth = (text: string, width: number): string[] => {
    if (width <= 0) return []

    const lineList: string[] = []
    let rest = text
    while (rest !== '') {
        const head = cutWidth(rest, width) || [...rest][0] || ''
        lineList.push(head)
        rest = rest.slice(head.length)
    }

    return lineList
}

/** 启动命令的种类怎么说：建 worktree 与分支的新会话、在项目目录不建分支的新会话、回到已有会话 */
const LAUNCH_KIND_TEXT: Record<LaunchType['kind'], string> = { new: '新会话', here: '新会话（项目目录，不建分支）', resume: '回到已有会话' }

/**
 * 启动命令区：说明（第几条、哪种新会话还是回到已有会话、复制结果与到哪里粘贴，粘贴的说法按命令写法），放不下一行时复制结果另起一行；
 * 整条命令折行显示；再复制与收起各一行。
 */
const launchLines = (launch: LaunchType, width: number): BoardLineType[] => {
    const kindText = LAUNCH_KIND_TEXT[launch.kind]
    const copyText = launch.isCopied ? `已复制，${PASTE_TEXT[launch.shell ?? 'powershell']}` : '复制失败，从对话里那行复制'
    const title: SegType = { text: `启动命令 ${launch.id} · ${kindText}`, color: ACCENT, bold: true }
    const copy: SegType = { text: `  ${copyText}`, color: NOTICE }
    const headLines: BoardLineType[] =
        displayWidth(`${title.text}${copy.text}`) <= width
            ? [{ segList: [title, copy] }]
            : [{ segList: fitLine([title], width) }, { segList: fitLine([copy], width) }]
    const commandLines = wrapWidth(launch.command, Math.max(1, width - 2)).map(i => ({ segList: [{ text: `  ${i}`, dim: true }] }))

    return [
        ...headLines,
        ...commandLines,
        { segList: fitLine([{ text: '  [ 再复制一次 ]', color: ACCENT, bold: true }], width), action: ACTION_LAUNCH_COPY },
        { segList: fitLine([{ text: '  [ 收起 ]', color: OPTION }], width), action: ACTION_LAUNCH_CLOSE }
    ]
}

/** 已完成的一项：名字灰色加删除线，后跟不划线的标记 */
const doneSegs = (text: string, mark = '【已完成】'): SegType[] => [
    { text, ...DONE_STYLE },
    { text: mark, color: META }
]

/** 需求的标题行：ID、标题、分支，等用户时跟醒目的等待标记 */
const taskHead = (task: ProgressTaskType, width: number): BoardLineType => {
    const branch: SegType[] = task.branch ? [{ text: ` · ${task.branch}`, color: META }] : []
    const waiting: SegType[] = task.waiting ? [{ text: `  ${WAITING_TEXT[task.waiting]}`, color: NOTICE, bold: true }] : []

    return { segList: fitLine([KIND_MARK[task.kind], { text: ` ${task.id} `, ...ID_STYLE }, { text: task.title, bold: true }, ...branch, ...waiting], width) }
}

/** 树状展开的一行：前缀是缩进与连接符，后面是这一项的段落 */
const treeLine = (prefix: string, segList: readonly SegType[], width: number): BoardLineType => ({
    segList: fitLine([{ text: prefix, color: SEPARATOR }, ...segList], width)
})

/** 连接符：中间项 ├─，最后一项 └─；下一级在没结束的上级下面接 │ */
const branchMark = (isLast: boolean): string => (isLast ? TREE_LAST : TREE_MID)

/**
 * 任务下的模块，第三级：做完的灰色划掉，第一个没做完的高亮，其余弱化。
 * @param task 步骤下的任务
 * @param parentPrefix 上一级留下的缩进（含 │）
 * @param width 可用列数
 * @returns 每个模块一行
 */
const moduleLines = (task: StepTaskType, parentPrefix: string, width: number): BoardLineType[] => {
    const moduleList = task.modules ?? []
    const currentIndex = moduleList.findIndex(i => !isModuleDone(i))

    return moduleList.map((module, index) => {
        const prefix = `${parentPrefix}${branchMark(index === moduleList.length - 1)}`
        if (isModuleDone(module)) return treeLine(prefix, doneSegs(module.name, ` ${module.done}/${module.total}`), width)
        if (index === currentIndex) return treeLine(prefix, [{ text: moduleLabel(module), color: ACCENT, bold: true }], width)

        return treeLine(prefix, [{ text: moduleLabel(module), ...TODO_STYLE }], width)
    })
}

/**
 * 慢环节下的 TAPD 任务或自定义阶段，第二级：做完的划掉，进行中的高亮并展开它的模块，未开始的弱化。
 * @param step 进行中的步骤
 * @param width 可用列数
 * @returns 任务与模块的行
 */
const stepTaskLines = (step: ProgressStepType, width: number): BoardLineType[] => {
    const taskList = step.tasks ?? []

    return taskList.flatMap((task, index) => {
        const isLast = index === taskList.length - 1
        const prefix = `${TREE_INDENT}${branchMark(isLast)}`
        if (task.status === 'done') return [treeLine(prefix, doneSegs(task.title), width)]
        if (task.status === 'todo') return [treeLine(prefix, [{ text: task.title, ...TODO_STYLE }], width)]

        const head = treeLine(prefix, [{ text: task.detail ? `${task.title}-${task.detail}` : task.title, color: ACCENT, bold: true }], width)
        return [head, ...moduleLines(task, `${TREE_INDENT}${isLast ? TREE_BLANK : TREE_PIPE}`, width)]
    })
}

/** 一步一行，第一级：序号对应工作流 ①–⑪（缺陷 1–6）；做完的折成「步骤【已完成】」，进行中的高亮（慢环节再往下展开两级），未开始的弱化 */
const stepLines = (step: ProgressStepType, index: number, width: number): BoardLineType[] => {
    const no = `${String(index + 1).padStart(2)} `
    const confirm = step.confirm ? [CONFIRM_MARK] : []
    if (step.status === 'done') return [{ segList: fitLine([{ text: `${IDLE_MARK}${no}`, color: META }, ...doneSegs(step.title)], width) }]
    if (step.status === 'todo') return [{ segList: fitLine([{ text: `${IDLE_MARK}${no}${stepLabel(step)}`, ...TODO_STYLE }, ...confirm], width) }]

    const head: BoardLineType = { segList: fitLine([{ text: `${DOING_MARK}${no}${doingText(step)}`, color: ACCENT, bold: true }, ...confirm], width) }
    return isSlowStep(step) ? [head, ...stepTaskLines(step, width)] : [head]
}

/** 展开的需求：标题行、备注、11 步（进行中的慢环节再下两级） */
const expandedLines = (task: ProgressTaskType, width: number): BoardLineType[] => {
    const note: BoardLineType[] = task.note ? [{ segList: fitLine([{ text: `  备注：${task.note}`, color: META }], width) }] : []

    return [taskHead(task, width), ...note, ...task.steps.flatMap((step, index) => stepLines(step, index, width))]
}

/** 别的会话的需求折成一行：需求名 · 当前步 · 子项 */
const foldedLine = (task: ProgressTaskType, width: number): BoardLineType => {
    const current = currentStep(task)
    const sub = current === undefined ? '' : stepSub(current.step)
    const where = current === undefined ? '' : ` · ${current.step.title}${sub ? ` · ${sub}` : ''}`
    const confirm = current?.step.confirm ? [CONFIRM_MARK] : []
    const waiting: SegType[] = task.waiting ? [{ text: `  ${WAITING_TEXT[task.waiting]}`, color: NOTICE, bold: true }] : []

    return {
        segList: fitLine([KIND_MARK[task.kind], { text: ` ${task.id} `, ...ID_STYLE }, { text: task.title }, { text: where, color: META }, ...confirm, ...waiting], width)
    }
}

/** 做完的需求折成一行，灰色划掉 */
const doneTaskLine = (task: ProgressTaskType, width: number): BoardLineType => ({
    segList: fitLine([KIND_MARK[task.kind], { text: ` ${task.id} `, ...ID_STYLE }, ...doneSegs(task.title)], width)
})

/**
 * 进行中区的标题行：左边「进行中（n）」，右边贴右内边距放沉浸按钮，整行点击 = 进出沉浸。
 * 写法同标题行：右边优先保住，左边按剩下的宽度截断；宽到连按钮都放不下时按 fitLine 截断。
 */
const progressTitleLine = (count: number, isFocus: boolean, width: number): BoardLineType =>
    edgeLine(
        [{ text: '进行中', bold: true }, { text: `（${count}）`, color: META }],
        [{ text: isFocus ? FOCUS_EXIT_TEXT : FOCUS_ENTER_TEXT, color: ACCENT, bold: true }],
        width,
        ACTION_FOCUS
    )

/** 进行中区的排版参数 */
interface ProgressSectionOptionsType {
    /** state.json 读到的内容 */
    progress: ProgressType
    /** 当前会话 ID */
    sessionId: string
    /** 当前会话是否在主工作区：没记会话的旧条目归主工作区的会话 */
    isMainCheckout: boolean
    /** 是否沉浸，定标题行右边的按钮字 */
    isFocus: boolean
    /** 可用列数 */
    width: number
}

/**
 * 进行中区：当前会话的条目展开到步骤、任务、模块三级（没记会话的旧条目按 ownsTask 归主工作区的会话）；
 * 别的会话的条目折成一行「需求名 · 当前步 · 子项」；11 步都做完的条目折成一行。
 * @param options 状态文件内容、会话 ID、是否主工作区、是否沉浸、可用列数
 * @returns 每一行
 */
const progressSection = ({ progress, sessionId, isMainCheckout, isFocus, width }: ProgressSectionOptionsType): BoardLineType[] => {
    const title = progressTitleLine(progress.taskList.length, isFocus, width)
    const errorLine: BoardLineType[] = progress.error
        ? [{ segList: fitLine([{ text: progress.error, color: NOTICE }], width) }]
        : []
    if (!progress.taskList.length) return [title, ...errorLine, { segList: [{ text: NO_PROGRESS_TEXT, dim: true }] }]

    const lineList = progress.taskList.flatMap(task => {
        if (isTaskDone(task)) return [doneTaskLine(task, width)]
        if (!ownsTask(task, sessionId, isMainCheckout)) return [foldedLine(task, width)]

        return expandedLines(task, width)
    })

    return [title, ...errorLine, ...lineList]
}

/** 给内容加内边距：顶部一行空行（无动作），每行左边 1 列空格 */
const withPadding = (lineList: readonly BoardLineType[]): BoardLineType[] => [
    BLANK_LINE,
    ...lineList.map(line => ({ ...line, segList: [{ text: PAD_LEFT }, ...line.segList] }))
]

/** 沉浸时的面板：只有标题行、分隔线、空行与进行中区 */
const focusBoard = (header: BoardLineType, progressLines: readonly BoardLineType[], width: number): BoardLineType[] =>
    withPadding([header, separatorLine(width), BLANK_LINE, ...progressLines])

/**
 * 把面板排成一行一行：顶部空行、首次引导（还没起名时两行加一行空行）、标题（含刷新）、分隔线、空行、切换、迭代筛选（仅本项目）、
 * 待办区、启动命令、进行中区；没有 TAPD 配置时：全局模式待办区换成绑定列表，项目内模式换成一行提示；记着不用 TAPD 的项目（全局模式
 * systems.tapd 为 false）待办区换成两行说明，不列 TAPD 项目；进行中区照常读本项目的状态文件。
 * 沉浸时只排标题、分隔线、空行与进行中区，首次引导、切换、迭代、待办（或绑定列表、没配提示）、启动命令都不排。
 * 标题按档案里的名字算；标题行的项目名设了显示名就用它。左右各留 1 列内边距，内容按总宽减 2 排。
 * @param input 排版所需的全部状态
 * @param columns 面板列数
 * @returns 每一行，下标就是 Client 里的行号
 */
export const buildBoard = (input: BoardInputType, columns: number): BoardLineType[] => {
    const width = Math.max(0, columns - PAD_X)
    const meta = input.todoMeta
    const title = spacedTitleOf(input.name ?? DEFAULT_NAME)
    const sessionId = input.workplace?.sessionId ?? ''
    const isMainCheckout = input.workplace?.isMainCheckout ?? true
    const progressLines = progressSection({ progress: input.progress, sessionId, isMainCheckout, isFocus: input.isFocus, width })
    const launch = input.launch === null ? [] : [BLANK_LINE, ...launchLines(input.launch, width)]
    /* 沉浸时不排引导，免得挡住进行中的任务；起名入口还有 /xiaoxiaoli setup 与会话启动时的提示 */
    const guide = input.isSetupPending ? [...setupGuideLines(width), BLANK_LINE] : []
    const noticeLines = (textList: readonly string[]) => textList.map(text => ({ segList: fitLine([{ text, color: NOTICE }], width) }))
    /* 项目设了显示名就用它；没设时没绑定的用目录名、绑定了的用 TAPD 项目名（照旧） */
    const displayName = input.workplace?.displayName ?? ''
    /* 记着不用 TAPD（全局模式 systems.tapd 为 false）：不列 TAPD 项目、不拉待办，待办区换成两行说明，进行中区照常 */
    if (input.workplace?.mode === 'global' && input.workplace.systems?.tapd === false) {
        const name = displayName || input.config?.projectName || input.workplace.name
        const header = headerLine({ title, name, showStatus: false, meta, width, noCurrent: false })
        if (input.isFocus) return focusBoard(header, progressLines, width)

        return withPadding([...guide, header, separatorLine(width), BLANK_LINE, ...noticeLines(TAPD_OFF_LINES), BLANK_LINE, ...progressLines])
    }
    if (input.config === null) {
        const name = displayName || (input.workplace?.name ?? '')
        const isBinding = input.workplace?.mode === 'global'
        const header = headerLine({ title, name, showStatus: isBinding, meta, width, noCurrent: false })
        if (input.isFocus) return focusBoard(header, progressLines, width)

        /* 项目里没有 config.json、只因取不到用户目录落不了全局：如实说明，不说「没配 TAPD」 */
        const noticeList: readonly string[] = input.workplace?.isGlobalRootMissing ? NO_GLOBAL_ROOT_LINES : [NO_CONFIG_TEXT]
        const body = isBinding ? bindSection(input.binding, meta, width) : noticeLines(noticeList)
        return withPadding([...guide, header, separatorLine(width), BLANK_LINE, ...body, BLANK_LINE, ...progressLines])
    }

    const iteration = input.iteration
    const isProject = meta.scope === 'project'
    const noCurrent = isProject && iteration.loaded && iteration.pick === 'current' && iteration.currentId === ''
    const shownName = isProject ? displayName || input.config.projectName : `全部项目（${meta.projectCount} 个）`
    const header = headerLine({ title, name: shownName, showStatus: true, meta, width, noCurrent })
    if (input.isFocus) return focusBoard(header, progressLines, width)

    return withPadding([
        ...guide,
        header,
        separatorLine(width),
        BLANK_LINE,
        scopeLine(meta, width),
        ...(isProject ? iterationLines(iteration, width) : []),
        BLANK_LINE,
        ...todoSection(input, width),
        ...launch,
        BLANK_LINE,
        ...progressLines
    ])
}
