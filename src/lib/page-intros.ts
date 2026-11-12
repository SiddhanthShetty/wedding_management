/** One line per page, shown on a first visit until dismissed. Keys are the page's path. */
export const PAGE_INTROS: Record<string, string> = {
  "/overview": "Home shows what needs you today, the countdown and how planning is going. Use “+ Add” at the top to add anything.",
  "/tasks": "Everything to do, grouped by month. Type a task in the box at the top to add it, and tap Done when it's done.",
  "/decisions": "Questions you're deciding together, like the menu or the decorator, with the options and what each of you prefers.",
  "/functions": "Your wedding events, from Haldi to Reception, with their dates, times and places.",
  "/guests": "Families and guests, who's invited to which function, and their replies.",
  "/invitations": "Send each family their own private invitation link, and see who has opened it and replied.",
  "/messages": "Messages and reminders for guests. Nothing is sent automatically; you send them yourself.",
  "/venues-vendors": "Everyone you're considering or have booked. Call or WhatsApp them, keep their quotes and files, and add them to the budget once booked.",
  "/budget": "What you've booked, what you've paid and who you still owe. Use “Add a cost” and “Record a payment” at the top.",
  "/schedule": "A minute-by-minute plan for each function: who does what, and when.",
  "/today": "For the wedding days: what's happening now, what's next, and any problems.",
  "/logistics": "Meal counts for each function, worked out from guest replies.",
  "/travel": "Rooms and pickups for guests travelling in.",
  "/documents": "Every file in one place. Files you add on a vendor's card show up here too.",
};

export const INTROS_SEEN_KEY = "wedding-desk:intros-seen";
