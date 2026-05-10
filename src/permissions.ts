export const operations = ["write", "overwrite", "network", "login", "install", "publish"] as const;
export type Operation = (typeof operations)[number];

export class PermissionDeniedError extends Error {
  constructor(operation: Operation, detail = "") {
    super(`operation requires explicit permission: ${operation}${detail ? `: ${detail}` : ""}`);
    this.name = "PermissionDeniedError";
  }
}

export type PermissionPolicy = {
  allowWrite: boolean;
  allowOverwrite: boolean;
  allowNetwork: boolean;
  allowLogin: boolean;
  allowInstall: boolean;
  allowPublish: boolean;
};

export function defaultPolicy(options: { allowOverwrite?: boolean } = {}): PermissionPolicy {
  return {
    allowWrite: true,
    allowOverwrite: options.allowOverwrite ?? false,
    allowNetwork: false,
    allowLogin: false,
    allowInstall: false,
    allowPublish: false
  };
}

export function requirePermission(policy: PermissionPolicy, operation: Operation, detail = ""): void {
  if (allows(policy, operation)) return;
  throw new PermissionDeniedError(operation, detail);
}

export function allows(policy: PermissionPolicy, operation: Operation): boolean {
  switch (operation) {
    case "write":
      return policy.allowWrite;
    case "overwrite":
      return policy.allowOverwrite;
    case "network":
      return policy.allowNetwork;
    case "login":
      return policy.allowLogin;
    case "install":
      return policy.allowInstall;
    case "publish":
      return policy.allowPublish;
  }
}

export function policyAsDict(policy: PermissionPolicy): Record<string, boolean> {
  return Object.fromEntries(operations.map((operation) => [operation, allows(policy, operation)]));
}
