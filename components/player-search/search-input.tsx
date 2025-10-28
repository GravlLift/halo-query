import { IconButton, Input, InputGroup } from '@chakra-ui/react';
import { SearchIcon, XIcon } from 'lucide-react';
import { RefObject } from 'react';

export default function SearchInput({
  inputRef,
  value,
  setInputValue,
}: {
  inputRef: RefObject<HTMLInputElement>;
  value: string;
  setInputValue: (value: string) => void;
}) {
  return (
    <InputGroup
      startElement={<SearchIcon />}
      endElement={
        value && (
          <IconButton
            asChild
            variant={'plain'}
            aria-label="Clear"
            onClick={() => {
              setInputValue('');
              inputRef.current?.focus();
            }}
          >
            <XIcon />
          </IconButton>
        )
      }
    >
      <Input
        ref={inputRef}
        type="text"
        name="gamertag"
        placeholder="Search for a player..."
        onChange={(e) => {
          setInputValue(e.target.value);
        }}
        value={value}
        autoComplete="off"
      />
    </InputGroup>
  );
}
