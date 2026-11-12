/**
 * @description AI 工作台的工作面板入口（插件 xiaoxiaoli）：工作面板、环境变量开关、TAPD 待办与迭代筛选、开工分流与启动命令、进行中需求、
 * 状态行、/xiaoxiaoli 命令，主会话推进进度用的 mcp__xiaoxiaoli__progress；项目里没有 config.json 时落到全局目录，
 * 没绑定 TAPD 的项目在面板上点选或经 mcp__xiaoxiaoli__bind 绑定一次；工作台可以起名（全局档案 profile.json），
 * 还没起名时面板最上方出首次引导，经 /xiaoxiaoli setup 或 mcp__xiaoxiaoli__setup 保存，/xiaoxiaoli name 直接改名；
 * 这台机器第一次在交互式会话里全新启动时自动发起一次设置引导（档案里记标记，只发一次）；按工种与工作流开工：
 * 新条目的步骤取当时生效的工作流（项目自定义 → 个人自定义 → 内置工种），不建分支的工种在项目目录直接起新会话，
 * AI 经 mcp__xiaoxiaoli__workflow 查看与调整工作流，/xiaoxiaoli role 改工种；项目差异（显示名、用到的系统）存全局项目配置，
 * 经 mcp__xiaoxiaoli__project 与 /xiaoxiaoli project 查看与修改，记着不用 TAPD 的项目不调 TAPD；开工给出通用与项目两处资料目录；
 * 体检与演练：设置引导多问一步、/xiaoxiaoli tour 与面板「走一遍演练」让 AI 调 mcp__xiaoxiaoli__guide，start 放演示条目并给脚本，
 * check 记体检结果（全局根目录 env.json），finish 收尾并在档案里记演练已走过；面板「不用了」记进档案不再显示
 * @author xiao li
 * @createDate 2026-10-21 18:05
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, HookFailure, Register, RenderSurface, Timer } from 'claude-code'
import type {
    ActiveWorkflowType,
    BindStateType,
    EnvStateType,
    IterationStateType,
    LaunchType,
    PaneWant,
    ProfileStateType,
    ProgressKind,
    ProgressTaskType,
    ProgressType,
    TapdProjectType,
    TodoMetaType,
    TodoScope,
    TodoType,
    WorkRole,
    WorkbenchConfigType,
    WorkplaceType
} from '../types'
import {
    buildBoard,
    clockText,
    iterationFilterId,
    todayText,
    ACTION_FOCUS,
    ACTION_ITERATION,
    ACTION_LAUNCH_CLOSE,
    ACTION_LAUNCH_COPY,
    ACTION_REFRESH,
    ACTION_SCOPE,
    ACTION_SETUP_SKIP,
    ACTION_SETUP_START,
    ACTION_TOUR_SKIP,
    ACTION_TOUR_START,
    BIND_CONFIRM_PREFIX,
    BIND_PREFIX,
    ITERATION_PREFIX,
    NO_GLOBAL_ROOT_TEXT,
    NO_RESTART_TEXT,
    START_PREFIX,
    TODO_PREFIX,
    startButtonOf,
    startStateOf
} from './layout'
import {
    PASTE_TEXT,
    branchOf,
    docsDirOf,
    herePrompt,
    hereSessionCommand,
    isSessionId,
    isShortId,
    newSessionCommand,
    resumeCommand,
    routeStart,
    shellOf,
    startPrompt,
    submitText,
    worktreeOf
} from './launch'
import {
    RESOURCE_FILES,
    SHARED_DIR,
    SHARED_README_FILE,
    SHARED_README_TEXT,
    SYSTEM_KEYS,
    parseProjectExtras,
    projectConfigText,
    projectSummaryText,
    systemsText,
    toProjectChange
} from './project'
import type { ResourceDirType } from './project'
import {
    DEPS_FILE,
    ENV_FILE,
    TOUR_FILE,
    checkReplyText,
    depsOfRole,
    envStateOf,
    envText,
    newDemoTask,
    parseDeps,
    parseEnv,
    parseTour,
    toCheckResults,
    toGuideInput,
    tourScript,
    tourStepsOf
} from './guide'
import type { DepsParseType, TourParseType } from './guide'
import { CHECKED_DAY_KEY, CHECK_DELAY_MS, MANIFEST_FILE, NOTICE_TIMEOUT_MS, RUN_TIMEOUT_MS, runUpdateCheck } from './update'
import type { UpdatePortsType } from './update'
import {
    WORKFLOW_DIR,
    WORKFLOW_FILE,
    checkWorkflow,
    flowOf,
    flowsOf,
    parseWorkflow,
    pickWorkflow,
    repoWorkflow,
    scopeLabel,
    toWorkflowInput,
    workflowFileText,
    workflowText
} from './workflow'
import { bindConfigText, globalPlaceOf, globalRootOf, joinDir, matchProject, toBindInput, unbindConfigText } from './binding'
import type { BranchFieldsType } from './binding'
import {
    DEFAULT_NAME,
    PROFILE_FILE,
    PROFILE_NEWER_TEXT,
    ROLE_CHOICES_TEXT,
    ROLE_TITLES,
    TOUR_SUMMARY_LIMIT,
    WORK_ROLES,
    checkName,
    fullNameOf,
    guidedByOf,
    isSetupPending,
    isTourOffered,
    isTourPending,
    nameOf,
    noticeText,
    parseProfile,
    profileText,
    roleOf,
    setupPrompt,
    toRole,
    tourPrompt
} from './profile'
import type { ProfileChangeType } from './profile'
import {
    TAPD_SERVER,
    currentIterationId,
    describeError,
    fetchIterations,
    filterByIteration,
    fetchTodos,
    fetchWorkspaces,
    shortId,
    toErrorKind,
    toReadTool
} from './tapd'
import type { TapdCall, TapdErrorKind, WorkspaceType } from './tapd'
import {
    DEMO_ID,
    MOD_CONFIG_FILE,
    PROGRESS_KINDS,
    STEP_STATUSES,
    WAITING_KINDS,
    applyProgress,
    baseName,
    findStepTask,
    findTask,
    isDemoTask,
    joinPath,
    newTask,
    paneChange,
    parseConfig,
    parseModConfig,
    parseProgress,
    redoStepTask,
    resetTask,
    samePath,
    statusText,
    stringifyState,
    toPaneWant,
    toProgressInput,
    upsertTask
} from './workbench'

type Dollar = EngineInterface

const PANE_ID = 'xiaoxiaoli'
/** 主会话推进进度的工具：注册名与模型看到的全名 */
const PROGRESS_TOOL = 'progress'
const PROGRESS_TOOL_NAME = 'mcp__xiaoxiaoli__progress'
/** 把项目绑定到 TAPD 项目的工具：注册名与模型看到的全名 */
const BIND_TOOL = 'bind'
const BIND_TOOL_NAME = 'mcp__xiaoxiaoli__bind'
/** 给工作台起名的工具：注册名，与 tool.call 里匹配模型看到的全名 mcp__xiaoxiaoli__setup 的正则 */
const SETUP_TOOL = 'setup'
const SETUP_TOOL_PATTERN = /^mcp__xiaoxiaoli__setup$/
/** 查看与调整工作流的工具：注册名，与匹配全名 mcp__xiaoxiaoli__workflow 的正则（原因同起名工具） */
const WORKFLOW_TOOL = 'workflow'
const WORKFLOW_TOOL_PATTERN = /^mcp__xiaoxiaoli__workflow$/
/** 查看与修改项目差异（显示名、用到的系统）的工具：注册名，与匹配全名 mcp__xiaoxiaoli__project 的正则（原因同起名工具） */
const PROJECT_TOOL = 'project'
const PROJECT_TOOL_PATTERN = /^mcp__xiaoxiaoli__project$/
/** 体检与演练的工具：注册名，与匹配全名 mcp__xiaoxiaoli__guide 的正则（原因同起名工具） */
const GUIDE_TOOL = 'guide'
const GUIDE_TOOL_PATTERN = /^mcp__xiaoxiaoli__guide$/
/** 轮询 XIAOXIAOLI_PANE 的间隔 */
const ENV_POLL_MS = 500
/** 读 state.json 的间隔 */
const PROGRESS_POLL_MS = 2000
/** 整轮失败后自动重试的等待：5 秒、15 秒、30 秒各一次 */
const RETRY_DELAYS = [5_000, 15_000, 30_000]
/* 以下提示都不带前缀，出口统一经 say 加「<名字>：」 */
const USAGE_TEXT = [
    '用法 /xiaoxiaoli show 打开工作面板 · hide 收起 · refresh 重读配置并刷新待办 · unbind 解除本项目的全局 TAPD 绑定',
    ' · setup 让 AI 引导给工作台起名（没绑定 TAPD 的项目顺带问绑定） · name <名字> 直接改名',
    ` · role <工种> 设工种（${ROLE_CHOICES_TEXT}）`,
    ' · project 看本项目的配置概况（显示名、TAPD、用到的系统、资料目录）',
    ' · tour 让 AI 带你走一遍演练（体检本机环境、按工作流模拟走一遍、讲功能点）'
].join('')
/** 本项目记着不用 TAPD（systems.tapd 为 false）时 refresh 的说法 */
const TAPD_OFF_REPLY = '本项目记着不用 TAPD（systems.tapd 为 false），不列 TAPD 项目、不拉待办，进行中区照常；要用时对 AI 说「这个项目用 TAPD」'
const NOT_BOUND_TEXT = '本项目还没绑定 TAPD 项目，在工作面板里点一个绑定，或对 AI 说「这个项目对应 TAPD 的某某项目」'
/** 终端不够宽、面板没画出来时的提示：自动打开（轮询、小克代跑）时建议手动运行 show；用户自己运行 show 时只说拉宽终端 */
const PANE_WAIT_TEXT = '终端不够宽，工作面板先挂起；/xiaoxiaoli show 可直接打开'
const PANE_WAIT_ASKED_TEXT = '终端不够宽，工作面板没能画出来，把终端拉宽后再试'
/** 还没起名、这次没自动发起设置引导时，会话启动弹一次的提示 */
const SETUP_HINT_TEXT = '第一次用，打开工作面板点「开始设置」给工作台起名，或输入 /xiaoxiaoli setup；不设也能照常用'
/** 首次使用自动发起了设置引导时的提示 */
const SETUP_AUTO_TEXT = '第一次用，正在帮你设置工作台名字；不想设直接选「保持默认」，以后可点工作面板上的「开始设置」或输入 /xiaoxiaoli setup'
/**
 * 首次使用自动发起设置引导前等多久：session.start 里不发（会话的启动在等这个钩子），等工具注册完、界面起来、
 * 用户还没开口时再看一眼；这期间用户先开始提问了就不发
 */
