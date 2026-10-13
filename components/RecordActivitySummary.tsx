import styles from "./RecordActivitySummary.module.css";
export default function RecordActivitySummary({
  summary,
  when,
}: {
  summary?: string | null;
  when?: string | null;
}) {
  return (
    <section className={styles.root} aria-label="Latest activity">
      <span>Latest activity</span>
      <strong>{summary || "No recent activity"}</strong>
      {when ? <small>{when}</small> : null}
    </section>
  );
}
