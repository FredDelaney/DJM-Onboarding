export type ReDreamShare = {
  title: string;
  text: string;
  url: string;
  content: string;
  hasContent: boolean;
};

const clean = (
  value: string | null | undefined,
  maxLength: number,
) =>
  String(value || '')
    .replaceAll('\u0000', '')
    .trim()
    .slice(0, maxLength);

const cleanHttpUrl = (
  value: string | null | undefined,
) => {
  const candidate = clean(value, 2048);
  if (!candidate) return '';

  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== 'https:' &&
      parsed.protocol !== 'http:'
    ) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
};

export function readReDreamShare(
  params: Pick<URLSearchParams, 'get'>,
): ReDreamShare {
  const title = clean(
    params.get('share_title'),
    240,
  );
  const text = clean(
    params.get('share_text'),
    5000,
  );
  const url = cleanHttpUrl(
    params.get('share_url'),
  );

  const parts: string[] = [];

  if (title) parts.push(title);

  if (
    text &&
    text !== title
  ) {
    parts.push(text);
  }

  if (
    url &&
    !parts.some((part) =>
      part.includes(url),
    )
  ) {
    parts.push(url);
  }

  const content = parts
    .join('\n\n')
    .slice(0, 7000);

  return {
    title,
    text,
    url,
    content,
    hasContent:
      content.length > 0,
  };
}