const AUTO_GUIDE_DELAY_MS = 3000
/** 取不到全局根目录时起名入口的说法：沿用绑定那句，再说明名字存不了 */
const NO_PROFILE_TEXT = `${NO_GLOBAL_ROOT_TEXT}，起的名字存不了，先用默认名「${DEFAULT_NAME}」`
const SETUP_DESCRIPTION = [
    'AI 工作台：给工作台起名或改名、设工种，写进全局档案（~/.claude/xiaoxiaoli/profile.json），不分项目，所有项目共用。',
    '名字：工作面板的标题栏、提示前缀与 TAPD 评论署名随之换成「名字+AI工作台」。工种：没有自定义工作流时开工用哪套内置工作流，测试、产品、其他开工不建分支。',
    '用户说「给工作台改名」「工作台叫某某」「我是做后端的」，或按 /xiaoxiaoli setup 发来的设置引导问到名字与工种时调用。',
    'name 与 role 至少给一个。name 只填名字本身，如「小美」（全称就是「小美AI工作台」），带了「AI工作台」「工作台」后缀会自动去掉；',
    `1 到 12 个字符，不能含换行、制表等控制字符与 < > & " ' 这五个字符；想恢复默认就传「${DEFAULT_NAME}」。`,
    'role 取 frontend 前端、backend 后端、python、test 测试、product 产品、other 其他。'
].join('')
const SETUP_SCHEMA = {
    type: 'object',
    properties: {
        name: { type: 'string', description: '工作台名字，不含「AI工作台」后缀，如「小美」；只改工种时不传' },
        role: { type: 'string', enum: [...WORK_ROLES], description: '工种；只改名字时不传' }
    },
    required: []
}
const WORKFLOW_DESCRIPTION = [
    'AI 工作台：查看与调整当前项目开工用的工作流（步骤、每步细则、要先问用户的地方）。查找顺序：项目自定义',
    '（~/.claude/xiaoxiaoli/projects/<项目键>/workflow.json）→ 个人自定义（~/.claude/xiaoxiaoli/workflow.json）→ 内置（按用户的工种：前端、后端、Python、测试、产品、其他）。',
    'action=get：开工消息要求取工作流时调，kind 传 story（需求与任务）或 bug（缺陷）只取那一组；返回来源说明与定义 JSON，',
    '照它的步骤与 what、tools、output、ask（要不要先问）、rules 走，进度上报（mcp__xiaoxiaoli__progress）用它的步骤键。',
    'action=set：只有用户明确要求调整工作流时才调（如「这个项目去掉写文档这一步」「以后我的流程都加一步代码评审」）；改之前先 get，',
    '在它的基础上改，没让改的步骤与细则原样保留，传完整的 definition（story、bug，可选 branch、title）；scope=project 只对本项目，personal 对用户的所有项目。',
    'action=reset：用户要求恢复时调，scope 指去掉哪一层的自定义，回到下一层。改动只影响之后新开工的条目，进行中的条目按各自开工时的步骤走。',
    '定义规则：story、bug 各 1 到 20 步；每步 key 小写字母开头、只含小写字母、数字与 -，组内不重复；title 1 到 12 个字符；',
    'slow=true 的步骤可挂子项（TAPD 任务、模块）；branch=false 时开工不建分支。'
].join('')
const PROJECT_DESCRIPTION = [
    'AI 工作台：查看与修改当前项目的配置差异，存在全局项目目录的 config.json（~/.claude/xiaoxiaoli/projects/<项目键>/config.json），不往项目仓库写文件。',
    '用户说「这个项目显示成某某」「这个项目不用 TAPD」「这个项目用语雀 / 不用 figma」，或你需要了解本项目配置概况时调用。',
    'action=get：一次返回显示名与目录名、绑定的 TAPD 项目、systems、通用资料目录（~/.claude/xiaoxiaoli/shared）与项目资料目录的位置、',
    '两处 resources.md 与 secrets.env 在不在（不读内容）、生效工作流的来源、工作台名字与工种。',
    'action=set：displayName 改工作面板上显示的项目名（1 到 20 个字符，传空字符串清掉、回到目录名）；systems 与已有的合并，值 true 用、false 不用、null 去掉（回到没说，按用到处理），',
    `约定的键 ${SYSTEM_KEYS.join('、')}，别的键也照存。只有 tapd=false 会让工作面板不列 TAPD 项目、不拉待办（之后绑定 TAPD 项目时自动改回 true）；`,
    '其余键本 mod 不解释，供你判断哪些环节跳过（如 yuque=false 时不读语雀）。各项目通用的资料（resources.md、secrets.env）放通用资料目录，和通用不一样的放项目资料目录。',
    '项目内模式（项目里有 docs/xiaoli/local/workbench/config.json）不支持 set。'
].join('')
const GUIDE_DESCRIPTION = [
    'AI 工作台：体检与演练。只有用户要走一遍演练时才调 start：设置引导里问过并同意、点了工作面板上的「走一遍演练」、输入 /xiaoxiaoli tour，',
    '或说「带我走一遍」「带我熟悉一下工作台」；别的时候不要调。start 在工作面板进行中区放一条演示条目（ID demo，标题「【演练】熟悉工作台」，',
    '步骤取当前生效工作流的需求步骤，记到本会话，已有的会重置），返回完整的演练脚本（总规则、体检与本工种的依赖清单、按工作流逐环节的走法、',
    '功能点、收尾、本项目概况），照它走；演示条目的进度用 mcp__xiaoxiaoli__progress 推进，id 传 demo。',
    '体检做完调 check：results 的键是依赖清单里的 id，值 ok（有）、missing（缺）或 skipped（用户选以后再配），记进全局根目录的 env.json',
    '（~/.claude/xiaoxiaoli/env.json），不认识的 id 丢掉。演练走完或用户叫停时调 finish：移除演示条目，在 profile.json 里记下演练已走过，',
    '可带 summary（一两句小结，存进档案）；没有演示条目也照样记。演练不建分支、不提交、不改 TAPD。'
].join('')
const GUIDE_SCHEMA = {
    type: 'object',
    properties: {
        action: { type: 'string', enum: ['start', 'check', 'finish'] },
        results: { type: 'object', description: 'check 必填：{ 依赖 id: "ok" | "missing" | "skipped" }，如 { "tapd": "ok", "figma": "missing" }' },
        summary: { type: 'string', description: 'finish 时可选：演练小结，一两句话' }
    },
    required: ['action']
}
const PROJECT_SCHEMA = {
    type: 'object',
    properties: {
        action: { type: 'string', enum: ['get', 'set'] },
        displayName: { type: 'string', description: 'set 时可选：工作面板上显示的项目名，传空字符串清掉' },
        systems: { type: 'object', description: 'set 时可选：如 { "tapd": false, "yuque": true }，值 null 去掉该键' }
    },
    required: ['action']
}
const WORKFLOW_SCHEMA = {
    type: 'object',
    properties: {
        action: { type: 'string', enum: ['get', 'set', 'reset'] },
        kind: { type: 'string', enum: [...PROGRESS_KINDS], description: 'get 时可选：只返回需求（story）或缺陷（bug）那一组' },
        scope: { type: 'string', enum: ['project', 'personal'], description: 'set、reset 必填：project 本项目，personal 个人（所有项目）' },
        definition: {
            type: 'object',
            description: 'set 必填：完整定义 { title?, branch?, story: [步骤], bug: [步骤] }，步骤为 { key, title, slow?, what?, tools?, output?, ask?, rules? }'
        }
    },
    required: ['action']
}
const BIND_DESCRIPTION = [
    'AI 工作台：把当前项目绑定到一个 TAPD 项目，写进全局项目配置（~/.claude/xiaoxiaoli/projects/<项目键>/config.json），',
    '之后工作面板拉这个 TAPD 项目的待办，再打开本项目不再询问。',
    '用户说「这个项目对应 TAPD 的某某项目」「把本项目绑到 TAPD 某某」时调用。',
    'project 填 TAPD 项目名或项目 ID（workspace_id，纯数字），按用户参与的项目匹配：名字完全一致优先，否则按包含；',
    '对上多个时会列出候选，让用户挑一个再调。可选 branchTemplate、bugBranchTemplate（要含 {id}，如 feat/{id}）与 branchBase（新分支起点，默认 origin/master）。',
    '项目内有 docs/xiaoli/local/workbench/config.json 时以项目内配置为准，本工具不写；项目内只有 state.json 的照常绑定到全局，进度仍用项目内那份；',
    '解除绑定让用户运行 /xiaoxiaoli unbind。'
].join('')
const BIND_SCHEMA = {
    type: 'object',
    properties: {
        project: { type: 'string', description: 'TAPD 项目名或项目 ID（workspace_id，纯数字）' },
        branchTemplate: { type: 'string', description: '可选，需求开新会话时的分支名模板，要含 {id}，默认 feat/{id}' },
        bugBranchTemplate: { type: 'string', description: '可选，缺陷开新会话时的分支名模板，要含 {id}，默认 fix/{id}' },
        branchBase: { type: 'string', description: '可选，新分支的起点，默认 origin/master' }
    },
    required: ['project']
}
const PROGRESS_DESCRIPTION = [
    'AI 工作台：推进当前项目 state.json 里一条需求的进度，工作面板据此显示「步骤 → 任务 → 模块」三级进度。',
    '每推进一步、换当前子项、派子代理时调用一次。',
    'step 取这个条目自己的步骤键：键取自工作流（开工时 mcp__xiaoxiaoli__workflow 的 get 返回的 key；需求 kind=story，缺陷 kind=bug），',
    '在工作面板开工的条目按当时生效的工作流建步骤；不属于这个条目的键会被拒绝并列出可用的键。旧的前端条目为需求 ①–⑪（fetch、sort、branch、read、align、',
    'develop、unit、selftest、docs、tapd、release）与缺陷 6 步（screenshot、env、reproduce、diagnose、fix、verify）。新建条目也按当前生效的工作流。',
    '结论要用户确认的步（如判定拒绝）传 confirm=true，工作面板标「待确认」，用户确认后传 confirm=false。',
    'status=doing 与 status=done 都是线性推进：它之前的步骤全记为完成；doing 时它之后的回到未开始（返工），done 时它本身记完成、detail 保留、之后的不动；',
    'status=todo 只改这一步。直接把最后一步传 done 即可把整条记完成，不必先传 doing。detail 写当前子项，如「界面2 顶栏」「联调 /design-records/create」。',
    '慢环节（工作流里 slow=true 的步骤）可用 taskId、taskTitle、taskStatus、taskDetail 挂 TAPD 任务或自定义阶段（如「自测」），',
    '用 module、moduleDone、moduleTotal 记其下的模块，模块名取提交标题里的模块序号（如 界面2、接口7）。',
    '子项记成进行中（taskStatus=doing）时，只有这一步未开始、且后面没有已完成或进行中的步骤才顺带把它推成进行中，其余情况只挂子项、不改任何步骤的状态。',
    'waiting 标等用户拍板的点（align 对齐稿、review 看自测、tapd 批准改 TAPD、none 清掉）；note 记等别人的事；',
    'bindSession=true 把需求记到本会话；remove=true 移除需求（演示收尾用）。',
    '演练时的演示条目 id 为 demo：由 mcp__xiaoxiaoli__guide 的 start 建、finish 移除，这里只能推进，不能新建。'
].join('')
const PROGRESS_SCHEMA = {
    type: 'object',
    properties: {
        id: { type: 'string', description: `需求或缺陷的 TAPD 短 ID，如 1046775；演练的演示条目传 ${DEMO_ID}` },
        kind: { type: 'string', enum: [...PROGRESS_KINDS], description: '新建条目时用：story 需求（默认）、bug 缺陷' },
        title: { type: 'string', description: '标题；state.json 里还没有这个条目时必填' },
        step: { type: 'string', description: '步骤键，取这个条目自己的（键取自工作流）' },
        status: { type: 'string', enum: [...STEP_STATUSES] },
        detail: { type: 'string', description: '这一步的当前子项；传空串清掉' },
        confirm: { type: 'boolean', description: 'true：这一步的结论要用户确认，工作面板标「待确认」；false 清掉' },
        taskId: { type: 'string', description: 'TAPD 任务短 ID（纯数字）或自定义阶段名（如「自测」），只能挂在这个条目的慢环节下，要同时给 step' },
        taskTitle: { type: 'string', description: '任务标题；新挂 TAPD 任务时必填，自定义阶段省略时用 taskId' },
        taskStatus: { type: 'string', enum: [...STEP_STATUSES] },
        taskDetail: { type: 'string', description: '任务的当前子项，没有模块时显示；传空串清掉' },
        module: { type: 'string', description: '任务或阶段下的模块名，如「界面2 顶栏」，要同时给 taskId' },
        moduleDone: { type: 'integer', minimum: 0, description: '模块已完成几项' },
        moduleTotal: { type: 'integer', minimum: 1, description: '模块一共几项；新加模块时必填' },
        waiting: { type: 'string', enum: [...WAITING_KINDS, 'none'] },
        branch: { type: 'string', description: '需求的分支名；传空串清掉' },
        note: { type: 'string', description: '等别人的事与待确认项；传空串清掉' },
        bindSession: { type: 'boolean', description: 'true 时把需求记到本会话' },
        remove: { type: 'boolean', description: 'true 时从 state.json 移除这条需求' }
    },
    required: ['id']
}

const todoMetaDefault = (): TodoMetaType => ({
    scope: 'project',
    refreshedAt: 0,
    todoLoading: false,
    error: '',
    projectCount: 1,
    retryCount: 0
})
const progressDefault = (): ProgressType => ({ taskList: [], error: '' })
const iterationDefault = (): IterationStateType => ({ list: [], currentId: '', pick: 'current', listShow: false, loaded: false })
const bindingDefault = (): BindStateType => ({ list: [], loaded: false, selectedId: '' })
/** 还没读档案时：没有路径，名字用默认、不显示引导 */
const profileDefault = (): ProfileStateType => ({ name: '', isSkipped: false, isNewer: false, isGuided: false, role: '', path: '' })

const config = atom({ plugin: 'xiaoxiaoli', key: 'config' } as const, null)
const todoList = atom({ plugin: 'xiaoxiaoli', key: 'todoList' } as const, [])
const todoMeta = atom({ plugin: 'xiaoxiaoli', key: 'todoMeta' } as const, todoMetaDefault())
const selectedId = atom({ plugin: 'xiaoxiaoli', key: 'selectedId' } as const, '')
const progress = atom({ plugin: 'xiaoxiaoli', key: 'progress' } as const, progressDefault())
const iteration = atom({ plugin: 'xiaoxiaoli', key: 'iteration' } as const, iterationDefault())
const workplace = atom({ plugin: 'xiaoxiaoli', key: 'workplace' } as const, null)
const turnBusy = atom({ plugin: 'xiaoxiaoli', key: 'turnBusy' } as const, false)
const launch = atom({ plugin: 'xiaoxiaoli', key: 'launch' } as const, null)
const binding = atom({ plugin: 'xiaoxiaoli', key: 'binding' } as const, bindingDefault())
/** 沉浸只记在 $.state：热重载后保持，新会话默认不沉浸，不写 $.store */
const isFocus = atom({ plugin: 'xiaoxiaoli', key: 'isFocus' } as const, false)
/** 全局档案（名字）：不分项目内还是全局模式，都读全局根目录下的 profile.json */
const profile = atom({ plugin: 'xiaoxiaoli', key: 'profile' } as const, profileDefault())
/** 「第一次用」的提示（或首次自动发起）本会话处理过没有：记在 $.state，热重载重跑 session.start 时不重复 */
const isSetupHinted = atom({ plugin: 'xiaoxiaoli', key: 'isSetupHinted' } as const, false)
/** 本会话跑过 session.start 没有：之后再来的（热重载等）不算全新启动 */
const isStarted = atom({ plugin: 'xiaoxiaoli', key: 'isStarted' } as const, false)
/** classic.SessionStart 最近一次的来源，没收到为 ''：resume、fork 等不是全新启动 */
const startSource = atom({ plugin: 'xiaoxiaoli', key: 'startSource' } as const, '')
/** 当前项目生效的工作流：会话启动、刷新、开工、改工种与工作流时重读 */
const workflowState = atom({ plugin: 'xiaoxiaoli', key: 'workflow' } as const, null)
/** 上次体检的结果（按当前工种算）：会话启动、刷新、体检、改工种时重读 */
const envState = atom({ plugin: 'xiaoxiaoli', key: 'env' } as const, null)

/* 模块变量：热重载后清空，session.start 会重新建立 */
/** 上次读到的 XIAOXIAOLI_PANE，变了才动面板 */
let lastEnv: string | undefined
/** 上次读到的 state.json 原文，没变就不重画 */
let lastStateText: string | undefined
let lastStatus: string | undefined
let refreshTimer: Timer | undefined
let refreshMinutes = 0
let refreshing = false
/** 刷新进行中又被要求刷新（比如切了视图），这轮结束再来一次 */
let refreshAgain = false
/** 面板当前是否处于打开，由收起变为打开时才自动刷新一次待办 */
let paneShown = false
/** 已经安排了第几次自动重试 */
let retryCount = 0
let retryTimer: Timer | undefined

/**
 * TAPD 调用入口：只放行白名单里 get_ 开头的只读工具，其余在发出前就拒绝。
 * @param $ 引擎接口
 * @returns 只读调用
 */
const createTapdCall =
    ($: Dollar): TapdCall =>
    async (tool, args) =>
        $.mcp.call(TAPD_SERVER, toReadTool(tool), args)

/** 读一个文件，读不到为 '' */
const readText = async ($: Dollar, path: string): Promise<string> => {
    try {
        return await $.fs.read(path)
    } catch {
        return ''
    }
}

/** 会话所在仓库的主工作区，不在仓库里或取不到为 '' */
const readRepoRoot = async ($: Dollar): Promise<string> => {
    try {
        return (await $.session.repo())?.root ?? ''
    } catch {
        return ''
    }
}

/** 当前会话 ID，取不到为 '' */
const readSessionId = async ($: Dollar): Promise<string> => {
    try {
        return await $.session.id()
    } catch {
        return ''
    }
}

/**
 * 全局根目录（默认 ~/.claude/xiaoxiaoli），取不到用户目录为 ''。环境变量名要写成字面量，XIAOXIAOLI_HOME 可换位置。
 * @param $ 引擎接口
 * @returns 全局根目录
 */
const readGlobalRoot = async ($: Dollar): Promise<string> => {
    try {
        return globalRootOf({
            override: await $.env.get('XIAOXIAOLI_HOME'),
            configDir: await $.env.get('CLAUDE_CONFIG_DIR'),
            userProfile: await $.env.get('USERPROFILE'),
            home: await $.env.get('HOME')
        })
    } catch {
        return ''
    }
}

/**
 * 当前用的名字：档案里起了就用起的，没起为默认名；读不到 $.state（钩子出错时）也用默认名，免得连拒绝原因都给不出。
 * @param $ 引擎接口
 * @returns 名字
 */
const currentName = async ($: Dollar): Promise<string> => {
    try {
        return nameOf(await read($, profile))
    } catch {
        return DEFAULT_NAME
    }
}

/**
 * 提示统一从这里出：toast、命令回复、工具拒绝都写成「<名字>：<内容>」，名字按档案现读。
 * @param $ 引擎接口
 * @param text 内容
 * @returns 带前缀的提示
 */
const say = async ($: Dollar, text: string): Promise<string> => noticeText(await currentName($), text)

/**
 * 换上新的档案：内容没变不写。名字变了时：面板开着就用同一个 id 重开一次换标题（引擎对已打开的 id 只换标题、不另开），
 * 状态行换成新名字；面板里自绘的标题与引导行随 $.state 重画。
 * @param $ 引擎接口
 * @param next 新档案
 */
const applyProfile = async ($: Dollar, next: ProfileStateType): Promise<void> => {
    const before = await read($, profile)
    if (JSON.stringify(before) === JSON.stringify(next)) return

    await update($, profile, () => next)
    if (nameOf(before) === nameOf(next)) return

    if (paneShown) {
        try {
            await $.ui.open({ id: PANE_ID, title: fullNameOf(nameOf(next)) })
        } catch (cause) {
            $.ui.log(`换工作面板标题失败：${describeError(cause)}`, { to: 'debug' })
        }
    }
    await showStatus($, (await read($, progress)).taskList)
}

/**
 * 读全局档案：不分项目内还是全局模式，都读全局根目录下的 profile.json（项目配置的查找规则不变）；
 * 取不到全局根目录时没有路径，名字用默认、不显示引导。读不懂按 parseProfile 当作还没设置。
 * @param $ 引擎接口
 * @returns 读到的档案
 */
const loadProfile = async ($: Dollar): Promise<ProfileStateType> => {
    const globalRoot = await readGlobalRoot($)
    const path = globalRoot === '' ? '' : joinDir(globalRoot, PROFILE_FILE)
    const next: ProfileStateType = { ...parseProfile(path === '' ? '' : await readText($, path)), path }
    await applyProfile($, next)

    return next
}

/**
 * 写全局档案：现读一遍原文件，版本比本 mod 新时不写；文件里别的字段原样保留。写成功后换上新档案，面板标题、前缀、状态行随之换。
 * @param $ 引擎接口
 * @param change 起的名字、先不设，或首次自动发起的标记
 * @returns 写入的路径；不能写时为原因，调用方补「没有写入」
 */
const saveProfile = async ($: Dollar, change: ProfileChangeType): Promise<{ path: string } | { reason: string }> => {
    const globalRoot = await readGlobalRoot($)
    if (globalRoot === '') return { reason: NO_PROFILE_TEXT }

    const path = joinDir(globalRoot, PROFILE_FILE)
    const oldText = await readText($, path)
    if (parseProfile(oldText).isNewer) return { reason: PROFILE_NEWER_TEXT }

    const text = profileText(oldText, change)
    try {
        await $.fs.write(path, text)
    } catch (cause) {
        return { reason: `写 ${path} 失败（${describeError(cause)}）` }
    }
    await applyProfile($, { ...parseProfile(text), path })

    return { path }
}

