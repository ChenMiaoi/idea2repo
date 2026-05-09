# Idea2Repo v0.1 产品规格

我会把需求收敛成 v0.1 规格：面向博士生，以一个 idea 生成一个可执行科研仓库为核心，并分别适配 AI/LLM Agent、安全、系统三类标准。接下来我会补上两个实现边界：CCF-A venue 不能硬编码，要做可更新数据库；评分也必须严格区分 Full/Regular 与 workshop、demo、short paper。

你的设定已经可以收敛成一个很强的 v0.1 产品了。我建议把它定义为：

> 面向博士生的 CCF-A 科研仓库生成型 Agent：输入一个 research idea，输出严格可行性诊断、相关工作差异分析、CCF-A 级别评分、修改后的执行方案，并自动生成一个包含 survey、references、实验工程和 paper 模板的科研仓库。

这个定位比“科研聊天助手”强很多，因为它把科研从一句 idea 直接推进到一个可执行 repo。

## 1. 第一版产品边界

你选的三个首发领域是：

- AI / LLM Agent
- 安全
- 系统

我建议不要把它们做成三个完全分离的大领域，而是做成三个 CCF-A 风格路由器：

| 路由 | 主要目标 | 典型目标 venue |
| --- | --- | --- |
| AI/LLM Agent 路由 | agent 方法、记忆、规划、工具使用、多智能体、评测 | NeurIPS, ICML, ICLR, ACL, AAAI |
| Security 路由 | agent security、LLM security、软件/系统安全、攻防评测、隐私、安全分析 | CCS, S&P, USENIX Security, NDSS |
| Systems 路由 | agent runtime、serving system、inference system、memory system、distributed agent infra | OSDI, SOSP, ASPLOS, EuroSys, USENIX ATC, NSDI, FAST |

CCF 第七版目录在 2026 年 3 月 31 日发布，目录调整涉及新增、升级、移除、降级和更名等变化；同时 CCF 明确说明该目录是推荐参考，并不建议单位简单作为学术评价依据。因此我们的 agent 应该把“CCF-A 标准”理解为顶会审稿强度与证据要求，而不是机械地承诺录用。

首批目标 venue 可以这样初始化：

- AI 方向覆盖 AAAI、NeurIPS、ACL、CVPR、ICCV、ICML、ICLR；
- 安全方向覆盖 CCS、S&P、USENIX Security、NDSS 等；
- 系统方向覆盖 PPoPP、FAST、HPCA、MICRO、SC、ASPLOS、EuroSys、USENIX ATC 等，并结合 OSDI、SOSP、NSDI 等系统/网络/系统软件 venue。

### CLI 行为、账号与平台边界

v0.1 的产品形态需要参考 OpenAI Codex CLI 与 Claude CLI 的公开可观察行为逻辑。重点不是复制界面，而是吸收成熟 CLI agent 的任务模型：

- project-aware：默认围绕当前仓库、Git 状态、文件 diff 和本地命令工作；
- loop-first：先理解目标，再计划、执行、校验、汇报；
- artifact-first：把报告、survey、reference、实验计划、paper skeleton 等落到仓库文件中；
- permission-aware：对登录、依赖安装、网络访问、删除文件、外部发布等操作明确确认；
- resumable：长期科研任务可以恢复上下文，继续推进同一个 idea repo。

账号能力需要成为第一版的底层设计，而不是后续补丁：

- 支持原生登录 OpenAI 账号；
- 支持在官方允许的账号权限、使用限制和风控约束下使用 ChatGPT Plus / Pro 订阅；
- 同时保留 API key、企业账号、代理网关或本地模型作为可选 provider；
- 不依赖脆弱的 cookie 抓取、私有接口或只适用于某个平台的登录流程；
- 登录凭证、token、项目数据和缓存必须按系统安全规范存储和隔离。

平台支持必须从 v0.1 开始按全平台设计：

| 平台 | 要求 |
| --- | --- |
| Windows | 支持 PowerShell / Git Bash 场景，路径、环境变量、子进程和浏览器登录不能假设 POSIX-only |
| Linux | 支持主流发行版、服务器/无头环境、容器和远程开发机 |
| macOS | 支持本地开发、Keychain 凭证存储和常见 shell 环境 |

