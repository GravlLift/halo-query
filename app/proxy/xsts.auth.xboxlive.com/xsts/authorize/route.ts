import { NextRequest, NextResponse } from 'next/server';
import blackList from '../../../../../lib/black-list.json' with { type: 'json' };

function xuidIsBlacklisted(xuid: string): xuid is keyof typeof blackList {
  return xuid in blackList;
}

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
    if (xuid && xuidIsBlacklisted(xuid)) {
      if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { defaultClient } = await import(
          '../../../../../lib/application-insights/server'
        );
        defaultClient.trackEvent({
          name: 'UserBlacklisted',
          properties: {
            RelyingParty: JSON.parse(requestBody).RelyingParty,
            DisplayClaims: responseBody.DisplayClaims,
            Gamertag: responseBody.DisplayClaims.xui[0].gtg,
          },
        });
      }
      return NextResponse.json(
        { type: 'blacklist', reason: blackList[xuid].reason },
        { status: 403 }
      );
    }
    return NextResponse.json(responseBody, response);
  }

  return response;
}
