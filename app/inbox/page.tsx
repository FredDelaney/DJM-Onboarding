'use client';

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  MessageCircle,
  Send,
} from 'lucide-react';

import {
  PlayerShell,
  usePlayerContext,
  LoadingScreen,
} from '@/components/PlayerShell';
import {
  fmtDate,
  supabase,
} from '@/lib/supabase';

import JourneyStatus from '@/components/JourneyStatus';
import {usePlayerPageRead} from '@/lib/use-player-page-read';
import {writeWithDeadline} from '@/lib/write-with-deadline';

const REQUEST_FIELDS='id,player_id,title,message,request_type,status,due_at,player_reply,created_by,created_at,completed_at';
type NoteDraft={id:string;player_id:string;title:string;message:null;request_type:'message';status:'open';player_reply:string;created_by:null};
const readInbox=async(playerId:string)=>{
  const {data,error}=await supabase.from('player_requests').select(REQUEST_FIELDS)
    .eq('player_id',playerId).neq('request_type','signal').order('created_at',{ascending:false});
  if(error)throw error;
  return data||[];
};

function InboxContent() {
  const ctx = usePlayerContext();
  const search = useSearchParams();

  const pageRead=usePlayerPageRead(ctx.player?.id,readInbox);
  const requests=pageRead.data||[];
  const [expanded, setExpanded] =
    useState<string | null>(null);
  const [replies,setReplies]=useState<Record<string,string>>({});
  const [compose, setCompose] =
    useState(
      search.get('compose') === '1',
    );
  const [note, setNote] =
    useState('');
  const [busy, setBusy] =
    useState(false);
  const [toast, setToast] =
    useState('');

  const scope = useRef({playerId:ctx.player?.id,userId:ctx.user?.id});
  if(scope.current.playerId!==ctx.player?.id||scope.current.userId!==ctx.user?.id){
    scope.current={playerId:ctx.player?.id,userId:ctx.user?.id};
  }
  const mounted=useRef(false);
  const activeWrite=useRef(false);
  const pendingNotes=useRef(new Map<string,NoteDraft>());
  const [writeError,setWriteError]=useState('');
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    pendingNotes.current.clear();activeWrite.current=false;
    setReplies({});setExpanded(null);setNote('');setBusy(false);setWriteError('');setToast('');
    setCompose(search.get('compose')==='1');
  },[ctx.player?.id,ctx.user?.id]);
  const isCurrent=(owner:typeof scope.current)=>mounted.current&&scope.current===owner;
  const flash=(message:string,owner:typeof scope.current)=>{
    setToast(message);
    setTimeout(()=>{if(isCurrent(owner))setToast('');},1600);
  };

  const update=async(request:any)=>{
    if(activeWrite.current||!ctx.player||request.player_id!==ctx.player.id)return;
    const owner=scope.current;
    const payload={player_reply:replies[request.id]??request.player_reply??null,status:'completed'};
    activeWrite.current=true;setBusy(true);setWriteError('');
    const outcome=await writeWithDeadline(signal=>supabase.from('player_requests')
      .update(payload).eq('id',request.id).eq('player_id',ctx.player!.id)
      .select(REQUEST_FIELDS).abortSignal(signal).single());
    if(!isCurrent(owner))return;
    activeWrite.current=false;setBusy(false);
    if(outcome.status==='unknown'){
      setWriteError('We could not confirm that your action was completed. Your reply is still here. You can try again.');return;
    }
    const {data:record,error}=outcome.result;
    if(error||!record||record.id!==request.id||record.player_id!==owner.playerId||record.status!=='completed'||record.player_reply!==payload.player_reply){
      setWriteError('Your action could not be confirmed. Your reply is still here. Please try again.');return;
    }
    pageRead.updateData(current=>current.map(item=>item.id===record.id?record:item));
    setReplies(current=>{const next={...current};delete next[request.id];return next;});
    setExpanded(null);flash('Done',owner);
    // A failed background context read must not clear a separate unsent draft.
    if(!note.trim()&&!Object.entries(replies).some(([id,text])=>id!==request.id&&text.trim()))void ctx.refresh();
  };

  const send=async()=>{
    const text=note.trim();
    if(activeWrite.current||!text||!ctx.player)return;
    const owner=scope.current;
    let payload=pendingNotes.current.get(text);
    if(!payload){
      payload={id:crypto.randomUUID(),player_id:ctx.player.id,
        title:`Note from ${ctx.player.preferred_name||ctx.player.first_name||'player'}`,
        message:null,request_type:'message',status:'open',player_reply:text,created_by:null};
      pendingNotes.current.set(text,payload);
    }
    activeWrite.current=true;setBusy(true);setWriteError('');
    const draft=payload;
    const outcome=await writeWithDeadline(async signal=>{
      const inserted=await supabase.from('player_requests').insert(draft)
        .select(REQUEST_FIELDS).abortSignal(signal).single();
      if(inserted.error?.code!=='23505'||!isCurrent(owner))return inserted;
      return supabase.from('player_requests').select(REQUEST_FIELDS)
        .eq('id',draft.id).eq('player_id',draft.player_id).abortSignal(signal).maybeSingle();
    });
    if(!isCurrent(owner))return;
    activeWrite.current=false;setBusy(false);
    if(outcome.status==='unknown'){
      setWriteError('We could not confirm that your note was sent. Your draft is still here. Retrying the same draft uses the same note record.');return;
    }
    const {data:record,error}=outcome.result;
    if(error||!record||record.id!==draft.id||record.player_id!==draft.player_id||
      record.request_type!=='message'||record.created_by!==null||record.player_reply!==draft.player_reply){
      setWriteError('Your note could not be confirmed. Your draft is still here. Retrying the same draft uses the same note record.');return;
    }
    pageRead.updateData(current=>[record,...current.filter(item=>item.id!==record.id)]);
    pendingNotes.current.delete(text);setNote('');setCompose(false);flash('Sent to your agency',owner);
  };

  if(ctx.loading||ctx.error){
    return <LoadingScreen error={ctx.error} onRetry={()=>void ctx.refresh()}/>;
  }
  if(!ctx.player){
    return <PlayerShell><main className="narrow player-shell"><JourneyStatus title="No player profile is linked yet" description="Ask your agency to link your profile to this account."/></main></PlayerShell>;
  }
  if(pageRead.loading||pageRead.error){
    return <PlayerShell><main className="narrow player-shell"><JourneyStatus
      kind={pageRead.error?'error':'loading'}
      title={pageRead.error?'Your agency updates could not load':'Loading your agency updates'}
      description={pageRead.error||'Checking the actions and notes shared with you.'}
      onRetry={pageRead.error?()=>void pageRead.retry():undefined}
    /></main></PlayerShell>;
  }

  // Internal signal rows are for agency/admin follow-up and must never
  // be shown back to the player as an action or history item.
  const playerVisibleActions = requests.filter(
    (request) =>
      request.request_type !== 'message' &&
      request.request_type !== 'signal',
  );

  const open = playerVisibleActions.filter(
    (request) =>
      request.status === 'open',
  );

  const messages = requests.filter(
    (request) =>
      request.request_type === 'message',
  );

  const done = playerVisibleActions.filter(
    (request) =>
      request.status === 'completed',
  );

  return (
    <PlayerShell inboxCount={open.length}>
      <main className="narrow player-shell djm-updates-page">
        <header className="djm-updates-head">
          <div>
            <div className="section-kicker">
              YOUR AGENCY + YOU
            </div>
            <h1 className="page-title">
              Your agency updates.
            </h1>
            <p className="page-intro">
              Anything that needs your attention lives here. No admin, no clutter.
            </p>
          </div>

          <button
            className="btn btn-navy btn-sm"
            disabled={busy}
            aria-expanded={compose}
            onClick={() =>
              setCompose(!compose)
            }
          >
            <MessageCircle size={16} />
            Send a note
          </button>
        </header>

        {(busy||writeError)&&<JourneyStatus kind={busy?'loading':'error'} title={busy?'Sending your agency update':'Your agency update needs another try'} description={busy?'Waiting for confirmation. Your draft stays here until the save is confirmed.':writeError}/>}

        {compose && (
          <section className="djm-note-composer">
            <div className="section-kicker">
              SEND YOUR AGENCY A NOTE
            </div>
            <h2>What do you need?</h2>
            <p>
              Keep it short. A question, update or something you want the agency to follow up.
            </p>
            <textarea
              className="textarea"
              value={note}
              disabled={busy}
              aria-label="Note to your agency"
              onChange={(event) =>
                setNote(event.target.value)
              }
              placeholder="Type your note…"
              autoFocus
            />
            <div className="djm-note-actions">
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() =>
                  setCompose(false)
                }
              >
                Cancel
              </button>
              <button
                className="btn btn-navy btn-sm"
                disabled={
                  busy || !note.trim()
                }
                onClick={send}
              >
                Send to your agency
                <Send size={15} />
              </button>
            </div>
          </section>
        )}

        <section className="djm-action-section">
          <div className="djm-section-line">
            <div>
              <span>ACTION NEEDED</span>
              <strong>
                {open.length
                  ? `${open.length} waiting for you`
                  : 'Nothing waiting'}
              </strong>
            </div>
          </div>

          {open.length === 0 ? (
            <div className="djm-all-clear">
              <div>
                <Check size={22} />
              </div>
              <strong>You’re all clear.</strong>
              <span>
                When your agency needs something from you, it will appear here.
              </span>
            </div>
          ) : (
            <div className="stack">
              {open.map((request) => {
                const isOpen =
                  expanded === request.id;

                return (
                  <article
                    key={request.id}
                    className="djm-request-card"
                  >
                    <div className="djm-request-top">
                      <span className="djm-request-pill">
                        ACTION NEEDED
                      </span>
                      {request.due_at && (
                        <span className="djm-request-date">
                          <Clock3 size={13} />
                          {fmtDate(request.due_at)}
                        </span>
                      )}
                    </div>

                    <h2>{request.title}</h2>
                    {request.message && (
                      <p>{request.message}</p>
                    )}

                    <button
                      className="djm-request-open"
                      disabled={busy}
                      onClick={() => {
                        setExpanded(
                          isOpen
                            ? null
                            : request.id,
                        );
                      }}
                    >
                      {isOpen
                        ? 'Close'
                        : 'Open'}
                      {isOpen ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>

                    {isOpen && (
                      <div className="djm-request-reply">
                        <label className="label" htmlFor={'agency-reply-'+request.id}>
                          Add a note to your agency
                          <span className="muted">
                            {' '}optional
                          </span>
                        </label>
                        <textarea
                          className="textarea"
                          id={'agency-reply-'+request.id}
                          disabled={busy}
                          value={replies[request.id]??request.player_reply??''}
                          onChange={(event)=>setReplies(current=>({...current,[request.id]:event.target.value}))}
                          placeholder="Anything your agency should know?"
                        />
                        <button
                          className="btn btn-navy btn-block"
                          disabled={busy}
                          onClick={() =>
                            update(request)
                          }
                        >
                          <Check size={16} />
                          Done
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {messages.length > 0 && (
          <section className="djm-history-section">
            <div className="section-kicker">
              NOTES WITH YOUR AGENCY
            </div>
            <div className="djm-history-list">
              {messages
                .slice(0, 8)
                .map((message) => (
                  <div
                    className="djm-history-row"
                    key={message.id}
                  >
                    <div className="djm-history-icon">
                      <MessageCircle size={16} />
                    </div>
                    <div>
                      <strong>
                        {message.created_by
                          ? 'Your agency'
                          : 'You'}
                      </strong>
                      <span>
                        {message.created_by
                          ? message.message ||
                            message.title
                          : message.player_reply ||
                            message.title}
                      </span>
                    </div>
                    <small>
                      {fmtDate(
                        message.created_at,
                      )}
                    </small>
                  </div>
                ))}
            </div>
          </section>
        )}

        {done.length > 0 && (
          <section className="djm-history-section">
            <div className="section-kicker">
              PAST ACTIONS
            </div>
            <div className="djm-history-list">
              {done
                .slice(0, 6)
                .map((request) => (
                  <div
                    className="djm-history-row"
                    key={request.id}
                  >
                    <div className="djm-history-icon">
                      <Check size={16} />
                    </div>
                    <div>
                      <strong>
                        {request.title}
                      </strong>
                      <span>Completed</span>
                    </div>
                    <small>
                      {fmtDate(
                        request.completed_at ||
                          request.created_at,
                      )}
                    </small>
                  </div>
                ))}
            </div>
          </section>
        )}

        <div className="djm-updates-foot">
          <span>
            Need something from us?
          </span>
          <button
            disabled={busy}
            onClick={() =>
              setCompose(true)
            }
          >
            Send your agency a note
            <ArrowRight size={14} />
          </button>
        </div>

        {toast && (
          <div className="toast">
            {toast}
          </div>
        )}
      </main>
    </PlayerShell>
  );
}

export default function Inbox() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <InboxContent />
    </Suspense>
  );
}
