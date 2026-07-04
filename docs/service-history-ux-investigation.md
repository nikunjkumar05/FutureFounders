# Service History UX Investigation

> **Branch:** Create new branch from latest `main`
> **Scope:** Investigation only — no implementation, no business-logic changes
> **Date:** 2026-07-04

---

## 1. Complete Service History Rendering Flow

### File

`src/pages/Customers.tsx` — the `ServiceHistoryModal` component (lines 351–527).

### Component Hierarchy

```
Customers (page)
 └─ ServiceHistoryModal (inline, lines 351–527)
     └─ For each card in cards[]:
         └─ <div key={card.id}> (rounded card container)
             ├─ Status + Service Date (2-column grid)
             ├─ Services section (list of ServiceGroup cards)
             ├─ Pricing section (Original Total, Discount, Final Amount)
             ├─ Next Service banner
             └─ Notes section
```

### Data Source

- **Hook:** `useServiceCards()` defined in `src/lib/queries.ts:59`
- **Query:** Supabase `service_cards` table, joined with `customers(*)` and `staff(*)`
- **Ordering:** `service_date DESC` (newest first)
- **Filtering:** At call site (`Customers.tsx:176`), cards are filtered by `customer_id`:
  ```ts
  serviceCards?.filter((sc) => sc.customer_id === historyCustomer.id) ?? []
  ```

### Type

`ServiceCardWithDetails` (`src/lib/types.ts:241`):
```ts
export interface ServiceCardWithDetails extends Omit<ServiceCard, 'staff'> {
  customers: Customer;
  staff: Staff | null;
}
```

### Rendering Per Visit

For each `ServiceCardWithDetails`:
1. `service_details` is parsed via `getServicesFromDetails()` (types.ts:404)
2. Status label derived from `job_status` field
3. Services rendered as nested cards (one per `ServiceGroup`)
4. Pricing computed via `getTotalCharge()` (types.ts:427)
5. Discount and final amount shown conditionally
6. `next_service_date` shown conditionally
7. `notes` shown conditionally

### Grouping Logic

**None.** Cards are displayed as a flat ordered list. There is no grouping by year, month, or any other temporal boundary.

### Ordering Logic

Data arrives ordered by `service_date DESC` from the database query. The modal renders them in that order — newest first.

### Styling Approach

- Tailwind CSS utility classes
- Custom design tokens in `tailwind.config.js` (navy, cyan, surface palettes)
- Custom component classes in `index.css` (`card-base`, `badge-ok`, `badge-warn`, `badge-info`, `btn-primary`, etc.)
- Each visit card uses: `border border-surface-200 dark:border-surface-700 rounded-xl p-4 space-y-3`

---

## 2. Current Information Hierarchy (Per Visit Card)

```
┌──────────────────────────────────────────┐
│ ┌───────┐  ┌──────────────┐              │
│ │Status │  │ Service date │              │
│ │[badge]│  │ 12 Jun 2026  │ ← equal grid │
│ └───────┘  └──────────────┘              │
│                                          │
│ Services (2)                             │
│ ┌─────────────────────────────────┐      │
│ │ Tank Cleaning         ₹1,200   │      │
│ │ 1000L Tank · Qty: 1  ₹1,200   │      │
│ └─────────────────────────────────┘      │
│ ┌─────────────────────────────────┐      │
│ │ Sofa Cleaning          ₹800    │      │
│ │ Standard Sofa · Qty:1  ₹800    │      │
│ └─────────────────────────────────┘      │
│                                          │
│ Original Total           ₹2,000          │
│ Discount                −₹200            │
│ ▓▓ Final Amount        ₹1,800 ▓▓         │ ← highest visual weight
│                                          │
│ Next service due: 12 Dec 2026            │
│                                          │
│ Notes: Customer requested...             │
└──────────────────────────────────────────┘
```

### Visual Weight Distribution

