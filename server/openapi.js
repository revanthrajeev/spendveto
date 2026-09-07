// OpenAPI 3.0 spec for SpendVeto's own x402-priced catalog. Takes the same
// tool list server/index.js's own allTools() builds — the static TOOLS array
// (shared-config.js) plus anything registered dynamically at runtime (a
// third party's own marketplace listing via POST /api/catalog/tools) — so
// this can't quietly under-report a catalog that's grown since boot.
//
// This exists for platforms (a gateway-registration flow that ingests an
// OpenAPI document, or anything else that wants a standard machine-readable
// description) as an alternative to server/discovery.js's Bazaar-shaped
// resource list — same catalog, two different schemas because two different
// consumers expect two different shapes.
export function catalogOpenApiSpec({ baseUrl, tools }) {
  const paths = {};
  for (const tool of tools) {
    paths[tool.path] = {
      get: {
        operationId: tool.id,
        summary: tool.label,
        description: `${tool.description} Priced at $${tool.price} USDC via x402 — every call is governed (policy caps, approvals, kill switch) before it settles; see https://github.com/revanthrajeev/spendveto.`,
        tags: [tool.category],
        responses: {
          "200": { description: "Tool output, after a governed x402 payment settles." },
          "402": { description: "Payment required (x402) — also returned if SpendVeto's policy gate refuses the call before settlement." },
        },
      },
    };
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "SpendVeto governed tool catalog",
      version: "1.0.0",
      description:
        "Every call below is metered over x402/USDC and governed by SpendVeto before it settles — policy caps, human approvals above a threshold, and a kill switch, enforced server-side. Apache-2.0, open source: https://github.com/revanthrajeev/spendveto",
    },
    servers: [{ url: baseUrl }],
    paths,
  };
}
