import "server-only";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

type PushPayload = {
  title: string;
  body: string;
  url: string;
};

// Sends to every subscription a profile has (they may have enabled
// notifications on more than one device) and quietly drops subscriptions the
// push service reports as gone (410/404 -- the browser unsubscribed or the
// endpoint expired) rather than letting one dead subscription break the rest.
export async function sendPushToProfiles(profileIds: string[], payload: PushPayload): Promise<void> {
  if (profileIds.length === 0) return;

  const service = createServiceClient();
  const { data: subscriptions } = await service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("profile_id", profileIds);

  if (!subscriptions || subscriptions.length === 0) return;

  const staleIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await service.from("push_subscriptions").delete().in("id", staleIds);
  }
}
