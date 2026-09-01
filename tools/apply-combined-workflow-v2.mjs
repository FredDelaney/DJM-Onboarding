import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, before, after, label) {
  const source = readFileSync(path, 'utf8');
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);

  if (first < 0) {
    throw new Error(`${label}: expected source block was not found in ${path}`);
  }
  if (first !== last) {
    throw new Error(`${label}: source block was not unique in ${path}`);
  }

  writeFileSync(path, source.replace(before, after));
  console.log(`patched ${label}`);
}

function replaceAfter(path, marker, before, after, label) {
  const source = readFileSync(path, 'utf8');
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`${label}: marker was not found in ${path}`);
  }

  const targetIndex = source.indexOf(before, markerIndex);
  if (targetIndex < 0) {
    throw new Error(`${label}: expected source block was not found after marker in ${path}`);
  }

  writeFileSync(
    path,
    source.slice(0, targetIndex) +
      after +
      source.slice(targetIndex + before.length),
  );
  console.log(`patched ${label}`);
}

const commandCentre = 'lib/admin-command-centre.ts';

replaceOnce(
  commandCentre,
  `  score: number;
  dueAt?: string | null;
};`,
  `  score: number;
  dueAt?: string | null;
  recordId?: string | null;
};`,
  'AdminIssue record ID',
);

replaceOnce(
  commandCentre,
  `    const incomingMessages = playerRequests.filter((request) =>
      ['message', 'signal'].includes(String(request.request_type)),
    );
    const outgoingRequests = playerRequests.filter(
      (request) => !['message', 'signal'].includes(String(request.request_type)),
    );`,
  `    const incomingMessages = playerRequests.filter(
      (request) =>
        request.created_by == null &&
        ['message', 'signal'].includes(String(request.request_type)),
    );
    const outgoingRequests = playerRequests.filter(
      (request) =>
        request.created_by != null &&
        !['message', 'signal'].includes(String(request.request_type)),
    );`,
  'player request direction',
);

replaceOnce(
  commandCentre,
  `        score: 110 + incomingMessages.length,
        dueAt: message.created_at,
      });`,
  `        score: 110 + incomingMessages.length,
        dueAt: message.created_at,
        recordId: String(message.id),
      });`,
  'incoming player message record ID',
);

replaceOnce(
  commandCentre,
  `        score: 36 + outgoingRequests.length,
        dueAt: outgoingRequests[0].due_at,
      });`,
  `        score: 36 + outgoingRequests.length,
        dueAt: outgoingRequests[0].due_at,
        recordId: String(outgoingRequests[0].id),
      });`,
  'outgoing player request record ID',
);

const home = 'app/(djm-os)/djm/page.tsx';

replaceOnce(
  home,
  `  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');`,
  `  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState('');`,
  'Home action busy state',
);

replaceOnce(
  home,
  `supabase.from('player_requests').select('id,player_id,title,message,request_type,status,due_at,player_reply,created_at,updated_at')`,
  `supabase.from('player_requests').select('id,player_id,title,message,request_type,status,due_at,player_reply,created_by,created_at,updated_at')`,
  'Home player request direction field',
);

replaceOnce(
  home,
  `      kind: issue.kind,
      source: 'player' as const,`,
  `      kind: issue.kind,
      source: 'player' as const,
      record_id: issue.recordId || null,
      can_complete:
        ['message', 'request'].includes(issue.kind) && Boolean(issue.recordId),`,
  'Home player issue completion metadata',
);

replaceOnce(
  home,
  `      kind: item.kind || 'system',
      source: 'system' as const,`,
  `      kind: item.kind || 'system',
      source: 'system' as const,
      record_id: item.id || null,
      can_complete: item.kind === 'task' || item.action === 'complete',`,
  'Home system completion metadata',
);

