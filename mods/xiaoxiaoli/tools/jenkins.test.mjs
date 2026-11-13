/**
 * @description 发版工具（jenkins.mjs）的测试：配置与密钥的查找顺序和合并、键名约定与令牌优先、默认不触发与受保护环境、
 * 参数白名单与可疑字符、check 的各项结果、输出与报错里不出现密钥、超时与等待上限、退出码，以及直接运行。
 * 网络请求、读文件、git、计时全换成假的，不连任何真实地址；运行：node --test mods/xiaoxiaoli/tools/jenkins.test.mjs
 * @author xiao li
 * @createDate 2026-11-13 14:00
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { delimiter, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
    CONFIG_ENV,
    EXIT,
    SECRETS_ENV,
    configPathOf,
    createRedactor,
    credentialOf,
    jobParamProblemsOf,
    loadSecrets,
    missingKeysOf,
    parseEnvText,
    pickEnv,
    planBuild,
    run,
    secretPathsOf,
    toJenkinsRoot,
    validateConfig
} from './jenkins.mjs'

/* 以下全是造的：地址、job、账号、令牌都是虚构的占位 */
const CWD = resolve('/fake/project')
const SHARED_DIR = resolve('/fake/home/.claude/xiaoxiaoli/shared')
const DATA_DIR = resolve('/fake/home/.claude/xiaoxiaoli/projects/my-app-1a2b3c4d')
const CONFIG_PATH = resolve(DATA_DIR, 'release.json')
const SHARED_SECRETS = resolve(SHARED_DIR, 'secrets.env')
const DATA_SECRETS = resolve(DATA_DIR, 'secrets.env')
const BASE = 'https://jenkins.example.com'
const TOKEN = 'tok-Fake0123456789abcdefXYZ'
const PASSWORD = 'pw-Fake-secret-0001'
const ACCOUNT = 'robot-account'
const SHA_REMOTE = 'b'.repeat(40)
const SHA_DEPLOYED = 'a'.repeat(40)

const CONFIG = {
    version: 1,
    defaultEnv: 'dev',
    environments: {
        dev: {
            title: '开发环境',
            secretPrefix: 'JENKINS_DEV',
            job: 'my-app-dev',
            params: { DEPLOY_TYPE: { choices: ['BUILD', 'ROLLBACK', 'LIST'], default: 'BUILD' } },
            verifyUrls: ['https://dev.example.com/healthz'],
            compare: { remote: 'origin', branch: 'dev', ignore: { DEPLOY_TYPE: ['LIST'] } },
            rollback: { param: 'DEPLOY_TYPE', value: 'ROLLBACK', targetParam: 'ROLLBACK_RELEASE', targetPattern: '^(release-[\\w.-]+|previous)$' }
        },
        beta: { secretPrefix: 'JENKINS_DEV', job: 'folder/my-app-beta', params: { TARGET: 'beta' } },
        prod: { title: '生产环境', secretPrefix: 'JENKINS_PROD', job: 'my-app-prod', params: { DEPLOY_TYPE: { choices: ['BUILD'] } }, protected: true }
    }
}
const SECRETS_TEXT = [`JENKINS_DEV_URL=${BASE}/login?from=%2F`, `JENKINS_DEV_ACCOUNT=${ACCOUNT}`, `JENKINS_DEV_API_TOKEN="${TOKEN}"`].join('\n')
const PROD_SECRETS_TEXT = [`JENKINS_PROD_URL=${BASE}`, `JENKINS_PROD_ACCOUNT=${ACCOUNT}`, `JENKINS_PROD_PASSWORD=${PASSWORD}`].join('\n')
const BASE_ARGS = ['--config', CONFIG_PATH, '--secrets', SHARED_SECRETS, '--secrets', DATA_SECRETS]

const json = (data, init = {}) =>
    new Response(JSON.stringify(data), { status: 200, ...init, headers: { 'content-type': 'application/json', 'x-jenkins': '2.400', ...init.headers } })

/** 造的 job：参数定义、最近的构建 */
const jobOf = (patch = {}) => ({
    name: 'my-app-dev',
    buildable: true,
    nextBuildNumber: 35,
    inQueue: false,
    lastBuild: { number: 34, building: false },
    property: [{}, { parameterDefinitions: [{ name: 'DEPLOY_TYPE', choices: ['BUILD', 'ROLLBACK', 'LIST'] }, { name: 'ROLLBACK_RELEASE' }] }],
    builds: [
        { number: 34, timestamp: 0, result: 'SUCCESS', duration: 65_000, building: false, actions: [{ causes: [{ userId: 'other', userName: '同事甲' }] }, { parameters: [{ name: 'DEPLOY_TYPE', value: 'LIST' }] }] },
        { number: 33, timestamp: 0, result: 'SUCCESS', duration: 125_000, building: false, actions: [{ causes: [{ userId: ACCOUNT }] }, { parameters: [{ name: 'DEPLOY_TYPE', value: 'BUILD' }] }, { lastBuiltRevision: { SHA1: SHA_DEPLOYED } }] }
    ],
    ...patch
})

/**
 * 造的 Jenkins：按路径回答；requests 记下每个请求。
 * @param patch 改写个别路径的回答（返回 undefined 时照常）
 */
