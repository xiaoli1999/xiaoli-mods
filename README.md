# 小黎 mods（xiaoli-mods）

小黎的 AI 工作流沉淀。「小黎 mods」是总称，里面是两个 Claude Code mod：陪伴猫「小黎」和小小黎 AI 工作台；工作台自带一个通用的开发流程 skill。猫和作者同名，需要区分时，猫这边就叫「小黎 mods」。

| 目录 | 是什么 |
| --- | --- |
| `mods/xiaoke` | 陪伴猫小黎：趴在输入框上方陪你干活。提示词缓存保活、看模型与思考强度、token 与额度预估、概括当前在做的事、定点久坐喝水提醒；按钮栏的「干活 / 收工」开关工作台面板。详见 [mods/xiaoke/README.md](mods/xiaoke/README.md) |
| `mods/xiaoxiaoli` | 小小黎 AI 工作台：AI 工作流的载体。侧栏拉取并展示 TAPD 待办，点「开工」才开工；按工种走不同的工作流，按「步骤 → 任务 → 模块」显示进度。在任何项目里都能用，没绑定 TAPD 的项目问一次就记住。详见 [mods/xiaoxiaoli/README.md](mods/xiaoxiaoli/README.md) |
| `mods/xiaoxiaoli/skills/xiaoli-workflow` | 通用 AI 开发流程 skill：TAPD 需求各环节、缺陷 6 步、必须先问的动作与 Git 规则。随工作台一起装，会话里叫 `xiaoxiaoli:xiaoli-workflow`；不用 Claude Code 的也能单独用 |
| `.claude-plugin/marketplace.json` | 插件市场清单：市场名 `xiaoli-mods`，列出上面两个 mod |

命令：猫是 `/xiaoli`（如 `/xiaoli keep on|off` 开关缓存保活、`/xiaoli rest` 休息 2 分钟，旧命令 `/xiaoke` 仍可用），工作台是 `/xiaoxiaoli` 与 `mcp__xiaoxiaoli__*` 工具。

## 前置条件

- Claude Code。mod 只在 Claude Code 里跑；skill 不依赖 mod。
- TAPD MCP 服务器，名字必须是 `tapd`：会话里输入 `/mcp` 核对，工具名前缀应为 `mcp__tapd__`。
- 语雀 skill `li-yuque-skills`（读需求里的语雀文档、上传分享文档）。
- 可选：chrome-devtools MCP（浏览器自测）、figma MCP（设计稿）、context7 MCP（三方库文档）。

这些不用一次装齐：装好工作台后第一次使用时，AI 会带你体检本机缺哪些、问你要不要装（见下）。

## 安装

用插件市场装，两条命令一次装好两个 mod：

```
claude plugin marketplace add xiaoli1999/xiaoli-mods
claude plugin install xiaoxiaoli@xiaoli-mods
claude plugin install xiaoke@xiaoli-mods
```

只要其中一个就只装那一个。也可以在会话里一步装（Claude Code 2.1.275 及以后）：

```
/plugin install xiaoxiaoli --marketplace xiaoli1999/xiaoli-mods
/plugin install xiaoke --marketplace xiaoli1999/xiaoli-mods
```

装好后重开 Claude Code，或在会话里输入 `/reload-plugins`。工作流 skill 随工作台一起装，不用另外复制；以前自己复制到 `~/.claude/skills/xiaoli-workflow` 的，装好后把那份删掉，免得两份不一致。

## 装完第一次会发生什么

在任意项目里打开 Claude Code（有人在终端前的交互式会话）：

1. 工作台先自动让 AI 问你给工作台起什么名字、你主要做哪类工作（前端、后端、Python、测试、产品、其他，决定开工用哪套工作流）。这台机器只自动问一次，不想设直接选默认就行。没绑定 TAPD 的项目会顺带问对应哪个 TAPD 项目。
2. 名字和工种存好后，AI 问要不要花几分钟走一遍演练：先检查本机已经装了哪些 MCP、skill 和命令行工具，缺的问你要不要装；再按你的工作流模拟走一遍、讲讲工作台的功能点。演练不建分支、不提交、不改 TAPD，会多花几轮对话；以后想走输入 `/xiaoxiaoli tour`。
3. 陪伴猫趴在输入框上方打招呼，默认是 2 行的工作模式，点它展开。
4. 会话启动约 10 秒后，两个 mod 各自去 GitHub 看一眼有没有新版（见下一节）。

之后的日常用法：

1. 输入 `/xiaoxiaoli show`（或点陪伴猫的「干活」）打开工作台面板。
2. 项目还没绑定 TAPD 时，待办区列出你参与的 TAPD 项目：点一行，再点「[ 绑定 <项目名> ]」；也可以直接对 AI 说「这个项目对应 TAPD 的某某项目」。
3. 待办出来后点一条，再点「[ 开工 <ID> ]」：AI 按你工种的工作流与 xiaoli-workflow 的通用规则走，面板下半显示进度。手上已有没做完的需求时，面板给出新会话的启动命令，到新终端粘贴运行。
4. 想重新绑定：`/xiaoxiaoli unbind`，面板回到项目列表。

## 自动更新

每台机器上，每天第一次在交互式会话里打开 Claude Code 时，两个 mod 各自检查一次：

