/**
 * @description 工作面板的状态契约：$.state 中每个值的类型，以及配置（含项目差异：显示名与用到的系统）、待办、进行中任务、开工命令、
 * 全局档案（起名、工种与演练）、工作流、体检依赖清单与演练脚本的形状
 * @author xiao li
 * @createDate 2026-10-21 17:40
 */

/** 待办视图：本项目或全部项目 */
export type TodoScope = 'project' | 'all'

/** 待办类型：需求、任务、缺陷 */
export type TodoKind = 'story' | 'task' | 'bug'

/** 等用户拍板的环节：对齐稿、看自测、批准改 TAPD */
export type WaitingKind = 'align' | 'review' | 'tapd'

/** 进行中条目的种类：需求（TAPD 需求与任务）走工作流的 story 组，缺陷走 bug 组 */
export type ProgressKind = 'story' | 'bug'

/**
 * 步骤键：取自工作流（小写字母开头，只含小写字母、数字与 -）。旧的前端条目为 ①–⑪ 与缺陷 6 步的固定键
 * （见 hooks/workbench.ts 的 STORY_STEPS、BUG_STEPS）；按别的工作流建的条目各有各的键
 */
export type StepKey = string

/** 工种：决定没有自定义工作流时用哪份内置工作流 */
export type WorkRole = 'frontend' | 'backend' | 'python' | 'test' | 'product' | 'other'

/** 工作流里的一步：key、title、slow 决定条目的步骤；其余是给 AI 看的细则，面板不显示 */
export interface WorkflowStepType {
    key: StepKey
    /** 面板上显示的步骤名，1 到 12 个字符 */
    title: string
    /** 慢环节：可挂 TAPD 任务或自定义阶段与模块，进行中时面板展开 */
    slow: boolean
    /** 这一步做什么 */
    what?: string
    /** 用到的工具 */
    tools?: string
    /** 产出 */
    output?: string
    /** 要不要先问用户、问什么 */
    ask?: string
    /** 细则 */
    rules?: string[]
}

/** 一份工作流定义：workflows/<工种>.json，或全局与项目的 workflow.json */
export interface WorkflowType {
    /** 结构版本，目前为 1 */
    version: number
    /** 内置定义的工种 id，自定义的可以不写 */
    id?: string
    /** 名字，如「后端」 */
    title?: string
    /** 开工是否建分支（worktree 与分支）；false 时新会话在项目目录直接启动 */
    branch: boolean
    /** 需求与任务的步骤 */
    story: WorkflowStepType[]
    /** 缺陷的步骤 */
    bug: WorkflowStepType[]
}

/**
 * 生效的工作流从哪来：project 项目自定义、personal 个人自定义、builtin 内置（按工种）、
 * fallback 内置文件读不到或不合格时用代码里的前端步骤、repo 项目内模式（沿用前端步骤，流程按项目内文档）
 */
export type WorkflowSource = 'project' | 'personal' | 'builtin' | 'fallback' | 'repo'

/** 当前项目生效的工作流 */
export interface ActiveWorkflowType {
    workflow: WorkflowType
    source: WorkflowSource
    /** 记进新条目 workflow 字段的值：内置为工种 id，自定义为 project、personal，fallback 与 repo 为 frontend */
    id: string
    /** 给人看的来源，如「内置 · 后端」「项目自定义」 */
    label: string
    /** 定义所在文件的完整路径，代码里的前端步骤为 '' */
    path: string
    /** 自定义文件不合格、被跳过时的说明，没有为空数组 */
    noticeList: string[]
}

/** 新条目按哪套步骤建：与旧的前端步骤相同时不用它（建成旧样式的条目） */
export interface FlowType {
    /** 记进条目的 workflow 字段 */
    id: string
    steps: { key: StepKey; title: string; slow: boolean }[]
}

/** 一步的状态：已完成、进行中、未开始 */
export type StepStatus = 'done' | 'doing' | 'todo'

/** 待办在面板上的开工态：待开工、开工中、已完成，由本项目状态文件里有没有这条、做没做完定 */
export type TodoStartState = 'waiting' | 'started' | 'done'