const fakeJenkins = (patch = () => undefined) => {
    const requests = []
    const handler = async (input, options = {}) => {
        const url = new URL(String(input))
        requests.push({ url: url.href, method: options.method ?? 'GET', headers: options.headers ?? {}, body: options.body ? String(options.body) : '', hasSignal: options.signal instanceof AbortSignal, redirect: options.redirect })
        const patched = await patch(url, options)
        if (patched !== undefined) return patched
        const path = url.pathname
        if (path === '/whoAmI/api/json') return json({ name: ACCOUNT, authenticated: true, anonymous: false })
        if (path === '/crumbIssuer/api/json') return json({ crumbRequestField: 'Jenkins-Crumb', crumb: 'c0ffee' })
        if (path === '/job/my-app-dev/api/json') return json(jobOf())
        if (path === '/job/folder/job/my-app-beta/api/json') return json(jobOf({ name: 'my-app-beta', property: [{ parameterDefinitions: [{ name: 'TARGET' }] }] }))
        if (path === '/job/my-app-prod/api/json') return json(jobOf({ name: 'my-app-prod', property: [{ parameterDefinitions: [{ name: 'DEPLOY_TYPE', choices: ['BUILD'] }] }] }))
        if (path === '/job/my-app-dev/lastBuild/api/json') return json({ number: 34 })
        if (path === '/job/my-app-dev/34/api/json') return json({ number: 34, timestamp: 0, result: 'SUCCESS', duration: 65_000, building: false })
        if (/^\/job\/my-app-dev\/\d+\/consoleText$/.test(path)) return new Response(`Started\nAuthorization: Basic ${Buffer.from(`${ACCOUNT}:${TOKEN}`).toString('base64')}\nusing ${TOKEN}\nFinished: SUCCESS\n`)
        if (path === '/job/my-app-dev/buildWithParameters' && options.method === 'POST') return new Response('', { status: 201, headers: { location: `${BASE}/queue/item/9/` } })
        if (path === '/job/folder/job/my-app-beta/buildWithParameters' && options.method === 'POST') return new Response('', { status: 201, headers: { location: `${BASE}/queue/item/10/` } })

        return new Response('<html><body>Not Found</body></html>', { status: 404, statusText: 'Not Found' })
    }

    return { handler, requests }
}

/** 造的 git：ls-remote 给远程分支的提交，cat-file 都在，rev-list 数出 3 个 */
const fakeGit = argList => {
    if (argList[0] === 'ls-remote') return `${SHA_REMOTE}\trefs/heads/dev`
    if (argList[0] === 'cat-file') return ''
    if (argList[0] === 'rev-list') return '3'
    throw new Error(`unexpected git ${argList.join(' ')}`)
}

/**
 * 造的外部能力。
 * @param world 文件、环境变量、Jenkins、git、超时
 */
const fakeIo = (world = {}) => {
    const files = world.files ?? { [CONFIG_PATH]: JSON.stringify(CONFIG), [DATA_SECRETS]: SECRETS_TEXT }
    const jenkins = world.jenkins ?? fakeJenkins()
    const clock = { now: 1_000_000 }
    const out = []
    const err = []
    const reads = []
    const io = {
        fetch: jenkins.handler,
        readFile: path => {
            reads.push(path)
            if (Object.hasOwn(files, path)) return files[path]
            throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
        },
        env: world.env ?? {},
        cwd: world.cwd ?? CWD,
        delimiter,
        git: world.git ?? fakeGit,
        sleep: async ms => {
            clock.now += ms
        },
        now: () => clock.now,
        stdout: text => out.push(text),
        stderr: text => err.push(text),
        requestTimeoutMs: world.requestTimeoutMs ?? 1000,
        timeZone: 'UTC'
    }

    return { io, jenkins, out, err, reads, clock, text: () => out.join(''), errText: () => err.join('') }
}

/** 跑一次，返回退出码与输出 */
const runWith = async (argv, world) => {
    const fake = fakeIo(world)
    const code = await run(argv, fake.io)
    return { code, ...fake, all: fake.out.join('') + fake.err.join('') }
}

const posts = requests => requests.filter(i => i.method === 'POST' && !i.url.includes('crumbIssuer'))

/** 断言整段输出里没有任何密钥的值 */
const assertNoSecret = text => {
    for (const secret of [TOKEN, PASSWORD, ACCOUNT, Buffer.from(`${ACCOUNT}:${TOKEN}`).toString('base64')]) {
        assert.equal(text.includes(secret), false, `输出里出现了密钥：${secret.slice(0, 4)}…`)
    }
}

const configOf = (raw = CONFIG) => {
    const checked = validateConfig(raw)
    if (checked.errorList) throw new Error(checked.errorList.join('；'))
    return checked.config
}

