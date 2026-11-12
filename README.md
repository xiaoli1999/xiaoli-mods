# 小黎 mods（xiaoli-mods）

小黎的 AI 工作流沉淀。「小黎 mods」是总称，里面是两个 Claude Code mod：陪伴猫「小黎」和小小黎 AI 工作台，另带一个通用的工作流 skill。猫和作者同名，需要区分时，猫这边就叫「小黎 mods」。

| 目录 | 是什么 |
| --- | --- |
| `mods/xiaoke` | 小黎：趴在输入框上的陪伴猫。提示词缓存保活、看模型与思考强度、token 与额度预估、概括当前在做的事、定点久坐喝水提醒；按钮栏的「干活 / 收工」开关小小黎面板 |
| `mods/xiaoxiaoli` | 小小黎 AI 工作台：AI 工作流的载体。侧栏拉取并展示 TAPD 待办，点「开工」才开工；按「步骤 → 任务 → 模块」显示进度，AI 用 `mcp__xiaoxiaoli__progress` 推进。在任何项目里都能用，没绑定 TAPD 的项目问一次就记住。详见 [mods/xiaoxiaoli/README.md](mods/xiaoxiaoli/README.md) |
| `skills/xiaoli-workflow` | 通用 AI 开发流程：TAPD 需求 11 个环节、缺陷 6 步、必须先问的动作与 Git 规则。Claude Code、Codex 等都能用 |

目录名沿用各自的标识：`mods/xiaoke`（陪伴猫小黎）、`mods/xiaoxiaoli`（小小黎 AI 工作台）。命令：猫是 `/xiaoli`（如 `/xiaoli keep on|off` 开关缓存保活、`/xiaoli rest` 休息 2 分钟），工作台是 `/xiaoxiaoli` 与 `mcp__xiaoxiaoli__*`。旧命令 `/xiaoke` 仍可用。

## 前置条件

- Claude Code。mod 只在 Claude Code 里跑；skill 不依赖 mod。
- TAPD MCP 服务器，名字必须是 `tapd`：会话里输入 `/mcp` 核对，工具名前缀应为 `mcp__tapd__`。
- 语雀 skill `li-yuque-skills`（读需求里的语雀文档、上传分享文档）：

  ```
  npx skills add xiaoli1999/li-yuque-skills -g -a claude-code -y
  ```

- 可选：chrome-devtools MCP（浏览器自测）、figma MCP（设计稿）、context7 MCP（三方库文档）。

## 安装

1. 克隆仓库，记下它的绝对路径，下面写作 `<仓库>`。
2. mod：把两个 mod 目录追加到 `CLAUDE_CODE_PLUGIN_DIRS`（系统环境变量，或 `~/.claude/settings.json` 的 `env`），Windows 用 `;` 分隔，然后重开 Claude Code：

   ```
   CLAUDE_CODE_PLUGIN_DIRS=<仓库>\mods\xiaoke;<仓库>\mods\xiaoxiaoli
   ```

   已经装过同名 mod（如 `~/.claude/mods/xiaoxiaoli`）时，把原来那一项换成本仓库的，不要两份并存。
3. skill：把 `skills/xiaoli-workflow` 整个目录复制或链接到 `~/.claude/skills/xiaoli-workflow`；Codex 用户放到 `~/.agents/skills/xiaoli-workflow`。链接的好处是 `git pull` 后直接生效，Windows 可用目录联接（不需要管理员）：

   ```
   cmd /c mklink /J "%USERPROFILE%\.claude\skills\xiaoli-workflow" "<仓库>\skills\xiaoli-workflow"
   ```

## 首次使用

1. 在任意项目里打开 Claude Code，输入 `/xiaoxiaoli show`（或点陪伴猫小黎的「干活」）打开面板。
2. 项目还没绑定 TAPD 时，待办区列出你参与的 TAPD 项目：点一行，再点「[ 绑定 <项目名> ]」。也可以直接对 AI 说「这个项目对应 TAPD 的某某项目」。
3. 待办出来后点一条，再点「[ 开工 <ID> ]」：AI 按 xiaoli-workflow 的流程走，面板下半显示进度。手上已有没做完的需求时，面板给出新会话的启动命令（git worktree 加 claude），到新终端粘贴运行。
4. 想重新绑定：`/xiaoxiaoli unbind`，面板回到项目列表。

## 密钥与配置放哪

| 内容 | 位置 |
| --- | --- |
| TAPD 等 MCP 服务器的令牌 | 系统环境变量，在 MCP 配置里引用；不写进任何仓库 |
| 项目与 TAPD 的绑定、分支模板 | `~/.claude/xiaoxiaoli/projects/<项目键>/config.json`，进度在同目录的 `state.json` |
| 项目专属资料 | 同目录的 `resources.md`：AI 问过的项目信息（门禁命令、测试环境、发版方式等）记在这里 |
| 测试账号等密钥 | 同目录的 `secrets.env`，只给 AI 按流程读取使用，不进任何仓库 |
| 自带配置的项目 | 项目里有 `docs/xiaoli/local/workbench/config.json` 的照旧读项目内的，不看全局目录 |
| 只有进度文件的老项目 | 项目里只有 `docs/xiaoli/local/workbench/state.json`、没有 `config.json`：绑定走全局目录，进度继续用项目内那份 |

项目键是主工作区目录名加路径短哈希（如 `fg-psd-demo-1a2b3c4d`），开工消息和绑定结果里有完整路径。mod 本身不读密钥，也不读设置文件。

## 非前端同事怎么改

面板和进度是通用的，流程写在 skill 里。改 `skills/xiaoli-workflow/SKILL.md` 的环节即可：

- 改第 2 节总表和第 3 节细则：比如后端把「浏览器自测」换成接口自测，测试把「开发」换成写用例、执行用例。
- 环节的键（`fetch` … `release`、缺陷的 `screenshot` … `verify`）是面板认的步骤，不要改键名和个数；面板上显示的步骤名固定在 `mods/xiaoxiaoli/hooks/workbench.ts` 的 `STORY_STEPS`、`BUG_STEPS`，要改显示名改那里。
- 项目专属信息（TAPD 项目 ID、命令、账号）不写进 skill，写进各自项目的 `resources.md`。

## 更新与测试

- 更新：`git pull`。`CLAUDE_CODE_PLUGIN_DIRS` 里的 mod 文件变化后会热重载，没生效就重开会话；skill 是复制的要重新复制。
- 改了 mod 跑测试：

  ```
  claude plugin test <仓库>\mods\xiaoxiaoli
  claude plugin test <仓库>\mods\xiaoke
  ```
