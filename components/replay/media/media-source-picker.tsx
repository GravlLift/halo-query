import {
  Box,
  Button,
  FileUpload,
  Flex,
  Grid,
  Icon,
  Input,
  Separator,
  Text,
} from '@chakra-ui/react';
import { Link, Upload } from 'lucide-react';
import { useState } from 'react';
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from './file-media-item';
import { parseTwitchVideoUrl, type TwitchVideo } from './twitch';

const ACCEPTED_TYPES = [
  'video/*',
  'audio/*',
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
];

export type MediaSource =
  | { kind: 'file'; file: File }
  | { kind: 'twitch'; video: TwitchVideo };

export const mediaSourceLabel = (source: MediaSource) =>
  source.kind === 'file' ? source.file.name : `Twitch ${source.video.id}`;

/** Empty media slot: drop a local file or paste a Twitch VOD URL. */
export function MediaSourcePicker({
  onSelect,
}: {
  onSelect: (source: MediaSource) => void;
}) {
  const [twitchUrl, setTwitchUrl] = useState('');
  const [twitchError, setTwitchError] = useState<string>();

  const submitTwitch = () => {
    const video = parseTwitchVideoUrl(twitchUrl);
    if (!video) {
      setTwitchError('Enter a Twitch VOD link like twitch.tv/videos/123456.');
      return;
    }
    onSelect({ kind: 'twitch', video });
  };

  return (
    <Grid templateColumns="minmax(0, 1fr) auto minmax(0, 1fr)" gap={2}>
      <FileUpload.Root
        maxFiles={1}
        accept={ACCEPTED_TYPES}
        alignItems="stretch"
        minW={0}
        onFileChange={({ acceptedFiles }) => {
          const file = acceptedFiles[0];
          if (file) onSelect({ kind: 'file', file });
        }}
      >
        <FileUpload.HiddenInput />
        <FileUpload.Dropzone flex={1} minH="120px" px={3}>
          <Icon size="md" color="fg.muted">
            <Upload />
          </Icon>
          <FileUpload.DropzoneContent>
            <Box>Drop video or audio here</Box>
            <Box color="fg.muted" fontSize="xs">
              Halo Query will attempt to sync the media to the replay timeline
            </Box>
          </FileUpload.DropzoneContent>
        </FileUpload.Dropzone>
      </FileUpload.Root>
      <Separator orientation="vertical" h="full" />
      <Flex
        as="form"
        minW={0}
        minH="120px"
        direction="column"
        align="center"
        justify="center"
        gap={2}
        p={3}
        borderWidth="1px"
        borderStyle="dashed"
        borderColor="border.emphasized"
        borderRadius="l2"
        onSubmit={(e) => {
          e.preventDefault();
          submitTwitch();
        }}
      >
        <Icon size="md" color="fg.muted">
          <Link />
        </Icon>
        <Text>Paste a Twitch VOD URL</Text>
        <Flex gap={2} w="full">
          <Input
            size="xs"
            minW={0}
            placeholder="twitch.tv/videos/..."
            aria-label="Twitch VOD URL"
            value={twitchUrl}
            onChange={(e) => {
              setTwitchUrl(e.currentTarget.value);
              setTwitchError(undefined);
            }}
          />
        </Flex>
        <Button type="submit" disabled={!twitchUrl.trim()}>
          Add
        </Button>
        {twitchError && (
          <Text fontSize="xs" color="red.500">
            {twitchError}
          </Text>
        )}
      </Flex>
    </Grid>
  );
}
