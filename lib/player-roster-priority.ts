type Directive = { instruction?: unknown; move_type?: unknown; fix_type?: unknown };
type PlayerSummary = {
  access?: { restricted?: boolean };
  identity?: { next_action?: unknown; next_action_due?: unknown };
  service?: { next_control_fix?: Directive | null; next_service_move?: Directive | null };
};

export type PlayerRosterPriority = {
  kind: 'restricted' | 'control' | 'service' | 'work' | 'none';
  tone: 'attention' | 'calm';
  badge: string;
  heading: string;
  instruction: string | null;
  dueAt: string | null;
  actionLabel: string | null;
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function recordedDay(value: unknown): { raw: string; day: string } | null {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === raw
      ? { raw, day: raw } : null;
  }
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? { raw, day: localDay(date) } : null;
}

// Presentation of the existing authorised summary only. Never infer a task ID or write.
export function playerRosterPriority(item: PlayerSummary, now = new Date()): PlayerRosterPriority {
  const base: PlayerRosterPriority = {
    kind: 'none', tone: 'calm', badge: 'Next step not set', heading: 'Next step',
    instruction: null, dueAt: null, actionLabel: null,
  };
  if (item.access?.restricted) return { ...base, kind: 'restricted', badge: 'Assigned player' };

  const control = item.service?.next_control_fix;
  const move = item.service?.next_service_move;
  const moveType = text(move?.move_type);
  const moveInstruction = text(move?.instruction);
  const recorded = text(item.identity?.next_action);
  const due = recordedDay(item.identity?.next_action_due);
  const today = localDay(now);

  if (moveType === 'resolve_player_request' && moveInstruction) {
    return { ...base, kind: 'service', tone: 'attention', badge: 'Player request',
      heading: 'Player request', instruction: moveInstruction, actionLabel: 'Review player request' };
  }

  if (recorded && due && due.day <= today) {
    return { ...base, kind: moveType === 'execute_player_next_action' && moveInstruction ? 'service' : 'work',
      tone: 'attention', badge: due.day < today ? 'Overdue' : 'Due today', heading: 'Next action',
      instruction: recorded, dueAt: due.raw, actionLabel: 'Open next action' };
  }

  // A concrete career/market move takes precedence over generic missing-plan guidance.
  if (moveInstruction && moveType !== 'maintain_player_plan' && moveType !== 'execute_player_next_action') {
    const labels: Record<string, string> = {
      contract_strategy: 'Contract decision', contract_planning: 'Contract planning',
      build_free_agent_market_plan: 'Market plan', convert_market_activity_to_deal: 'Market follow-up',
      protect_live_player_deal: 'Live opportunity',
    };
    const label = labels[moveType] || 'Next move';
    return { ...base, kind: 'service', tone: labels[moveType] ? 'attention' : 'calm',
      badge: label, heading: label, instruction: moveInstruction, actionLabel: 'Prepare next move' };
  }

  if (recorded) {
    const needsDate = !due && text(control?.fix_type) === 'set_player_next_action' && text(control?.instruction);
    return { ...base, kind: needsDate ? 'control' : 'work', badge: needsDate ? 'Set a date' : 'Next action',
      heading: 'Next action', instruction: recorded, dueAt: due?.raw || null,
      actionLabel: needsDate ? 'Set due date' : 'Open next action' };
  }

  if (text(control?.instruction)) {
    const assign = text(control?.fix_type) === 'assign_primary_staff';
    const nextStep = text(control?.fix_type) === 'set_player_next_action';
    return { ...base, kind: 'control', badge: assign ? 'Assign agent' : nextStep ? 'Set next step' : 'Review setup',
      heading: 'Player plan', instruction: assign ? 'Choose the agent responsible for this player.'
        : nextStep ? 'Choose the next useful player action.' : text(control?.instruction),
      actionLabel: assign ? 'Assign agent' : nextStep ? 'Set next step' : 'Review next step' };
  }

  if (moveInstruction) {
    return { ...base, kind: 'service', badge: 'Plan next step', heading: 'Player plan',
      instruction: moveType === 'maintain_player_plan' ? 'Choose the next useful player action.' : moveInstruction,
      actionLabel: 'Plan next step' };
  }
  return base;
}