- 读主分支上自己那份 `plugin.json` 的版本号：先从 `raw.githubusercontent.com`，取不到再从 jsDelivr 镜像 `cdn.jsdelivr.net/gh/`。只认 `x.y.z` 这样的正式版本，比本机的新才算新版；有新版时再读同目录的 `CHANGELOG.md`，告诉你更新了什么。
- 插件市场安装的：等会话空闲，运行 `claude plugin marketplace update xiaoli-mods` 与 `claude plugin update <mod>@xiaoli-mods` 装好新版，提示「已从 x 更新到 y」和更新要点，再自动发起 `/reload-plugins` 让新版马上生效。更新失败时提示原因和手动命令，不影响继续用，下次开会话再试。
- 本地目录加载的（开发者自己的机器）：不改任何文件，只提示有新版、到仓库目录 `git pull`。
- 当天成功查过一次就不再查；断网等取不到时不算，下次开会话再试。`claude -p`、SDK 这类非交互式会话与热重载不查。不提供关闭开关。

请求只发往上面两个公开地址，不带任何用户或项目信息；运行的只有上面两条 `claude plugin` 命令。细节见两个 mod 各自的 README。

## 不用 Claude Code 的人怎么用 skill

skill 是一份 Markdown，Codex 等别的 AI 工具也能用：把 `mods/xiaoxiaoli/skills/xiaoli-workflow` 整个目录复制到那个工具的 skills 目录，比如 Codex 放到 `~/.agents/skills/xiaoli-workflow`。里面提到的 `mcp__xiaoxiaoli__*` 工具只有装了工作台才有，没有时按正文的通用规则走即可。

## 开发者本地加载

改 mod 的人用本地目录加载：克隆仓库（下面写作 `<仓库>`），把两个 mod 目录追加到环境变量 `CLAUDE_CODE_PLUGIN_DIRS`（系统环境变量，或 `~/.claude/settings.json` 的 `env`），Windows 用 `;` 分隔，然后重开 Claude Code：

```
CLAUDE_CODE_PLUGIN_DIRS=<仓库>\mods\xiaoke;<仓库>\mods\xiaoxiaoli
```

- 这样加载时 mod 文件一改就热重载，没生效就输入 `/reload-plugins` 或重开会话；自动更新只提示，更新靠 `git pull`。
- 同名的 mod 只留一份：本地目录加载的会顶替插件市场装的同名插件，两边都装容易弄不清用的是哪份；以前装在 `~/.claude/mods/xiaoxiaoli` 之类位置的，把那一项换成本仓库的。
- 跑测试与类型检查：

  ```
  claude plugin test <仓库>\mods\xiaoxiaoli
  claude plugin test <仓库>\mods\xiaoke
  claude plugin validate <仓库>
  ```

## 发版

两个 mod 各自按版本号发：改 `mods/<mod>/.claude-plugin/plugin.json` 的 `version`，在 `mods/<mod>/CHANGELOG.md` 顶部加一节 `## <版本号>`，写几条更新要点，合进主分支 `master`。只有版本号变了才算新版：同事的 Claude Code 下一天第一次打开时自动装上（插件市场的规则也是 `version` 不变就不更新）。

## 密钥与配置放哪

| 内容 | 位置 |
| --- | --- |
| TAPD 等 MCP 服务器的令牌 | 系统环境变量，在 MCP 配置里引用；不写进任何仓库 |
| 工作台名字、工种、演练记录 | `~/.claude/xiaoxiaoli/profile.json`，所有项目共用 |
| 上次体检的结果 | `~/.claude/xiaoxiaoli/env.json` |
| 各项目通用的资料与测试账号 | `~/.claude/xiaoxiaoli/shared/` 下的 `resources.md`、`secrets.env`，AI 用到时创建和维护 |
| 项目与 TAPD 的绑定、分支模板、显示名 | `~/.claude/xiaoxiaoli/projects/<项目键>/config.json`，进度在同目录的 `state.json` |
| 项目专属资料与账号 | 同目录的 `resources.md`、`secrets.env`：和通用不一样的才写这里，两处都有的以项目的为准 |
| 自带配置的项目 | 项目里有 `docs/xiaoli/local/workbench/config.json` 的照旧读项目内的，不看全局目录 |
| 只有进度文件的老项目 | 项目里只有 `docs/xiaoli/local/workbench/state.json`、没有 `config.json`：绑定走全局目录，进度继续用项目内那份 |

项目键是主工作区目录名加路径短哈希（如 `my-app-1a2b3c4d`），开工消息和绑定结果里有完整路径。mod 不读密钥文件；`secrets.env` 只给会话里的 AI 按流程读取使用，不进任何仓库。

## 不同工种怎么调整流程

面板和进度是通用的，流程按工种分：工作台内置前端、后端、Python、测试、产品、其他六套工作流（`mods/xiaoxiaoli/workflows/*.json`），测试、产品、其他开工不建分支。

- 换工种：`/xiaoxiaoli role <工种>`，或对 AI 说「我是做后端的」。
- 调整步骤：直接对 AI 说，比如「这个项目去掉写文档这一步」「以后我的流程都加一步代码评审」。AI 用 `mcp__xiaoxiaoli__workflow` 改，存在 `~/.claude/xiaoxiaoli` 下（只对本项目，或对你所有项目），不往项目仓库里写文件；进行中的条目按开工时的步骤走，不受影响。
- 项目专属信息（TAPD 项目 ID、命令、账号）不写进 skill 与工作流，由 AI 问过后记进资料目录。

详见 [mods/xiaoxiaoli/README.md](mods/xiaoxiaoli/README.md) 的「工种与工作流」。
