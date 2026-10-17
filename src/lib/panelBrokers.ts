/**
 * Panel Brokers & WhatsApp Bidding utilities
 */

export type PanelBroker = {
  id: string;
  name: string;
  mobile: string;
  place: string;
  branch_code: string;
  is_active: boolean;
  is_test: boolean;
};

export type PanelBrokerBid = {
  id: string;
  broker_name: string;
  broker_mobile: string;
  place?: string;
  bid_amount: number;
  raw_message: string;
  received_at: string;
};

export type VehicleBroadcastDetails = {
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
  branch_name: string;
  branch_code: string;
  case_ref?: string | null;
};

/**
 * Masks a vehicle registration number to show only the RTO series,
 * with the rest replaced by asterisks.
 * E.g., "KL07DJ2574" -> "KL 07 ** ****"
 */
export function maskVehicleRegNumber(regNumber: string | null | undefined): string {
  if (!regNumber) return "—";
  const clean = regNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  
  // Standard Indian plate: 2 letters (State) + 2 digits (RTO) + series + 4 digits
  const standardMatch = clean.match(/^([A-Z]{2})(\d{2})(.*)$/);
  if (standardMatch) {
    const state = standardMatch[1];
    const rto = standardMatch[2];
    const remainder = standardMatch[3];
    const stars = remainder.length > 4 ? `** ${"*".repeat(Math.min(4, remainder.length - 2))}` : "****";
    return `${state} ${rto} ${stars}`;
  }

  // Bharat series (e.g. 22BH1234AA): 2 digits + 2 letters + rest
  const bhMatch = clean.match(/^(\d{2})([A-Z]{2})(.*)$/);
  if (bhMatch) {
    return `${bhMatch[1]} ${bhMatch[2]} ** ****`;
  }

  // Fallback: show first 4 chars and star the rest
  return clean.slice(0, 4) + " " + "*".repeat(Math.max(4, clean.length - 4));
}

/**
 * Formats ownership count: e.g. 1 -> "1st Owner", 2 -> "2nd Owner"
 */
export function formatVehicleOwnership(count: number | null | undefined): string {
  if (!count) return "1st Owner";
  if (count === 1) return "1st Owner";
  if (count === 2) return "2nd Owner";
  if (count === 3) return "3rd Owner";
  return `${count}th Owner`;
}

/**
 * Constructs the clean WhatsApp alert copy matching the approved Meta template
 */
export function buildWhatsAppBroadcastMessage(
  details: VehicleBroadcastDetails & { photoCount?: number }
): string {
  const vehicleName = [details.registration_year, details.make, details.model, details.variant]
    .filter(Boolean)
    .join(" ");

  const fuel = details.fuel_type
    ? details.fuel_type.charAt(0).toUpperCase() + details.fuel_type.slice(1).toLowerCase()
    : "Petrol";

  const transmission = details.transmission
    ? details.transmission.charAt(0).toUpperCase() + details.transmission.slice(1).toLowerCase()
    : "Automatic";

  const kms = details.odometer_km != null
    ? `${details.odometer_km.toLocaleString("en-IN")} km`
    : "—";

  const maskedReg = maskVehicleRegNumber(details.vehicle_reg_number);
  const ownership = formatVehicleOwnership(details.ownership_count);
  const color = details.color || "Standard";
  const photoCount = details.photoCount ?? 4;

  return `Greetings from Nippon Toyota UTrust. A new trade-in exchange car is now open for panel broker bidding from our ${details.branch_name} (${details.branch_code}) branch.

Vehicle Specifications:
• Vehicle Model: ${vehicleName}
• Exterior Colour: ${color}
• Registration Number: ${maskedReg}
• Year of Manufacture: ${details.registration_year ?? "—"}
• Total Kilometers Driven: ${kms}
• Registered Ownership: ${ownership}
• Engine Fuel and Transmission: ${fuel} | ${transmission}

Attached: ${photoCount} inspection photos with number plates concealed.

Kindly review the vehicle details above and reply directly to this message with your best purchase price quote.`;
}

/**
 * Builds the 9 variables required by the approved utrust_tradein_alert Meta template
 */
export function buildTemplatePlaceholders(
  details: VehicleBroadcastDetails & { photoCount?: number }
): string[] {
  const vehicleName = [details.registration_year, details.make, details.model, details.variant]
    .filter(Boolean)
    .join(" ");

  const fuel = details.fuel_type
    ? details.fuel_type.charAt(0).toUpperCase() + details.fuel_type.slice(1).toLowerCase()
    : "Petrol";

  const transmission = details.transmission
    ? details.transmission.charAt(0).toUpperCase() + details.transmission.slice(1).toLowerCase()
    : "Automatic";

  const kms = details.odometer_km != null
    ? `${details.odometer_km.toLocaleString("en-IN")} km`
    : "—";

  const maskedReg = maskVehicleRegNumber(details.vehicle_reg_number);
  const ownership = formatVehicleOwnership(details.ownership_count);
  const color = details.color || "Standard";
  const photoCount = String(details.photoCount ?? 4);

  return [
    `${details.branch_name} (${details.branch_code})`,
    vehicleName,
    color,
    maskedReg,
    String(details.registration_year ?? "—"),
    kms,
    ownership,
    `${fuel} | ${transmission}`,
    photoCount,
  ];
}

/**
 * Parses a broker's reply into a clean numeric bid amount.
 * Handles formats: "650000", "6,50,000", "6.5L", "6.5 Lakh", "650k", etc.
 */
export function parseBrokerBidAmount(text: string): number | null {
  if (!text || typeof text !== "string") return null;
  const cleaned = text.trim().toLowerCase();

  // Pattern for Lakhs: e.g. "6.5l", "6.5 lakh", "6.50 lakhs", "6l"
  const lakhMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|l)\b/);
  if (lakhMatch) {
    const num = parseFloat(lakhMatch[1]);
    if (!isNaN(num) && num > 0) {
      return Math.round(num * 100000);
    }
  }

  // Pattern for Thousands: e.g. "650k"
  const kMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*k\b/);
  if (kMatch) {
    const num = parseFloat(kMatch[1]);
    if (!isNaN(num) && num > 0) {
      return Math.round(num * 1000);
    }
  }

  // Pattern for full number with optional commas, currency symbols, or trailing dashes: e.g. "₹6,50,000", "650000", "650000/-"
  const numberMatch = cleaned.match(/(?:rs\.?|inr|₹)?\s*([0-9,]{4,10})(?:\s*\/-\b)?/);
  if (numberMatch) {
    const digitsOnly = numberMatch[1].replace(/,/g, "");
    const amount = parseInt(digitsOnly, 10);
    if (!isNaN(amount) && amount >= 10000 && amount <= 500000000) {
      return amount;
    }
  }

  // Pattern for standalone decimal representing Lakhs (e.g. "6.5", "6.75", "7.25")
  const decimalMatch = cleaned.match(/(?:^|[^\d.])([0-9]{1,2}\.[0-9]{1,2})(?:$|[^\d.])/);
  if (decimalMatch) {
    const num = parseFloat(decimalMatch[1]);
    if (!isNaN(num) && num >= 0.5 && num <= 99.99) {
      return Math.round(num * 100000);
    }
  }

  return null;
}
