import { Link, Text } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';

export default function OpenSource() {
  return (
    <>
      <Text>
        If you&apos;re not a programmer, feel free to skip this, it probably
        won&apos;t mean much to you.
      </Text>
      <Text>
        While I've always bundled source maps with my site deployments for easy
        examination of the code that&apos;s running in your browser, I finally
        got around to splitting the code for this site out of my larger
        monorepo. Apologies to anyone that&apos;s been waiting on me for the
        past 2 years there.
      </Text>
      <Text>
        My hope is that by making the code behind this site easier to examine,
        ESR will become a more accessible stat in other Halo sites and
        applications. I feel like it has really done a great deal towards
        helping us understand the underlying logic behind Halo Infinite&apos;s
        skill system.
      </Text>
      <Text>
        Furthermore, if there&apos;s something broken that you&apos;ve been
        dying to fix, or perhaps a new feature you want, I&apos;m accepting pull
        requests. Expirience all the thrills of being an unpaid developer
        without leaving your desk!
      </Text>
      <Text>
        <Link href="https://github.com/gravlLift/halo-query">
          Halo Query on Github
          <ExternalLink />
        </Link>
      </Text>
    </>
  );
}
