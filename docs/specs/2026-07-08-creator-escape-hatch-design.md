# Creator Escape Hatch — v1 Design Spec

**Date:** 2026-07-08
**Status:** Approved (concept + v1 scope), pending one discovery input (attack vector)
**Working name:** Creator Escape Hatch (placeholder)

---

## 1. Problem

A creator's income lives inside a social account they do not own and cannot control. When that account is hacked, suspended, or lost:

- They lose their only channel to their audience **and** to their paying brand partners.
- They cannot even tell clients they are alive — collabs stall, money stops, reputation bleeds.
- Impersonators message their followers and partners while they are locked out.
- Recovery depends entirely on Meta/TikTok, is a black hole, and takes weeks (often never).

This is not a rare event. It is the default, uninsured risk for every creator whose business runs through a platform account.

### Discovery evidence
Primary interview (UGC creator, close to founder), account takeover in progress at time of writing:
- Hacker changed username + password; account later **suspended by Instagram**.
- Filed a case with Meta — no response, no timeline, "nothing is happening."
- **Paid a recovery company — 1.5 weeks, still nothing.** (Validates willingness to pay AND that the recovery market is broken/predatory.)
- Core ongoing pain in her own words: *"I have damage control to do, to inform the brands waiting for their collab"* and *"people... I don't know who they [hackers] reach out to."*

**Takeaway:** the deepest pain is not lost content — it is **business continuity**. The account was her only line to her partners and audience, and losing it froze her livelihood.

## 2. Target user

**Primary (v1):** Individual creators whose income depends on a social account — UGC creators, influencers, coaches-who-post. Reachable through the founder's own viral-content distribution and network.

**Secondary (later, high-ACV upsell):** Agencies / talent managers who manage many creator accounts, for whom a lost account is a business catastrophe. The product is designed multi-account-ready to enable this without a rebuild.

Explicitly **not** targeted in v1: enterprise brands, general SMBs, consumers.

## 3. Core insight (the wedge)

The owned-audience lifeline only works if it is built **before** disaster. So the product's job is to get creators to start capturing an off-platform audience and backing up their business **while the account is still healthy** — which is precisely why they subscribe now and keep paying. It doubles as a lead-gen / email-list tool creators already want.

**Positioning:** resilience, never recovery. We never promise to get an account back (outside anyone's control). We make losing it survivable.

One-liner: **"If your account vanishes, your business doesn't."**

## 4. v1 scope

In priority order:

1. **Owned audience channel** — a link-in-bio capture page that quietly builds an email/SMS list the creator controls. The always-on retained value; the reason the subscription keeps getting paid.
2. **Break-glass status page** — pre-configured, one-click activate: *"I've been hacked — this is my real account, ignore imposters."* Activating it notifies every brand + follower on the owned list. This is the feature that directly answers the primary interview's damage-control pain.
3. **Content + metrics backup** — auto-archive posts / reels / growth history via official OAuth.
4. **Instant breach alert** — the hook (see §6 for mechanism). Sells the product; the owned-channel + backup retain it.
5. **Prevention / hardening checklist** — onboarding step. *Exact content pending the discovery answer on how the primary interview's hack occurred* (working assumption: phishing DM / fake brand-collab link / fake "copyright violation" login page — to be confirmed and made specific).

### Out of scope for v1 (YAGNI)
- Account **recovery** service or any recovery guarantee.
- Impersonation / clone detection (valuable, grayer, more engineering → **phase 2**).
- Platforms beyond Instagram (TikTok, YouTube → **phase 2**).
- Agency multi-seat dashboard (data model is multi-account-ready; UI is later).

## 5. Platform scope

**Instagram only for v1.** It is the primary interview's platform, the largest creator surface, and one clean OAuth integration. TikTok/YouTube are phase 2.

## 6. Technical feasibility (the parts that reshape the product)

The following constraints are load-bearing — they are *why* the feature set is what it is:

- **No login/security-event API.** Instagram/TikTok expose no legitimate API for "someone logged in from a new device." We do **not** store creator passwords or scrape — that would make the product itself a credential honeypot. Hard rule.
- **Breach alert mechanism (legit):** the creator sets Instagram's security emails to auto-forward to a unique per-user address we issue. We parse Meta's *own* "new login / password changed" notifications and instantly alert the creator (SMS/push) plus surface the lock-down + break-glass flow. We are reading Meta's own warnings faster than the creator would. No credentials, no ToS violation.
- **Backup via official OAuth:** Instagram Graph API (Professional/Creator accounts) provides media and metrics. **Limitation to be honest about:** it does **not** expose the full follower list — no API does. We back up *content and growth history*, not follower contact info. The "owned audience" is therefore something the product **builds forward** via the capture page, not something exported from Instagram.
- **Owned audience channel:** standard email/SMS capture + list storage. Fully in the founder's existing wheelhouse (Supabase + edge functions).

### Recommended stack (to be finalized in the plan)
- Backend + data + auth: **Supabase** (founder's existing stack).
- Alert/backup jobs: **Supabase edge functions** + scheduled tasks.
- Frontend: web dashboard for the creator + public capture/status pages; push/SMS for alerts. (Web-first SaaS; native app optional later.)

## 7. Business model

- **Freemium.** Free tier: breach-alert setup + status-page setup (costs ~nothing to serve; this is the viral loop). Paid tier ~**$19/mo** unlocks backup + owned-audience channel + monitoring.
- Rationale: freemium weaponizes the founder's distribution superpower and the built-in virality of the "I got hacked" story.

## 8. Go-to-market

- Founder's viral creator content is the growth engine — the primary interview's story *is* the ad ("this happened to my friend; here's the escape hatch").
- Free tier drives the viral loop; every activated status page is public marketing.
- Distribution rides the founder's existing creator/coach network and organic social — no paid ads dependency.

## 9. Success metric & path to target

- **Exit thesis:** micro-acquisition, ~$1–3M, ~18 months, self-serve SaaS on Acquire.com or to a strategic.
- **Revenue target:** ~$40K MRR = **$19/mo × ~2,100 paying creators.**
- Tracked metrics (per Higgsfield playbook): **daily/weekly active + paid conversion + ACV**, not vanity MAU.
- Sequence: viral free-tier traction → paid conversion on backup/owned-channel → agency multi-account upsell (raises ACV + multiple) → sell.

## 10. Why this is *sellable* (the multiple, not just the ARR)

- Recurring, sticky ("insurance for my livelihood"), low churn.
- Growth engine (free-tier virality + owned-channel network effects) runs **without the founder's face** → transferable → higher acquisition multiple.
- Self-serve, low-touch, clean SaaS metrics — the shape acquirers pay a premium for.

## 11. Key risks

- **Distribution dependence on founder's brand** — mitigated by free-tier virality + public status pages as a self-sustaining loop; must be demonstrably non-founder-dependent before sale.
- **Email-forward alert fragility** — depends on Meta's notification format; needs monitoring + graceful degradation. It is a hook, not the core retained value, which limits blast radius.
- **Perceived overlap with "recovery" scams** — mitigated by explicit resilience-not-recovery positioning and never promising account return.
- **Follower-list limitation** — must be communicated honestly in onboarding; reframed as "start your escape hatch now" rather than "export your followers."

## 12. Open items before build

1. **Attack vector** from the primary interview — to make the prevention checklist specific (pending).
2. Finalize stack + data model in the implementation plan.
3. Product name (working name is a placeholder).
