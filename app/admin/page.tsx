'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Copy,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';

import AdminResourceStudio from '@/components/AdminResourceStudio';
import AppExperience from '@/components/AppExperience';
import { useAdmin } from '@/components/AdminShell';
import DjmOsShell from '@/components/DjmOsShell';
import {
  ADMIN_OPPORTUNITY_STAGES,
  adminPlayerName,
  buildAdminPortfolio,
  opportunityStageLabel,
  type AdminIssue,
  type AdminIssueSeverity,
  type AdminPlayerSnapshot,
  type AdminRow,
} from '@/lib/admin-command-centre';
import { compactDate, compactDateTime } from '@/lib/djm-os';
import { supabase } from '@/lib/supabase';

type AdminData = {
  players: AdminRow[];
  privateRows: AdminRow[];
  requests: AdminRow[];
  checkins: AdminRow[];
  opportunities: AdminRow[];
  agreements: AdminRow[];
  documents: AdminRow[];
  videos: AdminRow[];
  publicProfiles: AdminRow[];
  resources: AdminRow[];
  announcements: AdminRow[];
  allowlist: AdminRow[];
  profiles: AdminRow[];
  staffAccess: AdminRow[];
};

const EMPTY_DATA: AdminData = {
  players: [],
  privateRows: [],
  requests: [],
  checkins: [],
  opportunities: [],
  agreements: [],
  documents: [],
  videos: [],
  publicProfiles: [],
  resources: [],
  announcements: [],
  allowlist: [],
  profiles: [],
  staffAccess: [],
};

const ACTIVE_OPPORTUNITY_STAGES = new Set<string>(ADMIN_OPPORTUNITY_STAGES.map((stage) => stage.value));

const SEVERITY_COPY: Record<AdminIssueSeverity, string> = {
  critical: 'DJM must act',
  attention: 'Needs attention',
  opportunity: 'Move opportunity',
  routine: 'Waiting / routine',
};

const TABS = [
  { id: 'today', label: 'Today', icon: LayoutDashboard },
  { id: 'roster', label: 'Roster', icon: UsersRound },
  { id: 'opportunities', label: 'Opportunities', icon: Target },
  { id: 'value', label: 'Player value', icon: Sparkles },
  { id: 'team', label: 'Team access', icon: KeyRound, adminOnly: true },
] as const;

const resultRows = (result: { data?: AdminRow[] | null }) => result.data || [];

