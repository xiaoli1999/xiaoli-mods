# 小小黎 AI 工作台（xiaoxiaoli）

小黎 mods 里的一个 Claude Code mod：在侧栏开一个「小小黎AI工作台」面板（标题自绘在第一行），不抢输入框焦点，会话启动时默认收起。上半是 TAPD 待办（需求、任务、缺陷，任务挂在所属需求下，可按迭代筛），每条带开工态（待开工 / 开工中 / 已完成）；面板只拉取与展示，点一行出现「[ 开工 <ID> ]」确认按钮，再点才开工（已完成的需求不能重新开工，任务可以重新做，见「开工」一节）。下半是当前项目状态文件里的进行中条目：当前会话的条目按「步骤 → 任务 → 模块」三级树状展开，别的会话的折成一行，做完的划掉折成一行；没记会话 ID 的旧条目归主工作区的会话。状态行只显示本会话的条目。可由陪伴猫小黎的「干活」「收工」按钮开关。

全局可用，按项目自动适配：项目里有工作台配置 `config.json` 的（自带配置的老项目）照旧读项目内的；其余项目的配置与状态放在全局目录，没绑定 TAPD 的项目在面板上点选一次（或让 AI 绑定）就记住。只有进度文件 `state.json` 的老项目：绑定走全局，进度继续用项目内那份。

工作台可以起名：叫「小美」就是「小美AI工作台」，面板标题、提示前缀、状态行与 TAPD 评论署名都跟着换；没起名时叫「小小黎AI工作台」。第一次用时会自动让 AI 问一次名字（只自动一次），面板最上方也有引导，不设也能照常用，见「起名与首次引导」。

开工按工种走不同的工作流（前端、后端、Python、测试、产品、其他），测试、产品、其他开工不建分支；工作流的自定义存在全局目录里、按项目对应，不往项目仓库里写文件，查看与调整都对 AI 说，见「工种与工作流」。

个人通用的东西配一次、所有项目共用，项目只记和通用不一样的差异（显示名、用到哪些系统等），都放在全局目录、只有有差异的项目才有自己的文件，见「通用配置与项目差异」。

刚装好可以让 AI 带你走一遍演练：先检查本机已经装了哪些 MCP、skill 和命令行工具，缺的当场补或记下以后补，再按你的工作流模拟走一遍每个环节、讲讲功能点，卡在哪里就告诉你要准备什么；不建分支、不改 TAPD，见「体检与演练」。

开发流程 skill `xiaoli-workflow` 随工作台一起装（会话里叫 `xiaoxiaoli:xiaoli-workflow`）；每天第一次开会话时自动检查新版，插件市场安装的自动更新，见「自动更新」。

## 安装

插件市场（推荐）：

```
claude plugin marketplace add xiaoli1999/xiaoli-mods
claude plugin install xiaoxiaoli@xiaoli-mods
```

在会话里也可以一步装好（Claude Code 2.1.275 及以后）：

```
/plugin install xiaoxiaoli --marketplace xiaoli1999/xiaoli-mods
```

装好后重开会话，或在会话里输入 `/reload-plugins`。以前自己复制到 `~/.claude/skills/xiaoli-workflow` 的 skill，装好后删掉那份，用随插件来的。

开发者本地加载：把本目录追加进 `CLAUDE_CODE_PLUGIN_DIRS`（进程环境变量或 `~/.claude/settings.json` 的 `env`），Windows 用 `;` 分隔，然后重开 Claude Code。`<仓库>` 换成小黎 mods（xiaoli-mods）仓库的绝对路径：

```
CLAUDE_CODE_PLUGIN_DIRS=<仓库>\mods\xiaoke;<仓库>\mods\xiaoxiaoli
```

同一个 mod 只放一份：本地目录加载的会顶替插件市场装的同名插件；换用本仓库的版本时，把原来指向 `~/.claude/mods/xiaoxiaoli` 的那一项换掉，不要两份并存。本地目录加载的改了文件会热重载，自动更新只提示、不改文件，更新靠在仓库目录 `git pull`。

### mod 目录结构

```
mods/xiaoxiaoli/
├─ .claude-plugin/
│  ├─ plugin.json          插件清单：名字、版本（自动更新比的就是它）、说明
│  └─ icon.png             插件图标
├─ hooks/                  代码：register.tsx 是入口，其余是各部分的纯函数（update.ts 管自动更新，与陪伴猫里的同名文件是同一份）
├─ skills/xiaoli-workflow/ 随插件装的开发流程 skill（SKILL.md）
├─ workflows/              六个工种的内置工作流
├─ guide/                  体检依赖清单 deps.json 与演练脚本 tour.json
├─ types/                  $.state 的类型
├─ tests/                  测试与逐字副本夹具
├─ config.json             项目内工作台文件的相对位置
├─ CHANGELOG.md            每个版本的更新要点（自动更新时截给用户看）
└─ README.md
```

TAPD 走会话里已连接的 MCP 服务器，代码里写死服务器名 `tapd`（`hooks/tapd.ts` 的 `TAPD_SERVER`）。核对：会话里输入 `/mcp`，TAPD 那一项的名字应为 `tapd`（工具名前缀 `mcp__tapd__`）；不一致就改这个常量。名字不对时面板顶部先显示「正在连接 TAPD，第 n 次重试」（按 5、15、30 秒自动重试），约 50 秒后三次都失败才显示「拉取失败（call-failed），点刷新重试」。

## 配置与状态文件放在哪

按下面顺序找，找到就用，不合并：

先定看哪个目录：会话目录下有工作台文件（`docs/xiaoli/local/workbench/config.json` 或同目录的 `state.json`，位置可在 mod 目录的 `config.json` 改）就看会话目录；会话在 worktree 里、会话目录没有而仓库主工作区有时，看主工作区。再按下面走：

1. 项目内：看的那个目录里有 `config.json`（内容非空）时，配置与状态都用项目内的。行为与 0.2.x 一致，`config.json` 与 `state.json` 都有的自带配置的老项目走这一条。
2. 全局：项目内没有 `config.json` 时，配置用 `~/.claude/xiaoxiaoli/projects/<项目键>/config.json`，状态用同目录的 `state.json`。会话在 worktree 里时归到仓库主工作区，同一仓库的几个会话共用一份；不在 git 仓库里时按会话目录算。
   - 只有进度文件的老项目（旧版 mod 在没配置的项目里也写 `state.json`）：绑定走全局，进度继续用项目内那份 `state.json`，不搬也不复制到全局目录。worktree 里的会话按上面的顺序找到主工作区那份就用那份。
3. 取不到全局根目录时按项目内处理：没设 `XIAOXIAOLI_HOME`、没设 `CLAUDE_CONFIG_DIR`，用户目录变量（`USERPROFILE`、`HOME`）也都没有，才算取不到；设了前两者中的任一个，即使用户目录变量都没有也照常走全局。按项目内处理时进行中区照常读项目内的 `state.json`；待办区、`/xiaoxiaoli refresh`、绑定工具与 `/xiaoxiaoli unbind` 都如实说明「取不到用户目录，无法使用全局绑定；可设环境变量 XIAOXIAOLI_HOME 指定全局目录」，不说「没配 TAPD」。

项目键 = 主工作区目录名（小写，不能进文件名的字符换成 `-`）+ `-` + 主工作区路径的 8 位短哈希，如 `my-app-1a2b3c4d`。路径的分隔符、末尾斜杠、大小写不影响哈希；目录同名、路径不同的两个项目得到不同的键，不会串用配置。项目搬了位置就是新键，要重新绑定一次。

全局根目录按顺序取：设了环境变量 `XIAOXIAOLI_HOME` 时直接用它（换位置、测试用）；否则设了 `CLAUDE_CONFIG_DIR` 时为 `$CLAUDE_CONFIG_DIR/xiaoxiaoli`；否则为 `<用户目录>/.claude/xiaoxiaoli`，用户目录先取 `USERPROFILE`、没有再取 `HOME`；都没有时见上面第 3 条。

## 首次进入没绑定的项目

全局模式下项目还没绑定 TAPD 时，待办区换成绑定列表：

- 第一行「本项目还没绑定 TAPD 项目」，下面列出你参与的 TAPD 项目（`get_user_participant_projects`，去掉公司一层），每行项目名与项目 ID，整行可点。
- 点一行出现「[ 绑定 <项目名> ]」，再点才写入；写入后面板换成正常的待办视图并马上拉待办。之后再打开这个项目不再询问。
- 也可以对 AI 说「这个项目对应 TAPD 的某某项目」，AI 调 `mcp__xiaoxiaoli__bind` 绑定（见下）。
- 会话刚启动 TAPD 还没连上时，与待办一样按 5、15、30 秒自动重试，标题行显示第几次重试。

绑定写的是全局项目配置：`projectName`、`tapdWorkspaceId`，外加 `root`（项目目录，只给人看是哪个项目，查找只认项目键）；文件里原有的其他字段（含 `displayName`、`systems`）保留，原来记着不用 TAPD（`systems.tapd` 为 `false`）的改回 `true`。

## 通用配置与项目差异

原则：个人通用的东西配一次、所有项目共用；项目只记和通用不一样的差异；都放全局目录，不往项目仓库里写任何文件；只有有差异的项目才有自己的文件。你不用翻目录，查看和修改都对 AI 说。

### 全局目录的布局

全局根目录（默认 `~/.claude/xiaoxiaoli`，取法见「配置与状态文件放在哪」）下：

```
~/.claude/xiaoxiaoli/
├─ profile.json          个人通用：工作台名字、工种、首次引导的标记、演练处理过没有
├─ env.json              个人通用：上次体检的结果（演练里 AI 调 check 时写，见「体检与演练」）
├─ workflow.json         个人通用：个人自定义工作流（可选，有自定义才有）
├─ shared/               个人通用：通用资料目录
│  ├─ resources.md       各项目通用的地址、命令、发版方式等（AI 用到时创建和维护）
│  ├─ secrets.env        各项目通用的测试账号等（AI 用到时创建和维护）
│  └─ README.md          说明这个目录的用途（第一次生成新会话命令时 mod 写）
└─ projects/<项目键>/    按项目：只有有差异的项目才有
   ├─ config.json        TAPD 绑定、分支设置、displayName、systems
   ├─ state.json         进行中的条目（面板开工或进度工具写）
   ├─ workflow.json      项目自定义工作流（可选）
   ├─ resources.md       本项目和通用不一样的资料（可选，AI 维护）
   └─ secrets.env        本项目和通用不一样的账号（可选，AI 维护）
```

### 查找与覆盖