/** 面板开关 */
export type PaneWant = 'show' | 'hide'

/**
 * 配置与状态文件从哪来：project 为项目内的工作台文件（默认 docs/xiaoli/local/workbench，要有 config.json），
 * global 为全局目录 ~/.claude/xiaoxiaoli/projects/<项目键>（只有 state.json 的老项目进度仍用项目内那份）
 */
export type WorkplaceMode = 'project' | 'global'

/** mod 目录下 config.json 的内容：mod 全局一份，定每个项目里工作台文件的相对位置 */
export interface ModConfigType {
    /** 项目配置的路径，相对项目目录，默认 docs/xiaoli/local/workbench/config.json */
    configPath: string
    /** 状态文件的路径，相对项目目录，默认 docs/xiaoli/local/workbench/state.json */
    statePath: string
}

/** 当前会话所在的项目：面板与 mcp__xiaoxiaoli__progress 都只读写这个项目的状态文件 */
export interface WorkplaceType {
    /**
     * 项目目录：项目内模式为会话目录，会话在 worktree 里且会话目录没有工作台文件时为仓库主工作区；
     * 全局模式为仓库主工作区，不在仓库里时为会话目录
     */
    dir: string
    /** 项目目录的末段，项目没配 TAPD 时作项目名 */
    name: string
    /** 状态文件的完整路径；全局模式下一般在 dataDir，只有 state.json 的老项目为项目内那份 */
    statePath: string
    /** 当前会话 ID，取自 $.session.id() */
    sessionId: string
    /** 会话目录是否就是项目目录（不在某个 worktree 里） */
    isMainCheckout: boolean
    /** 配置与状态文件从哪来 */
    mode: WorkplaceMode
    /** 项目配置文件的完整路径；全局模式下绑定与解绑写这里 */
    configPath: string
    /** 全局模式下的全局项目目录（配置、项目资料，状态文件见 statePath），项目内模式为 '' */
    dataDir: string
    /** 全局模式下的项目键「目录名-路径短哈希」，项目内模式为 '' */
    projectKey: string
    /**
     * 项目里没有 config.json、只因取不到全局根目录（用户目录变量都没有，XIAOXIAOLI_HOME、CLAUDE_CONFIG_DIR 也没设）才按项目内处理时为 true；
     * 这时 configPath 指向的文件并不存在，绑定与解绑据此说明原因。其余情况不写
     */
    isGlobalRootMissing?: boolean
    /** 全局模式下全局项目配置里的显示名（面板上显示的项目名），没设不写；项目内模式不支持 */
    displayName?: string
    /**
     * 全局模式下全局项目配置里的 systems：本项目用不用某个系统，没写的键为没说（按用到处理），一个都没写时不写；
     * 只有 tapd 为 false 有 mod 行为（不列 TAPD 项目、不拉待办），其余供 AI 判断；项目内模式不支持
     */
    systems?: Record<string, boolean>
}

/** 一个 TAPD 项目：绑定列表里的一行 */
export interface TapdProjectType {
    /** TAPD 项目 ID（workspace_id），数字字符串 */
    id: string
    name: string
}

/** 全局模式下项目还没绑定 TAPD 时，待办区的绑定列表 */
export interface BindStateType {
    /** 当前用户参与的 TAPD 项目，已去掉公司（organization） */
    list: TapdProjectType[]
    /** 是否成功拉到过 */
    loaded: boolean
    /** 点中的项目 ID，'' 为没选中；点中后下面出现确认行 */
    selectedId: string
}

/**
 * 项目配置的内容：TAPD 项目与开工命令的设置。项目内模式在 docs/xiaoli/local/workbench/config.json，
 * 全局模式在 ~/.claude/xiaoxiaoli/projects/<项目键>/config.json
 */
