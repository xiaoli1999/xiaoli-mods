#!/usr/bin/env node
/**
 * @description 发版工具（Jenkins）：只读检查配置与连接、看构建状态、拉控制台、等构建结束，确认后才触发构建。
 * 环境、job 与参数写在发版配置 release.json（不含密钥），账号与令牌在 .env 格式的密钥文件里，读到的密钥绝不输出。
 * 随工作面板插件（xiaoxiaoli）一起发，由会话里的 AI 在命令行运行；纯 Node，不依赖第三方包，Windows、macOS、Linux 都能跑。
 * 纯逻辑（配置校验、参数整理、抹掉密钥、比对线上提交）与读文件、发请求、打印分开：外部能力都经 io 传进来，测试换成假的。
 * @author xiao li
 * @createDate 2026-11-13 10:30
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { delimiter as PATH_DELIMITER, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

/** 发版配置的默认文件名，也是当前目录里找的那个 */
export const CONFIG_FILE = 'release.json'
/** 没给 --config 时找的环境变量 */
export const CONFIG_ENV = 'XIAOLI_RELEASE_CONFIG'
/** 没给 --secrets 时找的环境变量，多个路径用系统的路径分隔符隔开 */
export const SECRETS_ENV = 'XIAOLI_RELEASE_SECRETS'
/** 发版配置认识的结构版本 */
export const CONFIG_VERSION = 1
/** status 看最近几次构建 */
export const STATUS_BUILD_COUNT = 5
/** 单个请求的超时 */
export const REQUEST_TIMEOUT_MS = 30_000
/** wait 默认最多等几分钟、最多能设到几分钟 */
export const WAIT_DEFAULT_MINUTES = 20
export const WAIT_MAX_MINUTES = 120
/** wait 轮询间隔的上限（秒）、console 最多取几行 */
const INTERVAL_MAX_SECONDS = 600
const TAIL_MAX_LINES = 10_000
/** 短于这个长度的密钥值不做逐字替换（太短会误伤正常文字） */
const MIN_SECRET_LENGTH = 4

/** 退出码 */
export const EXIT = { ok: 0, error: 1, timeout: 2, failed: 3, checkFailed: 4, protected: 5 }

/** job 名：字母、数字、点、横线、下划线，文件夹用 / 隔开；不许只由点组成的段（免得拼进地址后变成上级目录） */
const JOB_PATTERN = /^[\w.-]+(\/[\w.-]+)*$/
/** 环境名 */
const ENV_NAME_PATTERN = /^[A-Za-z][\w-]{0,31}$/
/** 密钥前缀：大写字母开头，只含大写字母、数字与下划线 */
const PREFIX_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/
/** 参数名 */
const PARAM_NAME_PATTERN = /^[A-Za-z_]\w{0,63}$/
/** 参数值的白名单：字母、数字与 _ . - / : @ + ,，可以为空，最长 200 个字符；空格、引号、分号、$、反引号、尖括号、换行一律拒绝 */
export const VALUE_PATTERN = /^[\w.\-/:@+,]{0,200}$/
/** git 远程名与分支名：不以 - 开头（免得被当成 git 的选项），不含 .. */
const REF_PATTERN = /^(?!-)(?!.*\.\.)[\w.\-/]{1,100}$/
/** 配置里自定义正则的最大长度 */
const PATTERN_TEXT_LIMIT = 200
/** 控制台里 Git 插件打印的检出提交 */
const REVISION_PATTERN = /Checking out Revision ([0-9a-f]{40})/
const RESULT_TEXT_MAP = { SUCCESS: '成功', FAILURE: '失败', ABORTED: '中止', UNSTABLE: '不稳定', NOT_BUILT: '未构建' }
const BUILD_TREE = [
    'number,timestamp,result,duration,building',
    'actions[causes[userId,userName,shortDescription],lastBuiltRevision[SHA1],parameters[name,value]]'
].join(',')

/* 输出前要抹掉的令牌样式字符串，git 的 40 位提交号和 64 位 SHA-256 不在其中 */
export const SECRET_PATTERN_LIST = [
    [/\b(Bearer|Basic)\s+[A-Za-z0-9+/]{16,}={0,2}/g, '$1 ***'],
    [/(:\/\/)[^\s/:@]+:[^\s/@]+@/g, '$1***@'],
    [/\b(?:gh[pousr]_|github_pat_)\w{20,}/g, '***'],
    [/\bglpat-[\w-]{20,}/g, '***'],
    [/\bAKIA[0-9A-Z]{16}\b/g, '***'],
    [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '***'],
    [/(?<![0-9a-f])[0-9a-f]{32,34}(?![0-9a-f])/gi, '***'],
    [/((?:password|passwd|token|secret|api[_-]?key|access[_-]?key)["']?\s*[=:]\s*["']?)[^\s"',;]+/gi, '$1***']
]

export const USAGE = `用法：node <插件目录>/tools/jenkins.mjs <子命令> [选项]

子命令：
  check                      只读检查：发版配置、密钥里的键在不在（不显示值）、连不连得上 Jenkins、job 在不在、参数对不对得上
  status                     最近 ${STATUS_BUILD_COUNT} 次构建、队列、下一个构建号；配了 compare 时和远程分支比线上落后几个提交
  console <构建号|last>      控制台最后 N 行（--tail，默认 60），已抹掉疑似令牌
  wait <构建号|last>         轮询到构建结束（--interval 秒，默认 15；--max-wait 分钟，默认 ${WAIT_DEFAULT_MINUTES}，最多 ${WAIT_MAX_MINUTES}）
  build [--param 名=值 ...] [--rollback [--target <回滚目标>]] [--yes]
                             先打印将触发的 job 与参数；只有带 --yes 才真正提交；受保护的环境带 --yes 也不触发

选项：
  --config <路径>            发版配置；不给时依次找环境变量 ${CONFIG_ENV}、当前目录的 ${CONFIG_FILE}
  --secrets <路径>           密钥文件（.env 格式），可重复给，后面的覆盖前面的；不给时用环境变量 ${SECRETS_ENV}（多个用系统的路径分隔符隔开）
  --env <环境名>             发版配置里的环境；不给时用 defaultEnv，只有一个环境时就是它
  --offline                  check 只看文件与键，不连 Jenkins、不连 git 远程
  --json                     输出 JSON，给程序看
  -h, --help                 显示本说明

密钥键名：<前缀>_URL、<前缀>_ACCOUNT、<前缀>_API_TOKEN（没有令牌时用 <前缀>_PASSWORD），前缀写在发版配置里
退出码：0 正常  1 请求、参数或配置错误  2 等待超时  3 构建结果不是成功  4 check 有没通过的项  5 受保护的环境拒绝触发`

/** 带退出码的错误，run 统一打印 */
export class CliError extends Error {
    constructor(message, exitCode = EXIT.error) {
        super(message)
        this.exitCode = exitCode
    }
}

/* 抹掉密钥 */

/**
 * 每次运行一个：记下读到的密钥值（及其 Basic 认证串），输出前逐字换成 ***，再按令牌样式抹一遍。
 * @returns add 记下密钥值，redact 抹掉一段文字里的密钥
 */
export const createRedactor = () => {
    const valueList = []
    const add = (...values) => {
        for (const value of values) {
            if (typeof value !== 'string' || value.length < MIN_SECRET_LENGTH || valueList.includes(value)) continue
            valueList.push(value)
            const encoded = encodeURIComponent(value)
            if (encoded !== value && !valueList.includes(encoded)) valueList.push(encoded)
        }
        /* 长的先换，免得短的密钥是长的一部分时只换掉一截 */
        valueList.sort((a, b) => b.length - a.length)
    }
    const redact = text => {
        const knownText = valueList.reduce((result, secret) => result.split(secret).join('***'), String(text))
        return SECRET_PATTERN_LIST.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), knownText)
    }

    return { add, redact }
}

/* 密钥文件 */

/**
 * 读 .env 格式：一行一个 键=值，# 开头为注释，可带 export 前缀，值两边的同种引号去掉；文件开头的 BOM 去掉。
 * @param text 文件内容
 * @returns 键到值
 */
