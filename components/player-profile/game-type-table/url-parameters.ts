import { ColumnName } from '../../columns/base-columns';

export function urlParams(
  focusPlayer: string,
  mapName: string | null,
  gameVariantName: string | null,
  playlistName: string,
) {
  const filter: {
    and: {
      '==': [
        {
          var: ColumnName;
        },
        string,
      ];
    }[];
  } = {
    and: [
      {
        '==': [
          {
            var: 'Playlist',
          },
          playlistName,
        ],
      },
    ],
  };
  if (mapName) {
    filter.and.push({
      '==': [
        {
          var: 'Map',
        },
        mapName,
      ],
    });
  }
  if (gameVariantName) {
    filter.and.push({
      '==': [
        {
          var: 'Game Variant',
        },
        gameVariantName,
      ],
    });
  }

  return new URLSearchParams({
    gamertag: focusPlayer,
    filters: JSON.stringify(filter),
  });
}
