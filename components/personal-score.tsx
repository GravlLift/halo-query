'use client';
import { CircleHelp } from 'lucide-react';
import { Box, Flex, Link, HoverCard, Table, Portal } from '@chakra-ui/react';
import { Stats } from 'halo-infinite-api';
import NextLink from 'next/link';

import { ExternalLink } from 'lucide-react';

const personalScoreMap: Record<number, string> = {
  1024030246: 'Kill',
  638246808: 'Kill Assist',
  249491819: 'Suicide',
  911992497: 'Betrayal',
  152718958: 'Mark Assist',
  1267013266: 'Sensor Assist',
  3243589708: 'Destroyed Wraith',
  3472794399: 'Destroyed Chopper',
  4254982885: 'Destroyed Ghost',
  1416267372: 'Destroyed Mongoose',
  1661163286: 'Destroyed Razorback',
  2106274556: 'Destroyed Wasp',
  2008690931: 'Destroyed Rocket Hog',
  3107879375: 'Destroyed Warthog',
  3454330054: 'Destroyed Scorpion',
  2107631925: 'Destroyed Gungoose',
  4294405210: 'Hijacked Rocket Hog',
  1059880024: 'Hijacked Brute Chopper',
  1834653062: 'Hijacked Warthog',
  2848565291: 'Hijacked Razorback',
  4186766732: 'Hijacked Gungoose',
  674964649: 'Hijacked Wasp',
  2191528998: 'Hijacked Mongoose',
  1614285349: 'Hijacked Ghost',
  597066859: 'Destroyed Banshee',
  3150095814: 'Hijacked Banshee',
  522435689: 'Enemies Looted',
  665081740: 'Hacked Terminal',

  //#region CTF
  601966503: 'Flag Captured',
  555570945: 'Capture Assist',
  3002710045: 'Flag Stolen',
  2387185397: 'Flag Taken',
  316828380: 'Runner Stopped',
  22113181: 'Flag Returned',
  //#endregion

  //#region King of the Hill
  340198991: 'Hill Control',
  1032565232: 'Hill Scored',
  //#endregion

  //#region Oddball
  204144695: 'Ball Taken',
  454168309: 'Ball Control',
  746397417: 'Carrier Stopped',
  ///#endregion

  //#region Total Control
  4026987576: 'Zone Captured',
  //#endregion

  //#region Strongholds
  3507884073: 'Stronghold Captured',
  709346128: 'Stronghold Secured',
  //#endregion
};

function getPersonalScoreName(nameId: number) {
  const maybeValue = personalScoreMap[nameId];
  if (maybeValue) {
    return maybeValue;
  } else {
    return `Unknown (${nameId})`;
  }
}

export default function PersonalScore({
  score,
  personalScores,
}: {
  score: number;
  personalScores: Stats['CoreStats']['PersonalScores'];
}) {
  return (
    <Flex justifyContent="flex-end">
      <Box>{score}</Box>
      <Box ml={1} fontWeight="initial">
        <HoverCard.Root>
          <HoverCard.Trigger>
            <CircleHelp />
          </HoverCard.Trigger>
          <Portal>
            <HoverCard.Positioner>
              <HoverCard.Content>
                <HoverCard.Arrow />
                <Table.Root size="sm">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeader>Name</Table.ColumnHeader>
                      <Table.ColumnHeader textAlign="end">
                        Count
                      </Table.ColumnHeader>
                      <Table.ColumnHeader textAlign="end">
                        Score
                      </Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {personalScores
                      ?.sortByDesc((s) => s.TotalPersonalScoreAwarded)
                      .map((score) => (
                        <Table.Row key={score.NameId}>
                          <Table.Cell>
                            {getPersonalScoreName(score.NameId)}
                          </Table.Cell>
                          <Table.Cell textAlign="end">{score.Count}</Table.Cell>
                          <Table.Cell textAlign="end">
                            {score.TotalPersonalScoreAwarded}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                  </Table.Body>
                </Table.Root>
                {personalScores.some((s) => !personalScoreMap[s.NameId]) ? (
                  <Box fontSize="small">
                    Know what some of these unknowns are? Let me know{' '}
                    <Link asChild>
                      <NextLink
                        href="https://discord.gg/XuZsWZ2h5p"
                        target="_blank"
                      >
                        on Discord <ExternalLink />
                      </NextLink>
                    </Link>
                    and I&apos;ll add them in.
                  </Box>
                ) : null}
              </HoverCard.Content>
            </HoverCard.Positioner>
          </Portal>
        </HoverCard.Root>
      </Box>
    </Flex>
  );
}
