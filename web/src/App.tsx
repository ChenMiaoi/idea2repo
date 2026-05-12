import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileCode2,
  GitPullRequestDraft,
  KeyRound,
  Loader2,
  Lock,
  Network,
  Play,
  RefreshCcw,
  Search,
  Send,
  Terminal,
  UploadCloud,
  WifiOff
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  artifacts,
  boardColumns,
  initialLiterature,
  initialRoutes,
  initialRunLog,
  navItems,
  providerServices
} from "./data";
import { getApiBase, getJson, postJson, subscribeRunEvents, type RuntimeEventSubscription, type RuntimeRunListResponse, type RuntimeRunStartResponse } from "./api";
import { applyRuntimeEvent, createRuntimeView, disconnectRuntimeView } from "./runtime";
import type {
  ArtifactNode,
  BoardColumn,
  LiteratureRecord,
  PermissionKey,
  PermissionState,
  RouteScore,
  RunLogEntry,
  RuntimeEvent,
  RuntimeRunSummary,
  RuntimeViewState
} from "./types";

const defaultIdea =
  "A local-first research agent that verifies literature, gates CCF-A readiness on evidence, and generates reproducible experiment repositories.";

const permissionLabels: Record<PermissionKey, string> = {
  localFirst: "local-first",
  write: "write",
  network: "network",
  install: "install",
  publish: "publish"
};

const permissionDescriptions: Record<PermissionKey, string> = {
  localFirst: "Never send data unless an operation asks for it.",
  write: "Allow writing generated artifacts to the selected workspace.",
  network: "Allow literature search against no-key public sources.",
  install: "Allow dependency installation for generated repos.",
  publish: "Allow external publish actions. Dry-run remains default."
};