/**
 * 定下当前会话的项目并读项目配置。先找项目内的工作台文件（项目配置或状态文件）：会话目录有就用会话目录；
 * 没有、且会话在 worktree 里而主工作区有，就用主工作区，同一仓库的几个会话共用一份状态。文件位置取 mod 目录下 config.json。
 * 找到的目录里有 config.json（内容非空）才是项目内模式，项目配置里的 statePath 优先；没有 config.json 时落到全局目录
 * <全局根>/projects/<项目键>/（worktree 归到主工作区），绑定读写全局的 config.json。只有状态文件的老项目（旧版 mod 写的）
 * 进度继续读写项目内那份 state.json，不搬到全局目录；项目内连状态文件也没有时状态文件也在全局目录。
 * 取不到用户目录时仍按项目内处理，待办区与 refresh 如实说明取不到用户目录、可设 XIAOXIAOLI_HOME，进行中区照常读项目内的状态文件。
 * 全局模式顺带读全局项目配置里的项目差异（displayName、systems）记进当前项目；项目内模式不认它们。
 * @param $ 引擎接口
 * @returns 项目配置，没配 TAPD 或还没绑定为 null
 */
const loadConfig = async ($: Dollar): Promise<WorkbenchConfigType | null> => {
    const modConfig = parseModConfig(await readText($, joinPath($.plugin.root, MOD_CONFIG_FILE)))
    const cwd = await $.session.cwd()
    const root = await readRepoRoot($)
    const sessionId = await readSessionId($)
    const filesOf = async (dir: string) => ({
        config: await readText($, joinPath(dir, modConfig.configPath)),
        state: await readText($, joinPath(dir, modConfig.statePath))
    })
    const atCwd = await filesOf(cwd)
    const isMainCheckout = root === '' || samePath(root, cwd)
    const atRoot = isMainCheckout || atCwd.config || atCwd.state ? undefined : await filesOf(root)
    const useRoot = atRoot !== undefined && (atRoot.config !== '' || atRoot.state !== '')
    const projectFiles = useRoot ? atRoot : atCwd
    const dir = useRoot ? root : cwd
    /* 只认 config.json：旧版 mod 在没配置的项目里也写过 state.json，只有它不算项目内模式 */
    const hasProjectConfig = projectFiles.config.trim() !== ''
    const globalRoot = hasProjectConfig ? '' : await readGlobalRoot($)
    /* 只有状态文件的老项目：进度继续用项目内那份，路径按找到它的目录拼 */
    const projectStatePath = projectFiles.state === '' ? '' : joinPath(dir, modConfig.statePath)
    const globalPlace = globalRoot === '' ? undefined : globalPlaceOf({ globalRoot, cwd, repoRoot: root, sessionId, projectStatePath })
    const configText = globalPlace === undefined ? projectFiles.config : await readText($, globalPlace.configPath)
    const loaded = parseConfig(configText)
    /* 项目差异（显示名、用到的系统）只在全局项目配置里认；只有它们的配置不算已绑定 */
    const extras = globalPlace === undefined ? undefined : parseProjectExtras(configText)
    const withExtras: Partial<WorkplaceType> =
        extras === undefined
            ? {}
            : { ...(extras.displayName === '' ? {} : { displayName: extras.displayName }), ...(Object.keys(extras.systems).length ? { systems: extras.systems } : {}) }
    const place: WorkplaceType = globalPlace === undefined ? {
        dir,
        name: baseName(dir),
        statePath: joinPath(dir, loaded?.statePath ?? modConfig.statePath),
        sessionId,
        isMainCheckout,
        mode: 'project',
        configPath: joinPath(dir, modConfig.configPath),
        dataDir: '',
        projectKey: '',
        /* 项目里没有 config.json、只是落不了全局：configPath 指向的文件不存在，绑定与解绑据此说明原因 */
        ...(hasProjectConfig ? {} : { isGlobalRootMissing: true })
    } : { ...globalPlace, ...withExtras }
    /* 内容没变不写，免得每次刷新都重画面板 */
    if (JSON.stringify(await read($, workplace)) !== JSON.stringify(place)) await update($, workplace, () => place)
    if (JSON.stringify(await read($, config)) !== JSON.stringify(loaded)) await update($, config, () => loaded)
    if (loaded !== null) scheduleRefresh($, loaded.refreshMinutes)

    return loaded
}

/**
 * 定下当前项目生效的工作流并记进 $.state：项目内模式（含取不到全局根目录、按项目内处理的）沿用代码里的前端步骤，
 * 流程按项目内文档，不读工种与自定义工作流、不往项目仓库写文件；全局模式按项目自定义 → 个人自定义 → 内置（按档案里的工种）
 * 找第一份合格的。自定义文件不合格时跳过并在这份工作流的说明里写明，说明变了才 toast 一次；内置文件不能用只记 debug 日志。
 * @param $ 引擎接口
 * @returns 生效的工作流
 */
const loadWorkflow = async ($: Dollar): Promise<ActiveWorkflowType> => {
    const place = await read($, workplace)
    const globalRoot = place?.mode === 'global' ? await readGlobalRoot($) : ''
    let active: ActiveWorkflowType
    if (place === null || place.mode !== 'global' || globalRoot === '') {
        active = repoWorkflow()
    } else {
        const role = roleOf(await read($, profile))
        const projectPath = joinDir(place.dataDir, WORKFLOW_FILE)
        const personalPath = joinDir(globalRoot, WORKFLOW_FILE)
        const builtinPath = joinPath($.plugin.root, `${WORKFLOW_DIR}/${role}.json`)
        const picked = pickWorkflow({
            project: { path: projectPath, text: await readText($, projectPath) },
            personal: { path: personalPath, text: await readText($, personalPath) },
            builtin: { path: builtinPath, text: await readText($, builtinPath) },
            role
        })
        if (picked.builtinError) $.ui.log(`内置工作流不能用，改用代码里的前端步骤：${picked.builtinError}`, { to: 'debug' })
        active = picked.active
    }

    const before = await read($, workflowState)
    if (JSON.stringify(before) !== JSON.stringify(active)) await update($, workflowState, () => active)
    const notice = active.noticeList.join('；')
    if (notice !== '' && notice !== (before?.noticeList.join('；') ?? '')) $.ui.toast(await say($, notice))

    return active
}

/** 生效的工作流：$.state 里有就用，没有现定 */
const currentWorkflow = async ($: Dollar): Promise<ActiveWorkflowType> => (await read($, workflowState)) ?? loadWorkflow($)

/**
 * 本项目是不是记着不用 TAPD：全局模式、全局项目配置里 systems.tapd 为 false。这时不列 TAPD 项目、不拉待办，进行中区照常。
 * @param place 当前项目
 * @returns 是否不用 TAPD
 */
const isTapdOff = (place: WorkplaceType | null): boolean => place?.mode === 'global' && place.systems?.tapd === false

/**
 * 通用资料目录：全局根目录下的 shared/，各项目通用的 resources.md、secrets.env 由 AI 用到时放这里；取不到全局根目录为 ''。
 * @param $ 引擎接口
 * @returns 目录
 */
const sharedDirOf = async ($: Dollar): Promise<string> => {
    const globalRoot = await readGlobalRoot($)
    return globalRoot === '' ? '' : joinDir(globalRoot, SHARED_DIR)
}

/**
 * 生成新会话命令前确保通用资料目录存在（--add-dir 指向不存在的目录时 claude 怎么处理没法在这里确认，按最稳的做）：
 * 不存在就写一份说明用途的 README.md（$.fs.write 会连目录一起建），不碰 resources.md、secrets.env。
 * 确保不了（取不到全局根目录、写失败）时为 ''，命令里就不加这个 --add-dir。
 * @param $ 引擎接口
 * @returns 通用资料目录，或 ''
 */
const ensureSharedDir = async ($: Dollar): Promise<string> => {
    const dir = await sharedDirOf($)
    if (dir === '') return ''

    try {
        if (!(await $.fs.exists(dir))) await $.fs.write(joinDir(dir, SHARED_README_FILE), SHARED_README_TEXT)
        return dir
    } catch (cause) {
        $.ui.log(`建通用资料目录失败，启动命令里不加它：${describeError(cause)}`, { to: 'debug' })
        return ''
    }
}

/** 读 mod 目录下的依赖清单 guide/deps.json，读不到或不合格时为原因 */
const readDeps = async ($: Dollar): Promise<DepsParseType> => parseDeps(await readText($, joinPath($.plugin.root, DEPS_FILE)))

/** 读 mod 目录下的演练脚本 guide/tour.json，读不到或不合格时为原因 */
const readTour = async ($: Dollar): Promise<TourParseType> => parseTour(await readText($, joinPath($.plugin.root, TOUR_FILE)))

/**
 * 重读上次体检的结果并记进 $.state：读全局根目录下的 env.json，按当前工种用得到的依赖算出缺的与跳过的（依赖清单不能用时按结果里的 id 算）；
 * 没体检过、取不到全局根目录为 null。内容没变不写。
 * @param $ 引擎接口
 * @returns 体检结果
 */
const loadEnv = async ($: Dollar): Promise<EnvStateType | null> => {
    const globalRoot = await readGlobalRoot($)
    const record = globalRoot === '' ? undefined : parseEnv(await readText($, joinDir(globalRoot, ENV_FILE)))
    let next: EnvStateType | null = null
    if (record !== undefined && record.checkedAt !== '') {
        const deps = await readDeps($)
        next = envStateOf('reason' in deps ? null : depsOfRole(deps.depList, roleOf(await read($, profile))), record)
    }
    if (JSON.stringify(await read($, envState)) !== JSON.stringify(next)) await update($, envState, () => next)

    return next
}

/**
 * 设置引导里要不要多问一步「走一遍演练」：档案里演练还没处理过，且演练脚本能用。
 * @param $ 引擎接口
 * @param state 现读的档案
 * @returns 是否问
 */
const isTourAsked = async ($: Dollar, state: ProfileStateType): Promise<boolean> => isTourPending(state) && 'tour' in (await readTour($))

/** 体检时间给人看的写法：当地日期加时分，读不懂原样 */
const checkedTextOf = (checkedAt: string): string => {
    const ms = Date.parse(checkedAt)
    return Number.isNaN(ms) ? checkedAt : `${todayText(ms)} ${clockText(ms)}`
}

/** 按配置的分钟数定时刷新；分钟数变了就重排定时器 */
const scheduleRefresh = ($: Dollar, minutes: number) => {
    if (minutes === refreshMinutes && refreshTimer !== undefined) return

    refreshTimer?.cancel()
    refreshMinutes = minutes
    refreshTimer = $.clock.every(minutes * 60_000, () => void refreshTodos($))
}

/**
 * 拉本项目的迭代并算出今天所在的迭代；失败记日志，保留上次的列表，交给重试。
 * 迭代选择记在 $.store 里、各项目共用一份：选的是别的项目的迭代（本项目列表里没有）时这次会话按本迭代筛，$.store 不动。
 * @param $ 引擎接口
 * @param workspaceId 项目 ID
 * @returns 错误类型，成功为 ''
 */
const loadIterations = async ($: Dollar, workspaceId: string): Promise<TapdErrorKind | ''> => {
    try {
        const list = await fetchIterations(createTapdCall($), workspaceId)
        const currentId = currentIterationId(list, todayText(await $.clock.now()))
        const isKnown = (pick: string) => pick === 'current' || pick === 'all' || list.some(i => i.id === pick)
        await update($, iteration, i => ({ ...i, list, currentId, loaded: true, pick: isKnown(i.pick) ? i.pick : 'current' }))
        return ''
    } catch (cause) {
        $.ui.log(`迭代拉取失败：${toErrorKind(cause)}，${describeError(cause)}`, { to: 'debug' })
        return toErrorKind(cause)
    }
}

/** 取消排着的自动重试并清零次数 */
const clearRetry = () => {
    retryTimer?.cancel()
    retryTimer = undefined
    retryCount = 0
}

/**
 * 一轮失败后按 5、15、30 秒各重试一次。待办整轮失败（多半是会话刚启动 TAPD MCP 还没连上）时标题行提示第几次重试，
 * 三次都失败才显示拉取失败；只有迭代没拉到时待办已照常显示，标题行不提示重试也不报失败，用尽后迭代行仍写「迭代未加载」。
 * @param $ 引擎接口
 * @param kind 这次失败的错误类型
 * @param isIterationOnly 是否只有迭代没拉到
 */
const scheduleRetry = async ($: Dollar, kind: TapdErrorKind, isIterationOnly: boolean): Promise<void> => {
    retryTimer?.cancel()
    const delay = RETRY_DELAYS[retryCount]
    if (delay === undefined) {
        clearRetry()
        await update($, todoMeta, i => ({ ...i, retryCount: 0, ...(isIterationOnly ? {} : { error: `拉取失败（${kind}），点刷新重试` }) }))
        return
    }

    retryCount += 1
    const count = retryCount
    if (isIterationOnly) {
        /* 待办已拉到：清掉此前待办失败留下的重试提示，error 保留这轮 loadTodos 写的（部分项目失败） */
        await update($, todoMeta, i => (i.retryCount ? { ...i, retryCount: 0 } : i))
    } else {
        await update($, todoMeta, i => ({ ...i, retryCount: count, error: '' }))
    }
    retryTimer = $.clock.after(delay, () => void refreshTodos($))
}

/** 用户手动刷新：取消排着的重试，立即拉 */
const refreshNow = async ($: Dollar): Promise<void> => {
    clearRetry()
    await refreshTodos($)
}

/**
 * 拉一轮待办：本项目只拉配置的项目并顺带拉迭代，全部项目先查参与的项目再逐个拉。
 * @param $ 引擎接口
 * @param current 项目配置
 * @returns 迭代拉取的错误类型，成功或这轮作废为 ''；待办整轮失败直接抛出，交给重试
 */
const loadTodos = async ($: Dollar, current: WorkbenchConfigType): Promise<TapdErrorKind | ''> => {
    await update($, todoMeta, i => ({ ...i, todoLoading: true }))
    const scope = (await read($, todoMeta)).scope
    const call = createTapdCall($)
    const workspaceList: WorkspaceType[] =
        scope === 'project' ? [{ id: current.tapdWorkspaceId, name: current.projectName }] : await fetchWorkspaces(call)
    const iterationTask = scope === 'project' ? loadIterations($, current.tapdWorkspaceId) : Promise.resolve('' as const)
    const result = await fetchTodos(call, workspaceList)
    const failedKind = await iterationTask
    /* 拉取途中切了视图：这轮结果作废，结束后按新视图重拉 */
    if ((await read($, todoMeta)).scope !== scope) return ''

    const refreshedAt = await $.clock.now()
    const error = result.failedCount ? `${result.failedCount} 个项目拉取失败（${result.errorKind}）` : ''
    await update($, todoList, () => result.todoList)
    await update($, todoMeta, i => ({ ...i, refreshedAt, error, projectCount: workspaceList.length }))
    await update($, selectedId, id => (result.todoList.some(i => i.id === id) ? id : ''))
    $.ui.log(`待办 ${result.todoList.length} 条，项目 ${workspaceList.length} 个，失败 ${result.failedCount} 个`, { to: 'debug' })
    if (result.errorDetail) $.ui.log(`部分项目拉取失败：${result.errorKind}，${result.errorDetail}`, { to: 'debug' })

    return failedKind
}

/**
 * 全局模式下项目还没绑定：拉当前用户参与的 TAPD 项目，列在待办区供点选绑定；项目内模式没配 TAPD 时不拉。
 * @param $ 引擎接口
 * @returns 成功或不用拉为 ''；整轮失败直接抛出，交给重试
 */
const loadBindList = async ($: Dollar): Promise<TapdErrorKind | ''> => {
    if ((await read($, workplace))?.mode !== 'global') return ''

    await update($, todoMeta, i => ({ ...i, todoLoading: true }))
    const list = await fetchWorkspaces(createTapdCall($))
    const refreshedAt = await $.clock.now()
    await update($, binding, i => ({ list, loaded: true, selectedId: list.some(project => project.id === i.selectedId) ? i.selectedId : '' }))
    await update($, todoMeta, i => ({ ...i, refreshedAt, error: '' }))
    $.ui.log(`本项目还没绑定 TAPD，参与的项目 ${list.length} 个`, { to: 'debug' })

    return ''
}

/**
 * 记着不用 TAPD 的项目刷新时：不调 TAPD，清掉待办、选中项与绑定列表的选中，拉取状态记成没出错、没在重试。
 * @param $ 引擎接口
 * @returns 总是 ''（没有失败可重试）
 */
