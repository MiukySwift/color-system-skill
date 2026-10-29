# Figma MCP Import and Readback

## Connection and Scope

Use the official Figma MCP tools actually callable in the current session. Shell login state alone does not establish a working connection. Do not store tokens, session IDs, or a fixed fileKey in the skill.

Before writing variables, load the Figma plugin's `figma-use` and `figma-generate-library` guidance. If only MCP resources are available, read `skill://figma/figma-use/SKILL.md` and `skill://figma/figma-generate-library/SKILL.md` through the server's resource mechanism and follow their current API requirements. The standard deliverable is variable foundations and the requested System Guide; product components and product screens are outside this scope.

Target a `/design/` file. Once fileKey is established, call `create_session` and reuse its returned sessionId. Follow the Figma skills' discovery requirements, including `get_libraries` and relevant variable searches, to identify existing systems. This skill creates self-contained local collections and does not import Library variables. Use the exact preflight below to determine whether target collections can be reused. Do not write to unrelated files from earlier sessions.

## Prepare Execution

Using the generator in the skill directory, generate these scripts from the same validated JSON:

```bash
python3 scripts/color_system.py figma-code /path/to/color-system.json --operation inspect --output /path/to/figma-inspect.js
python3 scripts/color_system.py figma-code /path/to/color-system.json --operation apply --output /path/to/figma-apply.js
python3 scripts/color_system.py figma-code /path/to/color-system.json --operation verify --output /path/to/figma-verify.js
```

Pass each script's **complete text** as `use_figma.code`, sequentially. Do not pass a local file path to Figma or execute the text through shell interpolation. The scripts already contain the payload and top-level `return`; do not add an IIFE or closePlugin call.

Example call shape; follow the current session's actual tool schema:

```text
use_figma({
  fileKey: current target fileKey,
  sessionId: UUID returned by create_session,
  code: complete contents of figma-inspect.js,
  description: "Inspect color collection names, modes, and alias compatibility",
  skillNames: "resource:figma-use,resource:figma-generate-library"
})
```

Omit the `resource:` prefix when guidance was loaded as plugin skills rather than MCP resources.

## Status and Execution

- `inspect: ready`: read-only preflight found no conflicts and lists missing collections, modes, and variables.
- `apply: verified`: creation and readback passed; returns actual IDs and counts. For an already complete identical system, created-ID arrays are empty, indicating successful reuse.
- `conflict`: duplicate collection names, extra variables, incompatible modes/default mode, scopes, code syntax, actual RGBA, or aliases. No writes occur. Use the complete conflict list to explain the need for a separate prefix or an agreed update plan. The importer does not overwrite existing definitions.
- `incomplete`: read-only verify found missing entries; import is not complete.
- `failed`: creation or readback failed. The script attempts to remove only the exact variable, mode, and collection IDs created during this call, returning `rollbackComplete` and `cleanupErrors`. It never deletes by name or removes preexisting variables.

The actual API determines the account's mode capabilities. Report an addMode failure; do not write Dark values into Light or silently substitute another architecture.

apply reads back all 65 or 76 Primitive RGBA values, all 90 semantic aliases, and collection/variable properties by exact ID within the same call. Counts depend on whether an independent Link seed was supplied. Once it returns verified, no identical verification rerun is needed. Run verify after resuming across calls, relevant changes, or suspected drift. Variables have no visible canvas artifact, so screenshots cannot replace value and reference validation.

Unwrap and save the MCP result to `figma-import-result.json` in the task directory, including the current fileKey, input JSON path, and operation. Do not guess variable IDs from logs. If results exceed the tool output budget, read explicit IDs in batches rather than truncate completion evidence.

On MCP errors, obey `safeToRetryWithoutCanvasRead`. If writes may have occurred, rerun inspect and read recorded IDs before retrying. In-script rollback cannot guarantee recovery from MCP process interruption, network loss, or server-side transaction behavior; do not assume rollback completed in those cases. Do not retry indefinitely.

The importer can add missing variables or modes to compatible existing collections. It does not take over collections with different values, extra variables, or incomplete attributes. If partial failure leaves incompatible data, preserve and report it; use a user-selected new prefix or handle exact IDs separately.

## Empty Inventory Metadata

Some connections can return an empty local-variable inventory or empty collection `variableIds` even when exact-ID handles resolve. After an interrupted or resumed import, do not interpret empty metadata as permission to recreate Variables. Use the current task's verified import ledger and check each expected ID, collection, mode, RGBA/alias, scope, and code syntax. Report the inventory discrepancy. If there is no trusted ledger, fail closed on ambiguous existing collections; an explicitly requested fresh run can use a distinct prefix and new output directory.

## System Guide

For a standard Figma delivery, follow [system-guide.md](system-guide.md) after the import result is verified. Generate `figma-guide.js` with `guide-code` and the same JSON/import ledger; execute it in the same file and persist the complete result as `figma-guide-result.json`. The script rechecks live Variables by exact ID before drawing and does not create or alter Variables. Inspect all nine boards with screenshots, then resolve any visual defect before reporting the Guide complete. A repeated identical run must return `reused: true` with no created nodes.