describe('配置与密钥的查找', () => {
    test('发版配置：--config 优先，其次环境变量 XIAOLI_RELEASE_CONFIG，最后当前目录的 release.json；相对路径按当前目录算', () => {
        const env = { [CONFIG_ENV]: 'from-env.json' }
        assert.deepEqual(configPathOf({ values: { config: 'a/release.json' }, env, cwd: CWD }), { path: resolve(CWD, 'a/release.json'), source: '--config' })
        assert.deepEqual(configPathOf({ values: {}, env, cwd: CWD }), { path: resolve(CWD, 'from-env.json'), source: `环境变量 ${CONFIG_ENV}` })
        assert.deepEqual(configPathOf({ values: {}, env: {}, cwd: CWD }), { path: resolve(CWD, 'release.json'), source: '当前目录' })
    })

    test('经 run：没给 --config 时用环境变量指的那份，再没有用当前目录的；都找不到时说清怎么补', async () => {
        const fromEnv = await runWith(['check', '--offline', '--secrets', DATA_SECRETS], { env: { [CONFIG_ENV]: CONFIG_PATH } })
        assert.equal(fromEnv.code, EXIT.ok)
        assert.match(fromEnv.text(), new RegExp(`来源：环境变量 ${CONFIG_ENV}`))
        const cwdConfig = resolve(CWD, 'release.json')
        const fromCwd = await runWith(['check', '--offline', '--secrets', DATA_SECRETS], { files: { [cwdConfig]: JSON.stringify(CONFIG), [DATA_SECRETS]: SECRETS_TEXT } })
        assert.match(fromCwd.text(), /来源：当前目录/)
        const none = await runWith(['status'], { files: {} })
        assert.equal(none.code, EXIT.error)
        assert.match(none.errText(), /不存在；用 --config <路径> 指定，或设环境变量 XIAOLI_RELEASE_CONFIG，或在当前目录放 release\.json/)
    })

    test('密钥文件：--secrets 可重复、后面的覆盖前面的；没给时用环境变量（系统路径分隔符隔开）；读不到的文件跳过并记下', () => {
        const files = { [SHARED_SECRETS]: 'A=shared\nB=shared\n# 注释\nexport C="quoted"', [DATA_SECRETS]: '﻿B=project' }
        const readFile = path => {
            if (Object.hasOwn(files, path)) return files[path]
            throw Object.assign(new Error('x'), { code: 'ENOENT' })
        }
        const fromArgs = secretPathsOf({ values: { secrets: [SHARED_SECRETS, DATA_SECRETS] }, env: { [SECRETS_ENV]: 'ignored.env' }, cwd: CWD, delimiter })
        assert.deepEqual(fromArgs, { pathList: [SHARED_SECRETS, DATA_SECRETS], source: '--secrets' })
        const loaded = loadSecrets([...fromArgs.pathList, resolve(CWD, 'missing.env')], readFile)
        assert.deepEqual(loaded.secretMap, { A: 'shared', B: 'project', C: 'quoted' })
        assert.deepEqual(
            loaded.fileList.map(i => [i.isFound, i.reason]),
            [
                [true, ''],
                [true, ''],
                [false, '没有']
            ]
        )
        const fromEnv = secretPathsOf({ values: {}, env: { [SECRETS_ENV]: [SHARED_SECRETS, DATA_SECRETS].join(delimiter) }, cwd: CWD, delimiter })
        assert.deepEqual(fromEnv, { pathList: [SHARED_SECRETS, DATA_SECRETS], source: `环境变量 ${SECRETS_ENV}` })
        assert.deepEqual(secretPathsOf({ values: {}, env: {}, cwd: CWD, delimiter }), { pathList: [], source: '' })
        assert.deepEqual(parseEnvText('X = 1 \n=bad\nY=\'2\''), { X: '1', Y: '2' })
    })

    test('键名约定：<前缀>_URL、_ACCOUNT、_API_TOKEN，令牌优先于口令；有令牌时 _API_ACCOUNT 优先；缺键只报键名', () => {
        const both = credentialOf('JENKINS_DEV', { JENKINS_DEV_URL: BASE, JENKINS_DEV_ACCOUNT: 'login', JENKINS_DEV_API_TOKEN: TOKEN, JENKINS_DEV_PASSWORD: PASSWORD })
        assert.equal(both.token, TOKEN)
        assert.equal(both.account, 'login')
        assert.deepEqual(both.keyState, { URL: true, ACCOUNT: true, API_TOKEN: true, PASSWORD: true })
        assert.equal(credentialOf('P', { P_ACCOUNT: 'login', P_API_ACCOUNT: 'api', P_API_TOKEN: TOKEN }).account, 'api')
        assert.equal(credentialOf('P', { P_ACCOUNT: 'login', P_API_ACCOUNT: 'api', P_PASSWORD: PASSWORD }).account, 'login')
        assert.deepEqual(missingKeysOf(credentialOf('P', { P_PASSWORD: PASSWORD })), ['P_URL', 'P_ACCOUNT'])
        assert.deepEqual(missingKeysOf(credentialOf('P', {})), ['P_URL', 'P_ACCOUNT', 'P_API_TOKEN（或 P_PASSWORD）'])
        assert.deepEqual(missingKeysOf(credentialOf('P', { P_URL: BASE, P_ACCOUNT: 'a', P_PASSWORD: PASSWORD })), [])
    })

    test('经 run：通用一份、项目一份合并，项目的令牌覆盖通用的；用令牌时认证头是账号加令牌，用口令时提醒改用令牌', async () => {
        const files = {
            [CONFIG_PATH]: JSON.stringify(CONFIG),
            [SHARED_SECRETS]: [`JENKINS_DEV_URL=${BASE}`, `JENKINS_DEV_ACCOUNT=${ACCOUNT}`, `JENKINS_DEV_API_TOKEN=old-token-should-lose`].join('\n'),
            [DATA_SECRETS]: `JENKINS_DEV_API_TOKEN=${TOKEN}`
        }
        const merged = await runWith(['status', ...BASE_ARGS], { files })
        assert.equal(merged.code, EXIT.ok)
        assert.equal(merged.jenkins.requests[0].headers.Authorization, `Basic ${Buffer.from(`${ACCOUNT}:${TOKEN}`).toString('base64')}`)
        assert.equal(merged.errText().includes('PASSWORD'), false)
        const withPassword = await runWith(['status', ...BASE_ARGS], { files: { [CONFIG_PATH]: JSON.stringify(CONFIG), [DATA_SECRETS]: [`JENKINS_DEV_URL=${BASE}`, `JENKINS_DEV_ACCOUNT=${ACCOUNT}`, `JENKINS_DEV_PASSWORD=${PASSWORD}`].join('\n') } })
        assert.equal(withPassword.code, EXIT.ok)
        assert.match(withPassword.errText(), /正在用 JENKINS_DEV_PASSWORD 登录 Jenkins，建议改用专用账号的 API 令牌（JENKINS_DEV_API_TOKEN）/)
        assertNoSecret(withPassword.all)
    })

    test('Jenkins 地址：去掉 /login 与查询串、账号口令，只认 http、https；报错不带地址本身', () => {
        assert.equal(toJenkinsRoot(`${BASE}/login?from=%2F`, 'K'), BASE)
        assert.equal(toJenkinsRoot(`https://user:${PASSWORD}@jenkins.example.com/ci/`, 'K'), 'https://jenkins.example.com/ci')
        assert.throws(() => toJenkinsRoot('not a url', 'K_URL'), { message: 'K_URL 不是合法的地址' })
        assert.throws(() => toJenkinsRoot('ftp://jenkins.example.com', 'K_URL'), { message: 'K_URL 要是 http 或 https 地址' })
    })
})