replaceOnce(
  home,
  `  const liveNeeds = Array.isArray(command?.opportunities) ? command.opportunities : [];`,
  `  const completeQueueItem = async (item: any) => {
    if (!item?.record_id || !item?.can_complete || actionBusy) return;

    setActionBusy(item.id);
    setError('');

    try {
      if (item.source === 'system' && item.kind === 'task') {
        await djmRpc('djm_network_set_task_status', {
          p_task_id: item.record_id,
          p_status: 'completed',
        });
      } else if (
        item.source === 'player' &&
        ['message', 'request'].includes(item.kind)
      ) {
        await djmRpc('djm_complete_player_request', {
          p_request_id: item.record_id,
        });
      }

      await load();
    } catch (completeError) {
      setError(friendlyError(completeError));
    } finally {
      setActionBusy('');
    }
  };

  const liveNeeds = Array.isArray(command?.opportunities) ? command.opportunities : [];`,
  'Home Done handler',
);

replaceOnce(
  home,
  `              {combinedQueue.map((item, index) => (
                <Link className="ux-action-row" href={item.href} key={item.id}>
                  <div className={\`ux-action-rank \${item.score >= 90 ? 'is-urgent' : item.score >= 70 ? 'is-next' : ''}\`}>{index + 1}</div>
                  <div className="ux-action-copy">
                    <strong>{item.title}</strong>
                    <p>{item.subtitle}</p>
                    <small>{item.action_at ? compactDateTime(item.action_at) : item.source === 'player' ? 'Player service' : 'DJM system'}</small>
                  </div>
                  <ArrowRight size={17} />
                </Link>
              ))}`,
  `              {combinedQueue.map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: item.can_complete
                      ? 'minmax(0,1fr) auto'
                      : '1fr',
                    gap: 8,
                    alignItems: 'stretch',
                  }}
                >
                  <Link className="ux-action-row" href={item.href}>
                    <div className={\`ux-action-rank \${item.score >= 90 ? 'is-urgent' : item.score >= 70 ? 'is-next' : ''}\`}>{index + 1}</div>
                    <div className="ux-action-copy">
                      <strong>{item.title}</strong>
                      <p>{item.subtitle}</p>
                      <small>{item.action_at ? compactDateTime(item.action_at) : item.source === 'player' ? 'Player service' : 'DJM system'}</small>
                    </div>
                    <ArrowRight size={17} />
                  </Link>

                  {item.can_complete ? (
                    <button
                      type="button"
                      className="ux-secondary-action"
                      disabled={actionBusy === item.id}
                      onClick={() => void completeQueueItem(item)}
                      style={{ alignSelf: 'center', minWidth: 72 }}
                    >
                      {actionBusy === item.id ? 'Saving...' : 'Done'}
                    </button>
                  ) : null}
                </div>
              ))}`,
  'Home Done controls',
);

const adminPlayer = 'app/admin/players/[id]/page.tsx';

replaceOnce(
  adminPlayer,
  `import {
  fmtDate,
  publicFile,
  supabase
} from '@/lib/supabase';`,
  `import {
  fmtDate,
  publicFile,
  supabase
} from '@/lib/supabase';

import {djmRpc} from '@/lib/djm-os';`,
  'Admin Player DJM RPC import',
);

replaceOnce(
  adminPlayer,
  `  const [reqTitle,setReqTitle]=useState('');
  const [reqMsg,setReqMsg]=useState('');
  const [reqType,setReqType]=useState('action');`,
  `  const [reqTitle,setReqTitle]=useState('');
  const [reqMsg,setReqMsg]=useState('');
  const [reqType,setReqType]=useState('action');
  const [replyingToRequestId,setReplyingToRequestId]=useState('');`,
  'Admin Player reply state',
);

replaceOnce(
  adminPlayer,
  `  const incoming=
    requests.filter(
      r=>
        r.status!=='completed'
        &&
        ['message','signal']
          .includes(r.request_type)
    );`,
  `  const incoming=
    requests.filter(
      r=>
        r.status!=='completed'
        &&r.created_by==null
        &&
        ['message','signal']
          .includes(r.request_type)
    );`,
  'Admin Player incoming direction',
);

