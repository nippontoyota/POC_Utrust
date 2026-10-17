import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildWhatsAppBroadcastMessage, buildTemplatePlaceholders } from "@/lib/panelBrokers";
import { sendDoubleTickWhatsAppBroadcast } from "@/lib/doubletick.server";
import { createVehiclePhotoCollage } from "@/lib/photoCollage.server";

export async function POST(request: Request) {
  try {
    const { caseId, photoIds } = (await request.json().catch(() => ({}))) as {
      caseId?: string;
      photoIds?: string[];
    };

    if (!caseId) {
      return NextResponse.json({ error: "Missing caseId parameter" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Call the database function which enforces:
    // 1. Caller is active PTL/Admin
    // 2. Caller covers the case's branch
    // 3. Case is ready for broker listing
    // 4. One-time broadcast guard (strictly fails if already broadcasted)
    const { data, error: rpcError } = await supabase.rpc(
      "ptl_broadcast_case_to_panel_brokers",
      {
        p_case_id: caseId,
        p_photo_ids: photoIds && photoIds.length > 0 ? photoIds : null,
      }
    );

    if (rpcError || !data) {
      return NextResponse.json(
        { error: rpcError?.message ?? "Broadcast failed in database" },
        { status: 400 }
      );
    }

    const payload = data as {
      success: boolean;
      case_id: string;
      case_ref: string | null;
      branch_name: string;
      branch_code: string;
      make: string | null;
      model: string | null;
      variant: string | null;
      color: string | null;
      registration_year: number | null;
      odometer_km: number | null;
      ownership_count: number | null;
      fuel_type: string | null;
      transmission: string | null;
      vehicle_reg_number: string | null;
      broadcast_at: string;
      photos: { id: string; category: string; storage_path: string }[];
      recipients: { id: string; name: string; mobile: string; place: string }[];
    };

    // Prepare photos for WhatsApp delivery
    // Meta templates only accept 1 media header. If multiple photos are approved,
    // we automatically stitch them into a clean 2x2 grid collage so all angles are visible.
    const service = createServiceClient();
    const individualSignedUrls: string[] = [];

    for (const ph of payload.photos || []) {
      if (ph.storage_path) {
        const { data: signed } = await service.storage
          .from("vehicle-photos")
          .createSignedUrl(ph.storage_path, 604800); // 7-day validity
        if (signed?.signedUrl) {
          individualSignedUrls.push(signed.signedUrl);
        }
      }
    }

    let headerImageUrl: string | undefined = individualSignedUrls[0];

    // If multiple photos approved, stitch them into a clean multi-photo grid
    if (payload.photos && payload.photos.length > 1) {
      try {
        const imageInputs: { buffer: Buffer; category?: string }[] = [];

        for (const ph of payload.photos) {
          if (ph.storage_path) {
            const { data: blob, error: dlErr } = await service.storage
              .from("vehicle-photos")
              .download(ph.storage_path);

            if (!dlErr && blob) {
              const arrayBuffer = await blob.arrayBuffer();
              imageInputs.push({
                buffer: Buffer.from(arrayBuffer),
                category: ph.category,
              });
            }
          }
        }

        if (imageInputs.length > 1) {
          const collageBuffer = await createVehiclePhotoCollage(imageInputs);
          const collagePath = `collages/${payload.case_id}/broadcast-collage.jpg`;

          const { error: upErr } = await service.storage
            .from("vehicle-photos")
            .upload(collagePath, collageBuffer, {
              contentType: "image/jpeg",
              upsert: true,
            });

          if (!upErr) {
            const { data: collageSigned } = await service.storage
              .from("vehicle-photos")
              .createSignedUrl(collagePath, 604800);

            if (collageSigned?.signedUrl) {
              headerImageUrl = collageSigned.signedUrl;
              console.log(
                `Generated and uploaded ${imageInputs.length}-photo collage for case ${payload.case_id}`
              );
            }
          } else {
            console.warn("Collage upload failed, falling back to first photo:", upErr);
          }
        }
      } catch (err) {
        console.warn("Collage generation failed, falling back to first photo:", err);
      }
    }

    const photoUrls: string[] = headerImageUrl ? [headerImageUrl] : [];

    const vehicleParams = {
      make: payload.make,
      model: payload.model,
      variant: payload.variant,
      color: payload.color,
      registration_year: payload.registration_year,
      odometer_km: payload.odometer_km,
      ownership_count: payload.ownership_count,
      fuel_type: payload.fuel_type,
      transmission: payload.transmission,
      vehicle_reg_number: payload.vehicle_reg_number,
      branch_name: payload.branch_name,
      branch_code: payload.branch_code,
      case_ref: payload.case_ref,
      photoCount: payload.photos.length,
    };

    // Construct the clean WhatsApp message text with actual photo count
    const messageText = buildWhatsAppBroadcastMessage(vehicleParams);
    const templatePlaceholders = buildTemplatePlaceholders(vehicleParams);

    // Dispatch via DoubleTick
    const broadcastResult = await sendDoubleTickWhatsAppBroadcast({
      recipients: payload.recipients,
      messageText,
      photoUrls,
      templatePlaceholders,
    });

    return NextResponse.json({
      success: true,
      broadcastAt: payload.broadcast_at,
      sentCount: broadcastResult.sentCount,
      mode: broadcastResult.mode,
      message: broadcastResult.message,
    });
  } catch (err: unknown) {
    console.error("Panel broker broadcast error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
