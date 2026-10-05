"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/formatCurrency";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MOBILE_PATTERN, isValidMobile, normalizeMobile } from "@/lib/validation";
import { VEHICLE_MAKES } from "@/lib/vehicleModels";
import type { Enums, Tables } from "@/lib/supabase/database.types";

type CaseRow = Tables<"cases">;
type PhotoRow = Pick<
  Tables<"case_photos">,
  "id" | "category" | "storage_path" | "file_size_bytes" | "mime_type" | "created_at"
>;
type OfferRow = Tables<"case_offers">;

const REQUIRED_ANGLES: { key: string; label: string }[] = [
  { key: "front", label: "Front" },
  { key: "rear", label: "Rear" },
  { key: "left", label: "Left side" },
  { key: "right", label: "Right side" },
  { key: "interior_odometer", label: "Interior / dashboard (odometer visible)" },
];

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_PHOTOS = 10;
const CURRENT_YEAR = new Date().getFullYear();

export function CaseWorkspace({
  initialCase,
  initialPhotos,
  offer,
}: {
  initialCase: CaseRow;
  initialPhotos: PhotoRow[];
  offer: OfferRow | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const isDraft = initialCase.status === "draft";
  const canWithdraw = ["draft", "pending_evaluation", "pending_customer_decision"].includes(
    initialCase.status
  );

  const [fields, setFields] = useState({
    customer_name: initialCase.customer_name ?? "",
    customer_mobile: initialCase.customer_mobile ?? "",
    vehicle_reg_number: initialCase.vehicle_reg_number ?? "",
    make: initialCase.make ?? "",
    model: initialCase.model ?? "",
    variant: initialCase.variant ?? "",
    registration_year: initialCase.registration_year?.toString() ?? "",
    fuel_type: (initialCase.fuel_type ?? "") as Enums<"fuel_type"> | "",
    transmission: (initialCase.transmission ?? "") as Enums<"transmission_type"> | "",
    odometer_km: initialCase.odometer_km?.toString() ?? "",
    ownership_count: initialCase.ownership_count?.toString() ?? "",
    has_loan: initialCase.has_loan === null ? "" : initialCase.has_loan ? "yes" : "no",
    lender_note: initialCase.lender_note ?? "",
    customer_expected_price: initialCase.customer_expected_price?.toString() ?? "",
  });

  const [photos, setPhotos] = useState<PhotoRow[]>(initialPhotos);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [otherMake, setOtherMake] = useState(false);
  const [otherModel, setOtherModel] = useState(false);
  const models = VEHICLE_MAKES.find(({ make }) => make === fields.make)?.models ?? [];

  function update<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function validateFields(requireComplete: boolean) {
    const required: [keyof typeof fields, string][] = [
      ["customer_name", "Customer name is required."],
      ["customer_mobile", "Customer mobile number is required."],
      ["vehicle_reg_number", "Vehicle registration number is required."],
      ["make", "Make is required."],
      ["model", "Model is required."],
      ["registration_year", "Registration year is required."],
      ["fuel_type", "Fuel type is required."],
      ["transmission", "Transmission is required."],
      ["odometer_km", "Odometer reading is required."],
      ["has_loan", "Loan / hypothecation status is required."],
      ["customer_expected_price", "Customer expected price is required."],
    ];

    if (requireComplete) {
      const missing = required.find(([key]) => !fields[key].toString().trim());
      if (missing) return missing[1];
    }

    if (fields.customer_mobile && !isValidMobile(fields.customer_mobile)) {
      return "Enter a valid 10 digit customer mobile number.";
    }

    const year = Number(fields.registration_year);
    if (fields.registration_year && (!Number.isInteger(year) || year < 1980 || year > CURRENT_YEAR)) {
      return `Registration year must be between 1980 and ${CURRENT_YEAR}.`;
    }

    const odometer = Number(fields.odometer_km);
    if (fields.odometer_km && (!Number.isInteger(odometer) || odometer < 0 || odometer > 999999)) {
      return "Odometer reading must be between 0 and 999999 km.";
    }

    const owners = Number(fields.ownership_count);
    if (fields.ownership_count && (!Number.isInteger(owners) || owners < 1 || owners > 10)) {
      return "Ownership count must be between 1 and 10.";
    }

    const expectedPrice = Number(fields.customer_expected_price);
    if (fields.customer_expected_price && (!Number.isFinite(expectedPrice) || expectedPrice < 1 || expectedPrice > 999999999)) {
      return "Customer expected price must be between INR 1 and INR 99,99,99,999.";
    }

    return null;
  }

  function buildUpdatePayload() {
    return {
      customer_name: fields.customer_name || null,
      customer_mobile: fields.customer_mobile ? normalizeMobile(fields.customer_mobile) : null,
      vehicle_reg_number: fields.vehicle_reg_number ? fields.vehicle_reg_number.trim().toUpperCase().replace(/\s+/g, "") : null,
      make: fields.make || null,
      model: fields.model || null,
      variant: fields.variant.trim() || null,
      registration_year: fields.registration_year ? parseInt(fields.registration_year, 10) : null,
      fuel_type: fields.fuel_type || null,
      transmission: fields.transmission || null,
      odometer_km: fields.odometer_km ? parseInt(fields.odometer_km, 10) : null,
      ownership_count: fields.ownership_count ? parseInt(fields.ownership_count, 10) : null,
      has_loan: fields.has_loan === "" ? null : fields.has_loan === "yes",
      lender_note: fields.lender_note || null,
      customer_expected_price: fields.customer_expected_price ? parseFloat(fields.customer_expected_price) : null,
    };
  }

  async function saveDraft({ requireComplete = false } = {}): Promise<boolean> {
    setSaving(true);
    setError(null);
    setSavedMessage(false);

    const validationError = validateFields(requireComplete);
    if (validationError) {
      setSaving(false);
      setError(validationError);
      return false;
    }

    const payload = buildUpdatePayload();

    const { error: updateError } = await supabase.from("cases").update(payload).eq("id", initialCase.id);

    setSaving(false);

    if (updateError) {
      setError(
        updateError.message.includes("uniq_open_vehicle_reg")
          ? "A case for this vehicle registration number already exists and is still open."
          : updateError.message
      );
      return false;
    }

    if (payload.vehicle_reg_number !== null) {
      setFields((f) => ({ ...f, vehicle_reg_number: payload.vehicle_reg_number! }));
    }

    setSavedMessage(true);
    return true;
  }

  async function handleFileSelect(file: File, category: string) {
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Each photo must be 5MB or smaller.");
      return;
    }
    if (category !== "rc_book" && photos.filter(p => p.category !== "rc_book").length >= MAX_TOTAL_PHOTOS) {
      setError(`You can upload at most ${MAX_TOTAL_PHOTOS} vehicle photos, plus the RC book photo.`);
      return;
    }

    setUploadingCategory(category);

    const isRequiredSlot = category === "rc_book" || REQUIRED_ANGLES.some((a) => a.key === category);
    if (isRequiredSlot) {
      const existing = photos.find((p) => p.category === category);
      if (existing) {
        await supabase.storage.from("vehicle-photos").remove([existing.storage_path]);
        await supabase.from("case_photos").delete().eq("id", existing.id);
        setPhotos((prev) => prev.filter((p) => p.id !== existing.id));
      }
    }

    const ext = file.name.split(".").pop() ?? "jpg";
    const photoId = crypto.randomUUID();
    const path = `${initialCase.id}/${photoId}.${ext}`;

    const { error: uploadError } = await supabase.storage.from("vehicle-photos").upload(path, file);
    if (uploadError) {
      setError(uploadError.message);
      setUploadingCategory(null);
      return;
    }

    const { data: photoRow, error: insertError } = await supabase
      .from("case_photos")
      .insert({
        case_id: initialCase.id,
        storage_path: path,
        category,
        is_plate_visible: category === "front" || category === "rear",
        file_size_bytes: file.size,
        mime_type: file.type,
        uploaded_by: initialCase.sales_officer_id,
      })
      .select("id, category, storage_path, file_size_bytes, mime_type, created_at")
      .single();

    setUploadingCategory(null);

    if (insertError || !photoRow) {
      await supabase.storage.from("vehicle-photos").remove([path]);
      setError(insertError?.message ?? "Failed to record photo");
      return;
    }

    setPhotos((prev) => [...prev, photoRow]);
  }

  async function removePhoto(photo: PhotoRow) {
    await supabase.storage.from("vehicle-photos").remove([photo.storage_path]);
    await supabase.from("case_photos").delete().eq("id", photo.id);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
  }

  async function handleSubmit() {
    const saved = await saveDraft({ requireComplete: true });
    if (!saved) return;

    setSubmitting(true);
    setError(null);

    const { error: submitError } = await supabase.rpc("submit_case_for_evaluation", {
      p_case_id: initialCase.id,
    });

    setSubmitting(false);

    if (submitError) {
      setError(submitError.message);
      return;
    }

    router.refresh();
  }

  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    null | "accept" | "reject" | "close" | "cancel" | "withdraw"
  >(null);
  const [reasonText, setReasonText] = useState("");

  async function runDecision(
    fn: () => PromiseLike<{ error: { message: string } | null }>,
    onSuccess?: () => void
  ) {
    setDecisionSubmitting(true);
    const { error: rpcError } = await fn();
    setDecisionSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setPendingAction(null);
    setReasonText("");
    if (onSuccess) onSuccess();
    else router.refresh();
  }

  function confirmAccept() {
    runDecision(() =>
      supabase.rpc("record_customer_decision", { p_case_id: initialCase.id, p_decision: "accepted" })
    );
  }

  function confirmReject(consent: boolean) {
    runDecision(() =>
      supabase.rpc("record_customer_decision", {
        p_case_id: initialCase.id,
        p_decision: "rejected",
        p_broker_consent: consent,
      })
    );
  }

  function confirmClose() {
    runDecision(() => supabase.rpc("close_case", { p_case_id: initialCase.id }));
  }

  function confirmCancel() {
    if (!reasonText.trim()) {
      setError("A reason is required.");
      return;
    }
    runDecision(() => supabase.rpc("cancel_case", { p_case_id: initialCase.id, p_reason: reasonText }));
  }

  function confirmWithdraw() {
    if (!reasonText.trim()) {
      setError("A reason is required.");
      return;
    }
    runDecision(
      () => supabase.rpc("withdraw_case", { p_case_id: initialCase.id, p_reason: reasonText }),
      () => router.push("/so/cases")
    );
  }

  const additionalPhotos = photos.filter((p) => p.category === "other");
  const totalPhotos = photos.filter(p => p.category !== "rc_book").length;
  const rcBookPhoto = photos.find(p => p.category === "rc_book");
  const requiredFilled = REQUIRED_ANGLES.every((a) => photos.some((p) => p.category === a.key));
  const canSubmit = requiredFilled && totalPhotos >= 6 && !!rcBookPhoto && !submitting && !uploadingCategory;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/so/cases"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> My Cases
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {initialCase.case_ref ?? "New Case (Draft)"}
          </h1>
        </div>
        <StatusBadge status={initialCase.status} />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}

      <Card>
        <CardTitle>Customer &amp; Vehicle Details</CardTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Customer name" required>
            <input
              type="text"
              disabled={!isDraft}
              value={fields.customer_name}
              onChange={(e) => update("customer_name", e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Customer mobile number" required>
            <input
              type="tel"
              disabled={!isDraft}
              inputMode="numeric"
              pattern={MOBILE_PATTERN}
              title="Enter a 10 digit mobile number."
              value={fields.customer_mobile}
              onChange={(e) => update("customer_mobile", normalizeMobile(e.target.value))}
              className={inputClass}
            />
          </FormField>
          <FormField label="Vehicle registration number" required>
            <input
              type="text"
              disabled={!isDraft}
              value={fields.vehicle_reg_number}
              onChange={(e) => update("vehicle_reg_number", e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Make" required>
            <select
              disabled={!isDraft}
              value={otherMake ? "__other__" : fields.make}
              onChange={(e) => {
                const isOther = e.target.value === "__other__";
                setOtherMake(isOther);
                setOtherModel(false);
                setFields((f) => ({ ...f, make: isOther ? "" : e.target.value, model: "", variant: "" }));
              }}
              className={inputClass}
            >
              <option value="">Select make...</option>
              {fields.make && !otherMake && !VEHICLE_MAKES.some(({ make }) => make === fields.make) && (
                <option value={fields.make}>{fields.make}</option>
              )}
              {VEHICLE_MAKES.map(({ make }) => <option key={make} value={make}>{make}</option>)}
              <option value="__other__">Other make</option>
            </select>
          </FormField>
          {otherMake && (
            <FormField label="Other make" required>
              <input
                type="text"
                disabled={!isDraft}
                value={fields.make}
                onChange={(e) => setFields((f) => ({ ...f, make: e.target.value, model: "", variant: "" }))}
                placeholder="Enter make"
                className={inputClass}
              />
            </FormField>
          )}
          <FormField label="Model" required>
            <select
              disabled={!isDraft || !fields.make.trim()}
              value={otherModel ? "__other__" : fields.model}
              onChange={(e) => {
                const isOther = e.target.value === "__other__";
                setOtherModel(isOther);
                setFields((f) => ({ ...f, model: isOther ? "" : e.target.value, variant: "" }));
              }}
              className={inputClass}
            >
              <option value="">{fields.make.trim() ? "Select model..." : "Select make first"}</option>
              {fields.model && !otherModel && !models.includes(fields.model) && (
                <option value={fields.model}>{fields.model}</option>
              )}
              {models.map((model) => <option key={model} value={model}>{model}</option>)}
              <option value="__other__">Other model</option>
            </select>
          </FormField>
          {otherModel && (
            <FormField label="Other model" required>
              <input
                type="text"
                disabled={!isDraft || !fields.make.trim()}
                value={fields.model}
                onChange={(e) => update("model", e.target.value)}
                placeholder="Enter model"
                className={inputClass}
              />
            </FormField>
          )}
          <FormField label="Variant">
            <input
              type="text"
              disabled={!isDraft}
              value={fields.variant}
              onChange={(e) => update("variant", e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </FormField>
          <FormField label="Registration year" required>
            <input
              type="number"
              disabled={!isDraft}
              min={1980}
              max={CURRENT_YEAR}
              step={1}
              value={fields.registration_year}
              onChange={(e) => update("registration_year", e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Fuel type" required>
            <select
              disabled={!isDraft}
              value={fields.fuel_type}
              onChange={(e) => update("fuel_type", e.target.value as Enums<"fuel_type">)}
              className={inputClass}
            >
              <option value="">Select...</option>
              <option value="petrol">Petrol</option>
              <option value="diesel">Diesel</option>
              <option value="cng">CNG</option>
              <option value="electric">Electric</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </FormField>
          <FormField label="Transmission" required>
            <select
              disabled={!isDraft}
              value={fields.transmission}
              onChange={(e) => update("transmission", e.target.value as Enums<"transmission_type">)}
              className={inputClass}
            >
              <option value="">Select...</option>
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
            </select>
          </FormField>
          <FormField label="Odometer reading (km)" required>
            <input
              type="number"
              disabled={!isDraft}
              min={0}
              max={999999}
              step={1}
              value={fields.odometer_km}
              onChange={(e) => update("odometer_km", e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Ownership count">
            <input
              type="number"
              disabled={!isDraft}
              min={1}
              max={10}
              step={1}
              value={fields.ownership_count}
              onChange={(e) => update("ownership_count", e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Loan / hypothecation status" required>
            <select
              disabled={!isDraft}
              value={fields.has_loan}
              onChange={(e) => update("has_loan", e.target.value)}
              className={inputClass}
            >
              <option value="">Select...</option>
              <option value="no">No active loan</option>
              <option value="yes">Active loan</option>
            </select>
          </FormField>
          {fields.has_loan === "yes" && (
            <FormField label="Lender note">
              <input
                type="text"
                disabled={!isDraft}
                value={fields.lender_note}
                onChange={(e) => update("lender_note", e.target.value)}
                className={inputClass}
                placeholder="Lender name / details"
              />
            </FormField>
          )}
          <FormField label="Customer expected price (INR)" required>
            <input
              type="number"
              disabled={!isDraft}
              min={1}
              max={999999999}
              step={1}
              value={fields.customer_expected_price}
              onChange={(e) => update("customer_expected_price", e.target.value)}
              className={inputClass}
            />
          </FormField>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Vehicle Photos</h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          5 required angles, plus at least 1 more (minimum 6, maximum {MAX_TOTAL_PHOTOS} total). Max 5MB per photo.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {REQUIRED_ANGLES.map((angle) => {
            const photo = photos.find((p) => p.category === angle.key);
            return (
              <PhotoSlot
                key={angle.key}
                label={angle.label}
                photo={photo}
                disabled={!isDraft}
                uploading={uploadingCategory === angle.key}
                onSelect={(file) => handleFileSelect(file, angle.key)}
                onRemove={photo && isDraft ? () => removePhoto(photo) : undefined}
              />
            );
          })}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Additional photos ({additionalPhotos.length}/{MAX_TOTAL_PHOTOS - REQUIRED_ANGLES.length})
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {additionalPhotos.map((photo) => (
              <PhotoSlot
                key={photo.id}
                label="Additional"
                photo={photo}
                disabled={!isDraft}
                uploading={false}
                onSelect={() => {}}
                onRemove={isDraft ? () => removePhoto(photo) : undefined}
              />
            ))}
            {isDraft && totalPhotos < MAX_TOTAL_PHOTOS && (
              <PhotoSlot
                label="Add photo"
                photo={undefined}
                disabled={false}
                uploading={uploadingCategory === "other"}
                onSelect={(file) => handleFileSelect(file, "other")}
              />
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>RC Book Photo <span className="text-red-500">*</span></CardTitle>
        <div className="max-w-sm">
          <PhotoSlot
            label="Registration certificate"
            photo={rcBookPhoto}
            disabled={!isDraft || !!uploadingCategory || submitting}
            uploading={uploadingCategory === "rc_book"}
            onSelect={(file) => handleFileSelect(file, "rc_book")}
            onRemove={rcBookPhoto && isDraft && !uploadingCategory && !submitting ? () => removePhoto(rcBookPhoto) : undefined}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Required before evaluation. Image only, up to 5MB. Private to authorized staff.</p>
      </Card>

      {initialCase.status === "pending_customer_decision" && offer && (
        <Card>
          <CardTitle>Nippon&apos;s Offer</CardTitle>
          <p className="mb-4 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatINR(offer.offer_price)}
          </p>

          {pendingAction === "accept" ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
              <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
                Confirm the customer has accepted Nippon&apos;s offer?
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={confirmAccept}
                  disabled={decisionSubmitting}
                  className="bg-green-700 hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-600"
                >
                  {decisionSubmitting ? "Recording..." : "Yes, confirm"}
                </Button>
                <Button variant="secondary" onClick={() => setPendingAction(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : pendingAction === "reject" ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
                Does the customer consent to listing this vehicle with brokers?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => confirmReject(true)}
                  disabled={decisionSubmitting}
                  className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
                >
                  Yes, list with brokers
                </Button>
                <Button variant="destructive" onClick={() => confirmReject(false)} disabled={decisionSubmitting}>
                  No, do not list
                </Button>
                <Button variant="secondary" onClick={() => setPendingAction(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button
                onClick={() => setPendingAction("accept")}
                className="bg-green-700 hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-600"
              >
                Customer Accepted
              </Button>
              <Button variant="destructive" onClick={() => setPendingAction("reject")}>
                Customer Rejected
              </Button>
            </div>
          )}
        </Card>
      )}

      {initialCase.status === "purchase_completion_pending" && (
        <Card>
          <CardTitle>Purchase Completion</CardTitle>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Customer accepted on {initialCase.customer_decision_at && new Date(initialCase.customer_decision_at).toLocaleString("en-IN")}.
            Once payment and paperwork are complete, close the case.
          </p>

          {pendingAction === "close" ? (
            <div className="rounded-md border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
              <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">Mark this case as closed? This is final.</p>
              <div className="flex gap-2">
                <Button onClick={confirmClose} disabled={decisionSubmitting}>
                  {decisionSubmitting ? "Closing..." : "Yes, close it"}
                </Button>
                <Button variant="secondary" onClick={() => setPendingAction(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : pendingAction === "cancel" ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Reason for cancelling
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                rows={2}
                className={`mb-3 w-full ${inputClass}`}
              />
              <div className="flex gap-2">
                <Button variant="destructive" onClick={confirmCancel} disabled={decisionSubmitting}>
                  {decisionSubmitting ? "Cancelling..." : "Confirm cancellation"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPendingAction(null);
                    setReasonText("");
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button onClick={() => setPendingAction("close")}>Mark as Closed</Button>
              <Button variant="destructive" onClick={() => setPendingAction("cancel")}>
                Cancel Deal
              </Button>
            </div>
          )}
        </Card>
      )}

      {initialCase.status === "rejected_not_listed" && (
        <Card className="text-sm text-zinc-600 dark:text-zinc-400">
          Customer rejected Nippon&apos;s offer and did not consent to broker listing. This case is closed out.
        </Card>
      )}

      {initialCase.status === "listed_for_brokers" && (
        <Card className="border-amber-200 bg-amber-50 text-sm text-zinc-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-zinc-300">
          Customer rejected Nippon&apos;s offer and consented to broker listing. This case is now listed on the
          broker marketplace (Phase 5).
        </Card>
      )}

      {initialCase.status === "closed" && (
        <Card className="border-green-200 bg-green-50 text-sm text-zinc-700 dark:border-green-900 dark:bg-green-950/30 dark:text-zinc-300">
          Closed on {initialCase.closed_at && new Date(initialCase.closed_at).toLocaleString("en-IN")}.
        </Card>
      )}

      {initialCase.status === "cancelled" && (
        <Card className="border-red-200 bg-red-50 text-sm text-zinc-700 dark:border-red-900 dark:bg-red-950/30 dark:text-zinc-300">
          Cancelled: {initialCase.cancelled_reason}
        </Card>
      )}

      {initialCase.status === "withdrawn" && (
        <Card className="text-sm text-zinc-700 dark:text-zinc-300">Withdrawn: {initialCase.withdrawn_reason}</Card>
      )}

      {isDraft && (
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => void saveDraft()} disabled={saving}>
            {saving ? "Saving..." : "Save Draft"}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={!canSubmit ? "Upload the RC book photo and at least 6 vehicle photos, including all required angles" : undefined}
          >
            {submitting ? "Submitting..." : "Submit for Evaluation"}
          </Button>
          {savedMessage && <span className="text-sm text-green-600 dark:text-green-400">Saved.</span>}
        </div>
      )}

      {canWithdraw && (
        <div>
          {pendingAction === "withdraw" ? (
            <div className="max-w-sm rounded-md border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Reason for withdrawing
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                rows={2}
                className={`mb-3 w-full ${inputClass}`}
              />
              <div className="flex gap-2">
                <Button variant="destructive" onClick={confirmWithdraw} disabled={decisionSubmitting}>
                  {decisionSubmitting ? "Withdrawing..." : "Confirm withdrawal"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPendingAction(null);
                    setReasonText("");
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setPendingAction("withdraw")}
              className="text-sm text-red-600 hover:underline dark:text-red-400"
            >
              Withdraw this case
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PhotoSlot({
  label,
  photo,
  disabled,
  uploading,
  onSelect,
  onRemove,
}: {
  label: string;
  photo?: PhotoRow;
  disabled: boolean;
  uploading: boolean;
  onSelect: (file: File) => void;
  onRemove?: () => void;
}) {
  const [thumbnail, setThumbnail] = useState<{ id: string; url: string } | null>(null);
  const thumbUrl = thumbnail?.id === photo?.id ? thumbnail?.url : null;

  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    fetch(`/api/photos/${photo.id}/signed-url`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.url) setThumbnail({ id: photo.id, url: data.url });
      })
      .catch(() => { if (!cancelled) setThumbnail(null); });
    return () => {
      cancelled = true;
    };
  }, [photo]);

  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</p>
      {photo ? (
        <div className="space-y-1">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt={label} className="h-20 w-full rounded object-cover" />
          ) : (
            <div className="h-20 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          )}
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {(photo.file_size_bytes / 1024).toFixed(0)} KB
          </p>
          {onRemove && (
            <button
              onClick={onRemove}
              className="inline-flex items-center gap-0.5 text-xs text-red-600 hover:underline dark:text-red-400"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          )}
        </div>
      ) : (
        <label
          className={`flex h-20 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed text-xs ${
            disabled
              ? "border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700"
              : "border-zinc-300 text-zinc-500 hover:border-blue-400 hover:bg-blue-50/50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-blue-500 dark:hover:bg-blue-950/20"
          }`}
        >
          <Camera className="h-4 w-4" strokeWidth={1.5} />
          {uploading ? "Uploading..." : "Take photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label={`Take photo: ${label}`}
            disabled={disabled || uploading}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onSelect(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
