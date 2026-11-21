export const crew = [
  {
    id: "compute",
    name: "Inventory Auditor",
    tool: "reconcile_stock",
    remit: "Check counted stock against shipment receipts.",
  },
  {
    id: "budget",
    name: "Demand Forecaster",
    tool: "forecast_demand",
    remit: "Estimate daily usage and time to stockout.",
  },
  {
    id: "vendor",
    name: "Supply Coordinator",
    tool: "locate_surplus",
    remit: "Find eligible lots and preserve local reserves.",
  },
  {
    id: "finance",
    name: "Resource Allocator",
    tool: "allocate_resources",
    remit: "Compare feasible allocations across communities.",
  },
  {
    id: "capacity",
    name: "Logistics Coordinator",
    tool: "verify_routes",
    remit: "Validate dispatch capacity and route availability.",
  },
  {
    id: "policy",
    name: "Fairness Auditor",
    tool: "review_equity",
    remit: "Review essential coverage before requesting approval.",
  },
] as const;
export type Seat = (typeof crew)[number]["id"];
export const scenarios = {
  medicine: "Level 8 medicine shortage",
  food: "Neighborhood food sharing",
  water: "Water rationing",
  power: "Emergency power allocation",
} as const;
export type Resource = keyof typeof scenarios;
export type Line = {
  source?: string;
  route: string;
  facility: string;
  units: number;
};
export type Need = {
  facility: string;
  name: string;
  level: number;
  population: number;
  daily: number;
  minimum: number;
  target: number;
  stock: number;
};
export type Measure = {
  coverage: number;
  below: number;
  unmet: number;
  cost: number;
  byLevel: { level: number; covered: number; minimum: number }[];
};
export type Plan = { lines: Line[]; metrics: Measure };
