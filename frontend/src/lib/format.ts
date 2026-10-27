export function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, "0")} min` : `${minutes} min`;
}

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const etaFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** e.g. "Tue, Oct 27, 5:19 AM CDT" */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** Compact form for table rows, e.g. "Tue 5:19 AM". */
export function formatEta(iso: string): string {
  return etaFormat.format(new Date(iso));
}

/** A Date as the "YYYY-MM-DDTHH:mm" string a datetime-local input expects (local time). */
export function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** A datetime-local value (local time) as a UTC ISO string for the API. */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}