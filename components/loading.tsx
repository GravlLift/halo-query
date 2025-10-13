import { Center, Spinner } from '@chakra-ui/react';
import type { ComponentProps } from 'react';
export function Loading(props: {
  spinnerProps?: ComponentProps<typeof Spinner>;
  centerProps?: ComponentProps<typeof Center>;
}) {
  return (
    <Center {...props.centerProps}>
      <Spinner
        {...props.spinnerProps}
        size={props.spinnerProps?.size ?? 'xl'}
      />
    </Center>
  );
}
