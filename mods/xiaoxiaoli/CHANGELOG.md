# 更新记录

AI 工作台的工作面板（插件 xiaoxiaoli）每个版本的更新要点，新的在上面。自动更新发现新版时，截取新版本那一节的前几条告诉用户。

## 0.10.0

### 发版工具

- 插件自带 Jenkins 发版工具 `tools/jenkins.mjs`，不用另装命令行工具：工作流的发版环节用它，默认只打印将触发的内容，你同意后 AI 才触发并等到结束；生产这类受保护的环境（`protected: true`）带 `--yes` 也不触发
- 发版配置 `release.json`（不含密钥）放项目资料目录，账号令牌由你自己填进 `secrets.env`；缺了不阻塞，AI 先跑只读的 `check` 告诉你缺什么、带你补，也可以说「这次我自己发」
- 发版环节补上提测：测试环境验收通过后按 TAPD 流程转待测试，并在条目上发【提测】评论 @ 测试负责人（他人条目先问）；演练会带你配一遍，`/xiaoxiaoli project` 多一行发版配置在不在

## 0.9.2

- 默认名改为「小黎」：没起名（含选过「先不设」）时叫「小黎AI工作台」，标题栏、提示前缀与 TAPD 评论署名跟着变；起过名的不受影响
- 以前在设置引导里选「保持默认」、档案里存着「小小黎」的，照常当作你起的名字，仍叫「小小黎AI工作台」；想换成新默认名运行 `/xiaoxiaoli name 小黎`，或 `/xiaoxiaoli setup` 选「恢复默认：小黎」
- 右侧那块统一叫「工作面板」：提示、命令与工具说明、设置引导、演练脚本、工作流说明与 README 里的「侧栏」「面板」「工作台面板」都改叫工作面板；整体仍叫「<名字>AI工作台」
- 内部标识不变：命令 `/xiaoxiaoli`、工具 `mcp__xiaoxiaoli__*`、插件名与目录、`~/.claude/xiaoxiaoli`、环境变量 `XIAOXIAOLI_HOME` 与 `XIAOXIAOLI_PANE` 都沿用旧名，已有的配置与进度不用迁移

## 0.9.1

- 提到陪伴猫的地方改叫「小克」：收起面板的提示、README 里与陪伴猫的联动说明等（猫的名字改回小克，命令是 `/xiaoke`）
- 体检清单新增 uv 一项（TAPD 的 MCP 服务器靠 uvx 启动）；演练的体检说明补上 Windows 上用 npx 启动的 MCP 要写成 `cmd /c npx`

## 0.9.0

- 可以从插件市场安装：`claude plugin marketplace add xiaoli1999/xiaoli-mods` 后装 `xiaoxiaoli@xiaoli-mods`
- 开发流程 skill 随工作台一起装，会话里叫 `xiaoxiaoli:xiaoli-workflow`，不用再单独复制
- 每天第一次开会话自动检查新版：插件市场安装的自动更新并重新加载插件，本地目录加载的提示 `git pull`
- 新增插件图标；README 补上自动更新、安全边界与目录结构

## 0.8.0

- 安装后体检与演练：设置引导里多问一步、面板「走一遍演练」或 `/xiaoxiaoli tour`，AI 检查本机已装的 MCP、skill 与命令行工具，再按你的工作流模拟走一遍
- 新增 `mcp__xiaoxiaoli__guide` 工具、面板上的演示条目，体检结果记在 `~/.claude/xiaoxiaoli/env.json`，缺的依赖显示在面板标题下
- 依赖清单 `guide/deps.json` 与演练脚本 `guide/tour.json` 可以直接编辑
- 前端工作流不再依赖个人技能 li-debug-with-chrome

## 0.7.0

- 通用资料目录 `~/.claude/xiaoxiaoli/shared/`：各项目通用的资料与测试账号配一次，项目只记差异
- 项目差异：显示名 `displayName` 与用到的系统 `systems`；记着不用 TAPD 的项目不列 TAPD 项目、不拉待办
- 新增 `mcp__xiaoxiaoli__project` 工具与 `/xiaoxiaoli project` 命令，查看本项目配置概况
- 开工消息与新会话启动命令同时给出通用与项目两处资料目录

## 0.6.0

- 按工种走不同的工作流：前端、后端、Python、测试、产品、其他六套内置，测试、产品、其他开工不建分支
- 工作流可按项目或个人自定义，经 `mcp__xiaoxiaoli__workflow` 查看与调整；`/xiaoxiaoli role` 改工种
- 新开工的条目按当时生效的工作流建步骤，进行中的条目不受影响

## 0.5.1

- 第一次在交互式会话里使用时自动发起一次设置引导，不用点也不用输命令（每台机器只自动一次）

## 0.5.0

- 工作台可以起名：面板标题、提示前缀、状态行与 TAPD 评论署名随之换
- 首次引导：面板最上方「开始设置」「先不设」，以及 `/xiaoxiaoli setup`、`/xiaoxiaoli name` 与 `mcp__xiaoxiaoli__setup` 工具

## 0.4.2

- 「全部项目」视图里别的 TAPD 项目的待办可以在当前仓库开工，条目按短 ID 与 TAPD 项目 ID 对应
- 已完成条目的重新开工规则：TAPD 上重新打开的缺陷可以重新开工，挂在需求下的任务可以重新做
- macOS、Linux 项目给 bash/zsh 的启动命令
- 取不到用户目录时如实说明，可设 `XIAOXIAOLI_HOME`

## 0.4.1

- 挂进行中的子项不再把已完成的步骤改回去
- 只有迭代没拉到时如实提示、待办照常显示；`/xiaoxiaoli refresh` 回复的条数与面板一致
- 写状态文件失败时提示原因、不开工；拼进启动命令的会话 ID 与短 ID 先校验
- 没记会话 ID 的旧条目归主工作区的会话

## 0.4.0 及更早

此前没有逐版记录，这里合并列出 0.4.1 修复之前已有的功能。

- 侧栏面板拉取并展示 TAPD 待办（需求、任务、缺陷，可按迭代筛、切换本项目与全部项目），点「开工」才开工
- 一条需求一个会话：本会话空闲才在本会话开工，否则给新会话（git worktree 加 claude）或回到已有会话的启动命令
- 进行中区按「步骤 → 任务 → 模块」三级显示进度，AI 用 `mcp__xiaoxiaoli__progress` 推进；沉浸模式只看进行中的任务
- 全局模式：没有工作台配置的项目落到 `~/.claude/xiaoxiaoli`，没绑定 TAPD 的项目在面板上点选一次（或让 AI 绑定）就记住
