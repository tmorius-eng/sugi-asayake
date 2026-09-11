import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { NTFY_DEFAULT_SERVER_URL } from "../shared/integrations";
import { buildNotificationMessage, feedGroupForRole, groupsForRole, NOTIFICATION_GROUP_LABELS, NOTIFICATION_GROUPS, NTFY_TOPIC_FIELD } from "../shared/notification-events";
import { getIntegrationSettings, getNotificationFeed, logAdminAction, markNotificationsSeen } from "./db";
import { sendNtfyTest } from "./notifications";
import { checkRateLimit } from "./_core/security";
import { anyStaffProcedure, router } from "./_core/trpc";

/**
 * Per-staff-member notification endpoints (2026-09-11): the admin top bar's
 * bell, and the "Утасны мэдэгдэл" screen where each person subscribes their
 * phone. Admin-only setup (topics, the outbox, test sends to any group) lives
 * with the other integration endpoints in server/routers.ts.
 */
export const notificationsRouter = router({
  // The bell. Only the caller's own group's rows -- a store consultant never
  // sees finance events, and vice versa.
  feed: anyStaffProcedure.query(async ({ ctx }) => {
    const group = feedGroupForRole(ctx.user.role);
    if (!group) return { group: null, items: [], unreadCount: 0, lastSeenId: null };
    return { group, ...(await getNotificationFeed(ctx.user.id, group)) };
  }),

  markSeen: anyStaffProcedure.input(z.object({ upToId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await markNotificationsSeen(ctx.user.id, input.upToId);
    return { ok: true };
  }),

  /**
   * The topics for the CALLER's own groups, so they can subscribe their
   * phone. This is a deliberate, narrow exception to "integration settings
   * are write-only": subscribing is impossible without the topic name, and
   * each person only ever receives the topics of groups they already belong
   * to by role. Admin belongs to every group.
   */
  mySubscriptions: anyStaffProcedure.query(async ({ ctx }) => {
    const current = await getIntegrationSettings("ntfy");
    const serverUrl = (current?.settings.serverUrl || NTFY_DEFAULT_SERVER_URL).replace(/\/+$/, "");
    const host = serverUrl.replace(/^https?:\/\//, "");
    return {
      configured: Boolean(current),
      active: Boolean(current?.isActive),
      serverUrl,
      groups: groupsForRole(ctx.user.role).map(group => {
        const topic = current?.settings[NTFY_TOPIC_FIELD[group]] ?? null;
        return {
          group,
          label: NOTIFICATION_GROUP_LABELS[group],
          topic,
          webUrl: topic ? `${serverUrl}/${topic}` : null,
          // Opens the subscribe dialog in the ntfy Android app.
          appUrl: topic ? `ntfy://${host}/${topic}` : null,
        };
      }),
    };
  }),

  // Lets anyone check their own phone is set up. Rate-limited per user:
  // every press is a real push to everyone in that group.
  sendTestToMyGroup: anyStaffProcedure.input(z.object({ group: z.enum(NOTIFICATION_GROUPS) })).mutation(async ({ ctx, input }) => {
    if (!groupsForRole(ctx.user.role).includes(input.group)) throw new TRPCError({ code: "FORBIDDEN", message: "Энэ бүлэгт та хамаарахгүй." });
    const limit = checkRateLimit("ntfyTest", `user:${ctx.user.id}`, 5, 10 * 60 * 1000);
    if (!limit.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Хэт олон туршилт илгээлээ. ${limit.retryAfterSeconds} секундын дараа дахин оролдоно уу.` });
    const result = await sendNtfyTest(input.group, { ...buildNotificationMessage("integration.test", { groupLabel: NOTIFICATION_GROUP_LABELS[input.group] }), priority: 3, tags: ["bell"] });
    await logAdminAction({ actorUserId: ctx.user.id, action: "notifications.test_sent", entityType: "integration", metadata: { group: input.group, ok: result.ok } });
    return { ok: result.ok, error: result.error };
  }),
});
