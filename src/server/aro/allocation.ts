import type { Need, Plan } from "./catalog";

import { dispatchPlan, type Network } from "./network";
export function allocate(
  needs: Need[],
  network: Network,
  policy: "aro" | "directorate",
): Plan {
  const { lines, received, cost } = dispatchPlan(needs, network, policy);
  const stock = (i: number) => needs[i].stock + received[i];
  const byLevel = needs.map((n, i) => ({
    level: n.level,
    covered: Math.min(stock(i), n.minimum),
    minimum: n.minimum,
  }));
  const total = byLevel.reduce((s, n) => s + n.minimum, 0);
  return {
    lines,
    metrics: {
      coverage: total
        ? Math.round(
            (1000 * byLevel.reduce((s, n) => s + n.covered, 0)) / total,
          ) / 10
        : 100,
      below: byLevel.filter((n) => n.covered < n.minimum).length,
      unmet: needs.reduce((s, n, i) => s + Math.max(0, n.target - stock(i)), 0),
      cost,
      byLevel,
    },
  };
}
