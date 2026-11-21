import type { actors, activityEvents, auditEvents } from "./db/schema";
export type ActivityRow = typeof activityEvents.$inferSelect;
export interface AgentStatus {
 agentId:string; status:string; paused:boolean;guidance:string;
 currentTask:string|null;currentWorkItemId:string|null;currentMode:string|null;runId:string|null;runTools:string[];
 queued:number;completedRuns:number;
 latestAction:{title:string;at:string;workItemId:string|null}|null;
 latestFinding:{title:string;summary:string|null;at:string;workItemId:string|null}|null;
}
export interface ApprovalSummary {id:string;workItemId:string;subjectType:string;subjectId:string;requestedBy:string;summary:string;}
export type AuditData = {events:(typeof auditEvents.$inferSelect)[];actors:Record<string,typeof actors.$inferSelect>;chain:{ok:boolean;count:number;brokenAtId:number|null}};
export type AgentView = ReturnType<typeof import("./aro/employees").employeeView>;
