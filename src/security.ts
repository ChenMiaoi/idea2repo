export type SecurityAssessment = {
  security_relevant: boolean;
  allowed: boolean;
  scope: string;
  reasons: string[];
  required_boundaries: string[];
};

const harmfulMarkers = [
  "steal credentials",
  "credential theft",
  "password stealer",
  "token stealer",
  "exfiltrate",
  "exfiltration",
  "keylogger",
  "botnet",
  "persistence",
  "privilege escalation",
  "edr bypass",
  "av bypass",
  "waf bypass",
  "weaponize",
  "real target",
  "phishing kit",
  "exploit chain",
  "reverse shell",
  "command and control",
  "payload",
  "dump tokens",
  "dump passwords",
  "public ip"
];

const securityMarkers = ["security", "privacy", "jailbreak", "exploit", "vulnerability", "attack", "threat", "malware", "red team", "audit", "bypass", "evasion"];
const defensiveMarkers = ["defense", "detect", "detection", "mitigate", "mitigation", "benchmark", "evaluate", "audit", "responsible disclosure", "sandbox", "policy", "synthetic", "owned", "lab", "ctf"];

export function assessSecurityScope(idea: string): SecurityAssessment {
  const lowered = idea.toLocaleLowerCase();
  const securityRelevant = securityMarkers.some((marker) => lowered.includes(marker)) || ["malware", "ransomware", "phishing"].some((marker) => lowered.includes(marker));
  const defensive = defensiveMarkers.some((marker) => lowered.includes(marker));
  const harmful = harmfulMarkers.filter((marker) => lowered.includes(marker) && !(defensive && ["payload", "exfiltrate", "exfiltration"].includes(marker)));
  const realTarget = hasUnsafeIpTarget(lowered) || hasExternalDomain(lowered);
  if (harmful.length || realTarget) {
    return {
      security_relevant: true,
      allowed: false,
      scope: "defensive_reframe_required",
      reasons: [
        ...harmful.map((marker) => `disallowed_operational_detail:${marker}`),
        ...(realTarget ? ["disallowed_operational_detail:real_target_indicator"] : [])
      ],
      required_boundaries: boundaries()
    };
  }
  if (securityRelevant) {
    return {
      security_relevant: true,
      allowed: defensive,
      scope: defensive ? "defensive_or_evaluation" : "requires_defensive_scope",
      reasons: defensive ? [] : ["security idea needs explicit defensive framing"],
      required_boundaries: boundaries()
    };
  }
  return { security_relevant: false, allowed: true, scope: "not_security_specific", reasons: [], required_boundaries: [] };
}

export function safeSecurityReframe(idea: string, assessment: SecurityAssessment): string {
  if (assessment.allowed) return idea;
  return "Defensive research reframe: evaluate, detect, and mitigate the described risk in an owned lab or synthetic benchmark. Do not generate operational abuse instructions, evasion guidance, persistence logic, or steps against real targets.";
}

export function securityGuardrailMarkdown(assessment: SecurityAssessment): string {
  return `# Security Guardrail

- Security relevant: ${yesNo(assessment.security_relevant)}
- Allowed as provided: ${yesNo(assessment.allowed)}
- Scope: ${assessment.scope}
- Reasons: ${assessment.reasons.join(", ") || "none"}

## Required Boundaries

${assessment.required_boundaries.map((boundary) => `- ${boundary}`).join("\n") || "- none"}

## Output Policy

- Support defensive evaluation, detection, mitigation, auditing, and responsible disclosure.
- Do not provide executable attack chains, malware behavior, credential theft, persistence, evasion, or real-target exploitation steps.
`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function boundaries(): string[] {
  return [
    "Use owned systems, synthetic targets, or public benchmark data only.",
    "Write the threat model before experiments.",
    "Measure false positives, false negatives, and defensive utility.",
    "Document ethical handling and responsible disclosure when applicable."
  ];
}

function hasExternalDomain(text: string): boolean {
  const hosts = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/g)) hosts.add(match[1] ?? "");
  for (const match of text.matchAll(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/g)) hosts.add(match[1] ?? "");
  return [...hosts].some((host) => !["localhost", "example.com", "example.org", "example.net", "test.invalid"].includes(host) && !host.endsWith(".example.com"));
}

function hasUnsafeIpTarget(text: string): boolean {
  const ips = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [];
  if (!ips.length) return false;
  const allowsReserved = ["owned", "synthetic", "benchmark", "lab", "ctf"].some((marker) => text.includes(marker));
  for (const ip of ips) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part > 255)) return true;
    const [a, b, c] = parts;
    const reserved = a === 10 || a === 127 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
    if (!(reserved && allowsReserved)) return true;
  }
  return false;
}
