import { Code, Link, Text, List } from '@chakra-ui/react';
import NextLink from 'next/link';

export default function HcsWorlds2024() {
  return (
    <>
      <Text>
        The 2024 HCS season is coming to close this weekend in Seattle. For
        those interested in following along via Halo Query, I&apos;d like to
        publicize a little known feature of the site: Did you know that with a
        bit of url manipulation you can query entire teams and find a history of
        all the games they&apos;ve played together?
      </Text>
      <Text mt={2}>
        Here&apos;s links for every Worlds team that this hack works for:
      </Text>
      <List.Root as="ul">
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=Lqgend,StelluR,Bound,The Eco Smith">
              Spacestation Gaming
            </NextLink>
          </Link>
        </List.Item>
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=OpTicFormaLMatt,deadzZzone,Luciid TW,Trippy">
              Optic Gaming
            </NextLink>
          </Link>
        </List.Item>
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=CyKul,sR MentaL,Suppressecl,Mr Soul Snipe">
              Rebellion
            </NextLink>
          </Link>
        </List.Item>
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=SnakeBiteFPS,RoyaI 2,Renegade JW,iTz So Frosty">
              Faze Clan
            </NextLink>
          </Link>
        </List.Item>
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=RyaNoob Nerds,BreakingShot,Rayne 1g,Huss">
              Complexity
            </NextLink>
          </Link>
        </List.Item>
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=Gilkey,Tapping Buttons,Barcode AK,aPG">
              Native Gaming
            </NextLink>
          </Link>
        </List.Item>
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=Glory GGz,r Sica,SNlPEDRONE,SLGzz">
              Quadrant
            </NextLink>
          </Link>
        </List.Item>
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=Jimbo,WuTum,zMightys,TchiK SD">
              Into The Breach
            </NextLink>
          </Link>
        </List.Item>
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=Falcated,bubu dubu,Preecisionn,LethuL">
              Sentinels
            </NextLink>
          </Link>
        </List.Item>
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=Rammyy,Haines,Commmon,Yakzn">
              Team Lethal Fox
            </NextLink>
          </Link>
        </List.Item>
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=Acid XM,Drift RM,Noblc,Leuor">
              Akave Esports
            </NextLink>
          </Link>
        </List.Item>
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=Piggy EX,Envore,Ezho,Descendant">
              Ascend Baseline
            </NextLink>
          </Link>
        </List.Item>
        <List.Item>
          <Link asChild>
            <NextLink href="/matches?gamertag=PIasmaT1,Scoobmeistr,Swayz,FURY Wryce">
              Mindfreak
            </NextLink>
          </Link>
        </List.Item>
      </List.Root>
      <Text mt={2}>
        You can do this for almost any* team, not just the ones at Worlds
        (including your own 4 stack or duo). Just plug the gamertags that make
        up the team into the <Code>gamertag</Code> parameter of matches page
        URL, separated by commas. For example, that Optic Gaming link above
        looks like so:
      </Text>
      <Code wordBreak="break-all">
        https://haloquery.com/matches?gamertag=OpTicFormaLMatt,deadzZzone,Luciid
        TW,Trippy
      </Code>
      <Text mt={2}>
        So uh, what gives GravlLift, how could you forget about Cloud9, Dark
        Inside, and Pure? Well... there&apos;s a catch to this trick: the first
        gamertag in the list needs to have their privacy settings set such that
        their games are searchable, and unfortunately, at the time of writing
        this, all of the players on those teams... don&apos;t. You can still get
        to a match that they played against one of the other teams, you just
        can&apos;t list their own full custom game histories.
      </Text>
      <Text>
        Anyways, I&apos;m off to Seattle. If you see a pair of dudes rocking old
        school Instinct/Final Boss hockey jerseys, that&apos;s my brother and I.
        Feel free to say hello, I love talking to the people who use the site!
      </Text>
    </>
  );
}
