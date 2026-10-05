# n-CAS — Student Classroom Attendance System

A desktop attendance application for an IGCSE Computer Science coursework submission.

A student pushes an RFID card at the classroom reader. The reader detects the card, lights its
RFID lamp, reads the card, hands over to the camera for a secondary identity check, and only
then records the attendance — PRESENT or LATE, with the late minutes worked out. Class breaks
are started and ended with the same card, absentees are marked automatically when the lesson
ends, and anything the system cannot be sure about goes to the teacher to settle.

Built with **Next.js 15 + React 19 + TypeScript**, rendered from **Fluent UI React v9**
components and themed by the **WinUI 3 layer** in [`src/winui`](src/winui).

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # production build
npm run clean        # delete .next and the TypeScript build info
npm run clean:all    # delete node_modules as well — npm install restores it
```

---

## What is actually in the folder

The work is small; the toolchain around it is not. Measured with `du -sh`:

| | Size | Keep? |
|---|---|---|
| `node_modules/` | 519 MB | Regenerable — `npm install` |
| `.next/` | 18 MB | Regenerable — `npm run build` |
| `screens/` | 2.1 MB | **The deliverable** |
| `src/` | 797 KB | **The deliverable** |
| `README.md`, `package.json`, `package-lock.json`, configs | ~125 KB | **The deliverable** |

**The coursework itself is about 3 MB.** Everything else is a dependency tree or build output
that `package.json` and `package-lock.json` (105 KB together) can rebuild exactly.

Two standing notes on the size:

* `@fluentui/react-icons` ships **two** complete builds — an ESM one (`lib/`, which the
  application uses) and an identical CommonJS one (`lib-cjs/`). The CommonJS copy is 132 MB and
  Next never resolves it, so it has been removed. `npm install` puts it back; if disk matters more
  than that, delete it again after installing.
* `.next/cache/webpack` grows to roughly **500 MB** on a build of this project, because the icon
  barrel makes webpack read about twenty thousand modules. It is pure build cache. `npm run clean`
  removes it, a running `next start` is unaffected, and the only cost is a slower next build.

---

## Deploying to Vercel

`vercel.json` pins the framework:

```json
{ "$schema": "https://openapi.vercel.sh/vercel.json", "framework": "nextjs" }
```

That file exists because of a specific failure. This project builds to `.next/`, which is where
Next.js puts its output. Vercel only looks in `.next/` when it has detected the Next.js framework;
under any other preset it falls back to the static-site default, whose output directory is
`public/`, and the build then fails with:

```
No Output Directory named "public" found after the Build completed.
```

There is no `public/` directory in this repository, and there does not need to be one. Pinning
`"framework": "nextjs"` in the repository settles the question at source, so a fresh Vercel
project cannot come up with the wrong preset.

The equivalent dashboard setting is **Project → Settings → Build & Development Settings →
Framework Preset → Next.js**, followed by a redeploy. Either one is sufficient; the file is the
one that travels with the code.

Two further settings worth checking if a build ever fails for a different reason:

* **Root Directory** must be the repository root — the folder containing `package.json`. Left
  blank, it already is.
* **Node.js Version** must be 18.18 or later; Next 15 does not build on 16. Vercel defaults to 22.

---

## The five screens

| # | Route | Screen | Purpose |
|---|---|---|---|
| 1 | `/` | **Student RFID Reader** | The reader station at the classroom door: the hardware, a card that can be dragged to it, and the result. |
| 2 | `/dashboard` | **Teacher Attendance Dashboard** | Who is accounted for and who is not, mid-lesson, with the records that need a decision. |
| 3 | `/review` | **Attendance Review and Manual Override** | Everything needed to settle one questionable record, with a reason recorded for every change. |
| 4 | `/summary` | **Class Attendance Summary** | The totals, the register behind them, the breaks taken, and the closing statements. |
| 5 | `/events` | **Special Events** | Approved events and temporary lesson leave: one event covers a group of students for a window, and the register honours it. |

Screens 2 to 5 share one window chrome — navigation rail, header band, metric strip, panels,
status badges. Screen 1 deliberately has no navigation: it is a kiosk standing in a corridor,
not a workspace at a desk.

---

## Screen 1 — the reader station

### The hardware

The scanner is drawn rather than illustrated, from a casing, a recessed display, a camera
module, a scanning well, three lamps, a speaker grille and the branding. Its own colours are
fixed rather than taken from the theme tokens, because a piece of moulded plastic does not get
lighter when the application switches scheme.

| Part | What it does |
|---|---|
| **Display** | `Ready` → `Card detected / Reading RFID…` → `Identity verification / Capturing image…` → the result |
| **Camera module** | Top-left, with its own lens and indicator. The lens and the ring light up during the identity check. |
| **RFID scanning zone** | The well at the bottom of the device, ringed by a dashed circle drawn at exactly the radius the drag code tests against |
| **Power lamp** | Green, continuously on |
| **RFID lamp** | Off at rest · bright blue while the card is detected and read · green on a good result · amber on a duplicate · red on an unknown card |
| **Camera lamp** | Off at rest · bright white while the image is captured |
| **Speaker grille** | The buzzer opening under the scanning zone |

The indicators sit **above** the scanning zone on purpose: a card held on the reader covers the
zone, and it must not cover the display or the lamps.

### The card

A portrait student card modelled on the school's own: the crest and the school name at the top
left, `STUDENT` at the top right, the photograph below it, and the three fields the office
actually reads off the card sitting on the orange band that sweeps up to the right —

```
003946          the student number
Wang Shu Min    the student's name
tIS170206       the parent account number
```

It can be **dragged** with the pointer, or focused and placed with **Enter** for anyone who
cannot drag it. The RFID aerial is inside the card and prints nothing on the face, so the card
carries no contactless mark: the reader is where that is made visible.

### The sequence

The station runs four steps, and only the last of them asks the attendance engine anything:

```
IDLE
  │  card enters the detection area
  ▼