export default function AdminCommandCentrePage() {
  const auth = useAdmin();
  const userId = String(auth.user?.id || '');
  const role = String(auth.profile?.role || '');
  const isFullAdmin = role === 'admin';

  const [data, setData] = useState<AdminData>(EMPTY_DATA);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('today');
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [rosterFilter, setRosterFilter] = useState('all');
  const [issueFilter, setIssueFilter] = useState<AdminIssueSeverity | 'all'>('all');

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const [teamEmail, setTeamEmail] = useState('');
  const [teamRole, setTeamRole] = useState('scout');
  const [pendingRemoveEmail, setPendingRemoveEmail] = useState('');
  const [assignmentStaffId, setAssignmentStaffId] = useState('');
  const [assignmentPlayerId, setAssignmentPlayerId] = useState('');
  const [assignmentCanEdit, setAssignmentCanEdit] = useState(false);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      if (!userId || !role) return;
      quiet ? setRefreshing(true) : setBusy(true);
      setError('');

      const baseQueries = [
        supabase
          .from('players')
          .select(
            'id,user_id,first_name,last_name,preferred_name,date_of_birth,nationalities,height_cm,preferred_foot,primary_position,secondary_positions,current_club,current_league,current_country,contract_status,contract_expiry,football_status,transfermarkt_url,wyscout_url,stats_url,instagram_url,profile_photo_path,onboarding_status,verification_status,agency_priority,next_action,next_action_due,verified_at,review_required_at,review_reason,current_season_label,current_season_start,created_at,updated_at',
          )
          .order('updated_at', { ascending: false }),
        supabase
          .from('player_private')
          .select(
            'player_id,residence_country,relocation_preferences,market_preferences,travel_availability,passports_held,work_rights,preferred_move_timing,updated_at',
          ),
        supabase
          .from('player_requests')
          .select(
            'id,player_id,title,message,request_type,status,due_at,player_reply,created_by,completed_at,created_at,updated_at',
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('weekly_checkins')
          .select(
            'id,player_id,week_start,availability_status,club_situation_changed,club_situation_notes,matches_played,minutes_played,goals,assists,fitness_status,fitness_notes,external_contact,travel_availability,support_request,player_notes,submitted_at',
          )
          .order('week_start', { ascending: false }),
        supabase
          .from('player_opportunities')
          .select(
            'id,player_id,club_name,country,contact_name,contact_role,stage,summary,next_action,next_action_due,owner_id,last_contacted_at,outcome_note,created_at,updated_at',
          )
          .order('updated_at', { ascending: false }),
        supabase
          .from('player_agreements')
          .select(
            'id,player_id,agreement_type,status,title,start_date,end_date,territory,visible_to_player,created_at,updated_at',
          )
          .order('end_date', { ascending: true }),
        supabase
          .from('player_documents')
          .select('id,player_id,title,document_type,club_shareable,country,expires_at,created_at'),
        supabase
          .from('player_videos')
          .select('id,player_id,title,url,video_type,featured,sort_order,created_at'),
        supabase
          .from('player_public_profiles')
          .select('player_id,public_slug,published,display_name,headline,published_at,updated_at'),
        supabase
          .from('resources')
          .select(
            'id,title,description,category,resource_type,url,audience,featured,published,sort_order,created_by,created_at,updated_at',
          )
          .order('sort_order'),
        supabase
          .from('announcements')
          .select('id,title,body,target_player_id,published,starts_at,ends_at,created_by,created_at')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('staff_player_access')
          .select('staff_user_id,player_id,can_edit'),
      ] as const;

      const privilegedQueries = isFullAdmin
        ? ([
            supabase
              .from('admin_allowlist')
              .select('email,role,created_at')
              .order('created_at'),
            supabase
              .from('profiles')
              .select('id,email,display_name,role,updated_at')
              .in('role', ['admin', 'scout'])
              .order('display_name'),
          ] as const)
        : null;

      const [baseResults, privilegedResults] = await Promise.all([
        Promise.all(baseQueries),
        privilegedQueries ? Promise.all(privilegedQueries) : Promise.resolve([]),
      ]);

      const failures = [...baseResults, ...privilegedResults]
        .map((result) => result.error?.message)
        .filter(Boolean);

      setData({
        players: resultRows(baseResults[0]),
        privateRows: resultRows(baseResults[1]),
        requests: resultRows(baseResults[2]),
        checkins: resultRows(baseResults[3]),
        opportunities: resultRows(baseResults[4]),
        agreements: resultRows(baseResults[5]),
        documents: resultRows(baseResults[6]),
        videos: resultRows(baseResults[7]),
        publicProfiles: resultRows(baseResults[8]),
        resources: resultRows(baseResults[9]),
        announcements: resultRows(baseResults[10]),
        staffAccess: resultRows(baseResults[11]),
        allowlist: privilegedResults[0] ? resultRows(privilegedResults[0]) : [],
        profiles: privilegedResults[1] ? resultRows(privilegedResults[1]) : [],
      });

      if (failures.length) setError(`Some connected data could not be loaded: ${failures[0]}`);
      setBusy(false);
      setRefreshing(false);
    },
    [isFullAdmin, role, userId],
  );

  useEffect(() => {
    if (!auth.loading && userId) void load();
  }, [auth.loading, load, userId]);

  const editablePlayerIds = useMemo(() => {
    if (isFullAdmin) return new Set(data.players.map((player) => String(player.id)));
    return new Set(
      data.staffAccess
        .filter((access) => access.staff_user_id === userId && access.can_edit)
        .map((access) => String(access.player_id)),
    );
  }, [data.players, data.staffAccess, isFullAdmin, userId]);

  const portfolio = useMemo(
    () =>
      buildAdminPortfolio({
        players: data.players,
        privateRows: data.privateRows,
        requests: data.requests,
        checkins: data.checkins,
        opportunities: data.opportunities,
        agreements: data.agreements,
        documents: data.documents,
        videos: data.videos,
        publicProfiles: data.publicProfiles,
        sensitivePlayerIds: isFullAdmin ? null : editablePlayerIds,
      }),
    [data, editablePlayerIds, isFullAdmin],
  );

  const visibleIssues = useMemo(
    () => portfolio.issues.filter((issue) => issueFilter === 'all' || issue.severity === issueFilter),
    [issueFilter, portfolio.issues],
  );

  const filteredRoster = useMemo(() => {
    const query = search.trim().toLowerCase();
    return portfolio.snapshots.filter((snapshot) => {
      const matchesQuery = `${snapshot.name} ${snapshot.player.current_club || ''} ${snapshot.player.primary_position || ''}`
        .toLowerCase()
        .includes(query);
      if (!matchesQuery) return false;
      if (rosterFilter === 'attention') return snapshot.issues.some((issue) => issue.severity === 'critical' || issue.severity === 'attention');
      if (rosterFilter === 'ready') return snapshot.readinessVisible && snapshot.readiness.score >= 80;
      if (rosterFilter === 'checkin') return !snapshot.checkedInThisWeek;
      if (rosterFilter === 'published') return Boolean(snapshot.publicProfile?.published);
      return true;
    });
  }, [portfolio.snapshots, rosterFilter, search]);

  const activeOpportunities = useMemo(
    () => data.opportunities.filter((opportunity) => ACTIVE_OPPORTUNITY_STAGES.has(String(opportunity.stage))),
    [data.opportunities],
  );

  const playerById = useMemo(
    () => new Map(data.players.map((player) => [String(player.id), player])),
    [data.players],
  );

  const createInvite = async () => {
    if (!isFullAdmin || !inviteEmail.trim()) return;
    setInviteBusy(true);
    const { data: invite, error: inviteError } = await supabase.rpc('create_player_invitation', {
      invite_email: inviteEmail.trim().toLowerCase(),
      player_name: inviteName.trim() || null,
    });
    setInviteBusy(false);
    if (inviteError || !invite?.token) {
      flash(inviteError?.message || 'Could not create invitation');
      return;
    }
    setInviteLink(`${window.location.origin}/join/${invite.token}`);
    flash(invite.existing ? 'Existing invitation reopened' : 'Private invitation ready');
    await load(true);
  };

  const postAnnouncement = async () => {
    if (!isFullAdmin || !announcement.trim()) return;
    setAnnouncementBusy(true);
    const { error: publishError } = await supabase.from('announcements').insert({
      title: 'From DJM',
      body: announcement.trim(),
      published: true,
      created_by: userId,
    });
    if (publishError) {
      setAnnouncementBusy(false);
      flash(publishError.message || 'Could not publish announcement');
      return;
    }
    const push = await supabase.functions.invoke('dispatch-player-push', { body: { reason: 'announcement' } });
    setAnnouncement('');
    setAnnouncementBusy(false);
    flash(push.error ? 'Announcement published · push pending' : 'Announcement published to players');
    await load(true);
  };

  const nudgeCheckin = async (snapshot: AdminPlayerSnapshot) => {
    if (!editablePlayerIds.has(snapshot.playerId)) {
      flash('Your role has read-only access to this player.');
      return;
    }
    const existing = snapshot.outgoingRequests.some((request) => request.request_type === 'checkin');
    if (existing) {
      flash('A check-in request is already open for this player.');
      return;
    }
    const { error: requestError } = await supabase.from('player_requests').insert({
      player_id: snapshot.playerId,
      title: 'Weekly check-in',
      message: 'Please send DJM your current availability and weekly update.',
      request_type: 'checkin',
      status: 'open',
      created_by: userId,
    });
    if (requestError) {
      flash(requestError.message || 'Could not send check-in request');
      return;
    }
    const push = await supabase.functions.invoke('dispatch-player-push', { body: { reason: 'request' } });
    flash(push.error ? 'Request sent · push pending' : 'Check-in request sent');
    await load(true);
  };

  const updateOpportunityStage = async (opportunity: AdminRow, stage: string) => {
    if (!editablePlayerIds.has(String(opportunity.player_id))) {
      flash('Your role has read-only access to this opportunity.');
      return;
    }
    const terminal = ['won', 'lost'].includes(stage);
    const { error: updateError } = await supabase
      .from('player_opportunities')
      .update({ stage, outcome_note: terminal ? opportunity.outcome_note || `Moved to ${stage}` : opportunity.outcome_note })
      .eq('id', opportunity.id);
    if (updateError) {
      flash(updateError.message || 'Could not move opportunity');
      return;
    }
    flash(`Opportunity moved to ${opportunityStageLabel(stage)}`);
    await load(true);
  };

  const addTeamMember = async () => {
    const email = teamEmail.trim().toLowerCase();
    if (!isFullAdmin || !email) return;
    const currentEmail = String(auth.profile?.email || auth.user?.email || '').toLowerCase();
    if (email === currentEmail && teamRole !== 'admin') {
      flash('You cannot downgrade your own administrator access.');
      return;
    }
    const { error: allowlistError } = await supabase
      .from('admin_allowlist')
      .upsert({ email, role: teamRole }, { onConflict: 'email' });
    if (allowlistError) {
      flash(allowlistError.message || 'Could not update team access');
      return;
    }
    const { data: existingProfile, error: profileLookupError } = await supabase
      .from('profiles')
      .select('id,email,role')
      .eq('email', email)
      .maybeSingle();
    if (profileLookupError) {
      flash(`Allowlist updated, but the active account lookup needs review: ${profileLookupError.message}`);
      await load(true);
      return;
    }
    if (existingProfile) {
      const { error: roleError } = await supabase.from('profiles').update({ role: teamRole }).eq('id', existingProfile.id);
      if (roleError) {
        flash(`Allowlist updated, but the active account role needs review: ${roleError.message}`);
        await load(true);
        return;
      }
    }
    setTeamEmail('');
    flash(existingProfile ? 'Team role updated everywhere' : 'Team access is ready when they create an account');
    await load(true);
  };

  const removeTeamMember = async (email: string) => {
    if (!isFullAdmin || email === auth.profile?.email) return;
    const profile = data.profiles.find((item) => String(item.email || '').toLowerCase() === email.toLowerCase());
    if (profile) {
      const { error: assignmentError } = await supabase.from('staff_player_access').delete().eq('staff_user_id', profile.id);
      if (assignmentError) {
        flash(assignmentError.message || 'Could not remove player assignments');
        return;
      }
      const { error: roleError } = await supabase.from('profiles').update({ role: 'player' }).eq('id', profile.id);
      if (roleError) {
        flash(roleError.message || 'Could not revoke active staff role');
        return;
      }
    }
    const { error: removeError } = await supabase.from('admin_allowlist').delete().eq('email', email);
    if (removeError) {
      flash(removeError.message || 'Could not remove allowlist access');
      return;
    }
    setPendingRemoveEmail('');
    flash('Team access and player assignments removed');
    await load(true);
  };

  const saveAssignment = async () => {
    if (!isFullAdmin || !assignmentStaffId || !assignmentPlayerId) return;
    const { error: assignmentError } = await supabase.from('staff_player_access').upsert(
      { staff_user_id: assignmentStaffId, player_id: assignmentPlayerId, can_edit: assignmentCanEdit },
      { onConflict: 'staff_user_id,player_id' },
    );
    if (assignmentError) {
      flash(assignmentError.message || 'Could not save player assignment');
      return;
    }
    flash(assignmentCanEdit ? 'Player assigned with edit access' : 'Player assigned read-only');
    await load(true);
  };

  const removeAssignment = async (staffUserId: string, playerId: string) => {
    const { error: assignmentError } = await supabase
      .from('staff_player_access')
      .delete()
      .eq('staff_user_id', staffUserId)
      .eq('player_id', playerId);
    if (assignmentError) {
      flash(assignmentError.message || 'Could not remove assignment');
      return;
    }
    flash('Player assignment removed');
    await load(true);
  };

  const availableTabs = TABS.filter((item) => !('adminOnly' in item) || !item.adminOnly || isFullAdmin);

  return (
    <DjmOsShell
      eyebrow={isFullAdmin ? 'Signed player operations · full portfolio' : 'Signed player operations · assigned portfolio'}
      title="Player Command Centre"
    >
      {error ? (
        <div className="djm-os-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}

      <div className="admin-command-toolbar">
        <div className="admin-command-tabs" role="tablist" aria-label="Player operations workspaces">
          {availableTabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? 'is-active' : ''}
                key={item.id}
                onClick={() => setTab(item.id)}
              >
                <Icon size={15} />
                {item.label}
                {item.id === 'today' && portfolio.metrics.needsAttention ? <span>{portfolio.metrics.needsAttention}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="admin-command-toolbar-actions">
          <span className="admin-command-scope"><ShieldCheck size={14} />{isFullAdmin ? 'Full admin' : `${data.players.length} assigned`}</span>
          <button type="button" className="admin-command-refresh" onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />Refresh</button>
          {isFullAdmin ? <button type="button" className="admin-command-primary" onClick={() => { setInviteOpen(true); setInviteLink(''); }}><UserPlus size={15} />Invite player</button> : null}
        </div>
      </div>

      {busy ? <div className="admin-command-loading"><div className="loader" /><span>Connecting the player portfolio…</span></div> : null}

      {!busy && tab === 'today' ? (
        <TodayWorkspace portfolio={portfolio} issues={visibleIssues} issueFilter={issueFilter} setIssueFilter={setIssueFilter} canEditPlayer={(playerId) => editablePlayerIds.has(playerId)} onNudge={nudgeCheckin} />
      ) : null}
      {!busy && tab === 'roster' ? <RosterWorkspace snapshots={filteredRoster} search={search} setSearch={setSearch} filter={rosterFilter} setFilter={setRosterFilter} /> : null}
      {!busy && tab === 'opportunities' ? <OpportunityWorkspace opportunities={activeOpportunities} pipeline={portfolio.pipeline} playerById={playerById} canEditPlayer={(playerId) => editablePlayerIds.has(playerId)} onStageChange={updateOpportunityStage} /> : null}
      {!busy && tab === 'value' ? (
        <div className="admin-command-workspace">
          {isFullAdmin ? <AnnouncementStudio value={announcement} setValue={setAnnouncement} busy={announcementBusy} announcements={data.announcements} onPublish={postAnnouncement} /> : null}
          <AdminResourceStudio resources={data.resources} canManage={isFullAdmin} userId={userId} onRefresh={() => load(true)} onFlash={flash} />
        </div>
      ) : null}
      {!busy && tab === 'team' && isFullAdmin ? (
        <TeamWorkspace
          allowlist={data.allowlist}
          profiles={data.profiles}
          staffAccess={data.staffAccess}
          players={data.players}
          currentEmail={String(auth.profile?.email || auth.user?.email || '')}
          teamEmail={teamEmail}
          setTeamEmail={setTeamEmail}
          teamRole={teamRole}
          setTeamRole={setTeamRole}
          pendingRemoveEmail={pendingRemoveEmail}
          setPendingRemoveEmail={setPendingRemoveEmail}
          onAdd={addTeamMember}
          onRemove={removeTeamMember}
          assignmentStaffId={assignmentStaffId}
          setAssignmentStaffId={setAssignmentStaffId}
          assignmentPlayerId={assignmentPlayerId}
          setAssignmentPlayerId={setAssignmentPlayerId}
          assignmentCanEdit={assignmentCanEdit}
          setAssignmentCanEdit={setAssignmentCanEdit}
          onSaveAssignment={saveAssignment}
          onRemoveAssignment={removeAssignment}
          userId={userId}
        />
      ) : null}

      {inviteOpen ? <InvitePlayerModal name={inviteName} setName={setInviteName} email={inviteEmail} setEmail={setInviteEmail} link={inviteLink} busy={inviteBusy} onCreate={createInvite} onClose={() => setInviteOpen(false)} onFlash={flash} /> : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </DjmOsShell>
  );
}

function TodayWorkspace({
  portfolio,
  issues,
  issueFilter,
  setIssueFilter,
  canEditPlayer,
  onNudge,
}: {
  portfolio: ReturnType<typeof buildAdminPortfolio>;
  issues: AdminIssue[];
  issueFilter: AdminIssueSeverity | 'all';
  setIssueFilter: (filter: AdminIssueSeverity | 'all') => void;
  canEditPlayer: (playerId: string) => boolean;
  onNudge: (snapshot: AdminPlayerSnapshot) => Promise<void>;
}) {
  const urgent = portfolio.issues.filter((issue) => issue.severity === 'critical').length;
  const opportunityActions = portfolio.issues.filter((issue) => issue.severity === 'opportunity').length;

  return (
    <div className="admin-command-workspace">
      <section className="admin-brief-hero">
        <div className="admin-brief-copy">
          <span className="admin-command-kicker">TODAY’S OPERATING BRIEF</span>
          <h2>{urgent ? `${urgent} player signal${urgent === 1 ? '' : 's'} need DJM now.` : opportunityActions ? `${opportunityActions} opportunity move${opportunityActions === 1 ? '' : 's'} can create momentum.` : 'The portfolio is under control.'}</h2>
          <p>Ranked from player messages, current check-ins, DJM commitments, opportunity stages, verification and opportunity-pack readiness.</p>
          <div className="admin-brief-actions"><a href="#priority-queue" className="admin-command-primary">Open ranked queue <ArrowRight size={15} /></a><Link href="/market" className="admin-command-secondary">Match club demand <Target size={15} /></Link></div>
        </div>
        <div className="admin-brief-scoreboard">
          <div className={urgent ? 'is-alert' : 'is-good'}><strong>{urgent}</strong><span>act now</span></div>
          <div><strong>{portfolio.metrics.readyToMove}</strong><span>ready to move</span></div>
          <div><strong>{portfolio.metrics.readinessAverage ?? '-'}{portfolio.metrics.readinessAverage !== null ? '%' : ''}</strong><span>portfolio readiness</span></div>
        </div>
      </section>

      <section className="admin-command-metrics" aria-label="Portfolio summary" tabIndex={0}>
        <CommandMetric icon={<UsersRound size={17} />} value={portfolio.metrics.players} label="signed players in scope" detail="RLS-controlled portfolio" />
        <CommandMetric icon={<HeartPulse size={17} />} value={`${portfolio.metrics.checkedInRate}%`} label="checked in this week" detail={`${portfolio.metrics.checkedIn} current signals`} attention={portfolio.metrics.checkedInRate < 80} />
        <CommandMetric icon={<BriefcaseBusiness size={17} />} value={portfolio.metrics.liveOpportunities} label="live opportunities" detail={`${opportunityActions} need movement`} />
        <CommandMetric icon={<Clock3 size={17} />} value={portfolio.metrics.awaitingPlayers} label="waiting on players" detail="open DJM requests" />
        <CommandMetric icon={<CircleGauge size={17} />} value={portfolio.metrics.needsAttention} label="players needing attention" detail="not a talent score" attention={portfolio.metrics.needsAttention > 0} />
      </section>

      <div className="admin-command-grid">
        <section className="admin-command-panel" id="priority-queue">
          <div className="admin-command-panel-head"><div><span className="admin-command-kicker">ONE OPERATING QUEUE</span><h2>Do the next meaningful thing.</h2><p>Signals are ordered by urgency and player impact, not by whoever shouted last.</p></div><span className="admin-command-count">{issues.length}</span></div>
          <div className="admin-issue-filters" role="group" aria-label="Filter action queue">
            {(['all', 'critical', 'attention', 'opportunity', 'routine'] as const).map((filter) => <button type="button" className={issueFilter === filter ? 'is-active' : ''} key={filter} onClick={() => setIssueFilter(filter)}>{filter === 'all' ? 'All' : SEVERITY_COPY[filter]}</button>)}
          </div>
          <div className="admin-issue-list">
            {issues.length ? issues.slice(0, 18).map((issue, index) => {
              const snapshot = portfolio.snapshots.find((item) => item.playerId === issue.playerId);
              return (
                <article className={`admin-issue-row is-${issue.severity}`} key={issue.id}>
                  <div className="admin-issue-rank">{String(index + 1).padStart(2, '0')}</div>
                  <Link href={issue.href} className="admin-issue-main"><div className="admin-issue-meta"><span>{SEVERITY_COPY[issue.severity]}</span><span>{issue.playerName}</span>{issue.dueAt ? <span>{compactDateTime(issue.dueAt)}</span> : null}</div><strong>{issue.title}</strong><p>{issue.detail}</p></Link>
                  {issue.kind === 'checkin' && snapshot && canEditPlayer(issue.playerId) ? <button type="button" className="admin-issue-action" onClick={() => void onNudge(snapshot)}>Nudge</button> : <Link href={issue.href} className="admin-issue-open" aria-label={`Open ${issue.playerName}`}><ChevronRight size={17} /></Link>}
                </article>
              );
            }) : <div className="admin-command-empty"><CheckCircle2 size={26} /><strong>No actions in this lane</strong><span>Change the filter or use the clear space to move an opportunity forward.</span></div>}
          </div>
        </section>

        <aside className="admin-command-side">
          <section className="admin-command-panel admin-pulse-panel">
            <div className="admin-command-panel-head is-compact"><div><span className="admin-command-kicker">PLAYER PULSE</span><h2>What the roster said this week.</h2></div><HeartPulse size={21} /></div>
            <div className="admin-pulse-grid"><PulseItem value={portfolio.pulse.available} label="Available" tone="good" /><PulseItem value={portfolio.pulse.limitedOrUnavailable} label="Limited / out" tone={portfolio.pulse.limitedOrUnavailable ? 'warn' : 'neutral'} /><PulseItem value={portfolio.pulse.managingOrInjured} label="Managing fitness" tone={portfolio.pulse.managingOrInjured ? 'warn' : 'neutral'} /><PulseItem value={portfolio.pulse.supportRequests} label="Asked for support" tone={portfolio.pulse.supportRequests ? 'alert' : 'neutral'} /><PulseItem value={portfolio.pulse.situationChanges} label="Club changes" tone={portfolio.pulse.situationChanges ? 'warn' : 'neutral'} /></div>
            <p className="admin-command-footnote">Signals reflect player submissions. They are operational context, not medical conclusions.</p>
          </section>
          <section className="admin-command-panel admin-readiness-panel">
            <div className="admin-command-panel-head is-compact"><div><span className="admin-command-kicker">OPPORTUNITY COVERAGE</span><h2>Can DJM move at speed?</h2></div><CircleGauge size={21} /></div>
            <ReadinessBand label="Ready" count={portfolio.readinessBands.ready} total={portfolio.metrics.players} tone="ready" /><ReadinessBand label="Progressing" count={portfolio.readinessBands.progressing} total={portfolio.metrics.players} tone="progress" /><ReadinessBand label="Exposed" count={portfolio.readinessBands.exposed} total={portfolio.metrics.players} tone="exposed" />{portfolio.readinessBands.limitedView ? <ReadinessBand label="Scoped view" count={portfolio.readinessBands.limitedView} total={portfolio.metrics.players} tone="limited" /> : null}
            <p className="admin-command-footnote">Preparation and evidence only. Never a talent or performance rating.</p>
          </section>
          <section className="admin-command-panel admin-operating-routes">
            <span className="admin-command-kicker">CONNECTED DJM OS</span>
            <Link href="/market"><Target size={16} /><span><strong>Market</strong><small>Match signed players to live club demand</small></span><ArrowRight size={15} /></Link>
            <Link href="/network"><UsersRound size={16} /><span><strong>Network</strong><small>Work club contacts and follow-ups</small></span><ArrowRight size={15} /></Link>
            <Link href="/recruitment"><UserPlus size={16} /><span><strong>Recruitment</strong><small>Review and enrich potential players</small></span><ArrowRight size={15} /></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function CommandMetric({ icon, value, label, detail, attention = false }: { icon: React.ReactNode; value: string | number; label: string; detail: string; attention?: boolean }) {
  return <article className={`admin-command-metric ${attention ? 'is-attention' : ''}`}><span className="admin-command-metric-icon">{icon}</span><strong>{value}</strong><span>{label}</span><small>{detail}</small></article>;
}

function PulseItem({ value, label, tone }: { value: number; label: string; tone: string }) {
  return <div className={`admin-pulse-item is-${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function ReadinessBand({ label, count, total, tone }: { label: string; count: number; total: number; tone: string }) {
  const width = total ? Math.max(count ? 8 : 0, Math.round((count / total) * 100)) : 0;
  return <div className="admin-readiness-band"><div><span>{label}</span><strong>{count}</strong></div><div className="admin-readiness-track"><span className={`is-${tone}`} style={{ width: `${width}%` }} /></div></div>;
}

function RosterWorkspace({ snapshots, search, setSearch, filter, setFilter }: { snapshots: AdminPlayerSnapshot[]; search: string; setSearch: (value: string) => void; filter: string; setFilter: (value: string) => void }) {
  return (
    <div className="admin-command-workspace">
      <section className="admin-command-panel admin-roster-panel">
        <div className="admin-command-panel-head admin-roster-head"><div><span className="admin-command-kicker">REPRESENTATION ROSTER</span><h2>Every player, with the reason to open them.</h2><p>Readiness, current signal and live opportunity context in one lookup surface.</p></div><div className="admin-roster-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search player, club or position" /></div></div>
        <div className="admin-roster-filters" role="group" aria-label="Filter roster">
          {[['all', 'All'], ['attention', 'Needs attention'], ['ready', 'Ready to move'], ['checkin', 'Check-in due'], ['published', 'Club profile live']].map(([value, label]) => <button type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)} key={value}>{label}</button>)}<span>{snapshots.length} shown</span>
        </div>
        <div className="admin-roster-list">
          {snapshots.map((snapshot) => (
            <Link href={`/admin/players/${snapshot.playerId}`} className="admin-roster-row" key={snapshot.playerId}>
              <div className="admin-roster-avatar">{snapshot.initials}</div>
              <div className="admin-roster-player"><strong>{snapshot.name}</strong><span>{snapshot.player.primary_position || 'Position not set'} · {snapshot.player.current_club || 'No current club'}</span></div>
              <div className="admin-roster-signal"><span className={`admin-status-dot ${snapshot.checkedInThisWeek ? 'is-good' : ''}`} /><div><strong>{snapshot.checkedInThisWeek ? 'Current this week' : 'Check-in due'}</strong><span>{snapshot.latestCheckin ? compactDate(snapshot.latestCheckin.submitted_at) : 'No check-in yet'}</span></div></div>
              <div className="admin-roster-opportunity"><strong>{snapshot.liveOpportunities.length}</strong><span>live {snapshot.liveOpportunities.length === 1 ? 'opportunity' : 'opportunities'}</span></div>
              <div className={`admin-roster-readiness ${snapshot.readinessVisible && snapshot.readiness.score >= 80 ? 'is-ready' : ''}`}><strong>{snapshot.readinessVisible ? `${snapshot.readiness.score}%` : 'Scoped'}</strong><span>{snapshot.readinessVisible ? 'readiness' : 'limited view'}</span></div>
              <div className="admin-roster-next"><strong>{snapshot.issues[0]?.title || 'No urgent action'}</strong><span>{snapshot.player.next_action || snapshot.issues[0]?.detail || 'Portfolio record is current.'}</span></div><ChevronRight size={17} />
            </Link>
          ))}
          {!snapshots.length ? <div className="admin-command-empty"><Search size={24} /><strong>No players match</strong><span>Try another name or remove a filter.</span></div> : null}
        </div>
      </section>
    </div>
  );
}

function OpportunityWorkspace({ opportunities, pipeline, playerById, canEditPlayer, onStageChange }: { opportunities: AdminRow[]; pipeline: ReturnType<typeof buildAdminPortfolio>['pipeline']; playerById: Map<string, AdminRow>; canEditPlayer: (playerId: string) => boolean; onStageChange: (opportunity: AdminRow, stage: string) => Promise<void> }) {
  return (
    <div className="admin-command-workspace">
      <section className="admin-pipeline-hero"><div><span className="admin-command-kicker">SIGNED PLAYER PIPELINE</span><h2>Every live club conversation has a next stage.</h2><p>Move opportunities here; add context, contacts and next actions inside the connected player record.</p></div><Link href="/market" className="admin-command-secondary">Open club demand <ArrowRight size={15} /></Link></section>
      <section className="admin-pipeline-strip" aria-label="Opportunity stages">{pipeline.map((stage, index) => <div className={stage.count ? 'has-items' : ''} key={stage.stage}><span>{String(index + 1).padStart(2, '0')}</span><strong>{stage.count}</strong><small>{stage.label}</small></div>)}</section>
      <section className="admin-command-panel">
        <div className="admin-command-panel-head"><div><span className="admin-command-kicker">LIVE WORK</span><h2>{opportunities.length} active opportunities.</h2><p>An opportunity without a next action is an observation, not a pipeline.</p></div><BriefcaseBusiness size={22} /></div>
        <div className="admin-opportunity-list">
          {opportunities.map((opportunity) => {
            const playerId = String(opportunity.player_id);
            const player = playerById.get(playerId) || {};
            const editable = canEditPlayer(playerId);
            return <article className="admin-opportunity-row" key={opportunity.id}><div className="admin-opportunity-club"><span>{String(opportunity.club_name || 'C').slice(0, 1).toUpperCase()}</span><div><strong>{opportunity.club_name}</strong><small>{opportunity.country || opportunity.contact_name || 'Club context not set'}</small></div></div><Link href={`/admin/players/${playerId}#overview`} className="admin-opportunity-player"><strong>{adminPlayerName(player)}</strong><span>{player.current_club || player.primary_position || 'Signed player'}</span></Link><div className="admin-opportunity-action"><strong>{opportunity.next_action || 'Next action not set'}</strong><span>{opportunity.next_action_due ? `Due ${compactDate(opportunity.next_action_due)}` : opportunity.summary || 'Open the player to set the next move.'}</span></div><label className="admin-opportunity-stage"><span>Stage</span><select value={opportunity.stage} disabled={!editable} onChange={(event) => void onStageChange(opportunity, event.target.value)}>{ADMIN_OPPORTUNITY_STAGES.map((stage) => <option value={stage.value} key={stage.value}>{stage.label}</option>)}<option value="won">Won</option><option value="lost">Lost</option></select></label><Link href={`/admin/players/${playerId}#overview`} className="admin-issue-open" aria-label={`Open ${adminPlayerName(player)}`}><ChevronRight size={17} /></Link></article>;
          })}
          {!opportunities.length ? <div className="admin-command-empty"><Target size={25} /><strong>No live signed-player opportunities</strong><span>Add the opportunity from a player record or connect a live club need in Market.</span></div> : null}
        </div>
      </section>
    </div>
  );
}

function AnnouncementStudio({ value, setValue, busy, announcements, onPublish }: { value: string; setValue: (value: string) => void; busy: boolean; announcements: AdminRow[]; onPublish: () => Promise<void> }) {
  return (
    <section className="admin-command-panel admin-announcement-studio">
      <div className="admin-command-panel-head"><div><span className="admin-command-kicker">PLAYER BROADCAST</span><h2>Tell the roster something worth opening.</h2><p>Announcements appear in the connected player Today screen. Use individual requests when a response is needed.</p></div><Bell size={22} /></div>
      <div className="admin-announcement-grid"><div><label className="admin-command-field"><span>DJM update</span><textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder="A concise, useful update for signed players…" /></label><button type="button" className="admin-command-primary" onClick={() => void onPublish()} disabled={busy || !value.trim()}>{busy ? 'Publishing…' : 'Publish and notify'} <ArrowRight size={15} /></button></div><div className="admin-announcement-history"><span>Recent broadcasts</span>{announcements.slice(0, 4).map((item) => <article key={item.id}><strong>{item.body}</strong><small>{compactDateTime(item.created_at)} · {item.published ? 'live' : 'draft'}</small></article>)}{!announcements.length ? <p>No announcements yet.</p> : null}</div></div>
    </section>
  );
}

function TeamWorkspace({ allowlist, profiles, staffAccess, players, currentEmail, teamEmail, setTeamEmail, teamRole, setTeamRole, pendingRemoveEmail, setPendingRemoveEmail, onAdd, onRemove, assignmentStaffId, setAssignmentStaffId, assignmentPlayerId, setAssignmentPlayerId, assignmentCanEdit, setAssignmentCanEdit, onSaveAssignment, onRemoveAssignment, userId }: { allowlist: AdminRow[]; profiles: AdminRow[]; staffAccess: AdminRow[]; players: AdminRow[]; currentEmail: string; teamEmail: string; setTeamEmail: (value: string) => void; teamRole: string; setTeamRole: (value: string) => void; pendingRemoveEmail: string; setPendingRemoveEmail: (value: string) => void; onAdd: () => Promise<void>; onRemove: (email: string) => Promise<void>; assignmentStaffId: string; setAssignmentStaffId: (value: string) => void; assignmentPlayerId: string; setAssignmentPlayerId: (value: string) => void; assignmentCanEdit: boolean; setAssignmentCanEdit: (value: boolean) => void; onSaveAssignment: () => Promise<void>; onRemoveAssignment: (staffUserId: string, playerId: string) => Promise<void>; userId: string }) {
  const profileByEmail = new Map(profiles.map((profile) => [String(profile.email || '').toLowerCase(), profile]));
  const profileById = new Map(profiles.map((profile) => [String(profile.id), profile]));
  const playerById = new Map(players.map((player) => [String(player.id), player]));
  const scouts = profiles.filter((profile) => profile.role === 'scout');
  return (
    <div className="admin-command-workspace admin-team-grid">
      <section className="admin-command-panel">
        <div className="admin-command-panel-head"><div><span className="admin-command-kicker">ROLE CONTROL</span><h2>Who can enter DJM OS.</h2><p>Changing access updates both the allowlist and an existing account role. Removing access also clears player assignments.</p></div><ShieldCheck size={22} /></div>
        <div className="admin-team-list">{allowlist.map((member) => { const profile = profileByEmail.get(String(member.email).toLowerCase()); const isCurrent = String(member.email).toLowerCase() === currentEmail.toLowerCase(); return <article key={member.email}><div className={`admin-team-avatar is-${member.role}`}>{String(member.email).slice(0, 1).toUpperCase()}</div><div><strong>{profile?.display_name || member.email}</strong><span>{member.email} · {member.role} · {profile ? 'account active' : 'invitation pending'}</span></div>{isCurrent ? <span className="admin-team-you">You</span> : pendingRemoveEmail === member.email ? <div className="admin-team-confirm"><button type="button" onClick={() => setPendingRemoveEmail('')}>Cancel</button><button type="button" onClick={() => void onRemove(member.email)}>Confirm revoke</button></div> : <button type="button" className="admin-team-remove" onClick={() => setPendingRemoveEmail(member.email)}>Revoke</button>}</article>; })}</div>
        <div className="admin-team-add"><label className="admin-command-field"><span>Team email</span><input type="email" value={teamEmail} onChange={(event) => setTeamEmail(event.target.value)} placeholder="name@djmsports.com" /></label><label className="admin-command-field"><span>Role</span><select value={teamRole} onChange={(event) => setTeamRole(event.target.value)}><option value="scout">Scout · assigned players</option><option value="admin">Admin · full portfolio</option></select></label><button type="button" className="admin-command-primary" onClick={() => void onAdd()} disabled={!teamEmail.trim()}><Plus size={15} /> Add or update</button></div>
      </section>
      <section className="admin-command-panel">
        <div className="admin-command-panel-head"><div><span className="admin-command-kicker">PLAYER ASSIGNMENTS</span><h2>Give scouts only the portfolio they need.</h2><p>Read-only supports review. Edit access also unlocks sensitive player context and workflow updates through existing RLS.</p></div><UserCheck size={22} /></div>
        <div className="admin-assignment-builder"><label className="admin-command-field"><span>Scout account</span><select value={assignmentStaffId} onChange={(event) => setAssignmentStaffId(event.target.value)}><option value="">Choose scout</option>{scouts.map((scout) => <option value={scout.id} key={scout.id}>{scout.display_name || scout.email}</option>)}</select></label><label className="admin-command-field"><span>Player</span><select value={assignmentPlayerId} onChange={(event) => setAssignmentPlayerId(event.target.value)}><option value="">Choose player</option>{players.map((player) => <option value={player.id} key={player.id}>{adminPlayerName(player)}</option>)}</select></label><label className="admin-assignment-toggle"><input type="checkbox" checked={assignmentCanEdit} onChange={(event) => setAssignmentCanEdit(event.target.checked)} /><span><strong>Allow editing</strong><small>Includes sensitive career context</small></span></label><button type="button" className="admin-command-primary" disabled={!assignmentStaffId || !assignmentPlayerId} onClick={() => void onSaveAssignment()}>Save assignment</button></div>
        <div className="admin-assignment-list">{staffAccess.map((access) => { const staff = profileById.get(String(access.staff_user_id)); const player = playerById.get(String(access.player_id)); if (!staff || !player) return null; return <article key={`${access.staff_user_id}-${access.player_id}`}><div><strong>{staff.display_name || staff.email}</strong><span>{adminPlayerName(player)} · {access.can_edit ? 'can edit' : 'read only'}</span></div><button type="button" onClick={() => void onRemoveAssignment(access.staff_user_id, access.player_id)} aria-label={`Remove ${adminPlayerName(player)} assignment`}><X size={15} /></button></article>; })}{!staffAccess.length ? <div className="admin-command-empty is-small"><UserCheck size={22} /><strong>No scoped assignments</strong><span>Full admins already see the complete portfolio.</span></div> : null}</div>
      </section>
      <section className="admin-command-panel admin-team-experience"><div><span className="admin-command-kicker">ADMIN APP</span><h2>Keep the command centre one tap away.</h2><p>Install DJM OS on the current device and keep player data out of personal notes and chat threads.</p></div><AppExperience userId={userId} mode="admin" /></section>
    </div>
  );
}

function InvitePlayerModal({ name, setName, email, setEmail, link, busy, onCreate, onClose, onFlash }: { name: string; setName: (value: string) => void; email: string; setEmail: (value: string) => void; link: string; busy: boolean; onCreate: () => Promise<void>; onClose: () => void; onFlash: (message: string) => void }) {
  return (
    <div className="admin-command-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="invite-player-title"><button type="button" className="admin-command-modal-close" onClick={onClose} aria-label="Close invite"><X size={18} /></button><span className="admin-command-kicker">INVITE SIGNED PLAYER</span><h2 id="invite-player-title">Create their private route into DJM.</h2><p>DJM creates the controlled record first. The player receives one private link and completes their own career context.</p>
        {!link ? <div className="admin-invite-fields"><label className="admin-command-field"><span>Player name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" /></label><label className="admin-command-field"><span>Player email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="player@email.com" /></label><button type="button" className="admin-command-primary" onClick={() => void onCreate()} disabled={busy || !email.trim()}>{busy ? 'Creating…' : 'Create private invitation'} <ArrowRight size={15} /></button></div> : <div className="admin-invite-result"><Check size={22} /><strong>Invitation ready</strong><span>{link}</span><button type="button" onClick={() => { void navigator.clipboard.writeText(link); onFlash('Invitation link copied'); }}><Copy size={15} /> Copy private link</button></div>}
      </section>
    </div>
  );
}