| Element | Visual Weight | Notes |
|---------|--------------|-------|
| Status badge | Medium | Colored badge, but small (10px font) |
| Service date | Medium | 14px font-display font-medium |
| Service type labels | Medium | 14px font-semibold |
| Per-item prices | Low | 12px monospace, nested deep |
| Original Total | Low | 14px, flat bg-surface-50 |
| Discount | Low | 14px, amber background |
| **Final Amount** | **Highest** | **18px bold, cyan background, prominent box** |
| Next service | Medium | Cyan background banner |
| Notes | Low | Nested at bottom |

**Observation:** The **Final Amount** receives the highest visual emphasis despite being secondary to temporal identity (which visit is this?). The elements that identify *which* service visit this is (date, status) are treated with equal visual weight — neither dominates.

---

## 3. Root Cause of Poor Visual Separation

### Primary Issue: Uniform Card Layout

Every service visit renders as an identical card with:
- Same border style: `border-surface-200` (light gray, 1px)
- Same border radius: `rounded-xl`
- Same padding: `p-4`
- Same background: white (or dark mode bg-surface-700)
- Same inner `space-y-3` gap

### Secondary Issues

1. **No grouping headers** — Years, months, or any temporal dividers are absent. A visit from 2024 sits directly above a visit from 2026 with no visual break.

2. **No background alternation** — Every card is identical white. No zebra-striping, no alternating shade.

3. **Border contrast is too subtle** — The `surface-200` border (`#CBD5E1`) on white background provides low contrast. The gap between cards (`space-y-3` = 12px) is the only separator. This gap is identical to the *internal* spacing within a card, so the visual boundary between cards is the same as the visual boundary between sections *inside* a card.

4. **Internal structure mirrors external structure** — Each visit card contains nested sub-cards (for service items) also using `border-surface-200 rounded-xl p-3`. This creates a recursive visual pattern where a sub-card looks like a sibling visit card, causing confusion at quick glance.

5. **No visit-level identifier** — There is no visual element that says "Visit 1", "Visit 2", or a date banner. The date is embedded inside a 2-column grid at the same level as the status badge, neither acting as a primary visual anchor.

6. **Status badge is physically small** — At `text-[10px]`, the status badge is too small to act as a quick visual differentiator when scanning a list.

7. **No chronology indicators** — No lines, connectors, timeline elements, or step numbers that would visually connect the sequence.

### Summary of Blending

Multiple visits blend together because:
- Equal spacing between and within cards
- Near-identical visual containers
- No temporal grouping
- No distinguishing mark for "this is a separate visit"
- Internal sub-cards mimic the same visual language as visit cards

---

## 4. Scanability Analysis

### Questions and Findings

| Question | Current Ease | Issue |
|----------|-------------|-------|
| What was the customer's latest service? | Moderate | It's the first card, but you must read the date to confirm it's the latest. No "Latest" visual indicator. |
| How many visits has this customer had? | Moderate | Count is shown in the header (`(N total)`), but the list itself doesn't help you quickly perceive count. |
| When was the previous visit? | **Hard** | You must read the date inside each card. No quick visual timeline. |
| What happened during each visit? | **Hard** | Services are nested inside sub-cards within each visit card. You must expand mental focus into each card. |
| Which visits were completed vs pending? | Hard | Status badges are small and visually similar at a glance. All cards look alike. |

### Where Visual Searching Occurs

1. **Finding the date** — The service date is in the right column of a 2-column grid. It is not the primary visual anchor; it is one of two equally-weighted cells.

2. **Counting visits** — The header shows a count, but scanning down the list, there is no visual rhythm or grouping that makes the count self-evident.

3. **Comparing visits** — To compare two visits, the operator must read both cards in detail, as there is no summary row or comparative structure.

4. **Identifying status** — The status badge uses different colors but the same pattern. At a quick glance, all cards look the same.

---

## 5. Scalability Analysis

| Visits | Current Behavior | Problem |
|--------|-----------------|---------|
| 2 | Works fine | — |
| 10 | Usable but dense | Cards fill the modal. Scrolling moderate. |
| 25 | **Difficult** | Long scroll, all cards look identical. Easy to lose your place. |
| 100 | **Impractical** | Massively long scroll. No way to jump to a specific period. Hierarchy completely flat. |

