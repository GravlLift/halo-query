'use client';
import {
  Accordion,
  Box,
  Card,
  Checkbox,
  CheckboxGroup,
  HStack,
  Portal,
  Select,
  SimpleGrid,
  Switch,
  createListCollection,
} from '@chakra-ui/react';
import '@gravllift/utilities';
import { Utils as QbUtils } from '@react-awesome-query-builder/ui';
import { CircleHelp } from 'lucide-react';
import { Fragment, useMemo } from 'react';
import { Preset, UseColumnsProps, columnPresets } from '../columns';
import { ColumnName, categories, columns } from '../columns/base-columns';
import { Tooltip } from '../ui/tooltip';
import { QueryBuilder, QueryBuilderProps } from './query-builder';

export interface MatchesHeaderProps {
  queryBuilder: QueryBuilderProps;
  useColumnsProps: UseColumnsProps;
  options: {
    showRawValues: boolean;
    setShowRawValues: (value: boolean) => void;
    pageSize: number;
    setPageSize: (value: number) => void;
    flattenHeaderRows: {
      value: boolean;
      setValue: (value: boolean) => void;
    };
  };
}
const columnEntries = Object.entries(columns);
const columnPresetCollection = createListCollection({
  items: [
    ...Object.values(Preset).map((preset) => ({
      label: preset as Preset,
      value: preset as Preset,
    })),
    {
      label: 'Custom',
      value: 'Custom',
    },
  ],
});

const pageSizeCollection = createListCollection({
  items: [25, 100, 500, 1000].map((size) => ({
    label: size.toString(),
    value: size.toString(),
  })),
});