CARD DETECTED          RFID lamp blue, scan waves, "Card detected / Reading RFID…"
  │  the card is read
  ▼
IDENTITY CAPTURE       camera lamp white, capture ring, "Identity verification / Capturing image…"
  │  the image is compared
  ▼
RESULT                 name, PRESENT or LATE, time, late minutes
  │  after 2.8 seconds
  ▼
IDLE                   the card glides back and the station is ready for the next student
```

Two things follow from that ordering. Dragging the card **out** of the detection area while the
read is still running abandons the scan and records nothing. And the decision — duplicate,
wrong class, break, approved leave — is still made by `resolveScan()` in
`lib/engine/attendance-engine.ts`; the sequence is the hardware around it.

### Driving it

The **Reader setup** panel chooses which card is in hand and what the lesson clock reads. The
card list offers eight demonstration cards first, and every remaining student in the register
underneath, so any card can be pushed at the reader. The states the station can be made to show:

| Choose | Set the clock to | And you get |
|---|---|---|
| Aisha Rahman (not recorded) | 08:03 | Attendance recorded — PRESENT |
| Ethan Wong (not recorded) | 08:07 | Attendance recorded — LATE, 7 min |
| any student who has just tapped | the same minute, again | Duplicate tap — ignored |
| Mei Ling (recorded) | 08:24 then 08:28 | Class break started, then Welcome back |
| Iqbal Rahman | any | Approved leave confirmed |
| Grace Teoh (another class) | any | Not enrolled in this class |
| Unregistered card | any | Card not recognised |
| any card, with **Make the camera check inconclusive** ticked | any | Recorded, but sent to teacher review |

### Getting to the other screens

The station is a kiosk with no navigation — a student must not be able to wander out of it.
Staff reach the rest of the application through the **Teacher workspace** button in the
station's header, which opens the dashboard; the navigation rail there also carries a
**Reader station** link back.

| Screen | Route | Where it sits in the rail |
|---|---|---|
| 1 · Student RFID Reader | `/` | Attendance → Reader station |
| 2 · Teacher Attendance Dashboard | `/dashboard` | Attendance → Attendance dashboard |
| 3 · Attendance Review and Manual Override | `/review` | Records → Review and override |
| 4 · Class Attendance Summary | `/summary` | Records → Class summary |
| 5 · Special Events | `/events` | Records → Special Events |

---

## Screen 5 — Special Events

Approved student events and temporary lesson leave. A teacher picks any number of students, gives
the window a date and two times, picks a reason from a closed list, and files **one** event for
the whole group.

An event is not a calendar entry — it is an instruction to the attendance system, and the page
says so on the form itself: *"3 students excused from 08:15 to 08:45 — the reader will not record
them, and they will not be marked absent."* Two rules in `lib/engine/events-engine.ts` carry that
out:

1. **While the window is open the reader refuses to record those students.** Scanning their card
   shows *Approved leave confirmed*, with the event's reason on the display, and writes no
   attendance row at all.
2. **A student excused for any part of the lesson is not marked absent when it ends.** The
   class-end rule asks once per student before it writes an ABSENT row.

The two are deliberately separate. A student out of the room for ten minutes in the middle of a
lesson is excused *then* but was present for the bell, so the first rule applies and the second
does not — otherwise one ten-minute appointment would swallow the whole register.

**Status is never stored.** Scheduled, Active, Completed and Cancelled are worked out from the
clock each time the list renders, so a list left open on a desk cannot go stale.

Cancelling is a ContentDialog rather than a bare button, and it says what the cancellation will
do: those students stop being excused immediately, and any who have not tapped will be marked
absent. The reason for the cancellation goes into the audit trail.

### Date and time fields

Fluent UI React v9 has no date or time picker: `DatePicker` and `TimePicker` live in
`@fluentui/react-datepicker-compat`, which still pins React to `<20` and so cannot be installed
alongside React 19. `src/components/DateTimeFields.tsx` builds the same two interactions out of
the Fluent primitives that are present — a Button that opens a surface containing a month of
Buttons, and a Combobox of times every five minutes. They inherit the WinUI layer's styling
exactly as every other control does, and add no dependency.

---

## Captured states

`screens/` holds a rendered PNG of every state, captured at 1440 × 900 in the light scheme.

| File | Shows |
|---|---|
| `01-reader-station-idle.png` | The station at rest, with the student card |
| `02-reader-card-detected.png` | **Card detected / Reading RFID…** |
| `03-reader-identity-capture.png` | **Identity verification / Capturing image…** |
| `04-reader-attendance-result.png` | **Attendance recorded · Aisha Rahman · PRESENT · 08:03** |
| `05-reader-late.png` | LATE with the minutes calculated |
| `06-reader-duplicate.png` | Duplicate tap — ignored |
| `07-reader-invalid-card.png` | Card not recognised |
| `08-reader-break-start.png` | Class break started |
| `09-reader-break-end.png` | Welcome back, with the length of the break |
| `10-reader-approved-leave.png` | Approved leave confirmed |
| `11-reader-not-in-class.png` | Valid card, wrong class |
| `12-teacher-dashboard-mid-lesson.png` | Screen 2 as the lesson opens: 15 in, 15 still to tap |
| `13-teacher-dashboard.png` | Screen 2 with the class scanned: **24 present, 3 late, 2 not recorded, 1 review** |
| `14-review-override.png` | Screen 3, on Ryan Tan |
| `15-class-summary.png` | Screen 4: **30 records — 24 present, 3 late, 2 absent, 1 review required** |
| `16-dashboard-dark-scheme.png` | Screen 2 in the dark scheme |
| `17-special-events.png` | Screen 5, with one event in each state (captured in a 1100px-tall window, because the page is taller than 900) |
| `18-events-approved-leave.png` | Screen 1 after scanning a student covered by a running event |
| `19-events-cancel-dialog.png` | The confirmation dialog for cancelling an event |

The last three figures are the specification's own worked example, and the set reaches them by
scanning the class in at the reader rather than by pre-loading it: thirteen cards are pushed at
the reader at 08:03, two students are left untapped, and the class-end rule turns those two into
the absentees.

---

## Where each requirement lives in the interface

| Requirement | Screen | Element |
|---|---|---|
| Students tap an RFID student card | 1 | The card, dragged or placed on the reader |
| The system searches the registered RFID list and identifies the student | 1 | `findStudentByCard()` |
| Invalid RFID cards produce an invalid-card message | 1 | **Card not recognised**, RFID lamp red |
| The first valid tap records the attendance time | 1, 2 | **Attendance recorded**; **Attendance time** column |
| At or before class start = PRESENT | 1, 2 | **Status PRESENT** |
| After class start = LATE | 1, 2 | **Status LATE** |
| Late minutes calculated automatically | 1, 2 | `Late by 7 min`; **Late minutes** column |
| No record at class end = ABSENT unless approved leave | 4 | **End class**, then the **Attendance details** panel |
| Approved leave is the exception | 1, 2 | **Approved leave confirmed**; the leave row |
| Duplicate taps within the period are ignored | 1 | **Duplicate tap — ignored**, RFID lamp amber |
| A captured image is used for a secondary identity check | 1, 3 | Step 2 of the sequence; **Captured image** and **Identity check** |
| Failed identity checks are flagged for teacher review | 2, 3 | **Review status** badge; the review screen |
| A later valid tap records a CLASS BREAK start | 1 | **Class break started** |
| The returning tap records the break end | 1 | **Welcome back** |
| Break duration and total break duration calculated | 1, 4 | `Break 4 min`; **Class break records** |
| Unresolved breaks at class end flagged for review | 4 | **Pending review** in the break panel |
| Teachers can review suspicious records | 3 | The screen, and the **Waiting for review** list |
| Manual Override | 3 | **Manual override** → **Save correction** / **Cancel** |
| Attendance records permanently stored | 4 | **Save records** → *Attendance records saved successfully* |
| System resets after class and is ready for the next class | 4 | **Reset for next class** → *System ready for the next class.* |
| Approved student events and temporary lesson leave | 5 | The **Create Special Event** panel: students, date, start, end, reason, notes |
| One event covers a group, not one event per student | 5 | The student multi-select and *"3 students selected"* |
| The register honours an approved event | 5, 1 | **Scheduled Events**; the reader shows *Approved leave confirmed* with the reason |
| A cancelled event stops excusing its students | 5 | **Cancel Event** → the confirmation dialog → the row reads *Cancelled* |

---

## Where the rules live

Plain TypeScript with no React in it, so each function can be lifted straight into a structure
chart, a flowchart or pseudocode.

```
src/lib/engine/attendance-engine.ts
  findStudentByCard()            step 1  look the card up in the register
  calculateAttendanceStatus()    step 2  PRESENT or LATE
  calculateLateMinutes()         step 3  how many minutes late
  isDuplicateTap()               step 4  is this tap inside the duplicate window?
  resolveScan()                  step 5  decide what this tap means
  finaliseClass()                step 6  close the lesson
  applyManualOverride()          step 7  let a teacher change a record
  summariseClass()               step 8  count the class up

