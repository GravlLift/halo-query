import { NextRequest, NextResponse } from 'next/server';
import { getBlackListEntry } from './blacklist';
import { defaultClient } from '../../../../../lib/application-insights/server';

// Required for application insights
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const requestBody = await request.text();
  const response = await fetch(
    'https://xsts.auth.xboxlive.com/xsts/authorize',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-xbl-contract-version': '1',
      },
      body: requestBody,
    }
  );
  if (response.ok) {
    const responseBody: {
      DisplayClaims: {
        xui: [
          Partial<{
            gtg: string;
            xid: string;
            agg: string;
            usr: string;
            utr: string;
            prv: string;
          }>
        ];
      };
    } = await response.json();

    const xuid: string | undefined = responseBody.DisplayClaims.xui[0].xid;
    if (xuid) {
      try {
        const entry = await getBlackListEntry(xuid);
        if (entry) {
          defaultClient.trackEvent({
            name: 'UserBlacklisted',
            properties: {
              RelyingParty: JSON.parse(requestBody).RelyingParty,
              DisplayClaims: responseBody.DisplayClaims,
              Gamertag: responseBody.DisplayClaims.xui[0].gtg,
            },
          });
          return NextResponse.json(
            { type: 'blacklist', reason: entry.reason },
            { status: 403 }
          );
        }
      } catch (err) {
        if (err instanceof Error) {
          defaultClient.trackException({ exception: err });
        }
      }
    }
    return NextResponse.json(responseBody, response);
  }

  return response;
}