replaceOnce(
  adminPlayer,
  ` const sendRequest=async()=>{
  if(!reqTitle.trim()){
    return;
  }

  const {data,error}=
    await supabase
      .from('player_requests')
      .insert({
        player_id:id,
        title:reqTitle.trim(),
        message:
          reqMsg.trim()
          ||null,
        request_type:
          reqType,
        status:'open',
        created_by:
          auth.user.id
      })
      .select('*')
      .single();

  if(error||!data){
    flash(
      'Could not send request'
    );

    return;
  }

  setRequests(
    current=>[
      data,
      ...current
    ]
  );

  setReqTitle('');
  setReqMsg('');
  setReqType('action');

  const push=
    await supabase
      .functions
      .invoke(
        'dispatch-player-push',
        {
          body:{
            reason:'request'
          }
        }
      );

  const pushed=
    Number(
      push.data?.sent
      ||0
    );

  flash(
    push.error
      ?'Request sent · push pending'
      :pushed>0
        ?'Request sent · notification delivered'
        :'Request sent · no push device yet'
  );
};`,
  ` const sendRequest=async()=>{
  if(!reqTitle.trim()){
    return;
  }

  if(replyingToRequestId){
    if(!reqMsg.trim()){
      flash('Write the reply before sending');
      return;
    }

    try{
      await djmRpc('djm_player_send_reply',{
        p_player_id:id,
        p_request_id:replyingToRequestId,
        p_title:reqTitle.trim()||'Reply from DJM',
        p_message:reqMsg.trim()
      });

      const push=
        await supabase
          .functions
          .invoke(
            'dispatch-player-push',
            {
              body:{
                reason:'request'
              }
            }
          );

      setReqTitle('');
      setReqMsg('');
      setReqType('action');
      setReplyingToRequestId('');
      await load();

      flash(
        push.error
          ?'Reply sent · push pending'
          :'Reply sent'
      );
    }catch(replyError:any){
      flash(
        replyError?.message
        ||'Could not send reply'
      );
    }

    return;
  }

  const {data,error}=
    await supabase
      .from('player_requests')
      .insert({
        player_id:id,
        title:reqTitle.trim(),
        message:
          reqMsg.trim()
          ||null,
        request_type:
          reqType,
        status:'open',
        created_by:
          auth.user.id
      })
      .select('*')
      .single();

  if(error||!data){
    flash(
      'Could not send request'
    );

    return;
  }

  setRequests(
    current=>[
      data,
      ...current
    ]
  );

  setReqTitle('');
  setReqMsg('');
  setReqType('action');

  const push=
    await supabase
      .functions
      .invoke(
        'dispatch-player-push',
        {
          body:{
            reason:'request'
          }
        }
      );

  const pushed=
    Number(
      push.data?.sent
      ||0
    );

  flash(
    push.error
      ?'Request sent · push pending'
      :pushed>0
        ?'Request sent · notification delivered'
        :'Request sent · no push device yet'
  );
};`,
  'Admin Player atomic reply send',
);

replaceAfter(
  adminPlayer,
  `PLAYER CONVERSATION`,
  `                        {r.request_type
                          ==='message'
                          ?'Player message · '
                          :r.request_type
                            ==='signal'
                            ?'Check-in alert · '
                            :''
                        }`,
  `                        {r.request_type
                          ==='message'
                          ?r.created_by
                            ?'DJM message · '
                            :'Player message · '
                          :r.request_type
                            ==='signal'
                            ?'Check-in alert · '
                            :''
                        }`,
  'Admin Player message direction label',
);

replaceAfter(
  adminPlayer,
  `PLAYER CONVERSATION`,
  `                    </div>

                    <span className="tiny muted">
                      {fmtDate(
                        r.created_at
                      )}
                    </span>`,
  `                    </div>

                    {r.status!=='completed'
                      &&r.created_by==null
                      &&['message','signal'].includes(r.request_type)
                      ?(
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          onClick={()=>{
                            setReplyingToRequestId(r.id);
                            setReqTitle(\`Re: \${r.title}\`);
                            setReqMsg('');
                            setReqType('message');
                          }}
                        >
                          Reply
                        </button>
                      )
                      :null
                    }

                    <span className="tiny muted">
                      {fmtDate(
                        r.created_at
                      )}
                    </span>`,
  'Admin Player Reply button',
);

