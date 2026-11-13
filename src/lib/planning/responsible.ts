/**
 * One "Who's responsible" box: typing a member's name links it to their account (so it shows on
 * their own lists); anything else, like "Venue coordinator", is kept as a plain name.
 */
export type Member = { userId: string; name: string };

const key = (value: string) => value.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

export function resolveResponsible(text: string, members: Member[]): { owner_user_id: string; owner_name: string } {
  const typed = text.trim().replace(/\s+/g, " ");
  if (!typed) return { owner_user_id: "", owner_name: "" };
  const member = members.find((row) => key(row.name) === key(typed));
  return member ? { owner_user_id: member.userId, owner_name: "" } : { owner_user_id: "", owner_name: typed.slice(0, 160) };
}

/** The text to show in the box for an existing owner. */
export function responsibleText(owner: { owner_user_id: string | null; owner_name: string } | undefined, members: Member[]): string {
  if (!owner) return "";
  if (owner.owner_user_id) return members.find((row) => row.userId === owner.owner_user_id)?.name ?? owner.owner_name ?? "";
  return owner.owner_name ?? "";
}
