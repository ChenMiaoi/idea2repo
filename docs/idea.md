# CCF-A Research Copilot 产品构想

我会先把这个 CCF-A 科研 agent 定义为面向计算机领域高水平论文产出的全流程助手，围绕服务对象、任务流、核心能力、数据/工具链、评测指标、技术架构和 MVP 路线来讨论。后续设计会先核对 CCF 推荐目录的权威最新信息，避免基于过期会议/期刊名单规划。

可以。我的建议是：不要把它做成“帮我写论文”的 agent，而是做成“面向 CCF-A 发表目标的科研项目经理 + 文献分析员 + 审稿人模拟器 + 实验管家”。这样更有价值，也更容易做出可靠产品。

先对齐一个事实背景：CCF 已在 2026 年 3 月 31 日发布第七版《中国计算机学会推荐国际学术会议和期刊目录》，目录仍分为 A/B/C 三类，并明确会议论文通常指 Full paper 或 Regular paper，Short paper、Demo、Workshop 等不按该目录口径计算。CCF 也特别说明该目录是推荐参考，不建议单位简单作为学术评价依据。

## 1. Agent 的核心定位

我建议命名为：

> CCF-A Research Copilot

它的目标不是“自动产出一篇 CCF-A”，而是帮助研究者完成以下闭环：

```text
选题 → 文献地图 → 创新点判断 → 实验方案 → 代码/实验管理 → 论文结构 → 审稿人模拟 → 投稿准备 → rebuttal 辅助
```

它的核心用户可以分三类：

| 用户 | 主要痛点 | Agent 价值 |
| --- | --- | --- |
| 博士生 / 硕士生 | 不知道什么题有机会中 A 会 | 帮助判断 novelty、相关工作、风险 |
| 导师 / PI | 难以快速跟踪多个方向 | 汇总学生项目进展、发现薄弱点 |
| 企业研究员 | 时间少、要求产出高 | 提供会议风格分析、实验 benchmark、投稿节奏管理 |

### 产品形态与平台约束

这个 agent 不应该只做成网页聊天框。它需要参考 OpenAI Codex CLI 与 Claude CLI 的公开可观察行为逻辑，尤其是：

- 面向本地工作区的 project-aware 交互；
- 计划、执行、校验、总结的循环；
- 对 shell、文件系统、Git、编辑 diff、长任务和上下文恢复的原生处理；
- 对敏感操作、外部可见操作、依赖安装和网络访问的明确确认机制；
- CLI 与未来 Web UI / 桌面 UI 之间保持一致的任务模型和 artifact 结构。

认证和计费也要作为一等产品能力设计：

- 支持用户原生登录 OpenAI 账号，而不是只支持 API key；
- 支持在官方允许的账号权限与使用限制下使用 ChatGPT Plus / Pro 订阅能力；
- 保留 API key、企业账号或自托管模型作为可选后端，但不能让它们成为唯一入口；
- 登录态、token、本地凭证和项目数据必须按平台安全规范存储，不能依赖脆弱的 cookie 抓取或非公开接口。

运行环境需要全平台通用：

- Windows
- Linux
- macOS

CLI、文件路径、shell 调用、依赖安装、浏览器登录、Git 集成和后台任务都要按跨平台约束设计，避免只在 macOS 或 Linux 上可用。

## 2. 功能模块

### A. CCF-A 目录与会议知识库

这是底座。Agent 应该知道：

- 哪些会议/期刊属于 CCF-A；
- 每个会议偏好的研究类型；
- 会议常见 track、deadline、投稿格式；
- 近几年 accepted paper 的主题趋势；
- 不同方向的代表性会议，例如 AI、DB、SE、Security、HCI、Theory、Graphics 等。

这个模块要动态更新，因为 CCF 目录、会议 deadline、投稿规则都会变。可以将 CCF 官方目录作为权威来源之一，并结合 DBLP、OpenReview、ACM/IEEE 页面、会议官网做更新。OpenAlex 提供 works、authors、sources、institutions、topics 等学术对象目录，适合做开放文献图谱；Semantic Scholar API 可检索 papers、authors、citations、venues 等信息，适合作为文献发现和引用网络分析来源。

### B. 文献雷达

这是第一个 MVP 级核心功能。

用户输入一个方向，例如：

- “LLM agent 的长期记忆机制”
- “图数据库上的 query optimization”
- “多模态 RAG 的 hallucination detection”

Agent 输出：

- 近 3-5 年 CCF-A 相关论文列表；
- 关键 paper cluster；
- 每个 cluster 的核心问题、方法套路、常用数据集；
- 哪些问题已经被做烂了；
- 哪些问题有空白；
- 可能投稿到哪些 CCF-A venue；
- 每篇论文的真实引用、链接、BibTeX、摘要，不允许假引用。

这部分的交互体验可以很强：用户不是看一堆论文，而是看一张“研究地形图”。

### C. 选题评估器

这是最有差异化的功能。

用户给一个 idea，Agent 从 CCF-A 视角评估：

