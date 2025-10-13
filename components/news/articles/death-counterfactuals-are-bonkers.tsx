import { Text } from '@chakra-ui/react';
export default function DeathCounterfactualsAreBonkers() {
  return (
    <>
      <Text>
        Looks like there was a rank reset with the CU29 update, and Halo slipped
        something into the sauce. Death counterfactuals are making an incredibly
        flat skill curve for all levels. As a result, PSR-D (and thus, PSR)
        values are super out of whack. I checked, the call isn&apos;t coming
        from our house: the API values are being correctly processed, its just
        that they&apos;re getting delivered to us in a broken state. Look for a
        Halo fix in the new few days, I&apos;d guess.
      </Text>
      <Text>
        UPDATE: In an attempt to make PSR usable, I&apos;ve temporarily removed
        PSR-D from the calculation across the site.
      </Text>
    </>
  );
}