这意味着 repo scaffold、脚本、Docker、Git 集成、后台任务、文件监听和浏览器登录都要避免平台特化假设。

## 2. 第一版核心卖点

我建议 v0.1 的一句话卖点是：

> 输入一个 research idea，agent 自动生成一个 CCF-A readiness repo：包含严格诊断报告、相关工作差异矩阵、可执行实验计划、评分、paper 模板、survey 文档、reference 文档和工程骨架。

这不是“给建议”，而是直接生成一个科研项目仓库。

更具体地说，用户输入：

> 我想做一个面向 LLM agents 的长期记忆压缩方法。目标是 CCF-A。我现在只有初步想法，没有实验。

Agent 输出：

```text
repo: llm-agent-memory-compression/
├── docs/
│   ├── diagnosis/
│   ├── survey/
│   ├── reference/
│   ├── execution_plan/
│   └── reviewer_simulation/
├── paper/
├── src/
├── experiments/
├── configs/
├── data/
├── results/
├── scripts/
├── docker/
└── README.md
```

并在仓库里自动生成：

- CCF-A 可行性诊断报告
- 相关工作优缺点分析
- 当前 idea 与已有工作的差异矩阵
- 严格 CCF-A 评分
- 修改后的更强 idea 版本
- 12 周或 16 周执行计划
- 实验路线图
- baseline / dataset / metric 建议
- paper LaTeX 模板
- README 和 `project.yaml`
- TODO / issue 列表
- 初始 bibliography
- 跨平台启动脚本和环境说明
- OpenAI 账号登录 / provider 配置占位

## 3. 关键产品逻辑：先打分，再修正，再生成计划

你的设定里有一个很重要的点：

> 输出可行性诊断报告，基于对应修改后的严格可行的执行方案。

这里我建议做成双阶段评分。

### 阶段 1：Raw Idea 评分

先对用户原始 idea 进行严格评估：

```text
Raw Idea Score: 58 / 100

结论：当前 idea 有潜力，但直接冲 CCF-A 风险很高。

主要问题：
1. novelty 不清楚
2. 没有明确 benchmark
3. 与 memory summarization / RAG / long-context work 边界模糊
4. 没有说明为什么这个问题对 agent 特别重要
```

### 阶段 2：Agent 修改后的 Research Plan 评分

Agent 不只是批评，而是生成一个更强、更可执行的版本：

```text
Revised Plan Score: 76 / 100

结论：如果按该计划完成实验，有机会作为 CCF-A submission，但仍需强 baseline 和真实 long-horizon agent benchmark。
```

也就是说，报告里永远有两套分数：

| 分数 | 含义 |
| --- | --- |
| Raw Idea Score | 原始 idea 当前质量 |
| Revised Plan Score | agent 修改后、按推荐执行方案完成时的潜力 |

这个设计非常适合博士生，因为它不是简单说“行/不行”，而是告诉他：

> 现在不够，但怎么改、怎么做、做到什么程度才可能够。

## 4. CCF-A 严格评分体系

我建议第一版使用 100 分制，但必须带 score cap 机制，否则模型容易过度乐观。

### 基础评分维度

| 维度 | 权重 | 解释 |
| --- | --- | --- |
| 问题重要性 | 10 | 是否解决真实、重要、被目标社区关心的问题 |
| Novelty / 差异性 | 20 | 与已有工作的实质区别是否清楚 |
| 技术深度 | 15 | 是否有方法、系统、理论或实验上的非平凡贡献 |
| 目标 venue 匹配度 | 10 | 更像 AI、安全、系统还是跨领域工作 |
| 实验可验证性 | 15 | 是否能设计出足以支撑 claim 的实验 |
| Baseline / dataset / metric 完整度 | 10 | 是否知道该和谁比、在哪比、怎么比 |
| 可执行性 | 10 | 博士生在 3-6 个月内是否能推进 |
| 工程与开源价值 | 5 | 是否有 repo、benchmark、tool、dataset 等产出 |
| 论文叙事潜力 | 5 | 是否能形成清楚的 paper story |

