/**
 * @description 开工分流与启动命令：一条需求一个会话。当前会话空闲且手上没有别的需求才在本会话开工，
 * 否则生成一条在新终端粘贴运行的命令（git worktree 建分支 + claude 起会话；不建分支的工种在项目目录直接起会话），面板自己不起会话；
 * 命令按项目路径选写法：Windows 路径为 PowerShell，其余（macOS、Linux）为 bash/zsh；
 * 全局模式的开工消息带上流程指引、取本项目工作流的一句与 TAPD 评论署名，因为项目里没有流程文档
 * @author xiao li
 * @createDate 2026-10-23 14:20
 */
import type { LaunchShell, ProgressKind, ProgressTaskType } from '../types'
import { DEFAULT_NAME, fullNameOf } from './profile'
import { findTask, isDemoTask, isTaskDone, ownsTask } from './workbench'

/** 开工走哪条路：本会话发出、本会话排队发出、新会话命令、回到已有会话的命令 */
export type StartRouteType = 'submit' | 'queue' | 'new' | 'resume'

/** 分流要看的情况 */
export interface StartContextType {
    taskList: readonly ProgressTaskType[]
    /** 要开工的 TAPD 短 ID */
    id: string
    /** 待办所属的 TAPD 项目 ID：条目也记了项目 ID 时要求相同，不传或条目没记只看短 ID */
    workspaceId?: string
    /** 当前会话 ID */
    sessionId: string
    /** 当前会话是否在仓库主工作区（不在某个 worktree 里） */
    isMainCheckout: boolean
    /** 当前会话是否正在跑一轮 */
    isBusy: boolean
}

/** 新会话命令的参数 */
export interface NewSessionPlanType {
    /** 仓库主工作区，绝对路径 */
    root: string
    /** worktree 目录，绝对路径 */
    worktree: string
    branch: string
    /** 分支起点 */
    base: string
    /** 新会话的 ID，命令里用 --session-id 指定，事先记进 state.json */
    sessionId: string
    /** TAPD 短 ID，作会话名 */
    id: string
    /** 发给新会话的开工提示 */
    prompt: string
    /**
     * 用 --add-dir 加进新会话的目录：不传为主工作区的 docs/xiaoli（项目内模式），全局模式传全局项目目录，'' 为不加
     */
    addDir?: string
    /** 再用一个 --add-dir 加进通用资料目录（全局模式）；不传或为 '' 不加 */
    sharedDir?: string
}

/** 流程技能的名字：随工作面板插件装的叫「插件名:技能名」，自己复制到 ~/.claude/skills 的叫技能名，两种都写上，AI 哪种都找得到 */
export const WORKFLOW_SKILL_TEXT = 'xiaoli-workflow 技能（随工作面板插件安装时名为 xiaoxiaoli:xiaoli-workflow）'

/** 全局模式（项目里没有工作台文档）开工时带给 AI 的流程指引 */
export const GLOBAL_GUIDE = `按 ${WORKFLOW_SKILL_TEXT}的流程执行，用 mcp__xiaoxiaoli__progress 推进进度；项目内有 docs/xiaoli/workflow.md 时以项目内文档为准`

/**
 * 跟在流程指引后面的署名说明：让 AI 知道 TAPD 评论末尾署什么名。
 * @param fullName 工作台全称，如「小黎AI工作台」
 * @returns 说明
 */
export const signText = (fullName: string): string => `TAPD 评论署名 ——${fullName}`

/**
 * 跟在流程指引后面、让 AI 先取本项目工作流的一句：需求与任务取 story 组，缺陷取 bug 组。
 * @param kind 条目种类
 * @returns 说明
 */
export const workflowGuide = (kind: ProgressKind): string =>
    `先调 mcp__xiaoxiaoli__workflow 取本项目工作流（kind 传 ${kind}），按它的步骤、细则与「先问」走，进度用它的步骤键，其余照技能的通用规则`

/** 新会话开工提示的参数 */
export interface StartPromptOptionsType {
    /** TAPD 长 ID */
    longId: string
    worktree: string
    branch: string
    /** 仓库主工作区 */
    root: string
    /** 全局模式的全局项目目录，项目内模式不传或为 '' */
    dataDir?: string
    /** 工作台全称，全局模式写进署名说明；不传为默认的「小黎AI工作台」 */
    fullName?: string
    /** 条目种类，全局模式定取工作流的哪一组；不传为 story */
    kind?: ProgressKind
    /** 通用资料目录，全局模式与项目资料目录一起给出；不传或为 '' 只给项目资料目录 */
    sharedDir?: string
}

