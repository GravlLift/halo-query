import '@gravllift/utilities';
import type { JSX } from 'react';
import Assault from './articles/assault';
import Cu29PatchRolledOut from './articles/cu29-patch-rolled-out';
import DeathCounterfactualsAreBonkers from './articles/death-counterfactuals-are-bonkers';
import DiscordServer from './articles/discord-server';
import EsrAverageVsEsr10 from './articles/esr-average-vs-esr-ten';
import GameVariantVsGameVariantCategories from './articles/game-variant-vs-game-variant-categories';
import GoLive from './articles/go-live';
import HcsWorlds2024 from './articles/hcs-worlds-2024';
import Leaderboards from './articles/leaderboards';
import PsrRemoval from './articles/psr-removal';
import QuerySavingSharing from './articles/query-saving-sharing';
import Post from './post';

const articles: Record<
  string,
  {
    date: string;
    title: string;
    Component: () => JSX.Element;
  }
> = {
  assault: {
    date: '2025-02-04',
    title: 'Assault Released',
    Component: Assault,
  },
  'hcs-worlds-2024': {
    date: '2024-10-02',
    title: 'HCS World Championship 2024',
    Component: HcsWorlds2024,
  },
  leaderboards: {
    date: '2024-06-04',
    title: 'Leaderboards',
    Component: Leaderboards,
  },
  'query-saving-sharing': {
    date: '2024-05-31',
    title: 'Query Saving and Sharing',
    Component: QuerySavingSharing,
  },
  'psr-removal': {
    date: '2024-04-24',
    title: 'The Death of PSR',
    Component: PsrRemoval,
  },
  'game-variant-vs-game-variant-categories': {
    date: '2024-03-13',
    title: 'Game Variant vs Game Variant Categories',
    Component: GameVariantVsGameVariantCategories,
  },
  'esr-average-vs-esr-ten': {
    date: '2024-03-07',
    title: 'ESR Average vs ESR-10',
    Component: EsrAverageVsEsr10,
  },
  'cu29-patch-rolled-out': {
    date: '2024-02-12',
    title: 'CU29 Patch Has Been Rolled Out',
    Component: Cu29PatchRolledOut,
  },
  'discord-server': {
    date: '2024-02-01',
    title: 'Discord Server',
    Component: DiscordServer,
  },
  'death-counterfactuals-are-bonkers': {
    date: '2024-01-30',
    title: 'Death Counterfactuals are Bonkers',
    Component: DeathCounterfactualsAreBonkers,
  },
  'go-live': {
    date: '2024-01-24',
    title: "We're Live!",
    Component: GoLive,
  },
};

export const postEntries = Object.entries(articles).sortByDesc(
  ([, { date }]) => date
);
export const postMap = postEntries.reduce(
  (acc, [id, { date, title, Component }]) => {
    acc[id] = () => (
      <Post id={id} title={title} date={date}>
        <Component />
      </Post>
    );
    return acc;
  },
  {} as Record<string, () => JSX.Element>
);

export const latest3ArticleIds = postEntries.slice(0, 3).map(([id]) => id);