### Specific Issues at Scale

1. **Scrolling becomes excessive** — The modal is limited to `max-h-[80vh]` (~600px), which shows approximately 3–4 visit cards at a time.

2. **Visual hierarchy degrades** — With 25+ identical cards, there is no landmark or waypoint to anchor scanning.

3. **Repeated layouts become noise** — The pricing block (Original Total / Discount / Final Amount) repeats for every card, even when every card has pricing. This creates a repetitive visual pattern where the difference between cards is hard to identify.

4. **No pagination or virtual scrolling** — All cards are rendered as a flat list. No "Load more" or infinite scroll.

5. **No filtering** — There is no way to filter history by status, date range, or service type.

---

## 6. Chronological Communication

### Current State

- **Ordering:** Newest first (`service_date DESC` from DB query)
- **No visual sequence indicators:** No step numbers, timeline, or connector elements
- **No date grouping:** Consecutive visits are not grouped by month/year
- **Latest visit:** Is the first card, but there is no "Most recent" or "Latest" indicator on it

### What is NOT Communicated

- Which visit is the most recent (requires reading dates)
- How much time elapsed between visits
- Whether there are gaps in the service history
- A sense of progression over time

---

## 7. Information Density Analysis

### Problems with Current Density

1. **Too much repeated information** — The pricing block (Original Total / Discount / Final Amount) is shown for every visit. This section occupies ~120px per card and provides diminishing returns on repeat viewings.

2. **Labels repeat excessively** — "Status", "Service date", "Services (N)", "Original Total", "Discount", "Final Amount" labels repeat in every card.

3. **Primary vs secondary emphasis is inverted** — The Final Amount (secondary for history review) gets a full-width cyan highlighted box, while the service date (primary for temporal orientation) gets a modest grid cell.

4. **Sub-card nesting adds cognitive load** — Each service item is rendered as a nested card with border, padding, and item-level breakdown. This adds visual noise when the operator just wants to see which services were performed.

### What's Missing

- **Summary line per visit** — A compact single-line representation of each visit (date, status, total, service types)
- **Expandable detail** — The ability to see a compact list and expand for pricing/service details
- **Aggregated view** — Total spending, visit frequency, service-type distribution

---

## 8. Merchant Workflow Analysis

### Typical Merchant Tasks

| Task | Current Support | Pain Point |
|------|----------------|------------|
| Check when customer was last serviced | Poor — must locate first card, read date | No "Latest visit" visual cue |
| See what services were performed | Moderate — services are shown but nested | Requires scanning into each card |
| Confirm pricing from a previous visit | Poor — pricing is there but nested deep | Must scroll through full card |
| Understand overall visit pattern | **None** | No timeline, no gap analysis |
| Verify visit count | Good — count shown in header | But not perceivable from the list itself |

### Layout vs Workflow Mismatch

The merchant's primary workflow is **temporal** — "what happened when?" — but the layout treats each visit as a **financial transaction** (emphasizing the Final Amount). The temporal information (date, chronology) is visually subordinate to financial information.

---

## 9. Existing Reusable UI Opportunities

### Components Already Available

| Component | File | Relevance |
|-----------|------|-----------|
| `card-base` class | index.css:63 | Already used indirectly; visit cards use `border rounded-xl` manually instead of `card-base` |
| `badge-ok`, `badge-warn`, `badge-info`, `badge-neutral` | index.css:128-158 | Already used for status badges |
| MetricTile pattern | RevenueIntelligence.tsx:254 | Pattern for compact KPI display |
| CustomerRow pattern | RevenueIntelligence.tsx:325 | Compact horizontal customer layout |
| Sectioned card pattern | DailyBriefing.tsx | Cards with header/title bars, divided lists |
| `stagger-child` animation | index.css:168 | Could be used for list entry animations |
| `scrollbar-thin` utility | index.css:178 | Could improve scroll experience |

### Patterns Observed in Codebase