### Score Cap 机制

这个很关键。比如：

| 触发条件 | 最高分 |
| --- | --- |
| 找不到明确相关工作差异 | 60 |
| 没有可验证实验计划 | 65 |
| 只有工程集成，没有科研问题 | 55 |
| 没有 strong baseline | 70 |
| 安全方向没有 threat model | 60 |
| 系统方向没有性能/扩展性指标 | 65 |
| AI 方向没有 ablation / generalization 分析 | 70 |
| 相关工作检索不足，尤其缺少近两年 paper | 70 |

这样才能体现“严格 CCF-A 标准”。

## 5. 三个领域的差异化审稿标准

同一个 idea，投 AI、安全、系统时评分标准不同。这个 agent 必须有 domain-specific reviewer rubric。

### AI / LLM Agent 方向

重点检查：

- 是否只是 prompt engineering？
- 是否只是把现有 RAG / memory / planning 方法拼起来？
- 是否有新的 agent problem formulation？
- 是否有强 benchmark？
- 是否有 ablation？
- 是否和 long-context、RAG、memory summarization、tool-use baseline 比较？
- 是否证明对 long-horizon task 有帮助？

AI 方向的高分 idea 通常需要：

> 新问题定义 + 新方法 + 强实验 + 清楚失败案例 + 可复现 benchmark

### 安全方向

重点检查：

- threat model 是否清楚？
- attacker / defender capability 是否合理？
- 是否有真实世界安全意义？
- 是否只是 jailbreak demo？
- 是否有系统性评测？
- 是否有 ethical / responsible disclosure 处理？
- 是否有 false positive / false negative 分析？
- 是否能复现？

安全方向尤其要加一个安全合规 guardrail：可以支持防御、检测、评测、审计、复现性研究，但不能让 agent 自动生成现实攻击、恶意利用或绕过防护的操作链。

### 系统方向

重点检查：

- 是否有真实系统瓶颈？
- 是否有 prototype？
- 是否有 end-to-end evaluation？
- 是否有 throughput / latency / memory / scalability / cost 指标？
- 是否和已有系统 baseline 比？
- 是否有消融和微基准？
- 是否能解释为什么系统设计是必要的？

系统方向不能只写“我们做了一个 agent 平台”。必须能回答：

> 为什么这个系统设计解决了已有系统解决不了的问题？

## 6. 一个 idea 一个 repo：推荐仓库结构

我建议每个 idea 自动生成一个完整科研仓库：

```text
idea-repo/
├── README.md
├── project.yaml
├── docs/
│   ├── diagnosis/
│   │   ├── ccf_a_readiness_report.md
│   │   ├── raw_idea_score.md
│   │   ├── revised_plan_score.md
│   │   ├── risk_register.md
│   │   └── reviewer_simulation.md
│   ├── survey/
│   │   ├── survey.md
│   │   ├── paper_map.md
│   │   ├── topic_clusters.md
│   │   ├── trend_analysis.md
│   │   └── open_problems.md
│   ├── reference/
│   │   ├── references.bib
│   │   ├── related_work_matrix.csv
│   │   ├── claim_evidence_matrix.csv
│   │   ├── paper_notes/
│   │   └── pdfs/
│   ├── execution_plan/
│   │   ├── 12_week_plan.md
│   │   ├── milestones.md
│   │   ├── todo.md
│   │   ├── compute_budget.md
│   │   └── experiment_checklist.md
│   └── meeting/
│       ├── weekly_update_template.md
│       └── advisor_report.md
├── paper/
│   ├── main.tex
│   ├── sections/
│   │   ├── 00_abstract.tex
│   │   ├── 01_introduction.tex
│   │   ├── 02_related_work.tex
│   │   ├── 03_problem_formulation.tex
│   │   ├── 04_method.tex
│   │   ├── 05_experiments.tex
│   │   ├── 06_discussion.tex
│   │   └── 07_conclusion.tex
│   ├── figures/
│   ├── tables/
│   └── macros.tex
├── src/
│   ├── method/
│   ├── baselines/
│   ├── evaluation/
│   └── utils/
├── experiments/
│   ├── exp_001_baseline_reproduction/
│   ├── exp_002_main_result/
│   ├── exp_003_ablation/
│   ├── exp_004_scalability_or_robustness/
│   └── exp_005_failure_cases/
├── configs/
├── data/
│   ├── raw/
│   ├── processed/
│   └── README.md
├── results/
│   ├── logs/
│   ├── tables/
│   └── figures/
├── scripts/
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── .github/
│   ├── workflows/
│   └── ISSUE_TEMPLATE/
└── requirements.txt
```

