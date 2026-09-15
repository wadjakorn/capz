import type { Env } from "./env";
import type { FeedbackKind } from "./validate";

export interface FeedbackRow {
  id: number;
  created_at: string;
  kind: FeedbackKind;
  message: string;
  version: string | null;
  target: string | null;
  arch: string | null;
}

export interface IssuePayload {
  title: string;
  body: string;
  labels: string[];
}

const TITLE_MAX = 70;

export function buildIssue(row: FeedbackRow): IssuePayload {
  const firstLine = row.message.split(/\r?\n/, 1)[0].trim();
  const snippet =
    firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 3)}...` : firstLine;
  const title = `[${row.kind}] ${snippet || "(no title)"}`;
  // A closing fence inside the user message must not escape the code block.
  const safeMessage = row.message.replace(/```/g, "'''");
  const body = [
    "```text",
    safeMessage,
    "```",
    "",
    "| field | value |",
    "|---|---|",
    `| version | ${row.version || "-"} |`,
    `| target | ${row.target || "-"} |`,
    `| arch | ${row.arch || "-"} |`,
    `| received | ${row.created_at} |`,
    `| feedback id | ${row.id} |`,
    "",
    "_Submitted anonymously from capz (Settings > Feedback). No reply channel._",
  ].join("\n");
  return { title, body, labels: [row.kind === "bug" ? "bug" : "enhancement"] };
}

export type CreateIssueResult =
  | { ok: true; number: number }
  | { ok: false; error: string };

export async function createIssue(env: Env, row: FeedbackRow): Promise<CreateIssueResult> {
  const payload = buildIssue(row);
  try {
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GITHUB_PAT}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "capz-api",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      return { ok: false, error: `github ${res.status}: ${text}` };
    }
    const data = (await res.json()) as { number?: number };
    if (typeof data.number !== "number") {
      return { ok: false, error: "github: response had no issue number" };
    }
    return { ok: true, number: data.number };
  } catch (e) {
    return {
      ok: false,
      error: `github fetch failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
