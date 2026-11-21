import type { Need, Line } from "./catalog";
export type Lane = {
  route: string;
  source: string;
  facility: string;
  cost: number;
  capacity: number;
};
export type Supply = { source: string; surplus: number };
export type Network = { suppliers: Supply[]; lanes: Lane[] };

// Successive unit augmentations on a bipartite residual network. Reverse arcs
// allow an earlier delivery to move to a different source when a lane binds.
export function dispatchPlan(
  needs: Need[],
  network: Network,
  policy: "aro" | "directorate",
) {
  const remaining = new Map(
    network.suppliers.map((s) => [s.source, s.surplus]),
  );
  const flows = network.lanes.map(() => 0),
    received = needs.map(() => 0);
  const from = (lane: Lane) => "s/" + lane.source,
    to = (lane: Lane) => "d/" + lane.facility;
  const nodes = new Set(network.lanes.flatMap((l) => [from(l), to(l)]));
  while (true) {
    const distance = new Map<string, number>(),
      prev = new Map<string, { node: string; edge: number; sign: number }>();
    for (const [s, available] of remaining)
      if (available > 0) distance.set("s/" + s, 0);
    // Bellman-Ford supports residual arcs with negative transport costs.
    for (let pass = 1; pass < nodes.size; pass++) {
      let changed = false;
      const relax = (
        a: string,
        b: string,
        cost: number,
        edge: number,
        sign: number,
      ) => {
        const value = (distance.get(a) ?? Infinity) + cost;
        if (value < (distance.get(b) ?? Infinity)) {
          distance.set(b, value);
          prev.set(b, { node: a, edge, sign });
          changed = true;
        }
      };
      network.lanes.forEach((l, k) => {
        if (flows[k] < l.capacity) relax(from(l), to(l), l.cost, k, 1);
        if (flows[k] > 0) relax(to(l), from(l), -l.cost, k, -1);
      });
      if (!changed) break;
    }
    const choices = needs.flatMap((n, i) => {
      const stock = n.stock + received[i],
        cost = distance.get("d/" + n.facility);
      if (cost === undefined || stock >= n.target) return [];
      const essential = stock < n.minimum;
      return [
        {
          i,
          rank:
            policy === "directorate"
              ? [n.level, cost]
              : [
                  essential ? 0 : 1,
                  stock / Math.max(1, essential ? n.minimum : n.target),
                  cost,
                ],
        },
      ];
    });
    if (!choices.length) break;
    choices.sort((a, b) => {
      for (let k = 0; k < a.rank.length; k++)
        if (a.rank[k] !== b.rank[k]) return a.rank[k] - b.rank[k];
      return needs[a.i].facility.localeCompare(needs[b.i].facility);
    });
    const target = choices[0].i;
    let node = "d/" + needs[target].facility;
    while (prev.has(node)) {
      const hop = prev.get(node)!;
      flows[hop.edge] += hop.sign;
      node = hop.node;
    }
    const supplier = node.slice(2);
    remaining.set(supplier, remaining.get(supplier)! - 1);
    received[target]++;
  }
  const lines: Line[] = network.lanes.flatMap((l, k) =>
    flows[k]
      ? [
          {
            source: l.source,
            route: l.route,
            facility: l.facility,
            units: flows[k],
          },
        ]
      : [],
  );
  return {
    lines,
    received,
    cost: network.lanes.reduce((s, l, k) => s + l.cost * flows[k], 0),
  };
}
