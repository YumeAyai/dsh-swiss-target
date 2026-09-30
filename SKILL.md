---
name: swiss-target-batch
description: Use when predicting protein targets for small molecules from SMILES — target fishing, off-target or polypharmacology hypotheses, mechanism and safety guesses — with the SwissTargetPrediction web service. Covers batch submission through the swiss_target_batch tool or the /swiss command and the SwissTarget panel, organism choice, the CSV export, the service's 100-target cap, per-molecule timing, and rate limiting. The client exposes no probability or top-N query flag — the service decides the list.
---

# SwissTargetPrediction batch prediction

`swiss_target_batch` submits SMILES strings to
[SwissTargetPrediction](https://www.swisstargetprediction.ch/), waits for each
prediction job, and returns the predicted protein targets: target name, common
name, UniProt id, ChEMBL id, target class, probability, and known-active counts
(3D/2D). Results are also written to a CSV in the session workspace.

Use it to generate hypotheses: which proteins a molecule might hit, what else a
drug-like compound could engage, which family a series converges on.

## When to use it

- Target fishing for a molecule or a short series (1–25 molecules per call).
- Off-target and polypharmacology hypotheses before designing an assay panel.
- Sanity-checking a mechanism claim against known actives for a target.

Do **not** present the output as evidence: probabilities are similarity-based
predictions, not measurements, and the service returns at most its top 100
targets per molecule.

## Run it

### As a tool (agent)

```text
swiss_target_batch(smiles=["CC(=O)OC1=CC=CC=C1C(=O)O", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"])
```

| Parameter | Default | Meaning |
|---|---|---|
| `smiles` | required | One SMILES string per molecule; duplicates collapse |
| `organism` | `Homo_sapiens` | `Mus_musculus`, `Rattus_norvegicus` |
| `output_csv` | `swiss_target_results.csv` | Relative to the session workspace, or absolute |
| `timeout_seconds` | `120` | Wait per molecule for its prediction |
| `poll_interval_seconds` | `5` | Poll interval for one job |
| `delay_seconds` | `2` | Pause between submissions — keep it |

There is no probability or top-N query flag: the service answers with its own
ranking, up to 100 targets per molecule, and this client returns all of it. To
keep an answer readable, submit fewer molecules per call and report the top
targets yourself; the CSV keeps the complete table.

### As a command (human)

```text
/swiss CC(=O)OC1=CC=CC=C1C(=O)O
/swiss {"smiles":["CCO","c1ccccc1"],"organism":"Homo_sapiens"}
```

One SMILES per line, `#` starts a comment, or a JSON payload with the same
options in camelCase. The result text carries a summary line plus a
`__SWISS_RESULT__{…}` JSON payload that the panel renders.

Note that every line is normalized before submission: counter-ions are dropped,
a mixture keeps its largest fragment, and simple charges are neutralised, because
the service refuses any input that reads as more than one molecule (a salt comes
back as a jobless page that looks exactly like rate limiting). The rewrite is
reported in the result — tell the user when their salt became its parent, and
never present the neutralised form as what they typed.

### As a panel (Web UI)

Open a session, pick **SwissTarget** in the conversation view tabs, paste one
SMILES per line, choose the organism, run, then read the table, inspect any
rewrites it reports, or export the CSV.

## Read the result

One row per (molecule × predicted target), ordered by probability within each
molecule. The reported columns are the service's; `input_smiles` and `job_id`
identify the source of each row. Known actives are the counts of 3D- and
2D-similar ligands known for that target — a high count at a low probability is
usually noise.

Report the top targets per molecule with their UniProt id and probability, the
organism searched, and where the CSV landed. State the cap (top 100 per
molecule) whenever the user might read the list as exhaustive.

## Limits and etiquette

- **25 molecules per call, 100 targets per molecule.** Split larger sets.
- **Sequential and slow:** 5–60 s per molecule; a 10-molecule batch can take
  minutes. Set a realistic `timeout_seconds` instead of dropping molecules.
- **The service throttles.** After a burst it answers jobless pages for a while;
  the plugin retries three times per molecule and then reports that molecule as
  failed with the reason. Retry the failures later; never invent a result for
  them.
- **Keep `delay_seconds` ≥ 2.** Removing it is what triggers the throttling.
- **Unofficial client.** Not affiliated with SwissTargetPrediction or the SIB;
  cite Daina, Michielin & Zoete, *Nucleic Acids Research* 47(W1), W357–W364
  (2019) when the predictions reach a publication.

## Troubleshooting

| Symptom | Cause | Action |
|---|---|---|
| `the service returned no job … after 3 attempts` | throttled, or the SMILES is not a molecule the service accepts | retry later; check the SMILES first |
| `job N returned no prediction within Ns` | prediction still running | raise `timeout_seconds` and resubmit |
| CSV path missing / `csvError` set | unwritable destination | pass an `output_csv` inside the session workspace |
| Empty table for one molecule | the service returned no target for it | check the SMILES; nothing was filtered client-side |

The HTTP conversation and the parsing rules are documented in
`lib/swiss-api.js`; `lib/smiles.js` carries the desalting rules and the
measurement behind them. To confirm the plugin is live in a profile, run
`node scripts/verify-plugin.mjs --module @yumeayai/dsh-swiss-target --client`
(its header explains how to read the result).
