import { describe, expect, it } from "vitest";
import { screenTextWithModel, TOXIC_THRESHOLD } from "./_core/moderationModel";

/**
 * Exercises the in-process multilingual toxicity model for real. Gated:
 * the first run downloads ~179MB of weights into MODERATION_MODEL_DIR, so
 * CI and everyday `pnpm test` skip it. Run locally with
 *   RUN_MODEL_TESTS=1 pnpm exec vitest run server/moderation-model.test.ts
 */
const describeWithModel = process.env.RUN_MODEL_TESTS === "1" ? describe : describe.skip;

describeWithModel("moderation model (multilingual BERT via ONNX)", () => {
  it("flags insults in English, Russian, Chinese and Japanese without a swear-word list", { timeout: 300_000 }, async () => {
    process.env.NODE_ENV = "development"; // the model is off under NODE_ENV=test
    for (const text of ["You are a worthless piece of garbage and so is your shop", "Ты полное ничтожество, продавец тупой", "你这个白痴废物", "お前は本当にクズだ"]) {
      const verdict = await screenTextWithModel(text);
      expect(verdict, text).not.toBeNull();
      expect(verdict!.score, text).toBeGreaterThanOrEqual(TOXIC_THRESHOLD);
    }
  });

  it("lets civil negative reviews through", { timeout: 300_000 }, async () => {
    process.env.NODE_ENV = "development";
    for (const text of ["The cream did nothing for my skin, waste of money.", "Доставка опоздала на два дня, но товар хороший.", "包装很好，但是味道太浓了。"]) {
      const verdict = await screenTextWithModel(text);
      expect(verdict, text).not.toBeNull();
      expect(verdict!.toxic, text).toBe(false);
    }
  });
});
