'use client';
import { useEffect } from 'react';
import { Loading } from '../../../components/loading';
import { useAuthentication } from '../../../lib/contexts/authentication-contexts';
import { redirect } from 'next/navigation';

export default function Callback() {
  const { acquireOauth2AccessToken } = useAuthentication();
  useEffect(() => {
    acquireOauth2AccessToken().then(() => {
      redirect('/');
    });
  }, []);
  return <Loading centerProps={{ height: '100vh' }} />;
}
