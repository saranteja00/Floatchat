# Query interpretation checks

Run offline from the repository root:

```powershell
.venv\Scripts\python.exe scripts/evaluate_interpreter.py --output artifacts/interpreter-offline-evaluation.json
```

The 12 known development cases cover direct selection, variable/float/depth/QC follow-ups, preservation of non-default context, vague requests, unsupported variables/forecast/calculations, and instruction injection. Plans are validated and compared in full, including inherited fields. These are regression cases, not a held-out benchmark or proof of general language understanding.

For a live check, keep the API running with its configured credentials and explicitly select live mode:

```powershell
.venv\Scripts\python.exe scripts/evaluate_interpreter.py --live --limit 1 --output artifacts/interpreter-live-evaluation.json
```

This sends public example questions, filter context and catalogue metadata through the local API to its configured model. It does not read credentials. The CLI defaults to offline; live mode allows at most 12 sequential requests and stops at the first provider fallback or transport/API error. There are no automatic retries. Exit code 1 means evaluation did not fully pass; see the report for the cause. A stale snapshot requires rerunning against the current local snapshot.

Live results separately label provider unavailability, invalid provider output, unverified provider output and semantic failures. A local fallback never counts as AI success. An adapter validation rejection never counts as a successful request for clarification. Reports retain expected and actual plans, context, engine, model and returned response identifiers when available.

On 20 September 2026, all 12 offline cases passed after fixing the supported wording “Use exploratory quality”. The targeted assistant, query and evaluation test suites passed 68 tests. The configured Gemini diagnostic returned HTTP 503 (high demand), and a single bounded retry was classified as provider unavailable. No live semantic accuracy claim can be made; the remaining live cases have not been evaluated.
