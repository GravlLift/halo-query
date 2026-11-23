import { CloseButton, Dialog, Portal } from '@chakra-ui/react';
import { type MediaSource, MediaSourcePicker } from './media-source-picker';

export function MediaSourceDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (source: MediaSource) => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={({ open: next }) => onOpenChange(next)}
      size="xl"
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Add media</Dialog.Title>
            </Dialog.Header>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
            <Dialog.Body pb={6}>
              {/* Mounted only while open so each visit starts with a fresh form. */}
              {open && (
                <MediaSourcePicker
                  onSelect={(source) => {
                    onSelect(source);
                    onOpenChange(false);
                  }}
                />
              )}
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