export interface WorkbenchConfigType {
    /** 面板顶部显示的项目名 */
    projectName: string
    /** 「本项目」视图拉取的 TAPD 项目 ID */
    tapdWorkspaceId: string
    /** 状态文件路径，相对项目目录；不写用 mod 配置的 statePath；只在项目内模式生效 */
    statePath?: string
    /** 自动刷新待办的间隔，分钟 */
    refreshMinutes: number
    /** 新会话开工时的分支名模板，{id} 换成短 ID，默认 feat/{id} */
    branchTemplate: string
    /** 缺陷的分支名模板，默认 fix/{id} */
    bugBranchTemplate: string
    /** 新会话开工时分支的起点，默认 origin/master */
    branchBase: string
}

/** 一条 TAPD 待办 */
export interface TodoType {
    kind: TodoKind
    /** TAPD 长 ID，开工时原样发出 */
    id: string
    title: string
    /** 状态中文名，查不到映射时为原值 */
    status: string
    /** 优先级原值：High、Middle、Low、Nice To Have，缺陷为 urgent、high、medium 等 */
    priority: string
    /** 预计开始 YYYY-MM-DD，未填为 '' */
    begin: string
    /** 预计结束 YYYY-MM-DD，未填为 '' */
    due: string
    /** 所属 TAPD 项目 ID */
    workspaceId: string
    /** 所属 TAPD 项目名，「全部项目」视图开工确认行写明用；拉取时没拿到名字为空或不写 */
    workspaceName?: string
    /** TAPD 返回的状态原值（如缺陷的 reopened），未翻译；判断缺陷是否「重新打开」用，没拿到为空或不写 */
    statusKey?: string
    /** 任务所属需求的长 ID，需求、缺陷与没有父需求的任务为 '' */
    storyId: string
    /** 所属迭代 ID，没有或缺陷为 ''；任务为 '' 时筛选跟随父需求 */
    iterationId: string
}

/** 一个 TAPD 迭代 */
export interface IterationType {
    id: string
    name: string
    /** 开始日期 YYYY-MM-DD */
    startdate: string
    /** 结束日期 YYYY-MM-DD */
    enddate: string
}

/** 迭代筛选的状态 */
export interface IterationStateType {
    /** 本项目的迭代，按开始日期倒序 */
    list: IterationType[]
    /** 今天所在的迭代 ID，没有为 '' */
    currentId: string
    /** 选中的筛选：'current' 本迭代，'all' 全部，其余为迭代 ID */
    pick: string
    /** 迭代列表是否展开 */
    listShow: boolean
    /**
     * 是否成功拉到过迭代。没拉到时本迭代 ID 为空，选「本迭代」实际显示全部，迭代行写「本迭代（迭代未加载，暂显示全部）」，
     * 标题行不提示「无当前迭代」
     */
    loaded: boolean
}

/** 待办区的拉取状态 */
export interface TodoMetaType {
    scope: TodoScope
    /** 上次刷新完成的时间戳，0 为还没刷新过 */
    refreshedAt: number
    todoLoading: boolean
    /** 上次刷新的错误说明，只含错误类型与项目数，'' 为没出错 */
    error: string
    /** 本次拉取覆盖的项目数 */
    projectCount: number
    /** 待办整轮失败后正在等第几次自动重试（5、15、30 秒），0 为没在重试；只有迭代没拉到时的重试不计在这里，标题行不提示 */
    retryCount: number
}

/** 任务下的一个模块：名字取提交标题里的模块序号，如「界面2 顶栏」「接口7」 */
export interface StepModuleType {
    name: string
    /** 已完成几项 */
    done: number
    /** 一共几项，至少 1 */
    total: number
}

/** 慢环节（读需求、对齐、开发、单测、浏览器自测）下挂的一条 TAPD 任务或自定义阶段 */
export interface StepTaskType {
    /** 纯数字为 TAPD 任务短 ID，其余为自定义阶段名，如「自测」「对接 UI」 */
    id: string
    title: string
    status: StepStatus
    /** 当前子项，没有模块时显示 */
    detail?: string
    modules?: StepModuleType[]
}