- **Section headers with icons** (DailyBriefing, RevenueIntelligence): `flex items-center gap-2 px-4 py-3 border-b`
- **Divided lists** (DailyBriefing): `divide-y divide-surface-100` for list separation
- **Compact customer rows** (RevenueIntelligence:325): Avatar, name, subtitle, action in one row

### No Timeline Component Exists

There is **no timeline, step-indicator, or chronological connector component** in the codebase.

---

## 10. UX Improvement Opportunities (No Implementation)

### Visual Hierarchy

1. **Elevate the date to a primary visual anchor** — The service date should be the most prominent identifier of each visit, not the Final Amount.

2. **Reduce the visual weight of pricing** — The Final Amount highlight box dominates each card. Consider moving pricing to a collapsed or less prominent position.

3. **Use the status badge as a faster visual cue** — Consider making the status badge larger or more visually distinctive so completed vs pending visits are distinguishable at a glance.

### Card Separation

4. **Introduce temporal grouping headers** — Group visits by year or year-month with a visual divider (sticky header, colored bar, or separator line).

5. **Alternate card background** — Even subtle alternating backgrounds can help the eye track which card is which.

6. **Increase inter-card spacing relative to intra-card spacing** — Currently both use `space-y-3`. Making the gap between cards larger than the gap within cards would help.

7. **Add a subtle left border accent per card** — A colored left border (e.g., cyan for completed, amber for pending) could provide instant status identification.

### Chronology

8. **Add a chronological connector/line** — A subtle vertical timeline line on the left side with dots marking each visit.

9. **Mark the latest visit** — Add a "Most recent" indicator or badge on the first card.

10. **Show elapsed time between visits** — A small note like "3 months later" between consecutive cards would communicate temporal distance.

### Scanability

11. **Provide a compact summary row per visit** — A single-line representation (date, service types, total) that can be expanded for details.

12. **Add collapsible sections per visit** — Default to showing date, status, and service summary; expand to show pricing and notes.

13. **Use sticky year headers** — As the user scrolls, year headers should stick to the top of the scroll container.

### Long History

14. **Add pagination or "Load more"** — Instead of rendering all cards at once, load in batches of 10–20.

15. **Add a date-range filter** — Allow filtering history by date range or year.

16. **Add a service-type filter** — Allow showing only specific service types.

### Information Density

17. **Hide or collapse repeated price labels** — After the first card, the labels become predictable and can be replaced with more compact layouts.

18. **Show service items more compactly** — Instead of nested sub-cards with full borders, use simpler inline representations.

19. **Show notes only when expanded** — Notes are secondary information that could be hidden behind a toggle.

---


## Root-Cause Summary

**Multiple service visits blend together because:**

1. **Identical containers** — Every visit uses the same border, radius, padding, background, and internal spacing. There is zero visual differentiation between cards.

2. **Temporal grouping is absent** — Years and months are not used as visual dividers. A 2024 visit sits beside a 2026 visit with no contextual separation.

3. **Inter-card spacing equals intra-card spacing** — The `space-y-3` gap between cards is the same as the gap between sections within a card (also `space-y-3`). The eye cannot distinguish between a card boundary and an internal section boundary.

4. **Internal sub-cards mimic visit cards** — Service items render as nested cards with the same border, radius, and padding as visit cards, creating recursive visual confusion.

5. **Financial data dominates over temporal identity** — The Final Amount receives the highest visual weight (18px bold, cyan background, full-width box), while the service date is small (14px, no background, nested in a 2-column grid).

6. **No visit-level landmark** — No step counter, no date banner, no timeline node, no "Visit #" indicator. Each card starts cold with no introductory identifier.

7. **Status badges are too small to differentiate at a glance** — At 10px, the colored badges blend into the card's visual noise and don't help with rapid scanning.

8. **No alternation or pattern break** — Every card is identical in appearance. The human eye relies on pattern breaks to segment lists; this design provides none.

The core design issue is that the Service History presents **individual service records** rather than **a customer visit timeline**. The emphasis on pricing-per-visit rather than chronology-per-visit trades temporal clarity for financial detail, making the historical sequence difficult to parse.
