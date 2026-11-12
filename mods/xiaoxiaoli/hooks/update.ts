/**
 * @description 自动更新：两个 mod（陪伴猫 xiaoke、工作台 xiaoxiaoli）各放一份同样的这个文件，逻辑相同。
 * 纯函数：取版本与更新要点的两个地址、语义化版本比较（只认正式版本）、从 CHANGELOG.md 截出某个版本的要点、
 * 按插件目录判断是插件市场安装还是本地目录加载、今天查过没有、更新命令、失败原因与给用户看的提示文字。
 * 流程 runUpdateCheck 不碰引擎：联网、运行命令、读写 $.store 与环境变量都由各自的 register.tsx 经 UpdatePortsType 传进来，便于测试
 * @author xiao li
 * @createDate 2026-11-13 10:00
 */

/** 发布仓库（GitHub 上的 owner/repo）与主分支：只认主分支上的正式版本 */
export const REPO = 'xiaoli1999/xiaoli-mods'
export const BRANCH = 'master'
/** 版本号所在的清单与更新要点，相对 mod 目录 */
export const MANIFEST_FILE = '.claude-plugin/plugin.json'
export const CHANGELOG_FILE = 'CHANGELOG.md'
/** 今天成功查过的日期记在 $.store 的这个键下（本地日期 YYYY-MM-DD） */
export const CHECKED_DAY_KEY = 'updateCheckedDay'
/** 会话启动后等多久再查：不挡启动，也让首次引导这类事先走 */
export const CHECK_DELAY_MS = 10_000
/** 会话正忙或另一个 mod 正在更新时，隔多久再看一次 */
export const WAIT_POLL_MS = 5_000
/** 最多等几次（约 1 小时）：一直等不到空闲就这次不更新，下次开会话再试 */
export const WAIT_LIMIT = 720
/** 每条更新命令最多跑多久 */
export const RUN_TIMEOUT_MS = 180_000
/** 更新成功后的提示停留多久 */
export const NOTICE_TIMEOUT_MS = 15_000
/** 更新要点最多显示几条 */
export const NOTE_LIMIT = 5
/** 失败原因最多显示几个字符 */
const REASON_LIMIT = 160
/** 正式版本号：x.y.z，各段为不带前导零的非负整数；可带一个 v 前缀，不认预发布与构建后缀 */
const VERSION_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/i
/** 市场名：拼进命令前核对，只认字母、数字与 . _ - */
const MARKET_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i
/** claude plugin update 在已是最新时的说法，括号里是它认为的最新版本 */
const ALREADY_LATEST_PATTERN = /already at the latest version(?:\s*\(([^)]*)\))?/i

/** 解析后的版本号：主、次、修订 */
export type VersionPartsType = readonly [number, number, number]

/** 插件是怎么装的：插件市场安装（带市场名），或本地目录加载（CLAUDE_CODE_PLUGIN_DIRS、--plugin-dir 等） */
export type InstallType = { kind: 'market'; marketplace: string } | { kind: 'local' }

/** 给用户看的一条提示：toast 一句短的，对话里记一段长的（带更新要点） */
export interface UpdateNoticeType {
    toast: string
    log: string
}

/** 运行一条命令的结果；起不来时由 run 抛出 */
export interface RunResultType {
    exitCode: number
    stdout: string
    stderr: string
}

/**
 * 两个取文件的地址，按顺序试：GitHub 原始文件，取不到再走 jsDelivr 镜像。地址里只有仓库、分支、mod 名与文件名，不带任何用户或项目信息。
 * @param mod mod 目录名（xiaoke、xiaoxiaoli）
 * @param file 相对 mod 目录的文件
 * @returns 两个地址
 */
export const sourceUrls = (mod: string, file: string): string[] => [
    `https://raw.githubusercontent.com/${REPO}/${BRANCH}/mods/${mod}/${file}`,
    `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/mods/${mod}/${file}`
]

