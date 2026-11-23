'use client';

import { Box, Button, Flex, Heading, Link, Text } from '@chakra-ui/react';
import { Check, FileJson, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  MAX_BATCH_FILES,
  MAX_FILE_BYTES,
  validateExport,
  validateFilename,
} from '../../lib/mmr-research/uploads';

type UploadStatus =
  | 'validating'
  | 'ready'
  | 'invalid'
  | 'uploading'
  | 'uploaded'
  | 'skipped'
  | 'failed';
type QueuedFile = {
  id: number;
  file: File;
  status: UploadStatus;
  message?: string;
};

export default function MmrResearchPage() {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const locked = useRef(false);

  function update(id: number, changes: Partial<QueuedFile>) {
    setFiles((current) =>
      current.map((file) => (file.id === id ? { ...file, ...changes } : file)),
    );
  }

  async function addFiles(selected: File[]) {
    if (locked.current || selected.length === 0) return;
    if (files.length + selected.length > MAX_BATCH_FILES) {
      setNotice(`A queue can contain up to ${MAX_BATCH_FILES} files.`);
      return;
    }
    locked.current = true;
    setBusy(true);
    setNotice('');
    const added: QueuedFile[] = selected.map((file) => ({
      id: nextId.current++,
      file,
      status: 'validating',
    }));
    setFiles((current) => [...current, ...added]);
    try {
      for (const entry of added) {
        try {
          validateFilename(entry.file.name);
          if (entry.file.size > MAX_FILE_BYTES)
            throw new Error('File exceeds 1 MB.');
          validateExport(await entry.file.text());
          update(entry.id, { status: 'ready' });
        } catch (error) {
          update(entry.id, {
            status: 'invalid',
            message:
              error instanceof Error ? error.message : 'Could not read file.',
          });
        }
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function uploadFiles() {
    if (locked.current || !consent) return;
    locked.current = true;
    setBusy(true);
    setNotice('');
    try {
      for (const entry of files.filter(
        (file) => file.status === 'ready' || file.status === 'failed',
      )) {
        update(entry.id, { status: 'uploading', message: undefined });
        try {
          const response = await fetch('/api/mmr-research', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-upload-filename': entry.file.name,
              'x-research-consent': 'true',
            },
            body: entry.file,
          });
          const result: unknown = await response.json();
          if (typeof result !== 'object' || result === null)
            throw new Error('Unexpected server response.');
          if (!response.ok)
            throw new Error(
              'error' in result && typeof result.error === 'string'
                ? result.error
                : 'Upload failed.',
            );
          if (
            !('status' in result) ||
            (result.status !== 'uploaded' && result.status !== 'skipped') ||
            !('filename' in result) ||
            typeof result.filename !== 'string'
          ) {
            throw new Error('Unexpected server response.');
          }
          update(entry.id, {
            status: result.status,
            message:
              result.status === 'skipped'
                ? `Already stored as ${result.filename}`
                : `Stored as ${result.filename}`,
          });
        } catch (error) {
          update(entry.id, {
            status: 'failed',
            message: error instanceof Error ? error.message : 'Upload failed.',
          });
        }
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const pending = files.filter(
    (file) => file.status === 'ready' || file.status === 'failed',
  ).length;
  const completed = files.filter(
    (file) => file.status === 'uploaded' || file.status === 'skipped',
  ).length;

  return (
    <Box maxW="1000px" mx="auto" px={{ base: 4, md: 6 }} py={8} width="100%">
      <Flex justify="space-between" align="center" gap={4} wrap="wrap" mb={6}>
        <Heading size="2xl">MMR Research</Heading>
        <Link
          href="https://github.com/OpenSpartan/mmr"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenSpartan / mmr
        </Link>
      </Flex>
      <Box mb={6}>
        <Text>
          Press "o" while running the OpenSpartan mmr tool to open the folder
          containing your match data.
        </Text>
      </Box>
      <Box
        borderWidth="1px"
        borderStyle="dashed"
        borderColor={dragging ? 'cyan.500' : 'border'}
        borderRadius="8px"
        p={{ base: 6, md: 10 }}
        bg={dragging ? 'bg.muted' : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <Flex direction="column" align="center" gap={4}>
          <FileJson size={32} aria-hidden="true" />
          <Heading size="lg">Match Exports</Heading>
          <Text color="fg.muted" fontSize="sm">
            JSON · 1 MB per file · 100 files per batch
          </Text>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            multiple
            hidden
            disabled={busy}
            onChange={(event) => {
              void addFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <Button
            onClick={() => input.current?.click()}
            disabled={busy}
            variant="outline"
          >
            <Upload /> Select JSON Files
          </Button>
        </Flex>
      </Box>
      {notice && (
        <Text role="alert" mt={4} color="fg.error">
          {notice}
        </Text>
      )}
      <Box mt={6}>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(event) => setConsent(event.target.checked)}
            style={{ marginTop: '5px', flexShrink: 0 }}
          />
          <Text fontSize="sm">
            I agree to contribute these exports, including player gamertags,
            Xbox user IDs, and rating data, to Halo Query research.
          </Text>
        </label>
      </Box>
      <Flex
        mt={6}
        mb={4}
        justify="space-between"
        align="center"
        gap={3}
        wrap="wrap"
      >
        <Text fontSize="sm" role="status" aria-live="polite">
          {completed} / {files.length} complete
        </Text>
        <Flex gap={2}>
          <Button
            title="Clear queue"
            aria-label="Clear queue"
            disabled={busy || files.length === 0}
            onClick={() => {
              setFiles([]);
              setNotice('');
            }}
          >
            <Trash2 />
          </Button>
          <Button
            colorPalette="cyan"
            disabled={busy || !consent || pending === 0}
            onClick={() => void uploadFiles()}
          >
            {files.some((file) => file.status === 'failed') ? (
              <RotateCcw />
            ) : (
              <Upload />
            )}
            {busy
              ? 'Processing'
              : `Upload ${pending} ${pending === 1 ? 'File' : 'Files'}`}
          </Button>
        </Flex>
      </Flex>
      <Box aria-live="polite">
        {files.map((entry) => (
          <Flex
            key={entry.id}
            borderTopWidth="1px"
            py={3}
            gap={3}
            align="flex-start"
          >
            <Box pt={1} flexShrink={0}>
              {entry.status === 'uploaded' || entry.status === 'skipped' ? (
                <Check aria-label="Complete" />
              ) : (
                <FileJson aria-hidden="true" />
              )}
            </Box>
            <Box minW={0} flex={1}>
              <Text fontSize="sm" overflowWrap="anywhere">
                {entry.file.name}
              </Text>
              <Text
                fontSize="xs"
                color={
                  entry.status === 'invalid' || entry.status === 'failed'
                    ? 'fg.error'
                    : 'fg.muted'
                }
                overflowWrap="anywhere"
              >
                {entry.message ?? `${Math.ceil(entry.file.size / 1024)} KB`}
              </Text>
            </Box>
            <Text
              fontSize="xs"
              textTransform="capitalize"
              pt={1}
              flexShrink={0}
            >
              {entry.status}
            </Text>
            <Button
              size="xs"
              title={`Remove ${entry.file.name}`}
              aria-label={`Remove ${entry.file.name}`}
              disabled={busy}
              onClick={() =>
                setFiles((current) =>
                  current.filter((file) => file.id !== entry.id),
                )
              }
            >
              <Trash2 />
            </Button>
          </Flex>
        ))}
      </Box>
    </Box>
  );
}