const clearForTapdOff = async ($: Dollar): Promise<''> => {
    await update($, todoList, i => (i.length ? [] : i))
    await update($, selectedId, i => (i ? '' : i))
    await update($, binding, i => (i.selectedId ? { ...i, selectedId: '' } : i))
    await update($, todoMeta, i => ({ ...i, error: '', retryCount: 0 }))

    return ''
}

/**
 * 刷新一轮：记着不用 TAPD 的项目不调 TAPD；配了 TAPD 拉待办，全局模式还没绑定时拉参与的项目供绑定，项目内没配 TAPD 不拉；
 * 失败按 5、15、30 秒重试，待办整轮失败与只有迭代没拉到分开提示（见 scheduleRetry）
 */
const refreshTodos = async ($: Dollar): Promise<void> => {
    if (refreshing) {
        refreshAgain = true
        return
    }

    refreshing = true
    let failedKind: TapdErrorKind | '' = ''
    /* loadTodos 正常返回的错误类型只来自迭代，抛出的才是待办整轮失败 */
    let isIterationOnly = false
    try {
        /* 顺带重读档案、工作流与体检结果：别的会话改了名、工种、工作流或刚体检过，这边刷新时跟上 */
        await loadProfile($)
        const current = await loadConfig($)
        await loadWorkflow($)
        await loadEnv($)
        /* 记着不用 TAPD 的项目不调 TAPD：既不列参与的项目，也不拉待办 */
        if (isTapdOff(await read($, workplace))) failedKind = await clearForTapdOff($)
        else failedKind = current === null ? await loadBindList($) : await loadTodos($, current)
        isIterationOnly = failedKind !== ''
    } catch (cause) {
        failedKind = toErrorKind(cause)
        $.ui.log(`待办拉取失败：${failedKind}，${describeError(cause)}`, { to: 'debug' })
    } finally {
        refreshing = false
        await update($, todoMeta, i => ({ ...i, todoLoading: false }))
    }
    if (failedKind !== '') {
        await scheduleRetry($, failedKind, isIterationOnly)
    } else {
        /* 手动刷新会先把重试计数清零，面板上的重试提示要按成功结果清掉，不能只看计数 */
        if (retryCount) clearRetry()
        await update($, todoMeta, i => (i.retryCount ? { ...i, retryCount: 0 } : i))
    }
    if (!refreshAgain) return

    refreshAgain = false
    await refreshTodos($)
}

/**
 * 状态行只跟本会话没做完的需求走（没记会话的旧条目在主工作区的会话里算本会话的），本会话没有或取不到会话 ID 就清掉，文字没变不重写；
 * 开头是工作台的名字
 */
const showStatus = async ($: Dollar, taskList: readonly ProgressTaskType[]): Promise<void> => {
    const place = await read($, workplace)
    const status = statusText(taskList, place?.sessionId ?? '', place?.isMainCheckout ?? true, await currentName($))
    if (status === lastStatus) return

    lastStatus = status
    $.ui.status(status)
}

/** 读本项目的状态文件：内容没变不写状态；不存在就是没有进行中需求，显示空态不报错 */
const readProgress = async ($: Dollar): Promise<void> => {
    const place = await read($, workplace)
    if (place === null) return

    const text = await readText($, place.statePath)
    if (text === lastStateText) return

    lastStateText = text
    const next = text.trim() === '' ? progressDefault() : parseProgress(text)
    await update($, progress, () => next)
    await showStatus($, next.taskList)
}

/**
 * 写之前现读一遍状态文件：不存在为空列表；读不懂或有不合格的需求时不写，免得把别人的内容冲掉。
 * @param $ 引擎接口
 * @param place 当前项目
 * @returns 需求列表，不能写时返回原因
 */
const readTasks = async ($: Dollar, place: WorkplaceType): Promise<ProgressTaskType[] | string> => {
    const text = await readText($, place.statePath)
    if (text.trim() === '') return []

    const parsed = parseProgress(text)
    return parsed.error ? `${parsed.error}，先修好再写` : parsed.taskList
}

/**
 * 面板开工时写回状态文件（version 2）并立即刷新面板与状态行；写失败不抛出，返回原因，口径同进度工具。
 * @param $ 引擎接口
 * @param place 当前项目
 * @param taskList 要写的条目
 * @returns 写失败的原因，成功为 ''
 */
const writeTasks = async ($: Dollar, place: WorkplaceType, taskList: readonly ProgressTaskType[]): Promise<string> => {
    const text = stringifyState(taskList)
    try {
        await $.fs.write(place.statePath, text)
    } catch (cause) {
        return `写 ${place.statePath} 失败（${describeError(cause)}）`
    }
    try {
        await showProgress($, text)
    } catch (cause) {
        $.ui.log(`进度已写入，刷新工作面板失败：${describeError(cause)}`, { to: 'debug' })
    }

    return ''
}

/** 按状态文件原文刷新面板与状态行；写入后调用时出错不影响已写入的内容，下一轮轮询会再读 */
const showProgress = async ($: Dollar, text: string): Promise<void> => {
    lastStateText = text
    const next = parseProgress(text)
    await update($, progress, () => next)
    await showStatus($, next.taskList)
}

/**
 * 打开或收起面板；由收起变为打开时自动刷新一次待办，重复打开不重复拉。没画出来时提示：用户自己运行 show 时不再建议运行 show。
 * @param $ 引擎接口
 * @param want 开或关
 * @param isAsked 是否用户亲自敲的 /xiaoxiaoli show
 */
const applyPane = async ($: Dollar, want: PaneWant, isAsked = false): Promise<void> => {
    if (want === 'hide') {
        paneShown = false
        await $.ui.close({ id: PANE_ID })
        return
    }

    const opened = await $.ui.open({ id: PANE_ID, title: fullNameOf(await currentName($)) })
    if (!opened.isPlaced) $.ui.toast(await say($, isAsked ? PANE_WAIT_ASKED_TEXT : PANE_WAIT_TEXT))
    if (paneShown) return

    paneShown = true
    await refreshTodos($)
}

/** 自己改开关时同步写环境变量，让小克的按钮和轮询看到同一个值 */
const setPaneEnv = async ($: Dollar, want: PaneWant): Promise<void> => {
    lastEnv = want
    await $.env.set('XIAOXIAOLI_PANE', want)
}

/** 每 0.5 秒看一眼 XIAOXIAOLI_PANE，值变成 show / hide 时开关面板 */
const pollPane = async ($: Dollar): Promise<void> => {
    const current = await $.env.get('XIAOXIAOLI_PANE')
    const want = paneChange(lastEnv, current)
    lastEnv = current
    if (want !== undefined) await applyPane($, want)
}

/** 切换本项目 / 全部项目：清空旧列表再拉 */
const switchScope = async ($: Dollar): Promise<void> => {
    const meta = await read($, todoMeta)
    const scope: TodoScope = meta.scope === 'project' ? 'all' : 'project'
    await $.store.set('scope', scope)
    await update($, todoMeta, i => ({ ...i, scope, refreshedAt: 0, error: '' }))
    await update($, todoList, () => [])
    await refreshNow($)
}

/**
 * 启动命令写进剪贴板、打一行在对话里（复制失败也能从那里拿），面板上显示并提示。
 * @param $ 引擎接口
 * @param next 命令，isCopied 由这里定
 * @param surface 点开工的表面
 */
const showLaunch = async ($: Dollar, next: Omit<LaunchType, 'isCopied'>, surface: RenderSurface): Promise<void> => {
    let isCopied = false
    try {
        isCopied = (await $.ui.copy({ text: next.command, surface })).isCopied
    } catch {
        isCopied = false
    }
    await update($, launch, () => ({ ...next, isCopied }))
    const paste = PASTE_TEXT[next.shell ?? 'powershell']
    const name = await currentName($)
    $.ui.log(`${name} ${next.id} 启动命令（${paste}）：${next.command}`)
    $.ui.toast(noticeText(name, isCopied ? `${next.id} 的启动命令已复制，${paste}` : `${next.id} 的启动命令复制失败，从对话里那行复制`))
}

/**
 * 往会话里发一段话（当作用户说的）并给出提示：会话正忙时引擎把它排到正在跑的这一轮之后，提示写「已排队」。开工与设置引导共用。
 * @param $ 引擎接口
 * @param text 发出的消息
 * @param short 提示里的简称，如「开工 <长 ID>」「设置工作台」
 * @param isQueued 会话是否正忙
 * @returns 给用户的提示
 */
const submitPrompt = async ($: Dollar, text: string, short: string, isQueued: boolean): Promise<string> => {
    await $.prompt.submit({ text, asUser: true })

    return say($, isQueued ? `会话正忙，已排队：${short}` : `已发出：${short}`)
}

/** 开工要用的一组值 */
interface StartPlanType {
    todo: TodoType
    /** 分流用的短 ID：一般是待办自己的；挂在需求某一步下的 TAPD 任务为所在需求的 */
    id: string
    place: WorkplaceType
    current: WorkbenchConfigType
    /** 状态文件现读的条目，重新开工时已换成重置后的 */
    taskList: ProgressTaskType[]
    /** 分流用的条目（待办自己的，或任务所在的需求），状态文件里没有为 undefined；重新开工时为重置后的 */
    entry: ProgressTaskType | undefined
    /** entry 是不是待办自己的条目（不是任务所在的需求），是才顺带补记 TAPD 项目 ID */
    isOwn: boolean
    /** 是否重置过条目（重新开工），是则不论走哪条路都要先写回状态文件 */
    isChanged: boolean
    updatedAt: string
    surface: RenderSurface
    /** 开工这一刻生效的工作流：新条目按它建步骤，branch 为 false 时不建分支 */
    active: ActiveWorkflowType
}

/** 待办开工后记成哪种条目：缺陷走工作流的 bug 组，需求与任务走 story 组 */
const kindOf = (todo: TodoType): ProgressKind => (todo.kind === 'bug' ? 'bug' : 'story')

/** 状态文件写失败时的提示：说明没开工、没有写入与原因 */
const notStartedText = async ($: Dollar, reason: string): Promise<string> => say($, `没开工，${reason}，没有写入`)

/**
 * 在本会话开工：发出「开工 <长 ID>」（全局模式带流程指引、取工作流的一句与 TAPD 评论署名）；状态文件里没有的新建条目
 * （按当时生效的工作流建步骤，记上 TAPD 项目 ID）并记到本会话，重新开工时先写回重置后的条目；会话忙时排队到空闲再发；
 * 写状态文件失败时提示并不发
 */
const submitHere = async ($: Dollar, { todo, id, place, taskList, entry, isChanged, updatedAt, active }: StartPlanType, isQueued: boolean): Promise<void> => {
    const sessionId = place.sessionId || undefined
    const kind = entry?.kind ?? kindOf(todo)
    const created =
        entry === undefined
            ? newTask({ id, kind, title: todo.title, updatedAt, workspaceId: todo.workspaceId, sessionId, detail: '本会话开工', flow: flowOf(active, kind) })
            : undefined
    const nextList = created === undefined ? taskList : upsertTask(taskList, created)
    const failed = created !== undefined || isChanged ? await writeTasks($, place, nextList) : ''
    if (failed) return $.ui.toast(await notStartedText($, failed))

    /* 全局模式一并给出通用资料目录；本会话里 AI 用到时自己建文件，这里不必先建目录 */
    const sharedDir = place.mode === 'global' ? await sharedDirOf($) : ''
    const text = submitText({ longId: todo.id, dataDir: place.dataDir, fullName: fullNameOf(await currentName($)), kind, sharedDir })
    $.ui.toast(await submitPrompt($, text, `开工 ${todo.id}`, isQueued))
}

/**
 * 开新会话：生效的工作流不建分支（branch 为 false）时走 offerHereSession；否则需求记上新会话 ID、分支与 worktree，再给出启动命令。
 * --add-dir 项目内模式给主工作区的 docs/xiaoli（worktree 里没有这个被忽略的目录），全局模式给全局项目目录
 * （新会话里的 AI 读写项目资料用；mod 读写状态文件走绝对路径，不靠它）。
 * 短 ID 不是纯数字时不生成命令也不写状态文件；写状态文件失败时提示并不给命令。命令写法按主工作区路径选（PowerShell 或 bash/zsh）。
 * 新建的条目按当时生效的工作流建步骤、记上待办所属的 TAPD 项目 ID；已有的待办自己的条目没记时顺带补上（任务所在的需求不补）。
 */
const offerNewSession = async ($: Dollar, plan: StartPlanType): Promise<void> => {
    if (!plan.active.workflow.branch) return offerHereSession($, plan)

    const { todo, id, place, current, taskList, entry, isOwn, updatedAt, surface, active } = plan
    if (!isShortId(id)) return $.ui.toast(await say($, `没开工，短 ID「${id}」不是纯数字，不能拼进分支名，没有生成启动命令`))

    const kind = entry?.kind ?? kindOf(todo)
    const worktree = worktreeOf(place.dir, id)
    const branch = branchOf(kind === 'bug' ? current.bugBranchTemplate : current.branchTemplate, id)
    const sessionId = crypto.randomUUID()
    const fullName = fullNameOf(await currentName($))
    const sharedDir = place.mode === 'global' ? await ensureSharedDir($) : ''
    const prompt = startPrompt({ longId: todo.id, worktree, branch, root: place.dir, dataDir: place.dataDir, fullName, kind, sharedDir })
    const addDir = place.mode === 'global' ? place.dataDir : docsDirOf(place.dir)
    const command = newSessionCommand({ root: place.dir, worktree, branch, base: current.branchBase, sessionId, id, prompt, addDir, sharedDir })
    const workspace = isOwn && entry?.workspaceId === undefined ? { workspaceId: todo.workspaceId } : {}
    const flow = flowOf(active, kind)
    const task = entry
        ? { ...entry, ...workspace, sessionId, branch, worktree, updatedAt }
        : newTask({ id, kind, title: todo.title, updatedAt, workspaceId: todo.workspaceId, branch, sessionId, worktree, detail: '等新终端运行启动命令', flow })
    const failed = await writeTasks($, place, upsertTask(taskList, task, entry))
    if (failed) return $.ui.toast(await notStartedText($, failed))

    await showLaunch($, { id, kind: 'new', command, shell: shellOf(place.dir) }, surface)
}

/**
 * 不建分支的工种开新会话：不生成 worktree 与分支，给一条在项目目录直接起 claude 的命令（PowerShell 或 bash/zsh，引号规则同建分支的命令），
 * 项目不在 git 仓库里也能用。条目记上新会话 ID，不记分支与 worktree（已有条目原来记的也去掉，免得回到已有会话时进错目录）。
 * 短 ID 不是纯数字时不生成命令也不写状态文件；写状态文件失败时提示并不给命令。
 */
const offerHereSession = async ($: Dollar, { todo, id, place, taskList, entry, isOwn, updatedAt, surface, active }: StartPlanType): Promise<void> => {
    if (!isShortId(id)) return $.ui.toast(await say($, `没开工，短 ID「${id}」不是纯数字，不能拼进启动命令，没有生成启动命令`))

    const kind = entry?.kind ?? kindOf(todo)
    const sessionId = crypto.randomUUID()
    const fullName = fullNameOf(await currentName($))
    const sharedDir = place.mode === 'global' ? await ensureSharedDir($) : ''
    const prompt = herePrompt({ longId: todo.id, root: place.dir, dataDir: place.dataDir, fullName, kind, sharedDir })
    const addDir = place.mode === 'global' ? place.dataDir : docsDirOf(place.dir)
    const command = hereSessionCommand({ dir: place.dir, sessionId, id, prompt, addDir, sharedDir })
    const workspace = isOwn && entry?.workspaceId === undefined ? { workspaceId: todo.workspaceId } : {}
    const moved: ProgressTaskType | undefined = entry === undefined ? undefined : { ...entry, ...workspace, sessionId, updatedAt }
    if (moved !== undefined) {
        delete moved.branch
        delete moved.worktree
    }
    const task =
        moved ?? newTask({ id, kind, title: todo.title, updatedAt, workspaceId: todo.workspaceId, sessionId, detail: '等新终端运行启动命令', flow: flowOf(active, kind) })
    const failed = await writeTasks($, place, upsertTask(taskList, task, entry))
    if (failed) return $.ui.toast(await notStartedText($, failed))

    await showLaunch($, { id, kind: 'here', command, shell: shellOf(place.dir) }, surface)
}