/**
 * 解析正式版本号：去掉首尾空白，可带一个 v 前缀；格式不对、带预发布或构建后缀都不认。
 * @param raw 原值
 * @returns 三段数字，不认为 null
 */
export const parseVersion = (raw: unknown): VersionPartsType | null => {
    if (typeof raw !== 'string') return null

    const match = VERSION_PATTERN.exec(raw.trim())
    if (match === null) return null

    return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * 比较两个正式版本号，逐段按数字比（0.10.0 比 0.9.0 大）。
 * @param a 版本号
 * @param b 版本号
 * @returns a 大为正数、相等为 0、小为负数；有一个不认就是 null
 */
export const compareVersion = (a: unknown, b: unknown): number | null => {
    const left = parseVersion(a)
    const right = parseVersion(b)
    if (left === null || right === null) return null

    for (let i = 0; i < 3; i += 1) {
        const diff = (left[i] ?? 0) - (right[i] ?? 0)
        if (diff !== 0) return diff
    }

    return 0
}

/**
 * 远端是不是新版：两个都是正式版本号，且远端更大。认不出的一律不算新版。
 * @param remote 远端版本
 * @param local 当前版本
 * @returns 是否新版
 */
export const isNewer = (remote: unknown, local: unknown): boolean => (compareVersion(remote, local) ?? 0) > 0

/**
 * 从 plugin.json 的原文里取 version。
 * @param text 文件原文
 * @returns 版本号原文（去掉首尾空白），读不懂或没写为 null
 */
export const manifestVersion = (text: string): string | null => {
    try {
        const value: unknown = JSON.parse(text)
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

        const version = (value as Record<string, unknown>).version
        return typeof version === 'string' ? version.trim() : null
    } catch {
        return null
    }
}

/** 正则里要转义的字符 */
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 从 CHANGELOG.md 截出某个版本那一节的要点：找「## <版本号>」开头的标题（版本号前可带 v、可加方括号，后面可跟日期等），
 * 取它到下一个「# 」「## 」标题之间以「- 」或「* 」开头的行，最多 limit 条；提示是纯文字，去掉行内代码的反引号与加粗的 **。
 * 没有这一节、文字为空时为空数组。
 * @param text CHANGELOG.md 原文
 * @param version 版本号，如 0.9.0
 * @param limit 最多几条
 * @returns 要点，不带列表符号
 */
export const changelogNotes = (text: string, version: string, limit: number = NOTE_LIMIT): string[] => {
    const plain = version.trim().replace(/^v/i, '')
    if (plain === '') return []

    const heading = new RegExp(`^##\\s+\\[?v?${escapeRegExp(plain)}\\]?(?=\\s|$|[（(])`, 'i')
    const lineList = text.split(/\r?\n/)
    const start = lineList.findIndex(line => heading.test(line.trim()))
    if (start < 0) return []

    const noteList: string[] = []
    for (const line of lineList.slice(start + 1)) {
        if (/^#{1,2}\s/.test(line.trim())) break
        const bullet = /^\s*[-*]\s+(.+)$/.exec(line)?.[1]?.replace(/`|\*\*/g, '').trim()
        if (bullet) noteList.push(bullet)
        if (noteList.length >= limit) break
    }

    return noteList
}

/**
 * 判断插件是怎么装的：插件市场安装的插件被复制进 Claude Code 的插件缓存，插件目录是 <插件根>/cache/<市场名>/<mod>/<版本>/
 * （插件根默认 ~/.claude/plugins，可经 CLAUDE_CODE_PLUGIN_CACHE_DIR 换位置），市场名取自路径；其余（CLAUDE_CODE_PLUGIN_DIRS、
 * --plugin-dir 原地加载的仓库目录等）都算本地目录加载。分隔符、大小写不影响判断。
 * @param root 插件目录（$.plugin.root）
 * @param mod mod 名
 * @returns 安装方式
 */
export const installOf = (root: string, mod: string): InstallType => {
    const path = root.replace(/\\/g, '/').replace(/\/+$/, '')
    const marketplace = new RegExp(`/cache/([^/]+)/${escapeRegExp(mod)}/[^/]+$`, 'i').exec(path)?.[1] ?? ''

    return MARKET_PATTERN.test(marketplace) ? { kind: 'market', marketplace } : { kind: 'local' }
}

/**
 * 今天查过没有：$.store 里记的日期就是今天。
 * @param stored $.store 里记的值
 * @param today 今天的本地日期
 * @returns 是否查过
 */
export const isCheckedToday = (stored: unknown, today: string): boolean => typeof stored === 'string' && stored === today

/**
 * 插件市场安装时依次运行的两条命令：先刷新这个市场的副本（拿到主分支上的新版本），再更新这个插件。
 * @param mod mod 名
 * @param marketplace 市场名
 * @returns 两条命令的参数
 */
export const updateSteps = (mod: string, marketplace: string): string[][] => [
    ['claude', 'plugin', 'marketplace', 'update', marketplace],
    ['claude', 'plugin', 'update', `${mod}@${marketplace}`]
]

/**
 * 手动更新的命令（给用户看），与 updateSteps 同样两条。
 * @param mod mod 名
 * @param marketplace 市场名
 * @returns 命令文字
 */
export const updateCommandText = (mod: string, marketplace: string): string =>
    updateSteps(mod, marketplace)
        .map(argv => argv.join(' '))
        .join('，再运行 ')

/**
 * 一条命令依次尝试的写法：先直接运行；Windows 上 claude 是 npm 装的 .cmd 时不经 shell 起不来，再经 cmd /c 运行同一条命令。
 * 只有前一个起不来（不是退出码不为 0）才试下一个。
 * @param argv 命令参数
 * @param isWindows 是否 Windows
 * @returns 写法列表
 */
export const argvCandidates = (argv: readonly string[], isWindows: boolean): string[][] => (isWindows ? [[...argv], ['cmd', '/c', ...argv]] : [[...argv]])

/**
 * 是否 Windows 写法的路径：带反斜杠，或以盘符开头。
 * @param path 路径
 * @returns 是否 Windows
 */
export const isWindowsPath = (path: string): boolean => path.includes('\\') || /^[a-zA-Z]:[\\/]/.test(path)

/** 最后一行非空的文字 */
const lastLine = (text: string): string =>
    text
        .split(/\r?\n/)
        .map(i => i.trim())
        .filter(i => i !== '')
        .at(-1) ?? ''

/**
 * 失败原因：标准错误最后一行非空的文字，没有取标准输出的，太长截断；都没有时为退出码。
 * @param result 命令的结果
 * @returns 原因
 */
export const failureReason = ({ exitCode, stdout, stderr }: RunResultType): string => {
    const line = lastLine(stderr) || lastLine(stdout)
    if (line === '') return `退出码 ${exitCode}`

    return [...line].length > REASON_LIMIT ? `${[...line].slice(0, REASON_LIMIT).join('')}..` : line
}

/**
 * 另一个 mod 是不是正在更新：两个 mod 共用一个进程环境变量当锁，里面是正在更新的 mod 名；是自己（上一个模块留下的）或空都不算。
 * @param holder 锁里的值
 * @param mod 自己的 mod 名
 * @returns 是否被别的 mod 占着
 */
export const isHeldByOther = (holder: string | undefined, mod: string): boolean => holder !== undefined && holder !== '' && holder !== mod

/** 更新要点拼进对话里那段的写法：每条一行 */
const notesBlock = (noteList: readonly string[]): string[] => noteList.map(note => `- ${note}`)

/** 提示文字的参数 */
export interface NoticeOptionsType {
    /** 提示开头的主语，如「工作台」；不要时传 '' */
    subject: string
    /** 当前版本 */
    from: string
    /** 新版本 */
    to: string
    /** 新版本的更新要点，取不到为空 */
    noteList: readonly string[]
}

/**
 * 插件市场安装、更新成功后的提示：说从哪个版本更新到哪个、更新要点，以及怎么生效（已经发起重载时说正在重新加载）。
 * @param options 主语、版本、要点
 * @param isReloading 是否已经发起了 /reload-plugins
 * @returns 提示
 */
export const updatedNotice = ({ subject, from, to, noteList }: NoticeOptionsType, isReloading: boolean): UpdateNoticeType => {
    const head = `${subject}已从 ${from} 更新到 ${to}`
    const how = isReloading
        ? '正在重新加载插件，马上生效；没生效就输入 /reload-plugins，或下次开会话自动生效'
        : '输入 /reload-plugins 立即生效，或下次开会话自动生效'

    return {
        toast: `${head}${noteList.length ? '（更新要点见对话里的记录）' : ''}；${how}`,
        log: [`${head}${noteList.length ? '，更新要点：' : ''}`, ...notesBlock(noteList), how].join('\n')
    }
}

/**
 * 插件市场安装、更新失败时的提示：原因、不影响继续使用、手动更新的命令，下次开会话再试。
 * @param options 主语、版本（要点不用）
 * @param reason 失败原因
 * @param command 手动更新的命令
 * @returns 提示
 */
export const failedNotice = ({ subject, from, to }: NoticeOptionsType, reason: string, command: string): UpdateNoticeType => {
    const text = `${subject}发现新版 ${to}（当前 ${from}），自动更新没成功（${reason}）；不影响继续使用，可以手动运行 ${command}，下次开会话也会再试`
    return { toast: text, log: text }
}

/**
 * 本地目录加载、有新版时的提示：不自动改文件，到仓库目录 git pull。
 * @param options 主语、版本、要点
 * @returns 提示
 */
export const localNotice = ({ subject, from, to, noteList }: NoticeOptionsType): UpdateNoticeType => {
    const head = `${subject}发现新版 ${to}（当前 ${from}）`
    const how = '本机是从本地目录加载的，不自动更新；到仓库目录运行 git pull 即可'

    return {
        toast: `${head}；${how}`,
        log: [`${head}${noteList.length ? '，更新要点：' : ''}`, ...notesBlock(noteList), how].join('\n')
    }
}

/** 自动更新流程要用的外部能力，由 register.tsx 用引擎接口实现 */
export interface UpdatePortsType {
    /** mod 名，也是插件名 */
    mod: string
    /** 提示开头的主语 */
    subject: string
    /** 插件目录（$.plugin.root） */
    root: string
    /** 今天的本地日期 */
    today: string
    /** 读、写 $.store 里今天查过的日期 */
    readCheckedDay: () => Promise<unknown>
    writeCheckedDay: (day: string) => Promise<void>
    /** 自己的 plugin.json 原文，读不到为 '' */
    readManifest: () => Promise<string>
    /** 取一个地址的正文：GET，不带请求头；状态不是 2xx、正文为空或连不上时为 null */
    fetchText: (url: string) => Promise<string | null>
    /** 主对话是不是正在跑一轮 */
    isBusy: () => Promise<boolean>
    /** 两个 mod 共用的更新锁（进程环境变量）：读、写，undefined 为清掉 */
    readLock: () => Promise<string | undefined>
    writeLock: (value: string | undefined) => Promise<void>
    /** 最近一次由哪个 mod 发起重载的时间（进程环境变量，毫秒时间戳的文字） */
    readReloadAt: () => Promise<string | undefined>
    writeReloadAt: (value: string) => Promise<void>
    now: () => Promise<number>
    sleep: (ms: number) => Promise<void>
    /** 运行一条命令；起不来时抛出 */
    run: (argv: readonly string[]) => Promise<RunResultType>
    /** 能不能由 mod 发起 /reload-plugins（命令表里有这个内置命令） */
    canReload: () => Promise<boolean>
    /** 发起 /reload-plugins（引擎在会话空闲时运行） */
    reload: () => Promise<void>
    /** 给用户看提示 */
    notify: (notice: UpdateNoticeType) => Promise<void>
    /** 记一行调试日志 */
    log: (text: string) => void
}

/** 一次检查的结果，测试与日志用 */
export type UpdateOutcomeType =
    /** 今天已经查过 */
    | 'checked-today'
    /** 读不到自己的版本号，或两个地址都取不到主分支上的版本号：不记今天，下次开会话再查 */
    | 'fetch-failed'
    /** 主分支上的版本不比自己新：记今天 */
    | 'up-to-date'
    /** 本地目录加载、有新版：只提示，记今天 */
    | 'local-notified'
    /** 一直等不到空闲：这次不更新，不记今天 */
    | 'gave-up'
    /** 插件市场安装、更新失败：提示原因与手动命令，不记今天 */
    | 'update-failed'
    /** 插件市场安装、更新成功：记今天 */
    | 'updated'

/**
 * 等到会话空闲、且另一个 mod 没在更新：每 WAIT_POLL_MS 看一次，最多 WAIT_LIMIT 次。
 * @param ports 外部能力
 * @param isBusyCheck 是否也要等会话空闲
 * @returns 等到了为 true
 */
const waitTurn = async (ports: UpdatePortsType, isBusyCheck: boolean): Promise<boolean> => {
    for (let i = 0; i < WAIT_LIMIT; i += 1) {
        const isBusy = isBusyCheck && (await ports.isBusy())
        if (!isBusy && !isHeldByOther(await ports.readLock(), ports.mod)) return true
        await ports.sleep(WAIT_POLL_MS)
    }

    return false
}

/**
 * 运行一条命令，起不来时按 argvCandidates 换写法再试；都起不来时退出码记 -1、原因放进标准错误。
 * @param ports 外部能力
 * @param argv 命令参数
 * @returns 结果
 */
const runStep = async (ports: UpdatePortsType, argv: readonly string[]): Promise<RunResultType> => {
    let error = ''
    for (const candidate of argvCandidates(argv, isWindowsPath(ports.root))) {
        try {
            return await ports.run(candidate)
        } catch (cause) {
            error = cause instanceof Error ? cause.message : String(cause)
        }
    }

    return { exitCode: -1, stdout: '', stderr: error || '命令起不来' }
}

/**
 * 依次取两个地址，第一个取到的正文。
 * @param ports 外部能力
 * @param file 相对 mod 目录的文件
 * @returns 正文，都取不到为 null
 */
const fetchFirst = async (ports: UpdatePortsType, file: string): Promise<string | null> => {
    for (const url of sourceUrls(ports.mod, file)) {
        const text = await ports.fetchText(url)
        if (text !== null) return text
        ports.log(`取不到 ${url}`)
    }

    return null
}

/**
 * claude plugin update 的输出说「已是最新」时，算不算已经装上了远端的新版：括号里的版本不比远端旧才算
 * （同一天另一个会话刚更新过）；没写版本、版本认不出或比远端旧都算没装上（市场副本还没有新版）。
 * @param output 命令输出
 * @param remote 远端版本
 * @returns 没说「已是最新」为 null；说了时为是否已装上
 */
export const latestIsInstalled = (output: string, remote: string): boolean | null => {
    const match = ALREADY_LATEST_PATTERN.exec(output)
    if (match === null) return null

    return (compareVersion(match[1]?.trim() ?? '', remote) ?? -1) >= 0
}

/**
 * 插件市场安装、有新版时更新：等到会话空闲且另一个 mod 没在更新，占锁，先刷新市场副本再更新插件，放锁。
 * 两条命令都退出码为 0 才算成功；更新命令说「已是最新」时按 latestIsInstalled 判断。
 * @param ports 外部能力
 * @param marketplace 市场名
 * @param remote 远端版本
 * @returns 成功为 ''，失败为原因；一直等不到为 null
 */
const runMarketUpdate = async (ports: UpdatePortsType, marketplace: string, remote: string): Promise<string | null> => {
    if (!(await waitTurn(ports, true))) return null

    await ports.writeLock(ports.mod)
    try {
        let output = ''
        for (const argv of updateSteps(ports.mod, marketplace)) {
            const result = await runStep(ports, argv)
            if (result.exitCode !== 0) return failureReason(result)
            output = `${result.stdout}\n${result.stderr}`
        }
        return latestIsInstalled(output, remote) === false ? '插件市场的副本里还没有新版，稍后再试' : ''
    } finally {
        await ports.writeLock(undefined)
    }
}

/**
 * 更新成功后发起 /reload-plugins：先等另一个 mod 更新完（它更新完也会重载，一次重载两个都生效）；
 * 自己更新完之后已经有别的 mod 发起过重载时就不再发起。
 * @param ports 外部能力
 * @param doneAt 自己更新完的时间
 */
const reloadOnce = async (ports: UpdatePortsType, doneAt: number): Promise<void> => {
    if (!(await waitTurn(ports, false))) return

    const queuedAt = Number(await ports.readReloadAt())
    if (Number.isFinite(queuedAt) && queuedAt >= doneAt) return

    await ports.writeReloadAt(String(await ports.now()))
    await ports.reload()
}

/**
 * 一次自动更新检查：今天成功查过就不查；读自己的版本，依次从两个地址取主分支上的 plugin.json；不比自己新就记今天；
 * 有新版时再取 CHANGELOG.md 截要点，本地目录加载的只提示 git pull（记今天），插件市场安装的等空闲后运行更新命令：
 * 成功记今天、提示更新要点并发起重载（引擎有 /reload-plugins 时），失败提示原因与手动命令、不记今天。
 * 出错都不抛出，由调用方兜底记日志。
 * @param ports 外部能力
 * @returns 结果
 */
export const runUpdateCheck = async (ports: UpdatePortsType): Promise<UpdateOutcomeType> => {
    if (isCheckedToday(await ports.readCheckedDay(), ports.today)) return 'checked-today'

    const current = manifestVersion(await ports.readManifest())
    if (current === null || parseVersion(current) === null) {
        ports.log('读不到自己的版本号，这次不查')
        return 'fetch-failed'
    }

    const manifest = await fetchFirst(ports, MANIFEST_FILE)
    const remote = manifest === null ? null : manifestVersion(manifest)
    if (remote === null || parseVersion(remote) === null) {
        ports.log('取不到主分支上的版本号，下次开会话再查')
        return 'fetch-failed'
    }
    if (!isNewer(remote, current)) {
        await ports.writeCheckedDay(ports.today)
        return 'up-to-date'
    }

    const changelog = await fetchFirst(ports, CHANGELOG_FILE)
    const options: NoticeOptionsType = { subject: ports.subject, from: current, to: remote, noteList: changelog === null ? [] : changelogNotes(changelog, remote) }
    const install = installOf(ports.root, ports.mod)
    if (install.kind === 'local') {
        await ports.writeCheckedDay(ports.today)
        await ports.notify(localNotice(options))
        return 'local-notified'
    }

    const failed = await runMarketUpdate(ports, install.marketplace, remote)
    if (failed === null) {
        ports.log('一直等不到会话空闲，这次不更新')
        return 'gave-up'
    }
    if (failed !== '') {
        await ports.notify(failedNotice(options, failed, updateCommandText(ports.mod, install.marketplace)))
        return 'update-failed'
    }

    await ports.writeCheckedDay(ports.today)
    const doneAt = await ports.now()
    const isReloading = await ports.canReload()
    await ports.notify(updatedNotice(options, isReloading))
    if (isReloading) await reloadOnce(ports, doneAt)

    return 'updated'
}