这个结构体现你的核心想法：

> 一个 idea 不是一段文本，而是一个正在推进的科研项目。

## 7. 诊断报告结构

每次输入 idea 后，agent 应该生成一个主报告：

```text
docs/diagnosis/ccf_a_readiness_report.md
```

报告结构建议如下：

```markdown
# CCF-A Readiness Report

## 1. Executive Summary

- 一句话结论
- Raw Idea Score
- Revised Plan Score
- 推荐目标 venue
- 最大拒稿风险
- 最关键补强动作

## 2. Parsed Research Idea

- Problem
- Motivation
- Assumption
- Proposed Method
- Expected Contribution
- Target User / Scenario

## 3. Target Venue Routing

- AI / LLM Agent fit
- Security fit
- Systems fit
- 推荐主 venue
- 推荐备选 venue
- 不推荐 venue 及原因

## 4. Related Work Map

- Paper clusters
- 代表论文
- 每类工作的核心优点
- 每类工作的局限
- 与当前 idea 的关系

## 5. Difference Matrix

| Prior Work | What it does | Strength | Weakness | Difference from current idea | Collision Risk |
| --- | --- | --- | --- | --- | --- |

## 6. Novelty Diagnosis

- 真正可能的新意
- 疑似撞车点
- 需要进一步检索确认的问题
- novelty score

## 7. Feasibility Diagnosis

- 数据是否可得
- baseline 是否可复现
- compute 是否可承受
- 时间是否现实
- 工程难度

## 8. Revised Research Plan

- 修改后的 problem statement
- 修改后的 contribution
- 修改后的 method sketch
- 修改后的 experimental plan

## 9. CCF-A Scorecard

- Raw score
- Revised score
- 各项得分
- score cap 触发情况

## 10. Execution Plan

- 12 周计划
- 每周 deliverable
- 风险和 fallback

## 11. Paper Skeleton

- Title candidates
- Abstract skeleton
- Contribution bullets
- Section outline

## 12. Next Actions

- 今天可以做什么
- 本周必须完成什么
- 一个月后应该有什么结果
```

## 8. Related Work 分析

你提到“自动分析相关已有工作的优缺点，与当前 idea 的差别”，这个功能应该做成核心能力。

每篇 paper 至少抽取这些字段：

```yaml
paper_id:
title:
venue:
year:
authors:
main_problem:
core_method:
main_claim:
evidence:
datasets:
baselines:
metrics:
strengths:
weaknesses:
limitations:
relation_to_current_idea:
collision_risk:
useful_for:
bibtex:
```

然后生成：

```text
docs/reference/related_work_matrix.csv
docs/reference/claim_evidence_matrix.csv
docs/survey/paper_map.md
docs/survey/open_problems.md
```

其中最有价值的是 collision risk：

| 风险等级 | 含义 |
| --- | --- |
| High | 已有工作几乎已经做了同样的 idea |
| Medium | 方向接近，但问题设定或实验对象不同 |
| Low | 只是背景相关 |
| Opportunity | 该 work 暴露了一个可以利用的空白 |

博士生真正需要的不是“这篇论文讲了什么”，而是：

> 它会不会让我的 idea 失去新意？

## 9. 自动调用的 Skill 体系

你说“内含多种工程、开源项目、科研的 skill 自动调用”，我建议设计成下面这些技能。

### 科研类 Skill