describe('发版配置的校验', () => {
    test('示例配置合格；环境的选法：--env、defaultEnv、只有一个环境时就是它，多个又没指定时要求指定', () => {
        const config = configOf()
        assert.equal(pickEnv(config, undefined).name, 'dev')
        assert.equal(pickEnv(config, 'prod').isProtected, true)
        assert.throws(() => pickEnv(config, 'nope'), { message: '发版配置里没有环境 nope（有 dev、beta、prod）' })
        const noDefault = configOf({ environments: { dev: CONFIG.environments.dev, prod: CONFIG.environments.prod } })
        assert.throws(() => pickEnv(noDefault, undefined), /有 2 个环境（dev、prod），用 --env 指定/)
        assert.equal(pickEnv(configOf({ environments: { only: CONFIG.environments.beta } }), undefined).name, 'only')
        assert.equal(pickEnv(config, 'beta').jobPath, 'job/folder/job/my-app-beta')
    })

    test('严格校验：写错的字段名（如 protect）、可疑的 job、前缀、参数、正则、地址、版本都给中文原因', () => {
        const errorsOf = raw => validateConfig(raw).errorList ?? []
        const envWith = patch => ({ environments: { prod: { secretPrefix: 'JENKINS_PROD', job: 'my-app-prod', ...patch } } })
        assert.match(errorsOf(envWith({ protect: true })).join(), /不认识的字段 protect（受保护要写 protected）/)
        assert.match(errorsOf(envWith({ protected: 'true' })).join(), /protected 要是 true 或 false/)
        for (const job of ['../admin', 'a/../b', 'a b', 'a;b', '', 'a//b', '..']) assert.match(errorsOf(envWith({ job })).join(), /\.job 要填 job 名/, job)
        assert.match(errorsOf(envWith({ secretPrefix: 'jenkins-dev' })).join(), /secretPrefix 要填密钥前缀/)
        assert.match(errorsOf(envWith({ params: { X: 'a b' } })).join(), /X 的值含不允许的字符/)
        assert.match(errorsOf(envWith({ params: { 'bad-name': 'x' } })).join(), /参数名「bad-name」/)
        assert.match(errorsOf(envWith({ params: { X: { choices: ['A'], default: 'B' } } })).join(), /default「B」不在 choices 里/)
        assert.match(errorsOf(envWith({ params: { X: { pattern: '(' } } })).join(), /pattern 不是合法的正则/)
        assert.match(errorsOf(envWith({ params: { X: { choice: ['A'] } } })).join(), /不认识的字段 choice/)
        assert.match(errorsOf(envWith({ rollback: { param: 'DEPLOY_TYPE', value: 'ROLLBACK' } })).join(), /rollback\.param 要是 params 里声明过的参数名/)
        assert.match(errorsOf(envWith({ params: { T: 'fixed' }, rollback: { param: 'T', value: 'R' } })).join(), /是固定值，回滚时改不了它/)
        assert.match(errorsOf(envWith({ verifyUrls: [`https://u:${PASSWORD}@x.example.com`] })).join(), /不要带账号口令/)
        assert.match(errorsOf(envWith({ compare: { branch: '--upload-pack=x' } })).join(), /compare\.branch 要填分支名/)
        assert.deepEqual(errorsOf({ version: 2, environments: CONFIG.environments }), ['version 2 比本工具认识的新（1），先更新工作面板插件'])
        assert.deepEqual(errorsOf({ environments: {} }), ['environments 要是对象，至少写一个环境，如 { "dev": { ... } }'])
        assert.deepEqual(errorsOf({ defaultEnv: 'x', environments: CONFIG.environments }), ['defaultEnv 要是 environments 里的一个环境名'])
        assert.deepEqual(errorsOf([]), ['发版配置要是一个 JSON 对象'])
    })

    test('不写 default 时：有 choices 取第一个（同 Jenkins 的选项参数），否则为空', () => {
        const env = pickEnv(configOf({ environments: { a: { secretPrefix: 'P', job: 'j', params: { M: { choices: ['X', 'Y'] }, N: {} } } } }), undefined)
        assert.deepEqual(planBuild(env).params, { M: 'X', N: '' })
    })
})

describe('触发参数：白名单与可疑字符', () => {
    const dev = () => pickEnv(configOf(), 'dev')

    test('默认值、--param 覆盖、只许改声明过的非固定参数；choices 与 pattern', () => {
        assert.deepEqual(planBuild(dev()), { params: { DEPLOY_TYPE: 'BUILD' }, isRollback: false })
        assert.deepEqual(planBuild(dev(), { paramList: ['DEPLOY_TYPE=LIST'] }).params, { DEPLOY_TYPE: 'LIST' })
        assert.throws(() => planBuild(dev(), { paramList: ['BRANCH=main'] }), { message: 'dev 没在发版配置里声明参数 BRANCH（声明了的：DEPLOY_TYPE）' })
        assert.throws(() => planBuild(dev(), { paramList: ['DEPLOY_TYPE'] }), { message: '--param 要写成 名=值' })
        assert.throws(() => planBuild(dev(), { paramList: ['DEPLOY_TYPE=DESTROY'] }), { message: '参数 DEPLOY_TYPE 只能是 BUILD、ROLLBACK、LIST' })
        assert.throws(() => planBuild(pickEnv(configOf(), 'beta'), { paramList: ['TARGET=prod'] }), { message: '参数 TARGET 在发版配置里是固定值，不能用 --param 改' })
        const patterned = pickEnv(configOf({ environments: { a: { secretPrefix: 'P', job: 'j', params: { V: { pattern: '^v\\d+$' } } } } }), undefined)
        assert.throws(() => planBuild(patterned), /参数 V 的值不符合发版配置里的 pattern \^v\\d\+\$/)
        assert.deepEqual(planBuild(patterned, { paramList: ['V=v12'] }).params, { V: 'v12' })
    })

    test('可疑字符一律拒绝：空格、分号、$()、反引号、引号、尖括号、换行、管道', () => {
        const free = pickEnv(configOf({ environments: { a: { secretPrefix: 'P', job: 'j', params: { V: {} } } } }), undefined)
        for (const value of ['a b', 'a;rm -rf /', '$(id)', '`id`', '"x"', "'x'", '<x>', 'a\nb', 'a|b', 'a&b', 'x'.repeat(201)]) {
            assert.throws(() => planBuild(free, { paramList: [`V=${value}`] }), /含不允许的字符/, JSON.stringify(value))
        }
        assert.deepEqual(planBuild(free, { paramList: ['V=release-1.2.3_rc+1@origin/dev:x,y'] }).params, { V: 'release-1.2.3_rc+1@origin/dev:x,y' })
    })

    test('回滚：--rollback 设成回滚值并带目标（空即 job 的默认），目标按 targetPattern；--target 要和 --rollback 一起用；没配 rollback 不能回滚', () => {
        assert.deepEqual(planBuild(dev(), { isRollback: true }), { params: { DEPLOY_TYPE: 'ROLLBACK', ROLLBACK_RELEASE: '' }, isRollback: true })
        assert.deepEqual(planBuild(dev(), { isRollback: true, target: 'release-20261101' }).params, { DEPLOY_TYPE: 'ROLLBACK', ROLLBACK_RELEASE: 'release-20261101' })
        assert.deepEqual(planBuild(dev(), { paramList: ['DEPLOY_TYPE=ROLLBACK'] }).params, { DEPLOY_TYPE: 'ROLLBACK', ROLLBACK_RELEASE: '' })
        assert.throws(() => planBuild(dev(), { isRollback: true, target: 'v1' }), /回滚目标要符合发版配置里的 targetPattern/)
        assert.throws(() => planBuild(dev(), { isRollback: true, target: 'release-1;x' }), /回滚目标含不允许的字符/)
        assert.throws(() => planBuild(dev(), { target: 'previous' }), { message: '--target 只在 --rollback 时用' })
        assert.throws(() => planBuild(dev(), { isRollback: true, paramList: ['DEPLOY_TYPE=LIST'] }), { message: '--rollback 与 --param DEPLOY_TYPE 冲突' })
        assert.throws(() => planBuild(pickEnv(configOf(), 'prod'), { isRollback: true }), { message: 'prod 没在发版配置里配 rollback，不能回滚' })
    })

    test('和 Jenkins 上 job 的参数定义核对：缺参数、取值不在 job 的可选值里', () => {
        const definitionList = [{ name: 'DEPLOY_TYPE', choices: ['BUILD'] }]
        assert.deepEqual(jobParamProblemsOf(definitionList, { DEPLOY_TYPE: 'BUILD' }), [])
        assert.deepEqual(jobParamProblemsOf(definitionList, { DEPLOY_TYPE: 'LIST', X: '' }), ['job 上没有参数 X', 'DEPLOY_TYPE=LIST 不在 job 的可选值里（BUILD）'])
    })
})

