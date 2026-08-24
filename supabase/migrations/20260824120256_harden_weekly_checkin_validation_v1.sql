alter table public.weekly_checkins
  add constraint weekly_checkins_availability_status_check
    check (
      availability_status is null
      or availability_status in ('available', 'limited', 'unavailable')
    ),

  add constraint weekly_checkins_fitness_status_check
    check (
      fitness_status is null
      or fitness_status in ('fully_fit', 'managing', 'injured')
    ),

  add constraint weekly_checkins_matches_played_nonnegative
    check (
      matches_played is null
      or matches_played >= 0
    ),

  add constraint weekly_checkins_minutes_played_nonnegative
    check (
      minutes_played is null
      or minutes_played >= 0
    ),

  add constraint weekly_checkins_goals_nonnegative
    check (
      goals is null
      or goals >= 0
    ),

  add constraint weekly_checkins_assists_nonnegative
    check (
      assists is null
      or assists >= 0
    );
