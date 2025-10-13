import { Icon } from '@chakra-ui/react';
import { Circle } from 'lucide-react';
import { ComponentProps } from 'react';

export default function CircleIcon(props: ComponentProps<typeof Icon>) {
  return (
    <Icon {...props}>
      <Circle fill="#fff" />
    </Icon>
  );
}