/** 需求的一步 */
export interface ProgressStepType {
    key: StepKey
    /** 步骤名，取工作流的环节名 */
    title: string
    status: StepStatus
    /** 当前子项，如「界面2 顶栏」「联调 /design-records/create」 */
    detail?: string
    /** 这一步的结论要用户确认（如缺陷判定拒绝），面板标「待确认」 */
    confirm?: boolean
    /** 这一步拆出的 TAPD 任务或自定义阶段，只在慢环节有 */
    tasks?: StepTaskType[]
    /**
     * 是否慢环节（可挂子项、进行中展开）：按工作流建的条目（有 workflow 字段）每步都有，文件里只写 true；
     * 旧条目没有，按前端的慢环节（读需求、对齐、开发、单测、浏览器自测）判断
     */
    slow?: boolean
}

/** state.json 里的一个条目（需求或缺陷）；旧结构读进来时已按 step 推导出 steps */
export interface ProgressTaskType {
    /** TAPD 短 ID */
    id: string
    /**
     * 所属 TAPD 项目 ID（workspace_id），面板开工时写上；旧条目与进度工具新建的条目没有。
     * 与待办对应时两边都有就要求相同，条目没有就只按短 ID 对应
     */
    workspaceId?: string
    /** 没写为 story */
    kind: ProgressKind
    /**
     * 按哪份工作流建的（内置为工种 id，自定义为 project、personal）：有这个字段的条目步骤自成一套，
     * 不按前端模板补齐，工作流之后怎么改都不影响它；没有的是旧样式条目（前端需求 11 步、缺陷 6 步）
     */
    workflow?: string
    title: string
    /** 条目自己的步骤：旧样式按前端模板排好，按工作流建的照开工时的工作流 */
    steps: ProgressStepType[]
    /** 正在等用户的环节，null 为没在等 */
    waiting: WaitingKind | null
    branch?: string
    /** 负责这条需求的会话 ID：一条需求一个会话 */
    sessionId?: string
    /** 这条需求的 worktree 目录，在主工作区开发时没有 */
    worktree?: string
    /** 等别人的事与待确认项，显示在任务下面 */
    note?: string
    updatedAt: string
}

/** 进行中区读到的内容 */
export interface ProgressType {
    taskList: ProgressTaskType[]
    /** state.json 读不懂时的说明，'' 为正常或文件不存在 */
    error: string
}

/**
 * 全局档案 profile.json（全局根目录下，默认 ~/.claude/xiaoxiaoli/profile.json）读出来的内容。
 * 文件是 { "version": 1, "name": "<名字>" } 或 { "version": 1, "skipped": true }；读不懂、字段不对都当作还没设置
 */
export interface ProfileType {
    /** 用户起的名字（已去掉首尾空白与「AI工作台」后缀），没起、名字不合格或读不懂为 '' */
    name: string
    /** 是否选了「先不设」：不再显示首次引导，名字用默认 */
    isSkipped: boolean
    /** 文件版本比本 mod 认识的新：名字用默认、不显示引导，改名与先不设都不覆盖写 */
    isNewer: boolean
    /**
     * 是否已经自动发起过设置引导（文件里 guided 为 true，guidedBy 记发起它的会话 ID）：记过就不再自动发起，
     * 不影响「还没设置」的判定，引导行与 /xiaoxiaoli setup 照旧
     */
    isGuided: boolean
    /** 工种（文件里的 role），没设或读不懂为 ''，这时按前端 */
    role: WorkRole | ''
    /** 演练处理过没有（文件里的 tour）：没处理过不写，这时起了名（或先不设）的面板上出「走一遍演练」两行 */
    tour?: TourStateType
}

/** 演练的处理结果：done 走过（含中途叫停），declined 在面板上选了「不用了」 */
export type TourStateType = 'done' | 'declined'

/** 依赖的种类：MCP 服务器、skill、命令行工具 */
export type DepKindType = 'mcp' | 'skill' | 'cli'

/** guide/deps.json 里的一项依赖：体检时 AI 按 detect 检查，缺了按 install 装 */
export interface DepType {
    /** 依赖 id，check 结果的键，如 tapd、li-yuque-skills */
    id: string
    kind: DepKindType
    /** 给人看的名字，如「受控浏览器」 */
    title: string
    /** 做什么用 */
    use: string
    /** 怎么判断有没有装 */
    detect: string
    /** 安装方式，没写为没有 */
    install?: string
    /** 要什么账号或令牌，没写为不需要 */
    account?: string
    /** 哪些工种用得到；文件里没写为全部工种 */
    roles: WorkRole[]
}

