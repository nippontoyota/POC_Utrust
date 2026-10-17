import "server-only";

export type DoubleTickRecipient = {
  name: string;
  mobile: string;
};

export type DoubleTickBroadcastPayload = {
  recipients: DoubleTickRecipient[];
  messageText: string;
  photoUrls?: string[];
  templatePlaceholders?: string[];
};

export type DoubleTickBroadcastResult = {
  success: boolean;
  sentCount: number;
  mode: "live" | "simulated";
  message?: string;
};

let cachedOrgContext: { wabaNumber: string; agentPhone?: string } | null = null;

/**
 * Discovers the active WABA number and an agent phone number from DoubleTick
 * to enable automatic chat assignment and suppress the Welcome Bot.
 */
async function getDoubleTickOrgContext(
  apiKey: string
): Promise<{ wabaNumber: string; agentPhone?: string } | null> {
  if (cachedOrgContext) return cachedOrgContext;

  const envWaba = process.env.DOUBLETICK_WABA_NUMBER;
  const envAgent = process.env.DOUBLETICK_ASSIGNED_AGENT_PHONE;
  if (envWaba && envAgent) {
    cachedOrgContext = {
      wabaNumber: envWaba.replace(/\D/g, ""),
      agentPhone: envAgent.replace(/\D/g, ""),
    };
    return cachedOrgContext;
  }

  let discoveredWaba = envWaba ? envWaba.replace(/\D/g, "") : "";
  let discoveredAgent = envAgent ? envAgent.replace(/\D/g, "") : "";

  try {
    if (!discoveredWaba) {
      const channelRes = await fetch("https://public.doubletick.io/organization/channel/profile", {
        headers: { Authorization: apiKey, Accept: "application/json" },
      });
      if (channelRes.ok) {
        const data = await channelRes.json();
        const list = Array.isArray(data) ? data : data.channels || data.data || [];
        if (list.length > 0) {
          discoveredWaba = String(
            list[0].wabaNumber || list[0].phone || list[0].channelNumber || ""
          ).replace(/\D/g, "");
        }
      }
    }

    if (!discoveredAgent) {
      const teamRes = await fetch("https://public.doubletick.io/team", {
        headers: { Authorization: apiKey, Accept: "application/json" },
      });
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        const members = Array.isArray(teamData)
          ? teamData
          : teamData.team || teamData.members || teamData.data || [];
        if (members.length > 0) {
          discoveredAgent = String(
            members[0].phone || members[0].userPhoneNumber || members[0].mobile || ""
          ).replace(/\D/g, "");
        }
      }
    }

    if (discoveredWaba) {
      cachedOrgContext = { wabaNumber: discoveredWaba, agentPhone: discoveredAgent || undefined };
      return cachedOrgContext;
    }
  } catch (err) {
    console.warn("Could not discover DoubleTick org context:", err);
  }

  return null;
}

/**
 * Programmatically claims a broker's chat for a human agent in DoubleTick.
 * This sets the conversation state to "Assigned to Agent" and assigns the "Panel_Broker" tag,
 * which suppresses DoubleTick's automated Welcome Bot from firing when brokers reply.
 */
export async function claimBrokerChatForAgent(params: {
  brokerMobile: string;
  brokerName?: string;
}): Promise<void> {
  const apiKey = process.env.DOUBLETICK_API_KEY;
  if (!apiKey) return;

  const cleanMobile = params.brokerMobile.trim().replace(/\D/g, "").slice(-10);
  if (!cleanMobile || cleanMobile.length !== 10) return;
  const customerPhone = `91${cleanMobile}`;

  try {
    const org = await getDoubleTickOrgContext(apiKey);
    const headers = {
      Authorization: apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // 1. Assign tags and agent phone via /customer/assign-tags-custom-fields
    await fetch("https://public.doubletick.io/customer/assign-tags-custom-fields", {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: customerPhone,
        name: params.brokerName || `Broker (${cleanMobile.slice(-4)})`,
        tags: ["Panel_Broker", "UTrust"],
        ...(org?.wabaNumber ? { wabaNumber: org.wabaNumber } : {}),
        ...(org?.agentPhone ? { agentPhone: org.agentPhone } : {}),
      }),
    }).catch((e) => console.warn("DoubleTick assign tags warning:", e));

    // 2. If an agent phone and WABA number are present, assign to agent
    if (org?.wabaNumber && org?.agentPhone) {
      await fetch("https://public.doubletick.io/customer/assign", {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerPhoneNumber: customerPhone,
          assignedUserPhoneNumber: org.agentPhone,
          wabaNumber: org.wabaNumber,
        }),
      }).catch((e) => console.warn("DoubleTick customer assign warning:", e));
    }
  } catch (err) {
    console.warn("Could not claim broker chat in DoubleTick:", err);
  }
}

/**
 * Ensures our webhook URL is registered in DoubleTick for incoming broker messages.
 */
