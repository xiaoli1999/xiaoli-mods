/**
 * @description 项目差异与通用资料：全局项目配置里的 displayName（面板上显示的名字）与 systems（本项目用不用某个系统）的读取、校验、合并写回，
 * 通用资料目录 shared/ 的约定与说明文字，以及 project 工具 get 的概况文字；纯函数便于测试
 * @author xiao li
 * @createDate 2026-11-12 20:00
 */

/** 通用资料目录：全局根目录下，放各项目通用的 resources.md、secrets.env，由 AI 用到时创建和维护，mod 不读内容 */
export const SHARED_DIR = 'shared'
/** 资料文件：两处（通用、项目）都只看存在与否，不读内容 */
export const RESOURCE_FILES = ['resources.md', 'secrets.env'] as const
/** 生成新会话命令前确保通用资料目录存在时写的说明文件 */
export const SHARED_README_FILE = 'README.md'
/** 说明文件的内容：只写用途，不放资料 */
export const SHARED_README_TEXT = [
    '# 通用资料目录',
    '',
    '各项目通用的资料放在这里，由会话里的 AI 在用到时创建和维护：',
    '',
    '- resources.md：通用的地址、命令、发版方式等',
    '- secrets.env：通用的测试账号等',
    '',
    '某个项目和这里不一样时，写在它自己的项目资料目录（projects/<项目键>/）里，两处都有的以项目的为准。',
    '小小黎AI工作台 mod 不读这两个文件的内容，只看在不在。',
    ''
].join('\n')
/** 显示名最多几个字符（按码点数） */
export const DISPLAY_NAME_LIMIT = 20
/** systems 里约定的键：mod 只解释 tapd，其余只存取，供 AI 判断哪些环节跳过 */
export const SYSTEM_KEYS = ['tapd', 'yuque', 'figma', 'sentry'] as const
/** systems 的键：小写字母开头，只含小写字母、数字与 - */
const SYSTEM_KEY_PATTERN = /^[a-z][a-z0-9-]*$/
/** systems 的键最长几个字符 */
const SYSTEM_KEY_LIMIT = 32
/** 控制字符：C0（含换行、制表）、DEL、C1，外加行分隔符与段分隔符 */
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u{2028}\u{2029}]/u

/** 全局项目配置里的项目差异：显示名与用到的系统；读不懂的项当作没写 */
export interface ProjectExtrasType {
    /** 面板上显示的名字，没设为 '' */
    displayName: string
    /** 本项目用不用某个系统：true 用，false 不用，没写的键为没说（按用到处理） */
    systems: Record<string, boolean>
}

/** project 工具 set 的参数：displayName 传 '' 为清掉；systems 与已有的合并，值 null 为去掉该键 */
export interface ProjectChangeType {
    displayName?: string
    systems?: Record<string, boolean | null>
}

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

/** 码点数 */
const lengthOf = (text: string): number => [...text].length

/**
 * 是否可作 systems 的键：小写字母开头，只含小写字母、数字与 -，最多 32 个字符。
 * @param key 键
 * @returns 是否合格
 */
export const isSystemKey = (key: string): boolean => key.length <= SYSTEM_KEY_LIMIT && SYSTEM_KEY_PATTERN.test(key)

/**
 * 校验显示名：去掉首尾空白后 1 到 20 个字符（按码点数），不含控制字符。
 * @param raw 原值
 * @returns 去掉首尾空白后的名字，或不合格的原因
 */
export const checkDisplayName = (raw: unknown): { name: string } | { reason: string } => {
    if (typeof raw !== 'string') return { reason: 'displayName 要是文字' }

    const name = raw.trim()
    if (name === '') return { reason: 'displayName 去掉首尾空白后不能为空（要清掉显示名就传空字符串）' }
    if (CONTROL_PATTERN.test(name)) return { reason: 'displayName 不能含换行、制表等控制字符' }
    if (lengthOf(name) > DISPLAY_NAME_LIMIT) return { reason: `displayName 最多 ${DISPLAY_NAME_LIMIT} 个字符，现在是 ${lengthOf(name)} 个` }

    return { name }
}

/**
 * 读全局项目配置里的项目差异：displayName 合格才认，systems 只留键合格、值为 true 或 false 的项；
 * 文件读不懂、字段类型不对都当作没写，不报错。这两项和 TAPD 绑定无关，只有它们的配置不算已绑定。
 * @param text 全局项目配置全文，读不到为 ''
 * @returns 项目差异
 */
export const parseProjectExtras = (text: string): ProjectExtrasType => {
    const value = parseObject(text)
    const checked = checkDisplayName(value.displayName)
    const systems = isRecord(value.systems)
        ? Object.fromEntries(Object.entries(value.systems).filter((entry): entry is [string, boolean] => isSystemKey(entry[0]) && typeof entry[1] === 'boolean'))
        : {}

    return { displayName: 'name' in checked ? checked.name : '', systems }
}

/**
 * 校验 project 工具 set 的参数：displayName 与 systems 至少给一个；displayName 为 '' 是清掉，否则按 checkDisplayName；
 * systems 要是对象，键按 isSystemKey，值只能是 true、false 或 null（去掉该键）。
 * @param raw 工具参数
 * @returns 参数；不合格返回原因
 */
