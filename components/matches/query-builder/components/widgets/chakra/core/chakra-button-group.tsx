import { ButtonGroup } from '@chakra-ui/react';
import { ButtonGroupProps } from '@react-awesome-query-builder/ui';

export default function ChakraButtonGroup({ children }: ButtonGroupProps) {
  return <ButtonGroup>{children}</ButtonGroup>;
}