- 资料：通用资料目录与项目资料目录都有的，以项目的为准。全局模式的开工消息与新会话启动命令同时给出两个目录（见「开工」「启动命令」）。
- 工作流：项目自定义 → 个人自定义 → 内置工种（见「工种与工作流」）。
- 名字、工种：只有个人一份（`profile.json`）。
- 显示名、用到的系统：只有项目一份（项目的 `config.json`）；没写就是没差异。
- 项目内模式（项目里有 `docs/xiaoli/local/workbench/config.json`）的项目流程与资料按项目内文档，这里的项目差异不支持。

### 显示名 `displayName`

可选，项目在面板上显示的名字：去首尾空白，1 到 20 个字符，不含控制字符。设了之后面板标题行的项目名用它（没绑定时原来显示目录名、已绑定时原来显示 TAPD 项目名，都换成它；「全部项目」视图照旧）；确认行里「将在当前仓库（<目录名>）开工」这类指仓库目录的地方仍用目录名。没设时照旧。

### 用到的系统 `systems`

可选对象，记本项目用不用某个系统，值为 `true`（用）或 `false`（不用）；没写的键是「没说」，按用到处理。键小写字母开头，只含小写字母、数字与 `-`。约定的键：`tapd`、`yuque`、`figma`、`sentry`，其他键原样保留。

- 只有 `tapd` 为 `false` 有 mod 行为：待办区不列 TAPD 项目让你绑定，也不拉待办，换成两行说明「本项目不用 TAPD……」；`/xiaoxiaoli refresh` 同样这么说；进行中区、进度工具、工作流照常。之后绑定了 TAPD 项目（绑定工具，或改回 `tapd`）会自动改回 `true`。
- 其他键 mod 不解释，只存取，供 AI 判断哪些环节跳过（如 `yuque` 为 `false` 时不读语雀）。
- `displayName` 与 `systems` 可以在没有 TAPD 绑定时单独存在：只有它们的 `config.json` 不算已绑定，也不报「配置不完整」，面板照常显示绑定列表（`tapd` 为 `false` 时除外）。绑定、解绑写回时都保留它们。

### 怎么对 AI 说

- 「这个项目显示成某某」「这个项目不用 TAPD」「这个项目用语雀、不用 figma」：AI 调 `mcp__xiaoxiaoli__project` 的 set。
- 「看看这个项目的配置」：AI 调 get，一次看全显示名与目录名、TAPD 绑定、用到的系统、两处资料目录与 `resources.md`、`secrets.env` 在不在、生效的工作流、工作台名字与工种。自己看不经过 AI：`/xiaoxiaoli project`。
- 「把测试账号记下来，各项目通用」：AI 写进通用资料目录的 `secrets.env`；只这个项目不一样的写进项目资料目录。

mod 不读 `resources.md` 与 `secrets.env` 的内容，只看在不在；读写它们的是会话里的 AI。

### 测试账号可以有多组

同一个项目里，不同功能用不同的测试账号和数据是常态，所以 `secrets.env` 里可以并存多组账号，不用每次替换。约定写在工作流 skill 的「开工前」一节，由会话里的 AI 遵守：

- 每组账号前面用一行注释写清组名与用途，如 `# [运营-审核员] 用于审核流程、权限相关功能`；同组的变量用同一个前缀。这组账号对应的地址、测试数据范围等不是密钥的说明，记在同目录 `resources.md` 里同名的小节下。
- 用户给了新账号就追加成新的一组，不覆盖、不删除已有的组；只有用户明确说某一组换了才改那一组。
- 自测前按要测的功能挑用途对得上的那一组；对不上或有几组都合适时问用户用哪组。自测结论里只写用了哪一组的组名。

通用资料目录和项目资料目录的 `secrets.env` 都按这个约定写。账号是明文存在本机的，只放测试环境的账号。

## 起名与首次引导

### 档案放哪

名字记在全局根目录下的 `profile.json`（默认 `~/.claude/xiaoxiaoli/profile.json`，全局根目录的取法见上一节，`XIAOXIAOLI_HOME`、`CLAUDE_CONFIG_DIR` 照样生效）。所有项目共用一个名字；项目内模式（有项目内 `config.json` 的项目）也读这一份，项目配置的查找规则不变。

```json
{ "version": 1, "name": "小美" }
```

选了「先不设」时是 `{ "version": 1, "skipped": true }`。自动发起过设置引导后多两项 `"guided": true, "guidedBy": "<发起它的会话 ID>"`（见下文「首次自动发起」），只管以后不再自动发起，不影响是否还没设置。演练处理过后多 `"tour": "done" | "declined"` 与 `"tourAt"`（finish 带了小结时还有 `"tourSummary"`），见「体检与演练」。读的时候容错：文件不存在、不是合法 JSON、`version` 不是 1、`name` 不是文字或名字不合格，都当作还没设置，不报错。`version` 比 1 大（更新版本的 mod 写的）时名字用默认、不显示引导也不弹提示、不自动发起，改名、先不设与设置引导都不覆盖这个文件，如实说明先更新 mod。写的时候只改 `name`（同时去掉 `skipped`）、`skipped`（同时去掉 `name`）、`role`、自动发起的两项或演练的几项，文件里别的字段原样保留。

取不到全局根目录（见上一节第 3 条）时：名字用默认，不显示引导、不弹提示；`/xiaoxiaoli setup`、`/xiaoxiaoli name` 与起名工具都如实说明「取不到用户目录……起的名字存不了」，不发不写。

### 名字规则

- 去掉首尾空白；结尾已带「AI工作台」「AI 工作台」「工作台」的去掉这个后缀（AI 不分大小写），免得拼成「小美AI工作台AI工作台」。
- 去完后 1 到 12 个字符（按码点数，一个表情算 1 个），不含换行、制表等控制字符，不含 `<` `>` `&` `"` `'` 这五个字符（名字会进 TAPD 评论的 HTML 署名）。不合格时回明确的中文原因，不写入。
- 没起名或选了先不设时名字是「小小黎」；工作台全称 = 名字 + 「AI工作台」。

### 名字影响哪些地方

- 面板第一行自绘的标题（字间加空格），以及传给 `$.ui.open` 的面板标题（只有同时开着多个面板、出现标签时才画出来）。改名后自绘标题马上重画；面板开着时用同一个 id 重开一次换掉标签标题（引擎对已打开的 id 只换标题、不另开）。
- 提示前缀：toast、`/xiaoxiaoli` 的回复、工具拒绝的原因都写成「<名字>：……」；状态行写成「<名字> · <ID> 第 N 步 ……」；生成启动命令时打进对话的那行写成「<名字> <ID> 启动命令……」。
- 全局模式的开工消息（本会话发出的与新会话启动命令里的）在流程指引后面带「TAPD 评论署名 ——<全称>」，让 AI 知道评论末尾署什么名。项目内模式的「开工 <ID>」不变。
- 别的会话改了名，这边下一次刷新待办（定时、手动刷新、打开面板）时跟上。

不影响：命令名 `/xiaoxiaoli`、工具名 `mcp__xiaoxiaoli__*`、插件标识、`$.store` 与 `$.state` 的键、目录名、工具与命令的说明文案（静态注册，仍写「小小黎工作台」）；陪伴猫小黎（`mods/xiaoke`）不动。

### 首次引导

还没设置（取得到全局根目录，`profile.json` 里既没有合格的名字也没有 `skipped`）时：

- 面板最上方多两行引导，下面空一行再是标题：第一行「第一次用？给工作台起个名字」，右边「[ 开始设置 ]」；第二行「不设也能照常用」，右边「[ 先不设 ]」。点击只认行号，所以两个按钮各占一行、整行可点。沉浸模式下不显示，免得挡住进行中的任务。
- 会话启动时：满足下面「首次自动发起」的条件就等一会儿自动发起设置引导，发出时提示「第一次用，正在帮你设置工作台名字；不想设直接选「保持默认」，以后可点面板上的「开始设置」或输入 /xiaoxiaoli setup」；没自动发起（条件不满足或到时没发成）就弹一次提示「第一次用，打开面板点「开始设置」给工作台起名，或输入 /xiaoxiaoli setup；不设也能照常用」。同一个会话里 mod 热重载不再弹、不再排（记在 `$.state`），新开的会话还没设置就再提示一次。
- 起名工具 `mcp__xiaoxiaoli__setup` 放在提示词的工具列表里；设置过的放在 ToolSearch 后面。

### 首次自动发起

装好后第一次在交互式会话里打开 Claude Code，不用点也不用输命令，AI 会直接问名字。这台机器上只自动发起一次，会花一轮对话的 token（AI 读这段引导、问你、保存）。

- 什么时候排：全新启动的会话（本会话第一次跑 `session.start`，热重载等再来的不算）、有人在终端前（`isInteractive` 为真、有绘制表面；`claude -p`、SDK 不算）、还没设置、档案里还没有自动发起的标记。
- 等多久：会话启动后约 3 秒再看一眼。`session.start` 钩子里不发（会话的启动在等这个钩子），等工具注册完、界面起来。
- 到时不发、也不记标记、改弹上面那条普通提示、留给下一次会话的情况：会话正在跑一轮（你已经开始提问）、会话里已有用户消息（`claude --resume` / `--continue` 恢复的会话，或你已经发过消息）、输入框里有草稿（你正在打字）、classic SessionStart 报的来源不是 `startup`（resume、fork、clear、compact）、档案里已有标记（别的会话抢先发起了）、标记写不进去。这期间你已经起了名或先不设的，什么也不做。取不到全局根目录、档案版本比本 mod 新时根本不排。
- 怎么只发一次：发之前先在 `profile.json` 里记 `guided: true` 与 `guidedBy`（本会话 ID）；写之前重读一遍档案，写完再读一遍，标记不是自己记的（同时启动的另一个会话抢先改写了）就不发。记过标记后任何会话都不再自动发起。
- 发的内容：和点「[ 开始设置 ]」发的是同一段，开头的来源写「首次使用，自动发起设置工作台（只自动这一次）」。
- 不想现在设：直接关掉提问、选「保持默认」或说以后再说。关掉或说以后再说时 AI 不追问、不保存，只告诉你以后的入口；选「保持默认」就存成默认名，引导行随之消失。之后想起名，点面板上的「[ 开始设置 ]」、输入 `/xiaoxiaoli setup` 或 `/xiaoxiaoli name <名字>`；面板上的两行引导在你起名或点「[ 先不设 ]」之前一直在。

「[ 先不设 ]」：写 `{ "version": 1, "skipped": true }`，引导行消失、以后不再提示，toast 告诉你以后可以用 `/xiaoxiaoli setup` 或 `/xiaoxiaoli name <名字>`。写失败时提示原因，引导行留着。

