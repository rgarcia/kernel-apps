### login agent

This script runs a browser-based login agent using a JSON input file.

### Run

From the this directory:

```
pnpm install
```

then:

```bash
pnpm exec tsx index.ts ./tasks/veracross.json
```

You can pass any task file path:

```bash
pnpm exec tsx index.ts path/to/config.json
```

### Task JSON

Minimal example at [`./tasks/veracross.json`](./tasks/veracross.json).

### Env substitution in credentials

Task JSON contains a secrets object that can reference environment variables.

```json
...
"secrets": {
    "$USERNAME": "$VC_USERNAME",
    "$PASSWORD": "$VC_PASSWORD"
  },
...
```

This will be passed to the LLM as a list of keys that are availabe to be substituted.
The LLM also has a tool to ask a human for a value if it deems none of the secrets are appropriate.

You can set env vars via a `.env` file (loaded automatically) or your shell environment.

### Telemetry output (`./telemetry`)

When `telemetry.directory` is configured, the script writes timestamped JSON files per step plus a run-level IO file:

- **Per-step request**: `loginAgent-<timestamp>-step-<number>-request.json`

  - Raw provider request body for that step (as sent to the model API). This typically includes top-level `messages` and `tools`.

- **Per-step response**: `loginAgent-<timestamp>-step-<number>-response.json`

  - `{ "messages": [...] }` containing the response messages returned by the provider for that step.

- **Run IO summary**: `logInAgent-io-<timestamp>.json`
  - JSON object `{ input, output }` with run metadata: task `id`, selected `model`, `targetUrl`, `secretVars`, `policies`, `success` detectors, and the final agent result.

The `./telemetry` directory is git-ignored.
