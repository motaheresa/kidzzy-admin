# Project documents

| Document                    | What it holds                                                      | Link                                                                 |
| --------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| PRD V1                      | Goals, release plan, features, success metrics                     | https://claude.ai/code/artifact/61f1358d-fc40-4173-adae-1e89f2246578 |
| SRS V1                      | Functional requirements, business rules, NFRs, acceptance criteria | https://claude.ai/code/artifact/7dad661c-fd5d-448e-9636-383345f1e570 |
| User flows V1               | Six core flows as diagrams                                         | https://claude.ai/code/artifact/7512872c-c599-4ff0-803c-bd772b49ce10 |
| Wireframes V1               | Low-fidelity admin and instructor screens                          | https://claude.ai/artifact/1Gn3qmQwfA3trBqPJYwj1f                    |
| ERD V1                      | Tables, columns and how rules are enforced                         | https://claude.ai/code/artifact/3872a8a8-3834-498e-95f5-725e8dd06777 |
| User stories and backlog V1 | Epics, stories, story points, sprint plan                          | https://claude.ai/code/artifact/ed566f5a-a31d-4995-a579-0b33e99cfe72 |
| Architecture V1             | Stack, modules, request lifecycle, ADRs                            | https://claude.ai/code/artifact/0224b28b-b29d-460d-b30a-be056049160f |
| API Design V1               | Conventions, errors, permissions, endpoint catalog                 | https://claude.ai/code/artifact/3afe7004-70dc-43f9-b7b9-cadc0fb45012 |

In this repository:

- [`adr/`](adr): one file per architecture decision. To change a decision, add a new ADR that supersedes the old one; never rewrite an accepted ADR.
- [`api/openapi.yaml`](api/openapi.yaml): the API contract (OpenAPI 3.1). CI lints it on every pull request.

Backlog: Jira project `SCRUM` (sprints) and Linear project "Academy Management System V1".
