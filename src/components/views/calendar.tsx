import { PlanResults } from "@/components/plan-results";
import { accuracy, planResults } from "@/lib/view/actuals";
import { typicalDays } from "@/lib/view/patterns";
import { EventCard } from "@/components/advisor";
import { AddCalendarForm, AddPlanButton, PlanProvider, SyncButton, UploadIcsForm } from "@/components/calendar-forms";
import { QuickAction } from "@/components/form";
import { Badge, Card, Disclosure, Notice, PageHeader } from "@/components/ui";
import type { ViewProps } from "./types";
import { buildDashboard } from "@/lib/view/dashboard";
import { PlanCalendar, type DayMark } from "@/components/plan-calendar";
import { deleteCalendarSource, toggleCalendarSource } from "@/app/app/actions";

const STATUS = {
  ok: { tone: "good", label: "Synced" },
  never: { tone: "warn", label: "Not synced yet" },
  error: { tone: "bad", label: "Sync failed" },
  empty_suspicious: { tone: "warn", label: "Came back empty" },
} as const;

export function CalendarView({ snapshot, today, nowIso, demo = false }: ViewProps) {
  const m = buildDashboard(snapshot, today, 30, new Date(nowIso));
  // Paydays and bills, so the calendar gives a sense of the whole month.
  const marks: DayMark[] = m.forecast90.days.flatMap((d) =>
    d.items
      .filter((i) => i.kind === "income" || i.kind === "bill" || i.kind === "subscription" || i.kind === "loan_payment" || i.kind === "card_payment" || (i.kind === "transfer" && i.cashEffectCents > 0))
      .map((i) => ({
        date: d.date,
        kind: i.kind === "income" ? ("income" as const) : i.kind === "transfer" ? ("move" as const) : ("bill" as const),
        label: i.kind === "transfer" ? `From savings${i.label ? ` · ${i.label}` : ""}` : i.label,
        cents: i.cashEffectCents,
      })),
  );
  const ics = snapshot.calendarSources.some((s) => s.kind === "ics_url" && s.enabled);
  return (
    <>
      <PageHeader title="Plan" subtitle="Your plans, priced. Each plan on your calendar gets an expected cost and a verdict: fits, fits with a small change, or not yet. Tap a day to see what you can spend that day, or a plan to see your options." action={ics ? <SyncButton label="Sync all" /> : undefined} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {m.coverage.incomplete && (
            <Notice tone="warn" title={m.coverage.status === "none" ? "No calendars connected" : "Calendar coverage is incomplete"}>
              {m.coverage.notes.join(" ")} Until every calendar syncs, a buffer is held back from your daily limits.
            </Notice>
          )}
          <Card
            title="Your plans"
            action={<AddPlanButton openFromUrl snapshot={snapshot} today={today} nextPayday={m.nextPayday} events={m.planned} calendarIncomplete={m.coverage.incomplete} />}
          >
            <PlanProvider value={{ snapshot, today, nextPayday: m.nextPayday, events: m.planned, calendarIncomplete: m.coverage.incomplete }}>
              <PlanCalendar views={m.allEvents} marks={marks} baseline={m.baselineByDay} periods={m.payPeriods} today={today} end={m.forecast90.endDate} accounts={snapshot.accounts} typical={typicalDays(snapshot, today, m.forecast90.endDate)} />
            </PlanProvider>
            {!demo && m.duplicates.length > 0 && (
              <div className="mt-4">
                <Disclosure summary={`${m.duplicates.length} hidden duplicate${m.duplicates.length === 1 ? "" : "s"} (counted once)`}>
                  <ul className="space-y-2">
                    {m.duplicates.map((v) => <EventCard key={v.event.id} view={v} accounts={snapshot.accounts} />)}
                  </ul>
                </Disclosure>
              </div>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          {(() => {
            const r = planResults(snapshot, today);
            return <PlanResults results={r} acc={accuracy(r)} />;
          })()}
          <Card title="Connected calendars">
            {snapshot.calendarSources.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <ul className="space-y-3">
                {snapshot.calendarSources.map((s) => {
                  const st = STATUS[s.lastStatus];
                  return (
                    <li key={s.id} className="rounded-xl border border-line p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{s.name}</p>
                        {s.enabled ? <Badge tone={st.tone}>{st.label}</Badge> : <Badge>Off</Badge>}
                      </div>
                      <p className="text-xs text-muted">
                        {s.kind === "ics_upload" ? "Uploaded file" : s.urlHint ?? "iCal link"} · {s.eventCount} events
                        {s.lastSyncedAt && ` · last synced ${new Date(s.lastSyncedAt).toLocaleString("en-US", { timeZone: snapshot.profile.timezone, dateStyle: "medium", timeStyle: "short" })}`}
                      </p>
                      {s.lastError && <p className={`mt-1 text-xs ${s.lastStatus === "ok" ? "text-faint" : "text-warn"}`}>{s.lastError}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.kind === "ics_url" && s.enabled && <SyncButton id={s.id} />}
                        <QuickAction action={toggleCalendarSource} fields={{ id: s.id, enabled: s.enabled ? "false" : "true" }} variant="secondary">{s.enabled ? "Turn off" : "Turn on"}</QuickAction>
                        <QuickAction action={deleteCalendarSource} fields={{ id: s.id }} variant="danger" confirm={`Disconnect ${s.name} and remove its events? Your corrections for similar events are kept.`}>Remove</QuickAction>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title="Connect a calendar">
            <AddCalendarForm />
            <div className="mt-3">
              <Disclosure summary="Where do I find the secret iCal address?">
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
                  <li><strong className="text-ink">Google Calendar:</strong> not in the phone app — open calendar.google.com in a browser (on a phone, choose “Desktop site”). ⚙ Settings → under “Settings for my calendars” tap the calendar → “Integrate calendar” → copy “Secret address in iCal format”. Missing? A work or school account may have it turned off by the admin.</li>
                  <li><strong className="text-ink">Apple (iCloud):</strong> iPhone Calendar app → “Calendars” at the bottom → ⓘ next to the calendar → turn on “Public Calendar” → “Share Link…” → Copy. On a Mac: right-click the calendar → “Share Calendar…” → tick “Public Calendar”. Only iCloud calendars have this; “On My iPhone” or Google calendars shown in Apple’s app don’t.</li>
                  <li><strong className="text-ink">Outlook.com / Microsoft 365:</strong> Settings → Calendar → Shared calendars → “Publish a calendar” → copy the ICS link.</li>
                  <li>Add each calendar you want included — your own and shared ones. Only calendars you add here are read.</li>
                </ul>
              </Disclosure>
            </div>
          </Card>
          <Card title="Upload a calendar file"><UploadIcsForm /></Card>
        </div>
      </div>
    </>
  );
}
