import { NextRequest, NextResponse } from 'next/server';
import catalogue from '@/data/openfootball-clubs.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type CatalogueClub = {id: string; name: string; country: string; league: string | null; aliases: string[]};

const normalise = (value: string) => value
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, ' ').trim();

function score(club: CatalogueClub, query: string): number {
  const name = normalise(club.name);
  const aliases = club.aliases.map(normalise);
  const fields = [name, ...aliases];
  if (fields.includes(query)) return 100;
  if (fields.some(value => value.startsWith(query))) return 80;
  if (fields.some(value => value.split(' ').some(word => word.startsWith(query)))) return 65;
  if (fields.some(value => value.includes(query))) return 45;
  if (normalise(club.country).includes(query)) return 15;
  return 0;
}

export function searchClubCatalogue(
  rawQuery: string,
  limit = 25,
): {items: CatalogueClub[]; total: number} {
  const query = normalise(rawQuery.slice(0, 90));
  if (query.length < 2) return {items: [], total: 0};
  const hits = (catalogue.clubs as CatalogueClub[])
    .map(club => ({club, relevance: score(club, query)}))
    .filter(hit => hit.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance
      || a.club.name.localeCompare(b.club.name)
      || a.club.country.localeCompare(b.club.country));
  return {items: hits.slice(0, Math.max(1, Math.min(50, limit))).map(hit => hit.club), total: hits.length};
}

export async function GET(request: NextRequest) {
  const results = searchClubCatalogue(request.nextUrl.searchParams.get('q') || '');
  return NextResponse.json({
    ...results,
    source: 'OpenFootball',
    licence: 'CC0-1.0',
    sourceUrl: catalogue.meta.source_url,
    sourceRevision: catalogue.meta.source_revision,
  }, {
    headers: {'Cache-Control': 'public, max-age=120, stale-while-revalidate=600'},
  });
}