/** 开工前定下的条目：分流用哪一条、是否重置过、写回用的列表 */
interface StartEntryType {
    /** 分流用的条目：待办自己的，或任务所在的需求；没有为 undefined */
    entry: ProgressTaskType | undefined
    /** entry 是不是待办自己的条目 */
    isOwn: boolean
    /** 是否重置过 */
    isChanged: boolean
    /** 重置后的条目列表，没重置为原列表 */
    taskList: ProgressTaskType[]
}

/**
 * 定下开工用的条目：待办自己在状态文件里有条目就用它；没有、而它是挂在某个需求某一步下的 TAPD 任务，就用所在的需求（任务在需求的会话里做，
 * 不另建条目）。已完成的重新开工时先重置：待办自己的条目全部步骤回到未开始、清掉子项与等待标记（缺陷重新打开、任务重新做），
 * 挂在需求下的任务只把这个子项改回进行中、模块改回未完成，所在步骤与需求的状态不往回改。能不能重新开工由调用方先按 startButtonOf 判断。
 * @param todo 待办
 * @param taskList 状态文件现读的条目
 * @param isRestart 是否已完成后重新开工
 * @param updatedAt 更新时间
 * @returns 开工用的条目
 */
const startEntryOf = (todo: TodoType, taskList: ProgressTaskType[], isRestart: boolean, updatedAt: string): StartEntryType => {
    const short = shortId(todo.id, todo.workspaceId)
    const own = findTask(taskList, short, todo.workspaceId)
    const stepFound = own === undefined ? findStepTask(taskList, short, todo.workspaceId) : undefined
    const original = own ?? stepFound?.task
    const isOwn = stepFound === undefined
    if (!isRestart || original === undefined) return { entry: original, isOwn, isChanged: false, taskList }

    const entry =
        stepFound === undefined
            ? { ...resetTask(original, updatedAt), workspaceId: original.workspaceId ?? todo.workspaceId }
            : redoStepTask(stepFound.task, stepFound.step.key, stepFound.stepTask.id, updatedAt)
    return { entry, isOwn, isChanged: true, taskList: upsertTask(taskList, entry, original) }
}

/**
 * 第二步确认开工：只认当前选中、且仍在列表里的待办；已完成又不能重新开工的（需求、没重新打开的缺陷）不开工。按「一条需求一个会话」分流：
 * 本会话空闲且手上没有别的需求才在本会话发出「开工 <ID>」，否则给新会话或回到已有会话的启动命令，面板不自己起会话。
 * 挂在需求下的 TAPD 任务按所在需求分流；重新开工时先重置（见 startEntryOf），走哪条路都先写回。
 * 「全部项目」视图里别的 TAPD 项目的待办照样在当前仓库开工，条目记上它所属的项目 ID。
 * @param $ 引擎接口
 * @param id 待办的 TAPD 长 ID
 * @param surface 点开工的表面
 */
const startTodo = async ($: Dollar, id: string, surface: RenderSurface): Promise<void> => {
    const selected = await read($, selectedId)
    const todo = (await read($, todoList)).find(i => i.id === id)
    await update($, selectedId, () => '')
    const place = await read($, workplace)
    const current = await read($, config)
    if (id !== selected || todo === undefined || place === null || current === null) return

    const taskList = await readTasks($, place)
    if (typeof taskList === 'string') return $.ui.toast(await say($, `没开工，${taskList}`))

    const short = shortId(todo.id, todo.workspaceId)
    const startState = startStateOf(todo, taskList)
    /* 面板上不出确认行；这里再挡一次，过时或伪造的确认消息也不会把已完成的需求重新开工 */
    if (startButtonOf(todo, startState) === undefined) return $.ui.toast(await say($, `${short} ${NO_RESTART_TEXT}`))

    const updatedAt = new Date(await $.clock.now()).toISOString()
    const prepared = startEntryOf(todo, taskList, startState === 'done', updatedAt)
    const entry = prepared.entry
    const routeId = entry?.id ?? short
    const isBusy = await read($, turnBusy)
    const route = routeStart({
        taskList: prepared.taskList,
        id: routeId,
        workspaceId: entry === undefined ? todo.workspaceId : entry.workspaceId,
        sessionId: place.sessionId,
        isMainCheckout: place.isMainCheckout,
        isBusy
    })
    /* 现读一遍工作流：刚经工具或别处改过的，从这一条起生效 */
    const active = await loadWorkflow($)
    const plan: StartPlanType = { todo, id: routeId, place, current, ...prepared, updatedAt, surface, active }
    if (route === 'submit' || route === 'queue') return submitHere($, plan, route === 'queue')
    if (route === 'new') return offerNewSession($, plan)

    if (entry?.sessionId === undefined) return
    if (!isSessionId(entry.sessionId)) {
        return $.ui.toast(await say($, `${routeId} 记的会话 ID 不是 UUID 形态，没有生成回到已有会话的命令，请检查 ${place.statePath}`))
    }
    const failed = prepared.isChanged ? await writeTasks($, place, prepared.taskList) : ''
    if (failed) return $.ui.toast(await notStartedText($, failed))

    const dir = entry.worktree ?? place.dir
    await showLaunch($, { id: routeId, kind: 'resume', command: resumeCommand({ dir, sessionId: entry.sessionId }), shell: shellOf(dir) }, surface)
}

/**
 * 主会话调 mcp__xiaoxiaoli__progress：校验参数、现读状态文件、按规则改、写回，回一句当前在哪一步。
 * @param $ 引擎接口
 * @param raw 工具参数
 * @returns 给模型的结果，不能改时为 deny
 */
const runProgressTool = async ($: Dollar, raw: Record<string, unknown>): Promise<{ result: string } | { deny: string }> => {
    const input = toProgressInput(raw)
    const place = await read($, workplace)
    if (typeof input === 'string') return { deny: await say($, `参数不对，${input}，没有写入`) }
    if (place === null) return { deny: await say($, '还没定下当前项目，稍后再试，没有写入') }

    const taskList = await readTasks($, place)
    if (typeof taskList === 'string') return { deny: await say($, `${taskList}，没有写入`) }

    const updatedAt = new Date(await $.clock.now()).toISOString()
    /* 新建条目按当前生效的工作流；已有条目按它自己的步骤核 step */
    const flowFor = flowsOf(await currentWorkflow($))
    const result = applyProgress(taskList, input, { updatedAt, sessionId: place.sessionId, flowFor })
    if (typeof result === 'string') return { deny: await say($, `${result}，没有写入`) }

    const text = stringifyState(result.taskList)
    try {
        await $.fs.write(place.statePath, text)
    } catch (cause) {
        return { deny: await say($, `写 ${place.statePath} 失败（${describeError(cause)}），没有写入`) }
    }
    try {
        await showProgress($, text)
    } catch (cause) {
        $.ui.log(`进度已写入，刷新工作面板失败：${describeError(cause)}`, { to: 'debug' })
    }

    return { result: `${result.text}（已写入 ${place.statePath}）` }
}

/**
 * 工具的钩子本身失败时回给模型的话：带上失败类型与原因（前 200 字符），写没写入要看文件，不下结论。
 * @param $ 引擎接口
 * @param error 引擎给的失败说明
 * @param what 哪个工具与该看哪个文件，如「进度工具」「状态文件」
 * @returns 说明
 */
const toolFailure = async ($: Dollar, error: HookFailure, what: { tool: string; file: string }): Promise<string> => {
    const reason = error.message ? `：${error.message.slice(0, 200)}` : ''
    return say($, `${what.tool}异常（${error.kind}${reason}），是否已写入请看${what.file}`)
}

/** 进度工具的钩子本身失败时回给模型的话 */
const progressFailure = ($: Dollar, error: HookFailure): Promise<string> => toolFailure($, error, { tool: '进度工具', file: '状态文件' })

/** 绑定工具的钩子本身失败时回给模型的话，口径同进度工具 */
const bindFailure = ($: Dollar, error: HookFailure): Promise<string> => toolFailure($, error, { tool: '绑定工具', file: '全局项目配置' })

/** 起名工具的钩子本身失败时回给模型的话，口径同进度工具 */
const setupFailure = ($: Dollar, error: HookFailure): Promise<string> => toolFailure($, error, { tool: '起名工具', file: '全局档案 profile.json' })

/** 工作流工具的钩子本身失败时回给模型的话，口径同进度工具 */
const workflowFailure = ($: Dollar, error: HookFailure): Promise<string> => toolFailure($, error, { tool: '工作流工具', file: '对应的 workflow.json' })

/**
 * 把当前项目绑定到一个 TAPD 项目：写全局项目配置（原有的其他字段保留），重读配置让面板换成待办视图，下一拍刷新待办。
 * @param $ 引擎接口
 * @param project 要绑定的 TAPD 项目
 * @param branch 可选的分支设置
 * @returns 成功的说明；不能写时为原因，调用方补「没有写入」
 */
const bindProject = async ($: Dollar, project: TapdProjectType, branch: BranchFieldsType = {}): Promise<{ text: string } | { reason: string }> => {
    const place = await read($, workplace)
    if (place === null) return { reason: '还没定下当前项目，稍后再试' }
    if (place.isGlobalRootMissing) return { reason: NO_GLOBAL_ROOT_TEXT }
    if (place.mode !== 'global') return { reason: `本项目用项目内配置 ${place.configPath}，全局绑定不生效，要改请直接编辑它` }

    const projectName = project.name || project.id
    const text = bindConfigText(await readText($, place.configPath), { projectName, tapdWorkspaceId: project.id, root: place.dir, ...branch })
    try {
        await $.fs.write(place.configPath, text)
    } catch (cause) {
        return { reason: `写 ${place.configPath} 失败（${describeError(cause)}）` }
    }

    await update($, binding, i => ({ ...i, selectedId: '' }))
    await update($, todoList, () => [])
    await update($, todoMeta, i => ({ ...i, refreshedAt: 0, error: '', todoLoading: true }))
    await loadConfig($)
    $.clock.after(1, () => void refreshNow($))

    /* 原来记着不用 TAPD 的，bindConfigText 已把 systems.tapd 改回 true */
    const tapdNote = place.systems?.tapd === false ? '；本项目原来记着不用 TAPD，已改回用' : ''
    return { text: `已把本项目（${place.name}）绑定到 TAPD 项目「${projectName}」（${project.id}），写入 ${place.configPath}${tapdNote}` }
}

/**
 * 面板上第二步确认绑定：只认当前选中、且仍在列表里的项目，伪造的确认消息不写。
 * @param $ 引擎接口
 * @param id TAPD 项目 ID
 */
const bindFromPane = async ($: Dollar, id: string): Promise<void> => {
    const state = await read($, binding)
    const project = state.list.find(i => i.id === id)
    await update($, binding, i => ({ ...i, selectedId: '' }))
    if (id !== state.selectedId || project === undefined) return

    const result = await bindProject($, project)
    $.ui.toast(await say($, 'reason' in result ? `没有绑定，${result.reason}` : `已绑定 TAPD 项目「${project.name || project.id}」，正在拉待办`))
}

/**
 * 主会话调 mcp__xiaoxiaoli__bind：校验参数，项目内模式直接拒绝；拉参与的项目按名字或 ID 找到唯一一个再写全局项目配置。
 * @param $ 引擎接口
 * @param raw 工具参数
 * @returns 给模型的结果，不能写时为 deny
 */
const runBindTool = async ($: Dollar, raw: Record<string, unknown>): Promise<{ result: string } | { deny: string }> => {
    const input = toBindInput(raw)
    const place = await read($, workplace)
    if (typeof input === 'string') return { deny: await say($, `参数不对，${input}，没有写入`) }
    if (place === null) return { deny: await say($, '还没定下当前项目，稍后再试，没有写入') }
    if (place.isGlobalRootMissing) return { deny: await say($, `${NO_GLOBAL_ROOT_TEXT}，没有写入`) }
    if (place.mode !== 'global') return { deny: await say($, `本项目用项目内配置 ${place.configPath}，全局绑定不生效，没有写入`) }

    let projectList: TapdProjectType[]
    try {
        projectList = await fetchWorkspaces(createTapdCall($))
    } catch (cause) {
        $.ui.log(`绑定时拉参与的项目失败：${toErrorKind(cause)}，${describeError(cause)}`, { to: 'debug' })
        return { deny: await say($, `拉参与的 TAPD 项目失败（${toErrorKind(cause)}），没有写入`) }
    }
    const project = matchProject(projectList, input.project)
    if (typeof project === 'string') return { deny: await say($, `${project}，没有写入`) }

    const branch = { branchTemplate: input.branchTemplate, bugBranchTemplate: input.bugBranchTemplate, branchBase: input.branchBase }
    const result = await bindProject($, project, branch)
    if ('reason' in result) return { deny: await say($, `${result.reason}，没有写入`) }

    return { result: `${result.text}；工作面板马上刷新待办` }
}

/**
 * /xiaoxiaoli unbind：清掉当前项目的全局绑定，只去掉 TAPD 项目两项，其余设置与状态文件不动，面板回到绑定列表；项目内配置不受影响。
 * @param $ 引擎接口
 * @returns 命令输出文字
 */
const unbindProject = async ($: Dollar): Promise<string> => {
    const current = await loadConfig($)
    const place = await read($, workplace)
    if (place === null) return say($, '还没定下当前项目，稍后再试')
    if (place.isGlobalRootMissing) return say($, `${NO_GLOBAL_ROOT_TEXT}，没有可解除的全局绑定`)
    if (place.mode !== 'global') return say($, `本项目用项目内配置 ${place.configPath}，unbind 只清全局绑定，项目内配置没动`)
    if (current === null) return say($, '本项目还没绑定 TAPD 项目，不用解除')

    try {
        await $.fs.write(place.configPath, unbindConfigText(await readText($, place.configPath)))
    } catch (cause) {
        return say($, `写 ${place.configPath} 失败（${describeError(cause)}），没有解除`)
    }

    await update($, todoList, () => [])
    await update($, selectedId, () => '')
    await update($, launch, () => null)
    await update($, binding, i => ({ ...i, selectedId: '' }))
    await update($, todoMeta, i => ({ ...i, refreshedAt: 0, error: '' }))
    await refreshNow($)

    return say($, `已解除本项目（${place.name}）与 TAPD 项目「${current.projectName}」的绑定；进行中区与 state.json 不动，工作面板重新列出 TAPD 项目供绑定`)
}

/** 工种不对时的说法 */
const ROLE_WRONG_TEXT = `工种只能是 ${ROLE_CHOICES_TEXT}（或 ${WORK_ROLES.join('、')}）`

/** 改了工种之后的说法：从下一条新开工的条目起按哪份工作流，本项目有自定义时说明仍以自定义为准 */
const roleEffectText = (role: WorkRole, active: ActiveWorkflowType): string => {
    const head = `工种：${ROLE_TITLES[role]}`
    if (active.source === 'project' || active.source === 'personal') return `${head}（本项目生效的仍是${active.label}工作流，它优先于内置）`
    if (active.source === 'repo') return `${head}（本项目是项目内模式，沿用前端步骤，工种对它不生效）`

    return `${head}，从下一条新开工的条目起按${active.label}的工作流，进行中的条目不受影响`
}

/**
 * 主会话调 mcp__xiaoxiaoli__setup：name 与 role 至少给一个；校验后写全局档案（别的字段保留；给了名字改 name 并去掉 skipped，
 * 给了工种改 role）、换上新名字，改了工种重读工作流。不合格、取不到全局根目录、档案版本比本 mod 新、写文件失败都如实拒绝，不写入。
 * @param $ 引擎接口
 * @param raw 工具参数
 * @returns 给模型的结果，不能写时为 deny
 */
const runSetupTool = async ($: Dollar, raw: Record<string, unknown>): Promise<{ result: string } | { deny: string }> => {
    if (raw.name === undefined && raw.role === undefined) return { deny: await say($, '参数不对，name 与 role 至少给一个，没有写入') }

    const checked = raw.name === undefined ? undefined : checkName(raw.name)
    if (checked !== undefined && 'reason' in checked) return { deny: await say($, `参数不对，${checked.reason}，没有写入`) }

    const role = raw.role === undefined ? undefined : toRole(raw.role)
    if (raw.role !== undefined && role === undefined) return { deny: await say($, `参数不对，${ROLE_WRONG_TEXT}，没有写入`) }

    /* 走到这里 name 与 role 至少有一个合格 */
    const change: ProfileChangeType | undefined =
        checked !== undefined ? { name: checked.name, ...(role === undefined ? {} : { role }) } : role === undefined ? undefined : { role }
    if (change === undefined) return { deny: await say($, '参数不对，name 与 role 至少给一个，没有写入') }

    const saved = await saveProfile($, change)
    if ('reason' in saved) return { deny: await say($, `${saved.reason}，没有写入`) }
    /* 换了工种，面板上的体检缺项按新工种的依赖重算 */
    if (role !== undefined) await loadEnv($)

    const partList = [
        ...(checked === undefined ? [] : [`工作台现在叫 ${fullNameOf(checked.name)}`]),
        ...(role === undefined ? [] : [roleEffectText(role, await loadWorkflow($))])
    ]
    const nameNote = checked === undefined ? '' : '；工作面板标题栏、提示前缀与 TAPD 评论署名已换成新名字'
    return { result: `${partList.join('；')}（已写入 ${saved.path}${nameNote}）` }
}

