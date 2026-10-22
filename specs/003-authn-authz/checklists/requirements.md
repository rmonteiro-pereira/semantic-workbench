# Specification Quality Checklist: Sign-In, Roles and Access Control (v0.4.0)

**Purpose**: Validate specification completeness and quality before proceeding to planning

**Created**: 2026-10-21

**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- The owner fixed several technologies as binding decisions (OpenID Connect with Entra ID and
  Keycloak, server-held sessions, Cedar evaluated in-process, Git worktrees, Azure containers).
  The spec names them only where they are the owner's requirement (Input, Dependencies); route
  paths appear only to identify existing behaviour (Appendix A, FR-015, FR-090). This is accepted
  for a security feature whose scope is defined by the existing interfaces. The container and
  pipeline revisions add owner-fixed technologies (Docker image and Compose, Azure DevOps
  Pipelines for the target environment, Azure Container Registry of the target, Azure Container
  Apps, workload identity federation, local package scripts such as `ci:validate`); the scanner
  and bill-of-materials tool are named only in plan and research. The GitHub repository runs
  nothing automatically (owner decision, FR-130).
- Five decisions not fixed by the owner were resolved in the clarify pass with recommended
  defaults and are confirmed by the owner (OP-1 to OP-5); OP-8 (host networking for local mode
  in a container) is accepted by the owner; the former OP-6 and OP-7 are withdrawn.
- The owner's answers on the target environment are decided (OP-9: Entra only on the target,
  Keycloak as a local compatibility suite, sign-in tested against a mock OpenID provider in the
  gate and pipeline; OP-10: the trial is owner acceptance from a runbook; OP-11: releases are
  handed over to the target's Azure Repos mirror).
- The owner's decisions on sign-in and access are decided (OP-12: no workbench sign-in screen,
  only **No access** and signed-out pages; OP-13: access grants by Entra group or e-mail in the
  Admin panel are the only source of roles, no Entra app roles; OP-14: custom roles with members
  by group or e-mail). Claim names (`xms_edov`, `upn`, `email_verified`) appear in FR-024 because
  the verified-address rule is a security requirement.
