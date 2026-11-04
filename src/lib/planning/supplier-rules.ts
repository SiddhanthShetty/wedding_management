import type { WeddingSupplier } from "@/lib/data/suppliers";

export type SupplierFilters = {
  query?: string;
  status?: string;
  category?: string;
  shortlistOnly?: boolean;
};

export function filterSuppliers(suppliers: WeddingSupplier[], filters: SupplierFilters): WeddingSupplier[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  return suppliers.filter((supplier) => {
    if (filters.status && filters.status !== "all" && supplier.status !== filters.status) return false;
    if (filters.category && filters.category !== "all" && supplier.category !== filters.category) return false;
    if (filters.shortlistOnly && !["shortlisted", "selected"].includes(supplier.status)) return false;
    if (!query) return true;
    return [supplier.name, supplier.category, supplier.contact_person, supplier.source]
      .some((value) => value.toLocaleLowerCase().includes(query));
  });
}

export type ComparisonRow = { label: string; values: string[] };

export function compareSuppliers(suppliers: WeddingSupplier[]): ComparisonRow[] {
  const known = (value: string | number | null | undefined) => value === null || value === undefined || value === "" ? "Unknown" : String(value);
  const policy = (value: string | undefined) => ({
    unknown: "Unknown", allowed: "Allowed", not_allowed: "Not allowed", conditional: "Conditional",
  }[value ?? "unknown"] ?? "Unknown");
  const latestAvailability = (supplier: WeddingSupplier) => supplier.requested_dates[0];
  const fields: Array<[string, (supplier: WeddingSupplier) => string]> = [
    ["Category", (supplier) => supplier.category],
    ["Status", (supplier) => supplier.status.replaceAll("_", " ")],
    ["Responsible partner", (supplier) => supplier.responsible_name ?? "Unassigned"],
    ["Contact", (supplier) => supplier.contact_person || "Unknown"],
    ["Website", (supplier) => supplier.website_url ?? "Unknown"],
    ["Map", (supplier) => supplier.map_url ?? "Unknown"],
    ["Latest quote total", (supplier) => {
      const quote = supplier.quotes[0];
      return quote ? quote.total_amount === null ? `Not provided (${quote.currency})` : `${quote.currency} ${quote.total_amount.toFixed(2)}` : "No quote yet";
    }],
    ["Latest quote line items", (supplier) => supplier.quotes[0]?.items
      .map((item) => `${item.label}: ${item.amount === null ? "Unknown" : `${supplier.quotes[0]?.currency} ${item.amount.toFixed(2)}`}`)
      .join("; ") || "No quote line items"],
    ["Latest quote includes", (supplier) => supplier.quotes[0]?.includes || "Unknown"],
    ["Latest quote excludes", (supplier) => supplier.quotes[0]?.excludes || "Unknown"],
    ["Quote expiry", (supplier) => supplier.quotes[0]?.expires_on ?? "Unknown"],
    ["Latest requested date", (supplier) => {
      const availability = latestAvailability(supplier);
      return availability ? `${availability.requested_date} · ${availability.availability_status.replaceAll("_", " ")}` : "Unknown";
    }],
    ["Latest availability checked", (supplier) => latestAvailability(supplier)?.checked_at ?? "Unknown"],
    ["Event spaces and capacity", (supplier) => supplier.spaces.filter((space) => !space.archived_at)
      .map((space) => `${space.name} (${known(space.capacity)})`).join(", ") || "Unknown"],
    ["Catering", (supplier) => supplier.venue ? supplier.venue.catering_notes || "Unknown" : "Not applicable"],
    ["Outside vendors", (supplier) => supplier.venue ? supplier.venue.outside_vendor_notes || "Unknown" : "Not applicable"],
    ["Parking", (supplier) => supplier.venue ? supplier.venue.parking_notes || "Unknown" : "Not applicable"],
    ["Accessibility", (supplier) => supplier.venue ? supplier.venue.accessibility_notes || "Unknown" : "Not applicable"],
    ["Pet policy", (supplier) => supplier.venue ? policy(supplier.venue.pet_policy) : "Not applicable"],
    ["Alcohol policy", (supplier) => supplier.venue ? policy(supplier.venue.alcohol_policy) : "Not applicable"],
    ["Music policy", (supplier) => supplier.venue ? policy(supplier.venue.music_policy) : "Not applicable"],
    ["Weather backup", (supplier) => supplier.venue
      ? [supplier.venue.weather_backup_space || "Unknown", supplier.venue.weather_backup_capacity === null ? "capacity unknown" : `capacity ${supplier.venue.weather_backup_capacity}`].join(" · ")
      : "Not applicable"],
  ];
  return fields.map(([label, value]) => ({ label, values: suppliers.map(value) }));
}
