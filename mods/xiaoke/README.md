# 陪伴猫小黎（xiaoke）

小黎 mods 里的一个 Claude Code mod：一只像素小猫趴在输入框上方，实时围观 Claude 干活、点它互动；顺带显示主对话的模型与思考强度、token 与额度预估，定点提醒久坐和喝水，还会给提示词缓存保活。目录名沿用旧标识 `xiaoke`，命令是 `/xiaoli`（旧命令 `/xiaoke` 同效）。

## 安装

插件市场（推荐，装好后每天自动更新，见「自动更新」）：

```
claude plugin marketplace add xiaoli1999/xiaoli-mods
claude plugin install xiaoke@xiaoli-mods
```

在会话里也可以一步装好（Claude Code 2.1.275 及以后）：

```
/plugin install xiaoke --marketplace xiaoli1999/xiaoli-mods
```

装好后重开会话，或在会话里输入 `/reload-plugins`。

开发者本地加载：把本目录的绝对路径追加进环境变量 `CLAUDE_CODE_PLUGIN_DIRS`（Windows 用 `;` 分隔）后重开 Claude Code。这样加载的不自动更新，在仓库目录 `git pull` 即可；改了文件会热重载。同一个 mod 只装一份，不要插件市场和本地目录同时装。

## 两种模式

- 工作模式（默认）：只有 2 行，左边是缩小的小黎，右边第 1 行是它说的话（弱化），第 2 行是状态与指标（已工作多久、在做什么、下一轮预估等）。没有按钮，不挡视线。
- 放松模式：点小黎本身展开，它放大到 4 行高，下面一排按钮与状态胶囊。放松模式里再点小黎就是摸头。

`/xiaoli`（不带参数）在两种模式间切换，跨会话记住。

放松模式的按钮：

| 按钮 | 作用 |
| --- | --- |
| 干活 / 收工 | 开关小小黎 AI 工作台的侧栏：按「干活」把环境变量 `XIAOXIAOLI_PANE` 设成 `show` 并运行 `/xiaoxiaoli show`，变成「收工」；再按设成 `hide`。工作台那边改了这个变量，这里下一秒跟上 |
| 摸摸头、喂饼干、夸夸我 | 互动：小黎换表情说一句；摸头好感加 1、喂饼干加 2，「状态」卡片里看好感、认识第几天、一起完成几轮 |
| 悄悄话 | 让小黎看着你此刻的状态说一句：调一次 haiku，花费显示在状态卡片里 |
| 安静一会 | 切换安静模式（同 `/xiaoli quiet`） |
| 收起 | 回到工作模式 |

状态胶囊（状态、模型、额度、上下文、预估、提醒、保活）点一下展开对应的卡片，再点收起，点别的切换，20 秒没再点自动收起。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/xiaoli` | 切换工作 / 放松模式 |
| `/xiaoli rest` | 休息 2 分钟：强制展开成提醒框，到点自动收起 |
| `/xiaoli quiet`、`quiet on`、`quiet off` | 切换或开关安静模式：小黎不说话，定点提醒不弹 |
| `/xiaoli ai on`、`ai off` | 开关每轮结束时的自动台词（见「台词与悄悄话」）；不影响悄悄话 |
| `/xiaoli keep`、`keep on`、`keep off` | 看保活状态、开关缓存保活 |
| `/xiaoli keep max <小时>`、`keep max off` | 设或取消保活上限（1 到 72 的整数小时） |
| `/xiaoli calibrate` | 开关点击校准模式：先点 [A] 中间的 A，再点 [B] 中间的 B，校准完自动退出；用于中文按列数上报不准、点不准的终端 |
| `/xiaoli hide`、`show` | 藏起来、叫出来；只有 `show` 能让藏起来的小黎出来 |

打错的参数只回用法，不改任何设置。`/xiaoke` 与 `/xiaoli` 完全相同。

## 定点提醒

- 10、12、16、18 点提醒久坐，11、15、17 点提醒喝水，按本地时间。
- 强提醒 3 分钟：带子展开成醒目的提醒框，倒计时结束前收不回去；完成按钮前 1 分钟锁着，之后可以提前结束。同时按你自己的通知设置发一条终端通知（系统通知或响铃），发不出去也不影响提醒框。
- 到点时最近 30 分钟没动静（没打字、没对话、没点小黎）就先不弹，这个小时内回来了再补。
- 同一个整点多个会话只提醒一次（记在 `$.store`）；别的会话刚弹过、还在 3 分钟里的，这边也一起亮。
- 安静模式下不弹。

## 额度与上下文提醒

- 任一额度窗口（如 5 小时、7 天）用到 80% 及以上时 toast 提醒一次；同一个窗口只提醒一次，记在 `$.store`，多个会话、热重载都不重复，换了新窗口再提醒。没给重置时间的窗口，记录 5 小时后作废。
- 上下文用到 80% 及以上时本会话提醒一次，降回 50% 以下后再重新算。
- 安静模式下照常提醒。

## 缓存保活

默认开着。主对话最后一次请求后 50 分钟还没有新请求，就用 `$.model.fork` 旁路请求一次（不进对话历史），读一遍主对话的提示词缓存，把缓存的寿命续上。

- 距上次请求已超过 58 分钟（电脑睡过或卡住）就不发了，缓存来不及保。
- 失败后 3 分钟重试一次，再失败停下；读到的缓存不到这次输入的一半时判定缓存已失效，停下。停下后下次对话或 `/xiaoli keep on` 恢复。
- 默认不设上限，只要会话开着、保活开着就一直保活到会话关闭；`/xiaoli keep max <小时>` 设上限后，连续这么多小时没有真实对话就停（跨会话记住）。
- 每次保活会花一次请求的 token（主要是读缓存），次数与用量在「保活」卡片里。不想花就 `/xiaoli keep off`。
- 安静模式下保活成功不弹 toast，失败与停下照常弹。

## 台词与悄悄话

- 每轮开始时的回应是模板句（引用你问题的开头），不花 token。
- 每轮结束时（这一轮用了工具，或回答至少 40 个字，且没有中途打断），让 haiku 结合这一轮实际发生的事说一句；两次至少隔 20 秒。`/xiaoli ai off` 关掉这一项。
- 「悄悄话」是你主动点的，`ai off` 时照样调用一次；安静模式下不调模型，直接回一句固定的话。
- 累计调用次数与 token 在「状态」卡片里。

## 自动更新

每台机器上，每天第一次在交互式会话里打开 Claude Code 时（会话启动后约 10 秒，不挡启动），小黎去 GitHub 看一眼有没有新版：

1. 依次读 `https://raw.githubusercontent.com/xiaoli1999/xiaoli-mods/master/mods/xiaoke/.claude-plugin/plugin.json` 与 jsDelivr 镜像 `https://cdn.jsdelivr.net/gh/xiaoli1999/xiaoli-mods@master/mods/xiaoke/.claude-plugin/plugin.json` 里的版本号，只认 `x.y.z` 这样的正式版本，比自己新才算新版。有新版时同样从这两个地址读 `CHANGELOG.md`，截出新版本那一节的前几条要点。
2. 插件市场安装的：等会话空闲（不在一轮对话中间），先运行 `claude plugin marketplace update xiaoli-mods` 刷新市场副本，再运行 `claude plugin update xiaoke@xiaoli-mods`。成功后提示「已从 x 更新到 y」与更新要点，并自动发起一次 `/reload-plugins` 让新版马上生效（没生效就自己输入 `/reload-plugins`，或下次开会话自动生效）。失败时提示原因与手动更新的命令，不影响继续使用，下次开会话再试。
3. 本地目录加载的（`CLAUDE_CODE_PLUGIN_DIRS` 等）：不改任何文件，只提示有新版、到仓库目录 `git pull`。

