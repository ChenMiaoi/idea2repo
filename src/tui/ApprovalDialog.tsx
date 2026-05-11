import React from "react";
import { Box, Text } from "ink";

export function ApprovalDialog({ action, risk }: { action: string; risk: string }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>Approval Required</Text>
      <Text>{action}</Text>
      <Text>Risk: {risk}</Text>
    </Box>
  );
}
