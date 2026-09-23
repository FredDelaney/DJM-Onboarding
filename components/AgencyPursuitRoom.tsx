'use client';

import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleAlert,
  Clipboard,
  FileText,
  Link2,
  LoaderCircle,
  MessageSquareText,
  Send,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import {
  friendlyError,
  relativeDate,
} from '@/lib/platform-client';

import styles from './AgencyPursuitRoom.module.css';

export type AgencyPursuitRequest = {
  key: string;
  playerMatchId: string;
  playerId?: string | null;
  playerName: string;
  clubId?: string | null;
  clubName: string;
  needTitle?: string | null;
  careerGateState?: string | null;
  careerGateReason?: string | null;
  accessLabel?: string | null;
  accessDetail?: string | null;
};

type Invoke = (
  action: string,
  body?: Record<string, unknown>,
) => Promise<any>;

type ConfirmAction =
  | 'create_dossier'
  | 'publish_dossier'
  | 'create_pitch'
  | 'publish_pitch'
  | 'confirm_sent'
  | 'create_deal'
  | 'execute_response'
  | null;

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );

const safeArray = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

const careerOpen = (value: unknown) =>
  String(value || '').startsWith('open_');

const numeric = (
  value: unknown,
  fallback = '-',
) => {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? String(Math.round(parsed))
    : fallback;
};

