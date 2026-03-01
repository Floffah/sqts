(Based on https://github.com/eljojo/no-autopilot/blob/main/CONTRIBUTING.md)

# Contributing to SQTS

We welcome contributions. Here's how to make them count.

## Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage releases. When you make a change that should be included in a release, create a changeset by running `bun changeset` in the root of the repository. This will guide you through creating a changeset file that describes your change and its impact on the public API.

## How to contribute

- **Small PRs, incremental improvements.** A series of focused, reviewable PRs is better than one large change.
- **Discuss before building big things.** For major features or architectural changes, open an issue first. Once there's agreement, break the work into smaller pieces.
- **Bug fixes and small improvements can go straight to PR.** Not everything needs a discussion.
- **Read the code before changing it.** Understand the existing patterns and match the style.

## On using AI tools

AI tools are fine. Use whatever helps you write better code. We don't care how you got to the solution — we care whether the solution is good.

The standard is the same regardless of how the code was written: **you are responsible for every line of your contribution.** If you can't explain why a line is there and why it's correct, it shouldn't be in your PR.

**Specifically:**

- If you use AI to help write code, you must understand every line of the diff you're submitting.
- Do not paste raw AI output into issues, PRs, or comments. If you use AI to help draft text, rewrite it in your own words.
- Remove AI-generated footers, co-author attributions, and "Generated with..." signatures before submitting. Their presence tells us you didn't review your own submission carefully enough to notice them.
- Automated submissions — bots or agents posting PRs without meaningful human review — will be treated as spam.

## Consequences

We'd rather help you improve a PR than close it. But we can't review work that wasn't reviewed by the person submitting it.

- **First time:** You'll get a warning and a chance to fix the PR.
- **Second time:** The PR will be closed.
- **Repeated offenses:** May be reported to GitHub as spam.

## Code structure / formatting

- We use prettier for formatting and require that all code be formatted before submission.
- We use eslint. All code must pass linting before submission.

Try and make your code similar to existing patterns, and make sure it's clean. If you need comprehensive instructions, the [AGENTS.md](AGENTS.md) file has detailed guardrails (for AI models but applicable to humans too) on how to ensure your contributions meet the standards of this repository.

These rules are looser for humans 😄