export default function MatchesHeader({
  queryBuilder,
  useColumnsProps: {
    columnPreset,
    setColumnPreset,
    customVisibleColumns,
    setCustomVisibleColumns,
  },
  options: {
    showRawValues,
    setShowRawValues,
    pageSize,
    setPageSize,
    flattenHeaderRows,
  },
}: MatchesHeaderProps) {
  const jsonLogicTree = useMemo(
    () =>
      QbUtils.jsonLogicFormat(
        queryBuilder.queryState.tree,
        queryBuilder.queryState.config
      ),
    [queryBuilder.queryState.tree, queryBuilder.queryState.config]
  );
  return (
    <Accordion.Root
      collapsible={true}
      defaultValue={jsonLogicTree.logic ? ['filters'] : undefined}
    >
      <Accordion.Item value={'filters'}>
        <Accordion.ItemTrigger>
          <Box as="span" flex="1" textAlign="left">
            Filters
          </Box>
          <Accordion.ItemIndicator />
        </Accordion.ItemTrigger>
        <Accordion.ItemContent pb={2} maxHeight={'500px'} overflowY={'auto'}>
          <Accordion.ItemBody>
            <QueryBuilder {...queryBuilder} />
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>
      <Accordion.Item value={'columns'}>
        <Accordion.ItemTrigger>
          <Box as="span" flex="1" textAlign="left">
            Columns
          </Box>
          <Accordion.ItemIndicator />
        </Accordion.ItemTrigger>
        <Accordion.ItemContent pb={2} maxHeight={'500px'} overflowY={'auto'}>
          <Accordion.ItemBody>
            <Select.Root
              collection={columnPresetCollection}
              value={[columnPreset]}
              onValueChange={(event) => {
                setColumnPreset(event.value[0] as Preset | 'Custom');
                if (event.value[0] !== 'Custom') {
                  setCustomVisibleColumns(
                    columnPresets[event.value[0] as Preset]
                  );
                }
              }}
            >
              <Select.HiddenSelect />
              <Select.Label>Column Preset</Select.Label>
              <Select.Control>
                <Select.Trigger>
                  <Select.ValueText />
                </Select.Trigger>
                <Select.IndicatorGroup>
                  <Select.Indicator />
                </Select.IndicatorGroup>
              </Select.Control>
              <Portal>
                <Select.Positioner>
                  <Select.Content>
                    {columnPresetCollection.items.map((item) => (
                      <Select.Item key={item.value} item={item}>
                        {item.label}
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
            {columnPreset === 'Custom' ? (
              <CheckboxGroup
                value={customVisibleColumns}
                onValueChange={(values) =>
                  setCustomVisibleColumns(values as ColumnName[])
                }
              >
                <Card.Root>
                  <Card.Body>
                    {categories.map((grandparentCategory, i) => {
                      const grandparentCategoryBaseColumnKeys =
                        grandparentCategory.children
                          .flatMap((parentCategory) =>
                            parentCategory.children.map(
                              (tableColumn) => tableColumn
                            )
                          )
                          .map(
                            (tableColumn) =>
                              columnEntries.find(
                                ([, value]) => value === tableColumn
                              )?.[0]
                          )
                          .filter(
                            (value): value is ColumnName => value != null
                          );
                      const grandparentAllChecked =
                        grandparentCategoryBaseColumnKeys.every((i2) =>
                          customVisibleColumns.includes(i2)
                        );
                      return (
                        <Fragment key={i}>
                          {grandparentCategory.text && (
                            <Checkbox.Root
                              checked={
                                !grandparentAllChecked &&
                                grandparentCategoryBaseColumnKeys.some((i) =>
                                  customVisibleColumns.includes(i)
                                )
                                  ? 'indeterminate'
                                  : grandparentAllChecked
                              }
                              onCheckedChange={(e) => {
                                if (e.checked) {
                                  setCustomVisibleColumns((v) => [
                                    ...v,
                                    ...grandparentCategoryBaseColumnKeys,
                                  ]);
                                } else {
                                  setCustomVisibleColumns((v) =>
                                    v.filter(
                                      (i) =>
                                        !grandparentCategoryBaseColumnKeys.includes(
                                          i
                                        )
                                    )
                                  );
                                }
                              }}
                            >
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                              <Checkbox.Label>
                                {grandparentCategory.text}
                              </Checkbox.Label>
                            </Checkbox.Root>
                          )}
                          {grandparentCategory.children.map(
                            (parentCategory, j) => {
                              const parentCategoryBaseColumnKeys =
                                parentCategory.children.map((tableColumn) => {
                                  if (tableColumn == null) {
                                    throw new Error(
                                      `Category '${parentCategory.text}' has a nullish column`
                                    );
                                  }

                                  const col = columnEntries.find(
                                    ([, value]) => value === tableColumn
                                  );

                                  if (col == null) {
                                    throw new Error(
                                      `Column '${parentCategory.text}-${tableColumn.text}' not found in columns`
                                    );
                                  }

                                  return col[0] as ColumnName;
                                });
                              const parentAllChecked =
                                parentCategoryBaseColumnKeys.every((i) =>
                                  customVisibleColumns.includes(i)
                                );
                              return (
                                <Box
                                  key={j}
                                  pl={4 * (grandparentCategory.text ? 1 : 0)}
                                >
                                  {parentCategory.text && (
                                    <Checkbox.Root
                                      checked={
                                        !parentAllChecked &&
                                        parentCategoryBaseColumnKeys.some((i) =>
                                          customVisibleColumns.includes(i)
                                        )
                                          ? 'indeterminate'
                                          : parentAllChecked
                                      }
                                      onCheckedChange={(e) => {
                                        if (e.checked) {
                                          setCustomVisibleColumns((v) => [
                                            ...v,
                                            ...parentCategoryBaseColumnKeys,
                                          ]);
                                        } else {
                                          setCustomVisibleColumns((v) =>
                                            v.filter(
                                              (i) =>
                                                !parentCategoryBaseColumnKeys.includes(
                                                  i
                                                )
                                            )
                                          );
                                        }
                                      }}
                                    >
                                      <Checkbox.HiddenInput />
                                      <Checkbox.Control>
                                        <Checkbox.Indicator />
                                      </Checkbox.Control>
                                      <Checkbox.Label>
                                        {parentCategory.text}
                                      </Checkbox.Label>
                                    </Checkbox.Root>
                                  )}
                                  <SimpleGrid
                                    pl={4 * (parentCategory.text ? 1 : 0)}
                                    columns={{ base: 2, md: 4 }}
                                  >
                                    {parentCategoryBaseColumnKeys.map((k) => {
                                      const column = columns[k];
                                      return (
                                        <HStack key={k}>
                                          <Checkbox.Root value={k}>
                                            <Checkbox.HiddenInput />
                                            <Checkbox.Control>
                                              <Checkbox.Indicator />
                                            </Checkbox.Control>
                                            <Checkbox.Label>
                                              {column.text}
                                            </Checkbox.Label>
                                          </Checkbox.Root>
                                          {'tooltip' in column &&
                                          column.tooltip ? (
                                            <Tooltip content={column.tooltip}>
                                              <CircleHelp />
                                            </Tooltip>
                                          ) : null}
                                        </HStack>
                                      );
                                    })}
                                  </SimpleGrid>
                                </Box>
                              );
                            }
                          )}
                        </Fragment>
                      );
                    })}
                  </Card.Body>
                </Card.Root>
              </CheckboxGroup>
            ) : null}
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>
      <Accordion.Item value={'options'}>
        <Accordion.ItemTrigger>
          <Box as="span" flex="1" textAlign="left">
            Options
          </Box>
          <Accordion.ItemIndicator />
        </Accordion.ItemTrigger>
        <Accordion.ItemContent pb={2} maxHeight={'500px'} overflowY={'auto'}>
          <Accordion.ItemBody>
            <Box flexDir="column" display="flex" alignItems="left" gap={2}>
              <Select.Root
                value={[pageSize.toString()]}
                onValueChange={(e) => setPageSize(+e.value[0])}
                maxW={'400px'}
                collection={pageSizeCollection}
              >
                <Select.HiddenSelect />
                <Select.Label mb="0">Page Size</Select.Label>
                <Select.Control>
                  <Select.Trigger>
                    <Select.ValueText />
                  </Select.Trigger>
                  <Select.IndicatorGroup>
                    <Select.Indicator />
                  </Select.IndicatorGroup>
                </Select.Control>
                <Portal>
                  <Select.Positioner>
                    <Select.Content>
                      {pageSizeCollection.items.map((item) => (
                        <Select.Item key={item.value} item={item}>
                          {item.label}
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
              <Switch.Root
                maxW={'400px'}
                checked={showRawValues}
                onCheckedChange={(e) => {
                  setShowRawValues(e.checked);
                }}
              >
                <Switch.HiddenInput />
                <Switch.Label mb="0">Show Raw Values</Switch.Label>
                <Switch.Control />
              </Switch.Root>
              <Switch.Root
                maxW={'400px'}
                checked={flattenHeaderRows.value}
                onCheckedChange={(e) => {
                  flattenHeaderRows.setValue(e.checked);
                }}
              >
                <Switch.HiddenInput />
                <Switch.Label mb="0">
                  Flatten Header Rows (CSV Download Only)
                </Switch.Label>
                <Switch.Control />
              </Switch.Root>
            </Box>
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>
    </Accordion.Root>
  );
}
