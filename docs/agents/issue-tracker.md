# Issue tracker: Local Markdown

Issues and specs live in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- Spec: `spec.md` within that directory.
- Tickets: `issues/<NN>-<slug>.md`, numbered from `01`,
  with one file per ticket.
- Record triage state near the top as `Status: <role>`.
  Use the roles in `triage-labels.md`.
- Append discussion under `## Comments`.

When publishing, create the appropriate file and parent directories.
When fetching a ticket, read its referenced file.

## Wayfinding

- Map: `.scratch/<effort>/map.md`, containing Notes,
  Decisions-so-far, and Fog.
- Child tickets: `.scratch/<effort>/issues/NN-<slug>.md`.
- Record `Type: research`, `prototype`, `grilling`, or `task`.
- Record dependencies as `Blocked by: NN, NN`.
- Choose the first numbered open, unclaimed ticket whose
  dependencies are all resolved.
- Before working, save `Status: claimed`.
- To resolve, append `## Answer`, save `Status: resolved`,
  and add a summary and link to the map's Decisions-so-far.
