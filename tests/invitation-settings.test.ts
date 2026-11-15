/** Invitation wording edited in the app: the rules, the database (who edits, draft and publish), and the actions. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, OWNER_A, OWNER_A_PARTNER, OWNER_B, READ_ONLY, SCOPED, WEDDING_A } from "./support/database";
import { invitationConfig } from "../src/config/invitation";
import { configFromSettings, resolveConfig, sameSettings, settingsFromConfig, settingsFromForm, TRACKS, type InvitationSettings } from "../src/lib/invitation/settings";

const state = vi.hoisted(() => ({ role: "owner", calls: [] as Array<{ name: string; args: Record<string, unknown> }>, error: null as null | { code?: string; message: string } }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc: async (name: string, args: Record<string, unknown>) => { state.calls.push({ name, args }); return { data: state.error ? null : name === "publish_invitation" ? 2 : "2026-11-15T10:00:00.123456+00:00", error: state.error }; } }) }));
vi.mock("@/lib/auth/access", async (original) => {
  const actual = await original<typeof import("@/lib/auth/access")>();
  return { ...actual, authorizeWeddingOperation: vi.fn(async () => ({ wedding: { id: "w" }, user: { id: "u" }, membership: { role: state.role }, moduleAccess: { guests: "edit" } })) };
});
import { publishInvitationAction, saveInvitationDraftAction } from "../src/app/actions/invitation-settings";

const weddingId = "a0000000-0000-4000-8000-000000000001";
/** The edit form as the browser sends it, from settings, with changes. */
function form(settings: InvitationSettings, changes: Record<string, string> = {}) {
  const data = new FormData();
  const put = (name: string, value: string | null | string[]) => data.set(name, Array.isArray(value) ? value.join("\n") : value ?? "");
  data.set("weddingId", weddingId); data.set("base", "");
  put("brideName", settings.brideName); put("groomName", settings.groomName); put("location", settings.location); put("weddingTime", settings.weddingTime); put("respondBy", settings.respondBy); put("musicId", settings.musicId);
  for (const [key, value] of Object.entries(settings.families)) put(`families.${key}`, value);
  for (const [key, value] of Object.entries(settings.eventDescriptions)) put(`eventDescriptions.${key}`, value);
  for (const [key, value] of Object.entries(settings.goodToKnow)) put(`goodToKnow.${key}`, value);
  for (const [key, value] of Object.entries(settings.contact)) put(`contact.${key}`, value);
  for (const [key, value] of Object.entries(changes)) data.set(key, value);
  return data;
}

