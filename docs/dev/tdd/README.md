# Test-freeze baselines (v0.2.0)

These compact JSON files record the protected test-file hashes used while building v0.2.0.
They are historical integrity evidence, not runtime assets; the live contract is the test
suite itself (`npm test`). Protected tests change only with explicit user approval, and the
latest revision note records every approved change.

| File | Covers |
| --- | --- |
| `increment1-baseline.json` | persistent enabled state, position memory, alert persistence, mid-turn resume |
| `increment2-baseline.json` | balance warning, settings actions, tool schema, plugin metadata (latest revision) |
| `increment3-baseline.json` | pet may live above the macOS menu bar: enableLargerThanScreen, `'status'` window level, full-bounds saved-position validation, drag-end reachability clamp (RED frozen contract; implementation pending) |

The verbose RED command output from development is not retained in the tree; it remains in
the repository history. Run `npm test` to reproduce the current contract.
