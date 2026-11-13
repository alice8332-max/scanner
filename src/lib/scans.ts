import { requireSupabase } from './supabase';

export const BUCKET = 'scans';

export type ScanRecord = {
  id: string;
  user_id: string;
  name: string;
  path: string;
  size: number;
  created_at: string;
};

const randomUUID = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const uploadScan = async (blob: Blob, name: string): Promise<ScanRecord> => {
  const client = requireSupabase();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user;
  if (!user) throw new Error('请先登录');

  const path = `${user.id}/${randomUUID()}.pdf`;
  const { error: uploadError } = await client.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: false
  });
  if (uploadError) throw uploadError;

  const { data, error } = await client
    .from('scans')
    .insert({ name, path, size: blob.size })
    .select('*')
    .single();

  if (error) {
    await client.storage.from(BUCKET).remove([path]);
    throw error;
  }

  return data as ScanRecord;
};

export const listScans = async (): Promise<ScanRecord[]> => {
  const client = requireSupabase();
  const { data, error } = await client
    .from('scans')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as ScanRecord[];
};

export const downloadScan = async (record: ScanRecord): Promise<Blob> => {
  const client = requireSupabase();
  const { data, error } = await client.storage.from(BUCKET).download(record.path);
  if (error) throw error;
  if (!data) throw new Error('文件不存在');
  return data;
};

export const deleteScan = async (id: string) => {
  const client = requireSupabase();
  const { error } = await client.rpc('delete_scan', { scan_id: id });
  if (error) throw error;
};

export const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};