replaceAfter(
  adminPlayer,
  `SEND TO PLAYER`,
  `              <div className="stack">
                <input
                  className="input"`,
  `              <div className="stack">
                {replyingToRequestId&&(
                  <div
                    className="small muted"
                    style={{
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'space-between',
                      gap:10
                    }}
                  >
                    <span>
                      Replying to {requests.find(r=>r.id===replyingToRequestId)?.title||'player message'}
                    </span>

                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={()=>{
                        setReplyingToRequestId('');
                        setReqTitle('');
                        setReqMsg('');
                        setReqType('action');
                      }}
                    >
                      Cancel reply
                    </button>
                  </div>
                )}

                <input
                  className="input"`,
  'Admin Player reply context',
);

replaceAfter(
  adminPlayer,
  `SEND TO PLAYER`,
  `                  disabled={
                    !reqTitle.trim()
                  }
                >
                  <Send size={15}/>
                  Send to player`,
  `                  disabled={
                    !reqTitle.trim()
                    ||(replyingToRequestId&&!reqMsg.trim())
                  }
                >
                  <Send size={15}/>
                  {replyingToRequestId
                    ?'Send reply'
                    :'Send to player'
                  }`,
  'Admin Player Send reply control',
);

const opportunities = 'app/(djm-os)/opportunities/page.tsx';

replaceOnce(
  opportunities,
  `  Target,
  UserRound,`,
  `  Target,
  Trash2,
  UserRound,`,
  'Opportunities Trash icon',
);

replaceOnce(
  opportunities,
  `  const [taskBusy, setTaskBusy] = useState(false);`,
  `  const [taskBusy, setTaskBusy] = useState(false);
  const [deletingNeed, setDeletingNeed] = useState(false);`,
  'Opportunities delete busy state',
);

replaceOnce(
  opportunities,
  `  const createOpportunity = async (`,
  `  const deleteNeed = async () => {
    if (!selectedNeed || deletingNeed) return;

    setError('');
    setMessage('');

    try {
      const impact: any = await djmRpc('djm_delete_preview', {
        p_entity_type: 'club_need',
        p_entity_id: selectedNeed.id,
      });

      const position =
        selectedNeed.need_position ||
        selectedNeed.position ||
        selectedNeed.title ||
        'club need';

      const ok = window.confirm(
        \`Delete \${selectedNeed.organisation_name} · \${position}? \` +
          \`This permanently removes this recruitment need and \${Number(
            impact?.matches || 0,
          )} candidate match\${Number(impact?.matches || 0) === 1 ? '' : 'es'}. \` +
          'Existing deals and follow-up tasks are kept but disconnected from this need. ' +
          'The club and its contacts are not deleted.',
      );

      if (!ok) return;

      setDeletingNeed(true);

      await djmRpc('djm_delete_entity', {
        p_entity_type: 'club_need',
        p_entity_id: selectedNeed.id,
        p_confirm: true,
      });

      setSelectedNeed(null);
      setWorkspace(null);
      setEditingNeed(false);
      setShowTaskForm(false);
      setTaskForm(emptyTaskForm);
      setMessage('Club need deleted.');

      await load();
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setDeletingNeed(false);
    }
  };

  const createOpportunity = async (`,
  'Opportunities delete handler',
);

replaceOnce(
  opportunities,
  `              onFindCandidates={() => void openMatches(selectedNeed)}
              showTaskForm={showTaskForm}`,
  `              onFindCandidates={() => void openMatches(selectedNeed)}
              deletingNeed={deletingNeed}
              onDeleteNeed={() => void deleteNeed()}
              showTaskForm={showTaskForm}`,
  'Opportunities delete props invocation',
);

