import styles from './ClubFixtureTeams.module.css';

export function ClubFixtureTeams({home, away, homeLogo, awayLogo}: {
  home: string; away: string; homeLogo?: string | null; awayLogo?: string | null;
}) {
  const team = (name: string, logo?: string | null) => (
    <span className={styles.team}>
      {logo && <img src={logo} alt="" width={18} height={18} loading="lazy"
        referrerPolicy="no-referrer" onError={event => {event.currentTarget.hidden = true;}} />}
      {name}
    </span>
  );

  return <span className={styles.match}>
    {team(home, homeLogo)} <span className={styles.versus}>vs</span> {team(away, awayLogo)}
  </span>;
}

export function KickoffAttribution({credits}: {credits: string[]}) {
  return <small className={styles.credit}>
    <a href="https://kickoffapi.com/" target="_blank" rel="noreferrer">Powered by KickoffAPI</a>
    {credits.length > 0 && <> · {credits.join(' · ')}</>}
  </small>;
}
