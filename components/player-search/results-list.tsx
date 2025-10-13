import { List } from '@chakra-ui/react';
import PlayerSearchResult from './player-search-result';
import { useEffect, useState } from 'react';

export const ResultsList = ({
  inputRef,
  results,
  onResultClick,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  results: {
    xuid: string;
    gamertag: string;
    displayPicRaw: string | undefined;
  }[];
  onResultClick?: (gamertag: string) => void;
}) => {
  const [inputFocused, setInputFocused] = useState(false);
  const [listActive, setListActive] = useState(false);

  useEffect(() => {
    const inputElem = inputRef.current;
    if (!inputElem) return;
    const onFocus = () => setInputFocused(true);
    const onBlur = () => setInputFocused(false);
    inputElem.addEventListener('focus', onFocus);
    inputElem.addEventListener('blur', onBlur);
    return () => {
      inputElem.removeEventListener('focus', onFocus);
      inputElem.removeEventListener('blur', onBlur);
    };
  }, [inputRef]);

  const shouldShow = (inputFocused || listActive) && results.length > 0;

  return shouldShow ? (
    <List.Root
      gap={3}
      padding={3}
      position={'absolute'}
      backgroundColor={'gray.500'}
      flexGrow={1}
      width="100%"
      zIndex={10000}
      // Keep list open while pointer or focus is within the list
      onMouseEnter={() => setListActive(true)}
      onMouseLeave={() => setListActive(false)}
      onFocus={() => setListActive(true)}
      onBlur={(e) => {
        const related = e.relatedTarget;
        if (!e.currentTarget.contains(related)) {
          setListActive(false);
        }
      }}
      // In case the user clicks directly without hovering first
      onMouseDownCapture={() => setListActive(true)}
    >
      {results.map((user) => (
        <List.Item key={user.xuid}>
          <PlayerSearchResult
            user={user}
            onResultClick={() => {
              onResultClick?.(user.gamertag);
              setListActive(false);
            }}
          />
        </List.Item>
      ))}
    </List.Root>
  ) : null;
};
