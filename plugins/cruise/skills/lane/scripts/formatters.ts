import { DEFAULT_LANES, LaneInfo } from "./types";

/**
 * Formats the capability matrix into a structured Markdown comparison table.
 */
export function formatCapabilityMatrixTable(lanes: LaneInfo[]): string {
  const lines: string[] = [
    "| Lane Alias | Tools | Streaming | Vision | JSON Schema | Context (In / Out) | Pricing (Prompt / Comp) | Cost Tier |",
    "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |",
  ];

  for (const lane of lanes) {
    const caps = lane.capabilities;
    const t = caps.tools ? "✓" : "✗";
    const s = caps.streaming ? "✓" : "✗";
    const v = caps.vision ? "✓" : "✗";
    const j = caps.json_schema ? "✓" : "✗";
    const inTokens = lane.context_bounds.max_input_tokens >= 1000
      ? `${Math.round(lane.context_bounds.max_input_tokens / 1000)}k`
      : `${lane.context_bounds.max_input_tokens}`;
    const outTokens = lane.context_bounds.max_output_tokens >= 1000
      ? `${Math.round(lane.context_bounds.max_output_tokens / 1000)}k`
      : `${lane.context_bounds.max_output_tokens}`;
    const context = `${inTokens} / ${outTokens}`;
    const pricing = `${lane.pricing.prompt_per_m} / ${lane.pricing.completion_per_m}`;
    const tier = lane.pricing.cost_tier;

    lines.push(`| \`${lane.id}\` | ${t} | ${s} | ${v} | ${j} | ${context} | ${pricing} | ${tier} |`);
  }

  return lines.join("\n");
}

/**
 * Formats the underlying member model breakdown table.
 */
export function formatMemberBreakdownTable(lanes: LaneInfo[]): string {
  const lines: string[] = [
    "| Lane Alias | Underlying Member Models | Primary Routing Purpose |",
    "| :--- | :--- | :--- |",
  ];

  for (const lane of lanes) {
    const membersFormatted = lane.members.map((m) => `\`${m}\``).join(", ");
    lines.push(`| \`${lane.id}\` | ${membersFormatted} | ${lane.description} |`);
  }

  return lines.join("\n");
}

/**
 * Formats workload recommendations and reasoning effort settings.
 */
export function formatWorkloadRecommendations(lanes: LaneInfo[] = DEFAULT_LANES): string {
  const lines: string[] = [
    "| Target Workload | Recommended Lane | Suggested Effort | Rationale & Ideal Use Cases |",
    "| :--- | :--- | :--- | :--- |",
  ];

  const mappings: { workload: string; laneId: string; effort: string; rationale: string }[] = [
    {
      workload: "**Autonomous Coding**",
      laneId: "bb/agentic-coding",
      effort: "`/effort high`",
      rationale: "Multi-step tool calling, architectural refactoring, full test suite generation",
    },
    {
      workload: "**Chat & Pairing**",
      laneId: "bb/chat-assistant",
      effort: "`/effort medium`",
      rationale: "Interactive pair programming, code explanations, concept reviews, PR feedback",
    },
    {
      workload: "**Extraction & Schema**",
      laneId: "bb/extraction",
      effort: "`/effort low`",
      rationale: "Strict JSON schema outputs, AST metadata parsing, structured data extraction",
    },
    {
      workload: "**Linting & Quick Edits**",
      laneId: "bb/fast",
      effort: "`/effort none`",
      rationale: "High-frequency lint fixes, commit message drafting, quick lookups, minimal latency",
    },
  ];

  for (const m of mappings) {
    const lane = lanes.find((l) => l.id === m.laneId);
    const laneDisplay = lane ? `\`${lane.id}\`` : `\`${m.laneId}\``;
    lines.push(`| ${m.workload} | ${laneDisplay} | ${m.effort} | ${m.rationale} |`);
  }

  return lines.join("\n");
}

/**
 * Generates interactive CLI switching commands for the user.
 */
export function formatCliSwitchGuidance(selectedLane: string = "bb/agentic-coding", effort: string = "high"): string {
  return [
    "### Interactive Session Switching Commands",
    "",
    "To switch the active model in your current `agy` CLI session, enter:",
    "```sh",
    `/model ${selectedLane}`,
    "```",
    "",
    "To tune the reasoning effort level:",
    "```sh",
    `/effort ${effort}`,
    "```",
    "*(Options: `high`, `medium`, `low`, `none`)*",
    "",
    "To persist this default across all future sessions, update your settings file (`~/.gemini/antigravity-cli/settings.json`):",
    "```json",
    "{",
    '  "modelProvider": "openai",',
    '  "openaiBaseUrl": "https://cruise.bytesbrains.net/v1",',
    '  "openaiApiKey": "${CRUISE_API_KEY}",',
    `  "model": "${selectedLane}"`,
    "}",
    "```",
  ].join("\n");
}

/**
 * Formats a terminal-friendly (ASCII / ANSI) table for direct CLI invocation.
 */
export function formatCliTable(lanes: LaneInfo[]): string {
  const header = [
    "=========================================================================================================",
    "                               BytesBrains Cruise — Dynamic Model Lanes                                  ",
    "=========================================================================================================",
  ].join("\n");

  const tableRows: string[] = [];
  tableRows.push(
    "LANE ID             | TOOLS | STREAM | VISION | SCHEMA | CONTEXT     | PRICING (M)      | COST TIER"
  );
  tableRows.push(
    "--------------------+-------+--------+--------+--------+-------------+------------------+----------------"
  );

  for (const lane of lanes) {
    const id = lane.id.padEnd(19);
    const t = (lane.capabilities.tools ? "[✓]" : "[ ]").padEnd(5);
    const s = (lane.capabilities.streaming ? "[✓]" : "[ ]").padEnd(6);
    const v = (lane.capabilities.vision ? "[✓]" : "[ ]").padEnd(6);
    const j = (lane.capabilities.json_schema ? "[✓]" : "[ ]").padEnd(6);
    const inK = Math.round(lane.context_bounds.max_input_tokens / 1000);
    const outK = Math.round(lane.context_bounds.max_output_tokens / 1000);
    const ctx = `${inK}k / ${outK}k`.padEnd(11);
    const pricing = `${lane.pricing.prompt_per_m} / ${lane.pricing.completion_per_m}`.padEnd(16);
    const tier = lane.pricing.cost_tier;

    tableRows.push(`${id} | ${t} | ${s} | ${v} | ${j} | ${ctx} | ${pricing} | ${tier}`);
  }

  return [header, tableRows.join("\n"), "========================================================================================================="].join("\n");
}