replaceOnce(
  opportunities,
  `  onFindCandidates,
  showTaskForm,`,
  `  onFindCandidates,
  deletingNeed,
  onDeleteNeed,
  showTaskForm,`,
  'Opportunities delete props destructuring',
);

replaceOnce(
  opportunities,
  `  onFindCandidates: () => void;
  showTaskForm: boolean;`,
  `  onFindCandidates: () => void;
  deletingNeed: boolean;
  onDeleteNeed: () => void;
  showTaskForm: boolean;`,
  'Opportunities delete props types',
);

replaceAfter(
  opportunities,
  `className={styles.workspaceActions}`,
  `          <button type="button" className="ux-primary-action" onClick={onFindCandidates}>
            <Search size={15} />
            Find candidates
          </button>`,
  `          <button
            type="button"
            className="ux-secondary-action"
            onClick={onDeleteNeed}
            disabled={deletingNeed}
            style={{ color: '#9d2f2f' }}
          >
            <Trash2 size={15} />
            {deletingNeed ? 'Deleting...' : 'Delete need'}
          </button>

          <button type="button" className="ux-primary-action" onClick={onFindCandidates}>
            <Search size={15} />
            Find candidates
          </button>`,
  'Opportunities Delete need button',
);

const tellDjm = 'components/TellDjmCapture.tsx';

replaceOnce(
  tellDjm,
  `  Square,
  Type,`,
  `  Square,
  Trash2,
  Type,`,
  'Tell DJM Trash icon',
);

replaceOnce(
  tellDjm,
  `  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);`,
  `  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);
  const [deletingCapture, setDeletingCapture] = useState(false);`,
  'Tell DJM delete busy state',
);

replaceOnce(
  tellDjm,
  `  const terminalStatus = receipt?.capture?.status || '';`,
  `  const deleteCapture = async () => {
    const captureId = receipt?.capture?.id;
    if (!captureId || deletingCapture) return;

    const ok = window.confirm(
      'Delete this Tell DJM update? This removes the unresolved capture from DJM. ' +
        'It cannot delete an update that has already applied changes unless those changes are undone first.',
    );

    if (!ok) return;

    setDeletingCapture(true);
    setError('');

    try {
      await djmRpc('djm_tell_delete_capture', {
        p_capture_id: captureId,
      });

      forgetActiveTellDjmCapture(captureId);
      displayCaptureRef.current = null;
      setReceipt(null);
      setStatus('Tell DJM update deleted.');
      onCompleted?.({
        capture: {
          id: captureId,
          status: 'deleted',
        },
      });
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setDeletingCapture(false);
    }
  };

  const terminalStatus = receipt?.capture?.status || '';`,
  'Tell DJM delete handler',
);

replaceOnce(
  tellDjm,
  `  const needsAttention = [
    'needs_input',
    'needs_review',
    'partial',
    'failed',
    'budget_blocked',
  ].includes(terminalStatus);`,
  `  const needsAttention = [
    'needs_input',
    'needs_review',
    'partial',
    'failed',
    'budget_blocked',
  ].includes(terminalStatus);
  const hasAppliedActions = (receipt?.actions || []).some(
    (action) => action.status === 'applied',
  );
  const canDeleteCapture =
    [
      'needs_input',
      'needs_review',
      'partial',
      'failed',
      'budget_blocked',
    ].includes(terminalStatus) && !hasAppliedActions;`,
  'Tell DJM delete eligibility',
);

replaceOnce(
  tellDjm,
  `          ) : null}

          {(receipt.questions || []).filter(`,
  `          ) : null}

          {canDeleteCapture ? (
            <div className={styles.retryRow}>
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => void deleteCapture()}
                disabled={deletingCapture}
              >
                <Trash2 size={12} />
                {deletingCapture ? 'Deleting...' : 'Delete this update'}
              </button>
              <span>Discard this unresolved Tell DJM capture.</span>
            </div>
          ) : null}

          {(receipt.questions || []).filter(`,
  'Tell DJM Delete this update control',
);

console.log('Combined workflow V2 source patches applied successfully.');