/** 不建分支的新会话开工提示的参数 */
export interface HerePromptOptionsType {
    /** TAPD 长 ID */
    longId: string
    /** 项目目录（新会话在这里启动） */
    root: string
    /** 全局项目目录 */
    dataDir: string
    /** 工作台全称；不传为默认的「小黎AI工作台」 */
    fullName?: string
    /** 条目种类；不传为 story */
    kind?: ProgressKind
    /** 通用资料目录；不传或为 '' 只给项目资料目录 */
    sharedDir?: string
}

/** 本会话开工消息的参数 */
export interface SubmitTextOptionsType {
    /** TAPD 长 ID */
    longId: string
    /** 全局模式的全局项目目录，项目内模式为 '' */
    dataDir: string
    /** 工作台全称，全局模式写进署名说明；不传为默认的「小黎AI工作台」 */
    fullName?: string
    /** 条目种类，全局模式定取工作流的哪一组；不传为 story */
    kind?: ProgressKind
    /** 通用资料目录，全局模式与项目资料目录一起给出；不传或为 '' 只给项目资料目录 */
    sharedDir?: string
}

/** 不建分支的新会话命令的参数：在项目目录直接启动 claude */
export interface HereSessionPlanType {
    /** 项目目录，绝对路径 */
    dir: string
    /** 新会话的 ID，事先记进 state.json */
    sessionId: string
    /** TAPD 短 ID，作会话名 */
    id: string
    /** 发给新会话的开工提示 */
    prompt: string
    /** 用 --add-dir 加进新会话的目录，'' 为不加 */
    addDir: string
    /** 再用一个 --add-dir 加进通用资料目录；不传或为 '' 不加 */
    sharedDir?: string
}

/** 默认名的工作台全称 */
const DEFAULT_FULL_NAME = fullNameOf(DEFAULT_NAME)

/** 会话 ID 只认 UUID 形态：拼进命令前校验，免得 state.json 里被改过的值被 shell 解释 */
const SESSION_ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
/** 分支名、worktree 目录与会话名里用的短 ID 只认纯数字 */
const SHORT_ID_PATTERN = /^\d+$/

/**
 * 是否可拼进「回到已有会话」命令的会话 ID：只认 UUID 形态（十六进制字母、数字与连字符）。
 * @param text 会话 ID
 * @returns 是否合格
 */
export const isSessionId = (text: string): boolean => SESSION_ID_PATTERN.test(text)

/**
 * 是否可拼进新会话命令（分支名、worktree 目录、会话名）的短 ID：只认纯数字。
 * @param text TAPD 短 ID
 * @returns 是否合格
 */
export const isShortId = (text: string): boolean => SHORT_ID_PATTERN.test(text)

/**
 * 开工分流：这条需求本就归当前会话，空闲发出、忙时排队；归别的会话且没做完，给回到那个会话的命令；
 * 否则当前会话空闲且手上没有没做完的需求才在本会话开工，其余一律给新会话命令。条目按短 ID 与 TAPD 项目 ID 对应（见 findTask）。
 * 演练的演示条目不算「手上有活」：演练中途点真实待办开工，照常在本会话发出。
 * @param context 分流要看的情况
 * @returns 走哪条路
 */
export const routeStart = ({ taskList, id, workspaceId, sessionId, isMainCheckout, isBusy }: StartContextType): StartRouteType => {
    const task = findTask(taskList, id, workspaceId)
    if (task !== undefined && ownsTask(task, sessionId, isMainCheckout)) return isBusy ? 'queue' : 'submit'
    if (task !== undefined && task.sessionId !== undefined && !isTaskDone(task)) return 'resume'

    const isHolding = taskList.some(i => !isDemoTask(i) && !isTaskDone(i) && ownsTask(i, sessionId, isMainCheckout))
    return isBusy || isHolding ? 'new' : 'submit'
}

/** 路径用哪种分隔符：带反斜杠的按 Windows 写法 */
const separatorOf = (path: string): string => (path.includes('\\') ? '\\' : '/')

/**
 * 是否 Windows 写法的路径：带反斜杠，或以盘符开头（如 D:/work/demo）。
 * @param path 路径
 * @returns 是否 Windows 路径
 */
export const isWindowsPath = (path: string): boolean => path.includes('\\') || /^[a-zA-Z]:[\\/]/.test(path)

/**
 * 启动命令用哪种写法：Windows 路径用 PowerShell，其余（macOS、Linux）用 bash/zsh。
 * @param path 项目路径（新会话看主工作区，回到已有会话看会话所在目录）
 * @returns 命令写法
 */
