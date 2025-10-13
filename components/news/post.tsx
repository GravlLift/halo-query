import { Card, Heading, Link } from '@chakra-ui/react';
import NextLink from 'next/link';
import FragmentLinkTarget from '../fragment-link';

export default function Post({
  children,
  title,
  id,
  date,
}: {
  id: string;
  title: string;
  date: string;
  children: React.ReactNode;
}) {
  return (
    <Card.Root>
      <Card.Header>
        <FragmentLinkTarget id={id} />
        <Heading size="xl">
          <Link asChild>
            <NextLink href={`#${id}`}>{title}</NextLink>
          </Link>
        </Heading>
        <Heading size="sm">{date}</Heading>
      </Card.Header>
      <Card.Body className="paragraph" colorPalette={'brand'}>
        {children}
      </Card.Body>
    </Card.Root>
  );
}
