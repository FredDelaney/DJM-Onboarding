'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  CalendarDays,
  Check,
  ChevronRight,
  ExternalLink,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

import {
  supabase,
} from '@/lib/supabase';

type Props = {
  player: any;
  career: any[];
  canEdit?: boolean;
  onChanged:
    () => Promise<void> | void;
};

type Draft = {
  id?: string;
  season_label: string;
  club_name: string;
  league: string;
  country: string;
  appearances: string;
  starts: string;
  minutes: string;
  goals: string;
  assists: string;
  source_name: string;
  source_url: string;
};

const blankDraft = (
  player: any,
): Draft => ({
  season_label:
    player?.current_season_label ||
    '',

  club_name:
    player?.current_club ||
    '',

  league:
    player?.current_league ||
    '',

  country:
    player?.current_country ||
    '',

  appearances: '',
  starts: '',
  minutes: '',
  goals: '',
  assists: '',

  source_name: '',
  source_url: '',
});

const rowDraft = (
  row: any,
): Draft => ({
  id: row.id,

  season_label:
    row.season_label || '',

  club_name:
    row.club_name || '',

  league:
    row.league || '',

  country:
    row.country || '',

  appearances:
    row.appearances == null
      ? ''
      : String(row.appearances),

  starts:
    row.starts == null
      ? ''
      : String(row.starts),

  minutes:
    row.minutes == null
      ? ''
      : String(row.minutes),

  goals:
    row.goals == null
      ? ''
      : String(row.goals),

  assists:
    row.assists == null
      ? ''
      : String(row.assists),

  source_name:
    row.source_name || '',

  source_url:
    row.source_url || '',
});

const seasonKey = (
  row: any,
) => {
  const value =
    String(
      row?.season_label || '',
    );

  const year =
    value.match(
      /(19|20)\d{2}/,
    );

  if (year) {
    return Number(
      year[0],
    );
  }

  if (row?.start_date) {
    const parsed =
      new Date(
        row.start_date,
      ).getFullYear();

    if (
      Number.isFinite(
        parsed,
      )
    ) {
      return parsed;
    }
  }

  return 0;
};

const statLine = (
  row: any,
) => {
  const values = [
    row.appearances != null
      ? `${row.appearances} apps`
      : null,

    row.starts != null
      ? `${row.starts} starts`
      : null,

    row.goals != null
      ? `${row.goals} goals`
      : null,

    row.assists != null
      ? `${row.assists} assists`
      : null,

    row.minutes != null
      ? `${Number(
          row.minutes,
        ).toLocaleString(
          'en-GB',
        )} mins`
      : null,
  ].filter(Boolean);

  return (
    values.join(' · ') ||
    'No performance numbers yet'
  );
};

const numericValue = (
  value: string,
  label: string,
) => {
  if (!value.trim()) {
    return {
      value: null,
      error: '',
    };
  }

  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 0
  ) {
    return {
      value: null,
      error:
        `${label} must be a whole number of 0 or more.`,
    };
  }

  return {
    value: parsed,
    error: '',
  };
};

