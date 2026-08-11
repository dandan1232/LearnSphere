import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "@/components/markdown-content";

describe("MarkdownContent", () => {
  it("renders common Markdown without executing raw HTML", () => {
    render(
      <MarkdownContent
        content={'## 核心结论\n\n- **第一点**\n- `代码`\n\n[原文](https://example.com)\n\n<script>alert("x")</script>'}
      />,
    );

    expect(screen.getByRole("heading", { name: "核心结论" })).toBeInTheDocument();
    expect(screen.getByText("第一点")).toBeInTheDocument();
    expect(screen.getByText("代码").tagName).toBe("CODE");
    expect(screen.getByRole("link", { name: "原文" })).toHaveAttribute("target", "_blank");
    expect(document.querySelector("script")).not.toBeInTheDocument();
  });
});