/** guide/tour.json：演练脚本 */
export interface TourType {
    /** 总规则 */
    rules: string[]
    /** 第一部分体检怎么做 */
    check: string[]
    /** 每个环节演练时验证什么：键为「<工作流 id>:<步骤键>」或「<步骤键>」 */
    steps: Record<string, string>
    /** 两种键都没有的环节用它 */
    fallback: string
    /** 第三部分功能点 */
    features: string[]
    /** 收尾 */
    finish: string[]
}

/** 一项依赖的体检结果：有、缺、用户选了以后再配 */
export type CheckResultType = 'ok' | 'missing' | 'skipped'

/** $.state 里的体检结果：只算当前工种用得到的依赖，面板与概况用 */
export interface EnvStateType {
    /** 上次体检的时间（ISO），全局根目录下 env.json 里记的 */
    checkedAt: string
    /** 缺的依赖名 */
    missingList: string[]
    /** 选了以后再配的依赖名 */
    skippedList: string[]
}

/** $.state 里的档案：读出来的内容加文件位置 */
export interface ProfileStateType extends ProfileType {
    /** 档案的完整路径；取不到全局根目录为 ''，这时名字用默认、不显示引导、起的名字存不了 */
    path: string
}

/** 启动命令的写法：Windows 路径用 PowerShell，其余（macOS、Linux）用 bash/zsh */
export type LaunchShell = 'powershell' | 'bash'

/** 面板生成的启动命令：新会话开工（new 建 worktree 与分支，here 在项目目录直接启动、不建分支），或回到这条需求已有的会话 */
export interface LaunchType {
    /** TAPD 短 ID */
    id: string
    kind: 'new' | 'here' | 'resume'
    /** 在新终端粘贴运行的整条命令 */
    command: string
    /** 命令是哪种写法，定面板与提示里「到哪里粘贴」的说法；不写按 PowerShell（旧版热重载留下的值） */
    shell?: LaunchShell
    /** 是否已写进剪贴板 */
    isCopied: boolean
}

declare module 'claude-code' {
    interface PluginState {
        xiaoxiaoli: {
            /** 当前项目的配置（项目内或全局），null 为未配置或还没绑定 */
            config: WorkbenchConfigType | null
            todoList: TodoType[]
            todoMeta: TodoMetaType
            /** 点中的待办 ID，'' 为没选中 */
            selectedId: string
            progress: ProgressType
            /** 迭代筛选，只在「本项目」视图生效，缺陷不分迭代 */
            iteration: IterationStateType
            /** 当前会话所在的项目，session.start 时定下 */
            workplace: WorkplaceType | null
            /** 主循环是否正在跑一轮：turn.start 置 true，主循环的 turn.complete 置 false */
            turnBusy: boolean
            /** 最近一次生成的启动命令，null 为没有 */
            launch: LaunchType | null
            /** 全局模式下还没绑定 TAPD 时的绑定列表 */
            binding: BindStateType
            /** 面板是否沉浸（只显示标题与进行中区）；只记在本会话，新会话默认 false */
            isFocus: boolean
            /** 全局档案：名字、是否先不设、文件位置；不分项目内还是全局模式，都读全局根目录下那份 */
            profile: ProfileStateType
            /** 本会话是否已经弹过「第一次用」的提示（或排了首次自动发起）；记在 $.state，热重载后不重复 */
            isSetupHinted: boolean
            /** 本会话是否已经跑过一次 session.start；之后再来的（热重载等）不算全新启动，不自动发起设置引导 */
            isStarted: boolean
            /** classic.SessionStart 最近一次的来源（startup、resume、clear、compact、fork），没收到为 ''；不是 startup 时不自动发起 */
            startSource: string
            /** 当前项目生效的工作流；还没定下为 null */
            workflow: ActiveWorkflowType | null
            /** 上次体检的结果（按当前工种算）；没体检过或取不到全局根目录为 null */
            env: EnvStateType | null
        }
    }
}
