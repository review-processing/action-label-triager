# action-label-triager

Adds one `domain/*` and up to two `area/*` labels to a new issue, picked by a small local decision
model (`d3:2b`, served by Ollama on the CPU of the runner). Made for `podman-desktop/podman-desktop`.

## Use it

Copy [`examples/label-triage.yaml`](examples/label-triage.yaml) to `.github/workflows/` of the
repository and replace `<sha>` with a commit of this repository. It runs when an issue is opened or
reopened, and by hand for one issue (Actions → label-triage → Run workflow).

- **Dry run**: the labels are only written in the run summary. By hand: the checkbox (on by
  default). On issue events: repository variable `LABEL_TRIAGE_DRY_RUN=true`. Start with it to watch
  the suggestions for a while, then remove it.
- An issue that already has a `domain/*` label is left alone (`force: 'true'` to triage it anyway).
- Labels are only added, never removed.

| input | default | |
|---|---|---|
| `issue` | (required) | issue number |
| `repo` | `${{ github.repository }}` | repository of the issue |
| `dry-run` | `'false'` | only report the labels |
| `force` | `'false'` | triage even with a `domain/*` label |
| `model` | `d3:2b` | Ollama decision model |
| `token` | `${{ github.token }}` | reads issues and labels; adds labels unless dry run (`issues: write`) |

Output `labels`: JSON array of the labels added (or that would be).
The first run downloads Ollama and the model (about 3 GB) into the Actions cache; later runs restore it.

## How it decides

1. The action fetches, read-only: the issue, the labels of the repository, the last 150 issues (about 100 triaged ones, the
   examples), and
   [`folder-domains.json`](https://github.com/issue-management/pdmn-dsktp-app/blob/main/folder-domains.json)
   (which folder of the code belongs to which domain).
2. `triage.ts` (run by Node 24 as it is, no build) asks the model two choice questions with the
   issue text, the folder map, the paths the issue names and their domain, and the 5 most similar
   older triaged issues (TF-IDF) with their labels:
   - which `domain/*` (always one);
   - which `area/*`, or none (areas scored 30% or more, at most 2).
3. Only labels of the repository can come out: the model scores the options it is given and
   writes no text. A specific extension label (`area/extension/podman`, `area/extensions/compose`...)
   is offered only when the issue names that extension. What each label means to the model is its
   description on the labels page of the repository: edit it there to change the triage.

The model runs with no tool and no token; the issue text is only ever data for it. The worst an issue
can do is get a wrong label from the list.

## Measured

Newest 100 triaged issues of podman-desktop/podman-desktop (November 2026), each one compared with the
labels a maintainer gave it, using only older issues as examples:
the domain is right for 86% of issues, 76% of the area labels added are right, 1.5 s per issue on a Mac
GPU. Other models tried (bonsai-2, qwen3.5, gemma4 as chat models, d3:4b) were below or slower.

## Development

```sh
bun run test                                  # src/*.test.ts
bun collect.ts [--limit 500]                  # podman-desktop issues and labels -> .local/data/ (read-only)
bun eval.ts [--model d3:2b] [--only 20]       # replay the newest 100, .local/runs/<model>.jsonl + .md
bun eval.ts --compare                         # one line per run
bun report.ts                                 # .local/report.html: every run issue by issue, mark 👍/👎
node triage.ts 20302                          # one issue of .local/data against a local Ollama
```

`--url` / `OLLAMA_URL` and `--model` / `MODEL` pick the server and the model. The `test` workflow runs the
action of this repository on an issue of another repository in dry run, on `ubuntu-26.04-arm`.