/**
 * /xiaoxiaoli role [工种]：不经过 AI，直接改工种（认中文名或 id）；不带参数时回当前工种、可选项与本项目生效的工作流。
 * @param $ 引擎接口
 * @param value 工种原文（命令参数去掉 role 之后的部分）
 * @returns 命令输出文字
 */
const runRoleCommand = async ($: Dollar, value: string): Promise<string> => {
    if (value === '') {
        const state = await loadProfile($)
        const how = state.role === '' ? '（没设，按前端）' : ''
        const active = await loadWorkflow($)
        return say($, `工种：${ROLE_TITLES[roleOf(state)]}${how}；本项目生效的工作流：${active.label}；可选 ${ROLE_CHOICES_TEXT}，改用 /xiaoxiaoli role <工种>`)
    }

    const role = toRole(value)
    if (role === undefined) return say($, `没改，${ROLE_WRONG_TEXT}`)
    if ((await readGlobalRoot($)) === '') return say($, `没改，${NO_GLOBAL_ROOT_TEXT}，工种存不了，没有写入`)

    const saved = await saveProfile($, { role })
    if ('reason' in saved) return say($, `没改，${saved.reason}，没有写入`)
    await loadEnv($)

    return say($, `已改，${roleEffectText(role, await loadWorkflow($))}（写入 ${saved.path}）`)
}

/**
 * workflow 工具 set、reset 写哪个文件：personal 为全局根目录下的 workflow.json；project 为全局项目目录下的，
 * 项目内模式没有全局项目目录（不往项目仓库写），取不到全局根目录两层都写不了。
 * @param $ 引擎接口
 * @param scope 哪一层
 * @returns 文件路径，写不了时为原因
 */
const workflowTarget = async ($: Dollar, scope: 'project' | 'personal'): Promise<{ path: string } | { reason: string }> => {
    const globalRoot = await readGlobalRoot($)
    if (globalRoot === '') return { reason: NO_GLOBAL_ROOT_TEXT }
    if (scope === 'personal') return { path: joinDir(globalRoot, WORKFLOW_FILE) }

    const place = await read($, workplace)
    if (place === null) return { reason: '还没定下当前项目，稍后再试' }
    if (place.mode !== 'global') {
        return { reason: `本项目用项目内配置 ${place.configPath}（流程按项目内文档约定），没有全局项目目录，项目自定义工作流存不了；要对所有项目生效可用 scope personal` }
    }

    return { path: joinDir(place.dataDir, WORKFLOW_FILE) }
}

/** 改完工作流后的说法：本项目现在生效的是哪份；项目内模式说明个人自定义对它不生效 */
const workflowEffectText = (active: ActiveWorkflowType): string =>
    active.source === 'repo'
        ? '本项目是项目内模式，沿用前端步骤，自定义工作流对它不生效（对全局模式的项目生效）'
        : `本项目现在生效的是：${active.label}`

/**
 * 主会话调 mcp__xiaoxiaoli__workflow：get 返回生效的工作流（来源加定义 JSON，可只要一组）；set 校验定义后写到项目或个人的 workflow.json
 * （规范后的定义，版本写 1）；reset 清空那一层（mod 不删文件，空文件等于没有自定义），回到下一层。
 * 参数或定义不合格、取不到全局根目录、项目没有全局项目目录、那一层的文件版本比本 mod 新、写文件失败都如实拒绝，不写入。
 * @param $ 引擎接口
 * @param raw 工具参数
 * @returns 给模型的结果，不能写时为 deny
 */
const runWorkflowTool = async ($: Dollar, raw: Record<string, unknown>): Promise<{ result: string } | { deny: string }> => {
    const input = toWorkflowInput(raw)
    if (typeof input === 'string') return { deny: await say($, `参数不对，${input}，没有写入`) }
    if (input.action === 'get') return { result: workflowText(await loadWorkflow($), input.kind) }

    const checked = input.action === 'set' ? checkWorkflow(input.definition) : undefined
    if (checked !== undefined && 'reason' in checked) return { deny: await say($, `definition 不合格：${checked.reason}，没有写入`) }

    const target = await workflowTarget($, input.scope)
    if ('reason' in target) return { deny: await say($, `${target.reason}，没有写入`) }

    const old = parseWorkflow(await readText($, target.path))
    if ('isNewer' in old && old.isNewer) return { deny: await say($, `${target.path} 的版本比本 mod 新，先更新 mod，没有写入`) }

    const label = scopeLabel(input.scope)
    if (checked === undefined && 'isEmpty' in old) {
        return { result: `${label}本来就没有自定义工作流（${target.path}），没有改动；${workflowEffectText(await loadWorkflow($))}` }
    }

    const text = checked === undefined ? '' : workflowFileText(checked.workflow)
    try {
        await $.fs.write(target.path, text)
    } catch (cause) {
        return { deny: await say($, `写 ${target.path} 失败（${describeError(cause)}），没有写入`) }
    }

    const effect = workflowEffectText(await loadWorkflow($))
    if (checked === undefined) return { result: `已清空${label}工作流（${target.path}；mod 不删文件，空文件等于没有自定义），回到下一层；${effect}；进行中的条目不受影响` }

    return { result: `已写入${label}工作流（${target.path}）；从下一条新开工的条目起生效，进行中的条目按各自开工时的步骤走、不受影响；${effect}` }
}

/**
 * 是否该在设置引导里顺带问 TAPD 项目：全局模式还没绑定（项目内模式、取不到全局根目录时绑定工具本就不写，不问）。
 * @param $ 引擎接口
 * @returns 是否没绑定
 */
const isUnboundNow = async ($: Dollar): Promise<boolean> => {
    const current = await loadConfig($)
    const place = await read($, workplace)
    /* 记着不用 TAPD 的项目不问绑定 */
    return current === null && place?.mode === 'global' && !isTapdOff(place)
}

/**
 * 命令里发起的设置引导或演练，在下一拍发出：失败时记日志并提示，不抛出。
 * @param $ 引擎接口
 * @param text 发出的那段话
 * @param what 提示里怎么称呼它，如「设置引导」「演练」
 * @param retry 没发出去时告诉用户怎么办
 */
const submitLater = async ($: Dollar, text: string, what: string, retry: string): Promise<void> => {
    try {
        await $.prompt.submit({ text, asUser: true })
    } catch (cause) {
        $.ui.log(`${what}没发出去：${describeError(cause)}`, { to: 'debug' })
        $.ui.toast(await say($, `${what}没发出去，${retry}`))
    }
}

/**
 * 「开始设置」与 /xiaoxiaoli setup：现读档案与配置，往会话里发一段话让 AI 用 AskUserQuestion 问名字（没绑定 TAPD 时顺带问绑定，
 * 演练还没处理过时保存后再问要不要走演练）。面板上点的立即发出，会话正忙时排到这一轮之后（同开工）；命令里不能直接发
 * （引擎拦：会等这条命令占着的那一轮），排到下一拍再发，正忙时同样由引擎排队。取不到全局根目录、档案版本比本 mod 新时不发，如实说明。
 * @param $ 引擎接口
 * @param isFromCommand 是否由 /xiaoxiaoli setup 发起
 * @returns 给用户的提示
 */
const startSetup = async ($: Dollar, isFromCommand = false): Promise<string> => {
    const state = await loadProfile($)
    if (state.path === '') return say($, `${NO_PROFILE_TEXT}，没有发起设置`)
    if (state.isNewer) return say($, `${PROFILE_NEWER_TEXT}，没有发起设置`)

    const isUnbound = await isUnboundNow($)
    const projectName = (await read($, workplace))?.name ?? ''
    const text = setupPrompt({ name: state.name, role: state.role, isUnbound, projectName, isTourOffered: await isTourAsked($, state) })
    if (!isFromCommand) return submitPrompt($, text, '设置工作台', await read($, turnBusy))

    $.clock.after(1, () => void submitLater($, text, '设置引导', '稍后再运行 /xiaoxiaoli setup，或直接用 /xiaoxiaoli name <名字> 改名'))
    return say($, '已发出：设置工作台')
}

/**
 * 面板「走一遍演练」与 /xiaoxiaoli tour：往会话里发一段话，让 AI 调 mcp__xiaoxiaoli__guide 的 start、照脚本带着走。
 * 发法同「开始设置」：面板上点的立即发出（会话正忙时排队），命令里排到下一拍再发。演练脚本 guide/tour.json 不能用时不发，如实说明。
 * 演练做过、选过不用的也能再走（就是「怎么重来」）。
 * @param $ 引擎接口
 * @param isFromCommand 是否由 /xiaoxiaoli tour 发起
 * @returns 给用户的提示
 */
const startTour = async ($: Dollar, isFromCommand = false): Promise<string> => {
    const tour = await readTour($)
    if ('reason' in tour) return say($, `演练脚本 ${TOUR_FILE} 不能用（${tour.reason}），没有发起演练`)

    const text = tourPrompt()
    if (!isFromCommand) return submitPrompt($, text, '走一遍演练', await read($, turnBusy))

    $.clock.after(1, () => void submitLater($, text, '演练', '稍后再运行 /xiaoxiaoli tour'))
    return say($, '已发出：走一遍演练')
}

/**
 * 面板上点「不用了」：现读一遍档案，仍是该出演练引导的才写 tour: declined（别的会话刚走过就不覆盖）；之后两行消失、不再显示。
 * @param $ 引擎接口
 */
const skipTour = async ($: Dollar): Promise<void> => {
    if (!isTourOffered(await loadProfile($))) return

    const saved = await saveProfile($, { tour: 'declined', tourAt: new Date(await $.clock.now()).toISOString() })
    $.ui.toast(await say($, 'reason' in saved ? `没记下「不用了」，${saved.reason}` : '好的，不走演练，工作面板上不再提示；以后想走输入 /xiaoxiaoli tour'))
}

/**
 * 面板上点「先不设」：现读一遍档案，仍是还没起名也没跳过才写 skipped（别的会话刚起了名就不覆盖）；之后引导行消失、不再提示。
 * @param $ 引擎接口
 */
const skipSetup = async ($: Dollar): Promise<void> => {
    if (!isSetupPending(await loadProfile($))) return

    const saved = await saveProfile($, { isSkipped: true })
    $.ui.toast(
        await say($, 'reason' in saved ? `没记下「先不设」，${saved.reason}` : '好的，先不设，名字用默认的；以后想起名用 /xiaoxiaoli setup，或 /xiaoxiaoli name <名字>')
    )
}

/**
 * 首次自动发起前看会话是不是在忙或不是全新启动：正在跑一轮、会话里已有用户消息（恢复或继续的会话、用户已经开口）、
 * 输入框里有草稿（用户正在打字）、classic.SessionStart 的来源不是 startup。取不到轮数时按忙处理（最保守）。
 * @param $ 引擎接口
 * @returns 不发的原因（记 debug 日志用），可以发为 ''
 */
const autoGuideBusy = async ($: Dollar): Promise<string> => {
    const source = await read($, startSource)
    if (source !== '' && source !== 'startup') return `会话来源是 ${source}`
    if (await read($, turnBusy)) return '会话正在跑一轮'

    let turns: number
    try {
        turns = await $.session.turns()
    } catch {
        return '取不到会话里的消息轮数'
    }
    if (turns > 0) return `会话里已有 ${turns} 条用户消息`

    let draft = ''
    try {
        draft = (await $.prompt.read()).text
    } catch {
        draft = ''
    }
    return draft.trim() === '' ? '' : '输入框里有草稿'
}

/**
 * 首次使用自动发起设置引导（session.start 后等 AUTO_GUIDE_DELAY_MS）：现读档案，仍是还没设置、也没被别的会话自动发起过，
 * 会话也不忙（见 autoGuideBusy），才先在 profile.json 里记下标记（guided 与本会话 ID），记成功、重读确认是本会话记的，
 * 再发出与「开始设置」同一段话（来源写首次自动发起）。用户这期间已经起了名或先不设就什么也不做；其余不满足的情况
 * 不发也不记（写失败、被别的会话抢先记了时标记不是自己的），照旧弹「第一次用」的提示，留给下一次会话。
 * @param $ 引擎接口
 */
const autoGuide = async ($: Dollar): Promise<void> => {
    /* 不发时记一行 debug 日志，照旧弹「第一次用」的提示 */
    const skip = async (reason: string): Promise<void> => {
        $.ui.log(`没有自动发起设置引导：${reason}`, { to: 'debug' })
        $.ui.toast(await say($, SETUP_HINT_TEXT))
    }
    try {
        const state = await loadProfile($)
        if (!isSetupPending(state)) return
        if (state.isGuided) return skip('别的会话已自动发起过')

        const busy = await autoGuideBusy($)
        if (busy !== '') return skip(busy)

        /* 先记标记再发：写之前 loadProfile 已重读过；写完再读一遍，同时启动的会话里只有标记还是自己的那个发出 */
        const token = (await readSessionId($)) || crypto.randomUUID()
        const saved = await saveProfile($, { guidedBy: token })
        if ('reason' in saved) return skip(`标记没记下，${saved.reason}`)
        if (guidedByOf(await readText($, saved.path)) !== token) return skip('标记被别的会话抢先记了')

        const projectName = (await read($, workplace))?.name ?? ''
        const isTourNow = await isTourAsked($, state)
        const text = setupPrompt({ name: state.name, role: state.role, isUnbound: await isUnboundNow($), projectName, isAuto: true, isTourOffered: isTourNow })
        await $.prompt.submit({ text, asUser: true })
        $.ui.toast(await say($, SETUP_AUTO_TEXT))
    } catch (cause) {
        await skip(`出错了（${describeError(cause)}）`)
    }
}

/**
 * /xiaoxiaoli name [名字]：不经过 AI，直接校验并保存；不带名字时回当前名字与用法。
 * @param $ 引擎接口
 * @param value 名字原文（命令参数去掉 name 之后的部分）
 * @returns 命令输出文字
 */
const runNameCommand = async ($: Dollar, value: string): Promise<string> => {
    if (value === '') {
        const state = await loadProfile($)
        const name = nameOf(state)
        const how = state.name === '' ? '（没起名，用的默认名）' : ''
        return say($, `工作台现在叫 ${fullNameOf(name)}${how}；改名用 /xiaoxiaoli name <名字>，或 /xiaoxiaoli setup 让 AI 来问`)
    }

    const checked = checkName(value)
    if ('reason' in checked) return say($, `没改名，${checked.reason}`)

    const saved = await saveProfile($, { name: checked.name })
    if ('reason' in saved) return say($, `没改名，${saved.reason}，没有写入`)

    return say($, `已改名，工作台现在叫 ${fullNameOf(checked.name)}（写入 ${saved.path}）`)
}

/**
 * 选中一项迭代筛选并收起列表，选择记进 $.store；只认本迭代、全部与列表里的迭代。
 * @param $ 引擎接口
 * @param pick 选中的筛选
 */
const pickIteration = async ($: Dollar, pick: string): Promise<void> => {
    const state = await read($, iteration)
    const isKnown = pick === 'current' || pick === 'all' || state.list.some(i => i.id === pick)
    await update($, iteration, i => ({ ...i, listShow: false, pick: isKnown ? pick : i.pick }))
    if (isKnown) await $.store.set('iteration', pick)
}

/** 启动命令区的两个按钮：再复制一次、收起 */
const runLaunchAction = async ($: Dollar, action: string, surface: RenderSurface): Promise<void> => {
    const shown = await read($, launch)
    if (action === ACTION_LAUNCH_CLOSE || shown === null) {
        await update($, launch, () => null)
        return
    }

    /* 带上命令写法：不带时「再复制一次」后 bash/zsh 的命令会被说成到 PowerShell 粘贴 */
    await showLaunch($, { id: shown.id, kind: shown.kind, command: shown.command, shell: shown.shell }, surface)
}

