import { Button } from '@chakra-ui/react';
import { ButtonProps } from '@react-awesome-query-builder/ui';

export default function ChakraButton({
  label,
  onClick,
  readonly,
}: ButtonProps) {
  return (
    <Button onClick={onClick} type="button" disabled={readonly} size="sm">
      {label}
    </Button>
  );
}
