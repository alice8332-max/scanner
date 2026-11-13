import type { Session } from '@supabase/supabase-js';
import { CONFIG_ERROR } from './config';
import { supabase } from './supabase';

export const getSession = async (): Promise<Session | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
};

export const signIn = async (email: string, password: string): Promise<Session | null> => {
  if (!supabase) throw new Error(CONFIG_ERROR);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
};

export const signOut = async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const onAuthChange = (callback: (session: Session | null) => void) => {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
};
