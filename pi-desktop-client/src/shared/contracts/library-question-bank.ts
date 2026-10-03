export type LibraryGoldEvidence = {
  evidence_id: string; chapter_id: string; volume: string; chapter_label: string;
  start_utf16: number; end_utf16: number; line_start: number; line_end: number;
  quote: string; supports: string; required: boolean;
};
export type LibraryQuestion = {
  sample_id: string; source_sha256: string; difficulty: string; question_type: string;
  question: string; answer: string; reasoning: string; evidence: LibraryGoldEvidence[];
  stratum?: number; anchor_chapter_id?: string;
  event_key?: string; answer_points?: string[]; cross_chapter_reason?: string;
  generation?: string; prompt_version?: string; author_model?: string; reasoning_level?: string;
};
export type BankEntry = {
  question: LibraryQuestion; revision: number; status: "pending" | "approved" | "rejected";
  published: boolean; reviewNote: string; updatedAt?: number;
};
export type QuestionBank = { batch: string; model: string; promptVersion: string; residentGeneration?: string; entries: BankEntry[] };
export type BankAction = {
  id: string; revision: number; action: "save" | "note" | "approve" | "reject" | "reset" | "publish" | "unpublish";
  reviewNote?: string; edit?: { question: string; answer: string; reasoning: string; supports: string[] };
};
export type BankBulkAction = {
  action: "approve_many";
  entries: { id: string; revision: number }[];
  publish: boolean;
};
export type BankReviewRequest = BankAction | BankBulkAction;
