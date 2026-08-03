'use client';
import {
  Box,
  Button,
  Dialog,
  Editable,
  Field,
  Flex,
  FormatNumber,
  IconButton,
  Input,
  Link,
  SkeletonText,
  Spacer,
  Table,
  Text,
  useEditable,
} from '@chakra-ui/react';
import { getPlayerEsrA } from '@gravllift/halo-helpers';
import { DownloadIcon, RefreshCw, Trash, UploadIcon } from 'lucide-react';
import { DateTime } from 'luxon';
import NextLink from 'next/link';
import { useRef, useState } from 'react';
import { LuCheck, LuPencilLine, LuX } from 'react-icons/lu';
import { useLeaderboard } from '../../components/leaderboard-provider/leaderboard-context';
import { useHaloCaches } from '../../lib/contexts/halo-caches-context';
import { rankedArenaPlaylistAssetId } from '../../lib/ranked-playlist-ids';

type UserSkillInfo = {
  gamertag: string;
  asOfDate: DateTime | null;
  xuid?: string;
  esrA?: number | null;
  error?: Error;
};

export default function BulkEsrPage() {
  const haloCaches = useHaloCaches();
  const leaderboard = useLeaderboard();
  const abortControllerMap = useRef(new Map<string, AbortController>());
  const [asOfDate, setAsOfDate] = useState<DateTime | null>(null);
  const [userSkillInfo, setUserSkillInfo] = useState<UserSkillInfo[]>([]);
  const [isUploadCsvWarningOpen, setIsUploadCsvWarningOpen] = useState(false);
  const editable = useEditable({
    defaultValue: 'Add Gamertag',
  });

  const uploadCsv = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      const file = target.files?.[0];
      if (file) {
        const text = await file.text();

        const lines = text.split('\n');
        const headerRow = lines[0];
        let gamertagColumnIndex = -1;
        if (headerRow) {
          const headers = headerRow.split(',');
          gamertagColumnIndex = headers.findIndex(
            (header) => header.trim().toLowerCase() === 'gamertag',
          );
        }

        for (
          let i = gamertagColumnIndex === -1 ? 0 : 1;
          i < lines.length;
          i++
        ) {
          const line = lines[i];
          const cells = line.split(',');
          handleAddGamertag(
            cells[gamertagColumnIndex === -1 ? 0 : gamertagColumnIndex],
            undefined,
          );
        }
      }
    };
    input.click();
  };

  const handleAddGamertag = async (
    newGamertag: string,
    existingGamertag: string | undefined,
  ) => {
    let trimmedGamertag = newGamertag.trim();
    if (!trimmedGamertag) {
      return;
    }

    let existingUser = userSkillInfo.find(
      (user) =>
        user.gamertag.toLowerCase() === existingGamertag?.toLowerCase() ||
        user.gamertag.toLowerCase() === trimmedGamertag.toLowerCase(),
    );

    if (!existingUser) {
      existingUser = {
        gamertag: trimmedGamertag,
        asOfDate: asOfDate,
      };
      setUserSkillInfo((prev) => [...prev, existingUser!]);
    } else {
      if (
        existingUser.esrA != null &&
        existingUser.asOfDate?.isValid &&
        asOfDate?.isValid &&
        +existingUser.asOfDate === +asOfDate
      ) {
        return;
      }
      existingUser.gamertag = trimmedGamertag;
      existingUser.esrA = undefined;
      existingUser.error = undefined;
      setUserSkillInfo((prev) => {
        const index = prev.findIndex(
          (user) =>
            user.gamertag.toLowerCase() === existingGamertag?.toLowerCase() ||
            user.gamertag.toLowerCase() === trimmedGamertag.toLowerCase(),
        );
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = existingUser!;
          return updated;
        } else {
          return prev;
        }
      });
    }

    let abortController = abortControllerMap.current.get(trimmedGamertag);
    if (abortController) {
      abortController.abort();
      abortControllerMap.current.delete(trimmedGamertag);
    }
    abortController = new AbortController();
    abortControllerMap.current.set(trimmedGamertag, abortController);

    try {
      const [{ xuid, gamertag }, playlistVersionAsset] = await Promise.all([
        haloCaches.fullUsersCache.get(trimmedGamertag, abortController.signal),
        haloCaches.playlistCache
          .get(rankedArenaPlaylistAssetId, abortController.signal)
          .then((playlist) =>
            haloCaches.playlistVersionCache.get(
              {
                AssetId: rankedArenaPlaylistAssetId,
                VersionId: playlist.UgcPlaylistVersion,
              },
              abortController.signal,
            ),
          ),
      ]);
      existingUser.gamertag = gamertag;
      existingUser.esrA = await getPlayerEsrA(
        leaderboard,
        playlistVersionAsset,
        xuid,
        asOfDate ?? DateTime.now(),
        abortController.signal,
        haloCaches,
      );
    } catch (err) {
      if (err instanceof Error) {
        existingUser.error = err;
      } else {
        throw err;
      }
    }

    setUserSkillInfo((prev) => {
      // Preserve existing order
      const index = prev.findIndex(
        (user) =>
          user.gamertag.toLowerCase() === trimmedGamertag.toLowerCase() ||
          user.gamertag.toLowerCase() === existingGamertag?.toLowerCase(),
      );
      if (index !== -1) {
        const updated = [...prev];
        updated[index] = existingUser;
        return updated;
      } else {
        return prev;
      }
    });
  };

  return (
    <Flex justifyContent="center" mt={2}>
      <Box maxW="1000px" width="100%" overflowX="auto">
        <Dialog.Root open={isUploadCsvWarningOpen} placement="center">
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Upload CSV</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Text>
                  Select a CSV file with the gamertags you&apos;d like to check.
                  This can either be a list of gamertags with no header cell, or
                  a list with a header row containing a "Gamertag" column.
                </Text>
                <Text mt={2}>
                  Fair warning, this is a slow process. If you have many
                  gamertags to query, expect a sizeable wait.
                </Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Button
                  variant="outline"
                  onClick={() => setIsUploadCsvWarningOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setIsUploadCsvWarningOpen(false);
                    uploadCsv();
                  }}
                >
                  Choose .csv File
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Dialog.Root>
        <Flex p={2}>
          <Spacer />
          <Box>
            <Field.Root>
              <Field.Label w="100%" display="flex" justifyContent="flex-end">
                As Of Date
              </Field.Label>
              <Input
                type="datetime-local"
                value={
                  asOfDate?.toISO({
                    includeOffset: false,
                    suppressMilliseconds: true,
                  }) ?? ''
                }
                textAlign="right"
                placeholder="Add As Of Date"
                onChange={(e) => {
                  const val = e.target.value;
                  const parsedDate = DateTime.fromISO(val);
                  let dateChanged: boolean;
                  if (parsedDate.isValid) {
                    if (asOfDate?.isValid) {
                      dateChanged = +parsedDate !== +asOfDate;
                    } else {
                      dateChanged = true;
                    }
                    setAsOfDate(parsedDate);
                  } else {
                    if (asOfDate?.isValid) {
                      dateChanged = true;
                    } else {
                      dateChanged = false;
                    }
                    setAsOfDate(null);
                  }

                  if (dateChanged) {
                    for (const user of userSkillInfo) {
                      handleAddGamertag(user.gamertag, user.gamertag);
                    }
                  }
                }}
              />
              <Field.HelperText textAlign="right" w="100%">
                optional, defaults to now
              </Field.HelperText>
            </Field.Root>
          </Box>
        </Flex>
        <Flex p={2}>
          <Spacer />
          <Box>
            <Button
              variant="plain"
              onClick={() => setIsUploadCsvWarningOpen(true)}
            >
              <UploadIcon />
              <Text hideBelow="md">Upload CSV</Text>
            </Button>
          </Box>
          {userSkillInfo.length === 0 ||
          userSkillInfo.some(
            (u) => u.error != null || u.esrA == null,
          ) ? null : (
            <Box>
              <Button
                variant="plain"
                onClick={() => {
                  const tableHeaderRowsCsv = [
                    'Gamertag,Ranked Arena ESR-A,As of Date',
                  ];

                  const tableBodyRowsCsv = userSkillInfo.map((user) => {
                    const asOfDateStr =
                      user.asOfDate?.toISO({
                        includeOffset: false,
                        suppressMilliseconds: true,
                      }) ?? '';
                    return `${user.gamertag},${user.esrA ?? ''},${asOfDateStr}`;
                  });

                  const blob = new Blob(
                    [tableHeaderRowsCsv.concat(tableBodyRowsCsv).join('\n')],
                    { type: 'text/csv' },
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Bulk ESR-A - ${DateTime.now().toISO({ includeOffset: false, suppressMilliseconds: true })}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <DownloadIcon />
                <Text hideBelow="md">Download as CSV</Text>
              </Button>
            </Box>
          )}
        </Flex>
        <Table.ScrollArea>
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Gamertag</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">
                  Ranked Arena ESR-A
                </Table.ColumnHeader>
                <Table.ColumnHeader />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {userSkillInfo.map((user) => (
                <Table.Row key={user.gamertag}>
                  <Table.Cell>
                    <Editable.Root
                      defaultValue={user.gamertag}
                      onValueCommit={(e) => {
                        handleAddGamertag(e.value, user.gamertag);
                      }}
                      activationMode="none"
                    >
                      <Editable.Preview w={'100%'} asChild>
                        <Link asChild cursor={'pointer'}>
                          <NextLink
                            prefetch={false}
                            href={'/players/' + user.gamertag}
                            title={user.xuid}
                            target="_blank"
                          >
                            {user.gamertag}
                          </NextLink>
                        </Link>
                      </Editable.Preview>
                      <Editable.Input w={'100%'} />
                      <Editable.Control>
                        <Editable.EditTrigger asChild>
                          <IconButton variant="ghost" size="xs">
                            <LuPencilLine />
                          </IconButton>
                        </Editable.EditTrigger>
                        <Editable.CancelTrigger asChild>
                          <IconButton variant="outline" size="xs">
                            <LuX />
                          </IconButton>
                        </Editable.CancelTrigger>
                        <Editable.SubmitTrigger asChild>
                          <IconButton variant="outline" size="xs">
                            <LuCheck />
                          </IconButton>
                        </Editable.SubmitTrigger>
                      </Editable.Control>
                    </Editable.Root>
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    {user.esrA === undefined && !user.error ? (
                      <SkeletonText noOfLines={1} width="50px" ml="auto" />
                    ) : user.error ? (
                      <span style={{ color: 'red' }}>{user.error.message}</span>
                    ) : user.esrA != null ? (
                      <FormatNumber
                        value={user.esrA}
                        minimumFractionDigits={2}
                        maximumFractionDigits={2}
                      />
                    ) : (
                      '-'
                    )}
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    <Flex gap={1} justifyContent="flex-end">
                      {(user.esrA != null || user.error != null) && (
                        <IconButton
                          aria-label="Retry"
                          onClick={async () => {
                            setUserSkillInfo((prev) => {
                              const existingUser = prev.find(
                                (u) =>
                                  u.gamertag.toLowerCase() ===
                                  user.gamertag.toLowerCase(),
                              );
                              if (existingUser) {
                                existingUser.esrA = undefined;
                                existingUser.error = undefined;
                              }
                              return [...prev];
                            });
                            handleAddGamertag(user.gamertag, undefined);
                          }}
                        >
                          <RefreshCw />
                        </IconButton>
                      )}
                      <IconButton
                        aria-label="Remove"
                        onClick={() => {
                          abortControllerMap.current
                            .get(user.gamertag)
                            ?.abort();
                          abortControllerMap.current.delete(user.gamertag);
                          setUserSkillInfo((prev) =>
                            prev.filter((u) => u.gamertag !== user.gamertag),
                          );
                        }}
                      >
                        <Trash />
                      </IconButton>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
              <Table.Row>
                <Table.Cell colSpan={3}>
                  <Editable.Root
                    value={editable.value}
                    onValueChange={(e) => {
                      editable.setValue(e.value);
                    }}
                    onValueCommit={(e) => {
                      if (e.value !== 'Add Gamertag') {
                        handleAddGamertag(e.value, undefined);
                        editable.setValue('Add Gamertag');
                      }
                    }}
                  >
                    <Editable.Preview w={'100%'} />
                    <Editable.Input w={'100%'} />
                  </Editable.Root>
                </Table.Cell>
              </Table.Row>
            </Table.Body>
          </Table.Root>
        </Table.ScrollArea>
      </Box>
    </Flex>
  );
}
