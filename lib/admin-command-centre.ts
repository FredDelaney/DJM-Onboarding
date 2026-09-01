import { calculateCareerReadiness, type CareerReadiness } from '@/lib/player-career';
import { publishedDossierNeedsCurrentSeason } from '@/lib/data-quality';

export type AdminRow = Record<string, any>;

export type AdminIssueSeverity = 'critical' | 'attention' | 'opportunity' | 'routine';

export type AdminIssue = {
  id: string;
  playerId: string;
  playerName: string;
  severity: AdminIssueSeverity;
  kind:
    | 'message'
    | 'wellbeing'
    | 'support'
    | 'djm_action'
    | 'opportunity'
    | 'verification'
    | 'document'
    | 'contract'
    | 'checkin'
    | 'readiness'
    | 'request';
  title: string;
  detail: string;
  href: string;
  score: number;
  dueAt?: string | null;
  recordId?: string | null;
};

export type AdminPlayerSnapshot = {
  player: AdminRow;
  playerId: string;
  name: string;
  initials: string;
  readiness: CareerReadiness;
  readinessVisible: boolean;
  latestCheckin: AdminRow | null;
  checkedInThisWeek: boolean;
  incomingMessages: AdminRow[];
  outgoingRequests: AdminRow[];
  liveOpportunities: AdminRow[];
  documents: AdminRow[];
  videos: AdminRow[];
  publicProfile: AdminRow | null;
  agreement: AdminRow | null;
  issues: AdminIssue[];
  priorityScore: number;
};

export type AdminPortfolio = {
  snapshots: AdminPlayerSnapshot[];
  issues: AdminIssue[];
  metrics: {
    players: number;
    needsAttention: number;
    readyToMove: number;
    checkedIn: number;
    checkedInRate: number;
    liveOpportunities: number;
    awaitingPlayers: number;
    readinessAverage: number | null;
  };
  pulse: {
    available: number;
    limitedOrUnavailable: number;
    managingOrInjured: number;
    supportRequests: number;
    situationChanges: number;
  };
  readinessBands: {
    ready: number;
    progressing: number;
    exposed: number;
    limitedView: number;
  };
  pipeline: Array<{
    stage: string;
    label: string;
    count: number;
  }>;
  weekStart: string;
  generatedAt: string;
};

const CLOSED_STAGES = new Set(['won', 'lost', 'closed']);

const PIPELINE_STAGES = [
  ['watching', 'Watching'],
  ['targeted', 'Targeted'],
  ['contacted', 'Contacted'],
  ['materials_sent', 'Materials sent'],
  ['interested', 'Interested'],
  ['meeting_trial', 'Meeting / trial'],
  ['offer', 'Offer'],
  ['paused', 'Paused'],
] as const;

const DAY = 86_400_000;

const asTime = (value: unknown) => {
  if (!value) return Number.NaN;
  return new Date(String(value)).getTime();
};

const hasText = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0;

const normaliseDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const adminWeekStart = (now = new Date()) => {
  const date = new Date(now);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return normaliseDate(date);
};

export const adminPlayerName = (player: AdminRow) =>
  [player.first_name, player.last_name].filter(Boolean).join(' ') ||
  player.preferred_name ||
  'Unnamed player';

const playerInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P';

const latestRowsByPlayer = (rows: AdminRow[], field: string) => {
  const latest = new Map<string, AdminRow>();

  rows.forEach((row) => {
    const playerId = String(row.player_id || '');
    if (!playerId) return;
    const current = latest.get(playerId);
    if (!current || asTime(row[field]) > asTime(current[field])) {
      latest.set(playerId, row);
    }
  });

  return latest;
};

const groupByPlayer = (rows: AdminRow[]) => {
  const grouped = new Map<string, AdminRow[]>();

  rows.forEach((row) => {
    const playerId = String(row.player_id || '');
    if (!playerId) return;
    const current = grouped.get(playerId) || [];
    current.push(row);
    grouped.set(playerId, current);
  });

  return grouped;
};

const daysUntil = (value: unknown, now: Date) => {
  const time = asTime(value);
  return Number.isFinite(time)
    ? Math.ceil((time - now.getTime()) / DAY)
    : null;
};

const issueHref = (playerId: string, tab: string) =>
  `/admin/players/${playerId}#${tab}`;

