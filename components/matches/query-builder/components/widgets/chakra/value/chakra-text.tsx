import { Input } from '@chakra-ui/react';
import { TextWidgetProps } from '@react-awesome-query-builder/ui';
import { ChangeEventHandler } from 'react';

export default function ChakraText(props: TextWidgetProps) {
  const { value, setValue, readonly, placeholder, maxLength, customProps } =
    props;
  const onChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    let val: string | undefined = e.target.value;
    if (val === '') val = undefined; // don't allow empty value
    setValue(val);
  };
  const textValue = value || '';
  return (
    <Input
      type="text"
      value={textValue}
      placeholder={placeholder}
      disabled={readonly}
      onChange={onChange}
      maxLength={maxLength}
      {...customProps}
    />
  );
}