「[ 开始设置 ]」与 `/xiaoxiaoli setup`（不带参数）效果相同：以你的身份往会话里发一段设置引导，让 AI 来问：

1. 用 AskUserQuestion 问「工作台叫什么名字？」，说明最终名称是「名字+AI工作台」，选项里有「保持默认：小小黎」，也可以选「其他」自己填；已经起过名的写明当前名字，选项给「保持当前」与「恢复默认」。
2. 再问主要做哪类工作（可以和上一问放在同一次提问里）：选项给「前端」「后端」「测试」「产品」，Python 或别的工种选「其他」自己填，填 Python 存 `python`，别的都存 `other`；设过工种的写明当前的。见「工种与工作流」。
3. 全局模式还没绑定 TAPD 的项目，再问这个项目对应哪个 TAPD 项目，可以选「先不绑」，选了某个就调 `mcp__xiaoxiaoli__bind`。项目内模式与已绑定的项目没有这一问。
4. 拿到名字和工种后调 `mcp__xiaoxiaoli__setup` 保存，一两句话告诉你结果，不做别的事（下一条演练除外）。
5. 演练还没处理过（且演练脚本能用）时，保存后再用 AskUserQuestion 问要不要花几分钟走一遍演练，选项「现在走」「以后再说」；现在走就调 `mcp__xiaoxiaoli__guide` 的 start、照脚本带你走，以后再说就告诉你以后输入 `/xiaoxiaoli tour`。走过或选过不用的没有这一问。见「体检与演练」。
6. 你不想现在设（关掉提问、按了取消或说以后再说）时不追问、不保存，只告诉你以后可以点面板上的「开始设置」或输入 `/xiaoxiaoli setup`。

已经起过名、但没设工种的老用户不会被自动打扰，工种按前端；想改用 `/xiaoxiaoli role <工种>` 或对 AI 说「我是做后端的」。

面板上点的立即发出，会话正忙时排到正在跑的这一轮之后（toast 写「已排队」，同开工）。命令里引擎不许直接往会话里发消息（会等这条命令占着的那一轮），所以 `/xiaoxiaoli setup` 先回「已发出：设置工作台」，下一拍再发。名字存下之前引导行一直在；存下后演练还没处理过时，同一位置换成演练引导的两行（见「体检与演练」）。

### 怎么改名、怎么跳过

- 让 AI 改：运行 `/xiaoxiaoli setup`，或直接对 AI 说「给工作台改名叫某某」，AI 调 `mcp__xiaoxiaoli__setup`。
- 自己改（不经过 AI、不花 token）：`/xiaoxiaoli name <名字>`，名字里可以有空格；不带名字时回当前名字与用法。
- 恢复默认：起名为「小小黎」。
- 跳过：点面板上的「[ 先不设 ]」。之后想起名照样用上面两种办法。

## 工种与工作流

### 六个内置工种

| 工种（id） | 开工建不建分支 | 内置定义 |
| --- | --- | --- |
| 前端（`frontend`） | 建 | `workflows/frontend.json`，步骤就是原来的需求 ①–⑪ 与缺陷 6 步 |
| 后端（`backend`） | 建 | `workflows/backend.json` |
| Python（`python`） | 建 | `workflows/python.json` |
| 测试（`test`） | 不建 | `workflows/test.json` |
| 产品（`product`） | 不建 | `workflows/product.json` |
| 其他（`other`） | 不建 | `workflows/other.json` |

工种记在全局档案 `profile.json` 的 `role`（六个 id 之一，读不懂当作没设）。没设工种时按前端。设工种：设置引导里 AI 会问；也可以 `/xiaoxiaoli role <工种>`（中文名或 id 都认），或对 AI 说「我是做测试的」，AI 调 `mcp__xiaoxiaoli__setup` 的 `role`。首次自动发起只看名字设没设，和工种无关。

### 用哪一份：查找顺序

对当前项目依次找，第一份合格的生效：

1. 项目自定义：全局项目目录下的 `workflow.json`（`~/.claude/xiaoxiaoli/projects/<项目键>/workflow.json`，和全局 `config.json` 同目录）。
2. 个人自定义：全局根目录下的 `workflow.json`（`~/.claude/xiaoxiaoli/workflow.json`），对你的所有项目生效。
3. 内置：按工种取 mod 目录下的 `workflows/<工种>.json`。

- 自定义文件为空当作没有。存在但不合格（不是合法 JSON、字段不对、`version` 比本 mod 新）时跳过它用下一层，并如实提示哪一份不合格、为什么：变了时 toast 一次，`/xiaoxiaoli refresh` 的结果末尾也带上，AI 调工作流工具 get 时同样看得到。
- 内置文件读不到或不合格时退回代码里保留的前端步骤（建分支），面板照常工作，只记 debug 日志，不提示。
- 项目内模式（项目里有 `docs/xiaoli/local/workbench/config.json`，即自带配置的老项目）：流程由项目内文档约定，沿用前端步骤与建分支，工种和自定义工作流都不生效；没有全局项目目录，项目自定义存不了，本 mod 也不往项目仓库里写任何新文件。个人自定义可以存，对全局模式的项目生效。
- 会话启动、刷新待办、开工的那一刻都会重读一遍，别处改了工种或工作流，下一条新开工的条目就按新的。

### 怎么查看与调整

不用翻目录，对 AI 说：

- 「看看这个项目的工作流」：AI 调 `mcp__xiaoxiaoli__workflow` 的 get，告诉你来源（项目自定义、个人自定义，或内置的哪个工种）与每一步。
- 「这个项目去掉写文档这一步」：AI 先 get，在它的基础上改，存成项目自定义。
- 「以后我的流程都加一步代码评审」：存成个人自定义，所有项目生效（项目自定义仍优先）。
- 「这个项目恢复默认流程」：AI 调 reset，去掉那一层的自定义，回到下一层。mod 不删文件，清空成空文件，空文件等于没有。

只有你明确要求调整时 AI 才改；改动只影响之后新开工的条目。

### 进行中的条目不受影响

面板开工（或进度工具新建条目）时，条目按当时生效的工作流记下自己的步骤；之后工作流怎么改都不影响它，进度上报按条目自己的步骤键核。和前端步骤完全相同的工作流建出的条目仍是旧样式（老版本 mod 也读得懂）；别的工作流建出的条目多记一个 `workflow` 字段与每步的 `slow`，见「状态文件」。

### 不建分支的工种开工有什么不同

生效的工作流 `branch` 为 `false` 时：

- 本会话开工照常发开工消息，工作流里本来就没有建分支这一步。
- 需要开新会话时不建 worktree 与分支，给一条在项目目录直接起会话的命令（见「启动命令」），条目只记新会话 ID，不记分支与 worktree；面板上写「新会话（项目目录，不建分支）」。
- 回到已有会话的命令照旧。项目不在 git 仓库里也能正常开工。

### 定义文件的字段

```json
{ "version": 1, "id": "backend", "title": "后端", "branch": true,
  "story": [ { "key": "read", "title": "读需求与语雀", "slow": true, "what": "…", "tools": "…", "output": "…", "ask": "…", "rules": ["…"] } ],
  "bug": [ … ] }
```

| 字段 | 说明 |
| --- | --- |
| `version` | 可选，缺省为 1；比 1 大的不采用、不覆盖 |
| `id`、`title` | 可选：内置定义的工种 id 与名字；`title` 1 到 12 个字符 |
| `branch` | 可选，缺省 `true`；`false` 开工不建分支 |
| `story`、`bug` | 需求与任务、缺陷的步骤，各 1 到 20 步 |
| 步骤 `key` | 小写字母开头，只含小写字母、数字与 `-`，组内不重复；进度上报用它 |
| 步骤 `title` | 面板上显示的步骤名，1 到 12 个字符，不含控制字符 |
| 步骤 `slow` | 可选，缺省 `false`；`true` 为慢环节，可挂 TAPD 任务或自定义阶段与模块，进行中时面板展开 |
| 步骤 `what`、`tools`、`output`、`ask` | 可选，给 AI 看的细则：做什么、用什么、产出、要不要先问；每项最多 200 个字符，面板不显示 |
| 步骤 `rules` | 可选，给 AI 看的细则条目，最多 10 条，每条最多 300 个字符 |

面板开工时需求从拉取 TAPD、排序之后的第一步开始（前端为建分支，测试为读需求），缺陷从第一步开始。

## 体检与演练

刚装好时，有的人本机已经装了一部分 MCP、skill 和命令行工具，有的人一个都没有；第一次用也不知道一条需求在工作台里怎么走。演练就是让会话里的 AI 带你过一遍：先体检，缺什么当场补（或记下以后补）；再按你的工作流模拟走一遍每个环节，卡在哪里就告诉你要准备什么数据、确认做法；最后讲讲工作台的功能点。检查与安装都由会话里的 AI 做，mod 只给脚本、在面板放演示条目、记结果与收尾，演练里不起进程、不读设置。

### 什么时候出现

- 设置引导里：名字和工种保存后，AI 用 AskUserQuestion 问要不要花几分钟走一遍演练，选项「现在走」「以后再说」。只在演练还没处理过、演练脚本能用时问；走过或选过不用的，重新运行 `/xiaoxiaoli setup` 改名不会再问。选「以后再说」只告诉你入口，不记什么，面板上的演练引导留着。
- 面板上：起了名（或选了先不设）、演练还没处理过时，面板最上方（起名引导的位置）出两行：「带你模拟走一遍工作流，顺带检查环境」右边「[ 走一遍演练 ]」，「只演练不真改：不建分支、不改 TAPD」右边「[ 不用了 ]」，各占一行、整行可点，下面空一行再是标题。和起名引导不同时出（先起名）；沉浸时不出；演练进行中（进行中区有演示条目）时不出。已经起过名、从没有演练记录的老用户也会看到一次，这是有意的。
- 「[ 不用了 ]」：在 `profile.json` 里记 `"tour": "declined"`，两行消失、以后不再出，toast 告诉你以后可以输入 `/xiaoxiaoli tour`。写失败时提示原因，两行留着。
- 随时：输入 `/xiaoxiaoli tour`，或对 AI 说「带我走一遍」。

### 演练做什么、不做什么

点「[ 走一遍演练 ]」或输入 `/xiaoxiaoli tour`，mod 以你的身份往会话里发一段话（面板上点的立即发、会话正忙时排队；命令里排到下一拍发，同 `/xiaoxiaoli setup`），让 AI 调 `mcp__xiaoxiaoli__guide` 的 start。start 在进行中区放一条演示条目（ID `demo`，标题「【演练】熟悉工作台」，类型标的位置标「演」、不显示 ID，步骤取当前生效工作流的需求步骤、全部未开始，记到本会话；状态行写「<名字> · 演练 第 N 步 ……」），并把演练脚本交给 AI，AI 照着走：