describe('build：默认不触发、带 --yes 才触发、受保护环境永远不触发', () => {
    test('不带 --yes：只打印将触发的 job 与参数、远程分支、预计构建号，不发 POST，退出码 0', async () => {
        const result = await runWith(['build', ...BASE_ARGS])
        assert.equal(result.code, EXIT.ok)
        assert.deepEqual(posts(result.jenkins.requests), [])
        assert.equal(result.jenkins.requests.every(i => i.method === 'GET'), true)
        const text = result.text()
        assert.match(text, /将触发 my-app-dev（dev 开发环境）：DEPLOY_TYPE=BUILD/)
        assert.match(text, new RegExp(`远程 origin/dev=${SHA_REMOTE}`))
        assert.match(text, /预计构建号 #35/)
        assert.match(text, /未带 --yes，只打印不发送；用户核对同意后加 --yes 再跑一次/)
    })

    test('带 --yes：取 crumb 后 POST buildWithParameters，带上参数与 crumb；回报队列地址与下一步', async () => {
        const result = await runWith(['build', '--yes', '--rollback', '--target', 'previous', ...BASE_ARGS])
        assert.equal(result.code, EXIT.ok)
        const [post] = posts(result.jenkins.requests)
        assert.equal(post.url, `${BASE}/job/my-app-dev/buildWithParameters`)
        assert.equal(post.body, 'DEPLOY_TYPE=ROLLBACK&ROLLBACK_RELEASE=previous')
        assert.equal(post.headers['Jenkins-Crumb'], 'c0ffee')
        assert.equal(post.redirect, 'manual')
        assert.match(result.text(), /已提交 my-app-dev（dev 开发环境）：DEPLOY_TYPE=ROLLBACK ROLLBACK_RELEASE=previous；HTTP 201，队列 https:\/\/jenkins\.example\.com\/queue\/item\/9\//)
        assert.match(result.text(), /下一步：用同样的 --config、--secrets、--env 运行 wait 35/)
        assertNoSecret(result.all)
    })

    test('受保护的环境：不带 --yes 打印并说明由用户自己操作；带 --yes 也不发 POST，退出码 5；--json 标 refused', async () => {
        const files = { [CONFIG_PATH]: JSON.stringify(CONFIG), [DATA_SECRETS]: PROD_SECRETS_TEXT }
        const dry = await runWith(['build', '--env', 'prod', ...BASE_ARGS], { files })
        assert.equal(dry.code, EXIT.ok)
        assert.match(dry.text(), /将触发 my-app-prod（prod 生产环境）：DEPLOY_TYPE=BUILD/)
        assert.match(dry.text(), /prod 是受保护的环境：工具只打印、不触发，请用户自己到 Jenkins 上操作/)
        const yes = await runWith(['build', '--env', 'prod', '--yes', ...BASE_ARGS], { files })
        assert.equal(yes.code, EXIT.protected)
        assert.deepEqual(posts(yes.jenkins.requests), [])
        assert.equal(yes.jenkins.requests.some(i => i.url.includes('crumbIssuer')), false)
        assert.match(yes.errText(), /prod 是受保护的环境，带 --yes 也不触发/)
        const asJson = await runWith(['build', '--env', 'prod', '--yes', '--json', ...BASE_ARGS], { files })
        assert.equal(asJson.code, EXIT.protected)
        assert.deepEqual(JSON.parse(asJson.text()), {
            dryRun: true,
            refused: true,
            env: 'prod',
            job: 'my-app-prod',
            protected: true,
            rollback: false,
            parameters: { DEPLOY_TYPE: 'BUILD' },
            nextBuildNumber: 35,
            busy: '',
            verified: true
        })
        assertNoSecret(dry.all + yes.all + asJson.all)
    })

    test('受保护的环境没配密钥：不连 Jenkins，照样打印将触发的内容并说明没核对', async () => {
        const result = await runWith(['build', '--env', 'prod', '--yes', ...BASE_ARGS])
        assert.equal(result.code, EXIT.protected)
        assert.deepEqual(result.jenkins.requests, [])
        assert.match(result.text(), /没配 JENKINS_PROD 的密钥，没核对 Jenkins 上的 job 与参数/)
    })

    test('job 上的参数和配置对不上：报错不触发；普通环境缺密钥：报缺哪些键，不带值', async () => {
        const jenkins = fakeJenkins(url => (url.pathname === '/job/my-app-dev/api/json' ? json(jobOf({ property: [{ parameterDefinitions: [{ name: 'DEPLOY_TYPE', choices: ['BUILD'] }] }] })) : undefined))
        const mismatch = await runWith(['build', '--yes', '--param', 'DEPLOY_TYPE=LIST', ...BASE_ARGS], { jenkins })
        assert.equal(mismatch.code, EXIT.error)
        assert.deepEqual(posts(jenkins.requests), [])
        assert.match(mismatch.errText(), /参数和发版配置对不上：DEPLOY_TYPE=LIST 不在 job 的可选值里（BUILD）/)
        const missing = await runWith(['build', '--yes', ...BASE_ARGS], { files: { [CONFIG_PATH]: JSON.stringify(CONFIG), [DATA_SECRETS]: `JENKINS_DEV_ACCOUNT=${ACCOUNT}` } })
        assert.equal(missing.code, EXIT.error)
        assert.deepEqual(missing.jenkins.requests, [])
        assert.match(missing.errText(), /密钥里缺 JENKINS_DEV_URL、JENKINS_DEV_API_TOKEN（或 JENKINS_DEV_PASSWORD）；密钥文件：.*shared.*没有.*读到了.*请用户自己把这些键填进 secrets\.env/)
        assertNoSecret(missing.all)
        const noFiles = await runWith(['build', '--config', CONFIG_PATH])
        assert.match(noFiles.errText(), /没给密钥文件；用 --secrets <路径> 指定（可重复），或设环境变量 XIAOLI_RELEASE_SECRETS/)
    })

    test('不带参数的 job：POST 到 build 而不是 buildWithParameters', async () => {
        const config = { environments: { plain: { secretPrefix: 'JENKINS_DEV', job: 'my-app-dev' } } }
        const jenkins = fakeJenkins((url, options) => {
            if (url.pathname === '/job/my-app-dev/api/json') return json(jobOf({ property: [] }))
            if (url.pathname === '/job/my-app-dev/build' && options.method === 'POST') return new Response('', { status: 201, headers: { location: `${BASE}/queue/item/11/` } })
            return undefined
        })
        const result = await runWith(['build', '--yes', ...BASE_ARGS], { files: { [CONFIG_PATH]: JSON.stringify(config), [DATA_SECRETS]: SECRETS_TEXT }, jenkins })
        assert.equal(result.code, EXIT.ok)
        assert.equal(posts(jenkins.requests)[0].url, `${BASE}/job/my-app-dev/build`)
        assert.match(result.text(), /（不带参数）/)
    })
})

describe('check：只读检查', () => {
    test('全部通过：配置、密钥键在不在（不显示值）、登录、job、参数、远程分支；受保护环境没配密钥算跳过；只发 GET，退出码 0', async () => {
        const result = await runWith(['check', ...BASE_ARGS])
        assert.equal(result.code, EXIT.ok, result.all)
        assert.equal(result.jenkins.requests.every(i => i.method === 'GET'), true)
        const text = result.text()
        assert.match(text, /发版配置：通过，.*release\.json（来源：--config），3 个环境：dev、beta、prod，默认 dev/)
        assert.match(text, /\[dev 开发环境\] job my-app-dev，密钥前缀 JENKINS_DEV/)
        assert.match(text, /密钥：通过（JENKINS_DEV_URL 有，JENKINS_DEV_ACCOUNT 有，JENKINS_DEV_API_TOKEN 有，JENKINS_DEV_PASSWORD 没有；用令牌登录）/)
        assert.match(text, /连接：通过（Jenkins 2\.400，已登录）/)
        assert.match(text, /job：通过（my-app-dev 存在）/)
        assert.match(text, /参数：通过（DEPLOY_TYPE、ROLLBACK_RELEASE job 上都有）/)
        assert.match(text, /远程分支：通过（origin\/dev=bbbbbbbbbb）/)
        assert.match(text, /验收地址：https:\/\/dev\.example\.com\/healthz/)
        assert.match(text, /\[prod 生产环境\] job my-app-prod，密钥前缀 JENKINS_PROD，受保护（只打印不触发）/)
        assert.match(text, /受保护的环境可以不配，只打印将触发的内容，不核对 Jenkins/)
        assert.match(text, /结论：全部通过$/m)
        assertNoSecret(result.all)
    })

    test('没通过的项：缺键、匿名访问、job 不存在、参数对不上、远程分支取不到；退出码 4，--json 给每项结果且不含密钥', async () => {
        const missing = await runWith(['check', '--env', 'dev', ...BASE_ARGS], { files: { [CONFIG_PATH]: JSON.stringify(CONFIG), [DATA_SECRETS]: `JENKINS_DEV_URL=${BASE}` } })
        assert.equal(missing.code, EXIT.checkFailed)
        assert.match(missing.text(), /密钥：没通过，缺 JENKINS_DEV_ACCOUNT、JENKINS_DEV_API_TOKEN（或 JENKINS_DEV_PASSWORD）/)
        assert.match(missing.text(), /连接：跳过（密钥不全）/)
        assert.deepEqual(missing.jenkins.requests, [])

        const anonymous = fakeJenkins(url => (url.pathname === '/whoAmI/api/json' ? json({ name: 'anonymous', authenticated: true, anonymous: true }) : undefined))
        const anon = await runWith(['check', '--env', 'dev', ...BASE_ARGS], { jenkins: anonymous })
        assert.equal(anon.code, EXIT.checkFailed)
        assert.match(anon.text(), /连接：没通过，Jenkins 2\.400，以匿名身份访问，账号或令牌不对/)

        const noJob = fakeJenkins(url => (url.pathname === '/job/my-app-dev/api/json' ? new Response('nope', { status: 404 }) : undefined))
        const gone = await runWith(['check', '--env', 'dev', ...BASE_ARGS], { jenkins: noJob })
        assert.match(gone.text(), /job：没通过，my-app-dev 不存在，或这个账号看不到/)

        const badParams = fakeJenkins(url => (url.pathname === '/job/my-app-dev/api/json' ? json(jobOf({ property: [{ parameterDefinitions: [{ name: 'DEPLOY_TYPE', choices: ['BUILD'] }] }] })) : undefined))
        const params = await runWith(['check', '--env', 'dev', '--json', ...BASE_ARGS], { jenkins: badParams, git: () => { throw Object.assign(new Error('x'), { stderr: `fatal: unable to access 'https://user:${PASSWORD}@git.example.com/repo.git/'` }) } })
        assert.equal(params.code, EXIT.checkFailed)
        const report = JSON.parse(params.text())
        assert.equal(report.ok, false)
        const items = Object.fromEntries(report.environments[0].items.map(i => [i.name, i.status]))
        assert.deepEqual(items, { keys: 'ok', connect: 'ok', job: 'ok', params: 'fail', remote: 'fail' })
        assert.match(report.environments[0].items.find(i => i.name === 'params').text, /job 上没有 ROLLBACK_RELEASE；DEPLOY_TYPE 的 ROLLBACK、LIST 不在 job 的可选值里（BUILD）/)
        assert.deepEqual(report.environments[0].keys, { set: ['JENKINS_DEV_URL', 'JENKINS_DEV_ACCOUNT', 'JENKINS_DEV_API_TOKEN'], missing: ['JENKINS_DEV_PASSWORD'] })
        assertNoSecret(params.all)
        assert.equal(params.all.includes(PASSWORD), false)
    })

    test('--offline 只看文件与键，不连 Jenkins、不跑 git；发版配置不合格或找不到时退出码 4 并说明', async () => {
        let gitCalls = 0
        const offline = await runWith(['check', '--offline', ...BASE_ARGS], { git: () => (gitCalls += 1) })
        assert.equal(offline.code, EXIT.ok)
        assert.deepEqual(offline.jenkins.requests, [])
        assert.equal(gitCalls, 0)
        assert.match(offline.text(), /连接：跳过（--offline）/)

        const bad = await runWith(['check', ...BASE_ARGS], { files: { [CONFIG_PATH]: JSON.stringify({ environments: { prod: { secretPrefix: 'P', job: 'x', protect: true } } }) } })
        assert.equal(bad.code, EXIT.checkFailed)
        assert.match(bad.text(), /发版配置：没通过，发版配置 .*release\.json 不合格：\n- environments\.prod 里有不认识的字段 protect/)
        const notJson = await runWith(['check', ...BASE_ARGS], { files: { [CONFIG_PATH]: '{ oops' } })
        assert.match(notJson.text(), /不是合法 JSON/)
        const none = await runWith(['check', ...BASE_ARGS], { files: {} })
        assert.equal(none.code, EXIT.checkFailed)
        assert.match(none.text(), /发版配置：没通过，发版配置 .*（来源：--config）不存在/)
    })

    test('连不上（请求被拒、401）：如实写没通过，报错里的令牌与带凭据的地址被抹掉', async () => {
        const refused = fakeJenkins(url => {
            if (url.pathname === '/whoAmI/api/json') return new Response(`<html>Invalid token ${TOKEN} for https://${ACCOUNT}:${PASSWORD}@jenkins.example.com/ password=${PASSWORD}</html>`, { status: 401, statusText: 'Unauthorized' })
            return undefined
        })
        const result = await runWith(['check', '--env', 'dev', ...BASE_ARGS], { jenkins: refused })
        assert.equal(result.code, EXIT.checkFailed)
        assert.match(result.text(), /连接：没通过，Jenkins 返回 HTTP 401 Unauthorized：GET \/whoAmI\/api\/json/)
        assertNoSecret(result.all)
    })
})

describe('输出与报错里不出现密钥', () => {
    test('console：控制台里的令牌、Basic 认证串被抹掉；--json 同样', async () => {
        const text = await runWith(['console', 'last', '--tail', '3', ...BASE_ARGS])
        assert.equal(text.code, EXIT.ok)
        assert.match(text.text(), /my-app-dev #34 控制台最后 3 行（共 4 行）/)
        assert.match(text.text(), /Authorization: Basic \*\*\*/)
        const asJson = await runWith(['console', '34', '--json', ...BASE_ARGS])
        assert.equal(JSON.parse(asJson.text()).lines.length, 4)
        assertNoSecret(text.all + asJson.all)
    })

    test('请求失败的报错不带凭据：网络错误、非 JSON；未知异常的堆栈也过一遍', async () => {
        const broken = fakeJenkins(() => {
            throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED', message: `connect ECONNREFUSED https://${ACCOUNT}:${TOKEN}@jenkins.example.com` } })
        })
        const result = await runWith(['status', ...BASE_ARGS], { jenkins: broken })
        assert.equal(result.code, EXIT.error)
        assert.match(result.errText(), /请求失败：GET \/job\/my-app-dev\/api\/json，ECONNREFUSED/)
        assertNoSecret(result.all)
    })

    test('抹密钥：已知的值逐字换掉（长的先换，含地址编码形式），再按令牌样式抹', () => {
        const redactor = createRedactor()
        redactor.add('ab', 'secret-value-1', 'secret-value-1-longer', 'p@ss word!')
        assert.equal(redactor.redact('x secret-value-1-longer y secret-value-1 ab'), 'x *** y *** ab')
        assert.equal(redactor.redact('q=p%40ss%20word!'), 'q=***')
        assert.equal(redactor.redact(`token=${'z'.repeat(10)} Bearer ${'A'.repeat(20)} https://u:p@h.example.com`), 'token=*** Bearer *** https://***@h.example.com')
        assert.equal(redactor.redact('commit ' + 'c'.repeat(40)), 'commit ' + 'c'.repeat(40))
    })
})

describe('status、wait、超时与退出码', () => {
    test('status：最近的构建表、跳过 LIST 后和远程分支比落后几个提交、队列与下一个构建号；本账号触发的写「本账号」', async () => {
        const result = await runWith(['status', ...BASE_ARGS])
        assert.equal(result.code, EXIT.ok)
        const text = result.text()
        assert.match(text, /my-app-dev（dev 开发环境，jenkins\.example\.com）最近 2 次构建/)
        assert.match(text, /#33 .*BUILD .*成功 .*2 分 5 秒 .*本账号 .*aaaaaaaaaa/)
        assert.match(text, /#34 .*LIST .*同事甲/)
        assert.match(text, /远程 origin\/dev=bbbbbbbbbb；线上 #33=aaaaaaaaaa，线上落后 3 个提交/)
        assert.match(text, /下一个构建号：#35/)
        const asJson = JSON.parse((await runWith(['status', '--json', ...BASE_ARGS])).text())
        assert.equal(asJson.behind, 3)
        assert.equal(asJson.deployed.number, 33)
    })

    test('没配 compare 的环境不跑 git；回滚生效时不比', async () => {
        let gitCalls = 0
        const beta = await runWith(['status', '--env', 'beta', ...BASE_ARGS], { git: () => (gitCalls += 1) })
        assert.equal(beta.code, EXIT.ok)
        assert.equal(gitCalls, 0)
        const rolled = fakeJenkins(url =>
            url.pathname === '/job/my-app-dev/api/json'
                ? json(jobOf({ builds: [{ number: 40, timestamp: 0, result: 'SUCCESS', duration: 1000, building: false, actions: [{ parameters: [{ name: 'DEPLOY_TYPE', value: 'ROLLBACK' }, { name: 'ROLLBACK_RELEASE', value: 'release-1' }] }] }] }))
                : undefined
        )
        const result = await runWith(['status', ...BASE_ARGS], { jenkins: rolled })
        assert.match(result.text(), /最近生效的是 #40 回滚，线上是哪个提交以发版后验收为准/)
        assert.match(result.text(), /ROLLBACK\/release-1/)
    })

    test('wait：成功退出码 0 并给验收地址；失败退出码 3；一直不结束到 --max-wait 退出码 2，间隔按 --interval', async () => {
        const ok = await runWith(['wait', '34', ...BASE_ARGS])
        assert.equal(ok.code, EXIT.ok)
        assert.match(ok.text(), /my-app-dev #34 成功，耗时 1 分 5 秒/)
        assert.match(ok.text(), /验收地址：https:\/\/dev\.example\.com\/healthz/)

        const failed = fakeJenkins(url => (url.pathname === '/job/my-app-dev/36/api/json' ? json({ number: 36, timestamp: 0, result: 'FAILURE', duration: 1000, building: false }) : undefined))
        const bad = await runWith(['wait', '36', ...BASE_ARGS], { jenkins: failed })
        assert.equal(bad.code, EXIT.failed)
        assert.match(bad.text(), /#36 失败/)

        const forever = fakeJenkins(url => (url.pathname === '/job/my-app-dev/37/api/json' ? json({ number: 37, timestamp: 0, building: true, result: null }) : undefined))
        const slow = await runWith(['wait', '37', '--interval', '30', '--max-wait', '1', ...BASE_ARGS], { jenkins: forever })
        assert.equal(slow.code, EXIT.timeout)
        assert.match(slow.errText(), /等待超时：#37 1 分钟还没结束/)
        assert.equal(forever.requests.filter(i => i.url.includes('/37/')).length, 3)
        const tooLong = await runWith(['wait', '37', '--max-wait', '121', ...BASE_ARGS])
        assert.equal(tooLong.code, EXIT.error)
        assert.match(tooLong.errText(), /--max-wait 最大 120/)
    })

    test('请求超时：每个请求都带超时信号，到点没响应报超时，退出码 1', async () => {
        const hang = {
            requests: [],
            handler: (url, options) => {
                hang.requests.push(options)
                return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)))
            }
        }
        const result = await runWith(['status', ...BASE_ARGS], { jenkins: hang, requestTimeoutMs: 30 })
        assert.equal(result.code, EXIT.error)
        assert.match(result.errText(), /请求失败：GET \/job\/my-app-dev\/api\/json，30 毫秒没响应，超时/)
        assert.equal(hang.requests[0].signal instanceof AbortSignal, true)
    })

    test('退出码与用法：--help 与不带子命令 0；未知子命令、未知选项、构建号不对 1', async () => {
        const help = await runWith(['--help'])
        assert.equal(help.code, EXIT.ok)
        assert.match(help.text(), /用法：node <插件目录>\/tools\/jenkins\.mjs <子命令>/)
        assert.match(help.text(), /退出码：0 正常  1 请求、参数或配置错误  2 等待超时  3 构建结果不是成功  4 check 有没通过的项  5 受保护的环境拒绝触发/)
        assert.equal((await runWith([])).code, EXIT.ok)
        const unknown = await runWith(['deploy'])
        assert.equal(unknown.code, EXIT.error)
        assert.match(unknown.errText(), /未知子命令 deploy/)
        const option = await runWith(['build', '--job', 'my-app-prod'])
        assert.equal(option.code, EXIT.error)
        assert.match(option.errText(), /参数不对：/)
        const ref = await runWith(['console', 'abc', ...BASE_ARGS])
        assert.match(ref.errText(), /构建号要写数字或 last/)
    })
})

describe('直接运行', () => {
    const script = fileURLToPath(new URL('./jenkins.mjs', import.meta.url))
    const runNode = argList => spawnSync(process.execPath, [script, ...argList], { encoding: 'utf8', env: { ...process.env, [CONFIG_ENV]: '', [SECRETS_ENV]: '' }, timeout: 30_000 })

    test('node jenkins.mjs --help 打印用法、退出码 0；被测试导入时不自动运行', () => {
        const result = runNode(['--help'])
        assert.equal(result.status, 0)
        assert.match(result.stdout, /用法：node <插件目录>\/tools\/jenkins\.mjs/)
    })

    test('直接运行时退出码照约定：未知子命令 1，check 找不到配置 4（不发任何网络请求）', () => {
        assert.equal(runNode(['nope']).status, 1)
        const missing = runNode(['check', '--offline', '--config', resolve(CWD, 'definitely-missing-release.json')])
        assert.equal(missing.status, 4)
        assert.match(missing.stdout, /发版配置：没通过/)
    })
})
