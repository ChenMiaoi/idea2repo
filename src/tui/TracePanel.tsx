import React from "react";
import { Box, Text } from "ink";
import type { Idea2RepoEvent } from "../runtime/events.js";

export function TracePanel({ events, limit = 8 }: { events: Idea2RepoEvent[]; limit?: number }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>Trace</Text>
      {events.slice(-limit).map((event, index) => (
        <Text key={`${event.type}-${event.timestamp}-${index}`}>
          {event.timestamp} {event.type}
        </Text>
      ))}
    </Box>
  );
}
