import React from "react";
import { Box, Text } from "ink";

export type RuntimeArtifactEntry = {
  path: string;
  bytes: number;
  text: boolean;
};

export function ArtifactPanel({ artifacts, limit = 8 }: { artifacts: RuntimeArtifactEntry[]; limit?: number }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>Artifacts</Text>
      {artifacts.slice(0, limit).map((artifact) => (
        <Text key={artifact.path}>
          {artifact.text ? "[txt]" : "[bin]"} {artifact.path} ({artifact.bytes} bytes)
        </Text>
      ))}
    </Box>
  );
}