| 维度 | 判断问题 |
| --- | --- |
| Novelty | 这个想法和已有 paper 的差别在哪里？ |
| Significance | 是否解决了一个重要问题？ |
| Technical depth | 技术贡献是否足够？ |
| Evaluation | 实验是否能支撑 claim？ |
| Venue fit | 更像 NeurIPS/ICLR/ICML，还是 SIGMOD/VLDB，还是 OSDI/SOSP，还是 USENIX Security？ |
| Risk | 审稿人最可能攻击哪里？ |
| 6 个月可行性 | 以当前资源能否完成？ |

我建议输出不要只是分数，而是：

- 强可投；
- 可投但需补强；
- 不建议作为主线；
- 适合改成 workshop 或短文。

以及最关键的：

> 为了达到 CCF-A 水平，你至少需要补哪 3 个证据。

### D. Related Work 生成与查重式对比

这不是简单写 related work，而是做：

- 自动按方法、任务、数据集、理论假设分组；
- 标出每篇论文和用户方法的差异；
- 生成 comparison matrix；
- 检查“你声称的创新点是否已被别人做过”；
- 为论文草稿生成 grounded citations。

这部分必须有强约束：

- 所有引用必须来自可追踪来源；
- 不能编造 paper、作者、年份、结论。

### E. 实验设计助手

这个模块应该回答：

> 我的 claim 需要什么实验才能说服 CCF-A 审稿人？

功能包括：

- 推荐 baseline；
- 推荐 dataset；
- 设计 ablation study；
- 设计 sensitivity analysis；
- 设计 efficiency/scalability 实验；
- 检查实验是否公平；
- 根据目标会议风格给出实验优先级。

例如做系统论文时，它会提醒你：只报 accuracy 不够，可能还需要 throughput、latency、memory、scalability、failure case。

做 AI 论文时，它会提醒你：只和弱 baseline 比不够，需要 SOTA、消融、鲁棒性、统计显著性、OOD 或泛化实验。

### F. 代码与实验管家

这是面向真正科研流程的功能。

Agent 可以帮助：

- 生成实验 checklist；
- 管理 experiment config；
- 记录每次实验结果；
- 自动做表格和图；
- 检查 random seed、数据泄漏、train/test split；
- 生成 reproducibility appendix；
- 从日志中发现异常；
- 对接 GitHub、Weights & Biases、MLflow、Slurm、Docker。

这部分建议先不要做全自动，而是做“半自动实验秘书”。可靠性比炫技更重要。

### G. 论文写作助手

它可以帮助写，但更重要的是帮助“结构化论证”。

功能可以包括：

- paper outline；
- abstract 多版本；
- contribution statement；
- intro 逻辑链；
- method section 清晰化；
- theorem/proof 检查；
- figure/table caption；
- reviewer-friendly rewriting；
- LaTeX 检查；
- camera-ready checklist。

这里要特别强调：它不应该替用户虚构实验结果，也不应该伪造引用。它可以润色、组织、检查逻辑，但论文责任仍然属于作者。

### H. 审稿人模拟器

这是我认为最有价值的模块之一。

它可以模拟不同类型审稿人：

| Reviewer 类型 | 关注点 |
| --- | --- |
| 理论型 | 定义、假设、证明严谨性 |
| 实验型 | baseline、公平性、统计显著性 |
| 系统型 | 可扩展性、工程复杂度、real-world impact |
| 挑刺型 | novelty 不足、claim 过大、related work 缺失 |
| 友好型 | 帮你发现怎么改会更强 |

输出形式最好像真实 review：

- Summary
- Strengths
- Weaknesses
- Questions
- Soundness
- Novelty
- Significance
- Reproducibility
- Confidence
- Borderline reason
- Required fixes before submission

更进一步，可以做：

> 如果我是 Area Chair，我会怎么综合这些 review？

### I. Rebuttal 辅助

投稿后，如果用户贴入 review，Agent 可以：

- 聚类 reviewer concerns；
- 找出必须回应的问题；
- 区分“能用文字解释解决”和“必须补实验解决”；
- 起草 rebuttal；
- 检查语气是否礼貌；
- 给出 rebuttal 风险评估；
- 帮助准备 appendix 或补充实验。

### J. 科研项目管理

适合长期使用。

功能包括：

- 每周 research progress summary；
- 论文 timeline；
- deadline 倒排计划；
- 任务拆解；
- 风险预警；
- 和导师/合作者的 meeting notes 整理；
- 自动生成下周 TODO；
- 记录每个 idea 的演化历史。

## 3. 推荐的功能优先级

我会这样排：

### MVP：先做 4 个功能

第一版不要太大，先做最能体现价值的闭环：

1. CCF-A venue / paper 知识库
2. 文献雷达
3. 选题评估器
4. 审稿人模拟器

这四个模块足以形成一个非常清晰的产品：

> 给我一个研究想法，我告诉你它离 CCF-A 还有多远，以及怎么补强。

### 第二版：加入写作和实验

- Related Work 对比矩阵
- 实验设计助手
- LaTeX / Overleaf 草稿助手
- rebuttal 辅助

### 第三版：变成完整科研操作系统

- 实验管家
- GitHub / W&B / MLflow / Slurm 集成
- 导师-学生协作看板
- 长期记忆和项目档案
- 多 agent 协作
