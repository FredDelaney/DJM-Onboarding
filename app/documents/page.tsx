'use client';

import {
  useEffect,
  useRef,
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

import JourneyStatus from '@/components/JourneyStatus';
import {usePlayerPageRead} from '@/lib/use-player-page-read';
import {savePrivateDocument, type DocumentUploadDraft} from '@/lib/private-document-write';

const DOCUMENT_FIELDS = 'id,player_id,title,document_type,bucket_id,object_path,club_shareable,uploaded_by,country,expires_at,created_at';
type PrivateDocumentDraft = DocumentUploadDraft & {
  file: File;
  payload: {
    id: string; player_id: string; title: string; document_type: string;
    bucket_id: 'player-private'; object_path: string; club_shareable: false;
    uploaded_by: string; country: string | null; expires_at: string | null;
  };
};

const readDocuments = async (playerId: string) => {
  const [documentResult, agreementResult] = await Promise.all([
    supabase.from('player_documents').select(DOCUMENT_FIELDS).eq('player_id', playerId).order('created_at', {ascending:false}),
    supabase.from('player_agreements').select('*').eq('player_id', playerId).eq('visible_to_player', true).order('created_at', {ascending:false}),
  ]);
  if (documentResult.error) throw documentResult.error;
  if (agreementResult.error) throw agreementResult.error;
  return {documents:documentResult.data || [],agreements:agreementResult.data || []};
};

const MAX_FILE_BYTES =
  15 * 1024 * 1024;

export default function Documents() {
  const ctx =
    usePlayerContext();

  const pageRead = usePlayerPageRead(ctx.player?.id, readDocuments);
  const docs = pageRead.data?.documents || [];
  const agreements = pageRead.data?.agreements || [];

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

  const [draft, setDraft] = useState<PrivateDocumentDraft | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadStage, setUploadStage] = useState<'upload' | 'record'>('upload');
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const activeWrite = useRef(false);
  const pendingDraft = useRef<PrivateDocumentDraft | null>(null);
  const owner = {playerId: ctx.player?.id, userId: ctx.user?.id, resolved: !ctx.loading && !ctx.error};
  const scope = useRef(owner);
  if (scope.current.playerId !== owner.playerId || scope.current.userId !== owner.userId || scope.current.resolved !== owner.resolved) {
    scope.current = owner;
  }
  const confirmedOwner = useRef(owner.resolved ? owner : null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!owner.resolved) {
      if (activeWrite.current) setUploadError('We could not confirm your document upload. Your selected file is still here. Try again after your account reconnects.');
      activeWrite.current = false;
      setBusy(false);
      setToast('');
      return;
    }
    const previous = confirmedOwner.current;
    confirmedOwner.current = owner;
    if (previous && (previous.playerId !== owner.playerId || previous.userId !== owner.userId)) {
      pendingDraft.current = null;
      activeWrite.current = false;
      setDraft(null); setBusy(false); setUploadError(''); setToast('');
      setDocType(''); setCountry(''); setExpiry('');
      if (fileInput.current) fileInput.current.value = '';
    }
  }, [owner.playerId, owner.userId, owner.resolved]);

  const flash = (message: string) => {
    const captured = scope.current;
    if (!mounted.current || !captured.resolved) return;
    setToast(message);
    setTimeout(() => {
      if (mounted.current && scope.current === captured) setToast('');
    }, 1800);
  };

  if (ctx.loading || ctx.error) {
    return (
      <LoadingScreen error={ctx.error} onRetry={() => void ctx.refresh()} />
    );
  }

  if (!ctx.player) {
    return <PlayerShell><main className="narrow player-shell"><JourneyStatus title="No player profile is linked yet" description="Ask your agency to link your profile to this account."/></main></PlayerShell>;
  }

  if (pageRead.loading || pageRead.error) {
    return <PlayerShell><main className="narrow player-shell"><JourneyStatus
      kind={pageRead.error ? 'error' : 'loading'}
      title={pageRead.error ? 'Your documents could not load' : 'Loading your documents'}
      description={pageRead.error || 'Loading your private files and shared agreements.'}
      onRetry={pageRead.error ? () => void pageRead.retry() : undefined}
    /></main></PlayerShell>;
  }

  const saveSelected = async (selected: PrivateDocumentDraft) => {
    const captured = scope.current;
    const isCurrent = () => mounted.current && scope.current === captured && captured.resolved &&
      pendingDraft.current === selected;
    if (activeWrite.current || !isCurrent() ||
        captured.playerId !== selected.payload.player_id || captured.userId !== selected.payload.uploaded_by) return;
    activeWrite.current = true;
    setBusy(true); setUploadError(''); setUploadStage(selected.uploaded ? 'record' : 'upload');
    const outcome = await savePrivateDocument(
      selected,
      async () => {
        if (!isCurrent()) return {data: null, error: null};
        const result = await supabase.storage.from('player-private')
          .upload(selected.payload.object_path, selected.file, {upsert: true});
        if (result.error) return {data: null, error: result.error};
        const data = result.data;
        return {data: data?.path === selected.payload.object_path &&
          data.fullPath === 'player-private/' + selected.payload.object_path ? data : null, error: null};
      },
      async signal => {
        if (signal.aborted || !isCurrent()) return {data: null, error: null};
        setUploadStage('record');
        const inserted = await supabase.from('player_documents').insert(selected.payload)
          .select(DOCUMENT_FIELDS).abortSignal(signal).single();
        let result: {data: typeof inserted.data; error: typeof inserted.error} = inserted;
        if (result.error?.code === '23505' && !signal.aborted && isCurrent()) {
          // INSERT may already have committed before its response was lost.
          // Reconcile this exact owned record; never overwrite agency approval.
          result = await supabase.from('player_documents').select(DOCUMENT_FIELDS)
            .eq('id', selected.payload.id).eq('player_id', selected.payload.player_id)
            .eq('uploaded_by', selected.payload.uploaded_by).abortSignal(signal).maybeSingle();
        }
        if (result.error) return {data: null, error: result.error};
        const record = result.data;
        const matches = record && typeof record.club_shareable === 'boolean' &&
          Object.entries(selected.payload).every(([key, value]) =>
            key === 'club_shareable' || record[key as keyof typeof record] === value);
        return {data: matches ? record : null, error: null};
      },
      isCurrent,
    );
    if (!isCurrent()) return;
    activeWrite.current = false; setBusy(false);
    if (outcome.status !== 'saved') {
      if (outcome.status !== 'stale') setUploadError(outcome.stage === 'upload'
        ? 'We could not confirm your file upload. Your selected file and details are still here. Try again to continue with the same file.'
        : 'We could not confirm your document was saved. Your file has not been deleted. Try again to check and save the same document.');
      return;
    }
    pageRead.updateData(current => ({
      ...current,
      documents: [outcome.record, ...current.documents.filter(document => document.id !== outcome.record.id)],
    }));
    pendingDraft.current = null; setDraft(null); setUploadError('');
    setDocType(''); setCountry(''); setExpiry('');
    if (fileInput.current) fileInput.current.value = '';
    flash('Uploaded securely');
  };

  const upload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || activeWrite.current || pendingDraft.current || !ctx.player || !ctx.user || !scope.current.resolved) return;
    if (!docType) { flash('Choose the document type first.'); input.value = ''; return; }
    if (file.size > MAX_FILE_BYTES) {
      flash('That file is too large. Please keep uploads under 15 MB.');
      input.value = ''; return;
    }
    const id = crypto.randomUUID();
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'file';
    const selected: PrivateDocumentDraft = {
      file, uploaded: false,
      payload: {
        id, player_id: ctx.player.id, title: file.name, document_type: docType,
        bucket_id: 'player-private', object_path: ctx.user.id + '/' + id + '-' + safe,
        club_shareable: false, uploaded_by: ctx.user.id,
        country: country.trim() || null, expires_at: expiry || null,
      },
    };
    pendingDraft.current = selected; setDraft(selected);
    void saveSelected(selected);
  };

  const chooseAnother = () => {
    if (activeWrite.current) return;
    pendingDraft.current = null; setDraft(null); setUploadError('');
    if (fileInput.current) fileInput.current.value = '';
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
          then your agency has access
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
            Tell your agency what the
            file is first, then
            choose the document.
          </p>

          <div className="grid3">
            <div className="field">
              <label className="label" htmlFor="private-document-type">
                Document type
              </label>

              <select
                id="private-document-type"
                disabled={busy || !!draft}
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
              <label className="label" htmlFor="private-document-country">
                Country{' '}
                <span className="muted">
                  optional
                </span>
              </label>

              <input
                id="private-document-country"
                disabled={busy || !!draft}
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
              <label className="label" htmlFor="private-document-expiry">
                Expiry{' '}
                <span className="muted">
                  optional
                </span>
              </label>

              <input
                id="private-document-expiry"
                disabled={busy || !!draft}
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
              busy || !!draft ||
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
              : draft ? 'File selected' : 'Choose file & upload'}

            <input
              ref={fileInput}
              aria-label="Choose private file"
              type="file"
              accept=".pdf,.doc,.docx,image/*"
              hidden
              disabled={
                busy || !!draft ||
                !docType
              }
              onChange={
                upload
              }
            />
          </label>

          {draft && <div style={{marginTop: 16}}>
            <p className="small" style={{overflowWrap: 'anywhere'}}>
              Selected file: <strong>{draft.file.name}</strong>
            </p>
            {busy ? <JourneyStatus kind="loading"
              title={uploadStage === 'upload' ? 'Uploading your private file' : 'Saving your document details'}
              description="Keep this page open while we confirm your upload."/> : uploadError ? <>
              <JourneyStatus kind="error" title="Your document upload needs another try" description={uploadError}
                onRetry={() => void saveSelected(draft)}/>
              <button type="button" className="btn btn-soft btn-block" style={{marginTop: 12}}
                onClick={chooseAnother}>Choose another file</button>
              <p className="tiny muted">An earlier upload may still finish. Choosing another file does not delete a file already stored.</p>
            </> : null}
          </div>}

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
            public. Your agency can
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
                  your agency needs.
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
