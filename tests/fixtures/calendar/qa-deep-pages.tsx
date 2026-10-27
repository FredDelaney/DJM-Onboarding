import { useCallback, useEffect, useState } from "react";
import AgencyNegotiationCommandRoom from "@/components/AgencyNegotiationCommandRoom";
import AgencyPlayerServiceReviewDrawer from "@/components/AgencyPlayerServiceReviewDrawer";
import AgencyDealCloseoutDrawer from "@/components/AgencyDealCloseoutDrawer";
import AgencyMemoryDrawer from "@/components/AgencyMemoryDrawer";
const noop = () => {};
const refresh = async () => {};
export async function getServerSideProps({
  query,
}: {
  query: Record<string, string>;
}) {
  return {
    props: {
      kind: query.kind || "negotiation",
      role: query.role || "owner",
      longTitle: query.title === "long",
    },
  };
}
export default function Page({
  kind,
  role,
  longTitle,
}: {
  kind: string;
  role: string;
  longTitle: boolean;
}) {
  const [record, setRecord] = useState("first"),
    [closed, setClosed] = useState(false);
  useEffect(() => {
    (window as any).qaSelectRecord = setRecord;
    return () => {
      delete (window as any).qaSelectRecord;
    };
  }, []);
  const invoke = useCallback(
    async (action: string, body?: Record<string, unknown>) => {
      const response = await fetch("/qa-deep-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, body }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not load this record.");
      return result;
    },
    [],
  );
  const title = longTitle
    ? "A detailed transfer and representation discussion for Example FC ".repeat(
        4,
      )
    : "Example " + record;
  const shared = {
    invoke,
    onClose: () => setClosed(true),
    presentation: "page" as const,
  };
  return (
    <main data-interface="calm" style={{ minHeight: 2400, padding: 20 }}>
      <h1>Deep record journey</h1>
      {closed ? (
        <p>Back in workspace</p>
      ) : (
        <>
          {kind === "negotiation" ? (
            <AgencyNegotiationCommandRoom
              {...shared}
              request={{
                key: record,
                dealRoomId: record,
                title,
              }}
              role={role}
              onOpenAction={noop}
              onApplied={refresh}
            />
          ) : null}
          {kind === "review" ? (
            <AgencyPlayerServiceReviewDrawer
              {...shared}
              request={{
                key: record,
                playerId: record,
                title,
              }}
              onOpenAction={noop}
              onApplied={refresh}
            />
          ) : null}
          {kind === "closeout" ? (
            <AgencyDealCloseoutDrawer
              {...shared}
              request={{
                key: record,
                dealRoomId: record,
                title,
              }}
              role={role}
              onApplied={refresh}
            />
          ) : null}
          {kind === "memory" ? (
            <AgencyMemoryDrawer {...shared} onApplied={refresh} />
          ) : null}
        </>
      )}
    </main>
  );
}
