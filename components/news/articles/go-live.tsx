import { Text } from '@chakra-ui/react';
export default function GoLive() {
  return (
    <>
      <Text>
        I&apos;m declaring the end of the Alpha testing phase. For you, the only
        practical change is that we&apos;re no longer operating on a whitelist
        and anyone can use Halo Query. Feel free to share it with anyone you
        like!
      </Text>
      <Text>
        From a technical perspective, it means I&apos;ve implemented the
        features that I intended to when I started building this. That
        doesn&apos;t mean I&apos;m done working on Halo Query though. Lord knows
        we&apos;ve got some bugs I need to work out, to say nothing about the
        hideous UI I&apos;ve concocted here. More is to come (always).
      </Text>
      <Text>
        To everyone who has been using the site during the Alpha, you&apos;ve
        provided valuable telemetry for helping me track down issues. Big
        shout-out to those who actually gave me real feedback too, you know who
        you are.
      </Text>
    </>
  );
}
