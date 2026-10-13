import styles from "./RecordActivitySummary.module.css";
export default function RecordActivitySummary({
  summary,
  when,
}: {
  summary?: string | null;
  when?: string | null;
}) {
  const recordedAt = when ? new Date(when) : null;
  const date =
    recordedAt && Number.isFinite(recordedAt.getTime())
      ? new Intl.DateTimeFormat("en-NZ", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(recordedAt)
      : null;
  return (
    <section className={styles.root} aria-label="Latest activity">
      <span>Latest activity</span>
      <strong>{summary || "No recent activity"}</strong>
      {date ? (
        <small>
          <time dateTime={when!}>{date}</time>
        </small>
      ) : null}
    </section>
  );
}