export const parseEnvText = text =>
    Object.fromEntries(
        String(text)
            .replace(/^﻿/, '')
            .split(/\r?\n/)
            .map(i => i.trim().replace(/^export\s+/, ''))
            .filter(i => i && !i.startsWith('#') && i.indexOf('=') > 0)
            .map(i => [
                i.slice(0, i.indexOf('=')).trim(),
                i
                    .slice(i.indexOf('=') + 1)
                    .trim()
                    .replace(/^(['"])(.*)\1$/, '$2')
            ])
    )

/**
 * 密钥文件从哪来：--secrets（可重复）优先，没有再看环境变量 XIAOLI_RELEASE_SECRETS（按路径分隔符拆开）。
 * @param options 命令行选项、环境变量、当前目录、路径分隔符
 * @returns 文件列表（绝对路径，按顺序，后面的覆盖前面的）与来源说明
 */
export const secretPathsOf = ({ values, env, cwd, delimiter }) => {
    const fromArgs = values.secrets ?? []
    if (fromArgs.length) return { pathList: fromArgs.map(i => resolve(cwd, i)), source: '--secrets' }

    const fromEnv = String(env[SECRETS_ENV] ?? '')
        .split(delimiter)
        .map(i => i.trim())
        .filter(Boolean)
    if (fromEnv.length) return { pathList: fromEnv.map(i => resolve(cwd, i)), source: `环境变量 ${SECRETS_ENV}` }

    return { pathList: [], source: '' }
}

/**
 * 按顺序读密钥文件并合并，后面的覆盖前面的；读不到的文件记下来、跳过，不报错（通用的一份和项目的一份常常只有一份在）。
 * @param pathList 文件列表
 * @param readFile 读文件
 * @returns 合并后的键值与每个文件读没读到
 */
export const loadSecrets = (pathList, readFile) => {
    const fileList = []
    let secretMap = {}
    for (const path of pathList) {
        let text
        try {
            text = readFile(path)
        } catch (error) {
            fileList.push({ path, isFound: false, reason: error?.code === 'ENOENT' ? '没有' : `读不了（${error?.code || '未知原因'}）` })
            continue
        }
        fileList.push({ path, isFound: true, reason: '' })
        secretMap = { ...secretMap, ...parseEnvText(text) }
    }

    return { secretMap, fileList }
}

/**
 * 一个环境要用的凭据：<前缀>_URL、<前缀>_ACCOUNT、<前缀>_API_TOKEN，没有令牌时退回 <前缀>_PASSWORD；
 * 令牌对应的账号和登录账号不同时可写 <前缀>_API_ACCOUNT，有令牌时优先用它。
 * @param prefix 密钥前缀
 * @param secretMap 合并后的密钥
 * @returns 凭据与每个键在不在
 */
export const credentialOf = (prefix, secretMap) => {
    const valueOf = suffix => (Object.hasOwn(secretMap, `${prefix}_${suffix}`) ? String(secretMap[`${prefix}_${suffix}`]) : '')
    const token = valueOf('API_TOKEN')
    const password = valueOf('PASSWORD')
    const apiAccount = valueOf('API_ACCOUNT')

    return {
        prefix,
        rawUrl: valueOf('URL'),
        account: (token && apiAccount) || valueOf('ACCOUNT'),
        token,
        password,
        apiAccount,
        keyState: {
            URL: valueOf('URL') !== '',
            ACCOUNT: valueOf('ACCOUNT') !== '',
            API_TOKEN: token !== '',
            PASSWORD: password !== ''
        }
    }
}

/**
 * 凭据缺哪些键（只说键名，不说值）。
 * @param cred 凭据
 * @returns 缺的键的说法
 */
export const missingKeysOf = cred => [
    ...(cred.rawUrl ? [] : [`${cred.prefix}_URL`]),
    ...(cred.account ? [] : [`${cred.prefix}_ACCOUNT`]),
    ...(cred.token || cred.password ? [] : [`${cred.prefix}_API_TOKEN（或 ${cred.prefix}_PASSWORD）`])
]

/**
 * 密钥里的地址可能是登录页：只认 http、https，去掉账号口令、/login、查询串与末尾斜杠，只留 Jenkins 根。报错不带地址本身。
 * @param rawUrl 原地址
 * @param key 键名
 * @returns Jenkins 根地址
 */
export const toJenkinsRoot = (rawUrl, key) => {
    let url
    try {
        url = new URL(rawUrl)
    } catch {
        throw new CliError(`${key} 不是合法的地址`)
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new CliError(`${key} 要是 http 或 https 地址`)

    return `${url.origin}${url.pathname.replace(/\/login\/?$/, '').replace(/\/+$/, '')}`
}

/**
 * job 名拼成 Jenkins 的地址路径：每段 job/<段>，段做地址编码。
 * @param job job 名
 * @returns 路径
 */
export const jobPathOf = job =>
    job
        .split('/')
        .map(i => `job/${encodeURIComponent(i)}`)
        .join('/')

/** job 名是否合格 */
export const isJobName = job => typeof job === 'string' && JOB_PATTERN.test(job) && !job.split('/').some(i => /^\.+$/.test(i))

/* 发版配置 */

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value)

/** 对象里不认识的键：发版配置严格校验，写错键名（如把 protected 写成 protect）会让受保护失效，所以一律报出来 */
const unknownKeysOf = (record, allowList) => Object.keys(record).filter(i => !allowList.includes(i))

/** 编译配置里的正则，不合格时记原因 */
const compilePattern = (text, where, errorList) => {
    if (typeof text !== 'string' || text === '' || text.length > PATTERN_TEXT_LIMIT) {
        errorList.push(`${where} 要是 1 到 ${PATTERN_TEXT_LIMIT} 个字符的正则文字`)
        return null
    }
    try {
        return new RegExp(text)
    } catch {
        errorList.push(`${where} 不是合法的正则`)
        return null
    }
}

/** 一个参数的声明：文字为固定值；对象为可选参数（default、choices、pattern、description） */
const checkParam = (name, raw, where, errorList) => {
    if (!PARAM_NAME_PATTERN.test(name)) {
        errorList.push(`${where} 的参数名「${name}」要是字母或下划线开头、只含字母、数字与下划线的文字`)
        return null
    }
    if (typeof raw === 'string') {
        if (!VALUE_PATTERN.test(raw)) {
            errorList.push(`${where}.${name} 的值含不允许的字符（只许字母、数字与 _ . - / : @ + ,，最长 200 个字符）`)
            return null
        }
        return { name, isFixed: true, value: raw, choices: null, pattern: null, patternText: '', description: '' }
    }
    if (!isRecord(raw)) {
        errorList.push(`${where}.${name} 要是固定值（文字）或 { default, choices, pattern, description }`)
        return null
    }

    const before = errorList.length
    const unknownList = unknownKeysOf(raw, ['default', 'choices', 'pattern', 'description'])
    if (unknownList.length) errorList.push(`${where}.${name} 里有不认识的字段 ${unknownList.join('、')}`)

    let choices = null
    if (raw.choices !== undefined) {
        const isList = Array.isArray(raw.choices) && raw.choices.length > 0 && raw.choices.every(i => typeof i === 'string' && VALUE_PATTERN.test(i))
        if (!isList) errorList.push(`${where}.${name}.choices 要是非空的文字数组，每项只许字母、数字与 _ . - / : @ + ,`)
        else if (new Set(raw.choices).size !== raw.choices.length) errorList.push(`${where}.${name}.choices 里有重复的值`)
        else choices = [...raw.choices]
    }
    const pattern = raw.pattern === undefined ? null : compilePattern(raw.pattern, `${where}.${name}.pattern`, errorList)
    if (raw.description !== undefined && typeof raw.description !== 'string') errorList.push(`${where}.${name}.description 要是文字`)
    if (raw.default !== undefined && (typeof raw.default !== 'string' || !VALUE_PATTERN.test(raw.default))) {
        errorList.push(`${where}.${name}.default 要是文字，只许字母、数字与 _ . - / : @ + ,，最长 200 个字符`)
    }
    if (errorList.length > before) return null

    /* 不写 default：有 choices 取第一个（同 Jenkins 的选项参数），否则为空 */
    const value = raw.default ?? choices?.[0] ?? ''
    if (choices && !choices.includes(value)) errorList.push(`${where}.${name}.default「${value}」不在 choices 里`)
    if (pattern && raw.default !== undefined && !pattern.test(value)) errorList.push(`${where}.${name}.default「${value}」不符合 pattern`)

    return { name, isFixed: false, value, choices, pattern, patternText: pattern ? raw.pattern : '', description: raw.description ?? '' }
}

/** compare：和远程分支比线上落后几个提交（可选能力） */
const checkCompare = (raw, where, paramList, errorList) => {
    if (!isRecord(raw)) {
        errorList.push(`${where}.compare 要是对象 { remote, branch, ignore }`)
        return null
    }

    const before = errorList.length
    const unknownList = unknownKeysOf(raw, ['remote', 'branch', 'ignore'])
    if (unknownList.length) errorList.push(`${where}.compare 里有不认识的字段 ${unknownList.join('、')}`)
    const remote = raw.remote ?? 'origin'
    if (typeof remote !== 'string' || !REF_PATTERN.test(remote)) errorList.push(`${where}.compare.remote 要是远程名，如 origin`)
    if (typeof raw.branch !== 'string' || !REF_PATTERN.test(raw.branch)) errorList.push(`${where}.compare.branch 要填分支名，如 dev`)

    const ignore = []
    if (raw.ignore !== undefined) {
        if (!isRecord(raw.ignore)) {
            errorList.push(`${where}.compare.ignore 要是对象 { 参数名: [取值, ...] }`)
        } else {
            for (const [name, valueList] of Object.entries(raw.ignore)) {
                if (!paramList.some(i => i.name === name)) errorList.push(`${where}.compare.ignore 里的参数 ${name} 没在 params 里声明`)
                if (!Array.isArray(valueList) || !valueList.every(i => typeof i === 'string')) errorList.push(`${where}.compare.ignore.${name} 要是文字数组`)
                else ignore.push({ name, valueList: [...valueList] })
            }
        }
    }
    if (errorList.length > before) return null

    return { remote, branch: raw.branch, ignore }
}

/** rollback：回滚（可选能力）。param 设成 value 即回滚，targetParam 带回滚目标 */
const checkRollback = (raw, where, paramList, errorList) => {
    if (!isRecord(raw)) {
        errorList.push(`${where}.rollback 要是对象 { param, value, targetParam, targetPattern }`)
        return null
    }

    const before = errorList.length
    const unknownList = unknownKeysOf(raw, ['param', 'value', 'targetParam', 'targetPattern'])
    if (unknownList.length) errorList.push(`${where}.rollback 里有不认识的字段 ${unknownList.join('、')}`)
    const spec = paramList.find(i => i.name === raw.param)
    if (typeof raw.param !== 'string' || !spec) errorList.push(`${where}.rollback.param 要是 params 里声明过的参数名`)
    else if (spec.isFixed) errorList.push(`${where}.rollback.param 指的参数 ${raw.param} 在 params 里是固定值，回滚时改不了它`)
    if (typeof raw.value !== 'string' || raw.value === '' || !VALUE_PATTERN.test(raw.value)) errorList.push(`${where}.rollback.value 要填回滚时 param 的取值，如 ROLLBACK`)
    else if (spec?.choices && !spec.choices.includes(raw.value)) errorList.push(`${where}.rollback.value「${raw.value}」不在 ${raw.param} 的 choices 里`)
    if (raw.targetParam !== undefined) {
        if (typeof raw.targetParam !== 'string' || !PARAM_NAME_PATTERN.test(raw.targetParam)) errorList.push(`${where}.rollback.targetParam 要是参数名`)
        else if (paramList.some(i => i.name === raw.targetParam)) errorList.push(`${where}.rollback.targetParam ${raw.targetParam} 不要再写进 params（只在回滚时带）`)
    }
    const targetPattern = raw.targetPattern === undefined ? null : compilePattern(raw.targetPattern, `${where}.rollback.targetPattern`, errorList)
    if (raw.targetPattern !== undefined && raw.targetParam === undefined) errorList.push(`${where}.rollback 写了 targetPattern 却没写 targetParam`)
    if (errorList.length > before) return null

    return { param: raw.param, value: raw.value, targetParam: raw.targetParam ?? '', targetPattern, targetPatternText: targetPattern ? raw.targetPattern : '' }
}

/** 一个环境的校验 */
const checkEnvironment = (name, raw, errorList) => {
    const where = `environments.${name}`
    if (!ENV_NAME_PATTERN.test(name)) {
        errorList.push(`环境名「${name}」要是字母开头、只含字母、数字、_ 与 - 的文字，最多 32 个字符`)
        return null
    }
    if (!isRecord(raw)) {
        errorList.push(`${where} 要是对象`)
        return null
    }

    const before = errorList.length
    const unknownList = unknownKeysOf(raw, ['title', 'description', 'secretPrefix', 'job', 'params', 'protected', 'verifyUrls', 'compare', 'rollback'])
    if (unknownList.length) errorList.push(`${where} 里有不认识的字段 ${unknownList.join('、')}（受保护要写 protected）`)
    if (raw.title !== undefined && (typeof raw.title !== 'string' || raw.title.length > 40)) errorList.push(`${where}.title 要是 40 个字符以内的文字`)
    if (raw.description !== undefined && typeof raw.description !== 'string') errorList.push(`${where}.description 要是文字`)
    if (typeof raw.secretPrefix !== 'string' || !PREFIX_PATTERN.test(raw.secretPrefix)) {
        errorList.push(`${where}.secretPrefix 要填密钥前缀（大写字母开头，只含大写字母、数字与下划线），如 JENKINS_DEV`)
    }
    if (!isJobName(raw.job)) errorList.push(`${where}.job 要填 job 名（字母、数字、点、横线、下划线，文件夹用 / 隔开）`)
    if (raw.protected !== undefined && typeof raw.protected !== 'boolean') errorList.push(`${where}.protected 要是 true 或 false`)

    const paramList = []
    if (raw.params !== undefined) {
        if (!isRecord(raw.params)) errorList.push(`${where}.params 要是对象 { 参数名: 固定值 或 { default, choices, pattern } }`)
        else
            for (const [paramName, spec] of Object.entries(raw.params)) {
                const param = checkParam(paramName, spec, `${where}.params`, errorList)
                if (param) paramList.push(param)
            }
    }

    const verifyUrls = []
    if (raw.verifyUrls !== undefined) {
        if (!Array.isArray(raw.verifyUrls)) errorList.push(`${where}.verifyUrls 要是地址数组`)
        else
            for (const [index, item] of raw.verifyUrls.entries()) {
                let url = null
                try {
                    url = new URL(item)
                } catch {
                    url = null
                }
                if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) errorList.push(`${where}.verifyUrls 第 ${index + 1} 项要是 http 或 https 地址`)
                else if (url.username || url.password) errorList.push(`${where}.verifyUrls 第 ${index + 1} 项不要带账号口令`)
                else verifyUrls.push(item)
            }
    }

    const compare = raw.compare === undefined ? null : checkCompare(raw.compare, where, paramList, errorList)
    const rollback = raw.rollback === undefined ? null : checkRollback(raw.rollback, where, paramList, errorList)
    if (errorList.length > before) return null

    return {
        name,
        title: raw.title ?? '',
        secretPrefix: raw.secretPrefix,
        job: raw.job,
        jobPath: jobPathOf(raw.job),
        params: paramList,
        isProtected: raw.protected === true,
        verifyUrls,
        compare,
        rollback
    }
}

/**
 * 校验发版配置：version 缺省为 1；environments 至少一个；defaultEnv 可选，要是其中之一；各环境严格校验，不认识的字段也报。
 * @param raw JSON 解析后的值
 * @returns 合格为 { config }，否则为 { errorList }
 */
export const validateConfig = raw => {
    const errorList = []
    if (!isRecord(raw)) return { errorList: ['发版配置要是一个 JSON 对象'] }

    const unknownList = unknownKeysOf(raw, ['$schema', 'version', 'description', 'defaultEnv', 'environments'])
    if (unknownList.length) errorList.push(`顶层有不认识的字段 ${unknownList.join('、')}`)
    const version = raw.version ?? CONFIG_VERSION
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) errorList.push('version 要是正整数')
    else if (version > CONFIG_VERSION) errorList.push(`version ${version} 比本工具认识的新（${CONFIG_VERSION}），先更新工作面板插件`)

    const environments = new Map()
    if (!isRecord(raw.environments) || !Object.keys(raw.environments).length) {
        errorList.push('environments 要是对象，至少写一个环境，如 { "dev": { ... } }')
    } else {
        for (const [name, item] of Object.entries(raw.environments)) {
            const env = checkEnvironment(name, item, errorList)
            if (env) environments.set(name, env)
        }
    }
    if (raw.defaultEnv !== undefined && (typeof raw.defaultEnv !== 'string' || !isRecord(raw.environments) || !Object.hasOwn(raw.environments, raw.defaultEnv))) {
        errorList.push('defaultEnv 要是 environments 里的一个环境名')
    }
    if (errorList.length) return { errorList }

    return { config: { defaultEnv: raw.defaultEnv ?? '', environments } }
}

/**
 * 发版配置从哪来：--config 优先，其次环境变量 XIAOLI_RELEASE_CONFIG，最后当前目录的 release.json。
 * @param options 命令行选项、环境变量、当前目录
 * @returns 绝对路径与来源说明
 */
export const configPathOf = ({ values, env, cwd }) => {
    if (values.config) return { path: resolve(cwd, values.config), source: '--config' }
    if (env[CONFIG_ENV]) return { path: resolve(cwd, env[CONFIG_ENV]), source: `环境变量 ${CONFIG_ENV}` }

    return { path: resolve(cwd, CONFIG_FILE), source: '当前目录' }
}

/** 找不到发版配置时怎么补 */
const CONFIG_HINT = `用 --config <路径> 指定，或设环境变量 ${CONFIG_ENV}，或在当前目录放 ${CONFIG_FILE}；字段见工作面板 README 的「发版工具」`

/**
 * 读并校验发版配置。
 * @param where 路径与来源
 * @param readFile 读文件
 * @returns 合格的配置
 */
export const loadConfig = (where, readFile) => {
    let text
    try {
        text = readFile(where.path)
    } catch (error) {
        const reason = error?.code === 'ENOENT' ? '不存在' : `读不了（${error?.code || '未知原因'}）`
        throw new CliError(`发版配置 ${where.path}（来源：${where.source}）${reason}；${CONFIG_HINT}`)
    }

    let raw
    try {
        raw = JSON.parse(String(text).replace(/^﻿/, ''))
    } catch {
        throw new CliError(`发版配置 ${where.path} 不是合法 JSON`)
    }
    const checked = validateConfig(raw)
    if (checked.errorList) throw new CliError(`发版配置 ${where.path} 不合格：\n- ${checked.errorList.join('\n- ')}`)

    return checked.config
}

/**
 * 选环境：--env 优先，其次 defaultEnv，只有一个环境时就是它；否则要求指定。
 * @param config 配置
 * @param name --env 的值
 * @returns 环境
 */
export const pickEnv = (config, name) => {
    const nameList = [...config.environments.keys()]
    if (name !== undefined) {
        const env = config.environments.get(name)
        if (!env) throw new CliError(`发版配置里没有环境 ${name}（有 ${nameList.join('、')}）`)
        return env
    }
    if (config.defaultEnv) return config.environments.get(config.defaultEnv)
    if (nameList.length === 1) return config.environments.get(nameList[0])

    throw new CliError(`发版配置有 ${nameList.length} 个环境（${nameList.join('、')}），用 --env 指定，或在发版配置里写 defaultEnv`)
}

/* 触发参数 */

/**
 * 整理这次要触发的参数（纯逻辑）：先取配置里的默认值与固定值，再套 --param（只许改配置里声明过、不是固定值的参数），
 * --rollback 把 rollback.param 设成 rollback.value 并带上回滚目标；最后每个值都过白名单、choices 与 pattern。
 * @param env 环境
 * @param options --param 列表、是否 --rollback、--target
 * @returns 参数（按声明顺序）与是否回滚
 */
export const planBuild = (env, { paramList = [], isRollback = false, target } = {}) => {
    const params = {}
    for (const param of env.params) params[param.name] = param.value

    const givenSet = new Set()
    for (const raw of paramList) {
        const index = raw.indexOf('=')
        if (index <= 0) throw new CliError('--param 要写成 名=值')
        const name = raw.slice(0, index)
        const spec = env.params.find(i => i.name === name)
        if (!spec) {
            const declared = env.params.map(i => i.name).join('、') || '没有'
            throw new CliError(`${env.name} 没在发版配置里声明参数 ${PARAM_NAME_PATTERN.test(name) ? name : '（名字不合格）'}（声明了的：${declared}）`)
        }
        if (spec.isFixed) throw new CliError(`参数 ${name} 在发版配置里是固定值，不能用 --param 改`)
        params[name] = raw.slice(index + 1)
        givenSet.add(name)
    }

    const rollback = env.rollback
    if ((isRollback || target !== undefined) && !rollback) throw new CliError(`${env.name} 没在发版配置里配 rollback，不能回滚`)
    if (target !== undefined && !isRollback) throw new CliError('--target 只在 --rollback 时用')
    if (isRollback) {
        if (givenSet.has(rollback.param) && params[rollback.param] !== rollback.value) throw new CliError(`--rollback 与 --param ${rollback.param} 冲突`)
        params[rollback.param] = rollback.value
    }

    const isRolling = rollback !== null && params[rollback.param] === rollback.value
    if (isRolling && rollback.targetParam) {
        const value = target ?? ''
        if (!VALUE_PATTERN.test(value)) throw new CliError('回滚目标含不允许的字符（只许字母、数字与 _ . - / : @ + ,）')
        if (value !== '' && rollback.targetPattern && !rollback.targetPattern.test(value)) {
            throw new CliError(`回滚目标要符合发版配置里的 targetPattern ${rollback.targetPatternText}`)
        }
        params[rollback.targetParam] = value
    }

    for (const [name, value] of Object.entries(params)) {
        if (!VALUE_PATTERN.test(value)) throw new CliError(`参数 ${name} 的值含不允许的字符（只许字母、数字与 _ . - / : @ + ,，最长 200 个字符）`)
        const spec = env.params.find(i => i.name === name)
        if (spec?.choices && !spec.choices.includes(value)) throw new CliError(`参数 ${name} 只能是 ${spec.choices.join('、')}`)
        if (spec?.pattern && !spec.pattern.test(value)) throw new CliError(`参数 ${name} 的值不符合发版配置里的 pattern ${spec.patternText}，用 --param ${name}=<值> 指定`)
    }

    return { params, isRollback: isRolling }
}

/**
 * 核对 Jenkins 上 job 的参数定义：要带的参数 job 上都要有；job 上是选项参数的，取值要在它的可选值里。
 * @param definitionList job 的参数定义
 * @param params 要带的参数
 * @returns 对不上的地方，没有为空
 */
export const jobParamProblemsOf = (definitionList, params) => {
    const problemList = []
    const missingList = Object.keys(params).filter(name => !definitionList.some(i => i.name === name))
    if (missingList.length) problemList.push(`job 上没有参数 ${missingList.join('、')}`)
    for (const [name, value] of Object.entries(params)) {
        const choiceList = definitionList.find(i => i.name === name)?.choices
        if (Array.isArray(choiceList) && !choiceList.includes(value)) problemList.push(`${name}=${value || '（空）'} 不在 job 的可选值里（${choiceList.join('、')}）`)
    }

    return problemList
}

/** job 信息里的参数定义 */
const definitionsOf = job => (job?.property ?? []).flatMap(i => i?.parameterDefinitions ?? [])

/** 参数给人看：名=值，空值写明 */
export const paramText = params =>
    Object.entries(params)
        .map(([name, value]) => `${name}=${value === '' ? '（空）' : value}`)
        .join(' ') || '（不带参数）'

/* 构建记录与比对 */

/**
 * 一次构建的摘要：触发人、这次带的参数里配置声明过的那些、检出提交，以及是不是回滚、是不是比对时要跳过的构建。
 * @param build Jenkins 的构建记录
 * @param env 环境
 * @returns 摘要
 */
export const toBuildSummary = (build, env) => {
    const actionList = (build.actions ?? []).filter(Boolean)
    const cause = actionList.flatMap(i => i.causes || [])[0]
    const parameterList = actionList.flatMap(i => i.parameters || [])
    const valueOf = name => {
        const value = parameterList.find(i => i.name === name)?.value
        return value === undefined || value === null ? '' : String(value)
    }
    const revision = actionList.find(i => i.lastBuiltRevision)?.lastBuiltRevision?.SHA1 || ''
    const nameList = [...env.params.map(i => i.name), ...(env.rollback?.targetParam ? [env.rollback.targetParam] : [])]

    return {
        number: build.number,
        timestamp: build.timestamp,
        building: build.building === true,
        result: build.result ?? null,
        duration: build.duration ?? 0,
        trigger: cause ? cause.userName || cause.shortDescription || '' : '',
        triggerId: cause?.userId || '',
        params: Object.fromEntries(nameList.map(i => [i, valueOf(i)]).filter(([, value]) => value !== '')),
        isRollback: env.rollback !== null && valueOf(env.rollback.param) === env.rollback.value,
        isIgnored: (env.compare?.ignore ?? []).some(i => i.valueList.includes(valueOf(i.name))),
        revision,
        revisionFrom: revision ? 'api' : ''
    }
}

const shortSha = sha => sha.slice(0, 10)

/**
 * 和远程分支比：线上取最近一次成功、且不是 compare.ignore 里那类的构建；回滚生效时不比（以发版后验收为准）。
 * @param summaryList 构建摘要，新的在前
 * @param remote 远程分支的提交，或取不到的原因
 * @param env 环境
 * @param countCommits 数提交的函数（读 git）
 * @returns 线上那次构建、落后几个提交（比不了为 null）与说法
 */
export const compareDeployed = (summaryList, remote, env, countCommits) => {
    const label = `${env.compare.remote}/${env.compare.branch}`
    const deployed = summaryList.find(i => i.result === 'SUCCESS' && !i.isIgnored) ?? null
    if (remote.error) return { deployed, behind: null, text: `远程 ${label} 取不到：${remote.error}` }

    const remoteText = `远程 ${label}=${shortSha(remote.sha)}`
    if (!deployed) return { deployed, behind: null, text: `${remoteText}；最近 ${summaryList.length} 次没有成功的构建，比不了` }
    if (deployed.isRollback) return { deployed, behind: null, text: `${remoteText}；最近生效的是 #${deployed.number} 回滚，线上是哪个提交以发版后验收为准` }
    if (!deployed.revision) return { deployed, behind: null, text: `${remoteText}；#${deployed.number} 取不到检出提交` }

    const deployedText = `线上 #${deployed.number}=${shortSha(deployed.revision)}`
    const { count, error } = countCommits(deployed.revision, remote.sha)
    if (error) return { deployed, behind: null, text: `${remoteText}；${deployedText}，${error}` }

    return { deployed, behind: count, text: `${remoteText}；${deployedText}，${count ? `线上落后 ${count} 个提交` : '线上已是最新'}` }
}

/* 格式化 */

const formatTime = (timestamp, timeZone) => {
    const format = new Intl.DateTimeFormat('zh-CN', { timeZone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    const partMap = Object.fromEntries(format.formatToParts(timestamp).map(i => [i.type, i.value]))

    return `${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}`
}

export const formatDuration = ms => {
    const totalSeconds = Math.round(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    if (minutes >= 60) return `${Math.floor(minutes / 60)} 时 ${minutes % 60} 分`

    return minutes ? `${minutes} 分 ${totalSeconds % 60} 秒` : `${totalSeconds} 秒`
}

const getTextWidth = text => [...text].reduce((sum, char) => sum + (char.codePointAt(0) > 0x2e7f ? 2 : 1), 0)

const formatTable = rowList => {
    const widthList = rowList[0].map((_, index) => Math.max(...rowList.map(row => getTextWidth(row[index]))))

    return rowList
        .map(row => row.map((cell, index) => cell + ' '.repeat(widthList[index] - getTextWidth(cell))).join('  '))
        .map(i => i.trimEnd())
        .join('\n')
}

const toPositiveInt = (text, name, max) => {
    const num = Number(text)
    if (!Number.isInteger(num) || num <= 0) throw new CliError(`${name} 要写正整数`)
    if (num > max) throw new CliError(`${name} 最大 ${max}`)

    return num
}

/** 环境给人看的名字 */
const envLabel = env => `${env.name}${env.title ? ` ${env.title}` : ''}`

/* 请求 */

const readErrorMessage = async response => {
    const text = await response.text()
    const location = response.headers.get('location')
    if ((response.headers.get('content-type') || '').includes('json')) {
        try {
            return JSON.parse(text).message || text.slice(0, 500)
        } catch {
            return text.slice(0, 500)
        }
    }

    const plain = text
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    return [location && `Location: ${location}`, plain.slice(0, 500)].filter(Boolean).join('\n')
}

/**
 * 发一次 Jenkins 请求：带认证头、不跟随跳转、有超时；非 2xx 时抛出状态码与 Jenkins 的原话（输出前统一抹密钥）。
 * @param rt 运行上下文（io 与连接）
 * @param path 相对 Jenkins 根的路径
 * @param options 方法、查询、请求头、请求体；allowNotFound 为真时 404 返回 null
 * @returns 响应，404 且允许时为 null
 */
export const requestJenkins = async (rt, path, { method = 'GET', query, headers, body, allowNotFound = false } = {}) => {
    const { conn, io } = rt
    const url = new URL(`${conn.baseUrl}/${path}`)
    if (query) url.search = new URLSearchParams(query).toString()

    let response
    try {
        response = await io.fetch(url, {
            method,
            headers: { Authorization: conn.authorization, ...headers },
            body,
            redirect: 'manual',
            signal: AbortSignal.timeout(io.requestTimeoutMs ?? REQUEST_TIMEOUT_MS)
        })
    } catch (cause) {
        const isTimeout = cause?.name === 'TimeoutError' || cause?.name === 'AbortError'
        const timeoutMs = io.requestTimeoutMs ?? REQUEST_TIMEOUT_MS
        const reason = isTimeout
            ? `${timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)} 秒` : `${timeoutMs} 毫秒`}没响应，超时`
            : cause?.cause
              ? `${cause.cause.code || ''} ${cause.cause.message || ''}`
              : String(cause?.message ?? cause)
        throw new CliError(`请求失败：${method} ${url.pathname}，${reason.trim()}`)
    }
    if (allowNotFound && response.status === 404) return null
    if (!response.ok) {
        const message = await readErrorMessage(response)
        throw new CliError(`Jenkins 返回 HTTP ${response.status} ${response.statusText || ''}：${method} ${url.pathname}\n${message}`.trim())
    }

    return response
}

const fetchJson = async (rt, path, query, options) => {
    const response = await requestJenkins(rt, path, { query, ...options })
    if (!response) return null

    const text = await response.text()
    try {
        return JSON.parse(text)
    } catch {
        throw new CliError(`Jenkins 返回的不是 JSON：${path}\n${text.slice(0, 300)}`)
    }
}

const fetchText = async (rt, path) => (await requestJenkins(rt, path)).text()

/**
 * 按环境的凭据拼出连接：有令牌用令牌，没有退回口令；读到的值都记进抹密钥的名单。缺键时报缺哪些键（不报值）。
 * @param rt 运行上下文
 * @param env 环境
 * @param secrets 读到的密钥与文件
 * @returns 连接：Jenkins 根地址、账号、认证头、是否用口令
 */
export const connectOf = (rt, env, secrets) => {
    const cred = credentialOf(env.secretPrefix, secrets.secretMap)
    rt.redactor.add(cred.token, cred.password, cred.account, cred.apiAccount)
    const missingList = missingKeysOf(cred)
    if (missingList.length) {
        const fileText = secrets.fileList.length ? secrets.fileList.map(i => `${i.path}（${i.isFound ? '读到了' : i.reason}）`).join('、') : '没给密钥文件'
        const hint = secrets.fileList.length ? '' : `；用 --secrets <路径> 指定（可重复），或设环境变量 ${SECRETS_ENV}`
        throw new CliError(`密钥里缺 ${missingList.join('、')}；密钥文件：${fileText}${hint}。请用户自己把这些键填进 secrets.env，不要贴到对话里`)
    }

    const baseUrl = toJenkinsRoot(cred.rawUrl, `${cred.prefix}_URL`)
    const secret = cred.token || cred.password
    const basic = Buffer.from(`${cred.account}:${secret}`).toString('base64')
    rt.redactor.add(basic)

    return { baseUrl, account: cred.account, authorization: `Basic ${basic}`, usesPassword: !cred.token }
}

/** 用口令登录时在标准错误上提醒一句 */
const warnPassword = (rt, env, conn) => {
    if (conn.usesPassword) rt.warn(`提示：正在用 ${env.secretPrefix}_PASSWORD 登录 Jenkins，建议改用专用账号的 API 令牌（${env.secretPrefix}_API_TOKEN）`)
}

/* git */

/** 远程分支的提交，取不到时给原因 */
export const remoteHeadOf = (io, compare) => {
    try {
        const sha = io.git(['ls-remote', compare.remote, `refs/heads/${compare.branch}`]).split(/\s+/)[0]
        return sha ? { sha } : { error: `远程没有 ${compare.branch} 分支` }
    } catch (error) {
        return { error: `git ls-remote 失败：${String(error?.stderr || error?.message || error).trim()}` }
    }
}

/** 本地数两个提交之间差几个；缺提交时让先 fetch */
const commitCounterOf = (io, compare) => (fromSha, toSha) => {
    const hasCommit = sha => {
        try {
            io.git(['cat-file', '-e', `${sha}^{commit}`])
            return true
        } catch {
            return false
        }
    }
    const missingList = [fromSha, toSha].filter(i => !hasCommit(i))
    if (missingList.length) return { error: `本地缺提交 ${missingList.map(shortSha).join('、')}，先 git fetch ${compare.remote} ${compare.branch} 再看` }

    try {
        return { count: Number(io.git(['rev-list', '--count', `${fromSha}..${toSha}`])) }
    } catch (error) {
        return { error: `git rev-list 失败：${String(error?.stderr || error?.message || error).trim()}` }
    }
}

/* 子命令共用 */

/** 键名像密钥的（口令、令牌、secret、key）：值不论用没用到都记进抹密钥的名单，免得别的账号从控制台里带出来 */
const SECRET_KEY_PATTERN = /PASSWORD|PASSWD|TOKEN|SECRET|(^|_)KEY$|APIKEY/i

const addSecretLike = (redactor, secretMap) => {
    for (const [key, value] of Object.entries(secretMap)) if (SECRET_KEY_PATTERN.test(key)) redactor.add(String(value))
}

/** 读配置、选环境、读密钥 */
const prepare = rt => {
    const { io, values } = rt
    const where = configPathOf({ values, env: io.env, cwd: io.cwd })
    const config = loadConfig(where, io.readFile)
    const env = pickEnv(config, values.env)
    const secretPaths = secretPathsOf({ values, env: io.env, cwd: io.cwd, delimiter: io.delimiter ?? PATH_DELIMITER })
    const secrets = loadSecrets(secretPaths.pathList, io.readFile)
    addSecretLike(rt.redactor, secrets.secretMap)

    return { where, config, env, secrets }
}

/** 读配置并连上环境：status、console、wait 用 */
const prepareConnected = rt => {
    const prepared = prepare(rt)
    const conn = connectOf(rt, prepared.env, prepared.secrets)
    rt.conn = conn
    warnPassword(rt, prepared.env, conn)

    return { ...prepared, conn }
}

const resolveBuildNumber = async (rt, env, ref) => {
    if (/^\d+$/.test(ref || '')) return Number(ref)
    if (ref !== 'last') throw new CliError('构建号要写数字或 last')

    const build = await fetchJson(rt, `${env.jobPath}/lastBuild/api/json`, { tree: 'number' }, { allowNotFound: true })
    if (!build) throw new CliError(`${env.job} 还没有任何构建`)

    return build.number
}

/** API 里取不到检出提交的构建，再从控制台的 Checking out Revision 行补 */
const fillRevisionFromConsole = async (rt, env, summaryList) => {
    const pendingList = summaryList.filter(i => !i.revision)
    const resultList = await Promise.allSettled(pendingList.map(i => fetchText(rt, `${env.jobPath}/${i.number}/consoleText`)))

    resultList.forEach((result, index) => {
        const match = result.status === 'fulfilled' && result.value.match(REVISION_PATTERN)
        if (match) Object.assign(pendingList[index], { revision: match[1], revisionFrom: 'console' })
    })
}

const describeQueue = (job, summaryList) => {
    const queueText = job.inQueue ? `排队中：${job.queueItem?.why || '原因未知'}` : '不在队列'
    const runningList = summaryList.filter(i => i.building).map(i => `#${i.number} 正在构建`)

    return `${queueText}，${runningList.length ? runningList.join('、') : '没有进行中的构建'}`
}

const describeBusy = job => {
    if (job.inQueue) return '注意：job 已在队列里，再触发会排在后面'
    if (job.lastBuild?.building) return `注意：#${job.lastBuild.number} 正在构建，新构建可能要排队`

    return ''
}

/** 取 CSRF crumb；口令登录时 crumb 绑会话，要把同一个 Cookie 带回去 */
const fetchCrumbHeaders = async rt => {
    const response = await requestJenkins(rt, 'crumbIssuer/api/json', { allowNotFound: true })
    if (!response) return {}

    const crumb = await response.json()
    const cookie = (response.headers.getSetCookie?.() || []).map(i => i.split(';')[0]).join('; ')

    return { [crumb.crumbRequestField]: crumb.crumb, ...(cookie ? { Cookie: cookie } : {}) }
}

/* 子命令：status */

const runStatus = async rt => {
    const { env } = prepareConnected(rt)
    const tree = `nextBuildNumber,inQueue,queueItem[id,why,inQueueSince],builds[${BUILD_TREE}]{0,${STATUS_BUILD_COUNT}}`
    const job = await fetchJson(rt, `${env.jobPath}/api/json`, { tree })
    const summaryList = (job.builds ?? []).map(i => toBuildSummary(i, env))
    await fillRevisionFromConsole(rt, env, summaryList)

    const remote = env.compare ? remoteHeadOf(rt.io, env.compare) : null
    const compared = env.compare ? compareDeployed(summaryList, remote, env, commitCounterOf(rt.io, env.compare)) : null
    if (rt.json) {
        return rt.printJson({
            env: env.name,
            job: env.job,
            protected: env.isProtected,
            nextBuildNumber: job.nextBuildNumber,
            inQueue: job.inQueue === true,
            queueWhy: job.queueItem?.why ?? '',
            builds: summaryList,
            remote,
            deployed: compared?.deployed ?? null,
            behind: compared?.behind ?? null,
            verifyUrls: env.verifyUrls
        })
    }

    const header = ['编号', '开始时间', '参数', '结果', '耗时', '触发人', '检出提交']
    const rowList = summaryList.map(i => [
        `#${i.number}`,
        formatTime(i.timestamp, rt.io.timeZone),
        Object.values(i.params).join('/') || '-',
        i.building ? '进行中' : RESULT_TEXT_MAP[i.result] || String(i.result),
        i.building ? '-' : formatDuration(i.duration),
        i.triggerId && i.triggerId === rt.conn.account ? '本账号' : i.trigger || '-',
        i.revision ? `${shortSha(i.revision)}${i.revisionFrom === 'console' ? '*' : ''}` : '-'
    ])

    rt.print(`${env.job}（${envLabel(env)}${env.isProtected ? '，受保护' : ''}，${new URL(rt.conn.baseUrl).host}）最近 ${summaryList.length} 次构建`)
    if (rowList.length) rt.print(formatTable([header, ...rowList]))
    if (summaryList.some(i => i.revisionFrom === 'console')) rt.print('* 检出提交取自控制台')
    rt.print(`队列：${describeQueue(job, summaryList)}`)
    rt.print(`下一个构建号：#${job.nextBuildNumber}`)
    if (compared) rt.print(compared.text)
}

/* 子命令：console */

const runConsole = async rt => {
    const { env } = prepareConnected(rt)
    const number = await resolveBuildNumber(rt, env, rt.positionals[1])
    const tail = toPositiveInt(rt.values.tail, '--tail', TAIL_MAX_LINES)
    const text = rt.redactor.redact(await fetchText(rt, `${env.jobPath}/${number}/consoleText`))
    const lineList = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
    const tailList = lineList.slice(-tail)
    if (rt.json) return rt.printJson({ env: env.name, job: env.job, number, totalLines: lineList.length, lines: tailList })

    rt.print(`${env.job} #${number} 控制台最后 ${tailList.length} 行（共 ${lineList.length} 行）`)
    rt.print(tailList.join('\n'))
}

/* 子命令：wait */

const reportFinished = (rt, env, build) => {
    if (build.result !== 'SUCCESS') rt.exitCode = EXIT.failed
    if (rt.json) return rt.printJson({ env: env.name, job: env.job, ...build, verifyUrls: env.verifyUrls })

    const resultText = RESULT_TEXT_MAP[build.result] || build.result
    rt.print(`${env.job} #${build.number} ${resultText}，耗时 ${formatDuration(build.duration)}（${formatTime(build.timestamp, rt.io.timeZone)} 开始）`)
    if (build.result === 'SUCCESS' && env.verifyUrls.length) rt.print(`验收地址：${env.verifyUrls.join('  ')}`)
    if (build.result !== 'SUCCESS') rt.print('用 console 看控制台最后几行，找失败原因')
}

const runWait = async rt => {
    const { env } = prepareConnected(rt)
    const number = await resolveBuildNumber(rt, env, rt.positionals[1])
    const intervalMs = toPositiveInt(rt.values.interval, '--interval', INTERVAL_MAX_SECONDS) * 1000
    const limitMinutes = toPositiveInt(rt.values['max-wait'], '--max-wait', WAIT_MAX_MINUTES)
    const limitMs = limitMinutes * 60_000
    const startedAt = rt.io.now()
    const tree = 'number,timestamp,result,duration,building,estimatedDuration'

    while (true) {
        const build = await fetchJson(rt, `${env.jobPath}/${number}/api/json`, { tree }, { allowNotFound: true })
        if (build && !build.building && build.result) return reportFinished(rt, env, build)

        const waited = rt.io.now() - startedAt
        if (waited >= limitMs) throw new CliError(`等待超时：#${number} ${limitMinutes} 分钟还没结束`, EXIT.timeout)

        rt.warn(build ? `#${number} 进行中，已跑 ${formatDuration(rt.io.now() - build.timestamp)}` : `#${number} 还没开始，可能在排队`)
        await rt.io.sleep(Math.min(intervalMs, limitMs - waited))
    }
}

/* 子命令：build */

const runBuild = async rt => {
    const { env, secrets } = prepare(rt)
    const { params, isRollback } = planBuild(env, { paramList: rt.values.param ?? [], isRollback: rt.values.rollback, target: rt.values.target })
    const cred = credentialOf(env.secretPrefix, secrets.secretMap)
    const isOffline = env.isProtected && missingKeysOf(cred).length > 0

    let job = null
    if (!isOffline) {
        rt.conn = connectOf(rt, env, secrets)
        warnPassword(rt, env, rt.conn)
        const tree = 'nextBuildNumber,inQueue,lastBuild[number,building],property[parameterDefinitions[name,choices]]'
        job = await fetchJson(rt, `${env.jobPath}/api/json`, { tree })
        const problemList = jobParamProblemsOf(definitionsOf(job), params)
        if (problemList.length) throw new CliError(`${env.job} 的参数和发版配置对不上：${problemList.join('；')}；先核对 job 配置或发版配置`)
    }

    const remote = env.compare ? remoteHeadOf(rt.io, env.compare) : null
    const busyText = job ? describeBusy(job) : ''
    const plan = {
        env: env.name,
        job: env.job,
        protected: env.isProtected,
        rollback: isRollback,
        parameters: params,
        remote: remote ? (remote.sha ?? null) : undefined,
        nextBuildNumber: job?.nextBuildNumber ?? null,
        busy: busyText
    }

    /* 受保护的环境永远走不到提交那一步：带 --yes 也只打印，退出码 5 */
    if (env.isProtected || !rt.values.yes) {
        const isRefused = env.isProtected && rt.values.yes === true
        if (isRefused) rt.exitCode = EXIT.protected
        if (rt.json) return rt.printJson({ dryRun: true, refused: isRefused, ...plan, verified: !isOffline })

        rt.print(`将触发 ${env.job}（${envLabel(env)}）${isRollback ? '回滚' : ''}：${paramText(params)}`)
        if (remote) rt.print(`远程 ${env.compare.remote}/${env.compare.branch}=${remote.sha || `取不到（${remote.error}）`}`)
        if (job) rt.print(`预计构建号 #${job.nextBuildNumber}`)
        if (busyText) rt.print(busyText)
        if (isOffline) rt.print(`没配 ${env.secretPrefix} 的密钥，没核对 Jenkins 上的 job 与参数`)
        if (env.isProtected) {
            rt.print(`${env.name} 是受保护的环境：工具只打印、不触发，请用户自己到 Jenkins 上操作`)
            if (isRefused) rt.warn(`${env.name} 是受保护的环境，带 --yes 也不触发`)
            return
        }
        return rt.print('未带 --yes，只打印不发送；用户核对同意后加 --yes 再跑一次')
    }

    return submitBuild(rt, env, params, job, plan)
}

/** 真正提交构建：只有不受保护的环境、带了 --yes 才会走到这里 */
const submitBuild = async (rt, env, params, job, plan) => {
    if (env.isProtected) throw new CliError(`${env.name} 是受保护的环境，不触发`, EXIT.protected)

    const crumbHeaders = await fetchCrumbHeaders(rt)
    const endpoint = Object.keys(params).length ? 'buildWithParameters' : 'build'
    const response = await requestJenkins(rt, `${env.jobPath}/${endpoint}`, {
        method: 'POST',
        headers: crumbHeaders,
        body: new URLSearchParams(params)
    })
    const queueUrl = response.headers.get('location') || ''
    if (rt.json) return rt.printJson({ dryRun: false, ...plan, status: response.status, queueUrl })

    rt.print(`已提交 ${env.job}（${envLabel(env)}）：${paramText(params)}；HTTP ${response.status}，队列 ${queueUrl || '（Jenkins 没给）'}`)
    rt.print(`下一步：用同样的 --config、--secrets、--env 运行 wait ${job.nextBuildNumber}（或 wait last）`)
}

/* 子命令：check */

const runCheck = async rt => {
    const { io, values } = rt
    const result = { ok: true, config: null, secrets: null, environments: [] }
    const lineList = []
    const failList = []
    const fail = text => {
        failList.push(text)
        result.ok = false
    }
    const finish = () => {
        if (!result.ok) rt.exitCode = EXIT.checkFailed
        if (rt.json) return rt.printJson({ ...result, failures: failList })

        lineList.push(failList.length ? `结论：有 ${failList.length} 项没通过：${failList.join('；')}` : '结论：全部通过')
        rt.print(lineList.join('\n'))
    }

    /* 发版配置 */
    const where = configPathOf({ values, env: io.env, cwd: io.cwd })
    let config
    try {
        config = loadConfig(where, io.readFile)
    } catch (error) {
        if (!(error instanceof CliError)) throw error
        result.config = { path: where.path, source: where.source, ok: false, error: error.message }
        lineList.push(`发版配置：没通过，${error.message}`)
        fail('发版配置')
        return finish()
    }
    const nameList = [...config.environments.keys()]
    result.config = { path: where.path, source: where.source, ok: true, environments: nameList, defaultEnv: config.defaultEnv }
    lineList.push(`发版配置：通过，${where.path}（来源：${where.source}），${nameList.length} 个环境：${nameList.join('、')}${config.defaultEnv ? `，默认 ${config.defaultEnv}` : ''}`)

    /* 密钥文件 */
    const secretPaths = secretPathsOf({ values, env: io.env, cwd: io.cwd, delimiter: io.delimiter ?? PATH_DELIMITER })
    const secrets = loadSecrets(secretPaths.pathList, io.readFile)
    addSecretLike(rt.redactor, secrets.secretMap)
    result.secrets = { source: secretPaths.source, files: secrets.fileList.map(({ path, isFound, reason }) => ({ path, found: isFound, reason })) }
    if (!secretPaths.pathList.length) lineList.push(`密钥文件：没给（用 --secrets 指定，或设环境变量 ${SECRETS_ENV}）`)
    else lineList.push(`密钥文件（来源：${secretPaths.source}）：${secrets.fileList.map(i => `${i.path} ${i.isFound ? '读到了' : i.reason}`).join('；')}`)

    /* 各环境 */
    const envList = values.env === undefined ? [...config.environments.values()] : [pickEnv(config, values.env)]
    for (const env of envList) {
        const item = { name: env.name, job: env.job, secretPrefix: env.secretPrefix, protected: env.isProtected, keys: { set: [], missing: [] }, items: [], verifyUrls: env.verifyUrls }
        result.environments.push(item)
        const record = (name, status, text) => {
            item.items.push({ name, status, text })
            lineList.push(`  ${text}`)
            if (status === 'fail') fail(`${env.name} ${text.split('：')[0]}`)
        }
        lineList.push(`[${envLabel(env)}] job ${env.job}，密钥前缀 ${env.secretPrefix}${env.isProtected ? '，受保护（只打印不触发）' : ''}`)

        const cred = credentialOf(env.secretPrefix, secrets.secretMap)
        rt.redactor.add(cred.token, cred.password, cred.account, cred.apiAccount)
        /* 键名只放进数组（不写成「键: 值」），免得 *_TOKEN、*_PASSWORD 这类键名被抹密钥的样式误伤、弄坏 JSON */
        const keyList = Object.entries(cred.keyState).map(([key, isSet]) => [`${env.secretPrefix}_${key}`, isSet])
        item.keys = { set: keyList.filter(([, isSet]) => isSet).map(([key]) => key), missing: keyList.filter(([, isSet]) => !isSet).map(([key]) => key) }
        const keyText = keyList.map(([key, isSet]) => `${key} ${isSet ? '有' : '没有'}`).join('，')
        const missingList = missingKeysOf(cred)
        if (missingList.length && env.isProtected) {
            record('keys', 'skip', `密钥：${keyText}；受保护的环境可以不配，只打印将触发的内容，不核对 Jenkins`)
        } else if (missingList.length) {
            record('keys', 'fail', `密钥：没通过，缺 ${missingList.join('、')}（${keyText}）；请用户自己填进 secrets.env`)
        } else {
            record('keys', 'ok', `密钥：通过（${keyText}；${cred.token ? '用令牌登录' : '用口令登录，建议改用 API 令牌'}）`)
        }

        const canConnect = !missingList.length && !values.offline
        let conn = null
        if (canConnect) {
            try {
                conn = connectOf(rt, env, secrets)
            } catch (error) {
                if (!(error instanceof CliError)) throw error
                record('connect', 'fail', `连接：没通过，${error.message}`)
            }
        }
        if (conn) {
            const envRt = { ...rt, conn }
            const isConnected = await checkConnect(envRt, record)
            if (isConnected) await checkJob(envRt, env, record)
        } else if (values.offline) {
            record('connect', 'skip', '连接：跳过（--offline）')
        } else if (missingList.length) {
            record('connect', 'skip', '连接：跳过（密钥不全）')
        }

        if (env.compare && !values.offline) {
            const remote = remoteHeadOf(io, env.compare)
            const label = `${env.compare.remote}/${env.compare.branch}`
            if (remote.sha) record('remote', 'ok', `远程分支：通过（${label}=${shortSha(remote.sha)}）`)
            else record('remote', 'fail', `远程分支：没通过，${label} ${remote.error}`)
        }
        if (env.verifyUrls.length) lineList.push(`  验收地址：${env.verifyUrls.join('  ')}`)
    }

    return finish()
}

/** check：能不能登录 Jenkins（whoAmI，老版本没有时退回根地址） */
const checkConnect = async (rt, record) => {
    try {
        let response = await requestJenkins(rt, 'whoAmI/api/json', { query: { tree: 'name,authenticated,anonymous' }, allowNotFound: true })
        let who = null
        if (response) who = JSON.parse(await response.text())
        else response = await requestJenkins(rt, 'api/json', { query: { tree: 'mode' } })
        const version = response.headers.get('x-jenkins')
        const versionText = version ? `Jenkins ${version}，` : ''
        if (who && (who.anonymous === true || who.authenticated === false || who.name === 'anonymous')) {
            record('connect', 'fail', `连接：没通过，${versionText}以匿名身份访问，账号或令牌不对`)
            return false
        }
        record('connect', 'ok', `连接：通过（${versionText}已登录）`)
        return true
    } catch (error) {
        if (!(error instanceof CliError) && !(error instanceof SyntaxError)) throw error
        record('connect', 'fail', `连接：没通过，${error instanceof SyntaxError ? 'Jenkins 返回的不是 JSON' : error.message}`)
        return false
    }
}

/** check：job 在不在、配置里声明的参数 job 上有没有、可选值对不对得上 */
const checkJob = async (rt, env, record) => {
    let job
    try {
        job = await fetchJson(rt, `${env.jobPath}/api/json`, { tree: 'name,buildable,property[parameterDefinitions[name,choices]]' }, { allowNotFound: true })
    } catch (error) {
        if (!(error instanceof CliError)) throw error
        record('job', 'fail', `job：没通过，${error.message}`)
        return
    }
    if (!job) {
        record('job', 'fail', `job：没通过，${env.job} 不存在，或这个账号看不到`)
        return
    }
    record('job', 'ok', `job：通过（${env.job} 存在${job.buildable === false ? '，但现在不可构建' : ''}）`)

    const definitionList = definitionsOf(job)
    const nameList = [...env.params.map(i => i.name), ...(env.rollback?.targetParam ? [env.rollback.targetParam] : [])]
    if (!nameList.length) {
        if (definitionList.length) record('params', 'fail', `参数：没通过，job 有参数 ${definitionList.map(i => i.name).join('、')}，发版配置一个都没声明`)
        else record('params', 'ok', '参数：通过（job 与发版配置都不带参数）')
        return
    }

    const problemList = []
    const missingList = nameList.filter(name => !definitionList.some(i => i.name === name))
    if (missingList.length) problemList.push(`job 上没有 ${missingList.join('、')}`)
    for (const param of env.params) {
        const choiceList = definitionList.find(i => i.name === param.name)?.choices
        if (!Array.isArray(choiceList)) continue
        const valueList = param.choices ?? [param.value]
        const outList = valueList.filter(i => !choiceList.includes(i))
        if (outList.length) problemList.push(`${param.name} 的 ${outList.join('、')} 不在 job 的可选值里（${choiceList.join('、')}）`)
    }
    if (problemList.length) record('params', 'fail', `参数：没通过，${problemList.join('；')}`)
    else record('params', 'ok', `参数：通过（${nameList.join('、')} job 上都有）`)
}

/* 入口 */

const COMMAND_MAP = { check: runCheck, status: runStatus, console: runConsole, wait: runWait, build: runBuild }

const OPTION_CONFIG = {
    config: { type: 'string' },
    secrets: { type: 'string', multiple: true },
    env: { type: 'string' },
    json: { type: 'boolean', default: false },
    offline: { type: 'boolean', default: false },
    tail: { type: 'string', default: '60' },
    interval: { type: 'string', default: '15' },
    'max-wait': { type: 'string', default: String(WAIT_DEFAULT_MINUTES) },
    param: { type: 'string', multiple: true },
    rollback: { type: 'boolean', default: false },
    target: { type: 'string' },
    yes: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false }
}

/**
 * 真实的外部能力：Node 自带的 fetch、读文件、git、计时与标准输出。
 * @returns io
 */
export const nodeIo = () => ({
    fetch: (url, options) => fetch(url, options),
    readFile: path => readFileSync(path, 'utf8'),
    env: process.env,
    cwd: process.cwd(),
    delimiter: PATH_DELIMITER,
    git: argList =>
        execFileSync('git', argList, {
            cwd: process.cwd(),
            encoding: 'utf8',
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: REQUEST_TIMEOUT_MS
        }).trim(),
    sleep: ms => sleep(ms),
    now: () => Date.now(),
    stdout: text => process.stdout.write(text),
    stderr: text => process.stderr.write(text),
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    timeZone: undefined
})

/**
 * 跑一次命令：解析参数、分派子命令；所有输出（含报错）先抹掉密钥再写出。
 * @param argv 命令行参数（不含 node 与脚本路径）
 * @param io 外部能力，测试时换成假的
 * @returns 退出码
 */
export const run = async (argv, io = nodeIo()) => {
    const redactor = createRedactor()
    const print = text => io.stdout(`${redactor.redact(text)}\n`)
    const warn = text => io.stderr(`${redactor.redact(text)}\n`)
    try {
        let parsed
        try {
            parsed = parseArgs({ args: argv, allowPositionals: true, options: OPTION_CONFIG, strict: true })
        } catch (error) {
            throw new CliError(`参数不对：${error.message}\n\n${USAGE}`)
        }
        const { values, positionals } = parsed
        if (values.help || !positionals.length) {
            print(USAGE)
            return EXIT.ok
        }

        const command = COMMAND_MAP[positionals[0]]
        if (!command) throw new CliError(`未知子命令 ${positionals[0]}\n\n${USAGE}`)

        const rt = {
            io,
            values,
            positionals,
            redactor,
            print,
            warn,
            printJson: data => print(JSON.stringify(data, null, 2)),
            json: values.json,
            conn: null,
            exitCode: EXIT.ok
        }
        await command(rt)
        return rt.exitCode
    } catch (error) {
        const isKnown = error instanceof CliError
        warn(isKnown ? error.message : error?.stack || String(error))
        return isKnown ? error.exitCode : EXIT.error
    }
}

/** 是否被 node 直接运行（被测试导入时不跑） */
const isMain = () => {
    try {
        return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    } catch {
        return false
    }
}

if (isMain()) process.exitCode = await run(process.argv.slice(2))
