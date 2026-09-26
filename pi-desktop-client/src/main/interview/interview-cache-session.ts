import { createHash } from "node:crypto";

/** Keep one provider cache lane per interview and agent without sending the interview ID upstream. */
export function interviewCacheSessionId(interviewId: string, actor: "interviewer" | "director" | "candidate"): string {
  const digest = createHash("sha256").update(interviewId).digest("hex").slice(0, 24);
  return `interview:${actor}:${digest}`;
}
