import React from "react";
import { Box, Text } from "ink";

export type ApprovalDialogDecision = "approved" | "selected" | "denied";

export function ApprovalDialog({
  action,
  risk,
  paperOptions,
  approvalId,
  selectedDecision = "approved",
  height,
  width
}: {
  action: string;
  risk: string;
  paperOptions?: Array<{ id: string; title: string }>;
  approvalId?: string;
  selectedDecision?: ApprovalDialogDecision;
  height?: number;
  width?: number;
}): React.ReactElement {
  const isPdfApproval = /pdf\.acquire/i.test(action) || /pdf_download/i.test(risk);
  const effectiveDecision = !isPdfApproval && selectedDecision === "selected" ? "approved" : selectedDecision;
  const approveSelected = effectiveDecision === "approved";
  const selectSelected = effectiveDecision === "selected";
  const denySelected = effectiveDecision === "denied";
  const contentWidth = Math.max(20, (width ?? 80) - 4);
  return (
    <Box height={height} flexShrink={0} borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
      <Text bold color="yellow">
        Approval Required
      </Text>
      {approvalId ? <Text color="gray">id {approvalId}</Text> : null}
      <Text wrap="truncate-end">{action.slice(0, contentWidth)}</Text>
      <Text color="gray" wrap="truncate-end">
        Risk: {risk.slice(0, contentWidth)}
      </Text>
      {isPdfApproval ? (
        <Text color="gray" wrap="truncate-end">
          Public PDFs: {paperOptions?.length ?? "unknown"} · select limits download to typed paper ids
        </Text>
      ) : null}
      <Text>
        <Text color={approveSelected ? "green" : "gray"}>{approveSelected ? "> " : "  "}</Text>
        <Text bold={approveSelected} color={approveSelected ? "green" : "gray"}>
          {isPdfApproval ? "approve all" : "approve"}
        </Text>
        {isPdfApproval ? (
          <>
            <Text color="gray">   </Text>
            <Text color={selectSelected ? "yellow" : "gray"}>{selectSelected ? "> " : "  "}</Text>
            <Text bold={selectSelected} color={selectSelected ? "yellow" : "gray"}>
              select papers
            </Text>
          </>
        ) : null}
        <Text color="gray">   </Text>
        <Text color={denySelected ? "red" : "gray"}>{denySelected ? "> " : "  "}</Text>
        <Text bold={denySelected} color={denySelected ? "red" : "gray"}>
          deny
        </Text>
      </Text>
      <Text color="gray">{isPdfApproval ? "a approve all · s select papers · d deny · Enter apply · Esc leave pending" : "a/y approve · d/n deny · Enter apply · Esc leave pending"}</Text>
    </Box>
  );
}
