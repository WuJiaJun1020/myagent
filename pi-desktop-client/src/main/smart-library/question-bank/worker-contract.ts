import type { WorkerRequest } from "../../../platform/main/workers/worker-client";
import type { BankReviewRequest, LibraryQuestion, QuestionBank } from "../../../shared/contracts/library-question-bank";
import type { LibraryEvidence } from "../../../shared/contracts/smart-library";
export type BankMethods = {
  list: { input: { book: string }; output: QuestionBank };
  review: { input: { book: string; payload: BankReviewRequest }; output: QuestionBank };
  published: { input: { book: string }; output: LibraryQuestion[] };
  evidence: { input: { book: string; payload: { question: string; evidence: string } }; output: LibraryEvidence };
};
export type BankRequest = WorkerRequest<BankMethods>;
