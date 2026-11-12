/**
 * @description 全局模式：项目里没有 config.json 时，配置与状态放在 ~/.claude/xiaoxiaoli/projects/<项目键>
 * （只有进度文件的老项目，进度继续用项目内那份 state.json）；
 * 全局根目录、项目键、全局模式的项目、绑定与解绑写回的配置内容、绑定工具的参数校验与项目匹配
 * @author xiao li
 * @createDate 2026-11-11 10:30
 */
import type { TapdProjectType, WorkplaceType } from '../types'
import { baseName, isBranchTemplate, isRefName, normalizePath, samePath } from './workbench'

/** 全局根目录下放各项目子目录的目录名 */
export const PROJECTS_DIR = 'projects'
export const GLOBAL_CONFIG_FILE = 'config.json'
export const GLOBAL_STATE_FILE = 'state.json'
/** 绑定写进配置的两项，解绑时去掉 */
const BIND_KEYS = ['projectName', 'tapdWorkspaceId'] as const
/** 项目键里目录名部分最多几个字符 */
const KEY_NAME_LIMIT = 40
/** 目录名里不能进文件名的字符与空白，换成 - */
const UNSAFE_NAME = /[<>:"/\\|?*\u0000-\u001f\s]+/g
/** FNV-1a 32 位的初值与乘数 */
const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
/** 名字包含匹配到多个项目时，说明里最多列几个 */
const CANDIDATE_LIMIT = 8

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/** 读成对象，不是合法 JSON 对象为空对象 */
const parseObject = (text: string): Record<string, unknown> => {
    try {
        const value: unknown = JSON.parse(text)
        return isRecord(value) ? value : {}
    } catch {
        return {}
    }
}

/** 去掉对象里的几个键 */
const omit = (value: Record<string, unknown>, keyList: readonly string[]): Record<string, unknown> =>
    Object.fromEntries(Object.entries(value).filter(([key]) => !keyList.includes(key)))

/** 对象写成带缩进的 JSON 全文，末尾换行 */
const toJsonText = (value: Record<string, unknown>): string => `${JSON.stringify(value, null, 2)}\n`

/** 全局根目录的来源，都是环境变量原值 */
export interface GlobalRootSourceType {
    /** XIAOXIAOLI_HOME：直接指定全局根目录，自定义位置与测试用 */
    override?: string
    /** CLAUDE_CONFIG_DIR：Claude Code 的配置目录，设了就放在它下面 */
    configDir?: string
    /** USERPROFILE：Windows 用户目录 */
    userProfile?: string
    /** HOME：macOS、Linux 用户目录 */
    home?: string
}

/**
 * 按基准路径里的分隔符拼接：带反斜杠的按 Windows 写法，其余用正斜杠。
 * @param base 基准路径
 * @param partList 往下的各级目录或文件名
 * @returns 拼好的路径
 */
export const joinDir = (base: string, ...partList: string[]): string => {
    const separator = base.includes('\\') ? '\\' : '/'

    return [base.replace(/[\\/]+$/, ''), ...partList].join(separator)
}

/**
 * 全局根目录：XIAOXIAOLI_HOME 原样用；否则 CLAUDE_CONFIG_DIR 下的 xiaoxiaoli；否则 <用户目录>/.claude/xiaoxiaoli。
 * @param source 环境变量原值
 * @returns 全局根目录，都取不到为 ''
 */
export const globalRootOf = ({ override, configDir, userProfile, home }: GlobalRootSourceType): string => {
    if (override) return override.replace(/[\\/]+$/, '')
    if (configDir) return joinDir(configDir, 'xiaoxiaoli')

    const userDir = userProfile || home
    return userDir ? joinDir(userDir, '.claude', 'xiaoxiaoli') : ''
}

/** FNV-1a 32 位，8 位十六进制：只用来区分同名目录，不做安全用途 */
const hashText = (text: string): string =>
    [...text]
        .reduce((hash, ch) => Math.imul(hash ^ (ch.codePointAt(0) ?? 0), FNV_PRIME) >>> 0, FNV_OFFSET)
        .toString(16)
        .padStart(8, '0')

/**
 * 项目键：目录名（小写，不能进文件名的字符换成 -）加路径短哈希，同名不同路径的两个项目不会共用一份配置；
 * 哈希按规范写法算，分隔符、末尾斜杠、大小写不同的同一目录得到同一个键。
 * @param root 项目目录
 * @returns 项目键，如 fg-psd-demo-1a2b3c4d
 */
export const projectKeyOf = (root: string): string => {
    const name = baseName(root)
        .toLowerCase()
        .replace(UNSAFE_NAME, '-')
        .replace(/^[-.]+|[-.]+$/g, '')
        .slice(0, KEY_NAME_LIMIT)

    return `${name || 'project'}-${hashText(normalizePath(root))}`
}

/** 全局模式下定项目要看的情况 */
export interface GlobalPlaceInputType {
    /** 全局根目录 */
    globalRoot: string
    /** 会话目录 */
    cwd: string
    /** 仓库主工作区，不在仓库里为 '' */
    repoRoot: string
    sessionId: string
    /** 项目内已有的状态文件完整路径（只有进度文件、没有 config.json 的老项目），不传或为 '' 用全局目录的 state.json */
    projectStatePath?: string
}

/**
 * 全局模式的项目：项目目录取仓库主工作区（会话在 worktree 里也归到主工作区，同一仓库的会话共用一份），
 * 不在仓库里取会话目录；配置与状态文件在 <全局根>/projects/<项目键>/ 下。
 * 项目内已有状态文件时进度继续读写那份，不搬到全局目录，配置照常在全局目录。
 * @param input 全局根目录、会话目录、主工作区、会话 ID、项目内已有的状态文件
 * @returns 当前项目
 */
export const globalPlaceOf = ({ globalRoot, cwd, repoRoot, sessionId, projectStatePath }: GlobalPlaceInputType): WorkplaceType => {
    const dir = repoRoot || cwd
    const projectKey = projectKeyOf(dir)
    const dataDir = joinDir(globalRoot, PROJECTS_DIR, projectKey)

    return {
        dir,
        name: baseName(dir),
        statePath: projectStatePath || joinDir(dataDir, GLOBAL_STATE_FILE),
        sessionId,
        isMainCheckout: repoRoot === '' || samePath(repoRoot, cwd),
        mode: 'global',
        configPath: joinDir(dataDir, GLOBAL_CONFIG_FILE),
        dataDir,
        projectKey
    }
}

/** 开新会话的分支设置，绑定时可一并写 */
export interface BranchFieldsType {
    branchTemplate?: string
    bugBranchTemplate?: string
    branchBase?: string
}

/** 绑定写进全局项目配置的字段 */
export interface BindFieldsType extends BranchFieldsType {
    projectName: string
    tapdWorkspaceId: string
    /** 项目目录：记下来给人看这份配置属于哪个项目，查找只认项目键 */
    root: string
}

/**
 * 绑定后全局项目配置的全文：写上 TAPD 项目与项目目录，原有的其他字段（刷新间隔、分支模板、显示名、systems 等）保留，传了的分支设置覆盖；
 * 原来记着不用 TAPD（systems.tapd 为 false）的改回 true。
 * @param oldText 原配置全文，没有为 ''
 * @param fields 要写的字段
 * @returns 新全文
 */
export const bindConfigText = (oldText: string, { projectName, tapdWorkspaceId, root, ...branch }: BindFieldsType): string => {
    const rest = omit(parseObject(oldText), [...BIND_KEYS, 'root'])
    const branchSet = Object.fromEntries(Object.entries(branch).filter(entry => entry[1] !== undefined))
    const systems = rest.systems
    if (isRecord(systems) && systems.tapd === false) rest.systems = { ...systems, tapd: true }

    return toJsonText({ projectName, tapdWorkspaceId, root, ...rest, ...branchSet })
}

/**
 * 解绑后全局项目配置的全文：只去掉 TAPD 项目两项，其余设置（含显示名、systems）保留，下次绑定时沿用。
 * @param oldText 原配置全文
 * @returns 新全文
 */
export const unbindConfigText = (oldText: string): string => toJsonText(omit(parseObject(oldText), BIND_KEYS))

/** mcp__xiaoxiaoli__bind 的参数 */
export interface BindInputType extends BranchFieldsType {
    /** TAPD 项目名或项目 ID */
    project: string
}

/** 可选字符串参数：不是字符串当没给 */
const pickText = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/**
 * 校验 mcp__xiaoxiaoli__bind 的参数：参数是模型给的，逐个字段核对。
 * @param raw 工具参数
 * @returns 参数；不合格返回错误说明
 */
export const toBindInput = (raw: Record<string, unknown>): BindInputType | string => {
    const project = typeof raw.project === 'number' ? String(raw.project) : raw.project
    if (typeof project !== 'string' || !project.trim()) return 'project 要填 TAPD 项目名或项目 ID'
    if (raw.branchTemplate !== undefined && !isBranchTemplate(raw.branchTemplate)) return 'branchTemplate 要含 {id}，且只能含字母、数字与 . _ / -'
    if (raw.bugBranchTemplate !== undefined && !isBranchTemplate(raw.bugBranchTemplate)) return 'bugBranchTemplate 要含 {id}，且只能含字母、数字与 . _ / -'
    if (raw.branchBase !== undefined && !(typeof raw.branchBase === 'string' && isRefName(raw.branchBase))) return 'branchBase 只能含字母、数字与 . _ / -'

    return {
        project: project.trim(),
        branchTemplate: pickText(raw.branchTemplate),
        bugBranchTemplate: pickText(raw.bugBranchTemplate),
        branchBase: pickText(raw.branchBase)
    }
}

/**
 * 在参与的项目里找要绑定的那个：纯数字按项目 ID；否则名字完全一致（不分大小写）优先，再按名字包含；
 * 找不到或包含匹配到多个时返回说明。
 * @param projectList 当前用户参与的项目
 * @param project 项目名或项目 ID
 * @returns 项目；没有唯一结果时返回说明
 */
export const matchProject = (projectList: readonly TapdProjectType[], project: string): TapdProjectType | string => {
    const text = project.trim()
    const lower = text.toLowerCase()
    if (/^\d+$/.test(text)) {
        const found = projectList.find(i => i.id === text)
        return found === undefined ? `你参与的 TAPD 项目里没有 ID 为 ${text} 的项目` : found
    }

    const exactList = projectList.filter(i => i.name.trim().toLowerCase() === lower)
    const matchList = exactList.length ? exactList : projectList.filter(i => i.name.toLowerCase().includes(lower))
    const [only] = matchList
    if (matchList.length === 1 && only !== undefined) return only
    if (!matchList.length) return `你参与的 TAPD 项目里没有名字含「${text}」的项目`

    const nameList = matchList.slice(0, CANDIDATE_LIMIT).map(i => `${i.name}（${i.id}）`)
    return `「${text}」对上了 ${matchList.length} 个项目：${nameList.join('、')}，请给全名或项目 ID`
}
