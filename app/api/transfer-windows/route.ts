import {FIFA_TRANSFER_WINDOWS, parseFifaTransferWindows} from '@/lib/fifa-transfer-windows';

export async function GET() {
  try {
    const response = await fetch(FIFA_TRANSFER_WINDOWS, {
      headers: {Accept: 'text/html'},
      signal: AbortSignal.timeout(6500),
      next: {revalidate: 21600},
    });
    if (!response.ok) throw new Error('FIFA source returned an error.');
    return Response.json({
      associations: parseFifaTransferWindows(await response.text()),
      source: FIFA_TRANSFER_WINDOWS,
    }, {headers: {'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400'}});
  } catch {
    return Response.json({error: 'Transfer windows could not load from FIFA.'}, {status: 502});
  }
}
