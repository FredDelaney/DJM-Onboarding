# Testing

Baseline commands:

```bash
npm run typecheck
npm test
npm run build
```

Before deployment, test internal agent, player and Decision Room paths on mobile and desktop. Database verification must include own-player allow, cross-player deny, player-to-internal deny, assigned/unassigned scout, active/expired/revoked share tokens, unauthenticated access, audit creation and material-change invalidation.

AI evaluation fixtures cover schema validity, factuality, unsupported claims, source attribution, permission refusal and action usefulness without production secrets.