1. 体检：按依赖清单逐项检查本工种用得到的 MCP、skill、命令行工具，已经有的打勾不重装，缺的列出来问你装哪些；装之前一定先问你，令牌和登录由你自己填，可以跳过。做完调 check 记下每项结果。
2. 走流程：按工作流一个环节一个环节过，每个环节先一句话说真实使用时这里会发生什么，再做演练时的验证（多数是只读检查，或问你要事先准备的数据、记进资料目录），进度推到演示条目上，面板跟着走。
3. 功能点：沉浸、待办区、进行中区、对 AI 说话改配置、命令。
4. 收尾：给一份只写实际验证过的小结，调 finish 移除演示条目、在档案里记下演练走过。

不做：不建分支、不提交、不推送；不改 TAPD（不发评论、不改状态、不新建条目）；不上传语雀；不发版；不做会落库的写操作。只做只读验证，和把你当场给的配置记进资料目录（通用的进通用资料目录，只属于本项目的进项目资料目录，账号只进 `secrets.env`、按「测试账号可以有多组」的约定写）。这些规则写在演练脚本里，由 AI 遵守。

演练要多轮对话，会花不少 token（体检、每个环节、功能点都要来回）。中途说停或以后再说，AI 立刻停下并调 finish 收尾（也记成走过，面板不再出引导），以后输入 `/xiaoxiaoli tour` 可以再来。

演练中途在面板上点真实待办开工照常可以：演示条目不算「手上有活」，开工分流照常在本会话发出；演示条目也不和任何待办对应（下面挂了真实的 TAPD 任务也不算），不出开工命令，不能被当作真实条目重新开工。进度工具只对它放宽 ID（`demo`），且只能推进与移除，不能新建。

### 依赖清单：`guide/deps.json`

在 mod 目录下，`{ "version": 1, "items": [ ... ] }`，每项：

| 字段 | 说明 |
| --- | --- |
| `id` | 依赖 id，体检结果的键；小写字母或数字开头，只含小写字母、数字与 `. _ -` |
| `kind` | `mcp`、`skill` 或 `cli` |
| `title`、`use` | 名字与做什么用 |
| `detect` | 怎么判断有没有装（给 AI 看，mod 不执行） |
| `install` | 可选：安装方式；没写时 AI 告诉你这项要另找安装方式，记为跳过 |
| `account` | 可选：要什么账号或令牌 |
| `roles` | 哪些工种用得到；没写为全部工种，认不出的工种丢掉 |

改法：直接编辑这个文件，加项、删项、改安装命令都行，下次演练读最新的。读的时候宽松：外壳不对（读不到、不是 JSON 对象、`version` 比 1 新、没有 `items` 数组）整份不能用，这时演练照常开始、脚本里说明跳过体检，check 拒绝；单项格式不对或 id 重复的跳过，脚本里说明跳过了几项。

清单里的安装命令要按团队实际核对一遍（包名、令牌的环境变量名、`uvx`、`npx` 这类前置工具在不在），mod 只是原样转给 AI，没有替你验证过。

### 演练脚本：`guide/tour.json`

也在 mod 目录下：

- `rules`：总规则；`check`：体检怎么做；`features`：功能点；`finish`：收尾。都是文字数组。
- `steps`：每个环节演练时验证什么。先查「<工作流 id>:<步骤键>」（如 `other:execute` 只对「其他」工种的执行这一步），再查「<步骤键>」，都没有用 `fallback`。工作流 id：内置的是工种 id；自定义工作流的定义里写了 `id` 就用它，没写为 `project` 或 `personal`。
- `fallback`：没写时用代码里的一句（「一句话说明这一步真实使用时做什么；问用户这一步需要事先准备什么数据或工具，记进资料」）。

改法同上，直接编辑。读不到或外壳不对（不是 JSON 对象、`version` 比 1 新）时演练入口如实说不能用：面板按钮与 `/xiaoxiaoli tour` 提示原因、不发，start 拒绝、不建演示条目，设置引导里不问演练；其余功能不受影响。数组里不是文字的项、`steps` 里不是文字的值丢掉。

start 返回的脚本按顺序：开头几行（演示条目与进度怎么报、演练工具怎么调、两处资料目录、工种与工作流）→ 总规则 → 第一部分体检（做法与本工种的依赖清单）→ 第二部分走流程（每个环节的序号、步骤键、标题、真实使用时做什么即工作流的 `what`、演练时验证什么）→ 第三部分功能点 → 收尾 → 本项目概况（同 `/xiaoxiaoli project`）。

### 结果记在哪

- 体检结果：全局根目录下的 `env.json`（默认 `~/.claude/xiaoxiaoli/env.json`），`{ "version": 1, "checkedAt": "<ISO 时间>", "results": { "<依赖 id>": "ok" | "missing" | "skipped" } }`。每次 check 整份换掉 `results`（这次没查的项不留），文件里别的字段保留；不认识的 id、值不对的项丢掉并在回话里说明；`version` 比 1 新时不覆盖。
- 面板：上次体检里当前工种用得到、结果为 `missing` 的依赖有几项，标题行下面就多一行「环境：缺 n 项（依赖名）」，右边提示 `/xiaoxiaoli tour 重查`，不可点；选了以后再配的（`skipped`）不算缺，没缺的、沉浸时不出。换工种后按新工种重算。
- 概况：`/xiaoxiaoli project` 与项目工具 get 末尾多一行「体检与演练」：上次体检的时间、本工种缺的与跳过的依赖、演练走过 / 选了不用 / 还没走。
- 演练：`profile.json` 里的 `tour`（`done` 走过、`declined` 选了不用）与 `tourAt`；finish 带了小结时存 `tourSummary`（最多 500 个字符，超出只存前面的），没带就去掉上次的。

### 怎么重来

输入 `/xiaoxiaoli tour`（或对 AI 说「带我走一遍」）随时再走，顺带重新体检；走过、选过不用的都可以。再 start 会把演示条目重置成全部未开始。

装了新的 MCP 要重开会话才生效，体检里先记 `missing`；重开会话后再走一遍，面板上的缺项才会更新。

## 命令与开关

| 方式 | 作用 |
| --- | --- |
| `/xiaoxiaoli show` / `hide` | 打开 / 收起侧栏，同时把 `XIAOXIAOLI_PANE` 写成同样的值 |
| `/xiaoxiaoli refresh` | 重读配置、状态文件、档案与工作流并立即刷新待办（没绑定时刷新绑定列表；记着不用 TAPD 的项目不调 TAPD，如实说明）。这次没拉到、进入自动重试时回「正在自动重试」；成功时回的条数与面板「待办（n）」一致（按当前视图与迭代筛过）；自定义工作流不合格被跳过时末尾带上哪一份、为什么；取不到用户目录时如实说明并提示 `XIAOXIAOLI_HOME` |
| `/xiaoxiaoli unbind` | 解除本项目的全局 TAPD 绑定：只去掉全局配置里的 `projectName`、`tapdWorkspaceId`，其余设置与 `state.json` 不动，面板回到绑定列表，方便演示时重来。项目内配置不受它影响 |
| `/xiaoxiaoli setup` | 让 AI 引导给工作台起名（没绑定 TAPD 的项目顺带问绑定），同面板「[ 开始设置 ]」；起过名的可以重新设置。见「起名与首次引导」 |
| `/xiaoxiaoli name [名字]` | 不经过 AI，直接校验并保存名字；不带名字时回当前名字与用法 |
| `/xiaoxiaoli role [工种]` | 不经过 AI，直接改工种（前端、后端、Python、测试、产品、其他，中文名或 id 都认）；不带参数时回当前工种、可选项与本项目生效的工作流。见「工种与工作流」 |
| `/xiaoxiaoli project` | 不经过 AI，打印本项目概况（同项目工具的 get）：显示名与目录名、TAPD 绑定、用到的系统、两处资料目录与资料文件在不在、生效的工作流、工作台名字与工种、上次体检与演练。见「通用配置与项目差异」 |
| `/xiaoxiaoli tour` | 让 AI 带你走一遍演练：体检本机环境、按工作流模拟走一遍、讲功能点，同面板「[ 走一遍演练 ]」；走过、选过不用的也能再走。见「体检与演练」 |
| 面板里「[ 开始设置 ]」「[ 先不设 ]」 | 还没起名时排在面板最上方，各占一行、整行可点；沉浸时不显示 |
| 面板里「[ 走一遍演练 ]」「[ 不用了 ]」 | 起了名（或先不设）、演练还没处理过时排在同一位置，各占一行、整行可点；和起名引导不同时出，沉浸时、演练进行中不显示 |
| 面板里「环境：缺 n 项」 | 上次体检里本工种有缺的依赖时在标题行下面，不可点；沉浸时不显示 |
| 环境变量 `XIAOXIAOLI_PANE` | `show` / `hide`。每 0.5 秒轮询，值变了才开关面板；会话启动时一律收起并把它设成 `hide` |
| 面板里「刷新」「切换：本项目 / 全部项目」 | 整行可点；全部项目 = 参与的项目去掉公司（organization）后逐个拉 |
| 面板里「迭代：本迭代 ▸」 | 仅本项目视图：点开选本迭代、全部或最近 8 个迭代（开始倒序），选择记进 `$.store`（各项目共用；记的是别的项目的迭代时本项目按本迭代筛）；今天不在任何迭代里时退化为全部并在标题行提示；迭代没拉到时迭代行写「本迭代（迭代未加载，暂显示全部）」，列表暂显示全部 |
| 面板里「[ 再复制一次 ]」「[ 收起 ]」 | 生成启动命令后出现，在待办区下面 |

面板每次由收起变为打开都会自动刷新一次待办，重复打开不重复拉。

与陪伴猫小黎的联动：小黎放松模式按钮行第一位的「干活 / 收工」开关调用 `$.env.set('XIAOXIAOLI_PANE', 'show' | 'hide')`，打开时再代跑 `/xiaoxiaoli show`；小小黎轮询到变化后开关面板。手动关掉面板时小小黎会把变量改回 `hide`，所以之后点「干活」仍能重新打开。

## 沉浸模式

只想盯着手上的任务时用：

