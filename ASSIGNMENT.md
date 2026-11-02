# APM Integrations - Take-home Assignment

## Problem

A developer building an AI agent wants their users to connect an app. Before they can launch, they may need to create an OAuth app with the provider and get it approved.

Today, developers piece together documentation, work through unfamiliar setup flows, and email providers to understand the requirements. It can be hard to tell whether setup will take an hour or involve weeks of waiting, how much work is needed, or what might block approval.

**Help developers understand that path and make progress on it.** They should be able to look up an app, get a guide they can use and share, and know what to do next.

## Your assignment

Build a working experience that gives developers and agent builders clear, actionable guidance for setting up an OAuth app and getting it approved. A developer should know where to start, what to do next, how much time and effort to expect, and how to proceed when they hit a blocker.

The goal is a library of ready-to-use guides for 100 apps that support OAuth. A developer should also be able to submit the name or website of an app they are interested in. An agent should investigate that app and generate a shareable guide in real time, including for apps outside the existing library.

For this take-home, demonstrate a few varied apps and this live generation flow. You do not need to produce all 100 guides.

A developer using your result should understand:

- How easy or difficult it is to get their OAuth app ready for use.
- The likely time and effort involved, including any wait for approval.
- The requirements and nuances that could affect their setup.
- What an agent can do for them and where they need to take over.

Use agents to investigate and attempt as much of the setup process as practical. Let what they discover shape the guidance. Be clear about what you tested, what sources support, and what remains uncertain.

You decide the approach, format, and implementation. The result should be useful enough for a developer to follow and share without you explaining it.

## Start by understanding the problem

Understand what a provider OAuth app is and how it relates to a developer's integration and their users' connections. The managed OAuth app directory is a good starting point.

We care about what you learn and the product decisions you make from it. Choose a focused scope and explain why it addresses the developer's problem.

## Show us that it works

1. Demonstrate the experience on a few real apps with different setup challenges. Be ready for us to submit an unfamiliar app and watch the agent generate its guide live.
2. Check a sample of the guidance against real sources or setup attempts. Show what you learned, corrected, or could not verify.
3. Submit a link to the working experience and a source repository. Include a short README with setup instructions, your key decisions, and limitations.

We will look for understanding of the developer's problem, useful guidance, sound judgment about evidence, and thoughtful use of agents.

**Budget 6 to 8 hours.** A focused working slice is enough. You do not need paid accounts, completed provider approvals, or a production-ready product. Keep credentials out of the submission.