细节：

- 成功查过一次（不论有没有新版）当天就不再查，日期记在 `$.store` 的 `updateCheckedDay`；断网等取不到的情况不记，同一天下次开会话再试。`claude -p`、SDK 等非交互式会话与热重载不查。
- 怎么判断是插件市场安装：插件目录在 Claude Code 的插件缓存里，即 `<插件根>/cache/<市场名>/xiaoke/<版本>/`（插件根默认 `~/.claude/plugins`），市场名就取这一段；其余都按本地目录加载处理。
- 和小小黎 AI 工作台同时更新时，两个 mod 经进程环境变量 `XIAOLI_MODS_UPDATING` 错开，经 `XIAOLI_MODS_RELOAD_AT` 只重载一次。
- 不提供关闭开关。Claude Code 自己的网络限制（如组织的联网策略）拦下请求时按取不到处理。

## 安全边界

- 联网：只有自动更新会 GET 上面两个公开地址（GitHub 原始文件与 jsDelivr 镜像），不带请求头、查询参数与任何用户或项目信息。模型请求（台词、悄悄话、保活）走引擎的模型接口。
- 运行命令：只有插件市场安装、发现新版时运行 `claude plugin marketplace update <市场名>` 与 `claude plugin update xiaoke@<市场名>` 两条（Windows 上 `claude` 直接起不来时经 `cmd /c` 运行同样两条）。
- 花 token 的只有三处：每轮结束的自动台词与悄悄话（haiku）、缓存保活（读主对话缓存），前者 `/xiaoli ai off`、后者 `/xiaoli keep off` 可关（悄悄话只在你点时调用）。
- 读：会话的用量与模型（`$.session.usage`、`$.session.model`），合并后的设置里只取 `effortLevel`（还没发过请求时显示的思考强度），环境变量 `XIAOXIAOLI_PANE` 与两个更新锁；自动更新时读自己的 `plugin.json`。不读密钥文件。
- 写：`$.store`（档案、偏好、今天的开工时间、提醒记录、额度提醒记录、点击校准、自动更新日期），环境变量 `XIAOXIAOLI_PANE`、`XIAOLI_MODS_UPDATING`、`XIAOLI_MODS_RELOAD_AT`；不写任何文件。
- 代跑的命令：按「干活」时 `/xiaoxiaoli show`，自动更新成功后 `/reload-plugins`。

## 测试

```
claude plugin test <仓库>\mods\xiaoke
```

测试里的时钟、存储、网络与命令全是造的，不真的联网、不运行 `claude`。`hooks/update.ts` 与小小黎 AI 工作台里的同名文件是同一份，改一处要两边一起改。
