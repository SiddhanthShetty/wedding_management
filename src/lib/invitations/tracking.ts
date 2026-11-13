/** Invite & track: how far each step has got, and who still needs a reminder for which function. */

export type TrackInvitation = { id: string; guest_id: string; function_id: string };

export type TrackSummary = {
  invited: number; sent: number; opened: number; replied: number;
  /** Guests who have replied for every function they're invited to. */
  repliedGuestIds: Set<string>;
  /** Per function: how many invitations still have no reply. */
  waiting: Array<{ functionId: string; waiting: number }>;
};

export function trackInvites(guestIds: string[], sentGuestIds: Set<string>, openedGuestIds: Set<string>, invitations: TrackInvitation[], respondedInvitationIds: Set<string>): TrackSummary {
  const invitedIds = new Set(guestIds);
  const mine = invitations.filter((row) => invitedIds.has(row.guest_id));
  const repliedGuestIds = new Set(guestIds.filter((id) => {
    const rows = mine.filter((row) => row.guest_id === id);
    return rows.length > 0 && rows.every((row) => respondedInvitationIds.has(row.id));
  }));
  const byFunction = new Map<string, number>();
  for (const row of mine) if (!respondedInvitationIds.has(row.id)) byFunction.set(row.function_id, (byFunction.get(row.function_id) ?? 0) + 1);
  return {
    invited: invitedIds.size,
    sent: guestIds.filter((id) => sentGuestIds.has(id)).length,
    opened: guestIds.filter((id) => openedGuestIds.has(id)).length,
    replied: repliedGuestIds.size,
    repliedGuestIds,
    waiting: [...byFunction.entries()].map(([functionId, waiting]) => ({ functionId, waiting })),
  };
}

/** Percentage for a progress bar, never above 100. */
export const percent = (part: number, whole: number) => whole ? Math.min(100, Math.round((part / whole) * 100)) : 0;
