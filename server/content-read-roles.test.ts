import { describe, expect, it } from "vitest";
import { CONTENT_READ_ROLES, isContentReadRole } from "../shared/face-auth";

describe("isContentReadRole", () => {
  it("admin, staff and marketing may preview drafts", () => {
    for (const role of CONTENT_READ_ROLES) expect(isContentReadRole(role)).toBe(true);
    expect(CONTENT_READ_ROLES).toEqual(["admin", "staff", "marketing"]);
  });

  it("finance, warehouse, customers and anonymous may not", () => {
    for (const role of ["finance", "warehouse", "user", "", null, undefined]) expect(isContentReadRole(role)).toBe(false);
  });
});