src/lib/engine/events-engine.ts
  eventStatus()                  Scheduled / Active / Completed / Cancelled, from the clock
  isOnApprovedLeave()            question 1  may this student be at the reader now?
  isExcusedFromAbsence()         question 2  should the class-end rule leave them alone?
  validateEventDraft()           everything wrong with the form, in one list

src/lib/engine/review.ts         derives the review timeline from the record
src/lib/store/store.tsx          decides *when* a rule runs — never what it is
src/lib/data/seed.ts             the register, the lesson, and four filed events
src/lib/types.ts                 student / class / record / break / audit / event
```

`store.tsx` is the only file in `src/lib` that imports React. The reader station's four-step
sequence lives in `src/app/page.tsx` and calls the engine once, at the end of it. The two
approved-leave questions are handed to the engines as predicates, so neither engine has to know
what an event is.

---

## Three decisions in the sample data worth knowing

All three are documented in the source, and all three are judgements you may want to reverse.

**1. There is a five-minute on-time window.**
The specification's rule is *"at or before class start time = PRESENT, after class start time =
LATE"*, and the worked examples need a tap at 08:03 to be PRESENT while a tap at 08:07 is seven
minutes late. Those two cannot both hold against a bare 08:00 bell. So the lesson carries an
`onTimeWindowMinutes` of 5: on time up to 08:05, late after it, and the late minutes counted
from the 08:00 bell rather than from the end of the window. Set it to 0 and the rule becomes the
literal one. The window is stated on the reader setup panel and on the dashboard so it is never
a hidden behaviour.

**2. Most of the class has not arrived yet.**
The lesson opens part-way through and deliberately unfinished: **15 students have tapped, 15 have
not, and 1 is on approved leave**. Nothing is marked ABSENT, because absence is not an input to
this system — it is what the class-end rule produces when the teacher ends the class. The
dashboard says so in as many words: *"15 still to tap at the reader"*.

The fifteen who have tapped are seeded so that the two screens a teacher reads have something
real to show on first open — the review screen has Ryan Tan, and the summary screen has both his
break and Mei Ling's. Four events are seeded for the same reason, one in each state the Special
Events page can show, and they are chosen not to disturb the register: the running one covers two
students who had already tapped in before it began, and the cancelled one covers the two students
who are meant to end the lesson absent, so cancelling it is what makes them absent.

**3. A record id is `<class>:<student>`.**
A student has at most one record per lesson, so the automatically-marked ABSENT row and the row
a later tap creates share an id and the tap replaces the placeholder. Giving the absentee row its
own id would let a late arrival appear twice and would make the duplicate-tap rule check the
wrong row.

---

## How the WinUI layer is wired

The interface is Fluent UI React v9 throughout. `src/winui` is a **WinUI 3 restyling layer on
top of it**, not a replacement design system:

* `src/winui/tokens.ts` — 180 `--winui-*` definitions, switched between the light and dark
  dictionaries by `prefers-color-scheme`.
* `src/winui/theme.ts` — `winuiLightTheme` / `winuiDarkTheme`: a Fluent `Theme` with every Fluent
  token re-pointed at a `--winui-*` value.
* `src/winui/index.ts` — `winuiCss`, the 30 stylesheets joined into one string. It is injected
  once in `src/app/layout.tsx` and restyles Fluent's own `.fui-*` DOM.
* `src/winui/appearance.ts`, `presence.ts`, `toaster.tsx`, `switch-drag.tsx` — decorators that
  stamp `data-winui-appearance`, re-time the dialogs and menus, and give `Switch` its drag
  gesture.

[`src/lib/fluent.ts`](src/lib/fluent.ts) applies the whole chain once and re-exports the
components. **Every screen imports its components from that one module and nowhere else.**

Because the `--winui-*` dictionaries switch on `prefers-color-scheme` — a query JavaScript cannot
override for CSS variables — `src/app/providers.tsx` chooses the Fluent theme from the same
query, and from nothing else. That is what keeps the two in step.

---

## A note on the Figma request

A `.fig` file cannot be produced from here. What is provided instead is better for the
submission: the screens are **real, layered, editable source** — Fluent components and CSS
tokens, not flattened images — and `screens/` holds a rendered PNG of every state, so the
write-up can show the interface without a screenshot of a screenshot.

To change a screen, edit the page under `src/app`; to change how a whole control class looks,
edit `src/winui`. Nothing is baked into a picture.