- 进入：「进行中（n）」那一行右边有「[ 沉浸 ]」，点这一行就进入。
- 藏了什么：首次引导、演练引导、体检缺项那一行、本项目 / 全部项目的切换、迭代筛选、待办区（没绑定时的绑定列表、没配 TAPD 的提示）、启动命令都不显示，只留顶部标题行和进行中区。标题行照常显示刷新状态，点它照常刷新；待办在后台照常拉取、定时刷新，状态行也不变。
- 退出：这时那一行右边变成「[ 退出沉浸 ]」，再点一下回到原样；之前选中的待办、迭代选择、启动命令都还在。
- 只在当前会话记住：mod 热重载后仍是沉浸，新开的会话默认不沉浸。

## 开工：一条需求一个会话

点确认行后按下面分流，面板自己不起会话：

| 情况 | 做法 |
| --- | --- |
| 这条本就归当前会话 | 发出开工消息；会话正忙时排队到空闲再发 |
| 当前会话空闲，且手上没有没做完的条目 | 发出开工消息，条目记到当前会话（`sessionId`） |
| 当前会话正在跑一轮，或手上已有没做完的条目 | 生成新会话启动命令：复制到剪贴板、打一行进对话、面板显示；条目记上新会话 ID、分支与 worktree（不建分支的工种只记新会话 ID，命令在项目目录直接起会话） |
| 这条归别的会话且没做完 | 生成回到那个会话的命令（`claude --resume <ID>`） |

写状态文件失败时提示原因并注明没有写入，不发开工消息、不给启动命令。拼进命令的值先校验：回到已有会话的会话 ID 只认 UUID 形态，分支名里的短 ID 只认纯数字；不合格时不生成那条命令并说明。

挂在需求下的 TAPD 任务（状态文件里是需求某一步下的第二级子项）不另建条目，按所在需求分流：需求归当前会话就在本会话发出「开工 <任务长 ID>」，归别的会话就给回到那个会话的命令。

### 「全部项目」视图里别的 TAPD 项目的待办

可以开工，在当前仓库建分支、记进当前项目的状态文件。待办所属的 TAPD 项目与当前绑定的不同时，「[ 开工 <ID> ]」后面写明「属于「<TAPD 项目名>」，将在当前仓库（<仓库目录名>）开工」，面板放不下一行时另起一行；属于当前绑定项目的待办确认行不变。

条目与待办不只按短 ID 对应：面板开工时把待办所属的 TAPD 项目 ID 记进条目的 `workspaceId`。判断「这条待办是不是状态文件里那个条目」（开工态、开工分流）时，两边都有项目 ID 就要求相同；条目没有（旧条目、进度工具新建的）只按短 ID。不同 TAPD 项目撞了短 ID 的条目互不覆盖。

### 已完成的条目能不能重新开工

| 待办 | 状态文件里已完成时 |
| --- | --- |
| 需求 | 点这一行只出一行不可点的「已完成，不能重新开工」 |
| 缺陷 | 同需求；但 TAPD 上当前状态是「重新打开」（状态原值 `reopened`，或状态中文名里带「重新打开」，如自定义的「C1-重新打开」）时出「[ 重新开工 <ID> ]」，确认后这条缺陷的步骤全部重置为未开始、清掉子项与等待标记，再照常开工（分支、会话、worktree 不动） |
| 挂在需求下的任务 | 出「[ 重新做 <ID> ]」，确认后只把这个子项改回进行中、它下面的模块改回未完成，所在步骤与需求的状态不往回改，再照常发开工消息 |

开工消息：

- 项目内模式：`开工 <长 ID>`，流程由项目内文档约定。
- 全局模式（项目里没有流程文档）：`开工 <长 ID>（按 xiaoli-workflow 技能（随工作台插件安装时名为 xiaoxiaoli:xiaoli-workflow）的流程执行，用 mcp__xiaoxiaoli__progress 推进进度；项目内有 docs/xiaoli/workflow.md 时以项目内文档为准；先调 mcp__xiaoxiaoli__workflow 取本项目工作流（kind 传 story），按它的步骤、细则与「先问」走，进度用它的步骤键，其余照技能的通用规则；通用资料目录 <全局根>/shared，项目资料目录 <全局项目目录>（两处都有的以项目的为准）；TAPD 评论署名 ——<工作台全称>）`。缺陷的 kind 传 `bug`。全称默认「小小黎AI工作台」，起了名按名字（见「起名与首次引导」）。新会话启动命令里的开工提示同样带取工作流的一句、两个资料目录与署名。`xiaoli-workflow` 技能随工作台插件一起装，在本 mod 的 `skills/xiaoli-workflow`，会话里叫 `xiaoxiaoli:xiaoli-workflow`（插件自带的技能带插件名前缀，插件市场安装与本地目录加载都一样）；以前自己复制到 `~/.claude/skills/xiaoli-workflow` 的叫 `xiaoli-workflow`，所以开工消息两种叫法都写上。

「手上的条目」：`sessionId` 是当前会话的；没记 `sessionId` 的旧条目归主工作区的会话。这条规则三处一致：主工作区的会话里，旧条目在进行中区展开、开工分流算本会话的、状态行显示；worktree 里的会话把它折成一行、分流不算、状态行不显示。

### 启动命令

按项目路径自动选写法：Windows 路径（带反斜杠，或以盘符开头如 `D:/work/demo`）生成一行 PowerShell，其余（macOS、Linux）生成一行 bash/zsh；面板、提示与对话里那行相应写「到新的 PowerShell 窗口粘贴运行」或「到新的终端（bash/zsh）粘贴运行」。两种写法逻辑一致：worktree 目录不存在才建，建好（或本来就有）再进去起 claude。

PowerShell（单引号里的单引号写两遍；PowerShell 把弯单引号 ‘ ’ ‚ ‛ 也当单引号，它们同样写两遍，开工提示里的署名等自由文字收不掉字符串）：

```
if (-not (Test-Path '<主工作区>-<短ID>')) { git -C '<主工作区>' worktree add --no-track -b feat/<短ID> '<主工作区>-<短ID>' origin/master }; if (Test-Path '<主工作区>-<短ID>') { Set-Location '<主工作区>-<短ID>'; claude --session-id <新 UUID> -n '<短ID>' '开工 <长 ID>（独立会话：…）' --add-dir '<项目资料目录>' --add-dir '<通用资料目录>' }
```

bash/zsh（单引号里的单引号写成 `'\''`）：

```
if [ ! -d '<主工作区>-<短ID>' ]; then git -C '<主工作区>' worktree add --no-track -b feat/<短ID> '<主工作区>-<短ID>' origin/master; fi; if [ -d '<主工作区>-<短ID>' ]; then cd '<主工作区>-<短ID>' && claude --session-id <新 UUID> -n '<短ID>' '开工 <长 ID>（独立会话：…）' --add-dir '<项目资料目录>' --add-dir '<通用资料目录>'; fi
```

不建分支的工种（生效的工作流 `branch` 为 `false`）开新会话时不碰 git，在项目目录直接起会话，引号规则同上：

```
Set-Location '<项目目录>'; claude --session-id <新 UUID> -n '<短ID>' '开工 <长 ID>（独立会话：在项目目录 <项目目录>，不建分支；…）' --add-dir '<项目资料目录>' --add-dir '<通用资料目录>'
cd '<项目目录>' && claude --session-id <新 UUID> -n '<短ID>' '开工 <长 ID>（独立会话：在项目目录 <项目目录>，不建分支；…）' --add-dir '<项目资料目录>' --add-dir '<通用资料目录>'
```

开工提示放在 `--add-dir` 之前：`--add-dir` 是可变参数选项（`<directories...>`），跟在它后面的不带 `-` 的参数都会被它当成目录收走；提示放在前面、每个目录各写一个 `--add-dir` 就没有这个问题。

回到已有会话：PowerShell 为 `Set-Location '<目录>'; claude --resume <会话 ID>`，bash/zsh 为 `cd '<目录>' && claude --resume <会话 ID>`。

- 用 `git worktree add --no-track` 自己建分支，不用 `claude --worktree`：后者的分支名是 `worktree-<名字>`、起点是远程默认分支，过不了 pre-push 的分支名校验，上游也可能挂到 `origin/master`。
- 分支名模板与起点在项目配置里改（`branchTemplate`、`bugBranchTemplate`、`branchBase`，起点默认 `origin/master`）。
- `--add-dir`：项目内模式给 `<主工作区>/docs/xiaoli`（Windows 下为反斜杠；worktree 里没有这个被忽略的目录，新会话里的 AI 要读流程文档）；全局模式给项目资料目录（全局项目目录）与通用资料目录（`<全局根>/shared`），新会话里的 AI 读写资料用。生成命令前 mod 先确保通用资料目录在：不在就写一份说明用途的 `README.md`（会连目录一起建），建不了时命令里不加这个 `--add-dir`。mod 自己读写状态文件走绝对路径，不靠 `--add-dir`；worktree 里的会话按主工作区算项目键，读写同一份状态。
- worktree 里没有 `node_modules` 与 `.env*.local`，跑单测或本地页面前要先装依赖、拷环境文件。
- 项目不在 git 仓库里时 `git worktree add` 会失败，建分支的启动命令什么也不做；这种项目只在本会话开工。不建分支的工种不受影响。

## 配置

### mod 目录下 `config.json`（全局一份）

| 字段 | 说明 |
| --- | --- |
| `configPath` | 项目内配置的位置，相对项目目录，默认 `docs/xiaoli/local/workbench/config.json` |
| `statePath` | 项目内状态文件的位置，相对项目目录，默认 `docs/xiaoli/local/workbench/state.json` |

### 项目配置（项目内或全局，字段相同）

| 字段 | 说明 |
| --- | --- |
| `projectName` | 面板顶部显示的项目名 |
| `tapdWorkspaceId` | 「本项目」视图拉取的 TAPD 项目 ID（数字字符串） |
| `statePath` | 可选，只在项目内模式生效：状态文件路径，相对项目目录，优先于 mod 配置。全局模式固定为同目录的 `state.json`（只有进度文件的老项目用项目内那份，位置按 mod 配置） |
| `refreshMinutes` | 可选，自动刷新待办的间隔，分钟，默认 10 |
| `branchTemplate` | 可选，新会话开工的分支名模板，`{id}` 换成短 ID，默认 `feat/{id}` |
| `bugBranchTemplate` | 可选，缺陷的分支名模板，默认 `fix/{id}` |
| `branchBase` | 可选，新分支的起点，默认 `origin/master` |
| `root` | 全局配置里绑定时写上的项目目录，只给人看 |
| `displayName` | 可选，只在全局项目配置里认：面板上显示的项目名，见「通用配置与项目差异」 |
| `systems` | 可选，只在全局项目配置里认：本项目用不用某个系统，见「通用配置与项目差异」 |

