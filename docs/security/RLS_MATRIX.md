# RLS matrix

| Actor | Player private | DJM internal | Decision snapshot | Other players | Economics |
| --- | --- | --- | --- | --- | --- |
| Own player | Allowed own scoped rows | Denied | Own preview only | Denied | Denied |
| Assigned scout | Assignment/field dependent | Assignment dependent | Preview if assigned | Denied | Denied |
| DJM admin | Role-authorised | Allowed | Allowed | Allowed | Role-authorised |
| Club token | Denied | Denied | Exact active unexpired snapshot | Denied | Denied |
| Anonymous | Denied | Denied | Intentional public/token route only | Denied | Denied |

Automated tests must cover deny cases, expired/revoked tokens, direct table access and RPC execution—not only hidden UI controls.
