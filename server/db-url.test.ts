import { describe, expect, it } from "vitest";
import { decodedSchemaOf, isProductionSchemaUrl } from "@shared/dbUrl";

describe("decodedSchemaOf", () => {
  it("reads a plain schema", () => {
    expect(decodedSchemaOf("mysql://u:p@h:3307/sugi_staging")).toBe("sugi_staging");
    expect(decodedSchemaOf("mysql://u:p@h:3307/defaultdb?ssl-mode=REQUIRED")).toBe("defaultdb");
  });
  it("sees through percent-encoding, case and slashes", () => {
    expect(decodedSchemaOf("mysql://u:p@h/%64efaultdb")).toBe("defaultdb");
    expect(decodedSchemaOf("mysql://u:p@h/DefaultDB/")).toBe("defaultdb");
    expect(decodedSchemaOf("mysql://u:p@h//defaultdb")).toBe("defaultdb");
    expect(decodedSchemaOf("mysql://u:p@h")).toBe("");
  });
  it("throws on garbage (callers fail closed)", () => {
    expect(() => decodedSchemaOf("not a url")).toThrow();
    expect(() => decodedSchemaOf("mysql://u:p@h/%E0%A4%A")).toThrow();
  });
  it("flags every spelling of a production schema", () => {
    for (const url of ["mysql://u:p@h/%64efaultdb", "mysql://u:p@h/DefaultDB/", "mysql://u:p@h/MYSQL", "mysql://u:p@h/sys"]) {
      expect(isProductionSchemaUrl(url), url).toBe(true);
    }
    expect(isProductionSchemaUrl("mysql://u:p@h/sugi_staging")).toBe(false);
  });
});
