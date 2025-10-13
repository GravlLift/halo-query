'use client';
import { useEffect } from 'react';
import { Loading } from '../../../components/loading';
import { useAuthentication } from '../../../lib/contexts/authentication-contexts';

export default function Callback() {
  const { acquireOauth2AccessToken } = useAuthentication();
  useEffect(() => {
    acquireOauth2AccessToken();
  }, []);
  return <Loading centerProps={{ height: '100vh' }} />;
}
