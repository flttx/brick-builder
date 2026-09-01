import { describe, expect, it } from "vitest";
import { formatDateTimeZhCN, localizeColorName, localizePartName, messageForErrorCode, messages } from "../apps/web/src/i18n/index.js";
import { createPartIndex, searchParts } from "../apps/web/src/editor/parts/part-index.js";
import { createStandardPartDefinitions } from "../src/index.js";

describe("简体中文 UI 文案", () => {
  it("覆盖认证、作品列表和关键操作", () => {
    expect(messages.auth.loginTitle).toBe("欢迎回来");
    expect(messages.auth.login).toBe("登录");
    expect(messages.auth.register).toBe("注册账号");
    expect(messages.builds.title).toBe("我的作品");
    expect(messages.builds.newBuild).toBe("新建作品");
    expect(messages.common.delete).toBe("删除");
  });

  it("为移动模式、颜色和零件提供稳定的中文显示", () => {
    expect(messages.editor.placement.modes).toEqual({ auto: "自动吸附", free: "自由移动", precision: "精准连接" });
    expect(localizeColorName("light-gray")).toBe("浅灰色");
    expect(localizePartName("brick-2x4")).toBe("砖块 2×4");
    expect(messages.editor.placement.precision.sourceAria("凸点", "stud-0-0")).toContain("选择当前积木");
  });

  it("把错误码转换为用户可理解的中文消息", () => {
    expect(messageForErrorCode("PROJECT_CONFLICT")).toBe("作品存在版本冲突");
    expect(messageForErrorCode("AUTH_REQUIRED")).toBe("登录状态已过期");
    expect(messageForErrorCode("UNKNOWN_CODE")).toBe("请求未完成");
  });

  it("使用 zh-CN 本地日期格式，并保留英文搜索别名", () => {
    expect(formatDateTimeZhCN("2026-08-31T07:32:41.000Z")).toMatch(/^2026\/08\/31 \d{2}:32$/);
    const index = createPartIndex(createStandardPartDefinitions());
    expect(searchParts("brick", index)[0]?.id).toBe("brick-1x1");
    expect(searchParts("plate", index).every((item) => item.category === "plate")).toBe(true);
    expect(searchParts("砖块", index).every((item) => item.category === "brick")).toBe(true);
  });
});
