# SpendVeto — ETHOnline 2026 narration script

Read this at a natural pace while looking at the camera (or split-screen with
the recording). Total run time ~3:20-3:40, comfortably under the 4:00 cap.
Timestamps are approximate targets to keep pace with the screen recording —
don't rush, the footage can be trimmed/held to match your pacing instead.

---

**[0:00 – 0:20] Hook / problem**

"AI agents can already pay for things — APIs, data, other agents — over
protocols like x402. But nobody's watching when they do. If an agent's
compromised, or just makes a bad call, money moves before a human even knows.
SpendVeto is the layer that sits in front of that: policy caps, human
approval, and a tamper-evident ledger, enforced *before* anything settles —
not promised after the fact."

**[0:20 – 0:55] Product tour (matches Pass 1 footage)**

"Every one of these is an agent spending money you can't watch by default.
SpendVeto ships a CLI, an SDK, and an MCP server — governance the model can't
opt out of, enforced server-side. You set a per-call cap and an hourly
budget, and if an agent goes rogue — say, fires a runaway burst of calls —
it's frozen mid-loop. Nothing spends again until a human unfreezes it. Behind
that is one governed ledger: approvals, budgets, chain scope, counterparty
trust, all hash-chained and tamper-evident. Two-hundred and ninety-eight
end-to-end assertions. If a claim isn't a test, it doesn't ship."

**[0:55 – 1:10] Transition to the new work**

"That's the core product. For this submission I want to show three specific
pieces built for this hackathon, each backed by a real, on-chain or on-device
result — not a mockup."

**[1:10 – 1:55] Hedera segment**

"First, Hedera. SpendVeto governs fourteen chains across seven signature
families, and Hedera testnet settles live through the public x402
facilitator using real account-ID addressing, not a keypair-derived address.
Here's a payment that's refused outright — over the per-call cap, never even
reaching the network. And here's one that's approved and actually settles —
this is a real transaction on Hedera testnet, confirmed on HashScan."

*(show the refusal, then the real settled tx / HashScan confirmation)*

**[1:55 – 2:45] World ID segment**

"Second, World ID. Some approvals need more than a click — they need proof
a human, not another bot, actually signed off. SpendVeto gates those
approvals behind World ID 4.0's proof-of-personhood check. Watch: this
approval is refused without a proof — 403, malformed. Now I scan the QR code
with my phone, a real World ID verification round-trip happens against
World's API, and — approved. That real, device-scanned proof is what
unblocks the payment that was paused a moment ago."

*(show the QR, scan it live, show the refusal-then-approval)*

**[2:45 – 3:15] ENS segment**

"Third, ENS. Payee allowlists shouldn't be raw hex addresses a human can't
audit — so SpendVeto resolves `.eth` names directly. Here, `vitalik.eth`
resolves to its real address on Ethereum mainnet, and that's what gates the
payment — an address that isn't on the resolved allowlist is refused,
fail-closed, every time."

*(show the ENS resolution + gated payment)*

**[3:15 – 3:35] Close**

"All of this is open source, Apache-2.0, and every claim I just made is a
real assertion in `npm run verify` — no fabricated results, no staged
demos. Agents can spend. SpendVeto decides."

---

## Recording notes

- Record yourself as a straight facecam take (phone or webcam), full script,
  one continuous read — easier to sync as an audio track later than trying
  to time individual lines to the footage live.
- If a phrase or number changes before you record (e.g. a fresher tx id,
  a different assertion count), say the number that's actually true at
  recording time, not what's written here — the whole point of this
  submission is that every spoken claim matches something real in the repo.
- Once recorded, extract just the audio and mux it onto the final stitched
  video — see the ffmpeg command scripts/record-full-demo.sh prints at the
  end.
