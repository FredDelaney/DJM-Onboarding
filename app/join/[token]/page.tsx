"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";

import { isStrongPassword, STRONG_PASSWORD_MESSAGE } from "@/lib/password";
import { supabase } from "@/lib/supabase";

const PRIVACY_NOTICE_VERSION = "2026-09-02";

const cleanColour = (value: unknown, fallback: string) => {
  const colour = String(value || "").trim();

  return /^#[0-9a-f]{6}$/i.test(colour) ? colour : fallback;
};

function InviteBrand({
  agency,
  light = false,
}: {
  agency: any;
  light?: boolean;
}) {
  const agencyName =
    String(agency?.display_name || "Agency").trim() || "Agency";

  const shortName =
    String(agency?.short_name || agencyName).trim() || agencyName;

  const portalName =
    String(agency?.portal_name || `${shortName} Player`).trim() ||
    `${shortName} Player`;

  const logo =
    (light ? agency?.light_logo_asset : null) ||
    agency?.logo_asset ||
    agency?.compact_logo_asset ||
    null;

  const mark = shortName
    .split(/\s+/)
    .filter(Boolean)
    .map((part: string) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return (
    <div
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label={agencyName}
    >
      <span className="brand-mark">
        {logo ? (
          <img src={logo} alt={agencyName} />
        ) : (
          <span className="tenant-lettermark" aria-hidden="true">
            {mark}
          </span>
        )}
      </span>

      <span className="brand-copy">
        {portalName}
        <small>{agencyName.toUpperCase()}</small>
      </span>
    </div>
  );
}

export default function Join() {
  const params = useParams<{ token: string }>();

  const token = Array.isArray(params?.token) ? params.token[0] : params?.token;

  const router = useRouter();

  const [invite, setInvite] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  const [password, setPassword] = useState("");

  const [msg, setMsg] = useState("");

  const [busy, setBusy] = useState(false);

  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      if (!token) {
        if (active) {
          setInvite(null);
          setLoading(false);
        }

        return;
      }

      const { data, error } = await supabase.functions.invoke(
        "player-invite-public",
        {
          body: {
            token,
          },
        },
      );

      if (!active) return;

      setInvite(!error && !data?.error ? data?.invite || null : null);

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [token]);

  const agency = invite?.agency || {};

  const agencyName =
    String(agency?.display_name || "the representing agency").trim() ||
    "the representing agency";

  const agencyShortName =
    String(agency?.short_name || agency?.display_name || "Agency").trim() ||
    "Agency";

  const portalName =
    String(agency?.portal_name || `${agencyShortName} Player`).trim() ||
    `${agencyShortName} Player`;

  const primaryColour = cleanColour(agency?.primary_color, "#061f3a");

  const accentColour = cleanColour(agency?.accent_color, "#f5e900");

  const tenantStyle = {
    "--navy": primaryColour,
    "--blue": primaryColour,
    "--yellow": accentColour,
  } as any;

  const submit = async (event: any) => {
    event.preventDefault();

    if (!invite?.email || !token) {
      return;
    }

    if (!privacyAccepted) {
      setMsg("Please review the Privacy Notice before continuing.");

      return;
    }

    if (!isStrongPassword(password)) {
      setMsg(STRONG_PASSWORD_MESSAGE);

      return;
    }

    setBusy(true);
    setMsg("");

    try {
      await supabase.auth.signOut();

      const { data: accepted, error: inviteError } =
        await supabase.functions.invoke("accept-player-invite", {
          body: {
            token,
            email: invite.email,
            password,
            privacy_notice_version: PRIVACY_NOTICE_VERSION,
            privacy_acknowledged: privacyAccepted,
          },
        });

      if (inviteError) {
        throw inviteError;
      }

      if (accepted?.error) {
        throw new Error(accepted.error);
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        throw new Error(
          "Your account was created, but we could not start your session. Please sign in again.",
        );
      }

      router.replace("/onboarding");
    } catch (error: any) {
      setMsg(
        error?.message ||
          "We could not activate your player account. Please try again.",
      );

      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="center">
        <div className="loader" />
      </div>
    );
  }

  if (!invite?.valid) {
    return (
      <div className="center" style={tenantStyle}>
        <div
          className="card pad-lg"
          style={{
            maxWidth: 430,
            textAlign: "center",
          }}
        >
          {invite?.agency ? <InviteBrand agency={invite.agency} /> : null}

          <h2
            style={{
              marginTop: 28,
            }}
          >
            This invitation is no longer active.
          </h2>

          <p className="muted">
            {invite?.agency
              ? `Ask ${agencyName} for a new player invitation.`
              : "Ask the representing agency for a new player invitation."}
          </p>
        </div>
      </div>
    );
  }

  const playerName = invite.full_name || "Player";

  return (
    <main className="auth-wrap join-premium" style={tenantStyle}>
      <section className="auth-brand join-premium-brand">
        <InviteBrand agency={agency} light />

        <div>
          <div className="join-player-mark">
            {String(playerName).charAt(0).toUpperCase()}
          </div>

          <div className="caps join-caps">YOUR PRIVATE CAREER SPACE</div>

          <h1>{playerName}</h1>

          <p>
            {agencyName} has already started your player record. Check the
            details, add anything we cannot know for you, and you are done.
          </p>
        </div>

        <span className="small join-private-line">
          <ShieldCheck size={14} />
          Private invitation · {invite.email}
        </span>
      </section>

      <section className="auth-form">
        <div className="auth-box join-premium-box">
          <div
            className="caps"
            style={{
              color: "var(--blue)",
            }}
          >
            {portalName.toUpperCase()}
          </div>

          <h2>Your profile is waiting.</h2>

          <p className="page-intro">
            We already know who you are. Create your private access and then
            just check what {agencyShortName} has prepared.
          </p>

          <div className="join-known-card">
            <CheckCircle2 size={18} />

            <div>
              <strong>{playerName}</strong>

              <span>{invite.email}</span>
            </div>
          </div>

          <form onSubmit={submit} className="stack">
            <div className="field">
              <label className="label">Create password</label>

              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="12+ characters · upper, lower, number, symbol"
                minLength={12}
                required
              />
            </div>

            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "4px 0 2px",
                color: "var(--muted)",
                fontSize: 13,
                lineHeight: 1.5,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(event) => setPrivacyAccepted(event.target.checked)}
                style={{
                  width: 17,
                  height: 17,
                  marginTop: 2,
                  flex: "0 0 auto",
                  accentColor: "var(--navy)",
                }}
              />

              <span>
                I have read the{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "var(--blue)",
                    fontWeight: 800,
                  }}
                >
                  Privacy Notice
                </Link>{" "}
                and understand how my information is used in this player portal.
              </span>
            </label>

            {msg && <div className="join-message">{msg}</div>}

            <button
              className="btn btn-navy btn-block join-continue"
              disabled={busy || !privacyAccepted}
            >
              {busy ? "Creating…" : `Open my ${portalName}`}

              <ArrowRight size={17} />
            </button>
          </form>

          <div className="join-trust-note">
            <ShieldCheck size={16} />

            <span>
              Personal documents, salary expectations and private career
              information are not public.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
