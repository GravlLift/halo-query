import { Box, Card, Flex, Heading, List, VStack, Link } from '@chakra-ui/react';
import { postEntries } from '../../components/news';
import NextLink from 'next/link';

export default function NewsPage() {
  const postsByYear = Array.from(
    postEntries.groupBy(([, post]) => post.date.slice(0, 4))
  );
  return (
    <Flex justifyContent="center">
      <Box maxW="1000px" w="100%">
        <VStack py={2} gap={2} align="stretch">
          <Card.Root>
            <Card.Header>
              <Heading size="lg">News Archives</Heading>
            </Card.Header>
            <Card.Body className="paragraph">
              {postsByYear.map(([m, posts]) => (
                <Box key={m}>
                  <Heading size="md">{m}</Heading>
                  <List.Root mb={2}>
                    {posts.map(([id, { date, title }]) => (
                      <List.Item key={id}>
                        <Link asChild>
                          <NextLink href={`/news/${id}`}>
                            {date} - {title}
                          </NextLink>
                        </Link>
                      </List.Item>
                    ))}
                  </List.Root>
                </Box>
              ))}
            </Card.Body>
          </Card.Root>
        </VStack>
      </Box>
    </Flex>
  );
}