function Fact({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className={styles.fact}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function Step({
  label,
  value,
  done,
  attention,
}: {
  label: string;
  value: string;
  done?: boolean;
  attention?: boolean;
}) {
  return (
    <div
      className={`${styles.step} ${
        done
          ? styles.stepDone
          : attention
            ? styles.stepAttention
            : ''
      }`}
    >
      <i>
        {done ? (
          <CheckCircle2 size={12} />
        ) : attention ? (
          <CircleAlert size={12} />
        ) : (
          <span />
        )}
      </i>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export default function AgencyPursuitRoom({
  request,
  role,
  marketData,
  invoke,
  onClose,
  onOpenAction,
  onOpenDeal,
  onApplied,
}: {
  request: AgencyPursuitRequest;
  role: string;
  marketData: any;
  invoke: Invoke;
  onClose: () => void;
  onOpenAction: (
    request: AgencyActionRequest,
  ) => void;
  onOpenDeal: (
    dealRoomId: string,
    title: string,
    context?: string | null,
  ) => void;
  onApplied: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] =
    useState('');
  const [error, setError] = useState('');
  const [message, setMessage] =
    useState('');
  const [dossierControl, setDossierControl] =
    useState<any>(null);
  const [pitchDetail, setPitchDetail] =
    useState<any>(null);
  const [createdDealId, setCreatedDealId] =
    useState('');
  const [confirmAction, setConfirmAction] =
    useState<ConfirmAction>(null);
  const [responseProposal, setResponseProposal] =
    useState<any>(null);

  const [pitchMessage, setPitchMessage] =
    useState('');
  const [dealStage, setDealStage] =
    useState('qualifying');
  const [dealProbability, setDealProbability] =
    useState('');
  const [expectedCommission, setExpectedCommission] =
    useState('');
  const [dealNextAction, setDealNextAction] =
    useState('');

  const readiness = safeArray(
    marketData?.pitch_readiness?.items,
  ).find(
    (item: any) =>
      String(item?.player_match_id || '') ===
      request.playerMatchId,
  );

  const playerId = String(
    readiness?.player?.player_id ||
      request.playerId ||
      '',
  );

  const clubId = String(
    readiness?.club?.organisation_id ||
      request.clubId ||
      '',
  );

  const pursuit = safeArray(
    marketData?.pursuits?.items,
  ).find(
    (item: any) =>
      String(item?.player_match_id || '') ===
      request.playerMatchId,
  );

  const careerGate =
    readiness?.career_gate ||
    pursuit?.career_strategy_gate ||
    {};

  const careerState = String(
    careerGate?.state ||
      request.careerGateState ||
      'unknown',
  );

  const pitch = safeArray(
    marketData?.pitch_execution?.items,
  ).find(
    (item: any) =>
      String(item?.player_id || '') ===
        playerId &&
      (!clubId ||
        String(
          item?.organisation_id || '',
        ) === clubId),
  );

  const shareId = String(
    pitchDetail?.id ||
      pitch?.share_id ||
      '',
  );

  const response = safeArray(
    marketData?.club_responses?.items,
  ).find(
    (item: any) =>
      shareId &&
      String(item?.share_id || '') ===
        shareId,
  );

  const dealRoomId = String(
    createdDealId ||
      pitchDetail?.opportunity_id ||
      pitch?.opportunity_id ||
      response?.deal_room_id ||
      '',
  );

  const dossier = safeArray(
    dossierControl?.items,
  ).find(
    (item: any) =>
      String(item?.player?.player_id || '') ===
      playerId,
  );

  const dossierState = String(
    dossier?.share_state ||
      readiness?.pitch_readiness_state ||
      'not_checked',
  );

  const publishedPitch =
    Boolean(pitchDetail?.active) &&
    !pitchDetail?.revoked_at &&
    (!pitchDetail?.expires_at ||
      new Date(
        pitchDetail.expires_at,
      ).getTime() > Date.now());

  const pitchState = String(
    pitchDetail?.pitch_status === 'draft'
      ? 'draft_private'
      : pitch?.execution_state ||
          readiness?.pitch_readiness_state ||
          'not_prepared',
  );

  const accessLabel =
    request.accessLabel ||
    pursuit?.best_access_route?.person_name ||
    human(
      pursuit?.access_strategy?.recommended_mode ||
        'recorded route',
    );

  const accessDetail =
    request.accessDetail ||
    pursuit?.best_access_route?.why_this_route ||
    null;

  const canPublishDossier = [
    'owner',
    'admin',
  ].includes(role);

  const pitchUrl =
    pitchDetail?.token &&
    typeof window !== 'undefined'
      ? `${window.location.origin}/s/${pitchDetail.token}`
      : '';

  const loadDetails = useCallback(async () => {
    if (!playerId) {
      setBusy(false);
      return;
    }

    setBusy(true);
    setError('');

    try {
      const dossierResponse =
        await invoke(
          'external_dossiers',
          { limit: 250 },
        );

      setDossierControl(
        dossierResponse?.dossiers ||
          dossierResponse?.result ||
          null,
      );

      if (pitch?.share_id) {
        const pitchResponse =
          await invoke('pitch_detail', {
            share_id: pitch.share_id,
          });

        setPitchDetail(
          pitchResponse?.pitch || null,
        );
      } else {
        setPitchDetail(null);
      }
    } catch (loadError) {
      setError(
        friendlyError(loadError),
      );
    } finally {
      setBusy(false);
    }
  }, [
    invoke,
    pitch?.share_id,
    playerId,
  ]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    const previous =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    const keydown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === 'Escape' &&
        !actionBusy
      ) {
        onClose();
      }
    };

    window.addEventListener(
      'keydown',
      keydown,
    );

    return () => {
      document.body.style.overflow =
        previous;
      window.removeEventListener(
        'keydown',
        keydown,
      );
    };
  }, [actionBusy, onClose]);

  const refresh = async () => {
    await onApplied();
    await loadDetails();
  };

  const copyPitch = async () => {
    if (!pitchUrl) return;

    try {
      await navigator.clipboard.writeText(
        pitchUrl,
      );
      setMessage('Pitch link copied.');
    } catch {
      setError(
        'Could not copy the pitch link.',
      );
    }
  };

  const openCareerAction = () => {
    if (!playerId) return;

    onOpenAction({
      key:
        `pursuit-career:${request.playerMatchId}`,
      eyebrow: 'PLAYER-CLUB PURSUIT',
      title:
        `${request.playerName} → ${request.clubName}`,
      instruction:
        careerGate?.reason ||
        request.careerGateReason ||
        'Review the player-owned career strategy before external activity.',
      label: 'Review career control',
      action:
        'career_strategy_action_prepare',
      payload: {
        player_id: playerId,
      },
      context:
        request.needTitle ||
        request.clubName,
      facts: [
        {
          label: 'Player',
          value: request.playerName,
        },
        {
          label: 'Club',
          value: request.clubName,
          detail:
            request.needTitle || null,
        },
        {
          label: 'Career control',
          value: human(careerState),
          detail:
            careerGate?.reason ||
            request.careerGateReason ||
            null,
        },
        {
          label: 'Access route',
          value: accessLabel,
          detail: accessDetail,
        },
      ],
      successCondition:
        'The player-owned career strategy is current before external activity progresses.',
      confirmationLabel:
        'Continue career review',
    });
  };

  const prepareResponse = async () => {
    if (!shareId || actionBusy) return;

    setActionBusy('response-prepare');
    setError('');
    setMessage('');

    try {
      const result = await invoke(
        'pitch_response_action_prepare',
        {
          share_id: shareId,
        },
      );

      setResponseProposal(
        result?.result?.proposal ||
          result?.proposal ||
          null,
      );

      setMessage(
        'Internal response review prepared. Nothing external has been sent.',
      );
    } catch (actionError) {
      setError(
        friendlyError(actionError),
      );
    } finally {
      setActionBusy('');
    }
  };

  const executeConfirmed = async () => {
    if (!confirmAction || actionBusy) {
      return;
    }

    setActionBusy(confirmAction);
    setError('');
    setMessage('');

    try {
      if (
        confirmAction ===
        'create_dossier'
      ) {
        await invoke(
          'dossier_draft_create',
          { player_id: playerId },
        );

        setMessage(
          'Private dossier draft created. Nothing has been published.',
        );
      }

      if (
        confirmAction ===
        'publish_dossier'
      ) {
        if (!canPublishDossier) {
          throw new Error(
            'Owner or admin access is required to publish a dossier.',
          );
        }

        await invoke(
          'dossier_publish',
          { player_id: playerId },
        );

        setMessage(
          'Dossier published for controlled external sharing.',
        );
      }

      if (
        confirmAction ===
        'create_pitch'
      ) {
        await invoke(
          'pitch_draft_create',
          {
            player_match_id:
              request.playerMatchId,
            input: {
              label:
                `${request.playerName} → ${request.clubName}`,
              pitch_message:
                pitchMessage.trim() || null,
              selected_sections: {
                profile: true,
                stats: true,
                career: true,
                videos: true,
                documents: false,
              },
            },
          },
        );

        setMessage(
          'Private pitch draft created. Nothing has been sent.',
        );
      }

      if (
        confirmAction ===
        'publish_pitch'
      ) {
        await invoke(
          'pitch_publish',
          { share_id: shareId },
        );

        setMessage(
          'Pitch link published. ReDream has not sent it to anyone.',
        );
      }

      if (
        confirmAction ===
        'confirm_sent'
      ) {
        await invoke(
          'pitch_confirm_sent',
          { share_id: shareId },
        );

        setMessage(
          'Sent state recorded from your confirmation.',
        );
      }

      if (
        confirmAction ===
        'create_deal'
      ) {
        const probability =
          Number(dealProbability);

        if (
          !Number.isFinite(probability) ||
          probability < 0 ||
          probability > 100
        ) {
          throw new Error(
            'Enter your own deal probability from 0 to 100.',
          );
        }

        const result = await invoke(
          'pursuit_deal_create',
          {
            player_match_id:
              request.playerMatchId,
            input: {
              stage: dealStage,
              probability,
              expected_commission:
                expectedCommission.trim()
                  ? Number(
                      expectedCommission,
                    )
                  : null,
              next_action_text:
                dealNextAction.trim() ||
                null,
              currency: 'EUR',
            },
          },
        );

        setCreatedDealId(
          String(
            result?.result?.deal_room_id ||
              result?.deal_room_id ||
              '',
          ),
        );

        setMessage(
          'Deal Room is now tracking this pursuit.',
        );
      }

      if (
        confirmAction ===
        'execute_response'
      ) {
        const proposalId = String(
          responseProposal?.id ||
            responseProposal?.proposal_id ||
            '',
        );

        if (!proposalId) {
          throw new Error(
            'Response review proposal is missing.',
          );
        }

        await invoke(
          'pitch_response_action_execute',
          { proposal_id: proposalId },
        );

        setResponseProposal(null);

        setMessage(
          'Internal response review work created. No message was sent and no deal stage was changed.',
        );
      }

      setConfirmAction(null);
      await refresh();
    } catch (actionError) {
      setError(
        friendlyError(actionError),
      );
    } finally {
      setActionBusy('');
    }
  };

  const confirmCopy: Record<
    Exclude<ConfirmAction, null>,
    {
      title: string;
      body: string;
      button: string;
    }
  > = {
    create_dossier: {
      title: 'Create a private dossier draft?',
      body:
        'ReDream will create the tenant-branded draft from verified internal player data. It will not be published.',
      button: 'Create private draft',
    },
    publish_dossier: {
      title: 'Publish this player dossier?',
      body:
        'The club-facing profile becomes externally shareable. This does not send it to a club.',
      button: 'Publish dossier',
    },
    create_pitch: {
      title: 'Create a private pitch draft?',
      body:
        'This prepares internal pitch work only. It does not contact the club.',
      button: 'Create pitch draft',
    },
    publish_pitch: {
      title: 'Publish the pitch link?',
      body:
        'Anyone who receives the unguessable link can open it until it expires or is revoked. Publishing is not the same as sending.',
      button: 'Publish link',
    },
    confirm_sent: {
      title: 'Confirm you actually sent this pitch?',
      body:
        'Use this only after you sent the link outside ReDream. ReDream cannot independently verify delivery or recipient identity.',
      button: 'Confirm sent',
    },
    create_deal: {
      title: 'Create a live Deal Room?',
      body:
        'Your probability is a human judgement. ReDream will not convert pursuit readiness into probability or contact the club.',
      button: 'Create Deal Room',
    },
    execute_response: {
      title: 'Create internal response-review work?',
      body:
        'This creates internal work only. It will not message the responder and will not change the deal stage.',
      button: 'Create review work',
    },
  };

  const confirm =
    confirmAction
      ? confirmCopy[confirmAction]
      : null;

  const careerIsOpen =
    careerOpen(careerState);

  const dossierIsSafe =
    dossierState === 'share_safe';

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !actionBusy
        ) {
          onClose();
        }
      }}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={`${request.playerName} to ${request.clubName} Pursuit Room`}
      >
        <header className={styles.header}>
          <div className={styles.topline}>
            <span className={styles.live}>
              <i />
              Live pursuit control
            </span>

            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              disabled={Boolean(
                actionBusy,
              )}
              aria-label="Close Pursuit Room"
            >
              <X size={18} />
            </button>
          </div>

          <p className={styles.eyebrow}>
            PURSUIT ROOM
          </p>
          <h2>
            {request.playerName}
            <span>→</span>
            {request.clubName}
          </h2>
          <p className={styles.subhead}>
            {request.needTitle ||
              'Recorded player-club route'}
          </p>
        </header>

        {busy ? (
          <section className={styles.notice}>
            <LoaderCircle
              size={19}
              className={styles.spin}
            />
            <div>
              <strong>
                Checking the live route
              </strong>
              <span>
                Career control, dossier safety and pitch access are being refreshed.
              </span>
            </div>
          </section>
        ) : null}

        {error ? (
          <section
            className={`${styles.notice} ${styles.error}`}
          >
            <CircleAlert size={18} />
            <div>
              <strong>
                This route needs attention
              </strong>
              <span>{error}</span>
            </div>
          </section>
        ) : null}

        {message ? (
          <section
            className={`${styles.notice} ${styles.success}`}
          >
            <CheckCircle2 size={18} />
            <div>
              <strong>Recorded</strong>
              <span>{message}</span>
            </div>
          </section>
        ) : null}

        {!busy ? (
          <div className={styles.content}>
            <section className={styles.journey}>
              <Step
                label="Career"
                value={
                  careerIsOpen
                    ? 'Open'
                    : 'Needs judgement'
                }
                done={careerIsOpen}
                attention={!careerIsOpen}
              />
              <Step
                label="Dossier"
                value={human(dossierState)}
                done={dossierIsSafe}
                attention={
                  !dossierIsSafe &&
                  dossierState !==
                    'not_checked'
                }
              />
              <Step
                label="Pitch"
                value={human(pitchState)}
                done={Boolean(
                  pitchDetail?.sent_at,
                )}
                attention={
                  Boolean(shareId) &&
                  !pitchDetail?.sent_at
                }
              />
              <Step
                label="Response"
                value={
                  response
                    ? human(
                        response.response_type,
                      )
                    : 'Waiting'
                }
                done={Boolean(response)}
              />
              <Step
                label="Deal"
                value={
                  dealRoomId
                    ? 'Active'
                    : 'Not created'
                }
                done={Boolean(dealRoomId)}
              />
            </section>

            <section className={styles.hero}>
              <div>
                <p>NEXT LEGITIMATE MOVE</p>
                <h3>
                  {!careerIsOpen
                    ? 'Resolve career control'
                    : dossierState ===
                        'dossier_missing'
                      ? 'Create the dossier'
                      : !dossierIsSafe
                        ? 'Review dossier publication'
                        : !shareId
                          ? 'Prepare the pitch'
                          : !publishedPitch
                            ? 'Publish the pitch link'
                            : !pitchDetail?.sent_at
                              ? 'Complete human delivery'
                              : response
                                ? 'Review the response'
                                : 'Protect the follow-up'}
                </h3>
                <span>
                  {!careerIsOpen
                    ? careerGate?.reason ||
                      request.careerGateReason ||
                      'Player-owned career direction must be current first.'
                    : readiness?.next_action
                        ?.instruction ||
                      pitch?.recommended_review
                        ?.instruction ||
                      'Keep the route current from recorded evidence.'}
                </span>
              </div>

              <div className={styles.heroScore}>
                <Target size={17} />
                <strong>
                  {numeric(
                    readiness
                      ?.pursuit_readiness
                      ?.score ||
                      pursuit
                        ?.readiness_score,
                  )}
                </strong>
                <span>
                  pursuit readiness
                </span>
              </div>
            </section>

            <div className={styles.grid}>
              <Fact
                label="Career control"
                value={human(careerState)}
                detail={
                  careerGate?.reason ||
                  request.careerGateReason ||
                  null
                }
              />
              <Fact
                label="Access route"
                value={accessLabel}
                detail={accessDetail}
              />
              <Fact
                label="Club need"
                value={
                  readiness?.need?.title ||
                  request.needTitle ||
                  'Recorded pursuit'
                }
                detail={
                  readiness?.need?.position
                    ? `${readiness.need.position} · ${human(readiness.need.need_type)}`
                    : null
                }
              />
              <Fact
                label="External readiness"
                value={human(
                  readiness
                    ?.pitch_readiness_state ||
                    dossierState,
                )}
                detail="Readiness is an operating control, not transfer probability"
              />
            </div>

            {!careerIsOpen ? (
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <ShieldCheck size={17} />
                  <div>
                    <p>CAREER PERMISSION</p>
                    <h3>
                      Player direction comes first.
                    </h3>
                  </div>
                </div>

                <p className={styles.copy}>
                  This route stays internal until the player-owned career controls are current.
                </p>

                <button
                  type="button"
                  className={styles.primary}
                  onClick={openCareerAction}
                >
                  <ShieldCheck size={15} />
                  Review career control
                </button>
              </section>
            ) : null}

            {careerIsOpen ? (
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <FileText size={17} />
                  <div>
                    <p>CLUB DOSSIER</p>
                    <h3>
                      {dossierState ===
                      'dossier_missing'
                        ? 'Create the private club-facing dossier.'
                        : dossierIsSafe
                          ? 'The dossier passes the recorded share controls.'
                          : 'The dossier needs publication control.'}
                    </h3>
                  </div>
                </div>

                {dossier
                  ?.presentation_advisories
                  ?.length ? (
                  <div className={styles.advisory}>
                    <CircleAlert size={15} />
                    <div>
                      <strong>
                        Presentation advisory
                      </strong>
                      <span>
                        {dossier.presentation_advisories
                          .map(
                            (
                              item: string,
                            ) =>
                              human(item),
                          )
                          .join(' · ')}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className={styles.actions}>
                  {dossierState ===
                  'dossier_missing' ? (
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() =>
                        setConfirmAction(
                          'create_dossier',
                        )
                      }
                    >
                      <FileText size={15} />
                      Create private dossier
                    </button>
                  ) : null}

                  {!dossierIsSafe &&
                  dossierState !==
                    'dossier_missing' &&
                  canPublishDossier ? (
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() =>
                        setConfirmAction(
                          'publish_dossier',
                        )
                      }
                    >
                      <Link2 size={15} />
                      Publish dossier
                    </button>
                  ) : null}
                </div>

                {!canPublishDossier &&
                !dossierIsSafe &&
                dossierState !==
                  'dossier_missing' ? (
                  <p className={styles.truth}>
                    Owner or admin approval is required for external dossier publication.
                  </p>
                ) : null}
              </section>
            ) : null}

            {careerIsOpen &&
            dossierIsSafe ? (
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <Send size={17} />
                  <div>
                    <p>PITCH CONTROL</p>
                    <h3>
                      {!shareId
                        ? 'Prepare a private pitch for this route.'
                        : publishedPitch
                          ? pitchDetail?.sent_at
                            ? 'Human delivery is recorded.'
                            : 'The pitch link is live but not confirmed sent.'
                          : 'A private pitch draft is ready.'}
                    </h3>
                  </div>
                </div>

                {!shareId ? (
                  <>
                    <label className={styles.textarea}>
                      <span>Pitch note</span>
                      <textarea
                        value={pitchMessage}
                        onChange={(event) =>
                          setPitchMessage(
                            event.target.value,
                          )
                        }
                        placeholder="Optional context for this player-club pitch"
                      />
                    </label>

                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() =>
                        setConfirmAction(
                          'create_pitch',
                        )
                      }
                    >
                      <FileText size={15} />
                      Create private pitch
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.grid}>
                      <Fact
                        label="Pitch state"
                        value={human(
                          pitchDetail
                            ?.pitch_status ||
                            pitchState,
                        )}
                        detail={
                          pitchDetail
                            ?.expires_at
                            ? `Expires ${relativeDate(pitchDetail.expires_at)}`
                            : null
                        }
                      />
                      <Fact
                        label="Recorded opens"
                        value={numeric(
                          pitchDetail
                            ?.view_count ??
                            pitch?.view_count,
                          '0',
                        )}
                        detail={
                          pitchDetail
                            ?.last_viewed_at
                            ? `Last viewed ${relativeDate(pitchDetail.last_viewed_at)}`
                            : 'No open recorded'
                        }
                      />
                    </div>

                    {publishedPitch &&
                    pitchUrl ? (
                      <div className={styles.linkBox}>
                        <div>
                          <span>
                            Published pitch link
                          </span>
                          <strong>
                            {pitchUrl}
                          </strong>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            void copyPitch()
                          }
                        >
                          <Clipboard size={14} />
                          Copy
                        </button>
                      </div>
                    ) : null}

                    <div className={styles.actions}>
                      {!publishedPitch ? (
                        <button
                          type="button"
                          className={styles.primary}
                          onClick={() =>
                            setConfirmAction(
                              'publish_pitch',
                            )
                          }
                        >
                          <Link2 size={15} />
                          Publish pitch link
                        </button>
                      ) : null}

                      {publishedPitch &&
                      !pitchDetail?.sent_at ? (
                        <button
                          type="button"
                          className={styles.primary}
                          onClick={() =>
                            setConfirmAction(
                              'confirm_sent',
                            )
                          }
                        >
                          <Send size={15} />
                          I sent this pitch
                        </button>
                      ) : null}
                    </div>

                    <p className={styles.truth}>
                      ReDream never marks a pitch sent because a link was created or published. Sent is recorded only from your explicit confirmation.
                    </p>
                  </>
                )}
              </section>
            ) : null}

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <MessageSquareText size={17} />
                <div>
                  <p>CLUB RESPONSE</p>
                  <h3>
                    {response
                      ? `Explicit response: ${human(response.response_type)}`
                      : 'No explicit response recorded.'}
                  </h3>
                </div>
              </div>

              {response ? (
                <>
                  <div className={styles.grid}>
                    <Fact
                      label="Response"
                      value={human(
                        response.response_type,
                      )}
                      detail={
                        response.message ||
                        response.agency_review
                          ?.instruction ||
                        null
                      }
                    />
                    <Fact
                      label="Responder"
                      value={
                        response.responder
                          ?.name ||
                        'Self-asserted identity'
                      }
                      detail={
                        response.responder
                          ?.email ||
                        'Identity not independently verified'
                      }
                    />
                  </div>

                  {!responseProposal ? (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() =>
                        void prepareResponse()
                      }
                      disabled={Boolean(
                        actionBusy,
                      )}
                    >
                      <ArrowRight size={15} />
                      Prepare internal review
                    </button>
                  ) : (
                    <div className={styles.reviewBox}>
                      <strong>
                        {responseProposal.title ||
                          'Review pitch response'}
                      </strong>
                      <span>
                        {responseProposal.rationale ||
                          'Create internal review work without messaging the responder or changing the deal.'}
                      </span>

                      <button
                        type="button"
                        className={styles.primary}
                        onClick={() =>
                          setConfirmAction(
                            'execute_response',
                          )
                        }
                      >
                        <CheckCircle2 size={15} />
                        Review and confirm
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className={styles.copy}>
                  Page opens remain telemetry only. They are not treated as club interest, intent or decision-maker identity.
                </p>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <BriefcaseBusiness size={17} />
                <div>
                  <p>DEAL CONTROL</p>
                  <h3>
                    {dealRoomId
                      ? 'This pursuit is tracked as a live deal.'
                      : 'Promote the pursuit when commercial deal control is needed.'}
                  </h3>
                </div>
              </div>

              {dealRoomId ? (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() =>
                    onOpenDeal(
                      dealRoomId,
                      `${request.playerName} → ${request.clubName}`,
                      request.needTitle,
                    )
                  }
                >
                  <BriefcaseBusiness size={15} />
                  Open Deal War Room
                </button>
              ) : (
                <>
                  <div className={styles.formGrid}>
                    <label>
                      <span>Human stage</span>
                      <select
                        value={dealStage}
                        onChange={(event) =>
                          setDealStage(
                            event.target.value,
                          )
                        }
                      >
                        <option value="qualifying">
                          Qualifying
                        </option>
                        <option value="contacted">
                          Contacted
                        </option>
                        <option value="interest">
                          Interest
                        </option>
                        <option value="negotiating">
                          Negotiating
                        </option>
                        <option value="offer">
                          Offer
                        </option>
                      </select>
                    </label>

                    <label>
                      <span>
                        Human probability %
                      </span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={dealProbability}
                        onChange={(event) =>
                          setDealProbability(
                            event.target.value,
                          )
                        }
                        placeholder="0-100"
                      />
                    </label>

                    <label>
                      <span>
                        Expected commission
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={expectedCommission}
                        onChange={(event) =>
                          setExpectedCommission(
                            event.target.value,
                          )
                        }
                        placeholder="Optional EUR"
                      />
                    </label>

                    <label>
                      <span>Next action</span>
                      <input
                        value={dealNextAction}
                        onChange={(event) =>
                          setDealNextAction(
                            event.target.value,
                          )
                        }
                        placeholder="Optional recorded next action"
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() =>
                      setConfirmAction(
                        'create_deal',
                      )
                    }
                    disabled={!careerIsOpen}
                  >
                    <BriefcaseBusiness size={15} />
                    Create Deal Room
                  </button>

                  <p className={styles.truth}>
                    Pursuit readiness is not deal probability. Probability must remain your own commercial judgement.
                  </p>
                </>
              )}
            </section>
          </div>
        ) : null}

        {confirm ? (
          <div className={styles.confirmBar}>
            <div>
              <p>CONFIRM CONTROLLED ACTION</p>
              <strong>{confirm.title}</strong>
              <span>{confirm.body}</span>
            </div>

            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() =>
                  setConfirmAction(null)
                }
                disabled={Boolean(
                  actionBusy,
                )}
              >
                Cancel
              </button>

              <button
                type="button"
                className={styles.primary}
                onClick={() =>
                  void executeConfirmed()
                }
                disabled={Boolean(
                  actionBusy,
                )}
              >
                {actionBusy ? (
                  <LoaderCircle
                    size={15}
                    className={styles.spin}
                  />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                {confirm.button}
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
