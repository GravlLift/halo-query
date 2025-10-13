import { Field, Input } from '@chakra-ui/react';
import { NumberWidgetProps } from '@react-awesome-query-builder/ui';

export default function ChakraNumber(props: NumberWidgetProps) {
  const {
    value,
    setValue,
    readonly,
    min,
    max,
    step,
    placeholder,
    customProps,
  } = props;

  const numberValue = value != null && !Array.isArray(value) ? +value : '';

  return (
    <Field.Root>
      <Input
        type="number"
        value={numberValue}
        placeholder={!readonly ? placeholder : ''}
        readOnly={readonly}
        min={min}
        max={max}
        step={step}
        disabled={readonly}
        onChange={(e) => {
          let val: number | string | undefined = e.target.value;
          if (val === '' || val === null) {
            val = undefined;
          } else {
            val = Number(val);
          }
          setValue(val);
        }}
        {...customProps}
      />
    </Field.Root>
  );
}
