/**
 * @description 小小黎的测试：排序、级联、迭代筛选、截断与排版、整行命中、state.json 新旧结构、步骤三级树状渲染、按会话折叠、
 * 多项目隔离、开工分流与启动命令、缺陷 6 步、进度工具、环境变量开关、TAPD 白名单，以及全局模式的查找顺序、绑定与解绑、开工消息，
 * 沉浸模式，以及 0.4.1 的缺陷修复（挂子项不回退、迭代失败如实提示、refresh 回复、写入失败提示、命令值校验、旧条目归属），
 * 0.4.2 的跨项目开工与项目 ID 对应、重新开工规则、bash/zsh 启动命令、取不到用户目录的文案，
 * 0.5.0 的起名与首次引导（名字规则、profile.json 容错、引导行与两个按钮、setup 工具与 name 命令、署名、改名后的标题与前缀），
 * 0.5.1 的首次使用自动发起设置引导（只发一次的标记、不打扰的条件、热重载与多会话），
 * 0.6.0 的工种与工作流（内置定义校验、三层查找与降级、按工作流建条目、不建分支的开工、workflow 工具、role 命令），
 * 0.7.0 的通用配置与项目差异（通用资料目录、displayName、systems、不用 TAPD、project 工具与命令），
 * 0.8.0 的体检与演练（两份文件的宽松读取、按工种筛依赖、演练文字与工作流配对、演练脚本、演示条目、guide 工具、三个入口、体检缺项），
 * 0.9.0 的自动更新（版本比较、CHANGELOG 截要点、安装方式、一天一查、两个地址回退、市场安装的更新与重载、本地目录只提示、不查的情况）
 * @author xiao li
 * @createDate 2026-10-21 18:20
 */
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { McpToolResult, On, ToolCallArgs, UiOpenResult } from 'claude-code'
import type {
    IterationStateType,
    IterationType,
    ProfileStateType,
    ProgressTaskType,
    ProgressType,
    StepKey,
    TodoMetaType,
    TodoType,
    WorkRole,
    WorkbenchConfigType,
    WorkplaceType
} from '../types'
import { BUILTIN_WORKFLOW_TEXTS } from './fixtures/workflows'
import { GUIDE_TEXTS } from './fixtures/guide'
import { actionAt } from '../hooks/board'
import type { BoardPropsType } from '../hooks/board'
import {
    ACTION_FOCUS,
    ACTION_ITERATION,
    ACTION_LAUNCH_CLOSE,
    ACTION_REFRESH,
    ACTION_SCOPE,
    ACTION_SETUP_SKIP,
    ACTION_SETUP_START,
    ACTION_TOUR_SKIP,
    ACTION_TOUR_START,
    BIND_HINT_TEXT,
    BOARD_TITLE,
    BOARD_TITLE_SPACED,
    FOCUS_ENTER_TEXT,
    FOCUS_EXIT_TEXT,
    NO_BINDING_TEXT,
    NO_CONFIG_TEXT,
    NO_GLOBAL_ROOT_TEXT,
    NO_RESTART_TEXT,
    TAPD_OFF_LINES,
    SETUP_GUIDE_TEXT,
    SETUP_SKIP_HINT_TEXT,
    SETUP_SKIP_TEXT,
    SETUP_START_TEXT,
    ENV_HINT_TEXT,
    TOUR_GUIDE_TEXT,
    TOUR_SKIP_HINT_TEXT,
    TOUR_SKIP_TEXT,
    TOUR_START_TEXT,
    buildBoard,
    clockText,
    displayWidth,
    fitWidth,
    spacedTitleOf,
    startButtonOf,
    startStateOf,
    todayText,
    todoLine,
    wrapWidth
} from '../hooks/layout'
import {
    DEFAULT_NAME,
    PROFILE_NEWER_TEXT,
    ROLE_TITLES,
    WORK_ROLES,
    checkName,
    fullNameOf,
    guidedByOf,
    isSetupPending,
    isTourOffered,
    isTourPending,
    nameOf,
    normalizeName,
    noticeText,
    parseProfile,
    profileText,
    roleOf,
    setupPrompt,
    toRole,
    tourPrompt
} from '../hooks/profile'
import type { BoardInputType, BoardLineType } from '../hooks/layout'
import {
    GLOBAL_GUIDE,
    signText,
    workflowGuide,
    herePrompt,
    hereSessionCommand,
    resourceDirsText,
    branchOf,
    isSessionId,
    isShortId,
    docsDirOf,
    newSessionCommand,
    resumeCommand,
    routeStart,
    shellOf,
    startPrompt,
    submitText,
    worktreeOf
} from '../hooks/launch'
import {
    bindConfigText,
    globalPlaceOf,
    globalRootOf,
    matchProject,
    projectKeyOf,
    toBindInput,
    unbindConfigText
} from '../hooks/binding'
import {
    TapdError,
    cascadeTodos,
    currentIterationId,
    fetchTodos,
    filterByIteration,
    isReopenedBug,
    readJson,
    readRows,
    shortId,
    sortTodos,
    toReadTool
} from '../hooks/tapd'
import type { TapdReadTool } from '../hooks/tapd'
import {
    BUG_STEPS,
    SLOW_STEP_KEYS,
    STORY_STEPS,
    applyProgress,
    findStepTask,
    findTask,
    isSlowStep,
    legacySteps,
    newTask,
    paneChange,
    parseConfig,
    parseModConfig,
    parseProgress,
    redoStepTask,
    resetTask,
    setStep,
    statusText,
    stepLabel,
    stringifyState,
    toProgressInput,
    upsertTask
} from '../hooks/workbench'
import {
    FALLBACK_WORKFLOW,
    checkWorkflow,
    flowOf,
    flowsOf,
    parseWorkflow,
    pickWorkflow,
    toWorkflowInput,
    workflowFileText,
    workflowText
} from '../hooks/workflow'
import {
    SHARED_README_TEXT,
    checkDisplayName,
    guideSummaryText,
    parseProjectExtras,
    projectConfigText,
    projectSummaryText,
    systemsText,
    toProjectChange
} from '../hooks/project'
import {
    DEMO_TITLE,
    checkReplyText,
    depsOfRole,
    envStateOf,
    envText,
    newDemoTask,
    parseDeps,
    parseEnv,
    parseTour,
    stepGuideOf,
    toCheckResults,
    toGuideInput,
    tourScript,
    tourStepsOf
} from '../hooks/guide'
import {
    CHANGELOG_FILE,
    CHECK_DELAY_MS,
    MANIFEST_FILE,
    WAIT_LIMIT,
    argvCandidates,
    changelogNotes,
    compareVersion,
    failedNotice,
    failureReason,
    installOf,
    isCheckedToday,
    isHeldByOther,
    isNewer,
    latestIsInstalled,
    localNotice,
    manifestVersion,
    parseVersion,
    runUpdateCheck,
    sourceUrls,
    updateCommandText,
    updateSteps,
    updatedNotice
} from '../hooks/update'
import type { RunResultType, UpdateNoticeType, UpdatePortsType } from '../hooks/update'

/* 以下全部是造的数据，不含任何真实 TAPD 内容 */
const WS = '90000001'
const WS2 = '90000003'
const CWD = 'D:/work/demo'
const OTHER_CWD = 'D:/work/other'
const CONFIG_FILE = `${CWD}/docs/xiaoli/local/workbench/config.json`
const STATE_FILE = `${CWD}/docs/xiaoli/local/workbench/state.json`
const OTHER_STATE_FILE = `${OTHER_CWD}/docs/xiaoli/local/workbench/state.json`
const CONFIG: WorkbenchConfigType = {
    projectName: '演示项目',
    tapdWorkspaceId: WS,
    statePath: 'docs/xiaoli/local/workbench/state.json',
    refreshMinutes: 10,
    branchTemplate: 'feat/{id}',
    bugBranchTemplate: 'fix/{id}',
    branchBase: 'origin/master'
}
const NOW = Date.UTC(2026, 9, 21, 2, 0)
const UPDATED = '2026-10-23T03:00:00.000Z'
const SESSION_ID = '00000000-0000-4000-8000-000000000001'
const OTHER_SESSION = '00000000-0000-4000-8000-000000000002'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const PROGRESS_TOOL = 'mcp__xiaoxiaoli__progress'
const PANE_PROPS = {
    title: '小小黎AI工作台',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 40 },
    view: {}
}
const WORKPLACE: WorkplaceType = {
    dir: CWD,
    name: 'demo',
    statePath: STATE_FILE,
    sessionId: SESSION_ID,
    isMainCheckout: true,
    mode: 'project',
    configPath: CONFIG_FILE,
    dataDir: '',
    projectKey: ''
}
/** 造的全局根目录，代替 ~/.claude/xiaoxiaoli，测试不碰真实用户目录 */
const GLOBAL_ROOT = 'D:/fake-home/.claude/xiaoxiaoli'
/** 造的通用资料目录 */
const SHARED = `${GLOBAL_ROOT}/shared`

const longId = (workspaceId: string, n: number) => `11${workspaceId}${String(n).padStart(9, '0')}`
const STORY_A = longId(WS, 1000101)
const STORY_B = longId(WS, 1000102)
const STORY_C = longId(WS, 1000103)
const TASK_A = longId(WS, 1000201)
const BUG_A = longId(WS2, 1000301)
/** 今天 2026-10-21 落在第二个迭代里 */
const IT_OLD = longId(WS, 2000)
const IT_CUR = longId(WS, 2001)
const IT_NEXT = longId(WS, 2002)

const textResult = (value: unknown): McpToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }], isError: false })
/** 返回字符串的工具被包成 { result: "<json>" } 的样子 */
const wrappedResult = (value: unknown): McpToolResult => textResult({ result: JSON.stringify(value) })
const ok = (data: unknown) => ({ status: 1, data, info: 'success' })

/** 造的 TAPD：两个项目；演示项目有三条需求（甲乙在本迭代，丙在上个迭代）、一条挂在甲下的任务，演示项目二有一条缺陷 */
const fakeTapd = (tool: string, args: Record<string, unknown>): McpToolResult => {
    const options = (args.options ?? {}) as Record<string, unknown>
    if (tool === 'get_user_participant_projects') {
        return wrappedResult(
            ok([
                { Workspace: { id: WS, name: '演示项目', category: 'project' } },
                { Workspace: { id: '90000002', name: '演示公司', category: 'organization' } },
                { Workspace: { id: WS2, name: '演示项目二', category: 'project' } }
            ])
        )
    }
    if (tool === 'get_todo' && args.workspace_id === Number(WS)) {
        if (args.entity_type === 'story') {
            return textResult(
                ok([
                    { Story: { id: STORY_A, name: '演示需求甲', status: 'status_2', priority: 'Middle' } },
                    { Story: { id: STORY_B, name: '演示需求乙', status: 'developing', priority: 'High' } },
                    { Story: { id: STORY_C, name: '演示需求丙', status: 'status_2', priority: 'Low' } }
                ])
            )
        }
        if (args.entity_type === 'task') return textResult(ok([{ Task: { id: TASK_A, name: '演示任务', status: 'open', priority: 'Low' } }]))
        return textResult(ok([]))
    }
    if (tool === 'get_todo' && args.workspace_id === Number(WS2)) {
        if (args.entity_type === 'bug') return textResult(ok([{ Bug: { id: BUG_A, title: '演示缺陷', status: 'new', priority: 'urgent' } }]))
        return textResult(ok([]))
    }
    if (tool === 'get_stories_or_tasks' && options.entity_type === 'stories') {
        return wrappedResult({
            data: [
                { Story: { id: STORY_A, status: 'status_2', priority_label: 'Middle', begin: '2026-10-20', due: '2026-10-25', iteration_id: IT_CUR } },
                { Story: { id: STORY_B, status: 'developing', priority_label: 'High', begin: null, due: null, iteration_id: IT_CUR } },
                { Story: { id: STORY_C, status: 'status_2', priority_label: 'Low', begin: null, due: null, iteration_id: IT_OLD } }
            ]
        })
    }
    if (tool === 'get_stories_or_tasks') {
        return wrappedResult({ data: [{ Task: { id: TASK_A, status: 'open', priority_label: 'Low', begin: '2026-10-22', due: null, story_id: STORY_A, iteration_id: '0' } }] })
    }
    if (tool === 'get_bug') return wrappedResult({ data: [{ Bug: { id: BUG_A, status: 'new', priority_label: 'urgent', begin: '2026-10-21' } }] })
    if (tool === 'get_iterations') {
        return textResult(
            ok([
                { Iteration: { id: IT_OLD, name: '演示迭代一', startdate: '2026-09-01', enddate: '2026-10-14', status: 'done' } },
                { Iteration: { id: IT_NEXT, name: '演示迭代三', startdate: '2026-10-29', enddate: '2026-11-11', status: 'open' } },
                { Iteration: { id: IT_CUR, name: '演示迭代二', startdate: '2026-10-15', enddate: '2026-10-28', status: 'open' } }
            ])
        )
    }
    if (tool === 'get_workflows_status_map') return textResult(ok({ status_2: '转开发', developing: '实现中', new: '新' }))

    return { content: [{ type: 'text', text: 'unexpected' }], isError: true }
}

const todo = (id: string, priority: string, begin = '', due = ''): TodoType => ({
    kind: 'story',
    id,
    title: `标题${id}`,
    status: '实现中',
    priority,
    begin,
    due,
    workspaceId: WS,
    storyId: '',
    iterationId: ''
})
const iterationOf = (id: string, startdate: string, enddate: string): IterationType => ({ id, name: `迭代${id}`, startdate, enddate })
const iterationDefault = (): IterationStateType => ({ list: [], currentId: '', pick: 'current', listShow: false, loaded: true })

const metaDefault = (): TodoMetaType => ({
    scope: 'project',
    refreshedAt: NOW,
    todoLoading: false,
    error: '',
    projectCount: 1,
    retryCount: 0
})
const boardInput = (patch: Partial<BoardInputType> = {}): BoardInputType => ({
    config: CONFIG,
    todoList: [todo(STORY_A, 'High', '2026-10-20')],
    todoMeta: metaDefault(),
    selectedId: '',
    progress: { taskList: [], error: '' },
    iteration: iterationDefault(),
    workplace: WORKPLACE,
    launch: null,
    binding: { list: [], loaded: false, selectedId: '' },
    isFocus: false,
    ...patch
})
const progressOf = (...taskList: ProgressTaskType[]): ProgressType => ({ taskList, error: '' })
/** 一行的文字，去掉左内边距的 1 列空格 */
const lineText = (line: BoardLineType) =>
    line.segList
        .map(i => i.text)
        .join('')
        .replace(/^ /, '')
/** 顶部空 1 行内边距后的固定行号 */
const HEADER_ROW = 1
/** 「刷新」并进了标题行，整行点击即刷新 */
const REFRESH_ROW = HEADER_ROW
const SEPARATOR_ROW = 2
const GAP_ROW = 3
const SCOPE_ROW = 4
const ITERATION_ROW = 5

/** 旧结构（v1）的 state.json：只有 step 与 stepName */
const legacyState = (step = 7, stepName = '上线后待修 4 条子代理进行中') =>
    JSON.stringify({ tasks: [{ id: '1046775', title: '1. 商家端-设计器模块', step, stepName, waiting: null, updatedAt: '2026-10-23T03:40:00.000Z' }] })

/** 需求条目：doing 那一步之前的全完成，之后的未开始 */
const storyTask = (id: string, title: string, doing: StepKey, patch: Partial<ProgressTaskType> = {}): ProgressTaskType => ({
    ...setStep({ id, kind: 'story', title, steps: legacySteps(1, ''), waiting: null, updatedAt: UPDATED }, { key: doing, status: 'doing', updatedAt: UPDATED }),
    ...patch
})

/** 按 mcp__xiaoxiaoli__progress 的参数连着改几次，参数或规则不对直接失败 */
const progressSteps = (taskList: ProgressTaskType[], rawList: Record<string, unknown>[], sessionId = SESSION_ID): ProgressTaskType[] =>
    rawList.reduce((list, raw) => {
        const input = toProgressInput(raw)
        if (typeof input === 'string') throw new Error(input)

        const result = applyProgress(list, input, { updatedAt: UPDATED, sessionId })
        if (typeof result === 'string') throw new Error(result)

        return result.taskList
    }, taskList)

/** 演示需求：开发这一步挂三条任务，第二条在做，它下面三个模块 */
const demoStory = (sessionId?: string): ProgressTaskType => {
    const [task] = progressSteps(
        [],
        [
            { id: '9990001', title: '演示-商家端-示例模块', step: 'develop', status: 'doing' },
            { id: '9990001', step: 'develop', taskId: '9990011', taskTitle: '演示-任务一 界面', taskStatus: 'done' },
            { id: '9990001', step: 'develop', taskId: '9990012', taskTitle: '演示-任务二 接口', taskStatus: 'doing' },
            { id: '9990001', step: 'develop', taskId: '9990012', module: '界面1 布局', moduleDone: 5, moduleTotal: 5 },
            { id: '9990001', step: 'develop', taskId: '9990012', module: '界面2 顶栏', moduleDone: 3, moduleTotal: 5 },
            { id: '9990001', step: 'develop', taskId: '9990012', module: '界面3 面板', moduleDone: 0, moduleTotal: 4 },
            { id: '9990001', step: 'develop', taskId: '9990013', taskTitle: '演示-任务三 联调', taskStatus: 'todo' }
        ]
    )
    if (task === undefined) throw new Error('demo')

    return sessionId === undefined ? task : { ...task, sessionId }
}

interface WorldType {
    env?: string
    store?: Record<string, unknown>
    files?: Record<string, string>
    /** TAPD MCP 一开始连不上（会话刚启动时的样子） */
    tapdDown?: boolean
    /** 会话目录，默认 CWD */
    cwd?: string
    /** 仓库主工作区，默认与会话目录相同；null 为不在仓库里 */
    repoRoot?: string | null
    sessionId?: string
    /** mod 目录下 config.json 的内容，没有为读不到 */
    modConfig?: string
    /** XIAOXIAOLI_HOME 的值，默认 GLOBAL_ROOT；null 为没设，且 USERPROFILE、HOME 也取不到（降级为旧行为） */
    globalRoot?: string | null
    /** 改写个别 TAPD 工具的返回，返回 undefined 时照常用 fakeTapd */
    tapdPatch?: (tool: string, args: Record<string, unknown>) => McpToolResult | undefined
    /** 写文件一律失败（没权限、磁盘只读的样子） */
    writeDenied?: boolean
    /** 面板打开了但没画出来（终端不够宽的样子） */
    paneUnplaced?: boolean
    /** 模拟 macOS / Linux 的路径（/home/...）：引擎在 Windows 上会补成 C:\home\...，比对时去掉盘符 */
    isPosix?: boolean
    /**
     * 全局根目录下 profile.json 的内容：默认是已经选过「先不设」的用户（名字用默认、不出首次引导），
     * 0.5.0 之前的用例照旧；null 为没有这个文件（第一次用）。files 里已给了这个路径时以 files 为准
     */
    profile?: string | null
    /** 有没有人在终端前：默认 true；false 为 -p 或 SDK 的会话（surface 为 null） */
    isInteractive?: boolean
    /** 会话里已有几条用户消息（$.session.turns()），默认 0；恢复或继续的会话大于 0 */
    turns?: number
    /** 输入框里的草稿（$.prompt.read()），默认 '' */
    draft?: string
    /** 每次写文件之后调一下，可改 files 模拟别的会话同时写 */
    onWrite?: (path: string, files: Record<string, string>) => void
    /** 改写某个内置工作流 workflows/<工种>.json 的内容，null 为读不到；没写的照常用逐字副本 */
    builtins?: Record<string, string | null>
    /** 改写 guide/deps.json、guide/tour.json 的内容，null 为读不到；没写的照常用逐字副本 */
    guides?: { deps?: string | null; tour?: string | null }
    /** mod 目录下 .claude-plugin/plugin.json 的内容（0.9.0 自动更新读自己的版本号）；没写为读不到 */
    manifest?: string
}

/**
 * 已经选过「先不设」的档案：boot 的默认世界。0.8.0 起同时记着演练已走过（tour: done），
 * 免得之前的用例都多出演练引导两行、行号整体下移；要看演练引导的用例自己给档案
 */
const SKIPPED_PROFILE = JSON.stringify({ version: 1, skipped: true, tour: 'done' })

/** 真的开一个会话：小小黎碰到的外部名词都接住，并记下它做了什么 */
const boot = async ($: Engine, on: On, world: WorldType = {}) => {
    const cwd = world.cwd ?? CWD
    const files: Record<string, string> = world.files ?? { [CONFIG_FILE]: JSON.stringify(CONFIG) }
    /* 引擎会把路径换成本机写法（Windows 为反斜杠），按正斜杠比对 */
    const pathKey = (raw: string) => {
        const path = raw.replace(/\\/g, '/')
        return world.isPosix ? path.replace(/^[a-zA-Z]:(?=\/)/, '') : path
    }
    const env = { value: world.env }
    const tapd = { down: world.tapdDown === true }
    const seen = {
        logs: [] as string[],
        opened: [] as string[],
        closed: [] as string[],
        toasts: [] as string[],
        statuses: [] as (string | undefined)[],
        submitted: [] as { text: string; asUser: boolean }[],
        calls: [] as { server: string; tool: string }[],
        copied: [] as string[],
        written: [] as string[],
        tools: [] as string[],
        /** 注册时放在 ToolSearch 后面的工具 */
        deferredTools: [] as string[],
        /** 每次 $.ui.open 带的标题 */
        titles: [] as string[],
        /** 读过的文件（按正斜杠） */
        reads: [] as string[]
    }
    mock.store(on, world.store ?? {})
    const clock = mock.clock(on, { now: NOW })
    const globalRoot = world.globalRoot === undefined ? GLOBAL_ROOT : world.globalRoot
    const profileText = world.profile === undefined ? SKIPPED_PROFILE : world.profile
    const profilePath = globalRoot === null ? '' : `${pathKey(globalRoot)}/profile.json`
    if (profilePath !== '' && profileText !== null && !(profilePath in files)) files[profilePath] = profileText
    on('env.get', (_$, e) => {
        if (e.name === 'XIAOXIAOLI_PANE') return { value: env.value }

        return { value: e.name === 'XIAOXIAOLI_HOME' && globalRoot !== null ? globalRoot : undefined }
    })
    on('env.set', (_$, e) => {
        if (e.name === 'XIAOXIAOLI_PANE') env.value = e.value
        return { value: {} }
    })
    on('ui.open', (_$, e) => {
        seen.opened.push(e.id)
        seen.titles.push(e.title ?? '')
        const opened: UiOpenResult = world.paneUnplaced ? { isPlaced: false, reason: '终端 100 列，不足 144 列' } : { isPlaced: true }
        return { value: opened }
    })
    on('ui.close', (_$, e) => {
        seen.closed.push(e.id)
        return { value: undefined }
    })
    on('ui.toast', (_$, e) => {
        seen.toasts.push(e.text)
        return { value: undefined }
    })
    on('ui.status', (_$, e) => {
        seen.statuses.push(e.text)
        return { value: undefined }
    })
    on('ui.log', (_$, e) => {
        seen.logs.push(e.text)
        return { value: undefined }
    })
    on('ui.copy', (_$, e) => {
        seen.copied.push(e.text)
        return { value: { isCopied: true as const } }
    })
    on('command.register', () => ({ value: { command: 'xiaoxiaoli' } }))
    on('tool.register', (_$, e) => {
        seen.tools.push(e.name)
        if (e.isDeferred) seen.deferredTools.push(e.name)
        return { value: { tool: `mcp__xiaoxiaoli__${e.name}` } }
    })
    on('session.cwd', () => ({ value: cwd }))
    on('session.id', () => ({ value: world.sessionId ?? SESSION_ID }))
    on('session.repo', () => {
        const root = world.repoRoot === undefined ? cwd : world.repoRoot
        return { value: root === null ? null : { root, remote: null, internal: false, name: null } }
    })
    on('fs.read', (_$, e) => {
        /* mod 目录下的 config.json 与内置工作流 workflows/<工种>.json 单独给，内置工作流默认用逐字副本 */
        const path = pathKey(e.path)
        seen.reads.push(path)
        const builtin = /\/xiaoxiaoli\/workflows\/([a-z]+)\.json$/.exec(path)?.[1]
        const builtinText = builtin === undefined ? undefined : builtin in (world.builtins ?? {}) ? world.builtins?.[builtin] : BUILTIN_WORKFLOW_TEXTS[builtin as WorkRole]
        /* 0.8.0：mod 目录下的 guide/deps.json 与 guide/tour.json 也单独给，默认用逐字副本 */
        const guide = /\/xiaoxiaoli\/guide\/(deps|tour)\.json$/.exec(path)?.[1] as 'deps' | 'tour' | undefined
        if (guide !== undefined) {
            const guideText = guide in (world.guides ?? {}) ? world.guides?.[guide] : GUIDE_TEXTS[guide]
            return guideText === null || guideText === undefined ? { deny: 'ENOENT' } : { value: guideText }
        }
        /* 0.9.0：mod 自己的 plugin.json 也单独给，默认读不到 */
        if (path.endsWith('/xiaoxiaoli/.claude-plugin/plugin.json')) return world.manifest === undefined ? { deny: 'ENOENT' } : { value: world.manifest }
        const text = path.endsWith('/xiaoxiaoli/config.json') ? world.modConfig : builtin === undefined ? files[path] : (builtinText ?? undefined)
        return text === undefined ? { deny: 'ENOENT' } : { value: text }
    })
    on('fs.write', (_$, e) => {
        if (world.writeDenied) return { deny: 'EACCES: permission denied' }

        const path = pathKey(e.path)
        files[path] = e.text
        seen.written.push(path)
        world.onWrite?.(path, files)
        return { value: undefined }
    })
    /* 路径在不在：造的文件里有它，或有以它为目录的文件 */
    on('fs.exists', (_$, e) => {
        const path = pathKey(e.path).replace(/\/+$/, '')
        return { value: path in files || Object.keys(files).some(i => i.startsWith(`${path}/`)) }
    })
    on('session.turns', () => ({ value: world.turns ?? 0 }))
    on('prompt.read', () => ({ value: { text: world.draft ?? '', cursor: (world.draft ?? '').length } }))
    on('mcp.call', (_$, e) => {
        seen.calls.push({ server: e.server, tool: e.tool })
        if (tapd.down) return { deny: 'MCP server "tapd" is still connecting' }

        return { value: world.tapdPatch?.(e.tool, e.args) ?? fakeTapd(e.tool, e.args) }
    })
    on('prompt.submit', (_$, e) => {
        seen.submitted.push({ text: e.text, asUser: e.origin.kind === 'plugin' && e.origin.asUser === true })
        return { text: e.text }
    })
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    const isInteractive = world.isInteractive ?? true
    await $.session.start({ cwd, surface: isInteractive ? 'terminal' : null, isInteractive })

    return { clock, seen, env, files, tapd }
}

const mountPane = ($: Engine) =>
    $.ui.mount({ plugin: 'xiaoxiaoli', surface: 'terminal', component: 'Pane', requestId: 'xiaoxiaoli', props: PANE_PROPS })
type PaneType = Awaited<ReturnType<typeof mountPane>>

/** 面板此刻的每一行 */
const linesOf = async (ui: PaneType): Promise<BoardLineType[]> => {
    const board = await ui.find({ type: 'Client', key: 'board' })
    return (board?.props.props as BoardPropsType | undefined)?.lineList ?? []
}
const rowOf = async (ui: PaneType, action: string) => (await linesOf(ui)).findIndex(i => i.action === action)
const click = (ui: PaneType, x: number, y: number) => ui.pointer({ type: 'down', x, y, button: 'left', in: 'board' })
const textsOf = async (ui: PaneType) => (await linesOf(ui)).map(lineText)
/** 点一条待办再点它的确认行 */
const startFromPane = async (ui: PaneType, id: string) => {
    await click(ui, 5, await rowOf(ui, `todo:${id}`))
    await click(ui, 5, await rowOf(ui, `start:${id}`))
}
/** 主会话调一次进度工具 */
const callProgress = ($: Engine, args: Record<string, unknown>) => $.tool.call({ tool: PROGRESS_TOOL, ...args })
/** 主会话调一次绑定工具 */
const callBind = ($: Engine, args: Record<string, unknown>) => $.tool.call({ tool: 'mcp__xiaoxiaoli__bind', ...args })
/** 用户亲自敲一次 /xiaoxiaoli <args> */
const runCommand = ($: Engine, args: string) =>
    $.command.run({ command: 'xiaoxiaoli', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
/** 没有工作台文件的新项目（像 fg-psd-demo），落到全局目录 */
const FG_ROOT = 'D:/work/fg-demo'
const GLOBAL_CONFIG = { projectName: '演示项目', tapdWorkspaceId: WS }
/** 某个项目目录在全局目录下的配置与状态文件 */
const globalFilesOf = (root: string) => {
    const dir = `${GLOBAL_ROOT}/projects/${projectKeyOf(root)}`
    return { dir, config: `${dir}/config.json`, state: `${dir}/state.json` }
}
/** 某个项目目录里的状态文件（旧版 mod 在没配置的项目里也写过它） */
const projectStateOf = (root: string) => `${root}/docs/xiaoli/local/workbench/state.json`

describe('排序', () => {
    test('有时间的排前面：按预计开始、预计结束、优先级；只有预计结束的排在有开始的之后', () => {
        const list = [
            todo('a', ''),
            todo('b', 'Nice To Have'),
            todo('c', 'Low'),
            todo('d', 'Middle', '2026-10-22'),
            todo('e', 'Middle', '2026-10-20', '2026-10-30'),
            todo('f', 'Middle', '2026-10-20', '2026-10-25'),
            todo('g', 'High'),
            todo('h', 'Low', '', '2026-10-21'),
            todo('i', 'High', '2026-10-20', '2026-10-25')
        ]
        expect(sortTodos(list).map(i => i.id)).toEqual(['i', 'f', 'e', 'd', 'h', 'g', 'c', 'b', 'a'])
    })

    test('没有时间的排后面：按优先级 High > Middle > Low > Nice To Have > 其他，再按 ID；缺陷取值并入同档', () => {
        const list = [todo('z', 'High'), todo('m', 'High'), todo('x', 'medium'), todo('u', 'urgent'), todo('t', 'Middle', '2026-12-01')]
        expect(sortTodos(list).map(i => i.id)).toEqual(['t', 'u', 'm', 'z', 'x'])
    })
})

describe('需求与任务级联', () => {
    test('需求按排序列出，任务缩进挂在所属需求下；孤儿任务排在需求之后不缩进，缺陷独立放最后', () => {
        const storyA = todo('SA', 'Middle')
        const storyB = todo('SB', 'High')
        const taskA1 = { ...todo('TA1', 'Low'), kind: 'task' as const, storyId: 'SA' }
        const taskB1 = { ...todo('TB1', 'High'), kind: 'task' as const, storyId: 'SB' }
        const taskB2 = { ...todo('TB2', 'Low'), kind: 'task' as const, storyId: 'SB' }
        const orphan = { ...todo('TO', 'High'), kind: 'task' as const, storyId: 'S-not-listed' }
        const bug = { ...todo('BG', 'urgent'), kind: 'bug' as const }
        const list = [bug, orphan, taskA1, storyA, taskB2, storyB, taskB1]
        expect(cascadeTodos(list).map(i => `${i.isChild ? '  ' : ''}${i.todo.id}`)).toEqual(['SB', '  TB1', '  TB2', 'SA', '  TA1', 'TO', 'BG'])
        const lineList = buildBoard(boardInput({ todoList: list }), 60).filter(i => i.action?.startsWith('todo:'))
        expect(lineList.map(i => i.action)).toEqual(['todo:SB', 'todo:TB1', 'todo:TB2', 'todo:SA', 'todo:TA1', 'todo:TO', 'todo:BG'])
        const prefixList = ['需 SB ', ' |- 任 TB1 ', ' |- 任 TB2 ', '需 SA ', ' |- 任 TA1 ', '任 TO ', '缺 BG ']
        expect(lineList.every((line, index) => lineText(line).startsWith(prefixList[index] ?? '?'))).toBe(true)
        expect(lineList.every(i => displayWidth(lineText(i)) <= 60)).toBe(true)
    })

    test('点挂在需求下的任务照样两步开工：确认行跟在该任务下面', () => {
        const story = todo('SA', 'Middle')
        const task = { ...todo('TA1', 'Low'), kind: 'task' as const, storyId: 'SA' }
        const lineList = buildBoard(boardInput({ todoList: [task, story], selectedId: 'TA1' }), 60)
        const row = lineList.findIndex(i => i.action === 'todo:TA1')
        expect(lineList[row - 1]?.action).toBe('todo:SA')
        expect(lineList[row + 1]?.action).toBe('start:TA1')
    })
})

describe('迭代筛选', () => {
    test('本迭代 = 今天落在开始与结束之间的迭代，有多个取开始最晚的，没有为空', () => {
        const list = [
            iterationOf('A', '2026-10-01', '2026-10-31'),
            iterationOf('B', '2026-10-15', '2026-10-28'),
            iterationOf('C', '2026-11-01', '2026-11-30')
        ]
        expect(currentIterationId(list, '2026-10-21')).toBe('B')
        expect(currentIterationId(list, '2026-10-30')).toBe('A')
        expect(currentIterationId(list, '2026-12-05')).toBe('')
        expect(todayText(NOW)).toBe('2026-10-21')
    })

    test('需求按自己的迭代筛；任务有迭代按自己，没有跟随父需求，父需求不在列表里保留；缺陷不分迭代', () => {
        const storyIn = { ...todo('S1', 'High'), iterationId: 'IT' }
        const storyOut = { ...todo('S2', 'High'), iterationId: 'OTHER' }
        const taskOwn = { ...todo('T1', 'High'), kind: 'task' as const, storyId: 'S2', iterationId: 'IT' }
        const taskFollowIn = { ...todo('T2', 'High'), kind: 'task' as const, storyId: 'S1' }
        const taskFollowOut = { ...todo('T3', 'High'), kind: 'task' as const, storyId: 'S2' }
        const taskOrphan = { ...todo('T4', 'High'), kind: 'task' as const, storyId: 'S-not-listed' }
        const bug = { ...todo('B1', 'High'), kind: 'bug' as const, iterationId: 'OTHER' }
        const list = [storyIn, storyOut, taskOwn, taskFollowIn, taskFollowOut, taskOrphan, bug]
        expect(filterByIteration(list, 'IT').map(i => i.id)).toEqual(['S1', 'T1', 'T2', 'T4', 'B1'])
        expect(filterByIteration(list, '')).toHaveLength(7)
    })

    test('面板：本项目视图有一行迭代，点开列本迭代、全部与迭代（开始倒序，最多 8 条）；全部项目视图不显示', () => {
        const list = Array.from({ length: 10 }, (_, index) => iterationOf(`I${index}`, `2026-0${9 - Math.floor(index / 5)}-1${index % 5}`, '2026-12-31'))
        const state: IterationStateType = { list, currentId: 'I0', pick: 'current', listShow: true, loaded: true }
        const lineList = buildBoard(boardInput({ iteration: state }), 60)
        const head = lineList.findIndex(i => i.action === ACTION_ITERATION)
        expect(head).toBe(ITERATION_ROW)
        expect(lineText(lineList[head] as BoardLineType)).toBe('迭代：本迭代（迭代I0） ▾')
        const optionList = lineList.filter(i => i.action?.startsWith('iter:'))
        expect(optionList.map(i => i.action)).toEqual(['iter:current', 'iter:all', ...list.slice(0, 8).map(i => `iter:${i.id}`)])
        expect(lineText(optionList[0] as BoardLineType).startsWith('  * 本迭代')).toBe(true)
        const allScope = buildBoard(boardInput({ iteration: state, todoMeta: { ...metaDefault(), scope: 'all' } }), 60)
        expect(allScope.some(i => i.action === ACTION_ITERATION || i.action?.startsWith('iter:'))).toBe(false)
    })

    test('选了本迭代但今天不在任何迭代里：退化为全部，标题行提示', () => {
        const lineList = buildBoard(boardInput(), 80)
        expect(lineText(lineList[HEADER_ROW] as BoardLineType)).toContain('无当前迭代，显示全部')
        expect(lineText(lineList[ITERATION_ROW] as BoardLineType)).toBe('迭代：本迭代（无，显示全部） ▸')
    })

    test('默认只显示本迭代的需求与任务；点开迭代选「全部」后上个迭代的需求也出来，列表收起', async ($, on) => {
        const { clock } = await boot($, on)
        await clock.advance(1)
        const ui = await mountPane($)
        const todoIds = async () => (await linesOf(ui)).filter(i => i.action?.startsWith('todo:')).map(i => i.action)
        expect(await todoIds()).toEqual([`todo:${STORY_A}`, `todo:${TASK_A}`, `todo:${STORY_B}`])
        expect(lineText((await linesOf(ui))[ITERATION_ROW] as BoardLineType)).toBe('迭代：本迭代（演示迭代二） ▸')
        await click(ui, 2, await rowOf(ui, ACTION_ITERATION))
        const optionList = (await linesOf(ui)).filter(i => i.action?.startsWith('iter:')).map(i => i.action)
        expect(optionList).toEqual(['iter:current', 'iter:all', `iter:${IT_NEXT}`, `iter:${IT_CUR}`, `iter:${IT_OLD}`])
        await click(ui, 2, await rowOf(ui, 'iter:all'))
        expect(await todoIds()).toEqual([`todo:${STORY_A}`, `todo:${TASK_A}`, `todo:${STORY_B}`, `todo:${STORY_C}`])
        expect(await rowOf(ui, 'iter:all')).toBe(-1)
        await click(ui, 2, await rowOf(ui, ACTION_ITERATION))
        await click(ui, 2, await rowOf(ui, `iter:${IT_OLD}`))
        expect(await todoIds()).toEqual([`todo:${STORY_C}`])
        await ui.unmount()
    })

    test('迭代选择记在 $.store：下次启动沿用', async ($, on) => {
        const { clock } = await boot($, on, { store: { iteration: 'all' } })
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await rowOf(ui, `todo:${STORY_C}`)).toBeGreaterThan(0)
        expect(lineText((await linesOf(ui))[ITERATION_ROW] as BoardLineType)).toBe('迭代：全部 ▸')
        await ui.unmount()
    })
})

describe('截断与排版', () => {
    test('中文按 2 列算，超出末尾换成省略号且不超宽', () => {
        expect(displayWidth('中文ab')).toBe(6)
        expect(fitWidth('演示需求标题很长', 9)).toBe('演示需..')
        expect(fitWidth('abcdef', 2)).toBe('ab')
        expect(fitWidth('short', 10)).toBe('short')
        expect(displayWidth(fitWidth('演示需求标题很长abc', 10))).toBeLessThanOrEqual(10)
        expect(wrapWidth('ab中文cd', 4)).toEqual(['ab中', '文cd'])
        expect(wrapWidth('abc', 0)).toEqual([])
    })

    test('待办一行：类型标、短 ID、开工态、标题、状态、优先级、预计开始，总宽不超过面板', () => {
        const long = { ...todo(STORY_A, 'High', '2026-10-20'), title: '一个特别特别特别特别长的演示需求标题' }
        const line = todoLine({ todo: long, width: 50, selected: false, isChild: false })
        const text = lineText(line)
        expect(text.startsWith(`需 1000101 待开工 `)).toBe(true)
        expect(text).toContain('..')
        expect(text).not.toContain('…')
        expect(text).toContain('实现中 高 10-20')
        expect(displayWidth(text)).toBeLessThanOrEqual(50)
        expect(line.action).toBe(`todo:${STORY_A}`)
    })

    test('长 ID 去掉 11 + 项目 ID 前缀得到短 ID', () => {
        expect(shortId(STORY_A, WS)).toBe('1000101')
        expect(shortId('12345', WS)).toBe('12345')
    })

    test('面板布局：自绘标题行、刷新、切换、迭代、待办、进行中；每行都不超宽', () => {
        const wide = buildBoard(boardInput({ iteration: { ...iterationDefault(), pick: 'all' } }), 80)
        expect(lineText(wide[0] as BoardLineType)).toBe('')
        expect(wide[0]?.action).toBeUndefined()
        const header = lineText(wide[HEADER_ROW] as BoardLineType)
        expect(header.startsWith(`${BOARD_TITLE_SPACED} · 演示项目`)).toBe(true)
        expect(BOARD_TITLE_SPACED).toBe('小 小 黎 A I 工 作 台')
        expect(header).toMatch(/\[ 刷新 \] 刷新于 \d{2}:\d{2}$/)
        expect(displayWidth(header)).toBe(78)
        expect(wide[HEADER_ROW]?.segList[1]).toEqual({ text: BOARD_TITLE_SPACED, color: 'suggestion', bold: true })
        expect(wide[HEADER_ROW]?.segList.find(i => i.text === '[ 刷新 ]')).toEqual({ text: '[ 刷新 ]', color: 'suggestion', bold: true })
        expect(wide[SEPARATOR_ROW]?.segList[1]).toEqual({ text: '-'.repeat(78), color: 'subtle' })
        expect(lineText(wide[GAP_ROW] as BoardLineType).trim()).toBe('')
        expect(wide.slice(1).every(i => i.segList[0]?.text === ' ')).toBe(true)
        expect(wide.every(i => displayWidth(i.segList.map(seg => seg.text).join('')) <= 79)).toBe(true)
        const lineList = buildBoard(boardInput(), 36)
        expect(lineList[REFRESH_ROW]?.action).toBe(ACTION_REFRESH)
        expect(lineList[SEPARATOR_ROW]?.action).toBeUndefined()
        expect(lineList[GAP_ROW]?.action).toBeUndefined()
        expect(lineList[SCOPE_ROW]?.action).toBe(ACTION_SCOPE)
        expect(lineList[ITERATION_ROW]?.action).toBe(ACTION_ITERATION)
        expect(lineList.some(i => lineText(i) === '待办（1）')).toBe(true)
        expect(lineList.some(i => lineText(i) === '暂无进行中任务')).toBe(true)
        expect(lineList.every(i => displayWidth(lineText(i)) <= 36)).toBe(true)
    })

    test('选中的待办整行文字高亮加粗（不铺底色），下面多一行开工确认', () => {
        const lineList = buildBoard(boardInput({ selectedId: STORY_A }), 60)
        const row = lineList.findIndex(i => i.action === `todo:${STORY_A}`)
        expect(lineList[row]?.segList.slice(1).every(i => i.color === 'suggestion' && i.bold === true && i.dim === undefined)).toBe(true)
        expect(lineList.every(line => line.segList.every(i => Object.keys(i).every(key => ['text', 'color', 'bold', 'dim', 'strike'].includes(key))))).toBe(true)
        expect(lineList[row + 1]?.action).toBe(`start:${STORY_A}`)
        expect(lineText(lineList[row + 1] as BoardLineType)).toContain(`开工 ${STORY_A}`)
    })

    test('项目没配 TAPD：标题行只有项目目录名与刷新，待办区换成一行提示，进行中区照常', () => {
        const lineList = buildBoard(boardInput({ config: null, workplace: { ...WORKPLACE, name: 'other' } }), 60).map(lineText)
        expect(lineList[1]?.startsWith(`${BOARD_TITLE_SPACED} · other`)).toBe(true)
        expect(lineList[1]?.endsWith('[ 刷新 ]')).toBe(true)
        const progressTitle = `进行中（0）${' '.repeat(58 - displayWidth(`进行中（0）${FOCUS_ENTER_TEXT}`))}${FOCUS_ENTER_TEXT}`
        expect(lineList.slice(2)).toEqual(['-'.repeat(58), ' ', NO_CONFIG_TEXT, ' ', progressTitle, '暂无进行中任务'])
    })
})

describe('标题区', () => {
    test('点标题行触发刷新；分隔线与上下空行没有动作，点了不拉取', async ($, on) => {
        const { clock, seen } = await boot($, on)
        await clock.advance(1)
        const ui = await mountPane($)
        const lineList = await linesOf(ui)
        expect([0, SEPARATOR_ROW, GAP_ROW].map(i => actionAt(lineList, i))).toEqual(['', '', ''])
        expect(actionAt(lineList, HEADER_ROW)).toBe(ACTION_REFRESH)
        const todoCalls = () => seen.calls.filter(i => i.tool === 'get_todo').length
        const before = todoCalls()
        await click(ui, 3, SEPARATOR_ROW)
        await click(ui, 3, GAP_ROW)
        await click(ui, 3, 0)
        expect(todoCalls()).toBe(before)
        await click(ui, 40, HEADER_ROW)
        expect(todoCalls()).toBe(before + 3)
        await ui.unmount()
    })

    test('窄面板先保右边的「[ 刷新 ]」与状态位，左边标题按剩余宽度截断；重试提示放在刷新时间的位置', () => {
        const lineList = buildBoard(boardInput({ todoMeta: { ...metaDefault(), retryCount: 2 } }), 50)
        const header = lineText(lineList[HEADER_ROW] as BoardLineType)
        expect(header.endsWith('[ 刷新 ] 正在连接 TAPD，第 2 次重试')).toBe(true)
        expect(header).not.toContain('刷新于')
        expect(displayWidth(header)).toBe(48)
    })
})

describe('右侧定宽列', () => {
    /** 右侧三列（最后三段）在整行里的起止列号，含左内边距 */
    const tailSpan = (line: BoardLineType) => {
        const head = line.segList.slice(0, -3).map(i => i.text).join('')
        const tail = line.segList.slice(-3).map(i => i.text).join('')
        return { start: displayWidth(head), end: displayWidth(head) + displayWidth(tail) }
    }
    const longStory = {
        ...todo('S1', 'High', '2026-10-20'),
        title: '货盘基础能力建设和完善(UI组件，公共方法，请求处理，时区时间处理，图片上传)等',
        status: 'A0-待评估很长的状态'
    }
    const shortStory = { ...todo('S2', 'Low', '2026-10-21'), title: '短', status: 'C1-转开发' }
    const task = { ...todo('T1', 'Middle'), kind: 'task' as const, storyId: 'S1', title: '一个任务' }

    test('超长标题与短标题的需求：状态（12 列）、优先级、日期三列起止列号完全相同，贴右边留 1 列', () => {
        const lineList = buildBoard(boardInput({ todoList: [longStory, shortStory, task] }), 90).filter(i => i.action?.startsWith('todo:'))
        expect(lineList.map(tailSpan)).toEqual([
            { start: 67, end: 89 },
            { start: 67, end: 89 },
            { start: 67, end: 89 }
        ])
        const longLine = lineList[0] as BoardLineType
        expect(longLine.segList.find(i => i.bold === true)?.text.trimEnd().endsWith('..')).toBe(true)
        /* 超过 12 列的状态截断成 ..，12 列以内的完整显示 */
        expect(longLine.segList.at(-3)?.text).toBe('  A0-待评估..')
        expect((lineList[2] as BoardLineType).segList.at(-3)?.text).toBe('    C1-转开发')
        expect(longLine.segList.at(-2)?.text).toBe(' 高')
        expect(longLine.segList.at(-1)?.text).toBe(' 10-20')
        expect(lineText(lineList[1] as BoardLineType).endsWith('实现中 中    --')).toBe(true)
    })

    test('60 列窄面板：每行不超过 59 列，待办行正好 59 列且右侧三列对齐；连接符、ID、开工态、标题样式照规则', () => {
        const lineList = buildBoard(boardInput({ todoList: [longStory, shortStory, task] }), 60)
        expect(lineList.every(i => displayWidth(i.segList.map(seg => seg.text).join('')) <= 59)).toBe(true)
        const todoRows = lineList.filter(i => i.action?.startsWith('todo:'))
        expect(todoRows.map(i => displayWidth(i.segList.map(seg => seg.text).join('')))).toEqual([59, 59, 59])
        expect(todoRows.map(tailSpan)).toEqual([
            { start: 37, end: 59 },
            { start: 37, end: 59 },
            { start: 37, end: 59 }
        ])
        const child = todoRows[1] as BoardLineType
        expect(child.segList[1]).toEqual({ text: ' |- ', color: 'suggestion' })
        expect(child.segList[2]).toEqual({ text: '任', color: 'success' })
        expect(child.segList[3]).toEqual({ text: ' T1 ', color: 'text', dim: true })
        expect(child.segList[4]).toEqual({ text: '待开工 ', color: 'inactive' })
        expect(child.segList[5]?.bold).toBeUndefined()
        expect((todoRows[0] as BoardLineType).segList[4]?.bold).toBe(true)
    })
})

describe('整行命中', () => {
    test('只看行号：同一行任何列都命中同一个动作，没有动作的行和行外为空', () => {
        const lineList = buildBoard(boardInput(), 60)
        expect(actionAt(lineList, REFRESH_ROW)).toBe(ACTION_REFRESH)
        expect(actionAt(lineList, 0)).toBe('')
        expect(actionAt(lineList, 99)).toBe('')
    })

    test('在面板里点：中文偏移导致的列号再怎么偏，按行都命中', async ($, on) => {
        const { clock } = await boot($, on)
        await clock.advance(1)
        const ui = await mountPane($)
        const row = await rowOf(ui, `todo:${STORY_B}`)
        expect(row).toBeGreaterThan(0)
        await click(ui, -3, row)
        expect((await linesOf(ui))[row + 1]?.action).toBe(`start:${STORY_B}`)
        await click(ui, 0, 0)
        expect(await rowOf(ui, `start:${STORY_B}`)).toBe(-1)
        await click(ui, 57, row)
        expect((await linesOf(ui))[row + 1]?.action).toBe(`start:${STORY_B}`)
        await ui.unmount()
    })
})

describe('state.json 新旧结构', () => {
    test('旧结构兼容：没有 steps 时按 step 推导，小于 step 的完成、等于的进行中（stepName 作 detail）、其余未开始；格式不对的跳过并说明', () => {
        const text = JSON.stringify({
            tasks: [
                { id: 1000101, title: '演示需求甲', step: 4, stepName: '写代码', waiting: 'align', branch: 'feat/x', updatedAt: '2026-10-21T10:00:00+08:00' },
                { id: 'T2', title: '演示需求乙', step: 12, stepName: '越界', waiting: null, updatedAt: '2026-10-21' },
                { id: 'T3', title: '演示需求丙', step: 2, stepName: '对齐', waiting: 'later', updatedAt: '2026-10-21' }
            ]
        })
        const result = parseProgress(text)
        expect(result.taskList).toHaveLength(1)
        const task = result.taskList[0] as ProgressTaskType
        expect({ id: task.id, kind: task.kind, waiting: task.waiting, branch: task.branch }).toEqual({ id: '1000101', kind: 'story', waiting: 'align', branch: 'feat/x' })
        expect(task.steps.map(i => i.status)).toEqual(['done', 'done', 'done', 'doing', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo'])
        expect(task.steps[3]).toEqual({ key: 'read', title: '读需求与语雀', status: 'doing', detail: '写代码' })
        expect(result.error).toContain('2 条任务格式不对')
        expect(parseProgress('{oops').error).toBe('state.json 不是合法 JSON')
        expect(parseProgress('{}').error).toBe('state.json 缺少 tasks 数组')
        expect(parseProgress('{ "tasks": [] }')).toEqual({ taskList: [], error: '' })
        expect(parseProgress('{ "version": 3, "tasks": [] }').error).toContain('比小小黎新')
    })

    test('新结构写回再读回原样：version 2、每步一行、可选字段没有就不写；缺的步骤补成未开始，未知步骤键整条跳过', () => {
        const task = { ...demoStory(SESSION_ID), branch: 'demo/9990001-sample', note: '演示用' }
        const text = stringifyState([task])
        expect(text.startsWith('{\n  "version": 2,\n  "tasks": [\n')).toBe(true)
        expect(text).toContain('        { "key": "fetch", "title": "拉取 TAPD", "status": "done" },')
        expect(text).not.toContain('"worktree"')
        expect(parseProgress(text).taskList).toEqual([task])
        const partial = JSON.stringify({ version: 2, tasks: [{ id: '1', title: '甲', steps: [{ key: 'fetch', status: 'done' }], waiting: null, updatedAt: UPDATED }] })
        expect(parseProgress(partial).taskList[0]?.steps.map(i => i.status)).toEqual(['done', ...Array(10).fill('todo')])
        const unknown = JSON.stringify({ version: 2, tasks: [{ id: '1', title: '甲', steps: [{ key: 'deploy', status: 'done' }], waiting: null, updatedAt: UPDATED }] })
        expect(parseProgress(unknown).error).toContain('1 条任务格式不对')
    })

    test('推进规则：doing 与 done 都线性推进，之前的步骤全记完成；doing 之后的回到未开始（返工清掉 detail），done 之后的不动', () => {
        const base = storyTask('1', '甲', 'unit', { steps: legacySteps(7, '旧说明') })
        const released = setStep(base, { key: 'release', status: 'done', detail: '#34 已上 dev', updatedAt: UPDATED })
        expect(released.steps.map(i => i.status)).toEqual(Array(11).fill('done'))
        expect(released.steps[10]?.detail).toBe('#34 已上 dev')
        expect(released.steps[6]?.detail).toBe('旧说明')
        const rework = setStep(released, { key: 'develop', status: 'doing', detail: '修上线问题', updatedAt: UPDATED })
        expect(rework.steps.map(i => i.status)).toEqual(['done', 'done', 'done', 'done', 'done', 'doing', 'todo', 'todo', 'todo', 'todo', 'todo'])
        expect(rework.steps[10]?.detail).toBeUndefined()
        const middle = setStep(base, { key: 'align', status: 'done', updatedAt: UPDATED })
        expect(middle.steps[6]?.status).toBe('doing')
    })
})

describe('步骤渲染：三种状态与三级树状', () => {
    test('已完成灰色加删除线只显「对齐需求【已完成】」，进行中高亮「开发中-界面2 顶栏」，未开始弱化', () => {
        const task = setStep(storyTask('1046775', '商家端-设计器模块', 'develop', { sessionId: SESSION_ID }), { key: 'develop', detail: '界面2 顶栏', updatedAt: UPDATED })
        const lineList = buildBoard(boardInput({ progress: progressOf(task) }), 60)
        const lineOf = (text: string) => lineList.find(i => lineText(i) === text) as BoardLineType
        const done = lineOf('   5 对齐需求【已完成】')
        expect(done.segList).toContainEqual({ text: '对齐需求', color: 'inactive', strike: true })
        expect(done.segList).toContainEqual({ text: '【已完成】', color: 'inactive' })
        const doing = lineOf('>  6 开发中-界面2 顶栏')
        expect(doing.segList.slice(1)).toEqual([{ text: '>  6 开发中-界面2 顶栏', color: 'suggestion', bold: true }])
        expect(lineOf('   7 单测').segList.slice(1)).toEqual([{ text: '   7 单测', dim: true }])
        expect(lineList.some(i => lineText(i) === '需 1046775 商家端-设计器模块')).toBe(true)
        expect(statusText([task], SESSION_ID, true)).toBe('小小黎 · 1046775 第 6 步 开发中-界面2 顶栏')
    })

    test('三级：进行中的慢环节往下展开任务、进行中的任务再展开模块，每级往右缩两格、├─ └─ 连接；快环节只一行', () => {
        const task = demoStory(SESSION_ID)
        const texts = buildBoard(boardInput({ progress: progressOf(task) }), 60).map(lineText)
        const at = texts.indexOf('>  6 开发中')
        expect(texts.slice(at, at + 6)).toEqual([
            '>  6 开发中',
            '     ├─演示-任务一 界面【已完成】',
            '     ├─演示-任务二 接口',
            '     │ ├─界面1 布局 5/5',
            '     │ ├─界面2 顶栏 3/5',
            '     │ └─界面3 面板 0/4'
        ])
        expect(texts[at + 6]).toBe('     └─演示-任务三 联调')
        expect(texts[at + 7]).toBe('   7 单测')
        expect(statusText([task], SESSION_ID, true)).toBe('小小黎 · 9990001 第 6 步 开发中 · 子项 2/3 · 界面2 顶栏 3/5')
        expect(stepLabel(task.steps[5] as ProgressTaskType['steps'][number])).toBe('开发中 · 子项 2/3 · 界面2 顶栏 3/5')
        /* 0.6.0 起慢环节按条目自己的步骤判断，参数校验不再知道条目，改在 applyProgress 里按条目核；旧条目的说法不变 */
        const fastInput = toProgressInput({ id: '9990001', step: 'tapd', taskId: '9990011', taskTitle: '不该挂' })
        const fast = applyProgress([task], fastInput as never, { updatedAt: UPDATED, sessionId: SESSION_ID })
        expect(fast).toContain('只有 read、align、develop、unit、selftest 能挂任务')
    })

    test('当前会话的需求展开，别的会话的整条折成「需求名 · 当前步 · 子项」，没记会话的旧需求展开，做完的折成一行', () => {
        const real = parseProgress(legacyState()).taskList[0] as ProgressTaskType
        const demoOther = demoStory(OTHER_SESSION)
        const demoDone = { ...storyTask('9990002', '演示-已完成需求', 'release'), sessionId: SESSION_ID }
        const finished = setStep(demoDone, { key: 'release', status: 'done', updatedAt: UPDATED })
        const progress = progressOf(real, demoOther, finished)
        const mine = buildBoard(boardInput({ progress }), 80).map(lineText)
        expect(mine).toContain('需 1046775 1. 商家端-设计器模块')
        expect(mine).toContain('>  7 单测中-上线后待修 4 条子代理进行中')
        expect(mine).toContain('需 9990001 演示-商家端-示例模块 · 开发 · 子项 2/3 · 界面2 顶栏 3/5')
        expect(mine.some(i => i.includes('演示-任务二 接口'))).toBe(false)
        expect(mine).toContain('需 9990002 演示-已完成需求【已完成】')
        const theirs = buildBoard(boardInput({ progress, workplace: { ...WORKPLACE, sessionId: OTHER_SESSION } }), 80).map(lineText)
        expect(theirs).toContain('     ├─演示-任务二 接口')
        expect(theirs).toContain('>  7 单测中-上线后待修 4 条子代理进行中')
    })
})

describe('真实需求与演示需求同时在 state.json', () => {
    test('面板：真实需求按本会话展开，演示需求在另一个会话里折叠，做完的演示需求一行划掉；状态行只取本会话的，别的会话的不显示也不计数', async ($, on) => {
        const real = { ...(parseProgress(legacyState()).taskList[0] as ProgressTaskType), sessionId: SESSION_ID }
        const finished = setStep(storyTask('9990002', '演示-已完成需求', 'release'), { key: 'release', status: 'done', updatedAt: UPDATED })
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: stringifyState([real, demoStory(OTHER_SESSION), finished]) }
        const { seen } = await boot($, on, { files })
        const ui = await mountPane($)
        const texts = await textsOf(ui)
        expect(texts.some(i => i.startsWith('进行中（3）'))).toBe(true)
        const folded = texts.filter(i => i.startsWith('需 9990001'))
        expect(folded).toHaveLength(1)
        expect(folded[0]?.startsWith('需 9990001 演示-商家端-示例模块 · 开发 · 子项 2/3 · 界面')).toBe(true)
        expect(texts.filter(i => /^(>| ) {1,2}\d+ /.test(i))).toHaveLength(11)
        expect(texts).toContain('需 9990002 演示-已完成需求【已完成】')
        expect(seen.statuses.at(-1)).toBe('小小黎 · 1046775 第 7 步 单测中-上线后待修 4 条子代理进行中')
        await ui.unmount()
    })
})

describe('多项目隔离', () => {
    test('项目没有配置也没有状态文件、又取不到用户目录（落不了全局）：按旧行为显示空态不报错，不调 TAPD', async ($, on) => {
        const { clock, seen } = await boot($, on, { cwd: OTHER_CWD, files: { [STATE_FILE]: legacyState() }, globalRoot: null })
        await clock.advance(1)
        const result = await $.command.run({
            command: 'xiaoxiaoli',
            args: 'refresh',
            origin: { kind: 'composer' },
            presentation: { isFullscreen: true, columns: 160 }
        })
        /* 0.4.2：项目里没有 config.json、只因取不到用户目录落不了全局，refresh 与待办区如实说明，不再说「没配 TAPD」 */
        expect(result.text).toBe(`小小黎：${NO_GLOBAL_ROOT_TEXT}，只显示进行中需求`)
        const ui = await mountPane($)
        const texts = await textsOf(ui)
        expect(texts[1]?.startsWith(`${BOARD_TITLE_SPACED} · other`)).toBe(true)
        expect(texts.join('')).toContain(NO_GLOBAL_ROOT_TEXT)
        expect(texts).not.toContain(NO_CONFIG_TEXT)
        expect(texts).toContain('暂无进行中任务')
        expect(texts.some(i => i.includes('state.json'))).toBe(false)
        expect(texts.some(i => i.includes('1046775'))).toBe(false)
        expect(seen.calls).toEqual([])
        await ui.unmount()
    })

    test('同一个 mod 在两个项目：各读各的状态文件，面板只显示本项目的需求', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: legacyState(), [OTHER_STATE_FILE]: stringifyState([demoStory()]) }
        await boot($, on, { cwd: OTHER_CWD, files })
        const ui = await mountPane($)
        const texts = await textsOf(ui)
        expect(texts).toContain('需 9990001 演示-商家端-示例模块')
        expect(texts.some(i => i.includes('1046775'))).toBe(false)
        await ui.unmount()
    })

    test('mod 目录 config.json 可改状态文件位置；项目配置里的 statePath 优先', async ($, on) => {
        const custom = `${CWD}/notes/xxl-state.json`
        const { statePath: _ignored, ...configWithoutPath } = CONFIG
        const files = { [CONFIG_FILE]: JSON.stringify(configWithoutPath), [custom]: stringifyState([demoStory()]), [STATE_FILE]: legacyState() }
        await boot($, on, { files, modConfig: JSON.stringify({ statePath: 'notes/xxl-state.json' }) })
        const ui = await mountPane($)
        expect(await textsOf(ui)).toContain('需 9990001 演示-商家端-示例模块')
        await ui.unmount()
        expect(parseModConfig('')).toEqual({ configPath: 'docs/xiaoli/local/workbench/config.json', statePath: 'docs/xiaoli/local/workbench/state.json' })
        expect(parseConfig(JSON.stringify(configWithoutPath))?.statePath).toBeUndefined()
    })

    test('会话在 worktree 里、会话目录没有工作台文件：读写仓库主工作区的状态文件，同一仓库的会话共用一份', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: legacyState() }
        const { seen } = await boot($, on, { cwd: 'D:/work/demo-9990001', repoRoot: CWD, files })
        const ui = await mountPane($)
        /* 没记会话的旧条目归主工作区的会话：worktree 里的会话把它折成一行 */
        expect((await textsOf(ui)).some(i => i.startsWith('需 1046775 1. 商家端-设计器模块 · 单测 · '))).toBe(true)
        await callProgress($, { id: '9990001', title: '演示-商家端-示例模块', step: 'read', status: 'doing' })
        expect(seen.written).toEqual([STATE_FILE])
        await ui.unmount()
    })
})

describe('开工分流与启动命令', () => {
    test('分流：空闲且手上没有没做完的需求才在本会话开工；忙或手上有需求给新会话命令；归别的会话的给回到那个会话的命令', () => {
        const legacy = parseProgress(legacyState()).taskList
        const base = { id: '1000102', sessionId: SESSION_ID, isMainCheckout: true, isBusy: false }
        expect(routeStart({ ...base, taskList: [] })).toBe('submit')
        expect(routeStart({ ...base, taskList: [], isBusy: true })).toBe('new')
        expect(routeStart({ ...base, taskList: legacy })).toBe('new')
        expect(routeStart({ ...base, taskList: legacy, isMainCheckout: false })).toBe('submit')
        const mine = storyTask('1000102', '乙', 'develop', { sessionId: SESSION_ID })
        expect(routeStart({ ...base, taskList: [mine], isBusy: true })).toBe('queue')
        expect(routeStart({ ...base, taskList: [{ ...mine, sessionId: OTHER_SESSION }] })).toBe('resume')
    })

    test('命令：worktree 不存在才用 --no-track 建分支，进去后 claude --session-id 起会话；PowerShell 单引号转义', () => {
        const root = 'D:\\work\\demo'
        const worktree = worktreeOf(root, '1000102')
        expect(worktree).toBe('D:\\work\\demo-1000102')
        expect(branchOf('feat/{id}', '1000102')).toBe('feat/1000102')
        const prompt = startPrompt({ longId: STORY_B, worktree, branch: 'feat/1000102', root })
        expect(prompt).toBe(
            `开工 ${STORY_B}（独立会话：worktree D:\\work\\demo-1000102，分支 feat/1000102；流程文档与 state.json 在 D:\\work\\demo\\docs\\xiaoli，进度用 mcp__xiaoxiaoli__progress 写）`
        )
        const command = newSessionCommand({ root, worktree, branch: 'feat/1000102', base: 'origin/master', sessionId: SESSION_ID, id: '1000102', prompt })
        expect(command).toBe(
            [
                `if (-not (Test-Path 'D:\\work\\demo-1000102')) { git -C 'D:\\work\\demo' worktree add --no-track -b feat/1000102 'D:\\work\\demo-1000102' origin/master }; `,
                `if (Test-Path 'D:\\work\\demo-1000102') { Set-Location 'D:\\work\\demo-1000102'; `,
                /* 0.7.0 起开工提示放在 --add-dir 之前：--add-dir 是可变参数选项，跟在它后面的提示会被当成目录收走 */
                `claude --session-id ${SESSION_ID} -n '1000102' '${prompt}' --add-dir 'D:\\work\\demo\\docs\\xiaoli' }`
            ].join('')
        )
        expect(resumeCommand({ dir: "D:\\it's", sessionId: SESSION_ID })).toBe(`Set-Location 'D:\\it''s'; claude --resume ${SESSION_ID}`)
    })

    test('面板：本会话手上有没做完的需求时点开工不发提示，生成命令复制并打进对话，需求记上新会话 ID、分支与 worktree', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: legacyState() }
        const { clock, seen } = await boot($, on, { files })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_B)
        expect(seen.submitted).toEqual([])
        const command = seen.copied[0] ?? ''
        expect(command.startsWith(`if (-not (Test-Path 'D:/work/demo-1000102')) { git -C 'D:/work/demo' worktree add --no-track -b feat/1000102 'D:/work/demo-1000102' origin/master }`)).toBe(true)
        /* 0.7.0 起开工提示在前、--add-dir 在后（理由见上一条） */
        expect(command).toContain(`-n '1000102' '开工 ${STORY_B}（`)
        expect(command.endsWith(`--add-dir 'D:/work/demo/docs/xiaoli' }`)).toBe(true)
        expect(seen.logs.some(i => i.startsWith('小小黎 1000102 启动命令（到新的 PowerShell 窗口粘贴运行）：if (-not'))).toBe(true)
        expect(seen.toasts).toContain('小小黎：1000102 的启动命令已复制，到新的 PowerShell 窗口粘贴运行')
        const task = parseProgress(files[STATE_FILE] ?? '').taskList.find(i => i.id === '1000102') as ProgressTaskType
        expect(task.sessionId).toMatch(UUID_PATTERN)
        expect(command).toContain(`claude --session-id ${task.sessionId} -n '1000102'`)
        expect({ branch: task.branch, worktree: task.worktree }).toEqual({ branch: 'feat/1000102', worktree: 'D:/work/demo-1000102' })
        expect(task.steps[2]).toEqual({ key: 'branch', title: '建分支', status: 'doing', detail: '等新终端运行启动命令' })
        const texts = await textsOf(ui)
        expect(texts).toContain('启动命令 1000102 · 新会话')
        expect(texts).toContain('  已复制，到新的 PowerShell 窗口粘贴运行')
        expect(texts.find(i => i.startsWith('需 1000102'))).toContain('开工中')
        expect(texts.some(i => i.startsWith('需 1000102 演示需求乙 · 建分支 · 等新终端运行启动命令'))).toBe(true)
        await click(ui, 2, await rowOf(ui, ACTION_LAUNCH_CLOSE))
        expect((await textsOf(ui)).some(i => i.startsWith('启动命令'))).toBe(false)
        await startFromPane(ui, STORY_B)
        expect(seen.copied[1]).toBe(`Set-Location 'D:/work/demo-1000102'; claude --resume ${task.sessionId}`)
        expect(await textsOf(ui)).toContain('启动命令 1000102 · 回到已有会话')
        await ui.unmount()
    })

    test('面板：会话正在跑一轮时开工给新会话命令；跑完空闲且手上没有需求才在本会话发出「开工 <ID>」并把需求记到本会话', async ($, on) => {
        const { clock, seen, files } = await boot($, on)
        await clock.advance(1)
        const ui = await mountPane($)
        await $.turn.start({ text: '在忙', turnId: 't1' })
        await startFromPane(ui, STORY_B)
        expect(seen.submitted).toEqual([])
        expect(seen.copied).toHaveLength(1)
        await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
        await startFromPane(ui, STORY_A)
        expect(seen.submitted).toEqual([{ text: `开工 ${STORY_A}`, asUser: true }])
        expect(seen.toasts).toContain(`小小黎：已发出：开工 ${STORY_A}`)
        const task = parseProgress(files[STATE_FILE] ?? '').taskList.find(i => i.id === '1000101') as ProgressTaskType
        expect(task.sessionId).toBe(SESSION_ID)
        expect(task.steps[2]).toEqual({ key: 'branch', title: '建分支', status: 'doing', detail: '本会话开工' })
        await ui.unmount()
    })
})

describe('待开工态', () => {
    test('面板只拉取与展示：每条待办带开工态，状态文件里有的为开工中（挂在某步下的 TAPD 任务按它自己的状态），做完为已完成，其余待开工', () => {
        const taskTodo = { ...todo(TASK_A, 'Low'), kind: 'task' as const, storyId: STORY_A }
        const story = storyTask('1000101', '演示需求甲', 'develop', {
            steps: storyTask('1000101', '演示需求甲', 'develop').steps.map(i =>
                i.key === 'develop' ? { ...i, tasks: [{ id: '1000201', title: '演示任务', status: 'done' as const }] } : i
            )
        })
        const storyA = { ...todo(STORY_A, 'High'), workspaceId: WS }
        expect(startStateOf(storyA, [])).toBe('waiting')
        expect(startStateOf(storyA, [story])).toBe('started')
        expect(startStateOf(taskTodo, [story])).toBe('done')
        const lineList = buildBoard(boardInput({ todoList: [storyA, taskTodo], progress: progressOf(story), selectedId: STORY_A }), 60)
        expect(lineList.map(lineText).filter(i => i.includes('1000101 '))[0]).toContain('1000101 开工中 ')
        expect(lineList.map(lineText)).toContain(`  [ 继续 ${STORY_A} ]`)
    })

    test('挂在某步下的 TAPD 任务按它自己的状态：未开始为待开工，进行中为开工中', () => {
        const taskTodo = { ...todo(TASK_A, 'Low'), kind: 'task' as const, storyId: STORY_A }
        const withTask = (status: 'todo' | 'doing') => storyTask('1000101', '演示需求甲', 'develop', {
            steps: storyTask('1000101', '演示需求甲', 'develop').steps.map(i =>
                i.key === 'develop' ? { ...i, tasks: [{ id: '1000201', title: '演示任务', status }] } : i
            )
        })
        expect(startStateOf(taskTodo, [withTask('todo')])).toBe('waiting')
        expect(startStateOf(taskTodo, [withTask('doing')])).toBe('started')
        const storyA = { ...todo(STORY_A, 'High'), workspaceId: WS }
        const lineList = buildBoard(boardInput({ todoList: [storyA, taskTodo], progress: progressOf(withTask('todo')) }), 60)
        expect(lineList.map(lineText).filter(i => i.includes('1000201 '))[0]).toContain('1000201 待开工 ')
    })
})

describe('缺陷 6 步', () => {
    test('缺陷走读截图、核环境版本、复现、定位判定、修复或拒绝、验证；判定拒绝要用户确认的步标「待确认」', () => {
        const bug = newTask({ id: '1000301', kind: 'bug', title: '演示缺陷', updatedAt: UPDATED, detail: '本会话开工' })
        expect(bug.steps.map(i => i.title)).toEqual(['读截图', '核环境版本', '复现', '定位判定', '修复或拒绝', '验证'])
        expect(bug.steps[0]?.status).toBe('doing')
        const [judged] = progressSteps([bug], [{ id: '1000301', step: 'fix', status: 'doing', detail: '拒绝：按设计如此', confirm: true }])
        const texts = buildBoard(boardInput({ progress: progressOf(judged as ProgressTaskType) }), 60)
        const row = texts.find(i => lineText(i).startsWith('>  5 '))
        expect(lineText(row as BoardLineType)).toBe('>  5 修复或拒绝中-拒绝：按设计如此【待确认】')
        expect(row?.segList.at(-1)).toEqual({ text: '【待确认】', color: 'warning', bold: true })
        expect(texts.map(lineText)).toContain('缺 1000301 演示缺陷')
        const wrong = applyProgress([bug], toProgressInput({ id: '1000301', step: 'develop', status: 'doing' }) as never, { updatedAt: UPDATED, sessionId: '' })
        expect(wrong).toBe('缺陷的步骤只有 screenshot、env、reproduce、diagnose、fix、verify')
        const [confirmed] = progressSteps([judged as ProgressTaskType], [{ id: '1000301', step: 'fix', confirm: false }])
        expect(confirmed?.steps[4]?.confirm).toBeUndefined()
    })

    test('面板上点缺陷开工：记成 6 步的缺陷条目，新会话分支用 fix/{id}', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: legacyState() }
        const { clock, seen } = await boot($, on, { files, store: { scope: 'all' } })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, BUG_A)
        const bug = parseProgress(files[STATE_FILE] ?? '').taskList.find(i => i.id === '1000301') as ProgressTaskType
        expect(bug.kind).toBe('bug')
        expect(bug.branch).toBe('fix/1000301')
        expect(bug.steps[0]).toEqual({ key: 'screenshot', title: '读截图', status: 'doing', detail: '等新终端运行启动命令' })
        expect(seen.copied[0]).toContain('-b fix/1000301 ')
        await ui.unmount()
    })
})

describe('进度工具 mcp__xiaoxiaoli__progress', () => {
    test('会话启动时注册；主会话的原参数（release done、note、waiting none、bindSession）在旧结构上写入成功并迁成 v2', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: legacyState() }
        const { seen } = await boot($, on, { files })
        /* 0.5.0 起多注册一个起名工具 setup，0.6.0 起再多一个工作流工具 workflow，0.7.0 起再多一个项目工具 project，0.8.0 起再多一个演练工具 guide */
        expect(seen.tools).toEqual(['progress', 'bind', 'setup', 'workflow', 'project', 'guide'])
        const result = await callProgress($, {
            id: '1046775',
            title: '商家端-设计器模块',
            step: 'release',
            status: 'done',
            detail: '#34 已上 dev，验收通过',
            note: '等 UI 确认 26 条、Sora 默认字体、Jenkins 专用 token；上线后待修 3 条已提交待推',
            waiting: 'none',
            bindSession: true
        })
        expect(result.deny).toBeUndefined()
        expect(String(result.result)).toBe(`已更新 1046775：11 步全部完成（已写入 ${STATE_FILE}）`)
        const text = files[STATE_FILE] ?? ''
        expect(text).toContain('"version": 2')
        const task = parseProgress(text).taskList[0] as ProgressTaskType
        expect(task.title).toBe('商家端-设计器模块')
        expect(task.steps.every(i => i.status === 'done')).toBe(true)
        expect(task.steps[10]?.detail).toBe('#34 已上 dev，验收通过')
        expect({ sessionId: task.sessionId, waiting: task.waiting, note: task.note }).toEqual({
            sessionId: SESSION_ID,
            waiting: null,
            note: '等 UI 确认 26 条、Sora 默认字体、Jenkins 专用 token；上线后待修 3 条已提交待推'
        })
        expect(seen.statuses.at(-1)).toBeUndefined()
    })

    test('不能写时说清原因并注明没有写入：参数不对、步骤不属于这种条目、新建缺标题、状态文件读不懂', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: legacyState() }
        const { seen } = await boot($, on, { files })
        expect((await callProgress($, { id: '1046775', status: 'done' })).deny).toBe('小小黎：参数不对，给了 status 就要给 step，没有写入')
        expect((await callProgress($, { id: '1046775', step: 'fix', status: 'doing' })).deny).toBe(
            '小小黎：需求的步骤只有 fetch、sort、branch、read、align、develop、unit、selftest、docs、tapd、release，没有写入'
        )
        expect((await callProgress($, { id: '9990009', step: 'read' })).deny).toBe('小小黎：state.json 里没有条目 9990009，新建要带 title，没有写入')
        files[STATE_FILE] = '{oops'
        expect((await callProgress($, { id: '1046775', step: 'unit', status: 'doing' })).deny).toBe('小小黎：state.json 不是合法 JSON，先修好再写，没有写入')
        expect(seen.written).toEqual([])
    })

    test('挂任务与模块、换会话、移除：演示收尾用 remove 移除演示需求', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: stringifyState([demoStory(OTHER_SESSION)]) }
        await boot($, on, { files })
        await callProgress($, { id: '9990001', step: 'develop', taskId: '9990012', module: '界面2 顶栏', moduleDone: 5 })
        await callProgress($, { id: '9990001', bindSession: true })
        const task = parseProgress(files[STATE_FILE] ?? '').taskList[0] as ProgressTaskType
        expect(task.sessionId).toBe(SESSION_ID)
        expect(task.steps[5]?.tasks?.[1]?.modules?.[1]).toEqual({ name: '界面2 顶栏', done: 5, total: 5 })
        expect((await callProgress($, { id: '9990001', step: 'develop', taskId: '9990012', module: '界面2 顶栏', moduleDone: 9 })).deny).toContain('超过了 moduleTotal')
        const removed = await callProgress($, { id: '9990001', remove: true })
        expect(String(removed.result)).toContain('已移除 9990001')
        expect(parseProgress(files[STATE_FILE] ?? '').taskList).toEqual([])
    })

    test('第二级可挂自定义阶段：非数字 taskId 不带 taskTitle 也能新挂、标题取 taskId，下面能挂模块并展开三级；纯数字仍要 taskTitle，空白 taskId 报错', () => {
        const [task] = progressSteps(
            [],
            [
                { id: '9990003', title: '演示-自定义阶段', step: 'selftest', status: 'doing', bindSession: true },
                { id: '9990003', step: 'selftest', taskId: ' 自测 ', taskStatus: 'doing' },
                { id: '9990003', step: 'selftest', taskId: '自测', module: '界面1 布局', moduleDone: 1, moduleTotal: 3 },
                { id: '9990003', step: 'selftest', taskId: '对接 UI' }
            ]
        )
        if (task === undefined) throw new Error('demo')

        expect(task.steps[7]?.tasks).toEqual([
            { id: '自测', title: '自测', status: 'doing', modules: [{ name: '界面1 布局', done: 1, total: 3 }] },
            { id: '对接 UI', title: '对接 UI', status: 'todo' }
        ])
        const texts = buildBoard(boardInput({ progress: progressOf(task) }), 60).map(lineText)
        const at = texts.indexOf('>  8 浏览器自测中')
        expect(texts.slice(at, at + 4)).toEqual(['>  8 浏览器自测中', '     ├─自测', '     │ └─界面1 布局 1/3', '     └─对接 UI'])
        const apply = (raw: Record<string, unknown>) => {
            const input = toProgressInput(raw)
            return typeof input === 'string' ? input : applyProgress([task], input, { updatedAt: UPDATED, sessionId: SESSION_ID })
        }
        expect(apply({ id: '9990003', step: 'selftest', taskId: '9990031' })).toBe('浏览器自测 下没有子项 9990031，新挂要带 taskTitle')
        expect(apply({ id: '9990003', step: 'selftest', taskId: '' })).toBe('taskId 要填 TAPD 任务短 ID（纯数字）或自定义阶段名，不能为空')
        expect(apply({ id: '9990003', step: 'selftest', taskId: '   ' })).toBe('taskId 要填 TAPD 任务短 ID（纯数字）或自定义阶段名，不能为空')
    })
})

describe('状态行', () => {
    test('文件不存在显示暂无进行中任务；有任务时写状态行，清空后状态行也清掉', async ($, on) => {
        const { clock, seen, files } = await boot($, on)
        const ui = await mountPane($)
        expect((await linesOf(ui)).some(i => lineText(i) === '暂无进行中任务')).toBe(true)
        files[STATE_FILE] = JSON.stringify({ tasks: [{ id: 'T1', title: '演示需求', step: 4, stepName: '写代码', waiting: 'tapd', updatedAt: '2026-10-21', sessionId: SESSION_ID }] })
        await clock.advance(2000)
        expect(seen.statuses.at(-1)).toBe('小小黎 · T1 第 4 步 读需求与语雀中-写代码')
        expect((await linesOf(ui)).some(i => lineText(i).includes('等你：批准改 TAPD'))).toBe(true)
        files[STATE_FILE] = '{ "tasks": [] }'
        await clock.advance(2000)
        expect(seen.statuses.at(-1)).toBeUndefined()
        await ui.unmount()
    })

    test('只显示本会话的需求：别的会话的不显示；没记 sessionId 的只在主工作区的会话里显示；本会话一条没有或会话 ID 为空返回 undefined', () => {
        const mine = storyTask('1000101', '甲', 'develop', { sessionId: SESSION_ID })
        const theirs = storyTask('1000103', '丙', 'align', { sessionId: OTHER_SESSION })
        const legacy = storyTask('1000104', '丁', 'read')
        /* worktree 里的会话：旧条目不算本会话的 */
        expect(statusText([theirs, legacy, mine], SESSION_ID, false)).toBe('小小黎 · 1000101 第 6 步 开发中')
        expect(statusText([theirs, legacy, mine], OTHER_SESSION, false)).toBe('小小黎 · 1000103 第 5 步 对齐需求中')
        expect(statusText([theirs, legacy], SESSION_ID, false)).toBeUndefined()
        expect(statusText([legacy], SESSION_ID, false)).toBeUndefined()
        /* 主工作区的会话：旧条目算本会话的 */
        expect(statusText([theirs, legacy], SESSION_ID, true)).toBe('小小黎 · 1000104 第 4 步 读需求与语雀中')
        expect(statusText([theirs, legacy, mine], SESSION_ID, true)).toBe('小小黎 · 1000104 第 4 步 读需求与语雀中 · 另 1 条')
        expect(statusText([legacy, mine], '', true)).toBeUndefined()
    })

    test('本会话两条时显示第一条，「另 N 条」只数本会话没做完的', () => {
        const first = storyTask('1000101', '甲', 'develop', { sessionId: SESSION_ID })
        const second = storyTask('1000102', '乙', 'unit', { sessionId: SESSION_ID })
        const finished = setStep(storyTask('1000105', '戊', 'release', { sessionId: SESSION_ID }), { key: 'release', status: 'done', updatedAt: UPDATED })
        const theirs = storyTask('1000103', '丙', 'align', { sessionId: OTHER_SESSION })
        const legacy = storyTask('1000104', '丁', 'read')
        expect(statusText([theirs, first, legacy, finished, second], SESSION_ID, false)).toBe('小小黎 · 1000101 第 6 步 开发中 · 另 1 条')
    })

    test('配置文件缺字段或类型不对按没配处理，开工命令的可选字段给默认值', () => {
        expect(parseConfig(JSON.stringify(CONFIG))).toEqual(CONFIG)
        expect(parseConfig(JSON.stringify({ ...CONFIG, refreshMinutes: undefined }))?.refreshMinutes).toBe(10)
        expect(parseConfig(JSON.stringify({ ...CONFIG, branchTemplate: 'feat/x; rm -rf' }))?.branchTemplate).toBe('feat/{id}')
        expect(parseConfig(JSON.stringify({ ...CONFIG, tapdWorkspaceId: 'abc' }))).toBeNull()
        expect(parseConfig('not json')).toBeNull()
    })
})

describe('环境变量开关', () => {
    test('轮询到的值变成 show / hide 才动面板', () => {
        expect(paneChange('show', 'show')).toBeUndefined()
        expect(paneChange('show', 'hide')).toBe('hide')
        expect(paneChange('hide', undefined)).toBeUndefined()
        expect(paneChange(undefined, 'show')).toBe('show')
    })

    test('每 0.5 秒轮询 XIAOXIAOLI_PANE：show 打开、hide 收起', async ($, on) => {
        const { clock, seen, env } = await boot($, on)
        env.value = 'show'
        await clock.advance(500)
        expect(seen.opened).toEqual(['xiaoxiaoli'])
        env.value = 'hide'
        await clock.advance(500)
        expect(seen.closed).toEqual(['xiaoxiaoli', 'xiaoxiaoli'])
    })

    test('会话启动一律收起：不管环境变量和上次状态，都把 XIAOXIAOLI_PANE 设成 hide', async ($, on) => {
        const { clock, seen, env } = await boot($, on, { env: 'show', store: { pane: 'show' } })
        expect(seen.opened).toEqual([])
        expect(seen.closed).toEqual(['xiaoxiaoli'])
        expect(env.value).toBe('hide')
        await clock.advance(500)
        expect(seen.opened).toEqual([])
    })

    test('面板由收起变为打开时自动拉一次待办，重复 show 不重复拉', async ($, on) => {
        const { clock, seen, env } = await boot($, on)
        await clock.advance(1)
        const todoCalls = () => seen.calls.filter(i => i.tool === 'get_todo').length
        const atStart = todoCalls()
        env.value = 'show'
        await clock.advance(500)
        expect(todoCalls()).toBe(atStart + 3)
        const presentation = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }
        await $.command.run({ command: 'xiaoxiaoli', args: 'show', ...presentation })
        await clock.advance(500)
        expect(todoCalls()).toBe(atStart + 3)
        await $.command.run({ command: 'xiaoxiaoli', args: 'hide', ...presentation })
        await $.command.run({ command: 'xiaoxiaoli', args: 'show', ...presentation })
        expect(todoCalls()).toBe(atStart + 6)
    })

    test('/xiaoxiaoli hide 与 show 同步写环境变量并开关面板，不认识的参数给用法', async ($, on) => {
        const { seen, env } = await boot($, on)
        const presentation = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }
        await $.command.run({ command: 'xiaoxiaoli', args: 'hide', ...presentation })
        expect(env.value).toBe('hide')
        expect(seen.closed).toContain('xiaoxiaoli')
        await $.command.run({ command: 'xiaoxiaoli', args: 'show', ...presentation })
        expect(env.value).toBe('show')
        const usage = await $.command.run({ command: 'xiaoxiaoli', args: 'what', ...presentation })
        expect(usage.text).toContain('用法')
    })

    test('别的插件代跑 /xiaoxiaoli show（小克「干活」）：照样打开，但返回 {} 不往 transcript 打字', async ($, on) => {
        const { seen, env } = await boot($, on, { env: 'hide' })
        const presentation = { presentation: { isFullscreen: true, columns: 160 } }
        const byPlugin = await $.command.run({
            command: 'xiaoxiaoli',
            args: 'show',
            origin: { kind: 'plugin', name: 'xiaoke' },
            ...presentation
        })
        expect(byPlugin).toEqual({})
        expect(env.value).toBe('show')
        expect(seen.opened).toEqual(['xiaoxiaoli'])
        const byPerson = await $.command.run({ command: 'xiaoxiaoli', args: 'show', origin: { kind: 'composer' }, ...presentation })
        expect(byPerson.text).toBe('小小黎：侧栏已打开')
    })
})

describe('待办与开工', () => {
    test('拉本项目三类待办，补上预计开始与状态中文名；有时间的在前，任务挂在所属需求下', async ($, on) => {
        const { clock } = await boot($, on)
        await clock.advance(1)
        const ui = await mountPane($)
        const todoRows = (await linesOf(ui)).filter(i => i.action?.startsWith('todo:'))
        expect(todoRows.map(i => i.action)).toEqual([`todo:${STORY_A}`, `todo:${TASK_A}`, `todo:${STORY_B}`])
        expect(lineText(todoRows[0] as BoardLineType)).toContain('转开发 中 10-20')
        expect(lineText(todoRows[1] as BoardLineType).startsWith(' |- 任 1000201')).toBe(true)
        expect(lineText(todoRows[1] as BoardLineType)).toContain('未开始 低 10-22')
        await ui.unmount()
    })

    test('点待办一行先高亮出确认按钮，再点确认才发出「开工 <ID>」并提示', async ($, on) => {
        const { clock, seen } = await boot($, on)
        await clock.advance(1)
        const ui = await mountPane($)
        const row = await rowOf(ui, `todo:${STORY_A}`)
        await click(ui, 5, row)
        expect(seen.submitted).toEqual([])
        expect(lineText((await linesOf(ui))[row + 1] as BoardLineType)).toContain(`开工 ${STORY_A}`)
        await click(ui, 20, row + 1)
        expect(seen.submitted).toEqual([{ text: `开工 ${STORY_A}`, asUser: true }])
        expect(seen.toasts).toContain(`小小黎：已发出：开工 ${STORY_A}`)
        expect(await rowOf(ui, `start:${STORY_A}`)).toBe(-1)
        await ui.unmount()
    })

    test('伪造的确认消息（没选中的 ID）不会发出', async ($, on) => {
        const { clock, seen } = await boot($, on)
        await clock.advance(1)
        const ui = await mountPane($)
        await ui.post({ type: 'row', action: `start:${STORY_A}` }, { in: 'board' })
        await ui.post({ type: 'row', action: 'start:9999' }, { in: 'board' })
        expect(seen.submitted).toEqual([])
        expect(seen.copied).toEqual([])
        await ui.unmount()
    })

    test('切到全部项目：先查参与的项目（去掉公司），再逐个拉', async ($, on) => {
        const { clock } = await boot($, on)
        await clock.advance(1)
        const ui = await mountPane($)
        await click(ui, 3, await rowOf(ui, ACTION_SCOPE))
        const lineList = await linesOf(ui)
        /* 60 列时左边会被截断，只看开头；完整项目数在宽面板下可见 */
        expect(lineText(lineList[HEADER_ROW] as BoardLineType)).toContain('全部项目（')
        const todoRows = lineList.filter(i => i.action?.startsWith('todo:'))
        expect(todoRows.at(-1)?.action).toBe(`todo:${BUG_A}`)
        expect(todoRows.some(i => i.action === `todo:${STORY_C}`)).toBe(true)
        expect(lineList.some(i => i.action === ACTION_ITERATION)).toBe(false)
        expect(lineList.some(i => lineText(i).startsWith('缺 1000301'))).toBe(true)
        await ui.unmount()
    })
})

describe('配色', () => {
    test('只用主题键且不用 error 红色：可点与选中 suggestion，备选 subtle，计数与刷新时间 inactive，提示 warning', () => {
        const bug = { ...todo('BG', 'urgent'), kind: 'bug' as const }
        const state: IterationStateType = { list: [iterationOf('I1', '2026-10-01', '2026-10-31')], currentId: 'I1', pick: 'current', listShow: true, loaded: true }
        const lineList = buildBoard(
            boardInput({
                todoList: [{ ...todo(STORY_A, 'High', '2026-10-20'), iterationId: 'I1' }, bug],
                selectedId: STORY_A,
                iteration: state,
                todoMeta: { ...metaDefault(), error: '1 个项目拉取失败（call-failed）' },
                progress: progressOf(demoStory(SESSION_ID))
            }),
            120
        )
        const colorList = lineList.flatMap(line => line.segList.map(i => i.color)).filter(i => i !== undefined)
        expect(colorList.every(i => ['suggestion', 'subtle', 'inactive', 'warning', 'success', 'text'].includes(i))).toBe(true)
        const seg = (text: string) => lineList.flatMap(line => line.segList).find(i => i.text === text)
        expect(seg('[ 刷新 ]')?.color).toBe('suggestion')
        expect(seg('本项目')?.color).toBe('suggestion')
        expect(seg('全部项目')?.color).toBe('subtle')
        expect(seg('本迭代（迭代I1）')?.color).toBe('suggestion')
        expect(seg('全部')?.color).toBe('subtle')
        expect(seg('待办')).toEqual({ text: '待办', bold: true })
        expect(seg('（2）')?.color).toBe('inactive')
        expect(seg('1 个项目拉取失败（call-failed）')?.color).toBe('warning')
        expect(seg('缺')?.color).toBe('warning')
    })
})

describe('TAPD 连接重试', () => {
    test('首次失败后按 5、15 秒重试，期间标题行提示第几次重试，迭代行如实写「迭代未加载，暂显示全部」；连上后正常显示', async ($, on) => {
        const { clock, seen, tapd } = await boot($, on, { tapdDown: true })
        await clock.advance(1)
        const ui = await mountPane($)
        const header = async () => lineText((await linesOf(ui))[HEADER_ROW] as BoardLineType)
        expect(await header()).toContain('正在连接 TAPD，第 1 次重试')
        expect(lineText((await linesOf(ui))[ITERATION_ROW] as BoardLineType)).toBe('迭代：本迭代（迭代未加载，暂显示全部） ▸')
        expect(seen.logs.some(i => i.startsWith('待办拉取失败：call-failed，') && i.length <= 220)).toBe(true)
        await clock.advance(5000)
        expect(await header()).toContain('正在连接 TAPD，第 2 次重试')
        tapd.down = false
        await clock.advance(15000)
        expect(await header()).not.toContain('正在连接')
        expect(await header()).not.toContain('拉取失败')
        expect(await rowOf(ui, `todo:${STORY_A}`)).toBeGreaterThan(0)
        expect(lineText((await linesOf(ui))[ITERATION_ROW] as BoardLineType)).toBe('迭代：本迭代（演示迭代二） ▸')
        expect(seen.calls.filter(i => i.tool === 'get_iterations').length).toBe(3)
        await ui.unmount()
    })

    test('5、15、30 秒三次重试都失败才显示失败并提示点刷新；手动刷新立即再拉', async ($, on) => {
        const { clock, seen, tapd } = await boot($, on, { tapdDown: true })
        await clock.advance(1)
        await clock.advance(5000)
        await clock.advance(15000)
        const ui = await mountPane($)
        expect(lineText((await linesOf(ui))[HEADER_ROW] as BoardLineType)).toContain('正在连接 TAPD，第 3 次重试')
        await clock.advance(30000)
        const header = lineText((await linesOf(ui))[HEADER_ROW] as BoardLineType)
        expect(header).toContain('拉取失败（call-failed），点刷新重试')
        expect(header).not.toContain('正在连接')
        expect(header).not.toContain('无当前迭代')
        expect(seen.calls.filter(i => i.tool === 'get_iterations').length).toBe(4)
        await clock.advance(60000)
        expect(seen.calls.filter(i => i.tool === 'get_iterations').length).toBe(4)
        tapd.down = false
        await click(ui, 0, await rowOf(ui, ACTION_REFRESH))
        expect(lineText((await linesOf(ui))[HEADER_ROW] as BoardLineType)).not.toContain('拉取失败')
        expect(await rowOf(ui, `todo:${STORY_A}`)).toBeGreaterThan(0)
        await ui.unmount()
    })
})

describe('TAPD 白名单', () => {
    test('只放行白名单里 get_ 开头的工具，写操作一律拒绝', () => {
        expect(toReadTool('get_todo')).toBe('get_todo')
        for (const tool of ['update_bug', 'create_story_or_task', 'get_anything_else', 'send_qiwei_message']) {
            let kind = ''
            try {
                toReadTool(tool)
            } catch (cause) {
                kind = cause instanceof TapdError ? cause.kind : 'other'
            }
            expect(kind).toBe('denied-tool')
        }
    })

    test('一轮刷新里实际调用的全是 tapd 服务器上 get_ 开头的工具', async ($, on) => {
        const { clock, seen } = await boot($, on)
        await clock.advance(1)
        expect(seen.calls.length).toBeGreaterThan(0)
        expect(seen.calls.every(i => i.server === 'tapd' && i.tool.startsWith('get_'))).toBe(true)
    })

    test('返回解析：拆开 { result } 包装与单键包装；isError 与坏 JSON 归成错误类型', () => {
        expect(readRows(readJson(wrappedResult(ok([{ Story: { id: '1' } }]))))).toEqual([{ id: '1' }])
        const kindOf = (result: McpToolResult) => {
            try {
                readJson(result)
                return ''
            } catch (cause) {
                return cause instanceof TapdError ? cause.kind : 'other'
            }
        }
        expect(kindOf({ content: [{ type: 'text', text: 'boom' }], isError: true })).toBe('tapd-error')
        expect(kindOf({ content: [{ type: 'text', text: '{bad' }], isError: false })).toBe('parse')
        expect(kindOf(textResult({ status: 0, data: [], info: 'fail' }))).toBe('tapd-error')
    })

    test('单个项目失败只计数，补字段失败按待办自带字段显示', async () => {
        const call = async (tool: TapdReadTool, args: Record<string, unknown>): Promise<McpToolResult> => {
            if (tool === 'get_todo' && args.workspace_id === 1) throw new Error('no permission')
            if (tool === 'get_stories_or_tasks' || tool === 'get_bug') return { content: [], isError: true }
            return fakeTapd(tool, args)
        }
        const result = await fetchTodos(call, [
            { id: '1', name: '坏项目' },
            { id: WS, name: '演示项目' }
        ])
        expect(result.failedCount).toBe(1)
        expect(result.errorKind).toBe('call-failed')
        expect(result.errorDetail).toBe('Error: no permission')
        expect(result.todoList.map(i => i.id)).toEqual([STORY_B, STORY_A, STORY_C, TASK_A])
        expect(result.todoList.every(i => i.begin === '')).toBe(true)
    })
})

describe('全局模式：项目键与全局目录', () => {
    test('项目键 = 目录名加路径短哈希：同名不同路径不同键；分隔符、末尾斜杠、大小写不同的同一目录同一个键', () => {
        const key = projectKeyOf('D:\\Demo\\fg-psd-demo')
        expect(key).toMatch(/^fg-psd-demo-[0-9a-f]{8}$/)
        expect(projectKeyOf('d:/demo/FG-PSD-DEMO/')).toBe(key)
        expect(projectKeyOf('E:\\other\\fg-psd-demo')).not.toBe(key)
        expect(projectKeyOf('E:\\other\\fg-psd-demo')).toMatch(/^fg-psd-demo-[0-9a-f]{8}$/)
        expect(projectKeyOf('D:/work/我的 项目:x')).toMatch(/^我的-项目-x-[0-9a-f]{8}$/)
    })

    test('全局根目录：XIAOXIAOLI_HOME > CLAUDE_CONFIG_DIR/xiaoxiaoli > 用户目录/.claude/xiaoxiaoli，都取不到为空', () => {
        expect(globalRootOf({ override: 'X:/custom/', configDir: 'C:\\cfg', userProfile: 'C:\\Users\\a' })).toBe('X:/custom')
        expect(globalRootOf({ configDir: 'C:\\cfg', userProfile: 'C:\\Users\\a' })).toBe('C:\\cfg\\xiaoxiaoli')
        expect(globalRootOf({ userProfile: 'C:\\Users\\a', home: '/home/a' })).toBe('C:\\Users\\a\\.claude\\xiaoxiaoli')
        expect(globalRootOf({ home: '/home/a' })).toBe('/home/a/.claude/xiaoxiaoli')
        expect(globalRootOf({})).toBe('')
    })

    test('全局模式的项目：worktree 归到主工作区，配置与状态在 <全局根>/projects/<项目键>/；不在仓库里用会话目录', () => {
        const globalRoot = 'C:\\Users\\a\\.claude\\xiaoxiaoli'
        const place = globalPlaceOf({ globalRoot, cwd: 'D:\\work\\demo-9990001', repoRoot: 'D:\\work\\demo', sessionId: SESSION_ID })
        const dataDir = `${globalRoot}\\projects\\${projectKeyOf('D:\\work\\demo')}`
        expect(place).toEqual({
            dir: 'D:\\work\\demo',
            name: 'demo',
            statePath: `${dataDir}\\state.json`,
            sessionId: SESSION_ID,
            isMainCheckout: false,
            mode: 'global',
            configPath: `${dataDir}\\config.json`,
            dataDir,
            projectKey: projectKeyOf('D:\\work\\demo')
        })
        const outside = globalPlaceOf({ globalRoot, cwd: 'D:\\notes', repoRoot: '', sessionId: SESSION_ID })
        expect({ dir: outside.dir, isMainCheckout: outside.isMainCheckout }).toEqual({ dir: 'D:\\notes', isMainCheckout: true })
    })

    test('全局模式的项目：项目内已有状态文件时只有 statePath 指向项目内那份，配置、全局项目目录、项目键仍是全局的', () => {
        const globalRoot = 'C:\\Users\\a\\.claude\\xiaoxiaoli'
        const input = { globalRoot, cwd: 'D:\\work\\demo', repoRoot: 'D:\\work\\demo', sessionId: SESSION_ID }
        const projectStatePath = 'D:\\work\\demo/docs/xiaoli/local/workbench/state.json'
        const plain = globalPlaceOf(input)
        expect(globalPlaceOf({ ...input, projectStatePath })).toEqual({ ...plain, statePath: projectStatePath })
        expect(globalPlaceOf({ ...input, projectStatePath: '' })).toEqual(plain)
    })

    test('绑定写入：TAPD 项目两项与项目目录写进配置，原有设置保留，传了的分支设置覆盖；解绑只去掉 TAPD 两项', () => {
        const old = JSON.stringify({ projectName: '旧项目', tapdWorkspaceId: '1', refreshMinutes: 5, branchBase: 'origin/dev' })
        const text = bindConfigText(old, { projectName: '演示项目', tapdWorkspaceId: WS, root: FG_ROOT, branchTemplate: 'feature/{id}', branchBase: undefined })
        expect(JSON.parse(text)).toEqual({ projectName: '演示项目', tapdWorkspaceId: WS, root: FG_ROOT, refreshMinutes: 5, branchBase: 'origin/dev', branchTemplate: 'feature/{id}' })
        expect(parseConfig(text)).toEqual({
            projectName: '演示项目',
            tapdWorkspaceId: WS,
            refreshMinutes: 5,
            branchTemplate: 'feature/{id}',
            bugBranchTemplate: 'fix/{id}',
            branchBase: 'origin/dev'
        })
        const unbound = unbindConfigText(text)
        expect(parseConfig(unbound)).toBeNull()
        expect(JSON.parse(unbound)).toEqual({ root: FG_ROOT, refreshMinutes: 5, branchBase: 'origin/dev', branchTemplate: 'feature/{id}' })
        expect(JSON.parse(bindConfigText('', { projectName: '演示项目', tapdWorkspaceId: WS, root: FG_ROOT }))).toEqual({ ...GLOBAL_CONFIG, root: FG_ROOT })
        expect(parseConfig(bindConfigText('{oops', { projectName: '演示项目', tapdWorkspaceId: WS, root: FG_ROOT }))?.branchBase).toBe('origin/master')
    })

    test('绑定工具参数与项目匹配：纯数字按 ID；名字完全一致优先、再按包含；对不上或对上多个给说明', () => {
        expect(toBindInput({})).toBe('project 要填 TAPD 项目名或项目 ID')
        expect(toBindInput({ project: '  ' })).toBe('project 要填 TAPD 项目名或项目 ID')
        expect((toBindInput({ project: 90000001 }) as { project: string }).project).toBe('90000001')
        expect(toBindInput({ project: 'x', branchTemplate: 'feat/x; rm' })).toBe('branchTemplate 要含 {id}，且只能含字母、数字与 . _ / -')
        expect(toBindInput({ project: 'x', branchBase: 'origin/dev && x' })).toBe('branchBase 只能含字母、数字与 . _ / -')
        const list = [
            { id: WS, name: '演示项目' },
            { id: WS2, name: '演示项目二' },
            { id: '90000009', name: '另一个' }
        ]
        expect(matchProject(list, WS2)).toEqual({ id: WS2, name: '演示项目二' })
        expect(matchProject(list, ' 演示项目 ')).toEqual({ id: WS, name: '演示项目' })
        expect(matchProject(list, '项目二')).toEqual({ id: WS2, name: '演示项目二' })
        expect(matchProject(list, '演示')).toBe(`「演示」对上了 2 个项目：演示项目（${WS}）、演示项目二（${WS2}），请给全名或项目 ID`)
        expect(matchProject(list, '不存在')).toBe('你参与的 TAPD 项目里没有名字含「不存在」的项目')
        expect(matchProject(list, '123')).toBe('你参与的 TAPD 项目里没有 ID 为 123 的项目')
    })

    test('开工消息：项目内模式原样「开工 <ID>」；全局模式带流程指引、取本项目工作流的一句（0.6.0 起）、项目资料目录与 TAPD 评论署名（0.5.0 起，默认名），新会话命令的 --add-dir 换成全局项目目录', () => {
        const dataDir = 'C:\\Users\\a\\.claude\\xiaoxiaoli\\projects\\demo-1a2b3c4d'
        const flowStory = '先调 mcp__xiaoxiaoli__workflow 取本项目工作流（kind 传 story），按它的步骤、细则与「先问」走，进度用它的步骤键，其余照技能的通用规则'
        expect(submitText({ longId: STORY_A, dataDir: '' })).toBe(`开工 ${STORY_A}`)
        /* 0.9.0 起技能随工作台插件安装，名字是 xiaoxiaoli:xiaoli-workflow，两种叫法都写上 */
        expect(submitText({ longId: STORY_A, dataDir })).toBe(
            `开工 ${STORY_A}（按 xiaoli-workflow 技能（随工作台插件安装时名为 xiaoxiaoli:xiaoli-workflow）的流程执行，用 mcp__xiaoxiaoli__progress 推进进度；项目内有 docs/xiaoli/workflow.md 时以项目内文档为准；${flowStory}；项目资料目录 ${dataDir}；TAPD 评论署名 ——小小黎AI工作台）`
        )
        const root = 'D:\\work\\demo'
        const worktree = worktreeOf(root, '1000102')
        const prompt = startPrompt({ longId: STORY_B, worktree, branch: 'feat/1000102', root, dataDir })
        expect(prompt).toBe(`开工 ${STORY_B}（独立会话：worktree D:\\work\\demo-1000102，分支 feat/1000102；${GLOBAL_GUIDE}；${flowStory}；项目资料目录 ${dataDir}；TAPD 评论署名 ——小小黎AI工作台）`)
        const plan = { root, worktree, branch: 'feat/1000102', base: 'origin/master', sessionId: SESSION_ID, id: '1000102', prompt }
        /* 0.7.0 起开工提示在 --add-dir 之前 */
        expect(newSessionCommand({ ...plan, addDir: dataDir })).toContain(`claude --session-id ${SESSION_ID} -n '1000102' '开工 ${STORY_B}（`)
        expect(newSessionCommand({ ...plan, addDir: dataDir })).toContain(`' --add-dir '${dataDir}' }`)
        expect(newSessionCommand({ ...plan, addDir: '' })).not.toContain('--add-dir')
        expect(newSessionCommand(plan)).toContain(`--add-dir 'D:\\work\\demo\\docs\\xiaoli'`)
    })
})

describe('全局模式：查找顺序', () => {
    test('项目内有 config.json 时照旧用项目内的，全局目录里的同项目绑定不看', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [globalFilesOf(CWD).config]: JSON.stringify({ projectName: '全局的', tapdWorkspaceId: WS2 }) }
        const { clock, seen } = await boot($, on, { files })
        await clock.advance(1)
        const ui = await mountPane($)
        expect((await textsOf(ui))[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · 演示项目 `)).toBe(true)
        expect(await rowOf(ui, `todo:${STORY_A}`)).toBeGreaterThan(0)
        await callProgress($, { id: '9990001', title: '演示-商家端-示例模块', step: 'read', status: 'doing' })
        expect(seen.written).toEqual([STATE_FILE])
        await ui.unmount()
    })

    test('项目里没有工作台文件：落到全局目录，按全局配置拉待办，进度写全局 state.json；再开会话不再询问', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) } })
        await clock.advance(1)
        const ui = await mountPane($)
        const texts = await textsOf(ui)
        expect(texts).not.toContain(NO_BINDING_TEXT)
        expect(await rowOf(ui, `todo:${STORY_A}`)).toBeGreaterThan(0)
        const result = await callProgress($, { id: '9990001', title: '演示-商家端-示例模块', step: 'read', status: 'doing' })
        expect(String(result.result)).toBe(`已更新 9990001：第 4 步 读需求与语雀中（已写入 ${global.state}）`)
        expect(seen.written).toEqual([global.state])
        expect(await textsOf(ui)).toContain('需 9990001 演示-商家端-示例模块')
        await ui.unmount()
    })

    test('同名不同路径不串：D:/a/demo 绑定了，D:/b/demo 仍是没绑定', async ($, on) => {
        const { clock, seen } = await boot($, on, { cwd: 'D:/b/demo', files: { [globalFilesOf('D:/a/demo').config]: JSON.stringify(GLOBAL_CONFIG) } })
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await textsOf(ui)).toContain(NO_BINDING_TEXT)
        expect(seen.calls.map(i => i.tool)).toEqual(['get_user_participant_projects'])
        await ui.unmount()
    })

    test('会话在 worktree 里：归到主工作区，读同一份全局绑定，进度写同一个 state.json', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const files = { [global.config]: JSON.stringify(GLOBAL_CONFIG), [global.state]: stringifyState([demoStory()]) }
        const { clock, seen } = await boot($, on, { cwd: `${FG_ROOT}-9990001`, repoRoot: FG_ROOT, files })
        await clock.advance(1)
        const ui = await mountPane($)
        expect((await textsOf(ui))[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · 演示项目 `)).toBe(true)
        /* 没记会话的条目归主工作区的会话：worktree 里折成一行 */
        expect((await textsOf(ui)).some(i => i.startsWith('需 9990001 演示-商家端-示例模块 · 开发 · '))).toBe(true)
        await callProgress($, { id: '9990001', step: 'develop', taskId: '9990012', module: '界面2 顶栏', moduleDone: 4 })
        expect(seen.written).toEqual([global.state])
        await ui.unmount()
    })

    test('项目内只有 state.json、没有 config.json（旧版 mod 写的）、还没绑定：显示绑定列表而不是「没配 TAPD」，进行中区照常显示项目内的需求', async ($, on) => {
        const projectState = projectStateOf(FG_ROOT)
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files: { [projectState]: stringifyState([demoStory()]) } })
        await clock.advance(1)
        const ui = await mountPane($)
        const texts = await textsOf(ui)
        expect(texts).toContain(NO_BINDING_TEXT)
        expect(texts).not.toContain(NO_CONFIG_TEXT)
        expect(texts).toContain('需 9990001 演示-商家端-示例模块')
        expect((await linesOf(ui)).filter(i => i.action?.startsWith('bind:')).map(i => i.action)).toEqual([`bind:${WS}`, `bind:${WS2}`])
        expect(seen.calls.map(i => i.tool)).toEqual(['get_user_participant_projects'])
        expect((await runCommand($, 'refresh')).text).toBe('小小黎：本项目还没绑定 TAPD 项目，在面板里点一个绑定，或对 AI 说「这个项目对应 TAPD 的某某项目」')
        expect(seen.written).toEqual([])
        await ui.unmount()
    })

    test('项目内只有 state.json 时绑定：config.json 写进全局目录并拉到待办；进度工具写项目内那份 state.json，全局目录下不生成 state.json', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const projectState = projectStateOf(FG_ROOT)
        const { clock, seen, files } = await boot($, on, { cwd: FG_ROOT, files: { [projectState]: stringifyState([demoStory()]) } })
        const bound = await callBind($, { project: '演示项目' })
        expect(String(bound.result)).toBe(`已把本项目（fg-demo）绑定到 TAPD 项目「演示项目」（${WS}），写入 ${global.config}；面板马上刷新待办`)
        expect(JSON.parse(files[global.config] ?? '')).toEqual({ ...GLOBAL_CONFIG, root: FG_ROOT })
        await clock.advance(1)
        const ui = await mountPane($)
        expect((await textsOf(ui))[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · 演示项目 `)).toBe(true)
        expect(await rowOf(ui, `todo:${STORY_A}`)).toBeGreaterThan(0)
        expect(await textsOf(ui)).toContain('需 9990001 演示-商家端-示例模块')
        const result = await callProgress($, { id: '9990001', step: 'unit', status: 'doing' })
        expect(String(result.result)).toBe(`已更新 9990001：第 7 步 单测中（已写入 ${projectState}）`)
        expect(seen.written).toEqual([global.config, projectState])
        expect(files[global.state]).toBeUndefined()
        expect(parseProgress(files[projectState] ?? '').taskList[0]?.steps[6]?.status).toBe('doing')
        await ui.unmount()
    })

    test('会话在 worktree 里、主工作区只有 state.json：进度读写主工作区那份，绑定仍按主工作区的项目键放在全局目录', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const projectState = projectStateOf(FG_ROOT)
        const files = { [global.config]: JSON.stringify(GLOBAL_CONFIG), [projectState]: stringifyState([demoStory()]) }
        const { clock, seen } = await boot($, on, { cwd: `${FG_ROOT}-9990001`, repoRoot: FG_ROOT, files })
        await clock.advance(1)
        const ui = await mountPane($)
        expect((await textsOf(ui))[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · 演示项目 `)).toBe(true)
        /* 没记会话的条目归主工作区的会话：worktree 里折成一行 */
        expect((await textsOf(ui)).some(i => i.startsWith('需 9990001 演示-商家端-示例模块 · 开发 · '))).toBe(true)
        const result = await callProgress($, { id: '9990001', step: 'develop', taskId: '9990012', module: '界面2 顶栏', moduleDone: 4 })
        expect(String(result.result)).toContain(`（已写入 ${projectState}）`)
        expect(seen.written).toEqual([projectState])
        await ui.unmount()
    })

    test('$.store 里记的迭代是别的项目的：本项目按本迭代筛，待办不会整列空掉', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const files = { [global.config]: JSON.stringify(GLOBAL_CONFIG) }
        const { clock } = await boot($, on, { cwd: FG_ROOT, files, store: { iteration: '1199999999001000001' } })
        await clock.advance(1)
        const ui = await mountPane($)
        expect(lineText((await linesOf(ui))[ITERATION_ROW] as BoardLineType)).toBe('迭代：本迭代（演示迭代二） ▸')
        expect(await rowOf(ui, `todo:${STORY_A}`)).toBeGreaterThan(0)
        await ui.unmount()
    })
})

describe('全局模式：绑定与解绑', () => {
    test('首次进入没绑定的项目：列出参与的项目，点一行出确认，再点才写全局配置，之后按正常流程拉待办', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { clock, seen, files } = await boot($, on, { cwd: FG_ROOT, files: {} })
        await clock.advance(1)
        const ui = await mountPane($)
        const texts = await textsOf(ui)
        expect(texts[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · fg-demo `)).toBe(true)
        expect(texts.slice(2, 5)).toEqual(['-'.repeat(58), ' ', NO_BINDING_TEXT])
        expect(texts).toContain(BIND_HINT_TEXT)
        expect((await linesOf(ui)).filter(i => i.action?.startsWith('bind:')).map(i => i.action)).toEqual([`bind:${WS}`, `bind:${WS2}`])
        expect(seen.calls.map(i => i.tool)).toEqual(['get_user_participant_projects'])
        await ui.post({ type: 'row', action: `bindok:${WS}` }, { in: 'board' })
        expect(seen.written).toEqual([])
        await click(ui, 3, await rowOf(ui, `bind:${WS2}`))
        expect(seen.written).toEqual([])
        const confirmRow = (await rowOf(ui, `bind:${WS2}`)) + 1
        expect(lineText((await linesOf(ui))[confirmRow] as BoardLineType)).toBe('    [ 绑定 演示项目二 ]')
        await click(ui, 3, confirmRow)
        expect(seen.written).toEqual([global.config])
        expect(JSON.parse(files[global.config] ?? '')).toEqual({ projectName: '演示项目二', tapdWorkspaceId: WS2, root: FG_ROOT })
        expect(seen.toasts).toContain('小小黎：已绑定 TAPD 项目「演示项目二」，正在拉待办')
        await clock.advance(1)
        expect((await textsOf(ui))[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · 演示项目二 `)).toBe(true)
        expect(await rowOf(ui, `todo:${BUG_A}`)).toBeGreaterThan(0)
        expect(seen.calls.filter(i => i.tool === 'get_todo')).toHaveLength(3)
        await ui.unmount()
    })

    test('没绑定时 TAPD 还没连上：标题行提示第几次重试，连上后列出项目', async ($, on) => {
        const { clock, tapd } = await boot($, on, { cwd: FG_ROOT, files: {}, tapdDown: true })
        await clock.advance(1)
        const ui = await mountPane($)
        expect((await textsOf(ui))[HEADER_ROW]).toContain('正在连接 TAPD，第 1 次重试')
        expect(await textsOf(ui)).toContain('正在连接 TAPD...')
        tapd.down = false
        await clock.advance(5000)
        expect(await rowOf(ui, `bind:${WS}`)).toBeGreaterThan(0)
        await ui.unmount()
    })

    test('AI 绑定 mcp__xiaoxiaoli__bind：对不上、对上多个、参数不对都回原因并注明没有写入；按名字绑定后面板拉待办', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { clock, seen, files } = await boot($, on, { cwd: FG_ROOT, files: {} })
        /* 0.5.0 起多注册一个起名工具 setup，0.6.0 起再多一个工作流工具 workflow，0.7.0 起再多一个项目工具 project，0.8.0 起再多一个演练工具 guide */
        expect(seen.tools).toEqual(['progress', 'bind', 'setup', 'workflow', 'project', 'guide'])
        expect((await callBind($, { project: '演示' })).deny).toBe(
            `小小黎：「演示」对上了 2 个项目：演示项目（${WS}）、演示项目二（${WS2}），请给全名或项目 ID，没有写入`
        )
        expect((await callBind($, { project: '不存在的项目' })).deny).toBe('小小黎：你参与的 TAPD 项目里没有名字含「不存在的项目」的项目，没有写入')
        expect((await callBind($, { project: '演示项目', branchTemplate: 'feat/x;rm' })).deny).toBe(
            '小小黎：参数不对，branchTemplate 要含 {id}，且只能含字母、数字与 . _ / -，没有写入'
        )
        expect(seen.written).toEqual([])
        const result = await callBind($, { project: '演示项目', branchBase: 'origin/dev' })
        expect(String(result.result)).toBe(`已把本项目（fg-demo）绑定到 TAPD 项目「演示项目」（${WS}），写入 ${global.config}；面板马上刷新待办`)
        expect(parseConfig(files[global.config] ?? '')?.branchBase).toBe('origin/dev')
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await rowOf(ui, `todo:${STORY_A}`)).toBeGreaterThan(0)
        await ui.unmount()
    })

    test('/xiaoxiaoli unbind：清掉全局绑定回到绑定列表，其余设置与 state.json 不动；没绑定时说不用解除', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const files = { [global.config]: JSON.stringify({ ...GLOBAL_CONFIG, root: FG_ROOT, branchBase: 'origin/dev' }), [global.state]: stringifyState([demoStory()]) }
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files })
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await rowOf(ui, `todo:${STORY_A}`)).toBeGreaterThan(0)
        expect((await runCommand($, 'unbind')).text).toBe(
            '小小黎：已解除本项目（fg-demo）与 TAPD 项目「演示项目」的绑定；进行中区与 state.json 不动，面板重新列出 TAPD 项目供绑定'
        )
        expect(seen.written).toEqual([global.config])
        expect(JSON.parse(files[global.config] ?? '')).toEqual({ root: FG_ROOT, branchBase: 'origin/dev' })
        const texts = await textsOf(ui)
        expect(texts).toContain(NO_BINDING_TEXT)
        expect(texts).toContain('需 9990001 演示-商家端-示例模块')
        expect(await rowOf(ui, `bind:${WS}`)).toBeGreaterThan(0)
        expect((await runCommand($, 'unbind')).text).toBe('小小黎：本项目还没绑定 TAPD 项目，不用解除')
        expect((await runCommand($, 'refresh')).text).toBe('小小黎：本项目还没绑定 TAPD 项目，在面板里点一个绑定，或对 AI 说「这个项目对应 TAPD 的某某项目」')
        await ui.unmount()
    })

    test('项目内模式（yt-shelf 这类）：绑定工具与 unbind 都不碰项目内配置，说明原因', async ($, on) => {
        const { seen, files } = await boot($, on)
        expect((await callBind($, { project: '演示项目' })).deny).toBe(`小小黎：本项目用项目内配置 ${CONFIG_FILE}，全局绑定不生效，没有写入`)
        expect((await runCommand($, 'unbind')).text).toBe(`小小黎：本项目用项目内配置 ${CONFIG_FILE}，unbind 只清全局绑定，项目内配置没动`)
        expect(seen.written).toEqual([])
        expect(files[CONFIG_FILE]).toBe(JSON.stringify(CONFIG))
        expect(seen.calls).toEqual([])
    })

    test('全局模式开工：本会话发出的消息带流程指引、取本项目工作流的一句（0.6.0 起）与 TAPD 评论署名；手上有需求时给新会话命令，--add-dir 指向全局项目目录，分支照旧 --no-track 从 origin/master 起', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { clock, seen, files } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) } })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_A)
        /* 0.7.0 起资料目录一句同时给出通用资料目录 */
        expect(seen.submitted).toEqual([
            {
                text: `开工 ${STORY_A}（${GLOBAL_GUIDE}；${workflowGuide('story')}；${resourceDirsText(global.dir, SHARED)}；TAPD 评论署名 ——小小黎AI工作台）`,
                asUser: true
            }
        ])
        expect(seen.toasts).toContain(`小小黎：已发出：开工 ${STORY_A}`)
        expect(seen.written).toEqual([global.state])
        await startFromPane(ui, STORY_B)
        const command = seen.copied[0] ?? ''
        const worktree = `${FG_ROOT}-1000102`
        expect(command.startsWith(`if (-not (Test-Path '${worktree}')) { git -C '${FG_ROOT}' worktree add --no-track -b feat/1000102 '${worktree}' origin/master }`)).toBe(true)
        /* 0.7.0 起开工提示在 --add-dir 之前，并多一个通用资料目录的 --add-dir */
        expect(command).toContain(
            `-n '1000102' '开工 ${STORY_B}（独立会话：worktree ${worktree}，分支 feat/1000102；${GLOBAL_GUIDE}；${workflowGuide('story')}；${resourceDirsText(global.dir, SHARED)}；TAPD 评论署名 ——小小黎AI工作台）' --add-dir '${global.dir}' --add-dir '${SHARED}' }`
        )
        expect(command).not.toContain(`${FG_ROOT}/docs/xiaoli`)
        const task = parseProgress(files[global.state] ?? '').taskList.find(i => i.id === '1000102')
        expect({ branch: task?.branch, worktree: task?.worktree }).toEqual({ branch: 'feat/1000102', worktree })
        await ui.unmount()
    })
})

describe('沉浸模式', () => {
    /** 本会话有一条展开到三级的演示需求 */
    const focusFiles = () => ({ [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: stringifyState([demoStory(SESSION_ID)]) })
    /** 「进行中」标题行的文字 */
    const focusTitle = async (ui: PaneType) => lineText((await linesOf(ui))[await rowOf(ui, ACTION_FOCUS)] as BoardLineType)
    const clickFocus = async (ui: PaneType) => click(ui, 5, await rowOf(ui, ACTION_FOCUS))

    test('平时「进行中」标题行右侧是「[ 沉浸 ]」且整行可点；点了只剩标题行与进行中区，标题行变「[ 退出沉浸 ]」，点顶部标题行照常刷新', async ($, on) => {
        const { clock, seen } = await boot($, on, { files: focusFiles() })
        await clock.advance(1)
        const ui = await mountPane($)
        expect((await focusTitle(ui)).startsWith('进行中（1）')).toBe(true)
        expect((await focusTitle(ui)).endsWith(FOCUS_ENTER_TEXT)).toBe(true)
        expect(displayWidth(await focusTitle(ui))).toBe(PANE_PROPS.bodyColumns - 2)
        expect((await linesOf(ui)).flatMap(i => i.segList).find(i => i.text === FOCUS_ENTER_TEXT)).toEqual({ text: FOCUS_ENTER_TEXT, color: 'suggestion', bold: true })
        expect(await rowOf(ui, ACTION_SCOPE)).toBe(SCOPE_ROW)
        await clickFocus(ui)
        const lineList = await linesOf(ui)
        const texts = lineList.map(lineText)
        expect(texts.some(i => i.startsWith('待办（'))).toBe(false)
        expect(lineList.some(i => i.action === ACTION_SCOPE || i.action === ACTION_ITERATION || i.action?.startsWith('todo:'))).toBe(false)
        expect(texts[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · 演示项目`)).toBe(true)
        expect(lineList[HEADER_ROW]?.action).toBe(ACTION_REFRESH)
        expect(texts[SEPARATOR_ROW]).toBe('-'.repeat(58))
        expect(texts[GAP_ROW]).toBe(' ')
        expect(await rowOf(ui, ACTION_FOCUS)).toBe(GAP_ROW + 1)
        expect((await focusTitle(ui)).endsWith(FOCUS_EXIT_TEXT)).toBe(true)
        expect(texts).toContain('需 9990001 演示-商家端-示例模块')
        expect(texts).toContain('     │ ├─界面2 顶栏 3/5')
        const todoCalls = () => seen.calls.filter(i => i.tool === 'get_todo').length
        const before = todoCalls()
        await click(ui, 3, HEADER_ROW)
        expect(todoCalls()).toBe(before + 3)
        expect((await focusTitle(ui)).endsWith(FOCUS_EXIT_TEXT)).toBe(true)
        await ui.unmount()
    })

    test('退出沉浸：切换、迭代、待办都回来，进沉浸前选的迭代与选中的待办（含开工确认行）还在', async ($, on) => {
        const { clock } = await boot($, on, { files: focusFiles() })
        await clock.advance(1)
        const ui = await mountPane($)
        await click(ui, 2, await rowOf(ui, ACTION_ITERATION))
        await click(ui, 2, await rowOf(ui, 'iter:all'))
        await click(ui, 5, await rowOf(ui, `todo:${STORY_C}`))
        expect(await rowOf(ui, `start:${STORY_C}`)).toBeGreaterThan(0)
        await clickFocus(ui)
        expect(await rowOf(ui, `start:${STORY_C}`)).toBe(-1)
        await clickFocus(ui)
        expect((await focusTitle(ui)).endsWith(FOCUS_ENTER_TEXT)).toBe(true)
        expect(await rowOf(ui, ACTION_SCOPE)).toBe(SCOPE_ROW)
        expect(lineText((await linesOf(ui))[ITERATION_ROW] as BoardLineType)).toBe('迭代：全部 ▸')
        expect(await textsOf(ui)).toContain('待办（4）')
        expect((await rowOf(ui, `start:${STORY_C}`)) - (await rowOf(ui, `todo:${STORY_C}`))).toBe(1)
        await ui.unmount()
    })

    test('没绑定的项目（config 为 null，全局模式）进沉浸：绑定列表不显示，进行中区在；退出后绑定列表回来', async ($, on) => {
        const { clock } = await boot($, on, { cwd: FG_ROOT, files: { [projectStateOf(FG_ROOT)]: stringifyState([demoStory()]) } })
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await textsOf(ui)).toContain(NO_BINDING_TEXT)
        expect((await focusTitle(ui)).endsWith(FOCUS_ENTER_TEXT)).toBe(true)
        await clickFocus(ui)
        const texts = await textsOf(ui)
        expect(texts).not.toContain(NO_BINDING_TEXT)
        expect(texts).not.toContain(BIND_HINT_TEXT)
        expect((await linesOf(ui)).some(i => i.action?.startsWith('bind:'))).toBe(false)
        expect(texts[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · fg-demo`)).toBe(true)
        expect(texts.slice(SEPARATOR_ROW, GAP_ROW + 1)).toEqual(['-'.repeat(58), ' '])
        expect((await focusTitle(ui)).endsWith(FOCUS_EXIT_TEXT)).toBe(true)
        expect(texts).toContain('需 9990001 演示-商家端-示例模块')
        await clickFocus(ui)
        expect(await textsOf(ui)).toContain(NO_BINDING_TEXT)
        expect((await linesOf(ui)).filter(i => i.action?.startsWith('bind:')).map(i => i.action)).toEqual([`bind:${WS}`, `bind:${WS2}`])
        await ui.unmount()
    })

    test('有启动命令时进沉浸：启动命令那块不显示，退出后还在', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: legacyState() }
        const { clock } = await boot($, on, { files })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_B)
        const launchText = '启动命令 1000102 · 新会话'
        expect(await textsOf(ui)).toContain(launchText)
        await clickFocus(ui)
        expect((await textsOf(ui)).some(i => i.startsWith('启动命令') || i.includes('[ 再复制一次 ]'))).toBe(false)
        expect(await rowOf(ui, ACTION_LAUNCH_CLOSE)).toBe(-1)
        await clickFocus(ui)
        expect(await textsOf(ui)).toContain(launchText)
        expect(await rowOf(ui, ACTION_LAUNCH_CLOSE)).toBeGreaterThan(0)
        await ui.unmount()
    })

    test('沉浸时的排版：项目内没配 TAPD 也只剩标题与进行中区；state.json 出错的提示与空态照常', () => {
        const progress = { taskList: [], error: 'state.json 读不懂（演示）' }
        const lineList = buildBoard(boardInput({ config: null, workplace: { ...WORKPLACE, name: 'other' }, progress, isFocus: true }), 60)
        const texts = lineList.map(lineText)
        expect(texts[1]?.startsWith(`${BOARD_TITLE_SPACED} · other`)).toBe(true)
        const progressTitle = `进行中（0）${' '.repeat(58 - displayWidth(`进行中（0）${FOCUS_EXIT_TEXT}`))}${FOCUS_EXIT_TEXT}`
        expect(texts.slice(2)).toEqual(['-'.repeat(58), ' ', progressTitle, 'state.json 读不懂（演示）', '暂无进行中任务'])
        expect(lineList[4]?.action).toBe(ACTION_FOCUS)
        const launch = { id: '1000102', kind: 'new' as const, command: 'echo demo', isCopied: true }
        const bound = buildBoard(boardInput({ launch, selectedId: STORY_A, isFocus: true }), 60).map(lineText)
        expect(bound.some(i => i.startsWith('启动命令') || i.startsWith('待办') || i.includes('开工'))).toBe(false)
        expect(bound).toHaveLength(6)
    })

    test('窄面板：按钮文字完整、左边被截；窄到按钮都放不下时按 fitLine 截断不报错', () => {
        const progress = progressOf(demoStory(SESSION_ID))
        const titleOf = (isFocus: boolean, columns: number) => {
            const line = buildBoard(boardInput({ progress, isFocus }), columns).find(i => i.action === ACTION_FOCUS) as BoardLineType
            return lineText(line)
        }
        expect(titleOf(false, 24).endsWith(FOCUS_ENTER_TEXT)).toBe(true)
        expect(displayWidth(titleOf(false, 24))).toBe(22)
        const narrow = titleOf(true, 20)
        expect(narrow.endsWith(FOCUS_EXIT_TEXT)).toBe(true)
        expect(narrow.startsWith('进..')).toBe(true)
        expect(displayWidth(narrow)).toBe(18)
        expect(titleOf(true, 14)).toBe(FOCUS_EXIT_TEXT)
        expect(titleOf(true, 10)).toBe('[ 退出..')
        expect(titleOf(true, 2)).toBe('')
        expect([0, 1, 3, 5, 8, 13].every(columns => displayWidth(titleOf(true, columns)) <= Math.max(0, columns - 2))).toBe(true)
    })

    test('沉浸记在 $.state：再跑一次 session.start、重新挂面板后仍是沉浸，再点退出', async ($, on) => {
        /* 测试引擎的 $ 没有 state 名词，挂在 state.set 下面记下写进 $.state 的值，再交给引擎照常写 */
        const focusWrites: unknown[] = []
        on('state.set', (_$, e, next) => {
            if (e.plugin === 'xiaoxiaoli' && e.key === 'isFocus') focusWrites.push(e.value)
            return next(e)
        })
        const { clock } = await boot($, on, { files: focusFiles() })
        await clock.advance(1)
        const ui = await mountPane($)
        expect(focusWrites).toEqual([])
        await clickFocus(ui)
        expect(focusWrites).toEqual([true])
        await ui.unmount()
        await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
        await clock.advance(1)
        const again = await mountPane($)
        expect((await focusTitle(again)).endsWith(FOCUS_EXIT_TEXT)).toBe(true)
        expect(await rowOf(again, ACTION_SCOPE)).toBe(-1)
        expect(await textsOf(again)).toContain('需 9990001 演示-商家端-示例模块')
        await clickFocus(again)
        expect(focusWrites).toEqual([true, false])
        expect(await rowOf(again, ACTION_SCOPE)).toBe(SCOPE_ROW)
        await again.unmount()
    })
})

describe('0.4.1 缺陷修复', () => {
    /** 连着改几次后取第一条 */
    const firstOf = (taskList: ProgressTaskType[]) => taskList[0] as ProgressTaskType
    const statusList = (task: ProgressTaskType) => task.steps.map(i => i.status)

    test('挂进行中的子项不往回改步骤：已完成的步骤保持已完成；在当前进行中步骤之前的不推、后面不动；后面有已完成的不推；正常前进照旧推成进行中', () => {
        const id = '9990004'
        const base = storyTask(id, '演示-挂子项', 'develop')
        const onDone = firstOf(progressSteps([base], [{ id, step: 'read', taskId: '9990041', taskTitle: '演示-补读需求', taskStatus: 'doing' }]))
        expect(statusList(onDone)).toEqual(statusList(base))
        expect(onDone.steps[3]?.tasks).toEqual([{ id: '9990041', title: '演示-补读需求', status: 'doing' }])
        const reopened = firstOf(progressSteps([base], [{ id, step: 'align', status: 'todo' }]))
        const beforeDoing = firstOf(progressSteps([reopened], [{ id, step: 'align', taskId: '对齐稿', taskStatus: 'doing' }]))
        expect(statusList(beforeDoing)).toEqual(['done', 'done', 'done', 'done', 'todo', 'doing', 'todo', 'todo', 'todo', 'todo', 'todo'])
        expect(beforeDoing.steps[4]?.tasks?.[0]?.status).toBe('doing')
        const released = setStep(base, { key: 'release', status: 'done', updatedAt: UPDATED })
        const unitReopened = firstOf(progressSteps([released], [{ id, step: 'unit', status: 'todo' }]))
        const laterDone = firstOf(progressSteps([unitReopened], [{ id, step: 'unit', taskId: '补单测', taskStatus: 'doing' }]))
        expect(statusList(laterDone)).toEqual(statusList(unitReopened))
        expect(laterDone.steps[10]?.status).toBe('done')
        const reading = storyTask(id, '演示-挂子项', 'read')
        const forward = firstOf(progressSteps([reading], [{ id, step: 'align', taskId: '对齐稿', taskStatus: 'doing' }]))
        expect(statusList(forward)).toEqual(['done', 'done', 'done', 'done', 'doing', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo'])
    })

    test('显式推进（step + status）行为不变：带着子项回到前面的步骤照旧返工，后面的回到未开始', () => {
        const id = '9990004'
        const base = storyTask(id, '演示-挂子项', 'develop')
        const explicit = firstOf(progressSteps([base], [{ id, step: 'read', status: 'doing', taskId: '9990041', taskTitle: '演示-补读需求', taskStatus: 'doing' }]))
        expect(statusList(explicit)).toEqual(['done', 'done', 'done', 'doing', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo'])
    })

    test('只有迭代拉取失败：待办照常显示（暂显示全部），迭代行如实写明，标题行不提示重试也不报拉取失败；迭代照样重试，用尽后仍不报待办失败', async ($, on) => {
        const iterationDown = (tool: string): McpToolResult | undefined =>
            tool === 'get_iterations' ? { content: [{ type: 'text', text: 'boom' }], isError: true } : undefined
        const { clock, seen } = await boot($, on, { tapdPatch: iterationDown })
        await clock.advance(1)
        const ui = await mountPane($)
        const header = async () => lineText((await linesOf(ui))[HEADER_ROW] as BoardLineType)
        const iterationRow = async () => lineText((await linesOf(ui))[ITERATION_ROW] as BoardLineType)
        expect(await header()).toMatch(/\[ 刷新 \] 刷新于 \d{2}:\d{2}$/)
        expect(await iterationRow()).toBe('迭代：本迭代（迭代未加载，暂显示全部） ▸')
        expect(await textsOf(ui)).toContain('待办（4）')
        expect(await rowOf(ui, `todo:${STORY_C}`)).toBeGreaterThan(0)
        for (const delay of [5000, 15000, 30000]) {
            await clock.advance(delay)
            expect(await header()).not.toContain('正在连接')
            expect(await header()).not.toContain('拉取失败')
        }
        expect(seen.calls.filter(i => i.tool === 'get_iterations').length).toBe(4)
        await clock.advance(60000)
        expect(seen.calls.filter(i => i.tool === 'get_iterations').length).toBe(4)
        expect(await header()).toMatch(/\[ 刷新 \] 刷新于 \d{2}:\d{2}$/)
        expect(await iterationRow()).toBe('迭代：本迭代（迭代未加载，暂显示全部） ▸')
        expect((await runCommand($, 'refresh')).text).toBe('小小黎：已刷新，待办 4 条')
        await ui.unmount()
    })

    test('/xiaoxiaoli refresh：拉取失败进入自动重试时说正在重试，不说已刷新；成功时条数与面板「待办（n）」同口径（按迭代筛过）', async ($, on) => {
        const { clock, tapd } = await boot($, on, { tapdDown: true })
        await clock.advance(1)
        const failed = (await runCommand($, 'refresh')).text
        expect(failed).toBe('小小黎：这次没拉到待办（多半是 TAPD 还没连上），正在自动重试（第 1 次），稍后看面板')
        expect(failed).not.toContain('已刷新')
        tapd.down = false
        expect((await runCommand($, 'refresh')).text).toBe('小小黎：已刷新，待办 3 条')
        const ui = await mountPane($)
        expect(await textsOf(ui)).toContain('待办（3）')
        /* 重试期间手动刷新成功：标题行的重试提示一并清掉 */
        expect((await textsOf(ui))[HEADER_ROW]).not.toContain('正在连接')
        await ui.unmount()
    })

    test('面板本会话开工时写状态文件失败：提示没有写入与原因，不发开工消息', async ($, on) => {
        const { clock, seen } = await boot($, on, { writeDenied: true })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_A)
        expect(seen.submitted).toEqual([])
        const toast = seen.toasts.at(-1) ?? ''
        expect(toast.startsWith(`小小黎：没开工，写 ${STATE_FILE} 失败（`)).toBe(true)
        expect(toast.endsWith('），没有写入')).toBe(true)
        expect(seen.toasts.some(i => i.includes('已发出'))).toBe(false)
        await ui.unmount()
    })

    test('面板给新会话命令时写状态文件失败：提示没有写入与原因，不给启动命令', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: legacyState() }
        const { clock, seen } = await boot($, on, { files, writeDenied: true })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_B)
        expect(seen.copied).toEqual([])
        expect(seen.logs.some(i => i.includes('启动命令'))).toBe(false)
        const toast = seen.toasts.at(-1) ?? ''
        expect(toast.startsWith(`小小黎：没开工，写 ${STATE_FILE} 失败（`)).toBe(true)
        expect(toast.endsWith('），没有写入')).toBe(true)
        expect((await textsOf(ui)).some(i => i.startsWith('启动命令'))).toBe(false)
        expect(files[STATE_FILE]).toBe(legacyState())
        await ui.unmount()
    })

    test('取不到全局根目录、项目里也没有 config.json：绑定工具与 unbind 说明取不到用户目录并提示 XIAOXIAOLI_HOME，不再说「本项目用项目内配置」', async ($, on) => {
        const { seen } = await boot($, on, { cwd: OTHER_CWD, files: {}, globalRoot: null })
        const denied = (await callBind($, { project: '演示项目' })).deny
        expect(denied).toBe('小小黎：取不到用户目录，无法使用全局绑定；可设环境变量 XIAOXIAOLI_HOME 指定全局目录，没有写入')
        expect(String(denied)).not.toContain('项目内配置')
        const unbound = (await runCommand($, 'unbind')).text
        expect(unbound).toBe('小小黎：取不到用户目录，无法使用全局绑定；可设环境变量 XIAOXIAOLI_HOME 指定全局目录，没有可解除的全局绑定')
        expect(seen.written).toEqual([])
        expect(seen.calls).toEqual([])
    })

    test('拼进启动命令的值先校验：会话 ID 只认 UUID 形态，短 ID 只认纯数字', () => {
        expect(isSessionId(SESSION_ID)).toBe(true)
        expect(isSessionId(SESSION_ID.toUpperCase())).toBe(true)
        expect(isSessionId('x; Remove-Item -Recurse D:/')).toBe(false)
        expect(isSessionId(`${SESSION_ID}0`)).toBe(false)
        expect(isSessionId('')).toBe(false)
        expect(isShortId('1000102')).toBe(true)
        expect(isShortId('1000109a;b')).toBe(false)
        expect(isShortId('')).toBe(false)
    })

    test('面板：要回到的会话 ID 不是 UUID 形态时不生成命令并说明', async ($, on) => {
        const bad = storyTask('1000102', '演示需求乙', 'develop', { sessionId: 'x; Remove-Item -Recurse D:/' })
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: stringifyState([bad]) }
        const { clock, seen } = await boot($, on, { files })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_B)
        expect(seen.copied).toEqual([])
        expect(seen.toasts.at(-1)).toBe(`小小黎：1000102 记的会话 ID 不是 UUID 形态，没有生成回到已有会话的命令，请检查 ${STATE_FILE}`)
        expect((await textsOf(ui)).some(i => i.startsWith('启动命令'))).toBe(false)
        await ui.unmount()
    })

    test('面板：短 ID 不是纯数字时不生成新会话命令、不写状态文件并说明', async ($, on) => {
        const weirdId = `${longId(WS, 1000109)}a;b`
        const weirdStory = (tool: string, args: Record<string, unknown>): McpToolResult | undefined =>
            tool === 'get_todo' && args.workspace_id === Number(WS) && args.entity_type === 'story'
                ? textResult(ok([{ Story: { id: weirdId, name: '演示需求怪', status: 'status_2', priority: 'Low' } }]))
                : undefined
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: legacyState() }
        const { clock, seen } = await boot($, on, { files, tapdPatch: weirdStory, store: { iteration: 'all' } })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, weirdId)
        expect(seen.copied).toEqual([])
        expect(seen.toasts.at(-1)).toBe('小小黎：没开工，短 ID「1000109a;b」不是纯数字，不能拼进分支名，没有生成启动命令')
        expect(seen.written).toEqual([])
        expect(files[STATE_FILE]).toBe(legacyState())
        await ui.unmount()
    })

    test('没记会话 ID 的旧条目归主工作区的会话：主工作区里展开、开工分流算本会话的、状态行显示；worktree 里折成一行、分流不算、状态行不显示', () => {
        const legacy = parseProgress(legacyState()).taskList
        const main = buildBoard(boardInput({ progress: progressOf(...legacy) }), 80).map(lineText)
        expect(main).toContain('需 1046775 1. 商家端-设计器模块')
        expect(main).toContain('>  7 单测中-上线后待修 4 条子代理进行中')
        const inWorktree = buildBoard(boardInput({ progress: progressOf(...legacy), workplace: { ...WORKPLACE, isMainCheckout: false } }), 80).map(lineText)
        expect(inWorktree).toContain('需 1046775 1. 商家端-设计器模块 · 单测 · 上线后待修 4 条子代理进行中')
        expect(inWorktree.some(i => i.startsWith('>  7 '))).toBe(false)
        const base = { id: '1000102', sessionId: SESSION_ID, isBusy: false }
        expect(routeStart({ ...base, taskList: legacy, isMainCheckout: true })).toBe('new')
        expect(routeStart({ ...base, taskList: legacy, isMainCheckout: false })).toBe('submit')
        expect(statusText(legacy, SESSION_ID, true)).toBe('小小黎 · 1046775 第 7 步 单测中-上线后待修 4 条子代理进行中')
        expect(statusText(legacy, SESSION_ID, false)).toBeUndefined()
    })

    test('状态行：主工作区的会话显示没记会话 ID 的旧条目', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: legacyState() }
        const { seen } = await boot($, on, { files })
        expect(seen.statuses.at(-1)).toBe('小小黎 · 1046775 第 7 步 单测中-上线后待修 4 条子代理进行中')
    })

    test('状态行：worktree 里的会话不显示没记会话 ID 的旧条目', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: legacyState() }
        const { seen } = await boot($, on, { cwd: 'D:/work/demo-9990001', repoRoot: CWD, files })
        expect(seen.statuses.some(i => i !== undefined)).toBe(false)
    })

    test('本会话开工的提示带「小小黎：」前缀：会话正忙时排队', async ($, on) => {
        const mine = storyTask('1000101', '演示需求甲', 'develop', { sessionId: SESSION_ID })
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: stringifyState([mine]) }
        const { clock, seen } = await boot($, on, { files })
        await clock.advance(1)
        const ui = await mountPane($)
        await $.turn.start({ text: '在忙', turnId: 't1' })
        await startFromPane(ui, STORY_A)
        expect(seen.toasts).toContain(`小小黎：会话正忙，已排队：开工 ${STORY_A}`)
        await ui.unmount()
    })

    test('终端不够宽：用户自己运行 /xiaoxiaoli show 时只说拉宽终端，不再建议运行 show；轮询自动打开时照旧提示', async ($, on) => {
        const { clock, seen, env } = await boot($, on, { paneUnplaced: true })
        await runCommand($, 'show')
        expect(seen.toasts.at(-1)).toBe('小小黎：终端不够宽，侧栏没能画出来，把终端拉宽后再试')
        expect(seen.toasts.at(-1)).not.toContain('/xiaoxiaoli show')
        await runCommand($, 'hide')
        env.value = 'show'
        await clock.advance(500)
        expect(seen.toasts.at(-1)).toBe('小小黎：终端不够宽，侧栏先挂起；/xiaoxiaoli show 可直接打开')
    })
})

describe('0.4.2：跨项目开工、重新开工、bash 启动命令、取不到用户目录的文案', () => {
    const ALL_META: TodoMetaType = { ...metaDefault(), scope: 'all', projectCount: 2 }
    const OTHER_NOTE = '属于「演示项目二」，将在当前仓库（demo）开工'
    /** 缺陷 6 步全是未开始、没有子项与当前子项 */
    const BUG_STEPS_TODO = [
        ['screenshot', '读截图'],
        ['env', '核环境版本'],
        ['reproduce', '复现'],
        ['diagnose', '定位判定'],
        ['fix', '修复或拒绝'],
        ['verify', '验证']
    ].map(([key, title]) => ({ key, title, status: 'todo' }))
    /** 演示项目二的缺陷待办（与当前绑定的演示项目不同） */
    const bugTodo = (patch: Partial<TodoType> = {}): TodoType => ({
        ...todo(BUG_A, 'urgent'),
        kind: 'bug',
        workspaceId: WS2,
        workspaceName: '演示项目二',
        ...patch
    })
    /** 11 步全部完成的需求条目 */
    const doneStory = (id: string, title: string, patch: Partial<ProgressTaskType> = {}): ProgressTaskType => ({
        ...setStep(storyTask(id, title, 'release'), { key: 'release', status: 'done', updatedAt: UPDATED }),
        ...patch
    })
    /** 6 步全部完成的缺陷条目 */
    const doneBug = (patch: Partial<ProgressTaskType> = {}): ProgressTaskType => ({
        ...setStep(newTask({ id: '1000301', kind: 'bug', title: '演示缺陷', updatedAt: UPDATED, detail: '本会话开工' }), {
            key: 'verify',
            status: 'done',
            updatedAt: UPDATED
        }),
        ...patch
    })
    /** 给条目某一步挂上子项 */
    const withStepTasks = (task: ProgressTaskType, key: StepKey, tasks: NonNullable<ProgressTaskType['steps'][number]['tasks']>): ProgressTaskType => ({
        ...task,
        steps: task.steps.map(i => (i.key === key ? { ...i, tasks } : i))
    })
    /** 缺陷判过、挂过子项、在等用户看自测的已完成缺陷 */
    const judgedBug = (patch: Partial<ProgressTaskType> = {}): ProgressTaskType => {
        const bug = doneBug({ waiting: 'review', branch: 'fix/1000301', ...patch })
        return {
            ...bug,
            steps: bug.steps.map(i =>
                i.key === 'diagnose' ? { ...i, detail: '判定：要修', confirm: true, tasks: [{ id: '定位', title: '定位', status: 'done' as const }] } : i
            )
        }
    }

    test('全部项目视图：别的 TAPD 项目的待办，确认行写明所属项目与开工的仓库，放不下时另起一行（不可点）；本项目的待办确认行不变', () => {
        const storyA = todo(STORY_A, 'High')
        const input = (selectedId: string, todoList: TodoType[] = [storyA, bugTodo()]) => boardInput({ todoList, todoMeta: ALL_META, selectedId })
        const narrow = buildBoard(input(BUG_A), 60)
        const row = narrow.findIndex(i => i.action === `start:${BUG_A}`)
        expect(lineText(narrow[row] as BoardLineType)).toBe(`  [ 开工 ${BUG_A} ]`)
        expect(lineText(narrow[row + 1] as BoardLineType)).toBe(`    ${OTHER_NOTE}`)
        expect(narrow[row + 1]?.action).toBeUndefined()
        expect(narrow.every(i => displayWidth(lineText(i)) <= 58)).toBe(true)
        const wide = buildBoard(input(BUG_A), 120)
        expect(lineText(wide.find(i => i.action === `start:${BUG_A}`) as BoardLineType)).toBe(`  [ 开工 ${BUG_A} ]  ${OTHER_NOTE}`)
        expect(wide.map(lineText).filter(i => i.includes(OTHER_NOTE))).toHaveLength(1)
        const own = buildBoard(input(STORY_A), 120)
        expect(lineText(own.find(i => i.action === `start:${STORY_A}`) as BoardLineType)).toBe(`  [ 开工 ${STORY_A} ]`)
        expect(own.map(lineText).some(i => i.includes('属于「'))).toBe(false)
        /* 拉取时没拿到项目名：写项目 ID */
        const { workspaceName: _name, ...unnamed } = bugTodo()
        expect(buildBoard(input(BUG_A, [unnamed]), 120).map(lineText).some(i => i.includes(`属于「${WS2}」`))).toBe(true)
    })

    test('条目与待办按短 ID 与 TAPD 项目 ID 对应：两边都有项目 ID 要求相同，条目没记只看短 ID；开工态、分流、查找与替换都按这一条', () => {
        const bug = bugTodo()
        const otherProject = { ...storyTask('1000301', '别的项目同号需求', 'develop', { sessionId: OTHER_SESSION }), workspaceId: WS }
        const legacy = storyTask('1000301', '旧条目', 'develop', { sessionId: OTHER_SESSION })
        expect(startStateOf(bug, [otherProject])).toBe('waiting')
        expect(startStateOf(bug, [legacy])).toBe('started')
        expect(startStateOf(bug, [{ ...otherProject, workspaceId: WS2 }])).toBe('started')
        const base = { id: '1000301', sessionId: SESSION_ID, isMainCheckout: true, isBusy: false }
        expect(routeStart({ ...base, workspaceId: WS2, taskList: [otherProject] })).toBe('submit')
        expect(routeStart({ ...base, workspaceId: WS, taskList: [otherProject] })).toBe('resume')
        expect(routeStart({ ...base, workspaceId: WS2, taskList: [legacy] })).toBe('resume')
        expect(routeStart({ ...base, taskList: [otherProject] })).toBe('resume')
        /* 挂在需求下的任务：所在需求记了别的项目 ID 时不算 */
        const taskTodo = { ...todo(TASK_A, 'Low'), kind: 'task' as const, storyId: STORY_A }
        const parent = withStepTasks(storyTask('1000101', '演示需求甲', 'develop'), 'develop', [{ id: '1000201', title: '演示任务', status: 'doing' }])
        expect(startStateOf(taskTodo, [parent])).toBe('started')
        expect(startStateOf(taskTodo, [{ ...parent, workspaceId: WS2 }])).toBe('waiting')
        const mine = newTask({ id: '1000301', kind: 'bug', title: '演示缺陷', updatedAt: UPDATED, workspaceId: WS2, detail: '本会话开工' })
        expect(findTask([legacy, mine], '1000301', WS2)).toBe(mine)
        expect(findTask([otherProject, mine], '1000301', WS)).toBe(otherProject)
        expect(findTask([otherProject], '1000301', WS2)).toBeUndefined()
        expect(upsertTask([otherProject, mine], { ...mine, title: '改过的' }).map(i => i.title)).toEqual(['别的项目同号需求', '改过的'])
        expect(upsertTask([otherProject], mine).map(i => i.workspaceId)).toEqual([WS, WS2])
    })

    test('状态文件：workspaceId 是可选字段，写回读回都在、版本仍是 2，旧条目没有照常读；进度工具更新时不丢，移除只移找到的那条', () => {
        const task = newTask({ id: '1000301', kind: 'bug', title: '演示缺陷', updatedAt: UPDATED, workspaceId: WS2, detail: '本会话开工' })
        const text = stringifyState([task, storyTask('1000301', '别的项目同号', 'develop')])
        expect(text).toContain('"version": 2')
        expect(text).toContain(`      "id": "1000301",\n      "workspaceId": "${WS2}",\n      "kind": "bug",`)
        const parsed = parseProgress(text)
        expect(parsed.error).toBe('')
        expect(parsed.taskList.map(i => i.workspaceId)).toEqual([WS2, undefined])
        expect(parseProgress(legacyState()).taskList[0]?.workspaceId).toBeUndefined()
        const numeric = JSON.stringify({ version: 2, tasks: [{ id: '1', title: '演示', updatedAt: UPDATED, workspaceId: Number(WS2), steps: [] }] })
        expect(parseProgress(numeric).taskList[0]?.workspaceId).toBe(WS2)
        const [updated, other] = progressSteps(parsed.taskList, [{ id: '1000301', step: 'env', status: 'doing', note: '等测试环境' }])
        expect({ workspaceId: updated?.workspaceId, env: updated?.steps[1]?.status, note: updated?.note }).toEqual({ workspaceId: WS2, env: 'doing', note: '等测试环境' })
        expect(other?.title).toBe('别的项目同号')
        expect(progressSteps(parsed.taskList, [{ id: '1000301', remove: true }]).map(i => i.title)).toEqual(['别的项目同号'])
    })

    test('面板「全部项目」开工别的 TAPD 项目的缺陷：确认行写明，确认后在当前仓库开工，条目记上它的项目 ID，进度工具推进后仍在', async ($, on) => {
        const { clock, seen, files } = await boot($, on, { store: { scope: 'all' } })
        await clock.advance(1)
        const ui = await mountPane($)
        await click(ui, 5, await rowOf(ui, `todo:${BUG_A}`))
        expect(await textsOf(ui)).toContain(`    ${OTHER_NOTE}`)
        await click(ui, 5, await rowOf(ui, `start:${BUG_A}`))
        expect(seen.submitted).toEqual([{ text: `开工 ${BUG_A}`, asUser: true }])
        const bug = parseProgress(files[STATE_FILE] ?? '').taskList.find(i => i.id === '1000301') as ProgressTaskType
        expect({ kind: bug.kind, workspaceId: bug.workspaceId, sessionId: bug.sessionId }).toEqual({ kind: 'bug', workspaceId: WS2, sessionId: SESSION_ID })
        await callProgress($, { id: '1000301', step: 'env', status: 'doing' })
        expect(parseProgress(files[STATE_FILE] ?? '').taskList[0]?.workspaceId).toBe(WS2)
        expect((await textsOf(ui)).find(i => i.startsWith('缺 1000301'))).toContain('开工中')
        await ui.unmount()
    })

    test('撞号：状态文件里别的 TAPD 项目的同号条目已完成，这条缺陷仍是待开工，开工另建一条、原条目不动', async ($, on) => {
        const other = doneStory('1000301', '别的项目同号需求', { workspaceId: WS, sessionId: OTHER_SESSION })
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: stringifyState([other]) }
        const { clock, seen } = await boot($, on, { files, store: { scope: 'all' } })
        await clock.advance(1)
        const ui = await mountPane($)
        expect((await textsOf(ui)).find(i => i.startsWith('缺 1000301'))).toContain('待开工')
        await startFromPane(ui, BUG_A)
        expect(seen.submitted).toEqual([{ text: `开工 ${BUG_A}`, asUser: true }])
        const list = parseProgress(files[STATE_FILE] ?? '').taskList
        expect(list.map(i => [i.kind, i.workspaceId])).toEqual([['story', WS], ['bug', WS2]])
        expect(list[0]).toEqual(other)
        await ui.unmount()
    })

    test('重新开工的规则：已完成的需求与没重新打开的缺陷不出确认行，换成一行不可点的说明；重新打开的缺陷可以重新开工；挂在需求下已完成的任务可以重新做', () => {
        const storyA = todo(STORY_A, 'High')
        const done = doneStory('1000101', '演示需求甲')
        const lines = buildBoard(boardInput({ todoList: [storyA], progress: progressOf(done), selectedId: STORY_A }), 60)
        const row = lines.findIndex(i => i.action === `todo:${STORY_A}`)
        expect(lineText(lines[row] as BoardLineType)).toContain('1000101 已完成 ')
        expect(lineText(lines[row + 1] as BoardLineType)).toBe(`  ${NO_RESTART_TEXT}`)
        expect(lines[row + 1]?.action).toBeUndefined()
        expect(lines.some(i => i.action?.startsWith('start:'))).toBe(false)
        const doneBugEntry = doneBug({ workspaceId: WS2 })
        const bugLines = (statusKey: string) =>
            buildBoard(boardInput({ todoList: [bugTodo({ statusKey })], todoMeta: ALL_META, progress: progressOf(doneBugEntry), selectedId: BUG_A }), 120).map(lineText)
        expect(bugLines('reopened').some(i => i.startsWith(`  [ 重新开工 ${BUG_A} ]`))).toBe(true)
        expect(bugLines('closed')).toContain(`  ${NO_RESTART_TEXT}`)
        expect(bugLines('resolved').some(i => i.includes('[ 重新开工'))).toBe(false)
        expect(isReopenedBug(bugTodo({ statusKey: 'reopened' }))).toBe(true)
        expect(isReopenedBug({ ...storyA, statusKey: 'reopened' })).toBe(false)
        /* 自定义工作流：原值不是 reopened，中文名带「重新打开」也认（真实项目里有 QA_audited →「C1-重新打开」） */
        expect(isReopenedBug({ ...bugTodo({ statusKey: 'QA_audited' }), status: 'C1-重新打开' })).toBe(true)
        expect(isReopenedBug({ ...bugTodo({ statusKey: 'resolved' }), status: 'D1-已解决' })).toBe(false)
        const taskTodo = { ...todo(TASK_A, 'Low'), kind: 'task' as const, storyId: STORY_A }
        const withDoneTask = withStepTasks(done, 'develop', [{ id: '1000201', title: '演示任务', status: 'done' }])
        const taskLines = buildBoard(boardInput({ todoList: [storyA, taskTodo], progress: progressOf(withDoneTask), selectedId: TASK_A }), 60).map(lineText)
        expect(taskLines).toContain(`  [ 重新做 ${TASK_A} ]`)
        expect(startButtonOf(storyA, 'waiting')).toBe('开工')
        expect(startButtonOf(storyA, 'started')).toBe('继续')
        expect(startButtonOf(storyA, 'done')).toBeUndefined()
        expect(startButtonOf(taskTodo, 'done')).toBe('重新做')
    })

    test('重置：resetTask 全部步骤回到未开始、清掉子项与等待，分支与会话不动；redoStepTask 只把子项改回进行中、模块归零，步骤状态不动', () => {
        const reset = resetTask(judgedBug({ sessionId: SESSION_ID }), '2026-11-12T00:00:00.000Z')
        expect(reset.steps).toEqual(BUG_STEPS_TODO)
        expect({ waiting: reset.waiting, branch: reset.branch, sessionId: reset.sessionId, updatedAt: reset.updatedAt }).toEqual({
            waiting: null,
            branch: 'fix/1000301',
            sessionId: SESSION_ID,
            updatedAt: '2026-11-12T00:00:00.000Z'
        })
        const story = withStepTasks(doneStory('1000101', '演示需求甲'), 'develop', [
            { id: '1000201', title: '演示任务', status: 'done', detail: '接口联调', modules: [{ name: '界面1 布局', done: 3, total: 3 }] },
            { id: '1000202', title: '演示任务二', status: 'done' }
        ])
        const redone = redoStepTask(story, 'develop', '1000201', '2026-11-12T00:00:00.000Z')
        expect(redone.steps.map(i => i.status)).toEqual(story.steps.map(i => i.status))
        expect(redone.steps[5]?.tasks).toEqual([
            { id: '1000201', title: '演示任务', status: 'doing', detail: '接口联调', modules: [{ name: '界面1 布局', done: 0, total: 3 }] },
            { id: '1000202', title: '演示任务二', status: 'done' }
        ])
    })

    test('面板：已完成的需求点了只出一行说明，点它不开工、不发消息、不写状态文件', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: stringifyState([doneStory('1000101', '演示需求甲', { sessionId: SESSION_ID })]) }
        const { clock, seen } = await boot($, on, { files })
        await clock.advance(1)
        const ui = await mountPane($)
        await click(ui, 5, await rowOf(ui, `todo:${STORY_A}`))
        const row = await rowOf(ui, `todo:${STORY_A}`)
        expect((await textsOf(ui))[row + 1]).toBe(`  ${NO_RESTART_TEXT}`)
        expect(await rowOf(ui, `start:${STORY_A}`)).toBe(-1)
        await click(ui, 5, row + 1)
        expect({ submitted: seen.submitted, copied: seen.copied, written: seen.written }).toEqual({ submitted: [], copied: [], written: [] })
        await ui.unmount()
    })

    test('面板：缺陷在 TAPD 上重新打开（状态原值 reopened）时可以重新开工：这条缺陷的步骤全部重置为未开始、清掉子项与等待，再照常开工', async ($, on) => {
        const reopened = (tool: string, args: Record<string, unknown>): McpToolResult | undefined => {
            if (tool === 'get_todo' && args.workspace_id === Number(WS2) && args.entity_type === 'bug') {
                return textResult(ok([{ Bug: { id: BUG_A, title: '演示缺陷', status: 'reopened', priority: 'urgent' } }]))
            }
            if (tool === 'get_bug') return wrappedResult({ data: [{ Bug: { id: BUG_A, status: 'reopened', priority_label: 'urgent', begin: '2026-10-21' } }] })

            return undefined
        }
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: stringifyState([judgedBug({ workspaceId: WS2, sessionId: SESSION_ID })]) }
        const { clock, seen } = await boot($, on, { files, store: { scope: 'all' }, tapdPatch: reopened })
        await clock.advance(1)
        const ui = await mountPane($)
        expect((await textsOf(ui)).find(i => i.startsWith('缺 1000301'))).toContain('已完成')
        await click(ui, 5, await rowOf(ui, `todo:${BUG_A}`))
        expect(await textsOf(ui)).toContain(`  [ 重新开工 ${BUG_A} ]`)
        await click(ui, 5, await rowOf(ui, `start:${BUG_A}`))
        expect(seen.submitted).toEqual([{ text: `开工 ${BUG_A}`, asUser: true }])
        const bug = parseProgress(files[STATE_FILE] ?? '').taskList[0] as ProgressTaskType
        expect(bug.steps).toEqual(BUG_STEPS_TODO)
        expect({ waiting: bug.waiting, workspaceId: bug.workspaceId, sessionId: bug.sessionId, branch: bug.branch }).toEqual({
            waiting: null,
            workspaceId: WS2,
            sessionId: SESSION_ID,
            branch: 'fix/1000301'
        })
        expect((await textsOf(ui)).find(i => i.startsWith('缺 1000301'))).toContain('开工中')
        await ui.unmount()
    })

    test('面板：挂在需求下已完成的任务可以重新做：子项改回进行中、模块归零，步骤与需求状态不往回改，不另建条目，照常发开工消息', async ($, on) => {
        const story = withStepTasks(doneStory('1000101', '演示需求甲', { sessionId: SESSION_ID }), 'develop', [
            { id: '1000201', title: '演示任务', status: 'done', modules: [{ name: '界面1 布局', done: 3, total: 3 }] }
        ])
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: stringifyState([story]) }
        const { clock, seen } = await boot($, on, { files })
        await clock.advance(1)
        const ui = await mountPane($)
        expect((await textsOf(ui)).find(i => i.includes(' 1000201 '))).toContain('已完成')
        await click(ui, 5, await rowOf(ui, `todo:${TASK_A}`))
        expect(await textsOf(ui)).toContain(`  [ 重新做 ${TASK_A} ]`)
        await click(ui, 5, await rowOf(ui, `start:${TASK_A}`))
        expect(seen.submitted).toEqual([{ text: `开工 ${TASK_A}`, asUser: true }])
        const list = parseProgress(files[STATE_FILE] ?? '').taskList
        expect(list.map(i => i.id)).toEqual(['1000101'])
        expect(list[0]?.steps.every(i => i.status === 'done')).toBe(true)
        expect(list[0]?.steps[5]?.tasks).toEqual([{ id: '1000201', title: '演示任务', status: 'doing', modules: [{ name: '界面1 布局', done: 0, total: 3 }] }])
        const texts = await textsOf(ui)
        expect(texts.find(i => i.includes(' 1000201 '))).toContain('开工中')
        expect(texts.find(i => i.startsWith('需 1000101'))).toContain('已完成')
        await ui.unmount()
    })

    test('启动命令按路径选写法：Windows 路径（反斜杠或盘符开头）用 PowerShell，其余用 bash/zsh；bash 单引号里的单引号转成 \'\\\'\'', () => {
        expect([shellOf('D:\\work\\demo'), shellOf('D:/work/demo'), shellOf('/home/dev/demo')]).toEqual(['powershell', 'powershell', 'bash'])
        const root = "/home/dev/it's demo"
        const worktree = worktreeOf(root, '1000102')
        expect(worktree).toBe("/home/dev/it's demo-1000102")
        expect(docsDirOf(root)).toBe("/home/dev/it's demo/docs/xiaoli")
        const prompt = startPrompt({ longId: STORY_B, worktree, branch: 'feat/1000102', root })
        const command = newSessionCommand({ root, worktree, branch: 'feat/1000102', base: 'origin/master', sessionId: SESSION_ID, id: '1000102', prompt })
        const escaped = "'/home/dev/it'\\''s demo-1000102'"
        expect(command).toBe(
            [
                `if [ ! -d ${escaped} ]; then git -C '/home/dev/it'\\''s demo' worktree add --no-track -b feat/1000102 ${escaped} origin/master; fi; `,
                `if [ -d ${escaped} ]; then cd ${escaped} && `,
                /* 0.7.0 起开工提示在 --add-dir 之前 */
                `claude --session-id ${SESSION_ID} -n '1000102' '${prompt.replace(/'/g, "'\\''")}' --add-dir '/home/dev/it'\\''s demo/docs/xiaoli'; fi`
            ].join('')
        )
        expect(newSessionCommand({ root, worktree, branch: 'feat/1000102', base: 'origin/master', sessionId: SESSION_ID, id: '1000102', prompt, addDir: '' })).not.toContain('--add-dir')
        expect(resumeCommand({ dir: "/home/dev/it's", sessionId: SESSION_ID })).toBe(`cd '/home/dev/it'\\''s' && claude --resume ${SESSION_ID}`)
        expect(resumeCommand({ dir: 'D:/work/demo-1000102', sessionId: SESSION_ID })).toBe(`Set-Location 'D:/work/demo-1000102'; claude --resume ${SESSION_ID}`)
    })

    test('macOS / Linux 路径：全局根目录、全局项目目录与状态文件都按正斜杠拼', () => {
        expect(globalRootOf({ home: '/home/dev' })).toBe('/home/dev/.claude/xiaoxiaoli')
        expect(globalRootOf({ configDir: '/home/dev/.config/claude/', home: '/home/dev' })).toBe('/home/dev/.config/claude/xiaoxiaoli')
        const place = globalPlaceOf({ globalRoot: '/home/dev/.claude/xiaoxiaoli', cwd: '/home/dev/demo-1000102', repoRoot: '/home/dev/demo', sessionId: SESSION_ID })
        expect(place.dataDir).toBe(`/home/dev/.claude/xiaoxiaoli/projects/${projectKeyOf('/home/dev/demo')}`)
        expect({ statePath: place.statePath, configPath: place.configPath, isMainCheckout: place.isMainCheckout }).toEqual({
            statePath: `${place.dataDir}/state.json`,
            configPath: `${place.dataDir}/config.json`,
            isMainCheckout: false
        })
    })

    test('面板在 macOS / Linux 项目里：新会话与回到已有会话都给 bash/zsh 命令，面板、提示与对话里那行都说到新终端（bash/zsh）粘贴', async ($, on) => {
        const root = '/home/dev/demo'
        const stateFile = `${root}/docs/xiaoli/local/workbench/state.json`
        const files = { [`${root}/docs/xiaoli/local/workbench/config.json`]: JSON.stringify(CONFIG), [stateFile]: legacyState() }
        const { clock, seen } = await boot($, on, { cwd: root, files, isPosix: true })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_B)
        const command = seen.copied[0] ?? ''
        const head = `if [ ! -d '/home/dev/demo-1000102' ]; then git -C '/home/dev/demo' worktree add --no-track -b feat/1000102 '/home/dev/demo-1000102' origin/master; fi; if [ -d '/home/dev/demo-1000102' ]; then cd '/home/dev/demo-1000102' && claude --session-id `
        expect(command.slice(0, head.length)).toBe(head)
        /* 0.7.0 起开工提示在 --add-dir 之前 */
        expect(command).toContain(`-n '1000102' '开工 ${STORY_B}（`)
        expect(command.endsWith(`' --add-dir '/home/dev/demo/docs/xiaoli'; fi`)).toBe(true)
        expect(seen.toasts).toContain('小小黎：1000102 的启动命令已复制，到新的终端（bash/zsh）粘贴运行')
        expect(seen.logs.some(i => i.startsWith('小小黎 1000102 启动命令（到新的终端（bash/zsh）粘贴运行）：if [ ! -d'))).toBe(true)
        expect(await textsOf(ui)).toContain('  已复制，到新的终端（bash/zsh）粘贴运行')
        const task = parseProgress(files[stateFile] ?? '').taskList.find(i => i.id === '1000102') as ProgressTaskType
        expect(task.worktree).toBe('/home/dev/demo-1000102')
        await click(ui, 2, await rowOf(ui, ACTION_LAUNCH_CLOSE))
        await startFromPane(ui, STORY_B)
        expect(seen.copied[1]).toBe(`cd '/home/dev/demo-1000102' && claude --resume ${task.sessionId}`)
        expect(await textsOf(ui)).toContain('  已复制，到新的终端（bash/zsh）粘贴运行')
        await ui.unmount()
    })

    test('取不到用户目录的说法只用在项目里没有 config.json 时；项目里有 config.json 但不合格，待办区与 refresh 照旧说没配 TAPD', async ($, on) => {
        const missing = buildBoard(boardInput({ config: null, workplace: { ...WORKPLACE, isGlobalRootMissing: true } }), 60).map(lineText)
        expect(missing.join('')).toContain(NO_GLOBAL_ROOT_TEXT)
        expect(missing.every(i => displayWidth(i) <= 58)).toBe(true)
        expect(missing).not.toContain(NO_CONFIG_TEXT)
        const { clock } = await boot($, on, { files: { [CONFIG_FILE]: JSON.stringify({ projectName: '缺项目 ID' }) }, globalRoot: null })
        await clock.advance(1)
        expect((await runCommand($, 'refresh')).text).toBe('小小黎：本项目没配 TAPD（缺 config.json），只显示进行中需求，见 README')
        const ui = await mountPane($)
        const texts = await textsOf(ui)
        expect(texts).toContain(NO_CONFIG_TEXT)
        expect(texts.join('')).not.toContain(NO_GLOBAL_ROOT_TEXT)
        await ui.unmount()
    })
})

describe('0.5.0：起名与首次引导', () => {
    /** 造的全局根目录下的档案 */
    const PROFILE_PATH = `${GLOBAL_ROOT}/profile.json`
    /** 起过名的档案 */
    const namedProfile = (name: string) => JSON.stringify({ version: 1, name })
    /**
     * 主会话调一次起名工具。.claude-plugin/types 的工具名清单是引擎保存 mod 时生成的，新工具要等下次保存才进清单，
     * 在那之前按宽松的入参调（同 register.tsx 里用正则匹配的原因）
     */
    const callSetup = ($: Engine, args: Record<string, unknown>) => $.tool.call({ tool: 'mcp__xiaoxiaoli__setup', ...args } as unknown as ToolCallArgs)
    /** 引导两行加一行空行：还没起名时标题行往下挪这么多 */
    const GUIDE_ROWS = 3
    /** 会话启动时那条「第一次用」的提示（默认名） */
    const HINT = '小小黎：第一次用，打开面板点「开始设置」给工作台起名，或输入 /xiaoxiaoli setup；不设也能照常用'
    /** 取不到全局根目录时起名入口的说法 */
    const NO_SAVE = `${NO_GLOBAL_ROOT_TEXT}，起的名字存不了，先用默认名「小小黎」`
    /** 演示需求在旧结构 state.json 里的状态行（去掉开头的名字） */
    const LEGACY_STATUS = ' · 1046775 第 7 步 单测中-上线后待修 4 条子代理进行中'
    /** 还没设置、但之前已自动发起过设置引导的档案（0.5.1 的标记） */
    const GUIDED_PROFILE = JSON.stringify({ version: 1, guided: true, guidedBy: OTHER_SESSION })

    test('名字规则：去掉首尾空白与「AI工作台」「AI 工作台」「工作台」后缀；1 到 12 个字符按码点数；控制字符与 < > & " \' 不许有，给中文原因', () => {
        expect(normalizeName('  小美  ')).toBe('小美')
        expect(normalizeName('小美AI工作台')).toBe('小美')
        expect(normalizeName('小美 AI 工作台 ')).toBe('小美')
        expect(normalizeName('小美ai工作台')).toBe('小美')
        expect(normalizeName('小美工作台')).toBe('小美')
        expect(normalizeName('小美AI')).toBe('小美AI')
        expect(checkName(' 小美AI工作台 ')).toEqual({ name: '小美' })
        expect(checkName('小 美')).toEqual({ name: '小 美' })
        expect(checkName('a')).toEqual({ name: 'a' })
        const twelve = '一二三四五六七八九十甲乙'
        expect(checkName(twelve)).toEqual({ name: twelve })
        expect(checkName(`${twelve}AI工作台`)).toEqual({ name: twelve })
        expect(checkName(`${twelve}丙`)).toEqual({ reason: '名字最多 12 个字符，现在是 13 个' })
        /* 按码点数：一个表情算 1 个字符 */
        expect(checkName('😀'.repeat(12))).toEqual({ name: '😀'.repeat(12) })
        expect(checkName('😀'.repeat(13))).toEqual({ reason: '名字最多 12 个字符，现在是 13 个' })
        const empty = { reason: '名字不能为空（去掉首尾空白与「AI工作台」后缀后什么也不剩）' }
        expect(['', '   ', 'AI工作台', ' 工作台 '].map(checkName)).toEqual([empty, empty, empty, empty])
        const control = { reason: '名字不能含换行、制表等控制字符' }
        const controlList = ['小\n美', '小\t美', '小\r美', `小${String.fromCharCode(0)}美`, `小${String.fromCharCode(0x7f)}美`, `小${String.fromCharCode(0x2028)}美`]
        expect(controlList.map(checkName)).toEqual(controlList.map(() => control))
        /* 首尾的换行属于首尾空白，去掉后合格 */
        expect(checkName('\n小美\n')).toEqual({ name: '小美' })
        const html = { reason: '名字不能含 < > & " \' 这五个字符（名字会进 TAPD 评论的署名）' }
        expect(['<', '>', '&', '"', "'"].map(ch => checkName(`小${ch}美`))).toEqual([html, html, html, html, html])
        expect(checkName(123)).toEqual({ reason: 'name 要填名字（文字）' })
        expect(checkName(undefined)).toEqual({ reason: 'name 要填名字（文字）' })
        expect(DEFAULT_NAME).toBe('小小黎')
        expect(fullNameOf('小美')).toBe('小美AI工作台')
        expect(BOARD_TITLE).toBe('小小黎AI工作台')
        expect(noticeText('小美', '已刷新')).toBe('小美：已刷新')
        expect(nameOf({ name: '', isSkipped: true, isNewer: false, isGuided: false, role: '' })).toBe('小小黎')
        expect(nameOf({ name: '小美', isSkipped: false, isNewer: false, isGuided: true, role: 'test' })).toBe('小美')
    })

    test('profile.json 容错读取：不存在、不是合法 JSON、版本或字段类型不对、名字不合格都当作还没设置；版本更新时标出来、名字照样不认', () => {
        const unset = { name: '', isSkipped: false, isNewer: false, isGuided: false, role: '' }
        const badList = [
            '',
            'not json',
            '[]',
            'null',
            '"小美"',
            '{"version":1,"name":123}',
            '{"version":"1","name":"小美"}',
            '{"name":"小美"}',
            '{"version":0,"name":"小美"}',
            '{"version":1,"name":"<b>坏</b>"}',
            '{"version":1,"name":""}',
            '{"version":1,"skipped":"yes"}'
        ]
        expect(badList.map(parseProfile)).toEqual(badList.map(() => unset))
        expect(parseProfile('{"version":1,"name":" 小美AI工作台 "}')).toEqual({ ...unset, name: '小美' })
        expect(parseProfile('{"version":1,"skipped":true}')).toEqual({ ...unset, isSkipped: true })
        expect(parseProfile('{"version":1,"name":"小美","skipped":true}')).toEqual({ ...unset, name: '小美' })
        expect(parseProfile('{"version":2,"name":"小美"}')).toEqual({ ...unset, isNewer: true })
    })

    test('profile.json 写回：起名写 name 去掉 skipped，先不设写 skipped 去掉 name，别的字段原样保留；原文件读不懂时重写', () => {
        const old = JSON.stringify({ version: 1, skipped: true, theme: 'dark' })
        expect(JSON.parse(profileText(old, { name: '小美' }))).toEqual({ version: 1, name: '小美', theme: 'dark' })
        expect(JSON.parse(profileText(JSON.stringify({ version: 1, name: '小美', theme: 'dark' }), { isSkipped: true }))).toEqual({ version: 1, skipped: true, theme: 'dark' })
        expect(profileText('', { name: '小美' })).toBe('{\n  "version": 1,\n  "name": "小美"\n}\n')
        expect(JSON.parse(profileText('坏的', { isSkipped: true }))).toEqual({ version: 1, skipped: true })
        const pending: ProfileStateType = { name: '', isSkipped: false, isNewer: false, isGuided: false, role: '', path: PROFILE_PATH }
        expect(isSetupPending(pending)).toBe(true)
        /* 自动发起过的标记不改变「还没设置」 */
        expect(isSetupPending({ ...pending, isGuided: true })).toBe(true)
        expect(isSetupPending({ ...pending, path: '' })).toBe(false)
        expect(isSetupPending({ ...pending, isSkipped: true })).toBe(false)
        expect(isSetupPending({ ...pending, name: '小美' })).toBe(false)
        expect(isSetupPending({ ...pending, isNewer: true })).toBe(false)
    })

    test('面板排版：还没起名时第一行是引导行，两个按钮各占一行、整行可点，空一行再是标题；没绑定时也一样；沉浸时不显示；起了名标题按名字算', () => {
        const lineList = buildBoard(boardInput({ isSetupPending: true }), 60)
        const start = lineText(lineList[1] as BoardLineType)
        const skip = lineText(lineList[2] as BoardLineType)
        expect(lineList[1]?.action).toBe(ACTION_SETUP_START)
        expect(start.startsWith(SETUP_GUIDE_TEXT)).toBe(true)
        expect(start.endsWith(SETUP_START_TEXT)).toBe(true)
        expect(lineList[2]?.action).toBe(ACTION_SETUP_SKIP)
        expect(skip.startsWith(SETUP_SKIP_HINT_TEXT)).toBe(true)
        expect(skip.endsWith(SETUP_SKIP_TEXT)).toBe(true)
        expect([start, skip].map(displayWidth)).toEqual([58, 58])
        expect(lineText(lineList[3] as BoardLineType).trim()).toBe('')
        expect(lineList[3]?.action).toBeUndefined()
        expect(lineText(lineList[HEADER_ROW + GUIDE_ROWS] as BoardLineType).startsWith(`${BOARD_TITLE_SPACED} · 演示项目`)).toBe(true)
        expect(lineList[HEADER_ROW + GUIDE_ROWS]?.action).toBe(ACTION_REFRESH)
        expect(lineList.every(i => displayWidth(i.segList.map(seg => seg.text).join('')) <= 59)).toBe(true)
        const unbound = buildBoard(boardInput({ config: null, workplace: { ...WORKPLACE, mode: 'global' }, isSetupPending: true }), 60)
        expect(unbound.slice(1, 3).map(i => i.action)).toEqual([ACTION_SETUP_START, ACTION_SETUP_SKIP])
        const focus = buildBoard(boardInput({ isSetupPending: true, isFocus: true }), 60)
        expect(focus.some(i => i.action === ACTION_SETUP_START || i.action === ACTION_SETUP_SKIP)).toBe(false)
        expect(focus[HEADER_ROW]?.action).toBe(ACTION_REFRESH)
        /* 窄面板：按钮保住，说明被截 */
        const narrow = buildBoard(boardInput({ isSetupPending: true }), 24)
        expect(lineText(narrow[1] as BoardLineType).endsWith(SETUP_START_TEXT)).toBe(true)
        expect(lineText(narrow[2] as BoardLineType).endsWith(SETUP_SKIP_TEXT)).toBe(true)
        expect(narrow.every(i => displayWidth(i.segList.map(seg => seg.text).join('')) <= 23)).toBe(true)
        expect(spacedTitleOf('小美')).toBe('小 美 A I 工 作 台')
        const named = buildBoard(boardInput({ name: '小美' }), 80)
        expect(lineText(named[HEADER_ROW] as BoardLineType).startsWith('小 美 A I 工 作 台 · 演示项目')).toBe(true)
        expect(named[HEADER_ROW]?.segList[1]).toEqual({ text: '小 美 A I 工 作 台', color: 'suggestion', bold: true })
    })

    test('还没设置、但已自动发起过（0.5.1 的标记）：会话启动直接弹一次提示，热重载重跑 session.start 不再弹；起名工具放进工具列表；面板第一行是引导', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: GUIDED_PROFILE })
        expect(seen.toasts.filter(i => i === HINT)).toHaveLength(1)
        /* 0.7.0 起项目工具 project 也放在 ToolSearch 后面 */
        expect(seen.deferredTools).toEqual(['bind', 'project'])
        await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
        expect(seen.toasts.filter(i => i === HINT)).toHaveLength(1)
        await clock.advance(1)
        const ui = await mountPane($)
        const lineList = await linesOf(ui)
        expect(lineList.slice(1, 3).map(i => i.action)).toEqual([ACTION_SETUP_START, ACTION_SETUP_SKIP])
        expect(lineText(lineList[HEADER_ROW + GUIDE_ROWS] as BoardLineType).startsWith(`${BOARD_TITLE_SPACED} · 演示项目`)).toBe(true)
        await ui.unmount()
    })

    test('已经设置过（含先不设）：不弹提示、没有引导行，起名工具放在 ToolSearch 后面', async ($, on) => {
        const { clock, seen } = await boot($, on)
        expect(seen.toasts.some(i => i.includes('第一次用'))).toBe(false)
        /* 0.7.0 起项目工具 project 也放在 ToolSearch 后面；0.8.0 起演练处理过（默认档案记着 tour: done）时演练工具 guide 也在后面 */
        expect(seen.deferredTools).toEqual(['bind', 'setup', 'project', 'guide'])
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await rowOf(ui, ACTION_SETUP_START)).toBe(-1)
        expect((await linesOf(ui))[HEADER_ROW]?.action).toBe(ACTION_REFRESH)
        await ui.unmount()
    })

    test('点「先不设」：写 { version: 1, skipped: true }，引导行消失，提示以后可用 /xiaoxiaoli setup；之后过时或伪造的按钮消息不写也不发', async ($, on) => {
        const { clock, seen, files } = await boot($, on, { profile: null })
        await clock.advance(1)
        const ui = await mountPane($)
        await click(ui, 5, await rowOf(ui, ACTION_SETUP_SKIP))
        expect(seen.written).toEqual([PROFILE_PATH])
        expect(JSON.parse(files[PROFILE_PATH] ?? '')).toEqual({ version: 1, skipped: true })
        expect(seen.toasts.at(-1)).toBe('小小黎：好的，先不设，名字用默认的；以后想起名用 /xiaoxiaoli setup，或 /xiaoxiaoli name <名字>')
        expect(await rowOf(ui, ACTION_SETUP_START)).toBe(-1)
        /* 0.8.0 起先不设之后、演练还没处理过，引导位置换成演练引导两行，标题行跟着下移 */
        expect((await linesOf(ui))[HEADER_ROW]?.action).toBe(ACTION_TOUR_START)
        expect((await linesOf(ui))[HEADER_ROW + GUIDE_ROWS]?.action).toBe(ACTION_REFRESH)
        await ui.post({ type: 'row', action: ACTION_SETUP_SKIP }, { in: 'board' })
        await ui.post({ type: 'row', action: ACTION_SETUP_START }, { in: 'board' })
        expect(seen.written).toEqual([PROFILE_PATH])
        expect(seen.submitted).toEqual([])
        await ui.unmount()
    })

    test('点「开始设置」：以用户身份发出设置引导（AskUserQuestion 问名字、mcp__xiaoxiaoli__setup 保存）；项目内模式不问 TAPD 绑定；名字没存前引导还在；会话正忙时排队', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: null })
        await clock.advance(1)
        const ui = await mountPane($)
        await click(ui, 5, await rowOf(ui, ACTION_SETUP_START))
        const text = seen.submitted[0]?.text ?? ''
        /* 0.8.0 起演练还没处理过时，保存之后多一条问要不要走演练 */
        expect(seen.submitted).toEqual([{ text: setupPrompt({ name: '', isUnbound: false, projectName: 'demo', isTourOffered: true }), asUser: true }])
        /* 0.5.1 起末尾多一条「不想现在设就不追问」，0.8.0 起再多一条演练 */
        expect(text.split('\n')).toHaveLength(6)
        expect(text.startsWith('设置工作台（来自工作台面板的「开始设置」或 /xiaoxiaoli setup），按下面做：')).toBe(true)
        expect(text).toContain('用 AskUserQuestion 工具问我「工作台叫什么名字？」，说明最终名称是「名字+AI工作台」')
        expect(text).toContain('选项里给「保持默认：小小黎」，我也可以选「其他」自己填')
        expect(text).toContain('3. 拿到名字和工种后调 mcp__xiaoxiaoli__setup 保存')
        expect(text).toContain('用一两句话告诉我结果，不要做别的事')
        /* 0.8.0 起第 4 条是演练，「不想现在设」挪到第 5 条 */
        expect(text).toContain('5. 我不想现在设（关掉提问、按了取消或说以后再说）时不要追问，也不要调 mcp__xiaoxiaoli__setup')
        expect(text).toContain('只告诉我以后想起名可以点工作台面板上的「开始设置」或输入 /xiaoxiaoli setup')
        expect(text).not.toContain('mcp__xiaoxiaoli__bind')
        expect(seen.toasts.at(-1)).toBe('小小黎：已发出：设置工作台')
        expect(await rowOf(ui, ACTION_SETUP_START)).toBe(1)
        expect(seen.written).toEqual([])
        await $.turn.start({ text: '在忙', turnId: 't1' })
        await click(ui, 5, await rowOf(ui, ACTION_SETUP_START))
        expect(seen.toasts.at(-1)).toBe('小小黎：会话正忙，已排队：设置工作台')
        expect(seen.submitted).toHaveLength(2)
        await ui.unmount()
    })

    test('/xiaoxiaoli setup 与「开始设置」效果相同（命令钩子里引擎不许直接发，排到下一拍发）；全局模式没绑定 TAPD 时顺带问对应哪个 TAPD 项目（可先不绑，选了调 mcp__xiaoxiaoli__bind）', async ($, on) => {
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files: {}, profile: null })
        /* 没绑定：绑定工具与起名工具都在工具列表里，进度工具在 ToolSearch 后面 */
        /* 0.7.0 起项目工具 project 也放在 ToolSearch 后面 */
        expect(seen.deferredTools).toEqual(['progress', 'project'])
        expect((await runCommand($, 'setup')).text).toBe('小小黎：已发出：设置工作台')
        expect(seen.submitted).toEqual([])
        await clock.advance(1)
        const text = seen.submitted[0]?.text ?? ''
        /* 0.8.0 起演练还没处理过时，保存之后多一条问要不要走演练 */
        expect(seen.submitted).toEqual([{ text: setupPrompt({ name: '', isUnbound: true, projectName: 'fg-demo', isTourOffered: true }), asUser: true }])
        expect(text.split('\n')).toHaveLength(7)
        expect(text).toContain('3. 再用 AskUserQuestion 问我这个项目（fg-demo）对应哪个 TAPD 项目，选项里给「先不绑」')
        expect(text).toContain('我选了某个项目就调 mcp__xiaoxiaoli__bind 绑定，选「先不绑」就跳过')
        expect(text).toContain('4. 拿到名字和工种后调 mcp__xiaoxiaoli__setup 保存')
        /* 0.8.0 起第 5 条是演练，「不想现在设」挪到第 6 条 */
        expect(text).toContain('6. 我不想现在设')
        expect(seen.written).toEqual([])
    })

    test('已起名再运行 /xiaoxiaoli setup：可以重新设置，消息里写当前名字，给「保持当前」与「恢复默认」；setup 带参数时提示用 name', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: namedProfile('小美') })
        expect((await runCommand($, 'setup')).text).toBe('小美：已发出：设置工作台')
        await clock.advance(1)
        const text = seen.submitted[0]?.text ?? ''
        expect(text).toContain('现在叫「小美AI工作台」')
        expect(text).toContain('选项里给「保持当前：小美」和「恢复默认：小小黎」')
        expect(text).not.toContain('mcp__xiaoxiaoli__bind')
        expect((await runCommand($, 'setup 小丽')).text).toBe('小美：setup 不带参数；直接改名用 /xiaoxiaoli name <名字>')
        expect(seen.submitted).toHaveLength(1)
    })

    test('mcp__xiaoxiaoli__setup 成功：名字规范后写进 profile.json（别的字段保留、去掉 skipped），面板标题与引导行、提示前缀、状态行、开着的面板标题都马上换', async ($, on) => {
        const files = {
            [CONFIG_FILE]: JSON.stringify(CONFIG),
            [STATE_FILE]: legacyState(),
            [PROFILE_PATH]: JSON.stringify({ version: 1, skipped: false, theme: 'dark' })
        }
        const { clock, seen } = await boot($, on, { files })
        await runCommand($, 'show')
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await rowOf(ui, ACTION_SETUP_START)).toBe(1)
        expect(seen.titles).toEqual([BOARD_TITLE])
        expect(seen.statuses.at(-1)).toBe(`小小黎${LEGACY_STATUS}`)
        const result = await callSetup($, { name: ' 小美AI工作台 ' })
        expect(String(result.result)).toBe(`工作台现在叫 小美AI工作台（已写入 ${PROFILE_PATH}；面板标题、提示前缀与 TAPD 评论署名已换成新名字）`)
        expect(JSON.parse(files[PROFILE_PATH] ?? '')).toEqual({ version: 1, name: '小美', theme: 'dark' })
        expect(seen.written).toEqual([PROFILE_PATH])
        /* 面板开着：同一个 id 重开一次换标题 */
        expect(seen.titles).toEqual([BOARD_TITLE, '小美AI工作台'])
        expect(seen.statuses.at(-1)).toBe(`小美${LEGACY_STATUS}`)
        expect(await rowOf(ui, ACTION_SETUP_START)).toBe(-1)
        /* 0.8.0 起起了名、演练还没处理过，引导位置换成演练引导两行，标题行跟着下移 */
        expect(await rowOf(ui, ACTION_TOUR_START)).toBe(HEADER_ROW)
        expect((await textsOf(ui))[HEADER_ROW + GUIDE_ROWS]?.startsWith('小 美 A I 工 作 台 · 演示项目')).toBe(true)
        expect((await runCommand($, 'refresh')).text).toBe('小美：已刷新，待办 3 条')
        expect((await callProgress($, { id: '1046775', status: 'done' })).deny).toBe('小美：参数不对，给了 status 就要给 step，没有写入')
        await ui.unmount()
    })

    test('mcp__xiaoxiaoli__setup 名字不合格：如实拒绝，不写入，名字与引导都不变', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: null })
        expect((await callSetup($, { name: '小<美' })).deny).toBe('小小黎：参数不对，名字不能含 < > & " \' 这五个字符（名字会进 TAPD 评论的署名），没有写入')
        expect((await callSetup($, {})).deny).toBe('小小黎：参数不对，name 与 role 至少给一个，没有写入')
        expect((await callSetup($, { name: '一二三四五六七八九十甲乙丙' })).deny).toBe('小小黎：参数不对，名字最多 12 个字符，现在是 13 个，没有写入')
        expect((await callSetup($, { name: ' AI 工作台 ' })).deny).toBe('小小黎：参数不对，名字不能为空（去掉首尾空白与「AI工作台」后缀后什么也不剩），没有写入')
        expect(seen.written).toEqual([])
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await rowOf(ui, ACTION_SETUP_START)).toBe(1)
        await ui.unmount()
    })

    test('mcp__xiaoxiaoli__setup 写文件失败：如实拒绝并带原因，名字不变；「先不设」写失败也提示原因，引导行留着', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: null, writeDenied: true })
        const denied = String((await callSetup($, { name: '小美' })).deny)
        expect(denied.startsWith(`小小黎：写 ${PROFILE_PATH} 失败（`)).toBe(true)
        expect(denied.endsWith('），没有写入')).toBe(true)
        await clock.advance(1)
        const ui = await mountPane($)
        expect((await textsOf(ui))[HEADER_ROW + GUIDE_ROWS]?.startsWith(`${BOARD_TITLE_SPACED} · 演示项目`)).toBe(true)
        await click(ui, 5, await rowOf(ui, ACTION_SETUP_SKIP))
        expect((seen.toasts.at(-1) ?? '').startsWith(`小小黎：没记下「先不设」，写 ${PROFILE_PATH} 失败（`)).toBe(true)
        expect(await rowOf(ui, ACTION_SETUP_SKIP)).toBe(2)
        await ui.unmount()
    })

    test('取不到全局根目录：名字用默认、不显示引导也不弹提示；setup、name 与起名工具都如实说存不了，不发不写', async ($, on) => {
        const { clock, seen } = await boot($, on, { globalRoot: null, profile: null })
        expect(seen.toasts.some(i => i.includes('第一次用'))).toBe(false)
        expect(seen.deferredTools).toContain('setup')
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await rowOf(ui, ACTION_SETUP_START)).toBe(-1)
        expect((await textsOf(ui))[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · 演示项目`)).toBe(true)
        expect((await runCommand($, 'setup')).text).toBe(`小小黎：${NO_SAVE}，没有发起设置`)
        expect((await runCommand($, 'name 小美')).text).toBe(`小小黎：没改名，${NO_SAVE}，没有写入`)
        expect((await callSetup($, { name: '小美' })).deny).toBe(`小小黎：${NO_SAVE}，没有写入`)
        expect(seen.submitted).toEqual([])
        expect(seen.written).toEqual([])
        await ui.unmount()
    })

    test('profile.json 版本比本 mod 新：名字用默认、不显示引导不弹提示，改名、先不设与设置引导都不覆盖写', async ($, on) => {
        const newer = JSON.stringify({ version: 2, name: '小美', extra: 1 })
        const { clock, seen, files } = await boot($, on, { profile: newer })
        expect(seen.toasts.some(i => i.includes('第一次用'))).toBe(false)
        expect((await callSetup($, { name: '小丽' })).deny).toBe(`小小黎：${PROFILE_NEWER_TEXT}，没有写入`)
        expect((await runCommand($, 'name 小丽')).text).toBe(`小小黎：没改名，${PROFILE_NEWER_TEXT}，没有写入`)
        expect((await runCommand($, 'setup')).text).toBe(`小小黎：${PROFILE_NEWER_TEXT}，没有发起设置`)
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await rowOf(ui, ACTION_SETUP_START)).toBe(-1)
        await ui.post({ type: 'row', action: ACTION_SETUP_SKIP }, { in: 'board' })
        expect(files[PROFILE_PATH]).toBe(newer)
        expect(seen.written).toEqual([])
        expect(seen.submitted).toEqual([])
        await ui.unmount()
    })

    test('/xiaoxiaoli name：不带参数回当前名字与用法；带参数不经 AI 直接校验并保存（名字里可以有空格，后缀自动去掉），不合格不写', async ($, on) => {
        const { seen, files } = await boot($, on, { profile: null })
        expect((await runCommand($, 'name')).text).toBe('小小黎：工作台现在叫 小小黎AI工作台（没起名，用的默认名）；改名用 /xiaoxiaoli name <名字>，或 /xiaoxiaoli setup 让 AI 来问')
        expect((await runCommand($, 'name 一二三四五六七八九十甲乙丙')).text).toBe('小小黎：没改名，名字最多 12 个字符，现在是 13 个')
        expect(seen.written).toEqual([])
        expect((await runCommand($, 'name  小 美工作台 ')).text).toBe(`小 美：已改名，工作台现在叫 小 美AI工作台（写入 ${PROFILE_PATH}）`)
        expect(JSON.parse(files[PROFILE_PATH] ?? '')).toEqual({ version: 1, name: '小 美' })
        expect((await runCommand($, 'name')).text).toBe('小 美：工作台现在叫 小 美AI工作台；改名用 /xiaoxiaoli name <名字>，或 /xiaoxiaoli setup 让 AI 来问')
        expect((await runCommand($, 'nonsense')).text?.startsWith('小 美：用法 /xiaoxiaoli show 打开侧栏')).toBe(true)
        expect((await runCommand($, 'nonsense')).text).toContain(' · setup 让 AI 引导给工作台起名（没绑定 TAPD 的项目顺带问绑定） · name <名字> 直接改名')
        expect(seen.submitted).toEqual([])
    })

    test('项目内模式（有 config.json）也读全局档案：标题、前缀、状态行都用起的名字，项目配置的查找照旧', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify(CONFIG), [STATE_FILE]: legacyState() }
        const { clock, seen } = await boot($, on, { files, profile: namedProfile('小美') })
        await clock.advance(1)
        const ui = await mountPane($)
        /* 0.8.0 起起了名、演练还没处理过的档案多出演练引导两行，标题行跟着下移 */
        expect((await textsOf(ui))[HEADER_ROW + GUIDE_ROWS]?.startsWith('小 美 A I 工 作 台 · 演示项目 ')).toBe(true)
        expect(await rowOf(ui, `todo:${STORY_A}`)).toBeGreaterThan(0)
        expect(seen.statuses.at(-1)).toBe(`小美${LEGACY_STATUS}`)
        expect((await runCommand($, 'unbind')).text).toBe(`小美：本项目用项目内配置 ${CONFIG_FILE}，unbind 只清全局绑定，项目内配置没动`)
        expect(seen.toasts.some(i => i.includes('第一次用'))).toBe(false)
        await ui.unmount()
    })

    test('开工消息的署名用起的名字：全局模式本会话发出与新会话命令都带「TAPD 评论署名 ——小美AI工作台」，提示与对话里那行也换名；项目内模式仍只发「开工 <ID>」', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) }, profile: namedProfile('小美') })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_A)
        expect(signText('小美AI工作台')).toBe('TAPD 评论署名 ——小美AI工作台')
        /* 0.7.0 起资料目录一句同时给出通用资料目录 */
        expect(seen.submitted).toEqual([
            { text: `开工 ${STORY_A}（${GLOBAL_GUIDE}；${workflowGuide('story')}；${resourceDirsText(global.dir, SHARED)}；TAPD 评论署名 ——小美AI工作台）`, asUser: true }
        ])
        expect(seen.toasts).toContain(`小美：已发出：开工 ${STORY_A}`)
        await startFromPane(ui, STORY_B)
        expect(seen.copied[0]).toContain('；TAPD 评论署名 ——小美AI工作台）\'')
        expect(seen.toasts).toContain('小美：1000102 的启动命令已复制，到新的 PowerShell 窗口粘贴运行')
        expect(seen.logs.some(i => i.startsWith('小美 1000102 启动命令（到新的 PowerShell 窗口粘贴运行）：if (-not'))).toBe(true)
        expect(submitText({ longId: STORY_A, dataDir: '', fullName: '小美AI工作台' })).toBe(`开工 ${STORY_A}`)
        await ui.unmount()
    })

    test('PowerShell 启动命令：弯单引号 ‘ ’ ‚ ‛ 与直单引号一样写两遍，提示里的自由文字收不掉字符串；bash 写法不受影响', () => {
        const prompt = "开工 1（署名 ——a’b‘c‚d‛e'f）"
        const plan = { worktree: 'D:\\work\\demo-1', branch: 'feat/1', base: 'origin/master', sessionId: SESSION_ID, id: '1', prompt, addDir: '' }
        const command = newSessionCommand({ ...plan, root: 'D:\\work\\demo' })
        expect(command).toContain("'开工 1（署名 ——a’’b‘‘c‚‚d‛‛e''f）'")
        const bash = newSessionCommand({ ...plan, root: '/home/dev/demo', worktree: '/home/dev/demo-1' })
        expect(bash).toContain("'开工 1（署名 ——a’b‘c‚d‛e'\\''f）'")
    })
})

describe('0.5.1：首次使用自动发起设置引导', () => {
    const PROFILE_PATH = `${GLOBAL_ROOT}/profile.json`
    /** 会话启动后等多久自动发起，与 register.tsx 的 AUTO_GUIDE_DELAY_MS 一致 */
    const DELAY = 3000
    const HINT = '小小黎：第一次用，打开面板点「开始设置」给工作台起名，或输入 /xiaoxiaoli setup；不设也能照常用'
    const AUTO = '小小黎：第一次用，正在帮你设置工作台名字；不想设直接选「保持默认」，以后可点面板上的「开始设置」或输入 /xiaoxiaoli setup'
    /** 本会话自动发起时记进档案的标记 */
    const MARK = { version: 1, guided: true, guidedBy: SESSION_ID }
    /** 「第一次用」类提示出现了几次 */
    const firstUseToasts = (toasts: readonly string[]) => toasts.filter(i => i.includes('第一次用'))

    test('设置引导那段话：自动发起时来源写「首次使用，自动发起」，其余同「开始设置」；末尾都有「不想现在设就不追问」', () => {
        const auto = setupPrompt({ name: '', isUnbound: false, projectName: 'demo', isAuto: true })
        const manual = setupPrompt({ name: '', isUnbound: false, projectName: 'demo' })
        expect(auto.split('\n')[0]).toBe('首次使用，自动发起设置工作台（只自动这一次），按下面做：')
        expect(manual.split('\n')[0]).toBe('设置工作台（来自工作台面板的「开始设置」或 /xiaoxiaoli setup），按下面做：')
        expect(auto.split('\n').slice(1)).toEqual(manual.split('\n').slice(1))
        expect(auto.split('\n').at(-1)).toBe(
            '4. 我不想现在设（关掉提问、按了取消或说以后再说）时不要追问，也不要调 mcp__xiaoxiaoli__setup，只告诉我以后想起名可以点工作台面板上的「开始设置」或输入 /xiaoxiaoli setup'
        )
    })

    test('自动发起的标记：写 guided 与 guidedBy，名字、先不设与别的字段都不动，不改变「还没设置」；起名时标记保留', () => {
        const marked = profileText(JSON.stringify({ version: 1, theme: 'dark' }), { guidedBy: SESSION_ID })
        expect(JSON.parse(marked)).toEqual({ version: 1, theme: 'dark', guided: true, guidedBy: SESSION_ID })
        expect(parseProfile(marked)).toEqual({ name: '', isSkipped: false, isNewer: false, isGuided: true, role: '' })
        expect(guidedByOf(marked)).toBe(SESSION_ID)
        expect(guidedByOf('')).toBe('')
        expect(guidedByOf('{"guidedBy":1}')).toBe('')
        expect(JSON.parse(profileText('', { guidedBy: 'x' }))).toEqual({ version: 1, guided: true, guidedBy: 'x' })
        expect(JSON.parse(profileText(marked, { name: '小美' }))).toEqual({ version: 1, name: '小美', theme: 'dark', guided: true, guidedBy: SESSION_ID })
        expect(JSON.parse(profileText(JSON.stringify({ version: 1, name: '<坏>', skipped: false }), { guidedBy: 'x' }))).toEqual({
            version: 1,
            name: '<坏>',
            skipped: false,
            guided: true,
            guidedBy: 'x'
        })
        /* guided 不是 true 不算标记 */
        expect(parseProfile('{"version":1,"guided":"yes"}').isGuided).toBe(false)
    })

    test('全新启动且还没设置：启动时不弹普通提示，等一会儿先在 profile.json 记标记再以用户身份发出设置引导，提示正在设置；引导行照旧显示', async ($, on) => {
        const { clock, seen, files } = await boot($, on, { profile: null })
        expect(firstUseToasts(seen.toasts)).toEqual([])
        await clock.advance(DELAY - 1)
        expect(seen.submitted).toEqual([])
        expect(seen.written).toEqual([])
        await clock.advance(1)
        expect(seen.written).toEqual([PROFILE_PATH])
        expect(JSON.parse(files[PROFILE_PATH] ?? '')).toEqual(MARK)
        /* 0.8.0 起演练还没处理过时，自动发起的那段话里也多一条演练 */
        expect(seen.submitted).toEqual([{ text: setupPrompt({ name: '', isUnbound: false, projectName: 'demo', isAuto: true, isTourOffered: true }), asUser: true }])
        expect(firstUseToasts(seen.toasts)).toEqual([AUTO])
        const ui = await mountPane($)
        expect((await linesOf(ui)).slice(1, 3).map(i => i.action)).toEqual([ACTION_SETUP_START, ACTION_SETUP_SKIP])
        /* 之后再过多久也不再自动发 */
        await clock.advance(60_000)
        expect(seen.submitted).toHaveLength(1)
        await ui.unmount()
    })

    test('全局模式没绑定 TAPD 的项目自动发起：那段话里带上问 TAPD 项目的一条', async ($, on) => {
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files: {}, profile: null })
        await clock.advance(DELAY)
        /* 0.8.0 起演练还没处理过时，自动发起的那段话里也多一条演练 */
        expect(seen.submitted).toEqual([{ text: setupPrompt({ name: '', isUnbound: true, projectName: 'fg-demo', isAuto: true, isTourOffered: true }), asUser: true }])
    })

    test('已有标记（这台机器自动发起过、仍没设置）：不再自动发，启动时直接弹普通提示，不写文件', async ($, on) => {
        const marked = JSON.stringify({ version: 1, guided: true, guidedBy: OTHER_SESSION })
        const { clock, seen, files } = await boot($, on, { profile: marked })
        expect(firstUseToasts(seen.toasts)).toEqual([HINT])
        await clock.advance(DELAY)
        expect(seen.submitted).toEqual([])
        expect(seen.written).toEqual([])
        expect(files[PROFILE_PATH]).toBe(marked)
    })

    test('先不设过：不自动发、不提示、不写文件', async ($, on) => {
        const { clock, seen } = await boot($, on)
        await clock.advance(DELAY)
        expect({ submitted: seen.submitted, written: seen.written, hint: firstUseToasts(seen.toasts) }).toEqual({ submitted: [], written: [], hint: [] })
    })

    test('已起名：不自动发、不提示、不写文件', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: JSON.stringify({ version: 1, name: '小美' }) })
        await clock.advance(DELAY)
        expect({ submitted: seen.submitted, written: seen.written, hint: firstUseToasts(seen.toasts) }).toEqual({ submitted: [], written: [], hint: [] })
    })

    test('等待期间用户已经用 /xiaoxiaoli name 起了名：到时什么也不做', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: null })
        await runCommand($, 'name 小美')
        await clock.advance(DELAY)
        expect(seen.submitted).toEqual([])
        expect(seen.written).toEqual([PROFILE_PATH])
        expect(firstUseToasts(seen.toasts)).toEqual([])
    })

    test('到时会话正在跑一轮（用户已经开始提问）：不发也不记标记，改弹普通提示，留给下一次会话', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: null })
        await $.turn.start({ text: '用户的第一个问题', turnId: 't1' })
        await clock.advance(DELAY)
        expect(seen.submitted).toEqual([])
        expect(seen.written).toEqual([])
        expect(firstUseToasts(seen.toasts)).toEqual([HINT])
    })

    test('输入框里已有草稿（用户正在打字）：不发也不记标记，改弹普通提示', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: null, draft: '帮我看看这个报错' })
        await clock.advance(DELAY)
        expect({ submitted: seen.submitted, written: seen.written, hint: firstUseToasts(seen.toasts) }).toEqual({ submitted: [], written: [], hint: [HINT] })
    })

    test('恢复或继续的会话（会话里已有用户消息）：不发也不记标记，改弹普通提示', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: null, turns: 3 })
        await clock.advance(DELAY)
        expect({ submitted: seen.submitted, written: seen.written, hint: firstUseToasts(seen.toasts) }).toEqual({ submitted: [], written: [], hint: [HINT] })
    })

    test('classic.SessionStart 的来源不是 startup（resume、fork 等）：不发也不记标记；是 startup 照常发', async ($, on) => {
        on('classic.SessionStart', () => ({}))
        const { clock, seen } = await boot($, on, { profile: null })
        await $.classic.SessionStart({ source: 'resume' })
        await clock.advance(DELAY)
        expect({ submitted: seen.submitted, written: seen.written, hint: firstUseToasts(seen.toasts) }).toEqual({ submitted: [], written: [], hint: [HINT] })
    })

    test('classic.SessionStart 来源是 startup：照常自动发起', async ($, on) => {
        on('classic.SessionStart', () => ({}))
        const { clock, seen } = await boot($, on, { profile: null })
        await $.classic.SessionStart({ source: 'startup' })
        await clock.advance(DELAY)
        expect(seen.submitted).toHaveLength(1)
        expect(seen.written).toEqual([PROFILE_PATH])
    })

    test('非交互式会话（-p、SDK，surface 为 null）：不排自动发起，照旧启动时弹普通提示，不写文件', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: null, isInteractive: false })
        expect(firstUseToasts(seen.toasts)).toEqual([HINT])
        await clock.advance(DELAY)
        expect(seen.submitted).toEqual([])
        expect(seen.written).toEqual([])
    })

    test('热重载重跑 session.start：不算全新启动，不重复排、不重复发，也不重复提示', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: null })
        await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
        await clock.advance(DELAY)
        expect(seen.submitted).toHaveLength(1)
        await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
        await clock.advance(DELAY)
        expect(seen.submitted).toHaveLength(1)
        expect(seen.written).toEqual([PROFILE_PATH])
        expect(firstUseToasts(seen.toasts)).toEqual([AUTO])
    })

    test('热重载时还没设置也不算全新启动：先前没自动发起（档案是后来删的），重载后也不自动发', async ($, on) => {
        const { clock, seen, files } = await boot($, on)
        delete files[PROFILE_PATH]
        await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
        await clock.advance(DELAY)
        expect(seen.submitted).toEqual([])
        expect(seen.written).toEqual([])
        expect(firstUseToasts(seen.toasts)).toEqual([HINT])
    })

    test('同时启动的另一个会话抢先改写了标记：重读认出不是自己记的，不发，改弹普通提示', async ($, on) => {
        const other = JSON.stringify({ version: 1, guided: true, guidedBy: OTHER_SESSION })
        const onWrite = (path: string, files: Record<string, string>) => {
            if (path === PROFILE_PATH) files[path] = other
        }
        const { clock, seen, files } = await boot($, on, { profile: null, onWrite })
        await clock.advance(DELAY)
        expect(seen.submitted).toEqual([])
        expect(files[PROFILE_PATH]).toBe(other)
        expect(firstUseToasts(seen.toasts)).toEqual([HINT])
    })

    test('标记写不进去：不发，改弹普通提示', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: null, writeDenied: true })
        await clock.advance(DELAY)
        expect(seen.submitted).toEqual([])
        expect(firstUseToasts(seen.toasts)).toEqual([HINT])
        expect(seen.logs.some(i => i.startsWith(`没有自动发起设置引导：标记没记下，写 ${PROFILE_PATH} 失败（`))).toBe(true)
    })

    test('取不到全局根目录：不排自动发起，不写不发，也不提示', async ($, on) => {
        const { clock, seen } = await boot($, on, { globalRoot: null, profile: null })
        await clock.advance(DELAY)
        expect({ submitted: seen.submitted, written: seen.written, hint: firstUseToasts(seen.toasts) }).toEqual({ submitted: [], written: [], hint: [] })
    })

    test('档案版本比本 mod 新：不排自动发起，不写不发', async ($, on) => {
        const newer = JSON.stringify({ version: 2 })
        const { clock, seen, files } = await boot($, on, { profile: newer })
        await clock.advance(DELAY)
        expect({ submitted: seen.submitted, written: seen.written, hint: firstUseToasts(seen.toasts) }).toEqual({ submitted: [], written: [], hint: [] })
        expect(files[PROFILE_PATH]).toBe(newer)
    })
})

describe('0.6.0：工种与工作流', () => {
    const PROFILE_PATH = `${GLOBAL_ROOT}/profile.json`
    /** 个人自定义工作流 */
    const PERSONAL_FLOW = `${GLOBAL_ROOT}/workflow.json`
    /** 某个项目目录的项目自定义工作流 */
    const projectFlowOf = (root: string) => `${globalFilesOf(root).dir}/workflow.json`
    /** 先不设过、设了工种的档案 */
    const roleProfile = (role: WorkRole) => JSON.stringify({ version: 1, skipped: true, role })
    /** 主会话调一次工作流工具、起名工具（新工具不在生成的工具名清单里，按宽松的入参调） */
    const callWorkflow = ($: Engine, args: Record<string, unknown>) => $.tool.call({ tool: 'mcp__xiaoxiaoli__workflow', ...args } as unknown as ToolCallArgs)
    const callSetup = ($: Engine, args: Record<string, unknown>) => $.tool.call({ tool: 'mcp__xiaoxiaoli__setup', ...args } as unknown as ToolCallArgs)
    /** 解析内置工作流的逐字副本，不合格直接失败 */
    const builtinOf = (role: WorkRole) => {
        const parsed = parseWorkflow(BUILTIN_WORKFLOW_TEXTS[role])
        if (!('workflow' in parsed)) throw new Error(`${role} 不合格`)
        return parsed.workflow
    }
    const keysOf = (steps: readonly { key: string }[]) => steps.map(i => i.key)
    /** 步骤只看 key、title、slow */
    const shapeOf = (steps: readonly { key: string; title: string; slow: boolean }[]) => steps.map(({ key, title, slow }) => ({ key, title, slow }))
    /** 一份最小的合格定义：需求两步，缺陷一步，不建分支 */
    const MINI = { title: '精简', branch: false, story: [{ key: 'do', title: '做事', slow: true }, { key: 'check', title: '自查' }], bug: [{ key: 'fix', title: '修' }] }
    /** 不合格原因 */
    const reasonOf = (raw: unknown) => {
        const checked = checkWorkflow(raw)
        return 'reason' in checked ? checked.reason : ''
    }
    /** 一步合格的步骤，按需改一个字段 */
    const stepWith = (patch: Record<string, unknown>) => ({ story: [{ key: 'do', title: '做事', ...patch }], bug: [{ key: 'fix', title: '修' }] })
    const CTX = { updatedAt: UPDATED, sessionId: SESSION_ID }
    const testActive = () => ({ workflow: builtinOf('test'), id: 'test' })
    /** 一份定义规范后写进 workflow.json 的全文，不合格直接失败 */
    const fileTextOf = (raw: unknown) => {
        const checked = checkWorkflow(raw)
        if (!('workflow' in checked)) throw new Error(checked.reason)
        return workflowFileText(checked.workflow)
    }

    test('六个内置定义都能通过校验：id、名字与工种一致，测试、产品、其他开工不建分支；规范后写回再读不变', () => {
        expect(WORK_ROLES.map(role => 'workflow' in parseWorkflow(BUILTIN_WORKFLOW_TEXTS[role]))).toEqual(WORK_ROLES.map(() => true))
        expect(WORK_ROLES.map(role => builtinOf(role).id)).toEqual([...WORK_ROLES])
        expect(WORK_ROLES.map(role => builtinOf(role).title)).toEqual(WORK_ROLES.map(role => ROLE_TITLES[role]))
        expect(WORK_ROLES.map(role => builtinOf(role).branch)).toEqual([true, true, true, false, false, false])
        const test = builtinOf('test')
        expect(test.story).toHaveLength(11)
        expect(keysOf(test.story)).not.toContain('branch')
        expect(test.bug).toHaveLength(5)
        expect(test.story[3]).toMatchObject({ key: 'align', title: '对齐测试范围', slow: true, ask: '是：确认后才写用例' })
        expect(WORK_ROLES.map(role => parseWorkflow(workflowFileText(builtinOf(role))))).toEqual(WORK_ROLES.map(role => ({ workflow: builtinOf(role) })))
    })

    test('frontend.json 的键、标题与慢环节和代码里的前端步骤常量（STORY_STEPS、BUG_STEPS、SLOW_STEP_KEYS）完全一致，按它建的条目是旧样式', () => {
        const frontend = builtinOf('frontend')
        expect(shapeOf(frontend.story)).toEqual(STORY_STEPS.map(i => ({ key: i.key, title: i.title, slow: SLOW_STEP_KEYS.includes(i.key) })))
        expect(shapeOf(frontend.bug)).toEqual(BUG_STEPS.map(i => ({ key: i.key, title: i.title, slow: false })))
        expect({ story: shapeOf(frontend.story), bug: shapeOf(frontend.bug), branch: frontend.branch }).toEqual({
            story: FALLBACK_WORKFLOW.story,
            bug: FALLBACK_WORKFLOW.bug,
            branch: FALLBACK_WORKFLOW.branch
        })
        expect(flowOf({ workflow: frontend, id: 'frontend' }, 'story')).toBeUndefined()
        expect(flowOf({ workflow: frontend, id: 'frontend' }, 'bug')).toBeUndefined()
        expect(flowsOf({ workflow: frontend, id: 'frontend' })).toEqual({})
    })

    test('校验：结构、步数、key、title、slow、细则与长度上限、branch、version、id 不合格都给中文原因；缺省值与多余字段', () => {
        expect(reasonOf('x')).toBe('定义要是一个 JSON 对象')
        expect(reasonOf({ bug: MINI.bug })).toBe('需求（story）要是步骤数组')
        expect(reasonOf({ story: [], bug: MINI.bug })).toBe('需求（story）要有 1 到 20 步，现在是 0 步')
        const many = Array.from({ length: 21 }, (_, index) => ({ key: `s${index}`, title: `第${index}步` }))
        expect(reasonOf({ story: many, bug: MINI.bug })).toBe('需求（story）要有 1 到 20 步，现在是 21 步')
        expect(reasonOf({ story: many.slice(0, 20), bug: MINI.bug })).toBe('')
        expect(reasonOf({ story: MINI.story, bug: [] })).toBe('缺陷（bug）要有 1 到 20 步，现在是 0 步')
        for (const key of ['Bad', '1a', 'a_b', '', 'a'.repeat(33)]) expect(reasonOf(stepWith({ key }))).toContain('要是小写字母开头、只含小写字母、数字与 - 的文字')
        expect(reasonOf({ story: [{ key: 'do', title: '甲' }, { key: 'do', title: '乙' }], bug: MINI.bug })).toBe('需求（story）里的 key「do」重复了')
        expect(reasonOf(stepWith({ title: ' ' }))).toBe('需求（story）第 1 步（do）的 title 要填，不能为空')
        expect(reasonOf(stepWith({ title: '一二三四五六七八九十甲乙丙' }))).toBe('需求（story）第 1 步（do）的 title 最多 12 个字符，现在是 13 个')
        expect(reasonOf(stepWith({ title: '做\n事' }))).toBe('需求（story）第 1 步（do）的 title 不能含换行、制表等控制字符')
        expect(reasonOf(stepWith({ slow: 'yes' }))).toBe('需求（story）第 1 步（do）的 slow 要是 true 或 false')
        expect(reasonOf(stepWith({ what: 1 }))).toBe('需求（story）第 1 步（do）的 what 要是文字')
        expect(reasonOf(stepWith({ ask: '问'.repeat(201) }))).toBe('需求（story）第 1 步（do）的 ask 最多 200 个字符')
        expect(reasonOf(stepWith({ rules: 'x' }))).toBe('需求（story）第 1 步（do）的 rules 要是文字数组')
        expect(reasonOf(stepWith({ rules: [1] }))).toBe('需求（story）第 1 步（do）的 rules 要是文字数组')
        expect(reasonOf(stepWith({ rules: Array.from({ length: 11 }, () => '规则') }))).toBe('需求（story）第 1 步（do）的 rules 最多 10 条')
        expect(reasonOf(stepWith({ rules: ['规'.repeat(301)] }))).toBe('需求（story）第 1 步（do）的 rules 每条最多 300 个字符')
        expect(reasonOf({ ...MINI, branch: 'no' })).toBe('branch 要是 true 或 false')
        expect(reasonOf({ ...MINI, version: 0 })).toBe('version 要是正整数')
        expect(reasonOf({ ...MINI, version: '1' })).toBe('version 要是正整数')
        expect(checkWorkflow({ ...MINI, version: 2 })).toEqual({ reason: 'version 2 比本 mod 认识的新（1），先更新 mod', isNewer: true })
        expect(reasonOf({ ...MINI, id: 'Bad' })).toBe('id 要是小写字母开头、只含小写字母、数字与 - 的文字')
        expect(reasonOf({ ...MINI, title: '一二三四五六七八九十甲乙丙' })).toBe('工作流的 title 最多 12 个字符，现在是 13 个')
        expect(parseWorkflow('')).toEqual({ isEmpty: true })
        expect(parseWorkflow('  \n')).toEqual({ isEmpty: true })
        expect(parseWorkflow('{oops')).toEqual({ reason: '不是合法 JSON', isNewer: false })
        const loose = checkWorkflow({ story: [{ key: 'a', title: ' 甲 ', foo: 1 }], bug: [{ key: 'b', title: '乙', rules: [] }], extra: true })
        expect(loose).toEqual({
            workflow: { version: 1, branch: true, story: [{ key: 'a', title: '甲', slow: false }], bug: [{ key: 'b', title: '乙', slow: false, rules: [] }] }
        })
    })

    test('三层查找：项目自定义优先，不合格时跳过用下一层并如实说明；空文件当作没有；内置读不到退回代码里的前端步骤', () => {
        const layer = (path: string, value: unknown) => ({ path, text: typeof value === 'string' ? value : JSON.stringify(value) })
        const builtin = layer('/mod/workflows/backend.json', BUILTIN_WORKFLOW_TEXTS.backend)
        const picked = (result: ReturnType<typeof pickWorkflow>) => {
            const { source, id, label, path, noticeList } = result.active
            return { source, id, label, path, noticeList }
        }
        const project = pickWorkflow({ project: layer('/p/workflow.json', MINI), personal: layer('/g/workflow.json', { ...MINI, title: '个人' }), builtin, role: 'backend' })
        expect(picked(project)).toEqual({ source: 'project', id: 'project', label: '项目自定义', path: '/p/workflow.json', noticeList: [] })
        expect(project.active.workflow.title).toBe('精简')
        const personal = pickWorkflow({ project: layer('/p/workflow.json', '{oops'), personal: layer('/g/workflow.json', MINI), builtin, role: 'backend' })
        expect(picked(personal)).toEqual({
            source: 'personal',
            id: 'personal',
            label: '个人自定义',
            path: '/g/workflow.json',
            noticeList: ['项目自定义工作流（/p/workflow.json）不合格：不是合法 JSON', '先用个人自定义']
        })
        const both = pickWorkflow({ project: layer('/p/workflow.json', { story: [] }), personal: layer('/g/workflow.json', { ...MINI, version: 2 }), builtin, role: 'backend' })
        expect(picked(both)).toEqual({
            source: 'builtin',
            id: 'backend',
            label: '内置 · 后端',
            path: '/mod/workflows/backend.json',
            noticeList: [
                '项目自定义工作流（/p/workflow.json）不合格：需求（story）要有 1 到 20 步，现在是 0 步',
                '个人自定义工作流（/g/workflow.json）不合格：version 2 比本 mod 认识的新（1），先更新 mod',
                '先用内置 · 后端'
            ]
        })
        expect(picked(pickWorkflow({ project: layer('/p/workflow.json', ''), personal: null, builtin, role: 'backend' })).noticeList).toEqual([])
        expect(pickWorkflow({ project: null, personal: null, builtin, role: 'backend' }).active.source).toBe('builtin')
        const fallback = pickWorkflow({ project: null, personal: null, builtin: layer('/mod/workflows/test.json', ''), role: 'test' })
        expect(picked(fallback)).toEqual({ source: 'fallback', id: 'frontend', label: '内置 · 前端（代码里保留的步骤）', path: '', noticeList: [] })
        expect(fallback.active.workflow).toEqual(FALLBACK_WORKFLOW)
        expect(fallback.builtinError).toBe('/mod/workflows/test.json 读不到')
        expect(pickWorkflow({ project: null, personal: null, builtin: layer('/mod/workflows/test.json', '{'), role: 'test' }).builtinError).toBe('/mod/workflows/test.json 不是合法 JSON')
    })

    test('按工作流建条目：测试工种的需求 11 步、没有建分支这一步、从读需求开始，缺陷 5 步；记 workflow 与每步 slow，写回再读不变，旧样式条目写回不带新字段', () => {
        const storyFlow = flowOf(testActive(), 'story')
        expect(storyFlow?.id).toBe('test')
        const story = newTask({ id: '9990101', kind: 'story', title: '演示-测试需求', updatedAt: UPDATED, detail: '本会话开工', flow: storyFlow })
        expect(story.workflow).toBe('test')
        expect(story.steps).toHaveLength(11)
        expect(keysOf(story.steps)).not.toContain('branch')
        expect(story.steps.slice(0, 3).map(i => [i.key, i.status])).toEqual([['fetch', 'done'], ['sort', 'done'], ['read', 'doing']])
        expect(story.steps[2]).toEqual({ key: 'read', title: '读需求与语雀', status: 'doing', detail: '本会话开工', slow: true })
        expect(story.steps[5]).toEqual({ key: 'prepare', title: '准备环境与数据', status: 'todo', slow: false })
        const bug = newTask({ id: '9990102', kind: 'bug', title: '演示-测试缺陷', updatedAt: UPDATED, detail: '本会话开工', flow: flowOf(testActive(), 'bug') })
        expect(bug.steps.map(i => i.key)).toEqual(['fixnote', 'env', 'recheck', 'regress', 'close'])
        expect(bug.steps[0]?.status).toBe('doing')
        expect(Object.keys(flowsOf(testActive()))).toEqual(['story', 'bug'])
        const text = stringifyState([story, bug])
        expect(text).toContain('"workflow": "test"')
        expect(text).toContain('{ "key": "read", "title": "读需求与语雀", "slow": true, "status": "doing", "detail": "本会话开工" }')
        expect(text).not.toContain('"slow": false')
        expect(parseProgress(text)).toEqual({ taskList: [story, bug], error: '' })
        const legacy = stringifyState([storyTask('1000101', '演示需求甲', 'develop')])
        expect(legacy).not.toContain('"slow"')
        expect(legacy).not.toContain('"workflow"')
        /* 自成一套的条目：键叫 read 但工作流里是快环节，仍是快环节；去掉了写文档的工作流建的条目，读回来不补 docs */
        const fastRead = newTask({ id: '9990103', kind: 'story', title: '演示', updatedAt: UPDATED, detail: '', flow: { id: 'personal', steps: [{ key: 'read', title: '读', slow: false }] } })
        const fastBack = parseProgress(stringifyState([fastRead])).taskList[0] as ProgressTaskType
        expect(isSlowStep(fastBack.steps[0] as ProgressTaskType['steps'][number])).toBe(false)
        const noDocs = FALLBACK_WORKFLOW.story.filter(i => i.key !== 'docs')
        const trimmed = newTask({ id: '9990104', kind: 'story', title: '演示', updatedAt: UPDATED, detail: '', flow: { id: 'project', steps: noDocs } })
        expect((parseProgress(stringifyState([trimmed])).taskList[0] as ProgressTaskType).steps).toHaveLength(10)
        /* 旧样式条目没有 slow，按前端的慢环节 */
        expect(isSlowStep({ key: 'develop', title: '开发', status: 'todo' })).toBe(true)
        expect(isSlowStep({ key: 'docs', title: '写文档', status: 'todo' })).toBe(false)
    })

    test('进度规则按条目自己的步骤：别的工作流的键被拒并列出可用的键，子项只能挂在它的慢环节；进度工具新建条目按当前生效的工作流', () => {
        const story = newTask({ id: '9990101', kind: 'story', title: '演示-测试需求', updatedAt: UPDATED, detail: '', flow: flowOf(testActive(), 'story') })
        const apply = (raw: Record<string, unknown>, list: ProgressTaskType[] = [story], ctx: Parameters<typeof applyProgress>[2] = CTX) =>
            applyProgress(list, toProgressInput(raw) as never, ctx)
        const moved = apply({ id: '9990101', step: 'cases', status: 'doing' })
        expect(typeof moved === 'string' ? moved : moved.text).toBe('已更新 9990101：第 5 步 写用例中')
        expect(apply({ id: '9990101', step: 'develop', status: 'doing' })).toBe('需求的步骤只有 fetch、sort、read、align、cases、prepare、execute、bugs、regress、report、tapd')
        expect(apply({ id: '9990101', step: 'prepare', taskId: '造数据', taskStatus: 'doing' })).toBe('只有 read、align、cases、execute、regress 能挂任务')
        expect(typeof apply({ id: '9990101', step: 'execute', taskId: '9990111', taskTitle: '演示-执行', taskStatus: 'doing' })).toBe('object')
        const created = apply({ id: '9990105', title: '新需求', step: 'cases', status: 'doing' }, [], { ...CTX, flowFor: flowsOf(testActive()) })
        const task = typeof created === 'string' ? undefined : created.taskList[0]
        expect({ workflow: task?.workflow, count: task?.steps.length, doing: task?.steps.find(i => i.status === 'doing')?.key }).toEqual({ workflow: 'test', count: 11, doing: 'cases' })
        expect(toProgressInput({ id: '9990101', step: 'Bad' })).toBe('step 要填这个条目的步骤键（取自工作流，小写字母开头，只含小写字母、数字与 -）')
    })

    test('workflow 工具的返回文字与参数校验：只要一组时只带那一组，开头一行写来源、建不建分支、进行中的不受影响；自定义不合格时多一行注意', () => {
        const active = pickWorkflow({ project: null, personal: null, builtin: { path: '/mod/workflows/test.json', text: BUILTIN_WORKFLOW_TEXTS.test }, role: 'test' }).active
        const [head, json] = workflowText(active, 'bug').split('\n')
        expect(head).toBe('来源：内置 · 测试（/mod/workflows/test.json）；开工不建分支；进行中的条目按各自开工时记下的步骤走，不受它影响')
        expect(Object.keys(JSON.parse(json ?? '{}') as object)).toEqual(['version', 'id', 'title', 'branch', 'bug'])
        expect(Object.keys(JSON.parse(workflowText(active).split('\n')[1] ?? '{}') as object)).toEqual(['version', 'id', 'title', 'branch', 'story', 'bug'])
        const noticed = pickWorkflow({ project: { path: '/p/workflow.json', text: '{oops' }, personal: null, builtin: { path: '/mod/workflows/test.json', text: BUILTIN_WORKFLOW_TEXTS.test }, role: 'test' }).active
        expect(workflowText(noticed, 'story').split('\n').slice(1, 3)).toEqual(['注意：项目自定义工作流（/p/workflow.json）不合格：不是合法 JSON', '注意：先用内置 · 测试'])
        expect(toWorkflowInput({})).toBe('action 只能是 get、set、reset')
        expect(toWorkflowInput({ action: 'get' })).toEqual({ action: 'get' })
        expect(toWorkflowInput({ action: 'get', kind: 'task' })).toBe('kind 只能是 story、bug')
        expect(toWorkflowInput({ action: 'set' })).toBe('set 要给 scope：project（本项目）或 personal（个人，所有项目）')
        expect(toWorkflowInput({ action: 'set', scope: 'project' })).toBe('set 要给完整的 definition（story、bug，可选 branch、title）')
        expect(toWorkflowInput({ action: 'set', scope: 'personal', definition: '{"story":[]}' })).toEqual({ action: 'set', scope: 'personal', definition: { story: [] } })
        expect(toWorkflowInput({ action: 'set', scope: 'personal', definition: '{oops' })).toBe('definition 是文字时要是合法 JSON')
        expect(toWorkflowInput({ action: 'reset', scope: 'project' })).toEqual({ action: 'reset', scope: 'project' })
    })

    test('工种：认 id 与中文名（不分大小写、去空白），档案里只认 id；只改工种时名字、先不设与标记都不动；设置引导在问名字后问工种', () => {
        expect(['后端', 'Python', 'PYTHON', 'frontend', ' 测试 ', '其他'].map(toRole)).toEqual(['backend', 'python', 'python', 'frontend', 'test', 'other'])
        expect([toRole('运维'), toRole(1), toRole('')]).toEqual([undefined, undefined, undefined])
        expect(parseProfile('{"version":1,"role":"backend"}').role).toBe('backend')
        expect(parseProfile('{"version":1,"role":"后端"}').role).toBe('')
        expect(roleOf(parseProfile(''))).toBe('frontend')
        const old = JSON.stringify({ version: 1, name: '小美', guided: true, guidedBy: 'x', theme: 'dark' })
        expect(JSON.parse(profileText(old, { role: 'test' }))).toEqual({ version: 1, name: '小美', guided: true, guidedBy: 'x', theme: 'dark', role: 'test' })
        expect(JSON.parse(profileText(JSON.stringify({ version: 1, skipped: true, role: 'test' }), { name: '小丽', role: 'product' }))).toEqual({ version: 1, name: '小丽', role: 'product' })
        expect(JSON.parse(profileText(JSON.stringify({ version: 1, role: 'test' }), { name: '小丽' }))).toEqual({ version: 1, name: '小丽', role: 'test' })
        const prompt = setupPrompt({ name: '小美', role: 'backend', isUnbound: false, projectName: 'demo' })
        expect(prompt.split('\n')[2]).toBe(
            '2. 再问我主要做哪类工作（工种决定开工用哪套工作流，测试、产品、其他开工不建分支），可以和上一问放在同一次 AskUserQuestion 里；选项给「前端」「后端」「测试」「产品」，并说明 Python 或别的工种选「其他」自己填；现在是「后端」'
        )
        expect(prompt).toContain('role 传 frontend、backend、test、product 之一，自己填 Python 的传 python，填别的都传 other')
    })

    test('不建分支的开工消息与新会话命令：在项目目录直接起 claude，PowerShell 与 bash 两套，引号规则沿用；开工消息里取工作流的一句按种类', () => {
        expect(workflowGuide('bug')).toBe('先调 mcp__xiaoxiaoli__workflow 取本项目工作流（kind 传 bug），按它的步骤、细则与「先问」走，进度用它的步骤键，其余照技能的通用规则')
        expect(herePrompt({ longId: STORY_B, root: FG_ROOT, dataDir: 'D:/data', kind: 'bug' })).toBe(
            `开工 ${STORY_B}（独立会话：在项目目录 ${FG_ROOT}，不建分支；${GLOBAL_GUIDE}；${workflowGuide('bug')}；项目资料目录 D:/data；TAPD 评论署名 ——小小黎AI工作台）`
        )
        expect(submitText({ longId: BUG_A, dataDir: 'D:/data', kind: 'bug' })).toContain(`；${workflowGuide('bug')}；`)
        const plan = { sessionId: SESSION_ID, id: '1000102', prompt: "开工 1（a’b'c）", addDir: 'D:/data' }
        /* 0.7.0 起开工提示在 --add-dir 之前 */
        expect(hereSessionCommand({ ...plan, dir: "D:/work/it's" })).toBe(`Set-Location 'D:/work/it''s'; claude --session-id ${SESSION_ID} -n '1000102' '开工 1（a’’b''c）' --add-dir 'D:/data'`)
        expect(hereSessionCommand({ ...plan, dir: "/home/dev/it's", addDir: '' })).toBe(`cd '/home/dev/it'\\''s' && claude --session-id ${SESSION_ID} -n '1000102' '开工 1（a’b'\\''c）'`)
    })

    test('测试工种在全局模式开工：本会话建出测试的 11 步（没有建分支）；手上有条目时给在项目目录直接起会话的 PowerShell 命令，条目不记分支与 worktree；回到已有会话照旧', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { clock, seen, files } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) }, profile: roleProfile('test') })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_A)
        /* 0.7.0 起资料目录一句同时给出通用资料目录 */
        expect(seen.submitted).toEqual([
            { text: `开工 ${STORY_A}（${GLOBAL_GUIDE}；${workflowGuide('story')}；${resourceDirsText(global.dir, SHARED)}；TAPD 评论署名 ——小小黎AI工作台）`, asUser: true }
        ])
        const mine = parseProgress(files[global.state] ?? '').taskList.find(i => i.id === '1000101') as ProgressTaskType
        expect({ workflow: mine.workflow, keys: keysOf(mine.steps), doing: mine.steps.find(i => i.status === 'doing')?.key }).toEqual({
            workflow: 'test',
            keys: keysOf(builtinOf('test').story),
            doing: 'read'
        })
        await startFromPane(ui, STORY_B)
        const command = seen.copied[0] ?? ''
        expect(command.startsWith(`Set-Location '${FG_ROOT}'; claude --session-id `)).toBe(true)
        /* 0.7.0 起开工提示在 --add-dir 之前，并多一个通用资料目录的 --add-dir */
        expect(command).toContain(`-n '1000102' '${herePrompt({ longId: STORY_B, root: FG_ROOT, dataDir: global.dir, sharedDir: SHARED })}' --add-dir '${global.dir}' --add-dir '${SHARED}'`)
        expect(command).not.toContain('worktree')
        const other = parseProgress(files[global.state] ?? '').taskList.find(i => i.id === '1000102') as ProgressTaskType
        expect({ branch: other.branch, worktree: other.worktree, workflow: other.workflow }).toEqual({ branch: undefined, worktree: undefined, workflow: 'test' })
        expect((await textsOf(ui)).some(i => i.startsWith('启动命令 1000102 · 新会话（项目目录，不建分支）'))).toBe(true)
        expect(seen.toasts).toContain('小小黎：1000102 的启动命令已复制，到新的 PowerShell 窗口粘贴运行')
        await click(ui, 2, await rowOf(ui, ACTION_LAUNCH_CLOSE))
        await startFromPane(ui, STORY_B)
        expect(seen.copied[1]).toBe(`Set-Location '${FG_ROOT}'; claude --resume ${other.sessionId}`)
        await ui.unmount()
    })

    test('测试工种开缺陷：建出测试的 5 步，开工消息里取 bug 那组', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { clock, seen, files } = await boot($, on, {
            cwd: FG_ROOT,
            files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) },
            profile: roleProfile('test'),
            store: { scope: 'all' }
        })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, BUG_A)
        expect(seen.submitted[0]?.text).toContain(`；${workflowGuide('bug')}；`)
        const bug = parseProgress(files[global.state] ?? '').taskList.find(i => i.id === '1000301') as ProgressTaskType
        expect({ kind: bug.kind, keys: keysOf(bug.steps), first: bug.steps[0]?.status }).toEqual({ kind: 'bug', keys: ['fixnote', 'env', 'recheck', 'regress', 'close'], first: 'doing' })
        await ui.unmount()
    })

    test('不建分支的工种在 macOS / Linux 项目里：新会话命令是 bash/zsh 的 cd 加 claude', async ($, on) => {
        const root = '/home/dev/demo'
        const globalRoot = '/home/dev/.claude/xiaoxiaoli'
        const dir = `${globalRoot}/projects/${projectKeyOf(root)}`
        const files = { [`${dir}/config.json`]: JSON.stringify(GLOBAL_CONFIG) }
        const { clock, seen } = await boot($, on, { cwd: root, files, isPosix: true, globalRoot, profile: roleProfile('product') })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_A)
        await startFromPane(ui, STORY_B)
        const command = seen.copied[0] ?? ''
        expect(command.startsWith(`cd '/home/dev/demo' && claude --session-id `)).toBe(true)
        /* 0.7.0 起开工提示在 --add-dir 之前，并多一个通用资料目录的 --add-dir */
        expect(command).toContain(`-n '1000102' '开工 ${STORY_B}（独立会话：在项目目录 /home/dev/demo，不建分支；`)
        expect(command.endsWith(`' --add-dir '${dir}' --add-dir '${globalRoot}/shared'`)).toBe(true)
        expect(seen.toasts).toContain('小小黎：1000102 的启动命令已复制，到新的终端（bash/zsh）粘贴运行')
        await ui.unmount()
    })

    test('项目不在 git 仓库里：不建分支的工种照样能本会话开工，新会话命令进会话目录直接起 claude', async ($, on) => {
        const root = 'D:/work/plain'
        const global = globalFilesOf(root)
        const { clock, seen, files } = await boot($, on, { cwd: root, repoRoot: null, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) }, profile: roleProfile('product') })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_A)
        expect(seen.submitted).toHaveLength(1)
        expect(parseProgress(files[global.state] ?? '').taskList[0]?.workflow).toBe('product')
        await startFromPane(ui, STORY_B)
        expect((seen.copied[0] ?? '').startsWith(`Set-Location '${root}'; claude --session-id `)).toBe(true)
        expect(seen.copied[0]).not.toContain('git ')
        await ui.unmount()
    })

    test('进行中的条目不受工作流变化影响：旧的前端条目照旧按前端的键推进，按测试工作流建的条目在工作流改了之后也照旧', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const files = { [global.config]: JSON.stringify(GLOBAL_CONFIG), [global.state]: stringifyState([demoStory(SESSION_ID)]) }
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files, profile: roleProfile('test') })
        await clock.advance(1)
        expect(String((await callProgress($, { id: '9990001', step: 'unit', status: 'doing' })).result)).toContain('第 7 步 单测中')
        await callProgress($, { id: '9990009', title: '演示-测试需求', step: 'cases', status: 'doing' })
        expect((await callProgress($, { id: '9990009', step: 'develop', status: 'doing' })).deny).toBe(
            '小小黎：需求的步骤只有 fetch、sort、read、align、cases、prepare、execute、bugs、regress、report、tapd，没有写入'
        )
        const set = await callWorkflow($, { action: 'set', scope: 'project', definition: MINI })
        expect(set.deny).toBeUndefined()
        expect(String((await callProgress($, { id: '9990009', step: 'execute', status: 'doing' })).result)).toContain('第 7 步 执行测试中')
        expect(String((await callProgress($, { id: '9990001', step: 'selftest', status: 'doing' })).result)).toContain('第 8 步 浏览器自测中')
        const state = parseProgress(files[global.state] ?? '')
        expect(state.taskList.map(i => [i.id, i.workflow, i.steps.length])).toEqual([
            ['9990001', undefined, 11],
            ['9990009', 'test', 11]
        ])
        expect(seen.written.filter(i => i === projectFlowOf(FG_ROOT))).toHaveLength(1)
    })

    test('workflow 工具 get：默认内置 · 前端，只要一组时只带那一组；工种换成测试后是内置 · 测试', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { seen } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) } })
        expect(seen.tools).toContain('workflow')
        expect(seen.deferredTools).not.toContain('workflow')
        const got = String((await callWorkflow($, { action: 'get', kind: 'bug' })).result)
        const [head, json] = got.split('\n')
        expect(head?.startsWith('来源：内置 · 前端（')).toBe(true)
        expect(head).toContain('workflows/frontend.json）；开工建分支；进行中的条目按各自开工时记下的步骤走，不受它影响')
        expect(keysOf((JSON.parse(json ?? '{}') as { bug: { key: string }[] }).bug)).toEqual(['screenshot', 'env', 'reproduce', 'diagnose', 'fix', 'verify'])
        expect((await runCommand($, 'role 测试')).text?.startsWith('小小黎：已改，工种：测试，从下一条新开工的条目起按内置 · 测试的工作流')).toBe(true)
        expect(String((await callWorkflow($, { action: 'get' })).result).startsWith('来源：内置 · 测试（')).toBe(true)
        expect((await callWorkflow($, { action: 'get', kind: 'task' })).deny).toBe('小小黎：参数不对，kind 只能是 story、bug，没有写入')
    })

    test('workflow 工具 set：校验通过才写规范后的定义，返回写到了哪、从新开工的条目起生效；项目自定义优先于个人，新开工的条目按它建', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { clock, seen, files } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) } })
        const personal = await callWorkflow($, { action: 'set', scope: 'personal', definition: { ...MINI, title: '个人', extra: 1 } })
        expect(String(personal.result)).toBe(
            `已写入个人自定义工作流（${PERSONAL_FLOW}）；从下一条新开工的条目起生效，进行中的条目按各自开工时的步骤走、不受影响；本项目现在生效的是：个人自定义`
        )
        /* 写的是规范后的定义：多余字段丢掉，版本写 1 */
        expect(files[PERSONAL_FLOW]).toBe(fileTextOf({ ...MINI, title: '个人' }))
        expect(files[PERSONAL_FLOW]).not.toContain('extra')
        const project = await callWorkflow($, { action: 'set', scope: 'project', definition: JSON.stringify(MINI) })
        expect(String(project.result)).toBe(
            `已写入项目自定义工作流（${projectFlowOf(FG_ROOT)}）；从下一条新开工的条目起生效，进行中的条目按各自开工时的步骤走、不受影响；本项目现在生效的是：项目自定义`
        )
        expect(files[projectFlowOf(FG_ROOT)]).toBe(fileTextOf(MINI))
        expect(String((await callWorkflow($, { action: 'get' })).result).startsWith(`来源：项目自定义（${projectFlowOf(FG_ROOT)}）；开工不建分支；`)).toBe(true)
        expect(seen.written).toEqual([PERSONAL_FLOW, projectFlowOf(FG_ROOT)])
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_A)
        const task = parseProgress(files[global.state] ?? '').taskList[0] as ProgressTaskType
        expect({ workflow: task.workflow, keys: keysOf(task.steps), doing: task.steps[0]?.status }).toEqual({ workflow: 'project', keys: ['do', 'check'], doing: 'doing' })
        await ui.unmount()
    })

    test('workflow 工具 set 的失败：定义不合格、项目内模式存项目自定义、取不到全局根目录、那一层文件版本比本 mod 新、写文件失败，都不写入', async ($, on) => {
        const { seen, files } = await boot($, on, { files: { [CONFIG_FILE]: JSON.stringify(CONFIG), [PERSONAL_FLOW]: JSON.stringify({ ...MINI, version: 2 }) } })
        expect((await callWorkflow($, { action: 'set', scope: 'personal', definition: { story: [], bug: MINI.bug } })).deny).toBe(
            '小小黎：definition 不合格：需求（story）要有 1 到 20 步，现在是 0 步，没有写入'
        )
        expect((await callWorkflow($, { action: 'set', scope: 'project', definition: MINI })).deny).toBe(
            `小小黎：本项目用项目内配置 ${CONFIG_FILE}（流程按项目内文档约定），没有全局项目目录，项目自定义工作流存不了；要对所有项目生效可用 scope personal，没有写入`
        )
        expect((await callWorkflow($, { action: 'set', scope: 'personal', definition: MINI })).deny).toBe(`小小黎：${PERSONAL_FLOW} 的版本比本 mod 新，先更新 mod，没有写入`)
        expect((await callWorkflow($, { action: 'reset', scope: 'personal' })).deny).toBe(`小小黎：${PERSONAL_FLOW} 的版本比本 mod 新，先更新 mod，没有写入`)
        expect((await callWorkflow($, { action: 'set', scope: 'personal' })).deny).toBe('小小黎：参数不对，set 要给完整的 definition（story、bug，可选 branch、title），没有写入')
        expect(seen.written).toEqual([])
        expect(JSON.parse(files[PERSONAL_FLOW] ?? '').version).toBe(2)
    })

    test('workflow 工具 set 的失败（续）：取不到全局根目录、写文件失败', async ($, on) => {
        const { seen } = await boot($, on, { globalRoot: null })
        expect((await callWorkflow($, { action: 'set', scope: 'personal', definition: MINI })).deny).toBe(`小小黎：${NO_GLOBAL_ROOT_TEXT}，没有写入`)
        expect((await callWorkflow($, { action: 'reset', scope: 'project' })).deny).toBe(`小小黎：${NO_GLOBAL_ROOT_TEXT}，没有写入`)
        expect(seen.written).toEqual([])
    })

    test('workflow 工具写文件失败：如实拒绝并带原因', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) }, writeDenied: true })
        const denied = String((await callWorkflow($, { action: 'set', scope: 'project', definition: MINI })).deny)
        expect(denied.startsWith(`小小黎：写 ${projectFlowOf(FG_ROOT)} 失败（`)).toBe(true)
        expect(denied.endsWith('），没有写入')).toBe(true)
    })

    test('workflow 工具 reset：清空那一层（不删文件），回到下一层；没有可去掉的如实说；项目内模式不能 reset 项目层', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const files = { [global.config]: JSON.stringify(GLOBAL_CONFIG), [projectFlowOf(FG_ROOT)]: fileTextOf(MINI) }
        const { seen } = await boot($, on, { cwd: FG_ROOT, files, profile: roleProfile('backend') })
        expect(String((await callWorkflow($, { action: 'get' })).result).startsWith('来源：项目自定义')).toBe(true)
        expect(String((await callWorkflow($, { action: 'reset', scope: 'project' })).result)).toBe(
            `已清空项目自定义工作流（${projectFlowOf(FG_ROOT)}；mod 不删文件，空文件等于没有自定义），回到下一层；本项目现在生效的是：内置 · 后端；进行中的条目不受影响`
        )
        expect(files[projectFlowOf(FG_ROOT)]).toBe('')
        expect(String((await callWorkflow($, { action: 'reset', scope: 'project' })).result)).toBe(
            `项目自定义本来就没有自定义工作流（${projectFlowOf(FG_ROOT)}），没有改动；本项目现在生效的是：内置 · 后端`
        )
        expect(String((await callWorkflow($, { action: 'reset', scope: 'personal' })).result)).toContain('个人自定义本来就没有自定义工作流')
        expect(seen.written).toEqual([projectFlowOf(FG_ROOT)])
    })

    test('项目内模式（有 config.json）：沿用前端步骤与建分支，工种与自定义工作流都不生效；get 如实说明，个人自定义可以存但说明对本项目不生效', async ($, on) => {
        const { clock, seen, files } = await boot($, on, { profile: roleProfile('test') })
        expect(String((await callWorkflow($, { action: 'get' })).result).startsWith('来源：项目内模式（沿用前端步骤，流程按项目内文档）；开工建分支；')).toBe(true)
        expect(String((await callWorkflow($, { action: 'set', scope: 'personal', definition: MINI })).result)).toContain(
            '本项目是项目内模式，沿用前端步骤，自定义工作流对它不生效（对全局模式的项目生效）'
        )
        expect((await runCommand($, 'role')).text).toBe('小小黎：工种：测试；本项目生效的工作流：项目内模式（沿用前端步骤，流程按项目内文档）；可选 前端、后端、Python、测试、产品、其他，改用 /xiaoxiaoli role <工种>')
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_A)
        expect(seen.submitted).toEqual([{ text: `开工 ${STORY_A}`, asUser: true }])
        const task = parseProgress(files[STATE_FILE] ?? '').taskList[0] as ProgressTaskType
        expect({ workflow: task.workflow, count: task.steps.length, doing: task.steps.find(i => i.status === 'doing')?.key }).toEqual({ workflow: undefined, count: 11, doing: 'branch' })
        await ui.unmount()
    })

    test('自定义工作流不合格：跳过用下一层，toast 只提示一次，/xiaoxiaoli refresh 的结果与 get 里都如实带上', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const files = { [global.config]: JSON.stringify(GLOBAL_CONFIG), [projectFlowOf(FG_ROOT)]: '{oops' }
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files })
        const notice = `项目自定义工作流（${projectFlowOf(FG_ROOT)}）不合格：不是合法 JSON；先用内置 · 前端`
        expect(seen.toasts.filter(i => i === `小小黎：${notice}`)).toHaveLength(1)
        await clock.advance(1)
        expect((await runCommand($, 'refresh')).text).toBe(`小小黎：已刷新，待办 3 条；工作流：${notice}`)
        expect(seen.toasts.filter(i => i === `小小黎：${notice}`)).toHaveLength(1)
        expect(String((await callWorkflow($, { action: 'get', kind: 'story' })).result).split('\n')[1]).toBe(`注意：项目自定义工作流（${projectFlowOf(FG_ROOT)}）不合格：不是合法 JSON`)
    })

    test('内置工作流文件读不到：退回代码里的前端步骤（建分支），面板照常开工，只记 debug 日志不提示', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { clock, seen, files } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) }, profile: roleProfile('test'), builtins: { test: null } })
        expect(String((await callWorkflow($, { action: 'get' })).result).startsWith('来源：内置 · 前端（代码里保留的步骤）；开工建分支；')).toBe(true)
        expect(seen.logs.some(i => i.startsWith('内置工作流不能用，改用代码里的前端步骤：') && i.endsWith('workflows/test.json 读不到'))).toBe(true)
        expect(seen.toasts.some(i => i.includes('工作流'))).toBe(false)
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_A)
        await startFromPane(ui, STORY_B)
        expect(parseProgress(files[global.state] ?? '').taskList.map(i => i.workflow)).toEqual([undefined, undefined])
        expect(seen.copied[0]).toContain('worktree add --no-track -b feat/1000102')
        await ui.unmount()
    })

    test('/xiaoxiaoli role：不带参数回当前工种与可选项，带参数直接改（中文名或 id），认不出、取不到全局根目录都不写；用法里有 role', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { seen, files } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) } })
        expect((await runCommand($, 'role')).text).toBe('小小黎：工种：前端（没设，按前端）；本项目生效的工作流：内置 · 前端；可选 前端、后端、Python、测试、产品、其他，改用 /xiaoxiaoli role <工种>')
        expect((await runCommand($, 'role 运维')).text).toBe('小小黎：没改，工种只能是 前端、后端、Python、测试、产品、其他（或 frontend、backend、python、test、product、other）')
        expect(seen.written).toEqual([])
        expect((await runCommand($, 'role backend')).text).toBe(
            `小小黎：已改，工种：后端，从下一条新开工的条目起按内置 · 后端的工作流，进行中的条目不受影响（写入 ${PROFILE_PATH}）`
        )
        /* 0.8.0 起默认档案还记着 tour: done，只改工种时原样保留 */
        expect(JSON.parse(files[PROFILE_PATH] ?? '')).toEqual({ version: 1, skipped: true, tour: 'done', role: 'backend' })
        expect((await runCommand($, 'nonsense')).text).toContain(' · role <工种> 设工种（前端、后端、Python、测试、产品、其他）')
        await callWorkflow($, { action: 'set', scope: 'project', definition: MINI })
        expect((await runCommand($, 'role 产品')).text).toContain('工种：产品（本项目生效的仍是项目自定义工作流，它优先于内置）')
    })

    test('/xiaoxiaoli role 取不到全局根目录：不写，如实说', async ($, on) => {
        const { seen } = await boot($, on, { globalRoot: null })
        expect((await runCommand($, 'role 后端')).text).toBe(`小小黎：没改，${NO_GLOBAL_ROOT_TEXT}，工种存不了，没有写入`)
        expect(seen.written).toEqual([])
    })

    test('setup 工具带 role：只给工种、名字与工种一起给、工种认不出；结果写明工种从哪条起生效', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { files } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) }, profile: null })
        expect((await callSetup($, { role: '运维' })).deny).toBe('小小黎：参数不对，工种只能是 前端、后端、Python、测试、产品、其他（或 frontend、backend、python、test、product、other），没有写入')
        expect(String((await callSetup($, { role: 'test' })).result)).toBe(
            `工种：测试，从下一条新开工的条目起按内置 · 测试的工作流，进行中的条目不受影响（已写入 ${PROFILE_PATH}）`
        )
        expect(JSON.parse(files[PROFILE_PATH] ?? '')).toEqual({ version: 1, role: 'test' })
        const both = await callSetup($, { name: '小美', role: '后端' })
        expect(String(both.result)).toBe(
            `工作台现在叫 小美AI工作台；工种：后端，从下一条新开工的条目起按内置 · 后端的工作流，进行中的条目不受影响（已写入 ${PROFILE_PATH}；面板标题、提示前缀与 TAPD 评论署名已换成新名字）`
        )
        expect(JSON.parse(files[PROFILE_PATH] ?? '')).toEqual({ version: 1, name: '小美', role: 'backend' })
        expect(String((await callWorkflow($, { action: 'get' })).result).startsWith('来源：内置 · 后端（')).toBe(true)
    })
})

describe('0.7.0：通用配置与项目差异', () => {
    /** 主会话调一次项目工具（新工具不在生成的工具名清单里，按宽松的入参调） */
    const callProject = ($: Engine, args: Record<string, unknown>) => $.tool.call({ tool: 'mcp__xiaoxiaoli__project', ...args } as unknown as ToolCallArgs)
    const global = globalFilesOf(FG_ROOT)
    /** 本项目不用 TAPD 时 refresh 的回复 */
    const TAPD_OFF_REPLY = '小小黎：本项目记着不用 TAPD（systems.tapd 为 false），不列 TAPD 项目、不拉待办，进行中区照常；要用时对 AI 说「这个项目用 TAPD」'
    const configOf = (files: Record<string, string>) => JSON.parse(files[global.config] ?? '{}') as Record<string, unknown>

    test('开工消息与启动命令里的通用资料目录：两处一起给并说明项目的优先；三种启动命令都把开工提示放在 --add-dir 之前，各目录一个 --add-dir', () => {
        expect(resourceDirsText('D:/data', 'D:/shared')).toBe('通用资料目录 D:/shared，项目资料目录 D:/data（两处都有的以项目的为准）')
        expect(resourceDirsText('D:/data', '')).toBe('项目资料目录 D:/data')
        const tail = `${GLOBAL_GUIDE}；${workflowGuide('story')}；通用资料目录 D:/shared，项目资料目录 D:/data（两处都有的以项目的为准）；TAPD 评论署名 ——小小黎AI工作台`
        expect(submitText({ longId: STORY_A, dataDir: 'D:/data', sharedDir: 'D:/shared' })).toBe(`开工 ${STORY_A}（${tail}）`)
        expect(submitText({ longId: STORY_A, dataDir: '', sharedDir: 'D:/shared' })).toBe(`开工 ${STORY_A}`)
        const worktree = 'D:/work/demo-1000102'
        const prompt = startPrompt({ longId: STORY_B, worktree, branch: 'feat/1000102', root: 'D:/work/demo', dataDir: 'D:/data', sharedDir: 'D:/shared' })
        expect(prompt).toBe(`开工 ${STORY_B}（独立会话：worktree ${worktree}，分支 feat/1000102；${tail}）`)
        expect(herePrompt({ longId: STORY_B, root: 'D:/work/demo', dataDir: 'D:/data', sharedDir: 'D:/shared' })).toBe(`开工 ${STORY_B}（独立会话：在项目目录 D:/work/demo，不建分支；${tail}）`)
        const plan = { root: 'D:/work/demo', worktree, branch: 'feat/1000102', base: 'origin/master', sessionId: SESSION_ID, id: '1000102', prompt: '开工 1', addDir: 'D:/data', sharedDir: 'D:/shared' }
        expect(newSessionCommand(plan).endsWith(`claude --session-id ${SESSION_ID} -n '1000102' '开工 1' --add-dir 'D:/data' --add-dir 'D:/shared' }`)).toBe(true)
        expect(newSessionCommand({ ...plan, root: '/home/dev/demo', worktree: '/home/dev/demo-1' }).endsWith(`-n '1000102' '开工 1' --add-dir 'D:/data' --add-dir 'D:/shared'; fi`)).toBe(true)
        expect(hereSessionCommand({ dir: 'D:/work/demo', sessionId: SESSION_ID, id: '1000102', prompt: '开工 1', addDir: 'D:/data', sharedDir: 'D:/shared' })).toBe(
            `Set-Location 'D:/work/demo'; claude --session-id ${SESSION_ID} -n '1000102' '开工 1' --add-dir 'D:/data' --add-dir 'D:/shared'`
        )
        expect(hereSessionCommand({ dir: '/home/dev/demo', sessionId: SESSION_ID, id: '1000102', prompt: '开工 1', addDir: '/home/data', sharedDir: "/home/it's" })).toBe(
            `cd '/home/dev/demo' && claude --session-id ${SESSION_ID} -n '1000102' '开工 1' --add-dir '/home/data' --add-dir '/home/it'\\''s'`
        )
        /* 项目内模式不给通用资料目录：只有原来那个 docs/xiaoli */
        expect(newSessionCommand({ ...plan, addDir: undefined, sharedDir: undefined }).match(/--add-dir/g)).toHaveLength(1)
    })

    test('displayName 规则：去首尾空白后 1 到 20 个字符、无控制字符；systems 只认键合格、值为布尔的项；读不懂当作没写', () => {
        expect(checkDisplayName('  演示前端  ')).toEqual({ name: '演示前端' })
        expect(checkDisplayName('一二三四五六七八九十一二三四五六七八九十')).toEqual({ name: '一二三四五六七八九十一二三四五六七八九十' })
        expect(checkDisplayName('一二三四五六七八九十一二三四五六七八九十甲')).toEqual({ reason: 'displayName 最多 20 个字符，现在是 21 个' })
        expect(checkDisplayName(' \t ')).toEqual({ reason: 'displayName 去掉首尾空白后不能为空（要清掉显示名就传空字符串）' })
        expect(checkDisplayName('甲\n乙')).toEqual({ reason: 'displayName 不能含换行、制表等控制字符' })
        expect(checkDisplayName(1)).toEqual({ reason: 'displayName 要是文字' })
        const extras = parseProjectExtras(JSON.stringify({ displayName: ' 演示 ', systems: { tapd: false, yuque: true, Bad: true, figma: 'no', 'my-ci': false } }))
        expect(extras).toEqual({ displayName: '演示', systems: { tapd: false, yuque: true, 'my-ci': false } })
        expect(parseProjectExtras(JSON.stringify({ displayName: '甲\n乙', systems: [] }))).toEqual({ displayName: '', systems: {} })
        expect(parseProjectExtras('{oops')).toEqual({ displayName: '', systems: {} })
        expect(systemsText({})).toBe('没记（没写的系统都按用到处理）')
        expect(systemsText({ tapd: false, yuque: true })).toBe('tapd 不用、yuque 用')
    })

    test('project 工具 set 的参数与写回：至少给一项；systems 要是对象、键合格、值为布尔或 null；与已有的合并，null 去键，清空后去掉整项，别的字段原样保留', () => {
        expect(toProjectChange({})).toBe('displayName 与 systems 至少给一个')
        expect(toProjectChange({ displayName: '' })).toEqual({ displayName: '' })
        expect(toProjectChange({ displayName: ' 演示 ' })).toEqual({ displayName: '演示' })
        expect(toProjectChange({ systems: 'x' })).toBe('systems 要是对象，如 { "tapd": false, "yuque": true }')
        expect(toProjectChange({ systems: { Bad: true } })).toBe('systems 的键「Bad」要是小写字母开头、只含小写字母、数字与 - 的文字，最多 32 个字符')
        expect(toProjectChange({ systems: { tapd: 'no' } })).toBe('systems.tapd 只能是 true（用）、false（不用）或 null（去掉，回到没说）')
        expect(toProjectChange({ systems: { tapd: null, yuque: false } })).toEqual({ systems: { tapd: null, yuque: false } })
        const old = JSON.stringify({ projectName: '演示项目', tapdWorkspaceId: WS, branchBase: 'origin/dev', systems: { figma: true, tapd: false } })
        expect(JSON.parse(projectConfigText(old, { displayName: '演示', systems: { tapd: null, yuque: false } }))).toEqual({
            projectName: '演示项目',
            tapdWorkspaceId: WS,
            branchBase: 'origin/dev',
            systems: { figma: true, yuque: false },
            displayName: '演示'
        })
        expect(JSON.parse(projectConfigText(JSON.stringify({ displayName: '演示', systems: { figma: true } }), { displayName: '', systems: { figma: null } }))).toEqual({})
        expect(projectConfigText('', { systems: { yuque: false } })).toBe('{\n  "systems": {\n    "yuque": false\n  }\n}\n')
    })

    test('只有新字段的全局配置不算已绑定、也不算配置不完整；绑定写回保留它们并把 tapd 改回 true，解绑也保留', () => {
        const extrasOnly = JSON.stringify({ displayName: '演示前端', systems: { yuque: false } })
        expect(parseConfig(extrasOnly)).toBeNull()
        const bound = JSON.parse(bindConfigText(JSON.stringify({ displayName: '演示前端', systems: { tapd: false, yuque: false } }), { projectName: '演示项目', tapdWorkspaceId: WS, root: FG_ROOT }))
        expect(bound).toEqual({ projectName: '演示项目', tapdWorkspaceId: WS, root: FG_ROOT, displayName: '演示前端', systems: { tapd: true, yuque: false } })
        expect(JSON.parse(unbindConfigText(JSON.stringify(bound)))).toEqual({ root: FG_ROOT, displayName: '演示前端', systems: { tapd: true, yuque: false } })
    })

    test('概况文字：显示名与目录名、TAPD、用到的系统、两处资料目录与文件在不在、工作流、工作台与工种；没绑、不用 TAPD、项目内模式各有说法', () => {
        const base = {
            isRepoMode: false,
            dir: FG_ROOT,
            dirName: 'fg-demo',
            configPath: global.config,
            displayName: '',
            tapd: null,
            systems: { tapd: false },
            shared: { path: SHARED, existList: [{ file: 'resources.md', isExist: true }, { file: 'secrets.env', isExist: false }] },
            data: { path: global.dir, existList: [{ file: 'resources.md', isExist: false }, { file: 'secrets.env', isExist: false }] },
            workflowLabel: '内置 · 测试',
            fullName: '小小黎AI工作台',
            role: { title: '测试', isDefault: false }
        }
        expect(projectSummaryText(base).split('\n')).toEqual([
            '项目：fg-demo（没设显示名，用目录名）',
            `项目目录：${FG_ROOT}`,
            `项目配置：${global.config}`,
            'TAPD：没绑；本项目记着不用 TAPD（systems.tapd 为 false），面板不列 TAPD 项目、不拉待办',
            '用到的系统：tapd 不用',
            `通用资料目录：${SHARED}（resources.md 有，secrets.env 没有）`,
            `项目资料目录：${global.dir}（resources.md 没有，secrets.env 没有）；两处都有的以项目的为准`,
            '工作流：内置 · 测试',
            '工作台：小小黎AI工作台；工种：测试'
        ])
        const repo = projectSummaryText({ ...base, isRepoMode: true, systems: {}, data: null, shared: null, tapd: { name: '演示项目', id: WS } })
        expect(repo).toContain('TAPD：已绑「演示项目」（90000001）\n用到的系统：项目内模式不支持显示名与 systems')
        expect(repo).toContain('通用资料目录：取不到用户目录，没有\n项目资料目录：项目内模式没有（流程与资料按项目内文档）')
    })

    test('面板：设了显示名时标题行用它（没绑定与已绑定都是），确认行里指仓库目录的地方仍用目录名；只有新字段的配置照常显示绑定列表、不报不完整', async ($, on) => {
        const files = { [global.config]: JSON.stringify({ displayName: '演示前端', systems: { yuque: false } }) }
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files })
        await clock.advance(1)
        const ui = await mountPane($)
        const texts = await textsOf(ui)
        expect(texts[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · 演示前端 `)).toBe(true)
        expect(texts).toContain(NO_BINDING_TEXT)
        expect(texts).not.toContain(NO_CONFIG_TEXT)
        expect(seen.calls.map(i => i.tool)).toEqual(['get_user_participant_projects'])
        expect(String((await callBind($, { project: '演示项目' })).result)).not.toContain('改回用')
        await clock.advance(1)
        expect((await textsOf(ui))[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · 演示前端 `)).toBe(true)
        await click(ui, 3, await rowOf(ui, ACTION_SCOPE))
        /* 全部项目视图照旧写「全部项目（n 个）」，不用显示名 */
        expect((await textsOf(ui))[HEADER_ROW]).toContain('· 全部项目（')
        await click(ui, 5, await rowOf(ui, `todo:${BUG_A}`))
        /* 指仓库目录的地方仍用目录名，不用显示名 */
        expect((await textsOf(ui)).some(i => i.includes('属于「演示项目二」，将在当前仓库（fg-demo）开工'))).toBe(true)
        await ui.unmount()
    })

    test('本项目不用 TAPD（systems.tapd 为 false）且没绑定：不列 TAPD 项目、不调 TAPD，待办区两行说明，refresh 如实说；绑定后自动改回 true 并拉待办', async ($, on) => {
        const files = { [global.config]: JSON.stringify({ systems: { tapd: false, yuque: true } }) }
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files })
        expect(seen.deferredTools).toContain('bind')
        await clock.advance(1)
        const ui = await mountPane($)
        const texts = await textsOf(ui)
        expect(texts).toContain(TAPD_OFF_LINES[0])
        expect(texts).toContain(TAPD_OFF_LINES[1])
        expect(texts).not.toContain(NO_BINDING_TEXT)
        expect(texts[HEADER_ROW]?.endsWith('[ 刷新 ]')).toBe(true)
        expect((await linesOf(ui)).some(i => i.action?.startsWith('bind:'))).toBe(false)
        expect((await runCommand($, 'refresh')).text).toBe(TAPD_OFF_REPLY)
        expect(seen.calls).toEqual([])
        const bound = await callBind($, { project: '演示项目' })
        expect(String(bound.result)).toBe(`已把本项目（fg-demo）绑定到 TAPD 项目「演示项目」（${WS}），写入 ${global.config}；本项目原来记着不用 TAPD，已改回用；面板马上刷新待办`)
        expect(configOf(files).systems).toEqual({ tapd: true, yuque: true })
        await clock.advance(1)
        expect(await rowOf(ui, `todo:${STORY_A}`)).toBeGreaterThan(0)
        expect(await textsOf(ui)).not.toContain(TAPD_OFF_LINES[0])
        await ui.unmount()
    })

    test('已绑定但改成不用 TAPD：不再拉待办，待办区换成说明；用 project 工具去掉 tapd 后恢复拉待办；进行中区与进度工具照常', async ($, on) => {
        const files = { [global.config]: JSON.stringify({ ...GLOBAL_CONFIG, systems: { tapd: false } }), [global.state]: stringifyState([demoStory()]) }
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files })
        await clock.advance(1)
        const ui = await mountPane($)
        expect(seen.calls.filter(i => i.tool === 'get_todo')).toHaveLength(0)
        expect(await textsOf(ui)).toContain(TAPD_OFF_LINES[0])
        expect(await textsOf(ui)).toContain('需 9990001 演示-商家端-示例模块')
        expect(String((await callProgress($, { id: '9990001', step: 'unit', status: 'doing' })).result)).toContain('第 7 步 单测中')
        const restored = await callProject($, { action: 'set', systems: { tapd: null } })
        expect(String(restored.result)).toBe(`已更新本项目配置（${global.config}）：显示名没设（用目录名 fg-demo）；用到的系统：没记（没写的系统都按用到处理）；面板恢复拉 TAPD`)
        expect(configOf(files).systems).toBeUndefined()
        await clock.advance(1)
        expect(seen.calls.filter(i => i.tool === 'get_todo').length).toBeGreaterThan(0)
        expect(await rowOf(ui, `todo:${STORY_A}`)).toBeGreaterThan(0)
        const off = await callProject($, { action: 'set', systems: { tapd: false } })
        expect(String(off.result)).toContain('；本项目不用 TAPD，面板不列 TAPD 项目、不拉待办（还绑着「演示项目」，绑定没动）')
        await clock.advance(1)
        expect(await textsOf(ui)).toContain(TAPD_OFF_LINES[0])
        await ui.unmount()
    })

    test('project 工具 get 与 /xiaoxiaoli project：一次给全概况，资料文件只看在不在、不读内容；工具注册了但放在 ToolSearch 后面', async ($, on) => {
        const files = {
            [global.config]: JSON.stringify({ ...GLOBAL_CONFIG, displayName: '演示前端', systems: { yuque: false, figma: true } }),
            [`${SHARED}/resources.md`]: '通用资料（演示）',
            [`${global.dir}/secrets.env`]: 'DEMO=1'
        }
        const { seen } = await boot($, on, { cwd: FG_ROOT, files })
        expect(seen.tools).toContain('project')
        expect(seen.deferredTools).toContain('project')
        const expected = [
            '项目：演示前端（目录名 fg-demo）',
            `项目目录：${FG_ROOT}`,
            `项目配置：${global.config}`,
            `TAPD：已绑「演示项目」（${WS}）`,
            '用到的系统：yuque 不用、figma 用',
            `通用资料目录：${SHARED}（resources.md 有，secrets.env 没有）`,
            `项目资料目录：${global.dir}（resources.md 没有，secrets.env 有）；两处都有的以项目的为准`,
            '工作流：内置 · 前端',
            '工作台：小小黎AI工作台；工种：前端（没设，按前端）',
            /* 0.8.0 起概况末尾多一行体检与演练（默认档案记着演练已走过，这里没有 env.json） */
            '体检与演练：还没体检过；演练已走过（输入 /xiaoxiaoli tour 可以再走一遍，顺带重新体检）'
        ].join('\n')
        expect(String((await callProject($, { action: 'get' })).result)).toBe(expected)
        expect((await runCommand($, 'project')).text).toBe(`小小黎：本项目概况\n${expected}`)
        expect(seen.reads.filter(i => /\/(resources\.md|secrets\.env)$/.test(i))).toEqual([])
        expect((await runCommand($, 'nonsense')).text).toContain(' · project 看本项目的配置概况（显示名、TAPD、用到的系统、资料目录）')
    })

    test('project 工具 set：改显示名与 systems（合并、null 去键），写回保留别的字段，面板标题马上换；传空字符串清掉显示名', async ($, on) => {
        const files = { [global.config]: JSON.stringify({ ...GLOBAL_CONFIG, branchBase: 'origin/dev', systems: { figma: true } }) }
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files })
        await clock.advance(1)
        const ui = await mountPane($)
        const set = await callProject($, { action: 'set', displayName: '  演示前端  ', systems: { yuque: false, sentry: true } })
        expect(String(set.result)).toBe(`已更新本项目配置（${global.config}）：显示名「演示前端」；用到的系统：figma 用、yuque 不用、sentry 用`)
        expect(configOf(files)).toEqual({ ...GLOBAL_CONFIG, branchBase: 'origin/dev', systems: { figma: true, yuque: false, sentry: true }, displayName: '演示前端' })
        expect((await textsOf(ui))[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · 演示前端 `)).toBe(true)
        const cleared = await callProject($, { action: 'set', displayName: '', systems: { figma: null } })
        expect(String(cleared.result)).toBe(`已更新本项目配置（${global.config}）：显示名没设（用目录名 fg-demo）；用到的系统：yuque 不用、sentry 用`)
        expect(configOf(files)).toEqual({ ...GLOBAL_CONFIG, branchBase: 'origin/dev', systems: { yuque: false, sentry: true } })
        expect((await textsOf(ui))[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · 演示项目 `)).toBe(true)
        expect(seen.written).toEqual([global.config, global.config])
        await ui.unmount()
    })

    test('project 工具 set 的失败：参数不对、写文件失败都如实拒绝，不写入', async ($, on) => {
        const { seen } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) }, writeDenied: true })
        const deny = async (args: Record<string, unknown>) => (await callProject($, { action: 'set', ...args })).deny
        expect(await deny({})).toBe('小小黎：参数不对，displayName 与 systems 至少给一个，没有写入')
        expect(await deny({ displayName: '一二三四五六七八九十一二三四五六七八九十甲' })).toBe('小小黎：参数不对，displayName 最多 20 个字符，现在是 21 个，没有写入')
        expect(await deny({ displayName: '甲\n乙' })).toBe('小小黎：参数不对，displayName 不能含换行、制表等控制字符，没有写入')
        expect(await deny({ systems: { Bad: true } })).toBe('小小黎：参数不对，systems 的键「Bad」要是小写字母开头、只含小写字母、数字与 - 的文字，最多 32 个字符，没有写入')
        expect(await deny({ systems: { tapd: 'no' } })).toBe('小小黎：参数不对，systems.tapd 只能是 true（用）、false（不用）或 null（去掉，回到没说），没有写入')
        expect((await callProject($, { action: 'del' })).deny).toBe('小小黎：参数不对，action 只能是 get、set，没有写入')
        const failed = String(await deny({ displayName: '演示前端' }))
        expect(failed.startsWith(`小小黎：写 ${global.config} 失败（`)).toBe(true)
        expect(failed.endsWith('），没有写入')).toBe(true)
        expect(seen.written).toEqual([])
    })

    test('项目内模式：显示名与 systems 不支持，set 如实拒绝、不往项目仓库写；get 照常给概况并说明；项目内配置里写了 displayName 也不认', async ($, on) => {
        const files = { [CONFIG_FILE]: JSON.stringify({ ...CONFIG, displayName: '不认的名字', systems: { tapd: false } }) }
        const { clock, seen } = await boot($, on, { files })
        expect((await callProject($, { action: 'set', displayName: '演示' })).deny).toBe(
            `小小黎：本项目用项目内配置 ${CONFIG_FILE}，显示名与 systems 只存在全局项目目录，项目内模式不支持，没有写入`
        )
        const summary = String((await callProject($, { action: 'get' })).result)
        expect(summary).toContain('项目：demo（没设显示名，用目录名）')
        expect(summary).toContain('用到的系统：项目内模式不支持显示名与 systems')
        expect(summary).toContain('项目资料目录：项目内模式没有（流程与资料按项目内文档）')
        expect(summary).toContain('工作流：项目内模式（沿用前端步骤，流程按项目内文档）')
        await clock.advance(1)
        const ui = await mountPane($)
        expect((await textsOf(ui))[HEADER_ROW]?.startsWith(`${BOARD_TITLE_SPACED} · 演示项目 `)).toBe(true)
        expect(await rowOf(ui, `todo:${STORY_A}`)).toBeGreaterThan(0)
        expect(seen.written).toEqual([])
        await ui.unmount()
    })

    test('取不到全局根目录：set 如实拒绝；get 说明通用资料目录没有', async ($, on) => {
        const { seen } = await boot($, on, { globalRoot: null })
        expect((await callProject($, { action: 'set', systems: { yuque: false } })).deny).toBe(`小小黎：${NO_GLOBAL_ROOT_TEXT}，没有写入`)
        expect(String((await callProject($, { action: 'get' })).result)).toContain('通用资料目录：取不到用户目录，没有')
        expect(seen.written).toEqual([])
    })

    test('解绑保留显示名与 systems', async ($, on) => {
        const files = { [global.config]: JSON.stringify({ ...GLOBAL_CONFIG, displayName: '演示前端', systems: { yuque: false } }) }
        await boot($, on, { cwd: FG_ROOT, files })
        expect((await runCommand($, 'unbind')).text?.startsWith('小小黎：已解除本项目（fg-demo）')).toBe(true)
        expect(configOf(files)).toEqual({ displayName: '演示前端', systems: { yuque: false } })
    })

    test('生成新会话命令前确保通用资料目录在：不在就写一份说明用途的 README.md（不碰 resources.md、secrets.env），已在就不写', async ($, on) => {
        const { clock, seen, files } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) } })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_A)
        expect(seen.written).toEqual([global.state])
        await startFromPane(ui, STORY_B)
        expect(seen.written).toEqual([global.state, `${SHARED}/README.md`, global.state])
        expect(files[`${SHARED}/README.md`]).toBe(SHARED_README_TEXT)
        expect(SHARED_README_TEXT).toContain('小小黎AI工作台 mod 不读这两个文件的内容')
        expect(seen.copied[0]).toContain(`--add-dir '${SHARED}'`)
        await ui.unmount()
    })

    test('通用资料目录已在：新会话命令照样带上它，不再写说明文件', async ($, on) => {
        const files = { [global.config]: JSON.stringify(GLOBAL_CONFIG), [`${SHARED}/resources.md`]: '通用资料（演示）' }
        const { clock, seen } = await boot($, on, { cwd: FG_ROOT, files })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_A)
        await startFromPane(ui, STORY_B)
        expect(seen.written).toEqual([global.state, global.state])
        expect(seen.copied[0]).toContain(`--add-dir '${global.dir}' --add-dir '${SHARED}'`)
        expect(seen.reads.filter(i => i.endsWith('resources.md'))).toEqual([])
        await ui.unmount()
    })
})

describe('0.8.0：体检与演练', () => {
    const PROFILE_PATH = `${GLOBAL_ROOT}/profile.json`
    const ENV_PATH = `${GLOBAL_ROOT}/env.json`
    /** 引导两行加一行空行 */
    const GUIDE_ROWS = 3
    /** 主会话调一次演练工具（新工具不在生成的工具名清单里，按宽松的入参调） */
    const callGuide = ($: Engine, args: Record<string, unknown>) => $.tool.call({ tool: 'mcp__xiaoxiaoli__guide', ...args } as unknown as ToolCallArgs)
    /** 逐字副本读出来的依赖清单与演练脚本 */
    const depsOf = () => {
        const parsed = parseDeps(GUIDE_TEXTS.deps)
        if (!('depList' in parsed)) throw new Error(parsed.reason)
        return parsed.depList
    }
    const tourOf = () => {
        const parsed = parseTour(GUIDE_TEXTS.tour)
        if (!('tour' in parsed)) throw new Error(parsed.reason)
        return parsed.tour
    }
    /** 内置工作流的定义 */
    const builtinOf = (role: WorkRole) => {
        const parsed = parseWorkflow(BUILTIN_WORKFLOW_TEXTS[role])
        if (!('workflow' in parsed)) throw new Error(role)
        return parsed.workflow
    }
    /** 起了名、没有演练记录的档案（老用户） */
    const NAMED = JSON.stringify({ version: 1, name: '小美' })
    const NOW_ISO = new Date(NOW).toISOString()
    /** 先 clock.advance(1) 再写的时间 */
    const AFTER_ISO = new Date(NOW + 1).toISOString()

    test('两份文件的读取：逐字副本都能用；读不到、不是 JSON、不是对象、版本更新或不对、缺 items 都给原因；格式不对的项与重复 id 跳过，roles 没写为全部工种', () => {
        const depList = depsOf()
        expect(depList.map(i => i.id)).toEqual(['tapd', 'li-yuque-skills', 'chrome-devtools', 'figma', 'context7', 'git', 'node', 'uv'])
        expect(depList[0]).toEqual({
            id: 'tapd',
            kind: 'mcp',
            title: 'TAPD',
            use: '拉待办、读需求与缺陷、流转状态、发评论',
            detect: '会话里有 mcp__tapd__ 开头的工具（服务器名必须是 tapd）',
            install: 'claude mcp add tapd -e TAPD_ACCESS_TOKEN=<令牌> -- uvx mcp-server-tapd',
            account: '需要 TAPD 个人访问令牌，在 TAPD 的个人设置里申请',
            roles: [...WORK_ROLES]
        })
        expect(depList.find(i => i.id === 'git')?.install).toBeUndefined()
        const tour = tourOf()
        expect([tour.rules.length, tour.check.length, tour.features.length, tour.finish.length]).toEqual([6, 5, 5, 3])
        expect(tour.steps['other:execute']).toBe('一句话说明：按对齐稿做，做的过程中发现和对齐稿不一致会先停下来问。')
        expect(tour.fallback.startsWith('一句话说明这一步真实使用时做什么')).toBe(true)
        expect(parseDeps('')).toEqual({ reason: '读不到' })
        expect(parseDeps('{')).toEqual({ reason: '不是合法 JSON' })
        expect(parseDeps('[]')).toEqual({ reason: '要是一个 JSON 对象' })
        expect(parseDeps('{"version":2,"items":[]}')).toEqual({ reason: 'version 2 比本 mod 认识的新（1），先更新 mod' })
        expect(parseDeps('{"version":1}')).toEqual({ reason: '缺少 items 数组' })
        expect(parseTour('')).toEqual({ reason: '读不到' })
        expect(parseTour('{"version":"1"}')).toEqual({ reason: 'version 要是 1' })
        const item = (patch: Record<string, unknown>) => ({ id: 'a', kind: 'mcp', title: '甲', use: '用', detect: '查', ...patch })
        const loose = parseDeps(
            JSON.stringify({
                items: [item({}), item({ title: '重复' }), item({ id: 'B' }), item({ id: 'c', kind: 'app' }), item({ id: 'd', title: ' ' }), item({ id: 'e', install: 3, roles: ['test', 'ops'] }), 'x']
            })
        )
        expect(loose).toEqual({
            depList: [
                { id: 'a', kind: 'mcp', title: '甲', use: '用', detect: '查', roles: [...WORK_ROLES] },
                { id: 'e', kind: 'mcp', title: '甲', use: '用', detect: '查', roles: ['test'] }
            ],
            skippedCount: 5
        })
        expect(parseTour(JSON.stringify({ rules: ['甲', 3, ' '], steps: { x: '乙', y: 1 }, features: '不是数组' }))).toEqual({
            tour: { rules: ['甲'], check: [], steps: { x: '乙' }, fallback: '一句话说明这一步真实使用时做什么；问用户这一步需要事先准备什么数据或工具，记进资料。', features: [], finish: [] }
        })
    })

    test('按工种筛依赖；演练文字与工作流配对：先「<工作流 id>:<步骤键>」再「<步骤键>」，都没有用 fallback；六个内置工作流的每一步都有自己的演练文字', () => {
        const depList = depsOf()
        const idsOf = (role: WorkRole) => depsOfRole(depList, role).map(i => i.id)
        expect(idsOf('frontend')).toEqual(['tapd', 'li-yuque-skills', 'chrome-devtools', 'figma', 'context7', 'git', 'node', 'uv'])
        expect(idsOf('backend')).toEqual(['tapd', 'li-yuque-skills', 'context7', 'git', 'node', 'uv'])
        expect(idsOf('test')).toEqual(['tapd', 'li-yuque-skills', 'chrome-devtools', 'node', 'uv'])
        expect(idsOf('product')).toEqual(['tapd', 'li-yuque-skills', 'chrome-devtools', 'figma', 'node', 'uv'])
        expect(idsOf('other')).toEqual(['tapd', 'li-yuque-skills', 'node', 'uv'])
        const tour = tourOf()
        const other = tourStepsOf(tour, 'other', builtinOf('other').story)
        expect(other.map(i => i.key)).toEqual(['fetch', 'sort', 'read', 'align', 'execute', 'check', 'tapd'])
        expect(other[4]).toEqual({ key: 'execute', title: '执行', what: '按对齐稿完成工作', guide: tour.steps['other:execute'] })
        /* 测试工作流的 execute 没有 test:execute，用通用的 execute */
        expect(tourStepsOf(tour, 'test', builtinOf('test').story).find(i => i.key === 'execute')?.guide).toBe(tour.steps.execute)
        expect(stepGuideOf(tour, 'project', 'deploy')).toBe(tour.fallback)
        expect(stepGuideOf(tour, 'other', 'fetch')).toBe(tour.steps.fetch)
        expect(WORK_ROLES.every(role => tourStepsOf(tour, role, builtinOf(role).story).every(i => i.guide !== tour.fallback))).toBe(true)
        /* 代码里的前端步骤没有 what */
        expect(tourStepsOf(tour, 'frontend', FALLBACK_WORKFLOW.story)[0]).toEqual({ key: 'fetch', title: '拉取 TAPD', what: '', guide: tour.steps.fetch })
    })

    test('演练脚本：开头写演示条目与进度、演练工具、资料目录、工种与工作流；接着总规则 → 体检（含本工种依赖）→ 走流程 → 功能点 → 收尾 → 本项目概况；依赖清单不能用时说明跳过体检', () => {
        const tour = tourOf()
        const options = {
            tour,
            deps: { depList: depsOfRole(depsOf(), 'test'), skippedCount: 0 },
            roleTitle: '测试',
            workflowLabel: '内置 · 测试',
            stepList: tourStepsOf(tour, 'test', builtinOf('test').story),
            sharedDir: SHARED,
            dataDir: 'D:/data/demo',
            overview: '项目：演示'
        }
        const script = tourScript(options)
        const order = ['演练脚本：', '\n\n总规则\n', '\n\n第一部分 体检\n', '\n\n第二部分 走流程（共 11 个环节，按顺序）\n', '\n\n第三部分 功能点', '\n\n收尾\n', '\n\n本项目概况\n']
        const indexList = order.map(i => script.indexOf(i))
        expect(indexList.every((n, i) => n >= 0 && (i === 0 || n > (indexList[i - 1] ?? 0)))).toBe(true)
        expect(script).toContain(`演示条目：ID demo，面板进行中区的「${DEMO_TITLE}」，已记到本会话。进入一个环节时调 mcp__xiaoxiaoli__progress（id 传 demo，step 传步骤键，status 传 doing）`)
        expect(script).toContain('最后一个环节（tapd）做完传 status=done（工具还没加载时先用 ToolSearch 查 select:mcp__xiaoxiaoli__progress）')
        expect(script).toContain('演练工具就是 mcp__xiaoxiaoli__guide：体检做完传 action=check 与 results')
        expect(script).toContain(`各项目通用的记进通用资料目录 ${SHARED}；只属于本项目的记进项目资料目录 D:/data/demo；两处都有的以项目的为准`)
        expect(script).toContain('工种：测试；工作流：内置 · 测试（走流程共 11 个环节）。')
        expect(script).toContain(`总规则\n1. ${tour.rules[0]}`)
        expect(script).toContain(`第一部分 体检\n1. ${tour.check[0]}`)
        expect(script).toContain('依赖清单（测试用得到的 5 项）：')
        expect(script).toContain(
            '- tapd（MCP）TAPD：拉待办、读需求与缺陷、流转状态、发评论；检测：会话里有 mcp__tapd__ 开头的工具（服务器名必须是 tapd）；安装：claude mcp add tapd -e TAPD_ACCESS_TOKEN=<令牌> -- uvx mcp-server-tapd；账号：需要 TAPD 个人访问令牌，在 TAPD 的个人设置里申请'
        )
        expect(script).toContain('- node（命令行工具）Node.js：运行 npx 安装和启动上面的 MCP 与 skill；检测：运行 node --version 有输出；安装：清单里没写')
        expect(script).not.toContain('- figma（')
        expect(script).toContain(`7. execute 执行测试\n   真实使用：在浏览器或接口上逐条执行用例，记结果与截图\n   演练：${tour.steps.execute}`)
        expect(script).toContain(`第三部分 功能点（走完流程后逐条指给用户看）\n1. ${tour.features[0]}`)
        expect(script).toContain(`收尾\n1. ${tour.finish[0]}`)
        expect(script.endsWith('本项目概况\n项目：演示')).toBe(true)
        const skipped = tourScript({ ...options, deps: { reason: '不是合法 JSON' }, sharedDir: '', dataDir: '' })
        expect(skipped).toContain('依赖清单 guide/deps.json 不能用（不是合法 JSON），这次跳过体检，不调 check，直接进入第二部分')
        expect(skipped).toContain('取不到用户目录，没有通用资料目录；本项目是项目内模式，只属于本项目的按项目内文档约定的位置记')
        expect(tourScript({ ...options, deps: { depList: [], skippedCount: 2 } })).toContain('依赖清单里没有测试用得到的项（清单里有 2 项格式不对，已跳过），这次跳过体检，不调 check')
    })

    test('guide 工具参数与体检结果：action 只认三种，check 要 results 对象（也认 JSON 文字）；不认识的 id、值不对的丢掉；env.json 宽松读、整份换掉 results、别的字段保留；按工种算缺项', () => {
        const depList = depsOf()
        expect(toGuideInput({ action: 'start' })).toEqual({ action: 'start' })
        expect(toGuideInput({ action: 'go' })).toBe('action 只能是 start、check、finish')
        expect(toGuideInput({ action: 'check' })).toBe('check 要给 results 对象，如 { "tapd": "ok", "figma": "missing" }')
        expect(toGuideInput({ action: 'check', results: '{"tapd":"ok"}' })).toEqual({ action: 'check', results: { tapd: 'ok' } })
        expect(toGuideInput({ action: 'finish', summary: 3 })).toBe('summary 要是文字')
        expect(toGuideInput({ action: 'finish' })).toEqual({ action: 'finish' })
        expect(toGuideInput({ action: 'finish', summary: '好' })).toEqual({ action: 'finish', summary: '好' })
        const checked = toCheckResults({ tapd: 'ok', figma: 'missing', 'li-yuque-skills': 'skipped', git: 'yes', foo: 'ok' }, depList)
        expect(checked).toEqual({ results: { tapd: 'ok', figma: 'missing', 'li-yuque-skills': 'skipped' }, unknownList: ['foo'], invalidList: ['git'] })
        expect(checkReplyText('D:/e/env.json', checked, depList)).toBe(
            '已记下体检结果（写入 D:/e/env.json）：就绪 1 项；缺 1 项（Figma）；跳过 1 项（语雀）；不认识的 id 已丢掉：foo；值不对的已丢掉（只能是 ok、missing、skipped）：git'
        )
        expect(checkReplyText('/e', { results: { tapd: 'ok' }, unknownList: [], invalidList: [] }, depList)).toBe('已记下体检结果（写入 /e）：就绪 1 项；没有缺的')
        expect(parseEnv('')).toEqual({ checkedAt: '', results: {}, isNewer: false })
        expect(parseEnv('{"version":2}')).toEqual({ checkedAt: '', results: {}, isNewer: true })
        expect(parseEnv(JSON.stringify({ version: 1, checkedAt: UPDATED, results: { tapd: 'ok', figma: 'bad' } }))).toEqual({ checkedAt: UPDATED, results: { tapd: 'ok' }, isNewer: false })
        const text = envText(JSON.stringify({ version: 1, checkedAt: 'old', results: { git: 'ok' }, note: '保留' }), { checkedAt: UPDATED, results: { tapd: 'missing' } })
        expect(JSON.parse(text)).toEqual({ version: 1, note: '保留', checkedAt: UPDATED, results: { tapd: 'missing' } })
        const record = parseEnv(envText('', { checkedAt: UPDATED, results: { tapd: 'missing', figma: 'missing', 'li-yuque-skills': 'skipped', git: 'ok' } }))
        expect(envStateOf(depsOfRole(depList, 'test'), record)).toEqual({ checkedAt: UPDATED, missingList: ['TAPD'], skippedList: ['语雀'] })
        expect(envStateOf(depsOfRole(depList, 'frontend'), record)).toEqual({ checkedAt: UPDATED, missingList: ['TAPD', 'Figma'], skippedList: ['语雀'] })
        expect(envStateOf(null, record)).toEqual({ checkedAt: UPDATED, missingList: ['tapd', 'figma'], skippedList: ['li-yuque-skills'] })
        expect(envStateOf(depList, parseEnv(''))).toBeNull()
    })

    test('档案里的演练：只认 done、declined；记演练时写 tour 与 tourAt（小结存 tourSummary，超长截断，没带去掉旧的），别的字段保留；该不该出演练引导', () => {
        expect(parseProfile('{"version":1,"name":"小美","tour":"done"}').tour).toBe('done')
        expect(parseProfile('{"version":1,"skipped":true,"tour":"declined"}').tour).toBe('declined')
        expect('tour' in parseProfile('{"version":1,"skipped":true,"tour":"maybe"}')).toBe(false)
        const old = JSON.stringify({ version: 1, name: '小美', role: 'test', tourSummary: '旧的', theme: 'dark' })
        expect(JSON.parse(profileText(old, { tour: 'declined', tourAt: UPDATED }))).toEqual({ version: 1, name: '小美', role: 'test', theme: 'dark', tour: 'declined', tourAt: UPDATED })
        expect((JSON.parse(profileText(old, { tour: 'done', tourAt: UPDATED, summary: ' 都就绪 ' })) as { tourSummary: string }).tourSummary).toBe('都就绪')
        expect([...(JSON.parse(profileText('', { tour: 'done', tourAt: UPDATED, summary: '字'.repeat(600) })) as { tourSummary: string }).tourSummary]).toHaveLength(500)
        /* 起名、改工种时演练记录原样保留 */
        const toured = JSON.stringify({ version: 1, skipped: true, tour: 'done' })
        expect(JSON.parse(profileText(toured, { name: '小美' }))).toEqual({ version: 1, name: '小美', tour: 'done' })
        expect(JSON.parse(profileText(toured, { role: 'backend' }))).toEqual({ version: 1, skipped: true, tour: 'done', role: 'backend' })
        const base: ProfileStateType = { name: '', isSkipped: false, isNewer: false, isGuided: false, role: '', path: PROFILE_PATH }
        expect(isTourPending(base)).toBe(true)
        /* 还没起名时先出起名引导，演练引导不同时出 */
        expect(isTourOffered(base)).toBe(false)
        expect(isTourOffered({ ...base, isSkipped: true })).toBe(true)
        expect(isTourOffered({ ...base, name: '小美' })).toBe(true)
        expect(isTourOffered({ ...base, name: '小美', tour: 'done' })).toBe(false)
        expect(isTourOffered({ ...base, name: '小美', tour: 'declined' })).toBe(false)
        expect(isTourPending({ ...base, path: '' })).toBe(false)
        expect(isTourPending({ ...base, isNewer: true })).toBe(false)
    })

    test('设置引导多一步演练：保存那条末尾加「（下一条除外）」，再用 AskUserQuestion 问「现在走」「以后再说」；不问时与 0.7.0 相同；/xiaoxiaoli tour 那段话', () => {
        const plain = setupPrompt({ name: '', isUnbound: false, projectName: 'demo' })
        const lineList = setupPrompt({ name: '', isUnbound: false, projectName: 'demo', isTourOffered: true }).split('\n')
        expect(lineList).toHaveLength(6)
        expect(lineList[3]?.endsWith('然后用一两句话告诉我结果，不要做别的事（下一条除外）')).toBe(true)
        expect(lineList[4]?.startsWith('4. 保存成功后，再用 AskUserQuestion 问我要不要花几分钟走一遍演练')).toBe(true)
        expect(lineList[4]).toContain('不建分支、不提交、不改 TAPD')
        expect(lineList[4]).toContain('选项给「现在走」「以后再说」')
        expect(lineList[4]).toContain('选「现在走」就调 mcp__xiaoxiaoli__guide，action 传 start（工具还没加载时先用 ToolSearch 查 select:mcp__xiaoxiaoli__guide）')
        expect(lineList[4]).toContain('选「以后再说」就告诉我以后输入 /xiaoxiaoli tour 可以再来')
        expect(lineList[5]).toBe(plain.split('\n')[4]?.replace(/^4\./, '5.'))
        expect(plain.split('\n')).toHaveLength(5)
        expect(plain).not.toContain('mcp__xiaoxiaoli__guide')
        const tour = tourPrompt().split('\n')
        expect(tour[0]).toBe('走一遍演练（来自工作台面板的「走一遍演练」或 /xiaoxiaoli tour），按下面做：')
        expect(tour[1]?.startsWith('1. 调 mcp__xiaoxiaoli__guide，action 传 start')).toBe(true)
        expect(tour[2]).toContain('调 mcp__xiaoxiaoli__guide（action 传 finish）收尾，告诉我以后输入 /xiaoxiaoli tour 可以再来')
    })

    test('面板：起了名（或先不设）、演练还没处理过时引导位置出「走一遍演练」「不用了」两行；和起名引导不同时出；沉浸时、进行中区有演示条目时不出', () => {
        const lineList = buildBoard(boardInput({ isTourOffered: true }), 60)
        const start = lineText(lineList[1] as BoardLineType)
        const skip = lineText(lineList[2] as BoardLineType)
        expect([lineList[1]?.action, lineList[2]?.action]).toEqual([ACTION_TOUR_START, ACTION_TOUR_SKIP])
        expect(start.startsWith(TOUR_GUIDE_TEXT) && start.endsWith(TOUR_START_TEXT)).toBe(true)
        expect(skip.startsWith(TOUR_SKIP_HINT_TEXT) && skip.endsWith(TOUR_SKIP_TEXT)).toBe(true)
        expect([start, skip].map(displayWidth)).toEqual([58, 58])
        expect(lineList[3]?.action).toBeUndefined()
        expect(lineList[HEADER_ROW + GUIDE_ROWS]?.action).toBe(ACTION_REFRESH)
        const both = buildBoard(boardInput({ isSetupPending: true, isTourOffered: true }), 60)
        expect(both.slice(1, 3).map(i => i.action)).toEqual([ACTION_SETUP_START, ACTION_SETUP_SKIP])
        expect(both.some(i => i.action === ACTION_TOUR_START)).toBe(false)
        const focus = buildBoard(boardInput({ isTourOffered: true, isFocus: true }), 60)
        expect(focus.some(i => i.action === ACTION_TOUR_START || i.action === ACTION_TOUR_SKIP)).toBe(false)
        expect(focus[HEADER_ROW]?.action).toBe(ACTION_REFRESH)
        const running = buildBoard(boardInput({ isTourOffered: true, progress: progressOf(newDemoTask({ updatedAt: UPDATED, sessionId: SESSION_ID })) }), 60)
        expect(running.some(i => i.action === ACTION_TOUR_START)).toBe(false)
        expect(running[HEADER_ROW]?.action).toBe(ACTION_REFRESH)
        const unbound = buildBoard(boardInput({ config: null, workplace: { ...WORKPLACE, mode: 'global' }, isTourOffered: true }), 60)
        expect(unbound.slice(1, 3).map(i => i.action)).toEqual([ACTION_TOUR_START, ACTION_TOUR_SKIP])
        const narrow = buildBoard(boardInput({ isTourOffered: true }), 24)
        expect(lineText(narrow[1] as BoardLineType).endsWith(TOUR_START_TEXT)).toBe(true)
        expect(lineText(narrow[2] as BoardLineType).endsWith(TOUR_SKIP_TEXT)).toBe(true)
        expect(narrow.every(i => displayWidth(i.segList.map(seg => seg.text).join('')) <= 23)).toBe(true)
    })

    test('面板与状态行里的演示条目：类型标的位置标「演」、不显示 ID；状态行写「演练」；体检有缺项时标题行下面多一行不可点的说明，没缺的、沉浸时不出', () => {
        const demo = setStep(newDemoTask({ updatedAt: UPDATED, sessionId: SESSION_ID }), { key: 'fetch', status: 'doing', updatedAt: UPDATED })
        const texts = buildBoard(boardInput({ progress: progressOf(demo) }), 60).map(lineText)
        expect(texts.some(i => i.startsWith(`演 ${DEMO_TITLE}`))).toBe(true)
        expect(texts.some(i => i.includes(' demo '))).toBe(false)
        const folded = buildBoard(boardInput({ progress: progressOf({ ...demo, sessionId: OTHER_SESSION }) }), 60).map(lineText)
        expect(folded.some(i => i.startsWith(`演 ${DEMO_TITLE} · 拉取 TAPD`))).toBe(true)
        expect(statusText([demo], SESSION_ID, true)).toBe('小小黎 · 演练 第 1 步 拉取 TAPD 中')
        const env = { checkedAt: UPDATED, missingList: ['Figma', '三方库文档'], skippedList: ['语雀'] }
        const withEnv = buildBoard(boardInput({ env }), 60)
        const envLine = lineText(withEnv[HEADER_ROW + 1] as BoardLineType)
        expect(envLine.startsWith('环境：缺 2 项（Figma、三方库文档）')).toBe(true)
        expect(envLine.endsWith(ENV_HINT_TEXT)).toBe(true)
        expect(displayWidth(envLine)).toBe(58)
        expect(withEnv[HEADER_ROW + 1]?.action).toBeUndefined()
        expect(/^-+$/.test(lineText(withEnv[HEADER_ROW + 2] as BoardLineType))).toBe(true)
        expect(/^-+$/.test(lineText(buildBoard(boardInput({ env: { ...env, missingList: [] } }), 60)[HEADER_ROW + 1] as BoardLineType))).toBe(true)
        expect(buildBoard(boardInput({ env, isFocus: true }), 60).map(lineText).some(i => i.startsWith('环境：'))).toBe(false)
        const off = buildBoard(boardInput({ env, workplace: { ...WORKPLACE, mode: 'global', systems: { tapd: false } } }), 60)
        expect(lineText(off[HEADER_ROW + 1] as BoardLineType).startsWith('环境：缺 2 项')).toBe(true)
    })

    test('演示条目不算手上有活、不和待办对应：分流照常在本会话开工；findTask、findStepTask 与开工态都不认它（下面挂了真实任务也不认）；进度工具只放宽 demo，不能新建它；写回读回不变', () => {
        const demo = newDemoTask({ updatedAt: UPDATED, sessionId: SESSION_ID })
        const route = { id: '1000101', workspaceId: WS, sessionId: SESSION_ID, isMainCheckout: true, isBusy: false }
        expect(routeStart({ ...route, taskList: [demo] })).toBe('submit')
        expect(routeStart({ ...route, taskList: [demo, storyTask('1000102', '演示需求乙', 'develop', { sessionId: SESSION_ID })] })).toBe('new')
        const [withTask] = progressSteps([demo], [{ id: 'demo', step: 'read', taskId: '1000101', taskTitle: '真实需求', taskStatus: 'doing' }])
        if (withTask === undefined) throw new Error('demo')
        expect(findTask([withTask], 'demo')).toBeUndefined()
        expect(findStepTask([withTask], '1000101', WS)).toBeUndefined()
        expect(startStateOf(todo(longId(WS, 1000101), 'High'), [withTask])).toBe('waiting')
        expect(typeof toProgressInput({ id: 'demo' })).toBe('object')
        expect(['demo2', 'DEMO', ''].map(id => toProgressInput({ id }))).toEqual(['demo2', 'DEMO', ''].map(() => 'id 要填需求或缺陷的 TAPD 短 ID（纯数字）'))
        const input = toProgressInput({ id: 'demo', title: '自己建', step: 'fetch', status: 'doing' })
        if (typeof input === 'string') throw new Error(input)
        expect(applyProgress([], input, { updatedAt: UPDATED, sessionId: SESSION_ID })).toBe('state.json 里没有演示条目 demo，要先调 mcp__xiaoxiaoli__guide（action 传 start）建')
        expect(demo).toEqual({ id: 'demo', kind: 'story', title: DEMO_TITLE, steps: STORY_STEPS.map(i => ({ key: i.key, title: i.title, status: 'todo' })), waiting: null, updatedAt: UPDATED, sessionId: SESSION_ID })
        const testDemo = newDemoTask({ flow: flowOf({ workflow: builtinOf('test'), id: 'test' }, 'story'), updatedAt: UPDATED, sessionId: '' })
        expect(testDemo.workflow).toBe('test')
        expect(testDemo.sessionId).toBeUndefined()
        expect(testDemo.steps.map(i => i.key)).toEqual(builtinOf('test').story.map(i => i.key))
        expect(parseProgress(stringifyState([demo, testDemo])).taskList).toEqual([demo, testDemo])
    })

    test('guide start：放演示条目（测试工种的 11 步、全部未开始、记到本会话），返回脚本含各部分与本项目概况；面板上出「演」那条、演练引导收起；推进后再 start 会重置', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const profile = JSON.stringify({ version: 1, name: '小美', role: 'test' })
        const { clock, seen, files } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) }, profile })
        /* 演练还没处理过：演练工具放进工具列表 */
        expect(seen.tools).toContain('guide')
        expect(seen.deferredTools).not.toContain('guide')
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await rowOf(ui, ACTION_TOUR_START)).toBe(HEADER_ROW)
        const result = String((await callGuide($, { action: 'start' })).result)
        const [demo] = parseProgress(files[global.state] ?? '').taskList
        expect(demo?.id).toBe('demo')
        expect(demo?.title).toBe(DEMO_TITLE)
        expect(demo?.sessionId).toBe(SESSION_ID)
        expect(demo?.workflow).toBe('test')
        expect(demo?.steps.map(i => i.key)).toEqual(builtinOf('test').story.map(i => i.key))
        expect(demo?.steps.every(i => i.status === 'todo')).toBe(true)
        expect(result.startsWith('演练脚本：照着走')).toBe(true)
        expect(result).toContain('工种：测试；工作流：内置 · 测试（走流程共 11 个环节）。')
        expect(result).toContain('依赖清单（测试用得到的 5 项）：')
        expect(result).toContain('7. execute 执行测试')
        expect(result).toContain(`各项目通用的记进通用资料目录 ${SHARED}；只属于本项目的记进项目资料目录 ${global.dir}`)
        expect(result).toContain('本项目概况\n项目：fg-demo（没设显示名，用目录名）')
        expect(result).toContain('体检与演练：还没体检过；演练还没走')
        expect(seen.statuses.at(-1)).toBe('小美 · 演练 第 1 步 拉取 TAPD')
        expect((await textsOf(ui)).some(i => i.startsWith(`演 ${DEMO_TITLE}`))).toBe(true)
        expect(await rowOf(ui, ACTION_TOUR_START)).toBe(-1)
        await callProgress($, { id: 'demo', step: 'read', status: 'doing' })
        expect(parseProgress(files[global.state] ?? '').taskList[0]?.steps[2]?.status).toBe('doing')
        await callGuide($, { action: 'start' })
        const again = parseProgress(files[global.state] ?? '').taskList
        expect(again).toHaveLength(1)
        expect(again[0]?.steps.every(i => i.status === 'todo')).toBe(true)
        await ui.unmount()
    })

    test('演练中途点真实待办开工：演示条目不算手上有活，照常在本会话发出「开工 <ID>」、另建条目；伪造的开工消息开不了演示条目', async ($, on) => {
        const { clock, seen, files } = await boot($, on)
        await callGuide($, { action: 'start' })
        await clock.advance(1)
        const ui = await mountPane($)
        await startFromPane(ui, STORY_A)
        expect(seen.submitted).toEqual([{ text: `开工 ${STORY_A}`, asUser: true }])
        expect(seen.copied).toEqual([])
        expect(parseProgress(files[STATE_FILE] ?? '').taskList.map(i => i.id)).toEqual(['demo', '1000101'])
        await ui.post({ type: 'row', action: 'todo:demo' }, { in: 'board' })
        await ui.post({ type: 'row', action: 'start:demo' }, { in: 'board' })
        expect(seen.submitted).toHaveLength(1)
        expect(seen.copied).toEqual([])
        await ui.unmount()
    })

    test('进度工具推进演示条目：id 传 demo 照常推进与设等待，面板标「等你」；还没 start 时不能新建 demo', async ($, on) => {
        const { clock, files } = await boot($, on)
        expect((await callProgress($, { id: 'demo', title: '自己建', step: 'fetch', status: 'doing' })).deny).toBe(
            '小小黎：state.json 里没有演示条目 demo，要先调 mcp__xiaoxiaoli__guide（action 传 start）建，没有写入'
        )
        expect(files[STATE_FILE]).toBeUndefined()
        await callGuide($, { action: 'start' })
        expect(String((await callProgress($, { id: 'demo', step: 'align', status: 'doing', waiting: 'align' })).result)).toBe(`已更新 demo：第 5 步 对齐需求中（已写入 ${STATE_FILE}）`)
        expect(parseProgress(files[STATE_FILE] ?? '').taskList[0]?.waiting).toBe('align')
        await clock.advance(1)
        const ui = await mountPane($)
        expect((await textsOf(ui)).some(i => i.startsWith(`演 ${DEMO_TITLE}  等你：对齐稿`))).toBe(true)
        await ui.unmount()
    })

    test('guide check：按依赖清单整理后整份写进全局根目录的 env.json，丢掉不认识的 id 与值不对的；面板标题行下面出缺项，概况里有上次体检时间与缺的项；换工种后按新工种重算', async ($, on) => {
        const global = globalFilesOf(FG_ROOT)
        const { clock, files } = await boot($, on, { cwd: FG_ROOT, files: { [global.config]: JSON.stringify(GLOBAL_CONFIG) } })
        const results = { tapd: 'ok', figma: 'missing', context7: 'missing', 'li-yuque-skills': 'skipped', foo: 'ok', git: 'bad' }
        expect(String((await callGuide($, { action: 'check', results })).result)).toBe(
            `已记下体检结果（写入 ${ENV_PATH}）：就绪 1 项；缺 2 项（Figma、三方库文档）；跳过 1 项（语雀）；不认识的 id 已丢掉：foo；值不对的已丢掉（只能是 ok、missing、skipped）：git`
        )
        expect(JSON.parse(files[ENV_PATH] ?? '')).toEqual({ version: 1, checkedAt: NOW_ISO, results: { tapd: 'ok', figma: 'missing', context7: 'missing', 'li-yuque-skills': 'skipped' } })
        await clock.advance(1)
        const ui = await mountPane($)
        const texts = await textsOf(ui)
        expect(texts[HEADER_ROW + 1]?.startsWith('环境：缺 2 项（Figma、三方库文档）')).toBe(true)
        expect(texts[HEADER_ROW + 1]?.endsWith(ENV_HINT_TEXT)).toBe(true)
        expect((await linesOf(ui))[HEADER_ROW + 1]?.action).toBeUndefined()
        const checkedText = `${todayText(NOW)} ${clockText(NOW)}`
        expect((await runCommand($, 'project')).text).toContain(`\n体检与演练：上次体检 ${checkedText}，缺 Figma、三方库文档，跳过 语雀；演练已走过`)
        /* 测试工种用不到 Figma 与三方库文档 */
        await runCommand($, 'role test')
        expect((await textsOf(ui))[HEADER_ROW + 1]?.startsWith('环境')).toBe(false)
        expect((await runCommand($, 'project')).text).toContain(`\n体检与演练：上次体检 ${checkedText}，跳过 语雀；演练已走过`)
        await ui.unmount()
    })

    test('guide 工具的参数与结果不对：如实拒绝、不写入；env.json 版本比本 mod 新时不覆盖', async ($, on) => {
        const newer = JSON.stringify({ version: 2, checkedAt: 'x', results: {} })
        const { seen, files } = await boot($, on, { files: { [CONFIG_FILE]: JSON.stringify(CONFIG), [ENV_PATH]: newer } })
        expect((await callGuide($, { action: 'go' })).deny).toBe('小小黎：参数不对，action 只能是 start、check、finish，没有写入')
        expect((await callGuide($, { action: 'check' })).deny).toBe('小小黎：参数不对，check 要给 results 对象，如 { "tapd": "ok", "figma": "missing" }，没有写入')
        expect((await callGuide($, { action: 'check', results: { foo: 'ok', tapd: 'yes' } })).deny).toBe(
            '小小黎：results 里没有可记的结果（键要是依赖清单里的 id：tapd、li-yuque-skills、chrome-devtools、figma、context7、git、node、uv；值只能是 ok、missing、skipped），没有写入'
        )
        expect((await callGuide($, { action: 'finish', summary: 1 })).deny).toBe('小小黎：参数不对，summary 要是文字，没有写入')
        expect((await callGuide($, { action: 'check', results: { tapd: 'ok' } })).deny).toBe(`小小黎：${ENV_PATH} 是更新版本的 mod 写的，先更新 mod，没有写入`)
        expect(files[ENV_PATH]).toBe(newer)
        expect(seen.written).toEqual([])
    })

    test('依赖清单 guide/deps.json 不能用：start 照常、脚本里说明跳过体检；check 如实拒绝', async ($, on) => {
        const { seen } = await boot($, on, { guides: { deps: '{坏' } })
        expect(String((await callGuide($, { action: 'start' })).result)).toContain('依赖清单 guide/deps.json 不能用（不是合法 JSON），这次跳过体检，不调 check，直接进入第二部分')
        expect((await callGuide($, { action: 'check', results: { tapd: 'ok' } })).deny).toBe('小小黎：依赖清单 guide/deps.json 不能用（不是合法 JSON），体检结果对不上，没有写入')
        expect(seen.written).toEqual([STATE_FILE])
    })

    test('写文件失败：start 不建演示条目、check 不记，都如实拒绝并带原因', async ($, on) => {
        await boot($, on, { writeDenied: true })
        const start = String((await callGuide($, { action: 'start' })).deny)
        expect(start.startsWith(`小小黎：写 ${STATE_FILE} 失败（`)).toBe(true)
        expect(start.endsWith('），没有建演示条目')).toBe(true)
        const check = String((await callGuide($, { action: 'check', results: { tapd: 'ok' } })).deny)
        expect(check.startsWith(`小小黎：写 ${ENV_PATH} 失败（`)).toBe(true)
        expect(check.endsWith('），没有写入')).toBe(true)
    })

    test('取不到全局根目录：start 照常建演示条目；check 如实说存不了；finish 清掉演示条目、说明演练记不下，再 finish 时如实拒绝', async ($, on) => {
        const { files } = await boot($, on, { globalRoot: null })
        expect(String((await callGuide($, { action: 'start' })).result)).toContain('取不到用户目录，没有通用资料目录')
        expect(parseProgress(files[STATE_FILE] ?? '').taskList.map(i => i.id)).toEqual(['demo'])
        expect((await callGuide($, { action: 'check', results: { tapd: 'ok' } })).deny).toBe(`小小黎：${NO_GLOBAL_ROOT_TEXT}，体检结果存不了，没有写入`)
        expect(String((await callGuide($, { action: 'finish' })).result)).toBe(`已移除演示条目（写入 ${STATE_FILE}）；演练走过没记下：${NO_GLOBAL_ROOT_TEXT}`)
        expect(parseProgress(files[STATE_FILE] ?? '').taskList).toEqual([])
        expect((await callGuide($, { action: 'finish' })).deny).toBe(`小小黎：演练走过没记下：${NO_GLOBAL_ROOT_TEXT}，没有写入`)
    })

    test('guide finish：移除演示条目，在 profile.json 记 tour: done、tourAt 与小结（别的字段保留），面板演练引导不再出；没有演示条目也照样记', async ($, on) => {
        const { clock, files } = await boot($, on, { profile: JSON.stringify({ version: 1, name: '小美', theme: 'dark' }) })
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await rowOf(ui, ACTION_TOUR_START)).toBe(HEADER_ROW)
        await callGuide($, { action: 'start' })
        expect(String((await callGuide($, { action: 'finish', summary: '缺 Figma，其余就绪' })).result)).toBe(
            `已移除演示条目（写入 ${STATE_FILE}）；已记下演练走过与小结（写入 ${PROFILE_PATH}），面板上不再出演练引导`
        )
        expect(parseProgress(files[STATE_FILE] ?? '').taskList).toEqual([])
        expect(JSON.parse(files[PROFILE_PATH] ?? '')).toEqual({ version: 1, name: '小美', theme: 'dark', tour: 'done', tourAt: AFTER_ISO, tourSummary: '缺 Figma，其余就绪' })
        expect(await rowOf(ui, ACTION_TOUR_START)).toBe(-1)
        expect((await linesOf(ui))[HEADER_ROW]?.action).toBe(ACTION_REFRESH)
        expect(String((await callGuide($, { action: 'finish' })).result)).toBe(`已记下演练走过（写入 ${PROFILE_PATH}），面板上不再出演练引导`)
        expect((JSON.parse(files[PROFILE_PATH] ?? '') as { tourSummary?: string }).tourSummary).toBeUndefined()
        await ui.unmount()
    })

    test('面板「走一遍演练」以用户身份发出演练那段话（会话正忙时排队）；「不用了」记 tour: declined，两行消失，之后过时或伪造的按钮消息不写也不发', async ($, on) => {
        const { clock, seen, files } = await boot($, on, { profile: JSON.stringify({ version: 1, skipped: true }) })
        await clock.advance(1)
        const ui = await mountPane($)
        await click(ui, 5, await rowOf(ui, ACTION_TOUR_START))
        expect(seen.submitted).toEqual([{ text: tourPrompt(), asUser: true }])
        expect(seen.toasts.at(-1)).toBe('小小黎：已发出：走一遍演练')
        expect(seen.written).toEqual([])
        await $.turn.start({ text: '在忙', turnId: 't1' })
        await click(ui, 5, await rowOf(ui, ACTION_TOUR_START))
        expect(seen.toasts.at(-1)).toBe('小小黎：会话正忙，已排队：走一遍演练')
        await click(ui, 5, await rowOf(ui, ACTION_TOUR_SKIP))
        expect(JSON.parse(files[PROFILE_PATH] ?? '')).toEqual({ version: 1, skipped: true, tour: 'declined', tourAt: AFTER_ISO })
        expect(seen.toasts.at(-1)).toBe('小小黎：好的，不走演练，面板上不再提示；以后想走输入 /xiaoxiaoli tour')
        expect(await rowOf(ui, ACTION_TOUR_START)).toBe(-1)
        expect((await linesOf(ui))[HEADER_ROW]?.action).toBe(ACTION_REFRESH)
        await ui.post({ type: 'row', action: ACTION_TOUR_SKIP }, { in: 'board' })
        await ui.post({ type: 'row', action: ACTION_TOUR_START }, { in: 'board' })
        expect(seen.written).toEqual([PROFILE_PATH])
        expect(seen.submitted).toHaveLength(2)
        await ui.unmount()
    })

    test('/xiaoxiaoli tour：排到下一拍发出演练那段话（走过演练的也能再走）；带参数时提示不带；用法里有 tour', async ($, on) => {
        const { clock, seen } = await boot($, on)
        expect((await runCommand($, 'tour')).text).toBe('小小黎：已发出：走一遍演练')
        expect(seen.submitted).toEqual([])
        await clock.advance(1)
        expect(seen.submitted).toEqual([{ text: tourPrompt(), asUser: true }])
        expect((await runCommand($, 'tour 现在')).text).toBe('小小黎：tour 不带参数')
        expect((await runCommand($, 'nonsense')).text).toContain(' · tour 让 AI 带你走一遍演练（体检本机环境、按工作流模拟走一遍、讲功能点）')
        expect(seen.submitted).toHaveLength(1)
    })

    test('演练脚本 guide/tour.json 不能用：tour 命令、面板按钮与 start 都如实说不能用、不发不建；设置引导里不问演练', async ($, on) => {
        const { clock, seen, files } = await boot($, on, { profile: null, guides: { tour: '[]' } })
        const why = '演练脚本 guide/tour.json 不能用（要是一个 JSON 对象）'
        expect((await runCommand($, 'tour')).text).toBe(`小小黎：${why}，没有发起演练`)
        expect((await callGuide($, { action: 'start' })).deny).toBe(`小小黎：${why}，没有建演示条目`)
        expect((await runCommand($, 'setup')).text).toBe('小小黎：已发出：设置工作台')
        await clock.advance(1)
        expect(seen.submitted).toEqual([{ text: setupPrompt({ name: '', isUnbound: false, projectName: 'demo' }), asUser: true }])
        await runCommand($, 'name 小美')
        const ui = await mountPane($)
        await click(ui, 5, await rowOf(ui, ACTION_TOUR_START))
        expect(seen.toasts.at(-1)).toBe(`小美：${why}，没有发起演练`)
        expect(seen.submitted).toHaveLength(1)
        expect(files[STATE_FILE]).toBeUndefined()
        await ui.unmount()
    })

    test('老用户（起了名、没有演练记录）：演练工具放进工具列表，面板出一次演练引导，起名引导不出', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: NAMED })
        expect(seen.deferredTools).not.toContain('guide')
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await rowOf(ui, ACTION_TOUR_START)).toBe(HEADER_ROW)
        expect(await rowOf(ui, ACTION_TOUR_SKIP)).toBe(HEADER_ROW + 1)
        expect(await rowOf(ui, ACTION_SETUP_START)).toBe(-1)
        await ui.unmount()
    })

    test('选过「不用了」的档案：演练工具在 ToolSearch 后面，面板不出演练引导', async ($, on) => {
        const { clock, seen } = await boot($, on, { profile: JSON.stringify({ version: 1, name: '小美', tour: 'declined' }) })
        expect(seen.deferredTools).toContain('guide')
        await clock.advance(1)
        const ui = await mountPane($)
        expect(await rowOf(ui, ACTION_TOUR_START)).toBe(-1)
        expect((await linesOf(ui))[HEADER_ROW]?.action).toBe(ACTION_REFRESH)
        await ui.unmount()
    })

    test('概况里体检与演练那一行：没体检过、有缺有跳过、都就绪；演练三种情况', () => {
        const tail = '（输入 /xiaoxiaoli tour 可以再走一遍，顺带重新体检）'
        expect(guideSummaryText({ checkedText: '', missingList: [], skippedList: [], tour: '' })).toBe(`体检与演练：还没体检过；演练还没走${tail}`)
        expect(guideSummaryText({ checkedText: '2026-11-12 18:30', missingList: ['Figma'], skippedList: ['语雀'], tour: 'declined' })).toBe(
            `体检与演练：上次体检 2026-11-12 18:30，缺 Figma，跳过 语雀；演练选了不用${tail}`
        )
        expect(guideSummaryText({ checkedText: '2026-11-12 18:30', missingList: [], skippedList: [], tour: 'done' })).toBe(
            `体检与演练：上次体检 2026-11-12 18:30，本工种用得到的都就绪；演练已走过${tail}`
        )
    })
})

describe('0.9.0：自动更新', () => {
    const MOD = 'xiaoxiaoli'
    const TODAY = '2026-11-13'
    const [RAW_MANIFEST, MIRROR_MANIFEST] = sourceUrls(MOD, MANIFEST_FILE) as [string, string]
    const [RAW_CHANGELOG, MIRROR_CHANGELOG] = sourceUrls(MOD, CHANGELOG_FILE) as [string, string]
    const manifestOf = (version: string) => JSON.stringify({ name: MOD, version })
    const CHANGELOG = ['# 更新记录', '', '## 0.9.0（2026-11-13）', '', '- 插件市场安装', '- 每天自动更新', '', '## 0.8.0', '', '- 体检与演练'].join('\n')
    const NOTES = ['插件市场安装', '每天自动更新']
    /** 插件市场安装时的插件目录（Windows 写法） */
    const MARKET_ROOT = 'C:\\Users\\a\\.claude\\plugins\\cache\\xiaoli-mods\\xiaoxiaoli\\0.8.0'
    const OPTIONS = { subject: '工作台', from: '0.8.0', to: '0.9.0', noteList: NOTES }
    const MANUAL = 'claude plugin marketplace update xiaoli-mods，再运行 claude plugin update xiaoxiaoli@xiaoli-mods'
    const STEPS = [
        ['claude', 'plugin', 'marketplace', 'update', 'xiaoli-mods'],
        ['claude', 'plugin', 'update', 'xiaoxiaoli@xiaoli-mods']
    ]
    const ran = (stdout: string, exitCode = 0, stderr = ''): RunResultType => ({ exitCode, stdout, stderr })

    /** 造的外部世界：远端文件、会话忙不忙、锁、命令结果；记下流程做了什么 */
    interface FakeWorldType {
        root?: string
        stored?: unknown
        manifest?: string
        remote?: Record<string, string>
        /** 依次回答「忙不忙」，最后一个一直重复 */
        busyList?: boolean[]
        lock?: string
        reloadAt?: string
        run?: (argv: readonly string[]) => RunResultType | Error
        canReload?: boolean
        /** 每睡一次调一下，可在第几次时放锁 */
        onSleep?: (count: number, world: FakeWorldType) => void
    }
    const fake = (world: FakeWorldType = {}) => {
        const seen = { fetched: [] as string[], ran: [] as string[][], notices: [] as UpdateNoticeType[], written: [] as string[], locks: [] as (string | undefined)[], slept: 0, reloads: 0 }
        let now = 1000
        const ports: UpdatePortsType = {
            mod: MOD,
            subject: '工作台',
            root: world.root ?? MARKET_ROOT,
            today: TODAY,
            readCheckedDay: async () => world.stored,
            writeCheckedDay: async day => {
                seen.written.push(day)
            },
            readManifest: async () => world.manifest ?? manifestOf('0.8.0'),
            fetchText: async url => {
                seen.fetched.push(url)
                return world.remote?.[url] ?? null
            },
            isBusy: async () => {
                const list = world.busyList ?? [false]
                return (list.length > 1 ? list.shift() : list[0]) ?? false
            },
            readLock: async () => world.lock,
            writeLock: async value => {
                seen.locks.push(value)
                world.lock = value
            },
            readReloadAt: async () => world.reloadAt,
            writeReloadAt: async value => {
                world.reloadAt = value
            },
            now: async () => now,
            sleep: async ms => {
                seen.slept += 1
                now += ms
                world.onSleep?.(seen.slept, world)
            },
            run: async argv => {
                seen.ran.push([...argv])
                const result = world.run?.(argv) ?? ran('ok')
                if (result instanceof Error) throw result
                return result
            },
            canReload: async () => world.canReload ?? true,
            reload: async () => {
                seen.reloads += 1
            },
            notify: async notice => {
                seen.notices.push(notice)
            },
            log: () => undefined
        }
        return { ports, seen }
    }
    /** 远端主分支上是 0.9.0、带更新要点 */
    const NEWER = { [RAW_MANIFEST]: manifestOf('0.9.0'), [RAW_CHANGELOG]: CHANGELOG }

    test('版本比较只认正式版本：0.10.0 比 0.9.0 大；可带 v 前缀；格式不对、预发布、前导零都不认，不认的不算新版', () => {
        expect(parseVersion('0.9.0')).toEqual([0, 9, 0])
        expect(parseVersion(' v1.2.3 ')).toEqual([1, 2, 3])
        expect(['0.9', '0.9.0.1', '0.9.0-beta.1', '0.9.0+build', '01.2.3', 'x.y.z', '', 'vv1.0.0'].map(parseVersion)).toEqual([null, null, null, null, null, null, null, null])
        expect(parseVersion(9)).toBeNull()
        expect(compareVersion('0.10.0', '0.9.0')).toBeGreaterThan(0)
        expect(compareVersion('0.9.0', '0.10.0')).toBeLessThan(0)
        expect(compareVersion('v0.9.0', '0.9.0')).toBe(0)
        expect(compareVersion('1.0.0', '0.99.99')).toBeGreaterThan(0)
        expect(compareVersion('0.9', '0.8.0')).toBeNull()
        expect([isNewer('0.10.0', '0.9.0'), isNewer('0.9.0', '0.9.0'), isNewer('0.8.9', '0.9.0'), isNewer('1.0.0-rc.1', '0.9.0'), isNewer('0.9.1', 'abc')]).toEqual([true, false, false, false, false])
        expect(manifestVersion(manifestOf(' 0.9.0 '))).toBe('0.9.0')
        expect([manifestVersion('不是 JSON'), manifestVersion('[]'), manifestVersion('{"version":9}'), manifestVersion('{}')]).toEqual([null, null, null, null])
    })

    test('从 CHANGELOG 截出新版本那一节的要点：有这一节取前几条、到下一节为止；没有这一节、文字为空都是空的', () => {
        expect(changelogNotes(CHANGELOG, '0.9.0')).toEqual(NOTES)
        expect(changelogNotes(CHANGELOG, '0.8.0')).toEqual(['体检与演练'])
        expect(changelogNotes(CHANGELOG, '0.7.0')).toEqual([])
        expect(changelogNotes('', '0.9.0')).toEqual([])
        expect(changelogNotes('## [v0.9.0] - 2026-11-13\r\n* 甲\r\n- 乙\r\n  - 丙\r\n## 0.8.0\r\n- 丁', '0.9.0')).toEqual(['甲', '乙', '丙'])
        expect(changelogNotes(['## 0.9.0', '- 1', '- 2', '- 3', '- 4', '- 5', '- 6'].join('\n'), '0.9.0')).toEqual(['1', '2', '3', '4', '5'])
        expect(changelogNotes('## 0.9.0', '0.9.0', 2)).toEqual([])
        /* 提示是纯文字：去掉行内代码的反引号与加粗 */
        expect(changelogNotes('## 0.9.0\n- 装 `xiaoxiaoli@xiaoli-mods`，**马上**生效', '0.9.0')).toEqual(['装 xiaoxiaoli@xiaoli-mods，马上生效'])
        /* 0.9.0 不会误配到 0.9.01 或 10.9.0 */
        expect(changelogNotes('## 10.9.0\n- 错\n## 0.9.01\n- 也错', '0.9.0')).toEqual([])
    })

    test('判断安装方式：插件目录在 <插件根>/cache/<市场名>/<mod>/<版本> 下为插件市场安装（市场名取自路径），其余为本地目录加载', () => {
        expect(installOf(MARKET_ROOT, MOD)).toEqual({ kind: 'market', marketplace: 'xiaoli-mods' })
        expect(installOf('/home/a/.claude/plugins/cache/xiaoli-mods/xiaoxiaoli/0.9.0/', MOD)).toEqual({ kind: 'market', marketplace: 'xiaoli-mods' })
        expect(installOf('D:/custom-plugins/cache/my-fork/xiaoxiaoli/0.9.0', MOD)).toEqual({ kind: 'market', marketplace: 'my-fork' })
        expect(installOf('D:\\Demo\\xiaoli-mods\\mods\\xiaoxiaoli', MOD)).toEqual({ kind: 'local' })
        expect(installOf('C:\\Users\\a\\.claude\\plugins\\cache\\xiaoli-mods\\xiaoke\\0.5.0', MOD)).toEqual({ kind: 'local' })
        expect(installOf('C:/Users/a/.claude/plugins/cache/xiaoli-mods/xiaoxiaoli', MOD)).toEqual({ kind: 'local' })
        expect(installOf('C:/x/plugins/cache/bad name/xiaoxiaoli/0.9.0', MOD)).toEqual({ kind: 'local' })
        expect([isCheckedToday(TODAY, TODAY), isCheckedToday('2026-11-12', TODAY), isCheckedToday(undefined, TODAY), isCheckedToday(20261113, TODAY)]).toEqual([true, false, false, false])
        expect([isHeldByOther(undefined, MOD), isHeldByOther('', MOD), isHeldByOther(MOD, MOD), isHeldByOther('xiaoke', MOD)]).toEqual([false, false, false, true])
    })

    test('两个地址只含仓库、分支、mod 名与文件名；更新命令先刷新市场再更新插件；Windows 上起不来时改经 cmd /c；失败原因取最后一行', () => {
        expect(sourceUrls(MOD, MANIFEST_FILE)).toEqual([
            'https://raw.githubusercontent.com/xiaoli1999/xiaoli-mods/master/mods/xiaoxiaoli/.claude-plugin/plugin.json',
            'https://cdn.jsdelivr.net/gh/xiaoli1999/xiaoli-mods@master/mods/xiaoxiaoli/.claude-plugin/plugin.json'
        ])
        expect(updateSteps(MOD, 'xiaoli-mods')).toEqual(STEPS)
        expect(updateCommandText(MOD, 'xiaoli-mods')).toBe(MANUAL)
        expect(argvCandidates(STEPS[1] as string[], true)).toEqual([STEPS[1], ['cmd', '/c', ...(STEPS[1] as string[])]])
        expect(argvCandidates(STEPS[1] as string[], false)).toEqual([STEPS[1]])
        expect(failureReason(ran('Checking for updates…\nFailed to update plugin "xiaoxiaoli@xiaoli-mods"', 1))).toBe('Failed to update plugin "xiaoxiaoli@xiaoli-mods"')
        expect(failureReason(ran('stdout 里的', 1, 'error: network down\n'))).toBe('error: network down')
        expect(failureReason(ran('', 2))).toBe('退出码 2')
        expect(failureReason(ran('', 1, 'x'.repeat(200)))).toBe(`${'x'.repeat(160)}..`)
    })

    test('提示文字：成功说从哪个版本到哪个、要点与怎么生效（发起了重载时说正在重新加载）；失败给原因与手动命令；本地目录加载说 git pull', () => {
        expect(updatedNotice(OPTIONS, true)).toEqual({
            toast: '工作台已从 0.8.0 更新到 0.9.0（更新要点见对话里的记录）；正在重新加载插件，马上生效；没生效就输入 /reload-plugins，或下次开会话自动生效',
            log: '工作台已从 0.8.0 更新到 0.9.0，更新要点：\n- 插件市场安装\n- 每天自动更新\n正在重新加载插件，马上生效；没生效就输入 /reload-plugins，或下次开会话自动生效'
        })
        expect(updatedNotice({ ...OPTIONS, noteList: [] }, false)).toEqual({
            toast: '工作台已从 0.8.0 更新到 0.9.0；输入 /reload-plugins 立即生效，或下次开会话自动生效',
            log: '工作台已从 0.8.0 更新到 0.9.0\n输入 /reload-plugins 立即生效，或下次开会话自动生效'
        })
        expect(failedNotice(OPTIONS, '退出码 1', MANUAL).toast).toBe(`工作台发现新版 0.9.0（当前 0.8.0），自动更新没成功（退出码 1）；不影响继续使用，可以手动运行 ${MANUAL}，下次开会话也会再试`)
        expect(localNotice(OPTIONS)).toEqual({
            toast: '工作台发现新版 0.9.0（当前 0.8.0）；本机是从本地目录加载的，不自动更新；到仓库目录运行 git pull 即可',
            log: '工作台发现新版 0.9.0（当前 0.8.0），更新要点：\n- 插件市场安装\n- 每天自动更新\n本机是从本地目录加载的，不自动更新；到仓库目录运行 git pull 即可'
        })
    })

    test('一天只查一次：今天成功查过就不取；不比自己新时记今天；取不到（两个地址都失败、版本号不对、读不到自己的版本）不记，下次开会话再试', async () => {
        const checked = fake({ stored: TODAY, remote: NEWER })
        expect(await runUpdateCheck(checked.ports)).toBe('checked-today')
        expect(checked.seen.fetched).toEqual([])
        const same = fake({ stored: '2026-11-12', remote: { [RAW_MANIFEST]: manifestOf('0.8.0') } })
        expect(await runUpdateCheck(same.ports)).toBe('up-to-date')
        expect(same.seen.written).toEqual([TODAY])
        expect(same.seen.fetched).toEqual([RAW_MANIFEST])
        expect(await runUpdateCheck(fake({ remote: { [RAW_MANIFEST]: manifestOf('0.7.9') } }).ports)).toBe('up-to-date')
        for (const remote of [{}, { [RAW_MANIFEST]: manifestOf('0.9') }, { [RAW_MANIFEST]: manifestOf('0.9.0-beta') }, { [RAW_MANIFEST]: '坏的' }]) {
            const failed = fake({ remote })
            expect(await runUpdateCheck(failed.ports)).toBe('fetch-failed')
            expect(failed.seen.written).toEqual([])
            expect(failed.seen.notices).toEqual([])
        }
        const noOwn = fake({ manifest: '', remote: NEWER })
        expect(await runUpdateCheck(noOwn.ports)).toBe('fetch-failed')
        expect(noOwn.seen.fetched).toEqual([])
    })

    test('两个地址的回退：原始地址取不到再取镜像，版本与更新要点都一样；更新要点取不到只说版本号', async () => {
        const mirror = fake({ root: 'D:\\Demo\\xiaoli-mods\\mods\\xiaoxiaoli', remote: { [MIRROR_MANIFEST]: manifestOf('0.9.0'), [MIRROR_CHANGELOG]: CHANGELOG } })
        expect(await runUpdateCheck(mirror.ports)).toBe('local-notified')
        expect(mirror.seen.fetched).toEqual([RAW_MANIFEST, MIRROR_MANIFEST, RAW_CHANGELOG, MIRROR_CHANGELOG])
        expect(mirror.seen.notices).toEqual([localNotice(OPTIONS)])
        const noNotes = fake({ root: 'D:\\Demo\\xiaoli-mods\\mods\\xiaoxiaoli', remote: { [RAW_MANIFEST]: manifestOf('0.9.0') } })
        await runUpdateCheck(noNotes.ports)
        expect(noNotes.seen.notices).toEqual([localNotice({ ...OPTIONS, noteList: [] })])
    })

    test('本地目录加载：有新版只提示 git pull，不运行任何命令、不发起重载，记今天', async () => {
        const local = fake({ root: 'D:\\Demo\\xiaoli-mods\\mods\\xiaoxiaoli', remote: NEWER })
        expect(await runUpdateCheck(local.ports)).toBe('local-notified')
        expect(local.seen.ran).toEqual([])
        expect(local.seen.reloads).toBe(0)
        expect(local.seen.written).toEqual([TODAY])
    })

    test('插件市场安装、更新成功：占锁后先刷新市场再更新插件，放锁；记今天，提示更新要点并发起一次 /reload-plugins', async () => {
        const market = fake({ remote: NEWER, run: argv => (argv[2] === 'update' ? ran('Checking for updates for plugin "xiaoxiaoli@xiaoli-mods"…\nRestart to apply changes.') : ran('ok')) })
        expect(await runUpdateCheck(market.ports)).toBe('updated')
        expect(market.seen.ran).toEqual(STEPS)
        expect(market.seen.locks).toEqual([MOD, undefined])
        expect(market.seen.written).toEqual([TODAY])
        expect(market.seen.notices).toEqual([updatedNotice(OPTIONS, true)])
        expect(market.seen.reloads).toBe(1)
        /* 引擎没有 /reload-plugins：提示自己输入，不发起 */
        const noReload = fake({ remote: NEWER, canReload: false })
        expect(await runUpdateCheck(noReload.ports)).toBe('updated')
        expect(noReload.seen.notices).toEqual([updatedNotice(OPTIONS, false)])
        expect(noReload.seen.reloads).toBe(0)
        /* 另一个 mod 在自己更新完之后已经发起过重载：不再发起，一次重载两个都生效 */
        const reloaded = fake({ remote: NEWER, reloadAt: '1000' })
        await runUpdateCheck(reloaded.ports)
        expect(reloaded.seen.reloads).toBe(0)
    })

    test('插件市场安装、更新失败：提示原因与手动命令，不记今天、不重载；说「已是最新」也算没更新上；锁照样放掉', async () => {
        const failed = fake({ remote: NEWER, run: argv => (argv[2] === 'update' ? ran('Checking…', 1, 'Failed to update plugin "xiaoxiaoli@xiaoli-mods": offline') : ran('ok')) })
        expect(await runUpdateCheck(failed.ports)).toBe('update-failed')
        expect(failed.seen.notices).toEqual([failedNotice(OPTIONS, 'Failed to update plugin "xiaoxiaoli@xiaoli-mods": offline', MANUAL)])
        expect(failed.seen.written).toEqual([])
        expect(failed.seen.reloads).toBe(0)
        expect(failed.seen.locks).toEqual([MOD, undefined])
        const refresh = fake({ remote: NEWER, run: argv => (argv[2] === 'marketplace' ? ran('', 1, 'git fetch failed') : ran('ok')) })
        expect(await runUpdateCheck(refresh.ports)).toBe('update-failed')
        expect(refresh.seen.ran).toEqual([STEPS[0]])
        const latest = fake({ remote: NEWER, run: () => ran('xiaoxiaoli is already at the latest version (0.8.0).') })
        expect(await runUpdateCheck(latest.ports)).toBe('update-failed')
        expect(latest.seen.notices).toEqual([failedNotice(OPTIONS, '插件市场的副本里还没有新版，稍后再试', MANUAL)])
        /* 同一天另一个会话刚更新过：说已是最新、版本就是远端的，算装上了 */
        const done = fake({ remote: NEWER, run: () => ran('xiaoxiaoli is already at the latest version (0.9.0).') })
        expect(await runUpdateCheck(done.ports)).toBe('updated')
        expect([latestIsInstalled('ok', '0.9.0'), latestIsInstalled('is already at the latest version.', '0.9.0'), latestIsInstalled('already at the latest version (0.10.0)', '0.9.0')]).toEqual([null, false, true])
    })

    test('Windows 上 claude 起不来（npm 装的 .cmd）：同一条命令改经 cmd /c 再试；macOS / Linux 不试，直接按失败', async () => {
        const isRaw = (argv: readonly string[]) => argv[0] === 'claude'
        const windows = fake({ remote: NEWER, run: argv => (isRaw(argv) ? new Error('spawn claude ENOENT') : ran('ok')) })
        expect(await runUpdateCheck(windows.ports)).toBe('updated')
        expect(windows.seen.ran).toEqual([STEPS[0], ['cmd', '/c', ...(STEPS[0] as string[])], STEPS[1], ['cmd', '/c', ...(STEPS[1] as string[])]])
        const posix = fake({ root: '/home/a/.claude/plugins/cache/xiaoli-mods/xiaoxiaoli/0.8.0', remote: NEWER, run: argv => (isRaw(argv) ? new Error('spawn claude ENOENT') : ran('ok')) })
        expect(await runUpdateCheck(posix.ports)).toBe('update-failed')
        expect(posix.seen.ran).toEqual([STEPS[0]])
        expect(posix.seen.notices[0]?.toast).toContain('自动更新没成功（spawn claude ENOENT）')
    })

    test('不在任务进行中更新：会话正忙时等到空闲再运行命令；另一个 mod 正在更新时等它放锁；一直等不到就这次不更新、不记今天', async () => {
        const busy = fake({ remote: NEWER, busyList: [true, true, false] })
        expect(await runUpdateCheck(busy.ports)).toBe('updated')
        expect(busy.seen.slept).toBe(2)
        const locked = fake({
            remote: NEWER,
            lock: 'xiaoke',
            onSleep: (count, world) => {
                if (count === 3) world.lock = undefined
            }
        })
        expect(await runUpdateCheck(locked.ports)).toBe('updated')
        expect(locked.seen.slept).toBe(3)
        expect(locked.seen.ran).toEqual(STEPS)
        const never = fake({ remote: NEWER, busyList: [true] })
        expect(await runUpdateCheck(never.ports)).toBe('gave-up')
        expect(never.seen.slept).toBe(WAIT_LIMIT)
        expect(never.seen.ran).toEqual([])
        expect(never.seen.written).toEqual([])
    })

    describe('经会话启动', () => {
        /** 记下自动更新发出的请求：地址与请求选项 */
        const watchFetch = (on: On, remote: Record<string, string>) => {
            const fetched: { url: string; init: unknown }[] = []
            on('http.fetch', (_$, e) => {
                fetched.push({ url: e.url, init: e.init })
                const text = remote[e.url]
                return text === undefined ? { deny: 'offline' } : { value: { status: 200, ok: true, headers: {}, text } }
            })
            return fetched
        }
        /** 自动更新这次检查的结果（调试日志里的一行） */
        const outcomeOf = (logs: readonly string[]) => logs.filter(i => /^自动更新：[a-z-]+$/.test(i))

        test('全新的交互式会话：启动后延后才查；请求只是两个公开地址的 GET、不带任何选项；本地目录加载有新版时提示 git pull、不运行命令', async ($, on) => {
            const fetched = watchFetch(on, NEWER)
            const ranList: unknown[] = []
            on('process.run', (_$, e) => {
                ranList.push(e.argv)
                return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
            })
            const { clock, seen } = await boot($, on, { manifest: manifestOf('0.8.0') })
            await clock.advance(CHECK_DELAY_MS - 10)
            expect(fetched).toEqual([])
            await clock.advance(10)
            expect(fetched).toEqual([
                { url: RAW_MANIFEST, init: undefined },
                { url: RAW_CHANGELOG, init: undefined }
            ])
            expect(seen.toasts).toContain(`小小黎：${localNotice(OPTIONS).toast}`)
            expect(seen.logs).toContain(`小小黎：${localNotice(OPTIONS).log}`)
            expect(outcomeOf(seen.logs)).toEqual(['自动更新：local-notified'])
            expect(ranList).toEqual([])
        })

        test('今天已经查过（$.store 里记着今天）：不发请求；不是今天的照常查', async ($, on) => {
            const fetched = watchFetch(on, { [RAW_MANIFEST]: manifestOf('0.8.0') })
            const { clock, seen } = await boot($, on, { manifest: manifestOf('0.8.0'), store: { updateCheckedDay: todayText(NOW) } })
            await clock.advance(CHECK_DELAY_MS)
            expect(fetched).toEqual([])
            expect(outcomeOf(seen.logs)).toEqual(['自动更新：checked-today'])
        })

        test('两个地址都取不到：不提示、不打扰，只记调试日志（不记今天，下次开会话再查）', async ($, on) => {
            const fetched = watchFetch(on, {})
            const { clock, seen } = await boot($, on, { manifest: manifestOf('0.8.0'), store: { updateCheckedDay: '2026-01-01' } })
            const toastCount = seen.toasts.length
            await clock.advance(CHECK_DELAY_MS)
            expect(fetched.map(i => i.url)).toEqual([RAW_MANIFEST, MIRROR_MANIFEST])
            expect(seen.toasts).toHaveLength(toastCount)
            expect(outcomeOf(seen.logs)).toEqual(['自动更新：fetch-failed'])
        })

        test('远端版本不比自己新：什么也不提示', async ($, on) => {
            watchFetch(on, { [RAW_MANIFEST]: manifestOf('0.8.0') })
            const { clock, seen } = await boot($, on, { manifest: manifestOf('0.8.0') })
            const toastCount = seen.toasts.length
            await clock.advance(CHECK_DELAY_MS)
            expect(seen.toasts).toHaveLength(toastCount)
            expect(outcomeOf(seen.logs)).toEqual(['自动更新：up-to-date'])
        })

        test('非交互式会话（-p、SDK）不查', async ($, on) => {
            const fetched = watchFetch(on, { [RAW_MANIFEST]: manifestOf('0.8.0') })
            const { clock } = await boot($, on, { manifest: manifestOf('0.8.0'), isInteractive: false })
            await clock.advance(CHECK_DELAY_MS * 2)
            expect(fetched).toEqual([])
        })

        test('热重载重跑 session.start：不再排一次检查', async ($, on) => {
            const fetched = watchFetch(on, { [RAW_MANIFEST]: manifestOf('0.8.0') })
            const { clock } = await boot($, on, { manifest: manifestOf('0.8.0') })
            await clock.advance(CHECK_DELAY_MS)
            expect(fetched).toHaveLength(1)
            await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
            await clock.advance(CHECK_DELAY_MS * 2)
            expect(fetched).toHaveLength(1)
        })
    })
})