describe("wording rules", () => {
  it("starts from the code file and gives back exactly what it has", () => {
    expect(configFromSettings(settingsFromConfig())).toEqual(invitationConfig);
    expect(settingsFromConfig().musicId).toBe("carnatic-melody");
    expect(resolveConfig(null)).toBe(invitationConfig);
    expect(resolveConfig({ brideName: "" })).toBe(invitationConfig);
  });

  it("reads the form: tidies text, one grandparents pair per line, empty boxes left out", () => {
    const result = settingsFromForm(form(settingsFromConfig(), {
      brideName: "  Sweekruti\u0007 ", "families.brideGrandparents": "Shri A and Smt. B\n\n  Shri C and Smt. D  ", "goodToKnow.weather": "  ", "goodToKnow.hashtag": "#SweekrutiWedsSiddhanth",
      "contact.phone": "+91 98765 43210", respondBy: "2027-11-01", weddingTime: "10:30", musicId: "hamsadhwani",
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings).toMatchObject({ brideName: "Sweekruti", respondBy: "2027-11-01", weddingTime: "10:30", musicId: "hamsadhwani", goodToKnow: { weather: null, hashtag: "#SweekrutiWedsSiddhanth" }, families: { brideGrandparents: ["Shri A and Smt. B", "Shri C and Smt. D"] } });
    expect(configFromSettings(result.settings).music).toEqual(TRACKS.hamsadhwani);
  });

  it("names each box with a problem", () => {
    const result = settingsFromForm(form(settingsFromConfig(), {
      brideName: "", "eventDescriptions.haldi": "", "goodToKnow.hashtag": "#no spaces", "contact.email": "not-an-email", "contact.phone": "call me", weddingTime: "25:00",
      "families.groomGrandparents": "1\n2\n3\n4\n5", musicId: "my-song", location: "x".repeat(121),
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["brideName", "contact.email", "contact.phone", "eventDescriptions.haldi", "families.groomGrandparents", "goodToKnow.hashtag", "location", "musicId", "weddingTime"]);
    expect(result.errors.brideName).toBe("The bride's name is needed.");
    expect(result.errors["families.groomGrandparents"]).toBe("Up to 4 grandparents lines.");
  });

  it("compares versions whatever the key order", () => {
    const settings = settingsFromConfig();
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(settings).reverse())));
    expect(sameSettings(settings, reordered)).toBe(true);
    expect(sameSettings(settings, { ...settings, location: "Udupi" })).toBe(false);
  });
});

describe("in the database", () => {
  let db: PGlite;
  beforeEach(async () => { db = await createTestDatabase(); await assumeUser(db, OWNER_A); });
  afterEach(async () => { await db.close(); });

  const draft = (location: string) => JSON.stringify({ ...settingsFromConfig(), location });
  const save = async (location: string, base: string | null) => (await db.query<{ t: string }>("select public.save_invitation_draft($1,$2::jsonb,$3)::text t", [WEDDING_A, draft(location), base])).rows[0]!.t;
  const publish = async (base: string | null) => (await db.query<{ v: number }>("select public.publish_invitation($1,$2) v", [WEDDING_A, base])).rows[0]!.v;
  const peek = async <T>(sql: string, params: unknown[] = []) => { await db.exec("reset role"); return (await db.query<T>(sql, params)).rows; };
  async function familyLink() {
    await db.query("select public.create_family_invites_bulk($1,$2::jsonb,$3::uuid[],'couple_one')", [WEDDING_A, JSON.stringify([{ name: "Rao family", phone: "", max_guests: 4, code: "CODE00000001" }]), [FUNCTION_A]]);
    return async () => { await assumeUser(db, null, "anon"); const settings = (await db.query<{ s: { location: string } | null }>("select public.get_family_invitation('CODE00000001')->'settings' s")).rows[0]!.s; await assumeUser(db, OWNER_A); return settings; };
  }

  it("keeps the draft from families until it's published, and keeps every published version", async () => {
    const link = await familyLink();
    const first = await save("Udupi", null);
    expect(await link()).toBeNull();
    expect(await publish(first)).toBe(1);
    expect((await link())!.location).toBe("Udupi");
    const second = await save("Mangaluru", first);
    expect((await link())!.location).toBe("Udupi");
    expect(await publish(second)).toBe(2);
    expect((await link())!.location).toBe("Mangaluru");
    expect(await peek("select version, settings->>'location' location from public.invitation_settings_history order by version")).toEqual([{ version: 1, location: "Udupi" }, { version: 2, location: "Mangaluru" }]);
  });

  it("refuses a save or publish over someone else's newer draft", async () => {
    const mine = await save("Udupi", null);
    await assumeUser(db, OWNER_A_PARTNER);
    const theirs = await save("Karkala", mine);
    await assumeUser(db, OWNER_A);
    await expectDenied(save("Moodbidri", mine), /changed by someone else/);
    await assumeUser(db, OWNER_A);
    await expectDenied(publish(mine), /changed by someone else/);
    await assumeUser(db, OWNER_A);
    await expectDenied(save("Moodbidri", null), /changed by someone else/);
    await assumeUser(db, OWNER_A);
    expect(await publish(theirs)).toBe(1);
  });

  it("discards back to what families see, or to the original wording; restores an old version into the draft", async () => {
    await save("Udupi", null);
    await db.query("select public.discard_invitation_draft($1)", [WEDDING_A]);
    expect(await peek("select 1 from public.invitation_settings")).toEqual([]);
    await assumeUser(db, OWNER_A);
    const v1 = await save("Udupi", null);
    await publish(v1);
    const changed = await save("Karkala", (await peek<{ t: string }>("select draft_updated_at::text t from public.invitation_settings"))[0]!.t);
    await assumeUser(db, OWNER_A);
    await db.query("select public.discard_invitation_draft($1)", [WEDDING_A]);
    expect(await peek("select draft->>'location' d, published->>'location' p from public.invitation_settings")).toEqual([{ d: "Udupi", p: "Udupi" }]);
    await assumeUser(db, OWNER_A);
    const base = (await peek<{ t: string }>("select draft_updated_at::text t from public.invitation_settings"))[0]!.t;
    await assumeUser(db, OWNER_A);
    await publish((await save("Karkala", base)) ?? changed);
    await db.query("select public.restore_invitation_version($1, 1)", [WEDDING_A]);
    expect(await peek("select draft->>'location' d, published->>'location' p, published_version from public.invitation_settings")).toEqual([{ d: "Udupi", p: "Karkala", published_version: 2 }]);
  });

  it("lets only owners and co-owners edit; guest-list readers can read; others see nothing", async () => {
    const first = await save("Udupi", null);
    await db.exec("reset role");
    await db.query("insert into public.member_module_permissions(wedding_id,membership_id,module,access_level) values($1,'a1000000-0000-4000-8000-000000000003','guests','edit') on conflict do nothing", [WEDDING_A]);
    for (const user of [SCOPED, READ_ONLY, OWNER_B]) {
      await assumeUser(db, user);
      await expectDenied(save("Sneaky", first), /Only the couple/);
      await assumeUser(db, user);
      await expectDenied(publish(first), /Only the couple/);
      await assumeUser(db, user);
      await expectDenied(db.query("select public.restore_invitation_version($1, 1)", [WEDDING_A]), /Only the couple/);
      await assumeUser(db, user);
      await expectDenied(db.query("update public.invitation_settings set published = draft"), /permission denied/);
    }
    await assumeUser(db, SCOPED);
    expect((await db.query("select draft->>'location' l from public.invitation_settings")).rows).toEqual([{ l: "Udupi" }]);
    await assumeUser(db, OWNER_B);
    expect((await db.query("select 1 from public.invitation_settings")).rows).toEqual([]);
    await assumeUser(db, null, "anon");
    await expectDenied(db.query("select 1 from public.invitation_settings"), /permission denied/);
    await db.exec("reset role");
    await db.query("update public.wedding_members set role='co_owner' where user_id=$1", [OWNER_A_PARTNER]);
    await assumeUser(db, OWNER_A_PARTNER);
    expect(await publish(first)).toBe(1);
  });

  it("refuses wording that isn't a JSON object or is over 64 KB", async () => {
    await expectDenied(db.query("select public.save_invitation_draft($1,'[1]'::jsonb,null)", [WEDDING_A]), /JSON object/);
    await assumeUser(db, OWNER_A);
    await expectDenied(db.query("select public.save_invitation_draft($1,$2::jsonb,null)", [WEDDING_A, JSON.stringify({ location: "x".repeat(70_000) })]), /check constraint/);
  });
});

describe("actions", () => {
  beforeEach(() => { state.role = "owner"; state.calls = []; state.error = null; });

  it("saves a checked draft with the base it started from", async () => {
    const data = form(settingsFromConfig(), { location: "Udupi", base: "2026-11-15T09:00:00.000001+00:00" });
    expect(await saveInvitationDraftAction({}, data)).toMatchObject({ message: expect.stringMatching(/^Draft saved/) });
    expect(state.calls[0]).toMatchObject({ name: "save_invitation_draft", args: { p_wedding_id: weddingId, p_base: "2026-11-15T09:00:00.000001+00:00", p_draft: { location: "Udupi" } } });
  });

  it("returns each box's problem and saves nothing", async () => {
    const result = await saveInvitationDraftAction({}, form(settingsFromConfig(), { groomName: "" }));
    expect(result).toMatchObject({ error: "Check the highlighted boxes. Nothing was saved.", errors: { groomName: "The groom's name is needed." } });
    expect(state.calls).toHaveLength(0);
  });

  it("refuses anyone but owners and co-owners before reaching the database", async () => {
    for (const role of ["scoped_collaborator", "read_only_collaborator"]) {
      state.role = role;
      expect(await saveInvitationDraftAction({}, form(settingsFromConfig()))).toEqual({ error: "Only the couple (owners and co-owners) can edit the invitation." });
      expect(await publishInvitationAction({}, form(settingsFromConfig()))).toEqual({ error: "Only the couple (owners and co-owners) can edit the invitation." });
    }
    expect(state.calls).toHaveLength(0);
    state.role = "co_owner";
    expect(await publishInvitationAction({}, form(settingsFromConfig()))).toMatchObject({ message: "Published (version 2). Families see it the next time they open their link." });
  });

  it("explains a partner's newer save", async () => {
    state.error = { code: "40001", message: "The draft was changed by someone else. Reload to see their changes." };
    expect(await saveInvitationDraftAction({}, form(settingsFromConfig()))).toEqual({ error: "The draft was changed by someone else. Reload to see their changes." });
  });
});
