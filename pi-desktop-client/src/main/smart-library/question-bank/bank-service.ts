import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { WorkerClient } from "../../../platform/main/workers/worker-client";
import type { BankReviewRequest } from "../../../shared/contracts/library-question-bank";
import type { BankMethods } from "./worker-contract";

export class LibraryQuestionBankService {
  private client: WorkerClient<BankMethods>;
  constructor(root: string) {
    this.client = new WorkerClient(() => new Worker(join(__dirname, "library-question-bank.cjs"), { workerData: { root } }), "题库服务", 300_000);
  }
  private request<K extends keyof BankMethods>(action: K, input: BankMethods[K]["input"]): Promise<BankMethods[K]["output"]> {
    if (!/^[a-f0-9]{64}$/.test(input.book)) return Promise.reject(Error("图书标识无效"));
    return this.client.request(action, input);
  }
  list(book: string) { return this.request("list", { book }); }
  review(book: string, payload: BankReviewRequest) { return this.request("review", { book, payload }); }
  published(book: string) { return this.request("published", { book }); }
  evidence(book: string, question: string, evidence: string) { return this.request("evidence", { book, payload: { question, evidence } }); }
  dispose() { return this.client.dispose(); }
}
