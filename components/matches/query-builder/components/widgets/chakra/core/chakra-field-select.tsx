import { createListCollection, Portal, Select } from '@chakra-ui/react';
import { FieldItem, FieldProps } from '@react-awesome-query-builder/ui';

export default function ChakraFieldSelect({
  items,
  setField,
  selectedKey,
  readonly,
  errorText,
  placeholder,
}: FieldProps) {
  const hasValue = selectedKey != null;
  const collection = createListCollection({
    items,
    itemToString: (i) => i.label,
    itemToValue: (i) => i.path ?? '',
    isItemDisabled: (i) => i.disabled ?? false,
  });
  const renderOptions = (fields: FieldItem[]) =>
    fields.map((field) => {
      if (field.items) {
        return (
          <Select.ItemGroup key={field.path}>
            <Select.ItemGroupLabel>{field.label}</Select.ItemGroupLabel>
            {renderOptions(field.items)}
          </Select.ItemGroup>
        );
      } else {
        const style = field.matchesType ? { fontWeight: 'bold' } : {};
        return (
          <Select.Item item={field} key={field.path} style={style}>
            {field.label}
            <Select.ItemIndicator />
          </Select.Item>
        );
      }
    });
  return (
    <Select.Root
      onValueChange={(e) => setField(e.value[0] || '')}
      value={hasValue ? [selectedKey] : []}
      disabled={readonly}
      color={errorText ? 'red' : undefined}
      collection={collection}
      width="200px"
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText placeholder={placeholder} />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content>{renderOptions(collection.items)}</Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