| Skill | 功能 | 输出 |
| --- | --- | --- |
| `ccf_venue_router` | 判断 idea 属于 AI/安全/系统哪个 venue 风格 | target venue list |
| `paper_search` | 检索相关论文 | paper candidates |
| `paper_digest` | 解析 paper 的问题、方法、claim、实验 | structured notes |
| `survey_builder` | 生成 survey 和 topic cluster | `docs/survey` |
| `novelty_checker` | 检查 idea 与已有工作的差异 | novelty report |
| `reviewer_simulator` | 模拟 CCF-A reviewer | `reviewer_simulation.md` |
| `scorecard_generator` | 生成严格评分 | score report |

### 工程类 Skill

| Skill | 功能 | 输出 |
| --- | --- | --- |
| `repo_scaffolder` | 生成项目仓库结构 | repo |
| `env_builder` | 生成 Dockerfile / requirements | docker + env |
| `baseline_planner` | 推荐 baseline 和复现顺序 | experiments plan |
| `experiment_designer` | 设计主实验、消融、鲁棒性实验 | `experiment_checklist.md` |
| `result_logger` | 规范实验记录格式 | results schema |
| `github_issue_generator` | 自动生成 GitHub issues | TODO / issues |
| `license_checker` | 检查开源协议风险 | license report |

### 写作类 Skill

| Skill | 功能 | 输出 |
| --- | --- | --- |
| `paper_template_generator` | 根据 idea 生成 paper 模板 | `paper/main.tex` |
| `abstract_skeleton` | 生成 abstract 骨架 | abstract draft |
| `contribution_writer` | 生成 contribution bullets | intro skeleton |
| `related_work_writer` | 基于真实引用生成 related work 草稿 | `related_work.tex` |
| `claim_evidence_checker` | 检查论文 claim 是否有证据支撑 | claim-evidence report |

### 安全控制类 Skill

尤其安全方向必须有：

| Skill | 功能 |
| --- | --- |
| `dual_use_filter` | 判断是否涉及可滥用攻击细节 |
| `ethics_checker` | 检查数据、实验、披露是否合规 |
| `responsible_disclosure_planner` | 对安全漏洞类研究生成披露计划 |
| `red_team_scope_guard` | 限制 agent 不自动执行真实攻击链 |

## 10. Agent 工作流

我建议第一版不要做完全自由的 autonomous agent，而是做 workflow-first + agentic skills。

可以这样：

```text
User Idea
  ↓
Idea Parser
  ↓
Domain Router
  ├── AI/LLM Agent Reviewer
  ├── Security Reviewer
  └── Systems Reviewer
  ↓
Venue Router
  ↓
Literature Mining
  ↓
Related Work Matrix
  ↓
Novelty / Collision Checker
  ↓
Raw Idea Score
  ↓
Research Plan Rewriter
  ↓
Experiment Plan Generator
  ↓
Revised Plan Score
  ↓
Repo Scaffolder
  ↓
Paper Template Generator
  ↓
Final Report + GitHub Repo
```

OpenAI Agents SDK 适合这种 code-first agent 应用，因为它支持 agent 规划、工具调用、专家协作、状态保持、工具执行和审批流程；同时它有 tracing 能力，可以记录 LLM generation、tool call、handoff、guardrail 等事件，方便调试和评测。

如果你更想做明确的多步骤科研工作流，LangGraph 也适合，因为它把 workflow 和 agent 区分开：workflow 是预定路径，agent 是动态选择工具；科研 idea 诊断这种任务很适合先用 workflow 固定主流程，再在每一步内部调用工具。

我的建议是：

> v0.1 用固定 workflow，v0.2 再加入更多自主 agent 行为。

否则第一版容易变成“看起来很智能，但结果不可控”。

## 11. 数据存储设计

每个 idea repo 里要有一个核心配置文件：