/**
 * 面板里点中一行：首次引导的「开始设置」「先不设」、演练引导的「走一遍演练」「不用了」、进出沉浸、刷新、切视图、展开或选迭代、
 * 选中待办、确认开工、启动命令的按钮、选中与确认绑定的 TAPD 项目；点其他地方取消高亮并收起迭代列表。
 * @param $ 引擎接口
 * @param action 那一行的动作
 * @param surface 点的表面，复制命令时用
 */
const runAction = async ($: Dollar, action: string, surface: RenderSurface): Promise<void> => {
    /* 首次引导的两个按钮：只在引导还显示时认，过时或伪造的消息不发起设置、不写档案；别的选中状态都不动 */
    if (action === ACTION_SETUP_START || action === ACTION_SETUP_SKIP) {
        if (!isSetupPending(await read($, profile))) return
        if (action === ACTION_SETUP_SKIP) return skipSetup($)

        $.ui.toast(await startSetup($))
        return
    }
    /* 演练引导的两个按钮：同上，只在该出演练引导时认 */
    if (action === ACTION_TOUR_START || action === ACTION_TOUR_SKIP) {
        if (!isTourOffered(await read($, profile))) return
        if (action === ACTION_TOUR_SKIP) return skipTour($)

        $.ui.toast(await startTour($))
        return
    }
    /* 进出沉浸放在最前面：选中的待办、绑定项目、迭代与启动命令都原样留着，退出后照旧 */
    if (action === ACTION_FOCUS) {
        await update($, isFocus, i => !i)
        return
    }
    if (action.startsWith(BIND_CONFIRM_PREFIX)) {
        await bindFromPane($, action.slice(BIND_CONFIRM_PREFIX.length))
        return
    }
    if (action.startsWith(BIND_PREFIX)) {
        const id = action.slice(BIND_PREFIX.length)
        await update($, binding, i => ({ ...i, selectedId: id }))
        return
    }

    await update($, binding, i => (i.selectedId ? { ...i, selectedId: '' } : i))
    if (action === ACTION_ITERATION) {
        await update($, selectedId, () => '')
        await update($, iteration, i => ({ ...i, listShow: !i.listShow }))
        return
    }
    if (action.startsWith(ITERATION_PREFIX)) {
        await update($, selectedId, () => '')
        await pickIteration($, action.slice(ITERATION_PREFIX.length))
        return
    }

    await update($, iteration, i => (i.listShow ? { ...i, listShow: false } : i))
    if (action === ACTION_LAUNCH_COPY || action === ACTION_LAUNCH_CLOSE) return runLaunchAction($, action, surface)
    if (action.startsWith(START_PREFIX)) {
        await startTodo($, action.slice(START_PREFIX.length), surface)
        return
    }
    if (action.startsWith(TODO_PREFIX)) {
        const id = action.slice(TODO_PREFIX.length)
        await update($, selectedId, () => id)
        return
    }

    await update($, selectedId, () => '')
    if (action === ACTION_REFRESH) await refreshNow($)
    if (action === ACTION_SCOPE) await switchScope($)
}

/**
 * 一个资料目录的位置与两个资料文件（resources.md、secrets.env）在不在：只问在不在，不读内容。
 * @param $ 引擎接口
 * @param path 目录
 * @returns 位置与文件在不在
 */
const resourceDirOf = async ($: Dollar, path: string): Promise<ResourceDirType> => {
    const existList: ResourceDirType['existList'] = []
    for (const file of RESOURCE_FILES) {
        let isExist = false
        try {
            isExist = await $.fs.exists(joinDir(path, file))
        } catch {
            isExist = false
        }
        existList.push({ file, isExist })
    }

    return { path, existList }
}

/**
 * 本项目概况（project 工具的 get、/xiaoxiaoli project 与演练脚本共用）：现读配置、档案、工作流与体检结果，资料文件只看在不在。
 * @param $ 引擎接口
 * @returns 多行文字
 */
const projectSummary = async ($: Dollar): Promise<string> => {
    const current = await loadConfig($)
    const state = await loadProfile($)
    const active = await loadWorkflow($)
    const env = await loadEnv($)
    const place = await read($, workplace)
    const sharedDir = await sharedDirOf($)
    const isRepoMode = place?.mode !== 'global'

    return projectSummaryText({
        isRepoMode,
        dir: place?.dir ?? '',
        dirName: place?.name ?? '',
        configPath: place?.configPath ?? '',
        displayName: place?.displayName ?? '',
        tapd: current === null ? null : { name: current.projectName, id: current.tapdWorkspaceId },
        systems: place?.systems ?? {},
        shared: sharedDir === '' ? null : await resourceDirOf($, sharedDir),
        data: isRepoMode || place === null ? null : await resourceDirOf($, place.dataDir),
        workflowLabel: active.label,
        fullName: fullNameOf(nameOf(state)),
        role: { title: ROLE_TITLES[roleOf(state)], isDefault: state.role === '' },
        guide: {
            checkedText: env === null ? '' : checkedTextOf(env.checkedAt),
            missingList: env?.missingList ?? [],
            skippedList: env?.skippedList ?? [],
            tour: state.tour ?? ''
        }
    })
}

/**
 * 演练 start：现读演练脚本、项目、状态文件、档案与工作流；在状态文件里放一条演示条目（已有的重置，记到本会话），
 * 再把脚本（总规则、体检与本工种的依赖、按工作流逐环节的走法、功能点、收尾、本项目概况）回给 AI。
 * 演练脚本不能用、还没定下项目、状态文件读不懂或写失败都如实拒绝，不建演示条目；依赖清单不能用时照常开始，脚本里说明跳过体检。
 * @param $ 引擎接口
 * @returns 给模型的结果，不能开始时为 deny
 */
const runGuideStart = async ($: Dollar): Promise<{ result: string } | { deny: string }> => {
    const tour = await readTour($)
    if ('reason' in tour) return { deny: await say($, `演练脚本 ${TOUR_FILE} 不能用（${tour.reason}），没有建演示条目`) }

    await loadConfig($)
    const place = await read($, workplace)
    if (place === null) return { deny: await say($, '还没定下当前项目，稍后再试，没有建演示条目') }

    const taskList = await readTasks($, place)
    if (typeof taskList === 'string') return { deny: await say($, `${taskList}，没有建演示条目`) }

    const state = await loadProfile($)
    const active = await loadWorkflow($)
    const updatedAt = new Date(await $.clock.now()).toISOString()
    const demo = newDemoTask({ flow: flowOf(active, 'story'), updatedAt, sessionId: place.sessionId })
    const failed = await writeTasks($, place, upsertTask(taskList, demo, taskList.find(isDemoTask)))
    if (failed) return { deny: await say($, `${failed}，没有建演示条目`) }

    const role = roleOf(state)
    const deps = await readDeps($)
    const script = tourScript({
        tour: tour.tour,
        deps: 'reason' in deps ? deps : { ...deps, depList: depsOfRole(deps.depList, role) },
        roleTitle: ROLE_TITLES[role],
        workflowLabel: active.label,
        /* 演练脚本里「<工作流 id>:<步骤键>」的 id：定义里写了 id 用它（内置为工种 id），没写用来源（project、personal） */
        stepList: tourStepsOf(tour.tour, active.workflow.id ?? active.id, active.workflow.story),
        sharedDir: await sharedDirOf($),
        dataDir: place.mode === 'global' ? place.dataDir : '',
        overview: await projectSummary($)
    })
    return { result: script }
}

/**
 * 演练 check：按依赖清单整理体检结果（不认识的 id、值不对的丢掉），整份写进全局根目录的 env.json（别的字段保留），重读给面板。
 * 依赖清单不能用、没有可记的结果、取不到全局根目录、env.json 版本比本 mod 新、写失败都如实拒绝，不写入。
 * @param $ 引擎接口
 * @param results 原始结果
 * @returns 给模型的结果，不能写时为 deny
 */
const runGuideCheck = async ($: Dollar, results: Record<string, unknown>): Promise<{ result: string } | { deny: string }> => {
    const deps = await readDeps($)
    if ('reason' in deps) return { deny: await say($, `依赖清单 ${DEPS_FILE} 不能用（${deps.reason}），体检结果对不上，没有写入`) }

    const checked = toCheckResults(results, deps.depList)
    if (!Object.keys(checked.results).length) {
        const idText = deps.depList.map(i => i.id).join('、')
        return { deny: await say($, `results 里没有可记的结果（键要是依赖清单里的 id：${idText}；值只能是 ok、missing、skipped），没有写入`) }
    }

    const globalRoot = await readGlobalRoot($)
    if (globalRoot === '') return { deny: await say($, `${NO_GLOBAL_ROOT_TEXT}，体检结果存不了，没有写入`) }

    const path = joinDir(globalRoot, ENV_FILE)
    const oldText = await readText($, path)
    if (parseEnv(oldText).isNewer) return { deny: await say($, `${path} 是更新版本的 mod 写的，先更新 mod，没有写入`) }

    try {
        await $.fs.write(path, envText(oldText, { checkedAt: new Date(await $.clock.now()).toISOString(), results: checked.results }))
    } catch (cause) {
        return { deny: await say($, `写 ${path} 失败（${describeError(cause)}），没有写入`) }
    }
    await loadEnv($)

    return { result: checkReplyText(path, checked, deps.depList) }
}

/**
 * 演练 finish：移除演示条目（没有就不用清），在 profile.json 里记演练已走过（带了小结一并存，超长只存前 500 个字符），面板上不再出演练引导。
 * 两件都没做成时拒绝并说明原因；做成一件就照实回，另一件的原因写在后面。
 * @param $ 引擎接口
 * @param summary 演练小结
 * @returns 给模型的结果，都没写成时为 deny
 */
const runGuideFinish = async ($: Dollar, summary?: string): Promise<{ result: string } | { deny: string }> => {
    const doneList: string[] = []
    const failList: string[] = []
    await loadConfig($)
    const place = await read($, workplace)
    const taskList = place === null ? '还没定下当前项目' : await readTasks($, place)
    if (typeof taskList === 'string') {
        failList.push(`${taskList}，演示条目没清`)
    } else if (place !== null && taskList.some(isDemoTask)) {
        const failed = await writeTasks($, place, taskList.filter(i => !isDemoTask(i)))
        if (failed) failList.push(`${failed}，演示条目没清`)
        else doneList.push(`已移除演示条目（写入 ${place.statePath}）`)
    }

    const tourAt = new Date(await $.clock.now()).toISOString()
    /* 取不到全局根目录时 saveProfile 的说法是讲起名的，这里换成直说 */
    const saved =
        (await readGlobalRoot($)) === ''
            ? { reason: NO_GLOBAL_ROOT_TEXT }
            : await saveProfile($, { tour: 'done', tourAt, ...(summary === undefined ? {} : { summary }) })
    const isLong = summary !== undefined && [...summary.trim()].length > TOUR_SUMMARY_LIMIT
    if ('reason' in saved) failList.push(`演练走过没记下：${saved.reason}`)
    else doneList.push(`已记下演练走过${summary?.trim() ? '与小结' : ''}（写入 ${saved.path}${isLong ? `；小结超过 ${TOUR_SUMMARY_LIMIT} 个字符，只存了前 ${TOUR_SUMMARY_LIMIT} 个` : ''}），工作面板上不再出演练引导`)
    if (!doneList.length) return { deny: await say($, `${failList.join('；')}，没有写入`) }

    return { result: [...doneList, ...failList].join('；') }
}

/**
 * 主会话调 mcp__xiaoxiaoli__guide：校验参数后按 action 走 start、check、finish。
 * @param $ 引擎接口
 * @param raw 工具参数
 * @returns 给模型的结果，不能做时为 deny
 */
const runGuideTool = async ($: Dollar, raw: Record<string, unknown>): Promise<{ result: string } | { deny: string }> => {
    const input = toGuideInput(raw)
    if (typeof input === 'string') return { deny: await say($, `参数不对，${input}，没有写入`) }
    if (input.action === 'start') return runGuideStart($)
    if (input.action === 'check') return runGuideCheck($, input.results)

    return runGuideFinish($, input.summary)
}

/** 演练工具的钩子本身失败时回给模型的话，口径同进度工具 */
const guideFailure = ($: Dollar, error: HookFailure): Promise<string> =>
    toolFailure($, error, { tool: '演练工具', file: '状态文件、全局根目录的 env.json 与 profile.json' })

/**
 * 主会话调 mcp__xiaoxiaoli__project：get 返回本项目概况；set 改显示名与 systems，写全局项目配置（别的字段原样保留）后重读配置、
 * 下一拍刷新面板（tapd 改成不用就不再拉待办，改回来恢复）。参数不合格、取不到全局根目录、项目内模式、写文件失败都如实拒绝，不写入。
 * @param $ 引擎接口
 * @param raw 工具参数
 * @returns 给模型的结果，不能写时为 deny
 */
const runProjectTool = async ($: Dollar, raw: Record<string, unknown>): Promise<{ result: string } | { deny: string }> => {
    if (raw.action === 'get') return { result: await projectSummary($) }
    if (raw.action !== 'set') return { deny: await say($, '参数不对，action 只能是 get、set，没有写入') }

    const change = toProjectChange(raw)
    if (typeof change === 'string') return { deny: await say($, `参数不对，${change}，没有写入`) }

    await loadConfig($)
    const place = await read($, workplace)
    if ((await readGlobalRoot($)) === '') return { deny: await say($, `${NO_GLOBAL_ROOT_TEXT}，没有写入`) }
    if (place === null) return { deny: await say($, '还没定下当前项目，稍后再试，没有写入') }
    if (place.mode !== 'global') {
        return { deny: await say($, `本项目用项目内配置 ${place.configPath}，显示名与 systems 只存在全局项目目录，项目内模式不支持，没有写入`) }
    }

    const wasTapdOff = isTapdOff(place)
    try {
        await $.fs.write(place.configPath, projectConfigText(await readText($, place.configPath), change))
    } catch (cause) {
        return { deny: await say($, `写 ${place.configPath} 失败（${describeError(cause)}），没有写入`) }
    }

    const current = await loadConfig($)
    const next = await read($, workplace)
    const isOff = isTapdOff(next)
    if (isOff !== wasTapdOff) {
        await update($, todoMeta, i => ({ ...i, refreshedAt: 0, error: '' }))
        $.clock.after(1, () => void refreshNow($))
    }
    const name = next?.displayName ? `显示名「${next.displayName}」` : `显示名没设（用目录名 ${place.name}）`
    const tapdNote = isOff
        ? `；本项目不用 TAPD，工作面板不列 TAPD 项目、不拉待办${current === null ? '' : `（还绑着「${current.projectName}」，绑定没动）`}`
        : wasTapdOff
          ? '；工作面板恢复拉 TAPD'
          : ''
    return { result: `已更新本项目配置（${place.configPath}）：${name}；用到的系统：${systemsText(next?.systems ?? {})}${tapdNote}` }
}

/** 项目工具的钩子本身失败时回给模型的话，口径同进度工具 */
const projectFailure = ($: Dollar, error: HookFailure): Promise<string> => toolFailure($, error, { tool: '项目工具', file: '全局项目配置' })

/**
 * /xiaoxiaoli refresh 的回复：重读配置、状态文件与工作流并刷新待办。这次没拉到、进入自动重试时说正在重试；
 * 成功时的条数与面板「待办（n）」同一口径（按当前视图与迭代筛过）；自定义工作流不合格被跳过时，末尾如实带上哪一份、为什么。
 * @param $ 引擎接口
 * @returns 命令输出文字
 */
const refreshReply = async ($: Dollar): Promise<string> => {
    await refreshNow($)
    await readProgress($)
    const noticeList = (await read($, workflowState))?.noticeList ?? []
    const tail = noticeList.length ? `；工作流：${noticeList.join('；')}` : ''
    if (isTapdOff(await read($, workplace))) return say($, `${TAPD_OFF_REPLY}${tail}`)
    if ((await read($, config)) === null) {
        const place = await read($, workplace)
        if (place?.mode === 'global') return say($, `${NOT_BOUND_TEXT}${tail}`)
        /* 项目里没有 config.json、只因取不到用户目录落不了全局：如实说明；项目里有 config.json 但不合格的照旧说没配 */
        if (place?.isGlobalRootMissing) return say($, `${NO_GLOBAL_ROOT_TEXT}，只显示进行中需求`)
        return say($, '本项目没配 TAPD（缺 config.json），只显示进行中需求，见 README')
    }

    const meta = await read($, todoMeta)
    if (meta.retryCount) return say($, `这次没拉到待办（多半是 TAPD 还没连上），正在自动重试（第 ${meta.retryCount} 次），稍后看工作面板${tail}`)
    if (meta.error) return say($, `${meta.error}${tail}`)

    const shownList = filterByIteration(await read($, todoList), iterationFilterId(await read($, iteration), meta.scope))
    return say($, `已刷新，待办 ${shownList.length} 条${tail}`)
}

