import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { LibraryQaTurn } from "../../../shared/contracts/smart-library";

import { getQaStrategy } from "./strategy-registry";

export class LibraryQaStorage {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS qa_turns(seq INTEGER PRIMARY KEY AUTOINCREMENT, book TEXT NOT NULL, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS qa_sessions(book TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, createdAt INTEGER NOT NULL, PRIMARY KEY(book,id));
      CREATE INDEX IF NOT EXISTS qa_turns_book ON qa_turns(book,seq);`);
    if (!db.prepare("PRAGMA table_info(qa_sessions)").all().some(row=>row.name === "manualTitle")) db.exec("ALTER TABLE qa_sessions ADD COLUMN manualTitle INTEGER NOT NULL DEFAULT 0");
    if (!db.prepare("PRAGMA table_info(qa_sessions)").all().some(row=>row.name === "range")) db.exec("ALTER TABLE qa_sessions ADD COLUMN range TEXT");
    if (!db.prepare("PRAGMA table_info(qa_sessions)").all().some(row=>row.name === "strategyId")) db.exec("ALTER TABLE qa_sessions ADD COLUMN strategyId TEXT NOT NULL DEFAULT 'standard-rag'");
    db.exec(`INSERT OR IGNORE INTO qa_sessions(book,id,title,createdAt)
      SELECT DISTINCT book,'default','原有会话',0 FROM qa_turns WHERE coalesce(json_extract(data,'$.sessionId'),'default')='default';`);
    // A process restart never silently resumes a paid request.
    for (const row of db.prepare("SELECT id,data FROM qa_turns WHERE json_extract(data,'$.state') IN ('retrieving','rewriting','answering')").all()) {
      const turn: LibraryQaTurn = JSON.parse(String(row.data)); turn.state = "stopped"; turn.error = "上次生成已中断，已保留收到的内容；可重试。";
      db.prepare("UPDATE qa_turns SET data=? WHERE id=?").run(JSON.stringify(turn), String(row.id));
    }
  }
  handle(book: string, action: string, payload: any): any {
    if (action === "qa-sessions") {
      const op = payload?.action ?? "list";
      if (!["list", "create", "clear", "delete", "rename", "range", "strategy"].includes(op)) throw Error("会话操作无效");
      if (op === "create") this.db.prepare("INSERT INTO qa_sessions(book,id,title,createdAt) VALUES(?,?,?,?)").run(book, randomUUID(), "新会话", Date.now());
      if (["clear", "delete", "rename", "range", "strategy"].includes(op)) {
        if (!this.db.prepare("SELECT id FROM qa_sessions WHERE book=? AND id=?").get(book, payload.sessionId)) throw Error("会话不存在");
        if (op === "strategy") {
          if (typeof payload.strategyId !== "string") throw Error("回答策略无效");
          if(payload.strategyId!=="standard-rag" && !/^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(payload.strategyId)) getQaStrategy(payload.strategyId);
          const strategy = {info:{id:payload.strategyId}};
          this.db.prepare("UPDATE qa_sessions SET strategyId=? WHERE book=? AND id=?").run(strategy.info.id,book,payload.sessionId);
        } else if (op === "range") {
          const r=payload.range;
          if(r!==null && (!r || !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start<0 || r.end<r.start)) throw Error("检索页码范围无效");
          this.db.prepare("UPDATE qa_sessions SET range=? WHERE book=? AND id=?").run(r===null?null:JSON.stringify(r),book,payload.sessionId);
        } else if (op === "rename") {
          const title = payload.title;
          if (typeof title !== "string" || !title.trim() || title.trim().length > 80) throw Error("会话名称须为 1–80 字符");
          this.db.prepare("UPDATE qa_sessions SET title=?,manualTitle=1 WHERE book=? AND id=?").run(title.trim(), book, payload.sessionId);
        } else {
          this.db.exec("BEGIN IMMEDIATE");
          try {
            this.db.prepare("DELETE FROM qa_turns WHERE book=? AND coalesce(json_extract(data,'$.sessionId'),'default')=?").run(book, payload.sessionId);
            if(op === "delete") this.db.prepare("DELETE FROM qa_sessions WHERE book=? AND id=?").run(book, payload.sessionId);
            this.db.exec("COMMIT");
          } catch(e) { this.db.exec("ROLLBACK"); throw e; }
        }
      }
      return this.db.prepare("SELECT id,title,createdAt,manualTitle,range,strategyId FROM qa_sessions WHERE book=? ORDER BY createdAt DESC,rowid DESC").all(book).map(row=>({...row,range:row.range?JSON.parse(String(row.range)):null}));
    }
    if (action === "qa-list") {
      const sessionId = payload && typeof payload === "object" ? payload.sessionId : "default";
      payload = payload && typeof payload === "object" ? payload.before : payload;
      if (payload !== undefined && (!Number.isSafeInteger(payload) || payload <= 0)) throw Error("历史分页无效");
      const rows = this.db.prepare("SELECT seq,data FROM qa_turns WHERE book=? AND coalesce(json_extract(data,'$.sessionId'),'default')=? AND seq<? ORDER BY seq DESC LIMIT 51").all(book, sessionId ?? "default", payload ?? Number.MAX_SAFE_INTEGER);
      return { turns: rows.slice(0, 50).reverse().map(row => ({ ...JSON.parse(String(row.data)), seq: Number(row.seq) })), hasMore: rows.length > 50 };
    }
    if (action === "qa-get") {
      const row = this.db.prepare("SELECT seq,data FROM qa_turns WHERE book=? AND id=?").get(book, payload);
      return row ? { ...JSON.parse(String(row.data)), seq: Number(row.seq) } : null;
    }
    if (action === "qa-save") {
      const turn = payload as LibraryQaTurn;
      if (turn.book !== book || !/^[\w-]{1,100}$/.test(turn.id)) throw Error("会话记录无效");
      const sessionId = turn.sessionId ?? "default";
      if (sessionId !== "default" && !this.db.prepare("SELECT id FROM qa_sessions WHERE book=? AND id=?").get(book, sessionId)) throw Error("会话不存在");
      const exists = this.db.prepare("SELECT book FROM qa_turns WHERE id=?").get(turn.id);
      if (exists && exists.book !== book) throw Error("会话标识冲突");
      this.db.prepare("INSERT INTO qa_turns(book,id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(book, turn.id, JSON.stringify(turn));
      this.db.prepare("UPDATE qa_sessions SET title=? WHERE book=? AND id=? AND title='新会话' AND manualTitle=0").run((turn.question ?? "新会话").slice(0, 24), book, sessionId);
      return this.handle(book, "qa-get", turn.id);
    }
    throw Error("会话操作无效");
  }
}
