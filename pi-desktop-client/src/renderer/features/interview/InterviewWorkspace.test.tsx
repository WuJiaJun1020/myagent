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
    expect(html).toContain("模型与思考深度");
    expect(html).toContain("模拟候选人");
    expect(html).toContain("面试导演");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="目标岗位"');
    expect(html).toContain("去岗位库添加岗位");
    expect(html).toContain("查看 / 编辑简历");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("仅用于归档");
    expect(html).not.toContain("面试记录不会进入普通 Pi 会话");
    expect(html).not.toContain('class="interview-summary-grid"');
    expect(html).not.toContain('class="interview-records"');
    expect(html).not.toContain("关闭创建表单");
  });
});
