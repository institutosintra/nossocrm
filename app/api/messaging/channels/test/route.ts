import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { ChannelProviderFactory } from '@/lib/messaging';
import type { ChannelType } from '@/lib/messaging/types';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * POST /api/messaging/channels/test
 *
 * Testa credenciais de um canal ANTES de salvá-lo (wizard de setup).
 * Não persiste nada; apenas chama provider.getStatus().
 */
export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) return json({ error: 'Profile not found' }, 404);
  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden - Admin access required' }, 403);
  }

  let body: {
    channel_type: ChannelType;
    provider: string;
    external_identifier?: string;
    credentials: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.channel_type || !body.provider || !body.credentials) {
    return json({ error: 'Missing required fields' }, 400);
  }

  try {
    const provider = ChannelProviderFactory.createProvider(body.channel_type, body.provider);
    await provider.initialize({
      channelId: 'test',
      channelType: body.channel_type,
      provider: body.provider,
      externalIdentifier: body.external_identifier || 'test',
      credentials: body.credentials,
    });

    const result = await provider.getStatus();
    return json({
      success: result.status === 'connected',
      message: result.message ?? (result.status === 'connected' ? 'Conexão OK' : 'Falha na conexão'),
    });
  } catch (error) {
    return json({
      success: false,
      message: error instanceof Error ? error.message : 'Erro ao testar conexão',
    });
  }
}
