import { Box, Flex, VStack } from '@chakra-ui/react';
import { postMap } from '../../../components/news';
import { redirect } from 'next/navigation';
export default async function NewsArticlePage(props: {
  params: Promise<{ article: string }>;
}) {
  const Article = postMap[(await props.params).article];
  if (!Article) {
    redirect('/');
  }
  return (
    <Flex justifyContent="center">
      <Box maxW="1000px">
        <VStack py={2} gap={2} align="stretch">
          <Article />
        </VStack>
      </Box>
    </Flex>
  );
}
