import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MailPanel } from "./SystemPanels";

const dashboard = {
  updatedAt: "2026-10-25T12:00:00.000Z",
  summary: {
    attention: 1, pending: 0, processing: 0, sent24h: 0,
    unknown: 0, failed: 1, expired: 0, deliveryFailures24h: 0,
  },
  outbox: [{
    id: "sample-id", category: "AUTH", createdAt: "2026-10-25T12:00:00Z",
    attempts: 1, status: "FAILED", code: null,
  }],
  attempts: [], events: [],
};
const render = (data: unknown) => renderToStaticMarkup(
  <MailPanel data={data} onRefresh={() => undefined} />,
);

describe("admin mail monitoring DTO, safe rendering", () => {
  it("renders valid redacted queue status and all counters", () => {
    const html = render(dashboard);
    expect(html).toContain("Почта и алерты");
    expect(html).toContain("AUTH");
    expect(html).toContain("sample-id");
    expect(html).toContain("Отказы доставки");
    expect(html).not.toContain("undefined");
  });
  it("renders an error instead of crashing for invalid numeric metrics", () => {
    const invalid = { ...dashboard, summary: { ...dashboard.summary, pending: undefined } };
    expect(render(invalid)).toContain("Некорректный формат почтового мониторинга");
  });
  it("rejects malformed queue rows without surfacing raw database error data", () => {
    const invalid = { ...dashboard, outbox: [{ ...dashboard.outbox[0], attempts: "invalid" }] };
    expect(render(invalid)).toContain("Некорректный формат почтового мониторинга");
  });
  it("rejects null or arrays as top-level dashboard", () => {
    expect(render(null)).toContain("Некорректный формат почтового мониторинга");
    expect(render([])).toContain("Некорректный формат почтового мониторинга");
  });
});
