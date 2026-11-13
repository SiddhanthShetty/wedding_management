/** Short, plain explanations for terms people commonly find confusing. */
export const GLOSSARY = {
  forecast: "What the wedding is expected to cost in total: tentative and confirmed bookings, plus estimates you haven't booked yet, plus any adjustments.",
  committed: "Money you have agreed to pay: confirmed bookings only.",
  outstanding: "Agreed amounts not yet paid.",
  guarantee: "The minimum number of plates agreed with the caterer. It only changes when you approve a new number.",
  notAssigned: "The guest needs this, but nothing has been arranged yet.",
  unknown: "Nobody has recorded whether the guest needs this.",
  heldNights: "Rooms the hotel is holding for you on each night. Guests can only be placed on held nights.",
  manualSent: "You or a helper sent it from your own phone or email and noted it here. The app can't confirm it arrived.",
} as const;
export type GlossaryKey = keyof typeof GLOSSARY;
