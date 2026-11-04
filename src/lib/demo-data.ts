// Synthetic preview records only. These are not real wedding data and are not persisted.
export const demoFunctions = [
  { name: "Welcome dinner", date: "2027-06-17T18:00:00+01:00", venue: "The Glasshouse", status: "Confirmed" as const },
  { name: "Wedding ceremony", date: "2027-06-18T14:30:00+01:00", venue: "Rosewood Garden", status: "Confirmed" as const },
  { name: "Evening reception", date: "2027-06-18T18:00:00+01:00", venue: "Rosewood Garden", status: "Tentative" as const },
];

export const demoTasks = [
  { title: "Review sample menu options", detail: "Welcome dinner · Planning", due: "Due in 2 days", status: "Pending" as const },
  { title: "Compare sample venue notes", detail: "Ceremony · Venues", due: "Due Friday", status: "Pending" as const },
  { title: "Confirm sample timeline", detail: "Reception · Schedule", due: "Completed", status: "Complete" as const },
];

export const demoGuests = [
  { name: "Avery Morgan", household: "Morgan household", invited: "2 of 3 functions", response: "Responded", status: "Confirmed" as const },
  { name: "Jordan Lee", household: "Lee household", invited: "3 of 3 functions", response: "Awaiting response", status: "Pending" as const },
  { name: "Casey Patel", household: "Patel household", invited: "1 of 3 functions", response: "Responded", status: "Confirmed" as const },
  { name: "Riley Chen", household: "Chen household", invited: "2 of 3 functions", response: "Awaiting response", status: "Pending" as const },
];

export const demoVendors = [
  { name: "Cedar & Stem Studio", category: "Florals", function: "Ceremony", status: "Shortlisted" as const, amount: 3200 },
  { name: "North Coast Kitchen", category: "Catering", function: "Welcome dinner", status: "Quote received" as const, amount: 7800 },
  { name: "Quiet Light Photo", category: "Photography", function: "Wedding day", status: "Tentative" as const, amount: 4600 },
];

export const demoCosts = [
  { name: "Venue estimate", category: "Venue", amount: 12500, status: "Estimated" as const },
  { name: "Catering sample quote", category: "Food & drink", amount: 7800, status: "Tentative" as const },
  { name: "Photography sample booking", category: "Photography", amount: 4600, status: "Confirmed" as const },
];
