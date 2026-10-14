# Contributing

How work moves from a Jira story to production. Read it once before your first pull request.

## Workflow at a glance

1. Pick the top story of the current sprint in Jira and move it to **In Progress**.
2. Create a branch from an up-to-date `main`.
3. Commit in small steps with Conventional Commit messages.
4. Push and open a pull request using the template.
5. CI must be green; review the diff yourself (and get one approval once the team grows).
6. **Squash and merge** into `main`, delete the branch, and move the story to **Done** when it meets the Definition of Done.

This is **GitHub Flow**: `main` is always deployable, and every change reaches it through a short-lived branch and a pull request.

## Branches

```text
<type>/<JIRA-KEY>-<short-description>
```

| Type       | Use for                       | Example                          |
| ---------- | ----------------------------- | -------------------------------- |
| `feature/` | A user or technical story     | `feature/SCRUM-20-create-group`  |
| `fix/`     | A bug                         | `fix/SCRUM-58-wrong-cycle-count` |
| `chore/`   | Tooling, dependencies, config | `chore/SCRUM-60-upgrade-prisma`  |
| `docs/`    | Documentation only            | `docs/SCRUM-61-adr-backups`      |

The Jira key in the branch name links the branch, its commits and its pull request to the story automatically once GitHub is connected to Jira.

## Commits

[Conventional Commits](https://www.conventionalcommits.org), checked by commitlint on every commit:

```text
<type>(<scope>): <what changed, imperative, lower case> (<JIRA-KEY>)
```

```text
feat(groups): create a group with a weekly schedule (SCRUM-20)
fix(payments): stop counting cancelled sessions (SCRUM-58)
test(sessions): cover numbering after a cancellation (SCRUM-23)
docs(adr): record the backup decision (SCRUM-61)
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`, `build`, `style`, `revert`. Scopes are listed in `commitlint.config.mjs` (one per module, plus `api`, `web`, `db`, `ci`, `docs`, `deps`).

Before each commit, the `pre-commit` hook formats staged files with Prettier.

## Pull requests

- One story per pull request; keep it small enough to review in 20 minutes.
- Fill in the template: story key, acceptance criteria, how it was tested.
- An endpoint change updates `docs/api/openapi.yaml` in the same pull request (design-first, see the API Design V1 document).
- A schema change adds a Prisma migration in the same pull request.
- Merge only with **Squash and merge**; the pull request title becomes the commit on `main`, so it must follow the commit format above.

## Protecting `main` (set once in GitHub)

Settings → Branches → Add rule for `main`:

- Require a pull request before merging
- Require status checks to pass: **CI / quality**
- Require branches to be up to date before merging
- Allow only squash merging (Settings → General → Pull Requests)
- Automatically delete head branches

## Definition of Done

A story is done when:

- It is merged through a reviewed pull request with green CI.
- Automated tests cover its acceptance criteria.
- It works at phone width in the Arabic RTL interface.
- It is deployed to staging.
- Audit log and notification side effects are checked where relevant.

## Releases

Versions follow [Semantic Versioning](https://semver.org). At the end of each sprint, tag `main` (`v0.1.0` after Sprint 1, `v0.2.0` after Sprint 2, …) and deploy that tag to production; V1 is `v1.0.0`.