/**
 * /xiaoxiaoli 的参数：show / hide 开关面板并同步环境变量，refresh 重读配置并刷新待办，unbind 解除本项目的全局绑定，
 * setup 让 AI 引导起名（同面板「开始设置」），name [名字] 不经 AI 直接改名或看当前名字，role [工种] 直接改工种或看当前工种，
 * project 不经 AI 直接打印本项目概况（同 project 工具的 get），tour 让 AI 带着走一遍演练（同面板「走一遍演练」）。
 * @param $ 引擎接口
 * @param arg 命令参数
 * @param isAsked 是否用户亲自敲的命令（别的插件代跑为 false）
 * @returns 命令输出文字
 */
const runCommand = async ($: Dollar, arg: string, isAsked: boolean): Promise<string> => {
    const want = toPaneWant(arg)
    if (want !== undefined) {
        await setPaneEnv($, want)
        await applyPane($, want, isAsked)
        return say($, want === 'show' ? '工作面板已打开' : '工作面板已收起，/xiaoxiaoli show 或陪伴猫小克的「干活」再打开')
    }
    /* 第一个词是子命令，其余原样作参数（名字里可以有空格） */
    const sub = arg.split(/\s+/, 1)[0] ?? ''
    const rest = arg.slice(sub.length).trim()
    if (sub === 'name') return runNameCommand($, rest)
    if (sub === 'role') return runRoleCommand($, rest)
    if (sub === 'setup') return rest === '' ? startSetup($, true) : say($, 'setup 不带参数；直接改名用 /xiaoxiaoli name <名字>')
    if (sub === 'tour') return rest === '' ? startTour($, true) : say($, 'tour 不带参数')
    if (arg === 'project') return say($, `本项目概况\n${await projectSummary($)}`)
    if (arg === 'unbind') return unbindProject($)
    if (arg !== 'refresh') return say($, USAGE_TEXT)

    return refreshReply($)
}

/** 本 mod 的名字：自动更新取主分支上 mods/<它>/ 下的文件，插件市场安装时更新 <它>@<市场名> */
const MOD_NAME = 'xiaoxiaoli'

/**
 * 自动更新要用的外部能力（流程见 hooks/update.ts 的 runUpdateCheck）：只 GET 两个公开地址、不带请求头；
 * 只运行 claude plugin marketplace update 与 claude plugin update 两条命令；两个 mod 经进程环境变量 XIAOLI_MODS_UPDATING 错开更新，
 * 经 XIAOLI_MODS_RELOAD_AT 只发起一次 /reload-plugins。
 * @param $ 引擎接口
 * @returns 外部能力
 */
const updatePortsOf = async ($: Dollar): Promise<UpdatePortsType> => ({
    mod: MOD_NAME,
    subject: '工作面板',
    root: $.plugin.root,
    today: todayText(await $.clock.now()),
    readCheckedDay: () => $.store.get(CHECKED_DAY_KEY),
    writeCheckedDay: async day => {
        await $.store.set(CHECKED_DAY_KEY, day)
    },
    readManifest: () => readText($, joinPath($.plugin.root, MANIFEST_FILE)),
    fetchText: async url => {
        try {
            const response = await $.http.fetch(url)
            return response.ok && response.text.trim() !== '' ? response.text : null
        } catch {
            return null
        }
    },
    isBusy: () => read($, turnBusy),
    readLock: () => $.env.get('XIAOLI_MODS_UPDATING'),
    writeLock: async value => {
        await $.env.set('XIAOLI_MODS_UPDATING', value)
    },
    readReloadAt: () => $.env.get('XIAOLI_MODS_RELOAD_AT'),
    writeReloadAt: async value => {
        await $.env.set('XIAOLI_MODS_RELOAD_AT', value)
    },
    now: () => $.clock.now(),
    sleep: ms => $.clock.sleep(ms),
    run: argv => $.process.run(argv, { timeoutMs: RUN_TIMEOUT_MS }),
    canReload: async () => {
        try {
            return (await $.command.list()).some(i => i.name === 'reload-plugins' && i.source === 'builtin')
        } catch {
            return false
        }
    },
    reload: async () => {
        try {
            await $.command.run({ command: 'reload-plugins', args: '' })
        } catch (cause) {
            $.ui.log(`自动更新：发起 /reload-plugins 失败：${describeError(cause)}`, { to: 'debug' })
            $.ui.toast(await say($, '没能自动重新加载插件，输入 /reload-plugins 立即生效，或下次开会话自动生效'))
        }
    },
    notify: async notice => {
        $.ui.toast(await say($, notice.toast), { timeoutMs: NOTICE_TIMEOUT_MS })
        $.ui.log(await say($, notice.log))
    },
    log: text => $.ui.log(`自动更新：${text}`, { to: 'debug' })
})

/**
 * 会话启动后延后查一次有没有新版（每台机器每天成功查过一次就不再查）；出错只记调试日志，不打扰使用。
 * @param $ 引擎接口
 */
const checkUpdate = async ($: Dollar): Promise<void> => {
    try {
        $.ui.log(`自动更新：${await runUpdateCheck(await updatePortsOf($))}`, { to: 'debug' })
    } catch (cause) {
        try {
            $.ui.log(`自动更新出错：${describeError(cause)}`, { to: 'debug' })
        } catch {
            /* 记不了日志也不影响使用 */
        }
    }
}

/** Client 发来的数据是代码给的，先校验形状 */
const readAction = (data: unknown): string | undefined => {
    if (typeof data !== 'object' || data === null) return undefined

    const post = data as { type?: unknown; action?: unknown }
    return post.type === 'row' && typeof post.action === 'string' ? post.action : undefined
}

export const register: Register = on => {
    on('session.start', async ($, e, next) => {
        const result = await next(e)
        /* 本会话第一次跑 session.start 才算全新启动；热重载等再来的看 $.state 认出来 */
        const isFreshStart = !(await read($, isStarted))
        if (isFreshStart) await update($, isStarted, () => true)
        await $.command.register({
            name: 'xiaoxiaoli',
            description:
                'AI 工作台：show 打开工作面板，hide 收起，refresh 重读配置并刷新待办，unbind 解除本项目的全局 TAPD 绑定，setup 让 AI 引导给工作台起名，name <名字> 直接改名，role <工种> 设工种，project 看本项目的配置概况，tour 走一遍演练',
            argumentHint: '[show|hide|refresh|unbind|setup|name <名字>|role <工种>|project|tour]'
        })
        const stored = await $.store.get('scope')
        const scope: TodoScope | undefined = stored === 'project' || stored === 'all' ? stored : undefined
        if (scope !== undefined) await update($, todoMeta, i => ({ ...i, scope }))
        const storedPick = await $.store.get('iteration')
        if (typeof storedPick === 'string' && storedPick !== '') await update($, iteration, i => ({ ...i, pick: storedPick }))
        const loaded = await loadConfig($)
        const startPlace = await read($, workplace)
        /* 记着不用 TAPD 的项目不算待绑定：绑定工具照常可用，但放在 ToolSearch 后面 */
        const isUnbound = loaded === null && startPlace?.mode === 'global' && !isTapdOff(startPlace)
        /* 档案独立于项目模式：项目内模式也读全局根目录下的 profile.json */
        const startProfile = await loadProfile($)
        const isPending = isSetupPending(startProfile)
        /* 工作流与体检结果要等项目与工种定下再读 */
        await loadWorkflow($)
        await loadEnv($)
        try {
            /* 配了 TAPD 的项目把工具放进提示词里的工具列表，其余项目放在 ToolSearch 后面 */
            await $.tool.register({ name: PROGRESS_TOOL, description: PROGRESS_DESCRIPTION, inputSchema: PROGRESS_SCHEMA, isDeferred: loaded === null })
        } catch (cause) {
            $.ui.log(`进度工具注册失败：${describeError(cause)}`, { to: 'debug' })
        }
        try {
            /* 全局模式还没绑定的项目把绑定工具放进工具列表，用户口头说对应哪个 TAPD 项目时 AI 直接能调；其余放在 ToolSearch 后面 */
            await $.tool.register({ name: BIND_TOOL, description: BIND_DESCRIPTION, inputSchema: BIND_SCHEMA, isDeferred: !isUnbound })
        } catch (cause) {
            $.ui.log(`绑定工具注册失败：${describeError(cause)}`, { to: 'debug' })
        }
        try {
            /* 还没起名时把起名工具放进工具列表，设置引导里 AI 直接能调；其余放在 ToolSearch 后面 */
            await $.tool.register({ name: SETUP_TOOL, description: SETUP_DESCRIPTION, inputSchema: SETUP_SCHEMA, isDeferred: !isPending })
        } catch (cause) {
            $.ui.log(`起名工具注册失败：${describeError(cause)}`, { to: 'debug' })
        }
        try {
            /* 开工消息每次都要 AI 先 get 工作流，放进工具列表 */
            await $.tool.register({ name: WORKFLOW_TOOL, description: WORKFLOW_DESCRIPTION, inputSchema: WORKFLOW_SCHEMA, isDeferred: false })
        } catch (cause) {
            $.ui.log(`工作流工具注册失败：${describeError(cause)}`, { to: 'debug' })
        }
        try {
            /* 省 token：项目工具不常驻，放在 ToolSearch 后面 */
            await $.tool.register({ name: PROJECT_TOOL, description: PROJECT_DESCRIPTION, inputSchema: PROJECT_SCHEMA, isDeferred: true })
        } catch (cause) {
            $.ui.log(`项目工具注册失败：${describeError(cause)}`, { to: 'debug' })
        }
        try {
            /* 演练还没处理过（没走过也没选不用）时放进工具列表，设置引导与面板发起演练时 AI 直接能调；其余放在 ToolSearch 后面 */
            await $.tool.register({ name: GUIDE_TOOL, description: GUIDE_DESCRIPTION, inputSchema: GUIDE_SCHEMA, isDeferred: !isTourPending(startProfile) })
        } catch (cause) {
            $.ui.log(`演练工具注册失败：${describeError(cause)}`, { to: 'debug' })
        }
        await readProgress($)
        /* 每次会话启动面板一律收起，开关同步成 hide，小克的开关随之显示「干活」 */
        await setPaneEnv($, 'hide')
        await applyPane($, 'hide')
        $.clock.every(ENV_POLL_MS, () => void pollPane($))
        $.clock.every(PROGRESS_POLL_MS, () => void readProgress($))
        /* 首次拉待办不阻塞会话启动 */
        $.clock.after(1, () => void refreshTodos($))
        /*
         * 还没起名：本会话处理一次，热重载重跑 session.start 时看 $.state 不再重复。全新启动、有人在终端前（不是 -p 或 SDK）、
         * 这台机器还没自动发起过时，等一会儿自动发起设置引导（发不发到时再看，见 autoGuide）；否则弹「第一次用」的提示
         */
        if (isPending && !(await read($, isSetupHinted))) {
            await update($, isSetupHinted, () => true)
            const canAuto = isFreshStart && e.isInteractive && e.surface !== null && !(await read($, profile)).isGuided
            if (canAuto) $.clock.after(AUTO_GUIDE_DELAY_MS, () => void autoGuide($))
            else $.ui.toast(await say($, SETUP_HINT_TEXT))
        }
        /* 自动更新：全新启动、有人在终端前时延后查一次；热重载、-p 与 SDK 的会话不查 */
        if (isFreshStart && e.isInteractive && e.surface !== null) $.clock.after(CHECK_DELAY_MS, () => void checkUpdate($))

        return result
    })

    /* 只记下会话从哪来（startup、resume、clear、compact、fork），首次自动发起只认全新启动；照常交给后面的钩子 */
    on('classic.SessionStart', async ($, e, next) => {
        try {
            await update($, startSource, () => e.source)
        } catch (cause) {
            $.ui.log(`记会话来源失败：${describeError(cause)}`, { to: 'debug' })
        }
        return next(e)
    })

    /* 主循环一轮开始到结束之间算忙：开工时据此决定在本会话发出还是给新会话命令 */
    on('turn.start', async ($, e, next) => {
        await update($, turnBusy, () => true)
        return next(e)
    })

    on('turn.complete', async ($, e, next) => {
        if (e.agentId === undefined) await update($, turnBusy, () => false)
        return next(e)
    })

    on('tool.call', { tool: PROGRESS_TOOL_NAME }, async ($, e) => runProgressTool($, e as unknown as Record<string, unknown>)).catch(
        async ($, e, next) => (next.called ? next(e) : { deny: await progressFailure($, next.error) })
    )

    on('tool.call', { tool: BIND_TOOL_NAME }, async ($, e) => runBindTool($, e as unknown as Record<string, unknown>)).catch(
        async ($, e, next) => (next.called ? next(e) : { deny: await bindFailure($, next.error) })
    )

    /*
     * 起名工具用正则匹配名字：.claude-plugin/types 里的工具名清单是引擎保存 mod 时按当时已连接的工具生成的，
     * 新加的工具要等下次保存才进清单，写字面量在那之前过不了类型检查；按 === 匹配与这条正则等价
     */
    on('tool.call', { tool: SETUP_TOOL_PATTERN }, async ($, e) => runSetupTool($, e as unknown as Record<string, unknown>)).catch(
        async ($, e, next) => (next.called ? next(e) : { deny: await setupFailure($, next.error) })
    )

    on('tool.call', { tool: WORKFLOW_TOOL_PATTERN }, async ($, e) => runWorkflowTool($, e as unknown as Record<string, unknown>)).catch(
        async ($, e, next) => (next.called ? next(e) : { deny: await workflowFailure($, next.error) })
    )

    on('tool.call', { tool: PROJECT_TOOL_PATTERN }, async ($, e) => runProjectTool($, e as unknown as Record<string, unknown>)).catch(
        async ($, e, next) => (next.called ? next(e) : { deny: await projectFailure($, next.error) })
    )

    on('tool.call', { tool: GUIDE_TOOL_PATTERN }, async ($, e) => runGuideTool($, e as unknown as Record<string, unknown>)).catch(
        async ($, e, next) => (next.called ? next(e) : { deny: await guideFailure($, next.error) })
    )

    on('command.run', { command: 'xiaoxiaoli' }, async ($, e) => {
        const text = await runCommand($, e.args.trim(), e.origin.kind !== 'plugin')
        /* 别的插件（小克「干活」）代跑的命令不往 transcript 打字，用户亲自敲的照常回文字 */
        return e.origin.kind === 'plugin' ? {} : { text }
    })

    /* 用户手动关掉工作面板：开关同步成 hide，之后小克的「干活」才能再打开 */
    on('ui.close', async ($, e, next) => {
        const result = await next(e)
        if (e.id !== PANE_ID || e.origin.kind !== 'person') return result

        paneShown = false
        await setPaneEnv($, 'hide')
        return result
    })

    on('ui.message', async ($, e, next) => {
        const result = await next(e)
        const action = e.element === 'board' ? readAction(e.data) : undefined
        if (action !== undefined) await runAction($, action, e.surface)

        return result
    })

    on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
        const els = $.ui.resolve(e)
        const { Box, Text } = els
        const width = e.props.bodyColumns
        const profileState = await read($, profile)
        const lineList = buildBoard(
            {
                config: await read($, config),
                todoList: await read($, todoList),
                todoMeta: await read($, todoMeta),
                selectedId: await read($, selectedId),
                progress: await read($, progress),
                iteration: await read($, iteration),
                workplace: await read($, workplace),
                launch: await read($, launch),
                binding: await read($, binding),
                isFocus: await read($, isFocus),
                name: nameOf(profileState),
                isSetupPending: isSetupPending(profileState),
                isTourOffered: isTourOffered(profileState),
                env: await read($, envState)
            },
            width
        )
        if ('Client' in els) {
            return (
                <els.Client
                    key="board"
                    module="./board.tsx"
                    props={{ lineList }}
                    width={width}
                    height={lineList.length}
                />
            )
        }

        /* 没有 Client 的表面（VS Code、手机）只读显示，不能点 */
        return (
            <Box flexDirection="column">
                {lineList.map(line => (
                    <Text wrap="truncate-end">{line.segList.map(i => i.text).join('')}</Text>
                ))}
            </Box>
        )
    })
}
