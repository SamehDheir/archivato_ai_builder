# Product Positioning (2026 pivot)

**Status:** decided July 2026. This document is the source of truth for *who we
sell to and why*. When a product decision is ambiguous, resolve it here first.

---

## 1. The pivot

Archivato was originally built and framed as a **general/educational tool**:
"turn an idea into a software system design", aimed at developers who want to
learn how ideas become production systems.

**That audience does not pay.** We validated it the hard way — even the founder
would not pay for it as a learning tool.

**New positioning:**

> **Archivato is a client-scoping tool for small software houses / dev shops /
> agencies (3–20 people) that bid on client projects.**

The engine does not change. The *buyer*, the *message*, and the *order in which
we show the output* do.

---

## 2. The customer

| | |
| --- | --- |
| **Buyer** | Owner or tech lead of a small software development company (3–20 people) |
| **Market** | MENA (primary) |
| **Where their work comes from** | Upwork, Mostaql, referrals, direct sales |

### Their pain

The **scoping / discovery phase of every new deal eats ~1 week of their most
expensive person's time** (the tech lead) — and it is spent on deals that often
never sign. Meanwhile the client is comparing them against several competing
bids, and the fastest credible proposal has an enormous advantage.

### What they are actually buying

**Winning deals faster.** Archivato turns the first client call into a complete
scoping package in **~1 hour instead of ~1 week**:

- requirements + system design + database + API design
- cost estimate + roadmap
- a **client-ready share link** to send the same day
- and a **runnable scaffold** for the dev team the day the deal signs

---

## 3. The core message

**EN**

> Turn a client call into a complete scoping package — requirements,
> architecture, cost estimate, and a client-ready proposal — in one hour instead
> of one week.

**AR**

> من مكالمة العميل لعرض متكامل بساعة — وقّع العقد قبل ما منافسك يخلّص اجتماعه الأول.

---

## 4. Key strategic decisions

Each carries its rationale, so a future change is a *decision*, not an accident.

### 4.1 The public share link is Free, with a watermark

Non-Pro shared pages carry a **"Built with Archivato — archivato.dev"**
watermark.

**Rationale:** every scoping document sent to an end client is a free ad, seen
by a person who *has a project and a budget*. This is our **main growth loop**.

> **Never gate the share link behind Pro again.** (It already was, once, and it
> was backwards on two counts — see the `share` section in `CLAUDE.md`.)

### 4.2 The share page is a client-facing proposal, not a technical dump

**End clients — non-technical — will read it.** So:

- **Business-facing artifacts come first:** vision, requirements, cost, roadmap.
- **Technical artifacts are collapsed / secondary:** API specs, SQL, ER diagrams.

An ERD tells a buyer nothing about whether to hire this shop. The vision, the
price, and the timeline do.

### 4.3 The "two-sided document" is the differentiator

One artifact that is simultaneously:

- **readable by the client** — proposal + cost + roadmap, and
- **usable by the dev team** — OpenAPI, SQL DDL, runnable scaffold.

Competitors are one-sided: v0 / Bolt / Lovable serve only the **builder** side;
proposal tools serve only the **client** side. Nobody serves the handoff between
them. That gap is the product.

### 4.4 Vocabulary shift: "project" → "client scoping"

| Before | After |
| --- | --- |
| New Project | **New Client Scoping** |
| Requirements Document | **Scoping Document** / مستند نطاق العمل |

All UI copy changes must exist in **both locales (EN + AR, RTL-safe)**, per the
existing i18n conventions in `CLAUDE.md`.

### 4.5 Pricing direction *(provisional — finalized after discovery calls)*

| Tier | Price | Includes |
| --- | --- | --- |
| **Starter** | Free | 1 design / month, watermarked share link |
| **Team** | ~$79/mo | Unlimited, all exports, no watermark |
| **Agency** | ~$149–199/mo | Multi-seat, white-label — **"coming soon", not built** |

Prices live as **constants in one file** so a change is one edit.

### 4.6 Remove all educational framing

No "learn how companies work", no student/curiosity language, no tech-stack
name-dropping in hero sections. **Technical depth is credibility material lower
on the page, not the headline.**

### 4.7 SEO

The keyword we own is **"client scoping"** (EN) / **"أداة scoping للمشاريع
البرمجية"** (AR).

Not "AI app builder" — that term is crowded, and it also describes the
competitors we are explicitly *not* trying to be (§4.3).

---

## 5. Implementation roadmap

**Priority order. Do not jump ahead.**

### 🔴 Phase RED — now, before the first customer demo calls

| # | Item | Notes |
| --- | --- | --- |
| **R1** | Landing page rebuild with the new positioning | Full spec comes in a separate prompt |
| **R2** | Share link → Free + watermark for non-Pro | *Free tier: already done. Watermark: shipped in `4461505`.* |
| **R3** | Share page restructure — client-facing order, project name as the page title, technical sections collapsible | *In progress: the public payload now carries vision / cost / roadmap.* |
| **R4** | UI vocabulary shift (§4.4) — i18n strings, both locales | |
| **R5** | Dashboard cards: client name (new optional field on the session), visual pipeline progress, a **"Sent to client"** badge when a share link exists, **"Copy client link"** as a primary card action, and an empty state that teaches the workflow | |

### 🟡 Phase YELLOW — only after real users are active

- Client-name filter / grouping
- Manual deal status (Scoping / Sent / Won / Lost)
- Visible free-tier usage counter + contextual upgrade prompt
- Share-link open tracking ("client viewed 2h ago")
- Manual "project price" field, shown on the share page
- **PDF export of the share page** — *deferred from R12, deliberately.* "Send to
  client" currently gives the share **link** only. Two reasons it wasn't wired:
  the existing `printAsPdf` renders the **technical** Markdown bundle as a
  monospace `white-space: pre-wrap` dump — fine for a dev handoff, actively
  damaging as a client proposal — and there is no client-facing Markdown builder
  to point it at. A real one means either a new client-section builder plus print
  styling, or rendering `/s/[token]` to print: new rendering work, and this is a
  YELLOW item. Until then the owner opens the share page and uses the browser's
  own print, which is honest and costs us nothing.

### 🟢 Phase GREEN — only after paying traction. **Do not build now.**

- White-label (Agency tier)
- Arabic-language *generated artifacts* (today AI output is server-side English)
- Multi-seat activation
- Agency analytics (win rate, scoping time)

---

## 6. Business context (use this to break ties)

- **Goal: MRR.** Solo founder, bootstrapped. Microsoft Founders Hub Azure credits
  available.
- **Next milestone:** 5 discovery calls with dev shops → 3 founding customers at
  a discounted lifetime price.
- **Accelerators** (Gaza Sky Geeks, Flat6Labs) come *only after* paying customers
  exist — not before.

**Therefore, when making tradeoffs:**

1. **Bias toward small, reversible changes that reuse what exists.** RBAC, i18n,
   billing, and the export pipeline are all already built — the pivot is mostly
   *sequencing and copy*, not new infrastructure.
2. **Do not build speculative features.**
3. **When torn between "more engineering" and "ship what unblocks a customer
   conversation" — ship the latter.**
