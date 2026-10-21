# Specification Quality Checklist: Column-Level Lineage, One Metric Vocabulary, Git Workflow and a Calmer UI

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-21
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain
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

- Five questions remain open (Q1 save flow, Q2 monorepo declaration, Q3 subfolder project
  delete, Q4 SQL lint severity, Q5 Metrics list scope). Each has a provisional answer written
  into the requirements, so planning can start; the owner's answers replace them.
- Appendix A cites source files and line numbers of v0.2.0 (`e768efa`) to anchor the defects;
  this is evidence of current behaviour, not a design prescription. FR-022 (work off the main
  thread) and FR-052 (shared validation rules) restate constitution constraints rather than
  choose a technology.
- The clarify pass resolved nine points (C1-C9) by analysis of the code and constitution 2.0.1;
  no one was asked.
