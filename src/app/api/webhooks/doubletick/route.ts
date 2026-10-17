import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseBrokerBidAmount } from "@/lib/panelBrokers";
import { sendDoubleTickTextMessage, claimBrokerChatForAgent } from "@/lib/doubletick.server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

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

    // Support DoubleTick Bot Studio, Webhook payload, and direct message formats
    const rawFrom =
      body.payload?.customer?.phone ||
      body.payload?.customer?.mobile ||
      body.customer?.phone ||
      body.from ||
      body.sender ||
      body.data?.from ||
      body.data?.sender ||
      body.message?.from ||
      "";

    const rawText =
      body.payload?.message?.text ||
      body.payload?.text ||
      body.text ||
      body.message?.text ||
      body.data?.text ||
      body.data?.message?.text ||
      body.content?.text ||
      (typeof body.message === "string" ? body.message : "") ||
      "";

    const cleanMobile = String(rawFrom).replace(/\D/g, "").slice(-10);

    if (!cleanMobile || cleanMobile.length !== 10) {
      return NextResponse.json(
        { error: "Could not identify 10-digit sender mobile", received: rawFrom },
        { status: 400 }
      );
    }

    if (!rawText.trim()) {
      return NextResponse.json({ ok: true, status: "ignored_empty_message" });
    }

    const service = createServiceClient();

    // Verify sender is one of our panel brokers
    const { data: broker } = await service
      .from("panel_brokers")
      .select("id, name, mobile, place")
      .eq("mobile", cleanMobile)
      .maybeSingle();

    const brokerName = broker?.name || `Broker (${cleanMobile.slice(-4)})`;

    // Ensure broker contact is tagged and assigned to agent in DoubleTick to keep bot suppressed
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
        broker_broadcast_at
      `)
      .in("status", ["listed_for_brokers", "broker_offer_selected"])
      .not("broker_broadcast_at", "is", null)
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

    // If the message does not contain a numeric bid, send a clean guidance reply
    if (!bidAmount) {
      console.log(`DoubleTick Webhook: Received non-bid text from ${cleanMobile}: "${rawText}"`);

      const promptText = `Greetings from Nippon Toyota UTrust.

To submit your purchase quote for the ${vehicleTitle}, please reply directly with your offer amount (e.g., 6,50,000 or 6.5L).`;

      await sendDoubleTickTextMessage({
        toMobile: cleanMobile,
        messageText: promptText,
      });

      return NextResponse.json({
        ok: true,
        status: "prompted_for_bid_amount",
        message: "Prompted broker for numeric quote.",
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
