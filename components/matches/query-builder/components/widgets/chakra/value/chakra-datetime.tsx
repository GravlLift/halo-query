import { Field, Input } from '@chakra-ui/react';
import { DateTimeWidgetProps } from '@react-awesome-query-builder/ui';

export default function ChakraDateTime(props: DateTimeWidgetProps) {
  const { value, setValue, readonly, placeholder, customProps } = props;

  const numberValue = value && !Array.isArray(value) ? value : '';

  return (
    <Field.Root>
      <Input
        type="datetime-local"
        value={numberValue}
        placeholder={!readonly ? placeholder : ''}
        readOnly={readonly}
        disabled={readonly}
        onChange={(e) => {
          let val: string | undefined = e.target.value;
          if (val === '' || val === null) {
            val = undefined;
          }
          setValue(val);
        }}
        {...customProps}
      />
    </Field.Root>
  );
}
