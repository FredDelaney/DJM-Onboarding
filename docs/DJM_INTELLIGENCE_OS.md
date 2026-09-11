# DJM Intelligence OS

## North star

DJM should feel like one intelligent football agency operating system, not a set of pages with AI features attached.

Every meaningful object in the platform should be connected: players, recruitment targets, clubs, contacts, relationships, needs, opportunities, deals, meetings, tasks, messages, evidence, documents, stats and decisions. AI should use that shared context, perform safe repetitive work automatically and bring humans in only when judgment, approval or uncertainty genuinely matters.

The product quality bar is premium B2B software: instant-feeling navigation, calm visual hierarchy, consistent interaction patterns, visible provenance, reversible automation and no duplicated context logic.

## Product principles

1. One context graph
   - Every screen resolves to the same canonical entity context.
   - Tell DJM, search, Home, player intelligence and future assistants consume the same context envelope.
   - No page-specific copies of identity or relationship logic.

2. One AI router
   - Fast routine work uses GPT-5.6 Luna.
   - Higher-risk or more ambiguous work routes to GPT-5.6 Terra.
   - Deep professional reasoning can route to GPT-5.6 Sol.
   - Routing is based on task, complexity and risk, not a single model configured for every request.

3. One automation policy
   - Low-risk, reversible and high-confidence work may execute automatically.
   - Medium-risk work is prepared and suggested.
   - Financial, contractual, destructive, externally visible or uncertain work requires review.
   - Every automated action must be attributable, inspectable and undoable where possible.

4. One priority system
   - Home is not a dashboard of modules.
   - Home is the ranked agency work queue.
   - Tasks, relationship signals, club needs, player issues, recruitment follow-ups and deal blockers compete in one priority model.

5. One design system
   - DJM navy and yellow remain the brand anchors.
   - Yellow is a precision accent, not a page background.
   - Shared surfaces, radii, shadows, typography, motion and command patterns are defined globally.
   - New product areas should not introduce their own visual language.

6. Measure the experience
   - Capture upload, transcription, interpretation, entity resolution and writes are timed independently.
   - Home load, search latency and key page transitions should be measured.
   - AI acceptance, correction, undo, retry and failure rates should become product metrics.

## Tell DJM latency budget

Target for a normal short voice note:

- Recording stop to safely stored acknowledgement: under 1.5 seconds after upload completes.
- Transcript available: typically under 3 seconds after upload on a warm path.
- Routine structured result: typically 3 to 8 seconds end-to-end after upload.
- Deep or ambiguous requests may take longer, but should show useful intermediate state rather than a generic spinner.

Current production evidence shows this needs architectural work rather than UI polish alone. The first pass therefore focuses on faster routing, regional execution, parallel entity resolution and explicit stage telemetry while preserving existing idempotency, review and evidence safeguards.

## Connected AI surfaces

### Home
DJM ranks what matters now, explains why, and proposes or executes the next safe action.

### Players
DJM detects stale data, missing evidence, changing market context, contractual milestones, player service issues and relevant club demand.

### Recruitment
DJM keeps targets enriched, detects missing context, prioritises outreach, drafts follow-ups and connects prospects to live market demand.

### Network
DJM understands relationships over time, prepares meeting context, detects cooling relationships, captures new intelligence and remembers provenance.

### Opportunities and deals
DJM detects blockers, missing next actions, stale conversations, decision deadlines and relevant people or players.

### Tell DJM
Tell DJM is the fastest write path into the entire system. A voice note or typed note becomes linked agency memory, tasks, needs, interactions and review items without forcing the user through forms.

### Search and command
Search evolves into a universal command surface: find anything, ask about anything and initiate safe actions without changing mental modes.

## Competitive position

DJM should not compete by trying to become a second transfer marketplace. The defensible product is the private intelligence and operating layer for an agency.

A marketplace can know the market. DJM should know the agency: who we represent, who we trust, what was said, what changed, what is due, what a club needs, which relationship matters, what evidence supports a claim, what opportunity is real and what the team should do next.

That connected private context is the core asset of the white-label SaaS product.

## Delivery sequence

### Foundation
- Canonical entity context.
- Shared AI routing policy.
- Client and Edge latency telemetry.
- Tell DJM fast path.
- Final DJM OS visual override layer.

### Connected command system
- Merge search, capture and AI command entry points into one command surface.
- Context-aware actions on every entity page.
- Keyboard-first navigation and actions.

### Agency intelligence loop
- AI-ranked Home feed.
- Automated meeting briefs and follow-up preparation.
- Intelligent recruitment prioritisation.
- Player freshness and evidence automation.
- Deal blocker and next-action detection.

### White-label intelligence
- Tenant-aware policies, models, usage, features and automation limits.
- Agency-specific memory and vocabulary.
- Plan-based AI capability routing.
- Dedicated data boundaries and auditability.

## Non-negotiables

- Production stays protected until staging parity is complete.
- No private player or agency data is committed to Git.
- No AI action bypasses the existing evidence and review safeguards.
- No new AI feature creates its own disconnected memory or identity system.
- No visual redesign breaks player-facing flows for the sake of staff-side polish.
