// apps/web/src/routes/timeline/TimelineRail.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineRailDot, TimelineRailLine } from "./TimelineRail";

describe("TimelineRailDot", () => {
  it("renders the gold highlight variant when today=true", () => {
    const { container } = render(<TimelineRailDot today={true} />);
    expect(container.querySelector('[class*="lr-gold-500"]')).not.toBeNull();
  });

  it("renders the neutral variant when today=false", () => {
    const { container } = render(<TimelineRailDot today={false} />);
    expect(container.querySelector('[class*="lr-gold-500"]')).toBeNull();
    expect(container.querySelector('[class*="lr-border"]')).not.toBeNull();
  });
});

describe("TimelineRailLine", () => {
  it("renders a single absolutely-positioned element", () => {
    const { container } = render(<TimelineRailLine />);
    const el = container.firstElementChild;
    expect(el).not.toBeNull();
    expect(el?.className).toContain("absolute");
  });
});
