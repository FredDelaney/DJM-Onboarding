'use client';

import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleAlert,
  Coins,
  Network,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import styles from './AgencyOwnerCommandCentre.module.css';

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );

const count = (
  value: unknown,
  fallback = '0',
) => {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? String(Math.round(parsed))
    : fallback;
};

const money = (
  value: unknown,
  currency = 'EUR',
) => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 'Not recorded';
  }

  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en-GB')}`;
  }
};

const safeArray = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

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

export default function AgencyOwnerCommandCentre({
  data,
  onClose,
  onOpenDeal,
  onOpenAction,
}: {
  data: any;
  onClose: () => void;
  onOpenDeal: (
    dealRoomId: string,
    title: string,
    context?: string | null,
  ) => void;
  onOpenAction: (
    request: AgencyActionRequest,
  ) => void;
}) {
  const control = data?.control || {};
  const roi = data?.roi || {};
  const receivables =
    data?.receivables || {};

  const revenue =
    control?.revenue || {};
  const currencies = safeArray(
    revenue?.by_currency,
  );

  const pipeline = currencies.length
    ? currencies
    : safeArray(
        roi?.commercial_pipeline,
      );

  const protectRevenue = safeArray(
    revenue?.protect_revenue,
  );

  const executive =
    control?.executive_summary || {};

  const capacity =
    control?.governance
      ?.team_capacity_summary ||
    control?.team_capacity
      ?.summary ||
    {};

  const serviceSummary =
    control?.service_control?.summary ||
    control?.service_assurance?.summary ||
    {};

  const serviceItems = safeArray(
    control?.service_control?.items,
  );

  const receivableSummary =
    receivables?.summary || {};

  const activity =
    roi?.measured_activity || {};

  const baseline =
    roi?.customer_baseline_estimate ||
    {};

  const primaryCurrency =
    pipeline[0] || null;

  const weightedLabel =
    primaryCurrency
      ? money(
          primaryCurrency.weighted_commission,
          primaryCurrency.currency ||
            'EUR',
        )
      : 'No priced pipeline';

  const expectedLabel =
    primaryCurrency
      ? money(
          primaryCurrency.expected_commission,
          primaryCurrency.currency ||
            'EUR',
        )
      : 'No priced pipeline';

  const supportedPlayerFix = (
    item: any,
  ) => {
    const action = String(
      item?.action_plan?.api_action ||
        '',
    );

    return [
      'player_control_fix_prepare',
      'player_service_move_prepare',
      'career_strategy_action_prepare',
    ].includes(action);
  };

  const openServiceFix = (
    item: any,
  ) => {
    const action = String(
      item?.action_plan?.api_action ||
        '',
    );

    if (
      item?.entity_type !== 'player' ||
      !supportedPlayerFix(item)
    ) {
      return;
    }

    onOpenAction({
      key:
        `owner-control:${item.entity_id}:${item.breach?.code || action}`,
      eyebrow: 'OWNER CONTROL',
      title:
        item.title ||
        'Player control',
      instruction:
        item.breach?.required_action ||
        item.breach?.fact ||
        'Review the recorded service-control gap.',
      label:
        action ===
        'player_control_fix_prepare'
          ? 'Fix ownership'
          : action ===
              'career_strategy_action_prepare'
            ? 'Review career plan'
            : 'Prepare service action',
      action,
      payload: {
        player_id: item.entity_id,
      },
      context: human(
        item.breach?.severity ||
          'review',
      ),
      facts: [
        {
          label: 'Recorded issue',
          value: human(
            item.breach?.code ||
              'service control',
          ),
          detail:
            item.breach?.fact ||
            null,
        },
        {
          label: 'Severity',
          value: human(
            item.breach?.severity ||
              'review',
          ),
        },
      ],
      successCondition:
        item.action_plan?.expected_fix
          ? `The recorded ${human(item.action_plan.expected_fix)} gap is resolved.`
          : 'The recorded operating gap is resolved or deliberately reset.',
    });
  };

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Owner Command Centre"
      >
        <header className={styles.header}>
          <div className={styles.topline}>
            <span className={styles.live}>
              <i />
              Recorded agency evidence
            </span>

            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Close Owner Command Centre"
            >
              <X size={18} />
            </button>
          </div>

          <p className={styles.eyebrow}>
            OWNER COMMAND CENTRE
          </p>
          <h2>
            Run the business without losing the football.
          </h2>
          <p className={styles.subhead}>
            Commercial exposure, service control, ownership and collection from recorded agency evidence.
          </p>
        </header>

        <div className={styles.content}>
          <section className={styles.hero}>
            <div>
              <p>COMMERCIAL POSITION</p>
              <h3>{weightedLabel}</h3>
              <span>
                Weighted commission is recorded expected commission multiplied by the agency-entered deal probability. It is not guaranteed revenue.
              </span>
            </div>

            <div className={styles.heroSide}>
              <Coins size={18} />
              <strong>
                {expectedLabel}
              </strong>
              <span>
                expected commission
              </span>
            </div>
          </section>

          <div className={styles.grid}>
            <Fact
              label="Active deals"
              value={count(
                executive.active_deals ??
                  primaryCurrency?.active_deals,
              )}
              detail="Recorded live commercial processes"
            />
            <Fact
              label="Service breaches"
              value={count(
                serviceSummary.total_breaches ??
                  executive.service_standard_breaches,
              )}
              detail={`${count(
                serviceSummary.players_with_breaches,
              )} player(s) with recorded breaches`}
            />
            <Fact
              label="Players without owner"
              value={count(
                capacity.active_players_without_primary_owner ??
                  executive.players_without_primary_owner,
              )}
              detail="Primary staff ownership not recorded"
            />
            <Fact
              label="Open receivables"
              value={count(
                receivableSummary.open_receivables,
              )}
              detail={`${count(
                receivableSummary.overdue_receivables,
              )} overdue · ${count(
                receivableSummary.disputed_receivables,
              )} disputed`}
            />
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <BriefcaseBusiness
                size={17}
              />
              <div>
                <p>PROTECT REVENUE</p>
                <h3>
                  Live deals with recorded operating exposure
                </h3>
              </div>
            </div>

            <div className={styles.rows}>
              {protectRevenue
                .slice(0, 6)
                .map((item: any) => (
                  <article
                    key={
                      item.deal_room_id ||
                      item.title
                    }
                    className={styles.row}
                  >
                    <div>
                      <strong>
                        {item.title ||
                          'Live deal'}
                      </strong>
                      <span>
                        {money(
                          item.weighted_commission,
                          item.currency ||
                            'EUR',
                        )}{' '}
                        weighted ·{' '}
                        {human(
                          item.stage ||
                            'recorded',
                        )}
                      </span>
                      <small>
                        {item.primary_blocker ||
                          `${count(item.exposure_gap_count)} recorded operating gap(s)`}
                      </small>
                    </div>

                    {item.deal_room_id ? (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenDeal(
                            String(
                              item.deal_room_id,
                            ),
                            item.title ||
                              'Live deal',
                            item.player ||
                              null,
                          )
                        }
                      >
                        <ArrowRight
                          size={14}
                        />
                        War room
                      </button>
                    ) : null}
                  </article>
                ))}

              {!protectRevenue.length ? (
                <div className={styles.empty}>
                  <CheckCircle2
                    size={17}
                  />
                  <div>
                    <strong>
                      No revenue-protection item is currently recorded.
                    </strong>
                    <span>
                      ReDream will only surface exposure supported by the deal record.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {currencies.length > 1 ? (
              <p className={styles.truth}>
                Currencies remain separate. ReDream does not invent an FX conversion or combine them into a false single total.
              </p>
            ) : null}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <Users size={17} />
              <div>
                <p>TEAM OWNERSHIP</p>
                <h3>
                  Accountability before workload guesswork
                </h3>
              </div>
            </div>

            <div className={styles.grid}>
              <Fact
                label="Active members"
                value={count(
                  capacity.active_members,
                )}
              />
              <Fact
                label="Unowned players"
                value={count(
                  capacity.active_players_without_primary_owner,
                )}
              />
              <Fact
                label="Unowned deals"
                value={count(
                  capacity.active_deals_without_owner,
                )}
              />
              <Fact
                label="Unowned tasks"
                value={count(
                  capacity.open_tasks_without_owner,
                )}
              />
            </div>

            <p className={styles.truth}>
              ReDream does not calculate a fake utilisation percentage because actual working hours and effort per task are not recorded.
            </p>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <ShieldCheck size={17} />
              <div>
                <p>SERVICE CONTROL</p>
                <h3>
                  Fix the operating gaps with a real next action
                </h3>
              </div>
            </div>

            <div className={styles.rows}>
              {serviceItems
                .filter(
                  (item: any) =>
                    item.entity_type ===
                      'player' &&
                    supportedPlayerFix(
                      item,
                    ),
                )
                .slice(0, 5)
                .map((item: any) => (
                  <article
                    key={`${item.entity_id}:${item.breach?.code || item.title}`}
                    className={styles.row}
                  >
                    <div>
                      <strong>
                        {item.title ||
                          'Player control'}
                      </strong>
                      <span>
                        {human(
                          item.breach
                            ?.severity ||
                            'review',
                        )}{' '}
                        ·{' '}
                        {human(
                          item.breach
                            ?.code ||
                            'service control',
                        )}
                      </span>
                      <small>
                        {item.breach
                          ?.fact ||
                          item.breach
                            ?.required_action ||
                          'Recorded operating gap'}
                      </small>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openServiceFix(
                          item,
                        )
                      }
                    >
                      <ArrowRight
                        size={14}
                      />
                      Fix control
                    </button>
                  </article>
                ))}

              {!serviceItems.filter(
                (item: any) =>
                  item.entity_type ===
                    'player' &&
                  supportedPlayerFix(item),
              ).length ? (
                <div className={styles.empty}>
                  <CheckCircle2
                    size={17}
                  />
                  <div>
                    <strong>
                      No directly actionable player-control gap is currently recorded.
                    </strong>
                    <span>
                      Other evidence remains visible without inventing an action.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <Network size={17} />
              <div>
                <p>RECORDED VALUE</p>
                <h3>
                  What the agency actually captured in the last 30 days
                </h3>
              </div>
            </div>

            <div className={styles.grid}>
              <Fact
                label="Interactions"
                value={count(
                  activity.interactions_logged,
                )}
              />
              <Fact
                label="Club needs"
                value={count(
                  activity.club_needs_created,
                )}
              />
              <Fact
                label="Player matches"
                value={count(
                  activity.player_matches_created,
                )}
              />
              <Fact
                label="Autopilot actions applied"
                value={count(
                  activity.tell_djm_actions_applied,
                )}
              />
            </div>

            <div className={styles.baseline}>
              {baseline.enabled ? (
                <>
                  <CheckCircle2 size={15} />
                  <span>
                    Customer baseline assumptions are configured for ROI estimation.
                  </span>
                </>
              ) : (
                <>
                  <CircleAlert size={15} />
                  <span>
                    {baseline.message ||
                      'No time or labour saving estimate is shown until the agency configures its own baseline assumptions.'}
                  </span>
                </>
              )}
            </div>
          </section>

          <p className={styles.truth}>
            This command centre separates factual operating control, recorded commercial exposure and measured platform activity. It does not turn them into one opaque agency score.
          </p>
        </div>
      </aside>
    </div>
  );
}