export const shellOf = (path: string): LaunchShell => (isWindowsPath(path) ? 'powershell' : 'bash')

/** 面板与提示里「到哪里粘贴运行」的说法，按命令写法 */
export const PASTE_TEXT: Record<LaunchShell, string> = {
    powershell: '到新的 PowerShell 窗口粘贴运行',
    bash: '到新的终端（bash/zsh）粘贴运行'
}

/**
 * 需求的 worktree 目录：主工作区旁边的「<仓库名>-<短 ID>」。
 * @param root 主工作区
 * @param id TAPD 短 ID
 * @returns 绝对路径
 */
export const worktreeOf = (root: string, id: string): string => {
    const trimmed = root.replace(/[\\/]+$/, '')
    const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))

    return `${trimmed.slice(0, cut + 1)}${trimmed.slice(cut + 1)}-${id}`
}

/**
 * 按模板出分支名。
 * @param template 分支名模板，{id} 换成短 ID
 * @param id TAPD 短 ID
 * @returns 分支名
 */
export const branchOf = (template: string, id: string): string => template.replace(/\{id\}/g, id)

/**
 * 主工作区下的 docs/xiaoli：项目内模式下新会话在 worktree 里看不到这个被忽略的目录，用 --add-dir 加进来。
 * @param root 主工作区
 * @returns 绝对路径
 */
export const docsDirOf = (root: string): string => {
    const separator = separatorOf(root)

    return [root.replace(/[\\/]+$/, ''), 'docs', 'xiaoli'].join(separator)
}

/**
 * PowerShell 单引号字符串：里面的单引号写两遍。PowerShell 把弯单引号 ‘ ’ ‚ ‛ 也当单引号（会提前收掉字符串），
 * 它们同样写两遍；开工提示里带了工作台名字等自由文字，要靠这一条兜住
 */
const quote = (text: string): string => `'${text.replace(/['\u{2018}-\u{201b}]/gu, '$&$&')}'`

/** bash/zsh 单引号字符串：里面的单引号写成 '\''（先收引号、转义一个单引号、再开引号） */
const quoteBash = (text: string): string => `'${text.replace(/'/g, "'\\''")}'`

/**
 * 资料目录的说法：给了通用资料目录时两处一起给，并说明两处都有的以项目的为准；没给只说项目资料目录。
 * @param dataDir 项目资料目录（全局项目目录）
 * @param sharedDir 通用资料目录，'' 为不提
 * @returns 说法
 */
export const resourceDirsText = (dataDir: string, sharedDir: string): string =>
    sharedDir === '' ? `项目资料目录 ${dataDir}` : `通用资料目录 ${sharedDir}，项目资料目录 ${dataDir}（两处都有的以项目的为准）`

/** 全局模式开工消息括号里流程指引往后的部分：取工作流、资料目录、TAPD 评论署名 */
const globalTail = (kind: ProgressKind, dataDir: string, fullName: string, sharedDir: string): string =>
    `${GLOBAL_GUIDE}；${workflowGuide(kind)}；${resourceDirsText(dataDir, sharedDir)}；${signText(fullName)}`

/**
 * claude 起会话那一段：开工提示放在 --add-dir 之前。--add-dir 是可变参数选项（<directories...>），后面跟着的不带 - 的参数
 * 都会被它当成目录收走，提示放在它后面会被吞掉；放在前面、每个目录各写一个 --add-dir 就没有这个问题。
 * @param q 引号写法
 * @param plan 会话 ID、会话名、开工提示、要加进来的目录（'' 的不加）
 * @returns 命令片段
 */
const claudeStart = (q: (text: string) => string, { sessionId, id, prompt, dirList }: { sessionId: string; id: string; prompt: string; dirList: readonly string[] }): string =>
    `claude --session-id ${sessionId} -n ${q(id)} ${q(prompt)}${dirList.filter(i => i !== '').map(i => ` --add-dir ${q(i)}`).join('')}`

/**
 * 在本会话开工时发出的消息：项目内模式只发「开工 <长 ID>」，流程由项目内文档约定；
 * 全局模式项目里没有这些文档，补上流程指引、取本项目工作流的一句、通用与项目资料目录、TAPD 评论署名。
 * @param options 长 ID、全局项目目录（项目内模式为 ''）、工作台全称、条目种类、通用资料目录
 * @returns 消息
 */
export const submitText = ({ longId, dataDir, fullName = DEFAULT_FULL_NAME, kind = 'story', sharedDir = '' }: SubmitTextOptionsType): string =>
    dataDir === '' ? `开工 ${longId}` : `开工 ${longId}（${globalTail(kind, dataDir, fullName, sharedDir)}）`