项目内有 `config.json` 但必填字段不合格时，待办区只显示「本项目没配 TAPD（缺 config.json 或不完整），见 README」，不调 TAPD；项目内没有 `config.json`、又取不到全局根目录落不了全局时（见「配置与状态文件放在哪」第 3 条），待办区改为说明取不到用户目录、可设 `XIAOXIAOLI_HOME`，同样不调 TAPD；项目内没有 `config.json` 的走全局模式，必填字段缺了就是没绑定，显示绑定列表，只有进度文件的老项目也是这样（只有 `displayName`、`systems` 的全局配置同样算没绑定，不报不完整；`systems.tapd` 为 `false` 时不显示绑定列表）。进行中区照常。

全局项目目录里还可以放项目专属的资料（如测试账号 `secrets.env`、`resources.md`），各项目通用的放通用资料目录 `<全局根>/shared`；给 AI 按流程读，mod 本身不读这些文件的内容。

## 状态文件 state.json（version 2，每 2 秒读一次）

```json
{
  "version": 2,
  "tasks": [
    {
      "id": "9990001",
      "workspaceId": "<TAPD 项目 ID>",
      "kind": "story",
      "title": "演示-商家端-示例模块",
      "steps": [
        { "key": "fetch", "title": "拉取 TAPD", "status": "done" },
        { "key": "develop", "title": "开发", "status": "doing", "tasks": [
          { "id": "9990012", "title": "演示-任务二 接口", "status": "doing", "modules": [{ "name": "界面2 顶栏", "done": 3, "total": 5 }] }
        ] }
      ],
      "waiting": null,
      "branch": "feat/9990001",
      "sessionId": "<会话 ID>",
      "updatedAt": "2026-10-23T10:00:00.000Z"
    }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `id`、`title`、`updatedAt` | 必填；`id` 为 TAPD 短 ID，演练的演示条目为保留值 `demo`（见「体检与演练」） |
| `workspaceId` | 可选：所属 TAPD 项目 ID，面板开工时写上；与待办对应时两边都有就要求相同，没有只按短 ID。旧条目、进度工具新建的条目没有；进度工具更新条目时原样保留 |
| `kind` | `story`（需求与任务，默认）走工作流的 story 组，`bug`（缺陷）走 bug 组；旧样式条目为前端的 11 步与 6 步 |
| `workflow` | 可选：按哪份工作流建的（内置为工种 id，自定义为 `project`、`personal`）。有它的条目步骤自成一套，按文件里的顺序，不按前端模板补齐；没有的是旧样式条目 |
| `steps[]` | `key`、`title`、`status`（`done` / `doing` / `todo`）、可选 `detail`（当前子项）、`confirm`（结论待用户确认，面板标「待确认」）、`tasks`、`slow`；旧样式条目缺的步骤按未开始补齐 |
| `steps[].slow` | 可选：按工作流建的条目里慢环节写 `true`，没写为快环节；旧样式条目没有，按前端的慢环节（`read`、`align`、`develop`、`unit`、`selftest`） |
| `steps[].tasks[]` | 只在慢环节：TAPD 任务或自定义阶段的 `id`（纯数字为 TAPD 任务短 ID，其余为阶段名）、`title`、`status`、可选 `detail`、`modules[]`（`name`、`done`、`total`） |
| `waiting` | `null`，或 `align`（等你：对齐稿）、`review`（等你：看自测）、`tapd`（等你：批准改 TAPD） |
| `branch`、`sessionId`、`worktree`、`note` | 可选：分支、负责的会话、worktree 目录、等别人的事 |

步骤键取自条目自己的步骤。旧样式（前端）条目：需求 `fetch` 拉取 TAPD、`sort` 排序、`branch` 建分支、`read` 读需求与语雀、`align` 对齐需求、`develop` 开发、`unit` 单测、`selftest` 浏览器自测、`docs` 写文档、`tapd` 更新 TAPD、`release` 发版；缺陷 `screenshot` 读截图、`env` 核环境版本、`reproduce` 复现、`diagnose` 定位判定、`fix` 修复或拒绝、`verify` 验证。按别的工作流建的条目见对应的工作流定义。

文件版本仍是 2：`workflow` 与 `slow` 是新加的可选字段，旧文件照常读。老版本 mod 读到按别的工作流建的条目会当作格式不对跳过、并且不往回写，更新 mod 就好。

旧结构（没有 `steps`，只有 `step` 1–11 与 `stepName`）照常读：小于 `step` 的为已完成，等于的为进行中（`stepName` 作当前子项），其余未开始；经进度工具写一次就迁成 version 2。不合格的条目跳过，面板提示跳过了几条；有不合格条目或文件读不懂时不往回写。

## AI 用的六个工具

### 推进进度：`mcp__xiaoxiaoli__progress`

会话启动时注册（配了 TAPD 的项目放在提示词的工具列表里，其余项目放在 ToolSearch 后面）。每推进一步、换当前子项、派子代理时调一次，它现读状态文件、按规则改、写回并刷新面板：

- `id` 必填，为 TAPD 短 ID（纯数字），只放宽演练的演示条目这一个保留值 `demo`（它只能推进与移除，要由演练工具的 start 建）；新条目要 `title`，缺陷加 `kind: "bug"`；新条目按当前生效的工作流建步骤
- `step` 取这个条目自己的步骤键（键取自工作流，schema 里不写死）；不属于它的键被拒，回话里列出可用的键
- `step` + `status`：`doing` 与 `done` 都线性推进，它之前的步骤全记完成；`doing` 时它之后的回到未开始（返工），`done` 时之后的不动；`todo` 只改这一步
- `detail` 当前子项、`confirm` 待确认；`taskId`、`taskTitle`、`taskStatus`、`taskDetail` 挂 TAPD 任务或自定义阶段（只在这个条目的慢环节；`taskId` 纯数字为 TAPD 任务、新挂要带 `taskTitle`，其余为阶段名如「自测」，标题默认取它），`module`、`moduleDone`、`moduleTotal` 记模块
- 子项记成进行中（`taskStatus: "doing"`）时，只有这一步未开始、且它后面没有已完成或进行中的步骤（正常前进）才顺带把它推成进行中；这一步已完成、或在当前进行中的步骤之前时只挂子项，不改任何步骤的状态。要回到前面返工，显式传 `step` + `status`
- `waiting`（`none` 清掉）、`branch`、`note`；`bindSession: true` 把条目记到本会话；`remove: true` 移除条目

不能写时回一句原因并注明「没有写入」。

### 绑定 TAPD 项目：`mcp__xiaoxiaoli__bind`

用户说「这个项目对应 TAPD 的某某项目」时 AI 调它。全局模式还没绑定的项目放在提示词的工具列表里，其余放在 ToolSearch 后面。

- `project` 必填：TAPD 项目名或项目 ID（`workspace_id`）。按你参与的项目匹配：纯数字按 ID；名字完全一致（不分大小写）优先，否则按包含；对不上或对上多个时回原因并列出候选。
- 可选 `branchTemplate`、`bugBranchTemplate`（要含 `{id}`）、`branchBase`，一并写进全局项目配置。
- 项目内模式、取不到全局根目录、参数不对、拉参与的项目失败、写文件失败时回一句原因并注明「没有写入」。
- 已绑定时再调就是改绑，覆盖 `projectName` 与 `tapdWorkspaceId`。

### 给工作台起名、设工种：`mcp__xiaoxiaoli__setup`

用户说「给工作台改名」「工作台叫某某」「我是做后端的」，或按 `/xiaoxiaoli setup` 发来的设置引导问到名字与工种时 AI 调它。还没起名时放在提示词的工具列表里，其余放在 ToolSearch 后面。

- `name` 与 `role` 都可选，至少给一个。`name` 是名字本身（如「小美」），带了「AI工作台」「工作台」后缀会自动去掉，规则见「起名与首次引导」；`role` 取 `frontend`、`backend`、`python`、`test`、`product`、`other`（中文名也认）。
- 写全局 `profile.json`：保留文件里别的字段；给了名字改 `name` 并去掉 `skipped`，面板标题、提示前缀、状态行马上换；给了工种改 `role`，回话写明从下一条新开工的条目起按哪份工作流（本项目有自定义工作流时说明仍以自定义为准）。
- 两个都没给、名字或工种不合格、取不到全局根目录、`profile.json` 版本比本 mod 新、写文件失败时回一句原因并注明「没有写入」。

### 查看与调整工作流：`mcp__xiaoxiaoli__workflow`

始终放在提示词的工具列表里（全局模式每次开工都要先 get）。

- `action: "get"`：返回当前项目生效的工作流：一行来源说明（项目自定义、个人自定义，或内置的哪个工种，以及文件位置、建不建分支、进行中的条目不受影响），自定义不合格时多几行「注意」，最后是定义的 JSON。可选 `kind: "story" | "bug"` 只返回那一组，省 token。
- `action: "set"`：必填 `scope`（`project` 本项目、`personal` 个人）与完整的 `definition`（`story`、`bug`，可选 `branch`、`title`；对象或它的 JSON 文字）。校验通过才写到对应的 `workflow.json`（规范后的定义，版本写 1，多余字段丢掉），回话写明写到了哪、从下一条新开工的条目起生效、进行中的条目不受影响、本项目现在生效的是哪份。
- `action: "reset"`：必填 `scope`，清空那一层（空文件等于没有自定义），回到下一层；本来就没有时如实说。
- 只有用户明确要求调整工作流时 AI 才调 set 或 reset，改之前先 get、在其基础上改、保留没让改的步骤与细则（写在工具说明里）。
- 参数或定义不合格、取不到全局根目录、项目内模式存项目自定义（没有全局项目目录）、那一层的文件版本比本 mod 新、写文件失败时回一句原因并注明「没有写入」。

### 查看与修改项目差异：`mcp__xiaoxiaoli__project`

放在 ToolSearch 后面，不常驻（省 token）。用户说「这个项目显示成某某」「这个项目不用 TAPD / 用语雀」之类，或 AI 需要了解本项目配置概况时调。

- `action: "get"`：本项目概况，内容同 `/xiaoxiaoli project`；`resources.md`、`secrets.env` 只看在不在，不读内容。
- `action: "set"`：`displayName` 改显示名（传空字符串清掉，回到目录名），`systems` 与已有的合并（值 `null` 去掉该键）；至少给一个。写全局项目配置，文件里别的字段原样保留；写完马上重读，`tapd` 改成不用时面板不再拉待办，改回来恢复，回话写明改后的显示名与用到的系统。
- 参数不合格、取不到全局根目录、项目内模式（不支持，不往项目仓库写）、写文件失败时回一句原因并注明「没有写入」。

### 体检与演练：`mcp__xiaoxiaoli__guide`

只在你要走演练时调：设置引导里问过并同意、点了「[ 走一遍演练 ]」、输入 `/xiaoxiaoli tour`，或说「带我走一遍」。演练还没处理过时放在提示词的工具列表里，走过或选过不用的放在 ToolSearch 后面（引导与 tour 发的那段话都带了 ToolSearch 的提示）。

- `action: "start"`：放演示条目（已有的重置）并返回演练脚本，见「体检与演练」。演练脚本不能用、还没定下项目、状态文件读不懂或写失败时回一句原因，不建演示条目；依赖清单不能用时照常开始，脚本里说明跳过体检。
- `action: "check"`：必填 `results`（`{ 依赖 id: "ok" | "missing" | "skipped" }`，对象或它的 JSON 文字），写全局根目录下的 `env.json`，回一句：写到哪、就绪几项、缺哪些、跳过哪些、丢掉了哪些 id。依赖清单不能用、没有可记的结果、取不到全局根目录、`env.json` 版本比本 mod 新、写失败时回一句原因并注明「没有写入」。
- `action: "finish"`：可选 `summary`（一两句小结）。移除演示条目（没有就不用清），在 `profile.json` 记 `tour: "done"` 与 `tourAt`（带了小结存 `tourSummary`）；两件都没做成才拒绝，做成一件就照实回、另一件的原因写在后面。

## 待办怎么拉

每个项目：`get_todo` 拉 story / task / bug 各至多 50 条 → `get_stories_or_tasks`、`get_bug` 按 ID 补优先级、预计开始与结束、`story_id`、`iteration_id` → `get_workflows_status_map` 把需求、缺陷的状态码换成中文名（任务本地翻译）；本项目视图另调 `get_iterations`。补字段失败时按待办自带字段显示。待办整轮失败（多半是会话刚启动 TAPD MCP 还没连上）按 5、15、30 秒各自动重试一次，标题行显示「正在连接 TAPD，第 n 次重试」；三次都失败才显示「拉取失败（…），点刷新重试」，点刷新立即重拉。迭代没拉到时迭代行写「本迭代（迭代未加载，暂显示全部）」，这时列表其实没按迭代筛、显示的是全部；只有迭代没拉到时待办照常显示，迭代同样按 5、15、30 秒重试，标题行不提示重试也不报拉取失败。需求、任务、缺陷三组各自排序：有预计开始或结束的在前，按预计开始、预计结束、优先级；没有时间的在后，按优先级（High > Middle > Low > Nice To Have > 其他，缺陷的 urgent/high/medium/low/insignificant 并入同档）、ID。任务缩进挂在所属需求下，父需求不在列表的任务排在需求之后，缺陷最后。迭代筛选只作用于需求与任务，任务没有迭代时跟随父需求。行内 ID 是短 ID，确认按钮和发出的开工消息用 TAPD 长 ID。

## 自动更新

每台机器上，每天第一次在交互式会话里打开 Claude Code 时（会话启动后约 10 秒，不挡启动、排在首次引导之后），工作台去 GitHub 看一眼有没有新版。陪伴猫小黎用的是同一份逻辑（`hooks/update.ts` 两边相同），各查各的。

1. 依次读 `https://raw.githubusercontent.com/xiaoli1999/xiaoli-mods/master/mods/xiaoxiaoli/.claude-plugin/plugin.json` 与 jsDelivr 镜像 `https://cdn.jsdelivr.net/gh/xiaoli1999/xiaoli-mods@master/mods/xiaoxiaoli/.claude-plugin/plugin.json` 里的版本号，第一个取到的为准。只认 `x.y.z` 这样的正式版本（可带 `v` 前缀，预发布与格式不对的不认），按段比数字（0.10.0 比 0.9.0 新），比本机 `plugin.json` 的新才算新版。有新版时同样从这两个地址读 `CHANGELOG.md`，截出「## <新版本>」那一节的前 5 条要点；取不到就只说版本号。
2. 插件市场安装的：等会话空闲（不在一轮对话中间，每 5 秒看一次，最多等约 1 小时，等不到就这次不更新），先运行 `claude plugin marketplace update xiaoli-mods` 刷新市场副本，再运行 `claude plugin update xiaoxiaoli@xiaoli-mods`。两条都成功才算更新上（更新命令说「已是最新」时，只有它说的版本不比远端旧才算，比如同一天另一个会话刚更新过）：提示「工作台已从 x 更新到 y」，对话里记一段更新要点，并经引擎的 `$.command.run` 发起一次内置的 `/reload-plugins`，新版马上生效（引擎的命令表里没有它时，提示你输入 `/reload-plugins` 或下次开会话自动生效）。失败时提示原因与手动更新的两条命令，不影响继续使用，当天不算查过、下次开会话再试。
3. 本地目录加载的（`CLAUDE_CODE_PLUGIN_DIRS`、`--plugin-dir`）：不改任何文件、不运行命令，只提示有新版、到仓库目录 `git pull`。