export async function ensureDoubleTickWebhookRegistered(): Promise<void> {
  const apiKey = process.env.DOUBLETICK_API_KEY;
  if (!apiKey) return;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://poc-utrust.vercel.app");

  const webhookEndpoint = `${appUrl.replace(/\/$/, "")}/api/webhooks/doubletick`;

  try {
    const org = await getDoubleTickOrgContext(apiKey);
    const wabaNumber = org?.wabaNumber || "919744712345";

    await fetch("https://public.doubletick.io/v2/webhook/register", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        name: "UTrust Panel Broker Webhook",
        method: "POST",
        url: webhookEndpoint,
        wabaNumbers: [wabaNumber],
        webhookEvents: ["MESSAGE_RECEIVED", "MESSAGE_STATUS_UPDATE"],
      }),
    });
  } catch (err) {
    console.warn("Could not register DoubleTick webhook:", err);
  }
}

/**
 * Dispatches WhatsApp broadcasts via DoubleTick API using approved Meta template.
 * When DOUBLETICK_API_KEY is not configured, it operates in simulated mode.
 */
export async function sendDoubleTickWhatsAppBroadcast(
  payload: DoubleTickBroadcastPayload
): Promise<DoubleTickBroadcastResult> {
  const apiKey = process.env.DOUBLETICK_API_KEY;

  const validRecipients = payload.recipients.filter((r) => /^[6-9]\d{9}$/.test(r.mobile.trim()));

  if (validRecipients.length === 0) {
    return {
      success: false,
      sentCount: 0,
      mode: apiKey ? "live" : "simulated",
      message: "No valid 10-digit recipients found.",
    };
  }

  // Simulated mode when API key is not yet set
  if (!apiKey) {
    console.log("--------------------------------------------------");
    console.log("DOUBLETICK WHATSAPP SIMULATED BROADCAST");
    console.log(
      `Recipients (${validRecipients.length}):`,
      validRecipients.map((r) => `${r.name} (+91${r.mobile})`).join(", ")
    );
    console.log("Message Content:\n", payload.messageText);
    if (payload.photoUrls && payload.photoUrls.length > 0) {
      console.log(`Photos Attached (${payload.photoUrls.length}):`, payload.photoUrls);
    }
    console.log("--------------------------------------------------");

    return {
      success: true,
      sentCount: validRecipients.length,
      mode: "simulated",
      message: `Simulated broadcast sent to ${validRecipients.length} test brokers. Set DOUBLETICK_API_KEY for live delivery.`,
    };
  }

  // Live DoubleTick REST API dispatch using approved Meta template: utrust_tradein_alert
  try {
    // Ensure DoubleTick webhook is registered to receive broker quotes
    ensureDoubleTickWebhookRegistered().catch(() => {});

    // Pre-claim all broker chats so DoubleTick marks them as human-handled and suppresses the Welcome Bot
    await Promise.allSettled(
      validRecipients.map((r) =>
        claimBrokerChatForAgent({
          brokerMobile: r.mobile,
          brokerName: r.name,
        })
      )
    );
    const formattedMessages = validRecipients.map((r) => ({
      to: `91${r.mobile.trim().replace(/^(\+91|91)/, "")}`,
      content: {
        templateName: "utrust_tradein_alert",
        language: "en",
        templateData: {
          header: {
            type: "IMAGE",
            mediaUrl:
              payload.photoUrls?.[0] ||
              "https://data-storage.doubletick.io/org_qU8khMlhs6/templates/d9754ee9-ef38-47ed-9926-011647691549.png",
          },
          body: {
            placeholders: payload.templatePlaceholders || [],
          },
        },
      },
    }));

    const response = await fetch("https://public.doubletick.io/whatsapp/message/template", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages: formattedMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DoubleTick Template API Error:", response.status, errorText);
      return {
        success: false,
        sentCount: 0,
        mode: "live",
        message: `DoubleTick API error: ${response.statusText}`,
      };
    }


    return {
      success: true,
      sentCount: validRecipients.length,
      mode: "live",
      message: `Dispatched live via approved Meta template to ${validRecipients.length} panel brokers.`,
    };
  } catch (err: unknown) {
    console.error("DoubleTick dispatch network exception:", err);
    return {
      success: false,
      sentCount: 0,
      mode: "live",
      message: err instanceof Error ? err.message : "Network error contacting DoubleTick",
    };
  }
}

/**
 * Sends a direct WhatsApp text message via DoubleTick API.
 * Used for instant broker quote acknowledgments and confirmations within the 24h session window.
 */
export async function sendDoubleTickTextMessage(params: {
  toMobile: string;
  messageText: string;
}): Promise<{ success: boolean; message?: string }> {
  const apiKey = process.env.DOUBLETICK_API_KEY;
  const cleanMobile = params.toMobile.trim().replace(/\D/g, "").slice(-10);

  if (!cleanMobile || cleanMobile.length !== 10) {
    return { success: false, message: "Invalid 10-digit mobile number" };
  }

  const formattedPhone = `91${cleanMobile}`;

  if (!apiKey) {
    console.log("--------------------------------------------------");
    console.log("DOUBLETICK WHATSAPP SIMULATED TEXT MESSAGE");
    console.log(`To: +${formattedPhone}`);
    console.log(`Text:\n${params.messageText}`);
    console.log("--------------------------------------------------");
    return { success: true, message: "Simulated text message" };
  }

  try {
    const response = await fetch("https://public.doubletick.io/whatsapp/message/text", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: formattedPhone,
        content: {
          text: params.messageText,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("DoubleTick Text API Error:", response.status, errText);
      return { success: false, message: `DoubleTick API error: ${response.statusText}` };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("DoubleTick text message network exception:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Network error contacting DoubleTick",
    };
  }
}

