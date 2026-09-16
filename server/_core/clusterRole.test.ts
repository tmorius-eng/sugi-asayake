import { afterEach, describe, expect, it } from "vitest";
import { describeClusterRole, isBackgroundJobRunner } from "./clusterRole";

const KEYS = ["RUN_BACKGROUND_JOBS", "NODE_APP_INSTANCE"] as const;
const original = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

function setEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const key of KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("isBackgroundJobRunner", () => {
  // Хамгийн чухал тохиолдол: одоогийн production (pm2 fork горим, гараар
  // `node dist/index.js`, `pnpm dev`, тест) — зан төлөв өөрчлөгдөөгүй байх ёстой.
  it("нэг процессын үед (хувьсагчгүй) эзэмшинэ", () => {
    setEnv({});
    expect(isBackgroundJobRunner()).toBe(true);
    expect(describeClusterRole()).toContain("ЭНД");
  });

  it("pm2 cluster: зөвхөн instance 0 эзэмшинэ", () => {
    setEnv({ NODE_APP_INSTANCE: "0" });
    expect(isBackgroundJobRunner()).toBe(true);
    setEnv({ NODE_APP_INSTANCE: "1" });
    expect(isBackgroundJobRunner()).toBe(false);
    setEnv({ NODE_APP_INSTANCE: "7" });
    expect(isBackgroundJobRunner()).toBe(false);
  });

  it("RUN_BACKGROUND_JOBS нь instance дугаарыг дарна", () => {
    setEnv({ NODE_APP_INSTANCE: "3", RUN_BACKGROUND_JOBS: "1" });
    expect(isBackgroundJobRunner()).toBe(true);
    setEnv({ NODE_APP_INSTANCE: "0", RUN_BACKGROUND_JOBS: "0" });
    expect(isBackgroundJobRunner()).toBe(false);
  });

  // pm2 нь хувьсагчийг заримдаа хоосон мөрөөр дамжуулдаг; хоосон нь "тохируулаагүй".
  it("хоосон утгыг тохируулаагүйтэй адилтгана", () => {
    setEnv({ NODE_APP_INSTANCE: "  ", RUN_BACKGROUND_JOBS: "" });
    expect(isBackgroundJobRunner()).toBe(true);
  });

  it("тайлбарын мөр аль instance болохыг нэрлэнэ", () => {
    setEnv({ NODE_APP_INSTANCE: "2" });
    expect(describeClusterRole()).toBe("pm2 instance 2: ард ажиллах ажлууд ӨӨР instance дээр");
  });
});