export const toProjectChange = (raw: Record<string, unknown>): ProjectChangeType | string => {
    if (raw.displayName === undefined && raw.systems === undefined) return 'displayName 与 systems 至少给一个'

    const change: ProjectChangeType = {}
    if (raw.displayName !== undefined) {
        if (raw.displayName === '') {
            change.displayName = ''
        } else {
            const checked = checkDisplayName(raw.displayName)
            if ('reason' in checked) return checked.reason
            change.displayName = checked.name
        }
    }
    if (raw.systems !== undefined) {
        if (!isRecord(raw.systems)) return 'systems 要是对象，如 { "tapd": false, "yuque": true }'

        const systems: Record<string, boolean | null> = {}
        for (const [key, value] of Object.entries(raw.systems)) {
            if (!isSystemKey(key)) return `systems 的键「${key}」要是小写字母开头、只含小写字母、数字与 - 的文字，最多 ${SYSTEM_KEY_LIMIT} 个字符`
            if (typeof value !== 'boolean' && value !== null) return `systems.${key} 只能是 true（用）、false（不用）或 null（去掉，回到没说）`
            systems[key] = value
        }
        change.systems = systems
    }

    return change
}

/**
 * 改完项目差异后全局项目配置的全文：displayName 为 '' 时去掉，否则写上；systems 与已有的合并，值 null 的去掉，合并后为空就去掉整项；
 * 文件里原有的其他字段（TAPD 绑定、分支设置等）原样保留。
 * @param oldText 原配置全文，没有为 ''
 * @param change 要改的项
 * @returns 新全文，末尾换行
 */
export const projectConfigText = (oldText: string, change: ProjectChangeType): string => {
    const next = { ...parseObject(oldText) }
    if (change.displayName !== undefined) {
        if (change.displayName === '') delete next.displayName
        else next.displayName = change.displayName
    }
    if (change.systems !== undefined) {
        const merged: Record<string, unknown> = { ...(isRecord(next.systems) ? next.systems : {}) }
        for (const [key, value] of Object.entries(change.systems)) {
            if (value === null) delete merged[key]
            else merged[key] = value
        }
        if (Object.keys(merged).length) next.systems = merged
        else delete next.systems
    }

    return `${JSON.stringify(next, null, 2)}\n`
}

/**
 * systems 的说法：只列写了的键（用 / 不用），一个没写时说按用到处理。
 * @param systems 用到的系统
 * @returns 说法，如「tapd 不用、yuque 用」
 */
export const systemsText = (systems: Readonly<Record<string, boolean>>): string => {
    const list = Object.entries(systems).map(([key, value]) => `${key} ${value ? '用' : '不用'}`)
    return list.length ? list.join('、') : '没记（没写的系统都按用到处理）'
}

/** 一个资料目录：位置与两个资料文件在不在 */
export interface ResourceDirType {
    path: string
    /** 每个资料文件在不在，键为文件名 */
    existList: { file: string; isExist: boolean }[]
}

/** project 工具 get 的概况所需的一切 */
export interface ProjectSummaryType {
    /** 是否项目内模式（显示名与 systems 不支持） */
    isRepoMode: boolean
    /** 项目目录 */
    dir: string
    /** 项目目录名 */
    dirName: string
    /** 项目配置文件的位置 */
    configPath: string
    /** 显示名，没设为 '' */
    displayName: string
    /** TAPD 绑定：没绑为 null */
    tapd: { name: string; id: string } | null
    systems: Record<string, boolean>
    /** 通用资料目录，取不到全局根目录为 null */
    shared: ResourceDirType | null
    /** 项目资料目录，项目内模式为 null */
    data: ResourceDirType | null
    /** 生效工作流的来源 */
    workflowLabel: string
    /** 工作台全称 */
    fullName: string
    /** 工种中文名与是不是没设（按前端） */
    role: { title: string; isDefault: boolean }
}

/** 一个资料目录的说法：位置与两个文件在不在 */
const resourceText = (dir: ResourceDirType): string =>
    `${dir.path}（${dir.existList.map(i => `${i.file} ${i.isExist ? '有' : '没有'}`).join('，')}）`

/**
 * project 工具 get 与 /xiaoxiaoli project 的概况：显示名与目录名、TAPD 绑定、用到的系统、两处资料目录与资料文件在不在（不读内容）、
 * 生效工作流、工作台名字与工种。项目内模式说明显示名与 systems 不支持。
 * @param summary 概况所需的一切
 * @returns 多行文字
 */
export const projectSummaryText = (summary: ProjectSummaryType): string => {
    const name = summary.displayName === '' ? `${summary.dirName}（没设显示名，用目录名）` : `${summary.displayName}（目录名 ${summary.dirName}）`
    const isTapdOff = summary.systems.tapd === false
    const tapd = summary.tapd === null ? '没绑' : `已绑「${summary.tapd.name}」（${summary.tapd.id}）`
    const lineList = [
        `项目：${name}`,
        `项目目录：${summary.dir}`,
        `项目配置：${summary.configPath}`,
        `TAPD：${tapd}${isTapdOff ? '；本项目记着不用 TAPD（systems.tapd 为 false），面板不列 TAPD 项目、不拉待办' : ''}`,
        summary.isRepoMode
            ? '用到的系统：项目内模式不支持显示名与 systems（它们只存在全局项目目录，本 mod 不往项目仓库写文件）'
            : `用到的系统：${systemsText(summary.systems)}`,
        `通用资料目录：${summary.shared === null ? '取不到用户目录，没有' : resourceText(summary.shared)}`,
        `项目资料目录：${summary.data === null ? '项目内模式没有（流程与资料按项目内文档）' : resourceText(summary.data)}；两处都有的以项目的为准`,
        `工作流：${summary.workflowLabel}`,
        `工作台：${summary.fullName}；工种：${summary.role.title}${summary.role.isDefault ? '（没设，按前端）' : ''}`
    ]

    return lineList.join('\n')
}
