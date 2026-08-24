export const isHttpUrl = (value?: string | null) => {
  if (!value?.trim()) return true;

  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const isFutureDate = (value?: string | null) => {
  if (!value) return false;

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return true;
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return date.getTime() > today.getTime();
};

export const optionalNonNegativeInteger = (
  value: string,
  label: string,
): {
  value: number | null;
  error: string | null;
} => {
  const clean = value.trim();

  if (!clean) {
    return {
      value: null,
      error: null,
    };
  }

  const parsed = Number(clean);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return {
      value: null,
      error: `${label} must be a whole number of 0 or more.`,
    };
  }

  return {
    value: parsed,
    error: null,
  };
};

export const validateOnboardingStep = (
  step: number,
  player: any,
  privateInfo: any,
  video: string,
): string | null => {
  if (step === 0) {
    if (!String(player?.first_name || '').trim()) {
      return 'Add your first name to continue.';
    }

    if (!String(player?.last_name || '').trim()) {
      return 'Add your last name to continue.';
    }

    if (player?.date_of_birth && isFutureDate(player.date_of_birth)) {
      return 'Date of birth cannot be in the future.';
    }

    if (
      privateInfo?.phone &&
      String(privateInfo.phone).replace(/\D/g, '').length < 6
    ) {
      return 'Check the phone number. It looks too short.';
    }
  }

  if (step === 1) {
    if (!String(player?.primary_position || '').trim()) {
      return 'Add your primary position to continue.';
    }

    if (!String(player?.preferred_foot || '').trim()) {
      return 'Select your preferred foot to continue.';
    }

    if (
      player?.height_cm !== null &&
      player?.height_cm !== undefined &&
      String(player.height_cm).trim()
    ) {
      const height = Number(player.height_cm);

      if (!Number.isFinite(height) || height < 140 || height > 230) {
        return 'Height must be between 140 cm and 230 cm.';
      }
    }

    if (
      player?.contract_expiry &&
      Number.isNaN(
        new Date(`${player.contract_expiry}T00:00:00`).getTime(),
      )
    ) {
      return 'Check the contract expiry date.';
    }
  }

  if (step === 3) {
    const urls = [
      ['Transfermarkt', player?.transfermarkt_url],
      ['Wyscout', player?.wyscout_url],
      ['Stats profile', player?.stats_url],
      ['Video', video],
    ] as const;

    const bad = urls.find(
      ([, value]) => value?.trim() && !isHttpUrl(value),
    );

    if (bad) {
      return `${bad[0]} must be a valid http or https link.`;
    }
  }

  return null;
};