细节：

- 什么时候查：全新启动、有人在终端前（`isInteractive` 为真、有绘制表面）的会话；热重载（`$.state` 里记着本会话已启动）、`claude -p`、SDK 不查。
- 一天一次：成功查过一次（不论有没有新版、本地目录加载的提示过、插件市场安装的更新成功）就把本地日期记进 `$.store` 的 `updateCheckedDay`，当天不再查；断网、两个地址都取不到、更新失败都不记，同一天下次开会话再试。
- 怎么判断是插件市场安装：插件市场装的插件被复制进 Claude Code 的插件缓存，插件目录（`$.plugin.root`）是 `<插件根>/cache/<市场名>/xiaoxiaoli/<版本>/`（插件根默认 `~/.claude/plugins`，可经 `CLAUDE_CODE_PLUGIN_CACHE_DIR` 换位置），市场名就取路径里那一段（拼进命令前只认字母、数字与 `. _ -`）；其余都按本地目录加载处理。
- 为什么先刷新市场：官方文档没写 `claude plugin update` 会不会先拉市场的新内容，先运行 `claude plugin marketplace update` 能保证拿到主分支上的新版。
- Windows 上 npm 装的 `claude` 是 `.cmd`，不经 shell 起不来：这时同一条命令改经 `cmd /c` 运行；macOS、Linux 不这样试。
- 和陪伴猫同时更新：两个 mod 经进程环境变量 `XIAOLI_MODS_UPDATING`（正在更新的 mod 名）错开，不同时跑 `claude plugin`；经 `XIAOLI_MODS_RELOAD_AT`（发起重载的时间）只发起一次 `/reload-plugins`，一次重载两个都生效。
- 不提供关闭开关（作者的决定）。Claude Code 自己的网络限制（组织的联网策略等）拦下请求时按取不到处理。
- 发版的人：只有 `plugin.json` 的 `version` 变了才算新版；`CHANGELOG.md` 每个版本一个「## <版本号>」小节，下面几条「- 」开头的要点。

## 安全边界

- TAPD 只调白名单里 `get_` 开头的只读工具（`TAPD_READ_TOOLS`），绑定也只读参与的项目列表；不调任何写工具，不建需求。记着不用 TAPD（`systems.tapd` 为 `false`）的项目一个都不调。
- 只挂自己工具的 `tool.call`（`progress`、`bind`、`setup`、`workflow`、`project`、`guide`），不挂 tool.check、PreToolUse；`classic.SessionStart` 只记下会话来源，照常交给后面的钩子，不改不拦。
- 不经你操作就往会话里发消息的只有首次自动发起这一次（条件见「首次自动发起」）；演练只在你点「[ 走一遍演练 ]」、输入 `/xiaoxiaoli tour` 或在设置引导里选「现在走」后才开始。
- 体检里的检查（看会话里有没有某个前缀的工具、运行 `git --version` 这类版本命令）与安装都是会话里的 AI 做，装任何全局工具、MCP、skill 前先问你（写在演练脚本里，由 AI 遵守）；mod 不执行 `detect` 与 `install` 里的命令。
- mod 自己运行的命令只有自动更新的两条：插件市场安装、发现新版时运行 `claude plugin marketplace update <市场名>` 与 `claude plugin update xiaoxiaoli@<市场名>`（Windows 上 `claude` 直接起不来时经 `cmd /c` 运行同样两条），每条最多 3 分钟；本地目录加载的不运行。更新成功后经 `$.command.run` 发起一次内置的 `/reload-plugins`。
- 只写当前项目自己的配置与状态文件，外加全局档案：项目内模式写项目内的 `state.json`；全局模式写 `~/.claude/xiaoxiaoli/projects/<项目键>/` 下的 `config.json`（仅绑定、解绑与项目工具 set 改显示名、systems 时）与 `state.json`，只有进度文件的老项目状态写项目内那份 `state.json`；生成新会话命令前通用资料目录 `shared/` 不在时写一份说明用途的 `shared/README.md`，不碰 `resources.md`、`secrets.env`；不分模式，起名、设工种、先不设、首次自动发起记标记、演练收尾与「[ 不用了 ]」时写全局根目录下的 `profile.json`（版本比本 mod 新时不写）；演练工具 check 时写全局根目录下的 `env.json`（版本比本 mod 新时不写）；演练工具 start、finish 时在当前项目的状态文件里加、去演示条目；AI 经工作流工具 set、reset 时写全局根目录下的 `workflow.json`（个人自定义）或全局项目目录下的 `workflow.json`（项目自定义，项目内模式没有，不写），版本比本 mod 新时不写。不往项目仓库里写任何新文件。
- 不读设置、不读密钥文件（含两处资料目录的 `secrets.env`、`resources.md`，项目工具只看它们在不在）；自动更新时读自己的 `plugin.json`。只读 `XIAOXIAOLI_PANE`、`XIAOXIAOLI_HOME`、`CLAUDE_CONFIG_DIR`、`USERPROFILE`、`HOME`、`XIAOLI_MODS_UPDATING`、`XIAOLI_MODS_RELOAD_AT` 这几个环境变量，只写 `XIAOXIAOLI_PANE` 与后两个（两个 mod 错开更新用，只在本进程内）。`$.store` 里除待办视图与迭代选择外，多记一个自动更新的日期 `updateCheckedDay`。
- 网络：mod 自己只发自动更新的请求，GET 两个公开地址（`raw.githubusercontent.com` 与 `cdn.jsdelivr.net` 上本仓库主分支的 `mods/xiaoxiaoli/.claude-plugin/plugin.json` 与 `CHANGELOG.md`），不带请求头、查询参数与任何用户或项目信息，每天最多一轮；另外通过会话里已连接的 `tapd` MCP 服务器只读访问 TAPD（见第一条）。面板收起时也在拉待办：会话启动后的首次拉取，以及按 `refreshMinutes`（默认 10 分钟）的定时拉取都照常进行。
- 日志：debug 日志记待办条数、项目数与错误类型；异常（`$.mcp.call` 自己抛出的、工具注册失败、刷新面板失败等）另记原始信息的前 200 字符；解析 TAPD 返回出错时只记错误类型，TAPD 返回的正文不进日志。生成启动命令时把整条命令打一行进对话，方便复制。