```yaml
# project.yaml
project:
  name: llm-agent-memory-compression
  created_at: 2026-05-09
  owner: user
  stage: idea_diagnosis

idea:
  raw_text: ""
  parsed_problem: ""
  proposed_method: ""
  target_domain:
    - ai_llm_agent
    - systems
  target_venues:
    - ICLR
    - NeurIPS
    - OSDI

runtime:
  platforms:
    - windows
    - linux
    - macos
  cli_behavior_references:
    - openai_codex_cli
    - claude_cli
  auth:
    primary: openai_account_login
    supported_subscriptions:
      - plus
      - pro
    fallback_providers:
      - openai_api_key
      - enterprise_account
      - local_model

scores:
  raw_idea_score: 58
  revised_plan_score: 76
  score_caps:
    - missing_strong_baseline
    - novelty_uncertain

artifacts:
  diagnosis_report: docs/diagnosis/ccf_a_readiness_report.md
  survey: docs/survey/survey.md
  related_work_matrix: docs/reference/related_work_matrix.csv
  bibtex: docs/reference/references.bib
  execution_plan: docs/execution_plan/12_week_plan.md
  paper_template: paper/main.tex

status:
  next_action: reproduce_baseline
  current_week: 1
```

这样 agent 后续能继续接着推进这个 idea，而不是每次从零开始。

## 12. 第一版用户体验

博士生用户打开系统后，应该只看到一个很简单的入口：

```text
输入你的 research idea：
[文本框]

选择目标方向：
[ ] AI / LLM Agent
[ ] Security
[ ] Systems
[ ] 不确定，让 agent 判断

选择执行周期：
[ ] 8 周
[ ] 12 周
[ ] 16 周
[ ] 6 个月

选择资源：
[ ] 单人
[ ] 小组
[ ] 有 GPU
[ ] 无 GPU
[ ] 有真实数据
[ ] 无真实数据

登录方式：
[ ] OpenAI 账号登录
[ ] API key
[ ] 企业账号 / 代理网关
[ ] 本地模型

运行平台：
[ ] Windows
[ ] Linux
[ ] macOS

点击：[生成 CCF-A Readiness Repo]
```

输出页面给四个核心结果：

1. 你的 idea 当前得分：58 / 100
2. 修改后方案潜力得分：76 / 100
3. 最大风险：novelty 和 benchmark 不足
4. 已生成 repo：`llm-agent-memory-compression/`

然后用户可以进入 repo 页面看：

- 诊断报告
- survey
- reference
- 实验计划
- paper 模板
- TODO

## 13. Paper 模板生成策略

你说“自动生成一个 paper 模板，根据 idea 的”，这个功能要做，但必须注意：

> 生成的是论文骨架，不是伪造论文。

例如：

```tex
\section{Introduction}

% TODO: Explain why long-horizon LLM agents require persistent memory.
% TODO: Explain why existing memory summarization methods lose task-relevant information.
% TODO: State the core research gap.

\paragraph{Contributions.}
This paper makes the following contributions:
\begin{itemize}
    \item We formulate the problem of TODO.
    \item We propose TODO, a method that TODO.
    \item We evaluate TODO on TODO benchmarks against TODO baselines.
    \item We release TODO.
\end{itemize}
```

同时在 `paper/sections/02_related_work.tex` 里面只能写已有文献有证据的部分。实验结果、性能提升、显著性结论必须留空，不能编造。

## 14. v0.1 最小闭环

第一版不要做太多。最小闭环应该是：

```text
Idea 输入
  ↓
相关工作检索
  ↓
差异分析
  ↓
CCF-A 评分
  ↓
修改后的研究计划
  ↓
生成 repo
  ↓
生成 paper 模板
```

也就是只做一个核心任务：

> 把一个模糊 idea 变成一个可执行、可评估、可推进的 CCF-A research repo。

v0.1 暂时不要做：

- 自动跑完整实验
- 自动写完整论文
- 自动投稿
- 自动承诺录用
- 覆盖所有 CCF-A 领域

v0.1 必须做好：

- 严格诊断
- 相关工作差异分析
- 执行计划
- repo scaffold
- paper skeleton

## 15. 开发计划

### Phase 1：产品规格和评分标准，1 周

产出：

- 三个领域的 scoring rubric
- idea 输入 schema
- report schema
- repo template
- score cap 规则
- target venue 初始化表

