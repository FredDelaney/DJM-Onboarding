'use client';

import { lockPageScroll } from '@/lib/page-scroll-lock';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
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
  UserRound,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import JourneyStatus from '@/components/JourneyStatus';
import PursuitSalaryReview,{type PursuitSalaryState} from './PursuitSalaryReview';
import ConfirmActionDialog from './ConfirmActionDialog';
import {formatCommercialAmount} from '@/lib/club-need-brief';
import { readWithDeadline } from '@/lib/read-with-deadline';
import {INVOICE_CURRENCY_MINOR_UNITS,invoiceCurrencyMinorUnit} from '@/lib/invoice-currencies';

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
  signal?:AbortSignal,
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

const dealCurrencies=Object.keys(INVOICE_CURRENCY_MINOR_UNITS).sort();

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
  rpc,
  onClose,
  onOpenAction,
  onOpenDeal,
  onOpenPlayerProfile,
  onApplied,
  refreshKey = 0,
  presentation = 'drawer',
}: {
  request: AgencyPursuitRequest;
  role: string;
  marketData: any;
  invoke: Invoke;
  rpc?:<T,>(name:string,args?:Record<string,unknown>,signal?:AbortSignal)=>Promise<T>;
  onClose: () => void;
  onOpenAction: (
    request: AgencyActionRequest,
  ) => void;
  onOpenDeal: (
    dealRoomId: string,
    title: string,
    context?: string | null,
  ) => void;
  onOpenPlayerProfile?: (playerId: string) => void;
  onApplied: () => Promise<void> | void;
  refreshKey?: number;
  presentation?: 'drawer' | 'page';
}) {
  const panelRef = useRef<HTMLElement>(null);
  const loadGeneration = useRef(0);
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] =
    useState('');
  const [error, setError] = useState('');
  const [message, setMessage] =
    useState('');
  const [salaryRefresh,setSalaryRefresh]=useState(0);
  const [salaryGate,setSalaryGate]=useState<PursuitSalaryState|null>(null);
  const [salaryDirty,setSalaryDirty]=useState(false),[discardSalary,setDiscardSalary]=useState(false);
  const pendingLeave=useRef<()=>void>(()=>{});
  const requestLeave=useCallback((action:()=>void)=>{if(salaryDirty){pendingLeave.current=action;setDiscardSalary(true);}else action();},[salaryDirty]);
  const closePursuit=useCallback(()=>requestLeave(onClose),[requestLeave,onClose]);
  const openDealWithReview=(...args:Parameters<typeof onOpenDeal>)=>requestLeave(()=>onOpenDeal(...args));
  const [dossierControl, setDossierControl] =
    useState<any>(null);
  const [readinessControl, setReadinessControl] =
    useState<any>(null);
  const [executionControl, setExecutionControl] =
    useState<any>(null);
  const [responseControl, setResponseControl] =
    useState<any>(null);
  const [pitchDetail, setPitchDetail] =
    useState<any>(null);
  const [createdDealId, setCreatedDealId] =
    useState('');
  const [confirmAction, setConfirmAction] =
    useState<ConfirmAction>(null);
  const confirmationOpener=useRef<HTMLElement|null>(null);
  const openConfirmation=(action:Exclude<ConfirmAction,null>)=>{
    confirmationOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    setConfirmAction(action);
  };
  const cancelConfirmation=()=>{
    const opener=confirmationOpener.current;
    setConfirmAction(null);
    requestAnimationFrame(()=>{
      const focused=document.activeElement;
      if(opener?.isConnected&&!opener.closest('[inert],[aria-hidden="true"]')&&!opener.matches(':disabled')&&(!focused||focused===document.body||!focused.isConnected))opener.focus({preventScroll:true});
    });
  };
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
  const [dealCurrency,setDealCurrency]=useState('');
  const [dealNextAction, setDealNextAction] =
    useState('');

  const readiness = safeArray(
    readinessControl?.items ??
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
    (marketData?.market ?? marketData)?.pursuits?.items,
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
    executionControl?.items ??
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
    responseControl?.items ??
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

  const dealOwnerUserId =
    pitch?.deal_owner_user_id || null;

  const dealOwnerName =
    pitch?.deal_owner_name || null;

  const recordedNextActionAt =
    pitch?.next_action_at || null;

  const recordedNextActionText =
    pitch?.next_action_text || null;

  const followUpMissing =
    Boolean(pitchDetail?.sent_at) &&
    Boolean(dealRoomId) &&
    !recordedNextActionAt &&
    !response;

  const followUpNeedsOwner =
    Boolean(pitchDetail?.sent_at) &&
    Boolean(dealRoomId) &&
    !response &&
    !dealOwnerUserId;

  const accessLabel =
    pursuit?.best_access_route?.person_name ||
    (pursuit?.access_strategy?.recommended_mode
      ? human(pursuit.access_strategy.recommended_mode)
      : pursuit ? 'Access not recorded' : request.accessLabel || 'Access not recorded');

  const accessDetail = pursuit
    ? pursuit.best_access_route?.why_this_route || null
    : request.accessDetail || null;

  const canPublishDossier = [
    'owner',
    'admin',
  ].includes(role);

  const assessment = readiness?.pursuit_readiness;
  const readinessScore = assessment ? assessment.score ?? null : pursuit?.readiness_score ?? null;
  const missingAssessments = safeArray(assessment?.missing_factors ?? pursuit?.missing_factors).filter((item:any)=>typeof item==='string');
  const assessmentIncomplete = (assessment?.state ?? pursuit?.readiness_state)==='assessment_incomplete'||missingAssessments.length>0;
  const hasReadinessScore =
    readinessScore !== null &&
    readinessScore !== undefined &&
    String(readinessScore).trim() !== '' &&
    Number.isFinite(Number(readinessScore))&&!assessmentIncomplete;

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

    const generation = ++loadGeneration.current;
    try {
      // Commit one complete snapshot; late or failed reads cannot expose partial controls.
      const snapshot = await readWithDeadline((async () => {
        const [dossiers, readiness, execution, responses] = await Promise.all([
          invoke('external_dossiers', { limit: 250 }),
          invoke('pitch_readiness', { limit: 100 }),
          invoke('pitch_execution', { limit: 500 }),
          invoke('pitch_responses', { limit: 500 }),
        ]);
        const nextExecution = execution?.execution || execution?.result || null;
        const currentPitch = safeArray(nextExecution?.items).find((item: any) =>
          String(item?.player_id || '') === playerId &&
          (!clubId || String(item?.organisation_id || '') === clubId),
        );
        const detail = currentPitch?.share_id
          ? await invoke('pitch_detail', { share_id: currentPitch.share_id })
          : null;
        return {
          dossiers: dossiers?.dossiers || dossiers?.result || null,
          readiness: readiness?.readiness || readiness?.result || null,
          execution: nextExecution,
          responses: responses?.responses || responses?.result || null,
          pitch: detail?.pitch || null,
        };
      })());
      if (generation !== loadGeneration.current) return;
      setDossierControl(snapshot.dossiers);
      setReadinessControl(snapshot.readiness);
      setExecutionControl(snapshot.execution);
      setResponseControl(snapshot.responses);
      setPitchDetail(snapshot.pitch);
    } catch (loadError) {
      if (generation !== loadGeneration.current) return;
      setError(
        friendlyError(loadError),
      );
    } finally {
      if (generation === loadGeneration.current) setBusy(false);
    }
  }, [
    clubId,
    invoke,
    playerId,
  ]);

  useEffect(() => {
    void loadDetails();
    return () => { ++loadGeneration.current; };
  }, [loadDetails,refreshKey]);

  useEffect(() => {
    const releaseScroll = lockPageScroll();


    const keydown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === 'Escape' &&
        !actionBusy &&
        !event.defaultPrevented
      ) {
        // A follow-up dialog owns Escape while it is open above the pursuit.
        const otherModal = [...document.querySelectorAll(
          '[aria-modal="true"][role="dialog"], [aria-modal="true"][role="alertdialog"]',
        )].some((modal) => modal !== panelRef.current);
        if (otherModal) return;
        event.preventDefault();
        closePursuit();
      }
    };

    window.addEventListener(
      'keydown',
      keydown,
    );

    return () => {
      releaseScroll();
      window.removeEventListener(
        'keydown',
        keydown,
      );
    };
  }, [actionBusy, closePursuit]);

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

  const openFollowUpAction = () => {
    if (
      !dealRoomId ||
      (!followUpMissing &&
        !followUpNeedsOwner)
    ) {
      return;
    }

    if (followUpNeedsOwner) {
      onOpenAction({
        key:
          `pitch-owner:${shareId || dealRoomId}`,
        eyebrow: 'PITCH FOLLOW-UP',
        title:
          `${request.playerName} → ${request.clubName}`,
        instruction:
          'Assign one accountable agency user before setting this pitch follow-up.',
        label: 'Assign owner',
        action:
          'deal_control_fix_prepare',
        payload: {
          deal_room_id: dealRoomId,
        },
        context:
          'Sent pitch · no owner',
        facts: [
          {
            label: 'Pitch',
            value: 'Sent',
            detail:
              pitchDetail?.sent_at
                ? `Confirmed ${relativeDate(pitchDetail.sent_at)}`
                : 'Human-confirmed sent',
          },
          {
            label: 'Follow-up owner',
            value: 'Not assigned',
            detail:
              'Every task and reminder must belong to one agency user.',
          },
        ],
        successCondition:
          'One active agency user owns the linked deal before a follow-up is recorded.',
        confirmationLabel:
          'Assign deal owner',
      });

      return;
    }

    onOpenAction({
      key:
        `pitch-follow-up:${shareId || dealRoomId}`,
      eyebrow: 'PITCH FOLLOW-UP',
      title:
        `${request.playerName} → ${request.clubName}`,
      instruction:
        'Choose the next concrete follow-up and when you will do it. ReDream will not invent the action or date.',
      label: 'Set follow-up',
      action: 'deal_step_prepare',
      payload: {
        deal_room_id: dealRoomId,
        step_type: 'set_next_action',
      },
      context:
        dealOwnerName
          ? `Owned by ${dealOwnerName}`
          : 'Owned deal',
      facts: [
        {
          label: 'Owner',
          value:
            dealOwnerName ||
            'Assigned agency user',
          detail:
            'This user owns the follow-up reminder.',
        },
        {
          label: 'Pitch',
          value: 'Sent',
          detail:
            pitchDetail?.sent_at
              ? `Confirmed ${relativeDate(pitchDetail.sent_at)}`
              : 'Human-confirmed sent',
        },
      ],
      successCondition:
        'The linked deal has one concrete future follow-up action and time owned by its assigned agency user.',
      confirmationLabel:
        'Set follow-up',
    });
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
      label: 'Review career plan',
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
    if(['create_pitch','publish_pitch','create_deal'].includes(confirmAction)&&salaryGate?.can_proceed!==true){setError('Review current base-salary feasibility before preparing a new pitch or deal.');setConfirmAction(null);return;}
    if(confirmAction==='publish_dossier'&&(!dossierCanPublish||!canPublishDossier)){setError('Review the current player profile before publishing.');setConfirmAction(null);return;}

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
        const probability = Number(dealProbability);

        if (
          !/^[0-9]{1,3}$/.test(dealProbability.trim()) ||
          probability < 0 ||
          probability > 100
        ) {
          throw new Error(
            'Enter your own whole-number deal probability from 0 to 100.',
          );
        }

        const currency=dealCurrency.trim().toUpperCase(),digits=invoiceCurrencyMinorUnit(currency),commission=expectedCommission.trim();
        if(digits===null)throw new Error('Choose a valid currency for this deal.');
        if(commission&&(!/^[0-9]{1,12}([.][0-9]{1,4})?$/.test(commission)||(commission.split('.')[1]?.length||0)>digits))throw new Error('Check the expected agency commission and currency precision.');

        const result = await invoke(
          'pursuit_deal_create',
          {
            player_match_id:
              request.playerMatchId,
            input: {
              stage: dealStage,
              probability,
              expected_commission:commission||null,
              next_action_text:
                dealNextAction.trim() ||
                null,
              currency,
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
      if(actionError&&typeof actionError==='object'&&'code' in actionError&&actionError.code==='salary_review_required')setSalaryRefresh(value=>value+1);
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
        `${expectedCommission.trim()?`Expected agency commission: ${formatCommercialAmount(expectedCommission.trim(),dealCurrency)}.`:'Agency commission is not recorded.'} Your probability is a human judgement. ReDream will not convert opportunity readiness into probability or contact the club.`,
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
    dossierState === 'share_safe'&&dossier?.safety?.profile_exists!==false;
  const dossierLabel=dossierState==='share_safe'&&!dossierIsSafe?'Review required':human(dossierState);
  const dossierNeedsVerification=dossierState==='player_verification_required';
  const dossierCanPublish=['dossier_unpublished','dossier_verification_stale'].includes(dossierState)&&dossier?.safety?.profile_exists!==false;

  const nextMove = (() => {
    const openDeal = () => {
      if (!dealRoomId) return;
      openDealWithReview(
        dealRoomId,
        `${request.playerName} → ${request.clubName}`,
        request.needTitle,
      );
    };

    const openDealControl = () => {
      document
        .getElementById('pursuit-deal-control')
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
    };

    if (!careerIsOpen) {
      return {
        title: 'Confirm player direction',
        instruction:
          careerGate?.reason ||
          request.careerGateReason ||
          'Confirm what the player wants next before progressing the club route.',
        label: 'Review career plan',
        run: openCareerAction,
        disabled: false,
      };
    }

    if(dossierNeedsVerification||!dossierIsSafe&&dossierState!=='dossier_missing'&&!dossierCanPublish){
      return {title:dossierNeedsVerification?'Review player verification':'Review the player profile',instruction:dossier?.next_action?.instruction||'Review the current player details before external sharing.',label:onOpenPlayerProfile?'Review player details':'Player profile unavailable',run:()=>requestLeave(()=>onOpenPlayerProfile?.(request.playerId||playerId)),disabled:!onOpenPlayerProfile};
    }

    if (dossierState === 'dossier_missing') {
      return {
        title: 'Create the dossier',
        instruction: 'Prepare the private club-facing player dossier before building the pitch.',
        label: 'Create private dossier',
        run: () => openConfirmation('create_dossier'),
        disabled: false,
      };
    }

    if (!dossierIsSafe) {
      return canPublishDossier
        ? {
            title: 'Review dossier publication',
            instruction: dossier?.next_action?.instruction || 'Review the private dossier before approving publication.',
            label: 'Publish dossier',
            run: () => openConfirmation('publish_dossier'),
            disabled: false,
          }
        : {
            title: 'Dossier approval required',
            instruction: 'An owner or admin must approve external dossier publication before this route can progress.',
            label: 'Owner or admin required',
            run: () => {},
            disabled: true,
          };
    }

    if (salaryGate?.can_proceed!==true&&!dealRoomId&&!pitchDetail?.sent_at) {
      return {title:'Review base-salary feasibility',instruction:salaryGate?.message||'Load the current salary check before preparing a new pitch or deal.',label:'Review salary terms',run:()=>{const panel=document.getElementById('pursuit-salary-review');panel?.scrollIntoView({block:'start',behavior:'smooth'});panel?.focus({preventScroll:true});},disabled:!canPublishDossier};
    }
    if (!shareId) {
      return {
        title: 'Prepare the pitch',
        instruction: 'Create the private pitch draft for this exact player-club route.',
        label: 'Create private pitch',
        run: () => openConfirmation('create_pitch'),
        disabled: false,
      };
    }

    if (!publishedPitch) {
      return {
        title: 'Publish the pitch link',
        instruction: 'Make the private pitch link available. ReDream will not send it for you.',
        label: 'Publish pitch link',
        run: () => openConfirmation('publish_pitch'),
        disabled: false,
      };
    }

    if (!pitchDetail?.sent_at) {
      return {
        title: 'Complete human delivery',
        instruction: 'Send the pitch through your chosen channel, then confirm the delivery here.',
        label: 'I sent this pitch',
        run: () => openConfirmation('confirm_sent'),
        disabled: false,
      };
    }

    if (response) {
      return responseProposal
        ? {
            title: 'Review the club response',
            instruction: 'Confirm the internal response-review work before ReDream creates it.',
            label: 'Review and confirm',
            run: () => openConfirmation('execute_response'),
            disabled: false,
          }
        : {
            title: 'Review the club response',
            instruction:
              response.agency_review?.instruction ||
              'Prepare the next internal review from the explicit club response.',
            label: 'Prepare response review',
            run: () => void prepareResponse(),
            disabled: false,
          };
    }

    if (followUpNeedsOwner) {
      return {
        title: 'Assign follow-up owner',
        instruction: 'Give one agency user clear ownership before a reminder is created.',
        label: 'Assign owner',
        run: openFollowUpAction,
        disabled: false,
      };
    }

    if (followUpMissing) {
      return {
        title: 'Set the follow-up',
        instruction: `Record the next concrete action for ${dealOwnerName || 'the deal owner'} and when it will happen.`,
        label: 'Set follow-up',
        run: openFollowUpAction,
        disabled: false,
      };
    }

    if (!dealRoomId) {
      return {
        title: 'Protect the follow-up',
        instruction: 'Create deal control when this pursuit needs accountable ownership and a scheduled next action.',
        label: 'Set up deal control',
        run: openDealControl,
        disabled: false,
      };
    }

    return {
      title: recordedNextActionAt ? 'Follow-up is controlled' : 'Open deal control',
      instruction: recordedNextActionText || 'The pursuit is owned. Keep the next action current in the Deal War Room.',
      label: 'Open Deal War Room',
      run: openDeal,
      disabled: false,
    };
  })();

  const pageMode = presentation === 'page';

  return (
    <div
      className={pageMode ? styles.pageShell : styles.backdrop}
      onClick={pageMode ? undefined : (event) => {
        if (event.target === event.currentTarget && !actionBusy) closePursuit();
      }}
    >
      <aside
        ref={panelRef}
        className={`${styles.drawer} ${pageMode ? styles.pagePanel : ''}`}
        role={pageMode ? 'region' : 'dialog'}
        aria-modal={pageMode ? undefined : true}
        aria-label={`${request.playerName} to ${request.clubName} Pursuit Room`}
      >
        <header className={styles.header}>
          <div className={styles.topline}>
            <span className={styles.live}>
              <i />
              Live route
            </span>

            <button
              type="button"
              data-ui-button="icon"
              className={styles.close}
              onClick={closePursuit}
              disabled={Boolean(
                actionBusy,
              )}
              aria-label={pageMode ? 'Back to Opportunities' : 'Close Pursuit Room'}
            >
              {pageMode ? <ArrowLeft size={18} /> : <X size={18} />}
            </button>
          </div>

          <p className={styles.eyebrow}>
            PURSUIT ROOM
          </p>
          <h2>
            <span className={styles.routePlayer}>{request.playerName}</span>
            <ArrowRight className={styles.routeArrow} size={22} />
            <span className={styles.routeClub}>{request.clubName}</span>
          </h2>
          <p className={styles.subhead}>
            {request.needTitle ||
              'Player-club route'}
          </p>
        </header>

        {busy ? (
          <JourneyStatus kind="loading" title="Opening this opportunity" description="Checking the player dossier, pitch and latest club response."/>
        ) : null}

        {error ? (
          <JourneyStatus kind="error" title="Could not load this opportunity" description={error} onRetry={() => void loadDetails()}/>
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

          <div className={styles.content} hidden={busy||Boolean(error)}>
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
                value={dossierLabel}
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

            <section className={styles.hero} aria-label="Next pursuit action">
              <div>
                <p>NEXT MOVE</p>
                <h3>{nextMove.title}</h3>
                <span>{nextMove.instruction}</span>
                {assessmentIncomplete?<span>{missingAssessments.length?'Readiness not scored. Not recorded: '+missingAssessments.map(human).join(', ')+'.':'Readiness needs more information.'}</span>:null}

                <button
                  type="button"
                  data-ui-button="primary" data-ui-tone="inverse"
                  className={styles.heroAction}
                  onClick={nextMove.run}
                  disabled={nextMove.disabled || Boolean(actionBusy)}
                >
                  <ArrowRight size={15} />
                  {nextMove.label}
                </button>
              </div>

              {hasReadinessScore&&salaryGate?.can_proceed===true&&salaryGate.state==='open_recorded_salary' ? (
                <div className={styles.heroScore}>
                  <Target size={17} />
                  <strong>{numeric(readinessScore)}</strong>
                  <span>opportunity readiness</span>
                </div>
              ) : null}
            </section>

            {canPublishDossier?<PursuitSalaryReview matchId={request.playerMatchId} playerId={request.playerId} clubId={request.clubId} refreshKey={salaryRefresh} invoke={invoke} rpc={rpc} onState={setSalaryGate} onDirty={setSalaryDirty} onChanged={onApplied}/>:null}
            <details className={styles.context}>
              <summary>Opportunity details</summary>
              <div className={styles.grid}>
              <Fact
                label="Player direction"
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
                label="Pitch readiness"
                value={readiness?.pitch_readiness_state?human(readiness.pitch_readiness_state):dossierLabel}
                detail="Recorded preparation state"
              />
              </div>
            </details>

            {careerIsOpen && dossierState !== 'dossier_missing' ? (
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <FileText size={17} />
                  <div>
                    <p>CLUB DOSSIER</p>
                    <h3>
                      {dossierNeedsVerification?'Review the player data first.':dossierIsSafe?'The dossier passes the recorded share controls.':dossierCanPublish?'Review the dossier before publication.':'Review the current player profile.'}
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

                {!canPublishDossier &&
                dossierCanPublish ? (
                  <p className={styles.truth}>
                    Owner or admin approval is required for external dossier publication.
                  </p>
                ) : null}
              </section>
            ) : null}

            {careerIsOpen &&
            dossierIsSafe &&
            Boolean(shareId) ? (
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
                      data-ui-button="primary"
              className={styles.primary}
                      onClick={() =>
                        openConfirmation(
                          'create_pitch',
                        )
                      }
                      disabled={salaryGate?.can_proceed!==true}
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

                        <button data-ui-button="tertiary"
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
                          data-ui-button="primary"
              className={styles.primary}
                          onClick={() =>
                            openConfirmation(
                              'publish_pitch',
                            )
                          }
                          disabled={salaryGate?.can_proceed!==true}
                        >
                          <Link2 size={15} />
                          Publish pitch link
                        </button>
                      ) : null}

                      {publishedPitch &&
                      !pitchDetail?.sent_at ? (
                        <button
                          type="button"
                          data-ui-button="primary"
              className={styles.primary}
                          onClick={() =>
                            openConfirmation(
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
                      ReDream never marks a pitch sent because a link was created or published. Sent is recorded only from your explicit confirmation. Follow-up dates are recorded by a person, never invented automatically.
                    </p>
                  </>
                )}
              </section>
            ) : null}

            {pitchDetail?.sent_at &&
            !response ? (
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <CalendarClock size={17} />
                  <div>
                    <p>FOLLOW-UP CONTROL</p>
                    <h3>
                      {!dealRoomId
                        ? 'Create deal control before setting a reminder.'
                        : followUpNeedsOwner
                          ? 'Assign one owner before setting the follow-up.'
                          : followUpMissing
                            ? `Set the next follow-up for ${dealOwnerName || 'the deal owner'}.`
                            : 'The follow-up is owned and scheduled.'}
                    </h3>
                  </div>
                </div>

                {dealRoomId ? (
                  <>
                    <div className={styles.grid}>
                      <Fact
                        label="Owner"
                        value={
                          dealOwnerName ||
                          (dealOwnerUserId
                            ? 'Assigned agency user'
                            : 'Not assigned')
                        }
                        detail={
                          dealOwnerUserId
                            ? 'This user owns the reminder.'
                            : 'Tasks and reminders must belong to one agency user.'
                        }
                      />
                      <Fact
                        label="Next follow-up"
                        value={
                          recordedNextActionAt
                            ? relativeDate(
                                recordedNextActionAt,
                              )
                            : 'Not scheduled'
                        }
                        detail={
                          recordedNextActionText ||
                          'No follow-up action is recorded.'
                        }
                      />
                    </div>

                    {followUpNeedsOwner ||
                    followUpMissing ? (
                      <button
                        type="button"
                        data-ui-button="primary"
              className={styles.primary}
                        onClick={
                          openFollowUpAction
                        }
                      >
                        {followUpNeedsOwner ? (
                          <UserRound size={15} />
                        ) : (
                          <CalendarClock
                            size={15}
                          />
                        )}
                        {followUpNeedsOwner
                          ? 'Assign owner first'
                          : 'Set follow-up'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-ui-button="secondary"
              className={styles.secondary}
                        onClick={() =>
                          openDealWithReview(
                            dealRoomId,
                            `${request.playerName} → ${request.clubName}`,
                            request.needTitle,
                          )
                        }
                      >
                        <BriefcaseBusiness
                          size={15}
                        />
                        Open Deal War Room
                      </button>
                    )}
                  </>
                ) : (
                  <p className={styles.copy}>
                    A pitch can be sent before a Deal Room exists, but ReDream will not create an unowned reminder. Create the deal below when the pursuit needs accountable follow-up.
                  </p>
                )}

                <p className={styles.truth}>
                  ReDream never invents a follow-up date. Every task and reminder belongs to one accountable agency user.
                </p>
              </section>
            ) : null}

            {response || Boolean(pitchDetail?.sent_at) ? (
            <section className={`${styles.panel} ${styles.responsePanel}`}>
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
                      data-ui-button="secondary"
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
                        data-ui-button="primary"
              className={styles.primary}
                        onClick={() =>
                          openConfirmation(
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
            ) : null}

            {dealRoomId || Boolean(pitchDetail?.sent_at) ? (
            <section id="pursuit-deal-control" className={`${styles.panel} ${styles.dealPanel}`}>
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
                  data-ui-button="primary"
              className={styles.primary}
                  onClick={() =>
                    openDealWithReview(
                      dealRoomId,
                      `${request.playerName} → ${request.clubName}`,
                      request.needTitle,
                    )
                  }
                >
                  <BriefcaseBusiness size={15} />
                  Open Deal War Room
                </button>
              ) : !careerIsOpen||salaryGate?.can_proceed!==true ? (
                <div className={styles.dealLocked}>
                  <ShieldCheck size={16} />
                  <div>
                    <strong>Commercial controls stay locked for now.</strong>
                    <span>{!careerIsOpen?"Confirm the player's direction before creating a live deal.":'Review base-salary feasibility before creating a new deal.'}</span>
                  </div>
                </div>
              ) : (
                <>
                  <form id="pursuit-deal-form" className={`${styles.formGrid} ${styles.dealForm}`} onSubmit={event=>{event.preventDefault();openConfirmation('create_deal');}}>
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
                        required
                        step="1"
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
                        type="text"
                        inputMode="decimal"
                        maxLength={17}
                        pattern={(invoiceCurrencyMinorUnit(dealCurrency)??4)===0?'[0-9]{1,12}':`[0-9]{1,12}([.][0-9]{1,${invoiceCurrencyMinorUnit(dealCurrency)??4}})?`}
                        title={dealCurrency?`Use up to ${invoiceCurrencyMinorUnit(dealCurrency)??4} decimal places for ${dealCurrency}.`:'Choose the deal currency before recording an amount.'}
                        value={expectedCommission}
                        onChange={(event) =>
                          setExpectedCommission(
                            event.target.value,
                          )
                        }
                        placeholder="Optional amount"
                      />
                    </label>

                    <label><span>Deal currency</span><select required value={dealCurrency} onChange={event=>setDealCurrency(event.target.value)}><option value="">Choose currency</option>{dealCurrencies.map(code=><option key={code} value={code}>{code}</option>)}</select></label>

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
                  </form>

                  <button
                    type="submit"
                    form="pursuit-deal-form"
                    data-ui-button="secondary"
              className={`${styles.secondary} ${styles.createDeal}`}
                    disabled={!careerIsOpen||salaryGate?.can_proceed!==true}
                  >
                    <BriefcaseBusiness size={15} />
                    Create Deal Room
                  </button>

                  <p className={styles.truth}>
                    Commission is agency revenue; leave it blank until known. Opportunity readiness is not deal probability. Probability must remain your own commercial judgement.
                  </p>
                </>
              )}
            </section>
            ) : null}
          </div>

        {confirm && !busy && !error ? (
          <div className={styles.confirmBar}>
            <div>
              <p>CONFIRM CONTROLLED ACTION</p>
              <strong>{confirm.title}</strong>
              <span>{confirm.body}</span>
            </div>

            <div className={styles.confirmActions}>
              <button
                type="button"
                data-ui-button="secondary"
              className={styles.secondary}
                onClick={cancelConfirmation}
                disabled={Boolean(
                  actionBusy,
                )}
              >
                Cancel
              </button>

              <button
                type="button"
                data-ui-button="primary"
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
      <ConfirmActionDialog open={discardSalary} title="Leave this salary review?" description="Your unsaved review will be discarded. A submitted review may still complete; check this opportunity when you return." confirmLabel="Leave review" onConfirm={()=>pendingLeave.current()} onClose={()=>setDiscardSalary(false)}/>
    </div>
  );
}
