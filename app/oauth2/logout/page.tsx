'use client';
import { RelyingParty } from 'halo-infinite-api';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loading } from '../../../components/loading';
import { localStorageEvent } from '../../../lib/local-storage/event-based-localstorage';

export default function Logout() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return <Loading centerProps={{ height: '100vh' }} />;
}