## 测试

```
claude plugin test <仓库>\mods\xiaoxiaoli
```

测试里的 TAPD、文件与环境变量全是造的，全局根目录经 `XIAOXIAOLI_HOME` 换成假路径，不碰真实用户目录；造的世界默认带一份已选「先不设」、演练已走过的 `profile.json`（`{ "version": 1, "skipped": true, "tour": "done" }`），测首次引导、首次自动发起与演练引导的用例显式换掉它；会话里的用户消息数、输入框草稿、是否交互式也都是造的。类型检查：引擎加载过一次 mod 后 `.claude-plugin/types/` 下有类型，`tsc -p <仓库>\mods\xiaoxiaoli`。那里的工具名清单是引擎保存 mod 时按已连接的工具生成的，新加的工具（`mcp__xiaoxiaoli__workflow`、`mcp__xiaoxiaoli__project`、`mcp__xiaoxiaoli__guide` 等）要等下次保存才进清单，所以代码里匹配 setup、workflow、project、guide 都用正则，测试里按宽松的入参调。造的世界也回答 `$.fs.exists`（按造的文件），并记下读过哪些文件，用来核对资料文件只看在不在、不读内容。

测试引擎没有真实文件系统、也不能导入 JSON，内置工作流的测试读 `tests/fixtures/workflows.ts` 里的逐字副本（造的世界也用它回答 `workflows/<工种>.json`）。改了 `workflows/*.json` 后在 mod 目录下重新生成并核对（命令里把换行统一成 `\n`：Windows 上 `core.autocrlf` 为 true 的检出里这些文件是 CRLF，仓库里存的是 LF）：

```
node -e "const fs=require('fs');const r=['frontend','backend','python','test','product','other'];const t=fs.readFileSync('tests/fixtures/workflows.ts','utf8');const head=t.slice(0,t.indexOf('export const'));fs.writeFileSync('tests/fixtures/workflows.ts',head+'export const BUILTIN_WORKFLOW_TEXTS: Record<WorkRole, string> = {\n'+r.map(i=>'    '+i+': '+JSON.stringify(fs.readFileSync('workflows/'+i+'.json','utf8').replace(/\r\n/g,'\n'))).join(',\n')+'\n}\n')"
```

体检依赖清单与演练脚本同理：测试读 `tests/fixtures/guide.ts` 里 `guide/deps.json`、`guide/tour.json` 的逐字副本（造的世界也用它回答这两个文件，`guides` 可改写或去掉）。改了 `guide/*.json` 后在 mod 目录下重新生成：

```
node -e "const fs=require('fs');const t=fs.readFileSync('tests/fixtures/guide.ts','utf8');const head=t.slice(0,t.indexOf('export const'));fs.writeFileSync('tests/fixtures/guide.ts',head+'export const GUIDE_TEXTS = {\n'+['deps','tour'].map(i=>'    '+i+': '+JSON.stringify(fs.readFileSync('guide/'+i+'.json','utf8').replace(/\r\n/g,'\n'))).join(',\n')+'\n}\n')"
```

自动更新的测试：`hooks/update.ts` 的纯函数与流程 `runUpdateCheck` 用造的外部能力直接测（插件市场安装的路径、命令、锁、重载都在这里测，因为测试引擎里的插件目录总是本地目录）；经会话启动的几条用造的 `http.fetch` 核对请求的地址与选项、一天一查、不查的情况。造的世界经 `manifest` 回答 mod 自己的 `.claude-plugin/plugin.json`，默认读不到（自动更新这次就不查）。`hooks/update.ts` 与陪伴猫里的同名文件是同一份，改一处要两边一起改。

演练相关的用例里写死了依赖清单的 id 顺序、各工种筛出来的项与几条演练文字，改了这两个文件后跟着改。

## 已知限制

- 靠轮询自动打开属于「未经请求」：终端不足 144 列时面板挂起不画并弹提示；`/xiaoxiaoli show` 任何宽度都能打开（小黎「干活」也会代跑它），打开过一次后门槛降到 110 列，手动关掉后恢复 144。你自己运行 `/xiaoxiaoli show` 仍没画出来时，只提示把终端拉宽后再试，不再建议运行 show。
- 面板底色若仍发灰来自引擎的 Pane，mod 没有设置任何背景色，Pane 的属性里也没有可关的底色。
- 点击面板后键盘可能归面板（引擎行为），按 Esc 回到输入框。
- 「点其他地方取消高亮」只覆盖面板内的点击。
- 点击只认行号，列偏移无影响。
- VS Code 与手机没有 Client，面板只读显示，不能点；这两处没绑定的项目只能让 AI 用 `mcp__xiaoxiaoli__bind` 绑定。
- 「会话忙」靠 turn.start / turn.complete 记，热重载正好落在一轮中间时会记成空闲。
- 进行中区的树用 `├─ └─ │`；终端若把这几个字符按 2 列画，长行末尾会被截掉，可把 `hooks/layout.ts` 的 `TREE_*` 换成 ASCII。
- 绑定列表只列 `get_user_participant_projects` 返回的项目；不在里面的项目绑不上。
- 面板上不显示当前工种与工作流来源（不占进行中任务的地方）；查看用 `/xiaoxiaoli role` 或问 AI。自定义工作流不合格的提示只在 toast（变了时一次）、`/xiaoxiaoli refresh` 的结果与工作流工具的 get 里。
- mod 不能删文件：工作流工具的 reset 把那一层清空成空文件，空文件等于没有自定义。
- 项目内模式不认工种与自定义工作流，沿用前端步骤；要按工种走，得用全局模式（项目里不放工作台 `config.json`）。
- 工作流里的细则（what、tools、output、ask、rules）只给 AI 看，按不按它走取决于 AI；面板只用 key、title、slow 与 branch。
- `systems` 里除 `tapd` 外的键 mod 不解释，用不用、跳不跳过哪些环节取决于 AI 读到概况后怎么做。
- 项目内模式不支持 `displayName` 与 `systems`（写在项目内 `config.json` 里也不认）。
- `--add-dir` 指向不存在的目录时 claude 怎么处理没法在这里确认，所以生成命令前先确保通用资料目录在（见「启动命令」）。项目资料目录（全局项目目录）在绑定后就有 `config.json`，一般都在。
- 启动命令只按路径选 PowerShell 或 bash/zsh：Windows 上用 Git Bash、WSL 等其他 shell 时仍是 PowerShell 写法；fish 等非 POSIX shell 不支持 bash 写法。bash 写法只在 Windows 的 Git Bash 下做过语法与引号拆分检查，没在真机 macOS / Linux、zsh 上跑过。
- 缺陷「重新打开」按两条判断：TAPD 返回的状态原值是 `reopened`，或状态中文名里带「重新打开」四个字。自定义工作流里的重新打开状态如果中文名不带这四个字，就认不出，这时已完成的缺陷不能从面板重新开工。
- 进度工具只收短 ID：状态文件里有不同 TAPD 项目撞了短 ID 的两条时，它改的是排在前面的那条。
- 面板标签标题（传给 `$.ui.open` 的那个）只有同时开着多个面板时才画出来；平时看到的是面板第一行自绘的标题。
- `/xiaoxiaoli setup` 的设置引导在命令结束后的下一拍才进会话（引擎不许命令钩子直接发消息）。
- 别的会话改了名，本会话的标题与前缀要等下一次刷新待办才跟上；首次引导的提示每个新会话还没设置时各弹一次。
- 首次自动发起「只发一次」靠写完重读档案认标记：两个会话在几毫秒内同时到点时仍可能都发出。会话启动后约 3 秒内 mod 恰好热重载，排着的自动发起可能随旧模块一起取消，这次会话就不发也不提示，下一次会话再来（标记没记）。
- 判断「恢复的会话」靠会话里的用户消息数与 classic SessionStart 的来源；`session.start` 本身不带来源。子代理不触发 `session.start`。
- 体检与带练的质量取决于 AI 按不按演练脚本走：mod 只给脚本、放演示条目、记结果，检查准不准、装没装对、有没有做写操作，mod 都管不到。
- 依赖清单里的安装命令是按约定写的，没有在每种环境里验证过，用之前要按团队实际核对（见「依赖清单」）。
- 体检结果不会自己更新：装好新工具、重开会话后要再走一遍演练（或让 AI 重新体检），面板上的缺项才会变。
- 演练工具放不放进工具列表只在会话启动时定：本会话里走完或选了「不用了」，要到下一个会话才挪到 ToolSearch 后面（同起名工具）。
- 中途关掉会话、没调 finish 时演示条目留在进行中区（这时面板不出演练引导）；再 start 会重置，finish 会清掉，也可以让 AI 用进度工具 `remove: true` 移除。
- 中途叫停也记成走过（finish 只记 `done`）；想再走用 `/xiaoxiaoli tour`。
- 演示条目绑在开始演练的会话上；在另一个会话里再 start 会把它重置并改记到那个会话。
- 自动更新只在会话启动后查一次：会话一直开着跨过 0 点不会再查，下次开会话才查。同一天几乎同时开的两个会话可能都去更新：后一个会被告知已是最新，括号里的版本不比远端旧就按更新成功提示。
- jsDelivr 镜像有缓存，可能比主分支晚一段时间；它只在 GitHub 原始地址取不到时才用。
- 判断插件市场安装靠插件目录在不在 `cache/<市场名>/xiaoxiaoli/<版本>/` 下；Claude Code 以后改了缓存的目录结构，就会被当成本地目录加载、只提示不更新。
- 自动发起的 `/reload-plugins` 会重新加载所有插件；官方文档写明重载会增删插件的 MCP 工具且让提示词缓存失效时不生效、要加 `--force`，这时按提示自己输入或重开会话。mod 不加 `--force`，免得替你作废缓存。
- `claude plugin update` 的成功输出官方文档没有写全，判断「更新上了」只看两条命令的退出码，与输出里「already at the latest version (<版本>)」这一句。
