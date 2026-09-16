"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import PublicProfile from "@/components/PublicProfile";
import { supabase } from "@/lib/supabase";

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token;

  const [data, setData] = useState<any>(undefined);

  useEffect(() => {
    let active = true;

    (async () => {
      if (!token) {
        if (active) setData(null);
        return;
      }

      const { data: response, error } = await supabase.functions.invoke(
        "club-share-public",
        {
          body: { token },
        },
      );

      if (!active) return;

      if (error || response?.error) {
        setData(null);
        return;
      }

      setData(response?.data || null);
    })();

    return () => {
      active = false;
    };
  }, [token]);

  if (data === undefined) {
    return (
      <div className="center">
        <div className="loader" />
      </div>
    );
  }

  if (!data?.profile) {
    return (
      <div className="center">
        <div className="card pad-lg" style={{ textAlign: "center" }}>
          <h2>This club link is unavailable.</h2>
          <p className="muted">
            It may have expired or been withdrawn by the representing agency.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PublicProfile
      profile={data.profile}
      agency={data.agency}
      documents={data.documents || []}
      shareToken={token}
      pitchMessage={data.pitch_message}
      targetClub={data.target_club}
    />
  );
}
