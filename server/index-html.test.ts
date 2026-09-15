import { describe, expect, it } from "vitest";
import { escapeAttribute, escapeJsString } from "./_core/indexHtml";
import { checkStoreSettingFormat, getStoreSettingFormat, storeSettingSlots, fillTemplate, tokensIn, type StoreSettingKey } from "@shared/store-settings";
import { siteTextSlots } from "@shared/site-text";

/**
 * The index.html substitution (2026-09-12) is the one place in this app
 * where admin-typed text is written into a document as raw markup rather
 * than rendered by React, which escapes for us. Two different contexts --
 * an HTML attribute and a JavaScript string literal -- need two different
 * escapes, and getting either wrong turns the SEO panel into a way for a
 * marketing-role account to inject script into every page of the site.
 */
describe("index.html escaping", () => {
  describe("escapeAttribute", () => {
    it("neutralises a quote that would otherwise close the attribute", () => {
      expect(escapeAttribute(`" onload="alert(1)`)).toBe("&quot; onload=&quot;alert(1)");
    });

    it("neutralises tag delimiters", () => {
      expect(escapeAttribute("<script>x</script>")).toBe("&lt;script&gt;x&lt;/script&gt;");
    });

    it("escapes the ampersand first, so an escape is never double-decoded", () => {
      // Naively escaping "<" before "&" would turn "&lt;" into "&amp;lt;"
      // only if & ran second -- this asserts the order that avoids it.
      expect(escapeAttribute("Tom & Co <b>")).toBe("Tom &amp; Co &lt;b&gt;");
    });

    it("leaves ordinary Mongolian copy untouched", () => {
      const copy = "Японоос баталгаат бүтээгдэхүүнийг 4 салбараар хүргэнэ.";
      expect(escapeAttribute(copy)).toBe(copy);
    });
  });

  describe("escapeJsString", () => {
    it("escapes a quote so the consent-manager config stays parseable", () => {
      expect(escapeJsString('say "hi"')).toBe('say \\"hi\\"');
    });

    it("escapes a backslash", () => {
      expect(escapeJsString("a\\b")).toBe("a\\\\b");
    });

    it("turns a real newline into an escape rather than breaking the literal", () => {
      expect(escapeJsString("line1\nline2")).toBe("line1\\nline2");
      expect(escapeJsString("line1\nline2")).not.toContain("\n");
    });

    it("neutralises a closing script tag that would end the inline block early", () => {
      const escaped = escapeJsString("</script><script>alert(1)</script>");
      expect(escaped).not.toContain("</script");
      expect(escaped).toContain("<\\/script");
    });

    it("neutralises a closing script tag whatever its casing", () => {
      expect(escapeJsString("</SCRIPT>")).not.toMatch(/<\/script/i);
    });

    it("round-trips: what the browser parses back is exactly what the admin typed", () => {
      for (const value of ['a "quoted" word', "back\\slash", "line\nbreak", "</script>", "Күкийн тохиргоо"]) {
        expect(JSON.parse(`"${escapeJsString(value)}"`)).toBe(value);
      }
    });
  });
});

/**
 * Email templates carry {tokens}. The server rejects a token a slot has not
 * declared (server/routers.ts's updateStoreSetting), which is only safe if
 * the shipped defaults themselves obey that rule -- otherwise the very
 * first "save" of an untouched field would fail.
 */
describe("store-setting templates", () => {
  it("fills declared tokens", () => {
    expect(fillTemplate("Захиалга {захиалга} шинэчлэгдлээ", { "{захиалга}": "AB12CD" })).toBe("Захиалга AB12CD шинэчлэгдлээ");
  });

  it("fills every occurrence, not just the first", () => {
    expect(fillTemplate('"{бараа}" ба "{бараа}"', { "{бараа}": "Diane" })).toBe('"Diane" ба "Diane"');
  });

  it("leaves an unfilled token visible rather than blanking it", () => {
    expect(fillTemplate("Сайн байна уу, {нэр}!", {})).toBe("Сайн байна уу, {нэр}!");
  });

  it("finds the tokens in a template", () => {
    expect(tokensIn("SUGI — Захиалга {захиалга}: {төлөв}")).toEqual(["{захиалга}", "{төлөв}"]);
    expect(tokensIn("Ямар ч орлуулгагүй мөр")).toEqual([]);
  });

  it("every shipped default only uses tokens its own slot declares", () => {
    const offenders = storeSettingSlots.flatMap(slot => {
      const allowed: readonly string[] = ("tokens" in slot ? slot.tokens : []) ?? [];
      return tokensIn(slot.fallbackValue)
        .filter(token => !allowed.includes(token))
        .map(token => `${slot.key} uses undeclared ${token}`);
    });
    expect(offenders).toEqual([]);
  });
});

