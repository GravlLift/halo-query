import { createListCollection, Portal, Select } from '@chakra-ui/react';
import {
  AsyncFetchListValuesResult,
  ListValues,
  MultiSelectWidgetProps,
  Utils,
} from '@react-awesome-query-builder/ui';
import omit from 'lodash/omit';
import { useCallback, useEffect, useState } from 'react';

export default function ChakraMultiSelect({
  listValues,
  value,
  setValue,
  readonly,
  customProps,
  asyncFetch,
}: MultiSelectWidgetProps) {
  const mapOptions = useCallback(
    (v: ListValues) =>
      Utils.ListUtils.mapListValues(v, (item) => {
        return {
          key: item?.value,
          value: item?.value?.toString(),
          title: item?.title,
        };
      }),
    []
  );
  const [options, setOptions] = useState<
    {
      key: string | number | undefined;
      value: string | undefined;
      title: string | undefined;
    }[]
  >([]);
  const collection = createListCollection({
    items: options,
    itemToString: (i) => i.title ?? '',
    itemToValue: (i) => i.value ?? '',
  });
  const [loading, setLoading] = useState(asyncFetch != null);

  useEffect(() => {
    if (listValues != null) {
      setOptions(mapOptions(listValues));
    } else {
      setOptions([]);
    }
  }, [listValues, mapOptions]);
  useEffect(() => {
    if (typeof asyncFetch === 'function') {
      let awaitingResults = true;
      setLoading(true);
      asyncFetch(null, 0)
        .then((result: AsyncFetchListValuesResult) => {
          if (awaitingResults) {
            setOptions(
              [...mapOptions(result.values)].distinct(
                (v1, v2) => v1.key === v2.key
              )
            );
          }
        })
        .finally(() => {
          setLoading(false);
        });
      return () => {
        awaitingResults = false;
      };
    }
  }, [asyncFetch, mapOptions]);

  const hasValue = value?.length;
  return (
    <Select.Root
      multiple
      onValueChange={(e) =>
        setValue(e.items.map((i) => i.key) as string[] | number[])
      }
      value={hasValue ? value.map((v) => `${v}`) : []}
      disabled={readonly || loading}
      collection={collection}
      width="200px"
      {...omit(customProps, ['showSearch', 'input'])}
    >
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText placeholder={loading ? 'Loading...' : ''} />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content>
            {collection.items.map((item) => (
              <Select.Item key={item.value} item={item}>
                {item.title}
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
