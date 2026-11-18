
# Implementation evidence and departures from the plan

- Reconciliation after an interrupted promotion lives in `proposal-promotion.ts` (`recover`), not in the store.
- Extra modules: proposal-context, proposal-views, proposal-contribution, proposal-promotion, proposal-closing, contribution-scope, proposal-wording, ProposalChanges.
- `contribute` and `promote` list only `authorizeProposal` as the handler check; per-path edit rights go through `authority.files`.
- The work position check is skipped when the person has no copy yet.
- Git status now returns `head`; `scm.changesBetween` takes optional paths; a `contribute` guard operation exists.
- A `publicationStage` workspace option lets recovery tests stop at a durable step.
- Mutants run in a `proposals` category with unit-level cases.
- Proposal rows are not server-only; local mode answers a JSON 404.
- The detail view is a wide Modal whose dismiss button is "Done".
- Event refresh goes through the git version bump.
- The two-editors journey uses a Viewer of the same project because the fixture has no sibling project.
- Existing push tests were rewritten to commit, publish, then push default.
- Browser scripts that push work branches (scm-browser-check, git-setup-browser-check, auth-remote-check, security-review cases) were not run and may need review at the batch gate.
- On midgard the two-editors run fails at the pre-existing 5 second sign-in limit before reaching any proposal code; it passes locally.