重点是先把“严格 CCF-A”标准写死，否则后面 agent 会漂。

### Phase 2：文献与相关工作模块，2-3 周

产出：

- `paper_search` skill
- `paper_digest` skill
- related_work_matrix generator
- survey generator
- `references.bib` generator

第一版可以先用 API + web search + DBLP / Semantic Scholar / OpenAlex 等数据源。注意：所有 paper 必须真实存在，BibTeX 不能幻觉。

### Phase 3：诊断与评分模块，2 周

产出：

- raw idea diagnosis
- novelty checker
- feasibility checker
- CCF-A scorecard
- score cap logic
- reviewer simulator

这里建议做多 reviewer 结构：

```text
Reviewer 1: Novelty reviewer
Reviewer 2: Experiment reviewer
Reviewer 3: Domain reviewer
Reviewer 4: Skeptical CCF-A reviewer
Meta-reviewer: Area Chair style synthesis
```

### Phase 4：执行计划生成器，1-2 周

产出：

- revised research plan
- `12_week_plan.md`
- `milestones.md`
- `todo.md`
- `experiment_checklist.md`
- `compute_budget.md`

这个模块必须结合用户资源。比如博士生没有 GPU，就不能推荐需要 8 张 H100 的方案。

### Phase 5：repo 生成器，1 周

产出：

- repo_scaffolder
- `docs/survey`
- `docs/reference`
- `docs/diagnosis`
- paper template
- `src` / `experiments` / `configs` scaffold
- README
- `project.yaml`

这是你的产品差异化核心之一。

### Phase 6：Web UI + GitHub 集成，2-3 周

产出：

- idea 输入页面
- 诊断报告页面
- repo artifact viewer
- GitHub repo 创建
- GitHub issue 自动生成

GitHub 集成后，产品会从“报告生成器”变成“科研项目启动器”。

## 16. v0.1 PRD 摘要

可以直接这样写：

```text
产品名：CCF-A Research Repo Agent

目标用户：计算机方向博士生，尤其是刚开始选题、准备冲击 CCF-A 会议但缺乏顶会经验的学生。

首发领域：AI / LLM Agent、安全、系统。

核心输入：一个 research idea，加上目标方向、时间周期、资源约束。

运行形态：参考 OpenAI Codex CLI 与 Claude CLI 的行为逻辑，优先支持本地仓库感知、计划-执行-校验循环、artifact 落盘、权限确认和任务恢复。

账号能力：支持原生登录 OpenAI 账号，并在官方允许的权限和限制下使用 ChatGPT Plus / Pro 订阅；同时保留 API key、企业账号和本地模型作为可选 provider。

平台要求：Windows、Linux、macOS 全平台通用。

核心输出：一个完整科研仓库，包含：
1. CCF-A readiness report
2. raw idea score
3. revised plan score
4. related work matrix
5. survey
6. references
7. execution plan
8. experiment checklist
9. paper LaTeX skeleton
10. repo scaffold
11. cross-platform runtime notes
12. auth / provider config scaffold

核心卖点：把模糊 idea 转化为严格评估过、可执行、可追踪、可写论文的科研项目仓库。

核心约束：不伪造引用。不伪造实验结果。不承诺录用。安全方向不自动执行攻击性操作。不依赖非公开登录接口或单平台实现。
```

## 17. 最重要的产品判断

你的想法最强的地方不是“CCF-A 打分”，而是：

> 把 idea 变成 repo。

因为博士生真正缺的不是一个聊天建议，而是：

- 我现在该读哪些论文？
- 我的 idea 到底撞没撞？
- 我差哪些实验？
- 我应该先复现谁？
- 我 12 周内该怎么推进？
- 我怎么和导师汇报？
- 我的 paper 应该长什么样？

所以第一版的核心交付物应该不是聊天记录，而是：

> 一个可以被导师、合作者、未来自己持续打开和推进的科研仓库。

我建议 v0.1 的内部代号就叫：

> Idea2Repo

输入 idea，输出 CCF-A research repo。