export default function SeasonRecordEditor({
  player,
  career = [],
  canEdit = false,
  onChanged,
}: Props) {
  const [
    trackerLabel,
    setTrackerLabel,
  ] = useState('');

  const [
    trackerStart,
    setTrackerStart,
  ] = useState('');

  const [
    editorOpen,
    setEditorOpen,
  ] = useState(false);

  const [
    draft,
    setDraft,
  ] =
    useState<Draft>(
      blankDraft(player),
    );

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState('');

  const [
    deleteArmed,
    setDeleteArmed,
  ] = useState(false);
const [
  syncBusy,
  setSyncBusy,
] = useState(false);

const [
  syncOpen,
  setSyncOpen,
] = useState(false);

const [
  syncPreview,
  setSyncPreview,
] = useState<any>(
  null,
);

const [
  syncError,
  setSyncError,
] = useState('');

const hasSofaScore =
  /sofascore\./i.test(
    String(
      player?.stats_url
      ||''
    )
  );

const hasTransfermarkt =
  /transfermarkt\./i.test(
    String(
      player?.transfermarkt_url
      ||''
    )
  );
  
  useEffect(() => {
    setTrackerLabel(
      player
        ?.current_season_label ||
        '',
    );

    setTrackerStart(
      player
        ?.current_season_start ||
        '',
    );
  }, [
    player?.id,
    player
      ?.current_season_label,
    player
      ?.current_season_start,
  ]);

  const rows =
    useMemo(
      () =>
        [...career].sort(
          (a, b) =>
            seasonKey(b) -
              seasonKey(a) ||
            Number(
              a.sort_order || 0,
            ) -
              Number(
                b.sort_order || 0,
              ),
        ),
      [career],
    );

  const refreshStats =
  async (
    source:
      |'auto'
      |'sofascore'
      |'transfermarkt'
      ='auto'
  ) => {
    if(!canEdit){
      return;
    }

    setSyncBusy(true);
    setSyncError('');

    const {
      data,
      error
    }=
      await supabase
        .functions
        .invoke(
          'import-player-stats',
          {
            body:{
              mode:'preview',

              player_id:
                player.id,

              source
            }
          }
        );

    setSyncBusy(false);

    if(
      error
      ||data?.error
    ){
      setSyncError(
        data?.error
        ||error?.message
        ||'Could not refresh player statistics.'
      );

      setSyncOpen(true);

      return;
    }

    setSyncPreview(
      data
    );

    setSyncOpen(true);
  };
  
 const approveSync =
  async () => {
    if(
      !syncPreview
      ||!Array.isArray(
        syncPreview.rows
      )
      ||!syncPreview.rows.length
    ){
      return;
    }

    setSyncBusy(true);
    setSyncError('');

    const {
      data,
      error
    }=
      await supabase
        .functions
        .invoke(
          'import-player-stats',
          {
            body:{
              mode:'apply',

              player_id:
                player.id,

              rows:
                syncPreview.rows,

              source_name:
                syncPreview
                  .source_name,

              source_url:
                syncPreview
                  .source_url
            }
          }
        );

    if(
      error
      ||!data?.ok
    ){
      setSyncBusy(false);

      setSyncError(
        data?.error
        ||error?.message
        ||'Could not update the DJM sporting record.'
      );

      return;
    }

    await onChanged();

    setSyncBusy(false);
    setSyncOpen(false);
    setSyncPreview(null);

    setMessage(
      `${data.total} season record${
        data.total===1
          ?''
          :'s'
      } reviewed and updated.`
    );
  };

const openNew = () => {
  if (!canEdit) return;

  setDraft(
    blankDraft(player),
  );

  setDeleteArmed(false);
  setMessage('');
  setEditorOpen(true);
};

  const openEdit = (
    row: any,
  ) => {
    if (!canEdit) return;

    setDraft(
      rowDraft(row),
    );

    setDeleteArmed(false);
    setMessage('');
    setEditorOpen(true);
  };

  const close = () => {
    if (busy) return;

    setEditorOpen(false);
    setDeleteArmed(false);
    setMessage('');
  };

  const field = (
    key: keyof Draft,
    value: string,
  ) => {
    setDraft({
      ...draft,
      [key]: value,
    });

    setMessage('');
  };

  const saveTracker =
    async () => {
      if (!canEdit) return;

      setBusy(true);
      setMessage('');

      const {
        error,
      } =
        await supabase
          .from('players')
          .update({
            current_season_label:
              trackerLabel
                .trim() ||
              null,

            current_season_start:
              trackerStart ||
              null,
          })
          .eq(
            'id',
            player.id,
          );

      setBusy(false);

      if (error) {
        setMessage(
          'Could not save the current season period.',
        );

        return;
      }

      await onChanged();

      setMessage(
        'My Season period saved.',
      );
    };

  const saveRecord =
    async () => {
      if (!canEdit) return;

      if (
        !draft.season_label
          .trim()
      ) {
        setMessage(
          'Add the season first.',
        );

        return;
      }

      if (
        !draft.club_name
          .trim()
      ) {
        setMessage(
          'Add the club first.',
        );

        return;
      }

      const appearances =
        numericValue(
          draft.appearances,
          'Apps',
        );

      const starts =
        numericValue(
          draft.starts,
          'Starts',
        );

      const minutes =
        numericValue(
          draft.minutes,
          'Minutes',
        );

      const goals =
        numericValue(
          draft.goals,
          'Goals',
        );

      const assists =
        numericValue(
          draft.assists,
          'Assists',
        );

      const error =
        [
          appearances,
          starts,
          minutes,
          goals,
          assists,
        ].find(
          (item) =>
            item.error,
        )?.error;

      if (error) {
        setMessage(error);
        return;
      }

      if (
        appearances.value !=
          null &&
        starts.value != null &&
        starts.value >
          appearances.value
      ) {
        setMessage(
          'Starts cannot be higher than appearances.',
        );

        return;
      }

      setBusy(true);
      setMessage('');

      const payload = {
        club_name:
          draft.club_name
            .trim(),

        season_label:
          draft.season_label
            .trim(),

        league:
          draft.league
            .trim() ||
          null,

        country:
          draft.country
            .trim() ||
          null,

        appearances:
          appearances.value,

        starts:
          starts.value,

        minutes:
          minutes.value,

        goals:
          goals.value,

        assists:
          assists.value,

        source_name:
          draft.source_name
            .trim() ||
          null,

        source_url:
          draft.source_url
            .trim() ||
          null,

        source_reviewed_at:
          new Date()
            .toISOString(),
      };

      const query =
        draft.id
          ? supabase
              .from(
                'career_entries',
              )
              .update(payload)
              .eq(
                'id',
                draft.id,
              )
          : supabase
              .from(
                'career_entries',
              )
              .insert({
                ...payload,

                player_id:
                  player.id,

                sort_order:
                  career.length,
              });

      const {
        error:
          saveError,
      } = await query;

      setBusy(false);

      if (saveError) {
        setMessage(
          saveError.message ||
            'Could not save this season.',
        );

        return;
      }

      await onChanged();

      setEditorOpen(false);

      setMessage(
        'Season record saved · DJM review required.',
      );
    };

  const deleteRecord =
    async () => {
      if (
        !canEdit ||
        !draft.id
      ) {
        return;
      }

      if (!deleteArmed) {
        setDeleteArmed(true);

        setMessage(
          'Tap delete again to permanently remove this season record.',
        );

        return;
      }

      setBusy(true);

      const {
        error,
      } =
        await supabase
          .from(
            'career_entries',
          )
          .delete()
          .eq(
            'id',
            draft.id,
          );

      setBusy(false);

      if (error) {
        setMessage(
          'Could not delete this season record.',
        );

        return;
      }

      await onChanged();

      setEditorOpen(false);
      setDeleteArmed(false);

      setMessage(
        'Season record removed · DJM review required.',
      );
    };

  const useSource = (
    label: string,
    url: string,
  ) => {
    setDraft({
      ...draft,
      source_name: label,
      source_url: url,
    });
  };

  return (
    <>
      <section className="admin-card season-record-editor">
        <div className="season-record-head">
          <div>
            <div className="section-kicker">
              PERFORMANCE RECORD
            </div>

            <h3>
              Season by season.
            </h3>

            <p>
              The verified sporting
              record that powers the
              player dossier and PDF.
            </p>
          </div>

          {canEdit && (
  <div
    className="row"
    style={{
      flexWrap:'wrap',
      justifyContent:
        'flex-end'
    }}
  >
    <button
      type="button"
      className="btn btn-quiet btn-sm"
      onClick={()=>
        refreshStats(
          'auto'
        )
      }
      disabled={
        syncBusy
      }
    >
      <RefreshCw
        size={15}
      />

      {syncBusy
        ?'Checking…'
        :'Refresh stats'
      }
    </button>

    <button
      type="button"
      className="btn btn-navy btn-sm"
      onClick={
        openNew
      }
    >
      <Plus
        size={15}
      />

      Add season
    </button>
  </div>
)}
        </div>

        <div className="season-tracker-setting">
          <div className="season-tracker-title">
            <CalendarDays
              size={18}
            />

            <div>
              <strong>
                My Season tracker
              </strong>

              <span>
                Controls which
                weekly check-ins
                count toward the
                player's current
                season.
              </span>
            </div>
          </div>

          <div className="season-tracker-fields">
            <div className="field">
              <label className="label">
                Season
              </label>

              <input
                className="input"
                value={
                  trackerLabel
                }
                onChange={(
                  event,
                ) =>
                  setTrackerLabel(
                    event.target
                      .value,
                  )
                }
                placeholder="2026/27 or 2026"
                disabled={
                  !canEdit
                }
              />
            </div>

            <div className="field">
              <label className="label">
                Starts
              </label>

              <input
                className="input"
                type="date"
                value={
                  trackerStart
                }
                onChange={(
                  event,
                ) =>
                  setTrackerStart(
                    event.target
                      .value,
                  )
                }
                disabled={
                  !canEdit
                }
              />
            </div>
          </div>

          {canEdit && (
            <button
              type="button"
              className="season-tracker-save"
              onClick={
                saveTracker
              }
              disabled={
                busy
              }
            >
              <Check
                size={14}
              />
              Save season period
            </button>
          )}
        </div>

        {rows.length ? (
          <div className="season-record-list">
            {rows.map(
              (row) => (
                <button
                  type="button"
                  className="season-record-row"
                  key={
                    row.id
                  }
                  onClick={() =>
                    openEdit(
                      row,
                    )
                  }
                  disabled={
                    !canEdit
                  }
                >
                  <div className="season-record-season">
                    {row.season_label ||
                      '-'}
                  </div>

                  <div className="season-record-main">
                    <strong>
                      {
                        row.club_name
                      }
                    </strong>

                    <span>
                      {[
                        row.league,
                        row.country,
                      ]
                        .filter(
                          Boolean,
                        )
                        .join(
                          ' · ',
                        ) ||
                        'Competition not added'}
                    </span>

                    <small>
                      {statLine(
                        row,
                      )}
                    </small>

                    {row.source_name && (
                      <em>
                        Source:{' '}
                        {
                          row.source_name
                        }
                      </em>
                    )}
                  </div>

                  {canEdit && (
                    <ChevronRight
                      size={17}
                    />
                  )}
                </button>
              ),
            )}
          </div>
        ) : (
          <div className="season-record-empty">
            <ShieldCheck
              size={20}
            />

            <strong>
              No verified seasons
              yet.
            </strong>

            <span>
              Add the player's
              current and recent
              seasons to create the
              performance section
              of the club dossier.
            </span>
          </div>
        )}

        {message &&
          !editorOpen && (
            <div className="season-record-message">
              {message}
            </div>
          )}
      </section>

      {syncOpen && (
  <div
    className="season-editor-backdrop"
    onClick={()=>{
      if(!syncBusy){
        setSyncOpen(false);
      }
    }}
  >
    <div
      className="season-editor-sheet"
      onClick={
        event=>
          event.stopPropagation()
      }
    >
      <div className="season-editor-handle" />

      <div className="season-editor-top">
        <div>
          <div className="section-kicker">
            EXTERNAL DATA REVIEW
          </div>

          <h2>
            Refresh player stats
          </h2>
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={()=>
            !syncBusy
            &&setSyncOpen(false)
          }
          aria-label="Close"
        >
          <X size={18}/>
        </button>
      </div>

      <div className="season-editor-body">
        {(hasSofaScore
          ||hasTransfermarkt
        )&&(
          <div className="season-sync-source-row">
            {hasSofaScore&&(
              <button
                type="button"
                className={`pill ${
                  syncPreview?.source
                    ==='sofascore'
                    ?'pill-blue'
                    :''
                }`}
                onClick={()=>
                  refreshStats(
                    'sofascore'
                  )
                }
                disabled={
                  syncBusy
                }
              >
                SofaScore
              </button>
            )}

            {hasTransfermarkt&&(
              <button
                type="button"
                className={`pill ${
                  syncPreview?.source
                    ==='transfermarkt'
                    ?'pill-blue'
                    :''
                }`}
                onClick={()=>
                  refreshStats(
                    'transfermarkt'
                  )
                }
                disabled={
                  syncBusy
                }
              >
                Transfermarkt
              </button>
            )}
          </div>
        )}

        {syncError&&(
          <div
            className="season-record-message"
            role="status"
          >
            {syncError}
          </div>
        )}

        {!syncError
          &&syncBusy
          &&(
            <div className="season-sync-loading">
              <div className="loader"/>

              <span>
                Checking the latest
                sporting data…
              </span>
            </div>
          )
        }

        {syncPreview&&(
          <>
            <div className="season-sync-summary">
              <div>
                <span>
                  SOURCE
                </span>

                <strong>
                  {
                    syncPreview
                      .source_name
                  }
                </strong>
              </div>

              <div>
                <span>
                  SEASONS FOUND
                </span>

                <strong>
                  {
                    syncPreview
                      .rows
                      ?.length
                    ||0
                  }
                </strong>
              </div>

              <div>
                <span>
                  RECENT GAMES
                </span>

                <strong>
                  {
                    syncPreview
                      .recent_matches
                      ?.length
                    ||0
                  }
                </strong>
              </div>
            </div>

            {syncPreview
              .warnings
              ?.map(
                (
                  warning:string,
                  index:number
                )=>(
                  <div
                    className="season-sync-warning"
                    key={index}
                  >
                    {warning}
                  </div>
                )
              )
            }

            <div className="season-editor-section">
              <div className="section-kicker">
                PROPOSED SEASON RECORDS
              </div>

              <div className="season-sync-list">
                {syncPreview
                  .rows
                  ?.map(
                    (
                      row:any,
                      index:number
                    )=>{
                      const existing=
                        career.find(
                          item=>
                            String(
                              item
                                .season_label
                              ||''
                            )
                              .toLowerCase()
                            ===
                            String(
                              row
                                .season_label
                              ||''
                            )
                              .toLowerCase()
                            &&
                            String(
                              item
                                .club_name
                              ||''
                            )
                              .toLowerCase()
                            ===
                            String(
                              row
                                .club_name
                              ||''
                            )
                              .toLowerCase()
                        );

                      return(
                        <div
                          className="season-sync-row"
                          key={
                            `${row.season_label}-${row.club_name}-${index}`
                          }
                        >
                          <div className="season-sync-row-top">
                            <div>
                              <strong>
                                {
                                  row
                                    .season_label
                                }
                                {' · '}
                                {
                                  row
                                    .club_name
                                }
                              </strong>

                              <span>
                                {
                                  row.league
                                  ||'All competitions'
                                }
                              </span>
                            </div>

                            <span className={`pill ${
                              existing
                                ?'pill-blue'
                                :'pill-good'
                            }`}>
                              {existing
                                ?'Update'
                                :'New'
                              }
                            </span>
                          </div>

                          <div className="season-sync-numbers">
                            <span>
                              <b>
                                {
                                  row.appearances
                                  ??'-'
                                }
                              </b>
                              Apps
                            </span>

                            <span>
                              <b>
                                {
                                  row.starts
                                  ??'-'
                                }
                              </b>
                              Starts
                            </span>

                            <span>
                              <b>
                                {
                                  row.minutes
                                  ??'-'
                                }
                              </b>
                              Mins
                            </span>

                            <span>
                              <b>
                                {
                                  row.goals
                                  ??'-'
                                }
                              </b>
                              Goals
                            </span>

                            <span>
                              <b>
                                {
                                  row.assists
                                  ??'-'
                                }
                              </b>
                              Assists
                            </span>
                          </div>

                          {existing&&(
                            <small>
                              DJM currently:
                              {' '}
                              {
                                statLine(
                                  existing
                                )
                              }
                            </small>
                          )}
                        </div>
                      );
                    }
                  )
                }
              </div>
            </div>

            {syncPreview
              .recent_matches
              ?.length>0
              &&(
                <div className="season-editor-section">
                  <div className="section-kicker">
                    RECENT GAMES
                  </div>

                  <div className="season-sync-games">
                    {syncPreview
                      .recent_matches
                      .map(
                        (
                          game:any,
                          index:number
                        )=>(
                          <div
                            className="season-sync-game"
                            key={index}
                          >
                            <div>
                              <strong>
                                {
                                  game.opponent
                                  ?`vs ${game.opponent}`
                                  :'Match'
                                }
                              </strong>

                              <span>
                                {[
                                  game.date,
                                  game.competition,
                                  game.result
                                ]
                                  .filter(
                                    Boolean
                                  )
                                  .join(' · ')
                                }
                              </span>
                            </div>

                            <small>
                              {[
                                game.minutes
                                  !=null
                                  ?`${game.minutes} mins`
                                  :null,

                                game.goals
                                  !=null
                                  ?`${game.goals} G`
                                  :null,

                                game.assists
                                  !=null
                                  ?`${game.assists} A`
                                  :null
                              ]
                                .filter(
                                  Boolean
                                )
                                .join(' · ')
                              }
                            </small>
                          </div>
                        )
                      )
                    }
                  </div>
                </div>
              )
            }
          </>
        )}
      </div>

      <div className="season-editor-actions">
        <button
          type="button"
          className="btn btn-quiet"
          onClick={()=>
            setSyncOpen(false)
          }
          disabled={
            syncBusy
          }
        >
          Cancel
        </button>

        <button
          type="button"
          className="btn btn-navy"
          onClick={
            approveSync
          }
          disabled={
            syncBusy
            ||!syncPreview
              ?.rows
              ?.length
          }
        >
          <Check
            size={15}
          />

          {syncBusy
            ?'Updating…'
            :'Approve & update'
          }
        </button>
      </div>
    </div>
  </div>
)}
      {editorOpen && (
        <div
          className="season-editor-backdrop"
          onClick={close}
        >
          <div
            className="season-editor-sheet"
            onClick={(
              event,
            ) =>
              event.stopPropagation()
            }
          >
            <div className="season-editor-handle" />

            <div className="season-editor-top">
              <div>
                <div className="section-kicker">
                  {draft.id
                    ? 'EDIT SEASON'
                    : 'NEW SEASON'}
                </div>

                <h2>
                  Sporting record
                </h2>
              </div>

              <button
                type="button"
                className="icon-btn"
                onClick={
                  close
                }
                disabled={
                  busy
                }
                aria-label="Close"
              >
                <X
                  size={18}
                />
              </button>
            </div>

            <div className="season-editor-body">
              <div className="grid2">
                <div className="field">
                  <label className="label">
                    Season
                  </label>

                  <input
                    className="input"
                    value={
                      draft.season_label
                    }
                    onChange={(
                      event,
                    ) =>
                      field(
                        'season_label',
                        event.target
                          .value,
                      )
                    }
                    placeholder="2026/27"
                  />
                </div>

                <div className="field">
                  <label className="label">
                    Club
                  </label>

                  <input
                    className="input"
                    value={
                      draft.club_name
                    }
                    onChange={(
                      event,
                    ) =>
                      field(
                        'club_name',
                        event.target
                          .value,
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label className="label">
                    Competition
                  </label>

                  <input
                    className="input"
                    value={
                      draft.league
                    }
                    onChange={(
                      event,
                    ) =>
                      field(
                        'league',
                        event.target
                          .value,
                      )
                    }
                    placeholder="Veikkausliiga"
                  />
                </div>

                <div className="field">
                  <label className="label">
                    Country
                  </label>

                  <input
                    className="input"
                    value={
                      draft.country
                    }
                    onChange={(
                      event,
                    ) =>
                      field(
                        'country',
                        event.target
                          .value,
                      )
                    }
                    placeholder="Finland"
                  />
                </div>
              </div>

              <div className="season-editor-section">
                <div className="section-kicker">
                  PERFORMANCE
                </div>

                <div className="season-number-grid">
                  {[
                    [
                      'appearances',
                      'Apps',
                    ],
                    [
                      'starts',
                      'Starts',
                    ],
                    [
                      'minutes',
                      'Minutes',
                    ],
                    [
                      'goals',
                      'Goals',
                    ],
                    [
                      'assists',
                      'Assists',
                    ],
                  ].map(
                    ([
                      key,
                      label,
                    ]) => (
                      <div
                        className="field"
                        key={
                          key
                        }
                      >
                        <label className="label">
                          {
                            label
                          }
                        </label>

                        <input
                          className="input"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          value={
                            draft[
                              key as keyof Draft
                            ]
                          }
                          onChange={(
                            event,
                          ) =>
                            field(
                              key as keyof Draft,
                              event
                                .target
                                .value,
                            )
                          }
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>

              <div className="season-editor-section">
                <div className="section-kicker">
                  SOURCE / PROVENANCE
                </div>

                <p className="small muted">
                  Optional external
                  reference used by
                  DJM to review these
                  numbers.
                </p>

                <div className="season-source-shortcuts">
                  {player
                    ?.transfermarkt_url && (
                    <button
                      type="button"
                      onClick={() =>
                        useSource(
                          'Transfermarkt',
                          player
                            .transfermarkt_url,
                        )
                      }
                    >
                      Transfermarkt
                    </button>
                  )}

                  {player
                    ?.wyscout_url && (
                    <button
                      type="button"
                      onClick={() =>
                        useSource(
                          'Wyscout',
                          player
                            .wyscout_url,
                        )
                      }
                    >
                      Wyscout
                    </button>
                  )}

                  {player
                    ?.stats_url && (
                    <button
                      type="button"
                      onClick={() =>
                        useSource(
                          'Statistics',
                          player
                            .stats_url,
                        )
                      }
                    >
                      Statistics
                    </button>
                  )}
                </div>

                <div className="grid2">
                  <div className="field">
                    <label className="label">
                      Source name
                    </label>

                    <input
                      className="input"
                      value={
                        draft.source_name
                      }
                      onChange={(
                        event,
                      ) =>
                        field(
                          'source_name',
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="Transfermarkt / Wyscout / DJM record"
                    />
                  </div>

                  <div className="field">
                    <label className="label">
                      Source URL
                    </label>

                    <input
                      className="input"
                      type="url"
                      value={
                        draft.source_url
                      }
                      onChange={(
                        event,
                      ) =>
                        field(
                          'source_url',
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="https://…"
                    />
                  </div>
                </div>

                {draft.source_url && (
                  <a
                    className="season-source-open"
                    href={
                      draft.source_url
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open reference
                    <ExternalLink
                      size={13}
                    />
                  </a>
                )}
              </div>

              {message && (
                <div
                  className="season-record-message"
                  role="status"
                >
                  {message}
                </div>
              )}
            </div>

            <div className="season-editor-actions">
              {draft.id && (
                <button
                  type="button"
                  className={`season-delete ${
                    deleteArmed
                      ? 'is-armed'
                      : ''
                  }`}
                  onClick={
                    deleteRecord
                  }
                  disabled={
                    busy
                  }
                >
                  <Trash2
                    size={15}
                  />

                  {deleteArmed
                    ? 'Confirm delete'
                    : 'Delete'}
                </button>
              )}

              <button
                type="button"
                className="btn btn-navy"
                onClick={
                  saveRecord
                }
                disabled={
                  busy
                }
              >
                <Check
                  size={15}
                />

                {busy
                  ? 'Saving…'
                  : draft.id
                    ? 'Save season'
                    : 'Add season'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