export function App() {
  const [idea, setIdea] = useState(defaultIdea);
  const [domain, setDomain] = useState("AI / LLM Agent");
  const [weeks, setWeeks] = useState("12");
  const [stack, setStack] = useState<"python" | "ts">("python");
  const [permissions, setPermissions] = useState<PermissionState>({
    localFirst: true,
    write: true,
    network: false,
    install: false,
    publish: false
  });
  const [routes, setRoutes] = useState(initialRoutes);
  const [literature, setLiterature] = useState(initialLiterature);
  const [columns, setColumns] = useState(boardColumns);
  const [selectedArtifact, setSelectedArtifact] = useState(artifacts[1]);
  const [filter, setFilter] = useState("verified");
  const [runLog, setRunLog] = useState(initialRunLog);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [providerMode, setProviderMode] = useState("offline");
  const [draftIssues, setDraftIssues] = useState(7);
  const [apiStatus, setApiStatus] = useState<"idle" | "syncing" | "error" | "ok">("idle");
  const [runtimeView, setRuntimeView] = useState<RuntimeViewState | null>(null);
  const [runtimeRuns, setRuntimeRuns] = useState<RuntimeRunSummary[]>([]);
  const runtimeSubscription = useRef<RuntimeEventSubscription | null>(null);

  const selectedPapers = literature.filter((record) => record.selected).length;
  const gateReady = selectedPapers >= 3 && routes[0].gate !== "blocked";
  const apiBase = getApiBase();

  const scoredRoutes = useMemo(() => {
    const evidenceBoost = Math.min(selectedPapers * 2, 8);
    return routes.map((route, index) => ({
      ...route,
      score: index === 0 ? Math.min(route.score + evidenceBoost, 92) : route.score
    }));
  }, [routes, selectedPapers]);

  useEffect(() => {
    if (!apiBase) return;
    let cancelled = false;
    void getJson<RuntimeRunListResponse>("/runs").then((response) => {
      if (!cancelled && response.ok) setRuntimeRuns(response.data.runs);
    });
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  useEffect(() => {
    return () => runtimeSubscription.current?.close();
  }, []);

  function appendLog(label: string, tone: RunLogEntry["tone"] = "ok") {
    const time = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    setRunLog((entries) => [{ time, label, tone }, ...entries].slice(0, 5));
  }

  async function handleGenerate() {
    setApiStatus(apiBase ? "syncing" : "idle");
    const body = {
      idea,
      output: "generated_repos/idea2repo-project",
      domains: [domain],
      weeks: Number(weeks),
      stack,
      force: false,
      offline: providerMode === "offline",
      provider: providerMode === "offline" ? "offline" : null,
      run_research_pipeline: true,
      jsonl_events: true,
      allow_network: permissions.network
    };
    if (apiBase) {
      const response = await postJson<RuntimeRunStartResponse>("/runs", body);
      setApiStatus(response.ok ? "ok" : "error");
      if (!response.ok) {
        appendLog(response.error, "blocked");
        return;
      }
      const view = createRuntimeView(response.data);
      setRuntimeView(view);
      setRuntimeRuns((runs) => upsertRun(runs, {
        id: response.data.run_id,
        status: response.data.status,
        idea,
        output_root: response.data.output_root,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      runtimeSubscription.current?.close();
      runtimeSubscription.current = subscribeRunEvents(response.data.run_id, {
        onEvent: handleRuntimeEvent,
        onError: (message) => {
          setApiStatus("error");
          setRuntimeView((current) => (current ? disconnectRuntimeView(current, message) : current));
          appendLog(message, "blocked");
        }
      });
      appendLog(`Started runtime run ${response.data.run_id.slice(0, 8)}`, "ok");
      return;
    }
    setRoutes((items) =>
      items.map((item, index) =>
        index === 0
          ? { ...item, progress: Math.min(item.progress + 12, 96), gate: gateReady ? "ready" : "warning" }
          : item
      )
    );
    appendLog("Generated local plan preview without backend", "ok");
  }

  function handleRuntimeEvent(event: RuntimeEvent) {
    setRuntimeView((current) => (current ? applyRuntimeEvent(current, event) : current));
    setRuntimeRuns((runs) => updateRunStatus(runs, event));
    const label = runtimeEventLabel(event);
    if (label) appendLog(label, runtimeEventTone(event));
    if (event.type === "run.completed") setApiStatus("ok");
    if (event.type === "run.failed" || event.type === "run.cancelled") setApiStatus(event.type === "run.failed" ? "error" : "ok");
    if (event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled") {
      runtimeSubscription.current = null;
      setRuntimeView((current) => (current ? { ...current, connected: false } : current));
    }
  }

  async function handleCancelRun() {
    if (!runtimeView || !apiBase) return;
    const response = await postJson<{ run_id: string; status: RuntimeRunSummary["status"] }>(
      `/runs/${encodeURIComponent(runtimeView.runId)}/cancel`,
      { reason: "cancel requested from web dashboard" }
    );
    appendLog(response.ok ? `Cancel requested for ${response.data.run_id.slice(0, 8)}` : response.error, response.ok ? "warn" : "blocked");
    if (response.ok) {
      setRuntimeView((current) => (current ? { ...current, status: response.data.status } : current));
    }
  }

  function handleValidate() {
    if (!gateReady) {
      appendLog("Validation blocked: add one more selected verified paper", "warn");
      return;
    }
    setRoutes((items) => items.map((item, index) => (index === 0 ? { ...item, gate: "ready" } : item)));
    appendLog("Evidence gate ready for local validation", "ok");
  }

  function handleResume() {
    setColumns((items) =>
      items.map((column) =>
        column.title === "In Progress"
          ? { ...column, tasks: Array.from(new Set([...column.tasks, "Resume missing artifacts"])) }
          : column
      )
    );
    appendLog("Resume queued missing artifact check", "ok");
  }

  function togglePermission(key: PermissionKey) {
    if (key === "localFirst") {
      return;
    }
    setPermissions((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleLiterature(id: string) {
    setLiterature((items) =>
      items.map((record) => (record.id === id ? { ...record, selected: !record.selected } : record))
    );
  }

  function moveTask(columnTitle: string, task: string) {
    setColumns((items) => {
      const withoutTask = items.map((column) =>
        column.title === columnTitle
          ? { ...column, tasks: column.tasks.filter((candidate) => candidate !== task) }
          : column
      );
      return withoutTask.map((column) =>
        column.title === "Done"
          ? { ...column, tasks: Array.from(new Set([task, ...column.tasks])) }
          : column
      );
    });
    appendLog(`Moved task to Done: ${task}`, "ok");
  }

  function handleGithubDryRun() {
    setDraftIssues((count) => count + 1);
    appendLog("GitHub dry-run payload refreshed", permissions.publish ? "warn" : "blocked");
  }

  return (
    <div className="app-shell">
      <SideNav active={activeNav} onSelect={setActiveNav} />
      <main className="workspace">
        <TopBar
          gateReady={gateReady}
          apiStatus={apiStatus}
          apiBase={apiBase}
          providerMode={providerMode}
          onProviderMode={setProviderMode}
        />
        <section className="workspace-grid" aria-label="Idea2Repo workspace">
          <IdeaComposer
            idea={idea}
            setIdea={setIdea}
            domain={domain}
            setDomain={setDomain}
            weeks={weeks}
            setWeeks={setWeeks}
            stack={stack}
            setStack={setStack}
            permissions={permissions}
            onTogglePermission={togglePermission}
            onGenerate={handleGenerate}
            onValidate={handleValidate}
            onResume={handleResume}
          />
          <ScoreDashboard routes={scoredRoutes} gateReady={gateReady} selectedPapers={selectedPapers} />
          <RuntimeDashboard
            runtime={runtimeView}
            runs={runtimeRuns}
            apiBase={apiBase}
            onCancel={handleCancelRun}
          />
          <ArtifactViewer artifact={selectedArtifact} onSelect={setSelectedArtifact} />
          <LiteratureMatrix
            records={literature}
            filter={filter}
            setFilter={setFilter}
            onToggle={toggleLiterature}
            networkAllowed={permissions.network}
          />
          <ExecutionBoard columns={columns} onMoveTask={moveTask} />
          <ReviewAndRebuttal gateReady={gateReady} />
          <ProviderPanel
            providerMode={providerMode}
            setProviderMode={setProviderMode}
            permissions={permissions}
            runLog={runLog}
          />
          <GithubDryRun
            publishAllowed={permissions.publish}
            draftIssues={draftIssues}
            onRefresh={handleGithubDryRun}
          />
        </section>
      </main>
    </div>
  );
}

function SideNav({ active, onSelect }: { active: string; onSelect: (label: string) => void }) {
  return (
    <aside className="side-nav" aria-label="Main navigation">
      <div className="brand-mark">
        <FileCode2 size={20} aria-hidden="true" />
        <span>Idea2Repo</span>
      </div>
      <nav className="nav-stack">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              className={`nav-item ${active === item.label ? "is-active" : ""}`}
              onClick={() => onSelect(item.label)}
              type="button"
              aria-label={item.label}
              title={item.label}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="nav-footer">
        <Terminal size={17} aria-hidden="true" />
        <span>uv + npm local</span>
      </div>
    </aside>
  );
}

function TopBar({
  gateReady,
  apiStatus,
  apiBase,
  providerMode,
  onProviderMode
}: {
  gateReady: boolean;
  apiStatus: "idle" | "syncing" | "error" | "ok";
  apiBase: string;
  providerMode: string;
  onProviderMode: (mode: string) => void;
}) {
  return (
    <header className="top-bar">
      <div>
        <h1>Local research agent workspace</h1>
        <p>Generate, inspect, validate, and export reproducible research artifacts.</p>
      </div>
      <div className="top-actions">
        <StatusChip tone={gateReady ? "ok" : "warn"} label={gateReady ? "evidence ready" : "evidence blocked"} />
        <StatusChip
          tone={apiStatus === "error" ? "danger" : apiStatus === "ok" ? "ok" : "neutral"}
          label={apiBase ? `API ${apiStatus}` : "local demo"}
        />
        <label className="select-label">
          Provider
          <select value={providerMode} onChange={(event) => onProviderMode(event.target.value)}>
            <option value="offline">offline</option>
            <option value="openai_api_key">OpenAI API key</option>
            <option value="enterprise_gateway">enterprise gateway</option>
            <option value="local_model">local model</option>
          </select>
        </label>
      </div>
    </header>
  );
}

function IdeaComposer({
  idea,
  setIdea,
  domain,
  setDomain,
  weeks,
  setWeeks,
  stack,
  setStack,
  permissions,
  onTogglePermission,
  onGenerate,
  onValidate,
  onResume
}: {
  idea: string;
  setIdea: (value: string) => void;
  domain: string;
  setDomain: (value: string) => void;
  weeks: string;
  setWeeks: (value: string) => void;
  stack: "python" | "ts";
  setStack: (value: "python" | "ts") => void;
  permissions: PermissionState;
  onTogglePermission: (key: PermissionKey) => void;
  onGenerate: () => void;
  onValidate: () => void;
  onResume: () => void;
}) {
  return (
    <section className="panel composer-panel">
      <div className="panel-heading">
        <div>
          <h2>Idea form</h2>
          <p>Local request shape mirrors the CLI generate command.</p>
        </div>
        <StatusChip tone="ok" label="manifest aware" />
      </div>
      <label className="field-label">
        Research idea
        <textarea value={idea} onChange={(event) => setIdea(event.target.value)} />
      </label>
      <div className="form-grid">
        <label className="field-label">
          Domain
          <select value={domain} onChange={(event) => setDomain(event.target.value)}>
            <option>AI / LLM Agent</option>
            <option>Security</option>
            <option>Systems</option>
          </select>
        </label>
        <label className="field-label">
          Timeline
          <select value={weeks} onChange={(event) => setWeeks(event.target.value)}>
            <option value="8">8 weeks</option>
            <option value="12">12 weeks</option>
            <option value="16">16 weeks</option>
            <option value="24">24 weeks</option>
          </select>
        </label>
        <div className="field-label">
          Stack
          <div className="segmented-control" role="group" aria-label="Stack">
            <button
              className={stack === "python" ? "is-selected" : ""}
              type="button"
              onClick={() => setStack("python")}
            >
              Python/uv
            </button>
            <button
              className={stack === "ts" ? "is-selected" : ""}
              type="button"
              onClick={() => setStack("ts")}
            >
              TS/npm
            </button>
          </div>
        </div>
      </div>
      <div className="permission-grid">
        {(Object.keys(permissions) as PermissionKey[]).map((key) => (
          <button
            className={`permission-toggle ${permissions[key] ? "is-on" : ""}`}
            key={key}
            onClick={() => onTogglePermission(key)}
            type="button"
            aria-label={`Toggle ${permissionLabels[key]} permission`}
            title={permissionDescriptions[key]}
          >
            {permissions[key] ? <CheckCircle2 size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
            <span>{permissionLabels[key]}</span>
          </button>
        ))}
      </div>
      <div className="button-row">
        <CommandButton icon={Play} label="Generate" onClick={onGenerate} primary />
        <CommandButton icon={RefreshCcw} label="Resume" onClick={onResume} />
        <CommandButton icon={ClipboardCheck} label="Validate" onClick={onValidate} />
      </div>
    </section>
  );
}

function RuntimeDashboard({
  runtime,
  runs,
  apiBase,
  onCancel
}: {
  runtime: RuntimeViewState | null;
  runs: RuntimeRunSummary[];
  apiBase: string;
  onCancel: () => void;
}) {
  const activePlan = runtime?.plan ?? [];
  const activeEvents = runtime?.events.slice(-8).reverse() ?? [];
  const activeArtifacts = runtime?.artifacts.slice(0, 8) ?? [];
  const activeDecisions = runtime?.decisions.slice(-6).reverse() ?? [];
  const activeApprovals = runtime?.approvals.slice(-6).reverse() ?? [];
  const activePapers = runtime?.papers.slice(-6).reverse() ?? [];
  const activeEvidence = runtime?.evidence.slice(-6).reverse() ?? [];
  const activeQuestions = runtime?.questions.slice(-3).reverse() ?? [];
  const latestScore = runtime?.scores.at(-1);
  const canCancel = canCancelRuntimeStatus(runtime?.status);

  return (
    <section className="panel runtime-panel">
      <div className="panel-heading">
        <div>
          <h2>Runtime runs</h2>
          <p>Live plan, trace, artifacts, decisions, and approvals are streamed from /runs SSE.</p>
        </div>
        <StatusChip tone={!apiBase ? "neutral" : runtime?.connected === false ? "danger" : runtime ? statusTone(runtime.status) : "neutral"} label={!apiBase ? "demo" : runtime ? runtime.status : "idle"} />
      </div>
      <div className="runtime-summary">
        <div>
          <span>Active run</span>
          <strong>{runtime ? runtime.runId.slice(0, 8) : "none"}</strong>
          <small>{runtime?.outputRoot ?? "Start Generate with an API base to create a runtime run."}</small>
        </div>
        <CommandButton icon={AlertTriangle} label="Cancel" onClick={onCancel} disabled={!canCancel} />
      </div>
      {runtime?.error ? <div className="runtime-error">{runtime.error}</div> : null}
      <div className="runtime-grid">
        <RuntimeList title="Run list" empty="No API runs loaded." rows={runs.slice(0, 5).map((run) => `${run.id.slice(0, 8)}  ${run.status}  ${run.output_root}`)} />
        <RuntimeList title="Live plan" empty="Waiting for plan.updated." rows={activePlan.slice(0, 8).map((item) => `${planMark(item.status)} ${item.step}`)} />
        <RuntimeList title="Event timeline" empty="Waiting for SSE events." rows={activeEvents.map((event) => `${event.timestamp} ${event.type}`)} />
        <RuntimeList title="Papers" empty="No paper candidates yet." rows={activePapers.map((paper) => `${paper.title}${paper.venue ? ` (${paper.venue}${paper.year ? ` ${paper.year}` : ""})` : ""}${paper.pdf_status ? ` - ${paper.pdf_status}` : ""}`)} />
        <RuntimeList title="Evidence" empty="No extracted evidence yet." rows={activeEvidence.map((item) => `${item.paper_id} p.${item.page}: ${item.claim}`)} />
        <RuntimeList title="Score" empty="No score snapshot yet." rows={latestScore ? [`${latestScore.score}/${latestScore.max_score} confidence ${latestScore.confidence}`, ...latestScore.hard_blockers.slice(0, 3).map((blocker) => `Blocker: ${blocker}`)] : []} />
        <RuntimeList title="Questions" empty="No clarification questions yet." rows={activeQuestions.map((question) => `${question.required ? "[required] " : ""}${question.question}`)} />
        <RuntimeList title="Artifact tree" empty="No artifact events yet." rows={activeArtifacts.map((artifact) => `${artifact.text ? "[txt]" : "[bin]"} ${artifact.path} (${artifact.bytes})`)} />
        <RuntimeList title="Decision records" empty="No decisions yet." rows={activeDecisions.map((decision) => `${decision.title}${decision.stage_id ? ` (${decision.stage_id})` : ""}`)} />
        <RuntimeList title="Approval queue" empty="No approvals requested." rows={activeApprovals.map((approval) => `${approval.action}${approval.decision ? ` -> ${approval.decision}` : approval.risk ? ` [${approval.risk}]` : ""}`)} />
      </div>
    </section>
  );
}

function RuntimeList({ title, empty, rows }: { title: string; empty: string; rows: string[] }) {
  return (
    <div className="runtime-list">
      <h3>{title}</h3>
      {rows.length ? (
        rows.map((row, index) => <span key={`${title}-${index}`}>{row}</span>)
      ) : (
        <em>{empty}</em>
      )}
    </div>
  );
}

function ScoreDashboard({
  routes,
  gateReady,
  selectedPapers
}: {
  routes: RouteScore[];
  gateReady: boolean;
  selectedPapers: number;
}) {
  const primary = routes[0];
  return (
    <section className="panel score-panel">
      <div className="panel-heading">
        <div>
          <h2>Route and score</h2>
          <p>Raw score, revised potential, and evidence gate stay separate.</p>
        </div>
        <StatusChip tone={gateReady ? "ok" : "warn"} label={gateReady ? "ready" : "blocked"} />
      </div>
      <div className="score-hero">
        <div>
          <span className="metric-label">Primary route</span>
          <strong>{primary.route}</strong>
        </div>
        <div className="score-ring" aria-label={`Score ${primary.score}`}>
          <span>{primary.score}</span>
        </div>
      </div>
      <div className="metric-strip">
        <Metric label="Verified papers" value={`${selectedPapers}/5`} tone="green" />
        <Metric label="Novelty" value={`${Math.round(primary.novelty * 100)}%`} tone="blue" />
        <Metric label="Impact" value={`${Math.round(primary.impact * 100)}%`} tone="amber" />
      </div>
      <div className="route-list">
        {routes.map((route) => (
          <div className="route-row" key={route.id}>
            <div className="route-meta">
              <span>{route.id}</span>
              <strong>{route.route}</strong>
            </div>
            <div className="route-progress" aria-label={`${route.progress}% complete`}>
              <span style={{ width: `${route.progress}%` }} />
            </div>
            <StatusChip tone={route.gate === "blocked" ? "danger" : route.gate === "ready" ? "ok" : "warn"} label={route.gate} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ArtifactViewer({
  artifact,
  onSelect
}: {
  artifact: ArtifactNode;
  onSelect: (artifact: ArtifactNode) => void;
}) {
  return (
    <section className="panel artifact-panel">
      <div className="panel-heading">
        <div>
          <h2>Artifact viewer</h2>
          <p>Manifest state highlights clean, missing, and modified files.</p>
        </div>
        <StatusChip tone="neutral" label="89 files" />
      </div>
      <div className="artifact-layout">
        <div className="file-tree" role="list">
          {artifacts.map((node) => (
            <button
              key={node.path}
              className={`file-node ${artifact.path === node.path ? "is-selected" : ""}`}
              onClick={() => onSelect(node)}
              style={{ paddingLeft: `${12 + node.depth * 16}px` }}
              type="button"
            >
              <ChevronRight size={14} aria-hidden="true" />
              <span>{node.path}</span>
              <i className={`file-dot is-${node.status}`} />
            </button>
          ))}
        </div>
        <div className="artifact-preview">
          <div className="code-toolbar">
            <span>{artifact.path}</span>
            <StatusChip tone={artifact.status === "missing" ? "danger" : artifact.status === "modified" ? "warn" : "ok"} label={artifact.status} />
          </div>
          <pre>
{`# ${artifact.path}

status: ${artifact.status}
source: manifest
policy: preserve user edits
next: validate before publish`}
          </pre>
        </div>
      </div>
    </section>
  );
}

function LiteratureMatrix({
  records,
  filter,
  setFilter,
  onToggle,
  networkAllowed
}: {
  records: LiteratureRecord[];
  filter: string;
  setFilter: (value: string) => void;
  onToggle: (id: string) => void;
  networkAllowed: boolean;
}) {
  const visibleRecords = records.filter((record) => {
    if (filter === "verified") {
      return record.evidence !== "low";
    }
    if (filter === "selected") {
      return record.selected;
    }
    return true;
  });

  return (
    <section className="panel literature-panel">
      <div className="panel-heading">
        <div>
          <h2>Literature matrix</h2>
          <p>No-key sources only. Offline mode emits tasks instead of fake papers.</p>
        </div>
        <StatusChip tone={networkAllowed ? "ok" : "neutral"} label={networkAllowed ? "network on" : "offline"} />
      </div>
      <div className="toolbar-line">
        <div className="search-box">
          <Search size={16} aria-hidden="true" />
          <input aria-label="Search literature" placeholder="OpenAlex, DBLP, Crossref, arXiv" />
        </div>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Literature filter">
          <option value="verified">verified</option>
          <option value="selected">selected</option>
          <option value="all">all</option>
        </select>
      </div>
      <div className="matrix-table" role="table" aria-label="Literature records">
        <div className="matrix-row is-header" role="row">
          <span>Use</span>
          <span>Citation</span>
          <span>Evidence</span>
          <span>Relevance</span>
        </div>
        {visibleRecords.map((record) => (
          <button className="matrix-row" key={record.id} onClick={() => onToggle(record.id)} role="row" type="button">
            <span>{record.selected ? <CheckCircle2 size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}</span>
            <span>
              <strong>{record.citation}</strong>
              <small>{record.finding}</small>
            </span>
            <StatusChip tone={record.evidence === "high" ? "ok" : record.evidence === "medium" ? "warn" : "neutral"} label={record.evidence} />
            <span>{Math.round(record.relevance * 100)}%</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ExecutionBoard({
  columns,
  onMoveTask
}: {
  columns: BoardColumn[];
  onMoveTask: (column: string, task: string) => void;
}) {
  return (
    <section className="panel board-panel">
      <div className="panel-heading">
        <div>
          <h2>Execution board</h2>
          <p>Small goals stay atomic until reviewed, committed, and validated.</p>
        </div>
        <StatusChip tone="ok" label="13 goals" />
      </div>
      <div className="board-columns">
        {columns.map((column) => (
          <div className={`board-column is-${column.tone}`} key={column.title}>
            <div className="board-column-title">
              <span>{column.title}</span>
              <strong>{column.tasks.length}</strong>
            </div>
            {column.tasks.length ? (
              column.tasks.map((task) => (
                <button key={task} className="task-row" type="button" onClick={() => onMoveTask(column.title, task)}>
                  <span>{task}</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              ))
            ) : (
              <div className="empty-state">No blocked tasks</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewAndRebuttal({ gateReady }: { gateReady: boolean }) {
  return (
    <section className="panel review-panel">
      <div className="panel-heading">
        <div>
          <h2>Reviewer and rebuttal</h2>
          <p>Simulate critique before writing claims into the paper.</p>
        </div>
        <StatusChip tone={gateReady ? "ok" : "warn"} label={gateReady ? "evidence linked" : "needs evidence"} />
      </div>
      <div className="review-grid">
        <div className="review-card">
          <h3>Reviewer simulation</h3>
          <ul>
            <li>Novelty may collapse without recent verified papers.</li>
            <li>Baselines need reproduction order and metrics.</li>
            <li>Claim-evidence rows must map to artifacts.</li>
          </ul>
        </div>
        <div className="review-card">
          <h3>Rebuttal plan</h3>
          <ul>
            <li>Cluster concerns by novelty, soundness, and reproducibility.</li>
            <li>Separate text-only replies from new evidence work.</li>
            <li>Keep safety scope defensive for security ideas.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function ProviderPanel({
  providerMode,
  setProviderMode,
  permissions,
  runLog
}: {
  providerMode: string;
  setProviderMode: (mode: string) => void;
  permissions: PermissionState;
  runLog: RunLogEntry[];
}) {
  return (
    <section className="panel provider-panel">
      <div className="panel-heading">
        <div>
          <h2>Provider settings</h2>
          <p>Secrets stay in environment or credential stores.</p>
        </div>
        <StatusChip tone="ok" label="redacted" />
      </div>
      <div className="provider-row">
        <KeyRound size={18} aria-hidden="true" />
        <select value={providerMode} onChange={(event) => setProviderMode(event.target.value)}>
          <option value="offline">offline</option>
          <option value="openai_api_key">OpenAI API key</option>
          <option value="enterprise_gateway">enterprise gateway</option>
          <option value="local_model">local model</option>
        </select>
      </div>
      <div className="service-grid">
        {providerServices.map((service) => (
          <div className="service-card" key={service.name}>
            <span>{service.name}</span>
            <StatusChip tone={service.status === "running" ? "ok" : "neutral"} label={service.status} />
            <small>{service.detail}</small>
          </div>
        ))}
      </div>
      <div className="guardrail-list">
        <Guardrail icon={Lock} label="Secrets never emitted to artifacts" ok />
        <Guardrail icon={Network} label="Network denied unless toggled" ok={!permissions.network} />
        <Guardrail icon={WifiOff} label="Offline deterministic fallback" ok />
      </div>
      <div className="run-log">
        {runLog.map((entry) => (
          <div className={`run-log-row is-${entry.tone}`} key={`${entry.time}-${entry.label}`}>
            <span>{entry.time}</span>
            <strong>{entry.label}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function GithubDryRun({
  publishAllowed,
  draftIssues,
  onRefresh
}: {
  publishAllowed: boolean;
  draftIssues: number;
  onRefresh: () => void;
}) {
  return (
    <section className="panel github-panel">
      <div className="panel-heading">
        <div>
          <h2>GitHub dry-run</h2>
          <p>Preview issues and PR metadata before any external publish.</p>
        </div>
        <StatusChip tone={publishAllowed ? "warn" : "neutral"} label={publishAllowed ? "publish allowed" : "dry-run"} />
      </div>
      <div className="github-summary">
        <GitPullRequestDraft size={28} aria-hidden="true" />
        <div>
          <span>Would create</span>
          <strong>{draftIssues} issues</strong>
          <small>TODOs, milestones, and reproducibility tasks</small>
        </div>
      </div>
      <div className="button-row compact">
        <CommandButton icon={UploadCloud} label="Preview export" onClick={onRefresh} />
        <CommandButton icon={Send} label="Publish" onClick={onRefresh} disabled={!publishAllowed} />
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "amber" }) {
  return (
    <div className={`metric-card is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusChip({ tone, label }: { tone: "ok" | "warn" | "danger" | "neutral"; label: string }) {
  return <span className={`status-chip is-${tone}`}>{label}</span>;
}

function CommandButton({
  icon: Icon,
  label,
  onClick,
  primary = false,
  disabled = false
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button className={`command-button ${primary ? "is-primary" : ""}`} disabled={disabled} onClick={onClick} type="button">
      {disabled ? <AlertTriangle size={16} aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
}

function Guardrail({
  icon: Icon,
  label,
  ok
}: {
  icon: LucideIcon;
  label: string;
  ok: boolean;
}) {
  return (
    <div className="guardrail-row">
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
      {ok ? <CheckCircle2 size={16} aria-label="ok" /> : <Loader2 size={16} aria-label="needs review" />}
    </div>
  );
}

function upsertRun(runs: RuntimeRunSummary[], next: RuntimeRunSummary): RuntimeRunSummary[] {
  return [next, ...runs.filter((run) => run.id !== next.id)].slice(0, 12);
}

function updateRunStatus(runs: RuntimeRunSummary[], event: RuntimeEvent): RuntimeRunSummary[] {
  return runs.map((run) =>
    run.id === event.run_id
      ? {
          ...run,
          status: runtimeStatusFromEvent(run.status, event),
          updated_at: event.timestamp
        }
      : run
  );
}

export function canCancelRuntimeStatus(status: RuntimeRunSummary["status"] | undefined): boolean {
  return status === "queued" || status === "running" || status === "blocked";
}

export function runtimeStatusFromEvent(current: RuntimeRunSummary["status"], event: RuntimeEvent): RuntimeRunSummary["status"] {
  if (event.type === "run.started") return "running";
  if (event.type === "run.completed") return "completed";
  if (event.type === "run.failed") return "failed";
  if (event.type === "run.cancelled") return "cancelled";
  if (event.type === "stage.blocked") return "blocked";
  if (event.type === "stage.started" && current === "blocked") return "running";
  return current;
}

function runtimeEventLabel(event: RuntimeEvent): string | null {
  if (event.type === "run.started") return `Run started ${event.run_id.slice(0, 8)}`;
  if (event.type === "run.completed") return `Run completed ${event.run_id.slice(0, 8)}`;
  if (event.type === "run.failed") return `Run failed: ${event.error}`;
  if (event.type === "run.cancelled") return `Run cancelled ${event.run_id.slice(0, 8)}`;
  if (event.type === "stage.started") return `Stage started: ${event.label}`;
  if (event.type === "stage.completed") return `Stage completed: ${event.stage_id}`;
  if (event.type === "stage.blocked") return `Stage blocked: ${event.stage_id}`;
  if (event.type === "idea.optimized") return `Idea optimized: ${event.summary}`;
  if (event.type === "paper.found") return `Paper found: ${event.title}`;
  if (event.type === "pdf.downloaded") return `PDF downloaded: ${event.paper_id}`;
  if (event.type === "evidence.extracted") return `Evidence: ${event.paper_id} p.${event.page}`;
  if (event.type === "paper.note.written") return `Paper note: ${event.paper_id}`;
  if (event.type === "survey.updated") return `Survey updated: ${event.verified_papers} papers`;
  if (event.type === "question.asked") return `Question: ${event.question}`;
  if (event.type === "score.updated") return `Score updated: ${event.score}/${event.max_score}`;
  if (event.type === "reviewer.reported") return `${event.reviewer_id}: ${event.verdict}`;
  if (event.type === "rebuttal.task.created") return `Task: ${event.task_id}`;
  if (event.type === "rebuttal.task.resolved") return `Task resolved: ${event.task_id}`;
  if (event.type === "solution.generated") return `Solution generated: ${event.artifacts.length} files`;
  if (event.type === "decision.recorded") return `Decision: ${event.title}`;
  if (event.type === "artifact.written") return `Artifact: ${event.path}`;
  if (event.type === "approval.requested") return `Approval requested: ${event.action}`;
  return null;
}

function runtimeEventTone(event: RuntimeEvent): RunLogEntry["tone"] {
  if (event.type === "run.failed" || event.type === "stage.failed" || event.type === "stage.blocked" || event.type === "approval.requested") return "blocked";
  if (event.type === "stage.skipped" || event.type === "run.cancelled" || event.type === "question.asked") return "warn";
  return "ok";
}

function statusTone(status: RuntimeRunSummary["status"]): "ok" | "warn" | "danger" | "neutral" {
  if (status === "completed") return "ok";
  if (status === "failed" || status === "cancelled") return "danger";
  if (status === "running" || status === "blocked") return "warn";
  return "neutral";
}

function planMark(status: RuntimeViewState["plan"][number]["status"]): string {
  if (status === "completed") return "[x]";
  if (status === "in_progress") return "[>]";
  if (status === "blocked") return "[!]";
  return "[ ]";
}