/**
 * 发给新会话的开工提示：长 ID 照旧，补上 worktree 与分支；项目内模式再补主工作区的流程文档位置，
 * 全局模式补流程指引、取本项目工作流的一句、通用与项目资料目录、TAPD 评论署名。
 * @param options 长 ID、worktree、分支、主工作区、全局项目目录、工作台全称、条目种类、通用资料目录
 * @returns 提示
 */
export const startPrompt = ({
    longId,
    worktree,
    branch,
    root,
    dataDir = '',
    fullName = DEFAULT_FULL_NAME,
    kind = 'story',
    sharedDir = ''
}: StartPromptOptionsType): string => {
    const head = `开工 ${longId}（独立会话：worktree ${worktree}，分支 ${branch}；`
    if (dataDir === '') return `${head}流程文档与 state.json 在 ${docsDirOf(root)}，进度用 mcp__xiaoxiaoli__progress 写）`

    return `${head}${globalTail(kind, dataDir, fullName, sharedDir)}）`
}

/**
 * 不建分支的工种（工作流 branch 为 false）开新会话时发给它的开工提示：在项目目录直接开工，不建 worktree 与分支；
 * 其余同全局模式的开工提示。
 * @param options 长 ID、项目目录、全局项目目录、工作台全称、条目种类、通用资料目录
 * @returns 提示
 */
export const herePrompt = ({ longId, root, dataDir, fullName = DEFAULT_FULL_NAME, kind = 'story', sharedDir = '' }: HerePromptOptionsType): string =>
    `开工 ${longId}（独立会话：在项目目录 ${root}，不建分支；${globalTail(kind, dataDir, fullName, sharedDir)}）`

/**
 * 不建分支的新会话启动命令（一行）：进项目目录直接起 claude，不碰 git；会话 ID、会话名、开工提示、--add-dir 与引号规则同 newSessionCommand。
 * 项目不在 git 仓库里也能用。写法按项目目录选（见 shellOf）。短 ID 调用前要先经 isShortId 校验。
 * @param plan 命令参数
 * @returns 命令
 */
export const hereSessionCommand = ({ dir, sessionId, id, prompt, addDir, sharedDir = '' }: HereSessionPlanType): string => {
    const shell = shellOf(dir)
    const q = shell === 'powershell' ? quote : quoteBash
    const start = claudeStart(q, { sessionId, id, prompt, dirList: [addDir, sharedDir] })

    return shell === 'bash' ? `cd ${q(dir)} && ${start}` : `Set-Location ${q(dir)}; ${start}`
}

/**
 * 新会话的启动命令（一行）：worktree 不存在才用 --no-track 建分支，建好再进去起 claude；
 * --session-id 用事先记进 state.json 的 ID，-n 用短 ID 作会话名，开工提示紧跟其后，再按 addDir、sharedDir 各给一个 --add-dir
 * （顺序见 claudeStart）；短 ID 调用前要先经 isShortId 校验。写法按主工作区路径选（见 shellOf）：Windows 为 PowerShell，其余为 bash/zsh，两种逻辑一致。
 * @param plan 命令参数
 * @returns 命令
 */
export const newSessionCommand = ({ root, worktree, branch, base, sessionId, id, prompt, addDir, sharedDir = '' }: NewSessionPlanType): string => {
    const shell = shellOf(root)
    const q = shell === 'powershell' ? quote : quoteBash
    const dir = addDir ?? docsDirOf(root)
    const add = `git -C ${q(root)} worktree add --no-track -b ${branch} ${q(worktree)} ${base}`
    const start = claudeStart(q, { sessionId, id, prompt, dirList: [dir, sharedDir] })
    if (shell === 'bash') return `if [ ! -d ${q(worktree)} ]; then ${add}; fi; if [ -d ${q(worktree)} ]; then cd ${q(worktree)} && ${start}; fi`

    return `if (-not (Test-Path ${q(worktree)})) { ${add} }; if (Test-Path ${q(worktree)}) { Set-Location ${q(worktree)}; ${start} }`
}

/**
 * 回到已有会话的命令（一行）；会话 ID 不加引号，调用前要先经 isSessionId 校验。写法按会话所在目录选（见 shellOf）。
 * @param options 会话所在目录与会话 ID
 * @returns 命令
 */
export const resumeCommand = ({ dir, sessionId }: { dir: string; sessionId: string }): string =>
    shellOf(dir) === 'powershell' ? `Set-Location ${quote(dir)}; claude --resume ${sessionId}` : `cd ${quoteBash(dir)} && claude --resume ${sessionId}`
