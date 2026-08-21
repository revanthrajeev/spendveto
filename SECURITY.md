# Security

SpendVeto is a spend-governance layer — security reports are first-class contributions.

Report vulnerabilities privately to **revanthrajeev2004@gmail.com** (subject: SECURITY). You'll get a response within 72 hours. Please don't open public issues for exploitable findings before a fix ships.

Known, documented trust boundaries: library mode enforces policy in the agent's own process (bypassable by a fully adversarial process — that's what the enforcement proxy exists for); simulate-mode settlement is local by design; the local API binds without auth for single-operator use (the proxy gains bearer auth the moment the first agent identity is registered).
