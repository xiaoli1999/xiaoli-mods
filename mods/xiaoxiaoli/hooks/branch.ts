/**
 * @description 分支命名：模板占位符（{id} 必须有，{name} 为用户在分支名里用的名字段）、名字段的校验、分支名自检（空段、连着的分隔符、
 * git 不允许的字符）、按模板拼分支名（缺名字段或拼出来不合格时不拼）、从项目配置里读模板与起点，以及概况与命令里的说法；纯函数便于测试
 * @author xiao li
 * @createDate 2026-11-13 18:00
 */
import { DEFAULT_BRANCH_BASE, DEFAULT_BRANCH_TEMPLATE, DEFAULT_BUG_BRANCH_TEMPLATE, isBranchTemplate, isRefName } from './workbench'

/** 模板里的需求 ID 占位符（必须有） */
export const ID_PLACEHOLDER = '{id}'
/** 模板里的名字段占位符：用户在分支名里用的名字段（如人名、缩写），值存在全局档案 profile.json 的 branchName（校验见 profile.ts 的 checkBranchName） */
export const NAME_PLACEHOLDER = '{name}'
/** 分支名里算分隔符的字符 */
const SEPARATOR_CLASS = '[-_./]'
/** 连着的两个分隔符，如 /_、__、//、-. */
const DOUBLE_SEPARATOR = new RegExp(`${SEPARATOR_CLASS}{2,}`)
/** 校验模板、举例子时用的示例值 */
export const SAMPLE_ID = '1000001'
const SAMPLE_NAME = 'name'

/** 名字段没记时的说法：面板不生成启动命令，告诉用户怎么办 */
export const MISSING_NAME_TEXT = '分支模板里有名字段（{name}），还没记下你的名字段'
/** 怎么记名字段 */
export const SET_NAME_HINT = '对 AI 说「我的分支名字段是 xxx」或「照我以前的分支起名」，或输入 /xiaoxiaoli branch name <名字段>'

/**
 * 分支名自检：不能为空；只许字母、数字与 . _ / -（空格与 git 不允许的 ~ ^ : ? * [ \ 等都不在里面）；不能有 ..、
 * 不能以分隔符开头或结尾、不能有连着的分隔符（空段，如 v9.0/_123_x、a//b、a__b）；每段不能以 . 开头、不能以 .lock 结尾。
 * @param branch 分支名
 * @returns 不合格的原因，合格为 ''
 */
export const branchNameProblem = (branch: string): string => {
    if (branch === '') return '分支名是空的'
    if (/\s/.test(branch)) return '分支名不能有空格'
    if (!isRefName(branch)) return '分支名只能含字母、数字与 . _ / -'
    if (branch.includes('..')) return '分支名不能有 ..'
    if (new RegExp(`^${SEPARATOR_CLASS}|${SEPARATOR_CLASS}$`).test(branch)) return '分支名不能以分隔符开头或结尾（有空段）'
    if (DOUBLE_SEPARATOR.test(branch)) return '分支名不能有连着的分隔符（有空段，如 v9.0/_123_x、a//b、a__b）'
    if (branch.split('/').some(i => i.startsWith('.') || i.endsWith('.lock'))) return '分支名的每段不能以 . 开头、不能以 .lock 结尾'

    return ''
}

/**
 * 按模板拼分支名：{id} 换成短 ID，{name} 换成名字段；模板里有 {name} 而名字段没记时不拼（不拿空值去拼），拼出来不合格时也不拼。
 * @param template 分支名模板
 * @param values 短 ID 与名字段（没记为 ''）
 * @returns 分支名，或不拼的原因（isNameMissing 为真表示缺名字段）
 */
export const planBranch = (template: string, { id, name }: { id: string; name: string }): { branch: string } | { reason: string; isNameMissing: boolean } => {
    if (template.includes(NAME_PLACEHOLDER) && name === '') return { reason: MISSING_NAME_TEXT, isNameMissing: true }

    const branch = template.split(ID_PLACEHOLDER).join(id).split(NAME_PLACEHOLDER).join(name)
    const problem = branchNameProblem(branch)
    if (problem !== '') return { reason: `按模板 ${template} 拼出的分支名 ${branch} 不合格：${problem}`, isNameMissing: false }

    return { branch }
}

/**
 * 校验要存的分支模板（bind 与 project 工具共用）：先按原有规则（要含 {id}，换掉占位符后只剩字母、数字与 . _ / -，{name} 也认），
 * 再用示例值拼一次做分支名自检，免得存下 v9.0/_{id} 这类一拼就有空段的模板。
 * @param raw 原值
 * @param field 字段名，原因里用
 * @returns 不合格的原因，合格为 ''
 */
export const branchTemplateProblem = (raw: unknown, field: string): string => {
    if (!isBranchTemplate(raw)) return `${field} 要含 {id}，且只能含字母、数字与 . _ / -`

    const planned = planBranch(raw, { id: SAMPLE_ID, name: SAMPLE_NAME })
    return 'reason' in planned ? `${field} 不合格：${planned.reason.replace(/^按模板 \S+ 拼出的/, '用示例值拼出的')}` : ''
}

/** 项目配置里的分支设置：需求模板、缺陷模板、起点（没写或不合格为默认） */
export interface BranchSettingsType {
    branchTemplate: string
    bugBranchTemplate: string
    branchBase: string
}

/**
 * 从项目配置的全文读分支设置，不管绑没绑 TAPD（概况与 branch 命令用）；没写或不合格的用默认，同 parseConfig 的规则。
 * @param text 项目配置全文，没有为 ''
 * @returns 分支设置
 */
export const branchSettingsOf = (text: string): BranchSettingsType => {
    let value: Record<string, unknown> = {}
    try {
        const parsed: unknown = JSON.parse(text)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) value = parsed as Record<string, unknown>
    } catch {
        value = {}
    }

    return {
        branchTemplate: isBranchTemplate(value.branchTemplate) ? value.branchTemplate : DEFAULT_BRANCH_TEMPLATE,
        bugBranchTemplate: isBranchTemplate(value.bugBranchTemplate) ? value.bugBranchTemplate : DEFAULT_BUG_BRANCH_TEMPLATE,
        branchBase: typeof value.branchBase === 'string' && isRefName(value.branchBase) ? value.branchBase : DEFAULT_BRANCH_BASE
    }
}

/** 一个模板拼出来的示例说法 */
const sampleText = (template: string, name: string): string => {
    const planned = planBranch(template, { id: SAMPLE_ID, name })
    if ('branch' in planned) return planned.branch
    return planned.isNameMissing ? '拼不出（还没记下名字段）' : `拼不出（${planned.reason}）`
}

/**
 * 概况与 /xiaoxiaoli branch 里的分支命名一行：两个模板、起点、名字段，与用它们拼出来的示例（示例 ID 1000001）。
 * @param settings 分支设置
 * @param name 名字段，没记为 ''
 * @returns 一行
 */
export const branchSummaryText = (settings: BranchSettingsType, name: string): string => {
    const usesName = settings.branchTemplate.includes(NAME_PLACEHOLDER) || settings.bugBranchTemplate.includes(NAME_PLACEHOLDER)
    const nameText = name === '' ? (usesName ? '名字段没记（模板里用到了，面板不生成启动命令）' : '名字段没记') : `名字段 ${name}`
    const sample = `示例：需求 ${sampleText(settings.branchTemplate, name)}，缺陷 ${sampleText(settings.bugBranchTemplate, name)}`

    return `分支命名：需求模板 ${settings.branchTemplate}，缺陷模板 ${settings.bugBranchTemplate}，起点 ${settings.branchBase}；${nameText}；${sample}`
}