export function buildAdminPortfolio({
  players,
  privateRows,
  requests,
  checkins,
  opportunities,
  agreements,
  documents,
  videos,
  publicProfiles,
  sensitivePlayerIds,
  now = new Date(),
}: {
  players: AdminRow[];
  privateRows: AdminRow[];
  requests: AdminRow[];
  checkins: AdminRow[];
  opportunities: AdminRow[];
  agreements: AdminRow[];
  documents: AdminRow[];
  videos: AdminRow[];
  publicProfiles: AdminRow[];
  sensitivePlayerIds?: Set<string> | null;
  now?: Date;
}): AdminPortfolio {
  const weekStart = adminWeekStart(now);
  const today = normaliseDate(now);
  const latestCheckins = latestRowsByPlayer(checkins, 'submitted_at');
  const privateByPlayer = new Map(
    privateRows.map((row) => [String(row.player_id), row]),
  );
  const profileByPlayer = new Map(
    publicProfiles.map((row) => [String(row.player_id), row]),
  );
  const requestsByPlayer = groupByPlayer(requests);
  const opportunitiesByPlayer = groupByPlayer(opportunities);
  const agreementsByPlayer = groupByPlayer(agreements);
  const documentsByPlayer = groupByPlayer(documents);
  const videosByPlayer = groupByPlayer(videos);

  const snapshots = players.map((player): AdminPlayerSnapshot => {
    const playerId = String(player.id);
    const name = adminPlayerName(player);
    const latestCheckin = latestCheckins.get(playerId) || null;
    const playerRequests = (requestsByPlayer.get(playerId) || []).filter(
      (request) => request.status !== 'completed' && request.status !== 'dismissed',
    );
    const incomingMessages = playerRequests.filter(
      (request) =>
        request.created_by == null &&
        ['message', 'signal'].includes(String(request.request_type)),
    );
    const outgoingRequests = playerRequests.filter(
      (request) =>
        request.created_by != null &&
        !['message', 'signal'].includes(String(request.request_type)),
    );
    const playerOpportunities = opportunitiesByPlayer.get(playerId) || [];
    const liveOpportunities = playerOpportunities.filter(
      (opportunity) => !CLOSED_STAGES.has(String(opportunity.stage)),
    );
    const playerDocuments = documentsByPlayer.get(playerId) || [];
    const playerVideos = videosByPlayer.get(playerId) || [];
    const publicProfile = profileByPlayer.get(playerId) || null;
    const playerAgreements = agreementsByPlayer.get(playerId) || [];
    const agreement =
      playerAgreements.find((row) => String(row.status).toLowerCase() === 'active') ||
      playerAgreements[0] ||
      null;
    const readinessVisible =
      !sensitivePlayerIds || sensitivePlayerIds.has(playerId);
    const readiness = calculateCareerReadiness({
      player,
      privateInfo: privateByPlayer.get(playerId) || null,
      videoCount: playerVideos.length,
      documents: playerDocuments,
      publicProfile,
      latestCheckin,
    });
    const issues: AdminIssue[] = [];

    const addIssue = (
      issue: Omit<AdminIssue, 'id' | 'playerId' | 'playerName'>,
    ) => {
      issues.push({
        ...issue,
        id: `${playerId}-${issue.kind}-${issues.length}`,
        playerId,
        playerName: name,
      });
    };

    if (incomingMessages.length) {
      const message = incomingMessages[0];
      addIssue({
        severity: 'critical',
        kind: 'message',
        title: incomingMessages.length === 1 ? 'Reply to player' : `Reply to ${incomingMessages.length} player messages`,
        detail: String(message.title || message.message || 'A player is waiting for DJM.'),
        href: issueHref(playerId, 'inbox'),
        score: 110 + incomingMessages.length,
        dueAt: message.created_at,
        recordId: String(message.id),
      });
    }

    if (latestCheckin?.week_start === weekStart) {
      const availability = String(latestCheckin.availability_status || '');
      const fitness = String(latestCheckin.fitness_status || '');

      if (availability === 'unavailable' || fitness === 'injured') {
        addIssue({
          severity: 'critical',
          kind: 'wellbeing',
          title: 'Player availability needs a response',
          detail:
            latestCheckin.fitness_notes || latestCheckin.player_notes ||
            'Review the latest check-in and agree the next communication step.',
          href: issueHref(playerId, 'activity'),
          score: 105,
          dueAt: latestCheckin.submitted_at,
        });
      } else if (availability === 'limited' || fitness === 'managing') {
        addIssue({
          severity: 'attention',
          kind: 'wellbeing',
          title: 'Player is managing availability',
          detail:
            latestCheckin.fitness_notes ||
            'Read the check-in before progressing an opportunity.',
          href: issueHref(playerId, 'activity'),
          score: 82,
          dueAt: latestCheckin.submitted_at,
        });
      }

      if (hasText(latestCheckin.support_request)) {
        addIssue({
          severity: 'critical',
          kind: 'support',
          title: 'Player asked DJM for support',
          detail: String(latestCheckin.support_request),
          href: issueHref(playerId, 'activity'),
          score: 108,
          dueAt: latestCheckin.submitted_at,
        });
      }

      if (latestCheckin.club_situation_changed) {
        addIssue({
          severity: 'attention',
          kind: 'support',
          title: 'Club situation changed',
          detail: String(
            latestCheckin.club_situation_notes ||
              'Review the change and update DJM’s next move.',
          ),
          href: issueHref(playerId, 'activity'),
          score: 86,
          dueAt: latestCheckin.submitted_at,
        });
      }
    } else {
      addIssue({
        severity: 'routine',
        kind: 'checkin',
        title: 'Weekly check-in is due',
        detail: 'DJM is operating without a current availability signal.',
        href: issueHref(playerId, 'inbox'),
        score: 44,
      });
    }

    const playerActionDays = daysUntil(player.next_action_due, now);
    if (hasText(player.next_action) && playerActionDays !== null && playerActionDays <= 7) {
      addIssue({
        severity: playerActionDays < 0 ? 'critical' : 'attention',
        kind: 'djm_action',
        title: playerActionDays < 0 ? 'DJM action is overdue' : 'DJM action is due soon',
        detail: String(player.next_action),
        href: issueHref(playerId, 'overview'),
        score: playerActionDays < 0 ? 102 : 78 - playerActionDays,
        dueAt: player.next_action_due,
      });
    }

    liveOpportunities.forEach((opportunity) => {
      const dueDays = daysUntil(opportunity.next_action_due, now);
      const needsAction = !hasText(opportunity.next_action) || (dueDays !== null && dueDays <= 2);
      if (!needsAction) return;

      addIssue({
        severity: dueDays !== null && dueDays < 0 ? 'critical' : 'opportunity',
        kind: 'opportunity',
        title: `${opportunity.club_name || 'Opportunity'} needs a next move`,
        detail: hasText(opportunity.next_action)
          ? String(opportunity.next_action)
          : `Set the next action for the ${String(opportunity.stage || 'live')} stage.`,
        href: issueHref(playerId, 'overview'),
        score: dueDays !== null && dueDays < 0 ? 101 : 90,
        dueAt: opportunity.next_action_due,
      });
    });

    if (
      publishedDossierNeedsCurrentSeason({
        published: publicProfile?.published,
        currentSeasonLabel: player.current_season_label,
        currentSeasonStart: player.current_season_start,
        now,
      })
    ) {
      addIssue({
        severity: 'attention',
        kind: 'verification',
        title: 'Published dossier needs current-season evidence',
        detail: 'Set the active season window and review current sporting evidence before sending the dossier to clubs.',
        href: issueHref(playerId, 'profile'),
        score: 88,
      });
    }

    if (player.verification_status !== 'verified' || player.review_required_at) {
      addIssue({
        severity: 'attention',
        kind: 'verification',
        title: 'Player record needs DJM review',
        detail: String(player.review_reason || 'Verify the football facts before club use.'),
        href: issueHref(playerId, 'profile'),
        score: 84,
        dueAt: player.review_required_at,
      });
    }

    if (readinessVisible) {
      const expiringDocument = playerDocuments
        .filter((document) => document.expires_at)
        .map((document) => ({ document, days: daysUntil(document.expires_at, now) }))
        .filter((item) => item.days !== null && item.days <= 180)
        .sort((a, b) => Number(a.days) - Number(b.days))[0];

      if (expiringDocument) {
        addIssue({
          severity: Number(expiringDocument.days) < 0 ? 'critical' : 'attention',
          kind: 'document',
          title: Number(expiringDocument.days) < 0 ? 'Player document has expired' : 'Player document expires soon',
          detail: `${String(expiringDocument.document.title || expiringDocument.document.document_type || 'Document')} · ${expiringDocument.document.expires_at}`,
          href: issueHref(playerId, 'cv'),
          score: Number(expiringDocument.days) < 0 ? 104 : 76,
          dueAt: expiringDocument.document.expires_at,
        });
      }

      if (readiness.score < 60) {
        const weakest = [...readiness.components].sort((a, b) => a.score - b.score)[0];
        addIssue({
          severity: readiness.score < 35 ? 'critical' : 'attention',
          kind: 'readiness',
          title: 'Opportunity pack is exposed',
          detail: weakest?.detail || 'Close the highest-impact preparation gap.',
          href: issueHref(playerId, weakest?.id === 'availability' ? 'inbox' : 'cv'),
          score: readiness.score < 35 ? 88 : 68,
        });
      }
    }

    const contractDays = daysUntil(player.contract_expiry, now);
    if (contractDays !== null && contractDays <= 180) {
      addIssue({
        severity: contractDays < 0 ? 'critical' : 'attention',
        kind: 'contract',
        title: contractDays < 0 ? 'Contract date has passed' : 'Contract window is approaching',
        detail: `${player.contract_status || 'Contract'} · ${player.contract_expiry}`,
        href: issueHref(playerId, 'profile'),
        score: contractDays < 0 ? 97 : 73,
        dueAt: player.contract_expiry,
      });
    }

    if (outgoingRequests.length) {
      addIssue({
        severity: 'routine',
        kind: 'request',
        title: `${outgoingRequests.length} request${outgoingRequests.length === 1 ? '' : 's'} waiting on player`,
        detail: String(outgoingRequests[0].title || 'Follow up when useful.'),
        href: issueHref(playerId, 'inbox'),
        score: 36 + outgoingRequests.length,
        dueAt: outgoingRequests[0].due_at,
        recordId: String(outgoingRequests[0].id),
      });
    }

    issues.sort((a, b) => b.score - a.score);

    return {
      player,
      playerId,
      name,
      initials: playerInitials(name),
      readiness,
      readinessVisible,
      latestCheckin,
      checkedInThisWeek: latestCheckin?.week_start === weekStart,
      incomingMessages,
      outgoingRequests,
      liveOpportunities,
      documents: playerDocuments,
      videos: playerVideos,
      publicProfile,
      agreement,
      issues,
      priorityScore:
        (issues[0]?.score || 0) +
        (player.agency_priority === 'urgent' ? 18 : player.agency_priority === 'high' ? 9 : 0),
    };
  });

  snapshots.sort((a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name));
  const issues = snapshots.flatMap((snapshot) => snapshot.issues).sort((a, b) => b.score - a.score);
  const visibleReadiness = snapshots.filter((snapshot) => snapshot.readinessVisible);
  const readinessAverage = visibleReadiness.length
    ? Math.round(
        visibleReadiness.reduce((sum, snapshot) => sum + snapshot.readiness.score, 0) /
          visibleReadiness.length,
      )
    : null;
  const currentCheckins = snapshots
    .map((snapshot) => snapshot.latestCheckin)
    .filter((checkin): checkin is AdminRow => checkin?.week_start === weekStart);
  const checkedIn = currentCheckins.length;

  return {
    snapshots,
    issues,
    metrics: {
      players: snapshots.length,
      needsAttention: snapshots.filter((snapshot) =>
        snapshot.issues.some((issue) => issue.severity === 'critical' || issue.severity === 'attention'),
      ).length,
      readyToMove: snapshots.filter(
        (snapshot) =>
          snapshot.readinessVisible &&
          snapshot.readiness.score >= 80 &&
          Boolean(snapshot.publicProfile?.published),
      ).length,
      checkedIn,
      checkedInRate: snapshots.length ? Math.round((checkedIn / snapshots.length) * 100) : 0,
      liveOpportunities: opportunities.filter(
        (opportunity) => !CLOSED_STAGES.has(String(opportunity.stage)),
      ).length,
      awaitingPlayers: snapshots.reduce(
        (sum, snapshot) => sum + snapshot.outgoingRequests.length,
        0,
      ),
      readinessAverage,
    },
    pulse: {
      available: currentCheckins.filter((row) => row.availability_status === 'available').length,
      limitedOrUnavailable: currentCheckins.filter((row) =>
        ['limited', 'unavailable'].includes(String(row.availability_status)),
      ).length,
      managingOrInjured: currentCheckins.filter((row) =>
        ['managing', 'injured'].includes(String(row.fitness_status)),
      ).length,
      supportRequests: currentCheckins.filter((row) => hasText(row.support_request)).length,
      situationChanges: currentCheckins.filter((row) => row.club_situation_changed).length,
    },
    readinessBands: {
      ready: visibleReadiness.filter((snapshot) => snapshot.readiness.score >= 80).length,
      progressing: visibleReadiness.filter(
        (snapshot) => snapshot.readiness.score >= 50 && snapshot.readiness.score < 80,
      ).length,
      exposed: visibleReadiness.filter((snapshot) => snapshot.readiness.score < 50).length,
      limitedView: snapshots.length - visibleReadiness.length,
    },
    pipeline: PIPELINE_STAGES.map(([stage, label]) => ({
      stage,
      label,
      count: opportunities.filter((opportunity) => opportunity.stage === stage).length,
    })),
    weekStart,
    generatedAt: now.toISOString(),
  };
}

export const opportunityStageLabel = (stage: string) =>
  PIPELINE_STAGES.find(([value]) => value === stage)?.[1] ||
  stage.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());

export const ADMIN_OPPORTUNITY_STAGES = PIPELINE_STAGES.map(([value, label]) => ({
  value,
  label,
}));
