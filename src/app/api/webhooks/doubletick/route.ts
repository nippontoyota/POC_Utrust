import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseBrokerBidAmount } from "@/lib/panelBrokers";
import {
  sendDoubleTickTextMessage,
  claimBrokerChatForAgent,
  ALLOWED_PANEL_BROKER_TEST_MOBILES,
} from "@/lib/doubletick.server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    console.log("DoubleTick Webhook received:", JSON.stringify(body));

    // Ignore delivery status events (SENT, DELIVERED, READ) to prevent echo loops
    const eventType = String(body.event || body.type || "").toUpperCase();
    if (
      eventType.includes("STATUS") ||
      eventType.includes("DELIVERED") ||
      eventType.includes("SENT") ||
      eventType.includes("READ") ||
      eventType.includes("FAILED")
    ) {
      return NextResponse.json({ ok: true, ignored: `Delivery event ${eventType}` });
    }

    // Helper to safely extract phone string from various formats (string or object with phone/mobile)
    const extractPhone = (val: unknown): string => {
      if (!val) return "";
      if (typeof val === "string" || typeof val === "number") return String(val);
      if (typeof val === "object" && val !== null) {
        const obj = val as Record<string, unknown>;
        return String(obj.phone || obj.mobile || obj.phoneNumber || obj.from || "");
      }
      return "";
    };

    // Extract sender phone from DoubleTick payload (supports sender.phone, chatId, customer.phone, etc.)
    const rawFrom =
      extractPhone(body.payload?.sender) ||
      extractPhone(body.payload?.customer) ||
      extractPhone(body.data?.sender) ||
      extractPhone(body.data?.customer) ||
      extractPhone(body.sender) ||
      extractPhone(body.customer) ||
      extractPhone(body.from) ||
      extractPhone(body.data?.from) ||
      extractPhone(body.payload?.chatId) ||
      extractPhone(body.message?.from) ||
      "";

    // Extract text from DoubleTick payload (handling string, { body: ... }, and nested text)
    let rawText = "";
    const msgObj = body.payload?.message || body.data?.message || body.message;
    if (typeof msgObj?.text === "string") {
      rawText = msgObj.text;
    } else if (msgObj?.text?.body && typeof msgObj.text.body === "string") {
      rawText = msgObj.text.body;
    } else if (typeof msgObj?.body === "string") {
      rawText = msgObj.body;
    } else if (typeof body.payload?.text === "string") {
      rawText = body.payload.text;
    } else if (body.payload?.text?.body && typeof body.payload.text.body === "string") {
      rawText = body.payload.text.body;
    } else if (typeof body.data?.text === "string") {
      rawText = body.data.text;
    } else if (body.data?.text?.body && typeof body.data.text.body === "string") {
      rawText = body.data.text.body;
    } else if (typeof body.text === "string") {
      rawText = body.text;
    } else if (typeof body.message?.text === "string") {
      rawText = body.message.text;
    } else if (body.message?.text?.body && typeof body.message.text.body === "string") {
      rawText = body.message.text.body;
    } else if (typeof body.content?.text === "string") {
      rawText = body.content.text;
    } else if (typeof body.message === "string") {
      rawText = body.message;
    }

    const cleanMobile = String(rawFrom).replace(/\D/g, "").slice(-10);

    if (!cleanMobile || cleanMobile.length !== 10) {
      return NextResponse.json(
        { error: "Could not identify 10-digit sender mobile", received: rawFrom },
        { status: 400 }
      );
    }

    // STRICTEST HARD STOP: If the incoming message is NOT from one of our 3 test numbers,
    // EXIT IMMEDIATELY. Do not query database, do not tag, do not assign, do not reply.
    if (!ALLOWED_PANEL_BROKER_TEST_MOBILES.has(cleanMobile)) {
      return NextResponse.json({ ok: true, status: "ignored_non_whitelisted_number" });
    }

    if (!rawText.trim()) {
      return NextResponse.json({ ok: true, status: "ignored_empty_message" });
    }

    const service = createServiceClient();

    // STRICT GUARD: Verify sender is an active registered panel broker in our database.
    // If the sender is NOT a registered panel broker (e.g. regular Nippon Toyota retail customer),
    // immediately exit. Do NOT tag, do NOT assign, and do NOT reply under any circumstance!
    const { data: broker } = await service
      .from("panel_brokers")
      .select("id, name, mobile, place, is_active")
      .eq("mobile", cleanMobile)
      .eq("is_active", true)
      .maybeSingle();

    if (!broker) {
      console.log(`DoubleTick Webhook: Ignored incoming message from non-broker customer (${cleanMobile})`);
      return NextResponse.json({ ok: true, status: "ignored_non_broker_customer" });
    }

    const brokerName = broker.name;

    // Ensure verified broker contact is tagged and assigned to agent in DoubleTick
    claimBrokerChatForAgent({
      brokerMobile: cleanMobile,
      brokerName,
    }).catch(() => {});

    // Find the relevant broadcasted case.
    // 1. If message contains a case ref fragment (e.g. "0024"), match directly.
    // 2. Otherwise match the most recently broadcasted open case.
    const { data: openCases } = await service
      .from("cases")
      .select(`
        id,
        case_ref,
        make,
        model,
        variant,
        registration_year,
        broker_broadcast_at,
        status
      `)
      .not("broker_broadcast_at", "is", null)
      .neq("status", "broker_deal_closed")
      .neq("status", "withdrawn")
      .order("broker_broadcast_at", { ascending: false })
      .limit(5);

    if (!openCases || openCases.length === 0) {
      return NextResponse.json({
        ok: true,
        status: "no_active_case",
        message: "No open broadcasted cases found to attach bid to.",
      });
    }

    let targetCase = openCases[0];

    // Check if broker mentioned a specific case ref
    for (const c of openCases) {
      if (c.case_ref) {
        const shortSuffix = c.case_ref.split("-").pop();
        if (shortSuffix && rawText.includes(shortSuffix)) {
          targetCase = c;
          break;
        }
      }
    }

    // Build vehicle display title: e.g. "2023 Volkswagen Taigun"
    const vehicleTitle =
      [
        targetCase.registration_year,
        targetCase.make,
        targetCase.model,
        targetCase.variant,
      ]
        .filter(Boolean)
        .join(" ") || "Trade-in Vehicle";

    const bidAmount = parseBrokerBidAmount(rawText);

    // If the message does not contain a numeric bid, do NOT send any prompt. Silently ignore.
    if (!bidAmount) {
      console.log(`DoubleTick Webhook: Ignored non-bid text from broker ${cleanMobile}: "${rawText}"`);
      return NextResponse.json({
        ok: true,
        status: "ignored_non_numeric_text",
      });
    }

    // Check if broker previously submitted a bid for this case
    const { data: existingBid } = await service
      .from("panel_broker_bids")
      .select("id, bid_amount")
      .eq("case_id", targetCase.id)
      .eq("broker_mobile", cleanMobile)
      .maybeSingle();

    // Enforce strict one-quote policy: each broker may submit only ONE quote per vehicle
    if (existingBid) {
      const formattedExisting = `₹${Number(existingBid.bid_amount).toLocaleString("en-IN")}`;
      console.log(
        `DoubleTick Webhook: Broker ${brokerName} (${cleanMobile}) attempted secondary bid ₹${bidAmount} on case ${targetCase.case_ref || targetCase.id}. Initial bid ${formattedExisting} is locked.`
      );

      const alreadyRecordedText = `Thank you. Your quote of ${formattedExisting} for the ${vehicleTitle} has already been recorded.\n\nOnly one quote is accepted per vehicle. Our team will contact you if your offer is selected.`;

      await sendDoubleTickTextMessage({
        toMobile: cleanMobile,
        messageText: alreadyRecordedText,
      });

      return NextResponse.json({
        ok: true,
        status: "quote_already_recorded",
        message: "Only one quote is accepted per vehicle. Initial quote preserved.",
        existingAmount: existingBid.bid_amount,
        attemptedAmount: bidAmount,
      });
    }

    // Call the database function to record the one-time bid
    const { data: result, error: rpcError } = await service.rpc("record_panel_broker_bid", {
      p_case_id: targetCase.id,
      p_mobile: cleanMobile,
      p_bid_amount: bidAmount,
      p_raw_text: rawText,
    });

    if (rpcError) {
      console.error("Error saving panel broker bid:", rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    console.log(
      `DoubleTick Webhook: Saved initial bid ₹${bidAmount.toLocaleString("en-IN")} from ${brokerName} (${cleanMobile}) on case ${targetCase.case_ref || targetCase.id}`
    );

    // Send instantaneous WhatsApp thank you acknowledgment
    const formattedAmount = `₹${bidAmount.toLocaleString("en-IN")}`;
    const thankYouText = `Thank you! We have received and recorded your quote of ${formattedAmount} for the ${vehicleTitle}.\n\nOur team will contact you if your offer is selected.`;

    await sendDoubleTickTextMessage({
      toMobile: cleanMobile,
      messageText: thankYouText,
    });

    return NextResponse.json({
      success: true,
      bidAmount,
      brokerName,
      caseId: targetCase.id,
      caseRef: targetCase.case_ref,
      acknowledgedViaWhatsApp: true,
    });
  } catch (err: unknown) {
    console.error("DoubleTick webhook error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal webhook error" },
      { status: 500 }
    );
  }
}

// GET handler for DoubleTick webhook verification / health checks
export async function GET() {
  return NextResponse.json({ status: "DoubleTick webhook endpoint active" });
}