/**
 * The registries are the contract between the admin UI and every consumer:
 * a duplicate key would make one of the two entries unreachable (the admin
 * panel renders both, but reads resolve to whichever the Map kept).
 */
describe("slot registries", () => {
  it("has no duplicate site-text slot keys", () => {
    const keys = siteTextSlots.map(slot => slot.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("has no duplicate store-setting keys", () => {
    const keys = storeSettingSlots.map(slot => slot.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("gives every slot a group and a label, so nothing renders unlabelled in /admin", () => {
    for (const slot of siteTextSlots) {
      expect(slot.group, slot.key).toBeTruthy();
      expect(slot.label, slot.key).toBeTruthy();
      expect(slot.fallbackValue, slot.key).toBeTruthy();
    }
    for (const slot of storeSettingSlots) {
      expect(slot.group, slot.key).toBeTruthy();
      expect(slot.label, slot.key).toBeTruthy();
      // An identifier slot (Search Console / Meta verification, GA4, Pixel;
      // 2026-09-14) is legitimately empty until the admin pastes a value --
      // empty means "no tag", which is the correct default.
      expect(typeof slot.fallbackValue, slot.key).toBe("string");
    }
  });
});

/**
 * 2026-09-15. Before the slot registry carried a `format`, the GA4/Pixel
 * regexes existed only inside indexHtml.ts's renderer, which silently
 * substituted "" for anything malformed. The result was the worst kind of
 * failure: the save succeeded with a green toast and the tag then never
 * loaded, with nothing in /admin to show why. These tests pin the single
 * source of truth so the admin screen, the mutation and the renderer cannot
 * drift apart again.
 */
describe("store setting formats", () => {
  it("compiles every declared pattern, and its own example passes it", () => {
    for (const slot of storeSettingSlots) {
      const format = getStoreSettingFormat(slot.key);
      if (!format) continue;
      expect(() => new RegExp(format.pattern, format.flags), slot.key).not.toThrow();
      expect(checkStoreSettingFormat(slot.key, format.example), slot.key).toBeNull();
      expect(format.message.trim().length, slot.key).toBeGreaterThan(10);
    }
  });

  it("accepts a real GA4 id and rejects the ways it is usually mistyped", () => {
    const key: StoreSettingKey = "analytics-ga4-measurement-id";
    for (const good of ["G-ABCD1234", "g-abcd1234", "  G-XYZ98765  "]) expect(checkStoreSettingFormat(key, good), good).toBeNull();
    // A GTM container id, the property number, the whole snippet, a typo:
    // every one of these used to save green and then never load.
    for (const bad of ["GTM-ABCD123", "UA-12345-1", "123456789", "G-", "nope", "<script>gtag</script>"]) {
      expect(checkStoreSettingFormat(key, bad), bad).toBeTruthy();
    }
  });

  it("accepts a real Meta pixel id and rejects non-numeric input", () => {
    const key: StoreSettingKey = "analytics-meta-pixel-id";
    for (const good of ["123456789012345", " 987654321098765 "]) expect(checkStoreSettingFormat(key, good), good).toBeNull();
    for (const bad of ["G-ABCD1234", "12345", "12345678901234567890123", "pixel-123", "123 456"]) {
      expect(checkStoreSettingFormat(key, bad), bad).toBeTruthy();
    }
  });

  it("never rejects an empty value: clearing is how a tag is switched off", () => {
    expect(checkStoreSettingFormat("analytics-ga4-measurement-id", "")).toBeNull();
    expect(checkStoreSettingFormat("analytics-meta-pixel-id", "   ")).toBeNull();
  });

  it("leaves slots without a declared format alone", () => {
    expect(getStoreSettingFormat("contact-phone")).toBeNull();
    expect(checkStoreSettingFormat("contact-phone", "ямар ч утга")).toBeNull();
  });

  it("uses the same regexes the renderer blanks with", () => {
    // indexHtml.ts now calls checkStoreSettingFormat rather than carrying its
    // own copy; this asserts the shapes it relied on are still the ones in
    // the registry, so a future edit to either cannot silently diverge.
    expect(getStoreSettingFormat("analytics-ga4-measurement-id")?.pattern).toBe("^G-[A-Z0-9]{4,20}$");
    expect(getStoreSettingFormat("analytics-meta-pixel-id")?.pattern).toBe("^[0-9]{6,20}$");
  });
});
