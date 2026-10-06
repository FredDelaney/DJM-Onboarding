# Tell ReDream natural agency language benchmark

## Purpose

This benchmark protects the behaviour ReDream is trying to win on:

**something happens -> tell ReDream once -> ReDream understands the entities -> proposes the consequences -> the agent approves -> ReDream writes the records.**

The wording is intentionally conversational. Testers should not adapt their language to ReDream.

## Pass rules

A case passes when ReDream identifies the intended football entities, proposes the required consequences, does not invent an owner or entity, and does not write material changes before approval.

A safe review is a pass when the transcript contains an unresolved owner or entity. A guessed assignment is a fail.

A no-op debrief must remain a no-op.

## Current staging result, 6 October 2026

**10 / 10 cases passed after the player-self-reference fix.**

The first run exposed one real friction point: "Kota told me..." and "Simon told me..." were being routed through Network contact resolution even though the statement was clearly about the signed player's own career preference. ReDream asked unnecessary "Which Kota/Simon?" questions.

The worker now deterministically prefers the signed player identity when a player-specific claim is generated, and removes duplicate contact lookup when player_name and contact_name are the same person.

The rerun produced:

- b01: club conversation + confirmed CB need + Milan suggestion + Jesse-owned next-day task.
- b02: U20 right-wing loan need + Friday Simon task, no invented owner.
- b03: Kota transfer-preference claim + next-Tuesday task, no clarification.
- b04: Lucas scouting observation with strengths/risks, no invented score.
- b05: Eastport relationship event + Simon follow-up on 1 December.
- b06: unconfirmed striker/budget intelligence stayed a soft claim, not a confirmed club need.
- b07: goalkeeper need recorded, but unknown "Alex" ownership was held for review with no owner_user_id.
- b08: conversational acknowledgement produced zero actions.
- b09: Northbridge conversation + Milan loan-option claim + profile task for the same afternoon.
- b10: Simon Europe-only preference captured against the signed player, with no unwanted follow-up task.

Every approval-first case remained staged with zero applied actions and zero target IDs before approval.

## How to use this

Run these cases against staging whenever the capture prompt, entity resolution, action schema, date parsing or approval flow changes.

The benchmark fixture is:

`tests/fixtures/tell-redream-natural-language-benchmark-v1.json`

Do not turn this into a rigid phrase-matching test. The purpose is semantic behaviour under ordinary agency language.
