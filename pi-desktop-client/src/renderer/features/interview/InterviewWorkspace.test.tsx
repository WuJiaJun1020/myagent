import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { useInterviewStore } from "../../stores/interview-store";
import { useJobLibraryStore } from "../../stores/job-library-store";
import { useUiStore } from "../../stores/ui-store";
import { InterviewWorkspace } from "./InterviewWorkspace";

describe("InterviewWorkspace navigation", () => {
  beforeEach(() => {
    useInterviewStore.setState({ interviews: [], initialized: true, loading: false, error: null,
      counts: { draft: 0, preparing: 0, ready: 0, interviewing: 0, generating_report: 0, completed: 0 } });
    useJobLibraryStore.setState({ jobs: [], initialized: true, loading: false, error: null });
  });

  it("shows the new interview form immediately without the old overview blocks", () => {
    useUiStore.setState((state) => ({ moduleViews: { ...state.moduleViews, interview: "dashboard" } }));
    const html = renderToStaticMarkup(<InterviewWorkspace />);
    expect(html).toContain('class="interview-create-card"');
    expect(html).toContain("新建面试");
    expect(html).toContain("模拟候选人 Agent 提示词（可在面试中继续编辑）");
    expect(html).toContain("启用面试导演 Agent");
    expect(html).toContain('aria-label="面试官思考深度"');
    expect(html).toContain('aria-label="模拟候选人思考深度"');
    expect(html).toMatch(/aria-label="模拟候选人思考深度"[^>]*>[^<]*(?:<option[^>]*>[^<]*<\/option>)*<option value="medium" selected="">中<\/option>/);
    expect(html).toContain('aria-label="面试导演思考深度"');
    expect(html).toContain('aria-label="面试评分思考深度"');
    expect(html).toContain('aria-label="面试评分模型"');
    expect(html).toMatch(/aria-label="面试评分思考深度"[^>]*>[^<]*(?:<option[^>]*>[^<]*<\/option>)*<option value="medium" selected="">中<\/option>/);
    expect(html).toMatch(/aria-label="面试导演思考深度"[^>]*>[^<]*(?:<option[^>]*>[^<]*<\/option>)*<option value="medium" selected="">中<\/option>/);
    expect(html).toContain("只在创建时选择，面试中不能切换");
    expect(html).toContain("面试导演 Agent 提示词（仅启用时调用）");
    expect(html).toContain("简历是人物设定的事实锚点");
    expect(html).toContain("默认关闭 · 随机抽题");
    expect(html).toContain('aria-label="选择目标岗位"');
    expect(html).toContain("岗位库为空，先去采集岗位");
    expect(html).not.toContain("仅用于归档");
    expect(html).not.toContain("面试记录不会进入普通 Pi 会话");
    expect(html).not.toContain('class="interview-summary-grid"');
    expect(html).not.toContain('class="interview-records"');
    expect(html).not.toContain("关闭创建表单");
  });
});
