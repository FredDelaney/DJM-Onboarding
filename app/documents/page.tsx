'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  AlertTriangle,
  Download,
  FileText,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import {
  LoadingScreen,
  PlayerShell,
  usePlayerContext,
} from '@/components/PlayerShell';

import {
  fmtDate,
  supabase,
} from '@/lib/supabase';

const MAX_FILE_BYTES =
  15 * 1024 * 1024;

export default function Documents() {
  const ctx =
    usePlayerContext();

  const [docs, setDocs] =
    useState<any[]>([]);

  const [
    agreements,
    setAgreements,
  ] = useState<any[]>([]);

  const [
    docType,
    setDocType,
  ] = useState('');

  const [
    country,
    setCountry,
  ] = useState('');

  const [
    expiry,
    setExpiry,
  ] = useState('');

  const [busy, setBusy] =
    useState(false);

  const [toast, setToast] =
    useState('');

  const flash = (
    message: string,
  ) => {
    setToast(message);

    setTimeout(
      () => setToast(''),
      1800,
    );
  };

  const load = async () => {
    if (!ctx.player) {
      return;
    }

    const [
      {
        data: documents,
      },
      {
        data:
          visibleAgreements,
      },
    ] = await Promise.all([
      supabase
        .from(
          'player_documents',
        )
        .select('*')
        .eq(
          'player_id',
          ctx.player.id,
        )
        .order(
          'created_at',
          {
            ascending:
              false,
          },
        ),

      supabase
        .from(
          'player_agreements',
        )
        .select('*')
        .eq(
          'player_id',
          ctx.player.id,
        )
        .eq(
          'visible_to_player',
          true,
        )
        .order(
          'created_at',
          {
            ascending:
              false,
          },
        ),
    ]);

    setDocs(
      documents || [],
    );

    setAgreements(
      visibleAgreements ||
        [],
    );
  };

  useEffect(() => {
    void load();
  }, [ctx.player?.id]);

  if (ctx.loading) {
    return (
      <LoadingScreen />
    );
  }

  const upload = async (
    event: any,
  ) => {
    const input =
      event.currentTarget;

    const file =
      input.files?.[0];

    if (
      !file ||
      !ctx.player
    ) {
      return;
    }

    if (!docType) {
      flash(
        'Choose the document type first.',
      );

      input.value = '';
      return;
    }

    if (
      file.size >
      MAX_FILE_BYTES
    ) {
      flash(
        'That file is too large. Please keep uploads under 15 MB.',
      );

      input.value = '';
      return;
    }

    setBusy(true);

    const safe =
      file.name.replace(
        /[^a-zA-Z0-9._-]+/g,
        '-',
      );

    const path =
      `${ctx.user.id}/${Date.now()}-${safe}`;

    const {
      error:
        uploadError,
    } = await supabase.storage
      .from(
        'player-private',
      )
      .upload(
        path,
        file,
      );

    if (uploadError) {
      flash(
        'Could not upload that file.',
      );

      setBusy(false);
      input.value = '';
      return;
    }

    const {
      data: record,
      error:
        recordError,
    } = await supabase
      .from(
        'player_documents',
      )
      .insert({
        player_id:
          ctx.player.id,

        title:
          file.name,

        document_type:
          docType,

        bucket_id:
          'player-private',

        object_path:
          path,

        club_shareable:
          false,

        uploaded_by:
          ctx.user.id,

        country:
          country.trim() ||
          null,

        expires_at:
          expiry || null,
      })
      .select('*')
      .single();

    if (
      recordError ||
      !record
    ) {
      await supabase.storage
        .from(
          'player-private',
        )
        .remove([path]);

      flash(
        'Could not save that document.',
      );

      setBusy(false);
      input.value = '';
      return;
    }

    setDocs(
      (current) => [
        record,
        ...current,
      ],
    );

    setDocType('');
    setCountry('');
    setExpiry('');

    setBusy(false);

    input.value = '';

    flash(
      'Uploaded securely',
    );
  };

  const open = async (
    document: any,
  ) => {
    const {
      data,
      error,
    } = await supabase.storage
      .from(
        document.bucket_id,
      )
      .createSignedUrl(
        document.object_path,
        120,
      );

    if (
      error ||
      !data?.signedUrl
    ) {
      flash(
        'Could not open that file.',
      );

      return;
    }

    window.open(
      data.signedUrl,
      '_blank',
    );
  };

  return (
    <PlayerShell
      inboxCount={
        ctx.openRequests
          .length
      }
    >
      <main className="narrow player-shell">
        <div
          className="row-between"
          style={{
            alignItems:
              'flex-end',
            margin:
              '14px 0 28px',
          }}
        >
          <div>
            <div className="section-kicker">
              PRIVATE FILES
            </div>

            <h1
              className="page-title"
              style={{
                marginBottom:
                  0,
              }}
            >
              Documents.
            </h1>
          </div>
        </div>

        <p
          className="page-intro"
          style={{
            marginBottom:
              30,
          }}
        >
          Passports,
          agreements and career
          documents live here
          securely. Upload once,
          then DJM has access
          when it is genuinely
          needed.
        </p>

        <section
          className="card pad"
          style={{
            marginBottom:
              18,
          }}
        >
          <div className="section-kicker">
            UPLOAD A DOCUMENT
          </div>

          <p
            className="small muted"
            style={{
              margin:
                '8px 0 18px',
              lineHeight: 1.5,
            }}
          >
            Tell DJM what the
            file is first, then
            choose the document.
          </p>

          <div className="grid3">
            <div className="field">
              <label className="label">
                Document type
              </label>

              <select
                className="select"
                value={
                  docType
                }
                onChange={(
                  event,
                ) =>
                  setDocType(
                    event
                      .target
                      .value,
                  )
                }
              >
                <option value="">
                  Choose type
                </option>

                <option value="passport">
                  Passport
                </option>

                <option value="visa">
                  Visa / work
                  right
                </option>

                <option value="contract">
                  Contract /
                  agreement
                </option>

                <option value="id">
                  ID document
                </option>

                <option value="medical">
                  Medical /
                  clearance
                </option>

                <option value="other">
                  Other
                </option>
              </select>
            </div>

            <div className="field">
              <label className="label">
                Country{' '}
                <span className="muted">
                  optional
                </span>
              </label>

              <input
                className="input"
                value={
                  country
                }
                onChange={(
                  event,
                ) =>
                  setCountry(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="New Zealand"
              />
            </div>

            <div className="field">
              <label className="label">
                Expiry{' '}
                <span className="muted">
                  optional
                </span>
              </label>

              <input
                className="input"
                type="date"
                value={
                  expiry
                }
                onChange={(
                  event,
                ) =>
                  setExpiry(
                    event
                      .target
                      .value,
                  )
                }
              />
            </div>
          </div>

          <label
            className={`btn btn-navy btn-block ${
              busy ||
              !docType
                ? 'disabled'
                : ''
            }`}
            style={{
              marginTop: 16,
            }}
          >
            <Upload
              size={15}
            />

            {busy
              ? 'Uploading…'
              : 'Choose file & upload'}

            <input
              type="file"
              accept=".pdf,.doc,.docx,image/*"
              hidden
              disabled={
                busy ||
                !docType
              }
              onChange={
                upload
              }
            />
          </label>

          <p
            className="tiny muted"
            style={{
              marginBottom:
                0,
              textAlign:
                'center',
            }}
          >
            PDF, Word or image
            · maximum 15 MB
          </p>
        </section>

        <section className="card pad-lg">
          <div className="row">
            <ShieldCheck
              size={19}
            />

            <strong>
              Private storage
            </strong>
          </div>

          <p
            className="small muted"
            style={{
              lineHeight: 1.5,
            }}
          >
            Files are not
            public. DJM can
            intentionally
            approve specific
            material for a club
            share when
            appropriate.
          </p>
        </section>

        <section
          style={{
            marginTop: 26,
          }}
        >
          <div className="section-kicker">
            YOUR FILES
          </div>

          <div className="card pad">
            {docs.length ? (
              <div className="list-clean">
                {docs.map(
                  (
                    document,
                  ) => (
                    <button
                      key={
                        document.id
                      }
                      onClick={() =>
                        open(
                          document,
                        )
                      }
                      className="list-row"
                      style={{
                        width:
                          '100%',
                        border: 0,
                        background:
                          'transparent',
                        textAlign:
                          'left',
                      }}
                    >
                      <div className="list-icon">
                        <FileText
                          size={
                            18
                          }
                        />
                      </div>

                      <div className="list-copy">
                        <strong>
                          {
                            document.title
                          }
                        </strong>

                        <span>
                          {[
                            document.document_type?.replace(
                              '_',
                              ' ',
                            ),

                            document.country,

                            document.expires_at
                              ? `expires ${fmtDate(
                                  document.expires_at,
                                )}`
                              : null,

                            document.club_shareable
                              ? 'Approved for club share'
                              : 'Private',
                          ]
                            .filter(
                              Boolean,
                            )
                            .join(
                              ' · ',
                            )}
                        </span>
                      </div>

                      {document.expires_at &&
                        new Date(
                          `${document.expires_at}T00:00:00`,
                        ).getTime() -
                          Date.now() <
                          180 *
                            86400000 && (
                          <AlertTriangle
                            size={
                              16
                            }
                            className="warning-icon"
                          />
                        )}

                      <Download
                        size={
                          16
                        }
                        className="muted"
                      />
                    </button>
                  ),
                )}
              </div>
            ) : (
              <div className="empty">
                <strong>
                  No documents
                  yet.
                </strong>

                <span>
                  Upload a
                  passport,
                  agreement or
                  any document
                  DJM needs.
                </span>
              </div>
            )}
          </div>
        </section>

        {agreements.length >
          0 && (
          <section
            style={{
              marginTop: 26,
            }}
          >
            <div className="section-kicker">
              REPRESENTATION
            </div>

            <div className="card pad">
              <div className="list-clean">
                {agreements.map(
                  (
                    agreement,
                  ) => (
                    <div
                      className="list-row"
                      key={
                        agreement.id
                      }
                    >
                      <div className="list-icon">
                        <ShieldCheck
                          size={
                            17
                          }
                        />
                      </div>

                      <div className="list-copy">
                        <strong>
                          {agreement.title ||
                            `${agreement.agreement_type} agreement`}
                        </strong>

                        <span>
                          {
                            agreement.status
                          }{' '}
                          ·{' '}
                          {agreement.end_date
                            ? `to ${fmtDate(
                                agreement.end_date,
                              )}`
                            : 'No end date recorded'}
                        </span>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          </section>
        )}

        {toast && (
          <div className="toast">
            {toast}
          </div>
        )}
      </main>
    </PlayerShell>
  );
}
