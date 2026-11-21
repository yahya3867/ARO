import type { AppContext } from "../context";
import { appendAudit } from "../audit";
import { crew, scenarios } from "./catalog";
import { randomUUID } from "node:crypto";

export function initialize(ctx: AppContext) {
  const db = ctx.sqlite;
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS communities(id TEXT PRIMARY KEY, level INTEGER NOT NULL, population INTEGER NOT NULL CHECK(population>0));
      CREATE TABLE IF NOT EXISTS facilities(id TEXT PRIMARY KEY, name TEXT NOT NULL, community TEXT NOT NULL REFERENCES communities);
      CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY, unit TEXT NOT NULL, priority INTEGER NOT NULL, essential_per_person REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS inventories(facility TEXT REFERENCES facilities, resource TEXT REFERENCES resources, lot TEXT, quantity INTEGER NOT NULL CHECK(quantity>=0), reserve INTEGER NOT NULL CHECK(reserve>=0), available INTEGER NOT NULL, expires TEXT NOT NULL, PRIMARY KEY(facility,resource,lot));
      CREATE TABLE IF NOT EXISTS consumption(facility TEXT REFERENCES facilities, resource TEXT REFERENCES resources, day TEXT, units INTEGER NOT NULL CHECK(units>=0), PRIMARY KEY(facility,resource,day));
      CREATE TABLE IF NOT EXISTS facility_demand(facility TEXT REFERENCES facilities, resource TEXT REFERENCES resources, horizon_days INTEGER NOT NULL, minimum_units INTEGER NOT NULL CHECK(minimum_units>=0), PRIMARY KEY(facility,resource));
      CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY, body TEXT NOT NULL, incident TEXT);
      CREATE TABLE IF NOT EXISTS deliveries(id INTEGER PRIMARY KEY, facility TEXT REFERENCES facilities, resource TEXT REFERENCES resources, expected INTEGER NOT NULL, received INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS routes(id TEXT PRIMARY KEY, source TEXT REFERENCES facilities, destination TEXT REFERENCES facilities, resource TEXT REFERENCES resources, capacity INTEGER NOT NULL CHECK(capacity>=0), cost INTEGER NOT NULL CHECK(cost>=0), open INTEGER NOT NULL, UNIQUE(source,destination,resource));
      CREATE TABLE IF NOT EXISTS allocation_policies(id TEXT PRIMARY KEY, objective TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY, resource TEXT REFERENCES resources, facility TEXT REFERENCES facilities, state TEXT NOT NULL, step INTEGER NOT NULL DEFAULT 0, opened TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS active_resource ON incidents(resource) WHERE state IN ('working','review','approved','blocked');
      CREATE TABLE IF NOT EXISTS demo_feeds(resource TEXT PRIMARY KEY, next_scan INTEGER NOT NULL, last_scan INTEGER, runs INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS case_messages(id INTEGER PRIMARY KEY,incident TEXT REFERENCES incidents,question TEXT NOT NULL,answer TEXT NOT NULL,evidence INTEGER REFERENCES activity_events(id),mode TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS artifacts(incident TEXT REFERENCES incidents, tool TEXT, data TEXT NOT NULL, PRIMARY KEY(incident,tool));
      CREATE TABLE IF NOT EXISTS agent_summaries(incident TEXT REFERENCES incidents, tool TEXT, summary TEXT NOT NULL, facts TEXT NOT NULL, PRIMARY KEY(incident,tool));
      CREATE TABLE IF NOT EXISTS transfer_requests(incident TEXT PRIMARY KEY REFERENCES incidents, lines TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS transfer_revisions(id TEXT PRIMARY KEY, incident TEXT NOT NULL REFERENCES transfer_requests, lines TEXT NOT NULL, comparison TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS case_actions(id TEXT PRIMARY KEY, message INTEGER NOT NULL REFERENCES case_messages, incident TEXT NOT NULL REFERENCES incidents, kind TEXT NOT NULL, payload TEXT NOT NULL, base TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
      CREATE TABLE IF NOT EXISTS transfer_approvals(incident TEXT PRIMARY KEY REFERENCES transfer_requests, operator TEXT NOT NULL, decision TEXT NOT NULL, decided TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS transfers(incident TEXT REFERENCES transfer_approvals, route TEXT REFERENCES routes, lot TEXT, units INTEGER NOT NULL CHECK(units>0), PRIMARY KEY(incident,route,lot));
      CREATE TABLE IF NOT EXISTS replenishments(incident TEXT PRIMARY KEY REFERENCES incidents, resource TEXT REFERENCES resources, units INTEGER NOT NULL CHECK(units>0), status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS continuity_requests(id TEXT PRIMARY KEY, workspace TEXT NOT NULL, resource TEXT NOT NULL, incident TEXT NOT NULL REFERENCES incidents, received TEXT NOT NULL);
    `);
    db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES ('aro:workspace-id',?)").run(JSON.stringify(randomUUID()));
    for (const table of [
      "transfer_requests",
      "transfer_revisions",
      "transfer_approvals",
      "transfers",
      "artifacts",
    ]) {
      for (const op of ["UPDATE", "DELETE"])
        db.exec(
          `CREATE TRIGGER IF NOT EXISTS protect_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable operational record'); END`,
        );
    }
    if (db.prepare("SELECT 1 FROM resources LIMIT 1").get()) {
      db.exec(
        "INSERT OR IGNORE INTO facility_demand SELECT destination,resource,2,0 FROM routes",
      );
      return;
    }
    db.exec(`INSERT INTO communities VALUES ('hub',4,650),('upper',2,400),('deep',8,800);
      INSERT INTO facilities VALUES ('depot','Cooperative supply depot','hub'),('upper','North Commons','upper'),('deep','Level 8 community clinic','deep'),('garden','Level 4 growers cooperative','hub'),('cistern','Central water exchange','hub'),('energy','Battery exchange','hub');
      INSERT INTO allocation_policies VALUES ('directorate','Serve shallower facilities first'),('aro','Essential need, proportional coverage, then forecast demand and cost');`);
    const put = (sql: string, ...values: (string | number)[]) =>
      db.prepare(sql).run(...values);
    for (const [i, r] of Object.keys(scenarios).entries()) {
      put(
        "INSERT INTO resources VALUES (?,?,?,?)",
        r,
        ["kits", "food parcels", "water crates", "battery packs"][i],
        [4, 2, 3, 2][i],
        0.05,
      );
      const source = ["depot", "garden", "cistern", "energy"][i];
      for (const [f, n, res, lot, avail, expiry] of [
        ["depot", 65, 15, "A", 1, "2090-01-01"],
        ["depot", 14, 0, "X", 1, "2020-01-01"],
        ["depot", 8, 0, "Q", 0, "2090-01-01"],
        ["upper", 15, 0, "local", 1, "2090-01-01"],
        ["deep", 4, 0, "local", 1, "2090-01-01"],
      ] as const)
        put(
          "INSERT INTO inventories VALUES (?,?,?,?,?,?,?)",
          f === "depot" ? source : f,
          r,
          lot,
          n,
          res,
          avail,
          expiry,
        );
      for (const [f, usage, cap, cost] of [
        ["upper", 18, 32, 1],
        ["deep", 26, 42, 3],
      ] as const) {
        put(
          "INSERT INTO routes VALUES (?,?,?,?,?,?,1)",
          r + "-" + f,
          source,
          f,
          r,
          cap,
          cost,
        );
        put(
          "INSERT INTO facility_demand VALUES (?,?,2,?)",
          f,
          r,
          f === "deep" && r === "medicine" ? 42 : 0,
        );
        put(
          "INSERT INTO deliveries(facility,resource,expected,received) VALUES (?,?,?,?)",
          f,
          r,
          20,
          f === "deep" ? 4 : 20,
        );
        for (let day = 1; day <= 7; day++)
          put(
            "INSERT INTO consumption VALUES (?,?,?,?)",
            f,
            r,
            "2087-03-0" + day,
            usage + day - 4,
          );
      }
    }
    put(
      "INSERT INTO inventories VALUES ('depot','food','cooperative-harvest',18,4,1,'2087-03-12')",
    );
    put(
      "INSERT INTO routes VALUES ('food-local','depot','deep','food',12,1,1)",
    );
    for (const a of [
      ...crew.map((a) => [a.id, a.name, "agent"]),
      ["director", "Operations Director", "agent"],
      ["operator", "Human operator", "human"],
    ])
      put(
        "INSERT INTO actors VALUES (?,?,?,?,?,?)",
        a[0],
        a[1],
        a[2],
        a[0],
        a[1],
        a[1],
      );
    appendAudit(ctx, {
      actorId: "director",
      action: "deployment.initialize",
      category: "system",
      details: { deployment: "Hollow", day: "2087-03-08" },
    });
  }).immediate();
}

// Deployment's fixed planning day. All expiry checks use this clock.
export const planningDay = "2087-03-08";
export const eligible = "available=1 AND expires>'" + planningDay + "'";
