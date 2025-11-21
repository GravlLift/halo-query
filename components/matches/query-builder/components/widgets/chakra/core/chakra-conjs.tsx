import { Checkbox, RadioGroup } from '@chakra-ui/react';
import { ConjsProps } from '@react-awesome-query-builder/ui';

export default function ChakraConjs({
  id,
  not,
  setNot,
  conjunctionOptions,
  setConjunction,
  disabled,
  readonly,
  config,
  showNot,
  notLabel,
}: ConjsProps) {
  const conjunctionOptionsKeys = (
    conjunctionOptions != null ? Object.keys(conjunctionOptions) : []
  ) as string[];
  const lessThenTwo = disabled;
  const { forceShowConj } = config
    ? config.settings
    : { forceShowConj: undefined };
  const showConj =
    forceShowConj || (conjunctionOptionsKeys.length > 1 && !lessThenTwo);

  const renderOptions = () => (
    <RadioGroup.Root
      value={
        conjunctionOptions != null
          ? Array.from(Object.values(conjunctionOptions)).find((o) => o.checked)
              ?.key
          : null
      }
      onValueChange={(e) => {
        // details should contain the selected value; ensure we pass it through.
        setConjunction(e.value || '');
      }}
    >
      {conjunctionOptionsKeys.map((key) => {
        const { id, label, checked } = conjunctionOptions
          ? conjunctionOptions[key]
          : {
              id: undefined,
              label: undefined,
              checked: undefined,
            };
        const postfix = (
          setConjunction as typeof setConjunction & { isDummyFn?: boolean }
        ).isDummyFn
          ? '__dummy'
          : '';
        if ((readonly || disabled) && !checked) return null;
        return (
          <RadioGroup.Item
            key={id + postfix}
            disabled={readonly || disabled}
            value={key}
          >
            <RadioGroup.ItemHiddenInput />
            <RadioGroup.ItemIndicator />
            <RadioGroup.ItemText key={id + postfix + 'label'}>
              {label}
            </RadioGroup.ItemText>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );

  const renderNot = () => {
    const postfix = 'not';
    return (
      <Checkbox.Root
        key={id + postfix}
        checked={not}
        disabled={readonly}
        onCheckedChange={(e) => setNot(!!e.checked)}
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label key={id + postfix + 'label'}>
          {notLabel || 'NOT'}
        </Checkbox.Label>
      </Checkbox.Root>
    );
  };

  return [showNot && renderNot(), showConj && renderOptions()];
}
